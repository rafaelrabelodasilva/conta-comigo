---
title: 'História 3.2: Fila do Revisar'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'b3371075be1cad19afe1045f3fc875f4b41a4706'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A 3.1 já grava `revisao_motivo` e `revisao_dados` na importação, mas nada os lê: Rafael não tem onde fechar a revisão e o menu não diz quanto falta (FR-13).

**Approach:** Um gerenciador de Realtime próprio da fila (Lançamentos com motivo, mais os Ajustes), uma função do núcleo que monta grupos e variantes, a tela Revisar com `review-item` de 64 pt, o contador no menu e o botão "Ir para revisão" depois de importar. Confirmar e "Mudar" gravam pelo `lancamentosRepo.atualizar`, que já limpa o motivo e ensina a Regra.

## Boundaries & Constraints

**Always:**
- **Uma consulta só.** `ehDaFila(linha)` no núcleo = `excluido_em` nulo, `ajuste_de_id` nulo e `revisao_motivo` não nulo. O gerenciador da fila lê e filtra os eventos por ela (mais os Ajustes, para acompanharem a mãe); "Faltam N", o contador do menu e a lista saem dele, e N é o mesmo número nos três.
- **Ajuste nunca é item nem conta** (sem motivo próprio, segue a mãe): aparece como linha menor "Ajuste − R$ 0,08" sob a mãe e recebe a classificação na mesma gravação (`junto`). Ajuste desvinculado sem classificação é linha comum e entra na fila como `sem_classificacao` (3.1).
- **Grava só pelo repositório.** Confirmar e "Mudar" usam `lancamentosRepo.atualizar` (limpa `revisao_motivo/dados`, ensina a Regra por `regrasRepo.aprender`); nenhuma outra função grava em `regras`. Segunda instância do repositório ligada ao gerenciador da fila.
- **`revisado_em`** = relógio do aparelho (como `editado_em`) na gravação que tira a linha da fila; volta a nulo quando a linha volta à fila. Nenhuma tela lê o campo na 3.2 (é para 3.3, 3.6 e 3.11).
- **Sugestão.** "Confirmar" (✓) só existe se a sugestão, com o que a linha já tem, completa Responsável e Tipo. Sugestão com id nulo (cadastro excluído sem substituto), arquivado ou inexistente conta como ausente (item vira "Sem sugestão"); `outros_responsaveis` ignora nulos. `sugestao_duvida`: o ✓ aplica o Responsável mais frequente e o texto leva "às vezes Rafael".
- **Desfazer.** Confirmar e "Mudar" mostram `toast` "Classificado · Desfazer" (6 s), que devolve classificação, motivo, dados e `revisado_em` anteriores (mãe e Ajustes); a Regra aprendida não é desfeita (contagem só soma, 6-A).
- **"Mudar"** abre uma Janela com Seletor de Responsável e de Tipo (só ativos; mais usados primeiro por `repoCadastros().contarUsos`; falhou → ordem do cadastro), pré-preenchida com o que a linha tem ou a sugestão. "Salvar" só com os dois escolhidos.
- **Tela:** lista agrupada por `normalizarNome` (grupo com 2+ itens ganha título "NOME · N lançamentos"); `review-item` de 64 pt em colunas 30 / 1fr / 210 / 84 / 104 (a 1ª fica reservada ao lote da 3.3, vazia); toque 44 pt; só tokens do DESIGN.md. Faixa de resumo da importação no topo, para o Mês da Fatura mais recente: "Importação de {mês} · ✓ Conferido (ou ⚠ diferença) · N lançamentos · N classificados · N para revisar". Fila vazia: "Tudo revisado. Nada novo neste mês", e o contador some. Carregando: esqueleto; erro: `ErroAoCarregar`.
- **Importação:** com `paraRevisar > 0`, depois de gravar o passo 3 mostra "N classificados · N para revisar" com "Ir para revisão" (principal) e "Ver no Painel"; com 0, fecha como hoje.
- Manter tudo da 2.3 à 3.1 e da reimportação: hero, troca de Mês, ordenação, faixa da Conferência, bolinha "verificar", filter-bar, painel do Lançamento, Ajustes, aprendizado das Regras. Migração em `supabase/migrations`; `database.types.ts` igual ao gerado (`jsonb not null` sai `NonNullable<Json>`).

**Decisões do Rafael (10/11/2026):**
- **Fila (1-A):** todos os Meses juntos; cada item leva o Mês quando há mais de um; "Faltam N", contador e lista são o mesmo número.
- **Linhas antigas (2-A, fecha a 8-B):** as linhas de out/26 e nov/26 da Fatura, sem Ajuste e não excluídas, sem Responsável ou sem Tipo e com motivo nulo, entram como `sem_classificacao` (a migração só preenche a coluna; nenhuma classificação muda).
- **Processo (3-A):** spec inteira e subagentes na revisão, como na 3.1.

**Never:** seleção e lote (3.3); variantes "valor mudou", "não veio na fatura" e "sumiu na reimportação" (3.6/3.11); tela de Regras (3.4); Divisão, Apelido, herança; mexer na grade ou no hero; `supabase.from()` em tela; `console.*`; apagar ou reimportar dados de produção; fechar a pendência do VoiceOver.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Sugestão completa | `sugestao`, dados Casal · Casa, linha sem classificação | ✓ grava Casal · Casa, limpa motivo e dados, `revisado_em`, ensina a Regra; item sai; Faltam N−1; toast Desfazer | N/A |
| Com dúvida | `sugestao_duvida`, Casal · Saúde, outros [Rafael] | "Casal · Saúde" e "às vezes Rafael"; ✓ aplica Casal · Saúde | N/A |
| Só Tipo sugerido | `sugestao`, dados {responsavel null, tipo Gatos} | "Sugestão: Gatos", sem ✓; "Mudar" abre com Gatos | N/A |
| Regra aplicou o Responsável | linha com Responsável, dados só com Tipo | ✓ grava só o Tipo e fecha o item | N/A |
| Sem sugestão | `sem_classificacao` | "Sem sugestão", só "Mudar" | N/A |
| Sugestão anulada | dados com ids nulos, ou cadastro arquivado | "Sem sugestão"; nulos fora de `outros_responsaveis` | N/A |
| Mãe com Ajuste | ✓ numa mãe com Ajuste −0,08 | mãe e Ajuste classificados juntos; contador não conta o Ajuste | N/A |
| Ajuste desvinculado | sem classificação, `fatura_id` | item comum "Sem sugestão" | N/A |
| Volta à fila | no Painel, limpar o Tipo de uma linha revisada | item volta, Faltam N+1, sem recarregar; `revisado_em` nulo | N/A |
| Fila esvaziada | último item classificado | "Tudo revisado. Nada novo neste mês"; contador some | N/A |
| Falha ao gravar | sem rede ou erro | item fica; toast com a mensagem do código | `salvar.falhou`, `conexao.gravar_sem_conexao` |
| Linhas antigas | out/26 e nov/26 sem Responsável ou Tipo, motivo nulo | entram como `sem_classificacao`, "Sem sugestão" | N/A |

</frozen-after-approval>

## Code Map

**Núcleo**
- `src/domain/revisar.ts` (novo): `ehDaFila`, `montarFila(linhas, cadastros)` → grupos por `normalizarNome` com itens (variante `sugestao | sugestao_duvida | sem_sugestao`, texto, `confirmavel`, classificação ao confirmar, Ajustes), `resumoDaFila`, `ordenarPorUso(cadastros, usos)`. Usa `lerDadosRevisao` (`classificacao.ts:166`) e `idsQueAcompanham` (`ajustes.ts:161`).
- `src/domain/mensagens.ts` -- `TEXTOS_REVISAR` e rótulos (reusa `textoSugestao`, linha 449).
- `src/domain/cadastros.ts` -- sem mudança de referências (`revisao_dados` já entra).

**Dados**
- `supabase/migrations/20261112120000_fila_revisar.sql` (novo): `revisado_em timestamptz` em `lancamentos`; backfill das linhas antigas (decisão 2-A).
- `src/data/database.types.ts` -- `revisado_em: string | null` em Row/Insert/Update de `lancamentos`, antes de `revisao_dados`.
- `src/data/realtime.ts:83-310` -- `criarGerenciador` ganha escopo por predicado e leitura filtrada (`pertence`, `filtrarLeitura`, nome do canal); `doEscopo` e a saída de linha no UPDATE já existem para `porMes`. Novo `gerenciadorFila()` no mapa (entra em `recarregarTodos`) e `useFilaRevisar()`.
- `src/data/lancamentos-repo.ts:179-224` -- `atualizar` grava `revisado_em` ao limpar o motivo e `null` ao devolver à fila (`soDaPrincipal`); `desvincular` idem; novo `devolverAFila` (Desfazer); `repoLancamentosRevisar()` ligado ao gerenciador da fila.
- `src/data/cadastros-repo.ts:50` -- `contarUsos` (reuso, sem mudança).

**Telas**
- `src/features/revisar/Revisar.tsx`, `ItemRevisar.tsx`, `JanelaMudar.tsx` (novos); `src/app/(app)/revisar/page.tsx` troca o `EstadoVazio` pela tela.
- `src/features/revisar/MenuLateral.tsx` (novo): cliente que lê o contador e renderiza `NavRail contadorRevisar`; `src/app/(app)/layout.tsx` o usa. `src/ui/NavRail.tsx` já tem o contador (`verify`).
- `src/features/importar/ImportarFatura.tsx:359-386` -- estado `concluido` com os dois botões; `src/features/painel/Painel.tsx` passa `aoIrParaRevisao` (`router.push("/revisar")`).

**Testes**: `revisar.test.ts`, `realtime.test.ts`, `lancamentos-repo.test.ts`, `Revisar.test.tsx`, `ItemRevisar.test.tsx`, `JanelaMudar.test.tsx`, `MenuLateral.test.tsx`, `ImportarFatura.test.tsx`, `layout.test.tsx` (mock do menu); integração `test/integracao/lancamentos.test.ts` (`revisado_em` nulo por padrão, RLS).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/revisar.ts`, `mensagens.ts` + testes -- fila, variantes, resumo, ordem por uso (matriz)
- [x] `supabase/migrations/20261112120000_fila_revisar.sql`, `database.types.ts`, `test/integracao/lancamentos.test.ts` -- coluna, índice, backfill
- [x] `src/data/realtime.ts`, `lancamentos-repo.ts` + testes -- gerenciador da fila, `revisado_em`, `devolverAFila`
- [x] `src/features/revisar/*`, `app/(app)/revisar/page.tsx`, `layout.tsx` + jsdom -- tela, janela "Mudar", contador
- [x] `ImportarFatura.tsx`, `Painel.tsx` + testes -- "Ir para revisão" / "Ver no Painel"
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- fechar as duas pendências da 3.2 (linhas antigas, sugestão anulada)

**Acceptance Criteria:**
- Given o deploy, when Rafael abre o Painel, then hero, troca de Mês, ordenação, faixa, bolinha, filtros, painel e Ajustes ficam como na 3.1.
- Given itens na fila, when abre Revisar, then "Faltam N" é igual ao contador do menu, e confirmar um item baixa os dois sem recarregar (também em outro aparelho).
- Given a fila esvaziada, when o último item é classificado, then aparece "Tudo revisado. Nada novo neste mês" e o contador some.

## Implementation Notes

- Fila: `ehDaFila` (não excluída, não Ajuste, com motivo) e `guardadaPelaFila` (a fila mais os Ajustes) em `src/domain/revisar.ts`; o gerenciador `gerenciadorFila()` (canal `tabela:lancamentos:fila`) lê com `.is("excluido_em", null).or(FILTRO_OR_DA_FILA)`, constante hoje em `src/data/realtime.ts`.
- Ordem: Mês mais antigo primeiro, depois `ordem_fatura`. Título do grupo com o Nome original do primeiro item.
- `atualizar` também tira da fila a linha que já tem Responsável e Tipo quando alguém pede essa classificação (o ✓ de uma linha completa); nesse caso nenhuma Regra é aprendida (nenhuma coluna de classificação muda).
- `devolverAFila` (Desfazer) grava os Ajustes primeiro e depois a mãe, em duas requisições; a Regra aprendida não é desfeita.
- O ✓ e o texto "Sugestão: …" usam os mesmos valores finais; Responsável/Tipo próprios arquivados contam como ausentes.
- Passo final da importação: só com `paraRevisar > 0`; o Mês importado já foi entregue ao Painel quando ele aparece.
- Migração: coluna `revisado_em` e o backfill de 2026-10 e 2026-11; o índice parcial foi retirado na revisão (a leitura da fila não o usaria).
- Teste de integração da leitura da fila e da coluna em `test/integracao/lancamentos.test.ts` (só roda no CI).

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind + edge + gap | A leitura da fila traz todos os Ajustes de todos os Meses, sem paginar; passando de 1000 linhas o contador trunca calado | low | Ajustes são poucos (cerca de 1 por Mês) e a fila tem dezenas; o limite está a anos de distância e o conserto pede paginação | rejeitado |
| 2 | blind + gap + edge | O índice parcial `(owner_id, mes)` não atende a leitura (OR com `ajuste_de_id`, sem filtro de Mês) | low | o planejador não o usa; é peso morto na escrita | patch (remover o índice) |
| 3 | blind + gap | O backfill é fixo em out/26 e nov/26 e não tem teste | low | é a decisão 2-A (Meses nomeados); não roda no CI porque o banco de teste nasce vazio; a conferência é o SELECT antes/depois no deploy | rejeitado |
| 4 | blind + edge | A janela "Mudar" desmonta quando o otimismo tira o item; se a gravação falha, a escolha se perde | medium | `mudando` vem de `itens.find`, e o item some no otimismo; o teste de falha usa um `atualizar` sem otimismo | patch |
| 5 | blind + edge | O Desfazer grava sem conferir se a linha mudou (outro aparelho, Painel, exclusão em 6 s) e não grava `editado_em` | low | um usuário só; a janela é de 6 s; o conserto pede checagem de versão | rejeitado |
| 6 | edge | Desfazer com Ajustes: Ajustes voltam e a mãe falha, deixando a mãe classificada com Ajustes sem classificação | low | exige a rede cair entre duas requisições seguidas | rejeitado |
| 7 | blind | O resumo do passo final da importação é do cliente, não do que o banco gravou | false | a 3.11 simplificada apaga e importa tudo de novo; o RPC grava o `revisao_motivo` do próprio corpo | rejeitado |
| 8 | blind + gap | `FILTRO_OR_DA_FILA` (texto do PostgREST) está em `src/domain` e o teste que o "fixa" compara a string com ela mesma | medium | AD-1: transporte fora do núcleo; nenhum teste executa a leitura real | patch (mover para `src/data` e teste de integração) |
| 9 | blind + edge | O ✓ grava o Responsável/Tipo próprio da linha mesmo arquivado, e pode gravar valor diferente do "Sugestão: …" mostrado | medium | `responsavelFinal = l.responsavel_id ?? sugeridoR` não valida contra os ativos | patch |
| 10 | blind | "Sugestão" fixo no componente; `importacao_concluida` sem uso; cabeçalho "Passo 3 de 3" no resumo | low | texto fora de `mensagens.ts` e constante morta; o cabeçalho continua o passo 3, como a spec | patch (texto e constante); cabeçalho rejeitado |
| 11 | blind | A tela abre um segundo Mês de `lancamentos` só para a faixa; erro nas tabelas da faixa a esconde calada; `useMemo` da faixa nunca guarda | low | escolha deliberada (erro da faixa não derruba a lista); custo desprezível | rejeitado |
| 12 | blind | O canal da fila abre em todas as telas e erro de leitura fica igual a "tudo revisado" no menu | low | o menu mostra o contador só com a leitura pronta; já relê na volta da conexão | rejeitado |
| 13 | blind | `montarItem` custa O(itens × linhas) a cada evento | low | dezenas de itens; sem dano real | rejeitado |
| 14 | blind | O banco não impõe `revisado_em` coerente com o motivo | low | só o repositório grava; nenhuma leitura depende disso na 3.2 | rejeitado |
| 15 | blind | Status da spec e tarefas desatualizados | false | `in-review` é estado da spec; o sprint fica `in-progress` até o fim; tarefas marcadas no fim | rejeitado |
| 16 | edge | Leitura em voo recoloca o item confirmado (a gravação apagou o id de `aplicadasDurante`) | low | mesma mecânica do escopo por Mês já existente; exige releitura e confirmação ao mesmo tempo | rejeitado |
| 17 | edge | Dois ✓ em 6 s: o toast único perde o Desfazer do primeiro | low | comportamento do `Toast` de toda a aplicação (um aviso por vez) | rejeitado |
| 18 | edge | `faixa`: `paraRevisar` pode passar de `lançamentos` com linhas do Mês fora da Fatura | false | a fila só tem linhas com `fatura_id`, e há uma Fatura por Mês | rejeitado |
| 19 | edge | `atualizar` com `fechaFila` não leva a classificação aos Ajustes se a mãe já tem os dois | low | o Ajuste já nasce igual à mãe; caso raro | rejeitado |
| 20 | edge | `fechaFila` tira da fila uma linha quando o Painel repete as chaves sem mudar | false | o Painel manda uma coluna só e só quando mudou (`mudancaDoCampo` devolve null se igual) | rejeitado |
| 21 | edge | Lista de Ajustes (`junto`) velha se um Ajuste muda de outro aparelho entre o render e o toque | low | janela de milissegundos | rejeitado |
| 22 | edge | Caminhos do servidor que põem a linha na fila não zeram `revisado_em` | false | `importar_fatura` só insere (coluna nula) e `substituir_cadastro` só anula ids | rejeitado |
| 23 | gap | Nenhum teste liga o `repoLancamentosRevisar()` real ao gerenciador da fila e às Regras | medium | trocar `memoria` ou tirar `aprender` não quebra nada | patch |
| 24 | gap | A leitura SQL da fila só é conferida como texto | medium | mesmo do 8 | patch (teste de integração) |
| 25 | gap | O backfill não tem teste | low | mesmo do 3 | rejeitado |
| 26 | gap | Comentário de `atualizar` velho (`revisado_em` agora vai aos Ajustes) | low | só comentário | patch |

## Design Notes

A fila precisa de um gerenciador próprio porque o de `lancamentos` guarda só o Mês aberto (AD-4) e o contador do menu vale para todos os Meses. Os Ajustes entram no mesmo gerenciador (são poucos) para o `junto` achar os ids sem consulta nova. `ehDaFila` é o único lugar onde "estar na fila" é definido; a leitura SQL (`revisao_motivo is not null`) e o filtro de eventos espelham a mesma regra, e um teste do núcleo fixa as duas.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- tudo verde (integração só no CI)
