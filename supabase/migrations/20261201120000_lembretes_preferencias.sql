-- História 7.4: preferência de cada tipo de lembrete dentro do app (FR-55).
-- Duas colunas booleanas em `configuracoes` (uma linha por dono): o lembrete do dia do
-- fechamento da fatura e o do Bloco de cobrança com itens atrasados. Padrão ligado, então a
-- linha que já existe e a linha nova nascem com os dois ligados. Só aditiva: nenhuma
-- restrição nova (booleano `not null` já basta), nenhuma política nova (o RLS da tabela é por
-- dono e vale para as colunas novas) e nenhuma mudança no Realtime (a tabela já está na
-- publicação com replica identity full, então outro aparelho vê a mudança sozinho). Quais
-- lembretes existem e quando aparecem é do núcleo (`src/domain/lembretes.ts`); o banco só
-- guarda o liga/desliga. A História 7.5 (notificação do sistema) lê as mesmas colunas.

alter table public.configuracoes
  -- "A fatura de novembro fechou. Importe o PDF quando chegar".
  add column lembrete_fechamento boolean not null default true,
  -- "O Lucas tem R$ 115,16 em atraso desde 17/11/26".
  add column lembrete_atraso boolean not null default true;

comment on column public.configuracoes.lembrete_fechamento is
  'Lembrete do dia do fechamento da fatura ligado (FR-55). Padrão ligado.';

comment on column public.configuracoes.lembrete_atraso is
  'Lembrete de Bloco de cobrança com itens atrasados ligado (FR-55). Padrão ligado.';

comment on table public.configuracoes is
  'Configurações do dono (uma linha por dono): Status padrão das linhas novas, Aparência, limite do Ajuste, tolerância de atraso, quando o Primeiro uso terminou, o modelo da mensagem e os lembretes ligados.';
