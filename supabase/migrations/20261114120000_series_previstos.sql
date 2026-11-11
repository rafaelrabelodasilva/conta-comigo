-- História 3.5: Séries e parcelas previstas (FR-44, AD-8, AD-9, AD-14).
--
-- - `series`: uma por compra parcelada, identificada por
--   `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos,
--   mes_primeira_parcela, ocorrencia)`. A chave é calculada pelo núcleo
--   (src/domain/previstos.ts), sem usar a data da compra:
--   `mes_primeira_parcela = somarMeses(Mês da Fatura, -(parcela_n - 1))`.
--   `ocorrencia` separa compras idênticas no mesmo Mês, na ordem da Fatura.
-- - `lancamentos.serie_id`: a Série da parcela (real ou prevista).
--   `origem_lancamento_id`: a linha real que gerou o previsto (vira nulo se
--   ela for apagada na reimportação). `dividido_de_id`: reservada à 3.8
--   (Divisão); só existe aqui porque o índice único da Série a cita.
-- - Índice único parcial `(serie_id, parcela_n)` entre as linhas-mãe não
--   excluídas: uma linha por parcela de uma Série.
-- - `importar_fatura` ganha `dados_previstos`: o núcleo calcula os previstos
--   (Mês, cópia da classificação) e a RPC só grava. Na mesma transação:
--   acha ou cria as Séries; liga cada linha real à sua Série (recusa com
--   `fatura.previstos_sem_casamento` se a parcela já tem um previsto: o
--   casamento é da 3.6); cria os previstos que ainda não existem (nem
--   excluídos: um previsto excluído não ressuscita) em Meses sem Fatura;
--   religa à linha nova os previstos que ficaram sem origem.
-- - Reimportação simplificada (3.11, decisão 3-A): apaga também os previstos
--   `sistema` não editados e não excluídos que a Fatura anterior criou; os
--   outros ficam e são religados.

-- ------------------------------------------------------------------ series

create table public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome_normalizado text not null,
  parcela_total integer not null,
  valor_parcela_centavos integer not null,
  -- Mês (AAAA-MM) da parcela 1, calculado pelo Mês da Fatura e pelo número da
  -- parcela (nunca pela data da compra).
  mes_primeira_parcela text not null,
  ocorrencia integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint series_nome_normalizado_check check (char_length(nome_normalizado) between 1 and 200),
  constraint series_parcela_total_check check (parcela_total >= 2 and parcela_total <= 999),
  constraint series_mes_primeira_parcela_check check (mes_primeira_parcela ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint series_ocorrencia_check check (ocorrencia >= 1),
  constraint series_chave_key unique (
    owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia
  ),
  -- Alvo da chave composta de `lancamentos`.
  constraint series_owner_id_id_key unique (owner_id, id)
);

comment on table public.series is
  'Série (Glossário): uma compra parcelada. Todas as parcelas, reais e previstas, apontam para ela.';

create trigger series_definir_updated_at
  before insert or update on public.series
  for each row execute function public.definir_updated_at();

alter table public.series enable row level security;

create policy "series_select_dono" on public.series
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "series_insert_dono" on public.series
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "series_update_dono" on public.series
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "series_delete_dono" on public.series
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.series replica identity full;

-- ------------------------------------------------------------- lancamentos

alter table public.lancamentos
  add column serie_id uuid,
  add column origem_lancamento_id uuid,
  add column dividido_de_id uuid;

comment on column public.lancamentos.serie_id is
  'A Série (compra parcelada) da parcela, real ou prevista.';
comment on column public.lancamentos.origem_lancamento_id is
  'Previsto: a linha real que o gerou. Vira nulo se a linha for apagada (reimportação).';
comment on column public.lancamentos.dividido_de_id is
  'Divisão (História 3.8): a mãe de uma parte. Nulo = linha-mãe.';

alter table public.lancamentos
  add constraint lancamentos_serie_fkey
    foreign key (owner_id, serie_id)
    references public.series (owner_id, id),
  add constraint lancamentos_origem_check check (origem_lancamento_id <> id),
  add constraint lancamentos_origem_fkey
    foreign key (owner_id, origem_lancamento_id)
    references public.lancamentos (owner_id, id)
    on delete set null (origem_lancamento_id),
  add constraint lancamentos_dividido_de_check check (dividido_de_id <> id),
  add constraint lancamentos_dividido_de_fkey
    foreign key (owner_id, dividido_de_id)
    references public.lancamentos (owner_id, id)
    on delete cascade;

-- Sustentam as chaves compostas e as consultas da Série e da reimportação.
create index lancamentos_owner_id_serie_id_idx on public.lancamentos (owner_id, serie_id);
create index lancamentos_owner_id_origem_lancamento_id_idx on public.lancamentos (owner_id, origem_lancamento_id);
create index lancamentos_owner_id_dividido_de_id_idx on public.lancamentos (owner_id, dividido_de_id);

-- Uma linha-mãe por parcela de uma Série, entre as não excluídas (AD-8).
create unique index lancamentos_serie_id_parcela_n_key
  on public.lancamentos (serie_id, parcela_n)
  where dividido_de_id is null and excluido_em is null;

-- ---------------------------------------------------------- importar_fatura

drop function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid);

create function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null,
  substituir_fatura_id uuid default null,
  dados_previstos jsonb default null
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
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(dados_cartoes) is distinct from 'array'
     or jsonb_typeof(dados_lancamentos) is distinct from 'array'
     or (dados_previstos is not null and jsonb_typeof(dados_previstos) is distinct from 'array') then
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
  on conflict (owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)
  do nothing;

  -- A parcela já tem uma linha na Série (um previsto): o casamento é da 3.6,
  -- então a importação inteira é recusada e nada é gravado.
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

  insert into public.lancamentos (
    nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id,
    responsavel_id, tipo_id, revisao_motivo, revisao_dados, serie_id
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
    s.id
    from jsonb_array_elements(dados_lancamentos) as l
    left join public.series as s
      on jsonb_typeof(l -> 'serie') = 'object'
     and s.owner_id = dono
     and s.nome_normalizado = l -> 'serie' ->> 'nome_normalizado'
     and s.parcela_total = (l -> 'serie' ->> 'parcela_total')::integer
     and s.valor_parcela_centavos = (l -> 'serie' ->> 'valor_parcela_centavos')::integer
     and s.mes_primeira_parcela = l -> 'serie' ->> 'mes_primeira_parcela'
     and s.ocorrencia = (l -> 'serie' ->> 'ocorrencia')::integer;

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

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  return jsonb_build_object(
    'fatura', to_jsonb(fatura),
    'cartoes', cartoes,
    'lancamentos', linhas,
    'previstos', previstos || religados,
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

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb) to authenticated;
