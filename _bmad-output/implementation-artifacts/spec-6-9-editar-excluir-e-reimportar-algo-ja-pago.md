---
title: 'História 6.9: Editar, excluir e reimportar algo já pago'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '834c5db'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o Saldo pendente pode mudar sem Rafael saber (FR-46, FR-51). Editar o Valor de um Lançamento com Pagamento, ou excluí-lo, muda o Saldo de algum Bloco sem aviso. E reimportar um Mês com Pagamentos tem um buraco: a RPC `importar_fatura` apaga as linhas excluídas do Mês, e uma excluída que tem item de `pagamento_itens` derruba a transação inteira pela FK (a tela diz só "Não foi possível importar"). O mesmo vale para uma linha viva sem par cujo único item é de um Pagamento já desfeito (a 6.1 só olhava itens vivos).

**Approach:** (1) o núcleo ganha `avisarMudancaComPagamento` (`src/domain/aviso-pagamento.ts`): o "antes e depois" do Saldo pendente de cada Bloco de cobrança é `projetarPendente` (AD-11) nas linhas de todos os Meses, com e sem a mudança, e a Fórmula de cada Bloco; a tela confirma antes de gravar com "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 0,00 para - R$ 310,67." (2) A reimportação passa a tratar **qualquer** item de Pagamento (vivo ou de um Pagamento desfeito) como referência (AD-15): a viva sem par com Pagamento sai da Fatura com `sumiu_na_reimportacao` e o Pagamento segue com ela (o Saldo continua contando); a excluída com Pagamento fica excluída, com o Pagamento. (3) **Uma migração** (`20261130120000_pagamento_reimportar_editar.sql`, só `create or replace` de duas funções, sem schema novo) dá a `importar_fatura` e a `excluir_linhas_da_conta` a trava de estrutura. (4) O teste de aceite "reimportar outubro com Pagamentos" termina com o **mesmo Saldo pendente**, no núcleo e no banco.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** o "antes e depois" do Saldo e a lista de linhas afetadas moram em `src/domain/aviso-pagamento.ts` (só imports relativos). Tela e SQL não refazem a conta.
- **Uma só conta de Saldo (AD-11):** o aviso usa `projetarPendente` e a Fórmula do Bloco (`avaliar`), a mesma de Recebimentos.
- **Dinheiro em centavos; nomes do Glossário; textos só em `mensagens.ts`; nenhuma cor literal; o aviso é sempre texto; alvos de 44 pt.**
- **Schema só por migração (AD-14):** a migração é arquivo novo em `supabase/migrations`, **escrita e NÃO aplicada**. Nenhuma tabela, coluna, tipo, permissão nem `database.types.ts` mudam.
- **O aviso é confirmação, não bloqueio.**

**Ask First:** aplicar a migração em produção (só depois do merge, quando Rafael pedir). Nenhum dado de produção foi lido nem alterado.

**Never:** mudar a alocação de Pagamento (AD-10), `estaAtrasado`, a Conferência, as formas 1 a 3 da mensagem, "Por proporção", o Épico 7, o Histórico de Pagamentos além de ler o que existe. Rodar `supabase db push`.

## Decisões (registradas, nada implícito)

1. **Quais edições avisam: Valor e exclusão sempre; Responsável, Tipo e Status só se um Saldo muda.** A linha mexida tem de ter item de Pagamento vivo. (a) **Valor e excluir** são as duas edições que o critério de aceite nomeia, e valem mesmo quando nenhum Saldo se move: uma linha paga por inteiro tem restante 0 antes e depois de o Valor mudar, mas o Pagamento deixa de bater com o Lançamento; o aviso então diz "Nenhum Saldo pendente muda." (b) **Responsável, Tipo e Status** mudam em que Bloco a linha cai ou o restante dela, então só avisam se o Saldo de algum Bloco de cobrança muda (o Tipo quase nunca; o Responsável quase sempre). Nome, Apelido, Data, Observação e o resto: nunca. A regra mora em `avisarMudancaComPagamento` (devolve `null` quando não há o que avisar); a tela só pergunta.
2. **O "Saldo pendente" é o de Recebimentos: todos os Meses, só os Blocos de cobrança.** O aviso usa os Lançamentos, os itens e as Faturas de **todos** os Meses, para o número bater com o cartão do Bloco em Recebimentos (o `Painel` só tem o Mês aberto). Só entram Blocos de cobrança (`de_cobranca`) cujo Saldo **muda**; um Bloco cuja Fórmula não calcula (antes ou depois) fica de fora. Vários Blocos: "O Saldo pendente do Bloco Mãe muda de … para …; o do Bloco Rangel muda de … para …." Nenhum: "Nenhum Saldo pendente muda." O texto diz "do Bloco X" e não "da Mãe" do EXPERIENCE: o nome é do usuário e o artigo não acerta todos ("do Lucas", "da Mãe").
3. **Vários Pagamentos e várias linhas: todas as datas, da mais antiga à mais nova.** Uma data: "tem pagamento registrado em 08/10/26". Duas ou três: "pagamentos registrados em 08/10/26 e 12/10/26" (ou com vírgula); mais de três: "em 5 datas, de 01/10/26 a 20/10/26". Várias linhas na Seleção: "3 lançamentos têm pagamento registrado em …" (só contam as com Pagamento). Um Pagamento desfeito não tem data no aviso.
4. **Onde a confirmação mora e o custo de memória.** `ConfirmarComPagamento` só é **montado** quando a linha mexida tem item vivo nos itens do Mês aberto (o Painel já os tem). É ele quem abre os gerenciadores de TODOS os Meses (Lançamentos, itens, Pagamentos, Faturas), a memória que Recebimentos já usa; o Painel comum **não** a paga (decisão 1 da 6.5 intacta). Enquanto lê: "Conferindo os pagamentos já registrados…" e o botão desativado. Se a leitura falha: "…não foi possível conferir o efeito nos Saldos pendentes" e deixa confirmar. Na edição de um campo a janela só aparece se `avisarMudancaComPagamento` devolver algo; senão grava direto. Cancelar devolve o campo ao valor gravado. Se o painel fecha com o campo em foco, a gravação do desmonte **não** vale numa linha com Pagamento (sem confirmar não se muda).
5. **Excluir com Pagamento: só confirma.** Não oferece "desfazer o Pagamento primeiro": o crédito de AD-11 existe justamente para o dinheiro que entrou por uma linha que saiu, e "Excluído · Desfazer" já devolve a linha. O mesmo vale para o "Excluir" da Seleção (as marcadas e os Ajustes delas contam). Vale também para as filhas e os Ajustes que saem junto.
6. **O crédito de um Pagamento `minha_parte` fica como está (Σ itens, o restante inteiro).** Avaliei a alternativa "valor recebido proporcional" e ela erra no caso para o qual `minha_parte` existe: o Rangel paga R$ 50,00 do Casal de R$ 100,00; o item guarda R$ 100,00 e a Fórmula do Rangel já divide o Casal por 2. Excluída a linha, o crédito de - R$ 100,00 no Casal vira - R$ 50,00 no Rangel, que é o que entrou. Proporcionalizar de novo aplicaria o "÷ 2" duas vezes. **Limite registrado:** num `minha_parte` fora desse caso (perdão de parte da dívida com Fórmula de soma simples) o crédito supera o que entrou; o aviso mostra o número antes de confirmar. Provado em `projecoes-pendente.test.ts`. Fecha a pendência da 6.5.
7. **Reimportação com Pagamentos.** (a) **Viva sem par e com item** (da linha ou de uma parte da Divisão, **vivo ou de um Pagamento desfeito**: a FK segura os dois): sai da Fatura, vira `manual` e fica com `revisao_motivo = 'sumiu_na_reimportacao'`, mesmo sem trabalho manual. O **Pagamento fica com ela e o Saldo continua contando** (`projetarPendente` não olha `fatura_id`); ela aparece no Revisar com o motivo, "Excluir" e "Manter". (b) **Ajuste sem par com item próprio** também sai (antes só acompanhava a mãe). (c) **Excluída com item:** a RPC deixa de apagá-la; fica **excluída, com o Pagamento** (o crédito segue no Saldo) e a linha da Fatura nova volta como **nova**, como toda excluída (3.11). O Saldo sobe o valor da linha que voltou (ela está em aberto): é a regra da 3.11, não uma perda. (d) **Pareadas:** mantêm `id`, Status e Pagamentos. Com o Valor igual, o Saldo é o mesmo; com o Valor diferente, o restante muda e o aviso do passo 3 já conta "N com valor diferente".
8. **Redividir e "Desfazer divisão" de uma parte já paga: fica anotado, não entra.** Custo: o aviso teria de simular em TS o resultado de `recriar_filhas` (partes novas, partes que sobram, Status que a filha herda) para montar o "depois" na janela Dividir, duplicando uma regra do SQL que a 3.8 deixou de propósito num lugar só. Risco que fica: `recriar_filhas` reusa a filha pelo `filha_id` (o Pagamento continua nela) e a parte que sobra sai em lógico (vira crédito, AD-11), então o Saldo agregado segue certo; só o aviso não existe. Raro (parte paga que depois se redivide). Anotado no `deferred-work.md`. `recriar_filhas` e `dividir_lancamento` **não mudam**.
9. **Conta manual alterada ou encerrada: a preservação já existia; a migração só acrescenta a trava.** `alterar_conta_manual` e `excluir_conta_manual` recebem do núcleo (`parcelasRecriaveis`, `comPagamento` da 6.1) só as linhas recriáveis, e `excluir_linhas_da_conta` conferia o `updated_at` (o Pagamento move a versão da linha, então um Pagamento registrado depois da leitura já dava `conta.mudou`). A migração acrescenta a trava explícita (AD-15): `excluir_linhas_da_conta` recusa (`conta.mudou`) uma linha com item de Pagamento **vivo**, sem depender do `updated_at`. O materializador e `recriar_filhas` não mudam.
10. **A trava de estrutura de `importar_fatura`.** A RPC calcula `ids_com_item` (linhas da Fatura com qualquer item, ou parte com item). (a) Se uma linha de `apagar` está nele, o plano está velho (um Pagamento entrou depois da leitura): `fatura.mes_mudou`, nada é gravado (antes: erro da FK e "Não foi possível importar"). (b) As excluídas nele não são apagadas. (c) O previsto `sistema` que uma linha apagada criou também não é apagado se tem item. **Duplicação registrada:** "tem item" é decidido no repositório (`lerReimportacao` → `referenciadas` → o plano) e na RPC (`ids_com_item`). Os dois olham a mesma coisa (qualquer item da linha ou de uma parte); a RPC não decide destino, só se recusa a apagar. Amarra: `test/integracao/pagamento-reimportar.test.ts` (o plano velho é recusado, o certo passa) e `reimportacao-pagamento.test.ts` (a invariante no núcleo: nenhuma linha com item cai em `apagar`).
11. **Revisar e o "Remover previsto" não avisam.** "Excluir" de uma linha `sumiu_na_reimportacao` com Pagamento, no Revisar, não mostra o aviso (a fila não tem confirmação). Anotado no `deferred-work.md`. Um previsto da Série não entra em Pagamento, então "Remover previsto" não tem o caso.
12. **Offline (AD-3).** O aviso não grava nada. Excluir e editar seguem desativados sem conexão pelos repositórios de sempre.

## I/O & Edge-Case Matrix

Hoje 15/11/26. Bloco de cobrança "Mãe" (= Responsável Mãe). Linha NETFLIX: Mãe, R$ 200,00.

| Cenário | Entrada | Saída |
|---|---|---|
| Excluir pago por inteiro | R$ 310,67 pagos em 08/10/26, Status Pago | "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 0,00 para - R$ 310,67." + "Excluir lançamento" |
| Excluir com Pagamento parcial | R$ 100,00 pagos de R$ 310,67 | Mãe de R$ 210,67 para - R$ 100,00 (o restante sai, entra o crédito) |
| Valor de linha parcial | R$ 200,00 com R$ 50,00 pagos, Valor 300,00 | Mãe de R$ 150,00 para R$ 250,00; grava só ao confirmar |
| Valor de linha paga por inteiro | Valor 250,00 | "…em 08/10/26. Nenhum Saldo pendente muda." |
| Responsável de linha parcial | Mãe → Lucas | dois Blocos: Mãe de R$ 150,00 para R$ 0,00; o do Bloco Lucas de R$ 0,00 para R$ 150,00 |
| Tipo, Nome, Apelido, Observação | com Pagamento | grava direto, sem janela (o Tipo só avisa se algum Saldo mudar) |
| Linha sem Pagamento | qualquer edição ou exclusão | como antes (sem aviso, nem a leitura de todos os Meses) |
| Vários Pagamentos | 08/10/26 e 12/10/26 | "…pagamentos registrados em 08/10/26 e 12/10/26" |
| Excluir da Seleção | 1 paga + 1 livre | "Este lançamento tem pagamento…" + "2 lançamentos saem da grade" |
| `minha_parte` (Rangel) | Casal R$ 100,00, itens R$ 100,00, excluída | crédito - R$ 100,00 no Casal; o Rangel vai a - R$ 50,00 |
| Leitura de todos os Meses falha | — | "não foi possível conferir…"; deixa confirmar |
| Ainda lendo | — | "Conferindo…"; confirmar desativado |
| Cancelar / Esc | — | nada grava; o campo volta ao valor gravado |
| Reimportar outubro (aceite) | A, B, C iguais; D (paga) e E (paga e excluída) fora da Fatura | A, B, C mantêm id e Pagamentos; D sai da Fatura (`sumiu_na_reimportacao`); E fica excluída com o Pagamento; **Saldo igual ao de antes** |
| Plano velho | linha com Pagamento em `apagar` | `fatura.mes_mudou`, nada gravado |
| Item de Pagamento desfeito | viva sem par / excluída | viva sai da Fatura; excluída fica |
| Excluída com Pagamento que a Fatura traz de novo | — | volta como nova; o crédito da antiga segue; o Saldo sobe o valor dela |
| Conta manual com parcela paga | `excluir_linhas_da_conta` | `conta.mudou`; a parcela sem Pagamento é excluída |

## Code Map

- Núcleo: `src/domain/aviso-pagamento.ts` (novo: `avisarMudancaComPagamento`, tipos); `src/domain/mensagens.ts` (`TEXTOS_AVISO_PAGAMENTO`, `rotuloDatasDoPagamento`, `textoDoAvisoDePagamento`, `avisoReimportar` com os excluídos com Pagamento); `src/domain/reimportacao.ts` (`excluidosComPagamento`, o Ajuste referenciado).
- Dados: `src/data/faturas-repo.ts` (`lerReimportacao` lê todos os itens, vivos ou não).
- Interface: `src/features/painel/ConfirmarComPagamento.tsx` (nova), `PainelLancamento.tsx` (confirma Valor, Responsável, Tipo e Status), `Painel.tsx` (exclusão simples e em lote, props), `src/ui/ConfirmarAcao.tsx` (`desativarConfirmar`).
- Migração: `supabase/migrations/20261130120000_pagamento_reimportar_editar.sql` (`importar_fatura` de 8 argumentos e `excluir_linhas_da_conta`, por `create or replace`). Sem `database.types.ts`.
- Provas: `aviso-pagamento.test.ts` (19), `reimportacao-pagamento.test.ts` (4, o aceite no núcleo), `reimportacao.test.ts` (+3), `projecoes-pendente.test.ts` (+2), `mensagens.test.ts` (+1), `faturas-repo.test.ts` (ajustado), `PainelLancamentoPagamento.test.tsx` (8, jsdom), `Painel.test.tsx` (+5, a exclusão), `test/integracao/pagamento-reimportar.test.ts` (5, o aceite no banco, só roda no CI e no pglite).
- Sem: `pagamento.ts` (a alocação), `atraso.ts`, `recriar_filhas`, `dividir_lancamento`, o Cron, `database.types.ts`.

## Tasks & Acceptance

- [x] Núcleo: `avisarMudancaComPagamento` e os textos pelo mapa.
- [x] Reimportação: `referenciadas` com qualquer item, excluídas com Pagamento no resumo e no aviso, Ajuste referenciado.
- [x] Migração escrita (NÃO aplicada) e provada no pglite com o núcleo real (os 5 cenários passam; sem a migração os 5 falham pela FK).
- [x] Interface: confirmação no painel do Lançamento e na exclusão (simples e em lote).
- [x] Provas: núcleo, jsdom, `test/integracao` e o aceite.
- [x] `sprint-status.yaml` (6.9 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (HÁ migração e o que muda até o `db push`).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura"; os dois últimos provam a migração de verdade).
- [x] Merge (#104) e `done` no sprint-status, em PR separada.
- [x] `supabase db push` da migração `20261130120000` feito em 19/11/2026, a pedido do Rafael.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3530 passam (mais 49 que na 6.8), 26 arquivos pulados (os de integração, que só rodam com `INTEGRACAO_SUPABASE=1`). `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos. `npm run build` **não foi rodado**: falha local por um aviso do `next@16.4.3` (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar`.
- **pglite (Postgres em memória, todas as migrações em ordem):** o mesmo `test/integracao/pagamento-reimportar.test.ts` roda contra um cliente mínimo no formato do supabase-js: 5 de 5 passam com a migração; sem ela os 5 falham com `violates foreign key constraint "pagamento_itens_lancamento_fkey"`. Não prova RLS, papéis, PostgREST nem Realtime.
- **Só o CI prova:** o job `supabase` (a migração em Postgres de verdade, o teste de integração com RLS e PostgREST) e o "Backup gera e restaura".
- **Não verificado:** iPad e PC (a janela de confirmação com o texto longo do aviso, o foco, o VoiceOver); com dados reais (nenhum dado de produção foi lido); o custo de abrir a memória de todos os Meses na primeira confirmação de uma linha paga.
