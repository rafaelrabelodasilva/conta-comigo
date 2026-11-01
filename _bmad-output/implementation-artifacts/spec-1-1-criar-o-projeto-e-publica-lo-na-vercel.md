---
title: 'História 1.1: Criar o projeto e publicá-lo na Vercel'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'dispatch'
baseline_commit: '41bcfd2eedd4d0b943737b3b0a1a92cb77582bd1'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/infraestrutura.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O repositório `conta-comigo` não tem código de app. Sem projeto, CI e deploy, nenhuma história seguinte chega ao iPad e ao PC.

**Approach:** Criar o app Next.js com a estrutura de camadas da arquitetura, lint do núcleo, Vitest, CI no GitHub Actions, Supabase CLI fixada com config local, utilitário de log seguro e uma página inicial mínima. Configurar as variáveis de Production na Vercel e publicar pela `main`.

## Boundaries & Constraints

**Always:**
- Stack da arquitetura: Node 22 (`engines` e CI), Next.js 16.4.x (16.4.3), React 19, TypeScript 6.x sem `baseUrl`, Tailwind 4, Cache Components desligado, Vitest, Supabase CLI fixada em `devDependencies`.
- `src/domain` só com imports relativos; o lint falha se ele importar `@/`, `src/data|ui|app|features|server`, `next*`, `react*` ou `@supabase/*` (AD-1). Fora do núcleo, `@/*` → `src/*` via `paths`.
- Segredos nunca com `NEXT_PUBLIC_` e nunca em arquivos do repositório (AD-12). `.env*` local fica no `.gitignore`, com `.env.example` só com nomes.
- Variáveis do Supabase só no ambiente **Production** da Vercel; Preview e Development sem elas.
- Utilitário único de log no servidor (`src/server/log.ts`) aceita só evento, código e campos de uma lista permitida; nunca registra texto de Fatura, nomes de Lançamentos nem valores (AD-17).
- Arquivos já existentes (`_bmad/`, `_bmad-output/`, `.claude/`, `docs/`, `README.md`) são preservados.

**Never:**
- Telas reais, login, tokens visuais, shadcn/ui, tabelas ou migrações de negócio (histórias 1.2 em diante).
- Criar projeto Supabase de desenvolvimento ou apontar Previews para produção.
- Alterar o schema pelo painel.

**Decisões do Rafael (2026-11-01):**
- `supabase start` é verificado só no CI: um job do GitHub Actions sobe o Supabase local (Docker do runner). Não há Docker no Mac por enquanto.
- `SUPABASE_SECRET_KEY`: o Rafael cria a chave no painel do Supabase e cola na Vercel (só Production). O agente nunca lê nem grava o valor; só confere que a variável existe.
- Publicação: depois da revisão e do CI verde, o agente faz o merge na `main` e confere o deploy de Production `READY`.
- Tamanho da spec (~1.800 tokens) aceito: a fundação fica inteira numa história.
- Next.js 16.4.3 (exato) em vez de 16.3.x: as versões 16.0.0–16.4.0 têm falha crítica (`npm audit`). Arquitetura, épicos e contexto do épico atualizados para 16.4.x.

</frozen-after-approval>

## Code Map

- `README.md`, `.gitignore` -- existentes; manter o conteúdo e acrescentar (comandos de dev; `.next/`, `.env*.local`, `supabase/.temp/`, etc.).
- `docs/infraestrutura.md` -- ids da Vercel e ref do Supabase; atualizar a seção "A configurar na 1.1" quando concluído.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- chave `1-1-criar-o-projeto-e-publicá-lo-na-vercel`.
- Não há código de app; `create-next-app` recusa diretório com `_bmad/` e `.claude/`, então gera numa pasta temporária e os arquivos são movidos para a raiz.
- Node local é 25.9; o CI e a Vercel usam 22. `supabase` e `docker` não estão instalados (a CLI virá pelo npm).

## Tasks & Acceptance

**Execution:**
- [x] raiz -- gerar com `create-next-app@16.3 --ts --tailwind --app --src-dir --eslint --import-alias "@/*"` em pasta temporária e mover; ajustar `tsconfig.json` (TS 6, sem `baseUrl`), `next.config.ts` (sem `cacheComponents`), `package.json` (`engines.node: 22.x`, scripts `lint`, `typecheck`, `test`, `supabase`) -- base do app.
- [x] `src/domain`, `src/data`, `src/features`, `src/ui`, `src/server`, `supabase/migrations` -- criar com `README.md` curto de propósito -- Structural Seed.
- [x] `eslint.config.mjs` -- regra `no-restricted-imports` em `src/domain/**` -- AD-1.
- [x] `src/domain/exemplo.ts` + `src/domain/exemplo.test.ts`, `vitest.config.ts` -- função pura de exemplo com teste -- Vitest roda.
- [x] `src/server/log.ts` + teste -- log JSON em uma linha com lista permitida de campos; descarta os demais -- AD-17.
- [x] `src/app/page.tsx`, `src/app/layout.tsx` -- página mínima "Conta Comigo" em pt-BR (`lang="pt-BR"`) -- confirmar o deploy.
- [x] `supabase/config.toml` -- `supabase init` via CLI do npm -- banco local.
- [x] `.github/workflows/ci.yml` -- push e PR: Node 22, `npm ci`, lint, typecheck, test; job separado `supabase` com `npx supabase start` (e `stop`) -- CI e prova do banco local.
- [x] `.env.example` -- nomes das três variáveis, sem valores -- documentação.
- [ ] Vercel (MCP) -- criar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` só em Production; pedir ao Rafael que cole `SUPABASE_SECRET_KEY` (Production) e conferir só a existência -- deploy aponta para produção.
- [ ] `docs/infraestrutura.md`, `README.md` -- registrar variáveis configuradas e comandos (`npm run dev`, `npm test`, Supabase local exige Docker) -- documentação.

**Acceptance Criteria:**
- Given o projeto criado, when `npm run lint`, `npm run typecheck` e `npm test` rodam, then todos passam e o Vitest executa o teste do núcleo.
- Given um arquivo em `src/domain` que importa `@supabase/supabase-js`, `next/*` ou `../data/x`, when `npm run lint` roda, then o lint falha.
- Given um evento com `{ valor_centavos, descricao, nome }`, when `log()` é chamado, then esses campos não aparecem na saída.
- Given um push ou PR, when o GitHub Actions roda, then o workflow `ci.yml` executa lint, typecheck e testes.
- Given a `main` atualizada, when a Vercel publica, then o deploy de Production fica `READY` e a página abre; as três variáveis existem só em Production.
- Given o CI, when o job `supabase` roda, then `supabase start` sobe o banco local sem erro.
- Given o código, when se procura `NEXT_PUBLIC_` com `SECRET`, then não há ocorrência.

## Implementation Notes

- Na etapa de implementação não há operações remotas (Vercel, GitHub, push): a tarefa da Vercel e o pedido da chave secreta ao Rafael ficam para o orquestrador, depois da revisão. Também não há `git commit`.
- Implementado: next/eslint-config-next 16.4.3 (exato), react 19.2.8, typescript ~6.0.3, vitest ^5, supabase CLI 2.122.0. `vitest.config.mts` (`.mts` evita aviso do Vite). `eslint-nucleo.test.mts` na raiz prova a regra AD-1 pela API do ESLint. `layout.tsx` tipa `children` à mão (o `LayoutProps` só existe depois do build e quebrava o `tsc` num checkout limpo). `AGENTS.md`/`CLAUDE.md` vêm do `create-next-app` e o `next dev` recria o `AGENTS.md`.
- Verificado localmente: lint, typecheck, 15 testes, `npm run build` e `npm audit --omit=dev` (0). O job `supabase` do CI ainda não rodou (sem Docker local). `package-lock.json` gerado com npm 11 / Node 25; o CI com Node 22 é o primeiro teste do `npm ci`.
- Pendentes para depois da revisão: tarefa da Vercel e a parte das variáveis em `docs/infraestrutura.md`.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Lint AD-1 não pega `./../data`, `import()` dinâmico, `require`, arquivos `.mts/.cts`, `@next/*` | medium | edge-case-hunter rodou o ESLint e confirmou cada caso | patch |
| 2 | Testes do lint não cobrem `app`/`features`/`server`, `src/…` nem os novos casos | medium | `eslint-nucleo.test.mts` só usa `../data` e `../ui`; apagar o 3º regex mantém tudo verde | patch |
| 3 | Lint bloqueia subpasta `src/domain/<sub>/` importando `../data` (falso positivo) | low | Confirmado, mas nomes de subpasta do núcleo (dinheiro, ciclo…) não colidem; corrigir exige resolver caminho | rejeitado |
| 4 | Núcleo sem restrição a `fetch`, `Date.now`, `window`, `node:*` | medium | AD-1 proíbe, mas a intenção congelada limita o lint a imports | defer |
| 5 | `log.ts`: campos de texto permitidos (`rota`, `request_id`…) aceitam texto livre/query string | medium | `valorSeguro` só corta em 120; `rota: "/x?nome=Maria"` passa | patch |
| 6 | `log.ts`: `nivel` não validado em tempo de execução | low | `nivel: opcoes.nivel ?? "info"` copia qualquer string | patch |
| 7 | `OpcoesLog.campos` com `& Record<string, unknown>` deixa campos proibidos compilarem | medium | `campos: { valor_centavos: 1 }` passa no `tsc`, só some em runtime | patch |
| 8 | Testes do log sem caso `warn` nem corte de 120 | medium | Remover `.slice` ou o ramo `warn` mantém 15 testes verdes | patch |
| 9 | `log(…, null)` lança TypeError | low | Só com chamador sem tipos; improvável | rejeitado |
| 10 | `src/server` sem guarda `server-only` | medium | Nada impede componente cliente de importar `src/server`; exige nova dependência | defer |
| 11 | CI não roda `npm run build` nem checa `NEXT_PUBLIC_…SECRET` | medium | `ci.yml` só tem lint/typecheck/test; quebra de build só apareceria na Vercel | patch |
| 12 | CI roda duas vezes por PR (push sem filtro) e job `supabase` sem `timeout-minutes` | low | `on: push:` sem `branches`; concorrência por `github.ref` difere | patch |
| 13 | Job `supabase` sobe todos os serviços; usa `npx` em vez de `npm run` | low | Funciona; ganho só de velocidade | rejeitado |
| 14 | Node local não fixado (sem `.nvmrc`) | low | Node local 25.9; correção é um arquivo | patch |
| 15 | `config.toml` com `enable_signup = true` contraria "cadastro público desligado" | medium | Padrão do `supabase init`; login é escopo da 1.2 | defer |
| 16 | `config.toml`: seed `./seed.sql` inexistente e `pgdelta` experimental ligado | low | Padrões do `supabase init` 2.122; o job do CI dirá se atrapalha | rejeitado |
| 17 | Spec ainda cita `create-next-app@16.3`, `vitest.config.ts`, `.env*.local` | low | A correção é editar a spec | rejeitado |
| 18 | `sprint-status` (`in-progress`) diverge da spec (`in-review`); `docs/infraestrutura.md` ainda "a configurar" | false | Sincronizados no passo de apresentação e depois da Vercel, previstos no fluxo | rejeitado |
| 19 | `AGENTS.md` sem as regras do projeto | medium | Agentes futuros leem só o bloco do Next | defer (arquivo de contexto de agente) |
| 20 | `somarCentavos` não checa soma fora do intervalo seguro; mensagem errada para inteiro inseguro | low | `2**60` diz "valor não inteiro"; é o exemplo que será copiado | patch |
| 21 | `globalIgnores` sem `coverage/`, `.vercel/`; Vitest não inclui `src/**/*.test.mts` | low | Lint pegaria arquivos gerados; teste `.mts` em `src` não rodaria | patch |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: tudo verde.
- `npm run build` -- expected: build do Next.js conclui.
- `npx supabase --version` -- expected: versão fixada no `package.json`.

**Manual checks (if no CLI):**
- Vercel: variáveis só em Production; último deploy de Production `READY`.
- GitHub Actions: workflow `CI` verde, incluindo o job `supabase` (banco local sobe).
