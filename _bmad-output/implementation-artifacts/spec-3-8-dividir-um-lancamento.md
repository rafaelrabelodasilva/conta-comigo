---
title: 'História 3.8: Dividir um Lançamento'
type: 'feature'
created: '2026-11-11'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4ac3c617d3decff9cad80560c3a636161e4fc9b1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael não consegue repartir uma conta entre pessoas (o JIM COM de R$ 466,00 em 2/3 Mãe e 1/3 dele). Sem isso, a barra por Responsável, os Blocos (Épico 4) e a cobrança mentem sobre quem deve o quê, e a Regra, a herança e os previstos não têm onde guardar a Divisão (FR-15, UX-DR15, AD-2, AD-8).

**Approach:** Uma linha-mãe guarda a `divisao` em frações; a RPC `dividir_lancamento` grava a mãe e as filhas (`dividido_de_id`) com os valores que o núcleo (`dividirEmPartes`) calculou. Uma regra única no núcleo diz quem entra em cada soma: a mãe dividida fica fora de toda soma, filtro e seleção (valem as filhas); Conferência, "Total a pagar", casamento e reimportação continuam na mãe. Regra, herança (3.7) e previstos guardam e copiam a Divisão em frações.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1, AD-2):** a Divisão (frações, validação, valores das partes, quem entra em soma, propagação) é função de `src/domain` (arquivo novo `divisao.ts`, só imports relativos). O arredondamento é só `dividirEmPartes`; nada de float; a RPC grava o que o núcleo calculou e nunca recalcula valores. Textos em `mensagens.ts`.
- **Formato (decisão do agente, a aprovar):** `divisao = { modo: "valor" | "proporcao", partes: [{ responsavel_id, numerador, denominador, filha_id? }], regra_chave?, responsavel_antes? }`. Cada parte é fração de inteiros; a soma é 1 exata (BigInt, `dividirEmPartes` já valida). "Por valor" guarda `valor_i / total` (fração reduzida), então o mesmo Valor dá exatamente os mesmos centavos. `modo` só decide como a janela reabre. `filha_id` (só na mãe) liga cada parte à sua filha; Regra e previsto guardam a Divisão sem `filha_id`. `Status` por parte vive só na filha (e na janela); a Regra e o previsto criam filhas com o Status da mãe.
- **Schema (migração `…_dividir_lancamento.sql`):** `lancamentos.divisao jsonb` e `regras.divisao jsonb` (objeto, ou nulo); o índice único `(fatura_id, ordem_fatura)` passa a valer só para `dividido_de_id is null` (a filha copia fatura e ordem da mãe, e a restrição `lancamentos_fatura_check` exige os dois); `referencias_cadastro()` e `REFERENCIAS_JSONB` ganham `divisao` (Responsável, sem contar uso); RPC `dividir_lancamento(p_itens jsonb)` e `create or replace importar_fatura` (7 argumentos, mesma assinatura). `dividido_de_id` já existe (3.5). A Regra **não** tem coluna de Divisão hoje (conferido no banco de produção): a 3.8 cria `regras.divisao`.
- **Filha:** copia da mãe `nome`, `nome_normalizado`, `apelido`, `data`, `parcela_n/total`, `final_cartao`, `mes`, `fatura_id`, `ordem_fatura`, `lancado_por`, `tipo_id`, `observacao`, `serie_id`, `origem_lancamento_id`; tem o próprio `responsavel_id`, `status_id` e `valor_centavos`; nunca tem motivo de revisão, `casado_em` nem Ajuste. Dividir recria só o que muda: filha existente na mesma posição mantém o `id` (futuro Pagamento); sobra é excluída em lógico (AD-16); falta é criada.
- **Quem entra em soma (regra única em `divisao.ts`):** `unidadesDoMes` = linhas do Mês menos mães divididas (Total do rodapé da grade, barra por Responsável, filtros, contagens, seleção, ordenação); `linhasDaFatura` = linhas do Mês menos filhas (Conferência, "Total a pagar", "verificar", resumo da importação, aviso da reimportação, casamento e herança). `linhasDoMes` continua sendo o conjunto que o Painel mostra (mães e filhas).
- **Classificada** (um helper no núcleo): `tipo_id` e (`responsavel_id` ou `divisao`). Mãe dividida tem `responsavel_id` nulo; **Dividir exige Tipo**; a mãe sai da fila ao dividir. `planejarGravacao`/`planejarLote` ignoram Responsável numa mãe dividida.
- **Regra (3.1) sem confirmação:** dividir ensina a Divisão à Regra do Nome; escolher um Responsável sem dividir limpa a Divisão da Regra; "Desfazer divisão" também. Regra com Divisão e Tipo ativos aplica a Divisão na importação (a mãe ganha `divisao.regra_chave`, a janela mostra "Divisão aplicada pela Regra de NOME"); Responsável arquivado numa parte = Regra ignorada. Regra sem Tipo não aplica Divisão.
- **Previstos:** `gerarPrevistos` copia a `divisao` e o previsto nasce com as filhas (mesmo Valor, mesmos centavos). Redividir ou escolher a Divisão da parcela real propaga como a 3.5 (4-A): previstos sem Divisão recebem sozinhos; os com outra Divisão só mudam com "Aplicar a todos"; "Desfazer divisão" também desfaz, sozinho, nos previstos com a mesma Divisão. A herança (3.7) acrescenta `divisao` a `CAMPOS_HERDADOS`, `CandidataParaHerdar`, `mesclarHerdada` e `lerParcelasDoMesAnterior`. O casado (3.6) mantém as filhas do previsto e a RPC as atualiza com os dados da Fatura (e, se o Valor mudou, com os valores novos calculados pelo núcleo).
- **Mãe dividida:** Valor e Responsável somente leitura (o painel diz "Dividido"); Tipo, Apelido, Observação e data seguem para as filhas na mesma gravação (`junto`); excluir e restaurar a mãe levam as filhas. A filha abre um painel reduzido: só o Status é editável, "Abrir divisão" abre a janela da mãe, sem excluir. "Dividir" fica desativado em linha com Ajuste de centavos, em Ajuste, em filha, com Valor zero ou sem Tipo.
- **Limites:** 2 a 10 partes; frações digitadas como `a/b` ou `N%` (até 2 casas); o Valor da mãe até R$ 900.000,00 na janela; nenhuma parte zerada (fração ou centavos); crédito (Valor negativo) divide; só libera "Dividir" quando a soma bate exatamente.
- **Decisões do Rafael (11/11/2026, todas A, spec inteira mantida):** Q1 filhas são as unidades de soma/filtro/seleção e a mãe é cabeçalho; Q2 filha copia tudo menos Responsável/Status/Valor, Tipo da mãe, "Dividir" exige Tipo; Q3 mãe dividida com Valor e Responsável somente leitura, filha só edita o Status; Q4 a Regra aprende e aplica sem pergunta; Q5 a RPC cria mãe+filhas na importação, casamento, herança e previstos; Q6 limites acima. O "Desfazer" do toast de Dividir também reverte os previstos que a própria ação preencheu.
- **Manter** tudo da 2.3 à 3.7: hero e troca de Mês, ordenação, Conferência e "verificar", filter-bar, painel e Ajustes, Regras e Regras aprendidas, reimportação e a trava `fatura.reimportacao_com_casados`, Fila do Revisar e lote, Séries e previstos com selo, origem e "Só este / Aplicar a todos", casamento, herança.

**Never:** Apelido em massa (3.9); histórico da planilha (3.10); reimportar mantendo a classificação (3.12); Pagamentos e Blocos (Épicos 4 e 6); Tipo por parte; Contas manuais com Divisão (Épico 5); `console.*`; `supabase.from()` em tela; alterar ou apagar dado de produção sem Rafael confirmar; regra de negócio em SQL.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Monjaro | R$ 466,00, 2/3 Mãe + 1/3 Rafael | filhas R$ 310,67 + R$ 155,33 ("+1 centavo" na última); mãe fora das somas | N/A |
| Por valor | R$ 466,00 = 310,67 + 155,33 | guarda 31067/46600 e 15533/46600; reabrir mostra os mesmos valores | soma ≠ Valor: "Dividir" desativado |
| Crédito | − R$ 100,01 em 1/3 + 2/3 | partes − R$ 33,34 e − R$ 66,67 (soma = Valor) | N/A |
| Parte zerada | R$ 0,01 em 1/3 + 2/3 | recusa antes de gravar | `divisao.parte_zerada` |
| Frações | 1/2 + 1/3 | "Dividir" desativado (soma ≠ 1) | `divisao.fracoes_invalidas` |
| Sem Tipo / com Ajuste | linha sem Tipo, ou com Ajuste | "Dividir" desativado, com o motivo escrito | N/A |
| Redividir | mãe dividida, nova Divisão com 3 partes | 2 filhas mantêm o `id`, 1 criada; soma = Valor | N/A |
| Desfazer divisão | mãe dividida à mão | filhas excluídas, `divisao` nula, Responsável de antes volta | N/A |
| Desfazer (Regra) | mãe dividida pela Regra | sem Responsável: entra na fila "sem classificação" | N/A |
| Importar | Regra com Divisão e Tipo; linha nova | mãe com `divisao.regra_chave` + filhas; fora da fila | N/A |
| Previsto | parcela 3/12 dividida | previstos 4/12…12/12 nascem com a Divisão e as filhas | N/A |
| Casado | previsto dividido casa com Valor igual / diferente | mantém filhas / filhas recalculadas pelo núcleo | N/A |
| Reimportar | Mês com mãe dividida (sem casados) | mãe e filhas saem; aviso conta a mãe como "à mão" | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/dinheiro.ts` -- `dividirEmPartes`/`arredondar`/`Fracao` já existem (AD-2); reusar, não mexer.
- `src/domain/divisao.ts` (novo, + teste) -- tipo `Divisao`, leitura de fração (`a/b`, `N%`), `fracoesPorValor`, `validarDivisao` (limites), `valoresDasPartes`, `ehMaeDividida`/`ehFilha`/`estaClassificada`, `unidadesDoMes`/`linhasDaFatura`/`agruparPartes`, `planejarDivisao` (itens da RPC, sai da fila, Responsável antes), propagação aos previstos, resumo textual.
- `src/domain/painel.ts`, `ajustes.ts`, `filtros-grade.ts` -- a grade passa a ordenar/filtrar `unidades` e agrupar as filhas sob a mãe (como `agruparComAjustes`); `distribuicaoPorResponsavel` e `somarValores` recebem unidades.
- `src/domain/conferencia.ts`, `importacao-fatura.ts`, `revisar.ts` -- `conferir`, `comporTotalAPagar` (via `daFatura`), `resumoDaImportacao`, `resumirReimportacao` e `ehDaFila` ignoram filhas; `LancamentoParaGravar` ganha `divisao` e `partes`.
- `src/domain/lote.ts`, `classificacao.ts`, `regras.ts` -- `estaClassificada`, Responsável ignorado em mãe dividida; Regra com `divisao` (aprender/limpar/aplicar/editar-remover).
- `src/domain/previstos.ts`, `heranca.ts` -- `divisao` em `CAMPOS_HERDADOS`, `CandidataParaHerdar`, `mesclarHerdada`, `LinhaParaPrever`, `PrevistoParaGravar`, `PrevistoParaCasar`, `planejarPropagacao`.
- `src/data/lancamentos-repo.ts` -- `dividir`/`desfazerDivisao` pela RPC (aplica mãe e filhas no gerenciador, sem Realtime novo) e propagação aos previstos; `junto` das filhas.
- `src/data/regras-repo.ts`, `faturas-repo.ts` -- `aprender` com `divisao`; `lerPrevistosDoMes` passa a ignorar filhas (hoje não filtra `dividido_de_id`); `COLUNAS_CANDIDATAS`/`lerParcelasDoMesAnterior` com `divisao`; `COLUNAS_REIMPORTACAO` com `dividido_de_id`.
- `src/features/painel/JanelaDividir.tsx` (novo), `PainelLancamento.tsx`, `GradeLancamentos.tsx`, `Painel.tsx` -- janela, botão e estados, linhas "↳", menu ⋯ "Dividir", unidades. `FaturaDoMes.tsx`, `FaixaConferencia.tsx` sem mudança de lógica.
- `src/features/configuracoes/LinhaRegra.tsx`, `SecaoRegras.tsx`, `JanelaEditarRegra.tsx` -- coluna Divisão e "Remover divisão". `src/features/importar/ImportarFatura.tsx` -- Regra/herança aplicam a Divisão; o passo 3 conta as divididas.
- `src/data/realtime.ts`, `src/features/revisar/*` -- sem mudança: filha e mãe dividida saem de `ehDaFila`; a RPC devolve mãe e filhas para `aplicarLote`.
- `supabase/migrations/20261117120000_dividir_lancamento.sql`, `src/data/database.types.ts` (à mão, formato do gerado) -- colunas, índice, referências, `dividir_lancamento`, `importar_fatura` (divisão nas linhas novas, casados e previstos).
- `test/integracao/divisao.test.ts` (CI), pglite em scratchpad novo (todas as migrações em ordem).
- Produção (só contagens, 11/11/2026, reconferidas): out/26 49 linhas (todas na fila), nov/26 46 (42 na fila), dez/26 a set/27 77 previstos (21 em dez/26), 23 Séries, 0 Regras, 0 filhas, 0 classificadas ou editadas, 0 casadas; `divisao` não existe em `lancamentos` nem em `regras`.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/divisao.ts` (+ teste) -- núcleo da Divisão e a regra única de soma
- [x] `src/domain/*` (painel, filtros-grade, conferencia, revisar, lote, classificacao, regras, previstos, heranca, importacao-fatura, mensagens) (+ testes) -- integração com o núcleo novo
- [x] `supabase/migrations/20261117120000_dividir_lancamento.sql` + `database.types.ts` -- schema e RPCs
- [x] `src/data/*` (+ testes) -- repositórios
- [x] `src/features/*` (+ testes jsdom) -- janela, painel, grade, Regras aprendidas, importação
- [x] `test/integracao/divisao.test.ts` -- aceite (CI)
- [ ] pglite -- migrações em ordem e a matriz
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- itens novos

**Acceptance Criteria:**
- Given um Lançamento com Tipo, when Rafael divide R$ 466,00 em 2/3 e 1/3, then a mãe guarda a `divisao`, as filhas somam sempre o Valor da mãe (R$ 310,67 + R$ 155,33), a mãe não entra em nenhuma soma e a grade mostra as filhas com "↳".
- Given Valor negativo, qualquer Divisão válida, when a RPC grava, then a soma das filhas é igual ao Valor da mãe (teste de aceite, inclusive crédito).
- Given uma mãe dividida, when Rafael abre "Dividir", then a janela abre em modo de edição com "Desfazer divisão" e recria as filhas; se veio da Regra, mostra "Divisão aplicada pela Regra de NOME".

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). Decisões Q1-A a Q6-A aprovadas pelo Rafael antes de começar; a spec inteira foi mantida (≈ 4.800 tokens).
- **Núcleo:** `src/domain/divisao.ts` (formato, `lerFracao`, `avaliarRascunho`, `planejarDivisao`/`planejarDesfazerDivisao`, `planejarDivisaoNosPrevistos`, `itemParaRestaurar`, `unidadesDoMes`/`linhasDaFatura`, `agruparPartes`, `motivoParaNaoDividir`). Integrado em `regras.ts` (`aprenderRegra` com `divisao`, `divisaoDaRegra`, `editarRegra` remove), `classificacao.ts` (a Regra divide sozinha), `heranca.ts` (`divisao` em `CAMPOS_HERDADOS`; Responsável e Divisão são um campo só), `previstos.ts` (previstos e casado com `partes`), `lote.ts` (Responsável ignorado na mãe dividida; as filhas seguem Tipo e Observação), `conferencia.ts`, `revisar.ts`, `importacao-fatura.ts`.
- **Migração `20261117120000_dividir_lancamento.sql`:** `lancamentos.divisao` e `regras.divisao` (a Regra não tinha a coluna), índice `(fatura_id, ordem_fatura)` só para mães, `referencias_cadastro()` com a `divisao`, `recriar_filhas` (interna: reaproveita o `id` pela posição, exclui a que sobra em lógico, **revive pelo `filha_id`**), `dividir_lancamento` e `importar_fatura` (7 argumentos) com as filhas da linha nova, do casado e do previsto novo, sempre por último e com os `join` por posição só de mães.
- **Acréscimos além da spec:** (1) `recriar_filhas` como função própria, usada pelas duas RPCs; (2) o ✓ do rodapé da janela é só da soma (o Responsável que falta aparece numa dica); (3) "(+1 centavo)" só aparece quando a última parte difere da sua fração arredondada (no Monjaro não aparece: 155,33 é a fração exata); (4) `lerReimportacao` e `lerPrevistosDoMes` passam a ignorar as filhas (o segundo não filtrava `dividido_de_id`); (5) `Seletor` aceita rótulo vazio (as linhas da janela usam `aria-label`); (6) o texto do passo 3 é "N lançamentos entram divididos" (vale para a Regra e para a parcela anterior).
- **Provado:** Vitest (1.8k testes, com os 100+ novos), `tsc`, `eslint`, `next build`; no pglite, com todas as migrações em ordem, `cenarios38.mjs` (41 verificações da RPC) e `e2e38.mts` (o planejador real em TypeScript montando os mesmos payloads); os cenários da 3.7 seguem passando. `test/integracao/divisao.test.ts` só roda no CI; as entradas de `database.types.ts` foram escritas à mão no formato do gerado.

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| `recriar_filhas` é executável pelo usuário e contorna as checagens de `dividir_lancamento` (Ajuste, soma) | low | Só mexe em linhas do próprio dono (RLS e `owner_id`); app de um usuário só. Registrado em `deferred-work.md` |
| A reimportação simples apaga o previsto dividido mesmo se o Status de uma filha foi editado (a edição está na filha; o `editado_em` do previsto fica nulo) | low | Regra da 3.5 (3-A) olha só a mãe do previsto. Registrado para a 3.12 |
| As filhas apagadas em cascata com um previsto não entram em `removidos.previstos` | low | Memória do Mês aberto recebe o DELETE do Realtime; a RPC já devolve as filhas da Fatura. Registrado |
| Excluir uma filha em lógico (redividir, Desfazer divisão) não olha Pagamento | maybe-false | Pagamentos só existem no Épico 6; a RPC precisa de trava lá. Registrado |
| `dividirEmPartes` lança acima de ≈ R$ 949 mil | false | A janela e `valoresDasPartes` recusam acima de R$ 900.000,00 (`divisao.valor_grande`) antes de chamar a conta; teste do limite |
| Bolinha "verificar" aparece no cabeçalho e nas partes | low | As partes copiam cartão e Fatura, então `precisaVerificar` vale para elas; mantido para o filtro "Verificar" mostrar as partes |
| Mãe dividida que volta à fila (Tipo limpo) abre o "Mudar" pedindo Responsável | low | `planejarGravacao` ignora o Responsável, mas o `Mudar` mostra o seletor. Registrado |
| Casado com Valor da Fatura que zera uma parte | false | `partesDaImportacao(..., permitirZero)` aceita R$ 0,00 só no casado; testado |

## Design Notes

**Quem lê o quê.** `linhasDoMes` (tudo o que o Painel mostra) → `unidadesDoMes` (grade, rodapé, barra, filtros, seleção) e `linhasDaFatura` (Conferência, hero, "verificar", resumos). Como a filha copia `fatura_id`, `final_cartao` e `ordem_fatura`, `precisaVerificar` e os filtros funcionam sem caso especial; só a Conferência precisa ignorar as filhas.

**Ordem na RPC `importar_fatura`.** Linhas novas → casados (mãe) → Ajustes → previstos → **por último** as filhas (para os `join` por `ordem_fatura` não pegarem filha) → devolve mães e filhas.

**Produção.** Nada muda sem Rafael dividir algo. Dividir uma parcela n/N com Tipo faz os previstos dos Meses seguintes nascerem divididos; "Desfazer divisão" os desfaz juntos.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde
- pglite (scratchpad) -- todas as migrações em ordem + matriz da Divisão -- expected: sem falhas
