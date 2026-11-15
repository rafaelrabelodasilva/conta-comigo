---
title: 'História 5.1: Cadastrar uma Conta manual'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: 'ba01d33'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** as contas fora do cartão (a Bombinhas, a Silvia, o TVbox) hoje só existem na planilha e Rafael as digita todo mês. Sem elas, o Painel, os Blocos e a Previsão ficam incompletos (FR-16, FR-17).

**Approach:** Contas → "＋ Nova conta" abre o formulário do UX-DR24 (Nome, Valor, Repetição, Parcelas, "Começa em", Tipo, Observação e Divisão com "＋ Parte"). O núcleo valida o formulário e calcula as parcelas (`parcelasDaConta`, horizonte Mês atual + 12); a RPC `salvar_conta_manual` grava a Conta, a Série e as parcelas numa transação, só com o que o núcleo montou. Os Lançamentos nascem `manual`, já classificados, e são "previstos" enquanto o Mês não tem Fatura.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `src/domain/contas-manuais.ts` (imports relativos) tem a validação, `parcelasDaConta`, a chave da Série, a descrição da repetição e os pedidos às RPCs. A Divisão reaproveita `divisao.ts` (`avaliarRascunho`, `partesDaImportacao`, `dividirEmPartes`), sem copiar. A tela só digita, mostra e chama o repositório. Textos pelo mapa `mensagens.ts`.
- **Migração `20261124120000_contas_manuais.sql` (AD-14), escrita e NÃO aplicada:** tabela `contas_manuais` (RLS, `updated_at` pelo banco, `replica identity full`, Realtime); `series.conta_manual_id` (única) e `series.parcela_total` opcional; `lancamentos.conta_manual_id`; `lancamentos_parcela_par_check` relaxada; `referencias_cadastro()` com a Conta; RPCs `materializar_contas_manuais` e `salvar_conta_manual`. `database.types.ts` no formato do gerado (`NonNullable<Json>` só em jsonb `not null`; aqui `divisao` é nulável, então `Json | null`).
- **Sem internet, só consulta (AD-3):** o formulário abre, mas "Salvar" fica desativado e nada é tentado.
- Manter tudo da 1.x à 4.7: o Painel, a Conferência, os Blocos e a mensagem só mudam onde o "previsto" passa a valer para a Conta.

**Never:** lista, filtros e ⋯ (5.2); cron e `vercel.json` (5.3); alterar, encerrar e excluir (5.4); Dívida programada (Épico 6: a parte "Mensal ou Dívida programada" do mockup fica de fora); Pagamentos; aplicar a migração ou ler/alterar produção; `console.*`; `supabase.from()` em tela (as leituras da Série ficam no repositório).

## Decisões (registradas, nada implícito)

1. **O que a RPC de salvar recebe, e núcleo e SQL iguais.** `salvar_conta_manual(p_conta, p_parcelas, p_ate_mes)`: `p_conta` = a Conta (`id`, Nome, `nome_normalizado`, Valor, Tipo, Responsável ou `divisao` em frações, Observação, Mês inicial, repetição, `parcela_total`) mais a chave da Série (`serie`); `p_parcelas` = `[{ conta_id, parcela_n, mes, valor_centavos, partes }]`, com `partes` (os valores das filhas, AD-2) quando há Divisão. Tudo isso sai de `pedidoSalvarConta`. O SQL **não calcula nenhuma regra**: não sabe contar Meses, parar em `parcela_total` nem arredondar. Só copia da Conta o que é dela (Nome, Tipo, Responsável, Observação, Divisão, `parcela_total`), grava as parcelas e as filhas (`recriar_filhas`, a mesma da 3.8) e confere o que é segurança (sessão, dono, formato, nenhuma parcela depois de `p_ate_mes`). **Desvio do texto do épico:** `materializar_contas_manuais(ate_mes)` ganha o 2º argumento `p_parcelas`, porque com só `ate_mes` o SQL teria de reimplementar `parcelasDaConta` (proibido pelo AD-1). A 5.3 lê as Contas, chama `pedidoMaterializar` (já pronto e testado aqui) e passa o pedido. `salvar_conta_manual` chama o mesmo materializador (AD-15: um só).
2. **`on conflict`.** O índice único `(serie_id, parcela_n)` é parcial (`dividido_de_id is null and excluido_em is null`, 3.5), então o `on conflict` repete o predicado: `on conflict (serie_id, parcela_n) where dividido_de_id is null and excluido_em is null do nothing`. A forma sem predicado do épico não acharia o índice.
3. **Idempotência.** O `id` da Conta nasce com o formulário (`crypto.randomUUID`), não no banco. Mandar de novo o mesmo `id` (duplo toque, resposta perdida, tentar de novo) acha a Conta e a Série e só materializa o que faltar. **Não altera a Conta já salva**: alterar é a 5.4 (o épico diz "cria ou atualiza o cadastro"; a atualização fica para a 5.4 porque mudar o Valor sem recriar as linhas deixaria Conta e Lançamentos discordando). A tela também desativa "Salvar" enquanto grava.
4. **Série da Conta (AD-8).** Cada Conta tem **uma** Série, ligada por `series.conta_manual_id` (índice único). A chave do AD-8 também é preenchida: `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos = Valor, mes_primeira_parcela = Mês inicial, ocorrencia)`. Na recorrente `parcela_total` é nulo (nulo é distinto na chave única, então o índice parcial `series_conta_chave_key` usa `coalesce(parcela_total, 0)`). **Duas Contas idênticas:** o repositório lê as `ocorrencia` da mesma chave (de qualquer Série) e o núcleo escolhe a menor livre (`proximaOcorrencia`): a primeira é 1, a segunda 2. Se outra Conta igual for salva entre a leitura e a gravação, a chave única estoura e a RPC devolve `conta.serie_ocupada`; o repositório relê e tenta mais uma vez. Reenviar a mesma Conta reaproveita a `ocorrencia` da Série dela. A chave não é a identidade estável (editar Nome ou Valor a mudaria): a identidade é `conta_manual_id`; a 5.4 decide como atualizar a chave. **Limitação aceita:** uma Conta parcelada com o mesmo Nome, total, Valor e Mês de uma compra de cartão compartilha a Série dela; isso é uma coincidência que não se espera (a Conta é "fora do cartão") e está em `deferred-work.md`.
5. **Mês inicial no passado ou em Mês que já tem Fatura.** Os Lançamentos são `lancado_por = 'manual'`, nunca `sistema`, e o `mes` é sempre `somarMeses(mes_inicial, n − 1)` (AD-9), qualquer que seja o Mês. **Não entram na Conferência nem no "Total a pagar"**: os dois filtram por `fatura_id` (2.5 e 3.5) e a Conta não tem `fatura_id`. O que muda é o "previsto" (FR-17: "os Meses futuros mostram esses Lançamentos como previstos"; EXPERIENCE "Mês sem Fatura"): é **derivado, nunca gravado** (`ehPrevistoDeConta`/`ehPrevistoNoMes`, `previstos.ts`): a linha é previsto quando tem `conta_manual_id`, é `manual` e o Mês **não tem Fatura**. Mês com Fatura importada: linha comum (soma nos Blocos, entra na mensagem). Mês sem Fatura, passado ou futuro: previsto (selo "Previsto", Bloco com "inclui previstos", fora da mensagem salvo "Incluir previstos"). Quando a Fatura do Mês é importada, a linha deixa de ser previsto sozinha. `conta_manual_id` existe para isso: um Lançamento feito à mão no app também é `manual` e **nunca** é previsto, e uma linha que saiu da Fatura e virou `manual` (3.12) também não.
6. **Recorrente sem fim.** Linhas: de `mes_inicial` até o Mês atual + 12 (Silvia desde Jan/26, em Nov/26: 23 linhas, `parcela_n` 1 a 23; o Mês atual é a parcela 11). `parcela_n` conta desde o Mês inicial, `parcela_total` fica nulo e a grade não mostra "n/N" (`formatarParcela` já devolve vazio). Para isso `lancamentos_parcela_par_check` passa a exigir só "total → n" (antes exigia os dois juntos). **O que a 5.3 ainda faz:** todo dia, para cada Conta, `pedidoMaterializar(contas, Mês atual + 12)` e a RPC grava só as parcelas que faltam (o idempotente). Atenção da 5.3: as RPCs são `security invoker` e usam `auth.uid()`; o cron com a chave secreta não tem usuário, então a 5.3 precisa decidir como chamar em nome do dono (uma variante da RPC que receba o dono, ou o login do dono no servidor). Anotado em `deferred-work.md`.
7. **Valor negativo, R$ 0,00 e soma que não bate.** Valor ≤ 0: `conta.valor_zero` ("O valor precisa ser maior que R$ 0,00"); a Conta é sempre uma despesa (crédito não se repete). Valor ilegível: `conta.valor_invalido`; acima de R$ 900.000,00: `conta.valor_grande` (o limite da Divisão). A tabela repete: `valor_centavos > 0`. **Divisão:** uma parte é só o Responsável; duas a dez dividem o Valor por valores digitados (modo "valor"), e a soma tem que ser **igual** ao Valor (`divisao.soma_diferente`), sem parte zerada (`divisao.parte_zerada`) e com Responsável em toda parte. O rodapé mostra "Soma das partes: R$ 259,00 de R$ 318,00" e só ganha o ✓ quando fecha. A Divisão é guardada em **frações** (`valor / total`, reduzidas), então cada parcela repete os mesmos centavos; o arredondamento é o do AD-2 (R$ 100,00 em 33,33 + 33,33 + 33,34; uma fração 1/3 em R$ 100,00 dá 33,33 + 33,33 + 33,34).
8. **Tipo e Responsável arquivados.** O formulário só oferece os ativos; se um deles for arquivado com o formulário aberto, o núcleo recusa (`conta.tipo_arquivado`, `conta.responsavel_arquivado`; na Divisão, pelo mesmo código). Depois de salva, a Conta pode citar um cadastro que foi arquivado depois: **continua valendo** e as próximas parcelas saem com ele (AD-16: arquivado some das escolhas, não das somas). Excluir um Tipo ou Responsável que uma Conta usa **exige substituto** (`contaUso: true` em `contas_manuais.tipo_id`, `.responsavel_id` e `.divisao`, porque sem ele a Conta ficaria sem Tipo, que é obrigatório, ou sem quem a classifique); `substituir_cadastro` troca o id na Conta, na `divisao` dela e nos Lançamentos.
9. **Salvar sem internet.** Sem conexão (`useConexao`), "Salvar" fica desativado com "Sem conexão. Você pode consultar, mas não alterar." e o repositório devolve `conexao.gravar_sem_conexao` sem ler nem gravar nada (AD-3). Nada fica na fila.
10. **Realtime.** A RPC devolve as linhas novas (mães e filhas) e o repositório as aplica no gerenciador de Lançamentos, que só guarda as do Mês aberto; os outros Meses chegam quando são abertos. Em outro aparelho, o INSERT dos Lançamentos chega pelo gerenciador existente (`lancamentos` já está na publicação; a tabela `contas_manuais` entra na publicação com `replica identity full`, mas só a 5.2 vai lê-la). Prova no CI: `esperarEvento` em `test/integracao/contas-manuais.test.ts`.
11. **Acessibilidade e alvos de 44 pt.** Campos e seletores usam `min-h-toque` (44 pt); "＋ Parte" e "Salvar" são botões padrão (44 pt); "Remover parte" é compacto com `area-toque` (30 px desenhados, toque de 44 pt). Cada campo tem rótulo; nas linhas de Divisão o rótulo é só para o leitor de tela (`rotuloOculto`, "Responsável da parte 2", "Valor da parte 2", "Remover parte 2"). Erros em `text-danger-fg`, ligados ao campo por `aria-describedby`; "Salvar" com erro leva o foco ao primeiro campo inválido; soma e totais ficam numa região `aria-live="polite"`; a falha do banco usa `role="alert"`. O "Começa em" é `type="month"` (seletor nativo do iPad). Sem cor literal: só tokens.
12. **Onde cada coisa roda.** Núcleo, repositório e telas: `npm run lint`, `typecheck` e `test` (jsdom e fakes). A migração, a RPC, o RLS, o Realtime e o `database.types.ts` igual ao gerado: **só o job `supabase` do CI** (sem Docker nem CLI neste computador).

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Bombinhas | 6 parcelas, Jul/26, Viagem, 3 partes de R$ 106,00 (Mãe, Casal, Lucas), Mês atual Nov/26 | 6 mães (Jul/26 a Dez/26), `n/6`, R$ 318,00, `manual`, Viagem, `divisao`, sem Responsável, sem motivo de Revisar; 18 filhas de R$ 106,00; 1 Conta, 1 Série (`ocorrencia` 1) | N/A |
| Salvar de novo | mesmo `id`, mesmo pedido | nada novo (RPC devolve `[]`), 1 Conta, 1 Série, 6 mães, 18 filhas | N/A |
| Materializar de novo | `pedidoMaterializar` da mesma Conta | `[]`, nada duplica | N/A |
| Recorrente | Silvia R$ 400,00, mensal, Jan/26, Nov/26 | 23 linhas, `parcela_n` 1 a 23 (Nov/26 = 11), `parcela_total` nulo, Série sem total | N/A |
| Horizonte | 24 parcelas começando Nov/26 | 13 linhas (Nov/26 a Nov/27) | N/A |
| Começa além do horizonte | mensal em Mar/28 | Conta salva, 0 linhas, "nenhum lançamento novo" | N/A |
| Duas Contas idênticas | mesmo Nome, Valor, Mês, repetição | `ocorrencia` 1 e 2 | `conta.serie_ocupada` se outra foi salva no meio (retenta 1 vez) |
| R$ 100,00 em 3 partes | 33,33 + 33,33 + 33,34 | filhas 3.333 + 3.333 + 3.334 = 10.000 | 33,33 × 3: `divisao.soma_diferente` |
| Valor | vazio, texto, 0,00, negativo, > R$ 900.000,00 | Conta não é gravada | `conta.valor_invalido`, `conta.valor_zero`, `conta.valor_grande` |
| Parcelas | vazio, 1, 121, letra | idem | `conta.parcelas_invalidas` |
| "Começa em" | vazio, inválido, a mais de 5 anos | idem | `conta.mes_invalido`, `conta.mes_fora_do_limite` |
| Mês passado | Jan/26 com Mês atual Nov/26 | aceita, avisa "Os meses anteriores também recebem a conta" | N/A |
| Tipo / Responsável | vazio ou arquivado | idem | `conta.sem_tipo`, `conta.tipo_arquivado`, `conta.sem_responsavel`, `conta.responsavel_arquivado` |
| Nome / Observação | vazio ou > 100 / > 200 caracteres | idem | `conta.nome_vazio`, `conta.nome_longo`, `conta.observacao_longa` |
| Mês sem Fatura | Conta em Dez/26, sem Fatura | filhas são previstos: selo, Bloco "inclui previstos", fora da mensagem sem "Incluir previstos"; no fim da grade (depois da ordem da fatura) | N/A |
| Mês com Fatura | Fatura de Dez/26 importada | a Conta é linha comum (soma, entra na mensagem); fora da Conferência | N/A |
| Lançamento feito à mão | `manual` sem `conta_manual_id` | nunca é previsto | N/A |
| Sem internet | detector offline | "Salvar" desativado; nada lido nem gravado | `conexao.gravar_sem_conexao` |
| Outro dono | B tenta materializar Conta de A | recusa; B não vê Contas, Séries nem Lançamentos de A | `conta.nao_encontrada` |
| Parcela além do horizonte | `p_ate_mes` menor que a última parcela | nada gravado (nem a Conta) | `salvar.falhou` |
| Tipo ou Responsável em uso | excluir sem substituto | recusa; com substituto troca na Conta, na `divisao` e nos Lançamentos | `cadastro.em_uso` |
| Banco recusa | resposta com erro | formulário aberto com a mensagem; mesmo `id` ao tentar de novo | `salvar.falhou` |

</frozen-after-approval>

## Code Map

- `src/domain/contas-manuais.ts` (novo, + teste) -- `parcelasDaConta`, `avaliarFormularioConta`, `adicionarParte`/`removerParte`, `descricaoDaRepeticao`, `proximaOcorrencia`, `chaveDaSerieDaConta`, `pedidoSalvarConta`, `pedidoMaterializar`, `horizonteDasContas`. Usa `somarMeses` (`ciclo.ts`), `avaliarRascunho`/`partesDaImportacao` (`divisao.ts`) e `normalizarNome`.
- `src/domain/previstos.ts` -- `ehPrevistoDeConta` e `ehPrevistoNoMes` (o previsto da Conta, derivado do Mês sem Fatura).
- `src/domain/projecoes.ts`, `blocos.ts` (via `idsDosPrevistos`), `painel.ts` (`LancamentoGrade.conta_manual_id`) -- o "inclui previstos" e a regra de inclusão da mensagem passam a olhar o Mês; `compararPelaFatura` já põe sem `ordem_fatura` no fim (as Contas ficam depois da ordem da fatura; só ganhou teste).
- `src/domain/cadastros.ts` (+ teste) -- `REFERENCIAS_COLUNAS` e `REFERENCIAS_JSONB` com `contas_manuais`.
- `src/domain/mensagens.ts` -- códigos `conta.*` e `TEXTOS_CONTAS`.
- `supabase/migrations/20261124120000_contas_manuais.sql` -- ver "Always".
- `src/data/contas-repo.ts` (+ teste) -- lê as `ocorrencia`, chama `salvar_conta_manual`, retenta `conta.serie_ocupada`, aplica as linhas no gerenciador de Lançamentos.
- `src/data/database.types.ts`, `faturas-repo.ts` -- tipos novos; `series.parcela_total` agora é nulável, e as leituras de Série de cartão ignoram a Série sem total.
- `src/features/contas-manuais/ContasManuais.tsx`, `FormularioConta.tsx` (+ testes jsdom), `src/app/(app)/contas/page.tsx` -- a tela e o formulário; `src/ui/Campo.tsx` e `Seletor.tsx` ganham `rotuloOculto`.
- `src/features/painel/Painel.tsx`, `GradeLancamentos.tsx`, `BlocosDoMes.tsx` -- passam "o Mês tem Fatura?" para o selo "Previsto" e o "inclui previstos".
- `test/integracao/contas-manuais.test.ts` (novo, só no CI), `apoio.ts` (a limpeza apaga `contas_manuais`).

## Tasks & Acceptance

**Execution:**
- [x] `contas-manuais.ts` + testes -- parcelas, validação, Série, pedidos -- AD-1/8/15
- [x] `previstos.ts`, `projecoes.ts`, `Painel`/`Grade`/`BlocosDoMes` -- previsto da Conta
- [x] `20261124120000_contas_manuais.sql`, `database.types.ts`, `cadastros.ts` -- schema, RPCs, referências (migração NÃO aplicada)
- [x] `contas-repo.ts` + teste -- gravação, `ocorrencia`, offline
- [x] `ContasManuais`, `FormularioConta`, `mensagens.ts` + testes -- tela e formulário
- [x] `test/integracao/contas-manuais.test.ts` -- aceite no Supabase local (CI)

**Acceptance Criteria:**
- Given a Bombinhas (6 parcelas, Jul/26, Viagem, 3 × R$ 106,00), when Rafael salva, then cada Mês de Jul/26 a Dez/26 tem a parcela `n/6` de R$ 318,00 com três filhas de R$ 106,00, `manual`, já classificadas.
- Given a mesma Conta salva de novo, when a RPC roda, then nada é duplicado.
- Given uma recorrente, when salva, then `parcela_n` conta desde o Mês inicial e o horizonte é Mês atual + 12.
- Given R$ 100,00 em 3 partes, when salva, then as filhas somam R$ 100,00 com o arredondamento do AD-2.
- Given um Mês sem Fatura, when aparece no Painel, then as Contas são previstos, entram nos Blocos com "inclui previstos" e ficam no fim da grade.
- Given o formulário com campo inválido, when Rafael toca em "Salvar", then vê a mensagem do campo e nada é gravado.

## Implementation Notes

- Implementado direto da spec, sem subagentes (Rafael não pediu). Revisão inline; nenhum revisor independente rodou.
- **`ehPrevisto` não mudou** (continua "`sistema`", usado onde só há previsto de Série, como a origem no painel e a propagação da 3.5/3.8); o previsto da Conta é `ehPrevistoNoMes(l, mesTemFatura)`. `idsDosPrevistos`, `BlocosDoMes` e a grade ganharam o parâmetro com padrão "tem Fatura", então quem não passa nada se comporta como antes.
- A propagação da 3.5/3.8 (reclassificar uma parcela atualiza os previstos `sistema` da Série) **não toca nas parcelas de uma Conta**: elas são `manual`. Alterar a classificação de uma parcela de Conta não muda as outras; isso é da 5.4.
- A herança da 3.7 pode usar uma parcela de Conta parcelada como candidata se um Nome de cartão coincidir (mesma coincidência da decisão 4); anotado.
- O teste de pglite (Postgres em memória, como na 3.5) **não rodou**: o ambiente negou o comando. A migração e as RPCs ficam sem prova local; leitura atenta do SQL corrigiu um erro real (um `check` com `null` que deixaria passar "parcelas" sem total). Só o CI prova o resto.
- `database.types.ts` escrito à mão no formato do gerado; o job `supabase` compara com o gerado (a linha de `materializar_contas_manuais` tem 99 colunas e foi mantida numa linha só, a de `salvar_conta_manual` tem 106 e foi quebrada; se o gerador discordar, o CI diz).

## Spec Change Log

## Review Triage Log

Revisão inline do agente de implementação; nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| `contas_manuais_parcelas_check` deixava passar `repeticao = 'parcelas'` com `parcela_total` nulo (`true and null` é nulo e o `check` passa) | corrigido | agora exige `parcela_total is not null` |
| O `on conflict (serie_id, parcela_n)` do épico não acha o índice parcial | corrigido | o predicado vai no `on conflict` (decisão 2) |
| `materializar_contas_manuais(ate_mes)` sozinho obrigaria o SQL a reimplementar `parcelasDaConta` | decisão | 2º argumento `p_parcelas` (decisão 1) |
| `lancamentos_parcela_par_check` impedia `parcela_n` sem `parcela_total` (recorrente) | corrigido | relaxado para "total → n" |
| Série de cartão e Série de Conta com a mesma chave | aceito (low) | `deferred-work.md` |
| O cron (5.3) não tem `auth.uid()` | adiado | `deferred-work.md` |
| Contas em Meses já importados da planilha duplicariam linhas | adiado | `deferred-work.md`; o formulário avisa que Meses anteriores também recebem a conta |

## Design Notes

**Efeito em cada tela:** *Painel* -- grade mostra as Contas do Mês (no fim, com selo "Previsto" se o Mês não tem Fatura); Conferência, "verificar" e "Total a pagar" ignoram (filtram por `fatura_id`). *Blocos* -- somam as Contas (mãe dividida nunca soma; as filhas sim) e mostram "inclui previstos" no Mês sem Fatura. *Gerar mensagem* -- as Contas previstas ficam de fora salvo "Incluir previstos". *Revisar* -- nunca recebe linha de Conta (já classificada, sem `revisao_motivo`). *Realtime* -- sem gerenciador novo para Lançamentos.

**Produção:** a migração NÃO foi aplicada. Depois do merge, `supabase db push` à mão (AD) e conferir `database.types.ts` com o gerado.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm test` -- sem erro (os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos).
- Job `supabase` do CI -- aplica a migração, roda `test/integracao/contas-manuais.test.ts` e compara os tipos gerados.

**Manual checks (iPad, depois do `db push`):** cadastrar a Bombinhas, ver os 6 Meses no Painel (selo "Previsto" nos Meses sem Fatura), conferir o "inclui previstos" no Bloco, o fim da grade, o seletor de Mês nativo, o teclado numérico nos campos de valor e o foco ao tocar em "Salvar" com erro.
