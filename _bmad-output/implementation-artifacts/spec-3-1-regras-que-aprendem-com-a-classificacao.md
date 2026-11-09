---
title: 'História 3.1: Regras que aprendem com a classificação'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '4b43b463f0ddd2763fd14af2c6502a4d35ce7daf'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael classifica o mesmo Nome todo Mês; o app não lembra nada e a importação grava tudo sem Responsável e sem Tipo, jogando fora o `tipo_sugerido` que a extração já traz (FR-9, FR-10, FR-11).

**Approach:** Tabela `regras` com chave `chaveDeRegra(nome)` do núcleo. Classificar Responsável ou Tipo em qualquer tela chama `regrasRepo.aprender()`; a importação classifica pelo núcleo (`classificarImportacao`) antes de gravar: Regra sem dúvida aplica, Regra com dúvida e `tipo_sugerido` só sugerem e mandam para a fila.

## Boundaries & Constraints

**Always:**
- `chaveDeRegra(nome)` = `normalizarNome` + `*` sem espaços em volta + sem prefixo de adquirente (lista fixa no núcleo: `DM`, `EBN`, `EBANX`, `MP`, `PG`, `IFD`, `PAYPAL`, `PICPAY`, `DELTAPG`, `JIM COM`, `PAGSEGURO`, `SUMUP`) + sem o último pedaço com dígitos ("P4750", "385", "- 314835478") quando sobra outro. `VERSAO_NORMALIZACAO = 1` gravada em cada Regra. "SHOPEE *X" mantém o "SHOPEE" (marketplace, não adquirente).
- Só `regrasRepo.aprender()` grava em `regras`. Ela é chamada pelo repositório de Lançamentos (`atualizar` e `incluir`) quando Responsável ou Tipo mudam, de qualquer tela; nunca para os ids que vão `junto` (Ajustes), nem em `desvincular`/`religar`, nem para uma linha com `ajuste_de_id`. A falha de `aprender` não desfaz nem avisa a gravação do Lançamento.
- Contagem por Responsável = `contagem jsonb` em forma de lista `[{"responsavel_id": "...", "n": 3}]` (ids só como valores, nunca como chave). **Só soma (decisão 6-A):** a gravação em que o Responsável passa a um valor não nulo diferente do anterior soma 1 a ele; nada é subtraído. Regra criada por uma gravação só de Tipo numa linha que já tem Responsável soma 1 a esse Responsável. **Só escolher ensina (decisão 7-A):** um campo que a gravação deixa nulo não muda o campo da Regra; uma gravação que só limpa não chama `aprender`, e a linha da Fatura que fica sem Responsável ou sem Tipo volta à fila como `sem_classificacao`. `responsavel_id`/`tipo_id` da Regra = o último valor não nulo escolhido. `ultimo_uso` = momento do último `aprender`. O núcleo soma entradas repetidas e ignora `responsavel_id` nulo.
- Regra "com dúvida" = mais de um Responsável com `n > 0`; o sugerido é o de maior `n` (empate: o `responsavel_id` da Regra).
- Na importação, cadastro arquivado ou inexistente numa Regra/sugestão conta como ausente. Créditos também recebem Regra; o Ajuste nunca é classificado por Regra própria.
- `regras` com `owner_id default auth.uid()`, RLS do dono, `unique (owner_id, chave)`, `replica identity full`, na publicação do Realtime, FKs compostas para `responsaveis`/`tipos` com `on delete set null` da coluna. `referencias_cadastro()` e `REFERENCIAS_COLUNAS/JSONB` ganham `regras.responsavel_id`, `regras.tipo_id` (coluna), `regras.contagem` (jsonb), todos com `conta_uso = false`.
- `substituir_cadastro`: com substituto, troca o id também no jsonb (`trocar_id_jsonb`); sem substituto, uma referência jsonb sem `conta_uso` não bloqueia: o id vira `null` no documento.
- Manter tudo o que 2.3–2.8 trouxeram: hero, troca de Mês, ordenação, faixa da Conferência, bolinha "verificar", filter-bar com contagens, painel do Lançamento, Ajustes (seguir a mãe na mesma gravação, Desvincular/Desfazer, exclusão em grupo), Valor zero.

**Decisões do Rafael (09/11/2026):**
- **Fila (1-A):** a 3.1 cria `revisao_motivo` (`sem_classificacao`, `sugestao`, `sugestao_duvida`) e `revisao_dados` (`{responsavel_id, tipo_id, outros_responsaveis: []}`, ids só como valores; também em `REFERENCIAS_JSONB`, `conta_uso = false`) em `lancamentos`. A importação grava; a gravação que deixa a linha com Responsável e Tipo limpa os dois no mesmo corpo. Na grade nada muda (a linha sugerida segue sem classificação); o painel mostra a sugestão só como texto ("Sugestão: Casal · Saúde (às vezes Rafael)"). `revisado_em`, a tela e o contador ficam na 3.2.
- **Parcelas (2-B):** a Regra classifica à vista e parcelas (até a 3.7 pôr a herança na frente). O Ajuste vinculado recebe a classificação da mãe, calculada no núcleo, sem motivo próprio.
- **Regras do que já existe (3-A):** nenhuma migração ou ação aprende do passado; as Regras nascem das próximas classificações (a 3.10 cria as iniciais da planilha).
- **Spec inteira (4) e subagentes (5):** mantidos.
- **Revisão, 09/11/2026:** contagem só soma (6-A); só escolher ensina (7-A); as linhas já gravadas de out/26 e nov/26 ficam com `revisao_motivo` nulo e a 3.2 decide (8-B, pendência no deferred-work).

**Never:** tela de Regras (3.4), fila/contador do Revisar (3.2), Séries/previstos/herança (3.5–3.7), Divisão na Regra (3.8), reimportação (3.11); apagar ou reimportar dados de produção; `chaveDeRegra` em SQL.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado |
|---|---|---|
| Chave | "DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY", "DM*SPOTIFY P4750", "EBN *SPOTIFY" | todas "SPOTIFY"; `normalizarNome` continua diferente |
| Aprender novo | classifica "COBASI CRICIUMA" Rafael · Gatos | Regra criada, contagem Rafael 1 |
| Trocar Responsável | Regra Rafael 1; linha muda Rafael→Casal | Rafael 1, Casal 1, responsavel_id Casal; próxima importação: dúvida, sugere Casal |
| Corrigir o que a Regra aplicou | Regra Rafael 1 aplicou Rafael; linha muda para Mãe | Rafael 1, Mãe 1 (com dúvida); nunca Rafael 0 |
| Limpar | linha Casal · Casa; Tipo limpo | Regra continua Casa; linha volta a `sem_classificacao`; sem `aprender` |
| Regra limpa | importa à vista com Regra Casal · Casa | grava Casal · Casa, sem motivo |
| Regra com dúvida | contagem Rafael 2, Mãe 1 | não aplica; sugere Rafael · Tipo; vai para a fila |
| Sem Regra, com tipo_sugerido | "PETZ" sem Regra, extração "Gatos" | não aplica; sugere Gatos; vai para a fila |
| Sem nada | sem Regra, sem tipo_sugerido | sem classificação; motivo `sem_classificacao` |
| Parcela com Regra | "MSC CRUZEIROS 03/12" com Regra limpa | recebe a Regra; o Ajuste MSC −0,08 recebe a mesma |
| Ajuste vinculado | mãe classificada na importação | Ajuste recebe a mesma classificação, sem motivo próprio |
| Mãe salva com Ajustes | painel muda Tipo da mãe com 2 Ajustes | um `aprender` só (da mãe) |
| Excluir Responsável sem substituto | só citado numa Regra | exclui; coluna da Regra nula; na contagem o id vira null |
| Substituir A por B | contagem com A 2 e B 1 | id trocado; núcleo lê B 3 |

</frozen-after-approval>

## Code Map

**Núcleo**
- `src/domain/regras.ts` (novo): `VERSAO_NORMALIZACAO`, `PREFIXOS_ADQUIRENTE`, `chaveDeRegra`, `lerContagem` (soma repetidas, ignora null), `aprenderRegra(atual | null, {nome, responsavelAntes, responsavelDepois, tipoDepois}, agora)` → linha a gravar, `avaliarRegra(regra, ativos)` → `aplicar | sugerir_duvida | nada`.
- `src/domain/classificacao.ts` (novo): `classificarImportacao(lancamentos, regras, cadastrosAtivos)` → por linha `responsavel_id`, `tipo_id`, `revisao_motivo`/`revisao_dados`; o Ajuste copia a mãe (`ajuste_de_ordem`).
- `src/domain/importacao-fatura.ts:110,163` -- `LancamentoParaGravar` ganha `tipo_sugerido` (nome, já filtrado por `extracao-fatura.ts:170`) e os campos de classificação; `prepararImportacao` só repassa.
- `src/domain/cadastros.ts:36,44` -- novas referências.
- `src/domain/mensagens.ts` -- texto da sugestão no painel.

**Dados**
- `supabase/migrations/20261110120000_regras.sql` (novo): tabela, RLS, FKs, índices, publicação; `referencias_cadastro()`; `substituir_cadastro` com o ramo jsonb sem substituto; `importar_fatura` (mesma assinatura, base em `20261109120000_ajustes.sql`) inserindo `responsavel_id`, `tipo_id` e as colunas de revisão (criadas aqui). FK de `lancamentos` para cadastros já existe; validar os ids pelo dono (a FK composta faz isso).
- `src/data/database.types.ts` -- à mão, igual a `supabase gen types` (o CI compara).
- `src/data/regras-repo.ts` (novo): `aprender(evento)` (fila por chave para não perder incremento; lê a Regra, `aprenderRegra`, `upsert onConflict owner_id,chave`), `listar()` para a importação.
- `src/data/lancamentos-repo.ts:150,165` -- `atualizar`/`incluir` chamam `aprender` (só a linha principal, não Ajuste); quando a linha fica com Responsável e Tipo, o mesmo corpo leva `revisao_motivo/dados = null`.
- `src/features/importar/ImportarFatura.tsx:137` -- na etapa "classificando", `regrasRepo.listar()` + `classificarImportacao`; falha ao ler Regras → importa sem classificação (não bloqueia).
- `src/features/painel/PainelLancamento.tsx:558` -- linha da sugestão sob os seletores.

**Correções da revisão (entram na implementação):**
- `ImportarFatura.tsx` -- só classificar com `responsaveis` e `tipos` em `status` "pronto" (esperar o carregamento; teste com o mock "carregando").
- `classificacao.ts` -- Regra que aplica só o Responsável e um `tipo_sugerido` ativo → `revisao_motivo = 'sugestao'` com `revisao_dados.tipo_id` do sugerido (o Responsável aplicado continua).
- `classificacao.ts` (`lerDadosRevisao`) -- `outros_responsaveis` sem repetidos e sem o `responsavel_id` sugerido.
- `PainelLancamento.tsx` (`sugestaoDaLinha`) -- cadastro arquivado não aparece na sugestão.
- `regras.ts` (`chaveDeRegra`) -- prefixo seguido de espaço só para `EBN` e `EBANX`; os outros só com `*` ("MP CONSTRUCOES" e "PG ENGENHARIA" ficam inteiros; teste negativo).
- `lancamentos-repo.ts` / teste -- teste que prova que `repoLancamentos()` (o do navegador) liga `aprender` ao `repoRegras().aprender` (ex.: `vi.mock("./regras-repo")`).

**Testes**: `src/domain/regras.test.ts`, `classificacao.test.ts` (com `test/fixtures/extracao-2026-10.json`), `regras-repo.test.ts`, `lancamentos-repo.test.ts`, `PainelLancamento.test.tsx`, `ImportarFatura.test.tsx`; integração `test/integracao/regras.test.ts` (RLS, unique, importação com classificação e Ajuste), `substituir-cadastro.test.ts` (troca e anulação jsonb, contagem de usos não muda — pendência da 1.6).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/regras.ts`, `classificacao.ts`, `importacao-fatura.ts`, `cadastros.ts`, `mensagens.ts` + testes -- regras puras e a matriz
- [x] `supabase/migrations/20261110120000_regras.sql`, `database.types.ts`, `test/integracao/*` -- schema, RPCs e o ramo jsonb
- [x] `src/data/regras-repo.ts`, `lancamentos-repo.ts` + testes -- aprender só pela linha principal
- [x] `ImportarFatura.tsx`, `PainelLancamento.tsx` + jsdom -- classificar na importação, sugestão no painel
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- fechar a pendência jsonb da 1.6

**Acceptance Criteria:**
- Given o deploy, when Rafael abre out/26 e nov/26, then hero, faixa, filtros, grade, Ajustes e painel ficam como na 2.8.
- Given Rafael classifica no painel, when consulto `regras` em produção, then existe a Regra da chave com a contagem certa.

## Implementation Notes

- Regra sem dúvida com só um dos dois cadastros ativos (ex.: só Tipo): aplica o que tem e a linha fica com `revisao_motivo = sem_classificacao` (falta classificar). Regra sem nenhum cadastro ativo cai no caminho "sem Regra" (`tipo_sugerido` ou `sem_classificacao`).
- Regra com dúvida: o Tipo sugerido é o da Regra (ativo); sem ele, o `tipo_sugerido` da extração. `outros_responsaveis` vai em ordem de `n` decrescente. A dúvida conta só Responsáveis ativos com `n > 0`.
- `tipo_sugerido` (nome) vira id pelo nome exato do Tipo ativo, ou pelo nome normalizado.
- `prepararImportacao` sai com `revisao_motivo = sem_classificacao` (Ajuste: null); `classificarImportacao` devolve as linhas com as quatro colunas preenchidas.
- `chaveDeRegra`: o prefixo de adquirente só sai seguido de `*` ou espaço, e nunca esvazia a chave; o "último pedaço com dígitos" é o último separado por espaço (com o `-` solto antes).
- `revisao_motivo` é enum `public.revisao_motivo`; `anular_id_jsonb(doc, de)` troca `"<id>"` por `null` (só para referências jsonb sem `conta_uso`, que guardam ids só como valores).
- `lancamentosRepo.atualizar` só manda `revisao_motivo/dados = null` quando a linha estava na fila e fica com Responsável e Tipo. `aprender` é disparado sem esperar, depois da gravação confirmada.

## Spec Change Log

- **Iteração 1 (revisão de 09/11/2026):** achados 1–3 do Review Triage Log (a contagem subtraía o que a Regra aplicou na importação; limpar apagava o campo da Regra; linhas já gravadas fora da fila). O Rafael renegociou o bloco congelado: contagem só soma (6-A), só escolher ensina e limpar devolve à fila (7-A), linhas antigas ficam para a 3.2 (8-B). Estado evitado: uma correção de A→B zerar A e tirar a dúvida das farmácias. As correções 4–6, 8, 9, 17 e 21 estão em "Correções da revisão". **KEEP:** a implementação anterior está salva em `/private/tmp/claude-502/-Users-rafael--claude-spares-spare-oBgEY0/2ac9cbae-ca91-4552-8bd5-f07ae3055eec/scratchpad/implementacao-v1.patch` (diff desde o baseline, já com todos os arquivos); reaproveitar o que não muda: migração (tabela, enum, `anular_id_jsonb`, `substituir_cadastro`, `importar_fatura`), `database.types.ts`, `regras-repo.ts` (fila por chave, `listar` paginado), a ligação em `lancamentos-repo.ts` (só a linha principal, nunca `junto`/Ajuste), `ImportarFatura.tsx`, a linha de sugestão do painel, os testes de integração, `test/backup/dados-exemplo.sql`, `apoio.ts`. O fechamento da pendência jsonb no deferred-work já está feito.

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind + orquestrador | A→B subtrai 1 de A mesmo quando A veio da Regra na importação (não foi contado): uma correção apaga o histórico e tira a dúvida (farmácias) | high | `aprenderRegra` sempre faz A −1; a RPC aplica a Regra sem somar; a regra "A −1" está no bloco congelado | intent_gap |
| 2 | blind | Limpar Responsável ou Tipo grava `null` na Regra; a próxima importação aplica pela metade | medium | `aprenderRegra` copia `responsavelDepois`/`tipoDepois` mesmo nulos; regra congelada "os da linha depois da gravação" | intent_gap |
| 3 | blind | Linhas de out/26 e nov/26 sem classificação ficam com `revisao_motivo` nulo e fora da fila da 3.2 | medium | a migração só cria a coluna; não é proibido pela 3-A | intent_gap |
| 4 | edge + blind + verificação | Importação classifica com Responsáveis/Tipos ainda carregando: tudo vira `sem_classificacao` sem aviso | medium | `ImportarFatura.tsx` ignora `status` de `useLinhas`; o mock sempre "pronto" | patch |
| 5 | edge + blind | Limpar a classificação de uma linha fora da fila não a devolve como `sem_classificacao` | medium | `atualizar` só anula as colunas de revisão | patch |
| 6 | edge | Regra com só o Responsável descarta o `tipo_sugerido` | low | ramo `aplicar` incompleto grava `revisao_dados = null` | patch |
| 7 | edge | Responsável da Regra arquivado com um outro ativo na contagem não é aplicado | low | caso raro; correção acrescenta ramo | rejeitado |
| 8 | edge + blind | Depois de substituir, a sugestão pode dizer "Casal (às vezes Casal)" | low | `lerDadosRevisao` não tira repetidos nem o sugerido de `outros` | patch |
| 9 | edge | Painel sugere cadastro arquivado depois da importação | low | `sugestaoDaLinha` não olha `arquivado` | patch |
| 10 | edge | Cadastro excluído entre classificar e confirmar derruba a importação com erro genérico | low | janela de segundos, exclusão exige outra tela; correção acrescenta ramo SQL | rejeitado |
| 11 | edge | `chaveDeRegra` vazia viola o check | false | `chaveDeRegra` nunca devolve vazio (testes) e o Nome da Fatura nunca é vazio | rejeitado |
| 12 | edge | `anular_id_jsonb` quebra se um id virar chave no futuro | low | documentado; nenhuma referência usa id como chave | rejeitado |
| 13 | edge + blind | Dois aparelhos classificando a mesma chave ao mesmo tempo perdem um incremento | low | um usuário; a correção pede RPC atômica | rejeitado |
| 14 | blind | Sem check de coerência entre `revisao_motivo` e `revisao_dados` | low | só o núcleo grava; nenhum leitor quebra | rejeitado |
| 15 | blind | Ids em `revisao_dados` não validados pelo dono | low | só são mostrados nomes dos cadastros do próprio dono (RLS); id alheio não aparece | rejeitado |
| 16 | blind | `versao_normalizacao` gravada e nunca lida | false | é o que o AD-6 pede agora; a política vale quando a versão subir | rejeitado |
| 17 | blind | Prefixos curtos seguidos de espaço juntam lojas diferentes ("MP CONSTRUCOES") | low | o espaço só é preciso para EBN/EBANX (exemplos do FR-9) | patch |
| 18 | blind | Status da spec diferente do sprint-status | false | `in-review` é estado da spec; o sprint fica `in-progress` até o fim | rejeitado |
| 19 | blind | AC de produção sem comando | false | é conferência manual depois do deploy (passo 5) | rejeitado |
| 20 | blind | Falta teste de FK `on delete` fora da RPC | low | a exclusão só acontece pela RPC | rejeitado |
| 21 | verificação + blind | Nenhum teste prova que `repoLancamentos()` liga `aprender` | medium | todos os testes injetam o `aprender`; tirar a linha não quebra nada | patch |
| 22 | edge + blind | Dois aparelhos na mesma chave perdem incremento | low | carried: igual ao 13 (um usuário; RPC atômica) | rejeitado |
| 23 | edge | Chave vazia ou acima de 200 | false | carried: igual ao 11; Nome da Fatura tem no máximo 200 | rejeitado |
| 24 | edge (×2) | `versao_normalizacao` não filtra a leitura | false | carried: igual ao 16 | rejeitado |
| 25 | edge | Ids alheios em `revisao_dados` | low | carried: igual ao 15 | rejeitado |
| 26 | edge | Responsável da Regra arquivado com um único outro ativo | low | carried: igual ao 7 | rejeitado |
| 27 | edge + blind | Engano A→B→A deixa a Regra com dúvida para sempre | false | é a consequência aceita da decisão 6-A ("corrigir deixa os dois"); a 3.4 permite editar | rejeitado |
| 28 | edge + blind + verificação | Limpar a mãe com Ajustes: a 2ª requisição (motivo) pode falhar calada | low | precisa cair a rede entre duas requisições seguidas; a classificação fica salva; correção pede RPC | rejeitado; teste que fixa o comportamento entra (patch) |
| 29 | edge | Linha incompleta fora da fila, gravando o outro campo, não entra na fila | false | intencional: só a limpeza devolve, para manter 8-B | rejeitado |
| 30 | edge | Ajuste desvinculado sem classificação fica fora da fila | medium | `desvincular` só grava `ajuste_de_id`; mãe sem classificação → linha comum sem motivo | patch |
| 31 | edge + blind | `esperarCadastros`/`listar` sem prazo: a importação pode parar em "classificando"; esperas antigas ficam na lista | low | o status pode ficar "carregando" sem conexão; correção é um prazo | patch |
| 32 | blind | Nada avisa que as Regras não foram lidas | low | a importação segue; o resumo da fila é da 3.2 | rejeitado |
| 33 | blind | Regra existente sem contagem para o Responsável da linha: gravação só de Tipo não soma | medium | `aprenderRegra` só soma em Regra nova; a Regra criada sem Responsável fica sem ele | patch |
| 34 | blind | "POSTO 2000" e "POSTO 15" viram a mesma chave | low | é a regra congelada do último pedaço com dígitos; juntar postos é aceitável | rejeitado |
| 35 | blind | `ultimo_uso` não muda quando a importação aplica a Regra | low | definição congelada (só `aprender` grava); vai para a 3.4 | defer |
| 36 | edge + blind | Excluir cadastro deixa `sugestao` sem conteúdo | low | o painel já esconde; a 3.2 lê | defer |
| 37 | edge | Ajuste com mãe ausente | false | `reconhecerAjustes` sempre aponta para linha existente | rejeitado |
| 38 | edge | Dois Tipos com o mesmo nome normalizado | false | `nome-cadastro` recusa nomes repetidos (normalizados) | rejeitado |
| 39 | edge | Regra só com Tipo vai como `sem_classificacao` sem sugestão | low | o Tipo já está aplicado na linha | rejeitado |
| 40 | edge + blind | Cliente antigo em cache importa sem `revisao_motivo` | low | importação é rara e o PWA atualiza no carregamento | rejeitado |
| 41 | blind | Faltam testes de `revisao_dados` não objeto e motivo inválido na RPC | low | o núcleo nunca manda; o cast inválido já desfaz tudo | rejeitado |
| 42 | blind + verificação | Comentário do `escolheuClassificacao` no lugar errado | low | duas docs seguidas acima de `limpouClassificacao` | patch |
| 43 | blind | Sugestão do painel não ligada aos seletores (`aria-describedby`) | low | só texto solto; correção direta | patch |
| 44 | verificação | Cancelar durante "classificando" sem teste | medium | tirar o teste de `geracao` depois do `Promise.all` não quebra nada | patch |
| 45 | verificação | Falha da 2ª requisição de `atualizar` sem teste | medium | trocar `if (fila.ok) r = fila` por `r = fila` não quebra nada | patch |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- tudo verde (integração só no CI)
