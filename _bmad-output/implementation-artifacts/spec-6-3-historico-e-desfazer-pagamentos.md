---
title: 'História 6.3: Histórico e desfazer Pagamentos'
type: 'feature'
created: '2026-11-16'
status: 'review'
baseline_commit: '84b3d98'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** depois que o aviso "Desfazer" some, Rafael não tem como ver os Pagamentos que registrou nem corrigir um erro (FR-25, FR-29, AD-10). A tela Recebimentos ainda é "Em breve".

**Approach:** Recebimentos ganha a seção **"Histórico de Pagamentos"**: a lista de todos os Pagamentos vivos (data, Responsáveis, quantidade de Lançamentos, valor recebido e o modo "parcial" / "minha parte"), com filtro por Responsável. Tocar numa linha abre o **detalhe** (os Lançamentos que o Pagamento quitou, o valor de cada item e o Status de antes e o aplicado) e o botão **"Desfazer pagamento"**, que abre uma **confirmação** dizendo o que muda: quantas linhas voltam ao Status anterior, quantas ficam como estão (e por quê) e que o valor recebido sai do histórico. Confirmar chama o `desfazer` que já existia (o núcleo manda, a RPC exclui em lógico, AD-16). Os cartões por Bloco são da 6.5: a seção é um componente independente e entra abaixo deles.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** resumo, ordem, Responsáveis, filtro, detalhe e o resumo do desfazer moram em `src/domain/historico-pagamentos.ts`; a classificação de cada item do desfazer em `src/domain/pagamento.ts` (`classificarDesfazerPagamento`, de onde sai `planejarDesfazerPagamento`). Tela e repositório não reimplementam. Textos pelo mapa `mensagens.ts`.
- **Sem migração (AD-14):** as tabelas, as RLS, a publicação do Realtime e as RPCs já existem (6.1 e 6.2, a 6.2 já está em produção). Nada de schema novo, `database.types.ts` não muda.
- **Dinheiro em centavos inteiros (AD-2):** o valor da lista é `pagamentos.valor_recebido_centavos`; nada é calculado com decimais.
- **Realtime pelo gerenciador (AD-4) e sem internet só consulta (AD-3).**

**Ask First:** gravar "quem pagou" (um Responsável ou Bloco) no Pagamento (coluna nova + mudança em `aplicar_pagamento`).

**Never:** os cartões por Bloco, `projetarPendente`, "Recebido no mês" e a barra de Recebimentos (6.5), Atrasado (6.4), Dívida programada (6.6), cobrar pendências (6.7), Meses anteriores da fatura (6.8), editar/excluir/reimportar algo já pago (6.9), lembretes e Web Push, Previsão. Mudar a regra do que o Pagamento quita ou a alocação (6.1 e 6.2). Mexer no Cron e nas RPCs.

## Decisões (registradas, nada implícito)

1. **Responsável de um Pagamento — derivado das linhas, todos eles, sem coluna nova.** `pagamentos` não tem Responsável; ele vem das linhas dos itens, e um Pagamento pode quitar linhas de vários (o Rangel paga "Casal" + "Rangel"). A lista mostra **todos** os Responsáveis do Pagamento, do que tem mais valor nos itens (Σ |valor|) para o que tem menos (empate pelo id; "sem Responsável" por último), como etiquetas coloridas. **O filtro acha o Pagamento por qualquer um deles:** o Pagamento do Rangel (Casal + Rangel) aparece no filtro do Casal e no do Rangel; um da Mãe só no da Mãe. A regra mora no núcleo (`resumirPagamentos`, `responsaveisDoHistorico`, `filtrarHistorico`, com teste). **Por que não uma coluna:** guardar "quem pagou" exige a janela "Aplicar status" perguntar quem pagou (uma Seleção mista não diz) e `aplicar_pagamento` receber e conferir o campo, ou seja, mudar a 6.1/6.2 e uma migração, e os Pagamentos já gravados ficariam sem o dado. **Divergência com o EXPERIENCE (Flow 3):** o fluxo diz "Rangel · R$ 2.819,68 · minha parte", que descreve quem **pagou**; derivado das linhas, o mesmo Pagamento aparece como "Casal e Rangel · minha parte · R$ 2.819,68" (o que ele quitou, que também é verdade). Quando a 6.5 agrupar por Bloco de cobrança, ela pode gravar o Bloco no Pagamento (pendência registrada).
2. **De onde vêm os dados — dois gerenciadores novos, leitura paginada, leitura à parte só do Responsável das linhas.** O gerenciador de `pagamento_itens` guarda só o Mês aberto (AD-4) e o Histórico precisa de TODOS os Meses; o PostgREST corta em 1000 linhas. (a) `gerenciador("pagamentos")` passa a guardar **só os Pagamentos vivos** (`ESCOPO_DO_HISTORICO`: `excluido_em is null` na consulta e no predicado); (b) `gerenciadorItensDoHistorico()` guarda os **itens vivos de todos os Meses** (mesma tabela, canal próprio `tabela:pagamento_itens:historico`, como a fila do Revisar), e entra em `recarregarTodos`; (c) as duas leituras são **paginadas** (`criarGerenciador({ paginar: true })`: `order id` + `range` de 1000 até uma página vir incompleta; uma página que falha é erro, nada pela metade; uma consulta nova por página). Um Pagamento novo ou desfeito em outro aparelho chega sozinho: o INSERT entra, o UPDATE com `excluido_em` tira da memória (`replica identity full`); `aplicar` e `desfazer` do repositório também aplicam a resposta nos dois (AD-4). (d) **De quem são as linhas** (`responsavel_id`, `ajuste_de_id`) não está nos itens: a tela lê pelo repositório (`responsaveisDasLinhas`, `.in("id")` em blocos de 100), **uma vez por linha nova** (o que mudar de Responsável depois, em outro aparelho, só aparece ao reabrir a tela: pendência). Uma linha que não volta vale "sem Responsável" e não é pedida de novo. **Memória:** só linhas de `pagamentos` e `pagamento_itens` (milhares, ao longo de anos) e um mapa id → Responsável; as linhas inteiras do detalhe são lidas sob demanda e descartadas. `test/integracao/apoio.ts` já tem `pagamentos` e `pagamento_itens` no `limpar()` e na união de `esperarEvento`: nada a acrescentar.
3. **Pagamentos desfeitos — a lista mostra só os vivos.** AD-16 manda o histórico não apagar: o Pagamento e os itens ficam no banco com `excluido_em`. A tela não os mostra: desfazer é correção de erro, refazer é um novo Pagamento, e o FR-29 pede "os Lançamentos que cada um quitou". Não há forma de ver os desfeitos na tela (consulta ao banco). Se algum dia houver caso de uso (auditoria), é um filtro "Mostrar desfeitos" sobre o mesmo gerenciador sem o escopo de vivos (pendência).
4. **O valor da lista é o RECEBIDO, e "a minha parte" aparece no detalhe.** A lista e o nome acessível mostram `valor_recebido_centavos` (o que entrou; decisão 2 da 6.2), nunca Σ itens. O detalhe mostra **"Recebido"**, **"Quitou"** (Σ itens) e, no modo `minha_parte`, **"A minha parte"** = Σ itens − valor recebido (só se positivo). O modo `total` não leva etiqueta; `parcial` e `minha parte` sim ("minha parte · 17 lançamentos").
5. **A confirmação do desfazer.** O detalhe tem **"Desfazer pagamento"** (destrutivo, desativado sem conexão), que abre a janela "Desfazer este pagamento?" por cima dele. A janela lê a **prévia** (`repoPagamentos().previaDoDesfazer`: a mesma leitura e classificação do `desfazer`, sem gravar) e diz: "O valor recebido, R$ X de dd/mm/aa, sai do histórico." + "N lançamentos voltam ao status anterior." (ou "Nenhum lançamento volta ao status anterior.") + um parágrafo por motivo de quem fica: **o Status foi mudado depois do pagamento**, **outro pagamento mexeu na linha depois** (com a dica de desfazer esse primeiro) e **só recebeu parte do valor** (o item parcial nunca mudou o Status, e o que ele cobriu volta a faltar). Os Ajustes de centavos seguem a parcela e não entram na contagem. O foco abre em **"Cancelar"** (desfazer nunca é o padrão). **Confirmar** chama `desfazer(id, esperado)`: o repositório lê de novo e **só grava se o plano de agora for o que a janela mostrou** (`mesmoPlanoDeDesfazer`); senão devolve `pagamento.mudou` sem gravar. A RPC ainda confere o `updated_at` de cada linha (`pagamento.mudou` se mexeram entre a leitura e a gravação). **Outro aparelho mudou uma linha** (`pagamento.mudou`): a janela fica aberta, **relê a prévia**, mostra "Algum lançamento mudou em outro aparelho. Confira o que muda e confirme de novo." (`pagamento.mudou_desfazer`, texto novo no mapa) e o novo resumo, e Rafael confirma de novo. **Outro aparelho já desfez** (`pagamento.ja_desfeito` ou `nao_encontrado`, na prévia ou ao confirmar): as janelas fecham e o aviso "Este pagamento já foi desfeito." aparece. Se o Pagamento aberto some da memória sem ser por esta tela (outro aparelho o desfez com o detalhe aberto), o detalhe fecha e o mesmo aviso aparece uma vez. **Mudança no `desfazer` que já existia:** um Pagamento sem item vivo devolve `pagamento.ja_desfeito` (antes devolvia ok sem fazer nada), depois de a RPC devolver o estado para a memória; o "Desfazer" do aviso (6.1/6.2) continua igual, e um segundo toque agora mostra "Este pagamento já foi desfeito." em vez de nada. O que desfazer faz continua sendo o AD-10 (decisão 14 da 6.1), por `classificarDesfazerPagamento`.
6. **O AD-10, "dois Pagamentos fora de ordem", no que é alcançável.** O núcleo e o banco fazem: parcial depois o que fecha a linha (desfazer em qualquer ordem volta ao começo), vários parciais e o que fecha (as seis ordens), `minha_parte` e `total` em linhas diferentes, e o Status mudado à mão para outro "pago" (a linha fica como está). **Um Pagamento posterior que tocou a mesma linha com um Status aplicado** não nasce pelo app (a projeção recusa linha já paga e a RPC também); o teste do banco o monta direto com o `admin`. Nele, desfazer o **mais antigo primeiro** deixa a linha como está (o posterior a tocou) e, desfazendo depois o mais novo, ela volta ao Status que ele guardou (o "pago" de antes, que já não tem Pagamento): é o que o AD-10 manda, e é por isso que a confirmação diz "desfaça esse pagamento primeiro se quiser voltar o status". Desfazer o mais novo primeiro leva tudo de volta a "não pago".
7. **Ordem, agrupamento e paginação da lista.** Do Pagamento de data mais nova para o mais antigo; no empate, o criado por último primeiro (`created_at`), depois o id (`compararHistorico`). **Sem agrupamento** (uma lista só, como o mockup) e **sem paginação na tela**: as linhas são leves (um botão de 44 pt) e a lista inteira é desenhada; a leitura é que é paginada. Se a lista passar de algumas centenas, virtualizar ou agrupar por Mês é a saída (pendência). Datas pelo `formatarData` (dd/mm/aa) e dinheiro pelo `formatarDinheiro`, ambos do núcleo.
8. **Offline (AD-3).** A lista é consulta: continua legível pelo que está na memória (os gerenciadores guardam o que já leram; recarregar a página sem rede não carrega, como nas outras telas). O detalhe precisa ler as linhas (nome, Mês, Responsável) e sem rede mostra "Não foi possível carregar" com "Tentar de novo". **"Desfazer pagamento" fica desativado sem conexão**, com "Sem conexão. Você pode consultar, mas não desfazer um pagamento." (a confirmação também desativa o botão se a conexão cair com ela aberta); nada é tentado.
9. **O detalhe é uma janela (`Janela`), não o painel lateral.** O painel lateral é do Lançamento (edição, a grade continua visível). O detalhe do Pagamento é consulta com uma ação destrutiva, no padrão de Gerar mensagem e Aplicar status: janela de até 640 px, título "Pagamento de dd/mm/aa", ✕ de 44 pt, Esc fecha. As duas janelas (detalhe e confirmação) empilham.
10. **Acessibilidade, toque e foco.** Linha da lista: botão de `min-h-toque` (44 pt) com nome acessível "12/10/26, Casal e Rangel, minha parte · 3 lançamentos, R$ 2.819,68 recebidos" (o visual é `aria-hidden` para não ler duas vezes). Filtro: grupo "Filtrar por Responsável" de botões `aria-pressed` (44 pt), em ordem de cadastro. A lista é `<ul aria-label="Pagamentos">` e o resumo "N pagamentos" é um `role="status"` só para leitor de tela. **Foco:** o detalhe e a confirmação abrem no padrão do Radix; a confirmação abre em "Cancelar"; ao fechar o detalhe o foco volta à linha que o abriu; **depois de desfazer**, como a linha não existe mais, o foco vai para o título da seção (`aoFecharFoco`, prop nova da `Janela`). A confirmação e o resumo são `aria-live="polite"`; os erros, `role="alert"`.
11. **Quantidade = Lançamentos que o Pagamento toca, sem os Ajustes de centavos** (como o aviso da 6.1 e a projeção). O valor do Ajuste entra no peso do Responsável dele. Um Pagamento sem nenhum item vivo na memória ainda não aparece (o INSERT do Pagamento pode chegar antes dos itens).
12. **Estados.** Carregando: esqueleto de 3 linhas ("Carregando os pagamentos…"). Erro (qualquer gerenciador, ou a leitura das linhas): "Não foi possível carregar." com "Tentar de novo" (relê os quatro gerenciadores e as linhas). Vazio: "Nenhum pagamento registrado ainda." + "Quando você aplicar um status que conta como pago, o pagamento aparece aqui." Filtro sem resultado: "Nenhum pagamento deste responsável." (só acontece enquanto o último deste Responsável é desfeito; o filtro volta a "Todos" sozinho).
13. **Sem migração, e a `database.types.ts` não muda.** Nada a aplicar em produção. A 6.2 já está em produção (`db push` feito depois do merge dela); `docs/infraestrutura.md` registra os dois fatos.

## I/O & Edge-Case Matrix

| Cenário | Entrada | Saída esperada |
|---|---|---|
| Lista | 3 Pagamentos (Mãe total, Lucas parcial, Rangel minha parte) | do mais novo ao mais antigo; "parcial · 1 lançamento", "minha parte · 3 lançamentos", o total sem etiqueta; valor recebido |
| Valor da lista | `minha_parte`: itens somam R$ 5.639,85, recebido R$ 2.819,68 | R$ 2.819,68 |
| Responsável misto | itens do Casal e do Rangel | "Casal" e "Rangel" (o de mais valor primeiro); aparece nos dois filtros |
| Filtro | Rangel / Casal / Mãe / Todos | só os que têm linha dele; "Todos" volta tudo |
| Ajuste de centavos | parcela + Ajuste | 1 lançamento; o Ajuste entra no peso do Responsável |
| Sem Pagamentos | — | "Nenhum pagamento registrado ainda." |
| Pagamento novo em outro aparelho | INSERT do Pagamento e dos itens | entra na ordem; lê só as linhas novas |
| Desfeito em outro aparelho | UPDATE com `excluido_em` | sai da lista; filtro sem ele volta a "Todos" |
| Detalhe | toque na linha | título, Recebido/Quitou, cada Lançamento com Mês, Responsável, valor do item e "Não pago → Pago"; item parcial: "Pagamento parcial · o status não mudou" |
| Detalhe de `minha_parte` | recebido 2.819,68, itens 5.639,85 | "A minha parte: R$ 2.820,17" |
| Linhas não lidas | leitura falha | "Não foi possível carregar" + "Tentar de novo" |
| Sem conexão | — | lista e detalhe seguem; "Desfazer pagamento" desativado com o aviso |
| Confirmação | abrir | "Conferindo os lançamentos…" e depois o resumo; foco em "Cancelar" |
| Cancelar | — | fecha só a confirmação; nada é gravado |
| Confirmar | plano igual ao visto | `desfazer(id, esperado)`; fecha tudo; "Pagamento de R$ X desfeito"; foco no título |
| Linha mudou em outro aparelho | plano de agora ≠ visto (ou RPC `pagamento.mudou`) | nada gravado; a janela relê, avisa e pede confirmar de novo |
| Já desfeito em outro aparelho | prévia, confirmação ou detalhe aberto | fecha e "Este pagamento já foi desfeito." |
| Outra falha | RPC recusa | a mensagem na janela, que segue aberta |
| Fora de ordem (banco) | parcial + o que fecha; 3 Pagamentos na mesma linha; `minha_parte` + `total`; Status à mão | em qualquer ordem, as linhas voltam a "não pago" (a mexida à mão fica) e não sobra item vivo |
| Posterior (montado pelo admin) | P1 quitou; P2 depois aplicou Pix na mesma linha | desfazer P1 primeiro: linha fica (Pix); P2 primeiro: tudo volta |
| Leitura paginada | 2.500 linhas | 3 páginas; página que falha = erro |

## Code Map

- `src/domain/pagamento.ts` (+ teste): `classificarDesfazerPagamento`, `planejarDesfazerPagamento` por ela. `src/domain/historico-pagamentos.ts` (+ teste, com o teste de aceite do AD-10 num banco em memória): resumo, ordem, filtro, detalhe, resumo e igualdade do desfazer. `src/domain/mensagens.ts` (+ `mensagens-historico.test.ts`): `TEXTOS_HISTORICO`, rótulos e `pagamento.mudou_desfazer`.
- `src/data/realtime.ts` (+ `realtime-historico.test.ts`): `paginar`, `ESCOPO_DO_HISTORICO`, `gerenciadorItensDoHistorico`, `useItensDoHistorico`. `src/data/pagamentos-repo.ts` (+ teste): `previaDoDesfazer`, `desfazer(id, esperado)`, `responsaveisDasLinhas`, `linhasDoPagamento`, e os dois gerenciadores novos recebem a resposta das RPCs.
- `src/features/recebimentos/HistoricoDePagamentos.tsx`, `JanelaDetalhePagamento.tsx`, `JanelaDesfazerPagamento.tsx` (+ teste jsdom). `src/app/(app)/recebimentos/page.tsx`. `src/ui/Janela.tsx` (`aoFecharFoco`).
- `test/integracao/pagamentos.test.ts`: fora de ordem no banco, leitura paginada, Realtime de `pagamentos`.

## Tasks & Acceptance

- [x] Núcleo: classificação do desfazer por item; histórico (resumo, ordem, Responsáveis, filtro, detalhe, resumo do desfazer); teste de aceite do AD-10 com o núcleo inteiro.
- [x] Dados: gerenciador paginado e escopo de vivos; itens de todos os Meses; prévia do desfazer e `esperado`; `ja_desfeito` sem item vivo.
- [x] Telas: seção do Histórico (lista, filtro, estados), detalhe e confirmação, ligada em Recebimentos; textos pelo mapa.
- [x] Provas: jsdom (25 cenários), pglite com o núcleo real (E1 a E6), teste de integração do CI.
- [ ] CI verde na PR (`supabase`, "Backup gera e restaura", `verificar`).
- [ ] `done` no sprint-status só depois do merge, em PR separada.

## Implementation Notes

- **Prova do banco no pglite** (todas as migrações em ordem, o núcleo real por `jiti`, sem migração nova): E1 parcial + o que fecha nas duas ordens, E2 três Pagamentos na mesma linha nas seis ordens, E3 `minha_parte` + `total`, E4 Status mudado à mão, E5 Pagamento posterior montado direto (as duas ordens), E6 desfazer de novo não muda nada. Não prova RLS por papel, o PostgREST (`order` + `range`) nem o Realtime: isso é do CI.
- **Efeito colateral combinado:** `Janela` ganhou `aoFecharFoco` (para o foco não cair no `body` depois de desfazer); `criarGerenciador` ganhou `paginar` (os outros gerenciadores não mudam).

## Verification

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (ver a PR). Os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos.
- **Só o CI prova:** `order id` + `range` no PostgREST, o `in` de `lancamentos` com as colunas novas, o Realtime de `pagamentos` (INSERT e UPDATE com `excluido_em`) e os cenários "fora de ordem" no banco de verdade.
- **Não verificado:** iPad (toque, foco, VoiceOver, as duas janelas empilhadas), produção (nenhum dado de produção foi lido nem alterado) e uma lista com milhares de Pagamentos.
