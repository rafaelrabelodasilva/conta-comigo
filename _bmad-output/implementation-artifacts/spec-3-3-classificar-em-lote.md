---
title: 'História 3.3: Classificar em lote'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'a423dbc8c5dd771dd8c518167421e6e8c532eef5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Na fila do Revisar cada item se classifica sozinho; as três compras da Shopee do Casal custam três toques, e a barra de Seleção do Painel (Épico 4) ainda não tem função de lote para chamar (FR-14).

**Approach:** Uma RPC em transação (`classificar_em_lote`) grava todas as linhas de uma vez; o núcleo calcula o que cada linha grava e o que cada Regra aprende; a fila ganha caixas, "Selecionar todos", a barra de lote e o "Desfazer". `classificarEmLote(ids, campos)` fica pronta para o Épico 4; a grade do Painel não é tocada.

## Boundaries & Constraints

**Always:**
- **Uma gravação só (AD-3).** Todas as linhas (mães e Ajustes) vão numa chamada `classificar_em_lote(p_itens jsonb)`, em transação, tudo ou nada: `p_itens` = lista de `{ id, corpo }`, cada `corpo` com as colunas já calculadas pelo núcleo (lista fechada: `responsavel_id`, `tipo_id`, `status_id`, `observacao`, `revisao_motivo`, `revisao_dados`, `revisado_em`, `editado_em`; chave ausente = coluna intocada, `null` = grava nulo). Itens com valores diferentes ("Aplicar sugestões") cabem na mesma chamada. A RPC só grava; devolve as linhas gravadas (jsonb) e recusa tudo se algum `id` não existir ou estiver excluído (mais de 1000 itens: recusa). `security invoker` (RLS), `search_path` vazio, como `importar_fatura`.
- **Falha = nada mudou.** Qualquer erro (RPC, rede, id sumido) desfaz o otimismo, mantém a marcação e mostra `mensagem(codigo)` (`salvar.falhou` ou `conexao.gravar_sem_conexao`). Não existe lote pela metade.
- **Mesma regra de `atualizar`.** O que cada linha grava (só colunas que mudam; sai da fila quando fica com Responsável e Tipo: `revisao_motivo/dados = null`, `revisado_em`; `editado_em` = relógio do aparelho) sai de uma função do núcleo extraída de `atualizar`, usada pelos dois. Nada de reimplementar em tela ou SQL.
- **API:** `classificarEmLote(ids, campos)` e `classificarEmLote(entradas: {id, campos}[])`, com `campos` = `{ responsavel_id?, tipo_id?, status_id?, observacao? }`. Sem limpar Responsável ou Tipo. Devolve as linhas e o retrato de "antes" para o Desfazer.
- **Ajustes.** Mãe que recebe Responsável ou Tipo leva os Ajustes dela na mesma chamada: só `responsavel_id`/`tipo_id` (Status e Observação não), mais `editado_em` e, se a mãe sai da fila, `revisado_em`. Sem motivo próprio, sem Regra. Ajuste cujo id já é de uma mãe do lote não entra duas vezes.
- **Regras.** Depois da RPC, sem esperar e sem desfazer o lote se falhar: um evento por mãe (como `atualizar`, só se o lote escolheu Responsável ou Tipo), agrupados por `chaveDeRegra` e dobrados no núcleo (`aprenderEmLote`, a mesma `aprenderRegra` evento a evento). `regrasRepo.aprender` aceita um evento ou uma lista, lê e grava cada chave uma vez e continua sendo a única função que grava em `regras`. Nomes diferentes com a mesma chave somam na mesma Regra; chaves diferentes, uma Regra cada. Status e Observação não ensinam.
- **Desfazer.** O aviso "N classificados · Desfazer" (6 s) chama a mesma RPC com os valores de antes de cada linha (mães e Ajustes): Responsável, Tipo, Status, Observação, motivo, dados, `revisado_em` e `editado_em`. A Regra aprendida não é desfeita (a contagem só soma).
- **Tempo real.** A resposta da RPC entra no gerenciador da fila em lote (`aplicarLote`); os outros aparelhos recebem os UPDATEs pelo Realtime. Otimismo com `gravarComOtimismo`.
- **Marcação (iPad).** Caixa de 44 pt na 1ª coluna (visual de 18 px; o toque usa a coluna de 30 mais o recuo de 14 do item); item marcado com fundo `selection`; grupo com título "NOME · N lançamentos" ganha caixa de três estados (nenhum/parcial/todos) que marca ou desmarca o grupo; "Selecionar todos" no topo da lista (todos os Meses da fila); funções `alternarSelecao`, `alternarTodos`, `estadoCaixaCabecalho` e `selecaoValida` de `domain/lancamento.ts`. Item que sai da fila (outro aparelho, ou este lote) sai da marcação sem aviso e sem gravar; a contagem da barra se atualiza e o leitor de tela a anuncia (`role="status"`).
- **Barra de lote** (`selection-bar`: fundo `nav`, branco, raio `md`, sombra flutuante), presa embaixo, só com 1+ marcado: "N selecionados · R$ total" (total em negrito; soma líquida, mãe mais Ajustes), "Limpar", "Responsável…", "Tipo…" e "Aplicar sugestões" (primário). "Responsável…" e "Tipo…" abrem uma Janela com um Seletor (ativos, mais usados primeiro por `contarUsos`) e "Aplicar a N". O toast sobe acima da barra enquanto ela existe.
- Manter tudo da 2.3 à 3.2 e da reimportação: hero, troca de Mês, ordenação, faixa da Conferência, bolinha, filter-bar, painel do Lançamento, Ajustes, Regras, Fila ("Confirmar", "Mudar", "Desfazer", "Faltam N", contador, "Tudo revisado"). Migração em `supabase/migrations`; `database.types.ts` igual ao gerado.

**Never:** mexer em `GradeLancamentos`, `Painel` ou na barra de Seleção do Painel (Épico 4); lote para Divisão, Apelido, Status/Observação na tela do Revisar (só a função); tela de Regras; variantes da 3.6/3.11; `supabase.from()` em tela; `console.*`; apagar ou reimportar dados de produção; fechar a pendência do VoiceOver (2.4).

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| 3 SHOPEE do Casal | 3 itens marcados, "Responsável…" Casal, os 3 já com Tipo | os 3 saem da fila numa chamada; Faltam N−3; Regra SHOPEE com contagem de Casal +3 (`aprenderEmLote`); toast "3 classificados · Desfazer" | N/A |
| Falta o Tipo | item sem Tipo próprio e com Tipo só sugerido, "Responsável…" | grava só o Responsável; continua na fila, agora com ✓ | N/A |
| Mãe com Ajuste | mãe marcada + Tipo escolhido | mãe e Ajuste na mesma chamada; Ajuste sem motivo e sem Regra; contador não conta o Ajuste | N/A |
| Itens de Nomes diferentes | marcados SHOPEE X e AMAZON Y, Responsável Casal | uma Regra por chave, Casal em cada; mesma chave soma na mesma Regra | N/A |
| Aplicar sugestões, itens mistos | alguns com sugestão completa (também com dúvida), outros sem | grava os completos; os outros ficam marcados; toast "5 classificados · 2 sem sugestão completa" | N/A |
| Item sai por outro aparelho | marcado, classificado no outro iPad | some da lista e da marcação; barra recalcula; lote segue com os restantes | N/A |
| Falha ou sem rede | RPC erra / offline | nada gravado, otimismo desfeito, marcação mantida, toast com o motivo | `salvar.falhou`, `conexao.gravar_sem_conexao` |
| Desfazer | toque em "Desfazer" em 6 s | todas as linhas voltam (inclusive Ajustes) e à fila; Regra fica | `salvar.falhou` |
| Lote vazio | nenhum campo muda (já estava assim) | nada é gravado nem avisado | N/A |

**Decisões do Rafael (10/11/2026):**
- **Regra (1-A):** por linha, dobrada por chave: três SHOPEE do Casal somam 3.
- **Aplicar sugestões (2-A, 3-A):** aplica nos marcados com sugestão completa, inclusive os "com dúvida" (como o ✓); os sem sugestão completa ficam marcados e o toast diz "N classificados · M sem sugestão completa".
- **Responsável… / Tipo… (4-A):** grava só o campo escolhido; o item continua na fila (com ✓ se a sugestão completa o resto).
- **Tamanho (5-A):** spec inteira, como a 3.1 e a 3.2; subagentes na revisão.

</frozen-after-approval>

## Code Map

**Núcleo** (`src/domain`)
- `lancamento.ts:313-345` -- reuso de `alternarSelecao`, `alternarTodos`, `estadoCaixaCabecalho`, `selecaoValida` (a marcação).
- `lote.ts` (novo) -- `planejarGravacao(atual, mudanca, agora)` (extraído de `atualizar`: corpo, saída da fila, volta à fila), `planejarLote(entradas, linhas, agora)` → itens da RPC (mães e Ajustes) + retrato de antes + eventos de Regra, `entradasDeSugestoes(itens)`, `totalDaSelecao`.
- `regras.ts:147` -- `aprenderRegra` (reuso); novo `aprenderEmLote(atual, eventos, agora)` que a dobra.
- `revisar.ts:76-101` -- `ItemDaFila.aoConfirmar`/`confirmavel` alimentam "Aplicar sugestões"; `idsQueAcompanham` (`ajustes.ts:161`) acha os Ajustes.
- `mensagens.ts:458-500` -- textos do lote (`TEXTOS_REVISAR`, rótulos "N selecionados", "N classificados", janela).

**Dados**
- `supabase/migrations/20261113120000_classificar_em_lote.sql` (novo) -- a RPC, `grant` só a `authenticated`.
- `src/data/database.types.ts` -- `classificar_em_lote: { Args: { p_itens: Json }, Returns: Json }`, em ordem alfabética, igual ao gerado.
- `src/data/lancamentos-repo.ts:105-370` -- `atualizar` passa a usar `planejarGravacao` (testes existentes guardam); novos `classificarEmLote` e `desfazerLote`; `repoLancamentosRevisar()` (linha 391) os expõe; `repoLancamentos()` também (Épico 4).
- `src/data/regras-repo.ts:38-68` -- `aprender` aceita lista; uma leitura e um upsert por chave, em fila por chave.
- `src/data/gravacao.ts` -- `gravarComOtimismo` (reuso); `realtime.ts:253` `aplicarLote` já tira e põe linhas por predicado da fila.

**Telas**
- `src/features/revisar/Revisar.tsx`, `ItemRevisar.tsx` (coluna 1, `grid-cols-[30px_…]` linha 26) -- marcação, `emCurso`/`ocupados` valem para o lote.
- `src/features/revisar/BarraLote.tsx`, `JanelaLote.tsx` (novos); `JanelaMudar.tsx` como modelo (Janela + Seletor + `ordenarPorUso`).
- `src/ui/Toast.tsx:~80` -- posição `bottom-6` passa a somar `--altura-barra-inferior` (a barra publica a altura).
- Sem mudança: `GradeLancamentos.tsx`, `Painel.tsx`, `PainelLancamento.tsx`.

**Testes**: `lote.test.ts`, `regras.test.ts`, `lancamentos-repo.test.ts`, `regras-repo.test.ts`, `Revisar.test.tsx`, `ItemRevisar.test.tsx`, `BarraLote.test.tsx`, `JanelaLote.test.tsx`; integração `test/integracao/lote.test.ts` (só no CI).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/lote.ts`, `regras.ts`, `mensagens.ts` + testes -- planejamento do lote, Ajustes, retrato, `aprenderEmLote`, textos
- [x] `supabase/migrations/20261113120000_classificar_em_lote.sql`, `database.types.ts`, `test/integracao/lote.test.ts` -- RPC tudo-ou-nada, RLS, recusa de id sumido
- [x] `src/data/lancamentos-repo.ts`, `regras-repo.ts` + testes -- `atualizar` sobre o núcleo, `classificarEmLote`, `desfazerLote`, `aprender` em lista
- [x] `src/features/revisar/*`, `src/ui/Toast.tsx` + jsdom -- caixas, grupo, "Selecionar todos", barra, janelas, Desfazer, marcação que se poda sozinha
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- registrar o que sobrar da revisão

**Acceptance Criteria:**
- Given o deploy, when Rafael abre o Painel e o Revisar, then hero, troca de Mês, ordenação, faixa, bolinha, filtros, painel, Ajustes, "Confirmar", "Mudar", contador e "Tudo revisado" ficam como na 3.2.
- Given itens marcados, when aplica "Responsável…", "Tipo…" ou "Aplicar sugestões", then todos mudam numa chamada, "Faltam N" e o contador do menu baixam juntos, e o outro aparelho vê sem recarregar.
- Given o toast "Desfazer", when toca, then as linhas (e Ajustes) voltam à fila como estavam e a Regra aprendida permanece.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---|---|---|---|---|
| 1 | blind + edge | Mais de 1000 itens (Selecionar todos + Ajustes) → `salvar.falhou` genérico, sem divisão em partes | low | a fila tem dezenas de itens; dividir em partes quebraria o tudo-ou-nada; limite a anos de distância | rejeitado |
| 2 | blind | `auth.sessao_expirou` da RPC vira `salvar.falhou` | low | sem sessão o RLS também recusa; mensagem genérica basta | rejeitado |
| 3 | blind + edge + gap | Desfazer sobrescreve edição mais nova de outro aparelho; linha excluída falha o Desfazer inteiro | low | um usuário só, janela de 6 s, AD-3; já registrado no deferred-work | rejeitado (já registrado) |
| 4 | blind | Despacho de `classificarEmLote` por `typeof primeiro[0]`; `ids` vazio lê `campos` como opções | low | `ids` vazio não grava nada (plano vazio), então perder as opções não tem efeito | rejeitado |
| 5 | blind | `aprender(lista)` dispara uma leitura e um upsert por chave, em paralelo e sem teto | low | lote de dezenas de chaves; por chave é decisão da spec (1-A) | rejeitado |
| 6 | blind | Exceção síncrona de `aprender` sem teste | low | `ensinarLote` já tem try/catch; a falha não chega ao lote | rejeitado |
| 7 | blind | A RPC não valida cadastros do dono nem a invariante de saída da fila | false | FKs compostas `(owner_id, responsavel_id|tipo_id|status_id)` impedem cadastro de outro dono; a regra de negócio é do núcleo (AD-1) | rejeitado |
| 8 | blind + edge | Dois lotes simultâneos podem travar linhas em ordem oposta (deadlock) | low | um usuário só; exige dois aparelhos aplicando nas mesmas linhas no mesmo instante | rejeitado |
| 9 | blind + edge | `aplicarEntradas` descarta em silêncio os ids que já têm gravação individual em curso | low | real, mas a correção é direta: barra desligada enquanto `ocupados` não está vazio | patch (feito) |
| 10 | blind + edge | Mãe com plano vazio não sincroniza Ajustes diferentes dela | low | Ajuste nasce igual à mãe e só muda junto com ela; o desvio exige edição à mão do Ajuste | rejeitado |
| 11 | blind | Poda da marcação espera `ocupados` esvaziar | low | transitório (fim da gravação); sem perda | rejeitado |
| 12 | blind | Foco some quando a barra desmonta; contagem `role=status` verbosa; janela sem erro inline | low | mesmo padrão de JanelaMudar e do toast; pendência de VoiceOver já aberta | rejeitado |
| 13 | blind + gap | `colunasQueMudam` duplica `colunasAlteradas` (data) | low | AD-1 proíbe o núcleo importar `src/data`; mover o outro exigiria tocar quatro repositórios | rejeitado |
| 14 | blind | Casts em `planejarGravacao`/`chamarLote`; id da resposta não conferido; linha longa em comentário | low | só tipagem e estilo; a contagem já é conferida | rejeitado |
| 15 | edge | `classificarEmLote` ou `aoAplicar` que lançam deixam `lotando`/`ocupados` presos | low | o repositório não lança (try/catch em `gravarComOtimismo`); mesmo padrão do `classificar` da 3.2 | rejeitado |
| 16 | edge | RPC grava mas a resposta vem truncada: UI mostra falha | low | o Realtime reconcilia; exige resposta truncada com sucesso no banco | rejeitado |
| 17 | edge | Espaçador fixo `h-20` menor que a barra quebrada em duas linhas | medium | a barra pode passar de 80 px em tela estreita e cobrir os últimos itens | patch (feito: usa `--altura-barra-inferior`) |
| 18 | edge | Janela do lote aplica cadastro arquivado por outro aparelho com a janela aberta | low | exige arquivar o cadastro exatamente durante a janela | rejeitado |
| 19 | edge | A poda da marcação apaga tudo numa releitura transitória | false | `reler` troca o estado de uma vez só; não existe estado intermediário vazio com status `pronto` | rejeitado |
| 20 | gap | Altura publicada e `ResizeObserver` sem teste observável | medium | trocar por constante `8px` não quebrava nenhum teste | patch (feito: teste com `offsetHeight` e observador falsos) |
| 21 | gap | Toast diz "N classificados" para item que ganhou só um campo e continua na fila | low | texto da spec ("classificados"); o item segue visível com o campo novo | rejeitado |

## Design Notes

**Por que uma RPC com `corpo` por linha.** "Aplicar sugestões" dá valores diferentes a cada item, então um `update … in (ids)` com corpo único não basta; várias requisições perderiam o tudo-ou-nada. Como a RPC só aplica colunas já calculadas (lista fechada), o "Desfazer" é a mesma chamada com os valores de antes, sem segunda função.

**Regras por linha, uma gravação por chave.** `aprenderRegra` é puro e evento a evento; dobrar N eventos dá o mesmo resultado de N toques seguidos, mas com uma leitura e um upsert por chave. `chaveDeRegra` não vai ao SQL (AD-6), por isso o aprendizado fica no cliente, depois da RPC.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- tudo verde (integração e Supabase local só no CI)
