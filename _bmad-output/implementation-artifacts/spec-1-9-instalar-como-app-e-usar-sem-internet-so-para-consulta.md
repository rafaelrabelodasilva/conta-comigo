---
title: 'História 1.9: Instalar como app e usar sem internet só para consulta'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: 'a5aae07dbecab3dd7e370185521f592398a7a4d2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-primeiro-uso.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Conta Comigo não pode ser instalado na tela inicial do iPad, e quando a internet cai nada avisa: uma gravação falha com "Não foi possível salvar" sem dizer o motivo, e a volta da conexão não relê os dados. No Primeiro uso não há como voltar ao passo anterior.

**Approach:** Manifest, ícones e um único service worker (só o casco). Um detector único `src/data/conexao.ts` alimenta a faixa "Sem conexão", bloqueia toda gravação antes de ela começar (aviso próprio, nada otimista, nada em fila) e, quando a conexão volta, pede ao gerenciador de Realtime para reler tudo. No Primeiro uso entra o botão "Voltar".

## Boundaries & Constraints

**Always:**
- Manifest `src/app/manifest.ts`: nome "Conta Comigo", `start_url: "/"`, `display: "standalone"`, cores do tema tiradas dos tokens do DESIGN.md; `appleWebApp` no `metadata` (título e barra de status). Ícones gerados por código (`next/og`), sem binários no repositório: 180 (Apple), 192 e 512.
- Service worker único servido por `src/app/sw.js/route.ts` (cabeçalhos `Cache-Control: no-cache` e JS). Ele só atende `GET` da mesma origem: `/_next/static/*`, ícones e manifest por cache; navegação vai sempre à rede. Nunca responde nem guarda `POST`/`PATCH`/`DELETE`, chamadas ao Supabase, `/api`, `/auth` nem requisições RSC (dados). O nome do cache muda a cada deploy e o `activate` apaga os antigos. Registrado no layout raiz, só em produção.
- Detector `conexao.ts`: estado inicial por `navigator.onLine`, eventos `online`/`offline`; hook `useConexao()` (`useSyncExternalStore`, `true` no servidor) e `estaOnline()`. Ao voltar, chama `recarregar()` de todos os gerenciadores já criados.
- Faixa `conexao.sem_conexao` (`offline-banner`: fundo `nav`, texto `nav-label`, `role="status"`) no topo do conteúdo dos layouts `(app)` e `primeiro-uso`. Os dados em memória continuam na tela.
- Gravação sem conexão: todos os repositórios checam `estaOnline()` antes de qualquer otimismo ou chamada e devolvem `{ ok: false, codigo: "conexao.gravar_sem_conexao" }`. A falha de gravação passa a levar `codigo` (`salvar.falhou` ou `conexao.gravar_sem_conexao`) e as telas mostram `mensagem(r.codigo)`. `contarUsos` (busca antes de excluir) também avisa.
- Voltar no Primeiro uso: `passoAnterior(passo)` no núcleo (`null` no primeiro). Botão secundário "Voltar" à esquerda de "Pular", não renderizado no passo 1; volta sem gravar e atualiza `?passo=`. Com rascunho, abre a mesma janela "Você digitou algo que não foi salvo."; "Descartar" faz a ação pedida (voltar ou avançar).

- Decisão (Rafael): abrir o app sem internet e sem nada carregado mostra a página `/sem-conexao` (casco, sem dados, guardada pelo service worker no `install` com seus estáticos), com a faixa e "Tentar de novo". Navegação que falha sem rede cai nela.
- Decisão (Rafael): ícone com fundo `nav` (#1F2426), "CC" em branco e um traço verde `accent-line`.

**Never:** cache de dados em IndexedDB ou no service worker; fila de gravação; `experimental.useOffline` (ele repete Server Actions sozinho); Push; mudar o Realtime além de `recarregarTodos`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cai a conexão | evento `offline`, lista já carregada | faixa aparece; lista continua | N/A |
| Gravar sem conexão | renomear/criar/arquivar/Ciclo/Aparência/Concluir offline | toast "Sem conexão. Tente de novo…"; memória sem mudança; nenhuma chamada ao cliente | N/A |
| Volta a conexão | evento `online` | faixa some; `recarregar()` de cada gerenciador | falha de releitura segue a regra atual do gerenciador |
| Banco recusa online | gravação com erro | toast `salvar.falhou` (como hoje) | desfaz o otimismo |
| Voltar | passo 3, sem rascunho | passo 2, `?passo=tipos`, nada gravado | N/A |
| Voltar com rascunho | passo 2, nome digitado | janela; Descartar → passo 1; Voltar para salvar → fica | N/A |

</frozen-after-approval>

## Code Map

- `src/data/gravacao.ts` -- `ResultadoGravacao`, `FALHOU`, `gravarComOtimismo`: lugar da checagem comum; acrescentar `SEM_CONEXAO` e `codigo` na falha.
- `src/data/{responsaveis,tipos,status,configuracoes,ciclo,cadastros}-repo.ts` -- caminhos que chamam `obterCliente()` direto (`criar`, `definir` sem linha, `inserir`, `excluir`, `contarUsos`) também checam.
- `src/data/realtime.ts` -- mapa `gerenciadores`; acrescentar `recarregarTodos()` e ligar ao detector na primeira criação.
- `src/domain/mensagens.ts` -- `conexao.sem_conexao`, `conexao.gravar_sem_conexao` já existem; acrescentar `ROTULOS.voltar` e `tentar_de_novo` se faltar.
- `src/features/configuracoes/Secao*.tsx`, `Linha*.tsx`, `ExcluirCadastro.tsx`, `src/features/primeiro-uso/PassoAPasso.tsx` -- trocar `mensagem("salvar.falhou")` por `mensagem(r.codigo)`.
- `src/domain/primeiro-uso.ts` -- `proximoPasso` é o modelo de `passoAnterior`.
- `src/app/(app)/layout.tsx`, `src/app/primeiro-uso/layout.tsx`, `src/app/layout.tsx` -- faixa e registro do service worker.
- `src/proxy.ts` (`config.matcher`) e `src/data/supabase/sessao.ts` (`ROTAS_PUBLICAS`) -- `sw.js`, `manifest.webmanifest`, `icon*`, `apple-icon*` e `/sem-conexao` não podem redirecionar para Entrar.
- `src/app/globals.css` -- tokens `--nav`, `--accent`, `--background` (fonte das cores do manifest/ícone; teste confere).
- `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, `.../01-metadata/manifest.md`, `app-icons.md` -- convenções do Next 16.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/primeiro-uso.ts` (+ teste) -- `passoAnterior`.
- [x] `src/data/conexao.ts` (+ teste) -- detector, hook, `aoVoltar`.
- [x] `src/data/realtime.ts` (+ teste) -- `recarregarTodos` e ligação ao detector.
- [x] `src/data/gravacao.ts` e repositórios (+ testes) -- bloqueio sem conexão com `codigo`.
- [x] telas de Configurações e `PassoAPasso.tsx` -- mensagem pelo `codigo`; botão Voltar.
- [x] `src/features/conexao/FaixaSemConexao.tsx`, `RegistrarServiceWorker.tsx` (+ teste da faixa) e os layouts.
- [x] `src/app/manifest.ts`, `icon.tsx`/`apple-icon.tsx`, `sw.js/route.ts` (+ testes de manifest e das regras do service worker), `proxy.ts`/`sessao.ts`.
- [x] `src/features/primeiro-uso/PassoAPasso.test.tsx` -- Voltar ausente no passo 1, volta sem gravar, janela com rascunho (Descartar volta, Voltar para salvar fica).

**Acceptance Criteria:**
- Given o build de produção, when se abre `/manifest.webmanifest`, `/sw.js` e os ícones sem sessão, then respondem 200 (sem ir para Entrar).
- Given `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`, then tudo verde.

## Implementation Notes

- `src/data/conexao.ts`: `criarDetectorConexao(alvo)` (testável com janela falsa) + o detector único criado na primeira chamada; `estaOnline()`, `aoVoltar(acao)` e `useConexao()`. `aoVoltar` só roda na transição offline → online.
- Gravação: `gravacao.ts` ganhou `CodigoFalhaGravacao`, `SEM_CONEXAO`, `semConexao(online)` e o parâmetro `online` em `gravarComOtimismo`. Cada repositório aceita `online?: () => boolean` (padrão `estaOnline`, nos testes um falso) e checa no início de cada método público, antes de otimismo, `memoria.linha` ou `obterCliente()`. `contarUsos` agora devolve `{ ok: false, codigo: "carregar.falhou" | "conexao.gravar_sem_conexao" }` e `ExcluirCadastro` mostra `mensagem(contagem.codigo)`. A contagem automática de usos em `SecaoStatus` continua silenciosa na falha.
- `realtime.ts`: `recarregarTodos()`; o primeiro `gerenciador(tabela)` liga `aoVoltar(recarregarTodos)` uma vez. Teste em `realtime-recarregar.test.ts` (cliente e detector simulados).
- Service worker: lógica em `src/app/sw.js/service-worker.ts` (`servicoDoCasco`, sem imports nem `async` dentro; vira texto por `toString()`), servida por `route.ts` (`force-dynamic`, `Cache-Control: no-cache`). Versão do cache = `VERSAO_DEPLOY`, fixada no build por `next.config.ts` (`VERCEL_DEPLOYMENT_ID` ou `build-<timestamp>`). No `install`, guarda `/sem-conexao`, os `/_next/static/*` citados no HTML dela e o manifest (um estático que falhe não derruba a instalação). O teste roda o texto do `/sw.js` num ambiente falso.
- Ícones: `icon.tsx` com `generateImageMetadata` (`/icon/192`, `/icon/512`) e `apple-icon.tsx` (180). Como só `globals.css` pode ter cor literal (`test/sem-cor-literal.test.ts`), `marca.tsx` lê os tokens `nav`, `background`, `accent-line` e `on-dark` do `globals.css` no build (`fs` + `lerTokens`); manifest e ícones são `force-static`.
- `/sem-conexao`: página dinâmica (o layout raiz lê o cookie do tema), sem dados, com `FaixaSemConexao fixa` e `TentarDeNovo` (recarrega a página que falhou; aberta direto, link para `/`).
- `proxy.ts`: o matcher exclui `sw.js`, `icon*` e `apple-icon*` (o manifest já estava fora); `sessao.ts` trata `/sem-conexao`, `/sw.js`, `/manifest.webmanifest`, `/icon` e `/apple-icon` como públicas.
- `appleWebApp` no layout raiz: `capable`, título "Conta Comigo", barra `black`.
- Verificado com `next start`: sem sessão, `/manifest.webmanifest`, `/sw.js`, `/icon/192`, `/icon/512`, `/apple-icon` e `/sem-conexao` respondem 200; `/sw.js` passa em `node --check`. O registro do service worker não pôde ser testado no navegador embutido (erro ao buscar o script, só no registro); fica para a checagem manual.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Telas de Configurações e exclusão sem teste do aviso sem conexão (vg) | medium | Voltar a `"salvar.falhou"` passaria verde; só Aparência e PassoAPasso têm o caso | patch |
| 2 | `src` dos ícones do manifest soltos das rotas reais (vg) | low | `marca.test.ts` só lê as strings do manifest | patch |
| 3 | `RegistrarServiceWorker` e `TentarDeNovo` sem teste (vg, blind) | medium | Nenhum teste os importa | patch |
| 4 | `realtime-recarregar.test.ts` depende da ordem (vg, blind) | low | Mapa e flag do módulo persistem entre testes | patch |
| 5 | Contagem de usos do Status não refaz ao voltar a conexão (vg) | low | Falha silenciosa já existia; reabrir a seção conta de novo | rejeitado |
| 6 | Router troca a URL para `/sem-conexao` e "Tentar de novo" vai para `/` (blind) | false | `create-initial-router-state.js:30` usa `window.location` como URL inicial, não a do payload | rejeitado |
| 7 | Só `navigator.onLine` detecta queda (Wi-Fi sem internet) (blind) | low | Mecanismo fixado na intenção; a gravação então cai em `salvar.falhou`, sem perda | rejeitado |
| 8 | `Promise.all` em `recarregarTodos` sem tratar rejeição (blind) | false | `recarregar` captura as falhas (`reler` com try/catch, `removeChannel` em try) | rejeitado |
| 9 | Fontes em CSS e chunks sob demanda fora do casco (blind) | low | Fonte do sistema (DESIGN.md), página `/sem-conexao` mínima | rejeitado |
| 10 | Ativação apaga o cache da versão anterior com aba aberta (blind, edge) | low | A aba antiga offline já não navega (RSC precisa de rede); dados em memória ficam | rejeitado |
| 11 | Sem desregistro fora de produção (SW de `npm start` atrapalha o `next dev`) (blind) | low | Cache-first de `/_next/static` no mesmo localhost; correção direta | patch |
| 12 | `marca.tsx` lê `globals.css` por `process.cwd()`; `/icon/999` devolve 200 (blind, edge) | low | Manifest e ícones são pré-renderizados no build (`○`/`●` no `next build`); ninguém pede outro id | rejeitado |
| 13 | Sem `themeColor` no viewport; comentário da barra de status (blind) | low | No app instalado vale `appleWebApp.statusBarStyle`; cor exigiria ler o CSS a cada requisição | rejeitado |
| 14 | `Date.now()` no `next.config.ts` fora da Vercel (blind) | low | Só builds locais; na Vercel vale `VERCEL_DEPLOYMENT_ID` | rejeitado |
| 15 | Entrar e Redefinir senha sem faixa (blind) | low | A intenção põe a faixa só nos layouts `(app)` e `primeiro-uso` | rejeitado |
| 16 | Checagem de conexão duas vezes; `PAGINA_SEM_CONEXAO` em `sessao.ts` (blind) | low | Inofensivo; a constante fica junto das outras páginas públicas | rejeitado |
| 17 | Testes da faixa deixam ouvintes na janela (blind) | low | Cada teste lê o próprio detector; todos verdes | rejeitado |
| 18 | `caches.open`/`match` rejeitado derruba estáticos mesmo online (edge) | low | `respondWith` com promessa rejeitada; correção direta com `.catch(fetch)` | patch |
| 19 | Regex de ícone aceita `/iconografia` (edge) | low | Não existe rota assim | rejeitado |
| 20 | Valor igual offline mostra "Sem conexão" (edge) | low | Escolher o mesmo valor não dispara mudança nos controles | rejeitado |
| 21 | `process.cwd()` diferente da raiz quebra o build (edge) | low | Vercel e CI constroem na raiz | rejeitado |

## Verification

**Commands:**
- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` -- expected: verde.

**Manual checks (if no CLI):**
- `npm run build && npm start`, DevTools offline: faixa aparece, renomear avisa e não muda, ao voltar a faixa some e os dados são relidos. No iPad, depois do deploy: "Adicionar à Tela de Início" abre em tela cheia com nome e ícone.
