---
title: 'História 3.11 (antecipada, simplificada): Reimportar um Mês'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'a412223850a2113cc06dec9c4e33e82a21463823'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Importar a Fatura de um Mês que já tem Fatura é recusado (`fatura.mes_ja_importado`); Rafael não consegue refazer uma importação ruim (FR-51).

**Approach:** Versão simplificada, antes da 3.2: com um aviso destrutivo com os números reais e a confirmação, a RPC `importar_fatura` apaga numa transação a Fatura do Mês, os totais por cartão e todos os Lançamentos dela, e grava a nova já classificada pelo núcleo, como uma importação nova. Sem casar linhas novas com antigas (isso é da 3.11 completa, AD-7.6).

## Boundaries & Constraints

**Always:**
- Apaga (exclusão física, já permitida pelo AD-16 só na reimportação) a Fatura anterior, seus `fatura_cartoes` e todos os `lancamentos` com aquele `fatura_id`, inclusive Ajustes e excluídos; grava a nova e devolve também os ids apagados, que o repositório tira da memória (`remover`).
- Lançamentos sem `fatura_id` (manuais) não são tocados. `regras` não é tocada. A classificação da Fatura nova é a do fluxo normal (`classificarImportacao` com as Regras atuais).
- A RPC recebe o id da Fatura que Rafael confirmou substituir. Sem ele e o Mês com Fatura: `fatura.mes_ja_importado` (como hoje). Com ele e a Fatura do Mês já não é essa: `fatura.mes_mudou`. A trava `pg_advisory_xact_lock` e a checagem do `updated_at` continuam; o `updated_at` enviado é o lido junto com os números do aviso.
- Os números do aviso vêm do banco (linhas da Fatura do Mês), calculados por função pura do núcleo. Sem os números, não se oferece "Importar de novo".
- "Cancelar" não grava nada. Manter o que a 2.3–3.1 trouxeram (hero, troca de Mês, ordenação, faixa da Conferência, bolinha "verificar", filter-bar, painel, Ajustes, aprendizado das Regras).

**Decisões do Rafael (09/11/2026, todas as recomendadas):**
- **Aviso (1-A):** no próprio passo 3 da janela "Importar fatura", no lugar do alerta de "já importada": texto "Esta fatura já foi importada. Importar de novo apaga os N lançamentos de <mês> vindos da fatura (X já classificados ou marcados à mão) e importa tudo de novo." e botões "Cancelar" e "Importar de novo" (`variante="destrutivo"`); um toque grava. Sem `ConfirmarAcao` por cima.
- **X (2-A):** N = linhas não excluídas da Fatura do Mês (com Ajustes); X = dessas, as com Responsável, Tipo, Observação ou Status diferente do Status padrão.
- **Excluídos (3-A):** com K > 0 excluídos da Fatura, o aviso acrescenta "Os K excluídos voltam." ("O 1 excluído volta.").
- **Confirmação (4-A):** só o botão; nada a digitar.
- **Desvio (5-A):** registrado nesta spec; no `epics.md` a 3.11 ganha a nota "entregue simplificada (spec-3-11-reimportar-um-mes.md)" e os critérios de casamento (AD-7.6) passam para a nova Story 3.12 "Reimportar mantendo a classificação", depois da 3.6 e obrigatória antes de Séries (3.5) e Pagamentos (Épico 6) irem para produção; no `sprint-status.yaml` entra `3-12-reimportar-mantendo-a-classificação: backlog` (a 3-11 vira done no PR separado).
- **Depois de gravar:** toast "Fatura de <mês> importada de novo · N lançamentos" (sem "Desfazer"); o Painel abre o Mês como numa importação nova. Spec inteira e subagentes mantidos.

**Never:** casar linhas antigas com novas, manter `id`/classificação/Status/Observação das antigas, `sumiu_na_reimportacao`, Séries/previstos (3.5–3.6); apagar Regras; reimportar dados de produção pelo agente.

## I/O & Edge-Case Matrix

| Cenário | Estado | Esperado |
|---|---|---|
| Aviso | nov/26 com 52 linhas da Fatura, 30 classificadas ou marcadas, 2 excluídas | passo 3 mostra o aviso com 52 e 30 e "Os 2 excluídos voltam.", "Importar de novo" e "Cancelar" |
| Cancelar | idem | nada muda no banco |
| Confirmar | idem, Regras de out/26 | Fatura, cartões e 52 linhas novas; Regras sem dúvida aplicadas, Ajustes religados; manuais de nov/26 iguais |
| Outro aparelho reimportou antes | id confirmado ≠ Fatura do Mês | `fatura.mes_mudou`, nada gravado |
| Mês mudou depois do aviso | `updated_at` diferente | `fatura.mes_mudou`, nada gravado |
| Mês sem Fatura | — | importação normal, sem aviso |
| Duas importações novas ao mesmo tempo | mesmo Mês | uma grava, a outra `fatura.mes_ja_importado` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261111120000_reimportar.sql` (novo) -- `drop function public.importar_fatura(jsonb,jsonb,jsonb,timestamptz)` e recria com `substituir_fatura_id uuid default null` (base: `20261110120000_regras.sql:257-379`); depois da trava, lê a Fatura do Mês, aplica as recusas, apaga linhas → Fatura (cartões caem por `on delete cascade`; `ajuste_de_id` é `set null` e as linhas saem juntas), insere como hoje; devolve `removidos: {fatura_id, cartoes, lancamentos}`. Revoke/grant da assinatura nova. Mantém o `exception when unique_violation`.
- `src/data/database.types.ts:482` -- `substituir_fatura_id?: string` nos Args, à mão igual ao gerado.
- `src/domain/importacao-fatura.ts` -- `resumirReimportacao(linhas, statusPadraoId)` → `{quantidade, mexidos, excluidos}` (puro).
- `src/domain/mensagens.ts:92` -- `avisoReimportar(mes, resumo)`, `T.importar_de_novo`, `rotuloReimportado(mes, n)` (toast). Formatadores do núcleo para o Mês.
- `src/data/faturas-repo.ts` -- `lerReimportacao(mes)` (Fatura do Mês + linhas com `fatura_id` + `updated_at` máximo do Mês) e `importar(importacao, substituir?: {faturaId, atualizadoEm})`; com `removidos`, `remover` nos três gerenciadores antes do `aplicarLote`. Hoje `lerUltimaAlteracao` (linha 96) lê na hora do clique; na reimportação vale o lido com o aviso.
- `src/features/importar/ImportarFatura.tsx:186-200,436-491` -- na etapa "classificando", se o Mês tem Fatura (memória ou erro `mes_ja_importado`), lê o resumo junto com as Regras; o estado `conferir` ganha `reimportar`; falha ao ler o resumo mostra o erro com "Tentar de novo" que relê só o resumo (sem chamar o Gemini de novo). Depois de gravar, `toast.mostrar(rotuloReimportado)` sem "Desfazer".
- `src/ui/Botao.tsx` `variante="destrutivo"` -- reusar; `ConfirmarAcao` não é usado (decisão 1-A).
- Testes: `importacao-fatura.test.ts`, `mensagens.test.ts`, `faturas-repo.test.ts`, `ImportarFatura.test.tsx` (aviso, cancelar, confirmar, falha do resumo, `mes_mudou`); integração `test/integracao/faturas.test.ts:179` (troca a recusa pela reimportação; manual intocado; Regras intactas; Ajuste religado; `mes_mudou` por id; duas importações em paralelo; nome da restrição `faturas_owner_id_mes_key` no erro de um insert direto repetido).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/importacao-fatura.ts`, `mensagens.ts` + testes -- resumo e textos
- [x] `supabase/migrations/20261111120000_reimportar.sql`, `database.types.ts`, `test/integracao/faturas.test.ts` -- RPC e a pendência do `unique_violation` (2.3)
- [x] `src/data/faturas-repo.ts` + teste -- resumo, substituir, remover da memória
- [x] `src/features/importar/ImportarFatura.tsx` + jsdom -- aviso, confirmar, toast
- [x] `deferred-work.md` -- fechar a pendência do `unique_violation`; `epics.md` (nota na 3.11 e Story 3.12) e `sprint-status.yaml` (`3-12` backlog), decisão 5-A

**Acceptance Criteria:**
- Given o deploy, when Rafael reimporta nov/26 com o PDF de novembro, then hero e Conferência batem como na primeira importação, as linhas com Regra sem dúvida voltam classificadas, os Ajustes voltam ligados à mãe e os manuais de nov/26 ficam.
- Given out/26 e nov/26 em produção, when abre os dois Meses, then tudo fica como na 3.1.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | verificação + blind | O ramo `unique_violation` da RPC continua sem teste; a pendência foi apagada | low | a trava serializa; os testes provam o nome da restrição e o resultado do paralelo, não a tradução | defer (pendência reescrita) |
| 2 | verificação + blind | Fatura que chega pelo Realtime no passo 3 sem teste | medium | nenhum teste muda `falso.faturas` em `conferir`; tirar o `faturas.some` de `mesSemAviso` não quebra nada | patch |
| 3 | verificação | Extração incompleta junto do aviso sem teste | medium | tirar o bloco `aviso pronto && incompleta` não quebra nada | patch |
| 4 | verificação | `useToast` sem provider quebra quem monta a janela | false | `Painel.test.tsx` e o app montam com `ToastProvider`; a suíte passa | rejeitado |
| 5 | edge + blind | X conta tudo como mexido se `configuracoes` ainda carrega (Status padrão nulo) | medium | `statusPadraoId` vem da memória sem esperar | patch |
| 6 | edge + blind | Status padrão trocado depois da importação infla X | low | raro; a correção pede guardar o Status aplicado | rejeitado |
| 7 | edge + blind | Banco sem Fatura (`sem_fatura`) e memória com: só "Cancelar" ou a recusa repete | low | o banco deve ganhar; correção direta em `jaImportado` | patch |
| 8 | edge | "apaga os 0 lançamentos" quando todos estão excluídos | low | caso raro; pede ramo de texto novo | rejeitado |
| 9 | edge + blind | "à mão" conta também o que a Regra classificou | false | decisão 2-A do Rafael, com esse limite explicado | rejeitado |
| 10 | blind | Linhas contadas por `mes` e apagadas por `fatura_id` divergem se a linha mudar de Mês | false | AD-9: o Mês é fixado na criação e nunca muda | rejeitado |
| 11 | blind | `removidos` malformado vira falha depois do commit | false | a RPC sempre devolve a forma certa; só um bug no SQL chegaria lá, e o teste o pegaria | rejeitado |
| 12 | blind | Nada no código impede a exclusão simples depois de Séries/Pagamentos | low | FK nova sem cascata faz a RPC falhar com erro genérico (nada apagado); a nota está no epics | defer |
| 13 | blind | `database.types.ts` à mão | false | prática do projeto; o CI compara com o gerado | rejeitado |
| 14 | blind | Botão "Importar de novo" depois de erro genérico; dois `role="alert"` | low | cosmético; mesmo padrão do passo 3 atual | rejeitado |
| 15 | blind | "Carregando…" vem de `TEXTOS_PAINEL` | low | correção direta em `TEXTOS_IMPORTAR` | patch |
| 16 | blind | Status da spec ≠ sprint-status; verificação sem integração local | false | `in-review` é da spec; não há Docker no Mac, a integração roda no CI | rejeitado |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- tudo verde (integração só no CI)
