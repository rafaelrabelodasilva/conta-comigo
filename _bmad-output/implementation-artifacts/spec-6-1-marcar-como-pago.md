---
title: 'História 6.1: Marcar como pago'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '6804511'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o app sabe o que cada pessoa deve (Blocos, Seleção, Mensagem), mas Rafael só consegue dizer que algo foi pago trocando o Status linha por linha. Não há registro de quanto entrou, de quando, nem como desfazer um engano; o Status e o dinheiro recebido podem discordar (FR-25, AD-10).

**Approach:** a barra de Seleção do Painel ganha **Aplicar status**. A janela lista os Status. Se o escolhido conta como pago, pede a **Data** (hoje, em America/Sao_Paulo) e o **Valor recebido** (o total do que a Seleção quita); senão, só o Status muda (pela gravação em lote que já existe, sem Pagamento). Com valor igual ao total, uma RPC (`aplicar_pagamento`) grava, numa transação, um **Pagamento `total`**, um item por Lançamento (com o valor quitado e os Status anterior e aplicado) e muda o Status das linhas. Aparece "N lançamentos marcados como pagos · Desfazer", e o selo vira "Pago" em todos os aparelhos pelo Realtime. Quem decide tudo é o núcleo (`src/domain/pagamento.ts`): `ehPago`, `restante`, a projeção da Seleção, a alocação, a validação e o plano de desfazer. A RPC só grava e confere. Aplicar à mão um Status "não pago" numa linha com Pagamento é recusado ("desfaça o pagamento antes"): pelo núcleo, na tela, e por um gatilho no banco, que cobre qualquer caminho. Esta história também alimenta o `comPagamento` da 5.4: uma parcela de Conta com Pagamento nunca é recriada.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `src/domain/pagamento.ts` (imports relativos) tem `ehPago`, `restante`, `somaDosItens`, `idsComPagamento`, `projetarPagamento`, `alocarPagamento`, `planejarPagamento`, `lerValorRecebido`, `lerDataDoPagamento`, `recusarStatusNaoPago` e `planejarDesfazerPagamento`. Tela, repositório e SQL não reimplementam nada disso. "Hoje" e os Status que contam como pago entram como parâmetro. Textos pelo mapa `mensagens.ts`.
- **Migração `20261127120000_pagamentos.sql` (AD-14), escrita e NÃO aplicada:** `pagamentos`, `pagamento_itens`, o gatilho `lancamentos_recusar_status_nao_pago`, `referencias_cadastro()` com o Status dos itens, `pagamento_completo` (interna), `aplicar_pagamento` e `desfazer_pagamento`. `database.types.ts` escrito à mão no formato do gerado (o job `supabase` compara).
- **Dinheiro em centavos inteiros (AD-2)**, sem arredondar nada nesta história: o item é o restante da linha, e o valor recebido é digitado.
- **Sem internet, só consulta (AD-3):** "Aplicar status" fica desativado com o aviso de conexão, e o repositório devolve `conexao.gravar_sem_conexao` sem ler nem gravar.
- **Uma só verdade (AD-10):** o Status é o que diz "pago"; os itens dizem quanto e quando. `restante(l) = ehPago ? 0 : valor − Σ itens não excluídos`.
- **Nada que a 5.4 já resolveu muda:** a regra de `parcelasRecriaveis` é a mesma; só passa a receber o `comPagamento`.

**Ask First:** aplicar a migração em produção (só depois do merge, quando Rafael pedir).

**Never:** pagamento parcial e "a minha parte" (6.2), histórico e a tela de desfazer (6.3), Atrasado (6.4), Recebimentos por Bloco, `projetarPendente` e a barra de Recebimentos (6.5), Dívida programada (6.6), cobrar pendências (6.7), Meses anteriores da fatura (6.8), editar/excluir/reimportar algo já pago (6.9), lembretes e Web Push, Previsão. Mexer no Cron. Mudar `projetarMensagem`.

## Decisões (registradas, nada implícito)

1. **O que a 5.4 deixou pronto (`comPagamento`) — feito aqui, com teste.** `lerLancamentosDaConta` não mudou; `contas-repo.ts` ganha `lerIdsComPagamento` (itens não excluídos de `pagamento_itens`, em blocos de 100 ids) e `LeituraDaConta.comPagamento`, que vai a `planoDeAlterarConta`, `planoDeEncerrarConta`, `planoDeExcluirConta` e às três janelas que mostram "Ficam como estão" (`ContasManuais`, `JanelaEncerrarConta`, `JanelaExcluirConta`). O motivo "com pagamento" e o texto do aviso já existiam. Pendência do `deferred-work.md` removida.
2. **Trava de `dividir_lancamento`/`recriar_filhas` — fica para a 6.9, com o motivo.** Excluir em lógico uma linha que tem Pagamento é um estado previsto pela 6.9 (linha de crédito em `projetarPendente`, aviso "Este lançamento tem pagamento registrado…"). Um gatilho que impedisse toda exclusão de linha paga contrariaria a 6.9; a trava certa é a pergunta ao usuário, que é UI da 6.9. Nada se perde nesse meio tempo: o item guarda o `lancamento_id` (a FK vale), e a linha excluída continua no banco.
3. **`referenciadas` da reimportação — resolvido na leitura, o resto fica para a 6.9.** `lerReimportacao` agora lê os itens do Mês (em blocos) e manda em `referenciadas` as antigas com Pagamento, ou cuja parte de uma Divisão tem. Assim uma antiga viva sem par com Pagamento sai da Fatura (`sumiu_na_reimportacao`) em vez de ser apagada, mesmo que o Status dela seja o padrão. O que não muda: a RPC `importar_fatura` apaga as linhas **excluídas** do Mês (`r_excluidas`); uma linha paga e depois excluída tem item, então o `delete` falha pela FK e a reimportação inteira volta atrás (nada se perde, mas a tela só diz "Não foi possível importar"). A trava de estrutura na RPC e o teste "reimportar outubro com Pagamentos" são da 6.9.
4. **`restante` e a mensagem de cobrança (4.6/4.7) — `projetarMensagem` não muda.** Nesta história todo Pagamento é `total` e deixa o Status como pago, então `restante` é 0 nas linhas pagas e o valor cheio nas não pagas: o que a mensagem faz hoje (tirar pelo Status, `idsPagos`) já dá o mesmo resultado. `restante` nasce no núcleo e fica testado; ligá-lo à mensagem, ao aviso de pagos do Bloco e à forma 3 é da 6.2 (que cria o "Pago parcialmente"). Os testes “Pago parcialmente é só um Status” seguem valendo.
5. **Mãe dividida e Ajuste.** `projetarPagamento` usa as mesmas unidades da Seleção do Painel (4.4): a mãe dividida nunca entra (o Pagamento recai nas partes, de mães diferentes se for o caso, cada uma com o Status dela). O Ajuste de centavos entra junto com a parcela, com o restante dele, e não conta na contagem do aviso; um Ajuste marcado sem a parcela é uma unidade normal. A RPC recusa a mãe dividida (`salvar.falhou`).
6. **Divisão: Status por parte.** O Status muda só nas partes pagas; as outras partes seguem como estavam. Não há "Status da mãe" a conciliar (a mãe dividida não soma).
7. **Ordem da alocação.** O núcleo ordena: créditos primeiro, depois do mais antigo para o mais novo (Mês, data, ordem da fatura, criação, id), mesmo no modo `total` (onde não muda o valor de nenhum item). A RPC só grava e confere (dono, formato, soma dos itens = valor recebido, o item de cada linha é o restante dela, linha viva e não mudada, nenhum item zero, nenhuma mãe dividida, nenhuma linha já paga).
8. **Idempotência e corrida.** O `id` do Pagamento vem da tela (`crypto.randomUUID()` uma vez por abertura da janela). `aplicar_pagamento` insere o Pagamento primeiro (`on conflict (id) do nothing`): o mesmo `id` repetido (duplo toque, resposta perdida, dois aparelhos) espera o primeiro terminar e recebe o mesmo `{ pagamento, itens, lancamentos }`, sem gravar de novo; se o Pagamento já foi desfeito, `pagamento.ja_desfeito`. A trava contra mudança é a da 5.4: cada item leva o `updated_at` visto da linha, e a RPC trava as linhas (`for update`, em ordem de id) e recusa tudo com `pagamento.mudou` se alguma mudou (Valor, Status, exclusão, outro Pagamento: tudo move o `updated_at`). Duas pessoas pagando a mesma linha: a segunda recebe `pagamento.mudou`.
9. **Status "não pago" à mão numa linha com itens — a recusa mora em três lugares.** (a) **Núcleo:** `recusarStatusNaoPago` (só olha linhas cujo Status mudaria); (b) **telas:** o painel do Lançamento e o lote (`gravarCamposNaSelecao`, que serve a "Classificar em lote" e a "Aplicar status" sem Pagamento) conferem antes de gravar e mostram "Este lançamento tem pagamento registrado. Desfaça o pagamento antes…" (embaixo do seletor, e no aviso/janela do lote); (c) **banco:** o gatilho `lancamentos_recusar_status_nao_pago` (`before update of status_id`, só quando o Status muda) levanta `pagamento.desfazer_antes` por qualquer caminho: gravação simples, `classificar_em_lote`, `substituir_cadastro`, outro aparelho ou tela velha. A gravação simples e o lote mostram, nesses casos raros, o aviso genérico "Não foi possível salvar".
10. **Meses diferentes na mesma Seleção.** Nada supõe um Mês: `projetarPagamento` recebe as linhas que a tela tem, e o item guarda o `mes` da linha. A RPC não lê `mes` do pedido. No Painel a Seleção é de um Mês só; a 6.5 junta Meses sem mudar nada aqui.
11. **Previsto e Conta manual.** O previsto da Série (`lancado_por = 'sistema'`) **não entra** (ainda não veio na Fatura): fica de fora com o motivo "previsto". Uma parcela de Conta manual é `manual` e **entra**, mesmo num Mês sem Fatura em que o Painel a mostra como previsto derivado (5.1): esse "previsto" é só apresentação (Mês sem Fatura), e o selo de Status segue o Status. Com Pagamento, a parcela de Conta nunca é recriada (decisão 1).
12. **Offline (AD-3).** O botão da barra fica desativado, com o aviso "Sem conexão. Você pode consultar, mas não alterar." (no `title` e, aberta a janela, no corpo). Nada é tentado: nem leitura, nem RPC.
13. **Data e Valor recebido.** Data: obrigatória, válida, **nunca depois de hoje** (America/Sao_Paulo; o `<input type="date">` leva `max`); no passado vale (o dinheiro pode ter entrado dias antes). A RPC não confere a data contra o relógio do banco (o relógio do aparelho define "hoje", e uma diferença de fuso não pode recusar um pedido bom). Valor recebido: tem de ser > 0; zero, negativo, vazio e texto são recusados; **maior que o total** → "O valor recebido não pode passar de R$ X"; **menor que o total** → recusado até a 6.2 ("O valor recebido precisa ser o total… O pagamento parcial ainda não está disponível"). Total que não passa de zero (só créditos) → "Não há o que receber". O padrão do campo é o total do que **entra** (não da Seleção inteira): a janela diz quantos itens ficam de fora e por quê.
14. **O "Desfazer" do aviso.** Fica o `desfazer_pagamento`, que já segue a regra completa do AD-10: o núcleo (`planejarDesfazerPagamento`) devolve o Status anterior só onde o atual ainda é o aplicado e nenhum Pagamento posterior tocou a linha; a RPC exclui em lógico o Pagamento e os itens (AD-16) e devolve o Status das linhas listadas, conferindo que o `updated_at` não mudou (senão `pagamento.mudou`). O repositório lê do banco (itens vivos do Pagamento, as linhas, os itens de outros Pagamentos) antes de pedir o plano. A 6.3 acrescenta o histórico, a confirmação e o teste de aceite de dois Pagamentos fora de ordem no banco (o núcleo já tem esse caso em teste).
15. **Realtime.** `pagamentos` e `pagamento_itens` entram na publicação (`replica identity full`). O item guarda o `mes` do Lançamento (AD-9) e, no gerenciador, `pagamento_itens` tem escopo por Mês como `lancamentos` (só o Mês aberto fica na memória). Outro aparelho vê: o selo (UPDATE de `lancamentos`), o `comPagamento` do painel (INSERT do item), o total e o aviso "de fora" da janela, e a recusa de "não pago". O item do Pagamento desfeito chega como UPDATE com `excluido_em`. `projetarMensagem` e os Blocos não olham itens (decisão 4).
16. **Os itens do Painel não seguram o Painel.** Como `blocos`, `pagamento_itens` não está na lista que decide "erro ao carregar": enquanto a migração não está em produção (ou se a leitura falha), o Painel funciona e só "Aplicar status" com Pagamento espera ("Conferindo os pagamentos já registrados…"). "Aplicar status" que só muda o Status continua funcionando.
17. **Pronto para a 6.5.** `JanelaAplicarStatus` só recebe a projeção, o "hoje", os Status e `aoAplicar`; não conhece o Painel. A barra de Recebimentos vai montar a Seleção, chamar `projetarPagamento` com linhas de vários Meses e usar a mesma janela e o mesmo repositório.
18. **Status "conta como pago" que muda depois.** Se Rafael desmarca "conta como pago" num Status em uso, as linhas com item passam a ser "não pagas" com `restante = valor − Σ itens` (0 nas pagas por inteiro) e o gatilho passa a recusar mudanças para ele. Não há tratamento especial; fica na lista de pendências.
19. **`editado_em` não é gravado pelo Pagamento.** Pagar não é editar o Lançamento (é por isso que a 5.4 já olhava o Status e agora o Pagamento à parte); o `updated_at` anda.
20. **A Seleção continua depois de aplicar** (como em "Classificar em lote"): as linhas pagas ficam marcadas, e uma nova tentativa as mostra como "já pagas" que ficam de fora.
21. **Contagem de uso do Status.** O Status aplicado em `pagamento_itens` conta uso (`contaUso: true`: excluir um Status que quitou Pagamentos pede substituto e a troca chega aos itens); o anterior não (vira nulo = "não pago"). A contagem "N registros" de Configurações passa a somar também os itens (uma linha paga conta duas vezes).

## I/O & Edge-Case Matrix

| Cenário | Entrada | Saída esperada |
|---|---|---|
| Pagar 2 linhas, valor = total | Status Pago, Data hoje, Valor 150,00 | Pagamento `total`; 2 itens; as 2 linhas viram Pago; aviso "2 lançamentos marcados como pagos · Desfazer"; Seleção fica |
| Valor > total | 150,01 de 150,00 | "O valor recebido não pode passar de R$ 150,00"; Aplicar desativado |
| Valor < total | 100,00 de 150,00 | "O valor recebido precisa ser o total, R$ 150,00…"; Aplicar desativado (6.2) |
| Valor 0 / negativo / vazio / texto | `0`, `-5`, ``, `abc` | "Digite um valor maior que zero…" / "Digite o valor recebido." |
| Data depois de hoje | amanhã | "A data não pode ser depois de hoje."; no passado vale |
| Status que não conta como pago | "Não pago" | data e valor somem; "Só o status muda…"; lote da 3.3, aviso "Status aplicado a N lançamentos · Desfazer" |
| Linha com Pagamento + Status não pago à mão | painel do Lançamento, lote, "Aplicar status" | recusado: "…Desfaça o pagamento antes…"; nada gravado; o banco recusa também |
| Linha já paga / R$ 0,00 / previsto da Série na Seleção | misto | ficam de fora, com a contagem por motivo; o total é só do que entra |
| Nada a receber | só pagas | "Nenhum dos selecionados pode receber pagamento…"; Aplicar desativado |
| Mãe dividida / partes de mães diferentes | partes marcadas | itens só das partes; a mãe nunca entra; RPC recusa a mãe |
| Ajuste de centavos | parcela marcada | o Ajuste entra junto; a contagem não o conta |
| Meses diferentes | linhas de out e nov | uma só RPC; cada item guarda o `mes` dela |
| Pedido repetido (mesmo `id`) | duplo toque, resposta perdida | o mesmo Pagamento, sem gravar de novo |
| Linha mudou desde a leitura | outro aparelho editou/pagou | `pagamento.mudou`; nada gravado; a janela fica com o motivo |
| Desfazer logo depois | toque no aviso | Pagamento e itens excluídos em lógico; Status anterior volta nas linhas elegíveis |
| Desfazer com Status mudado à mão / Pagamento posterior | — | a linha fica como está; o Pagamento é desfeito |
| Desfazer de novo / de um Pagamento que não existe | — | nada / `pagamento.nao_encontrado` |
| Sem conexão | — | botão desativado; nada tentado |
| Itens de Pagamento ainda lendo | — | com Pagamento: "Conferindo…" e Aplicar desativado; só-Status funciona |
| Parcela de Conta com Pagamento | Editar/Encerrar/Excluir | fica como está, com o motivo "com pagamento" no aviso |
| Antiga da Fatura com Pagamento sem par | reimportar | sai da Fatura (`sumiu_na_reimportacao`), não é apagada |

## Code Map

- `src/domain/pagamento.ts` (+ teste): o núcleo. `src/domain/mensagens.ts`: códigos `pagamento.*`, `TEXTOS_PAGAMENTO`, `mensagemDoPagamento`, rótulos.
- `supabase/migrations/20261127120000_pagamentos.sql`, `src/data/database.types.ts`, `src/domain/cadastros.ts` (+ teste): schema, RPCs, gatilho e referências.
- `src/data/pagamentos-repo.ts` (+ teste): `aplicar` e `desfazer`. `src/data/realtime.ts`: `pagamento_itens` por Mês.
- `src/data/contas-repo.ts`, `src/domain/alterar-conta.ts`, `src/features/contas-manuais/*`: `comPagamento`. `src/data/faturas-repo.ts`: `referenciadas`.
- `src/features/painel/JanelaAplicarStatus.tsx`, `BarraSelecaoPainel.tsx`, `Painel.tsx`, `PainelLancamento.tsx` (+ testes): a tela.
- `test/integracao/pagamentos.test.ts`, `apoio.ts`, `test/backup/dados-exemplo.sql`: o que só o CI roda.

## Tasks & Acceptance

- [x] Núcleo `pagamento.ts` com testes (projeção, alocação, validação, recusa, desfazer).
- [x] Migração escrita (NÃO aplicada) e provada no pglite com o núcleo real; tipos no formato do gerado.
- [x] Repositório `pagamentos-repo.ts` com fakes; `comPagamento` na 5.4; `referenciadas` na reimportação.
- [x] Janela "Aplicar status" e botão na barra; recusa de "não pago" no painel do Lançamento e no lote; testes jsdom.
- [x] Teste de integração do CI (RPCs, gatilho, RLS, grants, Realtime) e dados de exemplo do backup.
- [ ] CI verde na PR (`supabase`, "Backup gera e restaura", `verificar`).
- [ ] Depois do merge, e só quando Rafael pedir: `db push`.

## Implementation Notes

- A prova do SQL rodou num Postgres em memória (pglite) com todas as migrações em ordem e o núcleo real por `jiti`: 15 cenários (Pagamento em Meses diferentes, repetição, `mudou`, recusas de formato, mãe dividida, filhas de mães diferentes, gatilho com gravação simples e lote, desfazer, desfazer com linha mudada, referências e substituição de Status). Não prova RLS, papéis, Realtime nem PostgREST.
- O `updated_at` visto é o do PostgREST (microssegundos); a comparação na RPC é por `timestamptz`, como na 5.4.
- `aplicar_pagamento` cria o Pagamento antes de conferir o resto: qualquer erro desfaz tudo, e a repetição concorrente do mesmo `id` espera e devolve o mesmo resultado.

## Design Notes

- O gatilho é a única regra de negócio que o SQL guarda (AD-1 diz que o SQL só garante restrições, e esta é uma: "Status não pago e item vivo não convivem"). Ele não decide nada que o núcleo não decida igual; só impede o caminho por onde uma tela velha ou outro aparelho furaria a regra.
- O modo `total` é o único que a RPC grava. `parcial` e `minha_parte` já existem no `check` da tabela para a 6.2 não precisar de migração de schema, só de RPC.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (ver a PR).
- **Só o CI prova:** a migração em Postgres de verdade, RLS, `grant`, Realtime (`pagamentos`, `pagamento_itens` e o selo), a igualdade de `database.types.ts` com o gerado e o backup com as duas tabelas novas.
- **Não verificado:** iPad (layout da janela, toque, VoiceOver), produção (a migração não foi aplicada).
