---
title: 'História 1.5: Cadastrar Tipos'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'e861d25f106a8585af67c5c3ebfd29a93ec20b73'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-cadastrar-responsaveis-com-cor-sincronizados-entre-aparelhos.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael ainda não tem onde cadastrar os Tipos de gasto (Casa, Gatos, Viagem…), que vão classificar cada Lançamento.

**Approach:** Copiar o padrão da 1.4: migração `tipos` (dono, RLS, `updated_at` do banco, `replica identity full`, publicação Realtime), regras puras no núcleo, repositório que grava só as colunas alteradas, leitura pelo gerenciador único de Realtime e uma seção Configurações → Tipos com lista simples (criar, renomear, arquivar, desarquivar).

## Boundaries & Constraints

**Always:**
- Mesmas regras da 1.4: regras só no núcleo e testadas; tela lê por `useLinhas("tipos")` e grava só pelo repositório; otimismo desfeito com toast `salvar.falhou` quando o banco recusa; textos em `mensagens.ts`.
- Nome: sem espaços nas pontas, 1 a 30 caracteres (contados por caractere), único entre os não arquivados sem diferenciar maiúsculas e acentos. A regra de nome é compartilhada entre Responsáveis e Tipos (uma função só no núcleo).
- Lista de Configurações: ativos em ordem alfabética (pt-BR) e, no fim, os arquivados com a etiqueta "Arquivado" e "Desarquivar" no ⋯. Desarquivar recusa nome repetido de um ativo.
- Configurações ganha a seção "Tipos" na lista à esquerda; a seção escolhida aparece à direita e fica destacada.

**Never:**
- Excluir Tipo ou substituir Tipo em uso (História 1.6); ordem manual, cor ou ícone de Tipo; mudar o comportamento de Responsáveis.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vazio | Nenhum Tipo | Texto curto convidando a criar o primeiro Tipo e "＋ Novo" | N/A |
| Criar | "＋ Novo", nome "Casa" | Entra na lista em ordem alfabética; o outro aparelho mostra sem recarregar | Vazio, longo ou repetido: mensagem no campo, nada grava |
| Renomear | Edita e sai do campo (ou Enter) | Grava só `nome`; Esc desfaz o rascunho | Recusa do banco: volta o nome + toast |
| Arquivar | ⋯ → Arquivar | Vai para o fim com "Arquivado"; some de `ativos` | Recusa: volta + toast |
| Desarquivar | ⋯ → Desarquivar | Volta aos ativos | Nome igual a um ativo: toast `tipo.nome_repetido`, nada grava |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261102120000_responsaveis.sql` -- modelo: reusar `public.definir_updated_at()` (já existe; não recriar), mesmas 4 políticas, `replica identity full`, publicação. Sem coluna `ordem`/`cor`.
- `src/domain/responsaveis.ts` -- `chaveDoNome`, `validarNome`, `validarDesarquivar`, `ativos`, `ordenarParaConfiguracoes`. Extrair a parte de nome para um módulo comum e fazer Responsáveis usá-lo sem mudar o comportamento nem os testes existentes.
- `src/data/realtime.ts` (`gerenciador`, `useLinhas`, tipos por `Database`) e `src/data/responsaveis-repo.ts` (`gravarComOtimismo`, `colunasAlteradas`) -- modelo do repositório de Tipos; o gerenciador é genérico, não mudar.
- `src/features/configuracoes/SecaoResponsaveis.tsx`, `LinhaResponsavel.tsx` -- modelo da tela (rascunho no blur, Esc, `MenuAcoes`, estados carregando/erro/vazio).
- `src/app/(app)/configuracoes/page.tsx` -- hoje só Responsáveis com link `#titulo-responsaveis`. Passar a escolher a seção por `searchParams` (`?secao=tipos`; padrão Responsáveis); ler o guia de `searchParams` em `node_modules/next/dist/docs/` (é Promise no Next 16).
- `src/data/database.types.ts` -- gerado de produção (formato do `--linked`). Acrescentar `tipos` à mão no mesmo formato; o CI compara o conteúdo normalizado com o Supabase local. Depois do `db push`, regerar com `--linked`.
- `test/integracao/responsaveis.test.ts` -- modelo. O teste de Realtime precisa regravar até o evento chegar e a gravação precisa de `.then()`/`await` (o supabase-js só envia a consulta assim).
- Vitest roda em `node`, sem DOM; no macOS `tsc`/`vitest` completos falham pelo conflito `Toast.tsx`/`toast.ts` (rodar os testes por pasta).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_tipos.sql` -- tabela `tipos` (`id`, `owner_id default auth.uid()`, `nome` com check de 1..30 e sem espaços nas pontas, `arquivado`, `created_at`, `updated_at`), gatilho com `definir_updated_at()`, RLS, `replica identity full`, publicação.
- [x] `src/domain/nome-cadastro.ts` (+ teste) -- `chaveDoNome` e validação de nome comum (códigos de erro por cadastro); `src/domain/responsaveis.ts` passa a usá-la.
- [x] `src/domain/tipos.ts` (+ teste) -- `validarNomeTipo`, `ativos` (alfabética), `ordenarParaConfiguracoes`, `validarDesarquivarTipo`.
- [x] `src/data/tipos-repo.ts` (+ teste com cliente falso) -- criar, atualizar só colunas alteradas, arquivar, desarquivar.
- [x] `src/features/configuracoes/SecaoTipos.tsx`, `LinhaTipo.tsx` -- lista simples com os estados e o ⋯.
- [x] `src/app/(app)/configuracoes/page.tsx` -- seções Responsáveis e Tipos por `?secao=`, com `aria-current="page"` na escolhida.
- [x] `src/domain/mensagens.ts` (+ teste) -- códigos `tipo.*` (vazio, longo, repetido, nao_arquivado, lista_vazia) e rótulo "Tipos".
- [x] `src/data/database.types.ts` -- tabela `tipos`.
- [x] `test/integracao/tipos.test.ts` -- dono e `updated_at` pelo banco, outro usuário não lê/altera/apaga, nome inválido recusado, evento Realtime chega a outro cliente do mesmo dono.

**Acceptance Criteria:**
- Given dois aparelhos em Configurações → Tipos, when Rafael cria, renomeia ou arquiva num deles, then o outro mostra a mudança sem recarregar.
- Given os testes de Responsáveis da 1.4, when a regra de nome é extraída, then todos continuam passando sem mudar a expectativa.
- Given o CI, when o job `supabase` roda, then a migração aplica do zero, a integração passa e os tipos batem.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | `tipos` sem índice em `owner_id`; RLS e Realtime filtram por ele (blind) | low | `responsaveis` tem o índice do `unique (owner_id, cor)`; `tipos` não; correção direta | patch |
| 2 | Nome único só no cliente; corrida entre aparelhos (blind, edge ×2) | low | carried: mesmo veredito da 1.4 (#4): usuário único, corrida no mesmo segundo | rejeitado |
| 3 | `tipos-repo.ts` copia a gravação otimista de `responsaveis-repo.ts` e importa `ResultadoGravacao` de lá (blind) | medium | A 1.6 (Status) faria a terceira cópia; extrair o ajudante para um módulo comum de `src/data` | patch |
| 4 | Teste do repositório sem cliente nulo, id fora da memória e exceção (blind) | low | Ramos de falha da única porta de gravação; testes diretos | patch |
| 5 | Falta teste de A mudar `owner_id` da própria linha para B (blind) | low | O `with check` cobre, mas nada prova; teste direto | patch |
| 6 | Testes de integração dependem da ordem; `alvo` sem asserção; Realtime sem limpeza no timeout (blind, edge, verification-gap) | low | Falha em cascata esconde a causa; correções diretas (linha própria, `expect(error)`, `finally`) | patch |
| 7 | Escolha da seção por `?secao=` sem teste (blind, verification-gap) | medium | Inverter `ativa` ou tirar o padrão não quebra nada; extrair a função pura e testar | patch |
| 8 | `maxLength={60}` com limite de 30 (blind) | false | carried: 1.4 (#10), proposital para mostrar a mensagem em vez de cortar | rejeitado |
| 9 | Tipo arquivado pode ser renomeado para o nome de um ativo (blind) | low | Inofensivo: desarquivar recusa com mensagem | rejeitado |
| 10 | Status da spec e do sprint-status divergem (blind) | false | O sprint-status é sincronizado no passo de apresentação | rejeitado |
| 11 | `responsaveis.ts` reexporta `NOME_MAX` e `chaveDoNome` (blind) | low | Mantém os imports da 1.4; sem efeito para o usuário | rejeitado |
| 12 | Regerar `database.types.ts` depois do `db push` não está registrado (blind) | false | Faz parte do fluxo pedido (passo depois do merge) | rejeitado |
| 13 | Texto digitado enquanto "Adicionar" grava é apagado (edge) | low | Correção direta: campo desativado enquanto grava | patch |
| 14 | Rascunho inválido fica no campo ao sair dele (edge) | low | carried: 1.4 (#26), proposital | rejeitado |
| 15 | Ligação da tela de Tipos às regras do núcleo sem teste (verification-gap) | low | Sem DOM no Vitest; já no deferred-work da 1.4 (testes com DOM) | defer |

## Verification

**Commands:**
- `npx vitest run src/domain src/data test` e `npx eslint .` -- expected: verde.
- CI (lint, typecheck, testes, build e job `supabase`) -- expected: verde.

**Manual checks (if no CLI):**
- Depois do merge e do `db push`: duas abas em Configurações → Tipos, criar/renomear/arquivar e ver a outra mudar.
