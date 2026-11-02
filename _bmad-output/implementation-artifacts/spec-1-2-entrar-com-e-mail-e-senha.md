---
title: 'História 1.2: Entrar com e-mail e senha'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'dispatch'
baseline_commit: 'abf4decd6e1249d098d2b979c75660cc719d910a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/infraestrutura.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hoje o app abre para qualquer pessoa. Antes de existir qualquer tela com dados, só o Rafael pode entrar (FR-34, AD-5).

**Approach:** Supabase Auth com e-mail e senha via `@supabase/ssr`: tela Entrar, "Esqueci a senha", sessão renovada em `src/proxy.ts` com `getClaims()`, "Sair", e as páginas protegidas redirecionam para Entrar. Fazem parte da história dois itens adiados da 1.1: `enable_signup = false` no `supabase/config.toml` e a guarda `server-only` em `src/server`.

## Boundaries & Constraints

**Always:**
- Login e logout por Server Actions. Cada action e cada rota checa a sessão por conta própria, sem depender só do proxy.
- Cliente Supabase criado dentro de cada requisição, nunca no escopo do módulo (Fluid compute).
- Navegador: só `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` não é usada nesta história e nunca entra no bundle do cliente.
- Textos para o usuário vêm do mapa único `codigo → mensagem` (`src/domain/mensagens.ts`, criado aqui e estendido pela 1.3). Erro de login não diz qual campo errou.
- "Esqueci a senha" sempre mostra a mesma confirmação, exista ou não o e-mail.
- Sem as variáveis do Supabase (Previews, CI), o app não quebra: as páginas protegidas levam para Entrar, e Entrar mostra "login indisponível neste ambiente".
- O log do servidor (`log.ts`) registra só códigos, nunca o e-mail.

**Never:**
- Cadastro público, login social ou magic link.
- Tokens visuais e shadcn (1.3), Primeiro uso (1.8), tabelas ou migrações.
- Uso de `getSession()` no servidor para decidir acesso.

**Decisões do Rafael (2026-11-02):**
- A redefinição de senha funciona de ponta a ponta: `/auth/confirmar` (troca o `code`) e `/redefinir-senha` (nova senha + confirmação).
- O Auth de produção é configurado pelo Rafael no painel do Supabase, antes do merge, seguindo um passo a passo do agente: desligar "Allow new users to sign up", Site URL `https://conta-comigo-liart.vercel.app`, Redirect URL `https://conta-comigo-liart.vercel.app/auth/confirmar`, e criar o próprio usuário (Add user, Auto Confirm) com a senha que só ele sabe. O agente confere por SQL que existe 1 usuário confirmado e testa que o cadastro está recusado.
- Tamanho da spec (~2.300 tokens) aceito: um objetivo só, entrar com segurança.

## I/O & Edge-Case Matrix

| Cenário | Entrada / estado | Resultado |
|---|---|---|
| Sem sessão | GET `/` | Redireciona para `/entrar` |
| Sessão expirada | Cookie `sb-*` presente, mas `getClaims()` não devolve claims | `/entrar?motivo=expirou` mostra "Sua sessão expirou. Entre de novo" |
| Credenciais certas | e-mail e senha válidos | Vai para `/`, onde aparece "Sair" |
| Credenciais erradas | `invalid_credentials` | "E-mail ou senha incorretos." |
| Muitas tentativas | erro 429 / `over_request_rate_limit` | Mensagem de "espere e tente de novo" |
| Campos vazios | e-mail ou senha em branco | Mensagem do mapa, sem chamar o Supabase |
| Já logado | GET `/entrar` | Redireciona para `/` |
| Esqueci a senha | e-mail qualquer | Confirmação neutra |
| Link de redefinição | `/auth/confirmar?code=…` válido | Sessão de recuperação, depois `/redefinir-senha` |
| Link inválido ou expirado | `code` ruim | `/entrar` com mensagem "link expirou" |
| Sair | POST da action | `signOut({ scope: 'local' })`, depois `/entrar` |

</frozen-after-approval>

## Code Map

- `src/app/page.tsx`, `src/app/layout.tsx` -- página placeholder da 1.1. A página passa a exigir sessão e ganha o botão "Sair". O layout fica igual.
- `src/server/log.ts` (+ teste) -- acrescentar `import "server-only"`. Reusar `log()` para registrar `auth.*` só com código.
- `vitest.config.mts` -- `server-only` lança erro fora do bundler do Next. Criar um alias para um módulo vazio (`test/server-only-vazio.ts`).
- `eslint.config.mjs` -- a regra AD-1 segue valendo para `src/domain/mensagens.ts`, que precisa ser puro.
- `supabase/config.toml` -- linhas 177 e 222 com `enable_signup = true`; `site_url` (160) e `additional_redirect_urls` (164) apontam para `127.0.0.1:3000`.
- `.github/workflows/ci.yml` -- job `verificar` (grep de `NEXT_PUBLIC_…SECRET`, build sem env) e job `supabase` (sobe o banco local).
- `.env.example`, `docs/infraestrutura.md`, `README.md` -- documentação.
- Next 16.4 (`node_modules/next/dist/docs/01-app/`): `src/proxy.ts` exporta `proxy(request)` e `config.matcher`, roda sempre em Node. `cookies()` é async e só grava em Server Action e Route Handler. `searchParams` é uma Promise. `redirect()` fica fora de `try`. `useActionState` vem de `react`.
- Os pacotes `@supabase/ssr`, `@supabase/supabase-js` e `server-only` ainda não estão instalados.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- adicionar `@supabase/supabase-js` (≥2.118), `@supabase/ssr` e `server-only` -- dependências.
- [x] `src/domain/mensagens.ts` + teste -- mapa `codigo → mensagem` com os códigos `auth.*` e uma função `mensagem(codigo)` com fallback -- AD de erros.
- [x] `src/data/supabase/config.ts` -- lê as duas variáveis públicas e devolve `null` se faltar alguma -- Previews e CI.
- [x] `src/data/supabase/servidor.ts` (server-only), `src/data/supabase/navegador.ts` -- `createServerClient` com `cookies()` (o `setAll` em try/catch e headers de cache) e `createBrowserClient` -- clientes.
- [x] `src/data/supabase/sessao.ts` + teste -- funções puras `decidirAcesso({ caminho, autenticado, tinhaCookieAuth })` e `destinoSeguro(next)`, testadas com a matriz acima -- regras do proxy.
- [x] `src/proxy.ts` -- renova a sessão com `getClaims()`, aplica `decidirAcesso`, copia os cookies no redirect e usa um matcher que exclui estáticos -- AD-5.
- [x] `src/features/entrar/acoes.ts` -- Server Actions `entrar`, `pedirRedefinicao`, `redefinirSenha` e `sair`, que traduzem `error.code` em códigos do mapa -- fluxo.
- [x] `src/features/entrar/FormularioEntrar.tsx`, `FormularioEsqueci.tsx`, `FormularioNovaSenha.tsx` -- Client Components com `useActionState`, rótulos e `autocomplete` -- UI simples, sem tokens.
- [x] `src/app/entrar/page.tsx`, `src/app/redefinir-senha/page.tsx`, `src/app/auth/confirmar/route.ts` -- páginas e `exchangeCodeForSession` -- rotas.
- [x] `src/server/log.ts`, `vitest.config.mts` -- guarda `server-only` e alias de teste -- item adiado.
- [x] `supabase/config.toml` -- `enable_signup = false` em `[auth]` (`[auth.email] enable_signup` fica `true`; motivo nas Implementation Notes) e `additional_redirect_urls` com `/auth/confirmar` -- item adiado.
- [x] `test/integracao/auth.test.ts` + `ci.yml` -- no job `supabase`, exportar as chaves de `supabase status -o env`; o teste cria um usuário pela admin API local, prova que `signInWithPassword` funciona e que `signUp` falha com `signup_disabled`. Fica de fora do `npm test` local quando não há banco -- prova do cadastro desligado.
- [x] `ci.yml` (job `verificar`) -- depois do build, falhar se `.next/static` contiver `SUPABASE_SECRET_KEY` ou `sb_secret_` -- AD-12.
- [x] `.env.example`, `docs/infraestrutura.md`, `README.md` -- passos de Auth em produção e uso local -- documentação.

**Acceptance Criteria:**
- Given o app publicado com o usuário do Rafael criado, when ele entra com as credenciais certas, then vê `/` com "Sair"; e "Sair" o leva de volta a `/entrar`.
- Given qualquer página protegida, when a requisição passa pelo proxy, then `getClaims()` é chamado e os cookies renovados voltam na resposta.
- Given o Supabase local no CI, when o teste de integração roda, then o login funciona e `signUp` é recusado.
- Given o build, when se procura o segredo nos arquivos do cliente, then não há ocorrência.
- Given um Client Component que importa `src/server/log.ts`, when `next build` roda, then o build falha.

## Implementation Notes

- `[auth.email] enable_signup` ficou `true`: na Supabase CLI essa chave vira `GOTRUE_EXTERNAL_EMAIL_ENABLED`, e `false` desliga também o login por e-mail ("Email logins are disabled"). O cadastro fica recusado pelo `enable_signup = false` de `[auth]`, provado pelo teste de integração.
- `criarClienteServidor()` chama `cookies()` antes de ler as variáveis, para `/` e `/redefinir-senha` não virarem páginas estáticas num build sem Supabase.
- "Esqueci a senha" é `/entrar?modo=esqueci`. O proxy guarda a página pedida em `next` (validada por `destinoSeguro`).

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Varredura de segredo no bundle roda num build sem segredo; só pegaria o nome literal | medium | `verificar` builda sem env; um valor vazado nunca apareceria (blind, edge, verification-gap) | patch |
| 2 | Critério "Client Component importando `log.ts` quebra o build" sem prova automatizada | medium | Vitest troca `server-only` por módulo vazio; nenhum build com violação no CI (verificado à mão na implementação) | defer |
| 3 | `src/proxy.ts` sem teste (cookies no redirect, cache, sem config, exceção) | medium | Nenhum teste importa o proxy; remover a cópia de cookies mantém tudo verde | patch |
| 4 | `redefinirSenha` sem teste | medium | `acoes.test.ts` não importa a action; tirar a guarda de sessão mantém tudo verde | patch |
| 5 | `/redefinir-senha` sem sessão: proxy manda para `/entrar?next=/redefinir-senha` (login normal cai no formulário de nova senha); página e action usam motivos diferentes | low | `decidirAcesso` grava `next`; página usa `link_expirou`, action usa `expirou` | patch |
| 6 | Sessão de recuperação é sessão completa; qualquer sessão troca a senha sem a atual | low | Real, mas exige acesso ao aparelho já logado (que já vê tudo); checar `amr` é guarda nova e incerta | rejeitado |
| 7 | Erros do `updateUser` mapeados como login (`validation_failed` → "E-mail ou senha incorretos.") | low | `codigoDoErroAuth` é o mesmo para login e nova senha; senha > 72 caracteres cai nisso | patch |
| 8 | `reauthentication_needed` sem mapeamento | low | Só com "secure password change" ligado (desligado) | rejeitado |
| 9 | Origem do link vem de cabeçalhos (`Origin: null`, vários hosts, Preview fora da lista) | low | Server Action do mesmo site sempre manda `Origin` real; Previews não têm Supabase e param antes | rejeitado |
| 10 | `/auth/confirmar` ignora `error_code` do Supabase no log | low | Log grava `sem_code` e perde o motivo; correção direta | patch |
| 11 | Link com `token_hash` tratado como expirado | false | O modelo padrão do e-mail usa PKCE (`code`); o template não é alterado | rejeitado |
| 12 | Senha errada apaga o e-mail digitado | low | React 19 reinicia o formulário não controlado depois da action | patch |
| 13 | Política de senha não mostrada nem configurada | low | Mínimo padrão do Supabase; mensagem genérica funciona | rejeitado |
| 14 | README sem o fluxo local de redefinição (Inbucket, URLs aceitas) | low | Correção direta de documentação | patch |
| 15 | Log mistura código do Supabase e código do mapa | low | Sem dano nomeado; os dois são identificadores seguros | rejeitado |
| 16 | `sprint-status` (`in-progress`) diverge da spec (`in-review`) | false | Sincronizado no passo de apresentação | rejeitado |
| 17 | Teste de integração ignora erro do `setSession` | low | Falha apareceria depois, confusa; correção direta | patch |
| 18 | Senha só com espaços chega ao Supabase | low | Só o e-mail passa por `trim()`; a matriz diz "em branco" sem chamar o Supabase | patch |
| 19 | `next` perde a query string | low | Ainda não há páginas com query; exige parâmetro novo | rejeitado |
| 20 | Logado em `/entrar?next=…` ignora o `next` | low | O proxy já redireciona antes da página | rejeitado |
| 21 | `setAll` do servidor ignora cabeçalhos de cache | low | Respostas de Server Action e `/auth/confirmar` são dinâmicas e sem `s-maxage`; a Vercel não as guarda | rejeitado |
| 22 | Valores de `motivo` (proxy/rota → página) sem teste de ligação | low | `MOTIVOS` só vive na página; renomear quebra a mensagem sem falhar teste | patch |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `npm run build` -- expected: conclui sem as variáveis do Supabase.

**Manual checks (if no CLI):**
- CI verde, inclusive o teste de integração no job `supabase`.
- Produção: `/` redireciona para `/entrar`; login, "Sair" e e-mail de redefinição funcionam (feito pelo Rafael).
