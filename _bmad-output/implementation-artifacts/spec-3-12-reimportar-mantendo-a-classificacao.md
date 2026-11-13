---
title: 'História 3.12: Reimportar mantendo a classificação'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: 'e069dda925a58e253edf4fc50057b964a0c37b92'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Importar de novo" (3.11 simplificada) apaga a Fatura do Mês e tudo o que Rafael fez nela (classificação, Divisão, Apelido, Observação, Status, previstos casados); a RPC chega a recusar quando há casados (`fatura.reimportacao_com_casados`). Séries (3.5) e Pagamentos (Épico 6) tornam isso inaceitável.

**Approach:** o núcleo casa cada linha da Fatura nova com a antiga (FR-51, AD-7.6) e decide o destino de cada antiga sem par; `importar_fatura`, no modo reimportação, só executa: atualiza as casadas no lugar (mesmo `id`), apaga, destaca ou devolve a previsto as sem par, e insere as novas, numa transação.

## Boundaries & Constraints

**Always:** regra de negócio só em `src/domain` (casamento, destino das sem par, motivo, Divisão, contagens do aviso); a RPC valida estrutura (cada antiga em exatamente um destino, ids da Fatura confirmada) e recusa com `fatura.mes_mudou` se o plano ficou velho. Mantém a trava `updated_at` do Mês e `fatura.mes_mudou`. Casada mantém `id`, Responsável, Tipo, Status, Observação, Apelido, Divisão e filhas (`filha_id`), `editado_em`, `serie_id`, `casado_em`, `origem_lancamento_id`. Sai da Fatura nova: Nome, data, Valor, `final_cartao`, `ordem_fatura`, `duvida_extracao`. Contas manuais e linhas `historico` do Mês não são tocadas. Exclusão física só aqui. Tudo em uma transação; Cancelar não grava nada. Toda mudança de schema é migração; `database.types.ts` à mão no formato do gerado.

**Never:** tabela `apelidos` (fica fora; história própria), Desfazer da reimportação, propagar Valor novo aos previstos seguintes, apagar linha de `series`, tratar Pagamento (Épico 6 só ganha o ponto de extensão `referenciadas`), regra de negócio em SQL, ler ou alterar produção sem confirmação.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mesma Fatura de novo | todas as linhas pareiam | ids, classificação, Divisão, Apelido, Status iguais; nada apagado; `casado_em` e Série mantidos | N/A |
| Parcela com Valor novo | pareia por (Nome, n, N), Valor diferente, já classificada | Valor da Fatura; `valor_mudou` com `antes_centavos`; Divisão refeita nos centavos novos, filhas mantêm id e Status | Divisão que zera parte: mãe sem Divisão, filhas excluídas em lógico, vai à fila |
| À vista: Valor corrigido | mesmo Nome, Valor diferente, sobra par | 2ª passada pareia na ordem; `valor_mudou` se classificada | N/A |
| Compra idêntica duas vezes | 2 antigas e 2 novas mesmo Nome e Valor | 1ª↔1ª, 2ª↔2ª pela `ordem_fatura` | N/A |
| Antiga sem par, sem trabalho à mão | só Regra ou nada | apagada, com os previstos `sistema` sem edição que ela criou | N/A |
| Antiga sem par, mexida à mão ou referenciada | `editado_em`, Apelido, Observação, Status≠padrão ou `referenciadas` | sai da Fatura (vira `manual`, sem `fatura_id`), `sumiu_na_reimportacao`, entra no Revisar | N/A |
| Antiga casada sem par | `casado_em` não nulo | volta a `sistema` (previsto), mantém `id`, Série e classificação; `nao_veio_na_fatura` | N/A |
| Nova sem par | nenhuma antiga serve | linha nova: Regras atuais, casamento com previsto do Mês, herança da n−1 do Mês anterior como está agora | N/A |
| Antiga excluída | `excluido_em` | apagada; a linha volta nova ("Os K excluídos voltam") | N/A |
| Plano velho | Mês mudou depois do aviso | RPC recusa, nada gravado | `fatura.mes_mudou`; "Tentar de novo" relê |

**Decisões aprovadas por Rafael (13/11/2026):** (1) casamento: parcelas por (Nome, n, N) com Valor igual primeiro; à vista por (Nome, Valor) e 2ª passada Nome igual com Valor diferente; compras idênticas pela ordem. (2) Linhas excluídas não pareiam e voltam. (3) Sem par e sem trabalho à mão: apagada; mexida à mão (`editado_em`, Apelido, Observação, Status≠padrão) ou referenciada: vira `manual` fora da Fatura com `sumiu_na_reimportacao`; casada sem par volta a `sistema`. (4) Previstos de casadas intactos; de sem par apagados só se `sistema`, sem edição e fora da fila "Não veio". (5) Classificação da casada vence; Regras só completam vazio; nova usa Regras e herança de agora. (6) Apelido para a próxima Fatura fora (história 3.13). (7) Pagamento só como conjunto `referenciadas`. (8) Histórico ignorado, aviso informa a contagem. (9) Aviso com os números do plano; botão destrutivo. (10) Sem Desfazer.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261119120000_importar_planilha.sql`, `20261117120000_dividir_lancamento.sql` -- última `importar_fatura` (7 args), `recriar_filhas`; nova migração derruba a de 7 e cria a de 8 (`dados_reimportacao`).
- `src/domain/previstos.ts` -- `casarPrevistos`, `aplicarCasamento` (modelo do casamento e da herança); `heranca.ts`, `divisao.ts` (`partesDaImportacao` com `filha_id`).
- `src/domain/importacao-fatura.ts` -- `resumirReimportacao` (substituído pelo plano), `LancamentoParaGravar`, `Importacao`.
- `src/domain/classificacao.ts`, `revisar.ts`, `mensagens.ts` -- motivos, variantes da fila, aviso e rótulos.
- `src/data/faturas-repo.ts` -- `lerReimportacao`, `importar`, `removidos`; `lancamentos-repo.ts` (excluir lógico, limpar motivo).
- `src/features/importar/ImportarFatura.tsx` -- passo 3, aviso, resumo; `src/features/revisar/*` -- variante nova.
- `test/integracao/casamento.test.ts`, `herdar.test.ts` -- modelo; pglite em `scratchpad/pg`.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/reimportacao.ts` (+ `.test.ts`) -- `casarReimportacao`, `aplicarReimportacao`, `planejarReimportacao` (destinos e contagens)
- [x] `src/domain/{classificacao,revisar,mensagens,importacao-fatura}.ts` -- motivo `sumiu_na_reimportacao`, variante, aviso e rótulos; remover a trava de casados
- [x] `supabase/migrations/20261120120000_reimportar_mantendo.sql` -- enum, RPC de 8 args, `database.types.ts`
- [x] `src/data/faturas-repo.ts` -- ler antigas completas, enviar o plano, aplicar `removidos` sem apagar a Fatura
- [x] `src/features/importar/ImportarFatura.tsx`, `src/features/revisar/*` -- aviso, resumo e variante
- [x] `test/integracao/reimportacao.test.ts` + cenários pglite -- matriz acima
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- fechar e abrir pendências

**Acceptance Criteria:**
- Given um Mês com Fatura classificada, when "Importar de novo" com a mesma Fatura, then nenhum `id` muda e nada da classificação se perde.
- Given o plano do aviso, when confirmado, then as contagens gravadas batem com as do aviso.
- Given duas importações do mesmo Mês ao mesmo tempo ou Mês mudado, then recusa sem gravar.

## Implementation Notes

- Núcleo: `src/domain/reimportacao.ts` (`casarReimportacao`, `planejarReimportacao`, `aplicarReimportacao`, `casarSobrasComPrevistos`, `temTrabalhoManual`). A antiga pareada entra no motor de `aplicarCasamento` como "previsto" (id dela), então a regra de classificação, "Valor mudou" e a Divisão com `filha_id` são as mesmas da 3.6; `PrevistoParaCasar.parcela_n/total` ficaram anuláveis (linha à vista).
- RPC `importar_fatura` de 8 argumentos (migração `20261120120000_reimportar_mantendo.sql`): a Fatura é atualizada no mesmo lugar (`removidos.fatura_id` nulo), os cartões são trocados, as posições das pareadas sobem 1.000.000 antes da troca (índice único), `sumiram` viram `manual` sem Fatura, `voltar_a_previsto` voltam a `sistema`. A trava `fatura.reimportacao_com_casados` saiu (a mensagem também).
- Tela: o plano é refeito sempre que o aviso é lido (`buscarAviso`), com os previstos de agora. `resumirReimportacao`, `avisoReimportarBloqueado` e `previstosAApagar` saíram.
- Verificação sem Docker: `cenarios312.mjs` e `e2e312.mts` (pglite, todas as migrações em ordem; o e2e usa o núcleo para montar o plano). O teste de integração só roda no CI.
- Revisar: variante "Sumiu na reimportação" reusa `excluir` e `manterPrevisto` do repositório; só os textos mudam.

## Spec Change Log

## Review Triage Log

Revisão feita por mim, na própria sessão, sobre o diff completo (sem os três revisores independentes do bmad-build: não havia subagentes liberados). Pontos checados e nenhum defeito verificado: filtro de `owner_id` em todo `update`/`delete` da RPC (e RLS); plano que não cobre as linhas vivas recusa antes de gravar; posições sobem 1.000.000 antes da troca (índice único); Ajuste pareado e Ajuste sem par; filhas da Divisão (id, Status, Valor); Série não ocupada duas vezes (`ocupadas`); `removidos.fatura_id` nulo na memória; plano refeito em `buscarAviso` com os previstos de agora. Pendências reais foram para o `deferred-work.md` (CI/Docker, iPad, Pagamento, Nome lido diferente, "Manter" re-sinalizado, Valor da casada que volta a previsto).

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde
- pglite com todas as migrações em ordem -- expected: cenários da matriz passam
