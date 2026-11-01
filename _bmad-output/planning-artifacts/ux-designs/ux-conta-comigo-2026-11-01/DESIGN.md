---
name: Conta Comigo
description: Painel analítico para fechar o mês do cartão de crédito dividido entre pessoas. Web app para PC e iPad Pro 11", com modo claro e escuro.
status: final
created: 2026-11-01
updated: 2026-11-01
colors:
  # Tema "Grafite com verde". Tokens sem sufixo = modo claro; sufixo -dark = modo escuro.
  background: '#F4F5F5'
  surface: '#FFFFFF'
  border: '#E1E4E3'
  border-subtle: '#EEF0EF'
  text: '#16191A'
  text-muted: '#62696B'
  nav: '#1F2426'
  nav-icon-idle: '#8A9396'
  nav-label: '#C9CFD1'
  accent: '#15803D'            # preenchimentos e texto verde (5,0:1 com branco)
  accent-line: '#16A34A'       # só bordas, caixas marcadas e barra de progresso
  accent-foreground: '#FFFFFF'
  selection: '#16A34A14'
  focus-ring: '#2563EB'
  status-paid-fg: '#065F46'
  status-paid-bg: '#D1FAE5'
  status-unpaid-fg: '#92400E'
  status-unpaid-bg: '#FEF3C7'
  status-partial-fg: '#1E40AF'
  status-partial-bg: '#DBEAFE'
  status-late-fg: '#B91C1C'
  status-late-bg: '#FEE2E2'
  forecast-fg: '#475569'
  forecast-bg: '#E2E8F0'
  verify: '#DC2626'
  danger-fg: '#B91C1C'
  danger-bg: '#FEE2E2'
  alert-warning-bg: '#FFF7E6'
  alert-warning-border: '#F5C26B'
  scrim: '#00000066'
  background-dark: '#0F1112'
  surface-dark: '#171A1B'
  border-dark: '#262B2D'
  border-subtle-dark: '#1E2224'
  text-dark: '#E6E8E8'
  text-muted-dark: '#9BA2A4'
  nav-dark: '#0A0B0C'
  nav-icon-idle-dark: '#8A9396'
  nav-label-dark: '#C9CFD1'
  accent-dark: '#22C55E'
  accent-line-dark: '#22C55E'
  accent-foreground-dark: '#0F1112'
  selection-dark: '#22C55E1F'
  focus-ring-dark: '#60A5FA'
  status-paid-fg-dark: '#86EFAC'
  status-paid-bg-dark: '#14532D66'
  status-unpaid-fg-dark: '#FCD34D'
  status-unpaid-bg-dark: '#78350F66'
  status-partial-fg-dark: '#93C5FD'
  status-partial-bg-dark: '#1E3A8A66'
  status-late-fg-dark: '#FCA5A5'
  status-late-bg-dark: '#7F1D1D66'
  forecast-fg-dark: '#CBD5E1'
  forecast-bg-dark: '#33415566'
  verify-dark: '#F87171'
  danger-fg-dark: '#FCA5A5'
  danger-bg-dark: '#7F1D1D66'
  alert-warning-bg-dark: '#3A2A0C'
  alert-warning-border-dark: '#B7791F'
  scrim-dark: '#00000099'
  # Cores de pessoa (Responsável). Rafael escolhe a cor de cada um no cadastro.
  # person-N = cor pura (barra de distribuição, bolinha do Bloco, gráficos).
  # person-N-fg/-bg = etiqueta no claro; -fg-dark/-bg-dark = etiqueta no escuro (todas ≥ 6:1).
  # Nenhuma cor de pessoa é verde, para não confundir com o destaque.
  person-1: '#0EA5E9'
  person-1-fg: '#075985'
  person-1-bg: '#E2F4FC'
  person-1-fg-dark: '#7DD3FC'
  person-1-bg-dark: '#153948'
  person-2: '#A855F7'
  person-2-fg: '#6B21A8'
  person-2-bg: '#F5EBFE'
  person-2-fg-dark: '#D8B4FE'
  person-2-bg-dark: '#37274B'
  person-3: '#F59E0B'
  person-3-fg: '#92400E'
  person-3-bg: '#FEF3E2'
  person-3-fg-dark: '#FCD34D'
  person-3-bg-dark: '#483717'
  person-4: '#0D9488'
  person-4-fg: '#115E59'
  person-4-bg: '#E2F2F1'
  person-4-fg-dark: '#5EEAD4'
  person-4-bg-dark: '#153533'
  person-5: '#EC4899'
  person-5-fg: '#9D174D'
  person-5-bg: '#FDE9F3'
  person-5-fg-dark: '#F9A8D4'
  person-5-bg-dark: '#462437'
  person-6: '#EA580C'
  person-6-fg: '#9A3412'
  person-6-bg: '#FCEBE2'
  person-6-fg-dark: '#FDBA74'
  person-6-bg-dark: '#452818'
  person-7: '#6366F1'
  person-7-fg: '#3730A3'
  person-7-bg: '#ECEDFD'
  person-7-fg-dark: '#A5B4FC'
  person-7-bg-dark: '#282B4A'
  person-8: '#A16207'
  person-8-fg: '#713F12'
  person-8-bg: '#F4ECE1'
  person-8-fg-dark: '#FDE047'
  person-8-bg-dark: '#352A17'
typography:
  # Fonte do sistema (SF Pro no iPad e no Mac, Segoe UI no Windows).
  # Papéis numéricos usam algarismos tabulares (fontFeature tnum). No iPad, 1 pt = 1 px CSS.
  hero-value:
    fontFamily: 'system-ui'
    fontSize: 34px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.01em
    fontFeature: "'tnum'"
  block-value:
    fontFamily: 'system-ui'
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
    fontFeature: "'tnum'"
  title:
    fontFamily: 'system-ui'
    fontSize: 17px
    fontWeight: '700'
    lineHeight: '1.3'
  body:
    fontFamily: 'system-ui'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
  body-strong:
    fontFamily: 'system-ui'
    fontSize: 13px
    fontWeight: '700'
    lineHeight: '1.4'
  number:
    fontFamily: 'system-ui'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
    fontFeature: "'tnum'"
  label:
    fontFamily: 'system-ui'
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.3'
  eyebrow:
    fontFamily: 'system-ui'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: 0.06em
  caption:
    fontFamily: 'system-ui'
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.3'
  nav-label:
    fontFamily: 'system-ui'
    fontSize: 10px
    fontWeight: '600'
    lineHeight: '1.2'
  message:
    fontFamily: 'ui-monospace'
    fontSize: 12.5px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  rail-width: 64px
  touch-target: 44px
  row-height: 44px
  icon-button: 26px
  side-panel: 400px
components:
  nav-rail:
    background: '{colors.nav}'
    width: '{spacing.rail-width}'
    icon-active: '{colors.accent-line}'
    icon-idle: '{colors.nav-icon-idle}'
    label: '{typography.nav-label}'
    label-color: '{colors.nav-label}'
    badge: '{colors.verify}'
  card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    padding: '{spacing.4}'
  invoice-hero:
    eyebrow: '{typography.eyebrow}'
    value: '{typography.hero-value}'
    bar-height: 8px
    bar-radius: '{rounded.full}'
  block-card:
    background: '{colors.background}'
    border: '1px solid {colors.border}'
    border-active: '{colors.accent-line}'
    radius: '{rounded.md}'
    padding: '{spacing.3}'
    value: '{typography.block-value}'
    icon-button: '{spacing.icon-button}'
  month-switcher:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.sm}'
    typography: '{typography.label}'
  filter-bar:
    gap: '{spacing.2}'
  filter-chip:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    background-active: '{colors.selection}'
    border-active: '{colors.accent-line}'
    radius: '{rounded.full}'
    typography: '{typography.label}'
  search-field:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.sm}'
    min-width: 220px
  popover:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    shadow: '0 14px 34px #00000033'
  person-tag:
    background: '{colors.person-N-bg}'
    foreground: '{colors.person-N-fg}'
    background-dark: '{colors.person-N-bg-dark}'
    foreground-dark: '{colors.person-N-fg-dark}'
    radius: '{rounded.full}'
    typography: '{typography.label}'
  status-pill:
    radius: '{rounded.full}'
    typography: '{typography.caption}'
  grid-row:
    height: '{spacing.row-height}'
    divider: '1px solid {colors.border-subtle}'
    selected-background: '{colors.selection}'
  checkbox:
    visual-size: 18px
    hit-area: '{spacing.touch-target}'
    radius: 5px
    checked: '{colors.accent-line}'
  selection-bar:
    background: '{colors.nav}'
    foreground: '#FFFFFF'
    border-dark: '1px solid {colors.border-dark}'
    radius: '{rounded.md}'
    shadow: '{components.float.shadow}'
  float:
    shadow: '0 6px 18px #0000002E'
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-foreground}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-target}'
  button-secondary:
    background: 'transparent'
    border: '1px solid {colors.border}'
    foreground: '{colors.text}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-target}'
  button-danger:
    background: 'transparent'
    border: '1px solid {colors.danger-fg}'
    foreground: '{colors.danger-fg}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-target}'
  form-field:
    background: '{colors.background}'
    border: '1px solid {colors.border}'
    border-error: '1px solid {colors.danger-fg}'
    radius: '{rounded.sm}'
    min-height: '{spacing.touch-target}'
  formula-chip:
    background: '{colors.selection}'
    border: '1px solid {colors.accent-line}'
    radius: '{rounded.sm}'
    typography: '{typography.body-strong}'
  palette-chip:
    background: '{colors.background}'
    border: '1px solid {colors.border}'
    radius: '{rounded.full}'
    min-height: '{spacing.touch-target}'
  operator-key:
    size: 44px
    background: '{colors.background}'
    border: '1px solid {colors.border}'
    radius: '{rounded.sm}'
  review-item:
    min-height: 64px
    divider: '1px solid {colors.border-subtle}'
    accept-button: '{components.button-primary}'
  side-panel:
    background: '{colors.surface}'
    width: '{spacing.side-panel}'
    border-left: '1px solid {colors.border}'
    shadow: '-10px 0 30px #0000001F'
  modal:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    max-width: 640px
    scrim: '{colors.scrim}'
  inline-question:
    background: '{colors.alert-warning-bg}'
    border: '1px solid {colors.alert-warning-border}'
    radius: '{rounded.md}'
  alert-warning:
    background: '{colors.alert-warning-bg}'
    border: '1px solid {colors.alert-warning-border}'
    radius: '{rounded.md}'
  offline-banner:
    background: '{colors.nav}'
    foreground: '{colors.nav-label}'
  toast:
    background: '{colors.nav}'
    foreground: '#FFFFFF'
    radius: '{rounded.md}'
    shadow: '{components.float.shadow}'
  progress:
    track: '{colors.border}'
    fill: '{colors.accent-line}'
    height: 4px
  skeleton:
    background: '{colors.border-subtle}'
    radius: '{rounded.sm}'
  chart-bar:
    radius: '{rounded.sm}'
    segment-colors: '{colors.person-N}'
---

## Brand & Style

O Conta Comigo é uma **ferramenta de análise**, e não um app de estilo de vida. A sensação pedida pelo Rafael é "organização, algo para analisar mesmo": números grandes e legíveis, cartões bem delimitados, poucas cores e cada cor com uma função. O layout é o da direção B ("painel analítico"): menu lateral escuro, um cartão de destaque com o valor da fatura e a barra de distribuição por pessoa, os Blocos em cartões e a grade embaixo.

O tema é **Grafite com verde**: fundos neutros, quase sem cor, e um único verde de destaque, que lembra dinheiro e "tudo certo". Cada cor na tela tem significado: é de uma pessoa, de um estado (pago, não pago, atrasado, previsto, verificar, erro) ou o destaque de uma ação. As direções descartadas foram a "planilha refinada" (densa demais), a "calma estilo lista" (mostra pouco) e a "contábil sóbria" (só a paleta agradou). Ver [direções 1](mockups/direcoes-1.html), [direções 2](mockups/direcoes-2.html), [temas de cor](mockups/temas-de-cor.html) e [densidade](mockups/densidade.html). A tela de referência é o [Painel](mockups/painel.html), nos modos claro e escuro.

## Colors

- **Fundo, superfície, bordas e textos** (`{colors.background}`, `{colors.surface}`, `{colors.border}`, `{colors.text}`, `{colors.text-muted}`): grafite neutro, sem cor de marca.
- **Menu e barras flutuantes** (`{colors.nav}`): o tom mais escuro. Ancora o menu lateral, a barra de seleção, o aviso inferior e a faixa "Sem conexão". No escuro, a barra de seleção ganha a borda `{colors.border-dark}`, porque `{colors.nav-dark}` quase some sobre o fundo. Os ícones inativos do menu usam `{colors.nav-icon-idle}` (5:1) e os rótulos, `{colors.nav-label}`.
- **Destaque verde**: há dois tokens.
  - `{colors.accent}` (#15803D no claro, 5:1 com branco) é usado em **preenchimentos com texto** (botão primário) e **texto verde** ("✓ Conferido").
  - `{colors.accent-line}` (#16A34A) é usado só em **bordas, caixas marcadas, item ativo do menu e barra de progresso**, onde 3:1 basta.
  
  No escuro, os dois são `{colors.accent-dark}` (#22C55E), com texto escuro por cima. O verde nunca é cor de pessoa nem fundo de linha, exceto o tom de seleção `{colors.selection}`.
- **Cores de pessoa** (`{colors.person-1}` … `{colors.person-8}`): Rafael escolhe uma para cada Responsável. A **cor pura** aparece no segmento da barra de distribuição, na bolinha do Bloco e nos gráficos. A **etiqueta do Responsável** usa o par próprio de cada modo (`person-N-fg`/`person-N-bg` e `-dark`), todos com contraste de 6:1 ou mais. Nenhuma cor de pessoa é verde, para não ser confundida com o destaque ou com "pago". A linha da grade **nunca** é pintada com a cor da pessoa.
- **Estados** (`status-*`, `forecast-*`, `verify`): pares fundo e texto dos selos de Status (pago, não pago, pago parcialmente, atrasado), do selo "Previsto" e da bolinha "verificar".
- **Erro e destrutivo** (`danger-*`): campo com erro (ex.: "Senha incorreta") e ações que apagam dados ("Excluir", "Importar de novo").
- **Alerta** (`alert-warning-*`): faixa âmbar de aviso (Conferência com diferença, pergunta "aplicar a todos?").
- **Foco** (`{colors.focus-ring}`): anel de 2 px nos elementos focados pelo teclado, só no PC.

## Typography

A fonte é a do sistema (SF Pro no iPad e no Mac), sem fonte de marca. Os papéis numéricos (`hero-value`, `block-value`, `number`) usam algarismos tabulares (`fontFeature: tnum`), para os valores ficarem alinhados nas colunas. No iPad, 1 pt = 1 px CSS.

| Papel | Token | Uso |
|---|---|---|
| Valor da fatura | `{typography.hero-value}` (34 px, 700) | Só o valor principal do cartão da fatura |
| Valor do Bloco | `{typography.block-value}` (20 px, 700) | Valor de cada Bloco e dos cartões de Recebimentos |
| Título | `{typography.title}` (17 px, 700) | Títulos de tela, painel lateral e janelas |
| Corpo | `{typography.body}` (13 px) | Grade, textos e campos. O Apelido usa `{typography.body-strong}`, com o Nome ao lado em `{colors.text-muted}` |
| Número | `{typography.number}` (13 px, tnum) | Valores, Parcelas e datas na grade |
| Rótulo | `{typography.label}` (12 px, 600) | Cabeçalhos da grade, nomes dos Blocos, etiquetas, filtros |
| Sobrelinha | `{typography.eyebrow}` (12 px, maiúsculas) | "FATURA DE OUTUBRO · VENCE 06/10/26" |
| Legenda | `{typography.caption}` (11 px) | Selos de Status e subtítulos dos Blocos |
| Menu | `{typography.nav-label}` (10 px) | Rótulos sob os ícones do menu lateral |
| Mensagem | `{typography.message}` (mono 12,5 px) | Quadro de leitura da Mensagem de cobrança |

A densidade é a dos exemplos da direção B ([densidade](mockups/densidade.html), opção "Como nos exemplos anteriores"): corpo em 13 px, linhas de 44 pt e cerca de 9 linhas visíveis no iPad deitado.

## Layout & Spacing

A escala de espaçamento é de 4 em 4 px (`{spacing.1}` a `{spacing.6}`). Layout no iPad Pro 11" deitado (1194 × 834 pt):
- **Menu lateral:** fixo, com largura `{spacing.rail-width}`.
- **Conteúdo:** margem de `{spacing.4}`, com cartões a `{spacing.3}` um do outro.
- **Linha superior:** o cartão da fatura ocupa cerca de 40% da largura, e o cartão dos Blocos, 60%. Os Blocos ficam em linhas de 3. Com mais de 6, o cartão cresce em altura.
- **Barra de filtros:** fica entre a linha superior e a grade, numa única linha. O que não couber vai para "Mais ▾".
- **Grade:** ocupa o resto da altura e rola por dentro do cartão. Quando falta largura, rola para os lados, com a caixa de seleção e o Nome fixos. Nenhuma coluna é escondida.
- **Barra de seleção:** presa embaixo. Só aparece quando há Seleção.
- **Painel lateral:** tem `{spacing.side-panel}` de largura e abre pela direita, por cima da grade.

**No PC**, a largura extra vai para a grade, que mostra mais colunas sem rolar. **No iPad em pé (834 pt)**, os Blocos ficam em 3 colunas abaixo do cartão da fatura.

## Elevation & Depth

Quase sem sombra: a separação vem do contraste entre fundo e superfície e das bordas de 1 px. Só os elementos flutuantes têm sombra:
- `{components.float.shadow}`: barra de seleção e aviso inferior;
- sombra lateral do painel lateral;
- sombra do popover;
- janelas: o fundo é coberto pelo véu `{colors.scrim}` (40% no claro, 60% no escuro).

## Shapes

- `{rounded.lg}` (14 px): cartões, janelas e popovers.
- `{rounded.md}` (10 px): Blocos, barra de seleção, alertas e aviso inferior.
- `{rounded.sm}` (6 px): botões, campos, fichas da Fórmula e teclas de operação.
- `{rounded.full}`: etiquetas de pessoa, selos, filtros e a barra de distribuição.

## Components

- **Menu lateral** (`nav-rail`): seis itens com ícone (22 px) e rótulo curto (`{typography.nav-label}`): Painel, Revisar, Recebimentos, Previsão, Contas manuais (rótulo "Contas") e Configurações (rótulo "Config."). O item ativo tem o ícone em `{colors.accent-line}` e o rótulo em branco. "Revisar" mostra um contador (pílula `{colors.verify}`, texto branco) enquanto houver itens na fila.
- **Seletor de Mês** (`month-switcher`): "◀ Out/26 ▶" num botão contornado, com setas de 44 pt. Tocar no nome abre um popover com a lista de meses, e os futuros levam o selo "Previsto". O formato do rótulo é "Mmm/AA" (Out/26), e o formato longo, "outubro/26".
- **Cartão da fatura** (`invoice-hero`): sobrelinha com mês e vencimento; total a pagar em `{typography.hero-value}`; barra de distribuição (segmentos `person-N` proporcionais à soma de cada Responsável); legenda com bolinhas; e o selo "✓ Conferido" (`{colors.accent}`) ou "⚠ Diferença de R$ X" (âmbar).
- **Bloco** (`block-card`): nome com a bolinha `person-N` (quando o Bloco é de um único Responsável), valor em `{typography.block-value}` e subtítulo com a contagem de itens ou a Fórmula legível, **com os parênteses como Rafael montou** ("Rangel + (Casal ÷ 2)"). No canto de baixo, à direita, ficam dois botões quadrados de `{spacing.icon-button}`, com área de toque de 44 pt: ⋯ e 💬. O Bloco ativo tem borda `{colors.accent-line}` mais 1 px de contorno. O cabeçalho do cartão dos Blocos tem "Reordenar" (secundário compacto, 30 px) e "＋ Novo bloco" (primário compacto).
- **Barra de filtros** (`filter-bar`):
  - campo de busca (`search-field`, ícone 🔍 e texto de ajuda "Buscar nome ou apelido");
  - filtros por coluna em pílulas (`filter-chip`) "Coluna ▾". O filtro ativo usa `selection`/`accent-line` e mostra o valor ("Responsável: Casal, Rangel ▾");
  - pílula "Bloco: Casal ✕" quando um Bloco está filtrando;
  - "Limpar filtros" alinhado à direita.
- **Popover de filtro** (`popover`): título "Responsável (pode marcar vários)", uma linha de 44 pt por valor (caixa + etiqueta + contagem à direita) e rodapé com "Limpar" e "Aplicar".
- **Grade** (`grid-row`): linhas de `{spacing.row-height}` com divisórias finas. A linha selecionada tem fundo `{colors.selection}`. Colunas:
  - caixa de seleção;
  - Nome (ou Apelido em negrito + Nome em cinza);
  - Parcela;
  - Valor, alinhado à direita, em `{typography.number}`;
  - Tipo;
  - Responsável (etiqueta);
  - Lançado por (rótulo contornado de 11 px);
  - Status (selo).
  
  O selo "Previsto" fica junto do Nome. Uma linha dividida aparece com "↳" e recuo de 16 px. Um Ajuste aparece recuado sob a parcela, com o líquido em `{colors.text-muted}`.
- **Etiqueta de pessoa** (`person-tag`): pílula com o nome, `person-N-bg` e `person-N-fg` (no escuro, `-dark`).
- **Selo de Status** (`status-pill`) e **marca "verificar"** (bolinha de 8 px em `{colors.verify}` antes do Nome, que não é um selo).
- **Barra de seleção** (`selection-bar`): "N selecionados", total em negrito, "Limpar", "Aplicar status" e "⋯ Mais" (secundários contornados em cinza claro) e "Gerar mensagem" (primário).
- **Botões**:
  - primário: preenchido em `{colors.accent}`;
  - secundário: contornado;
  - destrutivo (`button-danger`): contornado em `{colors.danger-fg}`.
  
  Todos têm altura mínima de 44 pt, e as versões compactas (30 px) mantêm a área de toque de 44 pt.
- **Campos** (`form-field`): fundo `{colors.background}` e 44 pt de altura. Com erro, a borda fica em `{colors.danger-fg}` e a mensagem aparece abaixo, em 12 px na mesma cor.
- **Montador de Bloco**: a área da Fórmula tem borda tracejada de 2 px e contém as fichas montadas (`formula-chip`). Embaixo fica a paleta com fichas de Responsável (`palette-chip`, com a bolinha `person-N`), Tipo, "Responsável em Tipo", "Todos", "Número…" e as teclas de operação (`operator-key`, 44 × 44). O cartão de resultado (fundo `{colors.background}`) mostra o valor em 22 px e o cálculo passo a passo em `{colors.text-muted}`.
- **Fila de Revisar** (`review-item`): linha de 64 pt com caixa; Nome em negrito e "Parcela · Valor" embaixo; sugestão em `{colors.text-muted}` à direita; botão ✓ (primário quadrado, 36 px, área de toque de 44 pt); e "Mudar" (secundário). As variantes "valor diferente" e "previsto sem par" levam um selo âmbar ("Valor mudou", "Não veio na fatura").
- **Painel lateral** (`side-panel`) e **janelas** (`modal`): título em `{typography.title}`, ações no rodapé, botão ✕ no topo.
- **Faixa de pergunta** (`inline-question`): faixa âmbar dentro do painel ou da janela, com a pergunta e dois botões compactos.
- **Aviso inferior** (`toast`): pílula escura centralizada embaixo, com texto e, quando der, "Desfazer". Fica 6 segundos na tela.
- **Faixa "Sem conexão"** (`offline-banner`): faixa fina no topo do conteúdo, em `{colors.nav}`.
- **Barra de progresso** (`progress`): 4 px, preenchimento em `{colors.accent-line}`, com o nome da etapa embaixo.
- **Carregando** (`skeleton`): retângulos em `{colors.border-subtle}` no lugar dos números e das linhas.
- **Gráficos** (`chart-bar`): barras empilhadas com segmentos `person-N`, valor total em cima e rótulo do mês embaixo.
- **Cartão de Recebimentos**: cartão com a etiqueta (ou o nome do Bloco), selo de situação (Em dia, Não pago, Atrasado), Saldo pendente em `{typography.block-value}`, linha de detalhe e os botões "Ver" e "Cobrar pendências".

## Do's and Don'ts

- **Faça:** use a cor de uma pessoa sempre igual na barra, no Bloco, nos gráficos e na etiqueta.
- **Faça:** alinhe valores à direita, com algarismos tabulares, no formato "R$ 1.140,74" ou "- R$ 0,08".
- **Faça:** mostre o Apelido em negrito e o Nome original em cinza.
- **Faça:** use `{colors.accent}` (e não `accent-line`) sempre que houver texto sobre o verde ou texto verde.
- **Não faça:** pintar a linha da grade com a cor da pessoa ou do Status.
- **Não faça:** usar o verde para algo que não seja ação, seleção, "conferido" ou "pago".
- **Não faça:** usar vermelho fora de atrasado, verificar, erro de campo, ações destrutivas e o contador do menu.
- **Não faça:** usar fontes decorativas, gradientes ou ilustrações. É uma ferramenta de análise.
