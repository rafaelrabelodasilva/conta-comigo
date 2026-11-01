# Conta Comigo

App para dividir a fatura do cartão de crédito entre as pessoas que compram no seu cartão.

Todo mês: importa o PDF da fatura, extrai os lançamentos (à vista, parcelados e estornos), atribui um responsável a cada despesa e gera o valor final de cada pessoa, pronto para mandar no WhatsApp.

## Como o projeto é construído

Este projeto usa o [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (v6) para planejar e desenvolver com agentes de IA:

- `_bmad/`: módulos e configuração do BMAD
- `.claude/skills/`: skills do BMAD para o Claude Code
- `_bmad-output/`: documentos gerados (brief, PRD, arquitetura, histórias)

Para começar no Claude Code, abra esta pasta e rode `/bmad-help`.

## Desenvolvimento

Requisitos: Node 22 (o mesmo do CI e da Vercel) e npm.

```bash
npm install          # instala dependências (inclui a Supabase CLI fixada)
npm run dev          # app em http://localhost:3000
npm run lint         # ESLint (inclui a regra do núcleo puro, AD-1)
npm run typecheck    # TypeScript sem emitir arquivos
npm test             # Vitest
npm run build        # build de produção do Next.js
```

Supabase local (exige Docker; por enquanto só roda no CI):

```bash
npm run supabase -- start    # sobe o banco local
npm run supabase -- stop
```

Variáveis de ambiente: veja `.env.example` (só nomes). Os valores ficam nas variáveis da Vercel (só Production) e num `.env.local`, que nunca vai para o repositório.

Estrutura: `src/domain` (núcleo puro), `src/data`, `src/features`, `src/ui`, `src/server`, `src/app`, `supabase/migrations`. Cada pasta tem um `README.md` com o propósito. Detalhes de infraestrutura em `docs/infraestrutura.md`.
