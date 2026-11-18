---
title: 'História 6.6: Dívida programada'
type: 'feature'
created: '2026-11-16'
status: 'review'
baseline_commit: '649bcdc'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-atrasado.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem como dizer "esta conta se cobra só em 06/04/27" (FR-27). A parte do Lucas na Bombinhas (R$ 636,00) entra todo mês na mensagem, a Mãe e o Casal pagam R$ 106,00 por mês, e nada lembra o Rafael da data combinada nem avisa quando ela passa.

**Approach:** a **única migração do Épico 6** acrescenta `vencimento_combinado` (e a observação do combinado, `vencimento_observacao`) em `lancamentos`. O núcleo (`src/domain/divida.ts`) lê as datas, planeja "Programar dívida" e "Desprogramar" (com o "Desfazer") e monta "A receber"; `projetarMensagem` e `projetarPendente` deixam de fora a Dívida **ainda não vencida** (o Mês do vencimento não chegou, `hoje` como parâmetro) com a MESMA regra; `estaAtrasado` (6.4) passa a usar o vencimento combinado só por a coluna agora chegar nas linhas. A interface ganha "Programar dívida" (⋯ Mais da Seleção, ⋯ da linha e campo do painel do Lançamento), o selo "Programada · 06/04/27", a seção **A receber** em Recebimentos e o seletor "Mensal / Dívida programada" por parte no formulário da Conta manual. Uma RPC nova (`programar_divida`) grava tudo ou nada; `recriar_filhas` leva a data por parte (é por ela que a Conta materializa as filhas).

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** toda regra em `src/domain` (só imports relativos, sem relógio: `hoje` e o instante da edição entram como parâmetro). A tela lê, chama o núcleo e desenha.
- **Uma regra de "aberto" (AD-11):** nenhuma tela filtra linhas antes de `avaliar`; a regra da Dívida não vencida mora em `projetarPendente` e em `projetarMensagem`, ambas chamando `dividaAindaNaoVence`.
- **Schema só por migração (AD-14):** `20261129120000_divida_programada.sql`, `database.types.ts` no formato do gerado. **Não aplicada em produção** (`supabase db push` só depois do merge e a pedido).
- **Dinheiro em centavos; nomes do Glossário; textos só por `mensagens.ts`; nenhuma cor literal; alvos de 44 pt; log só por `src/server/log.ts`.** Dados de Recebimentos pelo gerenciador `lancamentos:todos` (nenhuma leitura avulsa).

**Never:** "Cobrar pendências" funcionando (6.7); Meses anteriores da Fatura (6.8); editar/excluir/reimportar algo já pago e o aviso de Saldo (6.9); lembretes e Web Push (Épico 7); Previsão; "Por proporção" no formulário da Conta. Mudar o que o Pagamento quita ou a alocação, a regra de `estaAtrasado` além de ligar a coluna, ou o casamento da reimportação. Ler ou alterar dados de produção.

## Decisões (registradas, nada implícito)

1. **A migração (aprovada pelo Rafael antes de seguir).** `vencimento_combinado date` e `vencimento_observacao text` (restrições: data entre 2000-01-01 e 2099-12-31; a observação só existe com a data e tem 1 a 500 caracteres; comentário nas duas colunas), a função `recriar_filhas` recriada (mesma assinatura) e a RPC nova `programar_divida(p_itens jsonb)`. Provada no pglite com as 29 migrações em ordem (9 cenários) e, no CI, por `test/integracao/divida-programada.test.ts`.
2. **O que muda e o que não precisa mudar nas RPCs (conferido, uma a uma).**
   - **Muda:** `recriar_filhas` (a parte traz `vencimento_combinado`: chave presente grava na filha, nula limpa também a observação; **chave ausente mantém**, como `status_id`, então "Dividir" de novo não perde a Dívida; a filha nova nasce com a data da parte). **Nova:** `programar_divida`.
   - **Não mudam:** `importar_fatura` e a reimportação (a linha casada é atualizada no mesmo `id` com colunas nomeadas que não incluem as novas, então a data se mantém; a linha nova nasce sem Dívida; o previsto que casa idem), `dividir_lancamento` (só chama `recriar_filhas`), `materializar_contas_manuais`, `materializar_contas_manuais_do_dono`, `salvar_conta_manual`, `alterar_conta_manual` (a `divisao` da Conta é `jsonb` livre e as filhas saem por `recriar_filhas`), `aplicar_pagamento`, `desfazer_pagamento`, `classificar_em_lote`, `importar_aba_planilha`, `substituir_cadastro`, `referencias_cadastro`.
3. **Observação: coluna própria, não a `observacao` existente.** A Observação da filha de uma Divisão segue a da mãe (`recriar_filhas` a copia por cima, `SEGUEM_AS_FILHAS` no painel) e já guarda outras coisas ("Comprada em 10x"). A nota do combinado é de uma parte e tem de sobreviver a "Dividir" de novo. Uma coluna anulável, ligada à data por restrição, custou uma linha na migração que já existia.
4. **"Ainda não venceu" em datas.** `dividaAindaNaoVence(l, hoje)`: o **Mês de calendário** do `vencimento_combinado` é depois do Mês de `hoje` (`hojeEmSaoPaulo`, parâmetro; sem relógio no núcleo). No Mês do vencimento (até no dia 1) a Dívida passa a entrar na mensagem e no Saldo; **atrasa** só depois do dia + a tolerância (regra da 6.4, não mudada). Sem data, ou `hoje` ilegível, nada é escondido. Data no passado vale (então já entra) e a janela avisa "Essa data já chegou".
5. **Saldo pendente da 6.5 e a mensagem: a mesma regra (AD-11).** Uma Dívida ainda não vencida **fica fora** de `projetarPendente` (Saldo do cartão, selo, "Meses em aberto", lista "Ver", "Falta receber" do hero) e de `projetarMensagem` (motivo novo `programada`, frase "N dívidas programadas ainda não vencidas"; precedência previsto, pago, programada, zero). Prova do mock `recebimentos.html`: a Mãe aparece "Em dia" com o Óculos de 06/12/26 só em "A receber". O Painel (`projetarPainel`) segue com o valor cheio (o gasto do Mês, 6.5). `hoje` passou a ser parâmetro **obrigatório** (`OpcoesDaMensagem`, `OpcoesDoPendente`, `previaDoModelo`): o typecheck achou todos os chamadores. A prévia do modelo na Configurações usa a mesma regra.
6. **Mãe dividida, Ajuste, pago.** O campo é por Lançamento. Programar uma **mãe dividida** programa as partes vivas não pagas (a mãe nunca é programada: a RPC recusa `programada.mae_dividida`); uma parte sozinha, só ela. O **Ajuste** de centavos acompanha a parcela (mesma data, sem observação) e, marcado junto com ela, não é um item a mais. **Já pago** (Status que conta, ou itens que já cobrem o valor) e **valor zero ou negativo** ficam de fora, contados no aviso ("1 já pago ficou de fora"); só pagos: erro `divida.so_pagos`. **Pago parcialmente PODE** (o restante é o que se cobra). O que já está com a mesma data e observação não é regravado.
7. **Marca de edição à mão.** `programar_divida` grava `editado_em` na linha e, se é filha, na mãe: a reimportação e "Alterar conta" a preservam (FR-51, AD-15). Em reforço, `temTrabalhoManual` (reimportação) também reconhece `vencimento_combinado`, então uma linha sem par com data vai ao Revisar como `sumiu_na_reimportacao` em vez de ser apagada. O casamento não mudou.
8. **Previstos e herdeiros não herdam a data.** A próxima parcela prevista (3.5) e a herança (3.7) não copiam o `vencimento_combinado` (nem `copiarDivisao`, que só leva a data se a Conta manual pedir): a data é de uma parcela específica.
9. **"A receber" em Recebimentos** (entre os cartões e o Histórico). `aReceber`: todas as Dívidas programadas **em aberto**, **previstos inclusos** (a Bombinhas ainda sem Fatura conta: senão não somaria R$ 636,00), por data e nome; as vencidas levam o selo "Atrasado" (o atraso real, do núcleo). **Uma linha por Série + Responsável + vencimento** (a parte do Lucas da Bombinhas é uma linha de R$ 636,00, "6 lançamentos · Jul/26 a Dez/26"); um avulso é uma linha. O Ajuste soma na parcela. Sem nenhuma: "Nenhuma dívida programada". Não depende de haver Blocos de cobrança. Limitação herdada da 6.4: um **previsto** (Conta manual de um Mês sem Fatura) nunca atrasa, então a Dívida dele vencida só vira "Atrasado" quando a Fatura do Mês chegar.
10. **Tocar abre o painel do Lançamento: pelo Painel, não dentro de Recebimentos.** O repositório de Lançamentos guarda só o Mês aberto (AD-4), então um painel em Recebimentos não editaria uma linha de outro Mês. O toque leva a `/?mes=AAAA-MM&lancamento=<id>`: a página valida o formato (`ehMes`, uuid; o resto é ignorado) e o `Painel` abre naquele Mês com o painel lateral já aberto (`mesInicial` e `lancamentoInicial`). Uma linha de vários lançamentos é um interruptor que mostra cada um, com o seu toque.
11. **O selo "Programada · 06/04/27".** `SeloStatus` ganha a variante `programada`: um selo **neutro de borda** (como o "Previsto"), sem token novo e sem cor literal; a palavra e a data são texto. Aparece na grade (ao lado do Status; some quando a linha está paga, na mãe dividida e no Ajuste), no painel do Lançamento e no nome acessível da linha.
12. **Filtro de Status "Programada": não feito.** O UX só pede o selo (e "A receber" lista todas); o filtro de Responsável e a seção cobrem o uso. Fica como pendência no `deferred-work.md` se fizer falta (seria um valor calculado como o "Atrasado").
13. **A janela, o campo do painel e o "Desfazer".** "Programar dívida" (⋯ Mais da barra de Seleção, ⋯ da linha, ⋯ do cabeçalho da Divisão): data obrigatória + observação opcional, numa janela só; abre com a data e a observação de uma Dívida que já existe (Editar). O painel do Lançamento tem o interruptor "Dívida programada": ligar abre a janela; desligar grava na hora; os dois têm aviso com "Desfazer" (a mesma RPC com os valores de antes). Sem conexão, "Programar" fica desativado (AD-3). Erro (do núcleo ou do banco) fica na janela, que não fecha.
14. **Conta manual: parte "Dívida programada".** Numa Divisão de **2 ou mais partes**, cada parte escolhe "Mensal" ou "Dívida programada" com data (`type=date`, obrigatória e válida: erro `conta.vencimento_invalido`). A data vai na parte da `divisao` da Conta (receita, AD-8) e `parcelasDaConta` a leva às `partes` de cada parcela; a RPC grava a coluna na filha. Aceite: na Bombinhas, o Lucas soma R$ 636,00 em "A receber" (vencimento 06/04/27) e a Mãe e o Casal seguem com R$ 106,00 por mês nas mensagens. **Limite:** uma Conta de **uma parte só** não tem o seletor (a Divisão é quem guarda a data); programa-se depois, pelo Painel. `contaMudou` compara também as datas (mudar só a data é mudança). **Alterar/Encerrar (5.4):** as linhas recriáveis nascem com a data nova; as que ficam (pagas, com Pagamento, editadas à mão, inclusive as programadas pelo Painel, que ganham `editado_em`) mantêm a que tinham. O Cron diário (AD-15) lê a `divisao` da Conta e materializa com a mesma data.
15. **Sem mudar o que não era desta história:** `aplicar_pagamento` e a alocação, `estaAtrasado` (só passou a receber a coluna: `vencimentoDoLancamento` já a lia), o casamento da reimportação, a mensagem em si.

## I/O & Edge-Case Matrix

Hoje 16/11/26; tolerância 10; Bombinhas (6 parcelas Jul a Dez/26, três partes de R$ 106,00, a do Lucas até 06/04/27); Óculos da Mãe R$ 270,00 até 06/12/26.

| Cenário | Entrada | Saída |
|---|---|---|
| Programar a Seleção | 2 linhas, 06/04/27, "no final" | 1 chamada `programar_divida` com 2 itens (`editado_em` do instante); aviso "2 lançamentos programados para 06/04/27 · Desfazer"; selo nas duas linhas |
| Sem data | "Programar" | "Escolha a data combinada."; nada gravado |
| Já pago na Seleção | 1 paga + 1 em aberto | só a em aberto; "· 1 já pago ficou de fora"; só pagas: "Estes lançamentos já estão pagos…" |
| Mãe dividida | ⋯ do cabeçalho | as partes (nunca a mãe) |
| Ajuste | parcela + Ajuste −R$ 0,08 | o Ajuste recebe a data, sem observação |
| Desfazer | aviso | a RPC com os valores de antes |
| Mensagem, antes do mês | 16/11/26, Lucas até 04/27 | fora ("1 item não entra: 1 dívida programada ainda não vencida") |
| Mensagem, no mês | 01/04/27 a 30/04/27 | entra |
| Saldo do cartão | Lucas só com a Bombinhas | "Em dia", R$ 0,00; em 02/04/27 "Não pago", R$ 106,00 por linha |
| Atrasado | Óculos 06/12/26, hoje 18/12/26 | "Atrasado desde 17/12/26" (cartão da Mãe e "A receber") |
| A receber | Bombinhas + Óculos | Óculos (06/12/26, R$ 270,00) e Bombinhas (06/04/27, **R$ 636,00**), nessa ordem |
| Paga em outro aparelho | Status "Pago" | a linha sai de "A receber" sem recarregar |
| Sem nenhuma | — | "Nenhuma dívida programada" |
| Tocar numa linha | Óculos | `/?mes=2026-10&lancamento=<id>`, painel aberto |
| Link inválido | `?mes=julho` | ignorado, Painel normal |
| Conta: parte programada sem data | "Salvar" | "Escolha a data combinada de cada parte programada."; foco na data |
| Conta: só a data mudou | editar | é mudança (grava e recria as recriáveis) |
| Reimportar | linha casada com data | `id`, data e observação mantidos |
| Reimportar | linha sem par com data | sai da Fatura (`sumiu_na_reimportacao`), não é apagada |
| Dividir de novo | filha programada, sem a chave | a data é mantida; chave nula a limpa (e a observação) |
| Banco | mãe dividida, outro dono, excluída, nota sem data, data fora de 2000–2099, id repetido | recusados; tudo ou nada |

## Code Map

- Migração: `supabase/migrations/20261129120000_divida_programada.sql` (colunas, restrições, `recriar_filhas`, `programar_divida`); `src/data/database.types.ts`.
- Núcleo: `src/domain/divida.ts` (novo: `lerDataCombinada`, `lerObservacaoDaDivida`, `dividaAindaNaoVence`, `ehDividaProgramada`, `planejarProgramacao`, `planejarDesligar`, `programadaDe`, `aReceber`); `projecoes.ts` (`MOTIVOS_DE_FORA`, `hoje` em `OpcoesDaMensagem` e `OpcoesDoPendente`); `divisao.ts` (data por parte, `copiarDivisao(d, comVencimentos)`, `mesmosVencimentosDasPartes`); `contas-manuais.ts` (parte programada); `reimportacao.ts`; `modelo-mensagem.ts` (`hoje`); `painel.ts` (`LancamentoGrade`, nome acessível); `mensagens.ts` (`TEXTOS_DIVIDA`, `rotuloProgramada`, avisos, códigos de erro).
- Dados: `src/data/lancamentos-repo.ts` (`programarDivida`, `memoriaTodosOsLancamentos`), `faturas-repo.ts` (coluna na leitura da reimportação).
- Interface: `JanelaProgramarDivida.tsx` (nova), `Painel.tsx` (programar, desprogramar, `hoje`, `mesInicial`/`lancamentoInicial`), `BarraSelecaoPainel.tsx`, `GradeLancamentos.tsx`, `PainelLancamento.tsx` (campo), `ListaAReceber.tsx` (nova) e `Recebimentos.tsx`, `FormularioConta.tsx`, `SecaoModeloMensagem.tsx`, `JanelaMensagemDoBloco.tsx`, `SeloStatus.tsx`, `src/app/(app)/page.tsx`.
- Provas: `divida.test.ts` (37), `projecoes-programada.test.ts` (12), `divisao-vencimento.test.ts` (5), `contas-manuais.test.ts` (+9), `lancamentos-repo-programada.test.ts` (7), `GradeLancamentosProgramada.test.tsx`, `JanelaProgramarDivida.test.tsx`, `ListaAReceber.test.tsx`, `Recebimentos.test.tsx` (+8), `Painel.test.tsx` (+14), `FormularioConta.test.tsx` (+4), `page.test.tsx` (+4), `SeloStatus.test.tsx`; CI: `test/integracao/divida-programada.test.ts` e `test/backup/dados-exemplo.sql` (a filha da Conta ganha data e observação).

## Tasks & Acceptance

- [x] Migração e `database.types.ts`; prova no pglite (9 cenários).
- [x] Núcleo: `divida.ts`, `projecoes.ts` (motivo `programada` e `projetarPendente`), `divisao.ts`, `contas-manuais.ts`, `reimportacao.ts`; textos pelo mapa.
- [x] Dados: `programarDivida` (tudo ou nada, aplica nos dois gerenciadores).
- [x] Interface: "Programar dívida" (Seleção, ⋯ da linha, painel do Lançamento), selo, "A receber", seletor da Conta manual, Painel aberto por link.
- [x] Provas: núcleo, jsdom, repositório, integração (CI), backup.
- [x] `sprint-status.yaml` (6.6 em `review`), `deferred-work.md`, `docs/infraestrutura.md`.
- [ ] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [ ] `done` no sprint-status só depois do merge, em PR separada; `supabase db push` só a pedido.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (3393 passam; `eslint-formatos` e `eslint-nucleo` estouram 5 s na rodada completa e passam sozinhos, como na 6.5). `npm run build`: compila e passa no TypeScript, mas **termina com erro** por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (consulta ao registro do npm); não foi atualizado (fora desta história). Quem confirma é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` (`divida-programada.test.ts`: RPC no PostgREST de verdade, RLS, reimportação, Conta pela RPC), o "Backup gera e restaura" com as colunas novas e o Realtime das linhas com a coluna nova.
- **Não verificado:** iPad e PC (a janela, o seletor "Mensal / Dívida programada" com a data na mesma linha a 834 pt, os alvos de 44 pt, o selo neutro nos dois modos, a lista "A receber" com a linha expandida, o VoiceOver lendo o selo e o interruptor); **produção** (a migração não foi aplicada e nenhum dado de produção foi lido); o Cron diário materializando a Conta com a data (só provado pelo núcleo e pela RPC, não pela rota); a virada do mês com a tela aberta.
