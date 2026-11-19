---
title: 'História 7.1: Próximos meses'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'e4ad8c0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-8-meses-anteriores-da-fatura.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem onde ver quanto já está comprometido nos próximos Meses (FR-32). Os previstos das Séries e as Contas manuais já existem como linhas dos Meses futuros, e o Painel de cada Mês os soma, mas ele só vê um Mês por vez e a tela Previsão é uma página provisória ("em breve").

**Approach:** a tela Previsão ganha as três abas do EXPERIENCE ("Próximos meses", "Evolução", "Meu gasto por Tipo"; a escolhida fica guardada no aparelho). Só "Próximos meses" funciona nesta história (as outras duas dizem "Em breve", são a 7.2 e a 7.3): barras empilhadas por Responsável (ou por Tipo) dos **6 Meses seguintes** ao atual (`chart-bar`: o total em cima, o Mês embaixo), a tabela Responsável × Mês com os mesmos números em texto, e a lista das Séries em andamento ("MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses"). Tocar num Mês abre o Painel dele (`/?mes=AAAA-MM`). O núcleo (`src/domain/previsao.ts`) soma e monta tudo; a tela só chama e desenha. **Nada é gravado, nenhuma migração, nenhuma leitura avulsa.**

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a agregação, os totais, as Séries e os textos moram em `src/domain` (só imports relativos, sem relógio nem DOM; o Mês atual entra como parâmetro). A tela chama o núcleo.
- **Uma só projeção (AD-11):** o valor de um Mês é a soma de `projetarPainel` desse Mês, a mesma lista que o Painel soma no Bloco "Todos". A Previsão não reimplementa "o que é previsto".
- **Dinheiro em centavos inteiros (AD-2/FR-54).** Somar não arredonda nada; o arredondamento já foi feito nas filhas da Divisão.
- **Dados só pelo gerenciador de Realtime (AD-4).** Nenhuma tela chama `supabase.from()`.
- **Textos só por `mensagens.ts`; nenhuma cor literal (segmentos `person-N` pelos tokens); a cor nunca é a única informação; alvos de toque de 44 pt; log só por `src/server/log.ts`.**
- **Sem migração (AD-14).** Todas as colunas existem.

**Never:** Evolução (7.2), Meu gasto por Tipo (7.3), lembretes (7.4), Web Push (7.5); mudar `projetarPendente`, a mensagem de cobrança, o Cron ou o Painel; editar um previsto na Previsão (só leitura); "Por proporção"; ler ou alterar dados de produção; `supabase db push`.

## Decisões (registradas, nada implícito)

1. **O que conta como "previsto" nos Meses futuros: o que o Painel desse Mês soma, e só as linhas que já existem (candidatos a e b; o c não).**
   - (a) parcelas previstas das Séries (`lancado_por = 'sistema'`) e (b) parcelas de Conta manual já materializadas entram, porque estão em `projetarPainel(linhas, mes)`.
   - (c) **Conta manual ainda NÃO materializada: não é calculada.** O Cron (`planoDoCron`) e a RPC `salvar_conta_manual` materializam até `horizonteDasContas(mesAtual)` = Mês atual + 12, e a janela da Previsão (Mês atual + 6) cabe inteira nele. Calcular de novo (`parcelasDaConta`) não acharia nada que já não exista e traria dois riscos: contar duas vezes a parcela que já está gravada, e **ressuscitar uma parcela excluída** (AD-16), que continua como linha excluída. A regra "uma parcela materializada e a mesma parcela calculada nunca entram juntas" fica satisfeita por construção: só existe a gravada. Se o Cron ficar mais de 6 Meses parado, a Previsão mostra menos (registrado no `deferred-work.md`).
2. **Linhas: exatamente as do Painel.** Entram as não excluídas do Mês, com as filhas de uma Divisão no lugar da mãe dividida (a mãe nunca soma, AD-8). Um previsto excluído nunca entra (AD-16). Crédito (negativo) entra com o sinal; R$ 0,00 entra (conta como linha, soma zero). O **Ajuste de centavos** entra como linha própria se existir no Mês (o Painel o soma), mas ele só nasce numa Fatura importada, então num Mês futuro sem Fatura não há Ajuste. A barra desenha só os segmentos de soma positiva (um grupo líquido negativo não tem segmento; a tabela mostra o número com o sinal) e o total em cima é o líquido, o mesmo do Painel.
3. **O Mês atual não entra: são os 6 Meses SEGUINTES.** O mockup, com "hoje" em 15/10/26, vai de Nov/26 a Abr/27. O Mês atual é o do calendário em São Paulo (`mesAtual(hoje)`, como o Cron e o Painel). Hoje (19/11/26) a janela é Dez/26 a Mai/27. **Um Mês da janela que já tem Fatura importada** (acontece só com Ciclo incomum ou importação adiantada) **entra com o que o Painel mostra** (valores reais, mais algum previsto que sobrou sem par) e leva o texto "Fatura importada" na barra e no cabeçalho da tabela. Deixá-lo de fora abriria um buraco no gráfico justo onde há dinheiro comprometido. **Consequência registrada:** um Lançamento feito à mão (não é previsto, não é Conta) num Mês futuro também entra, porque o Painel o soma; é o preço de a Previsão bater sempre com o Bloco "Todos" (decisão 9).
4. **Por Responsável × por Tipo.** Responsável: na ordem do cadastro, arquivados depois; Tipo: alfabética, arquivados depois (as ordens de `ordenarParaConfiguracoes`). A linha sem Responsável (ou sem Tipo) vira o grupo "Sem responsável" ("Sem tipo"), no fim, e **entra nos totais**. Só aparece o grupo com ao menos uma linha na janela (o Responsável com R$ 0,00 em alguns Meses aparece, como o Lucas do mockup). O arquivado continua aparecendo, com "(arquivado)". Um id que não está no cadastro lido cai em "Sem …": o total nunca perde uma linha. O total do Mês é o mesmo nos dois agrupamentos.
5. **Dados: o gerenciador de TODOS os Meses da 6.5 (`useTodosOsLancamentos`).** Mais `faturas` (marca o Mês com Fatura), `responsaveis` e `tipos` (nome, ordem, cor), todos já assinados pelo Painel ou por Recebimentos. **Custo de memória:** nenhum além do que já existe (~1,5 MB por ano de uso, só enquanto a aba vive); o canal `lancamentos:todos` é o mesmo de Recebimentos, então não há assinatura nova. Um gerenciador só dos Meses futuros exigiria um predicado fixo no momento da criação (o Mês atual muda com o app aberto) e um segundo canal para economizar poucos KB; a 6.5 justificou o global e esta história o reaproveita. A tela abre pelo "Tentar de novo" que relê Lançamentos, Faturas, Responsáveis e Tipos.
6. **Séries ("por mais N meses").**
   - A lista tem uma Série por `serie_id` com ao menos uma linha depois do Mês atual (parcelas de Fatura e Contas, parceladas ou mensais), a de maior Valor primeiro, depois pelo nome. Ignora linhas excluídas e filhas de Divisão (a mãe tem o Valor da parcela).
   - **"01/12" é a parcela do Mês atual** (ou a última até ele; `max(parcela_n)` das linhas com `mes ≤ Mês atual`) e **o N é `parcela_total` menos essa parcela** (11), não a contagem de linhas gravadas: a Conta parcelada só tem 12 Meses gravados (horizonte). O valor é o da parcela (o mesmo "R$ 1.140,74" em todos os Meses). Falta 1 Mês: "por mais 1 mês".
   - **Valor que mudou no meio** (o casamento da 3.6 mantém a Série): "de R$ 1.140,74 a R$ 1.200,00 por mais 11 meses" (menor e maior entre as parcelas futuras).
   - **Série que só começa depois do Mês atual** (sem parcela até ele): "Curso → R$ 120,00 por 3 meses, a partir de Jan/27".
   - **Conta mensal sem fim** (`parcela_total` nulo): "Aluguel → R$ 250,00 por mês, sem data para acabar" (e ", a partir de Fev/27" se só começa depois). Nunca um "por mais N meses" falso: só 12 Meses dela estão gravados.
   - Uma parcelada sem Meses faltando (a do Mês atual é a última) não entra. Mostra as 8 maiores e o resto atrás de "Ver as outras N séries" (`aria-expanded`, 44 pt). Os textos moram em `mensagens.ts` (`rotuloDaSerie`).
7. **A aba guardada mora no `localStorage` do aparelho, não em `configuracoes`.** É preferência de tela por aparelho (o iPad pode ficar em "Próximos meses" e o PC em "Evolução"), não dado do app; evita migração e gravação. Todo acesso é protegido por `try/catch`: sem armazenamento (janela privada) a escolha vale na memória da página e a tela abre na primeira aba. O servidor não conhece o aparelho: `useSyncExternalStore` com a aba padrão no servidor e a guardada no navegador, sem divergir da hidratação. Valor estranho guardado (`lerAba`) abre a primeira aba. O seletor "Por Responsável / Por Tipo" não é guardado (volta em "Por Responsável").
8. **Tocar num Mês abre o Painel dele.** A barra inteira e o cabeçalho do Mês na tabela são `Link` para `/?mes=AAAA-MM` (o mesmo endereço de "A receber"); `page.tsx` do Painel já lê `mes` e abre o Painel nesse Mês. **Confirmado no código, nada muda no Painel:** o Painel de um Mês futuro lista na grade os previstos e as Contas manuais, os Blocos somam os previstos com "inclui previstos" (`idsDosPrevistos`, `temFatura` do Mês) e o cartão diz "Fatura ainda não importada".
9. **Onde mora a regra, e a duplicação.** `src/domain/previsao.ts`: `projetarPrevisao`, `seriesEmAndamento`, `mesesDaPrevisao`, `lerAba` e as constantes; `mensagens.ts`: `TEXTOS_PREVISAO`, `rotuloDaSerie`, `rotuloDoMesNaPrevisao`, `rotuloAbrirPainelDoMes`, `rotuloVerOutrasSeries`. **Duplicação: nenhuma da regra.** O valor de cada Mês chama `projetarPainel` (a mesma do Painel e dos Blocos), então não há segunda definição de "o que soma". O que amarra: `previsao.test.ts` ("o total de cada Mês futuro é o valor do Bloco 'Todos'") compara `projetarPrevisao` com `resumirBloco` + `idsDosPrevistos` (as funções do `BlocosDoMes`), e `Previsao.test.tsx` renderiza o `BlocosDoMes` real de Dez/26 com um Bloco "Todos" ao lado da tabela e exige o mesmo valor ("R$ 1.315,74") e "inclui previstos".
10. **A interface.** Abas (`tablist`/`tab`/`tabpanel`, setas, Home e End, 44 pt) sobre um cartão: título "Comprometido nos próximos 6 meses" + uma linha de ajuda; o seletor "Por Responsável / Por Tipo" (`aria-pressed`, como o filtro de Contas); 6 colunas de barras (total em cima, segmentos `person-N` de baixo para cima, Mês embaixo, altura proporcional à maior barra; cada barra é um link com o nome "Dez/26: R$ 1.340,74. Abrir o Painel de Dez/26"); a legenda com o nome de cada grupo; a tabela (`<table>` com legenda, `scope`, Mês no cabeçalho como link, "Total" no rodapé, `overflow-x-auto` e `min-w-[40rem]`: rola por dentro, não a página). **Por Tipo:** o Tipo não tem cor; os segmentos alternam as 8 cores de pessoa e a legenda e a tabela dizem o nome (com mais de 8 Tipos as cores se repetem). "Sem …": o cinza `text-text-muted`. Os números do gráfico existem em texto na tabela e no nome da barra.
11. **Estados.** Sem nenhuma linha nos 6 Meses: "Nenhum lançamento previsto para os próximos meses" (sem seletor nem tabela). Carregando (qualquer das quatro leituras): esqueleto com "Carregando a previsão…", nunca o estado vazio. Erro de qualquer leitura: "Não foi possível carregar" + "Tentar de novo" (relê as quatro). As abas continuam visíveis nos três estados. "Evolução" e "Meu gasto por Tipo": "Em breve" + uma frase, sem número nem promessa.

## I/O & Edge-Case Matrix

Hoje 19/11/26: Mês atual 2026-11, janela Dez/26 a Mai/27. Responsáveis Rafael (cor 1) e Casal (cor 2); Tipos Casa e Bobiças.

| Cenário | Entrada | Saída |
|---|---|---|
| Previstos de Série | Dez/26: 2/12 de R$ 1.140,74 (Rafael); Jan/27: 3/12 | Rafael: R$ 1.140,74 em Dez/26 e Jan/27; total do Mês igual |
| Conta materializada | Dez/26: Academia R$ 200,00 (Casal, `manual` com Conta) | entra (Mês sem Fatura); Casal R$ 200,00; total R$ 1.340,74 |
| Conta e previsto no mesmo Mês | R$ 318,00 de cada | R$ 636,00 (cada linha uma vez) |
| Conta não materializada | (nenhuma linha) | nada é calculado; o Mês não ganha valor |
| Mês atual e 7º Mês | linhas em 2026-11 e 2027-06 | ficam de fora |
| Mês anterior ao atual | linha em 2026-10 | fora; sem outras linhas, "Nenhum lançamento previsto…" |
| Excluído | previsto com `excluido_em` | nunca entra |
| Mãe dividida | mãe R$ 100,01 + filhas R$ 50,01 e R$ 50,00 | R$ 100,01 no Mês; a mãe não soma; cada filha no seu Responsável |
| Filha excluída | uma filha com `excluido_em` | só a outra soma |
| Ajuste de centavos | parcela R$ 1.140,74 + Ajuste - R$ 0,08 | R$ 1.140,66 (como o Painel) |
| Crédito e R$ 0,00 | R$ 100,00, - R$ 25,00 e R$ 0,00 | total R$ 75,00; 3 linhas; a barra soma só o positivo |
| Só R$ 0,00 | uma linha de R$ 0,00 | não é vazia; barra zero |
| Sem Responsável | `responsavel_id` nulo | "Sem responsável" no fim, entra no total |
| Responsável arquivado | linha dele | aparece com "(arquivado)", depois dos ativos |
| Por Tipo | Casa, Bobiças, arquivado e sem Tipo | alfabética, arquivado, "Sem tipo"; as cores alternam; mesmo total |
| Id fora do cadastro | `responsavel_id` desconhecido | "Sem responsável"; total intacto |
| Mês com Fatura | Fatura de Dez/26 | valores reais; "Fatura importada" na barra e no cabeçalho |
| Arredondamento | R$ 0,33 + R$ 0,33 + R$ 0,34 | R$ 1,00 (centavos inteiros) |
| Painel | Dez/26 com previsto, Conta, crédito, R$ 0,00, excluído | total da Previsão = Bloco "Todos" do Painel, com "inclui previstos" |
| Série em andamento | Nov/26 1/12 (real) e Dez/26 a Out/27 | "MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses" |
| Conta parcelada longa | 3/36 em Nov/26, só 3 linhas gravadas | "… 03/36 → R$ 50,00 por mais 33 meses" |
| Última parcela no Mês atual | 12/12 em Nov/26 | a Série não aparece |
| Falta 1 Mês | 11/12 em Nov/26 e 12/12 em Dez/26 | "… por mais 1 mês" |
| Série que começa depois | 1/3 a 3/3 de Jan a Mar/27 | "Curso → R$ 120,00 por 3 meses, a partir de Jan/27" |
| Conta mensal sem fim | `parcela_total` nulo | "Aluguel → R$ 250,00 por mês, sem data para acabar" |
| Valor mudou | 1ª e 2ª a R$ 1.140,74, 3ª a R$ 1.200,00 | "de R$ 1.140,74 a R$ 1.200,00 por mais 11 meses" |
| Apelido | linha com Apelido | a Série usa o Apelido |
| Mais de 8 Séries | 10 Séries | 8 + "Ver as outras 2 séries"; aberto: 10 + "Mostrar só as maiores" |
| Seletor | "Por Tipo" | gráfico, legenda e tabela por Tipo; cabeçalho "Tipo" |
| Aba guardada | "Evolução" escolhida, tela aberta de novo | volta em "Evolução" |
| Valor estranho guardado | `localStorage` com lixo | abre "Próximos meses" |
| Sem `localStorage` | leitura e escrita lançam | abre "Próximos meses"; as abas funcionam, sem guardar |
| Teclado nas abas | ← → Home End | andam entre as abas, o foco acompanha |
| Tocar num Mês | barra ou cabeçalho de Jan/27 | link `/?mes=2027-01` (44 pt) |
| Realtime | Lançamento novo em outro aparelho | os números mudam no lugar |
| Carregando | qualquer leitura em "carregando" | esqueleto, nunca o estado vazio |
| Erro | uma leitura em "erro" | alerta + "Tentar de novo" (relê as 4) |

## Code Map

- Núcleo: `src/domain/previsao.ts` (novo: `projetarPrevisao`, `seriesEmAndamento`, `mesesDaPrevisao`, `lerAba`, `MESES_DA_PREVISAO`, `SERIES_VISIVEIS`, tipos); `src/domain/mensagens.ts` (`TEXTOS_PREVISAO`, `rotuloDaSerie`, `rotuloDoMesNaPrevisao`, `rotuloAbrirPainelDoMes`, `rotuloVerOutrasSeries`). Reaproveita `projetarPainel` (`projecoes.ts`), `ehFilha` (`divisao.ts`), `nomeExibido` (`painel.ts`), `somarMeses` (`ciclo.ts`) e as ordens de `responsaveis.ts` e `tipos.ts`.
- Interface: `src/features/previsao/Previsao.tsx` (as abas e a aba guardada), `src/features/previsao/ProximosMeses.tsx` (dados, seletor, barras, legenda, tabela, Séries, estados), `src/app/(app)/previsao/page.tsx` (monta a tela no lugar da provisória).
- Provas: `src/domain/previsao.test.ts` (38, núcleo), `src/features/previsao/Previsao.test.tsx` (24, jsdom, com o `BlocosDoMes` real para a amarra com o Painel).
- Sem: migração, `database.types.ts`, RPC, Cron, `realtime.ts` (o gerenciador de todos os Meses já existia), Painel, `projetarPendente`.

## Tasks & Acceptance

- [x] Núcleo: `projetarPrevisao`, `seriesEmAndamento`, `lerAba`; textos pelo mapa.
- [x] Interface: as abas (guardadas), "Próximos meses", "Em breve" nas outras duas; `page.tsx`.
- [x] Provas: núcleo (matriz), jsdom (a tela, o seletor, a aba guardada e sem armazenamento, os estados, o toque no Mês, o texto equivalente ao gráfico) e a amarra com o Painel.
- [x] `sprint-status.yaml` (7.1 em `review`, `epic-7: in-progress`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [x] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3595 passam na rodada completa (62 novos: 38 do núcleo e 24 da tela); só `eslint-nucleo` e `eslint-formatos` estouram 5 s ali e passam sozinhos (39 testes), como na 6.5 a 6.9. `npm run build` **não foi rodado**: falha local por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad e PC (o desenho das barras e das cores, a tabela de 7 colunas e a rolagem interna em tela estreita, o toque de 44 pt, o VoiceOver); **produção** (nenhum dado de produção foi lido nem alterado; a tela nunca rodou com os Lançamentos reais, então a escala das barras e a lista de Séries com os 21 previstos de dez/26 não foram vistas).
