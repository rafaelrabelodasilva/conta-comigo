-- História 2.8: Ajustes de centavos (FR-47, AD-8). Um crédito pequeno sem
-- Parcela, na mesma Fatura e com o mesmo Nome normalizado de uma parcela,
-- aponta para ela (a "mãe") por `ajuste_de_id`. A regra é do núcleo
-- (`reconhecerAjustes` em src/domain/ajustes.ts): a importação manda, em cada
-- Ajuste, a `ordem_fatura` da mãe (`ajuste_de_ordem`), e a RPC grava o
-- `ajuste_de_id` na mesma transação. A Conferência não muda: o Ajuste
-- continua como crédito.
--
-- Os créditos já gravados são vinculados uma vez, aqui no fim, pela mesma
-- regra escrita em SQL (decisão do Rafael, 09/11/2026, opção A); um teste de
-- integração confere que o SQL e o núcleo dão os mesmos pares.

-- Alvo da chave estrangeira composta por dono (o Ajuste e a mãe são do mesmo dono).
alter table public.lancamentos
  add constraint lancamentos_owner_id_id_key unique (owner_id, id);

alter table public.lancamentos
  add column ajuste_de_id uuid;

comment on column public.lancamentos.ajuste_de_id is
  'Ajuste de centavos (FR-47): a parcela (mãe) deste crédito. Nulo = linha comum.';

-- Uma linha nunca é Ajuste dela mesma. A mãe apagada de verdade (só a
-- reimportação apaga, AD-7) deixa o Ajuste como linha comum.
alter table public.lancamentos
  add constraint lancamentos_ajuste_de_check check (ajuste_de_id <> id),
  add constraint lancamentos_ajuste_de_fkey
    foreign key (owner_id, ajuste_de_id)
    references public.lancamentos (owner_id, id)
    on delete set null (ajuste_de_id);

-- Sustenta a chave composta e "os Ajustes desta mãe".
create index lancamentos_owner_id_ajuste_de_id_idx on public.lancamentos (owner_id, ajuste_de_id);

-- ---------------------------------------------------------- importar_fatura

-- Igual à da História 2.3 (mesma assinatura), mais o `ajuste_de_id`: cada
-- linha de `dados_lancamentos` pode trazer `ajuste_de_ordem` (a
-- `ordem_fatura` da mãe, calculada pelo núcleo); depois do insert, o Ajuste
-- aponta para a linha com essa ordem na mesma Fatura. Na importação ninguém
-- tem Tipo nem Responsável, então não há o que copiar da mãe.
create or replace function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  mes_fatura text := dados_fatura ->> 'mes';
  fatura public.faturas;
  status_padrao uuid;
  ultima timestamptz;
  cartoes jsonb;
  linhas jsonb;
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

  if exists (select 1 from public.faturas as f where f.owner_id = dono and f.mes = mes_fatura) then
    raise exception 'fatura.mes_ja_importado';
  end if;

  select max(l.updated_at) into ultima
    from public.lancamentos as l
   where l.owner_id = dono and l.mes = mes_fatura;
  if ultima is distinct from lancamentos_atualizados_em then
    raise exception 'fatura.mes_mudou';
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
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id
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
    status_padrao
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

  return jsonb_build_object('fatura', to_jsonb(fatura), 'cartoes', cartoes, 'lancamentos', linhas);
exception
  -- Duas importações do mesmo Mês ao mesmo tempo: a segunda esbarra no único.
  when unique_violation then
    if sqlerrm like '%faturas_owner_id_mes_key%' then
      raise exception 'fatura.mes_ja_importado';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz) to authenticated;

-- ------------------------------------------------- Ajustes já gravados

-- Vincula, uma vez, os créditos já gravados (de `dono`, ou de todos sem ele):
-- a mesma regra de `reconhecerAjustes` do núcleo. É Ajuste o crédito não
-- excluído, sem Parcela e ainda sem mãe, de uma Fatura, com |valor| menor
-- que `configuracoes.limite_ajuste_centavos` (sem a linha, 100); a mãe é a
-- linha não excluída da mesma Fatura, com o mesmo `nome_normalizado` e com
-- Parcela: a do mesmo cartão primeiro, depois a de menor `ordem_fatura`. O
-- Ajuste recebe o Tipo e o Responsável da mãe. Devolve quantos vinculou.
--
-- Só a migração (abaixo) e o teste de integração chamam: não fica para o
-- app (um crédito desvinculado nunca é reconhecido de novo).
create or replace function public.vincular_ajustes_gravados(dono uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  vinculados integer;
begin
  with pares as (
    select distinct on (c.id)
           c.id as ajuste_id, m.id as mae_id, m.tipo_id, m.responsavel_id
      from public.lancamentos as c
      join public.lancamentos as m
        on m.owner_id = c.owner_id
       and m.fatura_id = c.fatura_id
       and m.nome_normalizado = c.nome_normalizado
       and m.parcela_n is not null
       and m.excluido_em is null
      left join public.configuracoes as cfg
        on cfg.owner_id = c.owner_id
     where (dono is null or c.owner_id = dono)
       and c.fatura_id is not null
       and c.excluido_em is null
       and c.ajuste_de_id is null
       and c.parcela_n is null
       and c.valor_centavos < 0
       and -c.valor_centavos < coalesce(cfg.limite_ajuste_centavos, 100)
     order by c.id,
              (m.final_cartao is not distinct from c.final_cartao) desc,
              m.ordem_fatura asc nulls last,
              m.id
  )
  update public.lancamentos as l
     set ajuste_de_id = p.mae_id,
         tipo_id = p.tipo_id,
         responsavel_id = p.responsavel_id
    from pares as p
   where l.id = p.ajuste_id;
  get diagnostics vinculados = row_count;
  return vinculados;
end;
$$;

revoke execute on function public.vincular_ajustes_gravados(uuid) from public, anon, authenticated;
grant execute on function public.vincular_ajustes_gravados(uuid) to service_role;

select public.vincular_ajustes_gravados();
