---
title: 'História 2.2: Formatos de dinheiro, data e Mês'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '64ab498d59334efb1202b10da3f5bfba4c6d7096'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Valores e datas precisam sair sempre no mesmo formato em todas as telas (NFR4, AD-2). Hoje os formatadores estão espalhados (`dinheiro.ts`, `ciclo.ts`), faltam o arredondamento único, a divisão em partes, a hora e o Mês por extenso, e nada impede que uma tela formate por conta própria.

**Approach:** O núcleo passa a ter dois módulos de formato: `dinheiro.ts` (`formatarDinheiro`, `arredondar`, `dividirEmPartes`) e `datas.ts` (`formatarData`, `formatarHora`, `formatarMes`, `formatarMesExtenso`, `hojeEmSaoPaulo`). O lint recusa `Intl.NumberFormat`/`Intl.DateTimeFormat`, `toLocale*String` e `toFixed` em qualquer outro arquivo de `src`.

## Boundaries & Constraints

**Always:**
- `formatarDinheiro(centavos)`: "R$ 1.140,74", "R$ 0,00", "- R$ 0,08", com espaço inseparável (`ESPACO`), montado à mão. `formatarReais` é renomeado para `formatarDinheiro`, e os usos são atualizados.
- `arredondar(numerador, denominador = 1)` é a **única** função de arredondamento do núcleo: meio para longe do zero (0,5 → 1; -0,5 → -1; 1/2 → 1; -1/2 → -1), exata com inteiros (sem `float` intermediário para frações).
- `dividirEmPartes(valorCentavos, fracoes)`: `Fracao = { numerador, denominador }` (inteiros, denominador > 0). Cada parte, menos a última, é `arredondar(valor × n, d)`; a última é `valor − soma das outras`. Devolve `Resultado<number[]>`: lista vazia, fração inválida ou soma ≠ 1 → `{ ok: false, erro: { codigo: "divisao.fracoes_invalidas" } }`. Exemplo: 46600 em 2/3 + 1/3 = [31067, 15533].
- `datas.ts`: `formatarData("2026-11-06")` → "06/11/26"; `formatarHora(instanteISO)` → "21:14" em America/Sao_Paulo; `formatarMes("2026-10")` → "Out/26"; `formatarMesExtenso("2026-10")` → "outubro/26"; `hojeEmSaoPaulo(agora)` (movido de `ciclo.ts`). `mes` continua `AAAA-MM` (`ehMes`). O fuso usa `Intl.DateTimeFormat` só dentro de `datas.ts`.
- `ciclo.ts` importa de `datas.ts` (sem reexportar); `SecaoCiclo.tsx` passa a importar de `datas.ts`.
- Lint (`eslint.config.mjs`, regra `no-restricted-properties`, sem tocar no `no-restricted-syntax` do núcleo): em `src/**`, menos `src/domain/dinheiro.ts` e `src/domain/datas.ts`, recusa `Intl.NumberFormat`, `Intl.DateTimeFormat`, `.toLocaleString`, `.toLocaleDateString`, `.toLocaleTimeString` e `.toFixed`. A mensagem aponta para os formatadores.

**Never:** nada de schema, tela nova nem mudança visual. Não mudar a saída atual de `formatarMes`/`formatarData`. Não criar uma segunda função de arredondamento (o `Math.round` de `formatarSegundos` e de `marca.tsx` não é dinheiro e fica).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dinheiro | 114074 / 0 / -8 | "R$ 1.140,74" / "R$ 0,00" / "- R$ 0,08" (NBSP) | não inteiro → lança, como hoje |
| Arredondar | 0,5 / -0,5 / (1,2) / (-1,2) / (2,3) | 1 / -1 / 1 / -1 / 1 | denominador ≤ 0 → lança |
| Monjaro | 46600, [2/3, 1/3] | [31067, 15533] | N/A |
| Crédito | -100, [1/3, 1/3, 1/3] | [-33, -33, -34], soma -100 | N/A |
| Frações ruins | soma 1/2, [] ou denominador 0 | N/A | `divisao.fracoes_invalidas` |
| Hora | "2026-11-07T00:14:00Z" | "21:14" | N/A |
| Mês | "2026-10" | "Out/26" e "outubro/26" | N/A |
| Lint | `n.toFixed(2)` ou `new Intl.NumberFormat()` em `src/features/x.tsx` | erro de lint | permitido em `dinheiro.ts`/`datas.ts` |

</frozen-after-approval>

## Code Map

- `src/domain/dinheiro.ts` (+ teste) -- `formatarReais`, `ESPACO`, `lerReais`, `paraCentavos`; renomear e acrescentar `arredondar`, `Fracao`, `dividirEmPartes`.
- `src/domain/ciclo.ts` (+ teste) -- `formatarMes`, `formatarData`, `hojeEmSaoPaulo`, `NOMES_MES`, `dois()`; mover os formatadores para `datas.ts`.
- `src/domain/mensagens.ts` -- acrescentar `divisao.fracoes_invalidas`.
- Usos de `formatarReais`: `src/domain/prova-fatura.ts`, `src/features/prova-fatura/ProvaFatura.tsx`, `src/features/configuracoes/SecaoConferencia.tsx` (e testes).
- Usos dos formatadores de data: `src/features/configuracoes/SecaoCiclo.tsx`, `src/domain/ciclo.test.ts`.
- `eslint.config.mjs` -- o bloco do núcleo usa `no-restricted-imports` e `no-restricted-syntax`; a regra nova é `no-restricted-properties` num bloco próprio.
- `eslint-nucleo.test.mts` -- modelo de teste do lint (`ESLint.lintText`).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/dinheiro.ts` + `dinheiro.test.ts` -- `formatarDinheiro`, `arredondar`, `dividirEmPartes`, como na matriz.
- [x] `src/domain/datas.ts` + `datas.test.ts` -- os formatadores de data e `hojeEmSaoPaulo`; `ciclo.ts`/`ciclo.test.ts` usam `datas.ts`.
- [x] `src/domain/prova-fatura.ts`, `src/features/prova-fatura/ProvaFatura.tsx`, `src/features/configuracoes/SecaoConferencia.tsx`, `SecaoCiclo.tsx` e testes -- novos nomes e imports.
- [x] `src/domain/mensagens.ts` -- `divisao.fracoes_invalidas`: "As frações da divisão precisam somar 100%." (texto ajustado na revisão, #13)
- [x] `eslint.config.mjs` + `eslint-formatos.test.mts` -- a regra e o teste: recusa em `src/features/x.tsx` e `src/domain/x.ts`, aceita em `dinheiro.ts` e `datas.ts`.

**Acceptance Criteria:**
- Given o repositório, when `npm run lint` roda, then nenhum arquivo de `src` fora de `dinheiro.ts`/`datas.ts` usa `Intl.*Format`, `toLocale*String` ou `toFixed`.
- Given `src/domain`, when se procura arredondamento de dinheiro, then só existe `arredondar`.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind, edge | `dividirEmPartes` pode dar última parte negativa (2 em 4 quartos → [1,1,1,-1]) | low | real, mas é exatamente a regra do AD-2 (a última recebe o resto) e só acontece com valores de poucos centavos em muitas partes | rejeitado |
| 2 | blind, edge | Fração zero no fim recebe o resto ([1/2,1/2,0] em 3 → [2,2,-1]) | low | `fracaoValida` aceita numerador 0; uma parte de 0% não faz sentido numa Divisão | patch |
| 3 | blind, edge | Ramo de ponto flutuante de `arredondar` pode dar Infinity e não é exato | low | sem guarda para quociente infinito; o comentário diz "exata" sem ressalva | patch |
| 4 | blind, edge | `formatarData` não valida a entrada ("2026-11" → "/11/26") | low | `slice` cego; `formatarMes` lança | patch |
| 5 | blind, edge | `formatarHora` aceita instante sem fuso e depende do fuso do servidor | medium | `new Date("…T00:14:00")` usa o fuso local do runtime | patch |
| 6 | edge | `formatToParts` sem alguma parte | false | o Intl sempre devolve ano, mês, dia, hora e minuto com essas opções para datas válidas | rejeitado |
| 7 | blind, edge, verif | Lint não pega `globalThis.Intl`, `toPrecision`, `toExponential` | low | `no-restricted-properties` só casa `Intl` puro | patch |
| 8 | edge | Lint não cobre arquivos fora de `src` | false | a intenção limita a regra a `src` | rejeitado |
| 9 | blind, edge | `Math.round` não é proibido pelo lint | low | a spec mantém `Math.round` fora de dinheiro (`formatarSegundos`, `marca.tsx`) | rejeitado |
| 10 | blind | Parcela "02/12" montada na tela `ProvaFatura.tsx` | low | não é dinheiro nem data; a página some na 2.3 | rejeitado |
| 11 | blind | `lerMes`, `partesMes` e `dois` exportados sem teste direto | low | sem asserções diretas | patch |
| 12 | blind | `hojeEmSaoPaulo` agora lança com instante inválido, sem teste | low | antes devolvia "--" | patch |
| 13 | blind | Mensagem `divisao.fracoes_invalidas` descreve outra coisa | low | o erro é das frações, não das partes | patch |
| 14 | blind | Contrato misto em `dividirEmPartes` (lança com valor não inteiro, `Resultado` com frações) | false | igual a `formatarDinheiro`: entrada não inteira é erro de programação; fração inválida é regra | rejeitado |
