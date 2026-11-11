---
title: 'História 3.6: Casar os previstos com a fatura real'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'b58e84dc1a3f0bea865d4a2ac3f9f25562e6abe3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quando a Fatura do Mês chega, a parcela real e o previsto da mesma compra viram duas linhas, e a 3.5 só consegue recusar a importação (`fatura.previstos_sem_casamento`) para não duplicar (FR-45).

**Approach:** `casarPrevistos(extraidos, previstos)` no núcleo (AD-8) casa 1-para-1 e de forma determinística; a RPC `importar_fatura` transforma o previsto casado na linha real (mesma linha, mesmo `id`) e marca os sem par. O Revisar ganha as variantes "Valor mudou" e "Não veio na fatura".

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `casarPrevistos` (e quem decide classificação e motivo do casado) fica em `src/domain/previstos.ts`, só imports relativos; a RPC só grava o que o núcleo calculou; textos em `mensagens.ts`.
- **Casamento (AD-8):** chave `(nome_normalizado, parcela_n, parcela_total)`. Só entram reais que são parcela de Série (`ehParcelaDeSerie`, sem Ajuste) e previstos `sistema`, não excluídos, do Mês importado (`mes`). Duas passadas: 1ª, cada real na ordem da fatura pega o previsto livre de **Valor igual** com menor `ocorrencia`; 2ª, os reais que sobraram, na ordem da fatura, pegam o livre de menor `ocorrencia`. Sobra de real = sem previsto (segue Regras e herança); sobra de previsto = sem par.
- **Casado vira o real na mesma linha:** `lancado_por = 'fatura'`; ganha `fatura_id`, `ordem_fatura`, `data`, `final_cartao`, `duvida_extracao`, o `nome` e o Valor da fatura e `casado_em` (coluna nova; é a marca que a trava da reimportação usa). Mantém `id`, `serie_id`, `origem_lancamento_id`, Apelido, Observação, Status, `editado_em` e a classificação do previsto; o campo de classificação que o previsto tem vazio recebe o que as Regras calcularam para a linha real. Não cria Série nova para o casado.
- **Motivo do casado (núcleo):** Responsável e Tipo completos e Valor igual → sem motivo. Completos e Valor diferente → `valor_mudou`, com `revisao_dados = { antes_centavos }`. Incompleto → o motivo da classificação normal (`sem_classificacao`, `sugestao`…), com o Valor da fatura.
- **Sem par:** o previsto continua `sistema` e fora da Conferência e do "Total a pagar" (sem `fatura_id`); recebe `revisao_motivo = 'nao_veio_na_fatura'` e entra na fila. Previsto excluído não ressuscita nem casa.
- **Fila do Revisar:** `ehDaFila`, o contador do menu e o "Faltam N" não mudam (saem do motivo). Variante "Valor mudou": "Antes R$ 445,89 → agora R$ 449,10", ✓ "Manter classificação" (limpa o motivo e ensina a Regra como o ✓ de hoje). Variante "Não veio na fatura": "Remover previsto" (exclui, com "Desfazer" de 6 s) e "Manter" (só limpa o motivo; sem Regra); esta variante não tem caixa de lote. A faixa de resumo da importação conta só linhas da Fatura (casados entram, previstos sem par não).
- **Migração (AD-14):** `supabase/migrations/…_casar_previstos.sql`: valores `valor_mudou` e `nao_veio_na_fatura` em `revisao_motivo`; coluna `lancamentos.casado_em timestamptz`; `importar_fatura` (7º argumento `previstos_sem_par`, lista de ids). A RPC usa o `updated_at` do Mês (`lancamentos_atualizados_em`) como trava: se os previstos do Mês mudaram depois da leitura, recusa com `fatura.mes_mudou`. `fatura.previstos_sem_casamento` fica só como rede de segurança (mensagem nova).
- **Resumo da importação:** passo 3 e o toast final dizem quantos previstos casaram e quantos não vieram.
- **Decisão 1-A (continua):** não criar previsto em Mês que já tem Fatura. Nesse Mês ou a parcela real já existe (nada a criar) ou "não veio" seria ruído num Mês já fechado. Previstos que já existem num Mês com Fatura seguem as regras acima.
- **Decisão Q1-A (reimportação):** só protege o que casou. A RPC recusa com `fatura.reimportacao_com_casados` quando a Fatura tem linha não excluída com `casado_em`; o aviso do passo 3 mostra só "Cancelar". Faturas sem casado reimportam como na 3.11. A 3.12 é a próxima história e fica fora da 3.6.
- **Decisão Q2-A:** casado sem classificação completa usa o motivo de classificação normal, mesmo com Valor diferente.
- **Decisão Q3-A:** o Valor mudado não propaga aos previstos seguintes; o casamento só toca o Mês importado.
- **Decisão Q4-A:** o teste real do casamento fica para a Fatura de dez/26 (anotado em `deferred-work.md`); `done` entra no `sprint-status` depois do merge, da migração e do deploy, com a conferência de regressão.
- Manter tudo da 2.3 à 3.5: hero e troca de Mês, ordenação, Conferência e "verificar", filtros, painel e Ajustes, Regras, fila e lote, Séries e previstos com selo, origem e pergunta "Só este / Aplicar a todos".

**Never:** herdar parcela sem previsto (3.7); Divisão (3.8); Apelido em massa (3.9); fazer a 3.12; mexer na pendência do VoiceOver; `console.*`; `supabase.from()` em tela; apagar ou alterar dado de produção sem Rafael confirmar; casar previsto de outro Mês.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Casa, Valor igual | dez/26 traz 07/10 de MAGALU; há previsto 07/10 de mesmo Valor | a linha do previsto vira a real (mesmo `id`); mantém classificação e Apelido; sem motivo | N/A |
| Valor diferente | previsto R$ 445,89, fatura R$ 449,10, classificado | Valor R$ 449,10, classificação mantida, fila "Valor mudou · Antes R$ 445,89 → agora R$ 449,10" | N/A |
| Previsto sem classificação | casa com Valor igual ou diferente | entra na fila como `sem_classificacao` (ou sugestão das Regras) com o Valor da fatura | N/A |
| Sem par | previsto 08/10 e a fatura não traz a parcela | continua previsto, fora da Conferência; fila "Não veio na fatura" | N/A |
| Real sem previsto | parcela 03/06 sem previsto no Mês | linha nova, Série nova, Regras e herança | N/A |
| Duas compras idênticas | 2 previstos (`ocorrencia` 1 e 2) e 2 reais iguais | cada real casa um previsto, na ordem, sem estourar a restrição única | N/A |
| Valores trocados | previstos 100 e 200; reais 200 e 100 | 200↔200 e 100↔100 (Valor igual primeiro) | N/A |
| Menos reais que previstos | 2 previstos, 1 real | 1 casa (menor `ocorrencia`); o outro "Não veio" | N/A |
| Mais reais que previstos | 1 previsto, 2 reais iguais | o 1º real casa; o 2º é linha nova com Série nova | N/A |
| Previsto excluído | previsto 07/10 excluído, a fatura traz 07/10 | linha real nova; o excluído continua excluído | N/A |
| Previstos mudaram | outro aparelho mudou um previsto do Mês depois da leitura | recusa `fatura.mes_mudou`; nada gravado | mensagem existente |
| Reimportar com casados | a Fatura tem linha com `casado_em` | a RPC recusa com `fatura.reimportacao_com_casados`; o aviso do passo 3 só tem "Cancelar" | texto diz que a reimportação que mantém a classificação é a 3.12 |
| Ajuste de centavos | a mãe é um casado | o Ajuste liga à mãe pela `ordem_fatura`, como hoje | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/previstos.ts` (+ teste) -- ganha `casarPrevistos` (duas passadas, chave, `ocorrencia`) e `resolverCasados` (classificação do casado, motivo, `antes_centavos`); reaproveita `ehParcelaDeSerie`, `ehPrevisto`, `LinhaParaSerie`.
- `src/domain/importacao-fatura.ts` -- `LancamentoParaGravar` ganha `previsto_id` (casado) e `serie` nula nele; `Importacao` ganha `previstos_sem_par`; `resumirReimportacao` ganha `casados`. `prepararImportacao`, Ajustes, Conferência e `normalizarNome` não mudam.
- `src/domain/classificacao.ts` -- `MotivoRevisao`/`MOTIVOS_REVISAO` ganham `valor_mudou` e `nao_veio_na_fatura`; `classificarImportacao` roda antes do casamento; `lerDadosRevisao` fica como está (`valor_mudou` tem dados próprios).
- `src/domain/revisar.ts` -- `montarItem` ganha as variantes `valor_mudou` (texto "Antes → agora", `aoConfirmar` da própria linha) e `nao_veio_na_fatura`; `ehDaFila` sem mudança; `resumoDaImportacao`/`paraRevisar` (chamado em `Revisar.tsx:166`) passa a contar só linhas com `fatura_id`.
- `src/domain/mensagens.ts:97` -- troca o texto de `fatura.previstos_sem_casamento`; adiciona `fatura.reimportacao_com_casados`, os textos das variantes, o resumo ("N previstos casaram") e a cláusula do aviso de reimportação.
- `supabase/migrations/20261114120000_series_previstos.sql` -- RPC atual (6 argumentos) e a checagem `previstos_sem_casamento` que o casamento substitui; nova migração `…_casar_previstos.sql` recria a RPC com `drop function` do 6-arg e `grant` do 7-arg.
- `src/data/faturas-repo.ts` -- `importar` manda `previstos_sem_par`; novo `lerPrevistosDoMes(mes)` (previstos `sistema` do Mês e o `updated_at` do Mês, na mesma leitura); `lerReimportacao` conta casados (`casado_em`); `CODIGOS_DA_RPC` ganha o código novo.
- `src/data/lancamentos-repo.ts` -- `manterPrevisto(id)` (limpa o motivo) e "Remover previsto" pelo `excluir`/`restaurar` existentes; `classificarEmLote` e `atualizar` não mudam.
- `src/features/importar/ImportarFatura.tsx:241-262,320` -- lê os previstos do Mês, chama `casarPrevistos`/`resolverCasados` depois de classificar e antes de `gerarPrevistos`, mapeia os códigos e mostra os casados no passo 3.
- `src/features/revisar/ItemRevisar.tsx`, `Revisar.tsx`, `JanelaLote`/`BarraLote` -- botões e texto das duas variantes; a barra de lote ignora itens `nao_veio_na_fatura`.
- `src/features/painel/*` -- sem mudança de lógica: o casado ganha `fatura_id` e entra sozinho na Conferência e no "verificar"; o selo e a origem só aparecem para `ehPrevisto`.
- `src/data/database.types.ts` -- enum, `casado_em` e o 7º argumento da RPC no formato do gerado (CI compara).
- `test/integracao/casamento.test.ts` -- aceite de duas compras idênticas, Valor diferente, sem par, recusa da reimportação com casado (CI apenas).
- Produção (só contagens, 11/11/2026): out/26 49 linhas, 0 Séries, 0 previstos; nov/26 46 linhas, 23 Séries, 0 previstos; 77 previstos `sistema` de dez/26 a set/27 (dez/26: 21), nenhum excluído; 0 Regras; nenhuma linha com Responsável, Tipo, Apelido ou edição. nov/26 já foi reimportada com a 3.5.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/…_casar_previstos.sql` -- enum, `casado_em`, RPC com casamento, sem par e trava de reimportação -- AD-8/AD-14
- [x] `src/data/database.types.ts` -- tipos no formato do gerado
- [x] `src/domain/previstos.ts`, `classificacao.ts`, `importacao-fatura.ts`, `revisar.ts`, `mensagens.ts` (+ testes) -- casamento, motivos, variantes, textos
- [x] `src/data/faturas-repo.ts`, `lancamentos-repo.ts` (+ testes) -- leitura dos previstos do Mês, `importar`, `manterPrevisto`, aviso de reimportação
- [x] `src/features/importar/ImportarFatura.tsx`, `revisar/*` (+ testes jsdom) -- casar, resumo, variantes, trava no aviso
- [x] `test/integracao/casamento.test.ts` -- aceite da história (CI)
- [x] Postgres em memória (pglite, no scratchpad) -- todas as migrações em ordem, cenários da matriz
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- baixa da pendência 3.11/3.5 (virou trava) e itens novos

**Acceptance Criteria:**
- Given um previsto de mesmo Nome, parcela e Valor, when a Fatura do Mês é importada, then ele vira a linha real com o mesmo `id`, a classificação e o Apelido, e nenhuma linha duplica.
- Given duas compras idênticas com dois previstos, when importa, then os dois casam na ordem e a restrição única da Série não falha.
- Given um casamento com Valor diferente, when grava, then a linha tem o Valor da fatura e a fila mostra "Valor mudou" com ✓ "Manter classificação".
- Given um previsto sem par, when grava, then continua previsto, fora da Conferência, e a fila mostra "Não veio na fatura" com "Remover previsto" e "Manter".
- Given a Fatura de um Mês com casados, when Rafael tenta importar de novo, then nada é apagado e o aviso explica.

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). Decisões Q1-A a Q4-A aprovadas pelo Rafael antes de começar.
- Núcleo: `casarPrevistos` (duas passadas) e `aplicarCasamento` em `src/domain/previstos.ts`; `MotivoRevisao` ganhou `valor_mudou` e `nao_veio_na_fatura`; `montarItem` (`revisar.ts`) ganhou as duas variantes, `selecionavel` e `daFatura`; `resumirReimportacao` conta `casados`.
- **Acréscimos além da spec, para não deixar buraco:** (1) o Ajuste de centavos da mãe casada recebe a classificação final dela (o Ajuste copiava a das Regras); (2) a parcela real sem par sobe a `ocorrencia` da Série até uma livre quando o previsto de outra ocorrencia já ocupa a parcela (compras idênticas com um previsto excluído), senão a RPC recusaria a importação inteira; (3) `fatura.mes_mudou` na gravação refaz o casamento (relê os previstos e a trava) antes do "Tentar de novo", senão repetir falharia sempre; (4) a trava da RPC é o `updated_at` do Mês lido junto dos previstos (`lerPrevistosDoMes`), não o da memória.
- Migração `20261115120000_casar_previstos.sql`: valores do enum, `casado_em`, RPC de 7 argumentos (`previstos_sem_par`). A RPC não muda de assinatura para o app antigo (o 7º argumento tem padrão), mas o app novo exige a migração aplicada.
- Provado no pglite com todas as migrações em ordem (cenários da matriz, a trava, o plano velho, a Série livre e a reimportação de out/26). `test/integracao/casamento.test.ts` e a comparação de `database.types.ts` só rodam no CI.

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| O Ajuste de centavos de uma mãe casada ficava com a classificação das Regras, diferente da mãe | medium (corrigido) | `classificarImportacao` copia a mãe antes do casamento; `aplicarCasamento` agora reaplica a final. Teste em `previstos.test.ts` |
| Compras idênticas com um previsto excluído: o 2º real cai numa Série já ocupada e a RPC recusa a importação inteira | medium (corrigido) | Reproduzido no pglite; `aplicarCasamento` sobe a `ocorrencia` até uma Série livre. Teste unitário, pglite e `casamento.test.ts` |
| `fatura.mes_mudou` na gravação deixava o "Tentar de novo" repetir o mesmo plano e a mesma trava, falhando sempre | medium (corrigido) | `refazerCasamento` relê os previstos antes do novo toque. Teste em `ImportarFatura.test.tsx` |
| O previsto "Não veio" de Mês seguinte some em silêncio quando se reimporta a Fatura que o criou | low | Regra da reimportação simplificada (3.5, 3-A); registrado em `deferred-work.md` |
| Valor mudado não propaga aos previstos seguintes | low | Decisão Q3-A; registrado em `deferred-work.md` |
| Parcela que chega em Mês diferente do previsto vira linha nova e deixa o previsto "Não veio" | low | `mes` fixo (AD-9) e Série pelo Mês da Fatura; registrado em `deferred-work.md` |
| `database.types.ts` escrito à mão pode diferir do gerado | maybe-false | Só o CI prova (`supabase gen types --local`); entrada em `deferred-work.md` |
| O app novo falha na importação se a migração ainda não estiver aplicada (7º argumento) | low | Janela entre o deploy e o `db push`; o app antigo continua funcionando com a RPC nova |

## Design Notes

**Efeito em cada tela.** *Painel*: o casado ganha `fatura_id` e `ordem_fatura`; entra na grade como real, na Conferência, no "verificar" e no total da Fatura; o previsto sem par continua com selo, fora das três. *Revisar*: duas variantes novas; contador do menu e "Faltam N" vêm de `ehDaFila`, então somam as duas sozinhos; lote e "Desfazer" seguem como hoje (o item "Não veio" não tem caixa; "Manter classificação" é o ✓ de hoje). *Realtime*: o casamento só muda linhas do Mês importado (os previstos de outros Meses não são tocados); a RPC devolve casados em `lancamentos` e os sem par em `previstos`. *Importação*: a tela lê os previstos do Mês no banco, passa o `updated_at` do Mês como trava, e o resumo conta casados e sem par. *Reimportação*: Faturas sem casado reimportam como hoje; com casado, a RPC recusa.

**Produção.** O casamento só roda ao importar (ou reimportar) um Mês que já tem previstos. Out/26 e nov/26 não têm, então reimportá-los não casa nada e se comporta como na 3.5.
