-- História 3.2: Fila do Revisar (FR-13, AD-14).
--
-- - `lancamentos.revisado_em`: o momento (relógio do aparelho, como
--   `editado_em`) em que a linha saiu da fila do Revisar; volta a nulo quando
--   a linha volta à fila. Nenhuma tela lê o campo na 3.2 (é para a 3.3, a 3.6
--   e a 3.11). Só o repositório de Lançamentos o grava.
-- - Linhas antigas (decisão do Rafael, 10/11/2026, 2-A): as linhas de
--   out/26 e nov/26 da Fatura, sem Ajuste e não excluídas, sem Responsável ou
--   sem Tipo e com `revisao_motivo` nulo (importadas antes da 3.1) entram na
--   fila como `sem_classificacao`. A migração só preenche a coluna: nenhuma
--   classificação muda.

alter table public.lancamentos add column revisado_em timestamptz;

comment on column public.lancamentos.revisado_em is
  'Quando a linha saiu da fila do Revisar (relógio do aparelho). Nulo = nunca revisada ou de volta à fila.';

update public.lancamentos
set revisao_motivo = 'sem_classificacao'
where mes in ('2026-10', '2026-11')
  and fatura_id is not null
  and ajuste_de_id is null
  and excluido_em is null
  and revisao_motivo is null
  and (responsavel_id is null or tipo_id is null);
