---
title: 'História 4.6: Gerar a mensagem a partir da Seleção'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: 'c34f356'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-configurar-o-modelo-da-mensagem.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rafael seleciona na grade os Lançamentos de uma pessoa e hoje monta a mensagem de cobrança à mão. A barra de Seleção tem o botão "Gerar mensagem" desde a 4.4, desativado, e o modelo já existe desde a 4.5 (FR-24, UX-DR17).

**Approach:** o núcleo ganha a regra de inclusão (`projetarMensagem`: quem entra e quem fica de fora, com o motivo) e o texto (`gerarMensagem(modelo, projecao)`), sobre o contrato da 4.5 (`renderizarModelo`, `linhaDeDetalhe`, `itemDaMensagem`), sem mudá-lo. A janela "Gerar mensagem" mostra o texto no quadro `message`, o aviso do que ficou de fora, "Copiar", "Editar modelo", "Fechar" e, num Mês sem Fatura, o interruptor "Incluir previstos". A prévia de Configurações passa a ser um recorte da mesma `projetarMensagem`, no lugar de `amostraDoMes`.

## Boundaries & Constraints

**Always:** regra de inclusão, linhas, "↳ Ajuste", total, aviso do que ficou de fora e estados do modelo saem de `src/domain` (funções puras, imports relativos); a tela só chama e guarda estado de tela (o interruptor, a falha de cópia). Textos pelo mapa único (`TEXTOS_GERAR`, `rotuloItensDeFora`). Leitura só por `useLinhas` e pelo gerenciador de Realtime; nenhum SQL novo, nenhuma migração. Sem cor literal, alvos de 44 pt, sem `console.*`.

**Never:** gerar a partir do Bloco e ligar o 💬 (4.7); a forma 3 e "Cobrar pendências" (Épico 7); Pagamentos e "Saldo pendente"; mudar Fórmula ou valor de Bloco; mudar o modelo salvo ou o contrato `renderizarModelo` / `linhaDeDetalhe` / `validarModelo`; tocar em produção.

## I/O & Edge-Case Matrix

Modelo do Rafael (Oi / Esse mês deu {total} / Pix … / as três caixas) salvo, salvo dito o contrário.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mãe de outubro | Seleção dos 5 itens da Mãe (Celular da mãe 05/10 R$ 577,50; Monjaro 03/03 R$ 310,67, parte de uma Divisão; Mercado R$ 159,90; Farmácia R$ 327,97; Estorno R$ −25,90) | forma 1 do EXPERIENCE.md: Oi / Esse mês deu R$ 1.350,14 / Pix … / linha em branco / Detalhes: / uma linha por item na ordem da fatura / Total: R$ 1.350,14 | N/A |
| Estorno | item de valor negativo na Seleção | linha com valor negativo ("ESTORNO LOJA \| - R$ 25,90") e total reduzido | N/A |
| Só estorno, ou estorno que zera a conta | total da Seleção ≤ R$ 0,00 | "Nada a cobrar nesta seleção"; "Copiar" desativado | N/A |
| Ajuste | parcela de R$ 1.140,74 com Ajuste de −R$ 0,08, a parcela marcada | linha da parcela com o valor cheio e, logo abaixo, "↳ Ajuste \| - R$ 0,08"; total R$ 1.140,66 | N/A |
| Ajuste e a parcela marcados | os dois ids na Seleção | o Ajuste segue a parcela: uma linha de Ajuste só, o total não duplica | N/A |
| Ajuste marcado sem a parcela | só o id do Ajuste | item como qualquer outro (igual ao total da barra) | N/A |
| Parcela paga com Ajuste | Status que conta como pago na parcela | a parcela e o Ajuste saem juntos; conta como 1 "já pago" | N/A |
| Itens de fora | Seleção com 1 pago, 1 de R$ 0,00 e o resto normal | aviso "2 itens não entram: 1 já pago, 1 de R$ 0,00" na janela, nunca no texto; singular "1 item não entra: 1 já pago" | N/A |
| Previsto, Mês com Fatura | previsto na Seleção | fica de fora ("1 previsto"); o interruptor nem aparece | N/A |
| Previsto, Mês sem Fatura | previsto na Seleção; interruptor "Incluir previstos" desligado | fica de fora ("1 previsto"); ligar o interruptor o inclui e o total o soma | N/A |
| Sem Status | Lançamento com `status_id` nulo | vale "não pago" (AD-10): entra | N/A |
| "Pago parcialmente" | Status que não conta como pago | entra com o valor cheio (ver Decisões) | N/A |
| Divisão | partes da Divisão marcadas | entram as partes, com o Nome da mãe; a mãe dividida nunca entra | N/A |
| Mês errado | ids da Seleção que são de outro Mês, excluídos ou desconhecidos | ignorados no núcleo; não entram nem viram "item de fora" | N/A |
| Nada a entrar | Seleção sem itens que entrem | "Nada a cobrar nesta seleção" no lugar do quadro; "Copiar" desativado; o aviso do que ficou de fora continua | N/A |
| Modelo vazio | nada escrito e nenhuma caixa | no lugar do quadro: "O modelo da mensagem está vazio. Preencha em Configurações para gerar a mensagem."; "Copiar" desativado; "Editar modelo" vira o botão principal | N/A |
| Modelo sem caixa | texto escrito e nenhuma caixa (a gravação recusa; só por dado alterado fora do app) | "O modelo não tem campos na linha de detalhe. Marque ao menos um em Configurações."; "Copiar" desativado | N/A |
| Copiar | texto pronto; toque em "Copiar" | texto na área de transferência, janela fecha, toast "Copiado"; a Seleção continua | N/A |
| Falha de cópia | permissão negada ou sem `navigator.clipboard` (sem HTTPS) | a janela fica; aviso `role="alert"` "Não foi possível copiar. Selecione o texto e copie manualmente"; o quadro recebe o foco e o texto vem selecionado | N/A |
| Editar modelo | toque em "Editar modelo" | vai para `/configuracoes?secao=mensagem` (Configurações → Modelo da mensagem); a Seleção do Painel se perde | N/A |
| Outro aparelho muda um Lançamento ou o modelo | janela aberta | o texto se refaz sozinho e um aviso `role="status"` diz "A mensagem mudou desde que você abriu a janela. Confira o texto antes de copiar." | N/A |
| Seleção esvazia por baixo da janela | Lançamentos excluídos em outro aparelho | a janela fecha e não reabre na próxima marcação | N/A |
| Troca de Mês | seta do seletor | a Seleção limpa (já era assim) e a janela fecha | N/A |
| Gravação em lote em curso | `lotando` | "Gerar mensagem" desativado, como as outras ações da barra | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/projecoes.ts` (+ `gerar-mensagem.test.ts`) -- `projetarMensagem` (a regra de inclusão e o aviso de fora: `avisoDosItensDeFora`, `podeIncluirPrevistos`), tipos `LancamentoParaMensagem`, `ItemProjetado`, `ProjecaoDaMensagem`.
- `src/domain/modelo-mensagem.ts` (+ teste) -- `gerarMensagem`, `linhasDaMensagem`, `prontidaoDoModelo`; `previaDoModelo` agora é um recorte de `projetarMensagem`; saem `amostraDoMes` e `LancamentoParaAmostra`.
- `src/domain/painel.ts` -- `compararPelaFatura` exportada (a ordem da grade, que a mensagem reaproveita).
- `src/domain/mensagens.ts` -- `TEXTOS_GERAR`, `rotuloItensDeFora`.
- `src/features/painel/JanelaGerarMensagem.tsx` (+ teste), `BarraSelecaoPainel.tsx`, `Painel.tsx` (+ teste) -- a janela e a ligação do botão.
- `src/ui/Interruptor.tsx` (extraído do `MontadorBloco`), `src/ui/Janela.tsx` (`aoAbrirFoco`, rodapé que quebra linha), `src/features/configuracoes/secoes.ts` (`SECAO_MODELO_DA_MENSAGEM`).

## Tasks & Acceptance

**Execution:**
- [x] `projecoes.ts`, `modelo-mensagem.ts`, `mensagens.ts`, `painel.ts` (+ testes de aceite) -- regra de inclusão, texto e aviso no núcleo
- [x] `previaDoModelo` como recorte de `projetarMensagem` -- a prévia e a mensagem não divergem (pendência da 4.5)
- [x] `JanelaGerarMensagem.tsx`, `Interruptor.tsx`, `Janela.tsx`, `BarraSelecaoPainel.tsx`, `Painel.tsx` (+ testes) -- janela e botão
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.6 em `review`; pendências

**Acceptance Criteria:**
- Given a Mãe de outubro, when o núcleo gera a mensagem, then sai no formato da forma 1 com total R$ 1.350,14, o estorno entra negativo e reduz o total, e o Ajuste vem em linha própria com "↳ Ajuste".
- Given a Seleção com itens pagos, de R$ 0,00 ou previstos, when a janela abre, then o aviso diz quantos ficaram de fora e por quê, e o texto não os traz.
- Given a janela com texto, when Rafael toca em "Copiar", then o texto vai para a área de transferência, a janela fecha e aparece "Copiado"; se a cópia falha, o aviso aparece e o texto fica selecionável.
- Given um Mês sem Fatura, when a janela abre, then o interruptor "Incluir previstos" existe; num Mês com Fatura, não.
- Given nada a entrar, when a janela abre, then mostra "Nada a cobrar nesta seleção" e "Copiar" fica desativado.

## Design Notes / Decisões

**Onde a regra mora.** `projetarMensagem(selecao, lancamentos, { mes, statusPagos, temFatura, incluirPrevistos })` fica em `projecoes.ts`, como a 4.1 já anunciava, e devolve `{ entram, totalCentavos, fora }`. A 4.7 reaproveita a mesma regra (a Fórmula por operando vem por cima). `gerarMensagem(modelo, projecao)` fica em `modelo-mensagem.ts`, perto de `renderizarModelo`, e devolve um estado (`pronta`, `nada_a_cobrar`, `modelo_vazio`, `modelo_sem_campos`), nunca texto solto: a tela só escolhe o que mostrar. `temFatura` entra no núcleo e `incluirPrevistos && !temFatura` é a regra: a tela não pode ligar previstos num Mês com Fatura nem por engano.

**Precedência do motivo de fora.** Um item só tem um motivo, na ordem previsto, já pago, R$ 0,00. O aviso lista os motivos na ordem "já pagos, de R$ 0,00, previstos", como o exemplo da história. Os Ajustes seguem a parcela e não contam como itens de fora.

**"Pago parcialmente".** O EXPERIENCE.md diz "só o valor que falta", mas Pagamentos só chegam no Épico 6. Decisão: a 4.6 trata tudo pelo Status (`conta_como_pago`); um Status que não conta como pago, "Pago parcialmente" inclusive, entra com o valor cheio. É o mesmo que o total da barra e o Bloco já fazem. Fica registrada pendência: quando existir Pagamento, `projetarMensagem` passa a usar só o que falta (e a 4.7 e a forma 3 junto). O teste `“Pago parcialmente” é só um Status` documenta o comportamento de hoje.

**Dívida programada ainda não vencida.** Não existe no app (Épico 6). A regra do EXPERIENCE.md fica registrada em comentário e em pendência; não há o que tirar hoje.

**Modelo vazio ou sem caixa.** `prontidaoDoModelo` diz `vazio` (nada escrito, nenhuma caixa), `sem_campos` (texto, mas nenhuma caixa) ou `pronto`. A janela abre mesmo assim (o botão da barra fica ligado), explica o que falta no lugar do quadro, "Copiar" fica desativado e "Editar modelo" vira o botão principal e leva a Configurações → Modelo da mensagem (`/configuracoes?secao=mensagem`). Modelo com campos mas textos todos vazios é válido: sai só o bloco "Detalhes:". A ordem das checagens é "nada a cobrar" primeiro (é sobre o que Rafael selecionou) e só depois o modelo.

**Total que não passa de zero.** Seleção só de estornos, ou com estorno que zera a conta, tem itens mas não tem o que cobrar: `gerarMensagem` devolve `nada_a_cobrar` (uma mensagem "Esse mês deu - R$ 25,90" não serve a ninguém). O aviso do que ficou de fora continua na janela.

**Seleção de Mês errado.** A Seleção já é de um Mês só (a 4.4 a limpa ao trocar de Mês e a poda ao filtro). Defesa no núcleo mesmo assim: `projetarMensagem` parte de `linhasDoMes(lancamentos, mes)`, então ids de outro Mês, excluídos ou desconhecidos simplesmente não existem ali. Não viram "item de fora" (não são da mensagem). Tem teste.

**Ordem, nome e Divisão.** Ordem da fatura, a mesma da grade (`compararPelaFatura`, extraída de `ordenarLancamentos`: `ordem_fatura` com vazio no fim e, no empate, a criação), não a ordem em que Rafael marcou. O Nome é o `nomeExibido` (Apelido, ou o Nome) via `itemDaMensagem`, como na 4.5; a caixa "Nome ou Apelido" desmarcada tira o nome da linha. Uma Divisão entra pelas partes (as unidades da grade; `unidadesDoMes`), nunca pela mãe, e cada parte leva o Nome, a Parcela e o valor da parte (o "Monjaro | 03/03 | R$ 310,67" do exemplo).

**Ajuste.** A linha do Ajuste é "↳ Ajuste" mais, só com a caixa Valor, " | - R$ 0,08". Ela aparece mesmo com a caixa Nome desmarcada (sem o rótulo o valor solto seria ambíguo). O item mostra o valor cheio da parcela; o total soma o líquido. Se a linha da parcela fica vazia (só a caixa Parcela marcada e item à vista), o Ajuste some junto.

**Prévia de Configurações.** `previaDoModelo` usa `projetarMensagem` sobre todo o Mês atual (com Fatura, sem previstos), pega até 5 itens, mostra os Ajustes deles e soma só esses itens. Sem nada a cobrar no Mês, usa os itens de exemplo, como na 4.5. A prévia e a mensagem passam pela mesma regra. A pendência da 4.5 ("trocar a amostra") está resolvida; o "Pago parcialmente" só pelo que falta vem com os Pagamentos.

**Leitura dos dados.** Só `useLinhas` e o gerenciador de Realtime: o Painel passa `lancamentos.linhas` (o Mês aberto), os Status que contam como pago (`status`) e o modelo (`configuracoes`, lido por `lerModelo`). Nenhum SQL, nenhuma migração.

**Mudança com a janela aberta (Realtime).** A mensagem atualiza (é derivada do estado, sem foto). Congelar deixaria Rafael copiar um texto velho, e, num app de cobrança, mandar valor errado é pior do que ver o texto mexer. Para não ser silencioso, um aviso `role="status"` (sempre no DOM, vazio) diz "A mensagem mudou desde que você abriu a janela. Confira o texto antes de copiar." O que Rafael mexe na janela (o interruptor "Incluir previstos") não dispara o aviso. A Seleção em si não muda por baixo da janela, que é modal; se esvaziar (excluídos em outro aparelho), o Painel fecha a janela e zera o estado, para ela não reabrir na próxima marcação.

**Acessibilidade.** O quadro é uma área de texto só de leitura (`readOnly`, `texto-message`), com rótulo "Mensagem": focável, selecionável pelo teclado (⌘/Ctrl+A, ⌘/Ctrl+C) e lida como texto. O foco inicial vai para o quadro, para o leitor de tela ler a mensagem (sem mensagem, para "Editar modelo"); o Radix focaria o ✕, então a `Janela` ganhou `aoAbrirFoco`. O aviso dos itens de fora é a descrição da janela (lida ao abrir); sem aviso, a descrição é "Confira o texto e copie para colar no WhatsApp." A falha de cópia é `role="alert"`; o "Copiado" é o toast da casa. O interruptor é o `role="switch"` do Montador, extraído para `src/ui/Interruptor.tsx`. O rodapé da janela passa a quebrar linha (três botões em tela estreita).

**Copiar.** `navigator.clipboard.writeText` é efeito de tela, fica na janela. Sucesso: fecha e toast. Qualquer falha (API ausente, permissão): fica aberta, `role="alert"`, foco e seleção no quadro. O texto copiado é exatamente o do quadro.

**Editar modelo.** `router.push("/configuracoes?secao=mensagem")`. Sair do Painel perde a Seleção (ela é estado local do Painel). Aceito: quem edita o modelo volta e marca de novo; guardar a Seleção entre telas ficou como pendência.

**Dinheiro.** A mensagem usa o `formatarDinheiro` do núcleo, que escreve "R$" e o número com espaço inseparável (U+00A0) para nunca quebrar de linha. É o que vai para o WhatsApp; ver pendência.

## Spec Change Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- verde; os 2 timeouts conhecidos de `eslint-nucleo` e `eslint-formatos` aparecem na suíte inteira e passam rodando sozinhos
- `src/domain/gerar-mensagem.test.ts` -- aceite do núcleo (Mãe de outubro, estorno, Ajuste, fora, previstos, nada a cobrar, modelo, Mês errado); `JanelaGerarMensagem.test.tsx` e `Painel.test.tsx` -- a janela e a ligação

**Não verificado aqui:** a janela num aparelho (layout do quadro e do rodapé a 375 e 834 pt, toque de 44 pt, o Toast "Copiado" aparecendo acima da barra); `navigator.clipboard` no Safari do iPad e no PWA (o jsdom usa o stub do user-event; só um aparelho prova a permissão e o contexto seguro); o VoiceOver lendo o título, o aviso e o quadro ao abrir e anunciando "A mensagem mudou…"; o aviso de mudança com dois aparelhos de verdade. Nenhuma migração, então nada para o CI do Supabase.
