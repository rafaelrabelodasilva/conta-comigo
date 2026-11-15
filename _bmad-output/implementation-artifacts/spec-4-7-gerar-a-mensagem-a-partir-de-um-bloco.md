---
title: 'História 4.7: Gerar a mensagem a partir de um Bloco'
type: 'feature'
created: '2026-11-15'
status: 'review'
baseline_commit: '2560250'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o Bloco "Rangel" (Rangel + Casal ÷ 2) já mostra R$ 2.819,68 no Painel, mas para cobrar o Rangel Rafael ainda escreve a conta à mão. O 💬 do cartão está desativado desde a 4.2 (FR-53, UX-DR17).

**Approach:** o núcleo ganha a forma 2: a Fórmula do Bloco vira uma lista de grupos (um por termo), cada um com o subtotal, a operação aplicada e os Lançamentos recuados. A regra de inclusão é a `projetarMensagem` da 4.6, sem cópia; o total é `avaliar` sobre só os itens que entram, e vai para `renderizarModelo`, que não muda. A janela "Gerar mensagem" é a mesma da 4.6: ela passa a receber a mensagem pronta (`montar`) e não sabe se veio da Seleção ou de um Bloco. O 💬 e o item "Gerar mensagem" do ⋯ abrem essa janela.

## Boundaries & Constraints

**Always:** a decomposição da Fórmula em termos, os grupos, o texto, o total, o aviso "já foram pagos" e os estados saem de `src/domain` (funções puras, imports relativos); a tela só chama e guarda estado de tela. Toda conta é `avaliar` (AD-11): nenhuma soma de grupo, de item ou de subtotal é feita fora dele. Textos pelo mapa único (`TEXTOS_GERAR`, `TEXTOS_BLOCO`, `rotuloPagosNaoEntram`, `rotuloItensEmVariosGrupos`). Leitura só por `useLinhas` e pelo gerenciador de Realtime; nenhum SQL, nenhuma migração. Sem cor literal, alvos de 44 pt, sem `console.*`.

**Never:** a forma 3 e "Cobrar pendências" (Épico 7); Pagamentos e "Saldo pendente"; editar Fórmula ou valor do Bloco; mudar o modelo salvo ou o contrato de `renderizarModelo`, `linhaDeDetalhe` e `validarModelo`; mexer na barra de Seleção; tocar em produção.

## I/O & Edge-Case Matrix

Modelo do Rafael (Oi / Esse mês deu {total} / Pix … / as três caixas) salvo, salvo dito o contrário. Mês de outubro/2026 montado à mão (Casal R$ 5.639,35 em 7 itens, Rangel sem itens, Mãe R$ 1.350,14).

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rangel de outubro | Bloco "Rangel" = Rangel + (Casal ÷ 2) | forma 2: Oi / Esse mês deu R$ 2.819,68 / Pix … / linha em branco / Detalhes: / "Rangel: R$ 0,00" / "Casal: R$ 5.639,35 ÷ 2 = R$ 2.819,68" / itens do Casal com 2 espaços / Total: R$ 2.819,68. O total é o valor do Bloco no Painel e o do passo a passo (`descreverCalculo`) | N/A |
| Soma simples | Bloco "Mãe" = Mãe | um grupo "Mãe: R$ 1.350,14" com os 5 itens recuados; o total é o da forma 1 sobre os mesmos itens | N/A |
| Subtração | Bloco = Casal − Mãe | "Casal: R$ …" e "Menos Mãe: - R$ 1.350,14", cada um com os seus itens; total = Casal − Mãe | N/A |
| Subtração com ÷ | Bloco = Casal − (Mãe ÷ 2) | "Menos Mãe: R$ 1.350,14 ÷ 2 = - R$ 675,07"; o resultado é o que o grupo tira do total | N/A |
| Número solto | Bloco = Rangel + 100 | "Valor fixo: R$ 100,00" sem itens; o total soma os R$ 100,00 | N/A |
| Número solto subtraído | Bloco = Casal − 100 | "Menos Valor fixo: - R$ 100,00" | N/A |
| Operando "Todos" | Bloco = Todos ÷ 3 | grupo "Todos: R$ … ÷ 3 = R$ …" com todos os itens que entram | N/A |
| Operando por Tipo | Bloco = Casa (Tipo) | grupo "Casa: R$ …" com os itens do Tipo; "Rafael em Bobiças" para Responsável em Tipo | N/A |
| Parênteses de soma | Bloco = (Rangel + Casal) ÷ 2 | um grupo "Rangel + Casal: R$ … ÷ 2 = R$ …" com os itens dos dois operandos | N/A |
| Parênteses de uma soma só | Bloco = Rangel − (Casal + Mãe) | achata: "Rangel", "Menos Casal", "Menos Mãe" | N/A |
| Mais de uma operação | Bloco = Casal ÷ 2 ÷ 2 ; Bloco = Casal × 2 | "R$ X ÷ 2 ÷ 2 = R$ Y"; "R$ X × 2 = R$ Y" (o número na frente, "2 × Casal", sai depois do valor) | N/A |
| Parte já paga | 1 item do Casal (R$ 1.000,00) pago | o total cai (Casal ÷ 2 cai R$ 500,00); a janela diz "R$ 500,00 já foram pagos e não entram"; some sem pagos | N/A |
| Pago que não muda o Bloco | item pago de R$ 0,00 ou de outro Responsável que a Fórmula não cita | sem aviso de pagos; o item de outro Responsável nem é contado em "itens de fora" | N/A |
| Previsto, Mês com Fatura | previsto do Casal | fica de fora ("1 item não entra: 1 previsto"); o aviso de pagos não o conta | N/A |
| Previsto, Mês sem Fatura | interruptor "Incluir previstos" | desligado: fora; ligado: entra e o total o soma | N/A |
| Estorno | estorno do Casal | linha negativa recuada; reduz o subtotal do grupo e o total | N/A |
| Ajuste | parcela do Casal com Ajuste de −R$ 0,08 | "↳ Ajuste \| - R$ 0,08" logo abaixo da parcela, também recuado; o subtotal e o total são o líquido | N/A |
| Parcela paga com Ajuste | Status que conta como pago | parcela e Ajuste saem juntos; o aviso de pagos conta os dois | N/A |
| Item em dois operandos | Bloco = Casal + Casa (Tipo); um item é do Casal e da Casa | aparece nos dois grupos; o total é o do Painel (conta duas vezes, como a Fórmula); a janela avisa "1 item aparece em mais de um grupo e conta em cada um, como no Painel" | N/A |
| Grupo vazio ou de R$ 0,00 | Rangel sem itens; ou todos pagos | continua na mensagem ("Rangel: R$ 0,00"), sem itens | N/A |
| Arredondamento | Bloco = Casal ÷ 2 + Mãe ÷ 2, cada subtotal ímpar | cada grupo mostra o seu valor arredondado; o total vem de uma única conta arredondada no fim, e pode diferir em R$ 0,01 da soma das linhas dos grupos | N/A |
| Nada a cobrar | total do Bloco ≤ R$ 0,00 (tudo pago, ou subtração que zera) | "Nada a cobrar neste bloco"; "Copiar" desativado; os avisos continuam | N/A |
| Só valor fixo | Bloco = Rangel + 100, Rangel sem itens | há o que cobrar (total R$ 100,00): sem itens não é "nada a cobrar" | N/A |
| Bloco sem valor | a Fórmula não calcula (divisão por zero, números grandes) | 💬 e item do ⋯ continuam ligados; a janela mostra "Este bloco está sem valor. Edite a fórmula para gerar a mensagem."; "Copiar" desativado | N/A |
| Bloco excluído com a janela aberta | outro aparelho exclui | a janela fecha e um toast diz "O Bloco foi excluído e a janela foi fechada" | N/A |
| Fórmula muda com a janela aberta | outro aparelho edita o Bloco, o modelo ou um Lançamento | o texto se refaz e o aviso `role="status"` diz "A mensagem mudou…" (igual à 4.6); se o Bloco ficar sem valor, vira o estado "sem valor" | N/A |
| Modelo vazio / sem caixa | igual à 4.6 | explica; "Editar modelo" é o botão principal | N/A |
| Copiar / falha de cópia / Editar modelo / Fechar | igual à 4.6 | igual à 4.6 | N/A |
| Troca de Mês | seta do seletor | a janela fecha | N/A |
| Primeiro uso | passo "Blocos" (sem Painel, sem modelo ainda) | o cartão não mostra o 💬 nem o item "Gerar mensagem" | N/A |
| Reordenar | modo Reordenar | o 💬 e o ⋯ saem, como já era | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/formula.ts` -- `termosDaFormula` e `temOperando` (testados em `gerar-mensagem-bloco.test.ts`): a Fórmula vira termos (`Termo`: o nó, se é subtraído, a base e os fatores × ÷).
- `src/domain/projecoes.ts` -- `idsPagos` em `ProjecaoDaMensagem` (os pagos e os Ajustes deles); `projetarMensagemDoBloco` (a regra de inclusão da 4.6 mais os grupos); tipos `GrupoDoBloco`, `ProjecaoDoBloco`.
- `src/domain/modelo-mensagem.ts` -- `gerarMensagemDoBloco`, `linhaDoGrupo`; `MensagemGerada` ganha o estado `sem_valor`.
- `src/domain/mensagem-janela.ts` (+ `gerar-mensagem-bloco.test.ts`) -- `mensagemDaSelecao`, `mensagemDoBloco` e `MensagemDaJanela` (a mensagem pronta, o texto do que falta e os avisos): o que a janela recebe.
- `src/domain/mensagens.ts` -- `TEXTOS_GERAR` (menos, valor fixo, nada a cobrar do Bloco, sem valor, Bloco excluído), `TEXTOS_BLOCO.gerar_mensagem`, `rotuloPagosNaoEntram`, `rotuloItensEmVariosGrupos`; sai `mensagem_em_breve`.
- `src/features/painel/JanelaGerarMensagem.tsx` (+ teste) -- recebe `montar(incluirPrevistos)` em vez da Seleção; `JanelaMensagemDoBloco.tsx` (testada pelo `Painel.test.tsx`, que tem o Realtime falso) -- lê Blocos e cadastros, fecha se o Bloco some.
- `src/features/painel/CartaoBlocos.tsx`, `BlocosDoMes.tsx`, `Painel.tsx` (+ testes) -- o 💬, o item do ⋯ e a ligação.

## Tasks & Acceptance

**Execution:**
- [x] `formula.ts`, `projecoes.ts`, `modelo-mensagem.ts`, `mensagem-janela.ts`, `mensagens.ts` (+ testes de aceite) -- forma 2 no núcleo
- [x] `JanelaGerarMensagem.tsx`, `JanelaMensagemDoBloco.tsx`, `CartaoBlocos.tsx`, `BlocosDoMes.tsx`, `Painel.tsx` (+ testes) -- janela única e o 💬
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.7 em `review`; pendências

**Acceptance Criteria:**
- Given o Bloco "Rangel" = Rangel + (Casal ÷ 2) em outubro/2026, when o núcleo gera a mensagem, then o total é R$ 2.819,68, igual ao valor do Bloco e ao passo a passo, e o texto é a forma 2 do EXPERIENCE.md.
- Given um Bloco com subtração e um com número solto, when gera, then saem "Menos Nome: - R$ X" e "Valor fixo: R$ X".
- Given parte do Bloco já paga, when a janela abre, then o total cai e o aviso "R$ X já foram pagos e não entram" traz o valor certo; sem diferença, o aviso some.
- Given um Bloco de soma simples, when gera, then o total é o da forma 1 sobre os mesmos itens.
- Given as regras da 4.6 (R$ 0,00, previstos, estorno, Ajuste, Divisão pelas partes), when o Bloco gera, then valem as mesmas.
- Given o 💬 ou o item "Gerar mensagem" do ⋯, when Rafael toca, then abre a janela da 4.6 com Copiar, Editar modelo, Fechar, "Incluir previstos" (só sem Fatura), "Nada a cobrar" e a falha de cópia.

## Design Notes / Decisões

**Onde a regra mora.** `projetarMensagemDoBloco(formula, lancamentos, opcoes, nomes)` fica em `projecoes.ts`, perto de `projetarMensagem`, e devolve `Resultado<ProjecaoDoBloco>`. O texto (`gerarMensagemDoBloco`) fica em `modelo-mensagem.ts`, ao lado de `gerarMensagem`. `mensagem-janela.ts` monta o que a janela recebe: a mensagem, o texto do que falta e os avisos. A janela chama `montar(incluirPrevistos)` a cada render, e a regra de `incluirPrevistos && !temFatura` segue no núcleo.

**Como a Fórmula é projetada sobre "só os itens que entram".** Em quatro passos, sem reimplementar a conta: (1) `avaliar(formula, projetarPainel(...))` diz quais linhas a Fórmula usa (`entram`); só elas viram a Seleção, então o aviso "itens de fora" fala só do que é do Bloco, não do Mês todo; (2) `projetarMensagem(selecao, ...)` aplica a regra da 4.6 (previsto, já pago, R$ 0,00), sem cópia; (3) as linhas que entram (cada item e cada Ajuste dele, com a classificação do próprio Lançamento) formam a projeção filtrada; (4) `avaliar(formula, filtrada)` dá o total (arredondado só no final, FR-54), e `avaliar(termo, filtrada)` dá o valor de cada grupo. O `avaliar` nunca recebe a projeção do Painel para a mensagem; recebe a filtrada. Isso é o que faz "Casal ÷ 2" valer R$ 5.639,35 ÷ 2 = R$ 2.819,675, arredondado uma vez só, em R$ 2.819,68.

**Total e arredondamento.** O total da mensagem é a Fórmula inteira, uma conta, um arredondamento. Cada grupo mostra o valor do próprio termo, arredondado no fim do termo. Com dois grupos ímpares (R$ 0,01 ÷ 2 em cada) a soma das linhas dos grupos pode diferir R$ 0,01 do total; vale o total, que é o do Painel e do passo a passo (FR-54). Documentado em teste.

**Fórmula em grupos (`termosDaFormula`).** Termo é uma parcela da soma de mais alto nível: a cadeia de + e − é achatada, e um parêntese que só envolve soma é desfeito (`Rangel − (Casal + Mãe)` vira "Rangel", "Menos Casal", "Menos Mãe": o sinal se propaga). O termo tem uma base e os fatores × ÷ por números: o operando (ou o número solto, ou um parêntese de soma) mais as operações em ordem, de dentro para fora. Parênteses em volta de um termo só (`Casal ÷ 2` entre parênteses) são transparentes. Todo termo de uma Fórmula válida cabe, porque Responsável e Tipo valem em R$ e R$ com R$ em × ou ÷ nem passa na validação; por isso não há Fórmula que "não caiba": só a que não calcula (ver "Bloco sem valor"). O caso mais geral é um parêntese de soma multiplicado ou dividido (`(Rangel + Casal) ÷ 2`): vira **um** grupo, com o nome sendo a Fórmula da base ("Rangel + Casal"), o subtotal da base e os itens de todos os operandos dela.

**Nome do grupo.** O mesmo texto do passo a passo (`nomeDoOperando`): "Casal", "Casa" (Tipo), "Rafael em Bobiças" (Responsável em Tipo), "Todos". Cadastro arquivado mantém o nome (AD-16); um cadastro sumido de verdade aparece como "?", como no passo a passo. Subtraído ganha o prefixo "Menos ". O número solto é "Valor fixo" (uma Fórmula só de números, `2 × 3`, também). O texto do grupo é sempre o valor, não depende das caixas do modelo (Nome, Parcela, Valor): elas só mandam nas linhas dos itens.

**Linha do grupo.** `Nome: R$ X` (somado, sem fatores); `Nome: R$ X ÷ 2 = R$ Y` (com fatores; vários: `R$ X ÷ 2 × 3 = R$ Y`); `Menos Nome: - R$ X` (subtraído, sem fatores); `Menos Nome: R$ X ÷ 2 = - R$ Y` (o último valor é o que o grupo contribui ao total, com sinal). O fator vem depois do valor mesmo que Rafael tenha montado `2 × Casal`.

**Item em mais de um operando.** Aparece nos dois grupos, e o total o conta nos dois: é o que a Fórmula diz ("Casal + Casa" é a soma de dois subtotais), é o valor do Bloco no Painel e é o que o passo a passo mostra. Cada grupo precisa fechar com os itens que traz; se o item só aparecesse no primeiro, o subtotal do segundo não bateria com a lista. O total nunca soma itens e grupos juntos (vem de uma única `avaliar`), então não há dupla contagem por soma de duas listas. Para não ser silencioso, a janela avisa "N itens aparecem em mais de um grupo e contam em cada um, como no Painel". Quem não quiser a dobra ajusta a Fórmula (Tipo e Responsável em Tipo existem para isso). Se Rafael preferir tirar a dobra do total da mensagem, isso diverge do valor do Bloco e é decisão para o Épico 6 (fica em `deferred-work.md`).

**Grupo vazio ou de R$ 0,00.** Aparece, como no exemplo do EXPERIENCE.md ("Rangel: R$ 0,00"): quem lê vê que a conta considerou aquela parte. Sem itens, não há linhas recuadas.

**Nada a cobrar.** Bloco: o total não passa de R$ 0,00 (mesma decisão da 4.6). A condição é o total, não "sem itens": "Rangel + 100" sem itens do Rangel cobra R$ 100,00. O texto é "Nada a cobrar neste bloco".

**Aviso de pagos.** `rotuloPagosNaoEntram`: "R$ X já foram pagos e não entram". X é a diferença que a Fórmula faz com e sem os pagos: `avaliar(formula, painel)` menos `avaliar(formula, painel sem os pagos)`. Os pagos são os do motivo "pago" de `projetarMensagem` (a mesma precedência da 4.6: previsto, pago, R$ 0,00) com os Ajustes deles. X é calculado assim (e não por "valor do Bloco menos total da mensagem") para que previstos que ficam de fora num Mês com Fatura, que também diferem do Painel, não passem por pagos. X está em valores do Bloco (um item pago de R$ 1.000,00 do Casal em "Casal ÷ 2" tira R$ 500,00). Some quando X é zero; um estorno pago deixaria X negativo e o valor sai com o sinal.

**"Pago parcialmente".** Segue a 4.6: vale o Status (`conta_como_pago`). Um Status que não conta como pago entra com o valor cheio; o aviso de pagos usa o mesmo `idsPagos`, então nunca conta o "pago parcialmente". Fica a mesma pendência para o Épico 6.

**Bloco sem valor.** A Fórmula que não calcula (`avaliar` com erro) dá o estado `sem_valor`. O 💬 e o item "Gerar mensagem" continuam ligados e a janela explica: um botão desativado não diz por quê e não recebe foco (a 4.3 já registrou isso para o filtro). "Copiar" fica desativado. Um Bloco que fica sem valor com a janela aberta (outro aparelho editou) vira esse estado e avisa que mudou. Um Bloco excluído com a janela aberta fecha a janela e mostra um toast: a janela de "Ver cálculo" já fecha assim (4.2), e deixar a janela aberta de um Bloco que não existe levaria a copiar uma conta sem dono.

**Realtime.** Como na 4.6: a mensagem é derivada do estado (Bloco, Lançamentos, Status, modelo e cadastros) e se refaz; o aviso `role="status"` diz que mudou; o interruptor "Incluir previstos" não dispara o aviso. Teste: mudar um Lançamento, mudar o modelo, o Bloco ficar sem valor e o Bloco ser excluído.

**Leitura dos dados.** Só `useLinhas` e o gerenciador de Realtime. `JanelaMensagemDoBloco` lê `blocos`, `responsaveis` e `tipos`; o Painel passa os Lançamentos, os Status que contam como pago, `temFatura` e o modelo (que já lia para a 4.6). Nenhum SQL, nenhuma migração.

**Acessibilidade.** O 💬 mantém o nome "Gerar mensagem do Bloco {nome}", agora ativo; o ⋯ ganha "Gerar mensagem" entre "Ver cálculo" e "Reordenar", como no EXPERIENCE.md. A janela é a da 4.6: foco inicial no quadro (sem mensagem, em "Editar modelo"), os avisos juntos na descrição da janela (lida ao abrir), o aviso de mudança em `role="status"`, o quadro selecionável. O toast de Bloco excluído é o toast da casa.

**Primeiro uso.** O passo "Blocos" usa o mesmo cartão sem Painel, sem Lançamentos do Mês e antes do modelo existir: sem `aoGerarMensagem` o cartão não mostra o 💬 nem o item do ⋯ (antes mostrava o 💬 desativado).

**Indentação.** Os itens (e os "↳ Ajuste") ficam com 2 espaços; o Ajuste fica no mesmo recuo do item, como o item da 4.6 e o Ajuste ficam alinhados.

## Spec Change Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- verde; os 2 timeouts conhecidos de `eslint-nucleo` e `eslint-formatos` aparecem na suíte inteira e passam rodando sozinhos
- `src/domain/gerar-mensagem-bloco.test.ts` -- aceite do núcleo (Rangel de outubro, soma simples, subtração, número solto, pagos, previstos, Ajuste, sobreposição, arredondamento); `JanelaGerarMensagem.test.tsx` (a janela sem saber a origem), `BlocosDoMes.test.tsx` (o 💬 e o ⋯) e `Painel.test.tsx` ("Gerar mensagem do Bloco": a ligação, o aviso de pagos, o Realtime e a exclusão)

**Não verificado aqui:** a janela e o recuo do texto num aparelho (WhatsApp colando os 2 espaços e o "↳"); o layout do quadro a 375 e 834 pt, o toque de 44 pt do 💬 agora ativo e o item novo do ⋯; `navigator.clipboard` no Safari do iPad e no PWA; o VoiceOver lendo os avisos juntos na descrição; os dois aparelhos de verdade para o aviso de mudança e a exclusão do Bloco. Nenhuma migração, então nada para o CI do Supabase.
