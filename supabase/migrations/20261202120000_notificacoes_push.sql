-- História 7.5: notificações do sistema (Web Push) no iPad e no PC (FR-55, AD-13, AD-12, AD-14).
-- Duas tabelas novas, só aditivas (nenhuma coluna, função ou política existente muda):
--
-- 1. `push_inscricoes`: a inscrição Web Push de cada aparelho do dono (iPad e PC convivem, uma linha
--    por aparelho). O navegador grava e apaga a do próprio aparelho com a sessão do dono (RLS por dono,
--    como as outras tabelas); o Cron diário lê todas com a chave de serviço (que ignora o RLS) e apaga a
--    que o serviço de push recusa com 404 ou 410. `endpoint` é único (um aparelho, uma inscrição: o
--    "Ativar notificações" de novo é um upsert) e é tratado como SEGREDO: quem o tem pode empurrar
--    avisos para o aparelho, então nunca vai para log nem para mensagem de erro. Fora do Realtime: nada
--    na tela depende de mudanças dela (o estado deste aparelho vem do `PushManager`).
--
-- 2. `lembretes_enviados`: o que o Cron já avisou, `(tipo, referencia, dia)` único por dono. O Cron
--    INSERE antes de enviar e só envia se a inserção deu certo, então o mesmo lembrete nunca sai duas
--    vezes (a chave de cada tipo é do núcleo, `chaveDeNotificacao` em `src/domain/lembretes.ts`). Só o
--    Cron mexe nela: RLS ligado, nenhuma política e nenhum privilégio para `anon` e `authenticated`; a
--    chave de serviço (`service_role`) ignora o RLS e é a única que lê e grava. Também fora do Realtime.
--
-- Nenhuma regra de lembrete mora aqui (quais lembretes existem e quando saem é do núcleo): o banco só
-- guarda a inscrição e o "já enviei".

-- ---------------------------------------------------------------- push_inscricoes

create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- A URL do serviço de push para este aparelho (SEGREDO: não vai para log).
  endpoint text not null,
  -- As duas chaves da inscrição (`PushSubscription.toJSON().keys.p256dh` e `.auth`), em base64url. A segunda
  -- não se chama `auth` para não se confundir com o esquema `auth` (`auth.uid()`) nas políticas.
  chave_p256dh text not null,
  chave_auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_inscricoes_endpoint_key unique (endpoint),
  constraint push_inscricoes_endpoint_check
    check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 2048),
  constraint push_inscricoes_chave_p256dh_check check (char_length(chave_p256dh) between 1 and 256),
  constraint push_inscricoes_chave_auth_check check (char_length(chave_auth) between 1 and 256)
);

comment on table public.push_inscricoes is
  'Inscrição Web Push de cada aparelho do dono (FR-55, 7.5). O endpoint é segredo (nunca em log). O Cron diário as lê e apaga a que o serviço de push recusa com 404 ou 410.';

-- O Cron lê as inscrições de um dono.
create index push_inscricoes_owner_id_idx on public.push_inscricoes (owner_id);

create trigger push_inscricoes_definir_updated_at
  before insert or update on public.push_inscricoes
  for each row execute function public.definir_updated_at();

alter table public.push_inscricoes enable row level security;

create policy "push_inscricoes_select_dono" on public.push_inscricoes
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "push_inscricoes_insert_dono" on public.push_inscricoes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "push_inscricoes_update_dono" on public.push_inscricoes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- "Desativar neste aparelho" apaga só a inscrição do aparelho.
create policy "push_inscricoes_delete_dono" on public.push_inscricoes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.push_inscricoes from anon;

-- ------------------------------------------------------------- lembretes_enviados

create table public.lembretes_enviados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  -- Os tipos de lembrete do núcleo (`TIPOS_DE_LEMBRETE`).
  tipo text not null,
  -- fechamento: o Mês da Fatura (`AAAA-MM`); atraso: o id do Bloco de cobrança.
  referencia text not null,
  -- fechamento: o dia do fechamento; atraso: o primeiro dia de atraso do Bloco (`desde`).
  dia date not null,
  created_at timestamptz not null default now(),
  constraint lembretes_enviados_tipo_check check (tipo in ('fechamento', 'atraso')),
  constraint lembretes_enviados_referencia_check check (char_length(referencia) between 1 and 64),
  -- O que impede o mesmo lembrete de sair duas vezes: o Cron insere ANTES de enviar.
  constraint lembretes_enviados_chave_key unique (owner_id, tipo, referencia, dia)
);

comment on table public.lembretes_enviados is
  'Lembretes que o Cron diário já avisou (FR-55, 7.5), únicos por (dono, tipo, referencia, dia). Só a chave de serviço lê e grava: o Cron insere antes de enviar e quem não conseguir inserir não envia.';

alter table public.lembretes_enviados enable row level security;

-- Sem política e sem privilégio: o navegador nunca acessa. `service_role` ignora o RLS.
revoke all on public.lembretes_enviados from anon, authenticated;
