---
title: 'História 2.4: Painel do Mês com a grade de Lançamentos'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
baseline_commit: '3b2f5ba3217ef6b13d639ff11303cfffa2d9a2cc'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Painel provisório da 2.3 mostra todas as Faturas e todos os Lançamentos numa lista só: com outubro/26 e novembro/26 importados, os dois Meses aparecem misturados, e não há grade nem troca de Mês (FR-21, FR-22). O gerenciador de Realtime lê `lancamentos` inteiro com `select("*")` e vai bater no limite de 1000 linhas do PostgREST.

**Approach:** O Painel passa a mostrar um Mês só, o Mês aberto, escolhido no `month-switcher`. O app sempre abre no Mês atual. O cartão e a lista provisórios dão lugar ao `invoice-hero` e à grade da UX-DR10. O gerenciador de `lancamentos` passa a guardar e reler só o Mês aberto (AD-4).

## Boundaries & Constraints

**Always:**
- `invoice-hero` do Mês aberto: a sobrelinha "FATURA DE OUTUBRO · VENCE 06/10/26"; o total a pagar em `hero-value`; a conta `comporTotalAPagar`/`TotalAPagar` da 2.3 ("Lançamentos + saldo anterior − pagamentos", com "✓ Bate com o total a pagar" ou a diferença); a barra por Responsável (8 px, segmentos `person-N` proporcionais, legenda com bolinha e nome). Tocar num segmento ou numa `person-tag` filtra a grade por aquele Responsável; tocar de novo, ou em "✕" no filtro, limpa o filtro.
- Grade com colunas, nesta ordem: caixa (só visual nesta história), Nome (Apelido em `body-strong` + Nome em `text-muted`, ou só o Nome), Parcela, Valor (à direita, tnum), Tipo, Responsável (`person-tag`), Lançado por (rótulo contornado) e Status (`status-pill` com texto). A ordem padrão é a da fatura (`ordem_fatura`, sem ordem no fim). Tocar num cabeçalho ordena por aquela coluna; tocar de novo inverte. O cabeçalho fica fixo. Quando falta largura, a grade rola para os lados com a caixa e o Nome fixos, sem esconder colunas. R$ 0,00 aparece normalmente. A linha nunca leva cor de pessoa ou de Status. O nome acessível da linha é "Nome, Valor, Parcela, Responsável, Status". O rodapé mantém "Total dos lançamentos" (a soma do que está na grade, filtro incluído). Excluídos (`excluido_em`) não aparecem.
- Mês atual (decisão do Rafael, 08/11/2026): o mês do calendário de hoje em São Paulo (`mesDaData(hojeEmSaoPaulo(agora))`). Em 08/11/26, é novembro/26.
- `month-switcher` "◀ Out/26 ▶": setas de 44 pt, que andam sem limite, e um popover com a lista de Meses. A lista vai do Mês mais antigo com Fatura (ou do Mês atual, se não houver Fatura) até o Mês atual + 1, e inclui o Mês aberto se ele estiver fora desse intervalo (decisão do Rafael, 08/11/2026). Um Mês com Fatura leva o selo "Fechado"; um Mês sem Fatura mostra "Fatura ainda não importada" com "Importar fatura". Trocar de Mês mantém o filtro de Responsável.
- Enquanto carrega, aparece o `skeleton`, nunca uma tela branca. O layout segue a UX-DR31: iPad deitado, iPad em pé (hero em largura total, grade com rolagem lateral) e PC (todas as colunas sem rolar).
- O gerenciador de `lancamentos` relê com `.eq("mes", mesAberto)` ao assinar, a cada `SUBSCRIBED` e quando o Mês aberto muda. Evento de outro Mês é ignorado. Linha que sai do Mês aberto num UPDATE sai da memória. `faturas` e `fatura_cartoes` continuam lidas inteiras (uma por Mês).
- A importação lê o `updated_at` do Mês importado: da memória, se ele for o Mês aberto e estiver carregado; senão, numa leitura do banco daquele Mês. Depois de importar, o Painel abre o Mês importado.
- As regras vão para o núcleo (Mês atual, Meses da lista, ordenação, distribuição por Responsável, nome acessível); textos em `mensagens.ts`; valores e datas só pelos formatadores da 2.2.
- Testes de componente com jsdom para a grade, o `month-switcher`, o `invoice-hero` e o `skeleton`.

**Never:** Nenhuma migração nem gravação. Nada de apagar, reimportar ou alterar as Faturas de outubro/26 e novembro/26 em produção. Fora desta história: Conferência e "verificar" (2.5), barra de filtros e busca (2.6), side-panel e edição (2.7), Ajustes (2.8), Seleção e Blocos (Épico 4), Previstos e Recebimentos. Nenhuma cor literal; só tokens do DESIGN.md.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Outubro | Mês aberto 2026-10 | hero "FATURA DE OUTUBRO · VENCE 06/10/26", R$ 7.713,67, "✓ Bate…"; 49 linhas; selo "Fechado" | N/A |
| Troca | ▶ de 2026-10 | 46 linhas de novembro, R$ 7.351,42; nenhuma linha de outubro | N/A |
| Sem Fatura | Mês sem Fatura | "Fatura ainda não importada" + "Importar fatura"; grade vazia, sem selo | N/A |
| Sem Responsável | Lançamentos com `responsavel_id` null | segmento e legenda "Sem responsável" (cor neutra); a tag na grade mostra "—" | N/A |
| Filtro | toque no segmento de um Responsável | só as linhas dele; o rodapé soma só elas | N/A |
| Ordenar | toque em "Valor" duas vezes | crescente, depois decrescente | N/A |
| Carga / erro | gerenciador carregando / erro | `skeleton` / "Não foi possível carregar. Tentar de novo" | `recarregar` |
| Importar outro Mês | Mês aberto 2026-11, importa 2026-12 | `updated_at` lido do banco para 2026-12; o Painel vai para 2026-12 | os códigos da 2.3 |
| Evento de outro Mês | INSERT com `mes` ≠ Mês aberto | ignorado | N/A |

</frozen-after-approval>

## Code Map

- `src/features/painel/Painel.tsx` (+ teste) -- substituir o cartão e a lista provisórios; o teste já usa um gerenciador falso de `@/data/realtime`.
- `src/features/importar/TotalAPagar.tsx`, `src/domain/importacao-fatura.ts` (`comporTotalAPagar`, `formatarParcela`) -- reaproveitar sem mudar a regra.
- `src/features/importar/ImportarFatura.tsx` -- `aoMudar`/fim da importação: avisar o Painel do Mês importado.
- `src/data/realtime.ts` -- `criarGerenciador` (`reler` com `select("*")` na l. 100; filtro de eventos em `abrirCanal`); `gerenciador()` cria um por tabela. O escopo por Mês vale só para `lancamentos`, e as outras tabelas não mudam. `realtime.test.ts` e `realtime-recarregar.test.ts` têm o cliente falso.
- `src/data/realtime-estado.ts` -- `aplicarReleitura`, `aplicarEvento`, `aplicarLote`, reaproveitados.
- `src/data/faturas-repo.ts` (+ teste) -- `ultimaAlteracaoDoMes` e `importar()`: a leitura do `updated_at` muda conforme a seção Always.
- `src/domain/datas.ts` (`hojeEmSaoPaulo`, `formatarMes`, `formatarMesExtenso`, `formatarData`), `ciclo.ts` (`mesDaData`, `somarMeses`, `mesDoLancamento`), `dinheiro.ts` -- Mês atual e rótulos. O relógio fica fora do núcleo (`hojeEmSaoPaulo(new Date())` na tela, como em `SecaoCiclo.tsx:28`).
- `src/domain/mensagens.ts` -- `COLUNAS_LANCAMENTOS` (renomear e ampliar), `tituloFaturaImportada`; novos textos ("Fechado", "Fatura ainda não importada", "Sem responsável", rótulos de `lancado_por`: Fatura/Sistema/Manual/Histórico).
- `src/ui/cores-pessoa.ts` (`classesPessoa(cor)`: `fundo` para a barra, `etiqueta` para a `person-tag`), `Esqueleto.tsx`, `ErroAoCarregar.tsx`, `Botao.tsx`, `Tela.tsx` -- peças existentes. Os tokens `status-*` do DESIGN.md: conferir em `src/app/globals.css` se já existem; se não, entram ali com o par claro/escuro (`tokens.test.ts` mede o contraste).
- `useLinhas("responsaveis" | "tipos" | "status")` -- nomes e cor para as colunas.
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/DESIGN.md` (l. 207–262, 384–443, 472) e `EXPERIENCE.md` (l. 53, 118–125, 208–214, 248–266); mockup `mockups/painel.html` (claro e iPad em pé). O mock tem Blocos, filtros, Seleção e Conferência, que ficam fora.
- Banco: o índice `lancamentos_owner_id_mes_idx` já existe; não há migração.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/painel.ts` + teste -- `mesAtual(hoje, …)`, `mesesDaLista(...)`, `ordenarLancamentos(linhas, coluna, sentido, nomes)`, `distribuicaoPorResponsavel(linhas)` (soma líquida, só segmentos > 0, "sem responsável" à parte), `rotuloLinhaAcessivel(...)` -- regras puras (AD-1).
- [x] `src/domain/mensagens.ts` + teste -- textos e rótulos novos; sai o que era só do Painel provisório.
- [x] `src/data/realtime.ts` + testes -- escopo por Mês para `lancamentos` (`abrirMes(mes)`, `.eq`, eventos de outro Mês ignorados, UPDATE que sai do Mês) -- AD-4, fecha a pendência das 1000 linhas.
- [x] `src/data/faturas-repo.ts` + teste -- `updated_at` do Mês importado (memória ou banco).
- [x] `src/features/painel/` (`Painel.tsx`, `SeletorMes.tsx`, `FaturaDoMes.tsx`, `GradeLancamentos.tsx`, com testes jsdom) -- hero, seletor, grade, rodapé, skeleton, erro, layouts.
- [x] `src/features/importar/ImportarFatura.tsx` + teste -- devolve o Mês importado ao Painel.
- [x] `src/app/globals.css` -- tokens `status-*` e `eyebrow`/`hero-value`, se faltarem.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- fecha a pendência das 1000 linhas.

**Acceptance Criteria:**
- Given o deploy de produção no Safari do iPad Pro, when Rafael abre o app, then o Painel abre no Mês atual, e as setas mostram outubro/26 (49, R$ 7.713,67) e novembro/26 (46, R$ 7.351,42) separados, cada um com "✓ Bate com o total a pagar".
- Given a grade no iPad em pé, when ela rola para os lados, then a caixa e o Nome ficam fixos e o cabeçalho fica no topo.
- Given o VoiceOver, when ele lê uma linha, then diz "Nome, Valor, Parcela, Responsável, Status".

## Implementation Notes

- Implementado pelo subagente a partir da spec. Escolhas onde a spec não falava:
  - O nome acessível usa o Apelido, quando há, e "parcela 2 de 12".
  - A lista de Meses começa no menor valor entre a Fatura mais antiga e o Mês atual.
  - Vazios vão para o fim nos dois sentidos da ordenação.
  - O hero ocupa 40% a partir de `lg`.
  - Num Mês sem Fatura, o hero também tem "Importar fatura".
- `globals.css` não mudou: os tokens `status-*`, `texto-eyebrow` e `texto-hero-value` já existiam.
- Não rodou aqui: a integração e a checagem visual dos layouts. Ficam com o CI e com o Rafael no iPad.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | edge | `abrirMes` com o canal caído zera para "carregando" sem reler | medium | `if (canal && conectado)`: se não está conectado, nada relê e o erro some | patch |
| 2 | edge | UPDATE atrasado de outro Mês tira linha mais nova | low | não há guarda de `updated_at` nesse ramo; correção direta | patch |
| 3 | edge | `recarregar` antes de `abrirMes` fica carregando | false | o Painel chama `abrirMes` no primeiro efeito; ninguém relê sem Mês | rejeitado |
| 4 | edge, blind | Mês atual não se atualiza com o app aberto na virada do mês | low | real, mas a correção pede um relógio que reage à visibilidade (ramo novo); reabrir corrige | rejeitado |
| 5 | edge, blind | Com filtro ativo e nenhuma linha dele, a grade diz "Nenhum lançamento neste Mês" | low | `vazio` não olha o filtro | patch |
| 6 | edge | Responsável ausente do cadastro vira "Sem responsável" no VoiceOver | false | `responsaveis` inclui arquivados e o Painel espera a carga | rejeitado |
| 7 | edge | Segmento com Responsável ausente vira "—" na cor 1 | false | mesmo motivo do 6 | rejeitado |
| 8 | edge | `lancado_por` fora do enum | false | enum do banco e do tipo gerado | rejeitado |
| 9 | edge | Chave de Parcela colide com `parcela_total` ≥ 10000 | false | parcelas reais vão até dezenas | rejeitado |
| 10 | edge, blind | Sem total a pagar lido, o hero mostra o calculado como "Total a pagar" | low | `c.lidoCentavos ?? c.calculadoCentavos`; a 2.3 dizia "não lido" | patch |
| 11 | edge | A quantidade de Lançamentos (49/46) sumiu do Painel | medium | o cartão da 2.3 mostrava; o aceite confere a contagem | patch |
| 12 | edge | Assinatura de `ordenarLancamentos` difere da tarefa | false | a tarefa descreve os dados, não a assinatura | rejeitado |
| 13 | blind | "parcela n de total" escrito no núcleo, fora de `mensagens.ts` | low | a seção Always manda os textos para `mensagens.ts` | patch |
| 14 | blind | A grade reimplementa `nomeExibido` | low | `temApelido ? apelido : nome` duplicado | patch |
| 15 | blind | VoiceOver do iPad pode não ler `aria-label` em `<tr>` | maybe-false | só o teste no Safari do iPad decide | defer (conferência manual do Rafael) |
| 16 | blind | `aria-label` "Ordenar por X" troca o nome da coluna | low | o nome do cabeçalho vem do botão | patch |
| 17 | blind | Segmentos pequenos da barra são difíceis de tocar | low | a legenda filtra igual | rejeitado |
| 18 | blind | Caminhos do gerenciador por Mês sem teste | low | coberto pelo 21; os outros ramos reaproveitam o estado já testado | rejeitado |
| 19 | blind | `totalCentavos` calculado e não usado | low | só o teste lê | patch |
| 20 | blind | `last_updated` do sprint-status mudou de formato | low | o arquivo usa `MM-DD-AAAA HH:MM` | patch |
| 21 | verif | O `gerenciador("lancamentos")` de produção não é testado como por Mês | medium | só `criarGerenciador({porMes:true})` à mão | patch |
| 22 | verif | Excluídos sem teste | medium | o teste antigo saiu; nenhum fixture tem `excluido_em` | patch |
| 23 | verif | Ramo `mes !== mesAberto` do esqueleto sem teste | low | o teste usa status "carregando"; com o gerenciador falso, o teste é direto | patch |
| 24 | blind | A pendência das 1000 linhas foi apagada, não fechada | false | as pendências resolvidas já eram retiradas assim (2.3) | rejeitado |
| 25 | blind | Memória "pronta" com o canal caído pode dar `mes_mudou` falso | low | já era assim antes; a RPC recusa com segurança | rejeitado |
| 26 | blind | Topo do iPad em pé pode transbordar | low | ~400 px de ações em ~740 px úteis; vai para a conferência manual | rejeitado |

## Design Notes

- Memória só com o Mês aberto: trocar de Mês mostra o `skeleton` enquanto relê (~50 linhas). Isso é mais simples do que guardar vários Meses e já resolve o limite do PostgREST. O canal continua um por tabela, sem filtro no servidor; a releitura filtra por Mês.
- A importação de outubro e novembro gravou `responsavel_id` e `tipo_id` nulos (a classificação é do Épico 3). Hoje a barra fica com um segmento só, "Sem responsável", e o Tipo e o Responsável aparecem como "—".
- `status-pill`: os tokens `status-paid`/`status-unpaid` já existem em `globals.css`. Um Status com `conta_como_pago` usa `status-paid`; os outros usam `status-unpaid`. "Parcial" e "Atrasado" são derivados (Épico 6).
- A variante "Fatura ainda não importada" não mostra o total dos Previstos, porque eles ainda não existem (Épico 3).

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `SUPABASE_SECRET_KEY=sb_secret_ci_canary GEMINI_API_KEY=gemini_ci_canary npm run build` -- expected: build ok.
- Integração e backup -- só no CI (sem Docker no Mac).

**Manual checks (if no CLI):**
- Safari do iPad Pro, em produção, pelo roteiro passado ao Rafael.
