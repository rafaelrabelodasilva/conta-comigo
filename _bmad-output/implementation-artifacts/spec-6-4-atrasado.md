---
title: 'História 6.4: Atrasado'
type: 'feature'
created: '2026-11-16'
status: 'review'
baseline_commit: '982095c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o que passou do vencimento sem ser pago aparece na grade igual ao que ainda está em dia: o selo diz "Não pago" nos dois (FR-49). Rafael não vê quem cobrar primeiro, e o filtro de Status não separa os dois.

**Approach:** o núcleo ganha `estaAtrasado(l, hoje, tolerancia, contexto)` (`src/domain/atraso.ts`), calculado e **nunca gravado**: um Lançamento não pago está atrasado quando `hoje` passa do vencimento + a tolerância (`configuracoes.tolerancia_atraso_dias`, padrão 10). A grade troca o selo "Não pago" pelo selo **"Atrasado"** (token `status-late`, texto sempre presente), o painel do Lançamento mostra "Atrasado · desde dd/mm/aa" e o filtro de Status ganha o valor **"Atrasado"**, ao lado dos Status cadastrados. O selo é um componente reutilizável (`SeloStatus`) para os cartões por Bloco da 6.5. Nenhuma migração.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a regra mora em `src/domain/atraso.ts` (só imports relativos, sem relógio: `hoje` entra como parâmetro). Tela, filtro e (no Épico 7) o Cron chamam o núcleo; não reimplementam. Datas de calendário (`AAAA-MM-DD`) comparam como texto; a soma de dias (`somarDias`, em `datas.ts`) é aritmética de calendário, sem fuso nem relógio.
- **Calculado, nunca gravado (AD-10):** nada sobre atraso vai ao banco. **Sem migração (AD-14)**, `database.types.ts` não muda, nenhuma RPC muda.
- **"Hoje" num único ponto da interface:** `useHoje()` (`src/ui/use-hoje.ts`), em America/Sao_Paulo (`hojeEmSaoPaulo`). Nenhuma tela chama `Date.now()` por conta própria para isto.
- **Tokens, texto e toque:** só tokens `status-*` (nenhuma cor literal); a palavra "Atrasado" é sempre texto (NFR8); textos pelo mapa `mensagens.ts`.

**Never:** cartões por Bloco, `projetarPendente`, "Recebido no mês" e a barra de Recebimentos (6.5); Dívida programada e a migração de `vencimento_combinado` (6.6); Cobrar pendências (6.7); Meses anteriores (6.8); editar/excluir/reimportar algo pago (6.9); lembretes e Web Push do atraso (Épico 7; o Cron `GET /api/cron/diario` não muda); Previsão. Mudar o que o Pagamento quita ou a alocação. Mudar o que a mensagem de cobrança inclui.

## Decisões (registradas, nada implícito)

1. **O dia exato do limite (decisão do Rafael).** O dia do vencimento e todo o período da tolerância ainda estão em dia: **vencimento + tolerância ainda NÃO é atraso; vencimento + tolerância + 1 já é.** Com vencimento 06/11/26 e tolerância 10: em dia até 16/11/26, atrasado desde 17/11/26 (`primeiroDiaDeAtraso`). Fecha o ponto 2 do `implementation-readiness.md`. **Divergência a alinhar:** a UJ-2 do PRD (17/11/26) bate; o EXPERIENCE.md ("O Lucas tem R$ 115,16 em atraso desde 16/11/26") e a História 7.4 dizem 16/11/26 e precisam passar para 17/11/26 quando o lembrete (Épico 7) for feito (pendência no `deferred-work.md`). Tolerância 0: o dia seguinte ao vencimento já é atraso.
2. **Pago parcialmente atrasado: o núcleo diz "atrasado"; o selo mostra os dois.** O que falta de uma linha paga em parte é o que está vencido: `estaAtrasado` é verdadeiro quando o restante (valor − Σ itens) é positivo e o prazo passou. A grade **mantém o selo "Pago parcialmente"** (que leva o "falta R$ X") e **acrescenta "Atrasado" ao lado**; o nome acessível da linha termina com "Pago parcialmente, falta R$ 60,00, atrasado desde 17/11/26". O filtro "Atrasado" inclui esta linha (o filtro e o selo concordam). "Pago" nunca vira Atrasado; "Atrasado" só substitui o "Não pago" (e a linha sem Status, que vale "não pago" e antes mostrava o travessão). Uma linha que os itens de Pagamento já cobriram por inteiro, sem Status pago, não tem mais o que cobrar e não atrasa.
3. **Vencimento: `vencimento_combinado` → vencimento da Fatura → Ciclo.** AD-9 define `vencimentoDoMes` como "o vencimento da Fatura ou, se ela não existe, o calculado pelo Ciclo", mas `vencimentoDoMes` em `ciclo.ts` só sabe o Ciclo (o comentário dele diz "a Fatura importada terá prioridade"). Sem mudar `vencimentoDoMes`, `vencimentoDoLancamento` aplica a ordem: (a) `vencimento_combinado` do Lançamento, **campo opcional que ainda não existe no banco nem nos tipos** (a migração é da 6.6; a 6.6 só liga o campo, a função já o lê); (b) `faturas.vencimento` do Mês do Lançamento (`vencimentosDasFaturas`, Mês → data), a data real que o banco imprimiu; (c) `vencimentoDoMes(mes, configs)`, o Ciclo, para um Mês sem Fatura (Contas manuais, histórico da planilha). **Desvio declarado do pedido:** o pedido citava só `vencimentoDoMes`; usar a Fatura primeiro segue o AD-9 e o FR-49 ("vencimento da Fatura") e evita um dia de erro quando a Fatura vence num dia diferente do configurado.
4. **Qual Mês e quais configurações do Ciclo.** O Mês é o `mes` do próprio Lançamento (AD-9: fixado na criação, nunca recalculado). As configurações são todas as de `config_ciclo` (`useLinhas("config_ciclo")`); quem escolhe a vigente no Mês é `configVigente(mes, configs)` (maior `vigente_desde ≤ mes`, antes da primeira vale a primeira), então mudar o dia do vencimento depois não reescreve o passado. **Sem como saber o vencimento** (nenhuma configuração do Ciclo, Mês ou data inválidos), `vencimentoDoLancamento` devolve `null` e a linha **simplesmente não atrasa**: nada lança erro, a grade nunca quebra. Tolerância inválida (negativa, quebrada, NaN) e `hoje` fora do formato também resultam em "não atrasa".
5. **Linhas que nunca contam (conferido no código).** (a) **Excluídas:** a grade já usa `linhasDoMes` (`excluido_em is null`); o núcleo confere de novo. (b) **Mãe dividida (AD-8):** a grade usa `unidadesDoMes`; o núcleo recusa a mãe (`ehMaeDividida`) e cada **parte (filha)** atrasa por conta própria, com o Status dela. (c) **Previstos:** `lancado_por = 'sistema'` e Conta manual de um Mês sem Fatura (`ehPrevistoNoMes`, regra da 5.1); com a Fatura importada, a Conta manual passa a contar. (d) **Ajustes de centavos:** a função recusa o Ajuste (acompanha a parcela); **na tela, o Ajuste mostra o selo da mãe dele** (a grade lê `atrasoPorLinha.get(mae.id)`), para a linha recuada não discordar da parcela. (e) **Valor zero ou negativo (crédito, estorno):** não há o que cobrar, não atrasa. **Decisão minha, além da lista do pedido:** sem ela, todo crédito de Fatura com o Status padrão "Não pago" apareceria em vermelho um mês depois. (f) Os pagos e os cobertos por itens (decisão 2).
6. **De onde vem o "hoje" e a virada do dia.** `useHoje()` (`useSyncExternalStore`) lê `hojeEmSaoPaulo(new Date())` e **relê o relógio a cada minuto e quando a aba volta a ficar visível ou ganha o foco**; só redesenha quando o DIA muda (o valor é um texto). Com o iPad aberto de um dia para o outro, o selo aparece em até 1 minuto depois da meia-noite de São Paulo (ou ao tocar na tela). O `mesAtual` do Painel (o Mês que abre) segue como estava: não faz parte desta história.
7. **Só calcula com os dados lidos.** `atrasoPorLinha` fica vazio até o Ciclo, as configurações, as Faturas e os itens de Pagamento do Mês aberto terem sido lidos: antes disso ninguém aparece atrasado, em vez de aparecer com a regra errada (tolerância padrão, Conta manual tratada como previsto, parcial sem o que falta). Custo: um instante sem selo depois do esqueleto, que some quando a última leitura chega.
8. **Filtro de Status: "Atrasado" é um valor calculado, não uma linha de `status`.** `FILTRO_ATRASADO = "atrasado"` (nunca é um id) entra na coluna Status, **depois dos Status cadastrados e antes de "Sem status"**, sempre na lista (contagem 0 se ninguém está atrasado). Compõe como qualquer valor da coluna: **OU** com os outros valores da coluna, **E** com as outras colunas, a busca, "Verificar" e o Bloco. Como o Lançamento atrasado **continua com o Status gravado** ("Não pago"), marcar "Não pago" também o inclui e marcar só "Atrasado" mostra só os atrasados; as contagens dizem isso ("Não pago, 2 lançamentos" e "Atrasado, 2 lançamentos" podem se sobrepor). A pílula diz "Status: Atrasado". Quem chama sem o conjunto de atrasados (`atrasadas`) não vê o valor em nenhuma linha. **Limites aceitos:** (a) um Status cadastrado que se chame "Atrasado" aparece como duas linhas de mesmo nome no popover; (b) ordenar a coluna Status segue o nome do Status gravado, não o selo (pendência).
9. **Selo, acessibilidade e tokens.** `SeloStatus` (`src/ui/SeloStatus.tsx`) é o selo único (`pago`, `nao_pago`, `parcial`, `atrasado`), só com os tokens `bg-status-*-bg` / `text-status-*-fg` (par com contraste já medido em `tokens.test.ts`; nenhuma cor literal); a grade e o painel do Lançamento passaram a usá-lo, e a 6.5 o usa nos cartões. **Não depende só de cor (NFR8):** a palavra "Atrasado" é texto; o `title` e o nome acessível da linha dizem "atrasado desde 17/11/26"; o painel mostra "Atrasado" e "desde 17/11/26" numa região `role="status"`. Textos no mapa: `ROTULO_ATRASADO`, `rotuloAtrasadoDesde`, `rotuloDesdeDoAtraso`, `TEXTOS_FILTROS.atrasado`.
10. **Tolerância: uma só fonte.** `configuracoes.tolerancia_atraso_dias` (0 a 60, editável em Configurações → Conferência); sem a linha de `configuracoes` vale `TOLERANCIA_ATRASO_PADRAO_DIAS` (10), como a própria tela de Configurações. Nenhuma coluna nova.
11. **Recebimentos hoje não tem selo de Status.** A tela só tem o Histórico de Pagamentos (6.3), que mostra o modo e "Não pago → Pago" como texto, não como selo: não há "Não pago" ali para trocar. O que a 6.5 precisa fica pronto: `atrasosDasLinhas` (id → primeiro dia de atraso, para qualquer lista de Meses), `primeiroDiaDeAtraso` e `SeloStatus variante="atrasado"`. Os cartões "Em dia / Não pago / Atrasado" dela escolhem a variante com o mesmo núcleo.
12. **A mensagem de cobrança não muda.** O EXPERIENCE diz que entram os Lançamentos "Não pago", "Atrasado" e, no parcial, só o que falta. A regra de inclusão (`projetarMensagem`) olha o Status (`ehPago`) e o restante, nunca a data, e "Atrasado" é um subconjunto de "não pago": quem está atrasado já entra, igual a quem está em dia. Nada a mudar em `projecoes.ts` nem em `modelo-mensagem.ts`; um teste do núcleo prova que a mensagem é a mesma em 16/11 e 17/11. O que é "não pago" continua sendo o único critério; Dívida programada ainda não vencida (6.6) é quem vai tirar linhas dali.
13. **Sem migração; `vencimento_combinado` entra opcional.** `LancamentoParaAtraso.vencimento_combinado` é opcional e ausente hoje (as linhas do banco não o têm); a tela usa só a Fatura e o Ciclo. Os testes cobrem a função com e sem o campo, para a 6.6 só ligar a coluna. O Cron diário e a Edge/rota de lembretes (Épico 7) usarão `atrasosDasLinhas`/`primeiroDiaDeAtraso` com `hojeEmSaoPaulo(new Date())` do lado do servidor.
14. **Os Meses do histórico da planilha (3.10) entram na regra.** Linhas `lancado_por = 'historico'` não são previstos: se o Status gravado não conta como pago (a importação só marca como pago o nome "Pago") e o Mês já passou, aparecem como Atrasado. É o que o dado diz, mas pode ser muita coisa no primeiro uso real (pendência: conferir com os Meses importados).

## I/O & Edge-Case Matrix

Vencimento 06/11/26 (Mês 2026-11), tolerância 10, linha de R$ 100,00 "Não pago", salvo dito.

| Cenário | Entrada (`hoje`) | Saída |
|---|---|---|
| Dia do vencimento | 06/11/26 | em dia (selo "Não pago") |
| Dentro da tolerância | 07/11 a 15/11 | em dia |
| Vencimento + tolerância | 16/11/26 | **em dia** |
| Vencimento + tolerância + 1 | 17/11/26 | **Atrasado** ("atrasado desde 17/11/26") |
| Tolerância 0 | 06/11 / 07/11 | em dia / atrasado |
| Tolerância 60, virada de ano | 05/01/27 / 06/01/27 | em dia / atrasado |
| Virada de mês | vencimento 28/02/27, tolerância 10: 10/03/27 / 11/03/27 | em dia / atrasado |
| Fevereiro bissexto | dia 31 em 02/2028 vira 29/02/28: 10/03/28 / 11/03/28 | em dia / atrasado |
| Perto da meia-noite UTC | `2026-11-17T02:59:59Z` / `T03:00:00Z` | `hoje` = 16/11 (em dia) / 17/11 (atrasado) |
| Pago (Status que conta) | qualquer data | nunca atrasa |
| Sem Status | 17/11/26 | atrasa (vale "não pago") |
| Pago parcialmente, restante vencido | R$ 40 de R$ 100, 17/11/26 | selo "Pago parcialmente" + "Atrasado", `falta R$ 60,00` |
| Itens já cobrem o valor, sem Status pago | 31/12/26 | não atrasa |
| Excluída / mãe dividida / Ajuste / previsto / valor ≤ 0 | qualquer data | nunca |
| Parte (filha) de uma Divisão | 17/11/26 | atrasa por conta própria |
| Conta manual em Mês sem Fatura / com Fatura | 31/12/26 | previsto (não) / atrasa |
| `vencimento_combinado` 20/11/26 | 30/11 / 01/12/26 | em dia / atrasado (manda sobre Fatura e Ciclo) |
| Vencimento da Fatura 07/11 (Ciclo 06/11) | 17/11 / 18/11/26 | em dia / atrasado |
| Mês só com histórico, sem Ciclo | qualquer data | não atrasa, grade intacta |
| Ciclo mudou em 2027-01 (dia 15) | Lançamento de 2026-12 | vence 06/12 (a vigente no Mês dele) |
| Tolerância / `hoje` inválidos | −1, 1,5, NaN, "17/11/26" | não atrasa, sem erro |
| Dados ainda carregando | itens de Pagamento lendo | ninguém aparece atrasado |
| O dia vira com a tela aberta | 23:50 → 00:05 de São Paulo, foco volta | o selo aparece sem recarregar |
| Filtro "Atrasado" | 2 atrasados de 4 | só os 2; "Não pago" também os inclui; E com Responsável |
| Painel do Lançamento | toque numa linha atrasada | "Atrasado" + "desde 17/11/26" |
| Pagar | Status "Pago" aplicado | o selo some na hora (Realtime) |

## Code Map

- `src/domain/atraso.ts` (+ `atraso.test.ts`, 38 testes): `estaAtrasado`, `primeiroDiaDeAtraso`, `atrasosDasLinhas`, `vencimentoDoLancamento`, `podeAtrasar`. `src/domain/datas.ts` (+ teste): `somarDias`. `src/domain/filtros-grade.ts` (+ teste): `FILTRO_ATRASADO`, o valor na coluna Status (`atrasadas` em `aplicarFiltros`, `valoresDoLancamento`, `valoresDaColuna`). `src/domain/mensagens.ts`: `ROTULO_ATRASADO`, `rotuloAtrasadoDesde`, `rotuloDesdeDoAtraso`, `TEXTOS_FILTROS.atrasado`.
- `src/ui/SeloStatus.tsx`, `src/ui/use-hoje.ts` (+ testes jsdom).
- `src/features/painel/Painel.tsx` (calcula `atrasoPorLinha` e `atrasadas`), `GradeLancamentos.tsx` (selo e nome acessível), `PainelLancamento.tsx` ("Atrasado · desde"), `GradeLancamentosAtraso.test.tsx`, `Painel.test.tsx` (12 cenários).
- Sem: migração, `database.types.ts`, RPC, Cron, `projecoes.ts`, `modelo-mensagem.ts`.

## Tasks & Acceptance

- [x] Núcleo: `estaAtrasado` e as funções de apoio, `somarDias`, o valor "Atrasado" do filtro, textos pelo mapa; testes do dia exato do limite em America/Sao_Paulo.
- [x] Interface: `SeloStatus` e `useHoje`; selo na grade e no painel do Lançamento; filtro de Status com "Atrasado"; só calcula com os dados lidos.
- [x] Provas: núcleo (limite, tolerância 0 e 60, virada de mês e de ano, bissexto, meia-noite UTC, `vencimento_combinado` com e sem, o que nunca atrasa), jsdom (grade, Painel, `useHoje`, `SeloStatus`).
- [x] Docs: `sprint-status.yaml` (6.4 em `review`), `deferred-work.md`, `docs/infraestrutura.md` (sem migração).
- [ ] CI verde na PR (`verificar`, `supabase`, "Backup gera e restaura").
- [ ] `done` no sprint-status só depois do merge, em PR separada.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build` e os testes (ver a PR). Os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos.
- **Só o CI prova:** o job `supabase` e o "Backup gera e restaura" (nada de banco muda aqui, então só confirmam que nada quebrou).
- **Não verificado:** iPad (leitura do selo, contraste real, VoiceOver lendo "atrasado desde 17/11/26"), produção (nenhum dado de produção foi lido nem alterado), os Meses importados da planilha (decisão 14) e a virada da meia-noite num aparelho de verdade (só simulada com relógio falso).
