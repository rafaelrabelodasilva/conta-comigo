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
- **Pendente antes do primeiro uso real:** trocar a `SUPABASE_SECRET_KEY` (a chave atual apareceu numa conversa com o agente). No Supabase, criar uma chave secreta nova, atualizar a variável na Vercel e apagar a antiga.
- Nas histórias seguintes: `GEMINI_API_KEY`, `GEMINI_MODEL` (2.1), `CRON_SECRET` (5.3), chaves VAPID (7.5)
