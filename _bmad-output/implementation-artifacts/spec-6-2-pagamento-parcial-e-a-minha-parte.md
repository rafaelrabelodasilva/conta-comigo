---
title: 'História 6.2: Pagamento parcial e "a minha parte"'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: 'c309651'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-do-bloco.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a 6.1 só aceita o Valor recebido igual ao total. Quando o Lucas paga R$ 100,00 de R$ 215,16, ou o Rangel paga a metade do Casal (R$ 2.819,68 de R$ 5.639,35), Rafael não tem como registrar o que entrou nem dizer o que fazer com a diferença (FR-25, AD-10).

**Approach:** com o Valor recebido menor que o total, a janela "Aplicar status" pergunta **"O que fazer com a diferença de R$ X?"** com dois cartões de opção (nenhum marcado): **"Fica pendente"** (Pagamento `parcial`: o núcleo quita das linhas mais antigas para as mais novas, créditos primeiro; as quitadas por inteiro ficam com o Status pago e a última pode ficar com um **item parcial**, que não muda o Status) e **"Não é dívida, é a minha parte"** (Pagamento `minha_parte`: todas as linhas ficam quitadas e o Pagamento guarda o valor realmente recebido). "Pago parcialmente" (0 < Σ itens < valor, sem Status pago) é **calculado e nunca gravado**: o selo aparece na grade e o painel do Lançamento mostra "falta R$ X". A mensagem de cobrança (Seleção, Bloco, forma 3 e a prévia de Configurações) passa a incluir só o `restante` de um Lançamento pago parcialmente. A RPC `aplicar_pagamento` aceita os três modos; o núcleo gera os itens e a RPC só grava e confere.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** tudo o que decide mora em `src/domain/pagamento.ts` (`diferencaDoPagamento`, `alocarPagamento` com os três modos, `pagoParcialmente`, `faltaDoParcial`, `idsQuitadosPorPagamento`, `recusarStatusNaoPago` e `planejarDesfazerPagamento` revistos) e `src/domain/projecoes.ts` (a mensagem com `restante`). Tela, repositório e SQL não reimplementam. Textos pelo mapa `mensagens.ts`.
- **Migração `20261128120000_pagamento_parcial.sql` (AD-14), escrita e NÃO aplicada.** Sem tabela nova: o `check` de `pagamentos.modo` já aceita os três modos desde a 6.1. Muda: `pagamento_itens.status_aplicado_id` passa a aceitar nulo; o gatilho `lancamentos_recusar_status_nao_pago`; `aplicar_pagamento` e `desfazer_pagamento` (mesma assinatura e mesmos `grant`, por `create or replace`). `database.types.ts` no formato do gerado (só `status_aplicado_id` muda).
- **Dinheiro em centavos inteiros (AD-2), sem arredondar nada:** o item é o restante da linha ou o que sobra do valor recebido; o Valor recebido é digitado.
- **Sem internet, só consulta (AD-3):** como na 6.1 (botão desativado, nada tentado).
- **Uma só verdade (AD-10):** o Status diz "pago"; os itens dizem quanto e quando. `restante(l) = ehPago ? 0 : valor − Σ itens não excluídos` (não muda).

**Ask First:** aplicar a migração em produção (só depois do merge, quando Rafael pedir).

**Never:** histórico e a tela de desfazer (6.3, aqui só o "Desfazer" do aviso), Atrasado (6.4), Recebimentos por Bloco, `projetarPendente` e a barra de Recebimentos (6.5), Dívida programada (6.6), cobrar pendências (6.7), Meses anteriores da fatura (6.8), editar/excluir/reimportar algo já pago (6.9), lembretes e Web Push, Previsão. Mexer no Cron.

## Decisões (registradas, nada implícito)

1. **O gatilho da 6.1 e `recusarStatusNaoPago` — a regra passa a olhar só o "pago" que veio de um Pagamento.** O gatilho antigo recusava qualquer troca de Status para um que não conta como pago em linha com item vivo. Uma linha parcialmente paga TEM item e Status "não pago": trocar "Não pago" por "Em análise" seria recusado, e desfazer o Pagamento que fecha o valor de uma linha com item parcial de outro Pagamento (a linha volta a "não pago") também. Agora o gatilho recusa (`pagamento.desfazer_antes`) só se **o Status antigo conta como pago, o novo não, e a linha tem item vivo que aplicou Status** (`status_aplicado_id is not null`). O item parcial não aplicou Status, então não conta. Consequências: (a) **na linha parcial, "não pago" ↔ outro "não pago" ↔ "sem Status" é livre** (pela tela, pelo lote, por outro aparelho); (b) aplicar à mão um Status **pago** numa linha parcial é permitido (o restante vira 0 pelo Status; o item parcial fica até o Pagamento ser desfeito) e tirar esse "pago" depois também (nenhum Pagamento o aplicou); (c) numa linha quitada por Pagamento, tirar o "pago" continua recusado, por qualquer caminho. No núcleo, `recusarStatusNaoPago(escolhido, statusPagos, linhas, quitadas)` recusa as linhas **que hoje contam como pagas e estão em `quitadas`** (`idsQuitadosPorPagamento(itens)`); o Painel e o painel do Lançamento passam esse conjunto (a prop `comPagamento` do painel virou `quitadasPorPagamento`). `idsComPagamento` (qualquer item vivo) segue servindo à 5.4: uma parcela de Conta com item parcial também nunca é recriada.
2. **Itens do `minha_parte` — o restante inteiro de cada linha; o valor recebido fica no Pagamento.** O AD-10 diz que a RPC confere "soma dos itens = valor recebido", mas isso só vale quando as linhas ficam quitadas **pelo que entrou**. Em "a minha parte" as linhas ficam quitadas por mais do que entrou (R$ 5.639,35 quitados, R$ 2.819,68 recebidos). Distribuir o valor recebido entre as 18 linhas daria itens de centavos (arredondar de novo, violando o AD-2) e poderia dar item zero (o `check` proíbe), e desfazer precisa de **um item por linha** para devolver o Status. Por isso o item de cada linha é o `restante` dela (como em `total`) e **a parte de quem cobra é Σ itens − valor recebido**. A RPC confere por modo: `total` = todos `quita`, Σ itens = valor recebido; `parcial` = Σ itens = valor recebido e no máximo um item parcial; `minha_parte` = todos `quita` e **Σ itens > valor recebido > 0**. `restante` e desfazer não mudam (as linhas ficam pagas por Status; ao desfazer, todos os itens saem). Quem quiser "quanto entrou" (6.3, 6.5) soma `pagamentos.valor_recebido_centavos`, nunca os itens (pendência registrada).
3. **Item parcial — `status_aplicado_id` nulo; a linha segue com o Status que tinha.** A coluna passa a aceitar nulo (migração). O item parcial guarda `status_anterior_id` = o Status da linha na hora (informativo) e `status_aplicado_id` = **nulo**: o Pagamento não mudou o Status. Assim `planejarDesfazerPagamento` e a RPC não têm o que devolver nele: o item é excluído em lógico com o Pagamento e o Status fica como está (e não conta como "mantida"). A alternativa de copiar o Status anterior não serve: ele pode ser nulo (a coluna era `not null`) e confundiria "este Pagamento aplicou o Status" com "a linha já tinha o Status". **Uma segunda cobrança** sobre a mesma linha: `restante = valor − Σ itens vivos`; o novo item não passa dele (`item < restante` é parcial, `item = restante` quita e a linha vira paga). Desfazer o que fechou devolve a linha a "não pago" (o gatilho aceita, pelo item parcial do primeiro não ter aplicado Status); desfazer o parcial só tira o item.
4. **Ordem da alocação (a do núcleo) e o Ajuste de centavos.** Créditos primeiro (cada crédito entra inteiro e aumenta o que sobra para as dívidas), depois do mais antigo para o mais novo (Mês, data, ordem da fatura, criação, id), como na 6.1. **O Ajuste de centavos é quitado depois da parcela, logo atrás dela**: herda a posição dela (Mês, data, ordem, criação) e só é crédito se a **parcela** for. Um Ajuste negativo de parcela comum não vai para o início: acompanha a parcela e só entra se ainda há o que pagar (senão fica em aberto, pendência registrada). Filhas de mães diferentes: só as partes entram, em ordem de Mês (a mãe nunca entra); cada uma tem o Status dela.
5. **Limites da divisão.** (a) **Valor recebido muito pequeno:** só cobre um crédito ou menos que a primeira linha: `parcial` dá o crédito inteiro e o resto à primeira dívida (item parcial); `minha_parte` quita tudo. (b) **Total líquido ≤ 0** (só créditos, ou créditos que cobrem as dívidas): `pagamento.nada_a_receber`, sem pergunta. (c) **Item parcial de valor 0 nunca é gravado:** a alocação para quando a sobra chega a 0 (as linhas seguintes ficam fora do Pagamento, não ganham item); a RPC recusa item zero. (d) **Valor igual ao total depois de escolher uma opção:** `diferencaDoPagamento` devolve `null`, a pergunta some e o modo é `total` (a escolha é ignorada). (e) **Valor maior que o total, zero, negativo, vazio ou texto:** não há pergunta (os mesmos erros da 6.1). (f) Um item é parcial só se `0 < item < restante` e a linha deve (`restante > 0`); um crédito nunca é parcial.
6. **O que a janela mostra.** Textos do mockup: "Fica pendente" com "Quita dos mais antigos para os mais novos. O que faltar continua em aberto."; "Não é dívida, é a minha parte" com "Todos os lançamentos ficam pagos. O pagamento registra R$ X." (o valor recebido). A pergunta é um `<fieldset>` com `<legend>` "O que fazer com a diferença de R$ X?" e o grupo é `role="radiogroup"` com `aria-labelledby` na pergunta (é o nome acessível). Dois cartões de mesma altura (grade que estica, `items-stretch`, `min-h-toque`), rádio de 18 px (`size-4.5`), o valor em R$ em `whitespace-nowrap`. **Nenhum vem marcado** (Rafael não aplica uma decisão que não tomou, o mockup mostra a opção já escolhida só para ilustrar). **"Aplicar" exige:** Status pago, Data válida, Valor válido e, se há diferença, **uma escolha**; sem ela o erro `pagamento.diferenca_sem_escolha` só desativa o botão (a pergunta já diz o que falta). **A escolha vale para aquela diferença**: mudou o valor e a diferença com ele, a escolha volta a vazia (guardada junto da diferença a que pertence); o foco não é roubado do campo do valor ao aparecer a pergunta (ela aparece enquanto Rafael digita). O aviso depois de aplicar: `total` e `minha_parte`, "N lançamentos marcados como pagos"; `parcial`, "Pagamento parcial registrado: R$ X · N lançamentos marcados como pagos" (sem a segunda parte se nenhuma linha ficou quitada), sempre com "Desfazer".
7. **Idempotência e corrida.** O `id` do Pagamento vem da tela (uma vez por abertura da janela, como na 6.1) e a RPC é idempotente nele. **A trava é o `updated_at` de cada linha e agora toda linha tocada tem a versão movida, inclusive a do item parcial** (que não muda de Status): a RPC faz `update … set status_id = (o mesmo ou o aplicado)` e o gatilho `definir_updated_at` anda a versão; `desfazer_pagamento` faz o mesmo nas linhas que só tinham item parcial. Assim uma linha parcial que outro aparelho cobrou no meio faz o pedido velho receber `pagamento.mudou`, e o outro aparelho recebe o UPDATE da linha pelo Realtime. A RPC também confere o teto (item ≤ restante, calculado dentro da transação com a linha travada).
8. **A mensagem de cobrança.** `projetarMensagem` ganha `opcoes.itens` (opcional; sem itens, tudo entra cheio como antes). "Pago" por Status continua em `idsPagos` e agora também é "já pago" a linha **de Status não pago cujos itens já cobrem o valor todo** (restante 0, ex. um Status "conta como pago" desmarcado depois). Um Pago parcialmente entra com `valor_centavos = restante` (e o Ajuste dele, o dele) e `pago_centavos` = o que já recebeu; o total é a soma do que falta. Os itens valem **de qualquer Mês** (cada linha usa os dela; o Painel só lê os itens do Mês aberto, e a mensagem é de um Mês só). **O aviso "R$ X já foram pagos e não entram" do Bloco** soma o valor das linhas pagas por Status **mais a parte já recebida dos Pagos parcialmente** (`pagosCentavos` = a Fórmula sobre a projeção do Painel menos a Fórmula sobre ela sem os pagos e com o valor das parciais já abatido): uma conta, um arredondamento (FR-54). A forma 3 usa a mesma projeção; **a prévia de Configurações** (`previaDoModelo`) ganhou o parâmetro `itensDePagamento` e `SecaoModeloMensagem` abre `pagamento_itens` do Mês atual (só a prévia espera por eles, e se a leitura falha usa a lista vazia). **As janelas de mensagem recebem os itens do Painel** (`itens` e `itensProntos`): enquanto os itens não chegaram a janela espera ("Conferindo os pagamentos já registrados…") e não deixa copiar, porque um Pago parcialmente sairia com o valor cheio.
9. **Realtime — o que o outro aparelho vê.** O INSERT do item (`pagamento_itens`, por Mês) e o UPDATE da linha (a versão anda, o Status só muda nas quitadas) chegam pelo gerenciador: a **grade mostra o selo "Pago parcialmente"** e o painel do Lançamento aberto mostra "falta R$ X"; o total e o valor padrão da janela "Aplicar status" e a **mensagem** (a janela aberta refaz o texto e avisa que mudou) usam o restante novo; o item desfeito chega como UPDATE com `excluido_em` e o selo some. Os Blocos do Painel (cartão e Seleção) seguem somando o valor cheio: só a mensagem usa o restante (pendência para a 6.5).
10. **Offline (AD-3) e data.** Como na 6.1: botão desativado sem conexão, nada tentado; a Data nunca é depois de hoje (America/Sao_Paulo) e, no passado, vale.
11. **O selo e o "falta R$ X".** `faltaDoParcial(linha, statusPagos, Σ itens)` (núcleo) devolve o `restante` se `0 < Σ < valor` e a linha não é paga, senão `null`. O Painel monta um mapa `faltaPorLinha` e entrega à grade (selo `status-partial-*` no lugar do nome do Status, `title` com "falta R$ X", e o nome acessível da linha diz "Pago parcialmente, falta R$ X") e ao painel do Lançamento ("Pago parcialmente · falta R$ X", `role="status"`, também para a parte de uma Divisão). O Status "Em análise" de uma linha parcial é mostrado no seletor do painel, não no selo.

## I/O & Edge-Case Matrix

| Cenário | Entrada | Saída esperada |
|---|---|---|
| Valor = total | 150,00 de 150,00 | como na 6.1: modo `total`, sem pergunta |
| Valor < total, sem escolha | 100,00 de 150,00 | pergunta "O que fazer com a diferença de R$ 50,00?"; Aplicar desativado |
| Fica pendente (o Lucas) | 100,00 de 215,16 numa linha | `parcial`: 1 item parcial de 100,00; a linha segue "Não pago"; "Pago parcialmente"; restante 115,16 |
| Fica pendente, várias linhas | 100,00 de 50 + 30 + 90 | 50 e 30 quitam (Pago), a de 90 leva 20 (parcial); Σ itens = 100,00 |
| Valor cai no fim de uma linha | 50,00 de 50 + 30 | 1 item quita; a segunda fica fora do Pagamento |
| Crédito + dívida | −30 e 100, recebe 20 | crédito −30 quita, dívida leva 50 (parcial); Σ itens = 20 |
| Ajuste de centavos | parcela + Ajuste | Ajuste logo depois da parcela; um Ajuste negativo só entra se sobra valor |
| Minha parte (o Rangel) | 18 linhas, 2.819,68 de 5.639,35 | `minha_parte`: 18 itens com o restante inteiro, todos Pago; Pagamento com 2.819,68 |
| Valor muda depois de escolher | 100 → 90 | a diferença muda, a escolha volta a vazia |
| Valor volta ao total | 150,00 depois de escolher | pergunta some; modo `total` |
| Total líquido ≤ 0 | só créditos / créditos cobrem as dívidas | "Nenhum dos selecionados…" / "Não há o que receber"; sem pergunta |
| Segunda cobrança da linha parcial | restante 115,16, paga 115,16 | modo `total`, item = restante; a linha vira Pago |
| Idem, menos que o restante | paga 50,00 | novo item parcial; restante cai |
| Item acima do restante / `quita` incoerente / zero | adulterado | RPC: `salvar.falhou`; nada gravado |
| Linha parcial paga em outro aparelho no meio | pedido com a versão velha | `pagamento.mudou`; nada gravado |
| Pedido repetido (mesmo `id`) | duplo toque | o mesmo Pagamento, sem gravar de novo |
| "Não pago" → "Em análise" numa linha parcial | painel, lote, outro aparelho | passa (o gatilho só olha o "pago" quitado por Pagamento) |
| Tirar o "pago" de uma linha quitada por Pagamento | idem | `pagamento.desfazer_antes` |
| Desfazer o que fechou o valor | toque no aviso | a linha volta a "não pago" parcial; o item parcial do primeiro segue |
| Desfazer o parcial | idem | item e Pagamento excluídos em lógico; Status igual; versão anda |
| Mensagem com um Pago parcialmente | Seleção ou Bloco | só o restante; o aviso do Bloco soma a parte já recebida |
| Itens ainda não lidos | mensagem aberta cedo | "Conferindo os pagamentos…"; Copiar desativado |
| Sem conexão | — | botão desativado; nada tentado |

## Code Map

- `src/domain/pagamento.ts` (+ teste): o núcleo. `src/domain/projecoes.ts`, `src/domain/modelo-mensagem.ts`, `src/domain/mensagem-janela.ts` (+ testes de mensagem): a mensagem com `restante`. `src/domain/mensagens.ts`: textos e `pagamento.diferenca_sem_escolha`.
- `supabase/migrations/20261128120000_pagamento_parcial.sql`, `src/data/database.types.ts`: o schema e as RPCs. `src/data/pagamentos-repo.ts` (+ teste).
- `src/features/painel/JanelaAplicarStatus.tsx`, `Painel.tsx`, `GradeLancamentos.tsx`, `PainelLancamento.tsx`, `JanelaGerarMensagem.tsx`, `JanelaMensagemDoBloco.tsx`, `src/features/configuracoes/SecaoModeloMensagem.tsx` (+ testes jsdom).
- `test/integracao/pagamentos.test.ts`, `test/backup/dados-exemplo.sql`: o que só o CI roda.

## Tasks & Acceptance

- [x] Núcleo: alocação nos três modos, `pagoParcialmente`/`faltaDoParcial`, a regra nova de `recusarStatusNaoPago` e o desfazer com item parcial, com testes (incluindo uma varredura de todos os valores recebidos de um Mês montado à mão).
- [x] Mensagem (Seleção, Bloco, forma 3, prévia) com `restante`; os testes "Pago parcialmente é só um Status" mudaram junto.
- [x] Migração escrita (NÃO aplicada) e provada no pglite com o núcleo real; tipos no formato do gerado.
- [x] Janela com a pergunta, selo na grade, "falta R$ X" no painel, aviso por modo, itens nas janelas de mensagem; testes jsdom.
- [x] Teste de integração do CI e dado de exemplo do backup (item parcial).
- [x] CI verde na PR (`supabase`, "Backup gera e restaura", `verificar`).
- [ ] Depois do merge, e só quando Rafael pedir: `db push`.

## Implementation Notes

- A prova do SQL rodou num Postgres em memória (pglite) com todas as migrações em ordem e o núcleo real por `jiti`: Lucas (item parcial, Status igual, versão anda), pedido velho (`pagamento.mudou`), "não pago" ↔ "em análise" na linha parcial, segunda cobrança que fecha, tirar o "pago" de linha quitada recusado, desfazer o que fechou e depois o parcial, minha parte (e repetição idempotente), crédito + Ajuste + parcial, 16 recusas da RPC, mãe dividida e linha já paga, outro dono e `anon`. Não prova RLS por papel de verdade, Realtime nem PostgREST.
- Entre o merge e o `db push` só o modo `total` grava (ver `docs/infraestrutura.md`).

## Verification

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (ver a PR). Os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos.
- **Só o CI prova:** a migração em Postgres de verdade, RLS, `grant`, Realtime (item parcial, selo), a igualdade de `database.types.ts` e o backup.
- **Não verificado:** iPad (layout dos cartões, toque, VoiceOver), produção (a migração não foi aplicada).
