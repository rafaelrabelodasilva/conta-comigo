---
title: 'História 1.4: Cadastrar Responsáveis com cor, sincronizados entre aparelhos'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'b276dd81b60d78cab95ceb1b535c3b58d8a7b46c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Não existe nenhuma tabela nem tela de dados. Rafael precisa cadastrar os Responsáveis (cada um com uma das 8 cores de pessoa) e ver a mudança no outro aparelho na hora; e as próximas histórias precisam de um padrão de tabela, repositório e Realtime para copiar.

**Approach:** Primeira migração (`responsaveis` com dono, RLS, `replica identity full`, `updated_at` do banco, publicação Realtime e RPC de reordenação), regras puras do cadastro no núcleo, gerenciador único `src/data/realtime.ts` com hook, repositório que grava só as colunas alteradas, e a seção Configurações → Responsáveis.

## Boundaries & Constraints

**Always:**
- Regras (nome válido, cor livre, próxima cor, nova ordem) só em `src/domain/responsaveis.ts`, com teste; a tela e o SQL não as reimplementam (o banco só garante restrições).
- Telas leem só pelo hook do gerenciador; gravação só pelo repositório (`src/data`), mandando só as colunas alteradas; `updated_at` só pelo banco.
- Gerenciador: ouvintes antes do `subscribe()`, releitura completa a cada `SUBSCRIBED`, evento aplica só se `updated_at` for mais novo; lógica de mesclagem pura e testada.
- Otimismo desfeito quando o banco recusa, com toast "Não foi possível salvar. Tente de novo".
- Seletor de cor: 8 círculos de 24 px (toque 44 px), ✓ e anel na escolhida, cores em uso por outro Responsável desativadas, rótulo de VoiceOver com o nome da cor.

**Never:**
- Excluir Responsável e substituir cadastro em uso (História 1.6); Tipos, Status, Ciclo (1.5–1.7); detector de conexão e modo sem internet (1.9).
- Chamar `supabase.from()` em tela; aplicar migração em produção antes do merge; alterar schema pelo painel.
- Mais de 8 cores ou paleta personalizada (adiado).

**Decisões do Rafael (02/11):**
- Arquivado continua com a cor reservada: no máximo 8 Responsáveis ao todo, arquivados incluídos.
- Com as 8 cores em uso, "＋ Novo" fica desativado com o aviso "Todas as 8 cores estão em uso".
- Reordenar pelo ⋯: "Mover para cima" e "Mover para baixo" (sem arrastar).
- Arquivados ficam no fim da lista de Configurações, com a etiqueta "Arquivado" e "Desarquivar" no ⋯.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Criar | "＋ Novo", nome "Lucas" | Linha nova no fim, com a primeira cor livre | Nome vazio ou repetido (sem diferenciar maiúsculas e acentos): mensagem no campo, nada grava |
| Trocar cor | Toque numa cor livre | Grava só `cor`; o outro aparelho atualiza | Cor em uso: círculo desativado |
| Renomear | Edita o nome e sai do campo | Grava só `nome` | Recusa do banco: volta o nome anterior + toast |
| Reordenar | ⋯ → "Mover para cima/baixo" | Ordem trocada nos dois aparelhos | Primeiro não sobe, último não desce |
| Evento velho | Evento com `updated_at` ≤ o da memória | Ignorado | N/A |
| Reconectar | Canal volta a `SUBSCRIBED` | Relê a tabela inteira | Falha ao ler: "Não foi possível carregar." + "Tentar de novo" |

</frozen-after-approval>

## Code Map

- `supabase/migrations/` -- vazio (só README). Primeira migração aqui; README fala em `supabase start`, que exige Docker (só no CI).
- `supabase/config.toml` -- `[realtime] enabled = true`, Postgres 17. Sem mudança.
- `.github/workflows/ci.yml` -- job `supabase` sobe o local e roda `test/integracao` com `INTEGRACAO_SUPABASE=1`. Estender: aplicar migrações (o `start` já aplica), testes novos e conferir `database.types.ts` contra `supabase gen types typescript --local`.
- `test/integracao/auth.test.ts` -- padrão para criar usuário pela admin API, entrar e limpar. Reusar o jeito (`variavel`, `semSessao`).
- `src/data/supabase/navegador.ts` (`criarClienteNavegador`, pode devolver `null`) -- cliente do gerenciador. Não mudar.
- `src/data/supabase/servidor.ts` (`temSessao`) -- guarda das páginas.
- `src/app/(app)/configuracoes/page.tsx` -- hoje `EstadoVazio` + "Sair". Vira seções à esquerda (Responsáveis, Sair) e conteúdo à direita.
- `src/domain/mensagens.ts` -- mapa único; `salvar.falhou`, `carregar.falhou` já existem. Estender com os códigos de Responsável.
- `src/ui/`: `Campo`, `Botao`, `MenuAcoes` (⋯ + toque longo), `useToast`, `ErroAoCarregar`, `Esqueleto`, `EstadoVazio`, `Tela`. Reusar.
- `src/app/globals.css` -- tokens `person-N`, `person-N-fg/bg` (claro e escuro) já existem. `src/ui/tokens.test.ts` mede pares de contraste.
- `vitest.config.mts` -- ambiente `node`, sem DOM: lógica testável fica em funções puras.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_responsaveis.sql` -- tabela (`id uuid default gen_random_uuid()`, `owner_id default auth.uid()`, `nome text`, `cor smallint check 1..8`, `ordem integer`, `arquivado boolean default false`, `created_at`, `updated_at`), função genérica `definir_updated_at()` + gatilho, RLS com 4 políticas `owner_id = auth.uid()`, `replica identity full`, `alter publication supabase_realtime add table`, RPC `reordenar_responsaveis(ids uuid[])` (security invoker, devolve as linhas) -- AD-3/4/5/14/16.
- [x] `src/data/database.types.ts` -- tipos no formato do `supabase gen types`; CI confere -- AD-14.
- [x] `src/domain/responsaveis.ts` (+ teste) -- `CORES_PESSOA` (1..8 com nome), `validarNome`, `coresLivres`, `proximaCor`, `moverResponsavel`, `ativos` (sem arquivados, por ordem) -- regras puras.
- [x] `src/data/realtime.ts` (+ `realtime-estado.ts` puro com teste) -- gerenciador único por tabela: estado em memória, assinantes, `useLinhas(tabela)` via `useSyncExternalStore`, aplicar lote/evento por `updated_at`, otimismo com desfazer -- AD-4.
- [x] `src/data/responsaveis-repo.ts` -- criar, atualizar (só colunas alteradas), arquivar/desarquivar, reordenar (RPC); aplica a resposta no gerenciador -- AD-3.
- [x] `src/features/configuracoes/` -- `SecaoResponsaveis.tsx`, `SeletorCor.tsx`, `LinhaResponsavel.tsx` -- UX-DR25.
- [x] `src/app/(app)/configuracoes/page.tsx` -- seções à esquerda, Responsáveis à direita, "Sair" na lista.
- [x] `src/domain/mensagens.ts` (+ teste) -- códigos `responsavel.nome_vazio`, `responsavel.nome_repetido`, `responsavel.sem_cor_livre` e rótulos.
- [x] `test/integracao/responsaveis.test.ts` + `.github/workflows/ci.yml` -- RLS (outro usuário não lê nem grava), `owner_id` e `updated_at` pelo banco, `cor` fora de 1..8 recusada, evento Realtime chega a um segundo cliente, tipos gerados iguais.

**Acceptance Criteria:**
- Given dois aparelhos abertos em Configurações → Responsáveis, when Rafael cria, renomeia, troca a cor ou reordena num deles, then o outro mostra a mudança sem recarregar.
- Given um Responsável arquivado, when a lista de escolha (`ativos`) é montada, then ele não aparece, mas continua no banco.
- Given uma gravação, when o repositório chama o Supabase, then o corpo leva só as colunas alteradas.
- Given o CI, when o job `supabase` roda, then a migração aplica do zero e os testes de integração passam.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Releitura apaga linha criada ou recebida enquanto a leitura corria (blind, edge) | medium | `aplicarReleitura` monta o mapa só com as linhas lidas; `criar` aplicado durante o `select` some até o próximo evento | patch |
| 2 | Releitura durante gravação otimista pendente pisca o valor antigo (blind, edge) | low | Só numa reconexão no meio de uma gravação; a resposta do banco corrige; correção exige rastrear pendências | rejeitado |
| 3 | Duas gravações otimistas na mesma linha, ambas recusadas, deixam o 2º valor na tela (edge) | low | Raro (duas edições seguidas recusadas); a próxima releitura corrige; correção exige pilha de desfazer | rejeitado |
| 4 | Nome único só no cliente; corrida entre aparelhos (blind, edge) | low | Usuário único; corrida exige criar o mesmo nome em dois aparelhos no mesmo segundo; índice com `unaccent` exige extensão e função imutável | rejeitado |
| 5 | Todo erro do banco vira "Não foi possível salvar"; sem conexão sem mensagem própria (blind, edge) | low | A intenção pede exatamente `salvar.falhou`; sem conexão é da 1.9 | rejeitado |
| 6 | Estado e canal do Realtime não são zerados ao Sair (blind, edge, verification-gap) | maybe-false | Usuário único; resolveria sair e entrar sem recarregar e ver se o canal continua recebendo eventos com o token novo | defer (medium não verificado) |
| 7 | Comentário da migração diz "linha antiga completa", mas com RLS o DELETE traz só a chave e não é filtrado por dono; falta teste de que B não recebe eventos de A (blind) | medium | Comportamento documentado do Supabase; a separação entre donos no Realtime não tem teste | patch |
| 8 | Testes de integração dependem da ordem (blind) | low | Vitest roda na ordem do arquivo; reestruturar não é correção direta | rejeitado |
| 9 | Promessa `soltar`/`espera` sem efeito no teste do repositório (blind, verification-gap) | low | Código morto; remoção direta | patch |
| 10 | `maxLength={60}` com limite de 30 (blind) | false | Proposital: deixa digitar além e mostra "Use até 30 caracteres" em vez de cortar calado | rejeitado |
| 11 | Regex de acentos com caracteres combinantes literais (blind) | low | Invisível na revisão; troca direta por `\u0300-\u036f` | patch |
| 12 | Textos de tela fora de `mensagens.ts`; "＋" lido pelo VoiceOver (blind) | low | Regra da 1.3: textos saem de `mensagens.ts`; correção direta | patch |
| 13 | Seletor com `role="radio"` sem setas nem tabindex móvel; cores em uso somem do foco (blind) | medium | Padrão ARIA de radio incompleto; correção direta: botões com `aria-pressed` e `aria-disabled` | patch |
| 14 | Configurações sem layout de celular; "Sair" sem `Botao` (blind) | false | Abaixo de 700 px o layout mostra só o aviso; o foco usa o `:focus-visible` global | rejeitado |
| 15 | Componentes novos sem teste (blind) | low | Sem DOM no Vitest (adiado na 1.3); a regra de desarquivar vai para o núcleo (#22) | defer |
| 16 | Conexão perdida depois de carregar não avisa (blind) | low | Faixa "Sem conexão" é da 1.9 (fora da intenção) | rejeitado |
| 17 | `created_at` e `id` aceitos do cliente (blind) | low | Sem efeito para o usuário; ninguém os envia | rejeitado |
| 18 | RPC aceita ids repetidos ou lista parcial (blind, edge) | low | Só o núcleo chama, com a lista ativa completa | rejeitado |
| 19 | CLI do Supabase não fixada no CI (blind) | false | `supabase` 2.122.0 está em devDependencies; `npx` usa a local | rejeitado |
| 20 | `CLOSED` antes do `SUBSCRIBED` deixa o esqueleto para sempre (edge) | low | Correção direta: incluir `CLOSED` na condição | patch |
| 21 | Releitura que falha depois de pronto troca a lista pela tela de erro (edge) | medium | `reler` marca `erro` mesmo com dados válidos na memória; correção direta | patch |
| 22 | Regra de desarquivar (nome repetido) só na tela e sem teste (verification-gap) | medium | Remover a chamada não quebra nenhum teste; levar a regra ao núcleo com teste | patch |
| 23 | `removeChannel` que rejeita em `recarregar` vira rejeição sem tratamento (edge) | low | Correção direta: `try/finally` | patch |
| 24 | RPC devolve `[]` e o otimismo fica (edge) | false | `[]` só quando o banco já tem essas ordens, iguais às otimistas; linhas de outro dono nunca estão na memória | rejeitado |
| 25 | Nome com emoji: núcleo conta UTF-16, banco conta caracteres (edge) | low | Correção direta: contar com `[...limpo].length` | patch |
| 26 | Rascunho inválido fica no campo ao sair dele (edge) | low | Proposital: o erro fica até corrigir ou apertar Esc | rejeitado |
| 27 | DELETE do usuário B sem asserção (edge) | low | Correção direta: conferir que nada foi apagado | patch |
| 28 | Formato real do `updated_at` do Realtime nunca é lido por `instanteMicros` (verification-gap) | medium | Integração só confere `toBeTruthy`; se o formato não casar, todo evento é ignorado sem teste falhar | patch |
| 29 | Ramo de erro do canal e reabertura do "Tentar de novo" sem teste (verification-gap) | medium | Nenhum teste manda `CHANNEL_ERROR` antes do `SUBSCRIBED` nem chama `recarregar` desconectado | patch |

## Design Notes

Cor guardada como número (1..8) e mapeada para os tokens `person-N`; o ✓ usa a cor com contraste ≥ 3:1 sobre cada `person-N` (medido em `tokens.test.ts`). Nome: sem espaços nas pontas, 1 a 30 caracteres, único entre os não arquivados comparando sem maiúsculas e acentos. Ordem nova = maior + 1.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `npm run build` -- expected: conclui sem as variáveis do Supabase.
- CI job `supabase` -- expected: migração aplica, integração verde, tipos sem diferença.

**Manual checks (if no CLI):**
- Depois do merge e do `db push`: PC e iPad (ou duas abas) em Configurações → Responsáveis, criar/renomear/trocar cor/reordenar/arquivar e ver o outro mudar.
