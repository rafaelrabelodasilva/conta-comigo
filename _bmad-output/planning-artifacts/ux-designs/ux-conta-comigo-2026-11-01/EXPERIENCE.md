---
title: "EXPERIENCE: Conta Comigo"
status: draft
created: 2026-11-01
updated: 2026-11-01
sources:
  - ../../prds/prd-conta-comigo-2026-11-01/prd.md
  - ../../briefs/brief-conta-comigo-2026-11-01/brief.md
---

# Conta Comigo: Experiência

Este documento define **como o app funciona**: telas, navegação, comportamento, estados e fluxos. O visual está no `DESIGN.md`, e os tokens são citados como `{colors.accent}`, `{components.selection-bar}` etc. Os requisitos são os do PRD (FR-n), e os termos seguem o Glossário do PRD (Lançamento, Nome, Apelido, Tipo, Responsável, Lançado por, Status, Bloco, Seleção…). Em caso de conflito entre estes documentos e um mock, valem estes documentos.

## Foundation

- **Forma:** web app instalável (PWA). Uma única interface responsiva.
- **Aparelhos da v1:** **iPad Pro 11" (M4), deitado**, que é a tela principal e a referência de todos os tamanhos, e **PC no navegador**. O iPhone fica fora da v1 (PRD §5).
- **Entrada:** no iPad, **dedo** (principal) e **Apple Pencil**, tratada exatamente como o dedo. Não há trackpad nem teclado no iPad. No PC, mouse e teclado.
- **Modos:** claro e escuro, seguindo o sistema, com opção de fixar um deles em Configurações.
- **Usuário:** só o Rafael. Não há telas para as pessoas cobradas.
- **Biblioteca de componentes:** a ser definida na arquitetura. Estes documentos não dependem de uma biblioteca específica. [ASSUMPTION]

## Information Architecture

O menu lateral (`{components.nav-rail}`) tem ícones com rótulo curto embaixo.

| Tela | Como chegar | Para que serve | FRs |
|---|---|---|---|
| **Painel** (inicial) | Abrir o app · menu | Mês selecionado: cartão da fatura, Blocos, grade, Seleção, mensagem | FR-19 a FR-24, FR-48, FR-53, FR-54 |
| **Revisar** | Menu (com contador) · resumo da importação | Fila do que é novo ou está em dúvida | FR-13 a FR-15, FR-45, FR-47 |
| **Recebimentos** | Menu | Saldo pendente por pessoa, atrasados, "A receber", histórico de Pagamentos, Meses anteriores da Fatura | FR-25 a FR-30, FR-49 |
| **Previsão** | Menu | Próximos Meses com os Lançamentos previstos, por Responsável e Tipo; evolução | FR-32, FR-33 |
| **Contas manuais** | Menu | Lista, cadastro e edição das Contas manuais | FR-16 a FR-18 |
| **Configurações** | Menu (último ícone) | Responsáveis (com cor), Tipos, Status, Regras, modelo da mensagem, Ciclo (fechamento e vencimento), limite do Ajuste, tolerância de atraso, tema, importar planilha | FR-1, FR-2, FR-12, FR-23, FR-36, FR-50 |

**Sobreposições** (abrem por cima, sem trocar de tela):

| Sobreposição | Abre a partir de | Forma |
|---|---|---|
| **Importar fatura** | Botão "Importar fatura" no topo do Painel | Janela em 3 passos |
| **Lançamento** | Toque no corpo de uma linha da grade | Painel lateral à direita, com a grade visível |
| **Montador de Bloco** | "＋ Bloco" no cartão dos Blocos · "Editar" num Bloco | Janela |
| **Gerar mensagem** | "Gerar mensagem" na barra de Seleção · "Mensagem" num Bloco | Janela |
| **Aplicar status** | "Aplicar status" na barra de Seleção | Janela pequena |
| **Primeiro uso** | Primeira abertura | Passo a passo em tela cheia, com "Pular" em cada passo |

**Navegação entre Meses:** o seletor "◀ Out/26 ▶" fica no topo do Painel e da Previsão. Tocar no nome do mês abre uma lista de meses, com os futuros marcados como "previsto". Ao abrir o app, sempre aparece o Mês atual.

## Voice and Tone

- Português do Brasil, direto e curto, sem jargão. É o Rafael falando com ele mesmo.
- **Formatos fixos (PRD §6):** datas DD/MM/AA, horas HH:MM, valores "R$ 1.140,74" e negativos "- R$ 0,08".
- Os termos são os do Glossário: "Lançamento", "Responsável", "Tipo", "Status", "Bloco". Nunca "transação", "categoria" ou "cliente".
- Os botões dizem o que fazem: "Importar fatura", "Gerar mensagem", "Aplicar status", "Copiar", "Marcar como pago".
- Os avisos dizem o que aconteceu e o que fazer:
  - "A soma dos lançamentos ficou R$ 80,00 abaixo do total da fatura. A diferença está no cartão final 8673."
  - "Esta fatura já foi importada. Importar de novo apaga os 49 lançamentos de outubro vindos da fatura (3 já estão pagos) e importa tudo de novo."
- Nenhuma mensagem de sucesso exagerada. Uma confirmação curta basta: "Copiado", "3 lançamentos marcados como pagos".

## Component Patterns

| Componente | Comportamento |
|---|---|
| **Cartão da fatura** | Mostra o total a pagar do Mês. Tocar no selo "⚠ Diferença" leva à grade filtrada por "Verificar". Num Mês sem Fatura importada, mostra "Fatura ainda não importada", o total dos previstos e o botão "Importar fatura". |
| **Barra de distribuição** | Os segmentos são proporcionais à soma de cada Responsável que é pessoa. Tocar num segmento equivale a tocar no Bloco daquela pessoa. [ASSUMPTION] |
| **Bloco** | **Toque** = filtra a grade pelos Lançamentos da Fórmula (borda `{colors.accent}`). **Toque de novo** = desfaz o filtro. Só um Bloco filtra por vez. O botão **"Mensagem"** no Bloco abre "Gerar mensagem" com o total da Fórmula (FR-53). **Toque longo** (ou "⋯") = Editar, Ver cálculo (FR-54), Reordenar, Apagar. |
| **Grade** | Colunas da planilha. Os cabeçalhos ordenam ao toque (de novo, inverte). A barra de filtros acima da grade tem um seletor por coluna (Responsável, Tipo, Status, Lançado por, cartão) e o filtro "Verificar". Os filtros ativos aparecem como pílulas removíveis, e há o botão **"Limpar filtros"**. A grade rola por dentro do cartão, com o cabeçalho fixo. |
| **Caixa de seleção** | A área de toque é a célula inteira da primeira coluna (44 × 44 pt). A caixa do cabeçalho seleciona **todos os Lançamentos do filtro atual**, mesmo os que não estão visíveis. |
| **Linha** | Tocar na caixa seleciona. Tocar em qualquer outra parte abre o Lançamento no painel lateral. Lançamentos divididos aparecem como linhas separadas, ligadas por um "↳" discreto. O Ajuste (FR-47) aparece logo abaixo da parcela, recuado, com o líquido. |
| **Barra de Seleção** | Aparece quando há 1 ou mais itens selecionados e mostra "N selecionados · R$ total", **atualizado a cada toque** (FR-48). Ações: "Limpar", "Aplicar status", "Gerar mensagem". A Seleção continua mesmo trocando o filtro, e a barra mostra "N selecionados (M fora do filtro)". [ASSUMPTION] |
| **Painel do Lançamento** | Campos editáveis: Apelido, Tipo, Responsável, Status, Observação. Somente leitura: Nome, Valor, Parcela, data, cartão, Lançado por e origem ("criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26"). Ações: Dividir, Excluir. Cada mudança é salva na hora, sem botão "Salvar", e aparece "Salvo". As perguntas do PRD (aplicar a outros do mesmo Nome, às parcelas previstas…) aparecem como uma faixa no painel, com "Aplicar a todos" ou "Só este". |
| **Montador de Bloco** | Campo do nome. A área da Fórmula mostra **fichas** (Rafael, Casal, ÷, 2, (, )) montadas com toques, nunca digitadas. Uma paleta embaixo tem as fichas disponíveis: Responsáveis (com a bolinha da cor), Tipos, "Todos", operações + − × ÷, parênteses e "Número", que abre um teclado numérico. Tocar numa ficha da Fórmula a remove. O resultado aparece ao vivo, com o cálculo passo a passo embaixo. "Salvar" fica desativado enquanto a Fórmula for inválida, e a razão aparece em uma linha ("Falta fechar um parêntese"). |
| **Gerar mensagem** | Mostra a mensagem pronta no modelo (FR-23), num quadro de leitura. A pessoa vem do filtro ou do Bloco. Se não der para saber, o app pergunta "Para quem?", só para a saudação. [ASSUMPTION] Botões: "Copiar" (principal), que fecha a janela e mostra "Copiado", e "Editar modelo". |
| **Aplicar status** | Lista dos Status cadastrados, a data (padrão hoje) e "Valor recebido" (padrão: total da Seleção). Se o valor for menor, aparece "Faltam R$ 115,00. Esse valor fica pendente" antes de confirmar. |
| **Importar fatura** | Passo 1: escolher o PDF (Arquivos do iPad ou do computador). Passo 2: digitar a senha. Passo 3: conferir o vencimento e o Mês lidos e ver o resumo (Conferência, quantos foram classificados, quantos ir para Revisar), com "Ir para revisão" ou "Ver no Painel". |
| **Fila de Revisar** | Agrupada por Nome. Cada item tem uma linha de sugestão ("Sugestão: Casal · Casa"), com "✓" (aceita, um toque) e "Mudar" (abre seletores de Responsável e Tipo com as opções mais usadas primeiro). Dá para selecionar vários e aplicar de uma vez. Um contador "Faltam 17" fica no topo. |
| **Etiqueta de pessoa** e **selos** | Só informam. Tocar numa etiqueta de pessoa na grade filtra pela pessoa. [ASSUMPTION] |

## State Patterns

| Estado | Onde | Como aparece |
|---|---|---|
| **Primeiro uso** | App inteiro | Passo a passo: Responsáveis → Tipos → Status → Importar planilha (2026) → Blocos → Mensagem → Ciclo. Cada passo pode ser pulado. Depois, o Painel vazio mostra "Importe sua primeira fatura". |
| **Mês sem Fatura** | Painel | O cartão diz "Fatura ainda não importada". A grade mostra os previstos (selo "Previsto") e as Contas manuais. Os Blocos somam os previstos e mostram a legenda "inclui previstos". |
| **Importando** | Janela Importar | Barra de progresso com etapas: "Abrindo PDF", "Lendo lançamentos", "Conferindo", "Classificando". Não dá para fechar a janela no meio. |
| **Senha errada** | Janela Importar | O campo fica vermelho com "Senha incorreta", e a senha pode ser digitada de novo. |
| **Mês já importado** | Janela Importar | Aviso de reimportação (FR-51) com o número de Lançamentos e quantos já estão pagos ou foram classificados à mão. Botões "Importar de novo" (destrutivo) e "Cancelar". |
| **Conferido** | Cartão da fatura | Selo "✓ Conferido", verde. |
| **Diferença** | Cartão da fatura e topo da grade | Faixa âmbar (`{components.alert-warning}`) com a diferença e o cartão em que ela está, e os botões "Ver lançamentos" (filtra por Verificar) e "Dispensar". Não bloqueia nada (FR-6). |
| **Verificar** | Grade | Bolinha `{colors.verify}` antes do Nome. Some sozinha quando a Conferência bate. |
| **Previsto** | Grade | Selo cinza "Previsto" junto ao Nome, com texto um pouco mais claro. Não entra na mensagem de um Mês sem Fatura, a menos que Rafael escolha incluir. |
| **Não pago · Pago · Pago parcialmente · Atrasado** | Grade, Recebimentos | Selo de Status com o par de cores do `DESIGN.md`. "Pago parcialmente" mostra "falta R$ X" no painel do Lançamento. "Atrasado" é calculado (vencimento + 10 dias) e aparece no lugar de "Não pago". |
| **Filtro sem resultado** | Grade | "Nenhum lançamento com esses filtros", com o botão "Limpar filtros". |
| **Fila vazia** | Revisar | "Tudo revisado. Nada novo neste mês." O contador do menu some. |
| **Atualização vinda de outro aparelho** | Qualquer tela | Os números mudam na hora (FR-46), sem recarregar. Se o Lançamento aberto no painel lateral mudar em outro aparelho, aparece "Atualizado em outro aparelho". |
| **Sem conexão** | App inteiro | Faixa "Sem conexão. As mudanças serão salvas quando voltar." [ASSUMPTION: edição offline com sincronização; confirmar na arquitetura] |

## Interaction Primitives

- **Toque** (dedo ou Pencil): a ação principal em tudo. Não há gestos escondidos como única forma de fazer algo.
- **Toque longo** num Bloco ou numa linha: abre o menu de ações. Tudo o que está nele também existe num botão "⋯" visível.
- **Arrastar** só para reordenar Blocos, no modo "Reordenar".
- **Seleção múltipla:** é feita pelas caixas, sem modo especial. "Selecionar todos" vale para o filtro atual.
- **Salvar:** campos salvam ao sair deles. Ações destrutivas (Excluir, Importar de novo, excluir Status em uso) pedem confirmação, e as demais podem ser desfeitas com "Desfazer" no aviso que aparece embaixo por alguns segundos.
- **No PC:** além do mouse, Esc fecha sobreposições, Enter confirma e ⌘/Ctrl+A seleciona tudo do filtro. [ASSUMPTION]

## Accessibility Floor

- A área de toque mínima é de 44 × 44 pt, inclusive nas caixas de seleção, cuja caixa desenhada tem 18 px.
- **A informação nunca depende só da cor:** a etiqueta da pessoa tem o nome escrito, o Status tem texto, e a marca "verificar" tem rótulo para leitores de tela ("verificar este lançamento").
- O contraste do texto sobre os fundos é de pelo menos 4,5:1 nos dois modos. As cores de pessoa claras (ex.: âmbar) usam o texto escurecido na etiqueta do modo claro, se necessário. [NOTE FOR UX: validar contraste das 8 cores de pessoa]
- O app respeita o tamanho de texto do sistema até 130% sem quebrar a grade. Acima disso, a grade esconde colunas secundárias.
- O VoiceOver lê cada linha da grade como "Nome, Valor, Parcela, Responsável, Status", e a barra de seleção é anunciada ao mudar.

## Responsive & Platform

| Largura | Layout |
|---|---|
| **iPad deitado (1194 pt)**: referência | Menu lateral + cartão da fatura (40%) e Blocos em 2 × 3 (60%) lado a lado + grade |
| **iPad em pé (834 pt)** | Menu lateral + cartão da fatura em largura total + Blocos em 3 colunas + grade sem as colunas Tipo e Lançado por. O painel do Lançamento ocupa 100% da altura e 70% da largura. |
| **PC (≥ 1280 px)** | O mesmo layout do iPad deitado, com a grade ganhando as colunas data e cartão. O painel lateral não esconde a grade. |
| **Celular (< 700 px)** | Fora da v1. Mostra "O Conta Comigo foi feito para iPad e computador" e um resumo dos Blocos, só para leitura. [ASSUMPTION] |

## Inspiration & Anti-patterns

- **Inspiração: Listonic.** Ações de um toque, listas agrupadas e nada escondido. Aplicado na fila de Revisar e na seleção da grade.
- **Inspiração: a planilha "Cartão".** As mesmas colunas, na mesma ordem, e os mesmos totais. Rafael precisa reconhecer a planilha dele no app.
- **Evitar:**
  - pintar linhas com a cor da pessoa (decisão do Rafael);
  - Fórmula digitada como texto;
  - números escondidos atrás de gráficos;
  - confirmações em excesso para ações reversíveis;
  - gestos de deslizar como única forma de agir.

## Key Flows

### Flow 1: Fechar novembro (Rafael, iPad no sofá, 05/11/26 à noite)
1. O e-mail do Santander chega com o PDF. Rafael salva em Arquivos e abre o Conta Comigo, que mostra o **Painel** de novembro com o cartão "Fatura ainda não importada" e os previstos.
2. Toca em **Importar fatura**, escolhe o PDF e digita a senha. O app mostra "Fatura de novembro · vence 06/11/26" e ele confirma.
3. As etapas passam ("Lendo lançamentos… Conferindo… Classificando"), e o resumo mostra **"✓ Conferido · 47 lançamentos · 30 classificados · 17 para revisar"**.
4. Toca em **Ir para revisão**. Aceita com "✓" as sugestões certas, seleciona as três compras da Shopee que são do Casal e aplica de uma vez. Muda o estorno de uma compra da Mãe para Mãe. A fila chega a **"Tudo revisado"**.
5. Volta ao Painel. A barra de distribuição e os Blocos estão atualizados. Toca no Bloco **Mãe**, e a grade mostra só os Lançamentos dela, com as etiquetas âmbar.
6. Toca na caixa do cabeçalho ("selecionar todos"), e a barra mostra **"23 selecionados · R$ 1.350,14"**, igual ao Bloco.
7. **Clímax:** toca em **Gerar mensagem**, vê o texto exatamente como ele mandaria, toca em **Copiar** e cola no WhatsApp da mãe. Depois, toca em **Mensagem** no Bloco "Rangel" (Rangel + Casal ÷ 2), copia e manda para o Rangel.

### Flow 2: Registrar os Pix (Rafael, iPad, 08/11/26)
1. A mãe manda o Pix de R$ 1.350,14. No Painel, Rafael toca no Bloco Mãe, seleciona todos e confere que a barra mostra o mesmo valor.
2. Toca em **Aplicar status**, escolhe "Pago" e mantém a data de hoje e o valor da Seleção.
3. **Clímax:** os selos viram "Pago", verdes, e o aviso "23 lançamentos marcados como pagos · Desfazer" aparece embaixo.
4. O Lucas paga R$ 100. Rafael filtra por Lucas, seleciona tudo e aplica "Pago" com valor recebido de R$ 100. O app avisa "Faltam R$ 115,16. Esse valor fica pendente" e ele confirma.
5. Em 17/11/26, em **Recebimentos**, o que o Rangel não pagou aparece como "Atrasado".

### Flow 3: Montar o Bloco do Rangel (Rafael, PC, configuração inicial)
1. No Painel, toca em **＋ Bloco** e digita o nome "Rangel".
2. Toca nas fichas **Rangel**, **+**, **(**, **Casal**, **÷**, **Número → 2** e **)**.
3. **Clímax:** a Fórmula aparece legível, como "Rangel + (Casal ÷ 2)", e o resultado ao vivo é **R$ 2.819,68**, com o cálculo passo a passo: "Rangel R$ 0,00 + Casal R$ 5.639,35 ÷ 2 = R$ 2.819,68".
4. Toca em **Salvar**, e o Bloco aparece no cartão dos Blocos.

### Flow 4: Reimportar por engano (Rafael, iPad)
1. Rafael sobe de novo a fatura de outubro. O app lê "vence 06/10/26" e avisa que ela já foi importada, mostrando quantos Lançamentos serão apagados e quantos já estão pagos.
2. Ele percebe o engano e toca em **Cancelar**. Nada muda.

## Mockups

As telas de referência ilustram estes documentos, no tamanho real do iPad Pro 11" deitado. Em caso de conflito, valem `DESIGN.md` e `EXPERIENCE.md`.

| Tela | Mock | Ilustra |
|---|---|---|
| Painel do Mês (claro e escuro) | [painel.html](mockups/painel.html) | Bloco, Grade, Barra de Seleção, Conferido, Verificar · Flow 1, passos 5 e 6 |
| Gerar mensagem pelo Bloco | [gerar-mensagem.html](mockups/gerar-mensagem.html) | Gerar mensagem (FR-53) · Flow 1, passo 7 |
| Montador de Bloco | [montador-bloco.html](mockups/montador-bloco.html) | Montador de Bloco, cálculo (FR-54) · Flow 3 |
| Revisar | [revisar.html](mockups/revisar.html) | Fila de Revisar · Flow 1, passo 4 |
| Importar fatura (conferência) | [importar.html](mockups/importar.html) | Importar fatura, Mês sem Fatura · Flow 1, passos 2 e 3 |
| Recebimentos | [recebimentos.html](mockups/recebimentos.html) | Saldo pendente, A receber, histórico · Flow 2 |

**Sem mock (só pelos documentos):** Painel do Lançamento, Aplicar status, Previsão, Contas manuais, Configurações e Primeiro uso. [ASSUMPTION: confirmar com Rafael se algum precisa de referência visual]
