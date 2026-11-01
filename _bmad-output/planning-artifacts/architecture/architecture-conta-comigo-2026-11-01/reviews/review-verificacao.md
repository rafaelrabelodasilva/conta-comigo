---
review: verificacao
alvo: ../ARCHITECTURE-SPINE.md
revisor: revisor independente de arquitetura (lente: verificação na web / checagem de realidade)
data: 2026-11-01
contagem: { critical: 0, high: 3, medium: 8, low: 6 }
---

# Revisão de verificação — Espinha de Arquitetura "Conta Comigo"

## Veredito

A stack existe e serve ao problema, mas a espinha foi verificada só pela metade. Três decisões centrais têm um problema de encaixe que não está escrito em lugar nenhum:

- a Edge Function importando `src/domain`;
- o pdf.js no Safari do iPad;
- a chave `service_role`, que está sendo descontinuada.

Além disso, várias versões fixadas já estão atrás do estado atual (Next.js 16.3, TypeScript 6/7). Nada é bloqueante: todos os achados se resolvem com ajustes pequenos e explícitos na espinha.

## Método e limites

- Pesquisa feita em 2026-11-01 com WebSearch e WebFetch. O registro do npm e várias páginas oficiais estavam bloqueados: `ai.google.dev` (rate-limits, terms, structured-output) e `supabase.com/docs/guides/api/api-keys`. Nesses casos usei os espelhos e as fontes de terceiros alcançáveis, e marquei como **[não confirmado em fonte oficial]**.
- Sobre o memlog: a nota `(version) Verificado na web (01/11/26)` registra "Next.js 16.2.x estável (jun/2026)" e "supabase-js 2.105+ (usado no meu-produto-app)". A primeira é pesquisa defasada de cinco meses. A segunda é herança de outro projeto, não pesquisa. Ver L6.

## Matriz de verificação (resumo)

| Item da espinha | Status | Observação |
| --- | --- | --- |
| Next.js 16.2.x | Desatualizado | 16.3 saiu em 03/08/2026; o mínimo seguro na linha 16.2 é 16.2.11 (9 CVEs, jul/2026) |
| React 19.x | OK | Coerente com Next 16 |
| TypeScript 5.9 | Desatualizado | TS 6.0 (mar/2026) e TS 7 (nativo, em uso desde ago/2026) existem |
| Tailwind 4.x | OK | 4.2 lançado em abr/2026 |
| shadcn/ui "CLI atual" | Não verificado em fonte primária | Sem bloqueio conhecido |
| @supabase/supabase-js 2.105+ | OK como piso | Estável atual ~2.118 |
| @supabase/ssr | OK | O starter oficial usa `proxy.ts` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| pdfjs-dist 5.6.x | OK na versão; **problema de encaixe** | 5.6.205 é a mais recente; Safari só tem suporte oficial no build *legacy* |
| @google/genai 1.51+ | OK | 1.51.0 confirmado (abr/2026) |
| zod "atual" | **Problema de encaixe** | zod v4 + Gemini exige `z.toJSONSchema` em vez de `zod-to-json-schema` |
| Vitest "atual" | OK | 4.1.x |
| Supabase Realtime | OK, com ressalva | O próprio Supabase recomenda `broadcast` no lugar de `postgres_changes` |
| pg_cron + pg_net → Edge Function | OK, com ressalva | pg_cron roda em UTC; a chave da chamada vai para o Vault |
| Edge Function importando `src/domain` | **Problema de encaixe** | Exige `--use-api`, extensões `.ts` e mapa de import para `zod` |
| Web Push/VAPID no iPadOS | OK, com restrições | iPadOS 16.4+, tela inicial, gesto do usuário, toda notificação visível |
| Gemini plano gratuito + saída estruturada | OK, com ressalva | Dados usados pelo Google e revisão humana; limites não publicados |
| Vercel: limites da rota | OK | Corpo até 4,5 MB; duração padrão 300 s (Hobby, fluid compute) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Obsoleto** | `anon` e `service_role` estão sendo descontinuados até o fim de 2026 |

---

## Achados

### HIGH

#### H1 — A Edge Function `lembretes` importando `src/domain` não vai funcionar sem configuração explícita (AD-1, AD-13, tabela de camadas)

**Problema.** A espinha diz que `supabase/functions` importa `src/domain` "como código puro". A espinha não diz como isso funciona. A pesquisa mostrou quatro obstáculos concretos:

1. **Empacotamento no deploy.**
   - O deploy padrão, via Docker, historicamente não incluía arquivos fora de `supabase/`. As issues da CLI #1338 e #3426 mostram import maps e caminhos relativos quebrando no deploy.
   - O suporte oficial a "import files outside of supabase directory" veio com `supabase functions deploy --use-api`, a partir da CLI 2.13.3. No anúncio, a flag era marcada como **experimental**.
2. **Extensões de arquivo.** O Deno resolve imports relativos só com extensão explícita (`./dinheiro.ts`), a menos que se ligue `sloppy-imports`. O Next.js/TS, com `moduleResolution: bundler`, aceita imports sem extensão. Se o núcleo for escrito no estilo padrão do Next, o Deno não carrega o código.
3. **Alias `@/`.** O `create-next-app` configura `@/*` por padrão. Qualquer `import ... from '@/domain/...'` dentro do núcleo quebra no Deno se não houver mapa de import.
4. **`zod` como especificador nu.** O núcleo pode depender de `zod` (AD-1). No Deno isso exige um `deno.json` com `"imports": { "zod": "npm:zod@<mesma versão do app>" }`. Sem isso, a função não roda. Se as versões divergirem, o schema validado na tela pode não ser o mesmo da função.

**Correção (incluir como regra na AD-1 ou numa AD nova):**

- Dentro de `src/domain`, os imports são só relativos e com extensão `.ts`. Nada de `@/`.
- O `tsconfig` do app liga `allowImportingTsExtensions`. O Next já usa `noEmit`, então a opção é compatível.
- `supabase/functions/lembretes/deno.json` mapeia `zod` para `npm:zod@<versão exata do package.json>`.
- O deploy é sempre `supabase functions deploy --use-api`, com a versão da CLI fixada.
- Um teste no CI roda `deno check supabase/functions/lembretes/index.ts`.
- Plano B: um passo de build que copia ou empacota `src/domain` para `supabase/functions/_shared/domain`, a pasta `_shared` recomendada pela documentação.

**Fontes:**
- [Supabase changelog — Deploy Edge Functions… import files outside of supabase directory](https://supabase.com/changelog/33613-deploy-edge-functions-from-cli-without-needing-docker-import-files-outside-of-supabase-directory)
- [Supabase docs — Managing dependencies](https://supabase.com/docs/guides/functions/dependencies.md)
- [Supabase docs — Development Environment (`_shared`)](https://supabase.com/docs/guides/functions/development-environment.md)
- [supabase/cli#1338](https://github.com/supabase/cli/issues/1338)
- [supabase/cli#3426](https://github.com/supabase/cli/issues/3426)

#### H2 — O pdf.js no Safari do iPad só tem suporte oficial no build *legacy* (AD-7 passo 1)

**Problema.** O caminho principal da importação (FR-3) depende do `pdfjs-dist` abrindo o PDF com senha no iPad. O FAQ oficial do pdf.js diz o seguinte:

- O build **moderno** tem suporte só para Firefox e Chrome.
- O Safari 18+ é "Mostly" suportado, e só no build **legacy**.

A espinha fixa `pdfjs-dist 5.6.x` (a versão confere: 5.6.205), mas não diz qual build usar nem qual versão mínima de iPadOS se exige.

A abertura com senha (`getDocument({ data, password })`, com `PasswordException` / `onPassword`) é recurso documentado e não é o problema. Há também um risco conhecido no Next: carregar o pdf.js durante o SSR falha (`DOMMatrix is not defined`).

**Correção:**

- Fixar o uso de `pdfjs-dist/legacy/build/pdf.mjs` com o worker do mesmo build.
- Carregar o pdf.js só no cliente, com `import()` dinâmico dentro de componente `'use client'`.
- Declarar como requisito iPadOS 18+ (Safari 18+).
- Incluir na primeira story um teste manual no iPad Pro 11 real com a Fatura de outubro/2026 protegida por senha, antes de construir o resto do fluxo.

**Fontes:**
- [pdf.js FAQ — browser support](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
- [depscope — pdfjs-dist 5.6.205](https://depscope.dev/pkg/npm/pdfjs-dist)
- [Joyfill — Handling password-protected PDFs](https://joyfill.io/blog/handling-password-protected-pdfs-in-javascript)

#### H3 — `SUPABASE_SERVICE_ROLE_KEY` e a chave `anon` estão sendo descontinuadas até o fim de 2026 (AD-5, AD-12)

**Problema.** A espinha nomeia `SUPABASE_SERVICE_ROLE_KEY` e fala em "chave de serviço". O Supabase tem um modelo novo de chaves: `sb_publishable_…` substitui `anon` e `sb_secret_…` substitui `service_role`. A documentação diz que as chaves antigas estão sendo descontinuadas **até o fim de 2026**, ou seja, justamente quando a v1 vai entrar em produção.

Duas consequências:

- O starter oficial de Next.js já usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Nas Edge Functions, o runtime injeta `SUPABASE_SECRET_KEYS`, um JSON indexado pelo nome da chave. `SUPABASE_SERVICE_ROLE_KEY` continua existindo, mas carrega a chave legada.

As chaves novas vão no header `apikey`, e não em `Authorization: Bearer`. Isso também afeta a chamada `pg_net` → Edge Function (AD-13).

**Correção:**

- Trocar na AD-12 por `SUPABASE_SECRET_KEY`, na Vercel, e `SUPABASE_SECRET_KEYS`, nas Edge Functions, ou pelo helper `@supabase/server` com `withSupabase({ auth: 'secret' })`.
- Usar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no cliente.
- Desligar as chaves legadas no projeto novo.
- Na AD-13, a chamada `pg_net` envia a chave secreta no header `apikey`. A função roda com `verify_jwt = false` e valida a chave.

**Fontes:**
- [Supabase docs (espelho) — API keys](https://cloud.snap.com/docs/guides/getting-started/api-keys) **[página oficial bloqueada nesta sessão; confirmar em supabase.com/docs/guides/api/api-keys]**
- [Supabase docs — Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs.md)
- [Supabase docs — Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions.md)

### MEDIUM

#### M1 — Next.js 16.2.x está atrás da versão atual, e o piso seguro não aparece na espinha (Stack)

**Problema.**

- O Next.js 16.3 saiu em 03/08/2026, com cache em disco no Turbopack, suporte opcional ao TypeScript 7, `catchError` e `useOffline` experimental.
- A linha 16.2 recebeu 9 CVEs corrigidos em **16.2.11** (20/07/2026). Um deles, o CVE-2026-64642, é um bypass de middleware.
- O memlog cita "16.2.x estável (jun/2026)", ou seja, pesquisa de antes dessas datas.

**Correção:** trocar para "Next.js 16.3.x (piso: ≥16.2.11 se ficar na 16.2)". Acrescentar na AD-12 que a autorização é checada na própria rota (`src/app/api`), e não só no `proxy.ts`. A AD-12 já sugere isso; vale deixar explícito.

**Fontes:**
- [DEV — Next.js 16.3 is here](https://dev.to/hamidrazadev/nextjs-163-is-here-and-its-the-biggest-update-since-160-3hgb)
- [ecorpit — Next.js July 2026 security release](https://ecorpit.com/nextjs-july-2026-security-release-cve-upgrade-2026/)
- [Achromatic — Next.js 16.3 + TypeScript 7](https://www.achromatic.dev/blog/nextjs-16-3-typescript-7-upgrade)

#### M2 — TypeScript 5.9 fixado sem justificativa, com o TS 6.0 e o TS 7 já lançados (Stack)

**Problema.**

- O TypeScript 6.0 saiu em 23/03/2026. Ele muda padrões: `strict` ligado, `types: []`, `baseUrl` descontinuado e `moduleResolution node10` descontinuado.
- O TS 7, nativo em Go, já é usado em produção: a 7.0.2 aparece em ago/2026, e o Next 16.3 aceita o TS 7.
- Porém o TS 7 não tem API de compilador estável, o que pode quebrar ferramentas que importam `typescript`, como `typescript-eslint`.

**Correção:** decidir de forma explícita. A recomendação é **TS 6.x**: atual, compatível com o ecossistema de lint e sem as opções descontinuadas, o que já prepara o TS 7. Outra opção é declarar "a versão instalada pelo `create-next-app`" e registrar o número. Evitar `baseUrl` no `tsconfig`.

**Fontes:**
- [Visual Studio Magazine — TypeScript 6.0 ships](https://www.visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx)
- [Achromatic — TS 7 upgrade](https://www.achromatic.dev/blog/nextjs-16-3-typescript-7-upgrade)

#### M3 — "zod atual" é a v4, e ela não funciona com o caminho que a documentação do Gemini sugere (AD-7 passo 2-3, Validação)

**Problema.** A documentação de saída estruturada do Gemini sugeria `zod-to-json-schema`. Com o zod v4, essa biblioteca falha em silêncio: devolve só `$schema`, e o Gemini passa a inventar os nomes dos campos.

**Correção:**

- Regra na AD-7: o schema de extração é convertido com `z.toJSONSchema()` (zod ≥ 4.2) e enviado como `responseJsonSchema`, junto com `responseMimeType: 'application/json'`.
- A resposta é validada de novo com `schema.safeParse()`.
- Não usar `zod-to-json-schema`.
- Manter o schema de extração simples (objetos, arrays, strings e inteiros, sem `refine` ou `transform`), porque o Gemini aceita só um subconjunto do JSON Schema.
- Fixar a mesma versão do zod no app e no `deno.json` (ver H1).

**Fontes:**
- [Build with Matija — Zod v4 + Gemini structured output fix](https://www.buildwithmatija.com/blog/zod-v4-gemini-fix-structured-output-z-tojsonschema)
- [Google blog — Improving Structured Outputs in the Gemini API](https://blog.google/technology/developers/gemini-api-structured-outputs/)
- [SourceForge — zod v4.4.3](https://sourceforge.net/projects/zod.mirror/files/v4.4.3/)

#### M4 — Plano gratuito do Gemini: o que o Google faz com os dados, PII na Fatura e limites não publicados (AD-7, NFR Privacidade)

**Problema.**

- **Uso dos dados.** No plano gratuito, o conteúdo enviado é usado para melhorar os produtos do Google. Fora do EEE, da Suíça e do Reino Unido, revisores humanos podem ler prompts e respostas, e o próprio Google desaconselha enviar dados pessoais no plano gratuito. O memlog registra que Rafael aceitou isso, mas a espinha não diz **o que** sai do aparelho. O texto completo da Fatura costuma trazer nome, CPF, endereço, número parcial do cartão e limite de crédito.
- **Limites.** O Google não publica mais os limites do plano gratuito, que aparecem por projeto no AI Studio. Relatos de set/2026 falam em cerca de 20 requisições por dia nos modelos Flash 3.x e 500 no Flash-Lite **[não confirmado em fonte oficial]**. Em dez/2025 o 2.5 Flash caiu para 5 RPM e 20 RPD. Para uma Fatura por mês basta, mas reimportações, testes de desenvolvimento e chamadas página a página consomem a mesma cota.
- **Disponibilidade.** O Brasil está entre os países onde o plano gratuito é oferecido.

**Correção:**

- Na AD-7, o navegador remove o cabeçalho pessoal antes de enviar o texto: CPF, endereço, número do cartão e limite. Fazer isso com uma função pura do núcleo, testada.
- Enviar a Fatura inteira numa única chamada.
- Ler o modelo de uma variável de ambiente (`GEMINI_MODEL`).
- Tratar o erro 429 com a mensagem do UX.
- Registrar no PRD ou na espinha que a cota é de cerca de 20 por dia e que o plano B (leitor próprio) é acionado se o modelo gratuito sair do ar.

**Fontes:**
- [agentdeals — Gemini API pricing changes (abr/2026)](https://agentdeals.dev/gemini-api-pricing-changes) **[terceiro; página oficial de termos e de rate limits bloqueada nesta sessão — confirmar em ai.google.dev/gemini-api/terms e /docs/rate-limits]**
- [Simon Willison — Gemini terms of service](https://simonwillison.net/2024/Oct/17/gemini-terms-of-service)

#### M5 — Horário do pg_cron e segredo da chamada `pg_net` (AD-13)

**Problema.**

- **Horário.** O pg_cron no Supabase interpreta a expressão em **UTC**. "09:00 em America/Sao_Paulo" precisa virar `0 12 * * *`, já que o Brasil não tem horário de verão desde 2019. Se alguém escrever `0 9 * * *`, o lembrete chega às 06:00.
- **Segredo.** A documentação recomenda guardar a URL e a chave no **Vault** e ler de `vault.decrypted_secrets` no SQL agendado. A documentação também avisa que o `pg_net` grava a chave decifrada em `net.http_request_queue` até a requisição sair. Uma chave colada direto na migração violaria a AD-12 e a AD-14, porque migração fica no git.

**Correção:**

- Na AD-13: `cron.schedule('lembretes', '0 12 * * *', …)`, com comentário "09:00 BRT".
- URL e chave secreta no Vault, criadas fora da migração (script de setup).
- A função valida a chave (`verify_jwt = false` mais checagem do `apikey`).
- O "dia" de `lembretes_enviados` é calculado pelo núcleo em `America/Sao_Paulo`.

**Fontes:**
- [Supabase docs — Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions.md)
- [DEV — Supabase pg_cron complete guide ("pg_cron runs in UTC")](https://dev.to/kanta13jp1/supabase-pgcron-complete-guide-automate-scheduled-jobs-in-postgresql-5dih)

#### M6 — Web Push no iPadOS tem restrições que a espinha não registra, e a biblioteca `web-push` funciona mal no Deno (AD-13, FR-55)

**Problema.** Confirmado:

- Precisa de iPadOS 16.4+ e do app **instalado na tela inicial**, com `display: standalone`. Numa aba do Safari não funciona.
- `Notification.requestPermission()` só funciona a partir de um gesto do usuário.
- Toda notificação recebida precisa chamar `showNotification` dentro de `event.waitUntil`, porque não existe push silencioso. Quando isso falha repetidas vezes, o iOS pode revogar a inscrição.
- Há relatos de inscrições que somem depois de dias de inatividade.
- A inscrição feita no Safari é separada da inscrição do app instalado.

Do lado do servidor, o pacote npm `web-push` depende de `crypto.createECDH` e `https.request`, do Node, e tem suporte "limitado" no Deno.

**Correção:**

- Na AD-13 ou na story da PWA:
  - o pedido de permissão fica num botão em Configurações, e só aparece no modo standalone;
  - o service worker sempre mostra a notificação;
  - quando o envio devolve 404 ou 410, a Edge Function apaga a linha de `push_inscricoes`;
  - não cancelar a inscrição no logout.
- Usar uma biblioteca de Web Push compatível com Deno e Web Crypto, como `@pushforge/builder`, e validar o envio para o endpoint da Apple na primeira story de lembretes.
- A faixa dentro do app (AD-13) continua sendo o caminho garantido.

**Fontes:**
- [Pushpad — iOS special requirements for web push](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [MoEngage — Safari Web Push for iOS and iPadOS](https://www.moengage.com/docs/developer-guide/web-sdk/web-push/safari-web-push-for-i-os-and-i-pad-os.md)
- [WebsCraft — PWA push on iOS in 2026](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en)
- [PushForge README (Deno support, web-push "Limited")](https://cdn.jsdelivr.net/npm/@pushforge/builder@2.0.4/README.md)

#### M7 — O plano do Supabase não está definido, e o plano Free pausa projetos inativos (Stack, AD-13)

**Problema.** No plano Free, o Supabase pausa projetos com pouca atividade de usuários no banco ao longo de 7 dias. Um app de um único usuário, usado com força uma vez por mês na Fatura, pode ser pausado. Com o projeto pausado, o app sai do ar e os lembretes param. Não encontrei confirmação de que jobs do próprio `pg_cron` contam como atividade **[não confirmado]**. A espinha diz só "serviço gerenciado".

**Correção:** registrar o plano na Stack. Se for o Free, incluir um "keep-alive" externo, como um Vercel Cron diário fazendo um `select` leve, e aceitar o risco de forma explícita. A alternativa é o plano Pro.

**Fontes:**
- [Product Compass — Supabase project paused](https://www.productcompass.pm/p/supabase-project-paused)
- [Jet Admin — Supabase pricing 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)

#### M8 — Os padrões do `create-next-app` 16 divergem da estrutura da espinha (Structural Seed)

**Problema.** Os "recommended defaults" atuais do `create-next-app` (doc de 29/09/2026) são: TypeScript, ESLint, sem React Compiler, Tailwind, **sem pasta `src/`**, App Router, **Cache Components ligado** e `AGENTS.md`.

- A espinha exige `src/`.
- O starter do Supabase (`-e with-supabase`) também não usa `src/`.
- O Cache Components muda a semântica de renderização: dados dinâmicos e `cookies()` precisam de `Suspense`. Isso interage com a sessão do Supabase guardada em cookie e com a ideia de "estado derivado do banco" da AD-4. A espinha não decide nada sobre isso.

**Correção:** registrar o comando de criação, por exemplo `npx create-next-app@latest conta-comigo --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`. Decidir explicitamente sobre Cache Components: a sugestão é desligar na v1, porque o app é quase todo cliente e tempo real. Depois, portar os clientes do starter `with-supabase` para `src/data`, em vez de criar o projeto a partir do exemplo.

**Fontes:**
- [Next.js docs — create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app.md)
- [Supabase docs — Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs.md)

### LOW

#### L1 — `supabase-js 2.105+` está defasado como referência, e houve uma mudança no Realtime

**Problema.** O estável atual está em torno de 2.118. O piso "2.105+" foi herdado do meu-produto-app, não pesquisado. Em mar/2026, o Realtime passou a **bloquear listeners de `postgres_changes` adicionados depois do `subscribe()`**.

**Correção:** trocar para "2.118+ (atual no init)". Em `src/data/realtime`, registrar todos os `.on(...)` antes de `.subscribe()`.

**Fonte:** [releases.sh — supabase-js highlights](https://releases.sh/supabase/supabase-js/highlights)

#### L2 — O Supabase recomenda `broadcast` no lugar de `postgres_changes`

**Problema.** A orientação oficial do Supabase para agentes diz que "`postgres_changes` should be avoided due to scalability limitations" e recomenda broadcast disparado por trigger, em canais privados e com RLS em `realtime.messages`. Para um único usuário, `postgres_changes` funciona. Há porém um detalhe: eventos `DELETE` não passam pelo filtro de RLS e só trazem a chave primária, e a reimportação da AD-7 apaga Lançamentos.

**Correção:** manter `postgres_changes` na v1, com as tabelas na publicação `supabase_realtime`, e tratar o `DELETE` pelo id. Registrar a migração para broadcast como Deferred.

**Fonte:** [Supabase docs — AI prompt: use realtime](https://supabase.com/docs/guides/ai-tools/ai-prompts/use-realtime)

#### L3 — Limites da Vercel confirmados, mas a configuração da rota não está escrita

**Problema.** O corpo da requisição pode ter até 4,5 MB (erro 413 acima disso). O texto de uma Fatura com cerca de 49 Lançamentos fica na casa das dezenas de KB, então cabe com folga. A duração padrão e máxima no Hobby com fluid compute é de 300 s.

**Correção:** em `src/app/api/fatura/extrair/route.ts`, usar `export const runtime = 'nodejs'` e `export const maxDuration = 60`. Validar o tamanho do corpo com zod, com um teto de cerca de 1 MB.

**Fontes:**
- [Vercel — Configuring max duration](https://vercel.com/docs/functions/configuring-functions/duration.md)
- [Vercel KB — body size limit 4.5 MB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions.md)

#### L4 — No Next 16, `middleware` virou `proxy`, e o starter usa `proxy.ts`

**Problema.** A espinha não cita onde a sessão do Supabase é renovada. O starter oficial usa `lib/supabase/proxy.ts`.

**Correção:** acrescentar à AD-5: a sessão é renovada em `src/proxy.ts` com `@supabase/ssr`, e cada rota e Server Component valida o usuário com `getClaims()` ou `getUser()` (ver M1 sobre o bypass de middleware).

**Fontes:**
- [Supabase docs — Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs.md)
- [DEV — Next.js renamed middleware to proxy](https://dev.to/daniel_pertu/nextjs-renamed-middleware-to-proxy-and-our-22-line-version-has-one-regex-doing-the-interesting-13p5)

#### L5 — Tailwind 4 e shadcn/ui: só confirmação indireta

**Problema.** O Tailwind 4.2 foi lançado em abr/2026, o que confirma a linha 4.x. Para o shadcn/ui não encontrei fonte primária alcançável. O CLI atual faz o init com Tailwind v4 e pode perguntar a base de primitivas (Radix ou Base UI) **[não confirmado nesta sessão]**.

**Correção:** registrar no init qual base foi escolhida (sugestão: Radix, a padrão e mais documentada) e a versão do CLI.

**Fonte:** [InfoQ — Tailwind CSS 4.2](https://infoq.com/news/2026/04/tailwind-css-4-2-webpack)

#### L6 — A nota de verificação do memlog não é reproduzível

**Problema.** A nota `(version) Verificado na web (01/11/26)` não guarda fontes, e mistura pesquisa defasada (Next.js 16.2, de jun/2026) com uma versão herdada de outro projeto (supabase-js).

**Correção:** guardar fontes e datas no memlog para cada versão fixada, e reescrever a tabela Stack com os números desta revisão.

---

## Ajustes sugeridos na tabela Stack

| Name | Versão sugerida |
| --- | --- |
| TypeScript | 6.x (ou a do `create-next-app`, registrada) |
| Next.js (App Router) | 16.3.x (piso ≥ 16.2.11) |
| React | 19.x (a do Next) |
| Tailwind CSS | 4.x |
| shadcn/ui | CLI atual; base de primitivas registrada |
| @supabase/supabase-js | 2.118+ |
| @supabase/ssr | atual; `proxy.ts` |
| Chaves do Supabase | `sb_publishable_…` / `sb_secret_…` (legadas desligadas) |
| pdfjs-dist | 5.6.x, build **legacy**, só no cliente; iPadOS 18+ |
| @google/genai | 1.51+; modelo em `GEMINI_MODEL` |
| zod | 4.x (≥ 4.2), a mesma no app e no `deno.json`; `z.toJSONSchema` |
| Vitest | 4.x |
| Supabase CLI | versão fixada; deploy com `--use-api` |
| Web Push (servidor) | biblioteca compatível com Deno/Web Crypto (não `web-push`) |
| Plano Supabase | declarado (Free + keep-alive, ou Pro) |
