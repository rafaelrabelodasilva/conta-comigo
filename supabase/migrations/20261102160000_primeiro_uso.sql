-- História 1.8: marca de Primeiro uso concluído ou pulado em `configuracoes`.
-- Nula enquanto o Primeiro uso não terminou; a regra de quando ele abre
-- sozinho fica no núcleo (src/domain/primeiro-uso.ts). Vale em todos os
-- aparelhos, por isso fica no banco e não no navegador.

alter table public.configuracoes
  -- Quando o Primeiro uso foi concluído ou pulado até o fim (nulo = ainda não).
  add column primeiro_uso_em timestamptz;

comment on table public.configuracoes is
  'Configurações do dono (uma linha por dono): Status padrão das linhas novas, Aparência, limite do Ajuste, tolerância de atraso e quando o Primeiro uso terminou.';
