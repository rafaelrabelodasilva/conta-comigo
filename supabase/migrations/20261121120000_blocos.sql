-- História 4.1: Montar um Bloco com fichas (FR-19, FR-54, AD-11, AD-16).
--
-- - `blocos`: o totalizador nomeado do Painel. A Fórmula é uma árvore em
--   `jsonb` (operando, número, operação, grupo), validada pelo schema zod do
--   núcleo (src/domain/formula.ts) antes de gravar; aqui só a forma.
--   `de_cobranca` ("Usar em Recebimentos", Épico 6) e `meu_bloco` ("É o meu
--   Bloco", Épico 7), este único por dono (índice parcial).
-- - `referencias_cadastro()`: a Fórmula cita ids de Responsável e de Tipo
--   dentro do `jsonb` (só como valores) e conta uso: excluir um Responsável
--   ou Tipo que um Bloco usa exige substituto, e `substituir_cadastro` troca
--   o id dentro da Fórmula. Espelha REFERENCIAS_JSONB de src/domain/cadastros.ts.
-- - `salvar_bloco`: cria ou altera um Bloco numa transação; ao marcar "É o
--   meu Bloco", tira a marca do Bloco que a tinha. Devolve as linhas afetadas.
--
-- Padrão de toda tabela de negócio (AD-3/4/5): dono por auth.uid(), RLS,
-- updated_at só pelo banco, replica identity full e publicação no Realtime.

create table public.blocos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome text not null,
  -- A árvore da Fórmula (src/domain/formula.ts), ids só como valores.
  formula jsonb not null,
  ordem integer not null,
  de_cobranca boolean not null default false,
  meu_bloco boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocos_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 30),
  constraint blocos_formula_check check (jsonb_typeof(formula) = 'object')
);

comment on table public.blocos is
  'Blocos (Glossário): totalizador nomeado do Painel, calculado por uma Fórmula sobre os Lançamentos do Mês.';
comment on column public.blocos.formula is
  'Árvore da Fórmula validada pelo núcleo: {tipo: responsavel|tipo|responsavel_em_tipo|todos|numero|operacao|grupo, ...}. Ids de cadastro só como valores.';
comment on column public.blocos.de_cobranca is
  '"Usar em Recebimentos": o Bloco aparece como Bloco de cobrança (Épico 6).';
comment on column public.blocos.meu_bloco is
  '"É o meu Bloco": o do gasto do Rafael por Tipo (Épico 7). No máximo um por dono.';

-- "É o meu Bloco" é único por dono.
create unique index blocos_owner_id_meu_bloco_key on public.blocos (owner_id) where meu_bloco;

create index blocos_owner_id_ordem_idx on public.blocos (owner_id, ordem);

create trigger blocos_definir_updated_at
  before insert or update on public.blocos
  for each row execute function public.definir_updated_at();

alter table public.blocos enable row level security;

create policy "blocos_select_dono" on public.blocos
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "blocos_insert_dono" on public.blocos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "blocos_update_dono" on public.blocos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "blocos_delete_dono" on public.blocos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.blocos replica identity full;
alter publication supabase_realtime add table public.blocos;

-- ----------------------------------------------- referências aos cadastros

-- Igual à da História 3.8, mais a Fórmula do Bloco (jsonb, conta uso).
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
    ('status'::text, 'lancamentos'::text, 'status_id'::text, 'coluna'::text, true),
    ('responsavel'::text, 'regras'::text, 'responsavel_id'::text, 'coluna'::text, false),
    ('tipo'::text, 'regras'::text, 'tipo_id'::text, 'coluna'::text, false),
    ('responsavel'::text, 'regras'::text, 'contagem'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('tipo'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'regras'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true),
    ('tipo'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true)
$$;

-- -------------------------------------------------------------- salvar_bloco

-- Cria (`p_id` nulo) ou altera um Bloco. A Fórmula já veio conferida pelo
-- núcleo; aqui só se grava. Com `p_meu_bloco`, o Bloco que tinha a marca a
-- perde na mesma transação. Devolve o Bloco salvo e os que perderam a marca.
-- security invoker: as políticas de RLS valem como numa gravação comum.
create or replace function public.salvar_bloco(
  p_nome text,
  p_formula jsonb,
  p_ordem integer,
  p_de_cobranca boolean,
  p_meu_bloco boolean,
  p_id uuid default null
)
returns setof public.blocos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  salvo uuid;
  perderam uuid[] := '{}';
begin
  if dono is null then
    raise exception 'bloco.nao_encontrado';
  end if;

  if p_meu_bloco then
    with perdeu as (
      update public.blocos
         set meu_bloco = false
       where owner_id = dono
         and meu_bloco
         and id is distinct from p_id
      returning id
    )
    select coalesce(array_agg(id), '{}') into perderam from perdeu;
  end if;

  if p_id is null then
    insert into public.blocos (nome, formula, ordem, de_cobranca, meu_bloco)
    values (p_nome, p_formula, p_ordem, p_de_cobranca, p_meu_bloco)
    returning id into salvo;
  else
    update public.blocos
       set nome = p_nome,
           formula = p_formula,
           ordem = p_ordem,
           de_cobranca = p_de_cobranca,
           meu_bloco = p_meu_bloco
     where id = p_id
       and owner_id = dono
    returning id into salvo;
    if salvo is null then
      raise exception 'bloco.nao_encontrado';
    end if;
  end if;

  return query
    select b.*
      from public.blocos as b
     where b.owner_id = dono
       and (b.id = salvo or b.id = any (perderam));
end;
$$;

revoke execute on function public.salvar_bloco(text, jsonb, integer, boolean, boolean, uuid) from public, anon;
grant execute on function public.salvar_bloco(text, jsonb, integer, boolean, boolean, uuid) to authenticated;
