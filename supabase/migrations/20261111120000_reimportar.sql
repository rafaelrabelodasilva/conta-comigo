-- História 3.11 (antecipada, simplificada): Reimportar um Mês (FR-51).
--
-- `importar_fatura` ganha `substituir_fatura_id`: o id da Fatura do Mês que
-- Rafael confirmou substituir no aviso "Importar de novo". Com ele, a RPC
-- apaga (exclusão física, permitida pelo AD-16 só na reimportação), na
-- mesma transação, a Fatura anterior, os totais por cartão dela (`on delete
-- cascade`) e todos os Lançamentos com aquele `fatura_id`, inclusive Ajustes
-- e excluídos, e grava a nova como uma importação nova (já classificada
-- pelo núcleo). Sem casar linhas novas com antigas (isso é da Story 3.12).
-- Lançamentos sem `fatura_id` (manuais) e `regras` não são tocados.
--
-- Recusas, depois da trava do Mês:
-- - Mês com Fatura e sem `substituir_fatura_id`: `fatura.mes_ja_importado`.
-- - `substituir_fatura_id` que não é mais a Fatura do Mês (outro aparelho
--   reimportou, ou o Mês não tem Fatura): `fatura.mes_mudou`.
-- - `updated_at` mais novo do Mês diferente do enviado (o lido junto com os
--   números do aviso): `fatura.mes_mudou`.
--
-- Devolve também `removidos: {fatura_id, cartoes, lancamentos}` (ids), que o
-- repositório tira da memória. Sem reimportação, `removidos` é null.

drop function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz);

create function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null,
  substituir_fatura_id uuid default null
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
  removidos jsonb := null;
  removidos_cartoes jsonb;
  removidos_lancamentos jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(dados_cartoes) is distinct from 'array'
     or jsonb_typeof(dados_lancamentos) is distinct from 'array' then
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

  if anterior is not null then
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
      'lancamentos', removidos_lancamentos
    );
  end if;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

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

  insert into public.lancamentos (
    nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id,
    responsavel_id, tipo_id, revisao_motivo, revisao_dados
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
    case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end
    from jsonb_array_elements(dados_lancamentos) as l;

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

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  return jsonb_build_object(
    'fatura', to_jsonb(fatura),
    'cartoes', cartoes,
    'lancamentos', linhas,
    'removidos', removidos
  );
exception
  -- Duas importações do mesmo Mês ao mesmo tempo: a segunda esbarra no único
  -- (a trava já as serializa; isto é a rede de segurança).
  when unique_violation then
    if sqlerrm like '%faturas_owner_id_mes_key%' then
      raise exception 'fatura.mes_ja_importado';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid) to authenticated;
