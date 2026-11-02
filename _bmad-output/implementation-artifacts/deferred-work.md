# Trabalho adiado

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Estender o lint do núcleo (AD-1) para proibir rede, relógio, DOM e APIs só de Node (`fetch`, `Date.now`, `new Date()` sem argumento, `window`, `document`, `node:*`, `fs`) em `src/domain`.
  evidence: AD-1 proíbe esses usos, mas a regra da 1.1 cobre só imports de camadas, Next, React e Supabase.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Proteger `src/server` com `import "server-only"` (ou regra de lint) antes de a primeira história colocar segredos lá (1.2 ou 2.1).
  evidence: Hoje nada impede um componente cliente de importar `src/server/*`; a guarda exige a dependência `server-only`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Na História 1.2, desligar `enable_signup` em `[auth]` e `[auth.email]` de `supabase/config.toml` para o Supabase local se comportar como produção (cadastro público desligado).
  evidence: `supabase init` gerou `enable_signup = true`, contrário ao requisito de acesso só do Rafael.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Trocar a `SUPABASE_SECRET_KEY` antes do primeiro uso real: criar chave secreta nova no Supabase, atualizar na Vercel (Production, sensitive) e apagar a antiga.
  evidence: A chave atual foi colada no chat com o agente durante a 1.1 e ficou no histórico da conversa.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-entrar-com-e-mail-e-senha.md`
  summary: Provar automaticamente que importar `src/server/*` ou `src/data/supabase/servidor.ts` num Client Component falha (regra de lint para arquivos `"use client"` ou build de fixture no CI).
  evidence: A guarda `server-only` foi verificada só à mão na 1.2; o Vitest troca o pacote por módulo vazio e o CI não builda uma violação, então remover o import não falha nada.
