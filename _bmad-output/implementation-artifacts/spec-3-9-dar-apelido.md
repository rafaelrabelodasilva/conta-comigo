---
title: 'História 3.9: Dar Apelido'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '77a15067313c8a10cc74723c478b8bafb16e35c3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael dá Apelido a um Lançamento (2.7), mas só naquela linha: "PAG*JOSEDASILVA" vira "Celular da mãe" em outubro e continua feio em novembro, nos previstos de dezembro em diante e em qualquer outro Lançamento do mesmo Nome. Sem o Apelido em massa, a grade, o Revisar e (Épico 4) a mensagem mentem sobre o que é a conta (FR-52, AD-6).

**Approach:** Ao dar, trocar ou remover o Apelido no painel, o núcleo (`domain/apelido.ts`) escolhe, entre os Lançamentos de mesmo `nome_normalizado`, os que mudariam. Se houver algum, o painel pergunta "Só este" / "Aplicar a todos" (`inline-question` da 3.5) com a contagem; "Aplicar a todos" grava tudo numa transação e o toast "Desfazer" devolve o Apelido de antes. O Nome nunca muda e o Apelido nunca casa nada.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** quem muda, o que grava e a contagem da pergunta saem de função pura em `src/domain/apelido.ts` (só imports relativos, sem float). A RPC e o repositório só gravam o que o núcleo calculou. Textos em `mensagens.ts`.
- **Chave (AD-6):** "mesmo Nome" é `nome_normalizado` (`normalizarNome`), nunca `chaveDeRegra`. O Apelido não entra em casamento de previstos, Série, Regra, Ajuste, herança nem agrupamento do Revisar; `nome` e `nome_normalizado` nunca são alterados.
- **Formato do Apelido:** o de hoje (`lerApelido`: recortado, 1 a 60 caracteres, em branco remove, restrição `lancamentos_apelido_check`).
- **Padrão da 3.5:** pergunta inline "Só este" / "Aplicar a todos" (nunca modal), a gravação do campo na linha aberta vale antes da pergunta, falha da propagação não desfaz a gravação do campo.
- **Gravação:** transação única (uma RPC), só as colunas que mudam; os Ajustes, as filhas de Divisão e as mães seguem as regras abaixo; `updated_at` do banco decide (AD-3).
- **Decisões do Rafael (11/11/2026, todas A, spec inteira mantida):** Q1 todos os Meses (mães e previstos não excluídos; filhas acompanham a mãe; Ajustes e excluídas fora); o repositório lê os candidatos por `nome_normalizado`, o núcleo decide e grava pelo `classificar_em_lote` com `apelido` na lista de colunas (migração `create or replace`). Q2 pergunta ao dar, trocar e remover quando alguma outra linha mudaria; "Aplicar a todos" iguala todas as outras (vazias e com outro Apelido; remover limpa todas) e o texto traz a contagem e quantas já têm outro Apelido. Q3 Apelido para a próxima Fatura fica fora (registrar em `deferred-work.md`; nunca em `regras`). Q4 "Aplicar a todos" grava mães e filhas na mesma transação; a filha não edita Apelido; o Ajuste mostra o da mãe. Q5 o toast "Desfazer" de 6 s devolve o Apelido de antes em todas as linhas que a gravação mudou (inclusive previstos e outros Meses). Q6 em branco remove; 60 caracteres; igual ao Nome (sem maiúsculas e acento) vira nulo; igual ao de outro Nome é permitido; busca e ordenação seguem por `nomeExibido`. Previstos preenchidos ficam sem `editado_em` (como a 3.5); linhas reais de outros Meses recebem `editado_em` (como o lote); `resumirReimportacao` passa a contar Apelido como "à mão".
- **Manter** tudo da 2.3 à 3.8: hero e troca de Mês, ordenação, Conferência e "verificar", filter-bar e busca por Nome ou Apelido, painel do Lançamento e Ajustes, Regras e Regras aprendidas, reimportação e a trava `fatura.reimportacao_com_casados`, Fila do Revisar e lote, Séries e previstos com selo e origem, casamento, herança, Divisão (cabeçalho, "↳", rodapé, "Desfazer divisão").

**Never:** guardar Apelido em `regras`; usar Apelido como chave; alterar o Nome; Apelido na mensagem do Épico 4 (só o gancho `nomeExibido`, que já existe); reimportar mantendo a classificação (3.12); histórico da planilha (3.10); `console.*`; `supabase.from()` em tela; regra de negócio em SQL; alterar ou apagar dado de produção sem Rafael confirmar.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Sem iguais | dar Apelido a um Nome com uma linha só | grava na linha; nenhuma pergunta | N/A |
| Dar | 12 outras linhas do Nome (nov/26 e previstos), sem Apelido | pergunta "Aplicar a 12 …?"; "Aplicar a todos" grava as 12 e mostra "Desfazer" | N/A |
| Só este | mesmo caso, "Só este" | só a linha aberta muda | N/A |
| Remover | outras com o mesmo Apelido | pergunta; "Aplicar a todos" limpa as que tinham | N/A |
| Já iguais | todas as outras já têm o mesmo Apelido | nenhuma pergunta | N/A |
| Falha | a RPC recusa | o Apelido da linha aberta continua gravado; toast de erro; nada mais muda | `salvar.falhou` |

</frozen-after-approval>

## Code Map

- `src/domain/lancamento.ts` -- `lerApelido`, `LIMITE_APELIDO`, `mudancaDoCampo`: reusar; ganha o "igual ao Nome vira nulo" se a 6-A valer.
- `src/domain/apelido.ts` (novo, + teste) -- `planejarApelidoEmMassa(antes, depois, candidatas)` (quem muda, contagem, itens da RPC, retrato), `perguntaDoApelido`.
- `src/domain/painel.ts` -- `nomeExibido`, `linhasDoMes`; `src/domain/divisao.ts` -- `ehMaeDividida`/`ehFilha`/`filhasPorMae` para as filhas acompanharem; `src/domain/ajustes.ts` -- Ajuste fora do Apelido.
- `src/domain/lote.ts` -- `COLUNAS_DO_LOTE`/`CorpoDoLote` ganham `apelido`; `planejarLote` não muda.
- `src/domain/importacao-fatura.ts` -- `resumirReimportacao`: `mexido` conta `apelido` ("à mão"); `src/domain/mensagens.ts` -- pergunta com contagem, toast "Apelido atualizado em N lançamentos".
- `src/data/lancamentos-repo.ts` -- `propagarApelido` (lê candidatos por `nome_normalizado`, planeja, grava pela RPC do lote sem esperar a memória) e `aplicarApelido`/`desfazerApelido`; outros Meses não entram na memória (`aplicarLote` já ignora).
- `src/features/painel/PainelLancamento.tsx` -- `salvar("apelido")` chama a propagação depois da gravação; `inline-question` (como a de previstos) e toast "Desfazer"; a filha e o Ajuste não mostram a pergunta.
- `GradeLancamentos.tsx`, `src/features/revisar/*`, `src/features/configuracoes/*` (Regras aprendidas) -- sem mudança de lógica (a chave do Revisar e das Regras segue o Nome).
- `supabase/migrations/20261118120000_apelido_em_massa.sql` -- `create or replace classificar_em_lote` com `apelido` na lista; `database.types.ts` não muda (assinatura igual).
- `test/integracao/apelido.test.ts` (CI) e pglite em scratchpad novo (todas as migrações em ordem).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/apelido.ts` (+ teste) -- planejador puro e matriz de bordas
- [x] `src/domain/lote.ts`, `importacao-fatura.ts`, `mensagens.ts` (+ testes) -- coluna, aviso da reimportação, textos
- [x] `supabase/migrations/20261118120000_apelido_em_massa.sql` -- coluna na RPC do lote
- [x] `src/data/lancamentos-repo.ts` (+ testes) -- propagar, aplicar, desfazer
- [x] `src/features/painel/PainelLancamento.tsx` (+ teste jsdom) -- pergunta inline, toast, filha e Ajuste
- [x] `test/integracao/apelido.test.ts` e pglite -- aceite
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- itens novos

**Acceptance Criteria:**
- Given o painel de um Lançamento cujo Nome tem outras linhas (inclusive previstos), when Rafael dá, troca ou remove o Apelido, then o app pergunta "Só este" / "Aplicar a todos" e, em "Aplicar a todos", todas as linhas do mesmo `nome_normalizado` ficam com o Apelido, sem mudar nenhum Nome.
- Given um Apelido, when a grade mostra a linha, then o Apelido aparece em negrito e o Nome em cinza, e o detalhe mostra o Nome.
- Given qualquer Apelido, when previstos, Regras ou Ajustes são casados, then o Apelido não participa (AD-6).

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). Decisões Q1-A a Q6-A aprovadas pelo Rafael antes de começar; spec inteira mantida (≈ 2.000 tokens).
- **Núcleo:** `src/domain/apelido.ts` (`planejarApelidoEmMassa`: quem muda, itens da RPC, retrato de antes, `mudam` e `comOutro`). `lancamento.ts`: `mudancaDoCampo` transforma Apelido igual ao Nome (sem maiúsculas e acento) em nulo (`LancamentoEditavel.nome` opcional). `lote.ts`: `apelido` em `COLUNAS_DO_LOTE`/`CorpoDoLote`. `importacao-fatura.ts`: `resumirReimportacao` conta Apelido como "à mão" (`COLUNAS_REIMPORTACAO` lê `apelido`). `mensagens.ts`: `perguntaApelidoEmMassa` e `rotuloApelidoAplicado`.
- **Migração `20261118120000_apelido_em_massa.sql`:** só `create or replace classificar_em_lote` com `apelido` na lista fechada; mesma assinatura, então `database.types.ts` não muda.
- **Repositório:** `planejarApelido` (lê por `nome_normalizado` todas as linhas não excluídas, sem filtro de Mês; recusa no teto de 1000) e `aplicarApelido` (a RPC do lote; é também o "Desfazer", com `plano.antes`).
- **Painel:** depois que o campo Apelido grava, `perguntarApelido` pede o plano; só mostra a `FaixaPergunta` se `mudam > 0`; "Aplicar a todos" grava e mostra o toast com "Desfazer". A linha aberta não entra no "Desfazer" (o campo dela já gravou antes da pergunta). Filha e Ajuste não perguntam.
- **Provado:** Vitest (1.9k testes, com os novos), `tsc`, `eslint`, `next build`; no pglite, com todas as migrações em ordem, `cenarios39.mjs` (24 verificações da RPC) e `e2e39.mts` (o planejador real em TypeScript contra o banco), mais `cenarios37.mjs`, `cenarios38.mjs` e `e2e38.mts` sem regressão. `test/integracao/apelido.test.ts` só roda no CI.


## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| O "Desfazer" não devolve o Apelido da linha aberta | low | O campo dela grava antes da pergunta (padrão da 3.5); o toast desfaz só o que a gravação em massa mudou. Rafael corrige a linha no próprio campo |
| Previstos preenchidos ficam sem `editado_em`: a reimportação simplificada os apaga e recria sem o Apelido | low | Regra 3-A da 3.5 e decisão Q2 desta história; registrado para a 3.12 |
| Leitura recusada no teto de 1000 linhas por Nome | false | Produção tem no máximo 13 linhas por Nome; recusar é melhor do que aplicar pela metade |
| Corrida: outra linha do Nome nasce entre a leitura e a gravação | low | Fica sem Apelido e Rafael aplica de novo; nada se perde |
| Pergunta some se o painel fecha antes de responder | false | Mesmo comportamento da pergunta dos previstos (3.5); o Apelido da linha já gravou |

## Design Notes

**Duas chaves.** O planejador compara só `normalizarNome(nome)`; `chaveDeRegra` não aparece. Quem precisa de "mesmo Nome" para outra coisa (Regras, Revisar) continua com a sua chave.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde
- pglite (scratchpad) -- todas as migrações em ordem + matriz do Apelido -- expected: sem falhas
