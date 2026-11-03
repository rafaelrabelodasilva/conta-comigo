-- História 2.3: Faturas, totais por cartão e Lançamentos, e a RPC atômica
-- `importar_fatura`. Mesmo padrão das tabelas anteriores (AD-3/4/5/14/16):
-- dono por auth.uid(), RLS com políticas owner_id = auth.uid(), updated_at
-- só pelo banco (reusa public.definir_updated_at()), replica identity full e
-- publicação no Realtime. Valores em centavos inteiros (AD-2), datas em
-- `date` e o Mês em `AAAA-MM` (AD-9). Tudo o que a importação grava é
-- calculado no núcleo (src/domain/importacao-fatura.ts); a RPC só grava,
-- numa transação, e lê o Status padrão de `configuracoes`.

-- Alvos das chaves estrangeiras compostas por dono (Responsável e Tipo de um
-- Lançamento são sempre do mesmo dono). `status` já tem a sua.
alter table public.responsaveis
  add constraint responsaveis_owner_id_id_key unique (owner_id, id);
alter table public.tipos
  add constraint tipos_owner_id_id_key unique (owner_id, id);

-- Quem lançou a linha (AD-6): enum fechado.
create type public.lancado_por as enum ('fatura', 'sistema', 'manual', 'historico');

-- ----------------------------------------------------------------- faturas

create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- Mês (AAAA-MM) = mês do vencimento lido; nunca recalculado.
  mes text not null,
  vencimento date not null,
  fechamento date,
  -- Totais lidos da Fatura (AD-4: guardados; os calculados nunca).
  total_despesas_centavos integer not null,
  -- Sempre positivo (valor absoluto do que a Fatura escreve).
  total_creditos_centavos integer not null,
  saldo_anterior_centavos integer,
  pagamentos_centavos integer,
  total_a_pagar_centavos integer,
  -- Quando o alerta de diferença da Conferência foi dispensado (História 2.5).
  alerta_dispensado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faturas_mes_check check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint faturas_total_creditos_centavos_check check (total_creditos_centavos >= 0),
  -- Uma Fatura por Mês (a reimportação chega no Épico 3).
  constraint faturas_owner_id_mes_key unique (owner_id, mes),
  -- Alvo das chaves compostas de `fatura_cartoes` e `lancamentos`.
  constraint faturas_owner_id_id_key unique (owner_id, id)
);

comment on table public.faturas is
  'Fatura (Glossário) de um Mês: vencimento, fechamento e os totais lidos do PDF. Uma por dono e Mês.';

create trigger faturas_definir_updated_at
  before insert or update on public.faturas
  for each row execute function public.definir_updated_at();

alter table public.faturas enable row level security;

create policy "faturas_select_dono" on public.faturas
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "faturas_insert_dono" on public.faturas
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "faturas_update_dono" on public.faturas
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "faturas_delete_dono" on public.faturas
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.faturas replica identity full;
alter publication supabase_realtime add table public.faturas;

-- ---------------------------------------------------------- fatura_cartoes

-- O "VALOR TOTAL" lido de cada cartão da Fatura (Conferência por cartão).
create table public.fatura_cartoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  fatura_id uuid not null,
  final text not null,
  total_centavos integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fatura_cartoes_final_check check (final ~ '^\d{4}$'),
  constraint fatura_cartoes_fatura_id_final_key unique (fatura_id, final),
  constraint fatura_cartoes_fatura_fkey
    foreign key (owner_id, fatura_id)
    references public.faturas (owner_id, id)
    on delete cascade
);

comment on table public.fatura_cartoes is
  'Total lido ("VALOR TOTAL") de cada cartão (final de 4 dígitos) de uma Fatura.';

create index fatura_cartoes_owner_id_fatura_id_idx on public.fatura_cartoes (owner_id, fatura_id);

create trigger fatura_cartoes_definir_updated_at
  before insert or update on public.fatura_cartoes
  for each row execute function public.definir_updated_at();

alter table public.fatura_cartoes enable row level security;

create policy "fatura_cartoes_select_dono" on public.fatura_cartoes
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "fatura_cartoes_insert_dono" on public.fatura_cartoes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "fatura_cartoes_update_dono" on public.fatura_cartoes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "fatura_cartoes_delete_dono" on public.fatura_cartoes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.fatura_cartoes replica identity full;
alter publication supabase_realtime add table public.fatura_cartoes;

-- ------------------------------------------------------------- lancamentos

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- Texto exato da Fatura; nunca alterado (AD-6).
  nome text not null,
  -- normalizarNome(nome) do núcleo: chave exata de "mesmo Nome".
  nome_normalizado text not null,
  -- Só exibição.
  apelido text,
  -- Créditos negativos.
  valor_centavos integer not null,
  data date,
  parcela_n integer,
  parcela_total integer,
  final_cartao text,
  -- Mês (AAAA-MM) fixado na criação e nunca recalculado (AD-9).
  mes text not null,
  -- A Fatura de onde veio: define quem entra na Conferência.
  fatura_id uuid,
  -- Ordem do PDF (ordem padrão da grade).
  ordem_fatura integer,
  -- A leitura deste Lançamento ficou incerta (só ordena dentro do cartão).
  duvida_extracao boolean not null default false,
  lancado_por public.lancado_por not null,
  responsavel_id uuid,
  tipo_id uuid,
  -- Status do usuário; nulo = "não pago" (AD-10).
  status_id uuid,
  observacao text,
  editado_em timestamptz,
  -- Exclusão lógica (AD-16).
  excluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancamentos_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 200),
  constraint lancamentos_nome_normalizado_check
    check (char_length(nome_normalizado) between 1 and 200),
  constraint lancamentos_apelido_check
    check (apelido is null or (apelido = btrim(apelido) and char_length(apelido) between 1 and 60)),
  -- Parcela: as duas colunas juntas (ou nenhuma) e 1 ≤ n ≤ total ≤ 999.
  -- Sem `between` dentro de `or`: o Postgres reescreve essa forma com outros
  -- parênteses ao restaurar o backup, e a impressão digital do backup
  -- (pg_get_constraintdef) deixaria de bater.
  constraint lancamentos_parcela_par_check
    check ((parcela_n is null) = (parcela_total is null)),
  constraint lancamentos_parcela_check
    check (parcela_n >= 1 and parcela_n <= parcela_total and parcela_total <= 999),
  constraint lancamentos_final_cartao_check check (final_cartao ~ '^\d{4}$'),
  constraint lancamentos_mes_check check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint lancamentos_ordem_fatura_check check (ordem_fatura >= 1),
  -- Linha da Fatura sempre tem a Fatura, a ordem, a data e o cartão.
  constraint lancamentos_fatura_check
    check (
      lancado_por <> 'fatura'
      or (fatura_id is not null and ordem_fatura is not null and data is not null and final_cartao is not null)
    ),
  constraint lancamentos_fatura_fkey
    foreign key (owner_id, fatura_id)
    references public.faturas (owner_id, id),
  constraint lancamentos_responsavel_fkey
    foreign key (owner_id, responsavel_id)
    references public.responsaveis (owner_id, id),
  constraint lancamentos_tipo_fkey
    foreign key (owner_id, tipo_id)
    references public.tipos (owner_id, id),
  constraint lancamentos_status_fkey
    foreign key (owner_id, status_id)
    references public.status (owner_id, id)
);

comment on table public.lancamentos is
  'Lançamentos (Glossário): cada linha da Fatura ou lançada no app, com Mês fixo, classificação (Responsável, Tipo, Status) e exclusão lógica.';

-- Grade e Realtime leem por dono e Mês.
create index lancamentos_owner_id_mes_idx on public.lancamentos (owner_id, mes);
-- Sustenta a chave composta (owner_id, fatura_id) → faturas (Conferência por Fatura).
create index lancamentos_owner_id_fatura_id_idx on public.lancamentos (owner_id, fatura_id);
-- Uma posição por Fatura entre as não excluídas (índice parcial, AD-16).
create unique index lancamentos_fatura_id_ordem_fatura_key
  on public.lancamentos (fatura_id, ordem_fatura)
  where excluido_em is null;
create index lancamentos_owner_id_responsavel_id_idx on public.lancamentos (owner_id, responsavel_id);
create index lancamentos_owner_id_tipo_id_idx on public.lancamentos (owner_id, tipo_id);
create index lancamentos_owner_id_status_id_idx on public.lancamentos (owner_id, status_id);

create trigger lancamentos_definir_updated_at
  before insert or update on public.lancamentos
  for each row execute function public.definir_updated_at();

alter table public.lancamentos enable row level security;

create policy "lancamentos_select_dono" on public.lancamentos
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "lancamentos_insert_dono" on public.lancamentos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "lancamentos_update_dono" on public.lancamentos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "lancamentos_delete_dono" on public.lancamentos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.lancamentos replica identity full;
alter publication supabase_realtime add table public.lancamentos;

-- ----------------------------------------------- referências aos cadastros

-- Responsável, Tipo e Status dos Lançamentos contam uso: excluir um em uso
-- exige substituto. Espelha REFERENCIAS_COLUNAS de src/domain/cadastros.ts.
create or replace function public.referencias_cadastro()
returns table (cadastro text, tabela text, coluna text, forma text, conta_uso boolean)
language sql
immutable
set search_path = ''
as $$
  values
    ('status'::text, 'configuracoes'::text, 'status_padrao_id'::text, 'coluna'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'responsavel_id'::text, 'coluna'::text, true),
    ('tipo'::text, 'lancamentos'::text, 'tipo_id'::text, 'coluna'::text, true),
    ('status'::text, 'lancamentos'::text, 'status_id'::text, 'coluna'::text, true)
$$;

-- ---------------------------------------------------------- importar_fatura

-- Grava a Fatura, os totais por cartão e os Lançamentos numa transação:
-- tudo ou nada. Os três documentos vêm prontos do núcleo
-- (`prepararImportacao`): `dados_fatura` com mes, vencimento, fechamento e
-- os totais; `dados_cartoes` [{final, total_centavos}]; `dados_lancamentos`
-- [{nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
-- final_cartao, ordem_fatura, duvida_extracao}]. A RPC acrescenta só o Mês e
-- a Fatura em cada linha, `lancado_por = 'fatura'` e o Status padrão de
-- `configuracoes` (a verdade do banco no momento da gravação).
--
-- `lancamentos_atualizados_em` é o `updated_at` mais novo dos Lançamentos do
-- Mês que o app leu (nulo se não leu nenhum): se o banco tiver outro, o Mês
-- mudou desde o cálculo e nada é gravado (`fatura.mes_mudou`). Mês que já
-- tem Fatura → `fatura.mes_ja_importado`.
--
-- Devolve as linhas gravadas ({fatura, cartoes, lancamentos}) para o
-- gerenciador de Realtime aplicar (AD-4). security invoker: o RLS vale como
-- numa gravação comum, e owner_id vem de auth.uid().
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

  with gravados as (
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
      from jsonb_array_elements(dados_lancamentos) as l
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura), '[]'::jsonb) into linhas
    from gravados as g;

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
