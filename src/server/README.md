# src/server — código só do servidor

Código que roda apenas no servidor (rotas, ações, segredos). Inclui o utilitário único de log (`log.ts`), que nunca registra texto de Fatura, nomes de Lançamentos nem valores (AD-17).

Cron diário (História 5.3, AD-13): `cron.ts` confere o `Authorization: Bearer CRON_SECRET` em tempo constante; `supabase-admin.ts` cria o cliente com a `SUPABASE_SECRET_KEY` (só aqui, por requisição); `materializar-contas.ts` lê `contas_manuais`, pede ao núcleo (`planoDoCron`) e chama `materializar_contas_manuais_do_dono` uma vez por Conta. Quem chama é só `src/app/api/cron/diario/route.ts`.
