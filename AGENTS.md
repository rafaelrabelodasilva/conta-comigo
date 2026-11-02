<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regras do projeto Conta Comigo

Leia `_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md` antes de mudar código. Estas regras não têm exceção:

- **Núcleo puro (AD-1).** Regras de negócio são funções puras exportadas por `src/domain`. Telas, rotas e SQL chamam o núcleo; não reimplementam a regra. O núcleo não importa nada de `src/data`, `src/ui`, `src/app`, `src/features`, `src/server`, Next.js, React, Supabase nem APIs só de Node ou só de navegador (rede, relógio, DOM, `fs`, `node:*`). Dentro de `src/domain`, só imports relativos (sem `@/`). O lint (`eslint.config.mjs`) aplica parte disso.
- **Segredos só no servidor (AD-12).** `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `VAPID_PRIVATE_KEY` e `CRON_SECRET` nunca usam o prefixo `NEXT_PUBLIC_` e só são lidos em código de servidor (`src/server`, com `import "server-only"`). Nunca commitar `.env`; só o `.env.example`.
- **Log só por `src/server/log.ts` (AD-17).** Não usar `console.*` para registrar eventos do servidor. O log nunca leva texto de Fatura, nomes de Lançamentos nem valores; só os campos da lista permitida.
- **Schema só por migração (AD-14).** Toda mudança de schema é um arquivo em `supabase/migrations`, aplicado pela CLI do Supabase. Nunca alterar o schema pelo painel. Os tipos do banco são gerados para `src/data/database.types.ts`.
- **Nomes do Glossário.** O código usa os termos do Glossário do PRD, em português sem acento: `lancamento`, `responsavel`, `tipo`, `bloco`, `formula`, `pagamento`, `serie`, `fatura`, `conta_manual`, `regra`, `status`. Nunca `transaction`, `category`, `customer`. Tabelas e colunas em `snake_case` no plural; TS em `camelCase`, tipos em `PascalCase`, arquivos em `kebab-case.ts`, componentes em `PascalCase.tsx`.
