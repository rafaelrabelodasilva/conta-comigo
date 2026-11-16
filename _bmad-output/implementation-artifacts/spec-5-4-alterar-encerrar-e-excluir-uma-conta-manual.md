---
title: 'História 5.4: Alterar, encerrar e excluir uma Conta manual'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: 'b8e0630'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-lista-de-contas-manuais.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a 5.1 salva uma Conta manual e a 5.3 a mantém até o Mês atual + 12, mas Rafael não consegue mudar o valor de uma conta, encerrá-la nem excluí-la. O ⋯ da lista (5.2) tem Editar, Encerrar e Excluir desativados ("Em breve"). Sem isso, um erro de digitação ou uma conta que acabou só se resolvem à mão, Lançamento por Lançamento, e o cron do dia seguinte desfaria o conserto (FR-18, FR-46).

**Approach:** o ⋯ liga os três itens. **Editar** abre o formulário da 5.1 preenchido ("Vale a partir de Mmm/AA. Os meses anteriores não mudam"); **Encerrar** pergunta "A partir de qual mês?"; **Excluir** pergunta se leva também os Lançamentos previstos dos Meses seguintes e mostra "Conta excluída · Desfazer". Uma função pura do núcleo (`src/domain/alterar-conta.ts`) decide tudo: `parcelasRecriaveis` separa o que pode ser recriado (Mês atual em diante, sem edição à mão, sem Status que conta como pago, sem Pagamento) do que fica como está e vai para o aviso, e os planos dizem o que excluir, o que criar e o que mudar. As RPCs `alterar_conta_manual`, `excluir_conta_manual` e `restaurar_conta_manual` só gravam o que sai do núcleo e conferem segurança; a criação passa pelo mesmo `materializar_contas_manuais` (AD-15). A Conta é excluída **em lógico** (`excluido_em`, AD-16): nada é apagado e o "Desfazer" devolve os mesmos ids.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `src/domain/alterar-conta.ts` (imports relativos) tem a regra de recriável, os planos de Editar, Encerrar e Excluir, a chave nova da Série, a validação do Mês do encerramento e os pedidos às RPCs. `contas-manuais.ts` ganha o rascunho de edição (`rascunhoDaConta`), `contaMudou` e o modo `original` de `avaliarFormularioConta`. Tela, repositório e SQL **não reimplementam** nada disso. O Mês atual, os Status que contam como pago e os Lançamentos lidos entram como parâmetro. Textos pelo mapa `mensagens.ts`.
- **Migração `20261126120000_alterar_encerrar_excluir_conta.sql` (AD-14), escrita e NÃO aplicada:** `contas_manuais.excluido_em`; `materializar_contas_manuais` e `salvar_conta_manual` recriadas (mesma assinatura); funções novas `excluir_linhas_da_conta` (interna), `alterar_conta_manual`, `excluir_conta_manual` e `restaurar_conta_manual`. `database.types.ts` no formato do gerado (o job `supabase` compara).
- **Sem internet, só consulta (AD-3):** os três itens ficam desativados com "Sem conexão" e o repositório devolve `conexao.gravar_sem_conexao` sem ler nem gravar.
- **Os Meses anteriores ao Mês atual nunca mudam** (FR-18): o núcleo nem os lê para o plano e a RPC recusa qualquer linha ou parcela deles.
- Manter tudo da 1.x à 5.3. O cron roda todo dia às 09:00 de Brasília com as Contas de produção: a única mudança nele é o filtro de Conta excluída e a versão da Conta por parcela.

**Never:** Lembretes e Web Push (FR-55), Previsão, Dívida programada, Pagamentos e `pagamento_itens` (Épico 6), reimportar planilha, mexer na materialização diária além do filtro de Conta excluída, aplicar a migração ou ler/alterar produção, `console.*`, `supabase.from()` em tela, apagar a linha de uma Conta, mudar o "Começa em" de uma Conta salva.

## Decisões (registradas, nada implícito)

1. **Excluir Conta: exclusão lógica da Conta (`contas_manuais.excluido_em`), nunca apagar a linha.** Por quê: (a) o épico e o AD-16 pedem exclusão lógica e "Desfazer" que **limpa o campo** e devolve os mesmos ids; (b) apagar a linha esbarra em `series.conta_manual_id` (FK **sem** `on delete`) e solta `lancamentos.conta_manual_id` (`on delete set null`), e uma linha sem Conta deixa de ser "previsto"; com a exclusão lógica **nenhuma das duas FKs dispara** e a identidade (Conta, Série, Lançamento) sobrevive ao Desfazer. A Série da Conta excluída fica no banco (a chave dela continua ocupada, então uma Conta nova igual ganha `ocorrencia` 2, e o Desfazer nunca colide). **As parcelas que ficam** quando Rafael escolhe "Excluir só a conta" seguem ligadas à Conta excluída (`conta_manual_id` intacto): continuam previstos enquanto o Mês não tem Fatura, que é o que elas são, e a Conta excluída não as recria nem as reescreve.
2. **Os leitores de `contas_manuais`, e o que cada um faz com a Conta excluída** (cada um tem teste):

   | Leitor | O que faz | Onde se prova |
   |---|---|---|
   | Leitura do cron (`src/server/materializar-contas.ts`, `COLUNAS`) | `.is("excluido_em", null)` | `route.test.ts` (fake respeita o filtro) e `cron-contas`/`contas-alterar` (CI) |
   | `lerContaDoCron` / `planoDoCron` | a linha com `excluido_em` vira `"excluida"`: sem pedido, contada à parte (`excluidas`), **não** é "ilegível" (segunda guarda, se um leitor novo esquecer o filtro) | `materializacao-diaria.test.ts`, `route.test.ts` ("o filtro escapa") |
   | `materializar_contas_manuais` | ignora parcelas de Conta excluída **sem erro** (o cron que leu a Conta um instante antes não recria o que Rafael excluiu); a Conta de outro dono continua `conta.nao_encontrada` | `contas-alterar.test.ts` (CI); cenário no Postgres em memória |
   | `materializar_contas_manuais_do_dono` | chama a anterior: herda o filtro | idem |
   | `salvar_conta_manual` | `id` de Conta excluída: `conta.nao_encontrada` (repetir um pedido velho não a traz de volta) | idem |
   | Gerenciador de `contas_manuais` (`realtime.ts`, a lista da 5.2) | guarda só as vivas: a leitura filtra no banco, o evento ou a gravação que exclui a tira da memória, o Desfazer a traz | `contas-repo-alterar.test.ts` |
   | `alterar_conta_manual` | Conta excluída: `conta.nao_encontrada` | `contas-alterar.test.ts` |
   | `referencias_cadastro()` e `substituir_cadastro` | **NÃO filtram, de propósito.** A FK de Tipo e Responsável vale para a Conta excluída também: se ela fosse ignorada, excluir o Tipo falharia na FK, e o Desfazer devolveria uma Conta que cita um Tipo que não existe. Excluir um Tipo que só ela cita **exige substituto** e a troca chega a ela. É o que já vale para os Lançamentos excluídos (`contar_usos_cadastro` também os conta) | `contas-alterar.test.ts`; cenário no Postgres em memória |
3. **`pagamento_itens` e "Status conta como pago".** A tabela `pagamento_itens` não existe (Épico 6). O AD-15 manda não recriar linha com item de Pagamento; hoje só dá para checar `editado_em` e `status.conta_como_pago`. O ponto de extensão é o 4º parâmetro de `parcelasRecriaveis`, `comPagamento: ReadonlySet<string>` (ids de Lançamento com item de Pagamento): hoje sempre vazio, já com motivo `com_pagamento` e texto no aviso. Quando o Épico 6 criar a tabela, quem lê os Lançamentos (`contas-repo.ts`, `lerLancamentosDaConta`) passa o conjunto; o núcleo e as telas não mudam. Os Status arquivados que contam como pago continuam contando (AD-16).
4. **Quais linhas são "recriáveis" (a regra única, `parcelasRecriaveis`).** Uma **parcela** é a mãe e as filhas da Divisão dela (AD-8): entram e saem juntas. Considera só `mes ≥ Mês atual`, vivas (`excluido_em` nulo). Fica como está (não recriável) se **qualquer** linha dela (mãe ou filha) tem Status que conta como pago, ou item de Pagamento, ou `editado_em`. O motivo que o aviso mostra, na ordem: "já paga", "com pagamento", "editada à mão". Os Meses anteriores nem entram (nem como recriáveis nem no aviso). A leitura é **paginada** de 1000 em 1000 (o PostgREST corta aí: uma parcelada de 120 com Divisão de 10 passaria).
5. **Como cada ação grava (AD-15: um só materializador).** Uma RPC por ação, cada uma numa transação, com o `id` da Conta vindo da tela e um único argumento `p_pedido jsonb` montado pelo núcleo. **`alterar_conta_manual` serve Editar e Encerrar** (as duas gravam a Conta nova inteira; Encerrar só muda `encerrada_em_mes`): trava a Conta, confere, exclui as parcelas recriáveis, atualiza a Conta e a Série e chama `materializar_contas_manuais` com as parcelas que o núcleo mandou criar. `excluir_conta_manual` exclui a Conta e, se o núcleo mandar, as parcelas recriáveis (repetir não faz nada). `restaurar_conta_manual` é o "Desfazer": limpa `excluido_em` na Conta e nos ids listados (repetir não faz nada). `salvar_conta_manual` **continua só criando** (decisão 3 da 5.1): não vira "alterar". Idempotência de cada uma provada no Postgres em memória e no CI.
6. **A chave da Série ao alterar.** A Série é **atualizada no lugar** (mesma linha, mesmo `id`: a identidade é `series.conta_manual_id`, então Lançamentos antigos e novos seguem ligados). A chave do AD-8 muda com Nome, Valor e total de parcelas; o `mes_primeira_parcela` não muda (item 7). A `ocorrencia`: se a chave não mudou, fica; se mudou, a menor livre entre as OUTRAS Séries da chave nova (`chaveDaSerieAlterada`, `proximaOcorrencia`: duas Contas idênticas). Se outra Conta ocupar a chave entre a leitura e a gravação, a RPC devolve `conta.serie_ocupada` e o repositório lê de novo, uma vez (como na 5.1). Isso não quebra `series_chave_key` nem `series_conta_chave_key` (os dois índices são conferidos no UPDATE) e a exceção vira `conta.serie_ocupada`, sem gravar nada.
7. **"Começa em" (Mês inicial) fica travado ao editar.** `parcela_n` conta desde o Mês inicial (AD-15) e os Meses anteriores não mudam: trocar o Mês inicial de uma Conta com Lançamentos já gravados desalinharia `parcela_n` e `mes` (a parcela 5 de antes cairia num Mês e a nova no mesmo número). O campo aparece desativado com o texto "O mês inicial não muda depois de salvo. Para outro mês, exclua esta conta e crie outra." A RPC recusa um `mes_inicial` diferente (`salvar.falhou`). Consequência: o "Mês inicial no passado ao editar" deixa de ser um caso (a Conta antiga continua editável, sem a janela de 5 anos da Conta nova e sem o aviso "Os meses anteriores também recebem a conta"). Mudar **Repetição** e **Parcelas** é permitido (o mapa `n` ↔ Mês não muda): encurtar exclui as parcelas recriáveis além do novo total; alongar cria as que faltam. As parcelas de antes do Mês atual ficam com o total antigo ("4/6" ao lado de "5/8"): é "os meses anteriores não mudam".
8. **Encerrar.** Pergunta "A partir de qual mês?" (padrão: o mês seguinte ao atual; o deste Mês segue valendo). `validarEncerramento` (núcleo) recusa: Mês ilegível ou a mais de 5 anos; Conta que já terminou (`conta.ja_encerrada`); Mês antes do Mês atual (`conta.encerrar_no_passado`: os Meses anteriores não mudam); Mês igual ou antes do inicial (`conta.encerrar_antes_do_inicio`: a Conta precisa valer por um Mês; para anulá-la, Excluir); Mês depois do fim das parcelas ou igual ao encerramento que já existe (`conta.encerrar_sem_efeito`). Grava `encerrada_em_mes`; as parcelas recriáveis de `mes` em diante saem (exclusão lógica); as não recriáveis ficam e vão para o aviso. A situação é derivada (5.2): a Conta passa a Encerrada sozinha no Mês certo. **Encerrar uma Conta já Encerrada: o item fica desativado ("Já encerrada")**, e Editar também (não há Lançamento do Mês atual em diante a mudar). **Encerrar uma Conta Ativa que já tem `encerrada_em_mes` futuro** pode mover o Mês: para trás exclui mais; para a frente (um Mês depois do antigo) a mesma RPC cria as parcelas que faltam e a Conta fica mais longa. Não há "Reabrir" de uma Conta que já terminou (fora de escopo, `deferred-work.md`).
9. **Excluir.** Janela com a pergunta "Excluir a conta Bombinhas?", a contagem ("Há 4 lançamentos previstos de Nov/26 em diante que podem sair junto") e o que fica ("Ficam como estão: …"), com dois botões destrutivos ("Excluir só a conta", "Excluir também os lançamentos") e Cancelar (o foco abre em Cancelar). "Também os lançamentos" exclui as parcelas **recriáveis do Mês atual em diante** (as mesmas de Encerrar/Editar); os Meses anteriores nunca mudam. Depois: aviso "Conta Bombinhas excluída, com N lançamentos" com **Desfazer**: `restaurar_conta_manual` com os ids que a RPC devolveu (mães e filhas, juntas). Se o Desfazer falhar (sem internet), o aviso diz o motivo.
10. **Corrida entre o cron e a 5.4.** Três camadas, todas no banco e testadas no CI: (a) **trava da linha da Conta**: `alterar`, `excluir` e `restaurar` fazem `select … for update` da Conta primeiro; `materializar_contas_manuais` faz `for share` das Contas que vai tocar, em ordem de id, então espera uma alteração em andamento e passa a ver a Conta como ficou (READ COMMITTED relê depois da espera); (b) **a Conta excluída é ignorada** pelo materializador (decisão 2), então o cron não recria o que acabou de ser excluído; (c) **a versão da Conta por parcela**: o cron manda `conta_atualizada_em` (o `updated_at` que leu) em cada parcela e o banco ignora as parcelas de uma Conta que mudou desde então; o dia seguinte recalcula. Além disso `alterar` e `excluir` conferem o `updated_at` de **cada linha** a excluir e o da Conta (`conta.mudou`): se outro aparelho pagou ou editou uma parcela depois da leitura, nada é gravado e a tela mostra "Esta conta mudou em outro aparelho". **O que o CI prova:** o resultado de cada camada em sequência (pedido velho ignorado, Conta excluída ignorada, `conta.mudou`). **O que NÃO prova:** duas transações realmente concorrentes (o Vitest do CI é sequencial); as travas são a semântica documentada do Postgres, não um teste de estresse.
11. **A classificação de uma parcela de Conta não propaga (pendência da 5.1): continua assim.** As parcelas são `manual`, e a propagação da 3.5/3.8 só toca previstos `sistema` da Série. O caminho para mudar o Tipo ou o Responsável de **todas** as parcelas futuras é Editar a Conta (que as recria). Mudar a classificação de **uma** parcela é uma edição à mão: marca `editado_em` e a protege de ser recriada depois (é o que o aviso "editada à mão" diz).
12. **Tipo e Responsável arquivados ao editar (AD-16).** O Tipo e os Responsáveis que a Conta já usa continuam nas opções e valendo mesmo arquivados (arquivar some das escolhas, não das somas). Trocar por **outro** arquivado é recusado (`conta.tipo_arquivado`, `conta.responsavel_arquivado`). `contaMudou` evita recriar à toa: salvar sem mudar nada só fecha (os ids não trocam).
13. **O toque na linha continua sem fazer nada** e **não há toque longo** na lista: o ⋯ é o único caminho. Um toque solto não abre uma edição nem uma exclusão; a linha tem células com etiquetas e o ⋯, e o custo de um clique errado é alto (recria Lançamentos).
14. **Realtime (AD-4).** O outro aparelho vê: a Conta **excluída** sair da lista (o UPDATE com `excluido_em` tira a linha da memória) e voltar no Desfazer; a Conta **alterada ou encerrada** mudar na lista (UPDATE) e a situação acompanhar; no Painel, as linhas excluídas e as novas (UPDATE e INSERT de `lancamentos`, que o gerenciador de Lançamentos já aplica pelo Mês aberto). O aparelho que grava aplica a resposta da RPC nos dois gerenciadores sem esperar o evento (o evento não duplica: mesmo `id`, `updated_at` não mais novo).
15. **Onde cada coisa roda.** Núcleo, repositório com fakes, telas jsdom, lint, typecheck e build: neste computador. **SQL das RPCs:** provado aqui no Postgres em memória (pglite, fora do projeto, com todas as migrações em ordem e o núcleo de verdade, 13 cenários: Editar, Encerrar, Excluir, Desfazer, chave da Série, guardas, Tipo da Conta excluída, versão da Conta). **Só o CI prova:** RLS, `grant`/`revoke` (anônimo e outro dono), Realtime, os `updated_at` de verdade pelo PostgREST e a igualdade de `database.types.ts` com o gerado.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Editar o Valor | Silvia desde Set/26, Mês atual Nov/26, Dez/26 paga e Fev/27 editada à mão | as parcelas de Nov/26 a Nov/27 sem edição nem Status pago saem e voltam (ids novos, valor novo); Dez/26 e Fev/27 ficam; Set e Out/26 não mudam; aviso "Ficam como estão: Dez/26 (já paga), Fev/27 (editada à mão)"; a Série muda no lugar | N/A |
| Editar com Divisão | Bombinhas, Dez/26 com uma filha editada | a parcela de Dez/26 (mãe e 3 filhas) fica; Nov/26 sai com as 3 filhas e volta com as 3 novas (R$ 110,00) | N/A |
| Editar sem mudar nada | formulário igual à Conta | só fecha; nada é lido para gravar, nada é recriado | N/A |
| Editar: Nome igual ao de outra Conta | mesma chave da Série | `ocorrencia` 2; se outra Conta ocupar a chave no meio, `conta.serie_ocupada` e uma nova tentativa | `conta.serie_ocupada` |
| Editar: Conta mudou em outro aparelho | `updated_at` da Conta ou de uma parcela mudou depois da leitura | nada é gravado | `conta.mudou` |
| Editar: parcelada encurta | 6 → 5 parcelas | as recriáveis além do total saem e não voltam | N/A |
| "Começa em" | editar | campo travado; a RPC recusa um `mes_inicial` diferente | `salvar.falhou` |
| Tipo/Responsável arquivado | a Conta usa um arquivado | continua valendo; trocar por outro arquivado é recusado | `conta.tipo_arquivado`, `conta.responsavel_arquivado` |
| Encerrar | Silvia, a partir de Jan/27, Fev/27 paga | as recriáveis de Jan/27 em diante saem, Fev/27 fica no aviso; `encerrada_em_mes = 2027-01`; o cron não recria | N/A |
| Encerrar: Mês inválido | antes do Mês atual; no ou antes do Mês inicial; depois do fim das parcelas; igual ao encerramento; Conta que já terminou | recusado pelo núcleo, nada é lido para gravar | `conta.encerrar_no_passado`, `conta.encerrar_antes_do_inicio`, `conta.encerrar_sem_efeito`, `conta.ja_encerrada` |
| Encerrar de novo (estender) | encerrada em Jan/27, escolho Abr/27 | a RPC cria só as parcelas que faltam; as existentes (inclusive a paga) seguem as mesmas | N/A |
| Encerrar com Divisão | Bombinhas a partir de Dez/26 | mãe e 3 filhas de Dez/26 saem juntas | N/A |
| Excluir com os lançamentos | Bombinhas, Nov/26 paga | Conta e a parcela de Dez/26 (mãe + 3 filhas) saem em lógico; Nov/26 fica; "Excluído · Desfazer" | N/A |
| Excluir só a conta | mesma Conta | só a Conta sai; as 6 parcelas ficam, ainda previstos | N/A |
| Desfazer | toque em "Desfazer" | `excluido_em` nulo na Conta e nos MESMOS ids (mãe e filhas); repetir não faz nada | N/A |
| Conta excluída | cron, `salvar` com o mesmo id, `alterar`, materializar com pedido velho | ignorada sem erro (cron e materializar) ou `conta.nao_encontrada` (salvar, alterar) | `conta.nao_encontrada` |
| Tipo só de uma Conta excluída | excluir o Tipo | exige substituto; a troca chega à Conta excluída | `cadastro.em_uso` |
| Cron × 5.4 | parcelas calculadas antes de a Conta mudar | ignoradas; recalculadas com a versão nova, gravam | N/A |
| Sem internet | detector offline | Editar, Encerrar e Excluir desativados "Sem conexão"; nada é lido nem gravado | `conexao.gravar_sem_conexao` |
| Outro dono / anônimo | B ou anônimo chama as RPCs de A | recusa | `conta.nao_encontrada` / permissão |
| Conta já Encerrada | ⋯ | Editar e Encerrar desativados "Já encerrada"; Excluir vale | N/A |
| Mais de 1000 linhas | parcelada de 120 com Divisão de 10 | a leitura pagina em 2 páginas | N/A |
| Leitura falha | erro ao ler os Lançamentos | janela com a mensagem; nada é gravado | `salvar.falhou` |

</frozen-after-approval>

## Code Map

- `src/domain/alterar-conta.ts` (novo, + teste, 40 casos) -- `parcelasRecriaveis`, `planoDeAlterarConta`, `planoDeEncerrarConta`, `validarEncerramento`, `previaDoEncerramento`, `planoDeExcluirConta`, `pedidoRestaurarConta`, `chaveDaSerieAlterada`, `lerContaSalva`.
- `src/domain/contas-manuais.ts` (+ teste) -- `rascunhoDaConta`, `contaMudou`, `responsaveisDaConta`, `avaliarFormularioConta` com `ctx.original`, `parcelaParaRpc` com a versão da Conta (`conta_atualizada_em`).
- `src/domain/materializacao-diaria.ts` (+ teste) -- `lerContaDoCron` devolve `"excluida"`; `planoDoCron` conta `excluidas`; cada parcela leva a versão da Conta.
- `src/domain/mensagens.ts` (+ teste) -- códigos `conta.mudou`, `conta.ja_encerrada`, `conta.encerrar_*`; `TEXTOS_CONTAS` (sai `em_breve`) e os rótulos da 5.4.
- `supabase/migrations/20261126120000_alterar_encerrar_excluir_conta.sql` -- ver "Always".
- `src/data/contas-repo.ts` (+ `contas-repo-alterar.test.ts`) -- `ler`, `alterar`, `encerrar`, `excluir`, `restaurar`; leitura paginada.
- `src/data/realtime.ts`, `database.types.ts` -- o gerenciador de `contas_manuais` só com as vivas; tipos novos.
- `src/server/materializar-contas.ts` -- `.is("excluido_em", null)` e as colunas `excluido_em` e `updated_at`.
- `src/features/contas-manuais/ContasManuais.tsx` (+ teste), `FormularioConta.tsx` (+ teste), `JanelaEncerrarConta.tsx`, `JanelaExcluirConta.tsx` -- a tela (sai a prop `acoes`).
- `test/integracao/contas-alterar.test.ts` (novo, só no CI) -- as RPCs, o filtro, as guardas e o Realtime.

## Tasks & Acceptance

**Execution:**
- [x] `alterar-conta.ts` + testes -- recriável, planos, Série -- AD-1/8/15/16
- [x] `contas-manuais.ts`, `materializacao-diaria.ts`, `mensagens.ts` + testes -- edição, versão da Conta, textos
- [x] `20261126120000_alterar_encerrar_excluir_conta.sql`, `database.types.ts` -- RPCs e `excluido_em` (migração NÃO aplicada) -- provada no Postgres em memória
- [x] `contas-repo.ts`, `realtime.ts`, `materializar-contas.ts` + testes -- fiação e filtros
- [x] `ContasManuais`, `FormularioConta`, `JanelaEncerrarConta`, `JanelaExcluirConta` + testes -- as três ações
- [x] `test/integracao/contas-alterar.test.ts` -- aceite no Supabase local (CI)
- [x] `spec`, `sprint-status.yaml`, `deferred-work.md`

**Acceptance Criteria:**
- Given uma Conta com Lançamentos em vários Meses, when Rafael edita e salva, then o formulário avisa "Vale a partir de Mmm/AA. Os meses anteriores não mudam", só são recriados os Lançamentos do Mês atual em diante sem edição à mão e sem Status pago, e os que ficaram como estavam aparecem no aviso.
- Given "Encerrar" e "A partir de qual mês?", when Rafael confirma, then os Lançamentos daquele Mês em diante que ainda podem ser recriados saem em lógico, a Conta fica Encerrada e os Meses anteriores não mudam.
- Given "Excluir", when Rafael confirma, then o app pergunta se exclui também os Lançamentos previstos dos meses seguintes, a exclusão é lógica e "Desfazer" devolve os mesmos ids.
- Given a Conta excluída, when o cron roda, then nada é recriado.
- Given o ⋯, when a Conta já terminou ou não há internet, then Editar e Encerrar ficam desativados com o motivo.

## Implementation Notes

- Implementado direto da spec, sem subagentes (Rafael não pediu). Revisão inline; nenhum revisor independente rodou.
- **O SQL foi provado aqui, de verdade, num Postgres em memória** (pglite instalado fora do projeto, no diretório temporário; nada entrou no `package.json`): todas as migrações em ordem, o núcleo real por `jiti` e 13 cenários (Editar recorrente e com Divisão, `conta.mudou`, chave da Série e `conta.serie_ocupada`, guardas, Encerrar e estender, Excluir com e sem lançamentos, Desfazer com os mesmos ids, Conta excluída ignorada, Tipo da Conta excluída, versão da Conta). Ficam de fora o que o pglite não tem: RLS, papéis (`service_role`, `authenticated`, `anon`), Realtime e PostgREST.
- `restaurar_conta_manual` tinha um erro de leitura (um `UPDATE … RETURNING INTO` que não acha linha zera o registro): corrigido relendo a Conta depois do `UPDATE`.
- `src/data/realtime.ts` está em CRLF no disco (o índice do git é LF): editado preservando o CRLF.
- Um achado fora do escopo, para `deferred-work.md`: o cron (e o materializador) **recria** uma parcela que Rafael excluiu à mão no Painel, porque o índice único só olha as não excluídas. A 5.4 não muda isso ("mexer na materialização diária além do filtro").

## Spec Change Log

## Review Triage Log

Revisão inline do agente de implementação; nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| Apagar a linha da Conta esbarra nas FKs da Série (sem `on delete`) e dos Lançamentos (`set null`) | decisão | exclusão lógica (decisão 1) |
| `referencias_cadastro()` filtrando a Conta excluída quebraria a FK ao excluir um Tipo | decisão | não filtra, de propósito (decisão 2) |
| Trocar o "Começa em" desalinha `parcela_n` e `mes` das parcelas de antes | decisão | campo travado e a RPC recusa (decisão 7) |
| O cron que leu a Conta antes da alteração grava parcelas velhas depois | corrigido | trava `for share` + `conta_atualizada_em` por parcela (decisão 10) |
| Outro aparelho paga uma parcela depois da leitura e a alteração a excluiria | corrigido | `updated_at` de cada linha conferido na RPC (`conta.mudou`) |
| `restaurar_conta_manual` zerava a Conta quando ela já estava viva | corrigido | relê a Conta depois do `UPDATE` (cenário no pglite) |
| `ContasManuais` chamava `setState` dentro do efeito de leitura | corrigido | a leitura guarda a ação a que pertence (lint `react-hooks/set-state-in-effect`) |
| O cron recria uma parcela excluída à mão no Painel | adiado | `deferred-work.md` (fora de escopo: materialização diária) |
| Não há "Reabrir" de uma Conta que já terminou | adiado | `deferred-work.md` |
| Duas transações realmente concorrentes não são testadas | aceito | só a semântica das travas; `deferred-work.md` |

## Design Notes

**Efeito em cada tela:** *Contas* -- o ⋯ liga Editar, Encerrar e Excluir; o formulário vira também "Editar"; duas janelas novas; a lista só mostra Contas vivas. *Painel, Blocos, mensagem* -- as linhas excluídas saem e as novas entram pelo Realtime de Lançamentos; as parcelas de uma Conta excluída que ficaram continuam previstos. *Revisar* -- nunca recebe linha de Conta (segue sem `revisao_motivo`). *Cron* -- só lê Contas vivas e leva a versão da Conta.

**Produção (nada foi aplicado nem lido):** depois do merge, `supabase db push` com `20261126120000_alterar_encerrar_excluir_conta.sql` **antes de usar a tela Contas e antes do próximo Cron**: o app novo lê `contas_manuais.excluido_em` (a lista filtra por ele e o cron o seleciona). Até o `db push`, a lista de Contas mostra "Não foi possível carregar" e o Cron das 09:00 responde 500 (um dia perdido não faz falta: o dia seguinte refaz). O Painel e as outras telas não dependem da coluna. A migração só **acrescenta** (uma coluna e funções novas; `materializar_contas_manuais` e `salvar_conta_manual` são recriadas com a mesma assinatura e aceitam os pedidos antigos), então não quebra nada que já está em produção.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm run build` e `npm test` -- sem erro (os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos).
- Job `supabase` do CI -- aplica a migração, roda `test/integracao/contas-alterar.test.ts` e `cron-contas.test.ts`, e compara os tipos gerados.

**Manual checks (iPad, depois do `db push`):** editar a Bombinhas e a Silvia e ver o aviso "Ficam como estão"; encerrar a partir do mês seguinte; excluir com e sem os lançamentos e tocar em "Desfazer"; o foco abrindo em "Cancelar" na janela de Excluir; o seletor de Mês do Encerrar; o VoiceOver lendo "Editar Já encerrada" e as duas janelas; o cron do dia seguinte não recriando uma Conta excluída.
