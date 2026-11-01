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

## A configurar na História 1.1
- Variáveis de Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- Depois, nas histórias seguintes: `GEMINI_API_KEY`, `GEMINI_MODEL` (2.1), `CRON_SECRET` (5.3), chaves VAPID (7.5)
