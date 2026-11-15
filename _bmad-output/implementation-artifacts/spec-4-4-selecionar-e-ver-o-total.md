---
title: 'História 4.4: Selecionar e ver o total'
type: 'feature'
created: '2026-11-15'
status: 'review'
baseline_commit: 'a8eca4b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-filtrar-a-grade-pelo-bloco.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-classificar-em-lote.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o Painel já tem as caixas e o estado da Seleção, mas Rafael não vê o que marcou valer: falta a barra com "N selecionados · R$ total", o ⌘/Ctrl+A, o aviso ao trocar de Mês, o ⋯ Mais e o anúncio do total. Conferir R$ 1.350,14 da Mãe antes de cobrar ainda é conta de cabeça (FR-48).

**Approach:** a Seleção continua sendo ids de unidades da grade (estado da tela), mas agora é sempre um subconjunto do que o filtro de agora mostra; o que entra no total, o texto da barra, o ⌘/Ctrl+A, o aviso de troca de Mês e o planejamento do lote saem de `src/domain/selecao.ts` (funções puras, imports relativos). A `selection-bar` do Revisar (3.3) vira a base `BarraSelecao` em `src/ui`, usada também pela barra do Painel. "Classificar em lote" chama `classificarEmLote` da 3.3 e "Excluir" chama `excluir`/`restaurar` do repositório com `junto`: nenhuma regra nova, nenhuma migração.

## Boundaries & Constraints

**Always:** regra de negócio só em `src/domain` (funções puras, imports relativos). Textos pelo mapa único (`mensagens.ts`, `TEXTOS_SELECAO`). Só tokens de cor. Realtime só pelo gerenciador único e `useLinhas`. Gravação só por `src/data` (`repoLancamentos`). Sem `console.*`.

**Never:** Gerar a mensagem (4.5 a 4.7: o botão só existe, desativado); "Aplicar status" e "Programar dívida" (Épicos 6 e 7, sem botão); Recebimentos; mudar a Fórmula ou o valor de um Bloco; schema; ler ou alterar produção sem a confirmação do Rafael.

## Decisões

**O que entra no total (`resumoDaSelecao`, que usa `totalDaSelecao` da 3.3):** a soma líquida das marcadas, cada uma com os Ajustes dela que a grade mostra. Mesma regra e mesma função da barra do Revisar, e as mesmas linhas do rodapé da grade (`naGrade` mais os Ajustes delas, ou seja, o que `avaliar` soma quando há Bloco).
- *Mãe e Ajuste:* marca-se a mãe; o Ajuste não tem caixa, segue a mãe, entra no total (líquido) e não conta como item ("1 selecionado" com mãe e Ajuste). Exceção: se o Bloco filtrado tira o Ajuste de baixo da mãe (Responsável diferente, só por edição fora do app), a grade o mostra como linha própria, com caixa; aí ele é um item como outro (e o total continua igual ao valor do Bloco).
- *Mãe dividida:* nunca está na Seleção (não tem caixa e não soma); valem as filhas (partes), que contam como itens.
- *Linha aberta no painel lateral:* se está no filtro, é uma linha como as outras. Se uma edição (ou outro filtro) a tirou do filtro, ela continua na grade (opção A da 2.7) com a **caixa desativada**: fora da Seleção e fora do total.
- *Previstos e Contas manuais:* são linhas da grade e entram como qualquer outra.

**Filtro que muda com itens marcados (decisão):** o que sai da grade **sai da Seleção** (e não volta ao limpar o filtro). A Seleção é podada durante a renderização (`selecaoValida(selecao, idsNaGrade)`), então a contagem, o total e o que "Classificar em lote" e "Excluir" tocam são sempre as linhas marcadas que Rafael vê. Razão: "Excluir" e "Classificar" agindo em linhas invisíveis é perigoso, e o texto "N selecionados" não tem como dizer "mais M escondidas" sem virar outro estado. Custo conhecido: digitar na busca depois de marcar tira as que não casam. Vale também para Bloco, coluna, busca e "Verificar".

**Selecionar todos:** a caixa do cabeçalho (`alternarTodos`) marca todas as unidades do filtro, as que rolam para fora da vista também (a grade é uma só, rola por dentro do cartão), e de novo desmarca todas. Estados: vazia, parcial (`indeterminate`), marcada. ⌘/Ctrl+A (`ehSelecionarTodos`, `selecionarTudo`) só **marca** (nunca desmarca; desmarcar é a caixa ou "Limpar"), e só fora de campo de texto, janela, menu ou popover; com foco numa caixa ou botão vale.

**Trocar de Mês (`aoTrocarDeMes`):** limpa a Seleção, sempre; o aviso "Seleção limpa ao trocar de mês" só aparece se havia Seleção e o Mês mudou de fato. A Seleção é de um único Mês. Importar um Mês novo também passa por aqui.

**Lançamento excluído ou editado em outro aparelho:** sai da Seleção se sumiu da grade (excluído, mudou de Mês, ou saiu do filtro por causa da edição); o total recalcula sozinho, sem aviso.

**Classificar em lote:** janela com Responsável, Tipo, Status e Observação, cada um começando em "Não mudar"; só o escolhido é gravado, pela `classificarEmLote` da 3.3 (Ajustes junto, Regras aprendidas, tudo ou nada, retrato de antes). "Sem status" limpa o Status. Observação em branco não muda (não há "limpar Observação" em lote). Sucesso: aviso "N lançamentos classificados" com "Desfazer" (`desfazerLote`), a Seleção continua (para a próxima ação), e as parcelas com Série propagam aos previstos vazios, sem perguntar (como o lote do Revisar). Falha: nada muda, a janela e a Seleção ficam, e o aviso é o do mapa único. A **parte de uma Divisão só recebe o Status** (o Responsável é dela na Divisão; Tipo e Observação seguem a mãe), e a janela avisa quando há partes marcadas. Já estava assim / só partes sem Status: "Nada a mudar nos selecionados".

**Excluir em lote:** confirmação ("N lançamentos saem da grade junto com M Ajustes"), uma única gravação (`UPDATE … IN (ids)`, atômica) com as marcadas, os Ajustes delas e nada mais; aviso "N lançamentos excluídos" com "Desfazer" (`restaurar` com os mesmos ids). **Sem RPC e sem migração:** o repositório atual (`excluir(id, { junto })`) já grava várias linhas numa requisição. A parte de uma Divisão não se exclui (como no ⋯ da linha: desfaz-se a Divisão): ela fica, a confirmação avisa, e com só partes marcadas o item "Excluir" nem aparece. Excluídas, as linhas saem do painel lateral e da Seleção antes de gravar.

**Painel lateral e Reordenar:** a barra é `fixed` embaixo e **não cobre o painel lateral**: de `lg` para cima ela deixa a coluna de 400 px livre (`lg:right-painel-lateral`); abaixo de `lg` o painel ocupa 70% da largura e a barra se esconde enquanto ele estiver aberto (a Seleção continua e a barra volta quando ele fecha). Uma folga com a altura da barra (`--altura-barra-inferior`) fica no fim do conteúdo, então o rodapé da grade nunca fica atrás dela, e o Toast sobe acima da barra. O modo Reordenar dos Blocos não se mexe com a Seleção (está no topo da página; nada a decidir).

**Acessibilidade:** a região `role="status"` que anuncia "N selecionados · R$ total" fica no DOM, vazia, antes da primeira marcação (resolve, para o Painel, a pendência da 3.3 sobre a região que nasce junto com a barra); o texto visível da barra não é um segundo `status` (`regiaoPropria={false}`). Caixas e botões com alvo de 44 pt; foco visível pelo anel global; nome da caixa "Selecionar {nome}" (mapa único); a do cabeçalho, "Selecionar todos", marcada ou parcial.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Marcar | Toque na caixa da linha | Linha com `bg-selection`, painel lateral não abre; barra "1 selecionado · R$ 100,00"; anúncio idem |
| Todos | Caixa do cabeçalho / ⌘+A com o Bloco Mãe filtrado (outubro/2026) | "7 selecionados · R$ 1.350,14" |
| Desmarcar todos | Caixa do cabeçalho de novo | Seleção vazia; barra some; região de anúncio fica vazia |
| Ajuste | Mãe marcada | "1 selecionado", total líquido |
| Filtro muda | 6 marcadas, filtro Responsável Casal | "3 selecionados"; ao limpar o filtro continuam 3 |
| Excluída fora | Marcada excluída em outro aparelho | Sai da Seleção; total recalcula |
| Trocar de Mês | Com 1+ marcada | Seleção limpa + "Seleção limpa ao trocar de mês"; sem marcada, nada |
| ⌘/Ctrl+A em campo | Foco na busca ou janela aberta | Nada (o navegador seleciona o texto) |
| Classificar falha | `classificarEmLote` recusa | Janela e Seleção ficam; aviso do código |
| Excluir com parte | Parte da Divisão marcada | A parte fica; a confirmação diz |
| Painel aberto | Linha aberta sai do filtro | Fica na grade, caixa desativada, fora do total |

</frozen-after-approval>

## Code Map

- `src/domain/selecao.ts` -- `textosDaBarra`, `resumoDaSelecao`, `selecionarTudo`, `aoTrocarDeMes`, `ehSelecionarTodos`, `montarCamposDoLote`, `planejarClassificacaoEmLote`, `planejarExclusaoEmLote`, `contarPartes`.
- `src/domain/lote.ts` -- `parcelasDoLote` (extraída do Revisar para o Painel propagar aos previstos).
- `src/domain/mensagens.ts` -- `TEXTOS_SELECAO`, `rotuloLancamentosClassificados`, `rotuloLancamentosExcluidos`, `notaPartesDaDivisao`, `descricaoExcluirEmLote`.
- `src/ui/BarraSelecao.tsx` -- base da `selection-bar` (região, altura publicada, painel lateral); `src/features/revisar/BarraLote.tsx` passa a usá-la.
- `src/ui/MenuAcoes.tsx` -- `gatilhoComTexto` (o "⋯ Mais").
- `src/features/painel/BarraSelecaoPainel.tsx`, `JanelaClassificarEmLote.tsx`, `AtalhoSelecionarTodos.tsx` -- a barra, a janela e o atalho.
- `src/features/painel/Painel.tsx` -- poda da Seleção, resumo, região de anúncio, aviso ao trocar de Mês, lote e exclusão; `GradeLancamentos.tsx` -- `semCaixaId`.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/{selecao,lote,mensagens}.ts` (+ `selecao.test.ts`, `lote.test.ts`, `blocos-outubro.test.ts`) -- regras e o aceite de outubro
- [x] `src/ui/{BarraSelecao,MenuAcoes}.tsx`, `BarraLote.tsx`, `Revisar.tsx` (+ testes) -- base compartilhada
- [x] `src/features/painel/*` (+ `Painel.test.tsx`) -- barra, janela, atalho, aviso, caixa da linha fixa
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.4 em `review`; pendências

**Acceptance Criteria:**
- Given a grade do Painel, when Rafael toca na caixa de uma linha, then ela fica com o fundo `selection`, o painel não abre e a barra mostra "N selecionados · R$ total", atualizado a cada toque; a caixa do cabeçalho marca e desmarca todos do filtro e, no PC, ⌘/Ctrl+A marca todos (fora de campo de texto, janela e menu).
- Given o Bloco Mãe filtrado (fixture de outubro/2026) e "selecionar todos", then a barra mostra "7 selecionados · R$ 1.350,14" (`blocos-outubro.test.ts` e `Painel.test.tsx`).
- Given 1+ selecionados, then a barra tem "Limpar", "⋯ Mais" (Classificar em lote pela função da 3.3, e Excluir com confirmação e "Desfazer") e "Gerar mensagem" (desativado até a 4.6); o Toast sobe acima dela; trocar de Mês limpa a Seleção com o aviso só se havia Seleção.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde (menos os 2 timeouts conhecidos de `eslint-*`, que passam sozinhos)
- Sem migração nem teste de integração novos nesta história.

## Implementation Notes

- **Poda na renderização.** `Painel` calcula `selecionados = selecaoValida(selecao, idsNaGrade)` e, se o tamanho difere do estado, grava o podado durante a renderização (padrão já usado para a linha excluída fora e para o Bloco ausente). Só roda no ramo "pronto": com o Mês carregando, a Seleção não é tocada. Sem laço: na renderização seguinte os tamanhos são iguais.
- **Região de anúncio.** Um `<p role="status" class="sr-only">` fixo no Painel mostra `resumo.texto` (vazio sem Seleção); a barra (`regiaoPropria={false}`) não duplica o status. O Revisar continua com a região dentro da barra (pendência da 3.3 só resolvida no Painel).
- **`BarraSelecao`.** Mesma casca da 3.3 (fundo `nav`, `shadow-flutuante`, publica `--altura-barra-inferior`), agora com `contagem` e `total` já formatados pelo núcleo (`textosDaBarra`); o `BarraLote.test.tsx` não mudou.
- **Excluir em lote.** `excluir(principal, { junto: [demais, Ajustes] })`: `UPDATE lancamentos SET excluido_em … WHERE id IN (…)`, uma requisição, com otimismo e reversão se a resposta vier pela metade. "Desfazer" é `restaurar` com os mesmos ids. Confirmado que não precisa de RPC.
- **Não verificado aqui:** layout e toque no iPad (altura da barra, o Toast acima dela, a barra com o painel lateral aberto em lg e escondida abaixo de lg, caixas de 44 pt); o VoiceOver anunciando a região vazia que passa a ter texto na primeira marcação; ⌘/Ctrl+A num navegador de verdade (jsdom só dispara o evento); a exclusão de centenas de ids numa só requisição (o `IN` vai na URL do PostgREST, com limite de tamanho: não testado acima de poucas linhas); `npm test` tem 2 falhas de timeout de 5 s nos testes que sobem o ESLint (`eslint-nucleo`, `eslint-formatos`), as mesmas na `main`, e passam rodando sozinhos.

## Spec Change Log

## Review Triage Log

Revisão feita por mim, na própria sessão, sobre o diff (sem os revisores independentes do bmad-build). Pontos checados, sem defeito verificado: a Seleção podada nunca age em linha invisível (lote e exclusão leem a Seleção já podada); o total da barra e o do rodapé usam as mesmas linhas; o Ajuste solto (Bloco que o separa da mãe) conta como item e a gravação não o perde; a janela e a confirmação fecham se a Seleção esvazia; o atalho não rouba ⌘/Ctrl+A de campo, janela ou menu; "Desfazer" do lote usa o retrato de antes da 3.3; sem `console.*`, sem cor literal, sem migração.

## Design Notes

**Escolhas minhas:** "Gerar mensagem" desativado em `primario` (o único primário da barra, como no DESIGN.md); "Excluir" só aparece no ⋯ quando há o que excluir; a barra se esconde abaixo de `lg` com o painel lateral aberto em vez de encolher (a 834 pt não sobra largura útil).
