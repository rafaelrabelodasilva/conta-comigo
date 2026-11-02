-- História 1.5: Tipos (Glossário), que classificam cada Lançamento.
-- Mesmo padrão de `responsaveis` (AD-3/4/5/14/16): dono por auth.uid(), RLS
-- com políticas owner_id = auth.uid(), updated_at só pelo banco (reusa
-- public.definir_updated_at(), criada na migração de Responsáveis),
-- replica identity full e publicação no Realtime. Sem ordem manual, cor nem
-- ícone: a lista é alfabética. As regras (nome único sem diferenciar
-- maiúsculas e acentos) ficam no núcleo (src/domain/tipos.ts).

create table public.tipos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome text not null,
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tipos_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 30)
);

-- Toda política de RLS e o Realtime filtram por dono.
create index tipos_owner_id_idx on public.tipos (owner_id);

comment on table public.tipos is
  'Tipos (Glossário): classificação de cada Lançamento (Casa, Gatos, Viagem…).';

create trigger tipos_definir_updated_at
  before insert or update on public.tipos
  for each row execute function public.definir_updated_at();

alter table public.tipos enable row level security;

create policy "tipos_select_dono" on public.tipos
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "tipos_insert_dono" on public.tipos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "tipos_update_dono" on public.tipos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "tipos_delete_dono" on public.tipos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Realtime: replica identity full (AD-4) e publicação da tabela. Com RLS,
-- INSERT/UPDATE só chegam a quem pode ler a linha nova; o DELETE traz só a
-- chave primária (veja a migração de Responsáveis).
alter table public.tipos replica identity full;
alter publication supabase_realtime add table public.tipos;
