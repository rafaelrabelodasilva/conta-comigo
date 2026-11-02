-- História 1.7: Ciclo do cartão (histórico só de inserção) e as colunas de
-- Aparência, limite do Ajuste e tolerância de atraso em `configuracoes`.
-- Mesmo padrão das tabelas anteriores (AD-3/4/5/9/14): dono por auth.uid(),
-- RLS, updated_at só pelo banco (reusa public.definir_updated_at()), replica
-- identity full e publicação no Realtime. As regras do Ciclo (Mês do
-- Lançamento, vencimento, `vigente_desde` da mudança) ficam no núcleo
-- (src/domain/ciclo.ts); aqui só as restrições.

-- ------------------------------------------------------------ config_ciclo

-- Cada gravação do Ciclo é uma linha nova: o passado nunca é reescrito.
-- Vale no Mês M a linha de maior (vigente_desde, created_at) com
-- vigente_desde <= M; antes da primeira, vale a primeira.
create table public.config_ciclo (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dia_fechamento smallint not null,
  dia_vencimento smallint not null,
  -- Mês (AAAA-MM) a partir do qual a configuração vale.
  vigente_desde text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint config_ciclo_dia_fechamento_check check (dia_fechamento between 1 and 31),
  constraint config_ciclo_dia_vencimento_check check (dia_vencimento between 1 and 31),
  constraint config_ciclo_vigente_desde_check
    check (vigente_desde ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

comment on table public.config_ciclo is
  'Ciclo do cartão (Glossário): dia de fechamento e de vencimento, com vigente_desde (AAAA-MM). Só inserção: mudar o Ciclo insere uma linha nova.';

create index config_ciclo_owner_id_vigente_desde_idx
  on public.config_ciclo (owner_id, vigente_desde);

create trigger config_ciclo_definir_updated_at
  before insert or update on public.config_ciclo
  for each row execute function public.definir_updated_at();

-- Uma mudança nunca vale para um Mês que já passou: `vigente_desde` não pode
-- ser anterior ao mês corrente em America/Sao_Paulo.
create or replace function public.impedir_ciclo_no_passado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vigente_desde < to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') then
    raise exception 'ciclo.vigente_no_passado';
  end if;
  return new;
end;
$$;

create trigger config_ciclo_impedir_no_passado
  before insert on public.config_ciclo
  for each row execute function public.impedir_ciclo_no_passado();

alter table public.config_ciclo enable row level security;

-- Só ler e inserir: sem políticas de update e delete, o banco recusa os dois.
create policy "config_ciclo_select_dono" on public.config_ciclo
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "config_ciclo_insert_dono" on public.config_ciclo
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

alter table public.config_ciclo replica identity full;
alter publication supabase_realtime add table public.config_ciclo;

-- ---------------------------------------------------------- configuracoes

alter table public.configuracoes
  -- Tema: segue o sistema ou fica fixo em Claro/Escuro (vale em todos os aparelhos).
  add column aparencia text not null default 'sistema',
  -- Limite do Ajuste em centavos (Épico 2): de R$ 0,01 a R$ 10,00.
  add column limite_ajuste_centavos integer not null default 100,
  -- Tolerância de atraso em dias (Épico 6): de 0 a 60.
  add column tolerancia_atraso_dias smallint not null default 10,
  add constraint configuracoes_aparencia_check
    check (aparencia in ('sistema', 'claro', 'escuro')),
  add constraint configuracoes_limite_ajuste_centavos_check
    check (limite_ajuste_centavos between 1 and 1000),
  add constraint configuracoes_tolerancia_atraso_dias_check
    check (tolerancia_atraso_dias between 0 and 60);

comment on table public.configuracoes is
  'Configurações do dono (uma linha por dono): Status padrão das linhas novas, Aparência, limite do Ajuste e tolerância de atraso.';
