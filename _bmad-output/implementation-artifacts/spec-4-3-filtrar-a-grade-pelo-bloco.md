---
title: 'História 4.3: Filtrar a grade pelo Bloco'
type: 'feature'
created: '2026-11-15'
status: 'review'
baseline_commit: '45e45e4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o Bloco mostra "quanto", mas Rafael não consegue ver "de onde vem": tocar no cartão não faz nada, e conferir R$ 1.350,14 da Mãe obriga a montar o mesmo filtro à mão na barra (FR-20).

**Approach:** tocar num `block-card` filtra a grade pelos Lançamentos que entram na Fórmula (`avaliacao.entram` do `resumirBloco`, a mesma `avaliar` sobre `projetarPainel` do valor do cartão). A barra de filtros ganha a pílula "Bloco: Nome ✕"; o filtro se soma (E) à busca, às colunas e a "Verificar" e se desfaz tocando de novo, no ✕ ou em "Limpar filtros". Nenhuma tela filtra linhas por conta própria: o predicado, a pílula e as regras de borda saem de `src/domain/filtros-grade.ts`.

## Boundaries & Constraints

**Always:** regra de negócio só em `src/domain` (imports relativos, funções puras). O estado é `FiltrosGrade.bloco` (só o id): `entram` é recalculado a cada render, então Bloco editado, Lançamento mudado e Mês novo atualizam o filtro sozinhos. Textos pelo mapa único (`mensagens.ts`). Só tokens de cor. Realtime só pelo gerenciador único e `useLinhas`. Sem mudança de schema (confirmado: nenhuma migração; o estado vive na tela e não é gravado).

**Never:** Seleção com total (4.4); modelo e geração da mensagem (4.5 a 4.7); Recebimentos (Épico 7); mudar a Fórmula ou o valor do Bloco; `console.*`; ler ou alterar produção sem a confirmação do Rafael.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tocar | Cartão "Mãe" no Mês aberto | A grade mostra só os 7 Lançamentos da Mãe; pílula "Bloco: Mãe ✕"; cartão com borda `accent-line` + 1 px de contorno e `aria-pressed`; o total do rodapé é R$ 1.350,14 | N/A |
| Desfazer | Tocar de novo no cartão, no ✕ da pílula ou em "Limpar filtros" | O filtro do Bloco some; a grade volta (com os outros filtros que existirem) | N/A |
| Trocar | Bloco A ativo, toque no Bloco B | Só B filtra (um por vez) | N/A |
| Combinar | Bloco + busca + coluna + "Verificar" | E entre todos; as contagens dos popovers já vêm restritas ao Bloco | N/A |
| Só o Bloco | Nenhum outro filtro | A barra mostra "Limpar filtros" | N/A |
| Bloco sem Lançamentos | `entram` vazio | Grade vazia com "Nenhum lançamento com esses filtros" e "Limpar filtros"; anúncio "0 lançamentos" | N/A |
| Ajuste | Mãe e Ajuste entram | O Ajuste fica recuado sob a mãe; o rodapé fecha no valor do Bloco | N/A |
| Ajuste de outro Responsável/Tipo que a mãe | Só um dos dois entra | Entra só o que o Bloco soma: o Ajuste que entra sozinho vira linha comum; o que não entra some, mesmo com a mãe na grade | N/A |
| Mãe dividida | Filhas entram em parte | A mãe nunca soma; aparecem o cabeçalho e só as filhas que entram | N/A |
| Mês novo | Trocar de Mês com o Bloco ativo | O filtro fica (como busca e colunas) e `entram` é recalculado para o Mês novo | N/A |
| Bloco editado | Fórmula ou nome mudam (qualquer aparelho) | `entram` e a pílula recalculam no lugar | N/A |
| Bloco reordenado | `ordem` muda | O filtro não muda (é por id) | N/A |
| Bloco excluído em outro aparelho | Some de `blocos` com o filtro ativo | O filtro se desfaz e aparece o aviso "O Bloco foi excluído e o filtro foi desfeito" | N/A |
| Bloco excluído aqui | ⋯ → Excluir bloco → confirmar | O filtro se desfaz antes de gravar; vale só o aviso "Bloco excluído" | recusa: o filtro já foi desfeito, o toast é o do mapa único |
| Fórmula que não calcula | `avaliar` falha (ex.: número grande) | O cartão mostra "—", o botão de filtro fica desativado; se estava ativo, o filtro se desfaz com "O Bloco ficou sem valor e o filtro foi desfeito" | N/A |
| Reordenar ligado | Modo "Reordenar" | O toque no corpo do cartão não filtra (o cartão vira texto parado); o Bloco ativo continua em destaque | N/A |
| Toque longo | Dedo parado 500 ms no cartão | Abre o ⋯; o clique que vem logo depois é engolido e não filtra | N/A |
| Linha aberta no painel lateral | Sai do filtro | Continua na grade, fora do total (opção A da 2.7) | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/filtros-grade.ts` -- `FiltrosGrade.bloco` (id), `resolverBloco`, `restringirAoBloco`, `alternarBloco`, `limparBloco`, `textoDaPilulaDoBloco`, `motivoParaDesfazerBloco`; `temFiltro`/`motivoDoVazio` contam o Bloco.
- `src/domain/mensagens.ts` -- `TEXTOS_BLOCO.filtro_desfeito_*`, `rotuloFiltrarPeloBloco`, `rotuloPilulaBloco`, `rotuloDesfazerFiltroBloco`.
- `src/features/painel/Painel.tsx` -- lê `blocos`, calcula `doBloco`, restringe as unidades antes de `separarAjustes`, desfaz o filtro de Bloco ausente e avisa.
- `src/features/painel/BlocosDoMes.tsx`, `CartaoBlocos.tsx` -- `ativoId`, `aoFiltrar`, `aoExcluindo`; o corpo do cartão é um botão `aria-pressed`, e ⋯ e 💬 são irmãos dele.
- `src/features/painel/BarraFiltros.tsx` -- pílula "Bloco: Nome ✕".

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/{filtros-grade,mensagens}.ts` (+ `filtros-grade.test.ts`, `blocos-outubro.test.ts`) -- predicado, pílula, bordas e o teste de aceite da Mãe
- [x] `CartaoBlocos.tsx`, `BlocosDoMes.tsx` (+ testes) -- cartão que filtra, sem botão dentro de botão, toque longo e Reordenar
- [x] `BarraFiltros.tsx`, `Painel.tsx` (+ `Painel.test.tsx`) -- pílula, combinação, Mês, Bloco editado/excluído, linha aberta
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.3 em `review`; pendências

**Acceptance Criteria:**
- Given um Bloco no Painel, when Rafael toca nele, then a grade mostra só os Lançamentos que `avaliar` diz que entram, aparece "Bloco: Nome ✕" na barra e o cartão ganha a borda de destaque; tocar de novo, o ✕ ou "Limpar filtros" desfazem; só um Bloco filtra por vez e ele se combina com os filtros de coluna.
- Given um Bloco de soma simples (Mãe = R$ 1.350,14, 7 itens, fixture de outubro/2026), when a grade é filtrada por ele, then o total do rodapé é igual ao valor do Bloco (`blocos-outubro.test.ts`).

## Implementation Notes

- **Onde o filtro entra.** Antes de `separarAjustes`, não depois de `aplicarFiltros`: o Painel faz `separarAjustes(restringirAoBloco(unidades, doBloco))` quando o Bloco está ativo e `separarAjustes(unidades)` quando não. Assim `maes`, os Ajustes recuados e o total do rodapé (`maes` filtradas + Ajustes delas) são exatamente as linhas que `avaliar` soma, e `entram` (que lista unidades, com as filhas e sem a mãe dividida) casa com o que a grade julga. As colunas, a busca e "Verificar" continuam olhando só as mães (o Ajuste segue a mãe). As contagens dos popovers usam as `maes` já restritas. O hero, a Conferência e a Seleção (`idsDoMes`) seguem o Mês todo: o Bloco só muda o que a grade mostra.
- **Ajuste com Responsável ou Tipo diferente da mãe (decisão).** Só pode existir por edição fora do app (o painel do Ajuste é só leitura para Tipo e Responsável e a gravação leva os Ajustes junto). Vale o que o Bloco soma: se os dois entram, o Ajuste fica sob a mãe; se só o Ajuste entra, `separarAjustes` o deixa como linha comum (a mãe dele não está na lista); se só a mãe entra, o Ajuste não aparece e não soma. É o único jeito de o total do rodapé continuar igual ao valor do Bloco em todos os casos. Custo conhecido: se o painel lateral está aberto num Ajuste que não entra, ele não aparece na grade (a opção A só vale para a linha, e a mãe fica); só acontece com dado editado fora do app.
- **Mãe dividida com filhas em parte (decisão).** A mãe nunca soma (`unidadesDoMes`), então só as filhas que entram aparecem; `agruparPartes` põe o cabeçalho da mãe se ao menos uma filha aparece e lista só as filhas visíveis. O total do rodapé é a soma dessas filhas.
- **Soma simples e o resto.** Só em Blocos de soma simples (um operando, ou soma de operandos) o total da grade é o valor do Bloco. Em "Rangel + (Casal ÷ 2)" a grade mostra os Lançamentos do Casal inteiros (o que entra na conta) e o rodapé é o do Casal, não o R$ 2.819,68 do Bloco; é a leitura certa de "de onde vem" e está coberta no teste de outubro.
- **Estado.** `FiltrosGrade.bloco` guarda só o id. Trocar de Mês mantém o filtro e `entram` é recalculado pela projeção do Mês novo. Bloco editado recalcula (e a pílula mostra o nome novo). Reordenar não mexe no filtro. `blocos` é lido pelo mesmo gerenciador (`useLinhas("blocos")`) que o cartão usa.
- **Bloco ausente ou sem valor.** `resolverBloco` devolve `ausente` (excluído em outro aparelho) ou `sem_valor` (a Fórmula não calcula); o Painel desfaz o filtro durante a renderização (padrão já usado na linha excluída fora) e um efeito mostra o aviso. "Ausente" só desfaz com `blocos` já lido (`status === "pronto"`), para não apagar o filtro enquanto a lista carrega. A exclusão feita aqui chama `aoExcluindo` antes de gravar, então só o aviso "Bloco excluído" aparece.
- **Cartão.** O corpo do cartão (nome, valor, legendas e Fórmula) é um único `<button aria-pressed>` com nome "Filtrar a grade pelo Bloco {nome}, {valor}" (sem valor: ", sem valor", desativado). ⋯ e 💬 ficam por cima, no canto, como irmãos do botão (nada de botão dentro de botão) e mantêm "Ações do Bloco {nome}" e "Gerar mensagem do Bloco {nome}" (💬 ainda desativado). O toque longo continua no `<li>` (`useToqueLongo`), e o clique engolido depois dele pega o botão porque o `onClickCapture` fica no ancestral. Em Reordenar o corpo vira `<div>`. Alvos: o cartão inteiro passa de 44 pt, ⋯ e 💬 têm a área de toque de 44 pt de antes. O anel de foco global (`:focus-visible`) vale para o botão. O ativo é anunciado por `aria-pressed` e pela pílula na barra (não só pela borda).
- **Anúncio.** Ligar, trocar e desfazer o filtro passam por `mudarFiltros`, que liga o `role="status"` oculto de "N lançamentos" (o mesmo da 2.6); o filtro desfeito sozinho também anuncia.
- **Sem migração.** Nada é gravado; nenhuma tabela ou RPC muda, `database.types.ts` não muda.
- **Não verificado aqui:** layout e toque no iPad (o jsdom não tem layout: o espaço reservado à direita da Fórmula para os botões, a altura do cartão com a Fórmula longa em 3 colunas a 834 pt, o contorno de 1 px nos dois modos, o anel de foco por teclado); o toque longo de verdade (o teste simula o detector com temporizador falso); VoiceOver lendo o cartão como botão com estado e a pílula. A migração `20261122120000_reordenar_blocos.sql` da 4.2 pode ainda não estar em produção (não foi lido nem alterado nada em produção); `npm test` tem 2 falhas de timeout de 5 s nos testes que sobem o ESLint (`eslint-nucleo`, `eslint-formatos`), as mesmas na `main`, e passam rodando sozinhos.

## Spec Change Log

## Review Triage Log

Revisão feita por mim, na própria sessão, sobre o diff (sem os revisores independentes do bmad-build). Pontos checados, sem defeito verificado: o filtro não afeta o hero, a Conferência nem a Seleção do Mês; `separarAjustes` sobre as unidades restritas não deixa Ajuste órfão fora da grade; `desfazer` durante a renderização não entra em laço (o estado vira `inativo` na renderização seguinte); a linha aberta que já está na grade não vira "fixa" duplicada; o filtro não é gravado em lugar nenhum; o texto da pílula e os nomes acessíveis saem do mapa único; sem `console.*` e sem cor literal nova.

## Design Notes

**Escolhas minhas:** o ativo ganha `ring-1` além da borda (o "+1 px de contorno" do DESIGN.md); a pílula do Bloco fica fora do popover "Mais" (sempre visível, também no iPad em pé); Bloco sem valor não filtra em vez de mostrar uma grade vazia enganosa.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde (menos os 2 timeouts conhecidos de `eslint-*`, que passam sozinhos)
- Sem migração nem teste de integração novos nesta história.
