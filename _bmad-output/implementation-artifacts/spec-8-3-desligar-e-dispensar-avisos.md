---
title: 'História 8.3: Desligar e dispensar os avisos da Conferência e do Revisar'
type: 'feature'
created: '2026-11-21'
status: 'review'
baseline_commit: '1f902cc'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-conferencia-e-revisar-na-central-de-avisos.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-central-de-avisos.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-4-lembretes-dentro-do-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a 8.2 pôs a diferença da Conferência e a fila do Revisar na Central de Avisos **sem interruptor** e **sem dispensar pela Central**. Dois custos ficaram no `deferred-work.md` e são "a história seguinte": (1) com a fila do Revisar quase sempre cheia, o aviso dela fica na Central o tempo todo e o Rafael não tem como desligá-lo; (2) um Mês antigo cuja Fatura nunca vai bater fica como não lido até ele voltar ao Painel daquele Mês e dispensar a faixa.

**Approach:** (a) dois interruptores novos em Configurações → Aparência (grupo "Avisos"), um por tipo, padrão ligado, em duas colunas booleanas novas de `configuracoes`; a regra mora no núcleo (`avisos-preferencias.ts`) e o filtro vale **antes** de `avisosDaCentral`, como `lembretesDasLinhas` já faz com os lembretes: o tipo desligado não aparece, não conta no menu e não entra em "Marcar tudo"; (b) "Dispensar" na linha da Conferência, que chama o `dispensarAlerta` do Painel (a mesma gravação, `alerta_dispensado_em`, sem migração), com o toast "Alerta dispensado · Desfazer"; (c) o texto de ajuda do grupo fica verdadeiro para os quatro tipos. **Notificação do sistema continua fora:** o Cron, `lembretesParaNotificar`, `lembretes_enviados` e o service worker não mudam e não leem as colunas novas.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `preferenciasDeAvisos`, `avisosDeTrabalho` e o `faturaId` do aviso moram em `src/domain` (só imports relativos; sem Next, React, Supabase, relógio nem DOM). A tela, o menu e o repositório só chamam. Nenhuma contagem na tela nem no SQL.
- **Uma só verdade (AD-10):** a Conferência e o Revisar continuam sendo `conferir`/`frasesFaixaConferencia` e `contarFila`/`ehDaFila` (a 8.2, só chamados). "Dispensar" na Central e na faixa do Painel é a mesma gravação (`repoFaturas().dispensarAlerta`).
- **Dados só pelo gerenciador de Realtime (AD-4):** o hook não abre nada novo (a linha de `configuracoes` já era lida); a gravação das preferências passa por `repoConfiguracoes()` (otimista, como `definirLembrete`).
- **Schema só por migração (AD-14):** duas colunas aditivas em `configuracoes` (`20261204120000_avisos_preferencias.sql`). Log só por `src/server/log.ts` (AD-17), segredos só no servidor (AD-12): nenhum log novo, nenhum segredo novo.
- **Textos só em `mensagens.ts`; nenhuma cor literal; alvos de 44 pt; estado sempre em texto.**

**Never:** notificação do sistema da Conferência e do Revisar (Cron, `lembretes_enviados`, service worker); dispensar o aviso do Revisar (o interruptor é o caminho); dispensar aviso por dias; limpar `avisos_lidos`; a coluna "importada em" do Revisar (continua `faturas.updated_at`); mudar `conferir`, a faixa âmbar do Painel, a fila do Revisar, `ehDaFila` ou `contarFila`; mudar a Fórmula, Recebimentos ou o atraso; e-mail, SMS, WhatsApp; celular; push no iPhone; badge do ícone; ler ou alterar dados de produção; `supabase db push` sem o Rafael pedir; atualizar o Next.

## Decisões (registradas, nada implícito)

1. **A hipótese não foi verificada com a Central real.** O pedido dizia: abra a Central com os dados reais (ou pergunte) e, se os avisos novos não incomodam, pare. Esta máquina não lê produção (fora do escopo) e o Rafael respondeu **"ainda não olhei, faça mesmo assim"**. Segui com o desenho recomendado; fica no `deferred-work.md` que a necessidade continua não confirmada. Custo se for em vão: as colunas ficam ligadas por padrão e nada muda para quem não mexe.
2. **Dois interruptores, duas colunas.** `aviso_conferencia` e `aviso_revisar`, `boolean not null default true` (no molde da 7.4, mas **sem** o prefixo `lembrete_`: não são lembretes). **Nenhum `check`**: um booleano `not null` já basta (testado: o banco recusa nulo). Comentário de cada coluna e o da tabela atualizado. Sem política, função nem publicação nova (a tabela já está no Realtime com replica identity full e o RLS é por dono).
3. **Tipo de preferência à parte.** `PreferenciasDeAvisos` (`{ conferencia, revisar }`), `PREFERENCIAS_DE_AVISOS_PADRAO`, `preferenciasDeAvisos(linha)` e `TIPOS_DE_AVISO_COM_INTERRUPTOR` ficam em `src/domain/avisos-preferencias.ts`, **fora** de `PreferenciasDeLembretes` (que continua com `fechamento` e `atraso`): a linha de `configuracoes` que `lembretesDasLinhas` e o Cron leem é tipada por `LinhaDePreferenciasDeLembretes`, que não conhece as colunas novas, então o Cron não as lê nem por acidente (testado: `lembretesDasLinhas` dá os mesmos lembretes com os avisos ligados ou desligados). **Alternativa recusada:** acrescentar `conferencia` e `revisar` a `TipoDeLembrete`, que os faria entrar em `lembretesDoDia`, no Cron e no `check` de `lembretes_enviados`.
4. **O filtro vale antes de `avisosDaCentral`.** `avisosDeTrabalho(faturas, cartoes, lancamentos, fila, preferencias)` devolve a Conferência e o Revisar com o filtro aplicado; um tipo desligado **nem é calculado** (como `lembretesDoDia`). O hook só chama e junta aos lembretes. Daí, sem código a mais: o aviso desligado não está na lista, não conta em `naoLidos` (menu e resumo) e não está em `chavesNaoLidas` ("Marcar tudo").
5. **O contador "para revisar" do item Revisar não muda.** É a fila de trabalho (`contarFila`), que não conhece as preferências; só o aviso "tem coisa para revisar" da Central some (testado com o menu e o hook de verdade: Revisar desligado, "Avisos" sem o aviso e "Revisar, 17 para revisar" igual).
6. **Compatibilidade entre o merge e o `db push` (a decisão central).** A Vercel publica no merge e o `db push` é depois. Sem as colunas, a linha de `configuracoes` que vem do banco **não traz** os campos novos e `preferenciasDeAvisos` trata "coluna ausente ou nula" como ligado: a Central funciona **como na 8.2** (testado no núcleo, na tela e no menu). **O que responde erro:** ligar ou desligar um interruptor novo (o upsert manda uma coluna que não existe, o banco recusa, o otimismo desfaz e a tela mostra "Não foi possível salvar", o mesmo que a 7.4 faz com os lembretes) e **nada mais**. "Dispensar" **não depende do banco novo** (grava `alerta_dispensado_em`, que já existe). **`db push` antes do merge é seguro** (só adiciona colunas com padrão; o front antigo ignora colunas que não conhece). Ordem recomendada: `db push` → merge, e nenhum interruptor responde erro em momento algum. Em `docs/infraestrutura.md`.
7. **Desligar e ligar de novo.** A linha de `avisos_lidos` nunca é apagada; ao religar, a chave dá o estado de antes (lido continua lido; uma diferença que mudou nesse meio tempo volta como não lida, como sempre). Testado no núcleo, na tela e no menu.
8. **"Dispensar" na Central: a mesma gravação do Painel, sem migração.** `AvisoDeConferencia` ganhou `faturaId` (o `id` da Fatura, já lido) e a linha chama `repoFaturas().dispensarAlerta(faturaId)` e, no "Desfazer" do toast, `desfazerDispensa(faturaId)`, com o mesmo texto ("Alerta dispensado", `TEXTOS_CONFERENCIA`). Dispensar pela Central e pelo Painel é a mesma coluna: a faixa e o aviso somem juntos e o "Desfazer" ou a reimportação os trazem de volta. **Dispensar não marca como lido** (nada é gravado em `avisos_lidos`). **Só a Conferência tem "Dispensar"**: o aviso do Revisar é um só, sobre a fila, e o caminho dele é o interruptor; os lembretes são estados de calendário e de cobrança.
9. **A linha lida também pode ser dispensada** (decisão do pedido: recomendo, sim). "Lido" é "vi" (a linha fica, em "Lido"); "dispensado" é "não quero mais ser avisado desta Fatura" (a linha sai). Quem já marcou como lido e depois decide dispensar não precisa desmarcar nada. **Não há "dispensar todos os Meses antigos de uma vez"**: é um "Dispensar" por linha (ou desligar o aviso da Conferência, que esconde também o do Mês aberto). Registrado no `deferred-work.md`.
10. **O foco depois de dispensar.** A linha some, então o foco vai para o **primeiro controle da linha seguinte** (o toque para abrir, ou o primeiro botão se não houver link), ou da anterior se era a última; sem nenhuma outra, o estado vazio ocupa o lugar da lista e não há onde cair (nada quebra). Recusa do banco: o foco fica onde estava e o toast de erro aparece. (O "Marcar como lido" continua levando o foco ao "Marcar como lido" do próximo não lido, como na 8.1.) Implementação: `focoPendente` ganhou `{ chave, alvo: "marcar" | "linha" }` e cada `<li>` tem `data-linha`.
11. **Layout e alvos: a mesma linha, duas ações.** A linha da Conferência tem, nesta ordem de tabulação, o toque para abrir, "Marcar como lido" (só se não lida) e "Dispensar". **Alvos de 44 pt** nos três (`min-h-toque`), o nome acessível de cada botão traz o texto do aviso ("Marcar como lido: …", "Dispensar: …"; o rótulo visível está dentro do nome). **A quebra de linha:** a `<li>` já é `flex-wrap`; o texto da Conferência ganhou `basis-72` (18 rem) e o grupo de botões `flex-wrap gap-2`, então quando o espaço não dá para o texto e os dois botões (o iPad em pé, 834 pt, com o menu lateral e o texto de duas ou três frases), **os botões descem para a linha de baixo** em vez de espremer o texto. A linha dos outros tipos não mudou. **Não verificado numa tela real** (`deferred-work.md`).
12. **Dispensar e a reimportação.** A reimportação zera `alerta_dispensado_em` (migração da 3.12), então o aviso volta, como já volta a faixa. É o comportamento certo (a Fatura é outra); só registrado e testado.
13. **Custo que ficou mais visível: `updated_at`.** O gatilho de `updated_at` da Fatura também roda ao dispensar (e no "Desfazer"), e a chave do aviso do Revisar usa o dia do maior `faturas.updated_at` (decisão 4 da 8.2). Se o Rafael já leu o aviso do Revisar e dispensa uma Conferência **num dia diferente do da última importação**, o aviso do Revisar volta como "Novo" uma vez, com o mesmo número. Com a Central, os dois avisos estão na mesma lista, então isso é mais fácil de ver do que era com a faixa. A saída exata é a coluna "importada em" (migração e RPC, **fora do escopo**); a saída barata é desligar o aviso do Revisar. No `deferred-work.md` e na PR.
14. **Textos.** O grupo de interruptores passou de "Lembretes" a **"Avisos"** (tem quatro, dois deles não são lembretes; as chaves de `mensagens.ts` não mudaram). A ajuda: "Aparecem na Central de Avisos (menu Avisos). Desligado, o aviso não aparece, não conta no menu e não entra em “Marcar tudo como lido”. Só o fechamento da fatura e o atraso também chegam como notificação do aparelho." (verdadeira para os quatro: não promete notificação do que não notifica). "Notificações neste aparelho" diz agora "O fechamento da fatura e o atraso chegam como aviso do aparelho, mesmo com o app fechado. A Conferência e o Revisar só aparecem dentro do app. Cada aparelho se ativa sozinho." Rótulos novos: "Quando a Conferência de uma fatura tem diferença" e "Quando há lançamentos para revisar" (`TEXTOS_AVISOS`).
15. **Ordem dos interruptores:** os dois lembretes (como na 7.4) e depois os dois avisos novos (a Central os mostra na ordem inversa: Conferência, Revisar, fechamento, atraso). Mantive a ordem antiga para não mexer onde o Rafael já aprendeu; é a única inconsistência e é de uma linha.
16. **Notificação do sistema: continua fora.** `notificar-lembretes.ts`, `lembretesParaNotificar`, `lembretes_enviados` (o `check` de `tipo` só aceita `fechamento` e `atraso`) e o service worker **não mudam** (nenhum arquivo deles foi tocado).
17. **`database.types.ts` editado à mão**, na ordem do gerador (`aparencia`, `aviso_conferencia`, `aviso_revisar`, `created_at`, …) em Row, Insert e Update: **esta máquina não tem Docker**, então não rodei o gerador. O job `supabase` do CI confere a igualdade com o gerado.
18. **O toast de "Dispensar" existe duas vezes** (`Painel.tsx` e `Avisos.tsx`): copiei as ~15 linhas em vez de extrair um hook que mexesse no Painel (uma tela grande, sem relação com esta história). O texto vem da mesma constante e a gravação é a mesma do repositório. No `deferred-work.md`.
19. **Acessibilidade: igual à 8.1 e à 8.2.** O resumo continua em `role="status"`, o anúncio de "Marcar tudo", o foco depois de marcar (decisão 10 para dispensar), estado sempre em texto, `aria-label` com o texto do aviso. **VoiceOver não verificado** (o nome do botão repete as duas ou três frases da Conferência).
20. **Fora do escopo, anotado.** Notificação do sistema dos dois tipos; dispensar o Revisar; dispensar por dias; limpar `avisos_lidos`; "importada em"; as pendências de iPad e VoiceOver; "dispensar todos".

## I/O & Edge-Case Matrix

Hoje 19/11/26. Nov/26 com R$ 1.000,00 lidos e R$ 280,00 gravados no cartão 8673 (diferença de R$ 720,00); fila com 17 itens; 4 Blocos atrasados, salvo se disser outra coisa.

| Cenário | Entrada | Saída |
|---|---|---|
| Tudo ligado (o padrão, e a coluna ausente) | `configuracoes` sem as colunas, ou as duas `true` | como na 8.2: Conferência, Revisar e os atrasos |
| Conferência desligada | `aviso_conferencia = false` | sem o aviso da Fatura na lista, no resumo e no menu; "Marcar tudo" sem a chave dele; o Revisar e os atrasos ficam |
| Revisar desligado | `aviso_revisar = false` | sem o aviso da fila; o item Revisar do menu segue com "17 para revisar" |
| Os dois desligados | os dois `false` | só os lembretes; sem lembretes, "Nenhum aviso" |
| Lembrete desligado + aviso | `lembrete_atraso = false`, `aviso_revisar = false` | as colunas são independentes: só a Conferência (e o fechamento, se houvesse) |
| Desligar e ligar de novo | lido, desliga, liga | a linha some e volta como "Lido" (a linha de `avisos_lidos` fica) |
| Diferença que mudou no meio | desligado, entra um Lançamento, liga | outra chave: volta como "Novo" |
| Coluna nula | `aviso_* = null` (só no cliente; o banco recusa nulo) | ligado |
| Banco antes do `db push` | linha sem as colunas | tudo ligado; ligar/desligar um interruptor novo: "Não foi possível salvar" e o interruptor volta |
| Dispensar uma Conferência | toque em "Dispensar" | `dispensarAlerta(faturaId)`, a linha some, toast "Alerta dispensado" com "Desfazer"; `avisos_lidos` intacto |
| Desfazer | toque em "Desfazer" | `desfazerDispensa(faturaId)`, a linha volta |
| Dispensar uma linha lida | Conferência em "Lido" | o botão existe; a linha some; a linha de `avisos_lidos` continua |
| Dispensar pelo Painel | faixa dispensada | o aviso some da Central (a mesma coluna); o "Desfazer" o traz de volta |
| Reimportação | `alerta_dispensado_em` zerado | o aviso volta |
| Recusa / sem conexão | banco recusa ou offline | toast "Não foi possível salvar" / o aviso próprio, a linha continua, sem "Desfazer", o foco fica |
| Dois Meses com diferença | Nov e Out | "Dispensar" em um deixa o outro |
| Foco | dispensa a 1ª / a última / a única | primeiro controle da linha seguinte / da anterior / o estado vazio |
| Quem tem "Dispensar" | Conferência, Revisar, fechamento, atraso | só a Conferência |
| Alvos | linha da Conferência | toque, "Marcar como lido" e "Dispensar" com `min-h-toque`, nessa ordem; os botões podem descer de linha |
| Cron | qualquer combinação dos quatro interruptores | os mesmos lembretes e as mesmas notificações (não lê as colunas novas) |
| Mesma entrada, mesma saída | origens, lidos e faturas embaralhados | resultado igual; entrada intacta |

## Code Map

- Migração: `supabase/migrations/20261204120000_avisos_preferencias.sql` (duas colunas, comentários). Tipos: `src/data/database.types.ts` (à mão). Backup: `test/backup/dados-exemplo.sql` (Conferência ligada, Revisar desligado).
- Núcleo: `src/domain/avisos-preferencias.ts` (novo: `PreferenciasDeAvisos`, `preferenciasDeAvisos`, `avisosDeTrabalho`, `TIPOS_DE_AVISO_COM_INTERRUPTOR`), `src/domain/avisos-conferencia.ts` (`faturaId`), `src/domain/mensagens.ts` (`TEXTOS_AVISOS.preferencia_conferencia/preferencia_revisar/dispensar/alerta_dispensado`, a ajuda do grupo e a de "Notificações neste aparelho").
- Dados: `src/data/configuracoes-repo.ts` (`definirAviso`, as duas colunas em `MudancaConfiguracoes`).
- Interface: `src/features/configuracoes/SecaoAparencia.tsx` (os quatro interruptores, grupo "Avisos"), `src/features/avisos/use-central-de-avisos.ts` (chama `avisosDeTrabalho`), `src/features/avisos/Avisos.tsx` ("Dispensar", o foco, o layout da linha).
- Sem mudança: `src/server/*` (o Cron), `lembretes.ts`, `lembretesParaNotificar`, `lembretes_enviados`, o service worker, `conferencia.ts`, `revisar.ts`, o Painel, `MenuLateral.tsx`, `avisos-repo.ts`, `faturas-repo.ts`.
- Provas: `src/domain/avisos-preferencias.test.ts` (novo, 18), `avisos-conferencia.test.ts` (+`faturaId`), `src/data/configuracoes-repo.test.ts` (+3), `SecaoAparencia.test.tsx` (+7 e a ajuda), `Avisos.test.tsx` (+25), `MenuComAvisos.test.tsx` (+4), `test/integracao/configuracoes.test.ts` (+2, rodam no CI). Nenhum teste fala com a rede.
- Docs: `epics.md` (8.3 com os critérios), PRD (FR-55), EXPERIENCE.md (linhas "Avisos", "Lembretes" e "Menu lateral"), `docs/infraestrutura.md` (seção da 8.3), `deferred-work.md`, `sprint-status.yaml` (8.3 em `review`, `epic-8` em `in-progress`).

## Tasks & Acceptance

- [x] Migração, `database.types.ts` (à mão) e o backup de exemplo.
- [x] Núcleo: `avisos-preferencias.ts`, `faturaId` na Conferência, os textos.
- [x] Dados e interface: `definirAviso`, os quatro interruptores, o hook com o filtro, "Dispensar" na linha da Conferência (o toast, o foco, o layout).
- [x] Provas: núcleo, repositório, jsdom (Configurações, Central, menu) e integração (as colunas, o padrão, nulo, RLS).
- [x] Docs: `epics.md`, PRD, EXPERIENCE.md, `docs/infraestrutura.md`, `deferred-work.md`, `sprint-status.yaml` (8.3 em `review`).
- [ ] **CI verde na PR:** `verificar`, `supabase` (a migração, o `database.types.ts` igual ao gerado e `test/integracao`) e "Backup gera e restaura".
- [ ] **O Rafael, fora do código (pendente):** (1) pedir o `supabase db push` quando quiser (confira com `--dry-run` que só `20261204120000_avisos_preferencias.sql` está pendente; antes do merge é seguro); (2) abrir a Central e Configurações no iPad e no PC com os dados reais (os dois interruptores, "Dispensar", o toast, o foco, a linha em 834 pt, o contador no outro aparelho).
- [ ] `done` no sprint-status só depois do merge, em PR separada (como a #119 e a #123).

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): passam todos, salvo o `eslint-nucleo` e o `eslint-formatos`, que estouram os 5 s na rodada completa e passam sozinhos (39 testes), como na 8.1 e na 8.2. `npm run build` passou localmente na segunda tentativa (a primeira para no aviso de segurança do `next@16.4.6`, como já registrado; o Next não foi atualizado e `next upgrade` não foi rodado), com `/avisos` e `/configuracoes` compiladas. Os de integração (`test/integracao`) ficam ignorados aqui (precisam do Supabase local) e rodam no CI.
- **Só o CI prova:** o job `supabase` (a migração aplicada num banco local, o `database.types.ts` editado à mão igual ao gerado, `test/integracao/configuracoes.test.ts`: as colunas nascem ligadas, desligar e ligar, nulo recusado, outro dono não vê) e o "Backup gera e restaura" (as duas colunas voltam como estavam).
- **Não verificado:** a Central e Configurações num iPad (834 e 1194 pt) e no PC (o jsdom só prova DOM, nomes, `role`, foco e classes: o `basis-72` e o `flex-wrap` da linha não foram vistos numa tela); o VoiceOver com o nome longo do botão "Dispensar: Fatura de novembro/26 com diferença. …"; as cores em claro e escuro; a Central com os dados reais do Rafael (se os avisos incomodam de fato: decisão 1); o `db push` (não feito); **produção** (nenhum dado de produção foi lido nem alterado).
