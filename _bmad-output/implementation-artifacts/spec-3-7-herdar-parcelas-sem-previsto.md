---
title: 'História 3.7: Herdar parcelas sem previsto'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'c226e58d485de87e2b733e15147a8529e95b86ca'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Uma parcela n/N (n > 1) que chega sem previsto (primeira importação, Mês anterior importado antes da 3.5, previsto excluído, histórico da 3.10) cai só nas Regras e quase sempre na fila, mesmo com a parcela n−1/N do Mês anterior já classificada (FR-8).

**Approach:** Uma função pura do núcleo (AD-1) escolhe, entre as parcelas n−1/N do Mês anterior lidas do banco, a candidata de mesmo `nome_normalizado` e Valor; a linha nova entra na Série dela e herda a classificação. Roda na importação, depois do casamento da 3.6, só nas parcelas que ficaram sem previsto; a RPC só grava.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** a escolha da candidata e a mescla dos campos ficam em `src/domain` (só imports relativos, sem relógio); a tela lê, o núcleo decide, a RPC grava. Textos em `mensagens.ts`.
- **Quem herda:** parcela real da Fatura que `ehParcelaDeSerie` aceita (Valor positivo, sem Ajuste), com n > 1 e **sem previsto casado** (o casado já tem a classificação do previsto, que manda).
- **Candidata:** o Mês anterior é `somarMeses(mes, -1)` pela coluna `mes` (nunca pela data); mesmo `nome_normalizado`, `parcela_total`, `parcela_n = n − 1` e Valor igual. Lida do banco numa leitura nova do repositório (a memória do Realtime guarda só o Mês aberto). Sem trava do Mês anterior: a herança copia o que havia na leitura. Leitura que falha ou passa do limite → importa sem herdar (como as Regras).
- **Determinístico e 1-para-1:** reais na ordem da fatura × candidatas por menor `ocorrencia` da Série (sem Série, depois, por `ordem_fatura` e `id`). Uma candidata serve uma linha só. Candidata cuja Série já tem a parcela n (previsto do Mês ou outra linha, lida do banco) não serve. O teste cobre várias candidatas.
- **Previstos seguintes:** `gerarPrevistos` continua como está; copia o que a herdeira tem; a RPC não recria o que a Série já tem em nenhum estado. O Ajuste de centavos da mãe herdeira recebe a classificação final dela.
- **Sem Regra nova:** herdar não ensina Regra (só classificar ensina). Herdar só vale na importação (nova ou reimportação), nunca em Mês já gravado.
- **Decisões do Rafael (11/11/2026, todas A):**
  - **Q1 Série:** a linha nova copia a chave da Série da candidata, inclusive a `ocorrencia`; a RPC acha a Série pela chave. As outras parcelas sem par sobem a `ocorrencia` até uma livre (3.6). Candidata sem Série só empresta os campos; a nova usa a Série da 3.5 e a candidata não é tocada. Os previstos seguintes saem de `gerarPrevistos` e copiam Apelido e Observação da herdeira.
  - **Q2 Regras:** campo a campo, a herança vale onde a candidata tem valor e as Regras completam o que falta. Completo → sem motivo (apaga a dúvida da Regra); incompleto → motivo normal. O passo 3 e o resumo final dizem "N herdaram da parcela anterior".
  - **Q3 Campos:** copia Apelido e Observação (migração `create or replace` de `importar_fatura`, mesma assinatura); Divisão fica de fora até a 3.8, com a lista de campos herdados num lugar só.
  - **Q4 Valor diferente:** não herda nem entra na Série da anterior; segue Regras e fila. Fica em `deferred-work.md`.
  - **Q5 Candidata:** qualquer linha-mãe não excluída do Mês anterior (Fatura, previsto ou histórico), sem Ajuste; o Mês anterior não precisa ter Fatura; só olha um Mês para trás.
- Manter tudo da 2.3 à 3.6: hero e troca de Mês, ordenação, Conferência e "verificar", filtros, painel e Ajustes, Regras, fila e lote, Séries e previstos com selo, origem e "Só este / Aplicar a todos", casamento com "Valor mudou" e "Não veio na fatura", trava da reimportação com casados.

**Never:** Divisão (3.8); Apelido em massa e tela de Apelido (3.9); reimportar mantendo a classificação (3.12); herdar de outro Mês que não seja o imediatamente anterior ou "para trás" (n+1); alterar linhas de outros Meses; mexer na pendência do VoiceOver; `console.*`; `supabase.from()` em tela; apagar ou alterar dado de produção sem Rafael confirmar.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Herda | nov/26 traz 05/10 de MAGALU sem previsto; out/26 tem 04/10, mesmo Valor, classificada | a linha nasce com a classificação da candidata, na Série dela, sem motivo (fora da fila) | N/A |
| Várias candidatas | 2 candidatas livres (`ocorrencia` 1 e 2) e 1 real | a real herda da de `ocorrencia` 1 | N/A |
| Compras idênticas | 2 reais iguais e 2 candidatas | 1ª real ← `ocorrencia` 1, 2ª real ← `ocorrencia` 2, sem estourar a restrição única | N/A |
| Menos candidatas | 2 reais iguais e 1 candidata | a 1ª herda; a 2ª segue as Regras (Série livre) | N/A |
| Tem previsto | a real casou com um previsto | não herda; vale o previsto (3.6) | N/A |
| Primeira parcela | n = 1 | não herda | N/A |
| Candidata excluída | a parcela n−1 do Mês anterior está excluída | não conta; segue as Regras | N/A |
| Mês anterior vazio | sem linha n−1 | segue as Regras | N/A |
| Leitura falhou | a leitura do Mês anterior falha | importa sem herdar | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/previstos.ts` -- `aplicarCasamento` ganha a herança entre o casamento e a subida de `ocorrencia`; `LinhaParaPrever`/`gerarPrevistos` passam a copiar Apelido e Observação da herdeira.
- `src/domain/heranca.ts` (novo, + teste) -- `herdarParcelas`: candidata, ordem, 1-para-1, mescla campo a campo; lista única de campos herdados (a 3.8 acrescenta `divisao`).
- `src/domain/importacao-fatura.ts` -- `LancamentoParaGravar` ganha `apelido`, `observacao`, `herdado_de_id`.
- `src/domain/revisar.ts` -- `resumoDaClassificacao` conta `herdadas`; `ehDaFila` não muda.
- `src/domain/mensagens.ts` -- rótulo "N herdaram da parcela anterior" (passo 3 e resumo final).
- `src/data/faturas-repo.ts` (+ teste) -- `lerParcelasDoMesAnterior(mes)`: mães n−1 do Mês anterior com a chave da Série e se a parcela seguinte da Série está ocupada fora da Fatura do Mês.
- `src/features/importar/ImportarFatura.tsx` -- quinta leitura em paralelo (`comLimite`), passa as candidatas a `montarComCasamento`, mostra o resumo; `refazerCasamento` reaproveita as candidatas já lidas.
- `supabase/migrations/…_herdar_parcelas.sql` -- `create or replace function importar_fatura` (7 argumentos, mesma assinatura) com `apelido` e `observacao` no insert das linhas novas.
- `test/integracao/heranca.test.ts` -- aceite (CI apenas).
- `src/features/painel/*`, `revisar/*`, `src/data/realtime.ts` -- sem mudança: a herdeira é linha da Fatura comum; `ehDaFila` sai do motivo.
- Produção (só contagens, 11/11/2026, reconferidas): out/26 49 linhas, 19 com n > 1, 0 Séries; nov/26 46 linhas, 20 com n > 1 (as 20 têm candidata de Valor igual em out/26), 23 Séries; dez/26 a set/27 77 previstos (21 em dez/26); 0 Regras; 0 classificadas, editadas ou com Apelido; 0 casadas.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/heranca.ts` (+ teste) -- `herdarParcelas` e matriz
- [x] `src/domain/previstos.ts`, `importacao-fatura.ts`, `revisar.ts`, `mensagens.ts` (+ testes) -- integração com o casamento, previstos, resumo
- [x] `supabase/migrations/…_herdar_parcelas.sql` -- RPC grava Apelido e Observação
- [x] `src/data/faturas-repo.ts` (+ teste) -- leitura do Mês anterior
- [x] `src/features/importar/ImportarFatura.tsx` (+ teste jsdom) -- leitura, herança, resumo
- [x] `test/integracao/heranca.test.ts` -- aceite (CI)
- [x] pglite (scratchpad) -- todas as migrações em ordem e a matriz
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- itens novos

**Acceptance Criteria:**
- Given uma parcela n/N (n > 1) sem previsto casado e a n−1/N no Mês anterior com o mesmo `nome_normalizado` e Valor, when a Fatura é importada, then a linha entra na mesma Série, herda Apelido, Tipo, Responsável e Observação (Divisão: ver Q3) e não vai para a fila.
- Given mais de uma candidata no Mês anterior, when a herança roda, then o núcleo escolhe a de menor `ocorrencia`, de forma determinística, e o teste cobre o caso.

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). Decisões Q1-A a Q5-A aprovadas pelo Rafael antes de começar.
- Núcleo: `src/domain/heranca.ts` (`escolherCandidatas`, `mesclarHerdada`, `emprestaAlgo`, `CAMPOS_HERDADOS`) e a herança dentro de `aplicarCasamento` (4º argumento `candidatas`), entre o casamento e a subida de `ocorrencia`; `gerarPrevistos` copia Apelido e Observação da herdeira; `resumoDaClassificacao` conta `herdadas`.
- **Acréscimos além da spec:** (1) `herdado_de_id` só é preenchido quando a candidata emprestou algum campo; candidata sem classificação ainda empresta a Série (e `ocorrencia`), mas não conta como herança no resumo, para não dizer "20 herdaram" em produção quando a anterior não está classificada; (2) a subida de `ocorrencia` das parcelas sem par leva em conta a Série tomada pela herdeira, senão duas linhas ficariam na mesma Série; (3) a candidata cuja Série já tem a parcela n (lida do banco, fora da Fatura do próprio Mês, que cai na reimportação) não serve (`proxima_ocupada`).
- Migração `20261116120000_herdar_parcelas.sql`: `create or replace` de `importar_fatura` (mesma assinatura de 7 argumentos) gravando `apelido` e `observacao` nas linhas novas; o casado continua com os do previsto. `database.types.ts` não muda.
- Provado no pglite com todas as migrações em ordem: herdeiras com e sem Série, compras idênticas (`ocorrencia` 1 e 2), Valor diferente, previstos seguintes copiando a herança, reimportação, previsto excluído sem duplicar e casado mantendo o Apelido; os cenários da 3.6 seguem passando. `test/integracao/heranca.test.ts` só roda no CI.

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| A subida de `ocorrencia` das parcelas sem par ignorava a Série tomada por uma herdeira (duas linhas na mesma Série) | medium (corrigido) | `aplicarCasamento` registra a Série da herdeira em `ocupadas` antes da subida. Teste "a parcela sem par que sobra sobe a ocorrencia…" e cenário pglite |
| Candidata sem classificação contaria como "herdou" e o resumo diria "20 herdaram" em produção (out/26 sem classificação) | medium (corrigido) | `herdado_de_id` só é preenchido se a candidata emprestou algum campo (`emprestaAlgo`). Teste "candidata sem classificação entra na Série mas não conta" |
| Candidata cuja Série já tem a parcela n (previsto do Mês casado com outra linha) faria a RPC recusar a importação inteira | medium (corrigido) | `proxima_ocupada` lido do banco (fora da Fatura do próprio Mês, que cai na reimportação). Testes do repositório e do núcleo |
| Candidata sem Série e a subida de `ocorrencia` só conhecem os previstos do Mês; outra linha da Série fora do Mês cai na rede da RPC (`fatura.previstos_sem_casamento`) | low | Mesmo limite da 3.6; o caso exige Série compartilhada com linha de outro Mês que não é a candidata |
| Candidata com Valor editado diferente do da Série: a herdeira copia a chave da Série (Valor da Série) com o Valor dela | low | Série é identidade da compra (AD-8); a RPC acha a Série pela chave e a linha mantém o próprio Valor |
| Sem trava do Mês anterior: a candidata pode mudar entre a leitura e a gravação | low | Decisão da spec: a herança copia o que havia na leitura; a RPC ainda recusa se a Série já tem a parcela (índice único) |
| `ultimo_uso` da Regra marca Regras que a herança sobrepôs | low | Registrado em `deferred-work.md` |
| Migração, RLS e `test/integracao/heranca.test.ts` só rodam no CI | maybe-false | Registrado em `deferred-work.md`; migração provada no pglite com todas as migrações |

## Design Notes

**Ordem na importação.** `classificarImportacao` (Regras) → `casarPrevistos` → casados → **herança das que sobraram** → subida de `ocorrencia` → Ajuste segue a mãe → `gerarPrevistos`.

**Produção.** A herança só roda numa importação ou reimportação. Out/26 e nov/26 já estão gravadas e nada muda sem Rafael reimportar. Reimportar nov/26 herdaria as 20 parcelas n > 1 de out/26, mas só com classificação se Rafael classificar out/26 antes (hoje nenhuma linha está classificada).
