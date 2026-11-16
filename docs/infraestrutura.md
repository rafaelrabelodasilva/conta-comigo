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

## Backup (História 1.10)
- Workflow `Backup` (`.github/workflows/backup.yml`): domingo 06:00 UTC e manual; `supabase db dump` cifrado com `age`, artifact de 90 dias
- Segredo do GitHub `SUPABASE_DB_URL` (URI do Session pooler, porta 5432); chave pública em `scripts/backup/destinatarios-age.txt`; a privada fica só com o Rafael
- Restauração testada em todo PR pelo job `backup` do CI (dois Supabase locais, nunca produção)
- Passo a passo (preparar, baixar, decifrar, restaurar, limites): `docs/backup.md`

## Variáveis de ambiente da Vercel
- Configuradas na História 1.1 (2026-11-01), **só em Production**: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (plain), `SUPABASE_SECRET_KEY` (sensitive, cadastrada pelo Rafael). Preview e Development não têm nenhuma.
- **Pendente antes do primeiro uso real:** trocar a senha do usuário do Rafael no Supabase Auth (apareceu numa conversa com o agente na 1.2), pelo próprio "Esqueci a senha" do app, por uma senha forte.
- **Pendente antes do primeiro uso real:** trocar a senha do banco (apareceu numa conversa com o agente na 1.10). No Supabase, Project Settings → Database → Reset database password → Generate a password; depois atualizar o segredo do GitHub `SUPABASE_DB_URL` (passo 2 de "Preparar" em `docs/backup.md`) e disparar o workflow Backup para conferir.
- **Pendente antes do primeiro uso real:** trocar a `SUPABASE_SECRET_KEY` (a chave atual apareceu numa conversa com o agente). No Supabase, criar uma chave secreta nova, atualizar a variável na Vercel e apagar a antiga.
- Nas histórias seguintes: `GEMINI_API_KEY`, `GEMINI_MODEL` (2.1), `CRON_SECRET` (5.3, ver "Cron diário"), chaves VAPID (7.5)

## Cron diário (História 5.3)
- `vercel.json`: um Cron `0 12 * * *` (12:00 UTC = 09:00 em Brasília; o Brasil não tem horário de verão desde 2019, e se voltasse seria 10:00, no mesmo dia) chama `GET /api/cron/diario`. No plano Hobby o Cron roda uma vez por dia e a hora não é exata (qualquer instante dentro da hora, 09:00 a 09:59 em Brasília); o app não depende do minuto.
- A Vercel só roda Crons no deploy de **Production**, e manda `Authorization: Bearer <CRON_SECRET>` sozinha quando a variável `CRON_SECRET` existe no projeto. A rota responde 401 a quem não mandar exatamente isso (e a todos, se `CRON_SECRET` não existir).
- **Pendente antes de o Cron funcionar (Rafael, na Vercel, só Production):** criar a variável `CRON_SECRET` (tipo sensitive) com um texto aleatório de 16 caracteres ou mais, por exemplo gerado com `openssl rand -hex 32`. Sem ela a rota responde 401 e nada é materializado. Nunca com o prefixo `NEXT_PUBLIC_`.
- Usa também `SUPABASE_SECRET_KEY` (já existe) e a RPC `materializar_contas_manuais_do_dono`, que só vem na migração `20261125120000_materializar_do_dono.sql` (aplicar com `supabase db push` **antes** do primeiro Cron, senão a rota responde 500).
- O que ela faz: lê `contas_manuais` (essa leitura também mantém o projeto Supabase Free ativo), pede ao banco as parcelas que faltam até o Mês atual + 12 e responde `{ "ok": true, "quantidade": N }`. Os logs da Vercel mostram `cron.diario` com status, duração e quantidade; nunca nomes nem valores.
- Conferir depois do deploy: Vercel → projeto → Settings → Cron Jobs (a tarefa aparece e tem "Run" manual) e Logs filtrando por `/api/cron/diario`.
- **Depois da História 5.4:** a rota lê só as Contas que não foram excluídas (`excluido_em is null`) e leva o `updated_at` da Conta em cada parcela (o banco ignora o pedido de uma Conta que mudou no meio). Isso vem na migração `20261126120000_alterar_encerrar_excluir_conta.sql`: aplicar com `supabase db push` **logo depois do merge**, senão o Cron responde 500 (a coluna não existe) e a tela Contas mostra "Não foi possível carregar" até a migração entrar.
- **Depois da História 6.1:** o Cron não muda. A migração `20261127120000_pagamentos.sql` (as tabelas `pagamentos` e `pagamento_itens`, o gatilho do Status e as RPCs `aplicar_pagamento` e `desfazer_pagamento`) entra com `supabase db push` **logo depois do merge**: até lá o Painel funciona, mas "Aplicar status" com Pagamento fica esperando, e Editar, Encerrar e Excluir uma Conta, e Importar de novo um Mês, mostram "Não foi possível carregar" ou "importar" (leem `pagamento_itens`).
- **Depois da História 6.2:** o Cron não muda. A migração `20261128120000_pagamento_parcial.sql` (`status_aplicado_id` passa a aceitar nulo, o gatilho do Status agora só recusa tirar o "pago" de uma linha que um Pagamento quitou, e `aplicar_pagamento` e `desfazer_pagamento` ganham os modos `parcial` e `minha_parte`) **já está em produção** (`supabase db push` feito depois do merge da PR 89). Entre o merge e o `db push` só o modo `total` gravava: o pedido leva uma chave `quita` a mais, que a RPC antiga ignorava, e "Fica pendente" e "Não é dívida, é a minha parte" falhavam com "Não foi possível salvar" (a RPC antiga só aceitava o modo `total`).
- **Depois da História 6.3:** o Cron não muda e **não há migração**: não há nada a aplicar com `supabase db push`. Recebimentos passa a ler `pagamentos` e `pagamento_itens` de TODOS os Meses (leitura paginada de 1000 em 1000, só os vivos) pelo navegador, com as RLS e a publicação do Realtime que a 6.1 criou; "Desfazer pagamento" usa a RPC `desfazer_pagamento` da 6.2 como está.
- **Depois da História 6.4:** o Cron não muda e **não há migração**: não há nada a aplicar com `supabase db push`, e `src/data/database.types.ts` não muda. O "Atrasado" é calculado no navegador (núcleo `src/domain/atraso.ts`) a partir do que já existe: `lancamentos`, `faturas.vencimento`, `config_ciclo`, `pagamento_itens` e `configuracoes.tolerancia_atraso_dias`; nada sobre atraso é gravado. O `vencimento_combinado` (Dívida programada) só chega com a migração da História 6.6. Lembretes e Web Push do atraso são do Épico 7 (o Cron `GET /api/cron/diario` segue como está).
- **Depois da História 6.5:** o Cron não muda e **não há migração**: não há nada a aplicar com `supabase db push`, e `src/data/database.types.ts` não muda. Recebimentos passa a ler **`lancamentos` de TODOS os Meses** pelo navegador (um gerenciador de Realtime próprio, leitura paginada de 1000 em 1000, com as RLS e a publicação do Realtime que já existem; as excluídas também vêm, para a linha de crédito de algo pago e depois excluído) e o `invoice-hero` lê `pagamentos` (todos os Meses, só os vivos). "Usar em Recebimentos" e "É o meu Bloco" (Configurações → Blocos de cobrança) gravam pela RPC `salvar_bloco` da 4.1, como está. O Saldo pendente, o selo, o "Falta receber" e o "Recebido no mês" são calculados no navegador (núcleo `src/domain/projecoes.ts` e `src/domain/recebimentos.ts`); nada é gravado. "Cobrar pendências" é da História 6.7.

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
