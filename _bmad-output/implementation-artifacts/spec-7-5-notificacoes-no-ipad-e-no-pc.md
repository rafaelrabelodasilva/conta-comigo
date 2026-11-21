---
title: 'História 7.5: Notificações no iPad e no PC'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'b0ac5e4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-configurar-o-ciclo-do-cartao-e-a-aparencia.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-instalar-como-app-e-usar-sem-internet-so-para-consulta.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-4-lembretes-dentro-do-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a faixa da 7.4 só ajuda quem abre o app. Rafael quer ser avisado sozinho (FR-55) de duas coisas: a fatura que fechou (importar o PDF) e o Bloco de cobrança com itens atrasados, no iPad e no PC, mesmo com o app fechado.

**Approach:** Web Push (VAPID). O Cron diário (`GET /api/cron/diario`), **depois** de materializar as Contas manuais, calcula os lembretes com as **mesmas funções da faixa** (`lembretesDasLinhas` → `lembretesDoDia`, núcleo), respeita as preferências de `configuracoes`, **insere a chave em `lembretes_enviados` antes de enviar** e só envia se a inserção deu certo, pelo pacote `web-push`, a cada inscrição do dono; a que o serviço de push recusa com 404 ou 410 é apagada. O toque no aviso abre o Painel do Mês ou Recebimentos (`destino` do lembrete). Em Configurações → Aparência → Lembretes, "Ativar notificações" pede a permissão **só no toque**, com o app instalado na tela inicial do iPad (iPadOS 18+) ou no navegador do PC, e guarda a inscrição deste aparelho. **Uma migração** (duas tabelas novas, aditiva). A regra do que notificar mora no núcleo; o servidor só lê, chama e envia.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** quais lembretes saem como aviso, com que chave, a montagem do contexto das linhas cruas e o estado de "Ativar notificações" moram em `src/domain` (só imports relativos; sem Next, React, Supabase, `web-push`, relógio nem DOM). O servidor lê, chama e envia; a tela lê o navegador e chama o núcleo.
- **Uma só verdade (AD-10):** faixa e Cron montam o `ContextoDeLembretes` pela **mesma** função (`lembretesDasLinhas`), com as mesmas linhas e o mesmo `atrasosDasLinhas`. Há um teste que amarra os dois.
- **Segredos só no servidor (AD-12):** `VAPID_PRIVATE_KEY` só é lida em `src/server/push.ts` (`import "server-only"`), nunca com `NEXT_PUBLIC_`. A chave pública é `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (o navegador precisa dela). Nenhuma chave foi gerada, impressa, guardada ou lida de produção.
- **Log só por `src/server/log.ts` (AD-17):** só contagens e códigos (`enviadas`, `ignoradas`, `inscricoes_apagadas`, `falhas`, novos em `CAMPOS_PERMITIDOS`, com teste). **Nunca** endpoint, chave, texto do aviso, nome de Bloco, valor ou dono.
- **Schema só por migração (AD-14); service worker nunca responde gravações (AD-3); dados no navegador só pelo gerenciador (AD-4):** a lista de inscrições não existe na tela, o estado deste aparelho vem do `PushManager`.
- **Textos só em `mensagens.ts`; nenhuma cor literal; alvo de 44 pt; estado sempre em texto; `role="status"` sem roubar o foco.**

**Never:** mudar `estaAtrasado`, `primeiroDiaDeAtraso`, `atrasosDasLinhas`, `projetarPendente`, a tolerância, a Fórmula, Recebimentos, a Conferência ou a Previsão; a dispensa da faixa; outros tipos de lembrete; um Centro de notificações; e-mail, SMS ou WhatsApp; um botão "enviar notificação de teste"; celular (< 700 px) e push no iPhone; ler ou alterar dados de produção; `supabase db push` sem o Rafael pedir; gerar, imprimir ou guardar chave VAPID; usar o e-mail do Rafael como `subject`; atualizar o Next.

## Decisões (registradas, nada implícito)

1. **A regra do que notificar mora no núcleo.** `lembretesParaNotificar(lembretes, jaEnviados)` (em `src/domain/lembretes.ts`) devolve, na ordem da faixa, os lembretes que saem hoje com a chave `{ tipo, referencia, dia }`; `chaveDeNotificacao(lembrete)` dá a chave. A assinatura ficou sem `hoje` (a janela do fechamento já está em `lembretesDoDia`). O servidor só lê, chama e envia.
2. **Fechamento: um evento por fechamento, com recuperação.** Chave `(fechamento, Mês da Fatura, dia do fechamento)`. O prompt recomendava notificar só em `hoje === fechouEm`; escolhi a **chave ser o dia do fechamento** e deixar a janela de 6 dias da faixa (o dia e os 5 seguintes) valer também para o aviso. **Se o Cron falhar no dia, o aviso sai no dia seguinte, sem duplicar** (a chave é única; depois de enviado, os outros dias da janela ficam quietos). O texto diz "fechou", que continua verdadeiro dias depois, e some assim que o Mês tem Fatura importada. Custo: quem ativa as notificações no 3º dia da janela recebe o aviso então.
3. **[REVISTA na PR de correção dos 10 defeitos (defeito 7): a chave de `lembretes_enviados` continua gravada antes do envio, mas é APAGADA quando nenhum aparelho aceitou e o erro foi transitório (rede, 5xx, 429), para o Cron do dia seguinte tentar de novo; ver `spec-correcao-10-defeitos.md`. O texto abaixo é a decisão original.]** **Atraso: um evento quando o atraso começa ou o "desde" muda.** Chave `(atraso, id do Bloco, desde)`, como recomendado. Avisa quando o Bloco passa a ter item atrasado e de novo **só quando o `desde` muda**. **Rafael paga e depois atrasa de novo:** com tudo quitado o lembrete some; o atraso novo vem de outro item, com outro `desde` (o vencimento é de outro Mês), então avisa. **Pagou o mais antigo e outro mais novo segue atrasado:** o `desde` mudou, avisa de novo (custo aceito: um aviso a mais, com o valor e a data certos). **Pagamento desfeito que traz o mesmo atraso de volta:** mesma chave, não avisa (nunca duas vezes). **Só o valor mudar** (Pagamento parcial) não avisa. Não repete todo dia.
4. **Só o que a faixa mostra.** `lembretesParaNotificar` parte de `lembretesParaExibir(...).visiveis`: os de fechamento e os 3 primeiros de atraso. O 4º Bloco em diante só aparece como "E mais N" na faixa (sem nome nem valor) e portanto **não gera aviso** até um dos 3 quitar; aí ele entra e é avisado. É a leitura estrita do critério ("nunca leva valores além do que a faixa mostra"). Custo em `deferred-work.md`.
5. **O que vai no aviso.** `avisoDoLembrete` (`mensagens.ts`): `titulo` = "Conta Comigo", `corpo` = **exatamente** `textoDoLembrete` (o mesmo da faixa), `destino` do lembrete e `tag` `tipo:referencia` (um aviso novo do mesmo lembrete substitui o anterior em vez de empilhar). **Na tela bloqueada do iPad aparece o mesmo texto da faixa**, com o nome do Bloco e o valor ("O Lucas tem R$ 115,16 em atraso desde 17/11/26"). Não encurtei: o critério trata o conteúdo da faixa como o limite, e quem não quer ver o texto bloqueado escolhe "Mostrar pré-visualizações: Quando desbloqueado" no iPad (em `docs/infraestrutura.md`). Um texto mais curto para a tela bloqueada é uma função em `mensagens.ts` (`deferred-work.md`).
6. **Mesmo contexto na faixa e no Cron.** `lembretesDasLinhas(hoje, linhas)` (núcleo) recebe as linhas cruas (`ciclo`, `lancamentos`, `blocos`, `status`, `itens`, `faturas`, `configuracao`) e faz o que `FaixaDeLembretes` fazia à mão (Blocos de cobrança, Status pagos, vencimentos por Fatura, tolerância, preferências). A faixa **passou a usá-la** (comportamento igual, testes da 7.4 intactos) e o Cron usa a mesma. Teste: as mesmas linhas dão os mesmos lembretes que a montagem antiga escrita à mão, em 8 dias e 4 cenários, e todo aviso é um lembrete da faixa com o mesmo texto.
7. **Ler os dados no servidor.** `src/server/notificar-lembretes.ts` lê com a chave de serviço (que ignora o RLS, então **toda leitura filtra `owner_id`**) `lancamentos` de todos os Meses (vivos e excluídos, só as 13 colunas que o núcleo usa; **nunca `nome`, `observacao`, `apelido`**), `pagamento_itens` vivos, `blocos` de cobrança, `status`, `faturas` (Mês e vencimento), `config_ciclo`, `configuracoes` e `lembretes_enviados`, **de cada dono que tem inscrição**, paginado de 1000 em 1000 (`.order("id").range()`). Nenhuma regra nova no SQL. O único texto de negócio lido é o `nome` do Bloco, que é o que o aviso (e a faixa) dizem.
8. **Inserir antes de enviar; sem inscrição não grava.** Para cada aviso novo: `insert` em `lembretes_enviados`; **23505** (a chave existe: outra execução, ou dia anterior) = ignorado, não envia; outro erro ou exceção = falha, não envia. **Sem nenhuma inscrição o Cron nem lê os dados e não insere nada** (senão o aviso do dia ficaria "gasto" e quem ativasse as notificações à tarde nunca o receberia). Se todas as inscrições acabarem (410) no meio, os próximos avisos nem são inseridos. **Custo assumido:** se o envio falhar para todos por erro que não seja 404 ou 410 (rede, 5xx), a linha continua e o aviso não é reenviado ("nunca duas vezes" vale mais que a reentrega; a faixa é o canal). 404 e 410 apagam a inscrição (`delete` por `id`); 401, 403, 5xx e erro de rede só contam falha.
9. **Falha do aviso não derruba o Cron.** A rota roda o aviso depois da materialização (que já gravou), **mesmo que a materialização tenha falhado**, e a resposta continua exatamente a de antes (`{ ok, quantidade }`, 200 ou 500 só pela materialização). Tudo é capturado: `notificarLembretesDoDia` nunca lança (leituras, inserções, envios e deletes em `try`); a rota ainda embrulha em `try`. **O que vai para o log (só código e contagens):** `cron.notificou` (`enviadas`, `ignoradas`, `inscricoes_apagadas`, `falhas`; `warn` se `falhas > 0`), `cron.notificacao_sem_chaves`, `_sem_tabela`, `_leitura_falhou` (`warn`), `_sem_inscricao` (`info`) e `_excecao` (`warn`, sem o texto do erro). **Limite de tempo:** `maxDuration = 60`; cada envio tem limite de 10 s e nenhum aviso novo começa depois de 40 s (o que sobrar, por não ter sido inserido, sai no próximo dia).
10. **Sem as variáveis: o Cron só pula.** `configuracaoVapid()` exige `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`; faltando qualquer uma, o aviso nem lê o banco, loga `cron.notificacao_sem_chaves` (`warn`) e o Cron segue com 200. Previews e CI nunca têm as variáveis (e o Cron só roda em Production).
11. **Compatibilidade entre o merge e o `db push`.** A Vercel publica no merge e o `db push` vem depois. **O Cron não vira 500:** sem `push_inscricoes` a leitura responde PGRST205 (ou 42P01), tratado como `sem_tabela` (log `warn` só com o código, nenhuma outra leitura). O botão "Ativar notificações" pede a permissão, mas ao guardar responde "Não foi possível salvar" e **desfaz a inscrição no navegador**. Nenhuma outra tela toca nas tabelas novas. **Aplicar o `db push` antes do merge é seguro** (tabelas novas, nada existente muda). Ordem recomendada em `docs/infraestrutura.md`: variáveis → `db push` → merge → instalar no iPad.
12. **Service worker (AD-3).** `avisosDoSistema` (texto do `/sw.js`, como `servicoDoCasco`) acrescenta **só dois ouvintes**: `push` (mostra o aviso: título, corpo, ícone `/apple-icon`, `tag` e `data.destino`; **todo push mostra algo**, o Safari revoga a inscrição de quem não mostra, então corpo ilegível ou campo de tipo errado cai no texto padrão de `mensagens.ts`) e `notificationclick` (fecha o aviso, foca uma janela do app e navega ao `destino`, ou abre uma nova se não há janela ou se `navigate` falha). O `destino` só vale se for um caminho do próprio app (começa com `/`, não com `//` nem `/\`); senão vira o Painel. **Não mexe no cache, no `fetch` nem na versão** (o nome do cache já muda a cada deploy). **`pushsubscriptionchange` não é tratado**: o service worker não tem a sessão para gravar a inscrição nova; a inscrição velha é apagada pelo Cron (404/410) e o aparelho volta a "desativado" até um toque (`deferred-work.md`). Testado como o casco: o texto do `/sw.js` rodado num ambiente falso (`service-worker-avisos.test.ts`).
13. **"Ativar notificações" na interface.** Mora no grupo **Lembretes de Configurações → Aparência** (abaixo dos dois interruptores), componente `AtivarNotificacoes`. **Estados em texto** (do núcleo, `estadoDasNotificacoes`): `pode_ativar`, `ativo`, `negada` (com o caminho: "Ajustes → Notificações → Conta Comigo" no iPad, o cadeado no computador), `instalar_primeiro` (iPad/iPhone fora do app instalado: como instalar, sem botão), `sem_suporte`, `sem_chave` (ambiente sem a chave pública: "ainda não configuradas"). Erros por toast (`mensagem(codigo)`, "Não foi possível ativar…", "Sem conexão"), como o resto de Configurações. **"Desativar neste aparelho" existe:** apaga a linha do banco pelo endpoint deste aparelho e só depois cancela a inscrição no navegador (se o banco recusar, nada muda e aparece o erro). Botões de 44 pt (`min-h-toque`), `aria-busy` e "Ativando…" enquanto trabalha, `role="status"` único, sem foco forçado.
14. **A permissão só no toque.** `Notification.requestPermission()` é a **primeira** chamada do manipulador do toque, de forma síncrona e antes de qualquer `await` (o iOS exige o gesto); abrir a tela só **lê** (`ler()`). Teste: o pedido acontece dentro do despacho do clique, e nada é pedido ao abrir. **Sem conexão** nada é tentado (nem a permissão): a faixa da 7.4 segue sendo o canal. **A inscrição só fica no navegador se o banco a guardou:** se `salvar` falha, `cancelar()` desfaz a do navegador (o estado nunca diz "ativado" sem o Cron enxergar o aparelho). A permissão dispensada ("default") deixa tudo como estava, sem erro. Uma chave VAPID trocada (inscrição velha impede a nova) é tratada: cancela a velha e tenta de novo.
15. **Gravar a inscrição: pelo navegador com RLS por dono, sem rota nova.** Escolhi `push_inscricoes` com RLS por dono (select, insert, update, delete só do dono) e o upsert por `endpoint` direto do navegador (`src/data/push-repo.ts`, mesmo padrão dos outros repositórios), em vez de `/api/push/…`. Por quê: nenhuma superfície nova (AD-12 exige sessão em toda rota de `/api`, e o RLS já a exige), nada de servidor a manter, e o upsert por `endpoint` único atualiza o mesmo aparelho. O `endpoint` é tratado como **segredo**: nunca vai para log, toast nem mensagem de erro (testado). Outro dono não lê, não muda, não apaga e não toma o `endpoint` por upsert (RLS, provado no job `supabase`). Sem Realtime: nada na tela depende da tabela.
16. **Chaves VAPID.** Três variáveis, documentadas em `.env.example` (sem valor) e `docs/infraestrutura.md`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (sensitive, só servidor), `VAPID_SUBJECT` (**a URL do app**, `https://conta-comigo-liart.vercel.app`, não o e-mail do Rafael; a pergunta ficou resolvida pelo prompt: "ou use a URL do app"). O comando é `npx web-push generate-vapid-keys` (**quem gera e cadastra é o Rafael, só Production**). A pública é inlinada no build, então precisa de um deploy depois de cadastrada. Trocar as chaves invalida as inscrições (401/403, que o Cron não apaga): "Desativar" e "Ativar" em cada aparelho.
17. **Dependência nova.** `web-push` **3.6.7** (MPL-2.0; ~48 KB; 5 dependências: `asn1.js`, `http_ece`, `https-proxy-agent`, `jws`, `minimist`) e `@types/web-push` **3.6.4** (MIT), versões exatas. A 4.0.0 saiu em 06/11/2026 (13 dias), então ficou a 3.6.7 (`deferred-work.md`). `serverExternalPackages: ["web-push"]` em `next.config.ts` (pacote só de Node; fora do pacote do Next). O envio fica atrás de uma **porta injetável** (`EnviarPush`, `src/server/push.ts`); nenhum teste fala com a rede nem usa chave VAPID real. O `package-lock.json` foi mantido sem o ruído do npm do Windows (as linhas `libc` foram restauradas).
18. **O banco.** Migração `supabase/migrations/20261202120000_notificacoes_push.sql`: `push_inscricoes` (`endpoint` único e conferido como `https://…` até 2048, `chave_p256dh`, `chave_auth`, `owner_id default auth.uid()`, índice por dono, gatilho `updated_at`, RLS por dono, `revoke all from anon`) e `lembretes_enviados` (`tipo` em `fechamento|atraso`, `referencia` de 1 a 64, `dia date`, **única `(owner_id, tipo, referencia, dia)`**, RLS ligado **sem política e sem privilégio** para `anon` e `authenticated`: só a chave de serviço). A coluna da chave de autenticação se chama `chave_auth` (não `auth`) para não se confundir com o esquema `auth` nas políticas. **O SQL foi mostrado ao Rafael; nada foi aplicado em produção.** `src/data/database.types.ts` foi **editado à mão**, na ordem alfabética do gerador (não há Docker nesta máquina; o job `supabase` do CI confere a igualdade com o gerado). `TabelaRealtime` exclui `lembretes_enviados` (só do Cron, sem `updated_at`).
19. **Sem conexão e service worker antigo.** Gravar a inscrição pede rede (sem conexão, nada é tentado e o toast diz). Um aparelho com o service worker antigo (sem `push`) recebe o `/sw.js` novo na próxima visita (`no-cache`, `updateViaCache: "none"`); até lá, ele ainda não está inscrito, então não há push a perder. A faixa da 7.4 é o canal sem a notificação.

## I/O & Edge-Case Matrix

Hoje (Cron às 09:00 em Brasília). Ciclo: fechamento 28, vencimento 06. Tolerância 10. iPad e PC inscritos. Lucas = Bloco de cobrança.

| Cenário | Entrada | Saída |
|---|---|---|
| Fechamento no dia | 28/10/26, sem Fatura de Nov | 1 aviso, chave `(fechamento, 2026-11, 2026-10-28)`, destino `/?mes=2026-11` |
| Cron falhou no dia | 30/10/26, nada em `lembretes_enviados` | avisa, com a MESMA chave (dia 28/10) |
| Cron falhou e voltou | 31/10 e 01/11 depois de enviado | nada |
| Fora da janela | 27/10; 03/11 | nada |
| Atraso novo | item do Lucas R$ 115,16, 17/11 | 1 aviso `(atraso, b-lucas, 2026-11-17)`, "O Lucas tem R$ 115,16 em atraso desde 17/11/26", `/recebimentos` |
| Atraso que continua | 18/11, 25/11, 20/12 com a chave já gravada | nada |
| Valor mudou | Pagamento parcial de R$ 40,00 | nada |
| Quitou e atrasou de novo | Nov pago; item de Dez, 17/12 | avisa `(atraso, b-lucas, 2026-12-17)` |
| Pagou o mais antigo, outro segue | Nov pago, Dez atrasado, 20/12 | avisa com o `desde` novo |
| Pagamento desfeito | o mesmo atraso volta | nada (mesma chave) |
| Preferência desligada | `lembrete_atraso` falso / `lembrete_fechamento` falso | nada do tipo desligado |
| Dois Blocos | Lucas e Rangel atrasados | 2 avisos, na ordem da faixa |
| 5 Blocos atrasados | Ana…Eva | 3 avisos; o 4º só quando um quitar |
| Sem inscrição | `push_inscricoes` vazia | pula (`sem_inscricao`); **nada** em `lembretes_enviados`; quem ativa à tarde recebe depois |
| Sem as chaves VAPID | variáveis ausentes | pula (`sem_chaves`), 200 |
| Tabela ainda não existe | merge antes do `db push` | pula (`sem_tabela`), 200, nada mais |
| Segunda execução no dia | duas chamadas | a 2ª não insere nem envia |
| Corrida na restrição única | outra execução insere no meio | 23505, `ignoradas`, não envia |
| Inserção falha / lança | erro ≠ 23505 | não envia, `falhas` |
| 404 ou 410 | o iPad recusa | apaga a do iPad, segue com o PC, `inscricoesApagadas` |
| Todas recusam (410) | os dois | apaga as duas; o próximo aviso nem é inserido |
| 500, 401, 403, rede | todos | NÃO apaga; `falhas`; a chave continua |
| Envio lança | nunca deveria | vira falha; o próximo aparelho recebe |
| Materialização falhou | `contas_manuais` com erro | 500 de sempre, sem texto; o aviso do dia ainda sai |
| Sem o segredo do Cron | `Bearer` errado | 401; nada é lido, nem VAPID |
| Mais de 1000 Lançamentos | 2.100 + 1 | 3 páginas, o do Lucas não é cortado |
| Prazo estourado | depois de 40 s | nenhum aviso novo; nada inserido |
| Dois donos | A e B com inscrição | cada um lê e recebe só o dele |
| Servidor = faixa | 4 cenários × 8 dias | `lembretesDasLinhas` = a montagem antiga; todo aviso é da faixa, com o mesmo texto |
| `push` ilegível | sem corpo, JSON quebrado, campos errados | mostra o aviso padrão (todo push mostra algo) |
| `destino` perigoso | `https://outro`, `//x`, `/\x`, `javascript:` | vira o Painel |
| Toque no aviso | app aberto / fechado / `navigate` falha | foca e navega / abre janela / abre janela |
| Estados da tela | PC, ativo, negada, iPad sem instalar, iPad instalado, sem suporte, sem chave | texto de cada um; só `pode_ativar` e `ativo` têm botão |
| Permissão no toque | abrir a tela; tocar | nada ao abrir; `requestPermission` dentro do clique |
| Banco recusa a inscrição | `salvar.falhou` | "Não foi possível salvar" e a inscrição do navegador é cancelada |
| Sem conexão | ativar / desativar | toast; nada é tentado |
| Desativar | banco ok / banco recusa | apaga a linha e cancela / erro e continua ativo |

## Code Map

- Núcleo: `src/domain/lembretes.ts` (`lembretesDasLinhas`, `LinhasParaLembretes`, `lembretesParaNotificar`, `chaveDeNotificacao`, `ChaveDeNotificacao`, `NotificacaoDeLembrete`), `src/domain/notificacoes.ts` (novo: `estadoDasNotificacoes`, `lerInscricaoDePush`, `chaveVapidEmBytes`), `src/domain/mensagens.ts` (`TEXTOS_NOTIFICACOES`, `avisoDoLembrete`, `textoDoEstadoDasNotificacoes`).
- Servidor: `src/server/push.ts` (novo: `configuracaoVapid`, `criarEnviadorWebPush`, `EnviarPush`), `src/server/notificar-lembretes.ts` (novo: `notificarLembretesDoDia`), `src/app/api/cron/diario/route.ts` (o aviso depois da materialização), `src/server/log.ts` (4 campos), `next.config.ts` (`serverExternalPackages`).
- Service worker: `src/app/sw.js/service-worker.ts` (`avisosDoSistema`, `ICONE_DO_AVISO`).
- Interface: `src/features/configuracoes/AtivarNotificacoes.tsx` (novo), `navegador-de-push.ts` (novo, a porta para `Notification`/`PushManager`), `SecaoAparencia.tsx` (o componente no grupo Lembretes), `src/features/lembretes/FaixaDeLembretes.tsx` (usa `lembretesDasLinhas`).
- Dados: `src/data/push-repo.ts` (novo), `src/data/database.types.ts` (as duas tabelas), `src/data/realtime.ts` (`TabelaRealtime` sem `lembretes_enviados`).
- Banco: `supabase/migrations/20261202120000_notificacoes_push.sql`; `test/backup/dados-exemplo.sql` (uma linha de cada tabela).
- Provas: `src/domain/lembretes-notificacao.test.ts` (35, núcleo + o que amarra servidor e faixa), `src/domain/notificacoes.test.ts` (25), `src/server/notificar-lembretes.test.ts` (32, banco e envio falsos), `src/server/push.test.ts` (14), `src/app/api/cron/diario/route.notificacoes.test.ts` (13) e `route.test.ts` (ajustado: VAPID vazio e o log do sucesso), `src/app/sw.js/service-worker-avisos.test.ts` (26), `src/data/push-repo.test.ts` (9), `src/features/configuracoes/navegador-de-push.test.ts` (16), `AtivarNotificacoes.test.tsx` (22), `SecaoAparencia.test.tsx` (+2), `test/banco-falso-de-push.ts` (apoio), `test/integracao/push-lembretes.test.ts` (20, rodam no job `supabase`), `test/integracao/apoio.ts` (a limpeza).
- Docs: `docs/infraestrutura.md` (seção nova, o que muda entre o merge e o `db push`, as variáveis), `.env.example`, `deferred-work.md`, `sprint-status.yaml`.
- Sem: `estaAtrasado`, `primeiroDiaDeAtraso`, `atrasosDasLinhas`, `projecoes.ts`, `recebimentos.ts`, `formula.ts`, Recebimentos, Painel, RPC.

## Tasks & Acceptance

- [x] Núcleo: `lembretesDasLinhas` (extraído da faixa), `lembretesParaNotificar`, `chaveDeNotificacao`, o estado das notificações; textos pelo mapa.
- [x] Migração `20261202120000_notificacoes_push.sql` e `database.types.ts` (**o SQL foi mostrado ao Rafael; nada foi aplicado em produção**).
- [x] Servidor: `push.ts` (porta de envio e VAPID), `notificar-lembretes.ts` (inserir antes de enviar, 404/410, tolerância a falhas), a rota, o log.
- [x] Service worker: `push` e `notificationclick`; o casco intacto.
- [x] Interface: "Ativar notificações" e "Desativar neste aparelho" em Aparência → Lembretes; `push-repo`; a faixa usa a função comum.
- [x] Dependência `web-push` 3.6.7 e `@types/web-push` 3.6.4; `.env.example`; `docs/infraestrutura.md`; `deferred-work.md`; `sprint-status.yaml` (7.5 em `review`).
- [x] Provas: núcleo (a matriz e o teste que amarra servidor e faixa), servidor (banco e envio falsos), service worker, jsdom, `test/integracao`, backup (`dados-exemplo.sql`).
- [x] **CI verde na PR** (`verificar`, `supabase`, "Backup gera e restaura"): o `supabase` prova a migração, o RLS e a restrição única de verdade, e o Cron contra o banco; o backup prova as duas tabelas.
- [ ] **O Rafael, fora do código (pendente: nada disso foi feito até o merge):** gerar as chaves (`npx web-push generate-vapid-keys`), cadastrar as três variáveis na Vercel (só Production), `supabase db push` da migração (quando pedir), instalar o app no iPad e tocar em "Ativar notificações" (e no PC).
- [x] `done` no sprint-status só depois do merge, em PR separada (como a #114). **O Épico 7 acaba com esta história; a retrospectiva (`epic-7-retrospective`) fica como está, para o Rafael pedir.**

## Verification

- `npm run lint` (limpo), `npm run typecheck` (limpo), testes (`node node_modules/vitest/vitest.mjs run`): 4052 passam e 241 ficam ignorados (os de integração, que precisam do Supabase local, rodam no CI); `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos (39 testes). Novos: 192 (núcleo 60, servidor 59, service worker 26, interface e dados 47) mais 2 na seção Aparência e 20 de integração. `npm run build` passou localmente na segunda tentativa (a primeira para no aviso de segurança do `next@16.4.3`, já no `deferred-work.md`; o Next não foi atualizado e `next upgrade` não foi rodado), com a rota `/api/cron/diario` e `/sw.js` compiladas; quem confirma é o job `verificar` do CI.
- **Só o CI prova:** o job `supabase` (a migração aplica; `endpoint` único; o RLS por dono de `push_inscricoes`; `lembretes_enviados` recusa o navegador e o anônimo e aplica a restrição única com 23505; o aviso do Cron contra o banco de verdade, com envio injetado; a igualdade do `database.types.ts` com o gerado) e o "Backup gera e restaura" (as duas tabelas voltam como estavam).
- **Não verificado:** **nenhuma notificação real foi enviada nem recebida**, no iPad nem no PC (o jsdom e os testes do service worker só provam o código); o `web-push` rodando na Vercel (o build local compila a rota, mas só a Vercel a executa); o pedido de permissão e a instalação na tela inicial do iPad; o toque de 44 pt e o VoiceOver do estado e do aviso; o texto na tela bloqueada; o Cron de produção (nenhum dado de produção foi lido nem alterado; as chaves VAPID nem existem ainda); o `db push` (não feito).
