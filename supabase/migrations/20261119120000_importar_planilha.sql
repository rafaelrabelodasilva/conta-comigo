-- História 3.10: Importar o histórico da planilha (FR-2, AD-1, AD-6, AD-8,
-- AD-14).
--
-- - `importar_aba_planilha(p_mes, p_linhas, p_previstos)`: grava UMA aba (um
--   Mês) numa transação. O núcleo (src/domain/importacao-planilha.ts) calculou
--   tudo: as linhas-mãe (classificação da planilha, Série, Divisão e partes) e
--   os previstos; aqui só se grava. As linhas entram com `lancado_por =
--   'historico'`, sem Fatura, sem ordem da Fatura, sem cartão e sem data; a
--   ordem da aba fica no `created_at` (relógio de verdade, crescente).
--   Recusa o Mês que já tem Fatura (`planilha.mes_com_fatura`). Reimportar o
--   mesmo Mês troca o histórico: apaga as linhas `historico` do Mês (as filhas
--   caem em cascata), os previstos `sistema` intocados que elas geraram e os
--   previstos `sistema` intocados do próprio Mês (a planilha manda no Mês).
--   Acha ou cria as Séries (a chave vem do núcleo), cria os previstos que a
--   Série ainda não tem (nem excluídos: previsto excluído não ressuscita) e as
--   filhas das Divisões, pela `recriar_filhas` da 3.8.
-- - `apagar_historico_do_mes(p_mes)`: o caminho de volta. Apaga só as linhas
--   `historico` do Mês, os previstos intocados que elas geraram e as Séries
--   que ficaram sem nenhuma linha.
--
-- Mesma trava de `importar_fatura` (dono + Mês): uma gravação por vez no Mês.

create or replace function public.importar_aba_planilha(
  p_mes text,
  p_linhas jsonb,
  p_previstos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  status_padrao uuid;
  ids uuid[] := '{}';
  rec record;
  novo uuid;
  serie uuid;
  partes jsonb;
  removidos_previstos uuid[] := '{}';
  removidos_historico uuid[] := '{}';
  criados_previstos uuid[] := '{}';
  linhas jsonb;
  previstos jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if p_mes is null or p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(p_linhas) is distinct from 'array'
     or jsonb_typeof(p_previstos) is distinct from 'array'
     or jsonb_array_length(p_linhas) > 400
     or jsonb_array_length(p_previstos) > 2000 then
    raise exception 'salvar.falhou';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(dono::text || ':' || p_mes, 0));

  if exists (select 1 from public.faturas as f where f.owner_id = dono and f.mes = p_mes) then
    raise exception 'planilha.mes_com_fatura';
  end if;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

  -- O histórico anterior do Mês e o que ele gerou sem ninguém mexer.
  with apagados as (
    delete from public.lancamentos as p
     where p.owner_id = dono
       and p.lancado_por = 'sistema'
       and p.editado_em is null
       and p.excluido_em is null
       and p.fatura_id is null
       and (
         p.mes = p_mes
         or p.origem_lancamento_id in (
           select h.id from public.lancamentos as h
            where h.owner_id = dono and h.mes = p_mes and h.lancado_por = 'historico'
         )
       )
    returning p.id
  )
  select coalesce(array_agg(a.id), '{}') into removidos_previstos from apagados as a;

  with apagados as (
    delete from public.lancamentos as h
     where h.owner_id = dono and h.mes = p_mes and h.lancado_por = 'historico'
    returning h.id
  )
  select coalesce(array_agg(a.id), '{}') into removidos_historico from apagados as a;

  -- Séries: acha ou cria.
  insert into public.series (
    nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia
  )
  select distinct
    l -> 'serie' ->> 'nome_normalizado',
    (l -> 'serie' ->> 'parcela_total')::integer,
    (l -> 'serie' ->> 'valor_parcela_centavos')::integer,
    l -> 'serie' ->> 'mes_primeira_parcela',
    (l -> 'serie' ->> 'ocorrencia')::integer
    from jsonb_array_elements(p_linhas) as l
   where jsonb_typeof(l -> 'serie') = 'object'
  on conflict (owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)
  do nothing;

  -- As linhas-mãe, na ordem recebida (a ordem da aba).
  for rec in
    select l, ord from jsonb_array_elements(p_linhas) with ordinality as t(l, ord) order by ord
  loop
    if jsonb_typeof(rec.l) is distinct from 'object'
       or jsonb_typeof(rec.l -> 'nome') is distinct from 'string'
       or jsonb_typeof(rec.l -> 'valor_centavos') is distinct from 'number' then
      raise exception 'salvar.falhou';
    end if;
    serie := null;
    if jsonb_typeof(rec.l -> 'serie') = 'object' then
      select s.id into serie
        from public.series as s
       where s.owner_id = dono
         and s.nome_normalizado = rec.l -> 'serie' ->> 'nome_normalizado'
         and s.parcela_total = (rec.l -> 'serie' ->> 'parcela_total')::integer
         and s.valor_parcela_centavos = (rec.l -> 'serie' ->> 'valor_parcela_centavos')::integer
         and s.mes_primeira_parcela = rec.l -> 'serie' ->> 'mes_primeira_parcela'
         and s.ocorrencia = (rec.l -> 'serie' ->> 'ocorrencia')::integer;
    end if;
    -- `created_at` com o relógio de verdade (não o da transação): a grade usa
    -- a ordem de criação para manter as linhas na ordem da aba, já que o
    -- histórico não tem `ordem_fatura`.
    insert into public.lancamentos (
      nome, nome_normalizado, valor_centavos, parcela_n, parcela_total, mes, lancado_por,
      status_id, responsavel_id, tipo_id, observacao, serie_id, divisao, created_at
    ) values (
      rec.l ->> 'nome',
      rec.l ->> 'nome_normalizado',
      (rec.l ->> 'valor_centavos')::integer,
      (rec.l ->> 'parcela_n')::integer,
      (rec.l ->> 'parcela_total')::integer,
      p_mes,
      'historico'::public.lancado_por,
      coalesce((rec.l ->> 'status_id')::uuid, status_padrao),
      (rec.l ->> 'responsavel_id')::uuid,
      (rec.l ->> 'tipo_id')::uuid,
      rec.l ->> 'observacao',
      serie,
      case when jsonb_typeof(rec.l -> 'divisao') = 'object' then rec.l -> 'divisao' end,
      clock_timestamp()
    )
    returning id into novo;
    ids := ids || novo;

    -- Divisão (Monjaro): as filhas, com o Status de cada parte (ou o padrão).
    if jsonb_typeof(rec.l -> 'partes') = 'array' then
      select coalesce(jsonb_agg(
               p || jsonb_build_object('status_id', coalesce(p ->> 'status_id', status_padrao::text))
             ), '[]'::jsonb)
        into partes
        from jsonb_array_elements(rec.l -> 'partes') as p;
      perform public.recriar_filhas(novo, partes);
    end if;
  end loop;

  -- Previstos novos: só onde a Série ainda não tem a parcela e o Mês não tem Fatura.
  for rec in
    select p
      from jsonb_array_elements(p_previstos) as t(p)
  loop
    if jsonb_typeof(rec.p) is distinct from 'object' then
      raise exception 'salvar.falhou';
    end if;
    novo := null;
    insert into public.lancamentos (
      nome, nome_normalizado, apelido, valor_centavos, parcela_n, parcela_total, mes,
      lancado_por, status_id, responsavel_id, tipo_id, observacao, serie_id, origem_lancamento_id, divisao
    )
    select
      rec.p ->> 'nome',
      rec.p ->> 'nome_normalizado',
      rec.p ->> 'apelido',
      (rec.p ->> 'valor_centavos')::integer,
      (rec.p ->> 'parcela_n')::integer,
      (rec.p ->> 'parcela_total')::integer,
      rec.p ->> 'mes',
      'sistema'::public.lancado_por,
      status_padrao,
      (rec.p ->> 'responsavel_id')::uuid,
      (rec.p ->> 'tipo_id')::uuid,
      rec.p ->> 'observacao',
      o.serie_id,
      o.id,
      case when jsonb_typeof(rec.p -> 'divisao') = 'object' then rec.p -> 'divisao' end
      from public.lancamentos as o
     where o.id = ids[(rec.p ->> 'ordem_origem')::integer]
       and o.serie_id is not null
       and not exists (
         select 1 from public.lancamentos as x
          where x.owner_id = dono
            and x.serie_id = o.serie_id
            and x.parcela_n = (rec.p ->> 'parcela_n')::integer
            and x.dividido_de_id is null
       )
       and not exists (
         select 1 from public.faturas as f
          where f.owner_id = dono and f.mes = rec.p ->> 'mes'
       )
    returning id into novo;
    if novo is not null then
      criados_previstos := criados_previstos || novo;
      if jsonb_typeof(rec.p -> 'partes') = 'array' then
        perform public.recriar_filhas(novo, rec.p -> 'partes');
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at, g.dividido_de_id nulls first, g.id), '[]'::jsonb)
    into linhas
    from public.lancamentos as g
   where g.owner_id = dono and g.mes = p_mes and g.lancado_por = 'historico';

  select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n, g.dividido_de_id nulls first, g.id), '[]'::jsonb)
    into previstos
    from public.lancamentos as g
   where g.owner_id = dono
     and (g.id = any (criados_previstos) or g.dividido_de_id = any (criados_previstos));

  return jsonb_build_object(
    'lancamentos', linhas,
    'previstos', previstos,
    'removidos', jsonb_build_object(
      'lancamentos', to_jsonb(removidos_historico),
      'previstos', to_jsonb(removidos_previstos)
    )
  );
exception
  -- A parcela já está na Série (o previsto de outro Mês ou outra importação).
  when unique_violation then
    if sqlerrm like '%lancamentos_serie_id_parcela_n_key%' then
      raise exception 'planilha.serie_ocupada';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_aba_planilha(text, jsonb, jsonb) from public, anon;
grant execute on function public.importar_aba_planilha(text, jsonb, jsonb) to authenticated;

-- ------------------------------------------------- apagar_historico_do_mes

create or replace function public.apagar_historico_do_mes(p_mes text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  removidos_previstos uuid[] := '{}';
  removidos_historico uuid[] := '{}';
  series_usadas uuid[] := '{}';
  series_apagadas integer := 0;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if p_mes is null or p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'salvar.falhou';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(dono::text || ':' || p_mes, 0));

  select coalesce(array_agg(distinct h.serie_id), '{}') into series_usadas
    from public.lancamentos as h
   where h.owner_id = dono and h.mes = p_mes and h.lancado_por = 'historico' and h.serie_id is not null;

  with apagados as (
    delete from public.lancamentos as p
     where p.owner_id = dono
       and p.lancado_por = 'sistema'
       and p.editado_em is null
       and p.excluido_em is null
       and p.origem_lancamento_id in (
         select h.id from public.lancamentos as h
          where h.owner_id = dono and h.mes = p_mes and h.lancado_por = 'historico'
       )
    returning p.id
  )
  select coalesce(array_agg(a.id), '{}') into removidos_previstos from apagados as a;

  with apagados as (
    delete from public.lancamentos as h
     where h.owner_id = dono and h.mes = p_mes and h.lancado_por = 'historico'
    returning h.id
  )
  select coalesce(array_agg(a.id), '{}') into removidos_historico from apagados as a;

  -- Só as Séries que essas linhas usavam e que ficaram sem nenhuma linha.
  with apagadas as (
    delete from public.series as s
     where s.owner_id = dono
       and s.id = any (series_usadas)
       and not exists (select 1 from public.lancamentos as l where l.owner_id = dono and l.serie_id = s.id)
    returning s.id
  )
  select count(*) into series_apagadas from apagadas;

  return jsonb_build_object(
    'lancamentos', to_jsonb(removidos_historico),
    'previstos', to_jsonb(removidos_previstos),
    'series', series_apagadas
  );
end;
$$;

revoke execute on function public.apagar_historico_do_mes(text) from public, anon;
grant execute on function public.apagar_historico_do_mes(text) to authenticated;
