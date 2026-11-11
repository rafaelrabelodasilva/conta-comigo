-- História 3.7: Herdar parcelas sem previsto (FR-8, AD-8, AD-14).
--
-- A parcela real n/N (n > 1) que chega sem previsto herda a classificação da
-- n−1/N do Mês anterior. O núcleo (src/domain/heranca.ts) escolhe a candidata
-- e calcula Responsável, Tipo, Apelido, Observação, o motivo e a chave da
-- Série (a da candidata, inclusive a `ocorrencia`); a RPC só grava. A Série
-- já é achada pela chave, então a única mudança é gravar `apelido` e
-- `observacao` nas linhas novas (o casado mantém os do previsto).
--
-- `create or replace`: mesma assinatura de 7 argumentos, então os grants, o
-- app antigo e `database.types.ts` não mudam. O app novo antes desta migração
-- só deixa de gravar Apelido e Observação herdados.

create or replace function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null,
  substituir_fatura_id uuid default null,
  dados_previstos jsonb default null,
  previstos_sem_par jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  mes_fatura text := dados_fatura ->> 'mes';
  anterior uuid;
  fatura public.faturas;
  status_padrao uuid;
  ultima timestamptz;
  cartoes jsonb;
  linhas jsonb;
  previstos jsonb;
  religados jsonb;
  removidos jsonb := null;
  removidos_cartoes jsonb;
  removidos_lancamentos jsonb;
  removidos_previstos jsonb;
  esperados integer;
  casados integer;
  sem_par jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(dados_cartoes) is distinct from 'array'
     or jsonb_typeof(dados_lancamentos) is distinct from 'array'
     or (dados_previstos is not null and jsonb_typeof(dados_previstos) is distinct from 'array')
     or (previstos_sem_par is not null and jsonb_typeof(previstos_sem_par) is distinct from 'array') then
    raise exception 'salvar.falhou';
  end if;

  -- Uma importação por vez para o mesmo dono e Mês.
  perform pg_advisory_xact_lock(hashtextextended(dono::text || ':' || coalesce(mes_fatura, ''), 0));

  select f.id into anterior
    from public.faturas as f
   where f.owner_id = dono and f.mes = mes_fatura;

  if substituir_fatura_id is null then
    if anterior is not null then
      raise exception 'fatura.mes_ja_importado';
    end if;
  elsif anterior is distinct from substituir_fatura_id then
    raise exception 'fatura.mes_mudou';
  end if;

  select max(l.updated_at) into ultima
    from public.lancamentos as l
   where l.owner_id = dono and l.mes = mes_fatura;
  if ultima is distinct from lancamentos_atualizados_em then
    raise exception 'fatura.mes_mudou';
  end if;

  -- Linha da Fatura que nasceu de um previsto (casada): a reimportação simples
  -- a apagaria com o `id` e a classificação. A 3.12 (reimportar mantendo a
  -- classificação) é quem vai poder fazer isso.
  if anterior is not null and exists (
    select 1 from public.lancamentos as l
     where l.owner_id = dono and l.fatura_id = anterior
       and l.casado_em is not null and l.excluido_em is null
  ) then
    raise exception 'fatura.reimportacao_com_casados';
  end if;

  if anterior is not null then
    -- Os previstos que a Fatura anterior criou e ninguém tocou saem junto;
    -- os editados ou excluídos ficam (a origem vira nula e a importação nova
    -- os religa).
    with apagados as (
      delete from public.lancamentos as p
       where p.owner_id = dono
         and p.lancado_por = 'sistema'
         and p.editado_em is null
         and p.excluido_em is null
         and p.origem_lancamento_id in (
           select l.id from public.lancamentos as l
            where l.owner_id = dono and l.fatura_id = anterior
         )
      returning p.id
    )
    select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb) into removidos_previstos
      from apagados as a;

    -- Os Ajustes saem junto com as mães (`ajuste_de_id` é `set null`).
    with apagados as (
      delete from public.lancamentos as l
       where l.owner_id = dono and l.fatura_id = anterior
      returning l.id
    )
    select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb) into removidos_lancamentos
      from apagados as a;

    select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into removidos_cartoes
      from public.fatura_cartoes as c
     where c.owner_id = dono and c.fatura_id = anterior;

    -- Os cartões caem por `on delete cascade`.
    delete from public.faturas as f
     where f.owner_id = dono and f.id = anterior;

    removidos := jsonb_build_object(
      'fatura_id', anterior,
      'cartoes', removidos_cartoes,
      'lancamentos', removidos_lancamentos,
      'previstos', removidos_previstos
    );
  end if;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

  -- Séries das linhas parceladas: acha ou cria (a chave vem do núcleo).
  insert into public.series (
    nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia
  )
  select distinct
    l -> 'serie' ->> 'nome_normalizado',
    (l -> 'serie' ->> 'parcela_total')::integer,
    (l -> 'serie' ->> 'valor_parcela_centavos')::integer,
    l -> 'serie' ->> 'mes_primeira_parcela',
    (l -> 'serie' ->> 'ocorrencia')::integer
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'serie') = 'object'
     and jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
  on conflict (owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)
  do nothing;

  -- Rede de segurança: a parcela (sem casamento calculado pelo núcleo) já tem
  -- uma linha na Série. Com o casamento (3.6) isto só acontece se o Mês mudou
  -- depois da leitura; a importação inteira é recusada e nada é gravado.
  if exists (
    select 1
      from jsonb_array_elements(dados_lancamentos) as l
      join public.series as s
        on s.owner_id = dono
       and s.nome_normalizado = l -> 'serie' ->> 'nome_normalizado'
       and s.parcela_total = (l -> 'serie' ->> 'parcela_total')::integer
       and s.valor_parcela_centavos = (l -> 'serie' ->> 'valor_parcela_centavos')::integer
       and s.mes_primeira_parcela = l -> 'serie' ->> 'mes_primeira_parcela'
       and s.ocorrencia = (l -> 'serie' ->> 'ocorrencia')::integer
      join public.lancamentos as x
        on x.owner_id = dono
       and x.serie_id = s.id
       and x.parcela_n = (l ->> 'parcela_n')::integer
       and x.dividido_de_id is null
       and x.excluido_em is null
     where jsonb_typeof(l -> 'serie') = 'object'
       and jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
  ) then
    raise exception 'fatura.previstos_sem_casamento';
  end if;

  insert into public.faturas (
    mes, vencimento, fechamento, total_despesas_centavos, total_creditos_centavos,
    saldo_anterior_centavos, pagamentos_centavos, total_a_pagar_centavos
  ) values (
    mes_fatura,
    (dados_fatura ->> 'vencimento')::date,
    (dados_fatura ->> 'fechamento')::date,
    (dados_fatura ->> 'total_despesas_centavos')::integer,
    (dados_fatura ->> 'total_creditos_centavos')::integer,
    (dados_fatura ->> 'saldo_anterior_centavos')::integer,
    (dados_fatura ->> 'pagamentos_centavos')::integer,
    (dados_fatura ->> 'total_a_pagar_centavos')::integer
  )
  returning * into fatura;

  with gravados as (
    insert into public.fatura_cartoes (fatura_id, final, total_centavos)
    select fatura.id, c ->> 'final', (c ->> 'total_centavos')::integer
      from jsonb_array_elements(dados_cartoes) as c
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.final), '[]'::jsonb) into cartoes
    from gravados as g;

  -- Casamento (História 3.6): cada previsto casado vira a linha real da
  -- Fatura, na mesma linha (mantém `id`, Série, Apelido, Observação, Status e
  -- `editado_em`). O núcleo já decidiu Responsável, Tipo e motivo.
  select count(*) into esperados
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'previsto_id') = 'string';

  update public.lancamentos as p
     set nome = l ->> 'nome',
         valor_centavos = (l ->> 'valor_centavos')::integer,
         data = (l ->> 'data')::date,
         final_cartao = l ->> 'final_cartao',
         fatura_id = fatura.id,
         ordem_fatura = (l ->> 'ordem_fatura')::integer,
         duvida_extracao = coalesce((l ->> 'duvida_extracao')::boolean, false),
         lancado_por = 'fatura'::public.lancado_por,
         casado_em = now(),
         responsavel_id = (l ->> 'responsavel_id')::uuid,
         tipo_id = (l ->> 'tipo_id')::uuid,
         revisao_motivo = (l ->> 'revisao_motivo')::public.revisao_motivo,
         revisao_dados = case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'previsto_id') = 'string'
     and p.id = (l ->> 'previsto_id')::uuid
     and p.owner_id = dono
     and p.lancado_por = 'sistema'
     and p.excluido_em is null
     and p.fatura_id is null
     and p.mes = mes_fatura
     and p.nome_normalizado = l ->> 'nome_normalizado'
     and p.parcela_n = (l ->> 'parcela_n')::integer
     and p.parcela_total = (l ->> 'parcela_total')::integer;
  get diagnostics casados = row_count;
  -- Previsto que sumiu, mudou de Mês ou já foi casado: o plano do núcleo
  -- ficou velho.
  if casados <> esperados then
    raise exception 'fatura.mes_mudou';
  end if;

  insert into public.lancamentos (
    nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id,
    responsavel_id, tipo_id, revisao_motivo, revisao_dados, serie_id, apelido, observacao
  )
  select
    l ->> 'nome',
    l ->> 'nome_normalizado',
    (l ->> 'valor_centavos')::integer,
    (l ->> 'data')::date,
    (l ->> 'parcela_n')::integer,
    (l ->> 'parcela_total')::integer,
    l ->> 'final_cartao',
    mes_fatura,
    fatura.id,
    (l ->> 'ordem_fatura')::integer,
    coalesce((l ->> 'duvida_extracao')::boolean, false),
    'fatura'::public.lancado_por,
    status_padrao,
    (l ->> 'responsavel_id')::uuid,
    (l ->> 'tipo_id')::uuid,
    (l ->> 'revisao_motivo')::public.revisao_motivo,
    case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end,
    s.id,
    l ->> 'apelido',
    l ->> 'observacao'
    from jsonb_array_elements(dados_lancamentos) as l
    left join public.series as s
      on jsonb_typeof(l -> 'serie') = 'object'
     and s.owner_id = dono
     and s.nome_normalizado = l -> 'serie' ->> 'nome_normalizado'
     and s.parcela_total = (l -> 'serie' ->> 'parcela_total')::integer
     and s.valor_parcela_centavos = (l -> 'serie' ->> 'valor_parcela_centavos')::integer
     and s.mes_primeira_parcela = l -> 'serie' ->> 'mes_primeira_parcela'
     and s.ocorrencia = (l -> 'serie' ->> 'ocorrencia')::integer
   where jsonb_typeof(l -> 'previsto_id') is distinct from 'string';

  -- Ajustes: cada um aponta para a linha da mesma Fatura com a ordem da mãe.
  update public.lancamentos as a
     set ajuste_de_id = m.id
    from jsonb_array_elements(dados_lancamentos) as l
    join public.lancamentos as m
      on m.fatura_id = fatura.id
     and m.ordem_fatura = (l ->> 'ajuste_de_ordem')::integer
   where a.fatura_id = fatura.id
     and a.ordem_fatura = (l ->> 'ordem_fatura')::integer
     and jsonb_typeof(l -> 'ajuste_de_ordem') = 'number';

  -- Previstos que já existiam e ficaram sem origem (reimportação): voltam a
  -- apontar para a linha nova da mesma Série.
  with atualizados as (
    update public.lancamentos as p
       set origem_lancamento_id = r.id
      from public.lancamentos as r
     where r.owner_id = dono
       and r.fatura_id = fatura.id
       and r.serie_id is not null
       and p.owner_id = dono
       and p.serie_id = r.serie_id
       and p.lancado_por = 'sistema'
       and p.origem_lancamento_id is null
       and p.excluido_em is null
       and p.parcela_n > r.parcela_n
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n), '[]'::jsonb) into religados
    from atualizados as g;

  -- Previstos novos. Não cria o que a Série já tem em qualquer estado (um
  -- previsto excluído não ressuscita) nem em Mês que já tem Fatura (o núcleo
  -- já deixa esses de fora; aqui é rede de segurança contra duas importações
  -- de aparelhos diferentes).
  with gravados as (
    insert into public.lancamentos (
      nome, nome_normalizado, apelido, valor_centavos, parcela_n, parcela_total, mes,
      lancado_por, status_id, responsavel_id, tipo_id, observacao, serie_id, origem_lancamento_id
    )
    select
      p ->> 'nome',
      p ->> 'nome_normalizado',
      p ->> 'apelido',
      (p ->> 'valor_centavos')::integer,
      (p ->> 'parcela_n')::integer,
      (p ->> 'parcela_total')::integer,
      p ->> 'mes',
      'sistema'::public.lancado_por,
      status_padrao,
      (p ->> 'responsavel_id')::uuid,
      (p ->> 'tipo_id')::uuid,
      p ->> 'observacao',
      r.serie_id,
      r.id
      from jsonb_array_elements(coalesce(dados_previstos, '[]'::jsonb)) as p
      join public.lancamentos as r
        on r.owner_id = dono
       and r.fatura_id = fatura.id
       and r.ordem_fatura = (p ->> 'ordem_origem')::integer
     where r.serie_id is not null
       and not exists (
         select 1 from public.lancamentos as x
          where x.owner_id = dono
            and x.serie_id = r.serie_id
            and x.parcela_n = (p ->> 'parcela_n')::integer
            and x.dividido_de_id is null
       )
       and not exists (
         select 1 from public.faturas as f
          where f.owner_id = dono and f.mes = p ->> 'mes'
       )
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n), '[]'::jsonb) into previstos
    from gravados as g;

  -- Previstos do Mês que a Fatura não trouxe: continuam previstos e vão para a
  -- fila como "Não veio na fatura".
  with marcados as (
    update public.lancamentos as p
       set revisao_motivo = 'nao_veio_na_fatura'::public.revisao_motivo,
           revisao_dados = null
     where p.owner_id = dono
       and p.mes = mes_fatura
       and p.lancado_por = 'sistema'
       and p.excluido_em is null
       and p.id in (
         select (v #>> '{}')::uuid
           from jsonb_array_elements(coalesce(previstos_sem_par, '[]'::jsonb)) as v
          where jsonb_typeof(v) = 'string'
       )
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.parcela_n, g.id), '[]'::jsonb) into sem_par
    from marcados as g;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  return jsonb_build_object(
    'fatura', to_jsonb(fatura),
    'cartoes', cartoes,
    'lancamentos', linhas,
    'previstos', previstos || religados || sem_par,
    'removidos', removidos
  );
exception
  -- Duas importações do mesmo Mês ao mesmo tempo: a segunda esbarra no único
  -- (a trava já as serializa; isto é a rede de segurança). A parcela que já
  -- tem linha na Série (duas importações de Meses diferentes ao mesmo tempo)
  -- é o mesmo caso do previsto sem casamento.
  when unique_violation then
    if sqlerrm like '%faturas_owner_id_mes_key%' then
      raise exception 'fatura.mes_ja_importado';
    end if;
    if sqlerrm like '%lancamentos_serie_id_parcela_n_key%' then
      raise exception 'fatura.previstos_sem_casamento';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb, jsonb) to authenticated;
