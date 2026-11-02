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

Login: Supabase Auth com e-mail e senha (sem cadastro público). Sem as variáveis do Supabase no `.env.local`, o app abre em `/entrar` com "Login indisponível neste ambiente". Com o Supabase local, crie o usuário pelo Studio (`http://127.0.0.1:54323`, Authentication → Add user) e use `API_URL`/`PUBLISHABLE_KEY` de `npm run supabase -- status -o env`. No reset de senha local, o e-mail chega no testador de e-mail do Supabase local (Inbucket, `http://127.0.0.1:54324`) e o link só funciona a partir de `127.0.0.1:3000` ou `localhost:3000`. O teste `test/integracao` só roda com `INTEGRACAO_SUPABASE=1` (no CI). Configuração do Auth em produção: `docs/infraestrutura.md`.

Variáveis de ambiente: veja `.env.example` (só nomes). Os valores ficam nas variáveis da Vercel (só Production) e num `.env.local`, que nunca vai para o repositório.

Estrutura: `src/domain` (núcleo puro), `src/data`, `src/features`, `src/ui`, `src/server`, `src/app`, `supabase/migrations`. Cada pasta tem um `README.md` com o propósito. Detalhes de infraestrutura em `docs/infraestrutura.md`.
