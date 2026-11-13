---
title: 'História 3.10: Importar o histórico da planilha'
type: 'feature'
created: '2026-11-13'
baseline_commit: '5c715b7b281d28667175a65a31d4b424596f3db1'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O app começa vazio: sem Regras, sem Séries e sem os Meses de 2026 que Rafael já classificou na planilha "Cartão". Cada Nome novo cai no Revisar, e a meta de classificar 55% sem revisão não vale no primeiro Mês (FR-2).

**Approach:** Configurações → Importar planilha lê o `.xlsx` no navegador (sem Google), mostra as abas (01/2026 a 10/2026 marcadas), o núcleo (`domain/importacao-planilha`) valida cada linha com zod e planeja tudo, e uma RPC grava cada aba numa transação com `lancado_por = 'historico'`. Cria os cadastros que faltam, as Regras iniciais, as Séries, as parcelas em andamento e os previstos; o resumo leva a Regras aprendidas filtrada por "criadas agora". O passo entra no Primeiro uso.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** mapeamento de colunas, schema zod da linha, escolha de Séries, Regras iniciais, Divisão e previstos saem de função pura em `src/domain/importacao-planilha*` (só imports relativos, sem float, sem relógio). Só a leitura do arquivo (biblioteca de `.xlsx`, carregada sob demanda) fica fora do núcleo, em `src/features`. RPC e repositório só gravam o que o núcleo calculou.
- **Chaves (AD-6):** previstos, Séries e "mesmo Nome" usam `normalizarNome`; só `regras` usa `chaveDeRegra`; só `regrasRepo` grava em `regras`. Apelido nunca casa nada.
- **Gravação:** uma RPC por aba, em transação (AD-3); aba com erro mostra "Não foi possível ler a aba 03/2026" e as outras seguem; progresso por aba. Dinheiro em centavos inteiros (AD-2), Mês `AAAA-MM` (AD-9).
- **Manter** tudo da 2.3 à 3.9 e da 3.11: hero e troca de Mês, ordenação, Conferência e "verificar" (só linhas da Fatura), filter-bar, painel do Lançamento e Ajustes, Regras e Regras aprendidas, reimportação e a trava `fatura.reimportacao_com_casados`, Revisar e lote, Séries e previstos com selo e origem, casamento, herança, Divisão, Apelido em massa.
- Mudança de schema só por migração em `supabase/migrations`; tipos em `database.types.ts` escritos no formato do gerado; textos em `mensagens.ts`; log só por `src/server/log.ts`.
- **Decisões do Rafael (13/11/2026, perguntas 2 a 8 aceitas como recomendadas):**
  - **Biblioteca:** `read-excel-file` 9.3.15, versão exata, carregada por `import()` dentro da tela; no navegador só `arquivo → matriz de células`, o resto é do núcleo. Medir o bloco no build.
  - **Mês e Fatura:** `mes` = nome da aba; `fatura_id`, `ordem_fatura` e `final_cartao` nulos; `data` só se a planilha tiver. Conferência, "Total a pagar" e "verificar" seguem só com linhas da Fatura. Mês sem Fatura e com `historico`: o hero mostra o total e a barra por Responsável, sem selo de Conferência.
  - **Regras iniciais:** uma por `chaveDeRegra`; Responsável e Tipo mais frequentes (empate: o da linha mais recente); Divisão da linha dividida; gravadas ao final por `regrasRepo` com as linhas das abas que deram certo. "Criadas agora" sem schema: `?criadas_desde=<início da importação>` filtra `regras.created_at`.
  - **Séries e previstos:** `atribuirSeries`/`ehParcelaDeSerie` por aba, Série comum entre abas e Faturas; previstos só depois da última parcela vista da Série e só em Mês sem Fatura (na transação da aba da última parcela). Aba de Mês que já tem Fatura: não grava linhas, só aprende Regras. Aba de Mês com `historico`: apaga e regrava só as `historico` do Mês.
  - **Idempotência e cadastros:** chave da aba `(dono, mes, 'historico')`; cadastros casados por nome sem acento e sem maiúsculas, arquivado com o mesmo nome é reativado; faltou cor de Responsável (limite 8): para antes de gravar, com aviso; cadastros criados uma vez, antes das abas.
  - **Apelido para a próxima Fatura:** continua fora (`deferred-work.md`).
  - **Desfazer:** prévia sem gravar (por aba: lançamentos, Séries, previstos novos, Regras) antes de "Importar"; "Apagar histórico importado" por Mês (só `historico`, Séries sem linha); Regras criadas agora se apagam em Regras aprendidas. Fora: reverter cadastros e a 3.12.
- **Formato lido da planilha em 13/11/2026 (Rafael, Google Sheets, só leitura):**
  - Colunas A a H (`Despesa | Valor | Parcela | Observação | Tipo | Resposabilidade | Lançado por | Status dívida`); J em diante são tabelas de apoio e se ignoram. Cabeçalho na linha 1, lido sem acento, maiúsculas nem espaços sobrando, aceitando "Resposabilidade" e "Responsabilidade". A tabela vai até a última linha com Despesa; linha sem Despesa e sem Valor é ignorada. "Selecionar" vale vazio. "Lançado por" é ignorada (sempre `historico`).
  - Valor é texto brasileiro: "1.140,74"; crédito "(25,00)" vira negativo; "0,00" vale. Parcela: "09/12"; "1/1" é à vista (sem parcela); vazio é sem parcela.
  - Abas: só as de nome `MM/AAAA` (Mês `AAAA-MM`); 2025 e Mês depois de 10/2026 aparecem sem marca; "Página5" e "Cópia de TBC 00/2026" não aparecem. "Status dívida": "Pago" (conta como pago) e "Pendente" (não) são criados se faltarem.
  - **Divisão (Monjaro):** linhas seguidas com mesmo Nome, Parcela e Observação e Responsáveis diferentes viram uma mãe (soma dos Valores) com Divisão em frações dos valores e filhas; o Tipo da mãe é o da parte maior. Créditos repetidos (sem Responsável) não são Divisão.
  - **Nome digitado à mão** (alguma letra minúscula: todo o 01/2026, Silvia, William, TVbox, Bombinhas): importa com Tipo e Responsável, sem Regra, Série nem previsto.
  - **Nomes (a planilha perdeu o `*` da fatura: "SHOPEE CELLSOLUTIONS" ≠ "SHOPEE *CELLSOLUTIONS"):** `nome` = texto da planilha (aparado, espaços colapsados), `nome_normalizado` = `normalizarNome`. A Regra da planilha usa chave própria (maiúsculas, sem acento, `*` vira espaço, espaços colapsados, sem tirar prefixo nem dígitos); `classificarImportacao` procura primeiro a `chaveDeRegra` e, se não achar, essa chave com o Nome da fatura. Regras do app não mudam.
  - **Previsto da planilha** só nasce se o app ainda não tem linha do mesmo Nome (sem `*` e sem espaços), Parcela e Mês, para não duplicar os previstos que a Fatura de out/26 já criou.
  - **Aba de Mês com Fatura (out/26, nov/26):** só aprende Regras, sem gravar linhas (a aba 10/2026 é a que mais se parece com a fatura).

**Never:** integração com a conta Google; ler o arquivo no servidor; `console.*`; `supabase.from()` em tela; regra de negócio em SQL; Apelido para a próxima Fatura e reimportar mantendo a classificação (3.12) salvo decisão registrada abaixo; alterar ou apagar dado de produção sem Rafael confirmar.

</frozen-after-approval>

## Code Map

- `src/domain/importacao-planilha.ts` (novo, + teste) -- cabeçalhos, schema zod da linha, Valor/Parcela, abas por Mês, Divisão (Monjaro), Nome à mão, Regras iniciais (chave da planilha), Séries, previstos sem duplicar, prévia, resumo.
- `src/domain/classificacao.ts` -- `classificarImportacao`/`chavesDeRegrasUsadas`: procurar a chave da planilha quando a `chaveDeRegra` não achar (só acréscimo).
- `src/domain/previstos.ts` -- `atribuirSeries`, `ehParcelaDeSerie`, `gerarPrevistos`: reusar sem mudar. `src/domain/regras.ts` -- `chaveDeRegra`, `aprenderEmLote`; `src/domain/divisao.ts` -- `dividirEmPartes`, `partesDaImportacao`; `src/domain/heranca.ts` -- `CAMPOS_HERDADOS`.
- `src/features/configuracoes/secoes.ts`, `SecaoImportarPlanilha.tsx` (novo), `SecaoRegras.tsx` (filtro "criadas agora", coluna Divisão); `src/domain/primeiro-uso.ts` (+ passo) e `src/app/primeiro-uso/page.tsx`.
- `src/data/lancamentos-repo.ts` / novo repo da planilha -- chama a RPC por aba; `src/data/realtime.ts` recebe as linhas devolvidas; `src/data/regras-repo.ts` -- Regras iniciais.
- `supabase/migrations/2026111xxxxxxx_importar_aba_planilha.sql` -- RPC `importar_aba_planilha`; `database.types.ts` (à mão); `test/integracao/planilha.test.ts` (CI) e pglite em scratchpad novo.
- `src/domain/painel.ts`, `conferencia.ts`, `revisar.ts` -- conferir que `historico` sem Fatura não quebra (sem mudar lógica).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/importacao-planilha.ts` (+ teste) -- mapeamento, zod, Divisão, Regras, Séries, previstos, prévia
- [x] `src/domain/regras.ts`, `classificacao.ts` (+ testes) -- chave da planilha como segunda tentativa; filtro "criadas agora"
- [x] `supabase/migrations/20261119120000_importar_planilha.sql` + `database.types.ts` -- RPCs `importar_aba_planilha` e `apagar_historico_do_mes`
- [x] `src/data/planilha-repo.ts`, `regras-repo.ts` (+ testes) -- ler estado, gravar aba, apagar, Regras iniciais
- [x] `src/features/configuracoes/*` (leitor de `.xlsx`, orquestrador, cadastros, `SecaoImportarPlanilha`, `SecaoRegras`) e Primeiro uso (+ testes)
- [x] `Painel.tsx`, `FaturaDoMes.tsx`, `painel.ts` -- seletor com Meses de histórico, hero do Mês só com histórico, ordem da aba
- [x] `test/integracao/planilha.test.ts` (CI) e pglite -- aceite

**Acceptance Criteria:**
- Given um `.xlsx`, when Rafael o envia, then o app lista as abas com 01/2026 a 10/2026 marcadas, sem usar a conta Google.
- Given abas escolhidas, when importa, then cada aba grava numa transação com `lancado_por = 'historico'`, cria cadastros, Regras, Séries e previstos, e uma aba com erro mostra "Não foi possível ler a aba 03/2026" sem parar as outras.
- Given a importação concluída, when o resumo aparece, then mostra "N lançamentos, N Responsáveis, N Tipos, N Regras criadas" e leva a Regras aprendidas filtrada por "criadas agora".

## Implementation Notes

- Implementado direto da spec (sem subagente: o Rafael não pediu). O formato foi lido da planilha real pelo conector do Google Sheets (só leitura) e o Nome das Faturas de out/26 e nov/26 foi lido no banco (só a coluna Nome) para achar a diferença do `*`.
- **Núcleo (`importacao-planilha.ts`):** `abasDaPlanilha`, `lerAba` (zod por linha; uma linha inválida derruba a aba), `unidadesDaAba` (Divisão: mesmo Nome, Parcela e Observação **preenchida**, Responsáveis diferentes), `planejarCadastros`/`cadastrosComOsNovos`/`resolverCadastros`, `planejarAbas` (Séries por `atribuirSeries`, previstos por `gerarPrevistos`, sem repetir parcela do app comparando Nome sem `*` e espaços, e sem contar o que a RPC vai trocar: `seraTrocadaPelaAba`), `regrasIniciais`, `resumirImportacao`. A Divisão que não fecha vira linhas soltas.
- **Regras:** chave da planilha (`chaveDaPlanilha`, `*` vira espaço, nada mais é tirado) e `regraDoNome` (primeiro `chaveDeRegra`, depois a da planilha) usada pela importação da Fatura, por `regrasUsadas` e pela reaplicação. `regrasRepo.criarIniciais` grava por upsert que ignora a chave já existente. "Criadas agora": `?criadas_desde=` com o `created_at` mais antigo devolvido pelo banco (relógio do banco, não o do iPad).
- **RPC `importar_aba_planilha`:** uma aba por transação; recusa Mês com Fatura; troca o histórico do Mês e os previstos `sistema` intocados que ele gerou ou que caem no próprio Mês; Séries por chave; filhas pela `recriar_filhas`; previsto só onde a Série não tem a parcela e o Mês não tem Fatura. `created_at = clock_timestamp()` guarda a ordem da aba (o histórico não tem `ordem_fatura`, como decidido): a grade desempata por `created_at`.
- **Telas:** Configurações → Importar planilha (arquivo, abas, prévia sem gravar, progresso por aba, resumo, "Apagar histórico importado"); passo "Importar planilha" no Primeiro uso (agora 5 passos); Regras aprendidas com a faixa "Mostrando as N Regras criadas agora pela planilha"; seletor de Mês inclui os Meses com histórico; hero de Mês sem Fatura e com histórico mostra "Histórico de <mês>", o total e a barra por Responsável, sem selo.
- **Biblioteca:** `read-excel-file` 9.3.15 (entrada `universal`, sem Web Worker), carregada por `import()` só ao escolher o arquivo: bloco de ≈ 62 KB (≈ 20 KB gzip). `fflate` 0.8.3 entra como devDependency para o teste montar um `.xlsx` de verdade.
- **Provado:** Vitest (1.990 testes, com os novos), `tsc`, `eslint`, `next build`; no pglite, com todas as migrações em ordem, `e2e310.mts` (o planejador real em TypeScript contra as RPCs: ~45 verificações, incluindo Monjaro 310,67 + 155,33 = 466,00, reimportação sem duplicar, Mês com Fatura recusado, previsto editado preservado, apagar histórico) e `cenarios37/38/39.mjs` sem regressão. `test/integracao/planilha.test.ts` só roda no CI.

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| Reimportar um Mês apagava previstos que o planejamento tinha dado por existentes (ficavam 1 de 6) | high (corrigido) | Achado no pglite: o plano lia o app antes de a RPC apagar os previstos `sistema` intocados do Mês; `seraTrocadaPelaAba` espelha a regra do SQL e o teste do pglite confere 6 = 6 |
| Sem `ordem_fatura`, a grade do histórico embaralha depois de editar uma linha (a ordem do banco muda) | medium (corrigido) | A decisão manteve `ordem_fatura` nulo; `created_at = clock_timestamp()` na RPC e desempate por `created_at` em `ordenarLancamentos` guardam a ordem da aba sem tocar na decisão |
| Importar uma Fatura para um Mês que já tem histórico duplica o Mês | low | Os Meses 01 a 09/2026 não têm Fatura e Rafael não os importa; registrado em `deferred-work.md` |
| Prévia contava Regras que já existem | low (corrigido) | A prévia lê `regras` e só conta as chaves novas |
| Regra de Divisão exige Observação preenchida (mais estreita que o dito no chat) | low | Só evita juntar compras iguais de Responsáveis diferentes; a mais, duas linhas ficam soltas e a soma não muda |
| Observação com mais de 500 caracteres derruba a aba | false | É o limite do app (`LIMITE_OBSERVACAO`); a mensagem diz a linha |
| `ler-xlsx` usa `read-excel-file/universal`, sem Worker | false | O `browser` abre Web Worker (risco de CSP/Safari); o universal roda na página e leu o `.xlsx` montado no teste |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde
- pglite (scratchpad novo) -- todas as migrações em ordem + cenários da planilha -- expected: sem falhas
