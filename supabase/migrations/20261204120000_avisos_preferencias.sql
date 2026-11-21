-- História 8.3: interruptor dos avisos da Conferência e do Revisar na Central de Avisos (FR-55).
-- Duas colunas booleanas em `configuracoes` (uma linha por dono), no molde da 7.4: o aviso da
-- diferença da Conferência de uma Fatura e o aviso da fila do Revisar. Padrão ligado, então a
-- linha que já existe e a linha nova nascem com os dois ligados (como a Central da 8.2 já os
-- mostra). Só aditiva: nenhuma restrição nova (booleano `not null` já basta), nenhuma política
-- nova (o RLS da tabela é por dono e vale para as colunas novas) e nenhuma mudança no Realtime
-- (a tabela já está na publicação com replica identity full, então outro aparelho vê a mudança
-- sozinho). Quais avisos existem e quando aparecem é do núcleo (`src/domain/avisos-preferencias.ts`);
-- o banco só guarda o liga/desliga. Estes dois NÃO são lembretes: o Cron diário (notificação do
-- sistema) não lê estas colunas, e `lembretes_enviados` segue aceitando só `fechamento` e `atraso`.

alter table public.configuracoes
  -- "Fatura de novembro/26 com diferença. A soma dos lançamentos ficou R$ 720,00 abaixo do total da fatura".
  add column aviso_conferencia boolean not null default true,
  -- "17 lançamentos para revisar".
  add column aviso_revisar boolean not null default true;

comment on column public.configuracoes.aviso_conferencia is
  'Aviso da diferença da Conferência de uma Fatura na Central de Avisos ligado (FR-55). Padrão ligado.';

comment on column public.configuracoes.aviso_revisar is
  'Aviso da fila do Revisar na Central de Avisos ligado (FR-55). Padrão ligado.';

comment on table public.configuracoes is
  'Configurações do dono (uma linha por dono): Status padrão das linhas novas, Aparência, limite do Ajuste, tolerância de atraso, quando o Primeiro uso terminou, o modelo da mensagem, os lembretes ligados e os avisos da Conferência e do Revisar ligados.';
