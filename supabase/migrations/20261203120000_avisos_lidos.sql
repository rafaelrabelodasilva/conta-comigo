-- História 8.1: Central de Avisos, o "lido" que vale em todos os aparelhos (FR-55, AD-13, AD-4, AD-14).
-- Uma tabela nova, só aditiva (nenhuma coluna, função ou política existente muda):
--
-- `avisos_lidos`: o que o dono já leu na Central de Avisos, com a MESMA chave do aviso do sistema
-- (`lembretes_enviados`, 7.5): `(tipo, referencia, dia)`, única por dono, de `chaveDeNotificacao` em
-- `src/domain/lembretes.ts`.
--   - fechamento: `referencia` = o Mês da Fatura (`AAAA-MM`), `dia` = o dia do fechamento;
--   - atraso: `referencia` = o id do Bloco de cobrança, `dia` = o primeiro dia de atraso ("desde").
-- O atraso que continua e já foi lido fica lido (mesma chave); um atraso novo, ou um "desde" que mudou, é outra
-- chave e volta como não lido. A linha de um aviso que deixou de existir continua aqui (não há limpeza: são
-- poucas linhas por mês, e `deferred-work.md` registra a decisão).
--
-- O navegador lê e grava com a sessão do dono (RLS por dono, como as outras tabelas que o app lê); a tabela está
-- na publicação do Realtime com `replica identity full`, então marcar como lido no iPad aparece no PC sozinho.
-- `tipo` não é uma lista fechada: a História 8.2 acrescenta tipos de aviso sem outra migração. Nenhuma regra de
-- aviso mora aqui (quais avisos existem, a ordem e a contagem de não lidos são do núcleo, `src/domain/avisos.ts`):
-- o banco só guarda a chave lida. Uma restrição por coluna (nenhuma `check` com mais de uma coluna).

create table public.avisos_lidos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- O tipo do aviso (`fechamento` e `atraso` hoje; os da 8.2 entram sem migração).
  tipo text not null,
  -- fechamento: o Mês da Fatura (`AAAA-MM`); atraso: o id do Bloco de cobrança.
  referencia text not null,
  -- fechamento: o dia do fechamento; atraso: o primeiro dia de atraso do Bloco (`desde`).
  dia date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avisos_lidos_tipo_check check (char_length(tipo) between 1 and 32),
  constraint avisos_lidos_referencia_check check (char_length(referencia) between 1 and 64),
  -- Um aviso é lido uma vez por dono: "Marcar como lido" de novo (ou em outro aparelho) não duplica.
  constraint avisos_lidos_chave_key unique (owner_id, tipo, referencia, dia)
);

comment on table public.avisos_lidos is
  'Avisos da Central de Avisos que o dono já leu (FR-55, 8.1), únicos por (dono, tipo, referencia, dia): a mesma chave do aviso do sistema (lembretes_enviados). Vale em todos os aparelhos.';

create trigger avisos_lidos_definir_updated_at
  before insert or update on public.avisos_lidos
  for each row execute function public.definir_updated_at();

alter table public.avisos_lidos enable row level security;

create policy "avisos_lidos_select_dono" on public.avisos_lidos
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "avisos_lidos_insert_dono" on public.avisos_lidos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "avisos_lidos_update_dono" on public.avisos_lidos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "avisos_lidos_delete_dono" on public.avisos_lidos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.avisos_lidos from anon;

-- Realtime: replica identity full (exigida pelo AD-4) e publicação da tabela, como as outras que o navegador lê.
alter table public.avisos_lidos replica identity full;
alter publication supabase_realtime add table public.avisos_lidos;
