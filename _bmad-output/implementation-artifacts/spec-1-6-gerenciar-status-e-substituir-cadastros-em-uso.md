---
title: 'História 1.6: Gerenciar Status e substituir cadastros em uso'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '797456835fc93e535ff4c2b08dfebc7ae6d2870a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-cadastrar-tipos.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não tem onde cadastrar os Status (Não pago, Pago…) nem dizer quais contam como pago, e não consegue excluir Responsáveis, Tipos ou Status. Além disso, `tsc` e `vitest` falham no macOS porque `src/ui/Toast.tsx` e `src/ui/toast.ts` diferem só em maiúsculas.

**Approach:** Copiar o padrão da 1.5 para a tabela `status` (com `conta_como_pago`) e criar `configuracoes` (uma linha por dono, `status_padrao_id` anulável). Criar a RPC `substituir_cadastro(cadastro, de_id, para_id)`, que numa transação troca o id em todas as referências listadas e apaga o cadastro, e a lista de referências no núcleo (`REFERENCIAS_COLUNAS` e `REFERENCIAS_JSONB`), comparada com a do banco por teste. Configurações ganha a seção Status e "Excluir" no ⋯ das três seções. Renomear `src/ui/toast.ts` para `src/ui/toast-estado.ts`.

## Boundaries & Constraints

**Always:**
- Regras de Status iguais às de Tipos (nome comum de `nome-cadastro.ts`, ordem alfabética, arquivados no fim, desarquivar sem nome repetido), com códigos `status.*`.
- Cada linha de Status: nome editável, chave "Conta como pago" e "N registros" (contagem de uso). Acima da lista, o seletor "Status padrão das linhas novas" com "Nenhum (não pago)" e os Status ativos.
- Excluir (⋯ → Excluir) em Responsáveis, Tipos e Status: sem uso → confirmação → exclui. Em uso → janela "N registros usam “X”" com seletor de substituto (ativos do mesmo cadastro, sem ele mesmo), "Substituir e excluir", "Arquivar" e "Cancelar".
- Status padrão excluído: o padrão passa a ser o substituto; sem substituto, vira "Nenhum". O padrão não conta como uso. Arquivar o Status padrão é recusado ("Escolha outro Status padrão antes de arquivar").
- Responsável, Tipo e Status nunca são apagados com `delete` direto pelo app: só pela RPC. A RPC é `security invoker`, confere dono, cadastro e substituto (mesmo cadastro, ativo, diferente do excluído) e recusa `para_id` nulo se houver uso.
- Hoje as únicas referências são `configuracoes.status_padrao_id` (coluna, não conta uso); `REFERENCIAS_JSONB` nasce vazia. Toda história que criar referência a esses cadastros acrescenta-a à função SQL `referencias_cadastro()` e à constante do núcleo; o teste de integração exige que as duas listas sejam iguais.
- Renomear nunca pede substituto.

**Never:**
- Contagem de uso em Responsáveis e Tipos (só Status mostra); mudar outros comportamentos de Responsáveis e Tipos; colunas de Ciclo/Aparência em `configuracoes` (História 1.7); Primeiro uso.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Criar Status | "＋ Novo", "Pago" | Entra em ordem alfabética, "Conta como pago" desligado | Nome inválido: mensagem no campo |
| Conta como pago | Liga a chave | Grava só `conta_como_pago`; outro aparelho vê | Recusa: volta + toast |
| Padrão | Escolhe "Pago" | `configuracoes.status_padrao_id` = Pago (cria a linha se faltar) | Recusa: volta + toast |
| Excluir sem uso | ⋯ → Excluir → confirma | Some da lista em todos os aparelhos | Recusa: fica + toast |
| Excluir em uso | 3 registros, escolhe "Pago" | Referências passam a "Pago"; o excluído some | Sem substituto: botão desativado |
| Excluir o padrão | "Pago" é o padrão, sem uso | Excluído; padrão vira "Nenhum" | N/A |
| Arquivar o padrão | ⋯ → Arquivar | Nada grava | Toast `status.padrao_nao_arquiva` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261102130000_tipos.sql` -- modelo da tabela `status` (reusar `public.definir_updated_at()`, 4 políticas, índice em `owner_id`, `replica identity full`, publicação).
- `supabase/migrations/20261102120000_responsaveis.sql` -- modelo de RPC (`reordenar_responsaveis`: `security invoker`, `set search_path = ''`, `revoke … from public, anon`, `grant … to authenticated`).
- `src/domain/tipos.ts`, `nome-cadastro.ts`, `mensagens.ts` -- modelo do núcleo de Status e dos códigos/rótulos.
- `src/data/tipos-repo.ts`, `gravacao.ts` (`gravarComOtimismo`), `realtime-estado.ts` (`colunasAlteradas`, `aplicarEvento` com DELETE) -- modelo dos repositórios. `realtime.ts`: acrescentar só `remover(ids)` ao `Gerenciador` (aplica DELETE na memória), para o excluído sumir sem esperar o evento.
- `src/features/configuracoes/SecaoTipos.tsx`, `LinhaTipo.tsx`, `SecaoResponsaveis.tsx`, `LinhaResponsavel.tsx`, `secoes.ts` + `page.tsx` -- telas; acrescentar `status` às seções (`?secao=status`).
- `src/ui/ConfirmarAcao.tsx`, `Janela.tsx`, `MenuAcoes.tsx` (`destrutivo`) -- confirmação e janela de substituição; o seletor é `<select>` nativo com o visual de `Campo`.
- `src/ui/toast.ts`, `toast.test.ts` → `toast-estado.ts`, `toast-estado.test.ts`; importado só por `src/ui/Toast.tsx`.
- `src/data/database.types.ts` -- acrescentar `status`, `configuracoes` (com `Relationships`) e as funções novas à mão no formato `--linked`; o CI compara com o gerado do Supabase local e mostra a diferença.
- `test/integracao/tipos.test.ts` -- modelo dos testes de integração; `.github/workflows/ci.yml` -- nome do passo de integração.
- Postgres 17 (`supabase/config.toml`): FK composta com `on delete set null (coluna)` é suportada.

## Tasks & Acceptance

**Execution:**
- [x] `src/ui/toast-estado.ts` (+ teste) -- renomear de `toast.ts` e ajustar o import em `Toast.tsx`.
- [x] `supabase/migrations/<ts>_status_configuracoes.sql` -- `status` (`nome`, `conta_como_pago`, `arquivado`, `unique (owner_id, id)`); `configuracoes` (`id`, `owner_id unique default auth.uid()`, `status_padrao_id`, FK `(owner_id, status_padrao_id) → status (owner_id, id) on delete set null (status_padrao_id)`), ambas com RLS, gatilho, Realtime; funções `referencias_cadastro()`, `trocar_id_jsonb(doc, de, para)`, `contar_usos_cadastro(cadastro)` e `substituir_cadastro(cadastro, de_id, para_id)`.
- [x] `src/domain/status.ts` (+ teste) -- `validarNomeStatus`, `ativos`, `ordenarParaConfiguracoes`, `validarDesarquivarStatus`, `validarArquivarStatus(status, padraoId)`.
- [x] `src/domain/cadastros.ts` (+ teste) -- `Cadastro`, `TABELA_DO_CADASTRO`, `REFERENCIAS_COLUNAS`, `REFERENCIAS_JSONB`, `opcoesDeSubstituto`, `validarExclusao(usos, paraId, opcoes)`.
- [x] `src/domain/mensagens.ts` (+ teste) -- códigos `status.*`, `cadastro.*` e rótulos.
- [x] `src/data/realtime.ts` (+ teste) -- `remover(ids)`.
- [x] `src/data/status-repo.ts`, `configuracoes-repo.ts`, `cadastros-repo.ts` (+ testes com cliente falso) -- Status como Tipos + `conta_como_pago`; `definirStatusPadrao` por upsert em `owner_id`; `contarUsos` e `excluir(cadastro, deId, paraId)` pela RPC, que remove da memória.
- [x] `src/features/configuracoes/SecaoStatus.tsx`, `LinhaStatus.tsx`, `ExcluirCadastro.tsx` + Excluir no ⋯ de `LinhaTipo`/`LinhaResponsavel` -- telas.
- [x] `src/features/configuracoes/secoes.ts` (+ teste), `src/app/(app)/configuracoes/page.tsx` -- seção Status.
- [x] `src/data/database.types.ts` -- tabelas e funções novas.
- [x] `test/integracao/status.test.ts`, `test/integracao/substituir-cadastro.test.ts` -- RLS e Realtime de `status`/`configuracoes`; RPC: exclui sem uso, troca `status_padrao_id` pelo substituto, anula sem substituto, recusa substituto arquivado/de outro cadastro/de outro dono, não toca cadastro de outro dono; `trocar_id_jsonb` em objeto, lista, chave e aninhado; `referencias_cadastro()` igual às constantes do núcleo.

**Acceptance Criteria:**
- Given o macOS, when roda `npx tsc --noEmit` e `npx vitest run`, then os dois passam.
- Given dois aparelhos em Configurações → Status, when Rafael cria, renomeia, liga "conta como pago", escolhe o padrão ou exclui num deles, then o outro mostra sem recarregar.
- Given uma história futura que cria referência a um cadastro, when ela não a acrescenta às duas listas, then o teste de integração falha.
- Given o CI, when o job `supabase` roda, then a migração aplica do zero, a integração passa e os tipos batem.

## Implementation Notes

- Componente novo `src/ui/Seletor.tsx` (`<select>` nativo com o visual de `Campo`), usado no Status padrão e no substituto.
- `padraoVigente` (núcleo) mostra "Nenhum" se o padrão não for um Status ativo; `cadastros-repo.excluir` aplica já na memória o novo padrão depois de excluir o Status padrão (o evento do Realtime confirma).
- Na RPC, um documento jsonb que cite o excluído exige substituto mesmo sem `conta_uso` (não há como anular uma chave).
- Revisão: gatilho no banco recusa arquivar o Status padrão; `referencias_fk_nao_listadas()` (só `service_role`) faz o teste falhar quando uma FK nova para os cadastros fica fora da lista.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Arquivar o Status padrão só é recusado na tela; o banco aceita e o seletor mostra "Nenhum" (blind, edge, vg) | medium | Outro aparelho com memória velha arquiva; leitores futuros de `status_padrao_id` usariam um arquivado | patch (gatilho) |
| 2 | Contagem 0 velha: a RPC recusa `cadastro.em_uso` e só aparece toast (blind, edge) | low | Inalcançável hoje (nada conta uso); correção acrescenta ramo | rejeitado |
| 3 | DELETE entre aparelhos sem teste (blind, vg) | medium | AC 2 ("exclui… o outro mostra") sem prova; `esperarUpdate` só ouve UPDATE | patch |
| 4 | DELETE do Realtime chega a outros donos só com a chave (blind) | low | Já aceito e documentado na migração de Responsáveis; usuário único | rejeitado |
| 5 | `trocar_id_jsonb` e `referencias_cadastro` expostos como RPC (blind) | low | Funções puras/metadados, sem dados; exigidas pelo `security invoker` e pelos testes | rejeitado |
| 6 | FK futura entre contagem e delete vira `salvar.falhou` (blind) | low | Não há FK para cadastros hoje; o achado #7 obriga a listar FKs novas | rejeitado |
| 7 | Referência fora das duas listas não falha o teste; AC 3 não vale (vg, edge) | medium | O teste só compara SQL com núcleo | patch (`referencias_fk_nao_listadas`) |
| 8 | Caminhos "em uso" do SQL dinâmico sem teste (blind, vg) | medium (não verificado) | Sem referência que conta uso ou jsonb; a spec já previa o teste no Épico 2 | defer |
| 9 | Telas novas sem teste de componente (blind) | low | Sem DOM no Vitest; já no deferred-work da 1.3/1.4 | rejeitado |
| 10 | `last_updated` voltou no tempo; seções da spec vazias (blind) | low | Corrigido no fechamento (notas e data) | patch |
| 11 | `JanelaEmUso`: setState após fechar, `salvando` preso se lançar, pedido duplo (blind, edge) | low | `excluir` não lança (captura tudo); setState em desmontado é inofensivo no React 19 | rejeitado |
| 12 | Contagem buscada duas vezes, fica velha, falha sem aviso (blind, edge ×2) | low | Sempre 0 hoje; a spec define leitura ao abrir e após excluir | rejeitado |
| 13 | `maxLength={60}` com limite de 30 (blind) | false | carried: 1.4 (#10)/1.5 (#8), proposital | rejeitado |
| 14 | "Arquivar" oferecido na janela de em uso para o padrão ou já arquivado (blind, edge) | low | Inalcançável hoje; recusa com toast | rejeitado |
| 15 | jsonb sem `conta_uso` conta na RPC mas não em `contar_usos` (edge) | low | Nenhuma referência jsonb ainda; registrado em Implementation Notes | rejeitado |
| 16 | `trocar_id_jsonb` com `de` e `para` como chaves do mesmo objeto perde um valor (edge) | low | Sem referência jsonb hoje; a história de Fórmulas trata (AD-16) | rejeitado |
| 17 | `remover` × releitura em voo devolve a linha; desfazer otimista recria a excluída (edge, vg) | low | Corrida estreita, mesma do DELETE comum; correção exige lápides | rejeitado |
| 18 | Seleções rápidas do padrão fora de ordem (edge) | low | Usuário único, respostas em milissegundos | rejeitado |
| 19 | Nada impede voltar arquivo que difere só em maiúsculas (vg) | low | Teste direto e barato | patch |
| 20 | `SECOES` sem checagem contra `CHAVES_SECAO` (vg) | low | Tipagem direta | patch |

## Design Notes

A RPC percorre `referencias_cadastro()` com SQL dinâmico (`format('%I')` sobre a lista fixa): coluna → `update … set col = para where owner_id = auth.uid() and col = de`; jsonb → `set col = trocar_id_jsonb(col, de, para)`. `trocar_id_jsonb` troca o texto `"<de>"` por `"<para>"` no `jsonb::text` (ids são uuid minúsculos), cobrindo valores e chaves em qualquer forma. Sem substituto, referências que não contam uso viram `null`. Erros saem como `raise exception 'cadastro.em_uso'` (e afins) e o repositório mapeia para o código. A contagem é lida ao abrir a seção Status e ao pedir para excluir (não é tempo real; hoje é sempre 0, pois ainda não há Lançamentos). Por isso o caminho "em uso" (recusa sem substituto e contagem > 0) só tem teste no núcleo e no repositório com cliente falso; o teste de integração dele chega com a primeira referência que conta uso (Lançamentos, Épico 2).

## Verification

**Commands:**
- `npx tsc --noEmit`, `npx vitest run` e `npx eslint .` -- expected: verde no macOS.
- CI (lint, typecheck, testes, build e job `supabase`) -- expected: verde.

**Manual checks (if no CLI):**
- Depois do merge e do `db push`: duas abas em Configurações → Status, criar/renomear/ligar/escolher padrão/excluir e ver a outra mudar; excluir um Tipo e um Responsável sem uso.
