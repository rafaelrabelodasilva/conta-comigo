---
title: 'História 6.7: Cobrar pendências'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: 'c670e4f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-a-partir-de-um-bloco.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-divida-programada.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem como cobrar o que ficou para trás (FR-28). A mensagem de cobrança é sempre de um Mês (FR-24, FR-53), e o botão "Cobrar pendências" do cartão de Recebimentos está desativado desde a 6.5 ("Disponível em breve"). Para cobrar o Lucas por setembro e outubro, Rafael teria de gerar duas mensagens à mão e somar.

**Approach:** o botão passa a abrir a janela Gerar mensagem do Bloco daquele cartão, com a **forma 3**: o mesmo modelo salvo (FR-23), a frase do total trocada por "Em aberto: R$ X" e os detalhes agrupados por Mês ("Setembro/26", "Outubro/26"). O núcleo (`projetarCobrancaDoBloco`, em `src/domain/recebimentos.ts`) calcula o total com a **mesma** `avaliar` sobre as **mesmas** linhas do Saldo do cartão (`projetarPendente`, AD-11) e monta os Meses com a lista "Ver" da 6.5; `gerarMensagemDeCobranca` (`modelo-mensagem.ts`) põe o modelo em volta. A janela é a `JanelaGerarMensagem` que já existe (quadro, avisos, "Copiar", "Editar modelo"); os dados são os de Recebimentos (`lancamentos:todos` e os itens de Pagamento): **nenhuma leitura nova e nenhuma migração**.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a regra mora em `src/domain` (só imports relativos, sem relógio: `hoje` entra pelas opções). A janela chama o núcleo e desenha.
- **Uma regra de "em aberto" (AD-11):** o total é `avaliar(formula, linhas de projetarPendente)`; nenhuma tela nem a mensagem filtra linhas antes. A decisão "Dívida programada ainda não vencida" é a `dividaAindaNaoVence` (6.6), tomada num lugar só (`separarPendentes`).
- **Dinheiro em centavos; nomes do Glossário; textos só por `mensagens.ts`; nenhuma cor literal; alvos de 44 pt; log só por `src/server/log.ts`.** Dados pelo gerenciador `lancamentos:todos` (AD-4).
- **Sem migração (AD-14):** `database.types.ts`, RPC e Cron não mudam.

**Never:** Meses anteriores da Fatura (6.8); editar, excluir ou reimportar algo já pago e o aviso de Saldo (6.9); lembretes e Web Push (Épico 7); Previsão; "Por proporção". Mudar a alocação de Pagamento, a regra `estaAtrasado` ou o casamento da reimportação. Ler ou alterar dados de produção; rodar `supabase db push`.

## Decisões (registradas, nada implícito)

1. **Sem migração, sem leitura nova.** A mensagem lê o que Recebimentos já lê: `useTodosOsLancamentos` (todas as colunas, com excluídas), os itens de Pagamento do Histórico, Blocos, Responsáveis, Tipos (só os nomes, para as linhas de termo) e `configuracoes.modelo_mensagem`. Nada é gravado.
2. **O que entra: o mesmo conjunto e a mesma conta do Saldo pendente.** `projetarCobrancaDoBloco` chama `separarPendentes` (as linhas de `projetarPendente`; `pendentesDosLancamentos` passou a ser a mesma função, devolvendo só `.pendentes`) e `avaliar(formula, pendentes.map(linhaDaFormulaPendente))`: o total da mensagem é, por construção, o `saldoCentavos` do cartão (teste: cartão, `projetarPendente` e mensagem iguais). Os itens são os da lista "Ver" (`listaEmAberto`, reaproveitada). Cada caso, com o **valor restante** (AD-10), nunca o cheio:
   - **Pago parcialmente:** entra só com o que falta ("SPOTIFY | R$ 30,00" para R$ 50,00 com R$ 20,00 recebidos). Itens que já cobrem tudo: fora.
   - **Mãe dividida:** nunca entra; entram as partes em aberto, cada uma com o valor e o Status da parte (a parte paga sai).
   - **Ajuste de centavos:** a linha "↳ Ajuste | - R$ 0,08" logo abaixo da parcela, somando no total (como nas formas 1 e 2). Se a parcela já saiu (paga) e o Ajuste ficou em aberto, ele entra sozinho como uma linha comum (regra do Saldo, 6.5).
   - **Estorno não pago:** linha negativa ("- R$ 25,90"), reduz o total.
   - **Crédito de algo pago e depois excluído (AD-11):** linha negativa no Mês da linha excluída. Sem ela os detalhes não fechariam com o "Em aberto".
   - **Previstos** (parcela `sistema`, Conta manual de Mês sem Fatura), **pagos**, **valor zero**: fora, como no Saldo. O histórico da planilha entra se o Status não conta como pago (decisão 9 da 6.5).
3. **O Bloco inteiro, não uma pessoa nem uma Seleção.** O texto da história diz "de uma pessoa", mas o cartão de Recebimentos é por **Bloco de cobrança** (FR-26 define a pessoa cobrada como um Bloco): o Bloco do Lucas é uma pessoa; o do Rangel é "Rangel + Casal ÷ 2". A mensagem é de tudo o que está em aberto naquele Bloco, em todos os Meses. Não usa a Seleção da lista "Ver" (a Seleção de Recebimentos só tem "Limpar" e "Aplicar status", 6.5) e não há filtro por Responsável. Pendência registrada no `deferred-work.md`.
4. **A ordem dos Meses: do mais antigo ao mais novo** ("Setembro/26", depois "Outubro/26"), como o Pagamento quita (FR-25) e como se lê uma dívida que cresceu. Dentro do Mês, a ordem da fatura (`compararPelaFatura`), créditos no fim. **Diverge de dois lugares, de propósito:** o exemplo do EXPERIENCE.md escreve "Outubro/26", "Setembro/26" (do mais novo) e a lista "Ver" da 6.5 agrupa do mais novo ao mais antigo "como a forma 3". O pedido do Rafael para esta história foi do mais antigo ao mais novo, então a lista "Ver" **não foi mudada** (fora do escopo) e a divergência fica registrada no `deferred-work.md`. É um `.reverse()` em `projetarCobrancaDoBloco` se for preciso alinhar.
5. **Dívida programada ainda não vencida (6.6): fica fora, como no Saldo, e a janela avisa.** `separarPendentes` aplica `dividaAindaNaoVence` (o Mês do `vencimento_combinado` depois do Mês de `hoje`) e devolve `programadas` à parte (as com restante a cobrar). A forma 3 conta as do Bloco (`avaliar` da Fórmula sobre elas; o Ajuste que segue a parcela programada não conta, como na forma 1) e o aviso da janela é o `rotuloItensDeFora` de sempre: "1 item não entra: 1 dívida programada ainda não vencida". No Mês do vencimento (até no dia 1) ela passa a entrar, sem aviso. **Só o motivo `programada` é avisado:** "já pago" e "R$ 0,00" existiriam em todo Mês de todo o histórico (aviso permanente e inútil) e o previsto é o que o Saldo já não conta; o Bloco "Em dia" que só tem Dívida adiada mostra "Nada em aberto" **com** o aviso, para Rafael saber por que o cartão está zerado.
6. **Fórmula que divide ou subtrai (o Rangel, a metade do Casal): um arredondamento, só no final (FR-54).** O total é uma `avaliar` sobre todas as linhas (R$ 200,02 ÷ 2 = R$ 100,01). **Nenhum subtotal por Mês é calculado** (dividir cada Mês e somar daria R$ 100,02 para dois Meses de R$ 100,01 do Casal): os Meses trazem só os valores cheios dos itens. Quando a Fórmula **não é soma simples** (tem ÷, ×, subtração ou valor fixo), os termos vêm no fim, como na forma 2 (`termosDoBloco`, extraído de `projetarMensagemDoBloco` sem mudar a forma 2): "Rangel: R$ 10,00" e "Casal: R$ 200,00 ÷ 2 = R$ 100,00", calculados uma vez sobre todos os Meses. Soma simples (um operando, ou vários operandos inteiros) não leva linha de termo: os detalhes já são o total. **Limite herdado da forma 2:** as linhas de termo são arredondadas termo a termo e a soma delas pode diferir R$ 0,01 do total (que vale).
7. **Sem pendência, sem valor, modelo que não serve.** Total que não passa de R$ 0,00, ou nenhum Mês em aberto (Bloco "Em dia", ou crédito que cobre a dívida): estado `nada_a_cobrar` com o texto **"Nada em aberto neste bloco"** no lugar do quadro e **"Copiar" desativado** (o botão do cartão fica ativo: a janela explica). Fórmula que não calcula: "Este bloco está sem valor. Edite a fórmula…" (o texto da 4.7). Modelo vazio ou sem caixa: os textos da 4.6, depois do "nada em aberto".
8. **O mesmo modelo, outra frase do total.** Saudação, "Pix …", título "Detalhes:", campos da linha (Nome, Parcela, Valor) e rodapé são os do modelo salvo. A frase do modelo é **substituída** por "Em aberto: {total}" (`TEXTOS_GERAR.frase_em_aberto`, o mesmo marcador), mesmo se a frase do modelo estiver vazia. A linha de um item é `linhaDeDetalhe` (a mesma de todas as formas), recuada em dois espaços sob o título do Mês (o recuo da forma 2). Um Mês sem nenhuma linha a mostrar não deixa título solto.
9. **Onde mora a regra.** `src/domain/recebimentos.ts`: `projetarCobrancaDoBloco` (a projeção por Mês; erro só quando a Fórmula não calcula). `src/domain/modelo-mensagem.ts`: `gerarMensagemDeCobranca`. `src/domain/mensagem-janela.ts`: `mensagemDeCobranca` (o que a janela recebe: mensagem, texto sem mensagem, avisos). `src/domain/projecoes.ts`: `separarPendentes` e `termosDoBloco` (extraídos, sem mudar o que `pendentesDosLancamentos` e a forma 2 devolvem). A janela só chama.
10. **A interface.** `CartaoDeCobranca` ganha `aoCobrar` e o botão deixa de ser `disabled` (a dica "Disponível em breve" e o texto `cobrar_em_breve` saíram). `Recebimentos` guarda o Bloco que está sendo cobrado e abre `JanelaMensagemDeCobranca` (nova), que lê Blocos/Responsáveis/Tipos pelo `useLinhas` (como `JanelaMensagemDoBloco`) e entrega a mensagem à `JanelaGerarMensagem` (`temFatura` verdadeiro: **sem "Incluir previstos"**). As opções do Saldo e da mensagem são **o mesmo objeto** (`opcoesDoPendente`, `useMemo`). A janela só existe com os dados prontos (durante uma releitura some, em vez de mostrar uma conta com dado velho); acompanha o Realtime (o texto se refaz e avisa "A mensagem mudou…"); um Bloco excluído em outro aparelho fecha a janela e avisa; "Editar modelo" leva a `/configuracoes?secao=mensagem`.

## I/O & Edge-Case Matrix

Hoje 15/10/26. Modelo: "Oi", Pix `pix@exemplo.com`, campos Nome, Parcela e Valor. Lucas: NETFLIX R$ 100,00 (set/26), SPOTIFY R$ 50,00 (out/26), PAGO JA R$ 70,00 (pago).

| Cenário | Entrada | Saída |
|---|---|---|
| Bloco de uma pessoa | Lucas | "Oi / Em aberto: R$ 150,00 / Pix … / Detalhes: / Setembro/26 / ␣␣NETFLIX \| R$ 100,00 / Outubro/26 / ␣␣SPOTIFY \| R$ 50,00 / Total: R$ 150,00"; sem aviso |
| Ordem | Lançamentos lidos fora de ordem (dez/25, out/26, fev/26) | Dezembro/25, Fevereiro/26, Outubro/26 |
| Pago parcialmente | SPOTIFY com R$ 20,00 recebidos | "SPOTIFY \| R$ 30,00"; Em aberto R$ 130,00 |
| Mãe dividida | mãe + 2 partes (uma paga) | só a parte em aberto (R$ 155,34), nunca a mãe |
| Ajuste | SPOTIFY + Ajuste −R$ 0,08 | "↳ Ajuste \| - R$ 0,08" sob a parcela; Em aberto R$ 49,92 |
| Ajuste órfão | parcela paga, Ajuste R$ 0,03 em aberto | linha própria; Em aberto R$ 0,03 |
| Estorno | MERCADO R$ 159,90 + ESTORNO −R$ 25,90 | "- R$ 25,90"; Em aberto R$ 134,00 |
| Crédito de excluído | R$ 10,00 pago e a linha excluída (ago/26); NETFLIX R$ 100,00 (set/26) | "Agosto/26 / ESTORNADO \| - R$ 10,00 / Setembro/26 / NETFLIX \| R$ 100,00"; Em aberto R$ 90,00 |
| Previsto | parcela `sistema` em nov/26 | fora, sem aviso |
| Dívida programada | Bombinhas R$ 636,00, vencimento 06/04/27 | fora; aviso "1 item não entra: 1 dívida programada ainda não vencida"; cartão e mensagem concordam |
| No Mês do vencimento | hoje 01/04/27 | entra ("Julho/26 / BOMBINHAS \| 01/06 \| R$ 636,00"); sem aviso |
| Dívida adiada, parcial | R$ 270,00 com R$ 50,00 recebidos, vence 06/12/26 | fora; "Nada em aberto neste bloco" + aviso |
| Só Dívida adiada | Lucas só com a Bombinhas | "Nada em aberto neste bloco", Copiar desativado, aviso |
| O Rangel | ACADEMIA R$ 10,00 (Rangel), MERCADO R$ 200,00 (Casal), out/26 | Em aberto R$ 110,00; itens cheios em "Outubro/26"; "Rangel: R$ 10,00", "Casal: R$ 200,00 ÷ 2 = R$ 100,00"; Total R$ 110,00 |
| Arredondamento | Casal R$ 100,01 em set/26 e em out/26 | Em aberto **R$ 100,01** (200,02 ÷ 2), não R$ 100,02; "Casal: R$ 200,02 ÷ 2 = R$ 100,01"; nenhum subtotal por Mês |
| Soma simples | "Lucas" ou "Lucas + Casal" | sem linha de termo |
| Subtração / valor fixo | "Lucas − Casal"; "Lucas + 5" | "Menos Casal: - R$ 30,00" / "Valor fixo: R$ 5,00" |
| Bloco "Em dia" | tudo pago | "Nada em aberto neste bloco"; Copiar desativado |
| Crédito maior que a dívida | total ≤ R$ 0,00 | o mesmo |
| Fórmula que não calcula | ÷ 0 | "Este bloco está sem valor…" |
| Modelo vazio / sem caixa | — | "O modelo da mensagem está vazio…" / "…sem campos…"; Copiar desativado |
| Frase do modelo vazia | frase "" | "Em aberto: R$ 1,00" do mesmo jeito |
| Copiar | — | texto do quadro na área de transferência, janela fecha, "Copiado" |
| Outro aparelho paga | UPDATE do Status com a janela aberta | o texto se refaz e avisa "A mensagem mudou…" |
| Bloco excluído com a janela aberta | — | a janela fecha, "O Bloco foi excluído e a janela foi fechada" |
| Releitura em curso | `lancamentos` carregando | a janela some (sem conta com dado velho) |
| Editar modelo | — | `router.push("/configuracoes?secao=mensagem")` |

## Code Map

- Núcleo: `src/domain/recebimentos.ts` (`projetarCobrancaDoBloco`, `ProjecaoDaCobranca`, `LancamentoDaCobranca`; reaproveita `listaEmAberto`); `src/domain/modelo-mensagem.ts` (`gerarMensagemDeCobranca`); `src/domain/mensagem-janela.ts` (`mensagemDeCobranca`, origem `cobranca`); `src/domain/projecoes.ts` (`separarPendentes`, `termosDoBloco`; `pendentesDosLancamentos` e `projetarMensagemDoBloco` com o mesmo resultado); `src/domain/mensagens.ts` (`TEXTOS_GERAR.frase_em_aberto` e `nada_em_aberto`, `rotuloMesDaMensagem`; saiu `cobrar_em_breve`).
- Interface: `src/features/recebimentos/CartaoDeCobranca.tsx` (`aoCobrar`), `JanelaMensagemDeCobranca.tsx` (nova), `Recebimentos.tsx` (`opcoesDoPendente`, o modelo salvo, a janela).
- Provas: `cobrar-pendencias.test.ts` (30, núcleo), `Recebimentos.test.tsx` (+14 jsdom, −1 do botão desativado). A forma 2 (`gerar-mensagem-bloco.test.ts`) e o pendente (`projecoes-pendente.test.ts`) passam sem mudança (a extração não alterou o que devolvem).
- Sem: migração, `database.types.ts`, RPC, Cron, `pagamento.ts`, `atraso.ts`, o casamento da reimportação, `HistoricoDePagamentos.tsx`.

## Tasks & Acceptance

- [x] Núcleo: `separarPendentes`, `termosDoBloco`, `projetarCobrancaDoBloco`, `gerarMensagemDeCobranca`, `mensagemDeCobranca`; textos pelo mapa.
- [x] Interface: botão ativo no cartão, `JanelaMensagemDeCobranca`, fiação em `Recebimentos`.
- [x] Provas: núcleo (matriz), jsdom (cartão, janela, Copiar, Realtime, "Em dia", Dívida programada).
- [x] `sprint-status.yaml` (6.7 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [x] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`: 3438 passam; `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos, 39 testes, como na 6.5 e na 6.6). `npm run build` **não foi rodado**: falha local por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad e PC (a janela, o quadro com os Meses recuados, o foco ao fechar, o alvo de 44 pt do botão do cartão, o VoiceOver), o texto no WhatsApp, **produção** (nenhum dado de produção foi lido nem alterado; um histórico da planilha com muitos Meses em aberto geraria uma mensagem longa, decisão 9 da 6.5) e a virada do dia/mês com a janela aberta.
