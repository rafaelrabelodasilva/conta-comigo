---
title: 'História 4.2: Blocos no Painel'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '136e793127939f1c5e2a0e976b467f3eee212c93'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-montar-um-bloco-com-fichas.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** os Blocos criados na 4.1 aparecem no Painel só como nome e Fórmula, sem valor: Rafael não vê "quanto cada pessoa me deve" no Mês, e não consegue editar, ver o cálculo, reordenar nem excluir um Bloco (FR-19, FR-54).

**Approach:** o cartão "Blocos" passa a mostrar cada Bloco como `block-card` (bolinha, valor, Fórmula legível, ⋯ e 💬), com o valor vindo de `avaliar` sobre `projetarPainel` do Mês aberto e recalculado no lugar a cada evento do Realtime. O menu ⋯ (ou toque longo) liga o Montador (Editar fórmula, Ver cálculo só leitura), Reordenar (tremor, arrastar, "Concluir") e Excluir com confirmação. Uma migração nova grava a ordem numa transação. O passo "Blocos" entra no Primeiro uso.

## Boundaries & Constraints

**Always:** regra de negócio só em `src/domain` (imports relativos, funções puras): o valor, o "inclui previstos", a bolinha, o aviso de arquivado e a ordem saem do núcleo; a tela só chama. Dinheiro e texto pelos formatadores do núcleo. O valor do cartão, o passo a passo de "Ver cálculo" e (4.7) a mensagem leem a mesma `avaliar` sobre a mesma `projetarPainel`. Realtime só pelo gerenciador único e `useLinhas`; os valores mudam no lugar, sem esqueleto (o esqueleto só na primeira leitura de `blocos`). Schema só por migração; `database.types.ts` à mão no formato do gerado. Gravação só pelo repositório de Blocos. Textos pelo mapa único (`mensagens.ts`); nomes do Glossário sem acento.

**Never:** gerar mensagem (o 💬 só existe, desativado, até a 4.6/4.7); filtrar a grade pelo Bloco (4.3); Seleção com total (4.4); modelo e geração da mensagem (4.5 a 4.7); Recebimentos (Épico 7); `console.*`; aplicar a migração em produção ou ler produção sem a confirmação do Rafael.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cartão | Bloco "Casal" = Responsável Casal; Mês com R$ 5.639,35 do Casal | `block-card` com bolinha do Casal, "R$ 5.639,35", subtítulo "Casal", ⋯ "Ações do Bloco Casal" e 💬 "Gerar mensagem do Bloco Casal" desativado | N/A |
| Duas pessoas | "Rangel + (Casal ÷ 2)" | Sem bolinha; subtítulo com os parênteses como montados; R$ 2.819,68 | N/A |
| Tempo real | Lançamento muda em outro aparelho | O valor muda no lugar, sem esqueleto e sem recarregar | N/A |
| Mês sem Fatura | Previsto entra no Bloco | Soma o previsto e mostra "inclui previstos" (só nos Blocos em que um previsto entra) | N/A |
| Sem Blocos | nenhum | "Crie seu primeiro Bloco para ver os totais por pessoa" + "＋ Novo bloco" | N/A |
| Editar fórmula | ⋯ → Editar fórmula | Montador com o Bloco; salvar manda `p_id` e mantém a `ordem` (renomear entra aqui) | falha: toast e a janela continua |
| Ver cálculo | ⋯ → Ver cálculo | Montador só leitura: nome, Fórmula, resultado e passo a passo (mesmo número do cartão), só "Fechar" | N/A |
| Excluir | ⋯ → Excluir bloco | Confirmação; o de cobrança avisa "Este Bloco aparece em Recebimentos"; "Bloco excluído" | recusa: toast do mapa único |
| Reordenar | "Reordenar" ou ⋯ → Reordenar | Cartões tremem (só com movimento permitido), alça arrasta, ‹ › movem; botão vira "Concluir"; grava `ordem` 1, 2, 3… | recusa: o banco volta à ordem de antes e avisa |
| Bloco apagado em outro aparelho | janela de Editar/Ver aberta | A janela fecha | N/A |
| Falha ao ler `blocos` | erro de leitura | O Painel segue; o cartão mostra "Não foi possível carregar os Blocos." e "Tentar de novo" | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/blocos.ts` -- ganha `resumirBloco`, `responsavelUnico`, `citacoesDaFormula`, `arquivadosNaFormula`, `moverNaOrdem`, `planejarReordenar`.
- `src/domain/projecoes.ts` -- ganha `idsDosPrevistos`; `LancamentoParaProjetar` ganha `lancado_por?`.
- `src/domain/mensagens.ts`, `primeiro-uso.ts` -- textos novos de `TEXTOS_BLOCO`, rótulos de acessibilidade, `bloco.ordem_invalida`; passo `blocos` entre `planilha` e `ciclo`.
- `supabase/migrations/20261122120000_reordenar_blocos.sql`, `src/data/database.types.ts` -- RPC `reordenar_blocos`.
- `src/data/blocos-repo.ts` -- `reordenar` (com otimismo) e `excluir`.
- `src/features/painel/CartaoBlocos.tsx` (apresentação), `BlocosDoMes.tsx` (estado e ligação), `MontadorBloco.tsx` (modo `somenteLeitura`), `Painel.tsx` (usa `BlocosDoMes`; `blocos` entra em `TABELAS`).
- `src/features/primeiro-uso/SecaoBlocos.tsx`, `PassoAPasso.tsx` -- passo "Blocos".
- `src/app/globals.css` -- `.bloco-tremendo` só com `prefers-reduced-motion: no-preference`.
- `test/integracao/blocos.test.ts` -- reordenar e excluir (só roda no CI).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/{blocos,projecoes,mensagens,primeiro-uso}.ts` (+ testes) -- valor/previstos/bolinha/arquivados/ordem e textos no núcleo
- [x] `supabase/migrations/20261122120000_reordenar_blocos.sql`, `database.types.ts` -- RPC `reordenar_blocos`
- [x] `src/data/blocos-repo.ts` (+ teste), `test/integracao/blocos.test.ts` -- reordenar e excluir
- [x] `CartaoBlocos.tsx`, `BlocosDoMes.tsx`, `MontadorBloco.tsx`, `Painel.tsx`, `globals.css` (+ testes) -- `block-card`, menu, Ver cálculo, Reordenar, Excluir
- [x] `SecaoBlocos.tsx`, `PassoAPasso.tsx` (+ testes) -- passo "Blocos" do Primeiro uso
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.2 em `review`; pendências

**Acceptance Criteria:**
- Given Blocos criados, when Rafael abre o Painel, then cada Bloco é um `block-card` com valor da `avaliar`, Fórmula legível, ⋯ e 💬, e a bolinha só nos Blocos de um Responsável.
- Given um Lançamento que muda em qualquer aparelho, when o Realtime avisa, then o valor do Bloco muda no lugar, sem esqueleto.
- Given o menu ⋯, when Rafael escolhe Editar fórmula, Ver cálculo, Reordenar ou Excluir bloco, then cada ação faz o descrito acima, com confirmação em Excluir.
- Given o Primeiro uso, when Rafael avança por ele, then o passo "Blocos" vem depois de "Importar planilha" e antes de "Ciclo do cartão".

## Implementation Notes

- **Valor e "inclui previstos".** `resumirBloco(bloco, projetarPainel(...), idsDosPrevistos(...))` devolve valor, avaliação, bolinha e `incluiPrevistos` (algum previsto está em `avaliacao.entram`). A legenda aparece em todo Bloco em que um previsto entra, num Mês sem Fatura (todos os Lançamentos são previstos) e também no Mês com Fatura que ainda guarda previstos sem par; é a leitura honesta do critério "somam os previstos com a legenda".
- **Bolinha.** `responsavelUnico`: todo operando é Responsável ou Responsável em Tipo e só há um Responsável distinto. "Rangel + (Casal ÷ 2)" não tem bolinha (duas pessoas); Tipo ou Todos também não.
- **Reordenar.** `reordenar_blocos(p_ids uuid[])` (security invoker) numera 1, 2, 3… os ids pedidos; um Bloco do dono que ficou fora da lista (criado em outro aparelho durante o arrasto) vai depois, na ordem que tinha; id alheio ou inexistente é ignorado; só devolve as linhas cuja `ordem` mudou. O repositório mostra a ordem já (otimismo) e desfaz se o banco recusar. Arrastar usa eventos de ponteiro na alça (`touch-none`), calcula o cartão sob o ponteiro e só grava ao soltar; `pointercancel` desfaz. Os botões ‹ › movem sem arrastar (VoiceOver e teclado). O tremor é CSS e só com `prefers-reduced-motion: no-preference`; com "reduzir movimento" o cartão fica parado e leva a borda tracejada.
- **Excluir.** Sem mudança de schema: a política `blocos_delete_dono` e o `replica identity full` da 4.1 bastam. `meu_bloco` e o índice parcial continuam coerentes: apagar o Bloco marcado só libera a marca, nenhum outro a herda e outro Bloco pode recebê-la (provado em `test/integracao/blocos.test.ts`). Nenhuma outra tabela aponta para `blocos`.
- **`blocos` no Painel.** A tabela entrou em `TABELAS` ("Tentar de novo" do Painel a relê), mas continua fora de `retratos`: uma falha só dela não derruba o Painel; o cartão avisa e tem o próprio "Tentar de novo". A 4.1 tinha esse desenho por causa da migração ainda fora da produção; agora ela está lá e o cartão trata o erro.
- **Barra por Responsável e previstos (decisão).** Fica como está: a barra do hero soma todos os Lançamentos do Mês, previstos incluídos, como os Blocos. Assim o Bloco "Todos" e a soma das barras coincidem e o número que Rafael confere no hero é o do Bloco. "Total a pagar" e Conferência seguem só com a Fatura. Se um dia a barra deixar os previstos de fora, o Bloco continua somando (decisão da 4.1) e a diferença passa a ser explicada pela legenda "inclui previstos".
- **Cadastro arquivado.** `arquivadosNaFormula`: o cartão mostra "Cita Rangel (arquivado)" (uma linha de legenda); o valor não muda (AD-16). A Fórmula ilegível (só por edição direta no banco) continua fora de `lerBlocos`, sem aviso: voltou ao `deferred-work.md`.
- **Primeiro uso.** `PASSOS_PRIMEIRO_USO` ganha `blocos` entre `planilha` e `ciclo` (o passo "Mensagem" da 4.5 entra depois dele). O último passo continua sendo "Ciclo do cartão": `primeiro_uso_em` só é gravado ao concluir ou pular ali, como antes. `SecaoBlocos` reaproveita `BlocosDoMes` (criar, editar, ver, reordenar, excluir) com os Lançamentos do Mês atual (abre o Mês pelo gerenciador) ou zerado se não houver. O Montador grava ao salvar, então o passo não tem rascunho.
- **Não verificado aqui:** migração, RPC e `test/integracao/blocos.test.ts` (sem Docker nem Supabase CLI: o job `supabase` do CI cobre migração, integração e a igualdade de `database.types.ts` com `supabase gen types`; a função SQL foi exercitada só num Postgres em memória fora do projeto, com tabela simplificada: ordem nova, lista parcial, id alheio e inexistente, duplicado, vazio e sem sessão); layout, o arrasto de verdade e o toque longo no iPad (o jsdom não tem layout; o arrasto foi testado com retângulos simulados); VoiceOver. `npm test` tem 2 falhas de timeout de 5 s nos testes que sobem o ESLint (`eslint-nucleo`, `eslint-formatos`), as mesmas na `main` sem esta história; passam rodando sozinhos.

## Spec Change Log

## Review Triage Log

Revisão feita por mim, na própria sessão, sobre o diff completo (sem os revisores independentes do bmad-build). Pontos checados, sem defeito verificado: o `pointercancel` desfaz o arrasto sem gravar (corrigido durante a revisão: antes gravava); soltar no mesmo lugar não grava; `planejarReordenar` recusa repetido, faltando, sobrando e desconhecido; menu "Reordenar" com um Bloco só não liga o modo (o botão some com menos de 2); a janela de Editar/Ver fecha se o Bloco some em outro aparelho; "Ver cálculo" usa a Fórmula gravada do Bloco e não a das fichas; exclusão cancelada não grava; nome do 💬 e do ⋯ pelo mapa único; sem `console.*`; sem cor literal nova (só tokens).

## Design Notes

**Escolhas minhas:** "inclui previstos" é por Bloco e só quando um previsto entra; Bloco com Tipo ou Todos não tem bolinha; a alça de arrastar é um botão com nome ("Arrastar o Bloco X") e os botões ‹ › existem sempre no modo Reordenar, porque arrastar sozinho não é acessível; o 💬 desativado leva `title` "A mensagem do Bloco chega numa próxima versão".

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde (menos os 2 timeouts conhecidos de `eslint-*`, que passam sozinhos)
- migração e teste de integração -- expected: rodam no CI (sem Docker aqui)
