-- História 1.4: Responsáveis com cor, sincronizados entre aparelhos.
-- Padrão de toda tabela de negócio (AD-3/4/5/14/16): dono por auth.uid(),
-- RLS com políticas owner_id = auth.uid(), updated_at só pelo banco,
-- replica identity full e publicação no Realtime.
-- As regras (nome válido, cor livre, próxima cor, nova ordem) ficam no
-- núcleo (src/domain/responsaveis.ts); aqui só as restrições.

-- updated_at definido pelo banco, em toda inserção e alteração.
-- clock_timestamp() (e não now()) para que duas gravações seguidas nunca
-- tenham o mesmo instante, mesmo dentro de transações longas.
create or replace function public.definir_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.responsaveis (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome text not null,
  cor smallint not null,
  ordem integer not null,
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responsaveis_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 30),
  constraint responsaveis_cor_check check (cor between 1 and 8),
  -- Arquivado continua com a cor reservada: no máximo 8 por dono.
  constraint responsaveis_owner_id_cor_key unique (owner_id, cor)
);

comment on table public.responsaveis is
  'Responsáveis (Glossário): quem responde por cada Lançamento. Cor 1..8 = tokens person-N.';

create trigger responsaveis_definir_updated_at
  before insert or update on public.responsaveis
  for each row execute function public.definir_updated_at();

alter table public.responsaveis enable row level security;

create policy "responsaveis_select_dono" on public.responsaveis
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "responsaveis_insert_dono" on public.responsaveis
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "responsaveis_update_dono" on public.responsaveis
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "responsaveis_delete_dono" on public.responsaveis
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Realtime: replica identity full (exigida pelo AD-4) e publicação da tabela.
-- Com RLS ligado, INSERT/UPDATE só chegam a quem pode ler a linha nova, e o
-- registro antigo (`old`) vem só com a chave primária. O DELETE traz só a
-- chave primária e NÃO é filtrado por dono: o cliente apenas remove da
-- memória um id que já tinha.
alter table public.responsaveis replica identity full;
alter publication supabase_realtime add table public.responsaveis;

-- Reordenação numa transação: ids na ordem nova; a posição (1, 2, …) vira
-- a ordem. Só grava as linhas que mudaram e devolve essas linhas (AD-4).
-- security invoker: as políticas de RLS valem como numa gravação comum.
create or replace function public.reordenar_responsaveis(ids uuid[])
returns setof public.responsaveis
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.responsaveis as r
     set ordem = t.posicao::integer
    from unnest(ids) with ordinality as t(id, posicao)
   where r.id = t.id
     and r.ordem is distinct from t.posicao::integer
  returning r.*;
end;
$$;

revoke execute on function public.reordenar_responsaveis(uuid[]) from public, anon;
grant execute on function public.reordenar_responsaveis(uuid[]) to authenticated;
