---
title: "EXPERIENCE: Conta Comigo"
status: final
created: 2026-11-01
updated: 2026-11-01
sources:
  - ../../prds/prd-conta-comigo-2026-11-01/prd.md
  - ../../briefs/brief-conta-comigo-2026-11-01/brief.md
---

# Conta Comigo: Experiência

Este documento define **como o app funciona**: telas, navegação, comportamento, estados e fluxos. O visual está no `DESIGN.md`, com tokens citados como `{colors.accent}`, `{components.selection-bar}` etc. Os requisitos são os do PRD (FR-n), e os termos seguem o Glossário do PRD (Lançamento, Nome, Apelido, Tipo, Responsável, Lançado por, Status, Bloco, Fórmula, Seleção, Dívida programada, Saldo pendente…). **Quando um mock contradiz este documento ou o `DESIGN.md`, valem os documentos.**

## Foundation

- **Forma:** web app instalável (PWA), com uma interface responsiva.
- **Aparelhos da v1:** **iPad Pro 11" (M4) deitado**, que é a tela principal e a referência de tamanhos, e **PC no navegador**. O iPhone fica fora da v1 (PRD §5). Ver "Responsive & Platform".
- **Entrada:** no iPad, **dedo** (principal) e **Apple Pencil**, tratada como o dedo, sem trackpad nem teclado. No PC, mouse e teclado.
- **Modos:** claro e escuro, seguindo o sistema, com opção de fixar um deles em Configurações.
- **Usuário:** só o Rafael, com login (FR-34). Não há telas para as pessoas cobradas.
- **Sem internet:** o app só mostra o que já estava carregado, para consulta. Nenhuma alteração é possível sem conexão: qualquer ação que precise gravar ou buscar dados avisa "Sem conexão. Tente de novo quando a internet voltar" (decisão do Rafael na arquitetura).
- **Biblioteca de componentes:** a ser definida na arquitetura. Estes documentos não dependem dela. [ASSUMPTION]

## Information Architecture

O menu lateral (`{components.nav-rail}`) tem, nesta ordem:

| Tela (rótulo no menu) | Como chegar | Para que serve | FRs |
|---|---|---|---|
| **Painel** ("Painel") | Abrir o app · menu | Mês selecionado: cartão da fatura, Blocos, barra de filtros, grade, Seleção e mensagem | FR-19 a FR-24, FR-48, FR-53, FR-54 |
| **Revisar** ("Revisar", com contador) | Menu · resumo da importação | Fila do que é novo ou está em dúvida no último Mês importado | FR-9, FR-13 a FR-15, FR-45, FR-47 |
| **Recebimentos** ("Receber") | Menu | Quem deve o quê, de todos os Meses: cartões por Bloco de cobrança, "A receber", histórico de Pagamentos, Meses anteriores da Fatura | FR-25 a FR-30, FR-49 |
| **Previsão** ("Previsão") | Menu | Três abas: **Próximos meses** (FR-32), **Evolução** (FR-33) e **Meu gasto por Tipo** (FR-31) | FR-31 a FR-33 |
| **Contas manuais** ("Contas") | Menu | Lista, cadastro e edição das Contas manuais | FR-16 a FR-18 |
| **Avisos** ("Avisos", com contador de não lidos) | Menu · notificação do sistema | A Central de Avisos (FR-55): os avisos do dia, não lidos primeiro, cada um com o texto, para onde leva e "Novo" ou "Lido"; "Marcar como lido" por linha e "Marcar tudo como lido". O "lido" vale em todos os aparelhos. São quatro tipos, nesta ordem: a **diferença da Conferência** de uma Fatura ("Fatura de novembro/26 com diferença. A soma dos lançamentos ficou R$ 720,00 abaixo do total da fatura.", abre o Painel do Mês), a **fila do Revisar** ("17 lançamentos para revisar", abre o Revisar), o **fechamento** da fatura e cada **Bloco com itens atrasados**. Os dois primeiros existem só dentro do app (sem notificação do sistema). A linha da Conferência tem, ao lado de "Marcar como lido", o botão **"Dispensar"** (o mesmo da faixa do Painel, com o toast "Alerta dispensado · Desfazer"; também na linha já lida): a linha some e o foco vai para a linha seguinte. No iPad em pé os botões descem para a linha de baixo em vez de espremer o texto | FR-55 |
| **Configurações** ("Config.") | Menu (último) | Responsáveis e cores, Tipos, Status, Regras aprendidas, Blocos de cobrança e "meu Bloco", modelo da mensagem, Ciclo do cartão, Conferência e atraso, Aparência, Importar planilha, Sair | FR-1, FR-2, FR-12, FR-23, FR-31, FR-36, FR-47, FR-49, FR-50 |
| **Entrar** | Abrir o app sem sessão | Login (FR-34) | FR-34 |

**Sobreposições** (abrem por cima, sem trocar de tela):

| Sobreposição | Abre a partir de | Forma |
|---|---|---|
| **Importar fatura** | "＋ Importar fatura" no topo do Painel | Janela em 3 passos |
| **Lançamento** | Toque no corpo de uma linha (Painel, Recebimentos) | Painel lateral à direita. A grade continua visível. "Editar na grade" (FR-21) acontece neste painel, e não na célula. |
| **Novo lançamento** | "＋ Lançamento" no topo do Painel | O mesmo painel lateral, vazio (Lançado por = Manual) |
| **Dividir lançamento** | "Dividir" no painel do Lançamento | Janela |
| **Montador de Bloco** | "＋ Novo bloco" · "⋯ → Editar fórmula" · "⋯ → Ver cálculo" (só leitura) | Janela |
| **Gerar mensagem** | "Gerar mensagem" na barra de Seleção · 💬 num Bloco · "Cobrar pendências" em Recebimentos | Janela |
| **Aplicar status** | "Aplicar status" na barra de Seleção | Janela pequena |
| **Programar dívida** | "⋯ Mais → Programar dívida" na barra de Seleção · campo no painel do Lançamento | Janela pequena |
| **Primeiro uso** | Primeira abertura, depois de Entrar | Passo a passo em tela cheia |

**Seletor de Mês:** existe **só no Painel** (e no Revisar, apenas para mostrar o mês da fila). Recebimentos sempre soma todos os Meses, e a Previsão tem as próprias abas. Ao abrir o app, aparece sempre o Mês atual. Os rótulos de mês seguem o formato "Out/26" (curto) ou "outubro/26" (longo).

## Voice and Tone

- Português do Brasil, direto e curto, sem jargão. É o Rafael falando com ele mesmo.
- **Formatos fixos (PRD §6):** datas DD/MM/AA, horas HH:MM, valores "R$ 1.140,74" e negativos "- R$ 0,08". Meses: "Out/26" ou "outubro/26".
- **Os termos são os do Glossário:** "Lançamento", "Responsável", "Tipo", "Status", "Bloco", "Ajuste" (só o crédito de centavos). Nunca "transação", "categoria" ou "cliente". A tela de configurações se chama **Configurações**, e nunca "Ajustes".
- **Botões** dizem o que fazem: "Importar fatura", "Gerar mensagem", "Aplicar status", "Copiar", "Dividir", "Programar dívida".
- **Perguntas** sempre com as mesmas duas respostas: "Só este" e "Aplicar a todos".
- **Avisos** dizem o que aconteceu e o que fazer. Exemplos:
  - "A soma dos lançamentos ficou R$ 80,00 abaixo do total da fatura. A diferença está no cartão final 8673."
  - "Esta fatura já foi importada. Importar de novo apaga os 49 lançamentos de outubro vindos da fatura (3 já estão pagos) e importa tudo de novo."
  - "Este PDF não parece ser uma fatura do Santander. Confira o arquivo."
- **Confirmações** são curtas: "Copiado", "3 lançamentos marcados como pagos".

## Formato da mensagem (FR-23, FR-24, FR-53)

O modelo (FR-23) tem saudação, frase do total, chave Pix, título "Detalhes:" e a linha de detalhe, cujos campos Rafael escolhe. **Regras de inclusão, iguais para as duas formas:**
- Entram só Lançamentos **do Mês** da mensagem que **não estão pagos**: "Não pago", "Atrasado" e, no caso de "Pago parcialmente", só o valor que falta.
- **Não entram:** Lançamentos de R$ 0,00, Dívidas programadas ainda não vencidas e Lançamentos previstos (a não ser que, num Mês sem Fatura, Rafael ligue "Incluir previstos").
- **Estornos** entram como linha negativa ("- R$ 25,90") e reduzem o total.
- Um **Ajuste** (FR-47) entra numa linha própria, logo abaixo da parcela, começando com "↳ Ajuste".
- Os itens que ficaram de fora são avisados na janela, e **não** na mensagem: "2 itens não entram: 1 já pago, 1 de R$ 0,00".

**Forma 1, a partir de uma Seleção:**
```
Oi
Esse mês deu R$ 1.350,14
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Celular da mãe | 05/10 | R$ 577,50
Monjaro | 03/03 | R$ 310,67
...
Total: R$ 1.350,14
```

**Forma 2, a partir de um Bloco.** Cada operando da Fórmula vira um grupo, com o subtotal e a operação aplicada:
```
Oi
Esse mês deu R$ 2.819,68
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Rangel: R$ 0,00
Casal: R$ 5.639,35 ÷ 2 = R$ 2.819,68
  BELLA PIETRA ROCHAS E | 03/04 | R$ 800,00
  Lava e seca | 05/10 | R$ 445,89
  ...
Total: R$ 2.819,68
```
- Um operando somado vira um grupo "Nome: R$ X".
- Um operando com ÷ ou × mostra "R$ X ÷ 2 = R$ Y".
- Um operando subtraído vira um grupo "Menos Nome: - R$ X".
- Um número solto na Fórmula aparece como uma linha "Valor fixo: R$ X".
- O total é a Fórmula aplicada aos itens que entram, com arredondamento só no final (FR-54). Se esse valor for diferente do valor do Bloco no Painel, porque parte já foi paga, a janela avisa: "R$ 670,00 já foram pagos e não entram".

**Forma 3, Cobrar pendências (FR-28):** usa o mesmo modelo, mas a frase do total vira "Em aberto: R$ X", e os detalhes são agrupados por Mês ("Outubro/26", "Setembro/26").

## Component Patterns

### Painel

| Componente | Comportamento |
|---|---|
| **Seletor de Mês** | As setas trocam o Mês. Tocar no nome abre a lista de meses, com os futuros marcados como "Previsto". Trocar de Mês mantém os filtros e limpa a Seleção, com o aviso "Seleção limpa ao trocar de mês". |
| **Cartão da fatura** | Mostra o total a pagar do Mês e, embaixo, "Recebido no mês" (Pagamentos registrados com data no Mês) e "Falta receber" (quanto falta receber das linhas distintas em aberto no Mês que algum Bloco de cobrança cita: cada linha entra uma vez, na Fórmula do primeiro Bloco que a cita; se um Bloco não calcula, o texto "1 Bloco não entrou na soma" aparece embaixo). Tocar em "Falta receber" abre Recebimentos. Tocar em "⚠ Diferença" aplica o filtro "Verificar". Num Mês sem Fatura, mostra "Fatura ainda não importada", o total dos previstos e "Importar fatura". |
| **Barra de distribuição** | Segmentos proporcionais à soma de cada Responsável no Mês. Tocar num segmento filtra a grade por aquele Responsável. |
| **Cartão dos Blocos** | Cada cartão de Bloco **de cobrança** diz, embaixo do valor do Mês, quanto **falta receber** dele naquele Mês ("Falta R$ 120,00" ou "Nada a receber"): o mesmo número de Recebimentos, então marcar um Pagamento lá muda aqui. O cabeçalho tem "＋ Novo bloco" (abre o Montador) e "Reordenar". Em "Reordenar", os Blocos tremem de leve e podem ser arrastados, e o botão vira "Concluir". |
| **Bloco** | **Toque**: filtra a grade pelos Lançamentos que entram na Fórmula, aparece a pílula "Bloco: Nome ✕" na barra de filtros e a borda fica em destaque. **Toque de novo**: desfaz. Só um Bloco filtra por vez, e ele se soma aos filtros de coluna. **💬**: Gerar mensagem, forma 2. **⋯** (ou toque longo): Editar fórmula, Ver cálculo (abre o Montador só para leitura, com o passo a passo), Gerar mensagem, Reordenar e **Excluir bloco** (com confirmação; Blocos de cobrança avisam "Este Bloco aparece em Recebimentos"). |
| **Barra de filtros** | É o jeito principal de filtrar. **Busca** por Nome ou Apelido, só no Mês aberto, que filtra enquanto Rafael digita. A busca em todos os Meses fica para uma melhoria futura. **Filtros por coluna:** Responsável, Tipo, Status, Lançado por, Parcela (à vista, parcelado, última parcela) e cartão, cada um abrindo um popover com caixas para escolher vários valores (com a contagem de cada um), "Limpar" e "Aplicar". **"Verificar"** liga e desliga. Os filtros se combinam: E entre colunas, OU dentro da mesma coluna. **"Limpar filtros"** zera tudo, inclusive o filtro do Bloco. |
| **Grade** | Colunas da planilha. **A ordem padrão é a da fatura** (a mesma do PDF e da planilha), com as Contas manuais no fim. Tocar num cabeçalho ordena por aquela coluna, tocar de novo inverte, e "Limpar filtros" volta à ordem da fatura. A grade rola por dentro do cartão, com o cabeçalho fixo. Quando falta largura, ela **rola para os lados**, com a caixa e o Nome fixos. **Toque na caixa**: seleciona. **Toque no resto da linha**: abre o painel do Lançamento. **Toque longo** ou **⋯** no fim da linha: Abrir, Dividir, Programar dívida, Excluir. Linhas divididas aparecem com "↳", e o Ajuste aparece recuado sob a parcela. |
| **Despesa dividida (Bombinhas)** | O cabeçalho da mãe não tem Status (valem as partes). Quando alguma parte já foi paga (no Painel ou por um Pagamento de Recebimentos), a coluna Status do cabeçalho diz "1 de 2 pagas" ou "Todas pagas". |
| **Caixa do cabeçalho** | Seleciona **todos os Lançamentos do filtro atual**, inclusive os que não estão visíveis. Tocar de novo desmarca todos. |
| **Barra de Seleção** | Aparece com 1 item ou mais e mostra "N selecionados · R$ total", **atualizado a cada toque** (FR-48). Ações: "Limpar", "Aplicar status", "⋯ Mais" (Programar dívida, Classificar em lote, Excluir) e "Gerar mensagem". A Seleção é **sempre de um único Mês**. |
| **"＋ Lançamento"** | Abre o painel do Lançamento vazio, para incluir um Lançamento à mão no Mês aberto (Lançado por = Manual, FR-7). Nome e Valor são obrigatórios. |

### Lançamento

| Componente | Comportamento |
|---|---|
| **Painel do Lançamento** | **Editáveis:** Apelido, Tipo, Responsável, Status, Observação, Dívida programada (liga ou desliga + data) e, para corrigir a extração (FR-7), **Valor e data**. Ao mudar o Valor de um Lançamento da Fatura, a Conferência é recalculada e o painel mostra "Conferência: ✓" ou "diferença de R$ X". **Somente leitura:** Nome (nunca muda, é usado para reconhecer o Lançamento), Parcela, cartão, Lançado por e origem ("criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26"). Cada campo é salvo ao sair dele, com o indicador "Salvando… / Salvo às 21:14 / Não salvo, tentando de novo". As perguntas do PRD aparecem numa **faixa de pergunta** com "Só este" e "Aplicar a todos": mesmo Apelido para o mesmo Nome (FR-52), mudança nas parcelas previstas (FR-44). Ações no rodapé: "Dividir" e "Excluir". |
| **Dividir lançamento** | A janela mostra o Lançamento e o seletor "Por valor / Por proporção". Rafael adiciona linhas (Responsável + valor ou fração) com "＋ Parte". Cada linha tem o próprio Status (padrão: o do original). O rodapé mostra "Soma das partes: R$ 466,00 de R$ 466,00 ✓" e só libera "Dividir" quando a soma bate. Em proporção, os centavos que sobram vão para a última parte (ex.: R$ 466,00 em 2/3 + 1/3 = R$ 310,67 + R$ 155,33). Num Lançamento já dividido, a janela abre em modo de edição com "Desfazer divisão". Se a Divisão veio de uma Regra, a janela mostra "Divisão aplicada pela Regra de JIM COM 57653822 BAR". |
| **Excluir (FR-46)** | Sempre pede confirmação. Num parcelado, pergunta "Excluir também as N parcelas previstas dos próximos meses?". Se houver Pagamento, avisa "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente da Mãe muda de R$ 0,00 para - R$ 310,67". Depois de excluir, aparece o aviso "Excluído · Desfazer". |
| **Programar dívida** | Data combinada (obrigatória) e uma observação opcional. Funciona para **qualquer** Lançamento ou parte dele, da Fatura ou manual (FR-27). Os Lançamentos programados levam o selo "Programada · 06/04/27" e saem da mensagem do Mês até vencer. |

### Bloco, mensagem e status

| Componente | Comportamento |
|---|---|
| **Montador de Bloco** | **Nome:** campo de texto. **Fórmula:** fichas montadas com toques, sem digitação. **Paleta:** Responsáveis (com a bolinha), Tipos, "Responsável em Tipo" (abre dois seletores, ex.: Rafael + Bobiças), "Todos", "Número…" (teclado numérico), + − × ÷ e parênteses. Tocar numa ficha da Fórmula a remove. O **resultado** e o **passo a passo** aparecem ao vivo. "Salvar" fica desativado enquanto a Fórmula for inválida, com a razão numa linha ("Falta fechar um parêntese", "Divisão por zero", "A fórmula termina com uma operação"). Opções: "Usar em Recebimentos" (Bloco de cobrança) e "É o meu Bloco" (usado em Meu gasto por Tipo, FR-31). |
| **Gerar mensagem** | Mostra a mensagem num quadro de leitura (`{typography.message}`), conforme "Formato da mensagem". Mostra também o aviso de itens que ficaram de fora, o interruptor "Incluir previstos" (só num Mês sem Fatura) e os botões "Copiar" (principal, fecha a janela e mostra "Copiado"), "Editar modelo" e "Fechar". Se nada entrar, aparece "Nada a cobrar nesta seleção", e "Copiar" fica desativado. Se a cópia falhar, aparece "Não foi possível copiar. Selecione o texto e copie manualmente", e o texto fica selecionável. |
| **Aplicar status** | Lista dos Status. Se o escolhido conta como pago, aparecem a **Data** (padrão: hoje) e o **Valor recebido** (padrão: total da Seleção). Se o valor for menor, aparece a pergunta **"O que fazer com a diferença de R$ X?"**: "Fica pendente" (os itens são quitados dos mais antigos para os mais novos, e o último fica "Pago parcialmente") ou "Não é dívida, é a minha parte" (tudo fica pago, e o Pagamento registra o valor recebido). Um valor maior que o total não é aceito ("O valor recebido não pode passar de R$ X"). Se o Status escolhido não conta como pago, data e valor somem. Depois de aplicar, aparece o aviso "N lançamentos marcados como pagos · Desfazer". |

### Importação e revisão

| Componente | Comportamento |
|---|---|
| **Importar fatura** | **Passo 1:** escolher o PDF (Arquivos do iPad ou do computador). **Passo 2:** digitar a senha. **Passo 3:** conferir o vencimento e o Mês lidos e ver o resumo: Conferência ("✓ Conferido" ou "⚠ Diferença de R$ X no cartão final 8673"), quantos foram classificados, quantos previstos casaram e quantos vão para Revisar. Botões: "Ir para revisão" (principal) e "Ver no Painel". "Cancelar" funciona em qualquer passo e não grava nada. |
| **Fila de Revisar** | Agrupada por Nome. Uma faixa no topo resume a importação, e o contador "Faltam N" fica ao lado do título. **Variantes:** (a) **sugestão** ("Sugestão: Casal · Casa"; se há dúvida, "Casal · Saúde (às vezes Rafael)"), com ✓ e "Mudar"; (b) **sem sugestão**, só "Mudar"; (c) **valor mudou** (previsto casou com outro valor, FR-45), com "Antes R$ 445,89 → agora R$ 449,10" e ✓ "Manter classificação"; (d) **não veio na fatura** (previsto sem par), com "Remover previsto" e "Manter"; (e) **Ajuste** reconhecido (FR-47), com ✓ e "Desvincular". "Mudar" (numa mãe dividida que voltou à fila, não há seletor de Responsável: o texto diz que o Responsável está nas partes e manda usar "Editar divisão" no Painel; só o Tipo se escolhe) abre os seletores de Responsável e Tipo, com os mais usados primeiro. É possível selecionar vários itens e usar "Aplicar sugestões", "Responsável…" ou "Tipo…" de uma vez. |

### Recebimentos

| Componente | Comportamento |
|---|---|
| **Cartões por Bloco de cobrança** | Um cartão por Bloco marcado "Usar em Recebimentos" (ex.: Mãe, Lucas, Rangel). Na lista "Ver" de um Bloco cuja Fórmula não é soma simples (o Rangel: Casal ÷ 2), cada linha mostra o valor cheio E, embaixo, "parte do Rangel: R$ 50,00"; as partes somam o Saldo do cartão. O **Saldo pendente** é a Fórmula do Bloco aplicada aos Lançamentos não pagos de **todos os Meses** (FR-26), então o Rangel aparece com a metade do Casal. O selo de situação é "Em dia", "Não pago" ou "Atrasado" (se algum item passou do vencimento + tolerância). A linha de detalhe mostra os meses em aberto. **"Ver"** abre a lista dos Lançamentos em aberto, agrupados por Mês, com seleção e a mesma barra de Seleção do Painel. **"Cobrar pendências"** abre Gerar mensagem, forma 3. |
| **A receber** | Lista das Dividas programadas (Nome ou Apelido, Responsável, vencimento, valor), ordenada por data. As vencidas aparecem com o selo "Atrasado". Tocar abre o painel do Lançamento. |
| **Histórico de Pagamentos** | Lista com data, Responsável, quantidade de Lançamentos, valor recebido e o tipo ("parcial", "minha parte"). Tocar abre o detalhe do Pagamento (os Lançamentos que ele quitou) e o botão **"Desfazer pagamento"**, com confirmação. É o caminho para desfazer depois que o aviso some (FR-25). |
| **Meses anteriores da Fatura** | Tabela por Mês com saldo anterior, pagamento da fatura, resíduo que passou para o mês seguinte (ex.: R$ 25,90) e o selo de Conferência (FR-30). |

### Previsão

| Componente | Comportamento |
|---|---|
| **Abas** | "Próximos meses", "Evolução" e "Meu gasto por Tipo". A aba escolhida fica guardada. |
| **Próximos meses** (FR-32) | Barras empilhadas por Responsável dos 6 Meses seguintes, mais uma tabela Responsável × Mês. O seletor "Por Responsável / Por Tipo" muda o agrupamento. Tocar num mês abre o Painel daquele mês, com os previstos. |
| **Evolução** (FR-33) | Barras empilhadas dos **últimos 6 Meses** (com Fatura importada), por Responsável ou por Tipo. Com menos de 6 Meses, mostra os que existem. |
| **Meu gasto por Tipo** (FR-31) | Para o Mês escolhido (seletor próprio), aplica o "meu Bloco" (Configurações, ex.: Rafael + (Casal ÷ 2)) e mostra a soma por Tipo em barras horizontais, do maior para o menor, com o valor e a % do total. Tocar num Tipo abre o Painel filtrado por Tipo. Sem "meu Bloco" definido, a aba mostra "Escolha qual Bloco representa o seu gasto", com um atalho para Configurações. |

### Contas manuais

| Componente | Comportamento |
|---|---|
| **Lista** | Colunas: Conta (com a descrição da repetição), Valor por mês, Responsável ou Divisão (etiquetas), Tipo e situação (Ativa ou Encerrada). Os filtros são "Ativas / Encerradas / Todas". O ⋯ de cada linha tem Editar, Encerrar e Excluir. |
| **Formulário** | Campos: Nome, Valor (por parcela ou mês), Repetição (Mensal até encerrar · N parcelas), Parcelas, "Começa em" (Mês), Tipo, Observação e Divisão (linhas Responsável + valor, com "＋ Parte"). Cada parte pode ser "Mensal" ou "Dívida programada" com data. Ao editar, aparece o aviso "Vale a partir de Nov/26. Os meses anteriores não mudam" (FR-18). Numa Conta nova, se algum Mês a partir do "Começa em" já tem histórico da planilha, o formulário diz em quais ("Estes meses já têm histórico da planilha: Jan/26 (12 lançamentos), Fev/26 (14 lançamentos). A conta entra por cima e o total desses meses conta em dobro…") e o botão passa a "Salvar mesmo assim"; nada é apagado sozinho. "Encerrar" pergunta "A partir de qual mês?". |

### Configurações

| Componente | Comportamento |
|---|---|
| **Seções** | Lista à esquerda: Responsáveis, Tipos, Status, Regras aprendidas, Blocos de cobrança, Modelo da mensagem, Ciclo do cartão, Conferência e atraso, Aparência, Importar planilha e Sair. O conteúdo da seção aparece à direita. |
| **Responsáveis** | Nome e cor (as 8 cores do `DESIGN.md`, sem repetir). Em uso, só pode ser renomeado ou arquivado. Para excluir, é preciso escolher um substituto (FR-46). |
| **Tipos** | Lista simples, com renomear, arquivar e excluir com substituto. |
| **Status** | Nome, a chave "conta como pago" e a contagem de uso. Para excluir um Status em uso, é preciso escolher um substituto, e o app avisa quantos Lançamentos mudam (FR-50). |
| **Regras aprendidas** | Lista com Nome normalizado → Responsável, Tipo, Divisão e última vez usada, com busca. Editar uma Regra pergunta "Reaplicar aos lançamentos de Out/26?" (FR-12). Excluir pede confirmação. |
| **Blocos de cobrança** | Liga ou desliga "Usar em Recebimentos" em cada Bloco e escolhe o "meu Bloco". |
| **Modelo da mensagem** | Campos: saudação, frase do total (com o marcador {total}), chave Pix e rodapé. Os campos da linha de detalhe (Nome ou Apelido, Parcela, Valor) são escolhidos com caixas. Uma prévia ao vivo usa os dados do Mês atual. |
| **Ciclo do cartão** | Dia de fechamento e dia de vencimento, com a nota "O fechamento só define em que mês entram as contas lançadas à mão" (FR-36). A mudança vale a partir do próximo Ciclo. |
| **Conferência e atraso** | Limite do Ajuste (padrão: R$ 1,00) e tolerância de atraso (padrão: 10 dias). |
| **Importar planilha** (FR-2) | Escolher a planilha e as abas (marcadas por padrão de 01/2026 a 10/2026), com barra de progresso. O resumo mostra "N lançamentos, N Responsáveis, N Tipos, N Regras criadas" e leva para "Regras aprendidas" filtrada por "criadas agora". |
| **Sair** | Encerra a sessão neste aparelho. |

### Comuns

| Componente | Comportamento |
|---|---|
| **Lembretes** (FR-55) | A **Central de Avisos** (item "Avisos" do menu, com o contador de não lidos) e as notificações do sistema (iPad e PC, com o app instalado e a permissão dada): **no dia do fechamento** ("A fatura de novembro fechou. Importe o PDF quando chegar") e **quando um Bloco de cobrança passa a ter itens atrasados** ("Mãe: R$ 1.783,73 em atraso desde 17/10/26", o nome do Bloco sem artigo). Não há mais faixa no topo das telas. Se o navegador perder a inscrição de notificações deste aparelho, o app a refaz sozinho ao abrir (só com a permissão já dada e se o Rafael não tinha tocado em "Desativar neste aparelho") e diz "Notificações reativadas neste aparelho."; nunca pede a permissão de novo. Na Central, **todos** os avisos do dia aparecem (sem limite), os não lidos primeiro (dentro do grupo: a diferença da Conferência, a fila do Revisar, o fechamento e os Blocos atrasados); tocar na linha abre o Painel ou Recebimentos e marca como lido; "Marcar como lido" marca sem sair; "Marcar tudo como lido" marca todos de uma vez. O "lido" vale em todos os aparelhos. Um atraso que continua e já foi lido fica lido; um atraso novo, ou um "desde" que mudou, volta como não lido. Em Configurações → Aparência, no grupo **"Avisos"**, há um interruptor por tipo, todos ligados por padrão: "No dia do fechamento da fatura", "Quando um Bloco tem itens atrasados", "Quando a Conferência de uma fatura tem diferença" e "Quando há lançamentos para revisar". Desligado, o aviso não aparece na Central, não conta no menu e não entra em "Marcar tudo como lido"; só os dois lembretes também deixam de chegar como notificação (a Conferência e o Revisar nunca notificam). Religar traz o aviso de volta com o estado de antes (o lido continua lido). O contador "para revisar" do item Revisar do menu não depende do interruptor (é a fila de trabalho). A diferença da Conferência some quando a Fatura bate ou quando a faixa do Painel é dispensada, pelo Painel ou pela Central (é a mesma gravação; a reimportação a traz de volta), e a fila do Revisar some quando zera. Um aviso lido da Conferência volta como não lido quando a diferença muda; o da fila volta quando uma Fatura é importada ou reimportada em outro dia (classificar itens não o traz de volta). |
| **Menu lateral** | O item ativo fica destacado. O contador do Revisar mostra os itens pendentes da fila e some quando ela zera. No PC, há atalhos ⌘/Ctrl + 1…7. O contador de Avisos mostra os avisos não lidos dos quatro tipos ("99+" acima de 99), em texto, e some quando zera ou enquanto os dados carregam; ele convive com o contador do Revisar (que continua sendo a fila de trabalho: "tem coisa para revisar" na Central é só o aviso). |
| **Etiqueta de pessoa** | Tocar filtra a grade pelo Responsável (atalho). |
| **Aviso inferior** | Aparece por 6 segundos, e um novo aviso substitui o anterior. "Desfazer" reverte a última ação. |
| **Entrar** | Campos de e-mail e senha (ou o método que a arquitetura definir), "Entrar" e "Esqueci a senha". Depois do primeiro login, abre o Primeiro uso. [ASSUMPTION: método de login definido na arquitetura] |

## State Patterns

| Estado | Onde | Como aparece |
|---|---|---|
| **Carregando** | Todas as telas | Esqueleto (`{components.skeleton}`) no lugar dos números, Blocos e linhas. Nunca uma tela branca. Recalcular os Blocos não mostra esqueleto: os números mudam no lugar. |
| **Erro ao carregar** | Todas as telas | "Não foi possível carregar. Tentar de novo". Se houver dados carregados antes, eles continuam visíveis com a faixa "Sem conexão". |
| **Sessão expirada** | App inteiro | Volta para Entrar com "Sua sessão expirou. Entre de novo". |
| **Primeiro uso** | App inteiro | Passo a passo: Responsáveis → Tipos → Status → Importar planilha (2026) → Blocos → Mensagem → Ciclo. Cada passo pode ser pulado. Depois, o Painel vazio mostra "Importe sua primeira fatura". |
| **Sem Blocos** | Painel | O cartão dos Blocos mostra "Crie seu primeiro Bloco para ver os totais por pessoa", com "＋ Novo bloco". |
| **Mês sem Fatura** | Painel | O cartão da fatura diz "Fatura ainda não importada". A grade mostra os previstos e as Contas manuais, e os Blocos somam os previstos com a legenda "inclui previstos". Em Gerar mensagem aparece "Incluir previstos". |
| **Mês fechado / aberto** (FR-36) | Painel | Um Mês com Fatura importada leva o selo "Fechado" ao lado do seletor e continua editável. Um Mês aberto não tem selo. |
| **Importando** | Janela Importar | Barra de progresso com etapas ("Abrindo PDF", "Lendo lançamentos", "Conferindo", "Classificando"). "Cancelar" interrompe sem gravar nada. |
| **Senha errada** | Janela Importar | Campo com borda `{colors.danger-fg}` e "Senha incorreta" embaixo. Dá para tentar de novo. |
| **Não é fatura Santander / layout desconhecido** | Janela Importar | "Este PDF não parece ser uma fatura do Santander. Confira o arquivo", com "Escolher outro PDF". Nada é gravado. |
| **Extração falhou ou ficou incompleta** | Janela Importar | "Não conseguimos ler todos os lançamentos (lemos 41). Você pode importar mesmo assim e corrigir à mão, ou cancelar". Se importar, a Conferência mostra a diferença, e as linhas suspeitas ficam com "verificar". |
| **Conexão perdida na importação** | Janela Importar | "A conexão caiu. Nada foi gravado. Tentar de novo". |
| **Mês com histórico da planilha** (Defeito 2) | Janela Importar, passo 3 | Quando o Mês ainda não tem Fatura mas já tem linhas vindas da planilha: "Este mês já tem 12 lançamentos do histórico da planilha. Se você importar a fatura agora, as linhas dela entram por cima e o total de março conta em dobro. Para evitar, cancele e apague o histórico desse mês em Configurações → Importar planilha → Apagar histórico importado. Nada é apagado sozinho." O botão passa a "Importar mesmo assim" (a confirmação). |
| **Mês já importado** | Janela Importar | Aviso de reimportação (FR-51) com o número de Lançamentos e quantos já estão pagos ou foram classificados à mão. Botões "Importar de novo" (destrutivo) e "Cancelar". |
| **Conferido / Diferença** | Cartão da fatura, passo 3 da importação, topo da grade | "✓ Conferido" em verde, ou faixa âmbar com a diferença e o cartão, com "Ver lançamentos" (aplica o filtro Verificar) e "Dispensar". Não bloqueia nada (FR-6). |
| **Verificar** | Grade | Bolinha `{colors.verify}` antes do Nome. Some sozinha quando a Conferência bate. |
| **Previsto** | Grade, Previsão | Selo "Previsto" junto do Nome, com o texto um pouco mais claro. |
| **Programada** | Grade, Recebimentos | Selo "Programada · 06/04/27". |
| **Não pago · Pago · Pago parcialmente · Atrasado** | Grade, Recebimentos | Selo de Status. "Pago parcialmente" mostra "falta R$ X" no painel do Lançamento. "Atrasado" é calculado (vencimento + tolerância, padrão 10 dias, FR-49) e substitui "Não pago". As linhas do histórico da planilha nunca ficam "Atrasado" e nunca entram no Saldo pendente nem em Recebimentos (são registro; o Status delas não vira cobrança). |
| **Salvando / Salvo / Não salvo** | Painel do Lançamento, formulários | Indicador discreto no topo do painel. Se a gravação falhar, o campo volta ao valor anterior e aparece "Não foi possível salvar. Tente de novo", com o botão "Tentar de novo". Nada fica pendente no aparelho. |
| **Conflito entre aparelhos** | Painel do Lançamento | Como só se grava com internet, a última gravação vale, e o outro aparelho recebe a mudança na hora. Se o Lançamento aberto mudar, aparece a faixa "Este lançamento foi alterado em outro aparelho às 21:30". |
| **Atualização vinda de outro aparelho** | Todas as telas | Os números mudam na hora, sem recarregar (FR-46). |
| **Sem conexão** | App inteiro | Faixa "Sem conexão. Você pode consultar, mas não alterar". Os botões que gravam continuam visíveis e, ao toque, mostram "Sem conexão. Tente de novo quando a internet voltar". A importação de fatura fica indisponível. |
| **Filtro sem resultado** | Grade | "Nenhum lançamento com esses filtros", com "Limpar filtros". |
| **Fila vazia** | Revisar | "Tudo revisado. Nada novo neste mês". O contador do menu some. |
| **Ninguém deve nada** | Recebimentos | Os cartões ficam com "Em dia", e as listas mostram "Nada em aberto" e "Nenhuma dívida programada". |
| **Sem Blocos de cobrança** | Recebimentos | "Marque em Configurações quais Blocos aparecem aqui", com atalho. |
| **Sem previstos / pouco histórico** | Previsão | "Nenhum lançamento previsto para os próximos meses" / "Evolução disponível a partir de 2 meses importados". |
| **Sem Contas manuais** | Contas manuais | "Nenhuma conta manual", com "＋ Nova conta". |
| **Sem Regras** | Configurações | "As Regras aparecem conforme você classifica os lançamentos". |
| **Importando planilha** | Configurações | Barra de progresso por aba. Em erro, mostra "Não foi possível ler a aba 03/2026" e segue com as outras. |

## Interaction Primitives

- **Toque** (dedo ou Pencil): a ação principal em tudo. Nenhuma ação depende só de um gesto escondido.
- **Toque longo** num Bloco ou numa linha abre o mesmo menu do **⋯**, que está sempre visível.
- **Arrastar** só existe no modo "Reordenar" dos Blocos.
- **Seleção múltipla:** pelas caixas, sem modo especial. "Selecionar todos" vale para o filtro atual.
- **Salvar:** campos salvam ao sair deles. Ações destrutivas (Excluir, Importar de novo, excluir algo em uso, Desfazer pagamento) pedem confirmação. As demais podem ser desfeitas com o aviso "Desfazer".
- **No PC:** Esc fecha sobreposições, Enter confirma, ⌘/Ctrl+A seleciona tudo do filtro, ⌘/Ctrl+1…7 navega pelo menu, e há anel de foco `{colors.focus-ring}` na navegação por teclado.

## Accessibility Floor

- A área de toque mínima é de 44 × 44 pt, inclusive nas caixas (desenho de 18 px), nos botões ⋯ e 💬 (26 px) e nos botões compactos (30 px).
- **A informação nunca depende só da cor:** a etiqueta tem o nome, o Status tem texto e a marca "verificar" tem o rótulo acessível "verificar este lançamento".
- O contraste de todo texto é de pelo menos 4,5:1 nos dois modos. As etiquetas de pessoa usam os pares `person-N-fg/bg` (6:1 ou mais), e o botão primário usa `{colors.accent}` (5:1). Bordas e ícones sem texto têm pelo menos 3:1.
- O app respeita o tamanho de texto do sistema até 130% sem quebrar a grade. Acima disso, a grade passa a rolar para os lados.
- **VoiceOver:**
  - cada linha da grade é lida como "Nome, Valor, Parcela, Responsável, Status";
  - o 💬 é lido como "Gerar mensagem do Bloco {nome}" e o ⋯ como "Ações do Bloco {nome}";
  - a barra de seleção anuncia o total quando muda.

## Responsive & Platform

| Largura | Layout |
|---|---|
| **iPad deitado (1194 pt)**, referência | Menu lateral, cartão da fatura (40%) e Blocos em linhas de 3 (60%) lado a lado, barra de filtros e grade. |
| **iPad em pé (834 pt)** | Menu lateral, cartão da fatura em largura total, Blocos em 3 colunas e grade com **rolagem lateral** (caixa e Nome fixos, nenhuma coluna escondida). A barra de filtros mostra busca, Responsável, Tipo, Status e "Mais ▾". O painel do Lançamento ocupa 70% da largura. |
| **PC (≥ 1280 px)** | Igual ao iPad deitado, com a grade mostrando todas as colunas sem rolar. O painel lateral não esconde a grade. |
| **Celular (< 700 px)** | Fora da v1. Mostra o aviso "O Conta Comigo foi feito para iPad e computador" e uma lista simples dos Blocos do Mês atual, só para leitura, com esqueleto enquanto carrega. Escopo aceito por Rafael. |

## Inspiration & Anti-patterns

- **Não existe exportação** (CSV ou planilha): decisão do Rafael. O app é o lugar do histórico.
- **Uma única Mensagem de cobrança padrão** para todas as pessoas: decisão do Rafael, sem saudação por pessoa.
- **Inspiração: Listonic.** Ações de um toque, listas agrupadas, nada escondido. Aplicado na fila de Revisar e na seleção da grade.
- **Inspiração: a planilha "Cartão".** As mesmas colunas, na mesma ordem, e os mesmos totais. Rafael tem que reconhecer a planilha dele no app.
- **Evitar:**
  - pintar linhas com a cor da pessoa (decisão do Rafael);
  - Fórmula digitada como texto;
  - números escondidos atrás de gráficos;
  - confirmações em excesso para ações reversíveis;
  - deslizar como única forma de agir;
  - perder uma mudança sem avisar.

## Key Flows

### Flow 1: Fechar novembro (Rafael, iPad no sofá, 05/11/26 à noite)
1. O e-mail do Santander chega com o PDF. Rafael salva em Arquivos e abre o Conta Comigo. O **Painel** de novembro mostra "Fatura ainda não importada" e os previstos.
2. Toca em **＋ Importar fatura**, escolhe o PDF e digita a senha. O app mostra "Fatura de novembro · vence 06/11/26", e ele confirma.
3. As etapas passam, e o resumo mostra **"✓ Conferido · 47 lançamentos · 30 classificados (26 previstos casados) · 17 para revisar"**.
4. Toca em **Ir para revisão**. Aceita com ✓ as sugestões certas, seleciona as três compras da Shopee que são do Casal e aplica de uma vez, e muda o estorno de uma compra da Mãe para Mãe.
5. Abre o "JIM COM" de R$ 466,00, toca em **Dividir** e reparte em 2/3 para a Mãe e 1/3 para ele (R$ 310,67 + R$ 155,33). A fila chega a **"Tudo revisado"**.
6. Volta ao Painel. Toca no Bloco **Mãe**, e a grade mostra só os Lançamentos dela. Toca em "selecionar todos", e a barra mostra **"7 selecionados · R$ 1.350,14"**, o mesmo valor do Bloco.
7. **Clímax:** toca em **Gerar mensagem**, vê o texto exatamente como mandaria, toca em **Copiar** e cola no WhatsApp da mãe. Depois toca no **💬** do Bloco "Rangel" (Rangel + (Casal ÷ 2)), copia e manda para o Rangel.
- **Falha:** se a Conferência mostra "⚠ Diferença de R$ 720,00 no cartão final 8673", Rafael toca em "Ver lançamentos" e encontra a linha com "verificar" (BELLA PIETRA lida como R$ 80,00). Abre a linha, corrige o Valor para R$ 800,00, a Conferência fica "✓", e ele segue para o passo 4.

### Flow 2: Registrar os Pix (Rafael, iPad, 08/11/26)
1. A mãe manda o Pix de R$ 1.350,14. No Painel, Rafael toca no Bloco Mãe, seleciona todos e confere que a barra mostra o mesmo valor.
2. Toca em **Aplicar status**, escolhe "Pago" e mantém a data de hoje e o valor da Seleção.
3. **Clímax:** os selos viram "Pago", e o aviso "7 lançamentos marcados como pagos · Desfazer" aparece embaixo.
4. O Lucas paga R$ 100,00. Rafael filtra por Lucas, seleciona tudo e aplica "Pago" com valor recebido de R$ 100,00. O app pergunta o que fazer com a diferença, ele escolhe **"Fica pendente"**, e os R$ 115,16 restantes ficam pendentes.
- **Falha:** se ele marcar um item errado como pago, depois que o aviso some, ele abre **Recebimentos → Histórico**, toca no Pagamento e usa **"Desfazer pagamento"**.

### Flow 3: O Rangel paga a parte dele (Rafael, iPad, 10/11/26)
1. O Rangel manda R$ 2.819,68, o valor que veio na mensagem do Bloco "Rangel".
2. Rafael abre a barra de filtros, escolhe **Responsável: Casal, Rangel** e toca em "selecionar todos". A barra mostra "18 selecionados · R$ 5.639,35".
3. Toca em **Aplicar status**, escolhe "Pago" e digita **R$ 2.819,68** em Valor recebido.
4. O app pergunta "O que fazer com a diferença de R$ 2.819,67?", e ele escolhe **"Não é dívida, é a minha parte"**.
5. **Clímax:** os 18 Lançamentos ficam "Pago", o Histórico registra "Rangel · R$ 2.819,68 · minha parte", e o cartão do Rangel em Recebimentos fica **"Em dia"**.

### Flow 4: Montar o Bloco do Rangel (Rafael, PC, configuração inicial)
1. No Painel, toca em **＋ Novo bloco** e digita o nome "Rangel".
2. Toca nas fichas **Rangel**, **+**, **(**, **Casal**, **÷**, **Número → 2** e **)**, e liga "Usar em Recebimentos".
3. **Clímax:** a Fórmula aparece como "Rangel + (Casal ÷ 2)", com o resultado ao vivo de **R$ 2.819,68** e o passo a passo "Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68".
4. Toca em **Salvar**, e o Bloco aparece no cartão dos Blocos e em Recebimentos.
- **Falha:** se ele esquecer o ")", "Salvar" fica desativado com "Falta fechar um parêntese". Ele toca em ")" e salva.

### Flow 5: Cadastrar a Bombinhas (Rafael, iPad, julho/26)
1. Em **Contas manuais**, toca em **＋ Nova conta**, digita "Bombinhas", escolhe "6 parcelas", "Começa em Jul/26" e o Tipo Viagem.
2. Em Divisão, adiciona três partes de R$ 106,00: Mãe (Mãe e Pai), Casal (Rafael e Rangel) e Lucas (Lucas e Miri).
3. Na parte do Lucas, escolhe **"Dívida programada"** e a data 06/04/27, porque ele vai pagar tudo no final.
4. **Clímax:** ao salvar, os previstos aparecem nos próximos 6 meses. A Mãe e o Casal recebem R$ 106,00 por mês nas mensagens, e a parte do Lucas (R$ 636,00) aparece em **Recebimentos → A receber**, com vencimento em 06/04/27.

### Flow 6: Reimportar por engano (Rafael, iPad)
1. Rafael sobe de novo a fatura de outubro. O app lê "vence 06/10/26" e avisa que ela já foi importada, mostrando quantos Lançamentos serão apagados e quantos já estão pagos.
2. Ele percebe o engano e toca em **Cancelar**. Nada muda.

## Mockups

As telas de referência ilustram estes documentos, no tamanho real do iPad Pro 11". Os valores marcados como ilustrativos nos mocks não são dados reais.

| Tela | Mock | Ilustra |
|---|---|---|
| Painel do Mês (claro, escuro, filtro aberto e menu ⋯, iPad em pé, Diferença) | [painel.html](mockups/painel.html) | Painel, Barra de filtros, Grade, Barra de Seleção, rolagem lateral, Conferido/Diferença · Flow 1, passos 6 e 7 |
| Painel do Lançamento | [lancamento.html](mockups/lancamento.html) | Painel do Lançamento, faixa de pergunta, Salvo · FR-7, FR-44, FR-52 |
| Dividir lançamento | [dividir.html](mockups/dividir.html) | Dividir lançamento · Flow 1, passo 5 |
| Aplicar status | [aplicar-status.html](mockups/aplicar-status.html) | Aplicar status, pergunta da diferença · Flows 2 e 3 |
| Gerar mensagem pelo Bloco | [gerar-mensagem.html](mockups/gerar-mensagem.html) | Formato da mensagem, forma 2 · Flow 1, passo 7 |
| Montador de Bloco | [montador-bloco.html](mockups/montador-bloco.html) | Montador de Bloco · Flow 4 |
| Revisar | [revisar.html](mockups/revisar.html) | Fila de Revisar (variantes) · Flow 1, passo 4 |
| Importar fatura (conferência e erro) | [importar.html](mockups/importar.html) | Importar fatura, Mês sem Fatura, erro de PDF · Flow 1, passos 2 e 3 |
| Recebimentos | [recebimentos.html](mockups/recebimentos.html) | Cartões por Bloco de cobrança, A receber, Histórico · Flows 2 e 3 |
| Previsão (3 abas) | [previsao.html](mockups/previsao.html) | Próximos meses, Evolução, Meu gasto por Tipo · FR-31 a FR-33 |
| Contas manuais | [contas-manuais.html](mockups/contas-manuais.html) | Lista e formulário · Flow 5 |
| Configurações | [configuracoes.html](mockups/configuracoes.html) | Responsáveis, Status, Ciclo · FR-36, FR-49, FR-50 |
| Entrar e Primeiro uso | [primeiro-uso.html](mockups/primeiro-uso.html) | Entrar, Primeiro uso · UJ-0 |
