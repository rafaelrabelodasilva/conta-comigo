---
title: 'História 7.2: Evolução dos últimos meses'
type: 'feature'
created: '2026-11-19'
status: 'review'
baseline_commit: '282bdda'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-recebimentos-por-bloco-de-cobranca.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-8-meses-anteriores-da-fatura.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-proximos-meses.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael vê quanto está comprometido nos próximos Meses (7.1), mas não tem onde comparar o que já foi cobrado nos Meses passados: a aba "Evolução" da Previsão ainda diz "Em breve" (FR-33).

**Approach:** a aba "Evolução" mostra barras empilhadas dos **últimos 6 Meses com Fatura importada**, **por Responsável ou por Tipo** (o mesmo seletor e o mesmo desenho da aba "Próximos meses"), com a tabela Responsável (ou Tipo) × Mês em texto. Com menos de 6 Meses importados mostra os que existem; com menos de 2 diz "Evolução disponível a partir de 2 meses importados", sem gráfico. O núcleo (`src/domain/previsao.ts`) escolhe os Meses e soma; a tela só chama e desenha. O desenho que as duas abas dividem foi extraído da `ProximosMeses.tsx` para `GraficoPorMes.tsx` (a aba "Próximos meses" ficou igual). **Nada é gravado, nenhuma migração, nenhuma leitura avulsa, nenhum gerenciador novo.**

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a escolha dos Meses, a soma e o agrupamento moram em `src/domain` (só imports relativos, sem relógio nem DOM; o Mês atual entra como parâmetro). A tela chama o núcleo.
- **Uma só projeção (AD-11):** o valor de um Mês é a soma de `projetarPainel(linhas, mes)`, a mesma lista que o Painel soma no Bloco "Todos" daquele Mês.
- **Dinheiro em centavos inteiros (AD-2/FR-54).** Somar não arredonda nada.
- **Dados só pelo gerenciador de Realtime (AD-4).** Nenhuma tela chama `supabase.from()`.
- **Textos só por `mensagens.ts`; nenhuma cor literal (segmentos `person-N` pelos tokens); a cor nunca é a única informação; alvos de toque de 44 pt; log só por `src/server/log.ts`.**
- **Sem migração (AD-14).** Todas as colunas existem.

**Never:** Próximos meses além de reaproveitar o desenho (7.1), Meu gasto por Tipo (7.3), lembretes (7.4), Web Push (7.5); comparações entre Meses (variação %, setas), médias, filtro por intervalo; Conferência, alocação de Pagamento, `estaAtrasado`; mudar `projetarPainel`, `projetarPendente`, o Painel ou o Cron; "Por proporção"; ler ou alterar dados de produção; `supabase db push`.

## Decisões (registradas, nada implícito)

1. **"Mês com Fatura importada" é um Mês com linha em `faturas`.** É a mesma regra do selo "Fechado" do Painel (FR-36: "Fechado = Fatura importada"; `SeletorMes` usa `mesesComFatura`), da 6.8 (a tabela "Meses anteriores" tem uma linha por Fatura) e da marca "Fatura importada" da 7.1. Consequência registrada: **um Mês que só tem histórico da planilha (3.10) não conta**, porque a importação da planilha cria Lançamentos `historico`, não `faturas`. Um Rafael que importou Jan a Set pela planilha e só importou Out por PDF vê "Evolução disponível a partir de 2 meses importados" até importar a segunda Fatura. É o que o aceite pede ("Fatura importada"); ver o `deferred-work.md` para a alternativa.
2. **O valor de cada Mês é a soma de `projetarPainel(linhas, mes)` (candidato a), não só as linhas da Fatura (candidato b).** Razões: (i) uma só projeção (AD-11): o número da Evolução é o do Bloco "Todos" do Painel daquele Mês, e um teste amarra os dois; (ii) o candidato (b) (`fatura_id`, o "Total a pagar" sem o saldo anterior) deixaria de fora as Contas manuais, os Ajustes de centavos e os Lançamentos feitos à mão, e Rafael veria na Evolução um valor diferente do que o Painel mostra para o mesmo Mês, sem saber por quê; (iii) o aceite diz "totais por Tipo e por Responsável" (FR-33), e a Conta manual é gasto do Mês. **O que isso inclui:** as linhas da Fatura, as Contas manuais do Mês, os Ajustes de centavos, os Lançamentos à mão e **algum previsto que ficou sem par** depois da importação (continua como linha `sistema` no Mês e o Painel o soma). **O que isso não inclui:** a mãe dividida (valem as filhas, AD-8), linha excluída (AD-16), saldo anterior e pagamento da Fatura (FR-30: não são Lançamentos). Crédito entra com o sinal e R$ 0,00 conta como linha sem mudar a soma. Um Mês com Fatura e **nenhuma** linha (todas excluídas) entra com R$ 0,00 e barra zero: a Fatura existe, então o Mês existe.
3. **Quais 6 Meses: os 6 mais novos com Fatura, até o Mês atual, em ordem crescente.**
   - **O Mês atual entra se já tem Fatura** (o Painel já o chama de "Fechado"); se não tem, fica de fora (hoje, 19/11/26, com Faturas até Out/26, a Evolução termina em Out/26).
   - **Um Mês futuro com Fatura adiantada NÃO entra.** "Últimos" Meses é passado e presente; e o Mês futuro com Fatura já está na janela da "Próximos meses" (decisão 3 da 7.1: entra com os valores reais e o texto "Fatura importada"). Assim **cada Mês aparece em uma aba só e as duas nunca se contradizem**: Evolução = Meses com Fatura ≤ Mês atual; Próximos meses = Meses > Mês atual. O mesmo Mês, nas duas abas, de qualquer jeito mostraria o mesmo valor (as duas chamam `projetarPainel`); a partição só evita repetir.
   - **Buraco entre Meses** (Jan e Mar, sem Fev): mostra só os importados, na ordem, **e diz isso**: "Há Meses sem Fatura importada entre os mostrados: eles ficam de fora." (`temBuraco`, calculado no núcleo com `somarMeses`; um Mês sem Fatura ANTES do primeiro mostrado não é buraco). Os cabeçalhos "Jan/27, Mar/27" já dizem qual falta; o aviso explica por quê.
   - Fatura repetida na lista ou fora de ordem: o núcleo deduplica e ordena (`mesesDaEvolucao`).
4. **Menos de 2 Meses importados (0 ou 1): o texto do aceite, sem gráfico, tabela nem seletor.** "Evolução disponível a partir de 2 meses importados" (`EstadoVazio`), igual nos dois casos; o núcleo devolve `disponivel: false`, `meses` e `grupos` vazios e `importados` (0 ou 1), e **não calcula nada**. Um Mês futuro com Fatura e um passado não somam 2 (o futuro não conta, decisão 3). As abas continuam visíveis. Com 2 a 6 Meses já desenha; o título diz "Os 3 meses com Fatura importada" (com 6: "Últimos 6 meses com Fatura importada").
5. **Os mesmos grupos da 7.1, pela mesma função.** O miolo de `projetarPrevisao` (a soma de `projetarPainel` por Mês, o agrupamento, a ordem, "Sem responsável"/"Sem tipo" no fim, arquivados depois, id fora do cadastro cai em "Sem …", as 8 cores de pessoa que alternam em Tipo, `barraCentavos`) virou a função interna `agruparMeses(linhas, listaDeMeses, opcoes)`; `projetarPrevisao` e `projetarEvolucao` só escolhem os Meses e chamam. **Nenhuma regra foi copiada.** Prova: os 38 testes da 7.1 passam sem mudança, e um teste da Evolução compara nome, cor e `arquivado` dos grupos com os da Previsão para as mesmas linhas.
6. **Barra e total.** O total do Mês é o líquido (o do Painel). A barra soma só os segmentos positivos (um grupo líquido negativo não desenha segmento; a tabela mostra o número com o sinal), como na 7.1. **A escala é da aba:** `maiorBarraCentavos` é a maior barra dos Meses da Evolução (um Mês antigo grande não achata as barras e um Mês futuro grande não entra: ele não está na lista). As duas abas não dividem escala: são grandezas diferentes (o que foi cobrado × o que já está comprometido).
7. **Dados: os mesmos da 7.1, nenhum gerenciador novo.** `useTodosOsLancamentos` (o da 6.5) + `faturas` + `responsaveis` + `tipos`, agora num hook `useDadosDaPrevisao` que as duas abas usam. **Custo de memória: nenhum além do existente** (~1,5 MB por ano de uso, só enquanto a tela vive; o canal `lancamentos:todos` é o mesmo de Recebimentos e da 7.1, então não há assinatura nova; a Evolução só filtra a lista que já está em memória). O "Tentar de novo" relê as quatro leituras. Realtime: uma Fatura ou um Lançamento novo em outro aparelho muda o gráfico no lugar (a segunda Fatura liga a Evolução na hora).
8. **Tocar num Mês abre o Painel dele (`/?mes=AAAA-MM`), como na 7.1.** A barra inteira e o cabeçalho do Mês na tabela são `Link` (44 pt). Confirmado: `page.tsx` do Painel lê `mes` e abre qualquer Mês (o seletor de Mês já navega para Meses passados), então um Mês de Fatura abre com o selo "Fechado".
9. **O seletor "Por Responsável / Por Tipo" é independente por aba.** Cada aba abre em "Por Responsável" e a escolha não é guardada (como a 7.1 decidiu, decisão 7: nem no `localStorage`). Motivos: o mockup desenha um seletor por aba; a aba "Próximos meses" fica idêntica à da 7.1 (nenhum estado levantado para `Previsao.tsx`, nenhuma prop nova nela); e o painel da aba desmonta ao trocar, então "compartilhar" exigiria levantar o estado. Custo registrado: quem escolhe "Por Tipo" na Evolução e volta a "Próximos meses" o vê em "Por Responsável" de novo (`deferred-work.md`).
10. **Onde mora a regra, e o que mudou na 7.1.**
    - `src/domain/previsao.ts`: `projetarEvolucao`, `mesesDaEvolucao`, `MESES_DA_EVOLUCAO`, `MINIMO_DA_EVOLUCAO`, o tipo `EvolucaoDosMeses`, o tipo `OpcoesDaPrevisao` e o miolo `agruparMeses` (extraído de `projetarPrevisao`, que ficou com a mesma assinatura e o mesmo resultado). `mensagens.ts`: `evolucao_minimo`, `evolucao_ajuda`, `evolucao_buraco`, `carregando_evolucao` e `tituloDaEvolucao`; saiu `em_breve_evolucao` (a aba funciona).
    - **Na `ProximosMeses.tsx`:** o seletor, as barras, a legenda e a tabela foram para `GraficoPorMes.tsx` (`SeletorDeAgrupamento`, `GraficoPorMes`); as quatro leituras e o esqueleto foram para `dados-da-previsao.tsx` (`useDadosDaPrevisao`, `EsqueletoDaPrevisao`). A `ProximosMeses` ficou com a lista de Séries, o estado vazio e a montagem. Mudança de desenho: **nenhuma** em "Próximos meses" (o `grid-cols-6` virou `grid-template-columns: repeat(6, minmax(0, 1fr))` e `width: 100%`, que é o mesmo layout; com menos de 6 Meses a largura é `n/6`, para a barra da Evolução não esticar). **Prova de que ficou igual:** os 24 testes de `Previsao.test.tsx` passam; só 3 mudaram (as que esperavam "Em breve" na aba Evolução, que agora funciona), nenhum da aba "Próximos meses".
    - **Duplicação da regra: nenhuma.** O valor de cada Mês chama `projetarPainel`; `evolucao.test.ts` e `Evolucao.test.tsx` amarram o total de cada Mês ao Bloco "Todos" do Painel daquele Mês (`resumirBloco` + `idsDosPrevistos`; e o `BlocosDoMes` real).
11. **A interface e os estados.**
    - Um cartão com o título ("Últimos 6 meses com Fatura importada"), uma linha de ajuda ("É a mesma soma que o Painel de cada Mês mostra no Bloco “Todos”. Só entram Meses com Fatura importada. Toque num Mês para abrir o Painel dele."), o aviso de buraco quando há, o seletor, as barras (total em cima, segmentos `person-N` de baixo para cima, Mês embaixo; cada barra é um link com o nome "Out/26: R$ 1.500,00. Abrir o Painel de Out/26"), a legenda e a tabela (`<table>` com legenda, `scope`, Mês no cabeçalho como link, "Total" no rodapé, `overflow-x-auto`). **Sem o texto "Fatura importada" em cada Mês** (todos têm; repetir não diz nada): `mostrarSeloDeFatura` é falso aqui e verdadeiro em "Próximos meses".
    - Por Tipo: o Tipo não tem cor; os segmentos alternam as 8 cores de pessoa e a legenda e a tabela dizem o nome (como na 7.1). "Sem …": o cinza.
    - Os números do gráfico existem em texto na tabela e no nome de cada barra; a cor nunca é a única informação.
    - Carregando (qualquer das quatro leituras): esqueleto com "Carregando a evolução…", nunca o texto de "menos de 2 Meses". Erro de qualquer leitura: "Não foi possível carregar" + "Tentar de novo". As abas continuam visíveis nos quatro estados. "Meu gasto por Tipo" continua dizendo "Em breve".

## I/O & Edge-Case Matrix

Hoje 19/11/26: Mês atual 2026-11. Responsáveis Rafael (cor 1), Casal (cor 2) e Antiga (arquivada); Tipos Casa e Bobiças.

| Cenário | Entrada | Saída |
|---|---|---|
| 0 Meses importados | `faturas` vazia | "Evolução disponível a partir de 2 meses importados"; sem gráfico, tabela nem seletor |
| 1 Mês importado | Fatura de Out/26 | o mesmo texto |
| 2 Meses | Set/26 e Out/26 | desenha os 2; título "Os 2 meses com Fatura importada" |
| 5 Meses | Jun a Out/26 | os 5 |
| 6 Meses | Jun a Nov/26 | os 6; "Últimos 6 meses com Fatura importada" |
| 7 Meses | Mai a Nov/26 | os 6 mais novos (Jun a Nov); Mai/26 fora; `importados` = 7 |
| Ordem | Faturas fora de ordem ou repetidas | crescente, sem repetir |
| Mês atual | Fatura de Nov/26 | entra; sem Fatura: fica de fora |
| Mês futuro com Fatura | Faturas de Out, Nov e Dez/26 | Dez/26 fora (é da "Próximos meses", com "Fatura importada") |
| Futuro + 1 passado | Out/26 e Dez/26 | 1 importado até o atual: texto de "menos de 2 Meses" |
| Buraco | Jul, Set e Out/26 | os 3, na ordem, com "Há Meses sem Fatura importada entre os mostrados…" |
| Sem buraco | Set, Out e Nov/26 (ou Dez/26 e Jan/27) | sem o aviso |
| Só histórico da planilha | Set/26 com `lancado_por = 'historico'`, sem Fatura | Set/26 não conta como importado |
| Mês com Fatura sem Lançamentos | Fatura de Set/26, nenhuma linha | entra com R$ 0,00, barra zero |
| Previsto sem par | Mês de Fatura com um `sistema` | soma o que o Painel soma |
| Conta manual, à mão, Ajuste | no Mês importado | entram (o Painel os soma) |
| Divisão | mãe R$ 100,01 + filhas R$ 50,01 e R$ 50,00 | R$ 100,01; a mãe não soma; cada filha no seu Responsável |
| Excluído | linha com `excluido_em` | nunca entra |
| Crédito | R$ 100,00 e - R$ 30,00 (Casal) | total R$ 70,00; a barra soma só o positivo; Casal mostra - R$ 30,00 na tabela |
| Sem Responsável / arquivado | `responsavel_id` nulo / Antiga | "Sem responsável" no fim; "Antiga (arquivado)" depois dos ativos |
| Por Tipo | Casa, Bobiças, arquivado e sem Tipo | alfabética, arquivado, "Sem tipo"; as cores alternam; mesmo total |
| Id fora do cadastro | `responsavel_id` desconhecido | "Sem responsável"; total intacto |
| Escala | Set R$ 10,00, Out R$ 40,00 e Fev/27 R$ 9.999,99 | a maior barra é a de Out (R$ 40,00) |
| Painel | Out/26 com Divisão, crédito, R$ 0,00 e excluído | total da Evolução = Bloco "Todos" do Painel de Out/26 |
| Seletor | "Por Tipo" | gráfico, legenda e tabela por Tipo; cabeçalho "Tipo"; a outra aba abre em "Por Responsável" |
| Tocar num Mês | barra ou cabeçalho de Out/26 | link `/?mes=2026-10` (44 pt) |
| Realtime | a segunda Fatura chega de outro aparelho | o texto some e o gráfico aparece no lugar |
| Carregando | qualquer leitura em "carregando" | esqueleto, nunca "Evolução disponível a partir de…" |
| Erro | uma leitura em "erro" | alerta + "Tentar de novo" (relê as 4); as abas continuam |
| Aba guardada | "Evolução" escolhida, tela aberta de novo | volta em "Evolução" (da 7.1) |

## Code Map

- Núcleo: `src/domain/previsao.ts` (novos: `projetarEvolucao`, `mesesDaEvolucao`, `MESES_DA_EVOLUCAO`, `MINIMO_DA_EVOLUCAO`, `EvolucaoDosMeses`, `OpcoesDaPrevisao`; extraído: `agruparMeses`); `src/domain/mensagens.ts` (`TEXTOS_PREVISAO` com os textos da Evolução, `tituloDaEvolucao`). Reaproveita `projetarPainel`, `somarMeses` e as ordens de `responsaveis.ts` e `tipos.ts`.
- Interface: `src/features/previsao/Evolucao.tsx` (novo: a aba), `src/features/previsao/GraficoPorMes.tsx` (novo: o desenho comum, extraído da `ProximosMeses`), `src/features/previsao/dados-da-previsao.tsx` (novo: `useDadosDaPrevisao` e o esqueleto), `src/features/previsao/ProximosMeses.tsx` (usa os dois), `src/features/previsao/Previsao.tsx` (a aba "Evolução" no lugar do "Em breve").
- Provas: `src/domain/evolucao.test.ts` (35, núcleo), `src/features/previsao/Evolucao.test.tsx` (24, jsdom, com o `BlocosDoMes` real), `src/features/previsao/Previsao.test.tsx` (24 da 7.1; 3 ajustadas por a Evolução já funcionar), `src/domain/previsao.test.ts` (38 da 7.1, sem mudança).
- Sem: migração, `database.types.ts`, RPC, Cron, `realtime.ts` (nenhum gerenciador novo), Painel, `projetarPainel`, `projetarPendente`.

## Tasks & Acceptance

- [x] Núcleo: `projetarEvolucao` e `mesesDaEvolucao`; o miolo comum extraído para `agruparMeses`; textos pelo mapa.
- [x] Interface: a aba "Evolução"; o desenho comum e o hook de dados extraídos da `ProximosMeses`.
- [x] Provas: núcleo (matriz: 0, 1, 2, 5, 6 e 7 Meses; ordem; buraco; Mês futuro; Divisão; excluído; crédito; sem Responsável; arquivado; por Tipo; total = Bloco "Todos" do Painel), jsdom (a aba, o seletor, os estados, o texto de menos de 2 Meses, o toque no Mês, o texto equivalente ao gráfico) e a regressão da aba "Próximos meses".
- [x] `sprint-status.yaml` (7.2 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [ ] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [ ] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 3661 passam na rodada completa, nenhum falha (59 novos: 35 do núcleo e 24 da tela). `npm run build` **não foi rodado**: falha local por um aviso do próprio `next build` de que `next@16.4.3` tem uma vulnerabilidade conhecida (já no `deferred-work.md`); o Next não foi atualizado. Quem confirma o build é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad e PC (o desenho das barras com 2 a 5 Meses centralizadas, as cores em claro e escuro, a tabela e a rolagem interna em tela estreita, o toque de 44 pt, o VoiceOver); **produção** (nenhum dado de produção foi lido nem alterado; a tela nunca rodou com as Faturas reais, então não se viu quantos Meses de Fatura Rafael tem hoje nem se o histórico da planilha, que não conta, deixa a Evolução em "a partir de 2 meses").
