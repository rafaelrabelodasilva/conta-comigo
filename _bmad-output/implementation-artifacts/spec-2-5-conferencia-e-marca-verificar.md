---
title: 'História 2.5: Conferência e marca "verificar"'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
baseline_commit: '6472b0dda93bb431dcee54263a648ef6c1003705'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Painel da 2.4 mostra a conta do "Total a pagar", mas não diz se a soma dos Lançamentos gravados bate com as despesas e os créditos lidos da Fatura, nem em qual cartão está a diferença (FR-6). Sem isso, um erro de leitura só aparece conferindo linha a linha.

**Approach:** O núcleo ganha `conferir(fatura, cartoes, lancamentos)` (geral e por cartão, só os Lançamentos não excluídos com aquele `fatura_id`) e `precisaVerificar(lancamento, conferencia)`. O Painel mostra o selo "✓ Conferido" / "⚠ Diferença de R$ X" no `invoice-hero`, a faixa âmbar com "Ver lançamentos" e "Dispensar", a bolinha "verificar" na grade e o filtro "Verificar". Tudo derivado; só "Dispensar" grava (`alerta_dispensado_em`, coluna que já existe).

## Boundaries & Constraints

**Always:**
- Conferência: soma das despesas (valor ≥ 0) × `total_despesas_centavos`; soma dos créditos (valor absoluto dos negativos) × `total_creditos_centavos`; por cartão, as despesas de cada `final_cartao` × o `total_centavos` de `fatura_cartoes` (o "VALOR TOTAL" do cartão é só despesas). Um final que só existe nos Lançamentos conta como lido R$ 0,00. Saldo anterior e pagamentos não entram. Reaproveitar a regra de `conferirImportacao`/`resumirExtracao`, sem duplicá-la.
- "Conferido" = despesas, créditos e todos os cartões com diferença zero.
- Selo no hero: "✓ Conferido" em `text-accent`, ou "⚠ Diferença de R$ X" (X = |diferença das despesas|, senão |diferença dos créditos|, senão a maior |diferença de cartão|). Tocar no selo de diferença liga o filtro "Verificar". O selo fica na linha da quantidade ("✓ Conferido · 49 lançamentos"); a conta "Lançamentos + saldo anterior − pagamentos = total" e o "✓ Bate com o total a pagar" da 2.3/2.4 continuam iguais, logo abaixo, em tamanho menor.
- Faixa âmbar (`alert-warning-*`) acima da grade, sem bloquear nada: "A soma dos lançamentos ficou R$ X abaixo|acima do total da fatura." para despesas; "A soma dos créditos ficou R$ X abaixo|acima do total de créditos da fatura." para créditos; e "A diferença está no cartão final 8673." / "…nos cartões finais 8673 e 9277." quando há cartão com diferença. Botões "Ver lançamentos" (liga o filtro "Verificar") e "Dispensar". Fica até bater ou ser dispensada.
- `precisaVerificar`: o Lançamento é da Fatura conferida e está num cartão com diferença; se só os créditos diferem (nenhum cartão com diferença), os créditos da Fatura. Nunca gravado; some sozinho quando bate. `duvida_extracao` sozinho não marca.
- Bolinha de 8 px em `verify` antes do Nome, com texto acessível "verificar este lançamento".
- VoiceOver (decisão do Rafael, 08/11/2026: ele nunca usou o VoiceOver, a pendência da 2.4 segue aberta): o `aria-label` do `<tr>` continua e termina com "verificar este lançamento" nas linhas marcadas; além dele, a célula do Nome leva um resumo oculto (`sr-only`) com a mesma frase da linha, para funcionar se o VoiceOver ler célula a célula. O texto visível do Nome fica `aria-hidden` para não ser lido duas vezes. A pendência fecha só na conferência manual.
- "Dispensar" (decisão do Rafael, 08/11/2026): esconde a faixa daquela Fatura; o selo e as bolinhas continuam. Aparece o `toast` "Alerta dispensado · Desfazer" de 6 s; "Desfazer" grava `alerta_dispensado_em = null`.
- Filtro "Verificar": pílula liga/desliga acima da grade (`aria-pressed`), sempre visível com Fatura. Ligado, a grade mostra só as linhas marcadas; na ordem padrão, as de `duvida_extracao` primeiro e depois a ordem da fatura; com coluna ordenada, vale a coluna. Combina com o filtro de Responsável por E. Vazio: "Nenhum lançamento para verificar". O rodapé "Total dos lançamentos" soma o que está na grade. Trocar de Mês mantém o filtro.
- "Dispensar" grava `alerta_dispensado_em = now()` pelo repositório de Faturas (só essa coluna, otimista, como os outros repos); sem conexão, mensagem de `mensagens.ts`. O Painel lê `fatura_cartoes` pelo gerenciador de Realtime.
- Regras no núcleo (AD-1), textos em `mensagens.ts`, valores pelos formatadores da 2.2, só tokens do DESIGN.md. Testes jsdom do hero, da faixa, da pílula e da grade.

**Never:** Migração (a coluna já existe). Apagar, reimportar ou alterar Faturas ou Lançamentos em produção. A barra de filtros completa e a busca (2.6), edição e Conferência ao vivo no painel do Lançamento (2.7), Ajustes (2.8). Gravar "verificar" ou tratá-lo como Status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Outubro real | 49 Lançamentos, cartões 3967/5061/8175/8673/9277 | despesas R$ 8.327,39, créditos R$ 639,62, "✓ Conferido"; sem faixa, sem bolinha | N/A |
| Novembro real | 46 Lançamentos | R$ 7.394,54 e R$ 43,22, "✓ Conferido" | N/A |
| Valor lido errado | BELLA PIETRA R$ 80,00 em vez de R$ 800,00 no 8673 | "⚠ Diferença de R$ 720,00"; faixa "…R$ 720,00 abaixo… cartão final 8673"; bolinha nas linhas do 8673, dúvidas primeiro | N/A |
| Cartão trocado | linha lida no 9277 em vez do 8673 | despesas batem; faixa "…nos cartões finais 8673 e 9277"; bolinha nos dois | N/A |
| Só créditos | crédito faltando | "A soma dos créditos ficou R$ X abaixo…"; bolinha nos créditos | N/A |
| Final desconhecido | Lançamento com final sem `fatura_cartoes` | aquele final com lido R$ 0,00 → diferença | N/A |
| Excluído | linha com `excluido_em` | fora da conta | N/A |
| Dispensada | `alerta_dispensado_em` preenchido | sem faixa; selo e bolinhas continuam | N/A |
| Dispensar offline | sem conexão | nada gravado, faixa fica | mensagem de `conexao.gravar_sem_conexao` |
| Sem Fatura | Mês sem Fatura | sem selo, faixa nem pílula | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/importacao-fatura.ts` -- `conferirImportacao`, `ConferenciaImportacao`, `primeiraDiferenca`; `src/domain/extracao-fatura.ts:253` `resumirExtracao` (soma por cartão). `conferir` nova num arquivo do núcleo (`conferencia.ts`) a partir das linhas gravadas, reaproveitando a soma; a importação continua igual.
- `src/domain/painel.ts` -- `filtrarPorResponsavel`, `ordenarLancamentos`, `rotuloLinhaAcessivel` (l. 199), `LancamentoGrade` (ganha `final_cartao`, `fatura_id`, `duvida_extracao`).
- `src/domain/mensagens.ts` -- `rotuloConferencia` (l. 180), `rotuloConferenciaTotal` (l. 160, não mudar), `TEXTOS_PAINEL`; textos novos da faixa, pílula, bolinha e vazio.
- `src/features/painel/FaturaDoMes.tsx` -- hero; selo na linha de `rotuloLancamentos`, sem mexer na conta.
- `src/features/painel/GradeLancamentos.tsx` -- bolinha antes do Nome (célula fixa), nome acessível.
- `src/features/painel/Painel.tsx` -- `useLinhas("fatura_cartoes")` (entra em `TABELAS`), filtro Verificar, faixa, ligação do selo.
- `src/data/faturas-repo.ts` -- `dispensarAlerta(faturaId)`; modelo de update otimista em `src/data/responsaveis-repo.ts` (`gravarComOtimismo`, `colunasAlteradas`), `gravacao.ts`.
- `src/ui/Toast.tsx` (`useToast`), `Botao.tsx`; tokens `verify`, `alert-warning-bg/border` já em `src/app/globals.css`.
- UX: DESIGN.md l. 423, 443; EXPERIENCE.md l. 119, 221–222, 251; mockup `mockups/painel.html` (estado "Diferença").
- Produção (lido em 08/11/26): outubro e novembro batem em tudo, nenhum `duvida_extracao`, nenhum alerta dispensado.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/conferencia.ts` + teste -- `conferir`, `precisaVerificar`, `linhasParaVerificar` (ordem com dúvidas primeiro), texto da diferença por partes; fixtures de outubro (aceite R$ 8.327,39 / R$ 639,62) e a matriz.
- [x] `src/domain/painel.ts` + teste -- campos novos e nome acessível com "verificar".
- [x] `src/domain/mensagens.ts` + teste -- selo, faixa, pílula, vazio, bolinha, "Alerta dispensado".
- [x] `src/data/faturas-repo.ts` + teste -- `dispensarAlerta`.
- [x] `src/features/painel/FaturaDoMes.tsx`, `FaixaConferencia.tsx` (novo), `GradeLancamentos.tsx`, `Painel.tsx` + testes jsdom -- selo, faixa, bolinha, filtro.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- atualizar a pendência do VoiceOver: agora há resumo oculto na célula do Nome; falta a conferência no iPad.

**Acceptance Criteria:**
- Given o deploy de produção, when Rafael abre outubro/26 e novembro/26, then os dois mostram "✓ Conferido" e "✓ Bate com o total a pagar", sem faixa nem bolinha, com a contagem, a troca de Mês e a grade como na 2.4.
- Given o filtro "Verificar" e um Responsável escolhidos, when a grade aparece, then só as linhas marcadas daquele Responsável.

## Implementation Notes

- Regra única da soma: o laço de `resumirExtracao` virou `somarConferencia` (`extracao-fatura.ts`) e o "conferido/incompleta" de `conferirImportacao` virou `montarConferencia` (`importacao-fatura.ts`). A importação usa os dois e devolve o mesmo de antes; `conferir` (`conferencia.ts`) usa os mesmos dois a partir das linhas gravadas. `Conferencia` = `ConferenciaImportacao` + `faturaId` + `cartoesComDiferenca` (finais em ordem crescente, para o texto da faixa não depender da ordem de leitura do Realtime).
- Dúvidas primeiro só com o filtro "Verificar" e a ordem padrão (`ordenarGrade` em `painel.ts`, que chama `ordenarDuvidasPrimeiro`); com coluna ordenada, `ordenarLancamentos` como na 2.4.
- Bolinha: o texto acessível "verificar este lançamento" está no resumo `sr-only` da célula do Nome e no fim do `aria-label` do `<tr>`; a bolinha em si fica dentro do Nome visível `aria-hidden` (senão a frase seria lida duas vezes).
- "Dispensar" grava `new Date().toISOString()` lido no repositório (o cliente não manda `now()` do SQL); `desfazerDispensa` grava `null`. Ambos otimistas via `gravarComOtimismo`, só a coluna `alerta_dispensado_em`.
- Selo de diferença: botão em pílula `alert-warning-bg`/`alert-warning-border` com texto `text` (não há token de texto âmbar no DESIGN.md). A conta do total e o "Bate" passaram para `texto-caption`.
- Sem Fatura no Mês, a pílula some e o filtro "Verificar" não se aplica, mas o estado fica guardado: volta ligado no próximo Mês com Fatura.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind, edge | Despesas diferem sem cartão nem créditos diferentes: selo e faixa sem linha marcada ("Ver lançamentos" vazio) | low | só acontece se a soma dos "VALOR TOTAL" não bater com o total de despesas lido (em out/nov batem); marcar todas as despesas não ajuda e é ramo novo | rejeitado |
| 2 | blind, edge | Cartão e créditos diferem: créditos sem bolinha | low | segue a regra congelada; um crédito lido como despesa já cai no cartão com diferença | rejeitado |
| 3 | blind | Teste do Painel não confere que a faixa some ao Dispensar | low | o otimismo está testado no repo e "dispensada: sem faixa" testa a leitura do campo | rejeitado |
| 4 | blind, verif | Erro do "Desfazer" sem teste | low | gap filado com evidência pelo verification-gap | patch |
| 5 | blind | Toque duplo em "Dispensar" | low | as duas gravações levam o mesmo campo a um valor não nulo; sem dano | rejeitado |
| 6 | blind | Corrida entre "Dispensar" e "Desfazer" | false | o toast com "Desfazer" só aparece depois que `dispensarAlerta` responde (`await` em `dispensar`) | rejeitado |
| 7 | blind | Selo de diferença lê "⚠" e não diz que filtra | low | nome acessível vem do texto; correção direta com `aria-label` | patch |
| 8 | blind | Resumo oculto repete a linha na leitura célula a célula | low | real e previsto pela decisão do VoiceOver; registrar na pendência para a conferência no iPad | patch (deferred-work) |
| 9 | blind, verif | Filtro guardado ao passar por Mês sem Fatura sem teste; teste de troca de Mês fraco | low | nenhum teste ida e volta | patch |
| 10 | blind | sprint-status `in-progress` × spec `in-review` | false | o passo de apresentação leva o sprint-status a `review` | rejeitado |
| 11 | blind | Comentário do topo de `faturas-repo.ts` enxertado | low | frase quebrada e linha longa | patch |
| 12 | blind | Ordenação repetida e checagem redundante em `Painel.tsx` | low | resultado igual; o `fatura !== null` é usado para estreitar o tipo | rejeitado |
| 13 | blind, edge | `final_cartao` nulo vira cartão "" e "cartão final ." | low | hoje inalcançável (só a importação cria Lançamentos, sempre com final); a 2.7 (incluir à mão com `fatura_id`) precisa tratar | rejeitado |
| 14 | verif | `conferir` recebe só o Mês aberto | false | a RPC grava `mes` da Fatura em todos os Lançamentos dela e a memória só guarda o Mês aberto | rejeitado |
| 15 | edge | "Dispensar" grava o relógio do aparelho, não `now()` do SQL | low | o valor só decide esconder (não nulo); usar `now()` exigiria RPC/migração | rejeitado |

## Design Notes

- "Conferido" e "Bate" respondem a perguntas diferentes: o selo diz se cada linha lida soma o que a Fatura diz (despesas, créditos, cartões); a conta diz como os Lançamentos chegam ao total a pagar com saldo e pagamentos. Por isso o selo fica em destaque junto da quantidade, e a conta fica como linha de detalhe.
- O "VALOR TOTAL" do cartão não inclui créditos (addendum do PRD, FR-6); por isso créditos só conferem no geral.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `SUPABASE_SECRET_KEY=sb_secret_ci_canary GEMINI_API_KEY=gemini_ci_canary npm run build` -- expected: build ok.
- Integração e backup -- só no CI.

**Manual checks (if no CLI):**
- Safari do iPad Pro em produção, pelo roteiro passado ao Rafael.
