---
title: 'História 5.3: Contas que se repetem sozinhas todo dia'
type: 'feature'
created: '2026-11-15'
status: 'review'
baseline_commit: 'f08f5cf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-lista-de-contas-manuais.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a 5.1 materializa a Conta até o Mês atual + 12 só no dia em que Rafael a salva. Um mês depois, o horizonte já encolheu um mês e a Previsão fica sem a recorrente (a Silvia, o TVbox) no Mês novo, a não ser que alguém a salve de novo (FR-17, AD-15).

**Approach:** um Vercel Cron diário (`0 12 * * *` UTC = 09:00 em Brasília) chama `GET /api/cron/diario`. A rota só responde a `Authorization: Bearer CRON_SECRET` (401 sem isso, sem ler nem gravar nada), lê `contas_manuais` com a chave secreta do Supabase (só no servidor, AD-12), pede ao núcleo (`planoDoCron`, que usa `parcelasDaConta`) as parcelas de cada Conta até o Mês atual + 12 (America/Sao_Paulo) e chama a RPC `materializar_contas_manuais_do_dono`, uma por Conta. A RPC é idempotente (`on conflict ... do nothing`), então rodar de novo no mesmo dia não cria nada. A leitura diária também mantém o projeto Supabase Free ativo. O log leva só rota, status, duração e quantidade (AD-17).

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `src/domain/materializacao-diaria.ts` (imports relativos) lê as linhas cruas, decide quais Contas são legíveis e monta um pedido por Conta (`planoDoCron`, `lerContaDoCron`); `src/domain/contas-manuais.ts` ganha `contaLegivel` (a mesma conferência que já fazia `parcelasDaConta`, agora extraída em `prepararConta`) e `pedidoMaterializarDoDono`. **A regra de quais parcelas existem continua só em `parcelasDaConta`**: a rota e o SQL não a reimplementam. O Mês atual **entra como parâmetro**: a rota o tira do relógio com `mesAtual(hojeEmSaoPaulo(new Date()))` (funções que já existiam); o núcleo não lê relógio.
- **Segredos só no servidor (AD-12):** `CRON_SECRET` é lido só em `src/server/cron.ts`; `SUPABASE_SECRET_KEY` só em `src/server/supabase-admin.ts` (os dois com `import "server-only"`). Nenhum usa `NEXT_PUBLIC_`. Documentados só em `.env.example`, sem valor. O job `verificar` do CI já falha se `.next/static` tiver `SUPABASE_SECRET_KEY` ou `sb_secret_`.
- **Log só por `src/server/log.ts` (AD-17):** campos da lista permitida (`rota`, `metodo`, `status_http`, `duracao_ms`, `quantidade`). A lista **não** foi ampliada. Nunca `console.*`, nunca Nome, Valor, id, dono ou segredo.
- **Schema só por migração (AD-14):** `supabase/migrations/20261125120000_materializar_do_dono.sql`, escrita e **NÃO aplicada**. Os tipos entram em `src/data/database.types.ts` no formato do gerador.
- Rota Node (`runtime = "nodejs"`, `maxDuration = 60`), `GET` só; `vercel.json` na raiz.

**Never:** alterar, encerrar e excluir Conta (5.4); lembretes, atraso e Web Push (FR-55); Previsão; Dívida programada (Épico 6); Pagamentos; mexer na lista da 5.2; aplicar a migração ou ler/alterar produção; `console.*`; devolver ou registrar texto de erro do banco.

## Decisões (registradas, nada implícito)

1. **Como o cron materializa em nome do dono.** O problema: `materializar_contas_manuais`, `salvar_conta_manual` e também a `recriar_filhas` (que a primeira chama para as filhas da Divisão) são `security invoker` e leem o dono de `auth.uid()`. O cron roda com a chave secreta (`service_role`), que não tem usuário: `auth.uid()` é nulo e tudo recusa com `auth.sessao_expirou`. Três caminhos:
   - **(a) Variante da RPC que recebe o dono, sem copiar nada — ESCOLHIDA.** `materializar_contas_manuais_do_dono(p_owner_id, p_ate_mes, p_parcelas)`: confere que quem chama é `service_role` (`current_user`), fixa o dono da transação em `request.jwt.claim.sub` (`set_config(..., true)`: vale só até o fim da transação, não vaza para outra chamada) e **chama a própria `materializar_contas_manuais`**. O `auth.uid()` do Supabase lê esse `sub`, então a RPC existente, a `recriar_filhas` e o `default auth.uid()` de `lancamentos.owner_id` enxergam o dono sem uma linha de SQL copiada. Isso cumpre o AD-15 ("um único materializador"): o `on conflict`, as filhas e as conferências são os mesmos que a 5.1 já escreveu. Migração: **uma função nova e os `grant`**, nenhuma tabela, nenhuma coluna.
   - (a′) Uma variante que **copia** o corpo do materializador com `p_owner_id` no lugar de `auth.uid()`: descartada. Teria de copiar também a `recriar_filhas` (outra função de 90 linhas ligada a `auth.uid()`), duas implementações da mesma regra de gravação, e **nenhuma delas pode ser provada neste computador** (sem Docker nem CLI, CI parado). Duplicar SQL sem prova é o pior caso.
   - (b) O servidor assume a sessão do dono (`auth.admin.generateLink` + `verifyOtp`, ou senha guardada): descartada. Sem mudança de SQL, mas cria uma sessão real do Auth por dia (linhas que se acumulam em `auth.sessions`), exige listar usuários e três chamadas ao Auth antes de gravar, ou guardar a senha do Rafael no servidor (nunca). Mais partes móveis em produção e também sem prova possível aqui.
   - **O risco de uma RPC que aceita `owner_id` de fora (AD-5), e o que o contém:** (1) `revoke execute ... from public, anon, authenticated` e `grant ... to service_role` (o `revoke` é explícito porque o Supabase concede `execute` a `anon` e `authenticated` por padrão em funções novas); (2) dentro da função, `current_user is distinct from 'service_role'` recusa mesmo que um `grant` largo demais apareça um dia (defesa em profundidade); (3) o `p_owner_id` nunca vem de uma requisição: a rota o lê da coluna `owner_id` da própria Conta, no servidor; (4) a RPC interna só grava Contas e Séries daquele dono (`c.owner_id = dono`): passar o dono errado com as parcelas de outra Conta dá `conta.nao_encontrada` e nada é gravado; (5) o `set_config` é local à transação. Como o app tem um usuário só (AD-5), o dono é sempre o mesmo, mas o código **não** presume isso (agrupa por `owner_id` e pede por Conta).
   - **A dependência não verificada:** que `auth.uid()` do Supabase lê `request.jwt.claim.sub` antes de `request.jwt.claims ->> 'sub'`. É a definição estável do Supabase (`coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid`), mas ninguém a provou aqui. `test/integracao/cron-contas.test.ts` prova no CI (cria as parcelas com o dono certo, recusa o dono errado e `authenticated`/`anon`). Se o CI discordar, o conserto é só dentro da função nova (por exemplo, também fixar `request.jwt.claims`); o resto (rota, núcleo, testes) não muda.
   - **Como isso conversa com `salvar_conta_manual`:** nada muda nela. Continua do usuário logado (`authenticated`, `auth.uid()`), cria a Conta e a Série e chama `materializar_contas_manuais`. Salvar (tela) e o cron (servidor) materializam pelo **mesmo** corpo; só a porta de entrada difere.
2. **De onde vêm as Contas.** A rota lê `contas_manuais` com a chave secreta (ignora o RLS, por isso filtra por dono sozinha: agrupa por `owner_id` e pede por Conta), só as colunas das parcelas: `id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes`. **Nome, Observação, Tipo e Responsável nem são lidos** (a RPC os copia da própria Conta no SQL). O núcleo monta `pedidoMaterializarDoDono(owner_id, [conta], Mês atual + 12)`. **Conta Encerrada:** `parcelasDaConta` pára antes de `encerrada_em_mes`, então o pedido nunca inclui o Mês do encerramento em diante; uma Conta encerrada no próprio Mês inicial, ou que começa além do horizonte, é legível mas sem parcelas, e não gera chamada. O cron **não apaga** linhas que já existam depois do encerramento: recriar e excluir é da 5.4. **Conta apagada:** a linha some de `contas_manuais`, a leitura não a devolve e ela não gera pedido (e a RPC ainda confere que a Conta e a Série existem). Hoje nenhuma tela apaga Conta; a 5.4 decide o que fazer com as parcelas dela.
3. **Um pedido por Conta, não um por dono.** Cada chamada à RPC é uma transação. Se fosse uma por dono, uma Conta com defeito (por exemplo, sem Série) desfaria as outras. Com a Conta como unidade, o defeito de uma é isolado e as outras gravam. Custo: uma chamada por Conta com parcelas (dezenas, todas rápidas), dentro dos 60 s. O limite de 2000 parcelas da RPC por chamada nunca é atingido (no máximo ~130 por Conta: 120 parcelas, ou 60 + 12 + o passado).
4. **Casos de borda.**
   - **O dono não tem Contas:** a leitura roda (mantém o projeto ativo), nenhuma RPC é chamada, resposta `200 { ok: true, quantidade: 0 }`.
   - **Conta ilegível** (linha fora do formato, UUID inválido, Valor ≤ 0, Mês ou repetição inválidos, `parcelas` sem total, `mensal` com total, Divisão que não se lê): **pulada e contada**, sem derrubar as outras. O log leva uma linha `cron.diario.conta_ilegivel` (nível `warn`) só com a contagem. A resposta continua 200 (o que dava para fazer foi feito).
   - **O banco falha na leitura:** `500 { ok: false, erro: "cron.falhou", quantidade: 0 }`, nada gravado.
   - **O banco falha em uma Conta no meio** (RPC com erro ou exceção de rede): as outras Contas seguem; no fim `500 { ok: false, erro: "cron.falhou", quantidade: <linhas criadas pelas que deram certo> }`. O 500 aparece nos logs de Cron da Vercel (que **não** tenta de novo). As Contas que gravaram ficam gravadas; a que falhou é refeita no dia seguinte (idempotente) ou na próxima vez que Rafael salvar uma Conta. Um dia perdido não faz falta: o horizonte é 12 meses.
   - **Sem `SUPABASE_SECRET_KEY` ou URL** (depois de autorizado): `503 { ok: false, erro: "cron.indisponivel" }`, sem leitura.
   - **Texto de erro do banco** (relação, coluna, valor, nome) **nunca** vai para a resposta nem para o log: só o código fixo.
5. **Resposta e códigos.** Corpo mínimo: `{ ok: true, quantidade }` no sucesso; `{ ok: false, erro }` nas recusas (`cron.nao_autorizado`, `cron.indisponivel`, `cron.falhou`). Sem nomes, valores, ids ou dono. `quantidade` = **linhas novas criadas hoje** (mães e filhas, o que a RPC devolve): na primeira rodada de um dia que mudou o Mês é ≥ 1; a segunda rodada do mesmo dia é 0. (A tela da 5.1 conta só as mães porque fala com Rafael; aqui o número é para quem monitora.) Os códigos são identificadores de máquina para um chamador que não é uma tela; **não** viram texto em `mensagens.ts`, que é o mapa dos textos que Rafael lê.
6. **Fuso e a hora do Cron.** `0 12 * * *` é 12:00 UTC = 09:00 em Brasília. No plano Hobby o Cron roda uma vez por dia em qualquer minuto da hora (09:00 a 09:59 em Brasília); o app não depende do minuto. **O Mês atual vem do relógio em America/Sao_Paulo**, nunca do UTC: às 02:00 UTC do dia 1º ainda é o dia 30 em São Paulo (um disparo manual ou uma repetição nessa hora não pode adiantar o Mês). `hojeEmSaoPaulo` usa o banco de fusos do runtime. O Brasil não tem horário de verão desde 2019; **se voltasse** (UTC−2), 12:00 UTC seria 10:00, no mesmo dia, e o Mês continuaria certo sem mudar nada. Testado na virada do mês e do ano (02:00, 03:00, 23:59 e 00:00 em São Paulo).
7. **Idempotência.** Duas camadas: (i) o núcleo é determinístico: o mesmo Mês e as mesmas linhas dão exatamente o mesmo pedido (`planoDoCron` duas vezes é igual); (ii) o banco não cria o que já existe (`on conflict (serie_id, parcela_n) where dividido_de_id is null and excluido_em is null do nothing`, da 5.1). A rota nunca decide "já rodei hoje": não guarda estado. **Prova aqui:** no núcleo e na rota, com um banco de mentira que reproduz o `on conflict` por `(conta, parcela_n)`: a segunda rodada pede **exatamente** o mesmo (`toEqual` das chamadas) e conta 0. **Só o CI prova** o `on conflict` de verdade (`test/integracao/cron-contas.test.ts`).
8. **Os lembretes (FR-55, AD-13).** A rota do AD-13 faz a materialização e depois os lembretes. Esta história faz só a materialização e o 401. O **ponto de extensão** é um comentário em `route.ts`, depois do `await materializarContasDoDia(...)`: lá entram as funções de lembrete e atraso do núcleo e o Web Push, e uma falha deles não pode desfazer o que a materialização gravou. Nenhuma lógica, tabela (`push_inscricoes`, `lembretes_enviados`) ou variável (VAPID) foi criada.
9. **Autorização.** Comparação em tempo constante: os dois lados passam por SHA-256 (mesmo tamanho, `timingSafeEqual` nunca lança nem revela o tamanho do segredo). Só vale o texto exato `Bearer <segredo>` (nem `bearer`, nem sem o prefixo, nem com sufixo). **Sem `CRON_SECRET` configurado, ninguém passa** (nem `Bearer undefined`): a rota nunca fica aberta por falta de configuração. O 401 é a primeira coisa que a rota faz: o cliente do Supabase **nem é criado**. O proxy deixa `/api/*` passar sem sessão (já era assim; ganhou teste para `/api/cron/diario`), então o Cron não é mandado para Entrar. O 401 usa o mesmo corpo para segredo ausente, errado ou não configurado (não revela qual).
10. **Manter o Supabase Free ativo.** Toda execução autorizada faz pelo menos a leitura de `contas_manuais`, inclusive sem Contas. O projeto Free pausa depois de uma semana sem atividade; a leitura diária evita. (O Cron só roda em Production.)
11. **O que a produção precisa antes do primeiro Cron (Rafael, nada disto foi feito aqui):** (a) `supabase db push` com a migração `20261125120000_materializar_do_dono.sql` (senão a rota responde 500: a RPC não existe); (b) criar a variável `CRON_SECRET` na Vercel, só em Production (senão a rota responde 401 a todos, inclusive ao Cron); (c) conferir `SUPABASE_SECRET_KEY` (já existe; `docs/infraestrutura.md` lembra que a chave atual precisa ser trocada). Passo a passo em `docs/infraestrutura.md`, "Cron diário".
12. **Onde cada coisa roda.** Núcleo, rota com banco de mentira, autorização, cliente administrativo, lint, typecheck e a leitura do `vercel.json`: `npm run lint`, `typecheck` e `test`. A migração, o RLS, o `current_user`, o `set_config`/`auth.uid()`, o `on conflict` de verdade, as filhas pelo cron, os `grant`/`revoke` e o `database.types.ts` igual ao gerado: **só o job `supabase` do CI**, que **hoje não roda** (limite de cobrança do GitHub Actions). O Cron de verdade na Vercel só se vê depois do deploy e do `CRON_SECRET`.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Sem segredo | `GET` sem `Authorization` | 401, nada lido nem gravado, cliente do Supabase não criado | `cron.nao_autorizado` |
| Segredo errado | `Bearer errado`, sem `Bearer`, `Basic`, `bearer`, com sufixo ou prefixo do segredo | 401, idem | `cron.nao_autorizado` |
| Sem `CRON_SECRET` no servidor | variável ausente, vazia ou só espaços | 401 a todos (nem `Bearer undefined` passa) | `cron.nao_autorizado` |
| Dia normal | segredo certo, Silvia (mensal desde Jan/26) e Bombinhas, Mês atual Nov/26 | 200 `{ ok: true, quantidade }`; um pedido por Conta com `p_ate_mes` = 2027-11; só entram as parcelas que faltavam | N/A |
| Duas vezes no dia | mesma chamada duas vezes | a 2ª pede o mesmo e cria 0 (`quantidade: 0`) | N/A |
| Mês virou | 1º/12 às 12:00 UTC | `p_ate_mes` = 2027-12; cria só a parcela de Dez/27 (e as filhas, com Divisão) | N/A |
| Virada do mês | 02:00 UTC do dia 1º (dia 30 em São Paulo) | Mês atual = mês anterior; 03:00 UTC = mês novo | N/A |
| Virada do ano | 02:59 UTC de 1º/1 → Dez; 03:00 UTC → Jan | `p_ate_mes` = 2027-12 e 2028-01 | N/A |
| Sem Contas | `contas_manuais` vazia | 200 `quantidade: 0`; 1 leitura, 0 RPC | N/A |
| Conta encerrada | `encerrada_em_mes = 2026-09`, mensal desde Jan/26 | pedido só até Ago/26; nada do Mês do encerramento em diante | N/A |
| Encerrada no Mês inicial / começa além do horizonte | | legível, sem parcelas, sem chamada | N/A |
| Conta apagada | linha ausente da leitura | sem pedido | N/A |
| Conta ilegível | UUID, Valor, Mês, repetição ou Divisão inválidos | pulada e contada (`warn`); as outras gravam; 200 | N/A |
| Leitura falha | erro do Supabase | 500 sem texto do erro; nada gravado | `cron.falhou` |
| Uma Conta falha | RPC com erro ou exceção | as outras gravam; 500 com `quantidade` das que deram certo; sem texto do banco | `cron.falhou` |
| Sem chave do Supabase | URL ou `SUPABASE_SECRET_KEY` ausente | 503, sem leitura | `cron.indisponivel` |
| Log | qualquer execução | só `rota`, `metodo`, `status_http`, `duracao_ms`, `quantidade`, `evento`, `codigo`; sem Nome, Valor, id, dono, segredo | N/A |
| Usuário logado ou anônimo | `rpc("materializar_contas_manuais_do_dono")` pelo navegador | recusa (`permission denied`); nada gravado | CI |
| Dono errado | chave secreta com `p_owner_id` de B e parcelas da Conta de A | recusa, nada gravado | `conta.nao_encontrada` (CI) |

</frozen-after-approval>

## Code Map

- `vercel.json` (novo) -- o Cron `0 12 * * *` para `/api/cron/diario`.
- `src/app/api/cron/diario/route.ts` (novo, + teste) -- `GET`: segredo → cliente administrativo → `materializarContasDoDia` → log e resposta; ponto de extensão dos lembretes.
- `src/server/cron.ts` (novo, + teste) -- `autorizadoPeloCron` (SHA-256 + `timingSafeEqual`), `segredoDoCron`.
- `src/server/supabase-admin.ts` (novo, + teste) -- `criarClienteAdmin` (URL pública + `SUPABASE_SECRET_KEY`, sem sessão, por requisição).
- `src/server/materializar-contas.ts` (novo, testado pela rota) -- lê `contas_manuais`, chama o núcleo, uma RPC por Conta, soma as linhas novas.
- `src/domain/materializacao-diaria.ts` (novo, + teste) -- `planoDoCron`, `lerContaDoCron`.
- `src/domain/contas-manuais.ts` (+ teste) -- `prepararConta` (extraída de `parcelasDaConta`, mesmo comportamento), `contaLegivel`, `pedidoMaterializarDoDono`.
- `supabase/migrations/20261125120000_materializar_do_dono.sql` (novo, NÃO aplicada) -- a RPC do dono e os `grant`.
- `src/data/database.types.ts` -- `materializar_contas_manuais_do_dono`.
- `src/data/supabase/sessao.test.ts` -- `/api/cron/diario` sem sessão segue.
- `.env.example`, `docs/infraestrutura.md` -- `CRON_SECRET`, o Cron e o passo a passo da produção.
- `test/integracao/cron-contas.test.ts` (novo, só no CI) -- a RPC do dono contra o Supabase local.

## Tasks & Acceptance

**Execution:**
- [x] `materializacao-diaria.ts`, `contas-manuais.ts` + testes -- plano do cron, legibilidade, pedido do dono -- AD-1/15
- [x] `20261125120000_materializar_do_dono.sql`, `database.types.ts` -- RPC do dono (migração NÃO aplicada) -- AD-5/12/14
- [x] `cron.ts`, `supabase-admin.ts`, `materializar-contas.ts` + testes -- servidor -- AD-12/13
- [x] `route.ts` + teste, `vercel.json` -- a rota e o Cron -- AD-13/17
- [x] `test/integracao/cron-contas.test.ts` -- aceite no Supabase local (CI)
- [x] `.env.example`, `docs/infraestrutura.md` -- `CRON_SECRET` e produção

**Acceptance Criteria:**
- Given o Cron chama a rota sem o segredo certo, when responde, then é 401 e nada é lido nem gravado.
- Given o segredo certo, when a rota roda, then materializa as Contas até o Mês atual + 12 (America/Sao_Paulo), com a chave secreta só no servidor.
- Given a rota rodou duas vezes no mesmo dia, when a segunda termina, then não criou nada novo.
- Given a leitura diária, when o projeto Supabase Free fica uma semana sem uso, then ela já o manteve ativo.
- Given qualquer execução, when o log é escrito, then não há nomes nem valores.

## Implementation Notes

- Implementado direto da spec, sem subagentes (Rafael não pediu). Revisão inline; nenhum revisor independente rodou.
- **Achado de leitura que mudou o desenho:** a pendência do `deferred-work.md` falava só de `materializar_contas_manuais` e `salvar_conta_manual`, mas `recriar_filhas` (chamada por `materializar_contas_manuais` para as filhas da Divisão) também lê `auth.uid()`. Uma "variante com `p_owner_id`" teria de duplicar as duas. Por isso a decisão 1 fixa o dono da transação e reaproveita a RPC existente.
- **O Supabase concede `execute` a `anon` e `authenticated` por padrão** em funções novas do schema `public` (as migrações anteriores fazem `revoke ... from public, anon` e depois `grant ... to authenticated`). Na RPC do dono o `revoke` inclui `authenticated`.
- `new Request(url, { headers })` apara espaços nas pontas do valor do cabeçalho (Fetch). O caso "segredo com espaço no fim" fica no teste de `autorizadoPeloCron`, não no da rota.
- O Cron do plano Hobby da Vercel só roda em Production e não tenta de novo; por isso o 500 é o sinal (aparece nos logs de Cron) e a idempotência faz o dia seguinte consertar.
- **Não rodou aqui:** o SQL (sem Docker nem CLI), `test/integracao/cron-contas.test.ts`, o job `supabase` e "Backup gera e restaura" (CI parado por cobrança), o Cron na Vercel, e a igualdade de `database.types.ts` com o gerado (a entrada nova está no formato do gerador, três linhas porque passa de ~100 colunas, como `salvar_conta_manual`).

## Spec Change Log

## Review Triage Log

Revisão inline do agente de implementação; nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| `recriar_filhas` também depende de `auth.uid()`: uma variante com `p_owner_id` teria de copiá-la | decisão | decisão 1: `set_config` do dono e reaproveitar a RPC existente |
| Funções novas ganham `execute` para `authenticated` por padrão no Supabase | corrigido | `revoke ... from public, anon, authenticated` explícito e guarda `current_user` |
| Uma RPC por dono desfaria as Contas boas se uma tivesse defeito | decisão | um pedido por Conta (decisão 3) |
| Sem `CRON_SECRET`, `Bearer undefined` poderia passar na comparação | corrigido | sem segredo configurado, `autorizadoPeloCron` recusa tudo (teste) |
| O texto de erro do banco poderia ir para a resposta ou o log | corrigido | a rota devolve só códigos fixos; testes com Nome, Valor e `sb_secret` no erro do fake |
| O Mês atual em UTC adiantaria o Mês num disparo às 02:00 UTC do dia 1º | corrigido | `hojeEmSaoPaulo` (testes na virada do mês e do ano) |
| `set_config('request.jwt.claim.sub')` depende da definição de `auth.uid()` do Supabase | adiado | só o CI prova (`cron-contas.test.ts`); `deferred-work.md` |
| `quantidade` conta mães e filhas, a tela da 5.1 só as mães | aceito (low) | decisão 5 |

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm test` -- sem erro (os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos).
- Job `supabase` do CI (**parado**) -- aplica a migração, roda `test/integracao/cron-contas.test.ts` e compara os tipos gerados.

**Manual checks (depois do `db push` e do `CRON_SECRET`):** na Vercel, Settings → Cron Jobs → "Run" da tarefa `/api/cron/diario`: a execução deve dar 200 com `{ "ok": true, "quantidade": N }`; rodar de novo dá `quantidade: 0`. Chamar a URL sem o cabeçalho (navegador) dá 401. Conferir nos logs da Vercel que a linha `cron.diario` só tem rota, status, duração e quantidade. Salvar uma Conta mensal nova e ver, no mês seguinte, a parcela nova no Painel sem ninguém tocar em nada.
