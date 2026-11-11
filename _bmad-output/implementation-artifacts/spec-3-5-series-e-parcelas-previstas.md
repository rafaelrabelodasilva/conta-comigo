---
title: 'História 3.5: Séries e parcelas previstas'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'cc2045ec4c6ccb3547b15c30df4b09dce490bec7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ao importar a parcela 05/10, as 06/10 a 10/10 não existem nos Meses seguintes: Rafael não vê o que vem pela frente e classifica a mesma compra de novo a cada Fatura (FR-44). Compras idênticas na mesma Fatura também não têm identidade própria.

**Approach:** A importação acha ou cria a Série de cada parcela n/N (chave `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)`, sem usar a data) e cria os previstos n+1/N a N/N (`lancado_por = 'sistema'`) com `mes = somarMeses(mes_origem, k)` (AD-8, AD-9). O previsto aparece com selo e origem; reclassificar a parcela pergunta se vale para os previstos. 

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** chave da Série, `ocorrencia`, geração dos previstos e a regra de propagar a classificação são funções de `src/domain/previstos.ts` (só imports relativos). A RPC só grava o que o núcleo calculou. Textos em `mensagens.ts`.
- **Chave sem data (pendência da 2.3):** `mes_primeira_parcela = somarMeses(Mês da Fatura, −(parcela_n − 1))`, `valor_parcela_centavos` = Valor da linha. `ocorrencia` = posição (1, 2, …) entre as linhas da mesma Fatura com o mesmo `normalizarNome`, `parcela_n`, `parcela_total` e Valor, na ordem da fatura. Só entram parcela com `parcela_n < parcela_total`, Valor > 0 e que não seja Ajuste.
- **Migração `supabase/migrations/…_series_previstos.sql` (AD-14):** tabela `series` (RLS por dono, `updated_at` pelo banco, `replica identity full`, chave única acima); em `lancamentos`, `serie_id` (chave composta por dono), `origem_lancamento_id` (`on delete set null`) e `dividido_de_id` (reservada à 3.8, `on delete cascade`); índice único parcial `(serie_id, parcela_n) where dividido_de_id is null and excluido_em is null`. Tipos de `database.types.ts` no formato do gerado.
- **Previsto:** mesmo Nome, Apelido, Valor, Tipo, Responsável, Observação e Status padrão da linha real já classificada pelas Regras; `data`, `ordem_fatura`, `final_cartao` e `fatura_id` nulos; `revisao_motivo` nulo (nunca entra na fila). Não duplica ao reinserir, mesmo que o previsto antigo tenha sido excluído (não ressuscita). Previstos saem da Conferência e do "Total a pagar" porque ambos filtram por `fatura_id`.
- **Telas:** selo "Previsto" junto do Nome (texto um pouco mais claro) na grade e no painel; origem no painel: "criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26". Mês futuro sem Fatura mostra os previstos na grade (`linhasDoMes` já os traz; o Realtime guarda só o Mês aberto).
- **Perguntar:** reclassificar a parcela usa `FaixaPergunta` ("Só este" / "Aplicar a todos"); aplicar grava só Responsável e Tipo dos previstos ainda `sistema` e não excluídos, sem ensinar Regra.
- **Reimportação (3.11 simplificada, validada):** continua apagando a Fatura e suas linhas; as Regras e as linhas manuais não são tocadas; o texto do aviso só ganha uma cláusula quando há previstos a apagar.
- **Decisão 1-A:** não criar previsto em Mês que já tem Fatura (`mesesComFatura`, lido de `gerenciador("faturas")`); só em Meses sem ela. A 3.6 cuida de casar o resto.
- **Decisão 2-A:** a linha real cuja `(serie_id, parcela_n)` já tem linha não excluída (previsto) faz a RPC recusar a importação inteira com `fatura.previstos_sem_casamento`; nada é gravado. Até a 3.6, importar um Mês que tem previstos fica bloqueado, e a mensagem diz isso.
- **Decisão 3-A:** a reimportação continua simplificada. Dentro da mesma transação apaga também os previstos `sistema` com `editado_em` nulo cujo `origem_lancamento_id` é uma linha apagada; os demais ficam e são religados à linha nova da mesma Série. A trava de linhas casadas e Pagamentos passa a ser da 3.6 (e da 3.12); registrar isso em `deferred-work.md`.
- **Decisão 4-A:** a pergunta "Só este / Aplicar a todos" aparece ao mudar Responsável ou Tipo já preenchidos (painel e "Mudar" do Revisar, com `FaixaPergunta`). Classificar parcela ainda vazia (✓, lote, "Mudar" de linha vazia) preenche sozinho os previstos também vazios, sem perguntar e sem ensinar Regra.
- Manter tudo da 2.3 à 3.4: hero, ordenação, Conferência e "verificar", filtros, painel e Ajustes, Regras, fila e lote.

**Never:** casar previsto com linha real (3.6); herdar sem previsto (3.7); Divisão (3.8); Apelido em massa (3.9); fazer a 3.12; `console.*`; `supabase.from()` em tela; apagar ou alterar dado de produção sem Rafael confirmar; mexer na pendência do VoiceOver.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Parcela 05/10 | importa out/26 | Série criada; previstos 06/10 a 10/10 em nov/26 a mar/27, `sistema`, mesmos dados | N/A |
| Última parcela | 10/10 | Série e linha ligadas; nenhum previsto | N/A |
| À vista / crédito / Ajuste | sem parcela, Valor ≤ 0 ou Ajuste | sem Série e sem previstos | N/A |
| Compras idênticas | duas linhas 03/10 do mesmo Nome e Valor na mesma Fatura | duas Séries, `ocorrencia` 1 e 2, cada uma com seus previstos | N/A |
| Reinserir | mesma parcela importada de novo (reimportação) | Série reaproveitada; previstos existentes mantidos e religados à linha nova; nada duplica | N/A |
| Previsto excluído | previsto 07/10 excluído, reimporta | continua excluído | N/A |
| Mês futuro | abre mar/27 sem Fatura | grade mostra os previstos; hero "sem fatura" | N/A |
| Mês com Fatura | reimporta out/26 e nov/26 já tem Fatura | nenhum previsto em nov/26; dez/26 em diante recebe | N/A |
| Real sobre previsto | importa dez/26 com 07/10 e já há previsto 07/10 | recusa `fatura.previstos_sem_casamento`, nada gravado | mensagem pede a 3.6 |
| Reclassificar | muda Responsável/Tipo da 05/10 que tem previstos | pergunta; "Aplicar a todos" muda os `sistema`; "Só este" não | `salvar.falhou` desfaz |
| Ano antigo | parcela 13/18 comprada há mais de 12 meses | chave igual, independente do ano da data | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/previstos.ts` (novo) -- `serieDaLinha`, `atribuirSeries` (ocorrencia), `gerarPrevistos`, `planejarPropagacao`; usa `somarMeses` (`ciclo.ts`) e `normalizarNome` (`importacao-fatura.ts`).
- `src/domain/importacao-fatura.ts` -- `LancamentoParaGravar` ganha `serie`; `Importacao` ganha `previstos`; `resumirReimportacao` ganha a contagem de previstos a apagar. `prepararImportacao`, `normalizarNome`, Ajustes e Conferência não mudam.
- `src/domain/classificacao.ts` -- `classificarImportacao` roda antes; o previsto copia a classificação já calculada (sem motivo).
- `supabase/migrations/20261111120000_reimportar.sql` -- `importar_fatura` atual (5 argumentos, apaga por `fatura_id`); a nova migração a recria com `dados_previstos`, cria Séries e previstos, religa `origem_lancamento_id` e apaga os previstos intocados na reimportação.
- `src/data/faturas-repo.ts` -- `importar` passa os previstos, remove `removidos.previstos` e aplica as linhas devolvidas (a memória só aceita as do Mês aberto); `lerReimportacao` conta previstos.
- `src/data/lancamentos-repo.ts` -- `planejarLote(entradas, linhas, agora)` é puro e recebe as linhas: serve para os previstos lidos do banco; `chamarLote` grava; ganha `lerPrevistosDaSerie`, `propagarAosPrevistos`, `lerOrigem`. `classificarEmLote` e `atualizar` leem só a memória do Mês aberto: não os reusar para outros Meses.
- `src/features/importar/ImportarFatura.tsx:241,320` -- monta a importação (lê Regras e cadastros); passa `mesesComFatura` (de `gerenciador("faturas")`) ao núcleo; mapeia os códigos novos; resumo ganha "N previstos".
- `src/features/painel/GradeLancamentos.tsx`, `PainelLancamento.tsx`, `Painel.tsx` -- selo, origem e `FaixaPergunta` (`src/ui/FaixaPergunta.tsx`); `Painel.tsx:323-325,383` já filtra Conferência e total por `fatura_id`; a barra por Responsável usa o Mês todo e passa a incluir previstos.
- `src/domain/revisar.ts` (`ehDaFila`) -- exige `revisao_motivo`: previsto nunca entra; sem mudança.
- `src/domain/mensagens.ts` -- `ROTULOS_LANCADO_POR`, `rotuloDetalhesLancamento`: textos do selo, da origem, da pergunta e dos códigos de erro.
- `test/integracao/faturas.test.ts`, `lancamentos.test.ts` -- novos casos de Série (CI apenas, sem Docker aqui).
- Produção (só contagens, 11/11/2026): out/26 49 linhas e nov/26 46, nenhuma classificada, editada, com Observação ou Apelido, 0 Regras, 0 `sistema`, 0 Séries; 24 parceladas por Mês (21 e 22 com parcela a vir); 21 parcelas de out/26 continuam em nov/26, com o mesmo Valor; nenhum grupo de parcelas idênticas (os 3 grupos idênticos são à vista).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261114120000_series_previstos.sql` -- `series`, colunas e índice único, RPC `importar_fatura` com `dados_previstos` -- AD-8/AD-9/AD-14
- [x] `src/data/database.types.ts` -- tipos novos no formato do gerado -- CI compara com o local
- [x] `src/domain/previstos.ts` (+ teste) -- chave, `ocorrencia`, previstos, propagação -- regra única
- [x] `src/domain/importacao-fatura.ts`, `mensagens.ts` (+ testes) -- contrato com a RPC, aviso e textos
- [x] `src/data/faturas-repo.ts`, `lancamentos-repo.ts` (+ testes) -- importar, `removidos`, propagar, origem
- [x] `src/features/importar/ImportarFatura.tsx`, `painel/*` (+ testes jsdom) -- selo, origem, pergunta, resumo, Mês futuro
- [x] `test/integracao/faturas.test.ts` -- aceite de duas compras idênticas, reimportação com Série, idempotência

**Acceptance Criteria:**
- Given a Fatura de out/26 com 05/10 de MAGALU, when importa, then cinco previstos (06/10 a 10/10) existem nos Meses seguintes e a linha de out/26 tem `serie_id`.
- Given duas compras idênticas na mesma Fatura, when importa, then há duas Séries (`ocorrencia` 1 e 2), sem erro.
- Given um previsto aberto no painel, when Rafael vê, then lê o selo e a origem.
- Given a reimportação de um Mês com Séries, when confirma, then nada falha e nenhum previsto duplica.

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). Núcleo novo `src/domain/previstos.ts` (`atribuirSeries`, `gerarPrevistos`, `planejarPropagacao`, `juntarMudancas`, `ehPrevisto`); `prepararImportacao` põe a chave da Série em cada linha e a tela chama `gerarPrevistos` depois de classificar.
- **Desvio da spec, para não deixar buraco:** a Série também liga a **última** parcela (n = N), não só n < N. Sem isso, o 10/10 real chegaria sem Série e o previsto 10/10 ficaria repetido sem a recusa da decisão 2-A. A matriz de I/O já pedia isso ("10/10: Série e linha ligadas; nenhum previsto"); só o texto de "Always" dizia n < N.
- Migração `20261114120000_series_previstos.sql`: `series` (RLS, `updated_at`, `replica identity full`, fora do Realtime porque nenhuma tela a lê), `lancamentos.serie_id`, `origem_lancamento_id` (`on delete set null`) e `dividido_de_id` (reservada à 3.8), índice único parcial e a RPC `importar_fatura` com `dados_previstos` (6º argumento, opcional). A RPC também não cria previsto em Mês que já tem Fatura (rede de segurança da decisão 1-A) nem onde a Série já tem a parcela em qualquer estado (excluído não ressuscita).
- `lerReimportacao` conta no banco os previstos que a reimportação apagaria e o aviso os cita só quando há. `importar` aplica `previstos` e `removidos.previstos` (só o Mês aberto entra na memória).
- Propagação (decisão 4-A) no `lancamentosRepo.propagarAosPrevistos`: lê os previstos da Série no banco, grava os vazios pela RPC do lote (sem `editado_em`, sem Regra) e devolve os com outro valor. Painel e ✓/"Mudar" do Revisar perguntam com `FaixaPergunta`; o lote só preenche. A falha da propagação é silenciosa (não tira o "Desfazer" da classificação, como o `aprender`).
- `test/integracao/series.test.ts` roda só no CI. A migração e a RPC foram provadas aqui num Postgres em memória (pglite, fora do repositório) com todas as migrações em ordem; o cenário "real sobre previsto" exigiu passar o `updated_at` do Mês na chamada, como o app faz.
- `database.types.ts` escrito à mão no formato do gerado; conferir contra o gerado de produção depois do `db push`.

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| A recusa `previstos_sem_casamento` pode vir do `unique_violation` do índice da Série em vez da checagem explícita, sem diferença para o app | low | A checagem explícita roda antes de gravar; o ramo do `exception` só alcança duas importações de Meses diferentes ao mesmo tempo. Sem correção |
| Duas linhas de `dados_previstos` com a mesma `(serie, n)` estourariam o índice com a mensagem de "sem casamento" | false | O núcleo gera uma por `(linha real, k)` e cada linha real tem Série própria (`ocorrencia`); testado em `previstos.test.ts` |
| Importar a mesma Fatura com `faturas` ainda carregando manda previstos para Meses com Fatura | false | A RPC não cria previsto em Mês que já tem Fatura (testado no pglite e em `series.test.ts`) |
| Propagação falha em silêncio | low | Decisão: não tira o "Desfazer" da classificação (como `aprender`); os previstos ficam como estão e a pendência está em `deferred-work.md` |
| `database.types.ts` escrito à mão pode diferir do gerado | maybe-false | Só o CI prova (`supabase gen types --local`); entrada em `deferred-work.md` |
| Última parcela ligada à Série contraria "n < N" do Always | bad_spec (aceito) | Sem isso o 10/10 real duplicaria o previsto sem recusa; segue a matriz de I/O e está nas Notas de Implementação |
| "Desfazer" do ✓/lote não desfaz os previstos preenchidos | low | `deferred-work.md` |

## Design Notes

**Efeito em cada tela:** *Painel* -- grade mostra previstos do Mês aberto; Conferência, "verificar" e "Total a pagar" ignoram (filtram por `fatura_id`); barra por Responsável e contagem de lançamentos incluem. *Revisar* -- previsto nunca entra (sem motivo); as linhas reais da fila mudam como hoje. *Realtime* -- sem gerenciador novo: previstos de outros Meses chegam ao abrir o Mês. *Importação* -- RPC cria Séries e previstos na mesma transação.

**Produção:** as Faturas out/26 e nov/26 não têm Séries; previstos só aparecem depois de reimportar. Como não há classificação, Regra, Apelido nem edição, reimportar não perde nada. Reimportar só nov/26 gera previstos de dez/26 em diante sem repetir nada; reimportar out/26 não cria previstos em nov/26 (decisão 1-A).

## Verification

**Commands:**
- `npm run lint && npx tsc --noEmit && npm test` -- expected: sem erro
- `npm run build` -- expected: compila

**Manual checks (iPad, produção):** passo a passo no relatório final da história.
