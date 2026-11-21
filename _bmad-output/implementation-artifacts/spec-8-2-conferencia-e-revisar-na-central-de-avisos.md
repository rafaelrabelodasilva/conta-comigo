---
title: 'História 8.2: Conferência e Revisar na Central de Avisos'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '88bb605'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-central-de-avisos.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a Central de Avisos da 8.1 só tem os dois lembretes de hoje (fechamento da fatura e Bloco com itens atrasados). O Rafael decidiu (resposta 2 ao desenho da 8.1) que o escopo final da Central inclui **a diferença da Conferência e a fila do Revisar**, e que o contador do menu mostra tudo o que precisa dele num lugar só. Hoje a diferença da Conferência só aparece na faixa âmbar do Painel (do Mês aberto) e a fila só no contador "para revisar" do menu.

**Approach:** dois tipos novos de aviso, **só dentro do app** e **sem migração**: (1) um aviso por Fatura importada cuja Conferência não bate (`conferir`) e que não foi dispensada, com as mesmas frases da faixa do Painel e o destino no Painel do Mês; (2) um aviso quando há itens na fila do Revisar (`contarFila`), com o mesmo número do menu e do "Faltam N" e o destino `/revisar`. A regra continua no núcleo: `avisosDaCentral` passa a receber os três tipos de origem (lembretes, Conferência, Revisar) e continua dona da ordem, do "lido", da contagem e das chaves de "Marcar tudo"; as funções que montam os avisos novos (`avisosDeConferencia`, `avisoDoRevisar`) são puras. A chave `(tipo, referencia, dia)` de cada tipo novo cabe em `avisos_lidos` como a 8.1 a criou. O contador do menu passa a contar os três; o contador "para revisar" do item Revisar continua. **Sem interruptor novo, sem notificação do sistema.**

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `avisosDeConferencia`, `avisoDoRevisar` e a generalização de `avisosDaCentral` moram em `src/domain` (só imports relativos; sem Next, React, Supabase, relógio nem DOM; nenhum deles lê "hoje"). A tela, o menu e o repositório só chamam. Nenhuma contagem na tela nem no SQL.
- **Uma só verdade (AD-10):** a Conferência do aviso é a de `conferir` (a mesma da faixa do Painel e do selo de Recebimentos), as frases são as de `frasesFaixaConferencia` e o número do Revisar é o de `contarFila`/`ehDaFila` (o do menu e do "Faltam N"). Testes amarram os três.
- **Dados só pelo gerenciador de Realtime (AD-4):** o hook abre também `fatura_cartoes` e a fila do Revisar (`useFilaRevisar`); nenhuma leitura avulsa.
- **Schema só por migração (AD-14); log só por `src/server/log.ts` (AD-17); segredos só no servidor (AD-12):** nenhuma migração, nenhum log novo, nenhum segredo novo.
- **Textos só em `mensagens.ts`; nenhuma cor literal; alvo de 44 pt; estado sempre em texto ("Novo" ou "Lido", nunca só cor ou negrito); `role="status"` sem roubar o foco.**

**Never:** mudar `conferir`, `precisaVerificar`, a marca "verificar", a faixa âmbar do Painel, "Dispensar", a fila do Revisar, `ehDaFila` ou `contarFila` (só chamar); mudar a Fórmula, Recebimentos ou o atraso; notificação do sistema dos tipos novos (Cron, `lembretesParaNotificar`, `lembretes_enviados`, service worker); dispensar aviso por dias; e-mail, SMS, WhatsApp; celular (< 700 px); push no iPhone; badge do ícone do app; limpar `avisos_lidos`; ler ou alterar dados de produção; `supabase db push` (não há o que aplicar); atualizar o Next (nem `next upgrade`).

## Decisões (registradas, nada implícito)

1. **Dois tipos novos, só dentro do app, sem migração.** `avisos_lidos.tipo` é texto livre (1 a 32) e a `referencia` vai até 64: `conferencia` (11) e `revisar` (7) cabem, e as chaves dos dois (decisões 3 e 4) também. Nenhuma tabela, coluna, política, RPC ou publicação mudou, e o `database.types.ts` é o mesmo.
2. **A regra generalizada, no núcleo.** `avisosDaCentral(origens, lidos)` recebe uma lista de `OrigemDoAviso` (`Lembrete | AvisoDeConferencia | AvisoDoRevisar`) em qualquer ordem e devolve o mesmo `{ avisos, naoLidos, chavesNaoLidas, blocosAtrasados }` (`chavesNaoLidas` agora é `ChaveDeAviso[]`). O campo `AvisoDaCentral.lembrete` virou **`origem`** (uma Conferência ou a fila não é um lembrete). `chaveDoAviso(origem)` devolve a chave (a do lembrete é `chaveDeNotificacao`, inalterada; Conferência e Revisar trazem a deles). `TIPOS_DE_AVISO` é a ordem entre os tipos. As origens com a mesma chave valem uma só e a linha lida de um tipo que o código não conhece segue ignorada, como na 8.1. `blocosAtrasados` continua contando só os atrasos. Os dois montadores moram em `avisos-conferencia.ts` e `avisos-revisar.ts` (arquivos separados para não criar ciclo `revisar` → `mensagens` → `avisos`; os tipos são importados só como tipo).
3. **A chave da Conferência (a decisão central).** `tipo` = `conferencia`; `referencia` = `AAAA-MM:diferença das despesas:diferença dos créditos:finais com diferença` (centavos **com sinal**, finais separados por vírgula, ex.: `2026-11:-72000:0:8673`); `dia` = `faturas.fechamento` (sem ele, o vencimento). É exatamente o que a frase do aviso diz (`frasesFaixaConferencia` usa essas mesmas três coisas): **a frase muda se, e só se, a chave muda** (testado). Então a mesma diferença lida **continua lida** e uma diferença nova (reimportou e a Fatura diz outro total; entrou ou saiu um Lançamento que mexeu na soma) **volta como não lida**. Não depende de "hoje" (estável durante o dia e na virada). Dois cartões com diferença são **um** aviso por Fatura (as frases já listam os finais, que entram na chave). Um corte em 64 caracteres protege o caso absurdo de muitos cartões. **Custo:** ao corrigir uma Fatura aos poucos, cada Lançamento que muda a diferença traz o aviso "novo" de novo até a Fatura bater (então some) ou o Rafael dispensar a faixa (`deferred-work.md`). **Alternativa recusada:** só o Mês e o fechamento na chave: a diferença que piora ficaria calada se o aviso já foi lido.
4. **A chave do Revisar.** `tipo` = `revisar`; `referencia` = `fila` (um aviso só); `dia` = o dia, **em São Paulo**, do maior `faturas.updated_at` (a importação e a reimportação gravam a Fatura; o gatilho comum atualiza o campo). Não há coluna "importada em" e o spec pedia "sem migração se possível": escolhi `updated_at` (a `created_at` não mudaria numa reimportação, que atualiza a linha). **O número de itens não entra na chave:** classificar itens (a fila baixa) não traz o aviso de volta, e o Revisar já mostra o "Faltam N". Uma Fatura importada ou reimportada **em outro dia** traz o aviso de volta como não lido. **A fila zera e enche de novo:** sem importação nova (o "Desfazer" do Classificado) a chave é a mesma e o aviso continua como estava; com importação em outro dia, volta como não lido; no mesmo dia do que já foi lido, continua lido (o contador "para revisar" do menu mostra a fila de qualquer jeito). **A data é a de todas as Faturas, não só das que têm item na fila**, porque assim só sobe: com o filtro, a chave voltaria a uma data antiga quando o Mês mais novo fosse classificado e o aviso renasceria a cada classificação (pior). **Custos:** "Dispensar" e o "Desfazer" da faixa da Conferência também mexem em `updated_at`, e uma importação sem itens para a fila também: com a fila ainda cheia, o aviso lido volta uma vez com o mesmo número. Sem nenhuma Fatura, o dia é `1970-01-01` (`DIA_SEM_IMPORTACAO`). A saída exata seria uma coluna gravada pela importação só quando entram itens na fila (migração e RPC, outra história; `deferred-work.md`). `diaDoInstanteEmSaoPaulo` (em `datas.ts`, ao lado de `hojeEmSaoPaulo`) aceita o formato do REST e o do Realtime e devolve `null` para o desconhecido.
5. **Quais Meses entram na Conferência: todos** (as Faturas com diferença e sem dispensa, do Mês mais novo para o mais antigo, a mesma ordem da tabela de Meses anteriores). A diferença de um Mês antigo continua sendo um problema e o selo de Recebimentos continua a mostrar. **Custo:** um Mês antigo que o Rafael nunca vai resolver fica na lista, como não lido, até ele dispensar a faixa daquele Mês no Painel. **Alternativa:** só o Mês aberto e o último importado (uma linha em `avisosDeConferencia`, que recebe todas as Faturas). `avisosDeConferencia` agrupa os Lançamentos por Fatura numa passada só (custo linear) e confere cada Fatura só com os dela (`fatura_id`), excluídos e filhas de Divisão de fora, como `conferir` já faz.
6. **Preferências: nenhum interruptor novo.** O aviso da Conferência já respeita o "Dispensar" do Painel (quem dispensou não quer ser avisado de novo; a reimportação zera a dispensa e o aviso volta) e o do Revisar some quando a fila zera. Um interruptor seria coluna em `configuracoes` e migração, com compatibilidade entre o merge e o `db push`. O texto de ajuda do grupo "Lembretes" não mudou (fala dos dois tipos de lembrete).
7. **Notificação do sistema: fora.** O Cron (`notificar-lembretes.ts`), `lembretesParaNotificar`, `lembretes_enviados` (o `check` de `tipo` só aceita `fechamento` e `atraso`) e o service worker **não mudaram**. Os tipos novos existem só dentro do app: a diferença da Conferência nasce de uma ação do próprio Rafael (importar a Fatura, ver a faixa na hora) e a fila é trabalho que ele já vê no menu; uma notificação por importação seria ruído. **Alternativa:** se um dia notificar, é outra história (um `tipo` novo em `lembretes_enviados` com migração do `check`, o Cron lendo `fatura_cartoes` e a fila, e o texto dos dois em `avisoDoLembrete`).
8. **A ordem na Central:** não lidos primeiro e, dentro de cada grupo, **Conferência, Revisar, fechamento, atraso por Bloco** (o que bloqueia a leitura dos dados vem antes do lembrete de calendário e do de cobrança); dentro do tipo, a ordem recebida (Conferência: do Mês mais novo ao mais antigo; atraso: a ordem dos Blocos). Mesma entrada, mesma saída (a ordem de `origens` e de `lidos` não importa; nada é alterado).
9. **O hook e o "sem número parcial".** `useCentralDeAvisos` abre também `useLinhas("fatura_cartoes")` e `useFilaRevisar()` (a fila é o mesmo gerenciador do contador do menu) e monta `[...lembretes, ...avisosDeConferencia(...), avisoDoRevisar(...)]`. São **nove** leituras dos avisos (as sete da 8.1 mais `fatura_cartoes` e a fila) mais a dos lidos: qualquer uma ainda carregando é `carregando`; erro em qualquer das nove é `erro` (a tela mostra "Tentar de novo", que relê as **dez**, e o menu fica sem contador); a leitura dos lidos que falha continua valendo como "nada lido" (decisão 9 da 8.1). **Custo:** uma falha só na fila ou nos cartões tira o contador dos avisos, mesmo com os lembretes prontos (preferi isso a um número parcial; `deferred-work.md`).
10. **O texto e o destino de cada tipo (`mensagens.ts`).** `textoDoAviso(origem)`: Conferência = `Fatura de novembro/26 com diferença. ` + as frases da faixa (`frasesFaixaConferencia`, sem texto duplicado; o Mês leva o ano porque entram Faturas de todos os Meses); Revisar = `17 lançamentos para revisar` (`1 lançamento para revisar`); lembretes = `textoDoLembrete` (inalterado, o mesmo da notificação). `rotuloAcaoDoAviso(origem)`: "Abrir o Painel" (Conferência, destino `/?mes=AAAA-MM`, a mesma função do fechamento), "Abrir Revisar" (Revisar, destino `/revisar`) e "Abrir Recebimentos". `textoDoLembrete` e `rotuloAcaoDoLembrete` ficam (a notificação os usa).
11. **A tela e o resumo do topo.** A linha é a da 8.1 (estado em texto, destino em palavras, "Marcar como lido", tocar abre e marca; `Avisos.tsx` só trocou `lembrete` por `origem` e os dois textos pelas funções de aviso). O resumo continua "N avisos novos" (agora de qualquer tipo) e "N Blocos com itens atrasados" (só os atrasos, que são um estado); **não ganhou linha própria** para Conferência e Revisar (cada uma já diz o que é na lista). O foco, os `role` e o anúncio de "Marcar tudo" são os da 8.1.
12. **O contador do menu.** `naoLidos` do núcleo, agora dos três tipos (só o hook mudou; `MenuLateral.tsx` não). O contador "para revisar" do item **Revisar continua** (é a fila de trabalho; o aviso é "tem coisa para revisar"): os dois convivem (testado com o hook de verdade). "99+", carregando e erro como na 8.1. **A Conferência e o Revisar não dependem de `hoje`** (o atraso e o fechamento, sim), então o contador não pisca na virada do dia (testado: a chave e a lista são as mesmas antes e depois da meia-noite).
13. **Compatibilidade com o `db push`: não há o que aplicar.** A tabela da 8.1 já está em produção (o `db push` foi feito em 19/11/2026, depois do merge da #118). Entre o merge e qualquer coisa não há degrau: a Vercel publica e o app usa a tabela que existe. Quem abrir o app depois do deploy vê os avisos novos como **Novo** e o contador do menu sobe de uma vez. Em `docs/infraestrutura.md`.
14. **Acessibilidade: igual à 8.1.** O resumo em `role="status"`, o anúncio de "Marcar tudo", o foco depois de marcar (para o "Marcar como lido" do próximo não lido; sem nenhum, para a lista), estado sempre em texto, alvos de 44 pt e `aria-label` "Marcar como lido: {texto}" (que contém o rótulo visível). O texto da Conferência é mais longo que o dos outros (duas ou três frases), e o nome do botão o repete inteiro: **não verificado com VoiceOver** (`deferred-work.md`).
15. **Fora do escopo, anotado.** Interruptor dos dois tipos, notificação do sistema deles, dispensar a Conferência pela Central, limpar `avisos_lidos`, o badge do ícone, a coluna "importada em" e as pendências de iPad e VoiceOver ficam no `deferred-work.md`.

## I/O & Edge-Case Matrix

Hoje 19/11/26. Ciclo: fechamento 28, vencimento 06. Tolerância 10. Nov/26 com R$ 1.000,00 lidos e R$ 280,00 gravados no cartão 8673, salvo se disser outra coisa.

| Cenário | Entrada | Saída |
|---|---|---|
| Diferença da Conferência | Fatura de Nov que não bate, não dispensada | um aviso "Fatura de novembro/26 com diferença. A soma dos lançamentos ficou R$ 720,00 abaixo do total da fatura. A diferença está no cartão final 8673.", chave `conferencia / 2026-11:-72000:0:8673 / 2026-10-28`, destino `/?mes=2026-11`, "Abrir o Painel" |
| A Fatura bate | totais iguais | nenhum aviso |
| Dispensada | `alerta_dispensado_em` preenchido | nenhum aviso; o "Desfazer" e a reimportação o trazem de volta |
| Volta a bater | entra o Lançamento que faltava, ou a Fatura reimportada passa a bater | o aviso some da lista e do contador |
| Mesma diferença lida | Lançamentos trocam de valor, soma igual | chave igual: continua lido |
| Diferença nova | entra um Lançamento que mexe na soma | `...:-70000:0:8673`: volta como não lido |
| Dois cartões | 3967 e 8673 com diferença | UM aviso, chave `...:3967,8673`, a frase lista os dois |
| Vários Meses | Nov, Out (bate), Set (diferença) | dois avisos, Nov antes de Set; Set dispensado: só Nov |
| Fatura sem fechamento | `fechamento` nulo | `dia` = o vencimento |
| Fila do Revisar | 17 itens | um aviso "17 lançamentos para revisar", chave `revisar / fila / 2026-11-18`, "Abrir Revisar", `/revisar`; o mesmo número do menu e do "Faltam N" |
| Ajuste, excluída, filha de Divisão, já revisada | linhas fora de `ehDaFila` | não contam |
| Fila baixa | 17 → 16 → 1 itens | a chave não muda: continua lido |
| Fila zera | 0 itens | o aviso some; o contador "para revisar" também |
| Fila zera e enche | sem importação nova / com importação em outro dia | continua como estava / volta como não lido |
| Importação nova | Fatura reimportada no dia seguinte | `dia` novo: o Revisar volta como não lido |
| Sem Fatura | fila com itens, nenhuma Fatura | `dia` = `1970-01-01` |
| Três tipos juntos | Conferência, Revisar, fechamento e 2 Blocos | 5 avisos na ordem Conferência, Revisar, fechamento, Ana, Beto; `naoLidos` 5, `blocosAtrasados` 2 |
| Ordem com lidos | Conferência e fechamento lidos | Revisar, Ana, Beto (não lidos), depois Conferência, fechamento |
| Marcar tudo | 6 não lidos de três tipos | UM pedido com as 6 chaves, na ordem da lista |
| Mesma entrada, mesma saída | origens e lidos embaralhados | resultado igual; entrada intacta |
| A Central = a faixa = o menu | vários cenários de Faturas e de fila | aviso se, e só se, a faixa aparece; as frases da faixa estão no texto; a quantidade é `contarFila` e o "Faltam N" |
| Contador do menu | 2 não lidos (Conferência e fila) | "Avisos, 2 não lidos" e "Revisar, 17 para revisar" juntos; classificar baixa só o Revisar |
| "99+" | 100 Faturas com diferença | "Avisos99+, mais de 99 não lidos" |
| Carregando / erro | `fatura_cartoes` ou a fila | sem número no menu; a tela: esqueleto / "Não foi possível carregar"; "Tentar de novo" relê as 10 |
| Virada do dia | 23:50 de 19/11 → 00:05 de 20/11, fila cheia | a lista e as chaves são as mesmas: o contador não pisca |
| Dado de outro aparelho | linha lida do Revisar chega pelo Realtime | o contador baixa sem recarregar |
| Cron | qualquer cenário | só os lembretes viram notificação (nada mudou) |

## Code Map

- Núcleo: `src/domain/avisos.ts` (a regra generalizada: `OrigemDoAviso`, `ChaveDeAviso`, `TIPOS_DE_AVISO`, `chaveDoAviso`; `AvisoDaCentral.origem`), `src/domain/avisos-conferencia.ts` (novo: `avisosDeConferencia`, `referenciaDaConferencia`), `src/domain/avisos-revisar.ts` (novo: `avisoDoRevisar`, `DIA_SEM_IMPORTACAO`), `src/domain/datas.ts` (`diaDoInstanteEmSaoPaulo`), `src/domain/mensagens.ts` (`textoDoAviso`, `rotuloAcaoDoAviso`, `TEXTOS_AVISOS.abrir_revisar`).
- Interface: `src/features/avisos/use-central-de-avisos.ts` (abre `fatura_cartoes` e a fila; monta as três origens; `recarregarCentralDeAvisos` relê as dez leituras), `src/features/avisos/Avisos.tsx` (`origem`, `textoDoAviso`, `rotuloAcaoDoAviso`).
- Sem mudança: `MenuLateral.tsx`, `NavRail.tsx`, `src/data/*` (nenhum repositório nem gerenciador novo; `avisos-repo.ts` já aceita qualquer `tipo`), `src/server/*` (o Cron), o service worker, `supabase/*`, `database.types.ts`, `conferencia.ts`, `revisar.ts`, o Painel.
- Provas: `src/domain/avisos-conferencia.test.ts` (17), `src/domain/avisos-revisar.test.ts` (11), `src/domain/avisos.test.ts` (42: +11, os três tipos juntos, a ordem, o lido que continua, a chave que muda, marcar tudo, mesma entrada mesma saída, e os dois testes que amarram a Central à faixa do Painel e ao contador do Revisar), `src/domain/datas.test.ts` (+2), `src/features/avisos/Avisos.test.tsx` (44: +11), `use-central-de-avisos.test.tsx` (11: +4), `MenuComAvisos.test.tsx` (novo, 5: o menu com o hook de verdade, os dois contadores, "99+", carregando e erro), ajustes em `lembretes-notificacao.test.ts` (`origem`). Nenhum teste fala com a rede.
- Docs: `epics.md` (8.2 com os critérios; a cobertura do FR-55), PRD (FR-55), EXPERIENCE.md (linhas "Avisos", "Lembretes" e "Menu lateral"), `docs/infraestrutura.md` (seção da 8.2: não há migração), `deferred-work.md`, `sprint-status.yaml` (8.2 em `review`; `epic-8` segue `in-progress`).

## Tasks & Acceptance

- [x] Núcleo: `avisosDaCentral` generalizada, `avisosDeConferencia`, `avisoDoRevisar`, `diaDoInstanteEmSaoPaulo`, os textos pelo mapa.
- [x] Interface: o hook abre `fatura_cartoes` e a fila; a tela mostra os três tipos; o contador do menu soma (só o hook mudou).
- [x] Provas: núcleo (a matriz e os testes que amarram a Central, a faixa do Painel e o contador do Revisar), jsdom (a tela, o menu com o hook de verdade, o hook), datas.
- [x] Docs: `epics.md`, PRD, EXPERIENCE.md, `docs/infraestrutura.md`, `deferred-work.md`, `sprint-status.yaml` (8.2 em `review`).
- [x] **CI verde na PR (#121)** (`verificar`, `supabase`, "Backup gera e restaura" e o preview da Vercel). Não há migração, então o `supabase` e o backup só repetiram o que já passava. Mergeada em 19/11/2026.
- [ ] **O Rafael, fora do código (pendente):** conferir a Central no iPad e no PC com os dados reais (os avisos de Conferência de Meses antigos, a fila, o contador somado, marcar num aparelho e ver baixar no outro). Não há `db push` a fazer.
- [x] `done` no sprint-status só depois do merge, em PR separada (como a #119); o Épico 8 foi a `done` junto.

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 4198 passam e 257 ficam ignorados (os de integração, que precisam do Supabase local, rodam no CI); numa rodada anterior o `eslint-formatos` estourou os 5 s e passou sozinho (39 testes com o `eslint-nucleo`), como na 8.1. `npm run build` passou localmente na segunda tentativa (a primeira para no aviso de segurança do `next@16.4.3`, já no `deferred-work.md`; o Next não foi atualizado e `next upgrade` não foi rodado), com `/avisos` compilada; quem confirma é o job `verificar` do CI.
- **Só o CI prova:** o job `verificar` (lint, typecheck, testes e build). Os jobs `supabase` e "Backup gera e restaura" não têm o que provar de novo (nenhuma migração, nenhuma tabela nova).
- **Não verificado:** a Central num iPad (834 e 1194 pt) e no PC (o jsdom só prova DOM, nomes, `role`, foco e classes); o VoiceOver com o nome longo do botão "Marcar como lido: Fatura de novembro/26 com diferença. …"; as cores `alert-warning` em claro e escuro; a Central com os dados reais do Rafael (quantos avisos de Conferência de Meses antigos aparecem; se `faturas.updated_at` reflete as importações reais); **produção** (nenhum dado de produção foi lido nem alterado).
