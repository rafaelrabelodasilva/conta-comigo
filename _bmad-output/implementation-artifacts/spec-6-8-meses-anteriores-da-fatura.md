---
title: 'História 6.8: Meses anteriores da fatura'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '65e039d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-divida-programada.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-7-cobrar-pendencias.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem onde conferir a continuidade entre uma Fatura e a seguinte (FR-30). O saldo anterior e o pagamento da Fatura ficam guardados em `faturas`, mas a Conferência (FR-6) os ignora de propósito e o Painel só os mostra na conta do "Total a pagar" do Mês aberto. O resíduo de R$ 25,90 de outubro/2026 (R$ 7.483,11 − R$ 7.457,21) só aparece se ele fizer a conta de cabeça.

**Approach:** uma quarta seção de Recebimentos, "Meses anteriores da Fatura", depois do Histórico de Pagamentos: uma tabela com uma linha por Fatura importada, do Mês mais novo ao mais antigo, com **Mês, Saldo anterior, Pagamento da fatura, Resíduo e Conferência** (o mockup `recebimentos.html`). O núcleo (`montarMesesAnteriores`, em `src/domain/meses-anteriores.ts`) monta as linhas: mostra o que a Fatura escreveu, calcula o resíduo e reaproveita `conferir` (Épico 2) para o selo. A tela só chama e desenha. Os dados são os gerenciadores de Realtime que já existem (`faturas`, `fatura_cartoes`, `lancamentos` de todos os Meses): **nenhuma leitura avulsa e nenhuma migração**.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a regra mora em `src/domain` (só imports relativos, sem relógio nem DOM). A tela chama o núcleo.
- **Guardado × calculado (AD-4):** saldo anterior, pagamento e total a pagar são os lidos da Fatura (guardados); o resíduo e o selo são calculados e nunca gravados.
- **Uma só Conferência:** o selo é `conferir` + `rotuloSeloConferencia`, a mesma do Painel. Nenhuma regra nova de soma.
- **Dinheiro em centavos; nomes do Glossário; textos só por `mensagens.ts`; nenhuma cor literal; o selo é sempre texto; alvos de 44 pt; log só por `src/server/log.ts`.**
- **Sem migração (AD-14).** Todas as colunas existem (`20261103120000_faturas_lancamentos.sql`).

**Never:** editar totais da Fatura, reimportar, Épico 7 (Previsão e lembretes), "Por proporção". Mudar a Conferência, a alocação de Pagamento, `estaAtrasado` ou o casamento da reimportação. Ler ou alterar dados de produção; rodar `supabase db push`.

## Decisões (registradas, nada implícito)

1. **Sem migração, sem leitura avulsa.** A seção lê `faturas` e `fatura_cartoes` (gerenciadores de Realtime que o Painel já usa; as duas tabelas são lidas inteiras, sem escopo por Mês) e `lancamentos` de todos os Meses (o gerenciador `lancamentos:todos` da 6.5). Recebimentos só passou a assinar `fatura_cartoes`; ela entra no "pronto" e no "Tentar de novo" da tela. Nada é gravado.
2. **O resíduo é saldo anterior − pagamento da fatura**, os dois como a Fatura os escreve (pagamento positivo, como `comporTotalAPagar` já os usa): outubro/2026 = R$ 7.483,11 − R$ 7.457,21 = **R$ 25,90**; setembro = R$ 0,00 (mockup). `residuoDaFatura` é calculada, nunca guardada.
   - **Negativo (pagou a mais):** o resíduo fica com o sinal ("- R$ 20,00") e a célula leva "pago a mais" (texto, nunca só o sinal). Não é erro nem some.
   - **Valor ausente:** saldo anterior ou pagamento `null` (a Fatura não os trouxe) deixam o resíduo **`null`**, mostrado "—". Nunca vira zero: "sem dado" não é "pagou tudo". Pagamento R$ 0,00 **lido** é valor (o resíduo é o saldo inteiro).
3. **Continuidade: o saldo anterior de um Mês é o TOTAL A PAGAR da Fatura do Mês anterior, não o resíduo dele.** O pedido sugeria comparar com "o resíduo do anterior"; a conta da própria Fatura (7.483,11 + 8.327,39 − 7.457,21 − 639,62 = 7.713,67) mostra que o saldo anterior de novembro é o total de outubro e que o resíduo de R$ 25,90 já está **dentro** desse total. Comparar com o resíduo avisaria em todo Mês. Registrei a divergência e o risco no `deferred-work.md` (não verificado com Faturas reais de dois Meses seguidos).
   - **Mostra só o lido** (nada é corrigido nem escondido) e, quando não bate, um **aviso discreto** sob o saldo anterior: "O saldo anterior não é o total a pagar de Set/26 (R$ 7.483,11)". Texto `texto-caption`, sem cor de alerta.
   - O aviso só existe quando as duas Faturas são de **Meses seguidos** (vira o ano: jan/27 olha dez/26), os dois valores foram lidos (`saldo_anterior_centavos` e o `total_a_pagar_centavos` do anterior) e eles **diferem em centavos**. Buraco entre Meses, valor `null` ou primeira Fatura: sem aviso (nada a comparar).
4. **Mês sem saldo anterior ou sem pagamento lido:** a linha **aparece**, com "—" no que faltou e no resíduo, e o **selo segue** o que a Conferência diz (saldo e pagamento não entram nela, FR-6). Se nenhuma Fatura trouxe nenhum dos dois, uma nota explica: "As faturas importadas não trouxeram saldo anterior nem pagamento." Entra na tabela porque a Fatura existe e o selo ainda diz algo.
5. **O selo é o da Conferência (`conferir`):** "✓ Conferido" (texto no `text-accent`, como o hero do Painel) ou "⚠ Diferença de R$ X" (`valorDaDiferenca`: despesas, senão créditos, senão a maior de cartão). `conferir` recebe os Lançamentos da Fatura (agrupados por `fatura_id` numa passada) e os cartões lidos dela (`fatura_cartoes`); a mãe de uma Divisão conta e as filhas não (`linhasDaFatura`). **Alerta dispensado (2.5):** o Painel esconde só a faixa e mantém o selo no hero; a tabela faz igual: o selo continua "⚠ Diferença de R$ X" e a célula ganha o texto "alerta dispensado" abaixo (a tabela é a vista de auditoria, esconder a diferença esconderia justo o que o FR-30 quer mostrar).
6. **Mês sem Fatura importada** (só previstos, histórico da planilha): **fora da tabela**, uma linha por Fatura. Nenhuma Fatura: o estado vazio **"Nenhuma fatura importada ainda"**. Carregando (qualquer das tabelas lendo): esqueleto, nunca o estado vazio; erro: só o "Tentar de novo" da tela (a seção some, como "A receber").
7. **Quantos Meses mostrar: os 12 mais novos; os outros atrás de "Ver os outros N meses" / "Mostrar só os mais recentes".** A lista cresce uns 12 por ano; mostrar todos cobre bem um ano, mas em dois ou três anos a tabela empurraria o fim da página de Recebimentos. O custo do desenho é um `useState` e um botão de 44 pt (`aria-expanded`), nada de paginação nem de rolagem virtual. O núcleo devolve todas as linhas; o limite (`MESES_VISIVEIS_NA_TABELA = 12`) é só da tela.
8. **Ordem:** do Mês mais novo para o mais antigo (`AAAA-MM` decrescente), como o mockup (Out/26, depois Set/26) e o Histórico de Pagamentos. Independente da ordem de leitura.
9. **Onde mora a regra.** `src/domain/meses-anteriores.ts`: `montarMesesAnteriores`, `residuoDaFatura`, `MESES_VISIVEIS_NA_TABELA`; reaproveita `conferir` (`conferencia.ts`) e `somarMeses` (`ciclo.ts`). `src/domain/mensagens.ts`: `TEXTOS_MESES_ANTERIORES`, `rotuloContinuidade`, `rotuloVerOutrosMeses` (e o `rotuloSeloConferencia` que já existia). A tela (`MesesAnterioresDaFatura.tsx`) só chama o núcleo e desenha; `Recebimentos.tsx` faz a fiação.
10. **A interface.** Uma `<section>` com `<h2>` "Meses anteriores da Fatura", uma linha de ajuda ("O resíduo é o saldo anterior menos o pagamento da fatura…") e uma `<table>` com `aria-labelledby` no título, cabeçalhos de coluna (`scope="col"`) e o Mês como cabeçalho de linha (`scope="row"`, "Out/26"). Números à direita com `tabular-nums`. A tabela rola por dentro (`overflow-x-auto`, `min-w-[36rem]`) em tela estreita, sem rolagem horizontal da página. Nenhuma cor literal (`text-accent`, `text-text`, `text-text-muted`, `border-border`).

## I/O & Edge-Case Matrix

Hoje 15/10/26 (a tela não usa o relógio). Out/26: saldo anterior R$ 7.483,11, pagamento R$ 7.457,21, despesas R$ 8.327,39, créditos R$ 639,62, total a pagar R$ 7.713,67. Set/26: saldo anterior e pagamento R$ 7.807,12, total a pagar R$ 7.483,11.

| Cenário | Entrada | Saída |
|---|---|---|
| Caso do aceite | Faturas de set/26 e out/26, Conferência batendo | Out/26: "R$ 7.483,11 \| R$ 7.457,21 \| **R$ 25,90** \| ✓ Conferido"; Set/26: "R$ 7.807,12 \| R$ 7.807,12 \| R$ 0,00 \| ✓ Conferido"; Out/26 primeiro |
| Ordem | Faturas lidas fora de ordem; vira o ano | do mais novo ao mais antigo (Jan/27 antes de Dez/26) |
| Pagou a mais | saldo R$ 100,00, pagamento R$ 120,00 | resíduo "- R$ 20,00" + "pago a mais" |
| Sem saldo anterior | `saldo_anterior_centavos` nulo | saldo "—", resíduo "—", pagamento e selo normais |
| Sem pagamento | `pagamentos_centavos` nulo | pagamento "—", resíduo "—" |
| Pagamento R$ 0,00 lido | `pagamentos_centavos = 0` | resíduo = o saldo anterior inteiro |
| Nenhuma Fatura com os totais | os dois nulos em todas | "—" nas linhas e a nota "As faturas importadas não trouxeram…" |
| Diferença | despesas gravadas R$ 0,08 abaixo do lido | "⚠ Diferença de R$ 0,08" |
| Diferença de cartão | cartão lido R$ 50,00 sem lançamento com o final | "⚠ Diferença de R$ 50,00" só na Fatura dele |
| Alerta dispensado | `alerta_dispensado_em` preenchido e diferença | "⚠ Diferença de R$ 0,08" + "alerta dispensado" |
| Lançamentos de outra Fatura, excluídos, filhas de Divisão | — | não entram na Conferência da Fatura |
| Continuidade bate | saldo anterior de nov = total a pagar de out | sem aviso |
| Continuidade não bate | saldo anterior R$ 7.483,00; total a pagar de set R$ 7.483,11 | "O saldo anterior não é o total a pagar de Set/26 (R$ 7.483,11)" sob o saldo |
| O resíduo não é a conta | saldo anterior de nov = R$ 25,90 (o resíduo de out) | **avisa** (o total a pagar de out é R$ 7.713,67) |
| Buraco entre Meses | fatura de dez/26 e a de out/26, sem nov/26 | sem aviso |
| Total a pagar anterior ou saldo nulo | — | sem aviso |
| Primeira Fatura | só set/26 | sem aviso |
| Mês só com previstos ou planilha | sem Fatura | sem linha |
| Nenhuma Fatura | `faturas` vazia | "Nenhuma fatura importada ainda" |
| Carregando | `faturas`, `fatura_cartoes` ou `lancamentos` lendo | esqueleto "Carregando os meses anteriores…", sem estado vazio |
| Erro de leitura | uma tabela com erro | a seção some; "Tentar de novo" da tela relê (inclusive `fatura_cartoes`) |
| Realtime | Fatura nova ou pagamento corrigido em outro aparelho | a tabela muda sozinha |
| 13 Meses | 13 Faturas | 12 linhas + "Ver o outro mês" (`aria-expanded`); aberto: 13 + "Mostrar só os mais recentes" |
| Até 12 Meses | — | sem botão |

## Code Map

- Núcleo: `src/domain/meses-anteriores.ts` (`montarMesesAnteriores`, `residuoDaFatura`, `MESES_VISIVEIS_NA_TABELA`, tipos `FaturaDaTabela`, `LinhaDosMesesAnteriores`, `AvisoDeContinuidade`); `src/domain/mensagens.ts` (`TEXTOS_MESES_ANTERIORES`, `rotuloContinuidade`, `rotuloVerOutrosMeses`).
- Interface: `src/features/recebimentos/MesesAnterioresDaFatura.tsx` (nova), `Recebimentos.tsx` (`useLinhas("fatura_cartoes")`, `mesesAnteriores`, a seção depois do Histórico).
- Provas: `src/domain/meses-anteriores.test.ts` (23, núcleo), `Recebimentos.test.tsx` (+17 jsdom; as Faturas do teste passaram a ser linhas completas e os Lançamentos levam `final_cartao: null`, como as linhas reais).
- Sem: migração, `database.types.ts`, RPC, Cron, `conferencia.ts`, `pagamento.ts`, `atraso.ts`, `reimportacao.ts`, `HistoricoDePagamentos.tsx`.

## Tasks & Acceptance

- [x] Núcleo: `montarMesesAnteriores`, `residuoDaFatura`; textos pelo mapa.
- [x] Interface: `MesesAnterioresDaFatura`, fiação em `Recebimentos` (cartões lidos no "pronto" e no "Tentar de novo").
- [x] Provas: núcleo (matriz), jsdom (a tabela, o selo, "—", o aviso de continuidade, vazio, carregando, erro, Realtime, 12 Meses).
- [x] `sprint-status.yaml` (6.8 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [x] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3481 passam na rodada completa (mais 40 que na 6.7); só `eslint-nucleo` e `eslint-formatos` estouram 5 s ali e passam sozinhos (39 testes). `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa; passam sozinhos, como na 6.5 a 6.7. `npm run build` **não foi rodado**: falha local por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad e PC (a tabela de 5 colunas, a rolagem interna em tela estreita, o aviso sob o saldo, o selo em claro e escuro, o alvo de 44 pt do botão, o VoiceOver na tabela); **a regra da continuidade com Faturas reais** (saldo anterior de novembro deve ser R$ 7.713,67; decisão 3); **produção** (nenhum dado de produção foi lido nem alterado).
