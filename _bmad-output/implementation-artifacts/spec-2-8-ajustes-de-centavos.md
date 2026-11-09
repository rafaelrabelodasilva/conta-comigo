---
title: 'História 2.8: Ajustes de centavos'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
baseline_commit: '952380a34a57fd224086403a96a48b3db034d105'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Os créditos de centavos da Fatura (ex.: "MSC CRUZEIROS - R$ 0,08" junto de "MSC CRUZEIROS 02/12 R$ 1.140,74") aparecem como estornos soltos (FR-47, AD-8). E o painel recusa Valor zero, mas a Fatura traz a anuidade com R$ 0,00: a de outubro/26 ficou em R$ 1,00 em produção e não volta.

**Approach:** Migração com `ajuste_de_id` em `lancamentos`. O núcleo ganha `reconhecerAjustes(lancamentos, limite)`, usado pela importação. A grade mostra o Ajuste recuado sob a parcela, com o líquido. Tipo e Responsável da parcela valem também para o Ajuste, na mesma gravação. O painel do Ajuste tem "Desvincular" com "Desfazer". O painel passa a aceitar Valor zero ao editar.

## Boundaries & Constraints

**Always:**

**Reconhecer (núcleo, `src/domain/ajustes.ts`)**
- É Ajuste o crédito (`valor < 0`) sem Parcela, na mesma Fatura, com o mesmo `nome_normalizado` de uma parcela (`parcela_n` não nulo) e `|valor| < limite`, menor estrito (FR-47). O limite vem de `configuracoes.limite_ajuste_centavos`; sem a linha, `LIMITE_AJUSTE_PADRAO_CENTAVOS`.
- Com mais de uma parcela candidata, fica a do mesmo `final_cartao`. Se ainda houver empate, a de menor `ordem_fatura`. Uma parcela pode ter mais de um Ajuste. Um Ajuste nunca é mãe.
- Na importação, `prepararImportacao` marca no Ajuste a ordem da mãe. A RPC `importar_fatura` grava `ajuste_de_id` na mesma transação. Na importação ninguém tem Tipo nem Responsável, então os dois ficam vazios.

**Grade**
- O Ajuste fica logo abaixo da mãe, em qualquer ordenação. Recuo de 16 px e "↳" antes do Nome. Embaixo do Nome vem o líquido em `text-muted`, "R$ 1.140,74 - R$ 0,08 = R$ 1.140,66", que soma todos os Ajustes da mãe. A coluna Valor mostra "- R$ 0,08".
- Filtros, busca e "Verificar" julgam só a mãe. O Ajuste aparece se e só se a mãe aparece.
- As contagens do popover e o anúncio `role="status"` contam só as mães. O rodapé "Total dos lançamentos" soma as linhas visíveis, Ajustes incluídos, então fecha no líquido.
- Seleção: o Ajuste não tem caixa própria. Fica com fundo `selection` quando a mãe está selecionada. "Selecionar todos" conta só as mães.
- Um Ajuste cuja mãe não está no Mês aparece como linha comum.

**Classificação acompanha a mãe**
- Mudar Tipo ou Responsável da mãe grava, na mesma requisição (`update … in (ids)`), a mãe e os Ajustes dela, com otimismo.
- No painel do Ajuste, Tipo e Responsável aparecem só para leitura: "Segue a parcela NOME". Valor, data, Apelido, Status e Observação continuam editáveis.

**Desvincular e excluir**
- O painel do Ajuste tem "Desvincular" no rodapé, ao lado de "Excluir". Ele grava `ajuste_de_id = null` e mantém o Tipo e o Responsável. Mostra o toast "Desvinculado · Desfazer", que religa o Ajuste e copia o Tipo e o Responsável atuais da mãe numa gravação só.
- Excluir a mãe exclui também os Ajustes dela, numa gravação só. A confirmação diz isso. "Desfazer" restaura todos.
- Excluir o próprio Ajuste exclui só ele.
- O painel da mãe mostra a linha "Ajuste - R$ 0,08 · líquido R$ 1.140,66".

**Conferência e hero**
- Não mudam: o Ajuste continua como crédito, no cartão e nos totais.

**VoiceOver**
- A linha do Ajuste é lida como "Ajuste de NOME, - R$ 0,08, líquido R$ 1.140,66, Responsável, Status".
- A pendência da linha no VoiceOver continua aberta.

**Ajustes já gravados** (decisão do Rafael, 09/11/2026, opção A)
- A migração vincula, uma vez, os créditos que já existem, com a mesma regra do núcleo escrita em SQL: o limite de `configuracoes`, o mesmo cartão primeiro, depois a menor `ordem_fatura`.
- O Ajuste recebe o Tipo e o Responsável da mãe.
- Um teste de integração confere que o SQL e `reconhecerAjustes` dão os mesmos pares.
- Em produção, isso vincula os 4 de nov/26: MSC CRUZEIROS, AMAZONMKTPLC*KABUMSA, 00354 SH NACOES CRICI e GISLANE MEZARI. Desfaz-se com "Desvincular".

**Valor zero (correção)** (decisão do Rafael, 09/11/2026: zero sempre)
- Editar o Valor de um Lançamento existente aceita R$ 0,00.
- O "＋ Lançamento" também aceita R$ 0,00, com ou sem "Corrige a leitura da fatura". O código `lancamento.valor_zero` sai.
- Zero conta como despesa de R$ 0,00 na Conferência, como já é hoje.

**Regras e testes**
- Regras no núcleo (AD-1), textos em `mensagens.ts`, só tokens. Testes do núcleo, jsdom e integração (CI).
- O teste do núcleo usa "MSC CRUZEIROS 02/12 R$ 1.140,74" + "MSC CRUZEIROS - R$ 0,08".

**Never:**
- Apagar ou reimportar dados.
- Reconhecer de novo um crédito desvinculado. O marcador de "desvinculado" fica para a reimportação do Épico 3.
- Mensagem de cobrança, Seleção em lote, Pagamento, previstos e casamento (Épicos 3 e 4).
- Mudar o hero, a faixa, a bolinha, a barra de filtros ou o painel, fora do que está acima.

## I/O & Edge-Case Matrix

| Cenário | Entrada / estado | Resultado | Erros |
|----------|--------------|---------------------------|----------------|
| Reconhecer | MSC 02/12 114074 + MSC -8, limite 100 | Ajuste de MSC 02/12 | -100 ou -150: não é Ajuste |
| Duas mães | MSC 02/12 cartão 5061 e MSC 01/03 cartão 9277; crédito no 9277 | mãe = a do 9277 | N/A |
| Sem parcela | "PADARIA" à vista + "PADARIA" -5 | não é Ajuste | N/A |
| Tipo da mãe | Tipo "Viagem" na MSC 02/12 | mãe e Ajuste com "Viagem" numa requisição | falha: os dois voltam |
| Desvincular | Ajuste MSC → "Desvincular" → "Desfazer" | linha comum; depois religada, com a classificação da mãe | falha: toast `salvar.falhou`, nada muda |
| Excluir mãe | excluir MSC 02/12 | some com o Ajuste; Conferência acusa R$ 1.140,74 e R$ 0,08 | "Desfazer" volta os dois |
| Valor zero | anuidade de R$ 1,00 para "0,00" | grava 0; Conferência de out/26 bate | "abc": erro no campo |

</frozen-after-approval>

## Code Map

**Núcleo**
- `src/domain/ajustes.ts` (novo):
  - `reconhecerAjustes(linhas, limite)` → pares `{ajuste, mae}` por índice;
  - `agruparComAjustes(maes, ajustesPorMae)` para a ordem da grade;
  - `textoLiquido`;
  - `idsQueAcompanham(id, linhas)`.
- `src/domain/importacao-fatura.ts:124` -- `prepararImportacao(extracao, limite)`. Acrescenta `ajuste_de_ordem: number | null` em `LancamentoParaGravar`. Chamado em `src/features/importar/ImportarFatura.tsx:125`, que precisa ler `configuracoes` (via `useLinhas`/`gerenciador`).
- `src/domain/lancamento.ts:67` -- `lerValor`.
  - Ganha a opção `{ aceitaZero }`.
  - `mudancaDoCampo` aceita zero; `novoLancamento` também aceita zero; tirar `lancamento.valor_zero` de `mensagens.ts`.
  - `LIMITE_AJUSTE_PADRAO_CENTAVOS` está em `configuracoes.ts`.
- `src/domain/filtros-grade.ts:120` -- `aplicarFiltros` e `valoresDaColuna`: recebem só as mães. Quem chama separa as mães dos Ajustes.
- `src/domain/painel.ts:206` -- `rotuloLinhaAcessivel` ganha a variante do Ajuste. `ordenarGrade` ordena só as mães.
- `src/domain/conferencia.ts` -- não muda.

**Dados**
- `supabase/migrations/2026110912xxxx_ajustes.sql`:
  - `unique (owner_id, id)` em `lancamentos`;
  - `ajuste_de_id uuid` com a FK composta para `lancamentos (owner_id, id)`, `check (ajuste_de_id <> id)` e índice `(owner_id, ajuste_de_id)`;
  - `create or replace importar_fatura`, mesma assinatura: depois do insert, `update … set ajuste_de_id` pela `ordem_fatura` da mãe na mesma Fatura;
  - o backfill dos Ajustes já gravados (decisão A).
  - Evitar `between` dentro de `or` (impressão digital do backup).
- `src/data/database.types.ts` -- `ajuste_de_id` à mão, igual a `supabase gen types` (o CI compara com o schema local).
- `src/data/lancamentos-repo.ts:44`:
  - `atualizar(id, mudanca, { junto: ids })`: um `update().in("id", ids)` com otimismo nas linhas todas (`gravarComOtimismo` aceita várias);
  - `excluir`/`restaurar` com os ids juntos;
  - `desvincular(id)` / `religar(id, mae)`.
- `src/data/faturas-repo.ts:146` -- `importar` manda `ajuste_de_ordem` no jsonb.
- `test/integracao/lancamentos.test.ts`, `faturas.test.ts` -- RPC com Ajuste, `in(ids)` sob RLS, FK e check.

**Interface**
- `src/features/painel/Painel.tsx:300` -- `doMes` → mães e Ajustes; filtros e contagens só nas mães; a grade recebe os grupos; seleção e `excluir` (l. 244) com os ids juntos.
- `src/features/painel/GradeLancamentos.tsx:372` -- linha do Ajuste: recuo, ↳, líquido, sem caixa, fundo pela mãe, rodapé com as linhas visíveis.
- `src/features/painel/PainelLancamento.tsx:304`:
  - no Ajuste, Tipo e Responsável só para leitura e "Desvincular";
  - na mãe, a linha do Ajuste;
  - a gravação de Tipo/Responsável manda os ids juntos.
- UX: DESIGN.md:441, EXPERIENCE.md:74.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/ajustes.ts` + teste: a matriz, o caso MSC e as variantes do limite.
- [x] `src/domain/importacao-fatura.ts`, `lancamento.ts`, `painel.ts`, `mensagens.ts` + testes: `ajuste_de_ordem`, zero, o rótulo do Ajuste e os textos.
- [x] `supabase/migrations/…_ajustes.sql`, `database.types.ts`, `test/integracao/*`: a coluna, a RPC e o backfill (pares iguais aos do núcleo).
- [x] `src/data/lancamentos-repo.ts`, `faturas-repo.ts` + testes: ids juntos, desvincular/religar.
- [x] `ImportarFatura.tsx`, `Painel.tsx`, `GradeLancamentos.tsx`, `PainelLancamento.tsx` + jsdom: grade, filtros, seleção, painel do Ajuste, exclusão em grupo.

**Acceptance Criteria:**
- Given o deploy sem edição, when Rafael abre out/26, then hero, faixa, filtros e grade ficam como na 2.7.
- Given o MSC vinculado, when Rafael filtra por um Tipo que só o Ajuste teria, then nenhuma linha do MSC aparece.

## Implementation Notes

- `separarAjustes` (núcleo) separa mães e Ajustes para a tela; um Ajuste sem a mãe no Mês fica como linha comum.
- `lerValor` aceita zero sem opção (a decisão é "zero sempre"; o código `lancamento.valor_zero` saiu), em vez do `{ aceitaZero }` do Code Map.
- O vínculo dos já gravados é a função `vincular_ajustes_gravados(dono)`, só para `service_role`, chamada uma vez no fim da migração; fica no schema para o teste de integração comparar SQL × núcleo.
- A FK do Ajuste usa `on delete set null (ajuste_de_id)` (Postgres 15+): a mãe apagada por uma reimportação futura deixa o Ajuste como linha comum.
- `atualizar`/`excluir` do repositório passaram a receber `{ agora, junto }`; com uma linha só, o pedido continua `eq().single()`.
- Ajuste aberto no painel com a mãe fora do filtro: a mãe fica na grade com o Ajuste embaixo (mesma regra da opção A).
- A bolinha "verificar" segue calculada por linha: um Ajuste num cartão com diferença também leva a bolinha.
- `test/backup/dados-exemplo.sql`: a linha de exemplo MSC -8 passou a apontar para a mãe.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind | O vínculo dos já gravados troca o Tipo/Responsável do crédito pelos da mãe (pode apagar) | low | é o que a intenção pede ("recebe o Tipo e o Responsável da mãe"); em produção nenhum dos 8 tem classificação | rejeitado |
| 2 | blind | `vincular_ajustes_gravados` fica no schema e religaria desvinculados se rodada de novo | low | só `service_role` executa; nada no app nem no cron a chama; tirar quebra o teste SQL × núcleo | rejeitado |
| 3 | blind | Desempate do SQL (`m.id`) difere do núcleo (primeira da lista) | false | empate exige mesmo cartão e mesma `ordem_fatura`; ela é única por Fatura (índice parcial) e a linha manual não tem Parcela | rejeitado |
| 4 | blind, edge | A RPC e o banco não validam `ajuste_de_ordem` / a mãe (cadeia, mãe sem Parcela) | low | o núcleo nunca gera; o cliente é do próprio dono sob RLS; exige guarda nova | rejeitado |
| 5 | blind, edge | `in(ids)` aceita resposta parcial e deixa o otimismo das linhas que faltaram | low | só confere `ids[0]`; correção direta: comparar a quantidade | patch |
| 6 | blind, edge | Importar antes de `configuracoes` carregar usa o limite padrão | low | o gerenciador único já está carregado pelo Painel; a leitura do PDF e do Gemini leva segundos antes de `prepararImportacao` | rejeitado |
| 7 | blind, edge | Ajuste editado para zero, positivo ou acima do limite continua Ajuste | low | raro (centavos); exige regra nova | rejeitado |
| 8 | blind | O ⋯ da linha do Ajuste tem o mesmo nome acessível do ⋯ da mãe | low | `rotuloAcoesDe(nome)` com o Nome igual; correção direta | patch |
| 9 | blind | O teste de integração do vínculo depende das linhas de fevereiro do teste anterior | low | `toHaveLength(4)` conta o par de 2026-02; correção direta: filtrar pelos Meses do teste | patch |
| 10 | blind, verif | Abrir o Ajuste com a mãe fora do filtro (mãe fixa, sem linha duplicada) sem teste | medium | voltar `linhaFixa` para `abertaNoMes` passa em todos os testes | patch |
| 11 | blind | FK `on delete set null` e a bolinha no Ajuste sem teste | low | apagamento físico só na reimportação (Épico 3); bolinha é derivada como antes | rejeitado |
| 12 | blind, edge | Tipo da mãe igual e Ajuste diferente: nada é gravado e o Ajuste fica dessincronizado | false | o Ajuste não diverge: importação (vazio), vínculo e religar copiam a mãe, e o painel do Ajuste não edita Tipo/Responsável | rejeitado |
| 13 | blind | sprint-status `in-progress` × spec `in-review` | false | o passo de apresentação leva o sprint-status a `review` | rejeitado |
| 14 | blind | DESIGN.md/EXPERIENCE.md não mudaram | false | a UX já descreve o Ajuste (DESIGN.md:441, EXPERIENCE.md:74); a spec não pede mudança | rejeitado |
| 15 | edge | Com "Verificar" e só os créditos diferentes, o Ajuste marcado fica escondido (a mãe não passa) | low | segue a regra da intenção ("Verificar" julga a mãe); só com diferença só nos créditos; fora do filtro o Ajuste aparece | rejeitado |
| 16 | edge | "Desfazer" do "Desvincular" depois de trocar de Mês sempre falha | low | `religar` exige a linha na memória; `restaurar` já tem o caminho sem memória; correção direta igual | patch |
| 17 | edge | Cadeia ou ciclo de Ajustes some da grade | false | nenhum caminho do app cria (Ajuste não tem Parcela, não vira mãe) | rejeitado |
| 18 | edge | Ajuste com `mes` diferente da mãe não sai junto | false | mesma Fatura ⇒ mesmo `mes`, que nunca muda (AD-9) | rejeitado |
| 19 | verif | `restaurar` fora da memória com `junto` (`gravarSemMemoria` com `in`) sem teste | medium | só há teste com um id | patch |
| 20 | verif | O limite de `configuracoes` no vínculo SQL nunca é exercitado | medium | o teste usa só o padrão 100; trocar por literal passa | patch |
| 21 | verif | Falha do "Desfazer" do "Desvincular" (religar falha ou mãe excluída) sem teste | low | caminho secundário; a falha do Desvincular (matriz) tem teste | defer |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde; integração no CI.
- `npm run build` -- expected: sem erro.
