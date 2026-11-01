# src/domain — núcleo puro

Regras de negócio em TypeScript puro (e zod), com teste Vitest ao lado de cada arquivo.

- Só imports relativos. Nada de `@/`, `src/data`, `src/ui`, `src/app`, `src/features`, `src/server`, Next, React ou Supabase (o lint falha — AD-1).
- Sem rede, banco, relógio ou DOM: "hoje" e o Mês aberto entram como parâmetro.
- Devolve `{ ok, valor }` ou `{ ok: false, erro: { codigo, detalhe } }`.
