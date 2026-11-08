---
title: 'História 2.6: Barra de filtros e busca'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
baseline_commit: '847c8beeae900a7841b586cf871042eb1ec41945'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Acima da grade há só duas pílulas soltas ("Verificar" e o filtro de um Responsável); não dá para buscar pelo nome nem filtrar por Tipo, Status, Lançado por, Parcela ou cartão (FR-21, UX-DR9).

**Approach:** O núcleo ganha o estado `FiltrosGrade` e funções puras para aplicar, contar e descrever os filtros. O Painel troca as pílulas soltas pela `filter-bar`: busca, seis pílulas com popover de várias escolhas, "Verificar", "Limpar filtros", vazio próprio e "Mais ▾" no iPad em pé. Nada é gravado.

## Boundaries & Constraints

**Always:**
- Busca: filtra enquanto digita, por Nome ou Apelido contendo o texto, sem diferença de maiúsculas e acentos (`normalizarNome` nos dois lados); texto em branco não filtra; só o Mês aberto.
- Colunas e valores (OU dentro da coluna, E entre colunas, E com a busca e com "Verificar"):
  - Responsável: os Responsáveis não arquivados, na ordem do cadastro, mais "Sem responsável" (`null`); Tipo: os Tipos não arquivados + "Sem tipo"; Status: os Status não arquivados + "Sem status". Um arquivado aparece só se algum Lançamento do Mês o usa ou se já está escolhido.
  - Lançado por: Fatura, Sistema, Manual, Histórico.
  - Parcela: "À vista" (sem Parcela ou total 1, como "1/1"), "Parcelado" (total > 1), "Última parcela" (total > 1 e n = total). Um Lançamento pode cair em "Parcelado" e "Última parcela".
  - Cartão: os finais de `final_cartao` dos Lançamentos do Mês aberto (não de `fatura_cartoes`), em ordem crescente, "Cartão final 8673"; mais "Sem cartão" só se algum Lançamento não tem final.
  - Um valor escolhido que não existe no Mês (troca de Mês) continua na lista, com contagem 0, para poder ser desmarcado.
- Popover (`popover`, Radix como o `SeletorMes`): título "Responsável (pode marcar vários)", uma linha de 44 pt por valor com caixa, etiqueta e contagem à direita, rodapé "Limpar" (zera a coluna e fecha) e "Aplicar" (aplica o rascunho e fecha). Fechar sem "Aplicar" (Esc, toque fora) descarta o rascunho.
- Contagem: quantos Lançamentos do Mês teriam aquele valor com a busca, "Verificar" e os filtros das **outras** colunas já aplicados; o filtro da própria coluna não entra.
- Pílula: inativa "Responsável ▾"; ativa (`selection`/`accent-line`) com os valores na ordem da lista, "Responsável: Casal, Rangel ▾"; nome acessível igual ao texto, `aria-haspopup="dialog"` e `aria-expanded`.
- "Verificar" vira pílula da barra (`aria-pressed`, "Verificar ✕" ligada), só com Fatura; com o estado guardado sem Fatura, como na 2.5. O selo "⚠ Diferença" e "Ver lançamentos" ligam essa pílula sem mexer nos outros filtros.
- Barra colorida do hero e `person-tag` da grade escrevem na coluna Responsável: tocar quando o filtro é exatamente aquele Responsável limpa a coluna; senão, a coluna passa a ser só ele. `aria-pressed` quando ele está entre os escolhidos; a barra apaga os segmentos fora da escolha.
- "Limpar filtros" à direita, só quando há busca, filtro, "Verificar" ou ordem fora da padrão: zera tudo e volta à `ORDEM_PADRAO`.
- Vazio: com filtros e Mês com Lançamentos, "Nenhum lançamento com esses filtros" e o botão "Limpar filtros"; só "Verificar" ligado mantém "Nenhum lançamento para verificar" (com o mesmo botão). Os vazios da 2.4 (sem Fatura, Mês vazio) continuam.
- Um `role="status"` oculto anuncia "N lançamentos" quando os filtros mudam a grade.
- iPad em pé (abaixo de `lg`): a barra mostra busca, Responsável, Tipo, Status, "Mais ▾" e "Limpar filtros"; Lançado por, Parcela, cartão e "Verificar" vão para o popover "Mais", que diz quantos filtros ativos guarda ("Mais (1) ▾"). Deitado e no PC, tudo numa linha.
- Trocar de Mês mantém busca, filtros, "Verificar" e ordem. O rodapé "Total dos lançamentos" soma o que está na grade.
- VoiceOver (decisão do Rafael, 08/11/2026): a pendência da linha da grade fica aberta e a linha não muda; a 2.6 só garante os nomes acessíveis da barra (pílulas, popover, contagem, `role="status"`), testados no jsdom. Spec mantida inteira apesar do tamanho (decisão do Rafael).
- Regras no núcleo (AD-1) em `src/domain/filtros-grade.ts`, textos em `mensagens.ts`, só tokens do DESIGN.md. Testes do núcleo e jsdom da barra, do popover e do Painel.

**Never:** Migração ou gravação de filtros. Apagar, reimportar ou alterar dados de produção. Busca em todos os Meses, pílula "Bloco" (Épico 4), Seleção. Mudar o hero, a conta do total, a faixa, a bolinha, a ordenação ou o nome acessível da linha da 2.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Produção hoje | 49 Lançamentos sem Responsável, Tipo, Status | Responsável: cada Responsável 0, "Sem responsável 49"; idem Tipo e Status; grade igual à 2.5 sem filtro | N/A |
| Busca | "magalu" / "lava" | linhas com "MAGALU" no Nome / "Lava e seca" no Apelido | N/A |
| Cartão | out/26 escolhe 3967, troca para nov/26 | pílula "Cartão: 3967 ▾", grade vazia com "Limpar filtros"; 3967 com 0 no popover | N/A |
| OU / E | Parcela "À vista" + "Última parcela" e cartão 8673 | linhas à vista ou na última parcela, só do 8673 | N/A |
| Hero | filtro {Casal, Rangel}, toque em Casal | coluna vira {Casal}; toque de novo limpa | N/A |
| Ver lançamentos | busca "x" ativa | liga "Verificar", busca continua | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/painel.ts` -- `FiltroResponsavel`, `filtrarPorResponsavel`, `alternarFiltroResponsavel` (substituir pela coluna Responsável de `FiltrosGrade`; atualizar testes), `ordenarGrade`, `ORDEM_PADRAO`, `distribuicaoPorResponsavel` (continua sobre o Mês todo, como hoje).
- `src/domain/conferencia.ts` -- `linhasParaVerificar` (aplicar antes das colunas, como hoje).
- `src/domain/importacao-fatura.ts:37` -- `normalizarNome` para a busca.
- `src/domain/mensagens.ts:194` -- `TEXTOS_PAINEL`, `TEXTOS_CONFERENCIA`, `COLUNAS_GRADE`, `ROTULOS_LANCADO_POR`, `rotuloFiltroResponsavel`, `rotuloSemLancamentosDe` (sai junto com o filtro antigo), rótulo "Cartão final".
- `src/features/painel/Painel.tsx` -- estado de filtros; as pílulas soltas (l. ~190–225) viram `<BarraFiltros>`; `vazio` da grade.
- `src/features/painel/FaturaDoMes.tsx` -- `BarraPorResponsavel` recebe a escolha da coluna (conjunto) no lugar de `filtro`.
- `src/features/painel/GradeLancamentos.tsx` -- `person-tag` com `aria-pressed` pela escolha; vazio com botão "Limpar filtros".
- `src/features/painel/SeletorMes.tsx` -- modelo de `Popover` do `radix-ui`.
- `src/ui/Botao.tsx`, `src/ui/cn.ts`; arquivados: coluna `arquivado` em `responsaveis`, `tipos`, `status`.
- UX: DESIGN.md l. 225–243, 397, 425–429; EXPERIENCE.md l. 123, 230, 264; `mockups/painel.html` (filtro aberto, iPad em pé).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/filtros-grade.ts` + teste -- `FiltrosGrade`, `FILTROS_VAZIOS`, `aplicarFiltros`, `valoresDaColuna` (com contagens), `alternarResponsavelUnico`, `temFiltro`, rótulo da pílula -- a matriz acima.
- [x] `src/domain/painel.ts`, `mensagens.ts` + testes -- tirar o filtro antigo, textos novos.
- [x] `src/features/painel/BarraFiltros.tsx`, `PopoverFiltro.tsx` + testes jsdom -- busca, pílulas, popover, "Mais", "Limpar filtros".
- [x] `Painel.tsx`, `FaturaDoMes.tsx`, `GradeLancamentos.tsx` + testes -- ligação, vazio, troca de Mês.

**Acceptance Criteria:**
- Given o deploy de produção, when Rafael abre outubro/26 e novembro/26 sem filtro, then hero, Conferência, faixa, grade e troca de Mês ficam como na 2.5.
- Given um popover com caixas marcadas, when Rafael toca fora, then nada muda na grade.

## Implementation Notes

- `FiltrosGrade` guarda `busca`, `verificar` e `colunas` (valores por coluna; `null` é "Sem …"). "Verificar" só filtra com Conferência (`aplicarFiltros(linhas, filtros, conferencia)`); sem Fatura fica guardado, como na 2.5.
- Ordem "do cadastro": Responsáveis por `ordem`; Tipos e Status em ordem alfabética (`ordenarParaConfiguracoes` de cada módulo, a mesma das Configurações). Um id escolhido que sumiu do cadastro aparece como "—" para poder ser desmarcado.
- O "▾" e o "✕" ficam `aria-hidden`: o nome acessível da pílula é o texto sem a seta ("Responsável: Casal, Rangel"). A caixa do popover se chama "Casal, 3 lançamentos".
- Vazio: com busca/coluna e Mês com Lançamentos → "Nenhum lançamento com esses filtros"; senão, com "Verificar" efetivo → "Nenhum lançamento para verificar" (também em Mês sem Lançamentos, como na 2.5); senão, os vazios da 2.4. Os dois primeiros levam "Limpar filtros".
- "Mais" usa CSS (`lg:hidden` / `hidden lg:contents`): no jsdom as pílulas da barra aparecem sempre; o popover "Mais" repete as três pílulas e "Verificar" quando aberto. O popover é testado pelo `BarraFiltros.test.tsx` (não há arquivo de teste separado para `PopoverFiltro`).
- O `role="status"` fica vazio até a primeira mudança de filtro e volta a ficar vazio ao trocar de Mês.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind, edge | Barra `lg:flex-nowrap` com pílulas `shrink-0` transborda no iPad deitado (≈1080 px úteis) e rola a página | medium | busca 220 + 6 pílulas inativas ≈ 580 + Verificar + Limpar + espaços já passa de 1080; pílula ativa piora | patch |
| 2 | blind | Busca sem `autoCorrect`/`autoCapitalize`/`spellCheck` no Safari | low | correção direta de atributos; o corretor pode trocar fragmentos de nome | patch |
| 3 | blind, edge | `role="status"` a cada tecla e sem novo aviso quando a contagem não muda | low | aviso "polite" coalesce; contagem igual = grade igual; corrigir exige contador/debounce | rejeitado |
| 4 | blind, verif | Id escolhido que sumiu do cadastro ("—") sem teste | low | nenhum teste escolhe id fora do cadastro | patch |
| 5 | blind | Lançamento com id fora do cadastro não aparece em nenhuma opção | low | só acontece com cadastro ainda não carregado (cadastros são arquivados, não apagados); corrigir abre ramo novo | rejeitado |
| 6 | blind | `linhasParaVerificar` ficou sem uso | low | grep em `src` sem testes: só a definição | patch |
| 7 | blind | sprint-status `in-progress` × spec `in-review` | false | o passo de apresentação leva o sprint-status a `review` | rejeitado |
| 8 | blind | Opções recalculadas a cada render | false | ~50 linhas × 6 colunas × ~10 valores: custo desprezível | rejeitado |
| 9 | blind, edge | "Mais" aberto ao girar o iPad fica ancorado num gatilho escondido | low | só com popover aberto durante a rotação; corrigir exige ouvir `matchMedia` | rejeitado |
| 10 | blind, verif | `aria-pressed` da `person-tag` só testado `true`; laço passa vazio | low | teste não confere o `false` | patch |
| 11 | blind | Teste "vazio pelos filtros" não confere o texto | low | passa `sem_lancamentos` e não lê o texto | patch |
| 12 | blind | `limpar[1]` depende da ordem do DOM; falta Tipo/Status arquivado e Lançado por no Painel | low | funciona hoje; regras cobertas no núcleo | rejeitado |
| 13 | blind | Comentário longo em `FaturaDoMes.tsx`; ordem de import em teste | low | linha longa é correção direta; ordem de import é cosmética e passa no lint | patch (comentário) / rejeitado (import) |
| 14 | blind | Emoji "🔍" não é token | false | DESIGN.md l. 426 pede "ícone 🔍" | rejeitado |
| 15 | blind | Critérios de aceite da spec magros, comando de build sem VAPID/CRON | low | correção seria editar a spec desta build | rejeitado |
| 16 | edge | Popover de Cartão vazio (Mês sem Lançamentos) só com título e botões | low | alcançável em Mês sem Fatura; uma linha de texto resolve | patch |
| 17 | edge | Atualização em tempo real com popover aberto descarta valor do rascunho | low | exige o valor sumir do Mês durante o popover aberto; raro | rejeitado |
| 18 | verif | Contagem com "Verificar" ligado sem teste | low | todo `valoresDaColuna` do teste passa `null` | patch |
| 19 | verif | Ordem de Status sem teste (fixture já em ordem) | low | tirar `ordenarStatus` não quebra teste | patch |
| 20 | verif | "Limpar filtros" ausente em Mês sem Fatura com "Verificar" guardado sem teste | low | nenhum teste confere a ausência | patch |
| 21 | verif | Limpar o aviso ao trocar de Mês sem teste | low | o teste da busca não lê o aviso depois da troca | patch |
| 22 | verif | Fixture de Status do Painel sem `arquivado` | low | `undefined` passa como não arquivado | patch |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `SUPABASE_SECRET_KEY=sb_secret_ci_canary GEMINI_API_KEY=gemini_ci_canary npm run build` -- expected: build ok.

**Manual checks (if no CLI):**
- Safari do iPad Pro em produção, em pé e deitado, pelo roteiro passado ao Rafael.
