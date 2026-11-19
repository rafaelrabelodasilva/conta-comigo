---
title: 'História 7.3: Meu gasto por Tipo'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '5df3699'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-montar-um-bloco-com-fichas.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-proximos-meses.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-2-evolucao-dos-ultimos-meses.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael vê o que cobra dos outros (Recebimentos) e o que já está comprometido (7.1, 7.2), mas não vê para onde vai a parte dele no mês: a aba "Meu gasto por Tipo" da Previsão ainda diz "Em breve" (FR-31).

**Approach:** a aba mostra, para o Mês do **seletor próprio**, o **"meu Bloco"** (o Bloco marcado em Configurações → "É o meu Bloco", ex.: Rafael + (Casal ÷ 2)) **repartido por Tipo**, em barras horizontais do maior para o menor, com o valor e a % do total, e **a soma das barras é exatamente o valor do "meu Bloco" daquele Mês**, o mesmo que o cartão do Bloco mostra no Painel. Tocar num Tipo abre o Painel do Mês filtrado por ele. O núcleo (`src/domain/meu-gasto.ts`) aplica a Fórmula e reparte os centavos; a tela só chama e desenha. **Nada é gravado, nenhuma migração, nenhuma leitura avulsa, nenhum gerenciador novo.** Fora da Previsão, só uma mudança mínima no Painel: ele aceita `?tipo=` no endereço e abre com o filtro de Tipo da grade ligado.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a escolha do Bloco, a conta por Tipo, o arredondamento, a ordem, a % e o endereço moram em `src/domain` (só imports relativos, sem relógio nem DOM; o Mês entra como parâmetro). A tela chama o núcleo.
- **Uma só projeção (AD-11):** as linhas são `projetarPainel(linhas, mes)` e o valor do Bloco é o `resumirBloco` do Painel daquele Mês; nenhuma regra de "o que entra" é repetida.
- **Dinheiro em centavos inteiros e um só arredondamento (AD-2/FR-54):** `arredondarRacional` é a única função de arredondamento; a conta de cada Tipo é racional exato (`bigint`) e só o resultado final vira centavo.
- **Dados só pelo gerenciador de Realtime (AD-4).** Nenhuma tela chama `supabase.from()`.
- **Textos só por `mensagens.ts`; nenhuma cor literal; a cor nunca é a única informação; alvos de toque de 44 pt; log só por `src/server/log.ts`.**
- **Sem migração (AD-14).** Todas as colunas existem.

**Never:** Próximos meses e Evolução além de não mudá-las (7.1, 7.2), lembretes (7.4), Web Push (7.5); comparações entre Meses, médias, orçamento ou meta por Tipo; escolher o "meu Bloco" na Previsão (continua em Configurações); mudar `avaliar`, `projetarPainel`, `projetarPendente`, `resumirBloco`, o filtro da grade (`filtros-grade.ts`), o Cron ou as RPC; "Por proporção"; Conferência, alocação de Pagamento, `estaAtrasado`; ler ou alterar dados de produção; `supabase db push`.

## Decisões (registradas, nada implícito)

1. **As linhas e o valor são os do Painel daquele Mês.** `projetarPainel(linhas, mes)` entrega as linhas (a mãe dividida nunca soma e as filhas valem, AD-8; excluído nunca entra, AD-16; crédito entra com o sinal; previsto, Conta manual, Ajuste de centavos e Lançamento à mão entram como no Bloco do Painel; um Mês sem Fatura é feito de previstos). O valor do "meu Bloco" é o `valorCentavos` do `resumirBloco` sobre essa projeção, e `incluiPrevistos` também (o texto "inclui previstos" é o do cartão). Os testes amarram `totalCentavos`, `incluiPrevistos` e a soma das barras ao `resumirBloco` + `idsDosPrevistos` do Painel em Mês de Fatura, Mês sem Fatura (previstos) e Mês vazio, com quatro Fórmulas, e a jsdom o amarra ao `BlocosDoMes` real.
2. **A Fórmula é aplicada a cada Tipo; o que se guarda é o valor exato.** Toda Fórmula válida é afim nos totais dos operandos (valor em R$ × ou ÷ outro valor em R$ não existe, `formula.dinheiro_com_dinheiro`), e cada operando é uma soma sobre as linhas, então `F(linhas do Tipo) = parte(Tipo) + K`, onde `K = avaliar(formula, [])` é a parte fixa ("Rafael + 100" tem K = R$ 100,00). A contribuição do Tipo é `F(linhas do Tipo) − K` (racional exato: `avaliacao.calculo.valor`, que `avaliar` já devolve; `avaliar` não mudou). As linhas se repartem por `tipo_id` (nulo ou id que o cadastro não tem: "Sem tipo"), então a soma das contribuições mais `K` é o valor exato do Bloco. **O `K` é conferido:** o que sobra do valor do Bloco depois dos Tipos tem de ser igual a `avaliar(formula, [])`; se não for (uma Fórmula que não fosse afim, hoje impossível), o estado é `sem_valor` com o código `meu_gasto.nao_reparte` e a tela diz "O seu Bloco “X” não se reparte por Tipo", em vez de inventar um número.
3. **Arredondamento: maior resto, com uma só função de arredondamento.** O problema: arredondar cada Tipo e somar pode diferir do Bloco em centavos (Casal ÷ 2 sobre valores ímpares: 0,5 + 0,5 arredonda para 1 + 1, e o Bloco vale R$ 0,01; no exemplo da matriz 125,505 + 25,505 daria R$ 151,02 e o Bloco vale R$ 151,01). O aceite exige igualdade.
   - **Escolhido: maior resto.** Cada barra recebe o **piso** do valor exato e os centavos que faltam para chegar ao valor do Bloco vão, um a um, aos **maiores restos**. Cada barra fica a **menos de 1 centavo** do exato, e a soma é exatamente o Bloco. O piso sai de `arredondarRacional` (o arredondado, ou um a menos se passou do exato), então **não nasce uma segunda função de arredondamento** nem uma divisão nova: `dinheiro.ts` não muda. Faltam sempre entre 0 e N centavos (o valor do Bloco é a soma exata arredondada, a no máximo meio centavo dela), e a função lança se não for (não deveria acontecer; vira `sem_valor`).
   - **Descartado: arredondar cada Tipo e a "última" absorver a diferença (como a Divisão do AD-2).** A Divisão tem 2 a 10 partes por uma conta só; aqui N Tipos podem ter todos restos de meio centavo (Casal ÷ 2, oito Tipos de valor ímpar) e a diferença seria de até N/2 centavos numa barra só (4 centavos errados na maior), contra no máximo 1 em cada barra pelo maior resto. A barra errada seria a maior, a que Rafael mais olha.
   - **Qual Tipo recebe o centavo que falta:** o de **maior resto**; empate de resto: o de **maior valor exato**; empate: a **ordem de preferência**, que é o **nome** (`pt-BR`) e depois o **id** (os Tipos antes de "Sem tipo", o valor fixo por último). Nada disso depende da ordem das linhas nem do cadastro: **mesma entrada, mesma saída** (testado embaralhando linhas e Tipos, e em 600 Fórmulas e Lançamentos sorteados com semente fixa). Exemplos testados: 1 + 1 de Casal ÷ 2 em Casa e Bobiças dá R$ 0,01 em Bobiças (nome); quatro Tipos de 1 centavo dão R$ 0,01 nos dois primeiros nomes; oito Tipos de 101 centavos dão 51 em quatro e 50 em quatro, na ordem dos nomes.
4. **Quais barras aparecem.** Tipo (inclusive **arquivado**, que continua aparecendo com "(arquivado)": arquivar não tira o gasto das somas, AD-16) com valor repartido **diferente de zero**; "Sem tipo" para a linha sem Tipo **ou** com um id que o cadastro lido não tem (só por edição fora do app; nesse caso o filtro "Sem tipo" do Painel não pega essas linhas: a contagem pode divergir); e, se a Fórmula tem parte fixa, a barra **"Valor fixo do Bloco"**. Um Tipo cujas linhas a Fórmula não soma (todas do Casal numa Fórmula "Rafael"), ou que se anulam (compra e estorno), vale R$ 0,00 e **não aparece**; também não aparece a barra que o maior resto deixou em R$ 0,00. A soma das barras que aparecem é o Bloco porque as que somem valem zero.
5. **Ordem:** do maior para o menor **valor** (com sinal: um Tipo líquido negativo fica no fim); empate pelo **nome** (`pt-BR`, "Bobiças" antes de "Casa"), com "Sem tipo" depois dos Tipos quando empata. "Sem tipo" não tem lugar fixo: ele é gasto de verdade (uma linha ainda sem classificação) e segue o valor, como os outros. O **"Valor fixo do Bloco" fica sempre por último** (não é um Tipo, mesmo que seja o maior).
6. **Porcentagem: `valor da barra ÷ valor do Bloco`, inteira, repartida pela mesma função (soma exatamente 100%).** Só existe com o **valor do Bloco maior que zero**; com zero ou negativo `percentual` é `null` e a tela escreve "—" (um "% do total" de um total que não é positivo não diz nada). Com crédito (Tipo líquido negativo) as fatias positivas passam de 100% e a negativa aparece com sinal ("143%" e "-43%"): o total é o líquido, o mesmo do cartão. A barra **desenha só o valor positivo** (como na 7.1): a largura é `valor ÷ maior barra positiva`, com no mínimo 2 px; o valor negativo fica sem barra, com o número e o sinal em texto. Inteira e não com uma casa decimal porque o mockup a mostra assim (20%, 19%, 17%…, soma 100) e uma fatia pequena aparece como "0%" ao lado do valor em R$ (anotado no `deferred-work.md`).
7. **Qual é o "meu Bloco" e quando a aba não calcula.**
   - É o Bloco com `meu_bloco = true` (no máximo um, índice parcial; com mais de um, que não deveria existir, vale o de menor `ordem`). **Sem nenhum:** "Escolha qual Bloco representa o seu gasto" com o atalho "Escolher em Configurações" (`/configuracoes?secao=cobranca`, a seção onde o "meu Bloco" é marcado, a mesma constante `SECAO_COBRANCA` de Recebimentos), sem seletor de Mês.
   - **Fórmula que não calcula** (`formula.valor_grande`; `formula.dinheiro_com_dinheiro` e `formula.divisao_por_zero` só nasceriam de uma Fórmula que o Montador já recusa): `sem_valor` com o código do `avaliar`, e a tela diz "O seu Bloco “X” não calcula neste mês. Confira a Fórmula." (com o seletor de Mês, porque `formula.valor_grande` depende do Mês). Os códigos são os do núcleo; nenhum erro novo de `avaliar`.
   - **Fórmula sem operando que dependa de Tipo** (um Bloco "Valor fixo": `250`): uma barra só, "Valor fixo do Bloco", 100%, não clicável. **Bloco que cita Responsável ou Tipo arquivado:** o arquivado soma (AD-16), nada muda. Que cita um cadastro que **sumiu**: o operando vale R$ 0,00; o Mês fica sem barras ("O seu Bloco não soma nada neste mês").
   - **Parte fixa não nula** ("Rafael + 100"): a barra "Valor fixo do Bloco", por último, com a legenda "Parte da Fórmula que não depende dos Lançamentos". Ela passa pelo mesmo maior resto (a parte fixa pode ter fração: "Casal ÷ 2 + 0,005").
8. **Seletor de Mês (próprio) e o endereço do Painel filtrado.**
   - **O seletor é o `SeletorMes` do Painel, sem mudar uma linha dele** (props: Mês, lista, Meses com Fatura, `aoMudar`). O Mês é `useState` da aba: abre no **Mês atual** (`mesAtual(hoje)`), não é guardado e não divide a escolha com o Painel nem com as outras abas (sair da aba e voltar abre no Mês atual de novo). A lista é `mesesDoMeuGasto`: **do Mês mais antigo com Fatura ou com Lançamento até o Mês atual + 1** (o intervalo de `mesesDaLista` do Painel), mais o Mês aberto se estiver fora; o selo "Fechado" é dos Meses com Fatura. Os Meses com Lançamento vêm das linhas que a Previsão já lê (inclui o histórico da planilha, que o seletor do Painel lê à parte por `repoPlanilha`; aqui isso seria uma leitura avulsa, e o `lancamentos:todos` já traz os mesmos Meses). As setas andam sem limite: um **Mês futuro** abre com os previstos e o texto "inclui previstos".
   - **Tocar num Tipo abre `/?mes=AAAA-MM&tipo=<id do Tipo>`** (`enderecoDoPainelPorTipo`), ou `tipo=sem` para "Sem tipo". Cada linha da lista é um `Link` de 44 pt com o nome acessível "Casa: R$ 125,51, 73% do total. Abrir o Painel de Nov/26 só com Casa". O valor fixo não é link (não é um Tipo).
   - **A mudança no Painel (a única fora da Previsão):** `page.tsx` lê `tipo` com `lerTipoDoEndereco` (núcleo: `uuid` → o id; `sem` → `null`, "Sem tipo"; ausente, vazio ou qualquer outro texto → ignorado, como o `lancamento`; lista → o primeiro valor) e passa `tipoInicial` ao `Painel`, que o usa só no **estado inicial dos filtros**: `definirColuna(FILTROS_VAZIOS, "tipo", [tipoInicial])`. É o filtro de coluna de sempre (a pílula "Tipo: Casa", o popover, "Limpar filtros", vale ao trocar de Mês). **Não foi preciso mudar o núcleo dos filtros** (`filtros-grade.ts` intacto): `ValorFiltro` já é `string | null`, e `null` é "Sem tipo". Um id que o cadastro não tem liga o filtro e deixa a grade vazia, com "Limpar filtros" (a lista do popover já tratava id escolhido que sumiu). O hero e os Blocos seguem o Mês inteiro (o filtro só vale na grade).
   - **Fica para Rafael decidir:** a grade filtrada mostra **todas** as linhas do Tipo (de todos os Responsáveis), não só as do "meu Bloco"; para a grade bater com a barra, o endereço levaria também o filtro por Bloco (`deferred-work.md`).
9. **Dados: os da Previsão mais `blocos`, nenhum gerenciador novo.** `useDadosDaPrevisao` (Lançamentos de todos os Meses, `faturas`, `responsaveis`, `tipos`) e `useLinhas("blocos")`, que o Painel já usa, lido **dentro da aba** e não no hook comum (para não segurar "Próximos meses" e "Evolução" esperando os Blocos). **Custo de memória: nenhum além do existente** (`blocos` é um punhado de linhas; o canal `lancamentos:todos` é o mesmo de Recebimentos, 7.1 e 7.2; a aba só filtra e soma a lista que já está em memória, uma vez por Mês e por mudança). Carregando (qualquer das cinco leituras): esqueleto "Carregando o seu gasto…", nunca "Escolha qual Bloco…". Erro de qualquer uma: "Não foi possível carregar" + "Tentar de novo", que relê as cinco (as quatro da Previsão e `blocos`). Realtime: marcar o Bloco, mudar a Fórmula ou um Lançamento em outro aparelho muda as barras no lugar.
10. **O desenho e os estados.**
    - Um cartão com o título ("Meu gasto em outubro/26 por Tipo"), a linha "pelo meu Bloco “Nome”: Rafael + (Casal ÷ 2) · total R$ 2.063,44" (a Fórmula escrita pelo `textoDaFormula` do núcleo, com "· inclui previstos" quando vale), a ajuda ("Toque num Tipo para abrir o Painel do Mês só com ele."), o seletor de Mês ao lado e a lista (`<ol>`): por linha, **nome, barra, valor e %** (`grid` de 4 colunas, como o mockup: 110 px | barra | 110 px | 50 px, em rem). Nome e número ficam em texto na linha e o nome acessível da linha os repete, então **a cor e o comprimento nunca são a única informação**; a barra é `aria-hidden`.
    - **Uma cor só (o token `accent`), como o mockup, e não as 8 cores de pessoa alternando.** Aqui a ordem é pelo valor, não alfabética, então as cores alternando mudariam de cor o mesmo Tipo de um Mês para outro e passariam a falsa ideia de que a cor significa algo; o nome já diz qual é o Tipo (`deferred-work.md`).
    - Estados: **sem "meu Bloco"** (decisão 7); **Mês sem Lançamento** "Nenhum lançamento neste mês"; **Mês com Lançamento mas o Bloco não soma nada** "O seu Bloco não soma nada neste mês"; **Fórmula que não calcula** (decisão 7); carregando e erro (decisão 9). As abas continuam visíveis em todos.
11. **Onde mora a regra, e o que mudou fora.**
    - `src/domain/meu-gasto.ts` (novo): `projetarMeuGasto`, `acharMeuBloco`, `mesesComLancamentos`, `mesesDoMeuGasto`, `enderecoDoPainelPorTipo`, `lerTipoDoEndereco`, `TIPO_SEM_TIPO_NO_ENDERECO` e os tipos `MeuGastoDoMes`, `BarraDoMeuGasto`. `mensagens.ts`: os textos da aba em `TEXTOS_PREVISAO` e `tituloDoMeuGasto`, `rotuloDoBlocoDoMeuGasto`, `textoMeuGastoSemValor`, `rotuloDaBarraDoMeuGasto`; saíram `em_breve` e `em_breve_meu_gasto` (a aba funciona).
    - Mudanças fora do núcleo novo: `Previsao.tsx` (a aba no lugar do "Em breve"), `Painel.tsx` (a prop `tipoInicial` e o estado inicial dos filtros, 3 linhas) e `page.tsx` (lê `tipo`). **`avaliar`, `resumirBloco`, `projetarPainel`, `dinheiro.ts`, `filtros-grade.ts`, `SeletorMes`, `GraficoPorMes`, "Próximos meses" e "Evolução" não mudaram** (os testes das duas abas passam sem mudança; só o teste que esperava "Em breve" na terceira aba mudou).
    - **Duplicação da regra: nenhuma.** A conta é `avaliar` (a única), as linhas são `projetarPainel`, o valor do Bloco é `resumirBloco`; o filtro é o de coluna da grade.

## I/O & Edge-Case Matrix

Hoje 19/11/26. Responsáveis Rafael e Casal; Tipos Casa, Bobiças, Saúde e Antigo (arquivado); Mês de exemplo 2026-10. "Rafael + (Casal ÷ 2)" salvo se disser outra.

| Cenário | Entrada | Saída |
|---|---|---|
| Sem "meu Bloco" | nenhum Bloco, ou nenhum marcado | `sem_bloco`: "Escolha qual Bloco representa o seu gasto" + atalho `/configuracoes?secao=cobranca` |
| Dois marcados (não deveria) | `meu_bloco` em dois | o de menor `ordem` |
| Fórmula "Rafael" | Casa 100,00 + 25,00; Bobiças 50,00; Saúde 75,00; Casal (fora) | Casa 125,00 (50%), Saúde 75,00 (30%), Bobiças 50,00 (20%); total 250,00 |
| "Rafael + (Casal ÷ 2)" | Casa: Rafael 100,00 + Casal 50,00; Bobiças: Casal 80,00; Saúde: Rafael 30,00 | Casa 125,00, Bobiças 40,00, Saúde 30,00; total 195,00 = soma das barras |
| Números de outubro | Casal R$ 5.639,35 em "Casal ÷ 2" | R$ 2.819,675 → R$ 2.819,68, barra e total |
| Mês vazio | nenhum Lançamento no Mês | `mesVazio`; "Nenhum lançamento neste mês" |
| Bloco sem gasto | só linhas do Casal numa Fórmula "Rafael" | sem barras; "O seu Bloco não soma nada neste mês" |
| 1 Tipo | só Casa | uma barra, 100% |
| Sem tipo | `tipo_id` nulo | "Sem tipo", link `tipo=sem`; depois dos Tipos se empata |
| Tipo fora do cadastro | `tipo_id = t-fantasma` | cai em "Sem tipo"; total intacto |
| Tipo arquivado | `tipo_id = t-velho` | aparece com "(arquivado)" |
| Crédito | Casa 100,00; Bobiças -30,00 ("Rafael") | Casa 100,00 (143%); Bobiças -30,00 (-43%), no fim, sem barra; total 70,00 |
| Total zero ou negativo | +100,00 e -100,00 | barras com valor; `percentual` nulo ("—") |
| Divisão | mãe 100,01 + filhas Rafael 50,01 e Casal 50,00 | a mãe não soma; Rafael 50,01 + 25,00 = 75,01 |
| Excluído | linha com `excluido_em` | nunca entra |
| Previsto | `sistema` em Dez/26 (sem Fatura) | entra; "inclui previstos"; Conta manual vira real no Mês com Fatura |
| Previsto que a Fórmula não soma | previsto do Casal numa Fórmula "Rafael" | sem "inclui previstos" |
| Valor fixo | "Rafael + 100" | Casa 20,00, "Valor fixo do Bloco" 100,00 por último, total 120,00 |
| Só valor fixo | "250" | uma barra "Valor fixo do Bloco", 100%, mesmo com o Mês vazio |
| Fórmula que não calcula | Rafael × Casal; valor grande | `sem_valor` com o código; "O seu Bloco “X” não calcula neste mês. Confira a Fórmula." |
| Meio centavo | Casa 0,01 e Bobiças 0,01 em "Casal ÷ 2" | Bloco R$ 0,01: Bobiças R$ 0,01 (nome), Casa some; soma 0,01 |
| Meio centavo, negativo | -0,01 e -0,01 | Bloco -R$ 0,01: uma barra de -0,01 |
| Mais e menos | +0,01 e -0,01 | Bloco R$ 0,00: Casa 0,01 e Bobiças -0,01; soma 0 |
| Empate no resto | 4 Tipos de 0,01 | Bloco R$ 0,02: os dois primeiros nomes recebem 0,01; embaralhado dá o mesmo |
| Oito Tipos ímpares | 8 × 1,01 do Casal | Bloco 4,04: quatro de 0,51 e quatro de 0,50, na ordem dos nomes |
| Restos diferentes | Casal ÷ 3 com 0,02 e 0,01 | o centavo vai ao maior resto (Casa) |
| O caso que quebra | Casa 125,505 e Bobiças 25,505 | arredondar cada um dá 151,02; o Bloco vale 151,01: Casa 125,51 e Bobiças 25,50 |
| Sorteados | 600 Fórmulas × 24 Lançamentos | soma = Bloco do Painel; % soma 100; ordem; embaralhado igual; barra a ≤ 2 centavos do cálculo por Tipo |
| Ordem e desempate | valores iguais | nome `pt-BR`; "Sem tipo" depois; valor fixo por último |
| % somando 100 | 8 Tipos iguais; 3 Tipos iguais | 13, 13, 13, 13, 12, 12, 12, 12; 34, 33, 33 |
| Painel | Mês de Fatura, sem Fatura e vazio, 4 Fórmulas | total, `incluiPrevistos` e soma das barras = `resumirBloco` do Painel |
| Seletor | abre em Nov/26; ◀ ▶; lista | Meses com Fatura ou Lançamento até Dez/26 (selo "Fechado"); Mês futuro com previstos |
| Mês não compartilhado | trocar de aba e voltar | abre de novo no Mês atual |
| Tocar num Tipo | Casa, Out/26 | link `/?mes=2026-10&tipo=t-casa` (44 pt) |
| Painel com `tipo` | `?tipo=<uuid>`, `?tipo=sem`, lixo, ausente | filtra pelo Tipo; "Sem tipo"; ignorado; sem filtro |
| Painel, Tipo arquivado | `tipo=` de um arquivado | filtra e a pílula diz "Tipo: Antigo" |
| Painel, outro Mês | `mes=2026-10&tipo=…` | só as linhas de outubro daquele Tipo; o filtro vale ao trocar de Mês |
| Painel, id desconhecido | `tipo=` uuid que não existe | filtro ligado, grade vazia, "Limpar filtros" |
| Carregando | `blocos` ou outra leitura em "carregando" | esqueleto "Carregando o seu gasto…", nunca "Escolha qual Bloco…" |
| Erro | cada uma das 5 leituras em "erro" | alerta + "Tentar de novo" relê as 5; as abas continuam |
| Realtime | marcar o Bloco; Lançamento novo | as barras ligam e mudam no lugar |
| Aba guardada | "Meu gasto por Tipo" escolhida | volta nela (da 7.1) |

## Code Map

- Núcleo: `src/domain/meu-gasto.ts` (novo); `src/domain/mensagens.ts` (`TEXTOS_PREVISAO` e os quatro rótulos). Reaproveita `resumirBloco`, `avaliar`, `projetarPainel`, `idsDosPrevistos`, `arredondarRacional`, `mesesDaLista`.
- Interface: `src/features/previsao/MeuGasto.tsx` (novo: a aba), `src/features/previsao/Previsao.tsx` (a aba no lugar do "Em breve"), `src/app/(app)/page.tsx` e `src/features/painel/Painel.tsx` (`tipoInicial`). Reaproveita `SeletorMes`, `useDadosDaPrevisao`, `EsqueletoDaPrevisao`, `EstadoVazio`, `ErroAoCarregar`.
- Provas: `src/domain/meu-gasto.test.ts` (55, núcleo), `src/features/previsao/MeuGasto.test.tsx` (25, jsdom, com o `BlocosDoMes` real), `src/features/painel/Painel.test.tsx` (8 novos: o Tipo do endereço), `src/features/previsao/Previsao.test.tsx` (1 ajustado: a terceira aba funciona), `Evolucao.test.tsx` e o resto de `Previsao.test.tsx` sem mudança.
- Sem: migração, `database.types.ts`, RPC, Cron, `realtime.ts` (nenhum gerenciador novo), `avaliar`, `dinheiro.ts`, `filtros-grade.ts`.

## Tasks & Acceptance

- [x] Núcleo: `projetarMeuGasto` (Fórmula por Tipo em racional exato, maior resto, ordem, %), o endereço e a lista de Meses; textos pelo mapa.
- [x] Interface: a aba "Meu gasto por Tipo" com o seletor de Mês próprio, as barras horizontais e os estados; o Painel abre filtrado por `?tipo=`.
- [x] Provas: núcleo (matriz: sem "meu Bloco"; "Rafael"; "Rafael + (Casal ÷ 2)"; Mês vazio; 1 Tipo; vários; "Sem tipo"; arquivado; crédito; Divisão; excluído; previsto; valor fixo; Fórmula que não calcula; arredondamento de borda e 600 casos sorteados; ordem e desempate; %; igual ao `resumirBloco` do Painel), jsdom (a aba, o seletor, o sem "meu Bloco" com o atalho, vazio, carregando, erro, o toque no Tipo e o endereço, o texto equivalente, o Realtime) e a regressão do Painel com o filtro novo e das abas "Próximos meses" e "Evolução".
- [x] `sprint-status.yaml` (7.3 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [x] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [x] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3751 passam na rodada completa; os 2 que falham nela (`eslint-nucleo` e `eslint-formatos`, estouram 5 s sob carga) passam sozinhos (39 testes). Novos: 55 do núcleo, 25 da aba e 8 do Painel (88); 1 teste ajustado. Uma mutação de prova (trocar o maior resto por arredondar cada Tipo) derruba 11 testes. `npm run build` **não foi rodado**: falha local por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad e PC (o desenho das linhas em tela estreita, as cores em claro e escuro, o toque de 44 pt, o VoiceOver); **produção** (nenhum dado de produção foi lido nem alterado; a aba nunca rodou com o "meu Bloco" e os Lançamentos reais, então não se viu a lista de Tipos de outubro nem se a repartição bate com o cartão do Bloco no Painel real); o `page.tsx` (a leitura de `?tipo=` no servidor) só é coberto por `lerTipoDoEndereco` (núcleo) e pelo `tipoInicial` do `Painel` (jsdom), não por um teste da rota.
