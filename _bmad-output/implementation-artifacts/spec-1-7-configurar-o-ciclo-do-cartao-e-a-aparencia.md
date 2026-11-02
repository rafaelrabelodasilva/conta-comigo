---
title: 'História 1.7: Configurar o Ciclo do cartão e a Aparência'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '0a68198f03ec4595b157aaa8f7b5428e002aef0e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-gerenciar-status-e-substituir-cadastros-em-uso.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem onde informar o dia de fechamento e de vencimento do cartão, então nada sabe em que Mês cai um Lançamento feito à mão nem quando vence um Mês sem Fatura. Também não pode fixar o tema Claro/Escuro nem guardar o limite do Ajuste e a tolerância de atraso que os Épicos 2 e 6 vão usar.

**Approach:** Nova tabela `config_ciclo` só de inserção (histórico com `vigente_desde` `AAAA-MM`) e, por migração nova, as colunas `aparencia`, `limite_ajuste_centavos` e `tolerancia_atraso_dias` em `configuracoes`. Núcleo `src/domain/ciclo.ts` com `hojeEmSaoPaulo`, `mesDoLancamento`, `vencimentoDoMes` e `vigenteDesdeDaMudanca`; núcleo `dinheiro.ts` para ler/mostrar reais. Configurações ganha as seções Ciclo do cartão, Conferência e atraso e Aparência; o tema escolhido vale em todos os aparelhos.

## Boundaries & Constraints

**Always:**
- Mês = mês do vencimento da Fatura (AD-9). Para uma configuração `{fechamento F, vencimento V}`, o fechamento do Mês M fica em M se V > F, senão em M−1; dias que não existem no mês viram o último dia (31 em fevereiro → 28/29). Dias aceitos: 1 a 31.
- Configuração vigente no Mês M = a de maior `(vigente_desde, created_at)` com `vigente_desde ≤ M`; antes da primeira, vale a primeira.
- `mesDoLancamento(data, configs)` = o menor Mês M cujo fechamento (pela config vigente em M) é ≥ `data`. Data no dia do fechamento fica no Mês; no dia seguinte vai para o seguinte.
- `vencimentoDoMes(mes, configs)` = dia de vencimento da config vigente em M, dentro de M. (A Fatura importada passa a ter prioridade no Épico 2.)
- Salvar o Ciclo nunca altera nem apaga linhas: insere uma nova. `vigente_desde` vem do núcleo (`vigenteDesdeDaMudanca(hoje, configs)`): Mês seguinte ao de `hoje`; sem configuração anterior, o próprio Mês de `hoje`. Salvar de novo antes de valer insere outra linha com o mesmo `vigente_desde`, que passa a valer no lugar. Valores iguais aos que já valeriam naquele Mês não gravam.
- O banco recusa update e delete em `config_ciclo` (sem políticas) e `vigente_desde` anterior ao mês corrente em `America/Sao_Paulo` (gatilho).
- "Hoje" vem de `hojeEmSaoPaulo(agora: Date)` (Intl com `America/Sao_Paulo`); o núcleo recebe `hoje` como parâmetro e não lê relógio.
- Tela do Ciclo: campos dia de fechamento e dia de vencimento, "Salvar", a nota "O fechamento só define em que mês entram as contas lançadas à mão", a configuração que vale hoje e, se houver, "A partir de Jan/27: fechamento dia X, vencimento dia Y".
- Aparência: Sistema (padrão), Claro, Escuro, guardada em `configuracoes.aparencia`; muda o tema em todos os aparelhos abertos sem recarregar e já vem certo no próximo carregamento.
- Conferência e atraso: limite do Ajuste em reais (padrão R$ 1,00, `limite_ajuste_centavos` 100) e tolerância em dias (padrão 10); só gravam, ninguém os usa ainda. Decisão (Rafael): limite de R$ 0,01 a R$ 10,00 e tolerância de 0 a 60 dias, na tela e em check do banco.
- Decisão (Rafael): a primeira configuração do Ciclo vale já para o Ciclo de `hoje`; só as mudanças seguintes esperam o próximo Ciclo.
- Gravação como nas seções anteriores: só pelos repositórios, só as colunas alteradas, otimismo desfeito se o banco recusar, toast `salvar.falhou`; leitura só por `useLinhas`.

**Never:**
- Alterar migrações antigas; Mês aberto/fechado e "＋ Lançamento" (épicos seguintes); usar Ciclo na importação; lembretes; Primeiro uso; guardar a Aparência só no navegador.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Depois do fechamento | F=28, V=6; data 29/10/26 | Mês 2026-12 (fecha 28/11, vence 06/12) | N/A |
| No dia do fechamento | F=28, V=6; data 28/10/26 | Mês 2026-11 | N/A |
| Virada de ano | F=28, V=6; data 30/11/26 | Mês 2027-01; `vencimentoDoMes('2027-01')` = 06/01/27 | N/A |
| V > F | F=1, V=10; data 02/11/26 | Mês 2026-12, vence 10/12/26 | N/A |
| Dia inexistente | F=31, V=10; data 28/02/27 | Fecha 28/02 → Mês 2027-03 | N/A |
| Mudança de fechamento | {28,6} desde 2026-11; {5,15} desde 2027-01 | Datas até 28/11/26 seguem a antiga; 29/11/26–05/01/27 → 2027-01 | N/A |
| Primeira gravação | sem config, hoje 02/11/26, F=28, V=6 | Linha com `vigente_desde` 2026-12 (Mês de hoje) | Dia fora de 1–31: mensagem no campo |
| Mudar de novo antes de valer | já há linha futura | Insere outra com o mesmo `vigente_desde`; a nova vale | Recusa: toast |
| Aparência | Escolhe Escuro | Grava `aparencia`; tema escuro no outro aparelho | Recusa: volta + toast |
| Limite do Ajuste | "1,50" | Grava 150 centavos; mostra "R$ 1,50" | Fora do intervalo ou ilegível: mensagem no campo |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261102140000_status_configuracoes.sql` -- modelo de tabela (RLS, `definir_updated_at`, replica identity, publicação) e de gatilho com `raise exception '<codigo>'`. Não alterar.
- `src/data/configuracoes-repo.ts` -- estender com `definirAparencia`, `definirLimiteAjuste`, `definirToleranciaAtraso` reusando `upsert` em `owner_id` + `gravarComOtimismo` (generalizar `upsertStatusPadrao` para colunas parciais).
- `src/data/tipos-repo.ts`, `gravacao.ts`, `realtime.ts` (`gerenciador`, `useLinhas`, `TabelaRealtime` vem de `database.types`) -- modelo do `ciclo-repo.ts` (só `inserir`, aplica a linha devolvida no gerenciador).
- `src/domain/status.ts`, `mensagens.ts` (`MENSAGENS`, `ROTULOS`) -- modelo do núcleo e dos códigos `ciclo.*`, `ajuste.*`, `atraso.*`; rótulos das seções e da Aparência.
- `src/features/configuracoes/SecaoStatus.tsx` -- modelo das seções (esqueleto, erro, `Campo`, `Seletor`, `Botao`, toast); `secoes.ts` + `src/app/(app)/configuracoes/page.tsx` -- acrescentar `ciclo`, `conferencia`, `aparencia` na ordem do EXPERIENCE (Responsáveis, Tipos, Status, Ciclo do cartão, Conferência e atraso, Aparência).
- `src/app/globals.css` -- escuro hoje em `@media (prefers-color-scheme: dark) { :root {…} }`; `src/ui/contraste.ts` (`lerTokens`) e `src/ui/tokens.test.ts` leem esse bloco.
- `src/app/layout.tsx` -- `viewport.colorScheme`; `<html>` recebe `data-tema`.
- `src/data/database.types.ts` -- acrescentar à mão no formato `--linked`; o CI compara com o gerado.
- `test/integracao/status.test.ts`, `apoio.ts` -- modelo dos testes de integração (RLS, Realtime).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261102150000_ciclo_aparencia.sql` -- `config_ciclo` (`id`, `owner_id`, `dia_fechamento`/`dia_vencimento` smallint 1–31, `vigente_desde` text `^\d{4}-(0[1-9]|1[0-2])$`, `created_at`, `updated_at`), RLS só select/insert, gatilhos `definir_updated_at` e `ciclo.vigente_no_passado`, índice `(owner_id, vigente_desde)`, Realtime; `alter table configuracoes add` `aparencia` (`sistema|claro|escuro`, padrão `sistema`), `limite_ajuste_centavos` (padrão 100), `tolerancia_atraso_dias` (padrão 10) com checks.
- [x] `src/domain/ciclo.ts` (+ teste com toda a matriz) -- `hojeEmSaoPaulo`, `configVigente`, `fechamentoDoMes`, `mesDoLancamento`, `vencimentoDoMes`, `vigenteDesdeDaMudanca`, `validarDia`, `somarMeses`, `formatarMes` ("Out/26").
- [x] `src/domain/dinheiro.ts` (+ teste) -- `formatarReais` ("R$ 1.140,74", "- R$ 0,08"), `lerReais("1,50")`.
- [x] `src/domain/configuracoes.ts` (+ teste) -- `APARENCIAS`, padrões, `validarLimiteAjuste`, `validarToleranciaAtraso`.
- [x] `src/domain/mensagens.ts` (+ teste) -- códigos e rótulos novos, incluindo a nota do Ciclo.
- [x] `src/data/ciclo-repo.ts`, `configuracoes-repo.ts` (+ testes com cliente falso).
- [x] `src/features/configuracoes/SecaoCiclo.tsx`, `SecaoConferencia.tsx`, `SecaoAparencia.tsx`, `secoes.ts` (+ teste), `page.tsx`.
- [x] `src/app/globals.css`, `src/ui/contraste.ts`, `src/ui/tokens.test.ts` -- escuro em `@media … { :root:not([data-tema="claro"]) }` e em `:root[data-tema="escuro"]`, com `color-scheme` fixo em cada um; teste exige os dois blocos escuros iguais.
- [x] `src/features/configuracoes/AplicarTema.tsx` em `src/app/(app)/layout.tsx`; `src/app/layout.tsx` -- lê o cookie `tema` e põe `data-tema` no `<html>`; o componente aplica `aparencia` do Realtime em `document.documentElement` e grava o cookie.
- [x] `src/data/database.types.ts` -- tabela e colunas novas.
- [x] `test/integracao/ciclo.test.ts` -- RLS de `config_ciclo`, recusa de update/delete e de `vigente_desde` passado, padrões e checks das colunas novas, Realtime de `aparencia`.

**Acceptance Criteria:**
- Given dois aparelhos em Configurações, when Rafael salva o Ciclo, a Aparência ou Conferência e atraso num deles, then o outro mostra sem recarregar.
- Given uma configuração já em vigor, when Rafael muda o fechamento, then a linha antiga continua igual no banco e `mesDoLancamento` de datas do Ciclo atual não muda.
- Given Aparência = Escuro e o sistema claro, when o app carrega, then o tema é escuro desde a primeira pintura.
- Given o CI, when o job `supabase` roda, then a migração aplica do zero, a integração passa e os tipos batem.

## Implementation Notes

- `vigenteDesdeDaMudanca(hoje, configs, nova)` recebe também os dias novos: sem configuração anterior, o "Mês de hoje" depende deles (02/11/26 com F=28, V=6 → 2026-12). Junto vieram `planejarMudancaCiclo` (valida os dias, calcula `vigente_desde` e devolve `null` quando os dias já são os que valeriam naquele Mês) e `resumoDoCiclo` (o que vale hoje e a mudança já salva, para a tela).
- `configVigente`: "antes da primeira, vale a primeira" escolhe a mais nova entre as linhas do menor `vigente_desde` (mesmo desempate por `created_at`).
- `mesDoLancamento` e `vencimentoDoMes` devolvem `Resultado` (`ciclo.sem_configuracao`, `ciclo.data_invalida`, `ciclo.mes_invalido`).
- Tema: além de `data-tema` no `<html>`, `src/app/layout.tsx` usa `generateViewport` para o `<meta name="color-scheme">` seguir o cookie (`light`, `dark` ou `light dark`). Helpers em `src/features/configuracoes/tema.ts`. Conferido com `next start` e `curl` com o cookie `tema`.
- Conferência e atraso grava as duas colunas em sequência (sem linha, a primeira gravação a cria); o repositório pula a que não mudou.
- Testes de integração (`test/integracao/ciclo.test.ts`) não rodaram localmente (sem Docker); rodam no job `supabase` do CI.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Erro de digitação na primeira configuração não se corrige no Ciclo atual (blind) | low | Decisão de Rafael: só a primeira vale já; corrigir pedia ramo novo; ainda não há Lançamentos manuais e o próximo Ciclo já corrige | rejeitado |
| 2 | Primeira pintura certa só com o cookie no aparelho (blind, edge) | low | Aparelho novo pisca uma vez até o Realtime; Design Notes já dizem que o cookie é só para a primeira pintura | rejeitado |
| 3 | `cookies()` no layout raiz deixa toda rota dinâmica (blind) | low | O build mostra que as rotas já eram dinâmicas (sessão); o service worker da 1.9 guarda o casco | rejeitado |
| 4 | Sair não apaga o cookie `tema` (blind) | low | Usuário único; só o tema da tela Entrar | rejeitado |
| 5 | Cookie sem `secure`; renovação dependente do efeito (blind) | low | Cookie não sensível; reescrito sempre que a Aparência carrega | rejeitado |
| 6 | Conferência grava em duas escritas; salvamento pela metade (blind, edge) | medium | `SecaoConferencia.salvar` chama `definirLimiteAjuste` e depois `definirToleranciaAtraso` | patch |
| 7 | `hoje` congelado na seção do Ciclo e outro `hoje` no salvar (blind, edge, vg) | low | `useState(() => hojeEmSaoPaulo(...))` × `hojeEmSaoPaulo(new Date())` em `salvar`; correção direta | patch |
| 8 | Sem retorno visual após salvar (blind) | low | A linha "A partir de" e os campos mostram o resultado; padrão das seções anteriores | rejeitado |
| 9 | Desempate por `Date.parse` perde microssegundos (blind, edge) | low | Duas inserções no mesmo milissegundo são improváveis; correção exige id no tipo | rejeitado |
| 10 | Só RLS impede update/delete em `config_ciclo` (blind) | low | `service_role` ignora RLS em tudo; o app nunca usa | rejeitado |
| 11 | `ciclo.vigente_no_passado` vira `salvar.falhou` (blind, edge) | low | `ciclo-repo.inserir` devolve `FALHOU` para qualquer erro; mensagem existe sem uso | patch |
| 12 | Seções novas sem teste de componente (blind, vg) | medium (não verificado) | Sem jsdom no Vitest; lógica de risco testada no núcleo e repo | defer |
| 13 | `lerTokens` sensível à grafia das aspas (blind) | low | Reformatação hipotética; o teste falharia alto | rejeitado |
| 14 | Tokens escuros duplicados no `globals.css` (blind) | false | Duplicação prevista na spec, com teste de igualdade | rejeitado |
| 15 | spec `in-review` × sprint `in-progress` (blind) | false | O fluxo só move o sprint para `done` no fechamento | rejeitado |
| 16 | Assinatura de `vigenteDesdeDaMudanca` difere da spec (blind) | low | A correção seria editar a spec; terceiro parâmetro é necessário para a primeira gravação | rejeitado |
| 17 | `??` redundante, alias e mensagens repetidas (blind) | low | Cosmético | rejeitado |
| 18 | `AplicarTema` e sua montagem sem teste (vg) | medium | Nenhum teste executa o efeito nem a montagem | patch |
| 19 | Cookie no layout raiz e `generateViewport` sem teste (vg) | medium | Nenhum teste importa `src/app/layout.tsx` | patch |
| 20 | Duas mudanças de Aparência recusadas desfazem para valor não salvo (edge) | low | Mesma corrida aceita na 1.6 (#18); usuário único | rejeitado |
| 21 | Campo não tocado da Conferência sobrescreve outro aparelho (edge) | low | Usuário único, dois aparelhos editando o mesmo campo ao mesmo tempo | rejeitado |
| 22 | Primeira configuração em dois aparelhos ao mesmo tempo (edge) | low | Corrida improvável com um usuário | rejeitado |
| 23 | Integração instável na virada do mês em São Paulo (edge) | low | Só se o CI rodar à meia-noite do dia 1º | rejeitado |

## Design Notes

Exemplo do núcleo (fechamento do Mês e busca do Mês):

```ts
fechamentoDoMes("2026-12", { dia_fechamento: 28, dia_vencimento: 6 }) // "2026-11-28"
mesDoLancamento("2026-11-29", configs) // tenta Mês(data)−1 … até achar fechamento ≥ data → "2027-01"
```

A busca começa dois Meses antes do mês da data e anda para frente; como o fechamento do Mês M fica em M ou M−1, termina em até quatro passos. Com mudança de fechamento, a regra "menor M com fechamento ≥ data" resolve Ciclo mais longo (sem buraco) e mais curto (pode ficar vazio) sem caso especial.

O tema usa cookie só para a primeira pintura; a verdade é `configuracoes.aparencia` (vale em todos os aparelhos). Sem sessão (Entrar), segue o cookie ou o sistema.

## Verification

**Commands:**
- `npx tsc --noEmit`, `npx vitest run`, `npx eslint .` -- expected: verde.
- CI (lint, typecheck, testes, build, job `supabase`) -- expected: verde.

**Manual checks (if no CLI):**
- Depois do `db push`: duas abas em Configurações, mudar Aparência e ver a outra trocar de tema; salvar o Ciclo e ver "A partir de …".
