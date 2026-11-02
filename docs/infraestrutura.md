# Infraestrutura do Conta Comigo

Nenhum segredo fica neste arquivo. As chaves ficam só nas variáveis de ambiente da Vercel e nos segredos do GitHub (AD-12).

## Supabase (plano Free)
- Projeto: `conta-comigo` (produção), ref `dpewdzsweowgyyadhjbk`, região `sa-east-1` (São Paulo)
- Organização: rafaelrabelodasilva's Org (a outra vaga Free é do `meu-produto-app-db`)
- Desenvolvimento e testes: Supabase local (`supabase start`) e CI. Não existe projeto de desenvolvimento.

## Vercel (plano Hobby)
- Projeto: `conta-comigo`, id `prj_IkHGS7wYqQNwL0FnujtekgjYO5d1`, ligado a `rafaelrabelodasilva/conta-comigo`
- Framework Next.js, Node 22.x, funções em `gru1` (São Paulo)
- Proteção padrão: os Previews exigem login na Vercel; o domínio de produção é público (o app tem login próprio)
- Previews não recebem as variáveis do Supabase
- Monitoramento de erros: logs da Vercel, sem texto de fatura, nomes de lançamentos nem valores

## Repositório (História 1.1)
- CI: `.github/workflows/ci.yml` em push na `main` e em todo PR, Node 22. Job `verificar` (lint, typecheck, testes, build, checagem de `NEXT_PUBLIC_…SECRET`) e job `supabase` (`npx supabase start`/`stop` no Docker do runner, prova do banco local)
- Supabase CLI fixada em `devDependencies` (`supabase`), usada por `npm run supabase -- <comando>`; config local em `supabase/config.toml`
- Supabase local exige Docker; por enquanto só roda no CI (não há Docker no Mac)
- `.env.example` lista só os nomes das variáveis; `.env*` locais ficam no `.gitignore`
- Log no servidor: `src/server/log.ts` (uma linha JSON, só evento, código e campos da lista permitida)

## Variáveis de ambiente da Vercel
- Configuradas na História 1.1 (2026-11-01), **só em Production**: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (plain), `SUPABASE_SECRET_KEY` (sensitive, cadastrada pelo Rafael). Preview e Development não têm nenhuma.
- **Pendente antes do primeiro uso real:** trocar a senha do usuário do Rafael no Supabase Auth (apareceu numa conversa com o agente na 1.2), pelo próprio "Esqueci a senha" do app, por uma senha forte.
- **Pendente antes do primeiro uso real:** trocar a `SUPABASE_SECRET_KEY` (a chave atual apareceu numa conversa com o agente). No Supabase, criar uma chave secreta nova, atualizar a variável na Vercel e apagar a antiga.
- Nas histórias seguintes: `GEMINI_API_KEY`, `GEMINI_MODEL` (2.1), `CRON_SECRET` (5.3), chaves VAPID (7.5)

## Auth (História 1.2)
- Supabase Auth com e-mail e senha via `@supabase/ssr`. Telas: `/entrar` (com "Esqueci a senha" em `/entrar?modo=esqueci`), `/auth/confirmar` (troca o `code` do link do e-mail) e `/redefinir-senha`. "Sair" encerra só a sessão deste aparelho.
- Sessão renovada em `src/proxy.ts` com `getClaims()`; páginas, Server Actions e rotas conferem a sessão de novo. Sem as variáveis do Supabase, Entrar mostra "Login indisponível neste ambiente".
- O link de redefinição usa PKCE: precisa ser aberto no mesmo navegador em que a senha foi pedida.
- Local (`supabase/config.toml`): `enable_signup = false` em `[auth]`. Em `[auth.email]` fica `true`, porque no Supabase local essa chave liga e desliga o próprio login por e-mail. O teste `test/integracao/auth.test.ts` (job `supabase` do CI) prova que o login funciona e que o cadastro é recusado com `signup_disabled`.
- CI: depois do build, o job `verificar` falha se `.next/static` contiver `SUPABASE_SECRET_KEY` ou `sb_secret_`.

### Passo a passo do Auth em produção (Rafael, no painel, antes do merge)
1. Supabase → projeto `conta-comigo` → **Authentication → Sign In / Providers**: desligar **Allow new users to sign up**. Deixar o provedor **Email** ligado (é ele que permite entrar com e-mail e senha).
2. **Authentication → URL Configuration**: **Site URL** = `https://conta-comigo-liart.vercel.app`; em **Redirect URLs**, adicionar `https://conta-comigo-liart.vercel.app/auth/confirmar`.
3. **Authentication → Users → Add user → Create new user**: o seu e-mail, uma senha que só você sabe e **Auto Confirm User** marcado.
4. Avisar o agente, que confere por SQL que existe 1 usuário confirmado (`select count(*) from auth.users where email_confirmed_at is not null`) e testa que o cadastro é recusado (`signup_disabled`).
5. Depois do deploy: `/` leva para `/entrar`; entrar, "Sair" e o e-mail de "Esqueci a senha" funcionam.
- O e-mail de redefinição usa o SMTP padrão do Supabase (limite baixo de envios por hora), suficiente para um usuário só.
