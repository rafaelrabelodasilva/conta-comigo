---
title: 'História 7.4: Lembretes dentro do app'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'b15fb28'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-configurar-o-ciclo-do-cartao-e-a-aparencia.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-atrasado.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-3-meu-gasto-por-tipo.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael precisa lembrar sozinho de duas coisas: importar o PDF da fatura quando ela fecha e cobrar quem atrasou (FR-55). Hoje o app só mostra o "Atrasado" se ele abrir a grade ou Recebimentos e olhar.

**Approach:** uma faixa no topo das telas do app, calculada a cada desenho por uma função pura do núcleo, `lembretesDoDia` (`src/domain/lembretes.ts`), com dois tipos de lembrete: **fechamento** ("A fatura de novembro fechou. Importe o PDF quando chegar", o toque abre o Painel do Mês) e **atraso** ("O Lucas tem R$ 115,16 em atraso desde 17/11/26", o toque abre Recebimentos). "Atrasado" é a `estaAtrasado` da grade (por `atrasosDasLinhas`), nunca uma conta nova. Cada tipo liga e desliga em Configurações → Aparência; a preferência fica em `configuracoes` (**uma migração pequena**, duas colunas). Nada mais é gravado. A notificação do sistema é da 7.5; o núcleo já entrega o que ela precisa.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** quais lembretes existem, quando, o valor, o "desde", a ordem, o limite de faixas e o destino moram em `src/domain` (só imports relativos, sem relógio nem DOM; `hoje` entra como parâmetro). A faixa só chama e desenha.
- **Uma só verdade para "atrasado" (AD-10):** `atrasosDasLinhas` (a mesma de `Painel.tsx` e `Recebimentos.tsx`), com as mesmas linhas, a mesma tolerância, os mesmos Status pagos, os mesmos itens de Pagamento e o mesmo vencimento por Fatura. O Bloco que atrasa é o que o cartão de Recebimentos chama de "Atrasado" (`montarCartoesDeCobranca`).
- **Dinheiro em centavos inteiros e um arredondamento só (AD-2/FR-54).** Datas por `datas.ts`.
- **Dados só pelos gerenciadores de Realtime (AD-4).** Nenhum gerenciador novo, nenhuma leitura avulsa.
- **Textos só por `mensagens.ts`; nenhuma cor literal; a faixa é sempre texto, nunca só cor ou ícone; alvo de toque de 44 pt; `role="status"` sem roubar o foco.**
- **Schema só por migração (AD-14); log só por `src/server/log.ts`; segredos só no servidor.**

**Never:** a 7.5 (notificação do sistema, Web Push, `web-push`, VAPID, service worker, `push_inscricoes`, `lembretes_enviados`, "Ativar notificações", qualquer mudança em `GET /api/cron/diario`); mudar `estaAtrasado`, `primeiroDiaDeAtraso`, `atrasosDasLinhas`, `projetarPendente`, a tolerância, a Fórmula, Recebimentos, a Conferência ou a Previsão; um Centro de notificações; lembretes além destes dois; ler ou alterar dados de produção; `supabase db push` sem o Rafael pedir; atualizar o Next.

## Decisões (registradas, nada implícito)

1. **A função e a assinatura.** `lembretesDoDia(hoje, ciclo, lancamentos, blocosDeCobranca, preferencias, contexto)`. A assinatura do epics.md tinha cinco entradas; faltavam os Status que contam como pago, os itens de Pagamento, o vencimento das Faturas importadas e a tolerância, que `estaAtrasado` exige, então entram agrupados em um **sexto parâmetro**, `ContextoDeLembretes = { statusPagos, itens, vencimentosDasFaturas, tolerancia }`. Os Meses com Fatura importada são as chaves de `vencimentosDasFaturas` (a mesma definição de "Mês com Fatura" do Painel e da 7.2). `blocosDeCobranca` aceita qualquer lista de Blocos e ignora os que não são de cobrança. `hoje` inválido devolve `[]`. A saída é uma lista de `Lembrete` (decisão 6), com o de fechamento antes dos de atraso.
2. **Lembrete de fechamento.**
   - **Qual Mês o texto chama de "novembro":** o **Mês da Fatura que fechou** (o do vencimento, AD-9), não o mês do calendário. A fatura que fecha em 28/10 e vence em 06/11 é "a de novembro" (`formatarNomeDoMes`). A data do fechamento é `fechamentoDoMes(M, configVigente(M, ciclo))`: a configuração vigente **no Mês da Fatura**, a mesma regra do Ciclo.
   - **Quanto dura: do dia do fechamento até 5 dias depois, e some assim que existe Fatura importada do Mês.** O critério diz "quando é o dia do fechamento", mas só no dia exato o aviso sumiria se Rafael não abrisse o app naquele dia (o iPad costuma ficar fechado). Com Fatura importada o aviso não faz mais sentido (some na hora, por Realtime). **N = 5** (`DIAS_DO_LEMBRETE_DE_FECHAMENTO`): o PDF costuma sair no fechamento ou um ou dois dias depois e o vencimento vem uns 9 dias depois (28 → 06); passados 5 dias sem importar, o aviso já não ajuda mais do que a Fatura que falta no Painel. A janela é `fechouEm ≤ hoje ≤ fechouEm + 5` (6 dias). A 7.5 notifica só em `hoje === fechouEm` (decisão 6).
   - **Fevereiro e dia 31:** `fechamentoDoMes` já devolve o último dia do mês quando o dia não existe: dia 31 em fevereiro fecha em 28/02 (29/02 em ano bissexto), dia 30 em fevereiro em 28/02. Testado.
   - **Troca de Ciclo:** cada Mês usa a configuração vigente nele. Com 28/06 até novembro e 25/06 de dezembro em diante, a fatura de dezembro fecha em 25/11 e a de novembro continua fechando em 28/10. Pode haver **duas janelas ao mesmo tempo** se a troca aproximar dois fechamentos (28/11 e 01/12): dois lembretes, ordenados por Mês. A busca olha os Meses do mês de `hoje` −1 a +2 (o fechamento do Mês M fica em M ou M−1). Sem nenhuma configuração do Ciclo: nenhum lembrete de fechamento.
   - **Referência:** o Mês da Fatura (`AAAA-MM`), estável durante toda a janela.
3. **Lembrete de atraso: um por Bloco de cobrança.**
   - **Quem aparece:** o Bloco de cobrança que o cartão de Recebimentos marca "Atrasado" (algum item da Fórmula do Bloco está atrasado por `atrasosDasLinhas`), com **valor** positivo.
   - **Qual valor:** o que a Fórmula do Bloco dá sobre o **restante** dos Lançamentos **atrasados** (depois dos Pagamentos), não o total do Bloco nem o Saldo pendente: "Rangel + Casal ÷ 2" com R$ 100,00 atrasados do Casal dá R$ 50,00. **Sem a parte fixa da Fórmula** ("Lucas + 100" com R$ 30,00 atrasados dá R$ 30,00, não R$ 130,00), tirada em racional exato (`calculo.valor`, como na 7.3) e arredondada uma vez no fim (`arredondarRacional`). Um item que um Pagamento parcial quitou em parte entra pelo que falta; um que foi quitado por inteiro, ou tem Status pago, não está atrasado e não entra.
   - **Qual "desde":** o **mais antigo `primeiroDiaDeAtraso`** entre os itens do Bloco (o `atrasadoDesde` do cartão). Ele não muda com o Pagamento parcial.
   - **Nada aparece quando:** o Bloco não é de cobrança; não tem item atrasado; a Fórmula não cobra nada que dependa de Lançamento (só valor fixo, `250`); a Fórmula não calcula (divisão por zero); ou o valor sai zero ou negativo (só uma Fórmula com subtração). Um crédito do mesmo Bloco **não abate** o atraso: o item atrasado continua atrasado, como na grade (`deferred-work.md`).
   - **Vários Blocos:** uma faixa por Bloco, na ordem dos Blocos (`ordem`, depois nome `pt-BR`, depois id; **mesma entrada, mesma saída**, qualquer ordem da lista), **até 3** (`LIMITE_DE_FAIXAS_DE_ATRASO`); o resto vira uma faixa "E mais N Blocos com itens atrasados" que abre Recebimentos (`lembretesParaExibir`, também núcleo). O limite não corta os de fechamento.
   - **Referência:** o id do Bloco.
4. **"Passa a ter itens atrasados" é um estado, não um evento.** A faixa fica **enquanto houver atraso** e some quando o último item atrasado do Bloco é pago (Pagamento ou Status pago, por Realtime). **Dispensar a faixa não grava nada e nem existe.** Custo: mandar a cobrança (Cobrar pendências) não a tira; só o Pagamento. Quem não quer ver desliga o tipo (decisão 11). Escolhi isso porque o critério não pede dispensa, "nada é gravado" além da preferência é o mais simples, e um evento "uma vez e some" precisaria de uma tabela (a `lembretes_enviados` é da 7.5) e de uma regra de quando volta. A dispensa e o limite de 3 ficam em `deferred-work.md`.
5. **A data do atraso é a da regra da 6.4: 17/11/26** (vencimento 06/11 + tolerância 10 + 1), de `primeiroDiaDeAtraso`. Os dois textos que diziam 16/11/26 (o EXPERIENCE.md, linha "Lembretes", e a História 7.4 do `epics.md`) **foram corrigidos para "desde 17/11/26"**, e o item da 5.4/6.4 do `deferred-work.md` fechado (o `implementation-readiness.md` também).
6. **Para a 7.5 reaproveitar: a forma do lembrete.** Cada lembrete leva `tipo` (`"fechamento"` ou `"atraso"`), `referencia` estável (**Mês da Fatura** `AAAA-MM`; **id do Bloco de cobrança**) e `destino` (`/?mes=AAAA-MM` ou `/recebimentos`), mais o que o texto e a decisão de enviar precisam: o de fechamento leva `mes` e `fechouEm` (a 7.5 só notifica quando `hoje === fechouEm`, porque a faixa dura 6 dias), o de atraso leva `blocoId`, `blocoNome`, `valorCentavos` e `desde`. A 7.5 grava `lembretes_enviados (tipo, referencia, dia)` com esses dois campos e monta o mesmo `ContextoDeLembretes` no servidor. **Nada da 7.5 foi criado** (nem tabela, nem rota, nem pacote). O texto sai de `textoDoLembrete` (`mensagens.ts`), igual para a faixa e para a notificação.
7. **Onde a faixa mora e como se comporta.**
   - **No layout das telas autenticadas** (`src/app/(app)/layout.tsx`), logo abaixo da `FaixaSemConexao`, então vale em **todas** as telas do app, inclusive Configurações (desligar o interruptor faz a faixa sumir na hora, que é o feedback). **Fora do Primeiro uso** (layout próprio, sem dados ainda) e de `/entrar` e `/sem-conexao`. "Ao abrir o app" é o Painel e qualquer tela que ele abra.
   - Várias faixas se empilham, **fechamento primeiro, atraso depois** (por Bloco). Cada uma é um `Link` de 44 pt (`min-h-toque`) com o texto do lembrete e, ao lado, o destino em texto ("Abrir o Painel", "Abrir Recebimentos"), nas cores `alert-warning` (a `FaixaPergunta` já usa e o contraste é testado). Nunca só cor ou ícone.
   - O contêiner `role="status"` (nome "Lembretes") fica sempre montado, para o leitor de tela anunciar o que entra, e nenhuma faixa pega o foco. Convive com a `FaixaSemConexao` sem se tocarem (cada uma tem o seu contêiner).
8. **Dados: os gerenciadores que Recebimentos e a Previsão já usam, nenhum novo.** `useTodosOsLancamentos` (canal `lancamentos:todos`), `useItensDoHistorico` (`pagamento_itens:historico`), `useLinhas` de `blocos`, `status`, `faturas`, `config_ciclo` e `configuracoes`. **Custo:** antes eles só abriam quando Recebimentos ou a Previsão eram abertas; agora abrem na abertura do app (~1,5 MB por ano de uso em memória e um canal Realtime a mais por tabela). Aceito porque dá a faixa em qualquer tela e deixa Recebimentos instantâneo; anotado no `deferred-work.md`. O `Painel` não mudou.
9. **Virada do dia.** `hoje` vem de `useHoje` (America/Sao_Paulo), que relê o relógio a cada minuto e quando a aba volta ao foco: o app aberto na virada da meia-noite recalcula a faixa sozinho (o atraso que começa às 00:00 aparece em até 1 minuto). Testado com o relógio real congelado (`vi.setSystemTime`) e o `useHoje` verdadeiro: 23:50 de 16/11 sem faixa, 00:05 de 17/11 com "desde 17/11/26".
10. **Carregando, erro e sem conexão: a faixa nunca pisca nem aparece errada.** Enquanto qualquer das sete leituras não está `pronta`, ou deu erro, **a faixa não mostra nada** (nem esqueleto, nem texto de erro: quem avisa de erro é a tela do dado; a faixa é um aviso a mais). Só desenha com todos os dados na mão, então nunca mostra um valor parcial. Sem conexão **depois** de carregar, o gerenciador mantém a lista em memória (retrato `pronto`) e a faixa continua com o que sabe; sem conexão **antes** de carregar, não mostra nada.
11. **Preferências, migração e compatibilidade.**
   - **Duas colunas booleanas em `configuracoes`** (`lembrete_fechamento` e `lembrete_atraso`, `not null default true`; linha existente e linha nova nascem ligadas), arquivo `supabase/migrations/20261201120000_lembretes_preferencias.sql`, só aditiva, com comentários de coluna e da tabela. **Não dá para guardar sem migração** de forma que valha em todos os aparelhos e no Cron da 7.5 (o `localStorage` é de um aparelho só; um `jsonb` novo ou reaproveitar o do modelo da mensagem misturaria coisas; e o AD-13 já prevê "preferências em `configuracoes`"). `database.types.ts` foi editado à mão, na ordem alfabética do gerador (o job `supabase` do CI confere a igualdade com o gerado: Docker não existe nesta máquina).
   - **Interruptores** em Configurações → Aparência, grupo "Lembretes" (`Interruptor`, 44 pt): "No dia do fechamento da fatura" e "Quando um Bloco tem itens atrasados". `repoConfiguracoes().definirLembrete(tipo, ligado)` grava **só a coluna do tipo**, otimista (a faixa some na hora e o banco desfaz se recusar), como a Aparência.
   - **Entre o merge e o `db push`:** a linha de `configuracoes` que vem do banco ainda não tem as colunas e `preferenciasDeLembretes` lê coluna ausente ou nula como **ligada**: o app funciona e **a faixa aparece com os dois lembretes ligados**. **O que responde erro:** gravar a preferência (o upsert manda uma coluna que não existe; o interruptor volta ao que estava e aparece "Não foi possível salvar"). Nenhuma outra tela lê ou grava as colunas. Aplicar o `db push` **antes** do merge também é seguro. Registrado em `docs/infraestrutura.md`.
12. **Onde mora a regra, e o que mudou fora.**
   - `src/domain/lembretes.ts` (novo): `lembretesDoDia`, `lembretesParaExibir`, `preferenciasDeLembretes`, os tipos `Lembrete` (`LembreteDeFechamento`, `LembreteDeAtraso`) e `ContextoDeLembretes`, e as constantes `DIAS_DO_LEMBRETE_DE_FECHAMENTO`, `LIMITE_DE_FAIXAS_DE_ATRASO`, `PREFERENCIAS_DE_LEMBRETES_PADRAO`. `mensagens.ts`: `TEXTOS_LEMBRETES`, `textoDoLembrete`, `rotuloAcaoDoLembrete`, `rotuloMaisAtrasos`.
   - **Duplicação da regra: nenhuma.** O atraso é `atrasosDasLinhas`; a seleção do Bloco é `montarCartoesDeCobranca`; o que falta é `pendentesDosLancamentos`; a conta é `avaliar`; o fechamento é `fechamentoDoMes` + `configVigente`.
   - **Não mudaram:** `estaAtrasado`, `primeiroDiaDeAtraso`, `atrasosDasLinhas`, `projecoes.ts`, `recebimentos.ts`, `formula.ts`, `Recebimentos.tsx`, `Painel.tsx`, `GradeLancamentos.tsx`, o Cron e as RPC.

## I/O & Edge-Case Matrix

Hoje 19/11/26. Ciclo: fechamento 28, vencimento 06 (desde Jan/26). Tolerância 10. Faturas de Out e Nov/26 importadas. Lucas = Bloco "Lucas" (Responsável Lucas), de cobrança.

| Cenário | Entrada | Saída |
|---|---|---|
| Dia do fechamento | hoje 28/10/26, sem Fatura de Nov | fechamento, Mês 2026-11, `fechouEm` 2026-10-28, destino `/?mes=2026-11`; "A fatura de novembro fechou. Importe o PDF quando chegar" |
| Antes / depois | 27/10; 02/11; 03/11 | nada; ainda (5º dia); nada |
| Fatura já importada | Fatura de Nov existe, 28/10 | nada |
| Fatura de outro Mês | só a de Out, 28/10 | aparece |
| Fevereiro, dia 31 | F=31, V=10; 28/02/27; 29/02/28; 31/03/27 | Mês 2027-03; 2028-03; 2027-04 |
| Dia 30 em fevereiro | F=30, V=10; 28/02/27 | Mês 2027-03 |
| Troca de Ciclo | 28/06 até Nov, 25/06 de Dez; 25/11 e 28/10 | Dez fecha 25/11; Nov fecha 28/10 |
| Duas janelas | Nov fecha 28/11 e Dez fecha 01/12; hoje 02/12 | dois lembretes, ordenados por Mês |
| Sem Ciclo; `hoje` inválido | ciclo vazio; "2026-02-30" | nada; `[]` |
| Dia 16/11 (em dia) | item do Lucas R$ 115,16, vencimento 06/11 | nada |
| Dia 17/11 | o mesmo | atraso, Lucas, R$ 115,16, desde 17/11/26, `/recebimentos`; "O Lucas tem R$ 115,16 em atraso desde 17/11/26" |
| Tolerância 0 | vence 06/11 | nada em 06/11; desde 07/11 |
| Pagamento parcial | R$ 40,00 de R$ 100,00 | valor R$ 60,00; o "desde" não muda |
| Pagamento total, Status pago, excluída | itens = valor; status pago; `excluido_em` | nada |
| Vários itens e Meses | R$ 20,00 de Out + R$ 50,00 de Nov | R$ 70,00 desde 17/10/26 (o mais antigo) |
| Item ainda em dia | Dez (vence 06/12) ao lado | só o atrasado soma |
| Nunca atrasam | previsto, mãe dividida, valor zero, crédito | nada |
| Divisão | mãe + parte do Lucas R$ 50,01 + parte do Rafael | só a parte do Lucas, R$ 50,01 |
| Fórmula "Rangel + Casal ÷ 2" | R$ 100,00 atrasados do Casal | R$ 50,00 |
| Parte fixa | "Lucas + 100", R$ 30,00 atrasados | R$ 30,00; sem atrasado, nada |
| Só valor fixo; ÷ 0; sem atrasados | `250`; Lucas ÷ 0; Bloco Rafael | nada |
| Bloco que não é de cobrança | `meu_bloco` sem cobrança | nada |
| Preferências | atraso desligado / fechamento desligado / os dois | só o outro / só o outro / nada |
| Ordem | Blocos Ana, Beto (ordem 1) e Zé (2), entrada embaralhada | Ana, Beto, Zé |
| Fechamento e atraso | 28/10 com item atrasado de Out | fechamento, depois atraso |
| Muitos Blocos | 5 atrasados | 3 faixas + "E mais 2 Blocos com itens atrasados" → `/recebimentos` |
| Amarrada à grade | 14 linhas (parcial, quitada, paga, sem Status, excluída, previsto, zero, crédito, Divisão, outro Responsável) × 6 dias | cada Bloco aparece **se e só se** `estaAtrasado` marca um item dele; valor = Σ restante; desde = o menor `primeiroDiaDeAtraso` |
| Pagamento entra (Realtime) | item de R$ 115,16 | a faixa some; desfazer parcial a traz com o restante |
| Virada do dia | 23:50 de 16/11 → 00:05 de 17/11 | aparece sozinha, "desde 17/11/26" |
| Carregando / erro | cada uma das 7 leituras | nada (nem esqueleto nem erro) |
| Último dado chega | `lancamentos` pronto | a faixa aparece |
| Interruptores | desligar / ligar / recusa / sem conexão | `definirLembrete(tipo, false/true)`; toast "Não foi possível salvar" / "sem conexão" |
| Banco sem as colunas | linha só com `tolerancia_atraso_dias` | os dois ligados |

## Code Map

- Núcleo: `src/domain/lembretes.ts` (novo); `src/domain/mensagens.ts` (`TEXTOS_LEMBRETES`, `textoDoLembrete`, `rotuloAcaoDoLembrete`, `rotuloMaisAtrasos`). Reaproveita `atrasosDasLinhas`, `montarCartoesDeCobranca`, `pendentesDosLancamentos`, `avaliar`, `arredondarRacional`, `fechamentoDoMes`, `configVigente`, `somarDias`.
- Interface: `src/features/lembretes/FaixaDeLembretes.tsx` (novo), `src/app/(app)/layout.tsx` (a faixa abaixo da de conexão), `src/features/configuracoes/SecaoAparencia.tsx` (os dois interruptores). Reaproveita `Interruptor`, `useHoje`.
- Dados: `src/data/configuracoes-repo.ts` (`definirLembrete`), `src/data/database.types.ts` (as duas colunas).
- Banco: `supabase/migrations/20261201120000_lembretes_preferencias.sql`; `test/backup/dados-exemplo.sql` (as colunas, fechamento desligado).
- Provas: `src/domain/lembretes.test.ts` (50, núcleo), `src/features/lembretes/FaixaDeLembretes.test.tsx` (29, jsdom), `src/features/configuracoes/SecaoAparencia.test.tsx` (7 novos), `src/data/configuracoes-repo.test.ts` (2 novos), `src/app/(app)/layout.test.tsx` (ajustado: a faixa no lugar), `test/integracao/configuracoes.test.ts` (2 novos, rodam no job `supabase`).
- Docs: `docs/infraestrutura.md`, `deferred-work.md`, `epics.md` e `EXPERIENCE.md` ("desde 17/11/26"), `implementation-readiness.md` (uma linha), `sprint-status.yaml`.
- Sem: `estaAtrasado`, Cron, RPC, `realtime.ts`, `Painel.tsx`, `Recebimentos.tsx`.

## Tasks & Acceptance

- [x] Núcleo: `lembretesDoDia` (fechamento e atraso), `lembretesParaExibir`, `preferenciasDeLembretes`; textos pelo mapa.
- [x] Interface: a faixa no layout, os interruptores em Aparência, `definirLembrete`.
- [x] Migração `20261201120000_lembretes_preferencias.sql` e `database.types.ts` (**o SQL foi mostrado ao Rafael; nada foi aplicado em produção**).
- [x] Provas: núcleo (matriz), jsdom (a faixa, o toque, os interruptores, a virada do dia, carregando e erro), `test/integracao` (a migração) e o backup (as colunas no `dados-exemplo.sql`).
- [x] Textos "desde 16/11/26" → "desde 17/11/26" (EXPERIENCE.md, epics.md); item da 5.4/6.4 fechado no `deferred-work.md`; `docs/infraestrutura.md`; `sprint-status.yaml` (7.4 em `review`).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura"): o `supabase` e o backup provam a migração de verdade.
- [ ] `supabase db push` da migração, **só quando o Rafael pedir** (logo depois do merge).
- [x] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3845 passam e 221 ficam ignorados (os de integração, que precisam do Supabase local, rodam no CI) na rodada completa. Novos: 50 do núcleo, 29 da faixa, 7 da seção Aparência e 2 do repositório (88), mais 2 de integração; 1 teste ajustado (o layout). `npm run build` **não foi rodado** (o `next build` local reclama de uma vulnerabilidade conhecida em `next@16.4.3`, já no `deferred-work.md`; o Next não foi atualizado): quem confirma é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` (a migração aplica, o padrão `true`, o `not null`, o RLS, a igualdade do `database.types.ts` com o gerado) e o "Backup gera e restaura" (as duas colunas voltam como estavam).
- **Não verificado:** iPad e PC (o toque de 44 pt, as cores `alert-warning` em claro e escuro, o VoiceOver da faixa e do anúncio do `role="status"`); **produção** (nenhum dado de produção foi lido nem alterado, então não se viu a faixa com os Blocos e os Lançamentos reais nem o "R$ 115,16" de verdade); o `db push` (não feito); o tempo de abertura do app com a faixa lendo os Lançamentos de todos os Meses (decisão 8).
