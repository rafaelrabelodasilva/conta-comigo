---
name: Conta Comigo
description: Painel analítico para fechar o mês do cartão de crédito dividido entre pessoas. Web app para PC e iPad Pro 11", com modo claro e escuro.
status: draft
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
  nav-icon: '#3A4144'
  accent: '#16A34A'
  accent-foreground: '#FFFFFF'
  selection: '#16A34A14'
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
  alert-warning-bg: '#FFF7E6'
  alert-warning-border: '#F5C26B'
  background-dark: '#0F1112'
  surface-dark: '#171A1B'
  border-dark: '#262B2D'
  border-subtle-dark: '#1E2224'
  text-dark: '#E6E8E8'
  text-muted-dark: '#9BA2A4'
  nav-dark: '#0A0B0C'
  nav-icon-dark: '#2A3033'
  accent-dark: '#22C55E'
  accent-foreground-dark: '#0F1112'
  selection-dark: '#22C55E1F'
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
  alert-warning-bg-dark: '#3A2A0C'
  alert-warning-border-dark: '#B7791F'
  # Paleta de cores de pessoa (Responsável). Rafael escolhe a cor de cada um no cadastro;
  # a ordem abaixo é a sugestão para os 4 primeiros. Mesmas cores nos dois modos.
  person-1: '#0EA5E9'
  person-2: '#A855F7'
  person-3: '#F59E0B'
  person-4: '#22C55E'
  person-5: '#EC4899'
  person-6: '#14B8A6'
  person-7: '#6366F1'
  person-8: '#84CC16'
typography:
  # Fonte do sistema (SF Pro no iPad e no Mac, Segoe UI no Windows). Todos os números usam algarismos tabulares.
  hero-value:
    fontFamily: 'system-ui'
    fontSize: 34px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  block-value:
    fontFamily: 'system-ui'
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
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
components:
  nav-rail:
    background: '{colors.nav}'
    width: '{spacing.rail-width}'
    icon-active: '{colors.accent}'
    icon-idle: '{colors.nav-icon}'
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
    border-active: '{colors.accent}'
    radius: '{rounded.md}'
    padding: '{spacing.3}'
    value: '{typography.block-value}'
  person-tag:
    background: 'cor da pessoa a 12% (claro) / 20% (escuro)'
    border: 'cor da pessoa a 33% (claro) / 40% (escuro)'
    foreground: 'cor da pessoa'
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
    checked: '{colors.accent}'
  selection-bar:
    background: '{colors.nav}'
    foreground: '#FFFFFF'
    radius: '{rounded.md}'
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
  side-panel:
    background: '{colors.surface}'
    width: 400px
    border-left: '1px solid {colors.border}'
  modal:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    max-width: 640px
  alert-warning:
    background: '{colors.alert-warning-bg}'
    border: '1px solid {colors.alert-warning-border}'
    radius: '{rounded.md}'
---

## Brand & Style

O Conta Comigo é uma **ferramenta de análise**, e não um app de estilo de vida. A sensação pedida pelo Rafael é "organização, algo para analisar mesmo": números grandes e legíveis, cartões bem delimitados, poucas cores e cada cor com uma função. O layout é o da direção B ("painel analítico"): menu lateral escuro, um cartão de destaque com o valor da fatura e a barra de distribuição por pessoa, os Blocos em cartões e a grade embaixo.

O tema é **Grafite com verde**: fundos neutros, quase sem cor, e um único verde de destaque, que lembra dinheiro e "tudo certo". A cor que aparece na tela tem significado: ou é de uma pessoa, ou é de um estado (pago, não pago, atrasado, previsto, verificar), ou é o destaque de uma ação. Referências descartadas: a direção "planilha refinada" (densa demais), a "calma estilo lista" (mostra pouco) e a "contábil sóbria" (só a paleta agradou, e virou o tema escolhido no lugar dela). Ver [direções 1](mockups/direcoes-1.html), [direções 2](mockups/direcoes-2.html) e [temas de cor](mockups/temas-de-cor.html). A tela de referência é o [Painel](mockups/painel.html), nos modos claro e escuro.

## Colors

- **Fundo, superfície, bordas e textos** (`{colors.background}`, `{colors.surface}`, `{colors.border}`, `{colors.text}`, `{colors.text-muted}`): grafite neutro, sem cor de marca. Cartões brancos sobre fundo cinza-claro no modo claro, e cinza-quase-preto no escuro.
- **Menu e barra de seleção** (`{colors.nav}`): o tom mais escuro da interface. Ancora a navegação e a barra de seleção, que sempre "flutua" sobre o conteúdo.
- **Destaque verde** (`{colors.accent}` / `{colors.accent-dark}`): usado em botões primários ("Gerar mensagem", "Importar"), no Bloco ativo (que está filtrando), na caixa marcada, no item ativo do menu e no selo "✓ Conferido". **Nunca** é usado como cor de pessoa nem como fundo de linha, exceto o tom de seleção (`{colors.selection}`, 8%).
- **Cores de pessoa** (`{colors.person-1}` a `{colors.person-8}`): cada Responsável tem uma cor, escolhida por Rafael. Ela aparece em **três lugares, sempre a mesma**: o segmento da barra de distribuição da fatura, a bolinha no rótulo do Bloco e a **etiqueta do Responsável** na grade. A linha da grade **nunca** é pintada com a cor da pessoa. O verde do destaque não aparece na paleta de pessoas, para não confundir com "selecionado". [ASSUMPTION: a sugestão para a 4ª pessoa, #22C55E, é próxima do destaque verde; pode ser trocada no UX final]
- **Estados** (`status-*`, `forecast-*`, `verify`): os pares fundo e texto dos selos de Status (pago, não pago, pago parcialmente, atrasado), do selo "Previsto" e da bolinha "verificar". Esses pares são de uso exclusivo: o vermelho de `{colors.verify}` e `{colors.status-late-fg}` não é usado em mais nada.
- **Alerta** (`alert-warning-*`): o âmbar suave da faixa de aviso, por exemplo quando a Conferência não bate.

## Typography

A fonte é a do sistema (SF Pro no iPad e no Mac), sem fonte de marca. Todos os números usam **algarismos tabulares**, para os valores ficarem alinhados nas colunas.

| Papel | Token | Uso |
|---|---|---|
| Valor da fatura | `{typography.hero-value}` (34 px, 700) | Só o valor principal do cartão de destaque |
| Valor do Bloco | `{typography.block-value}` (20 px, 700) | Valor de cada Bloco |
| Título | `{typography.title}` (17 px, 700) | Títulos de tela, painel lateral e janelas |
| Corpo | `{typography.body}` (13 px) | Grade, textos, campos. O Apelido usa `{typography.body-strong}`, e o Nome original aparece ao lado em `{colors.text-muted}` |
| Rótulo | `{typography.label}` (12 px, 600) | Cabeçalhos da grade, nomes dos Blocos, etiquetas de pessoa |
| Sobrelinha | `{typography.eyebrow}` (12 px, maiúsculas) | "FATURA DE OUTUBRO · VENCE 06/10/26" |
| Legenda | `{typography.caption}` (11 px) | Selos de Status, subtítulos dos Blocos ("18 itens", "Rangel + Casal ÷ 2") |

A densidade escolhida foi a dos exemplos da direção B (`.working/density-1.html`, opção "Como nos exemplos anteriores"; veja o [Painel](mockups/painel.html)): corpo em 13 px, linhas espaçadas e cerca de 9 linhas visíveis no iPad deitado.

## Layout & Spacing

A escala de espaçamento é de 4 em 4 px (`{spacing.1}` a `{spacing.6}`). No iPad Pro 11" deitado (1194 × 834 pt):
- O menu lateral fixo tem `{spacing.rail-width}`.
- O conteúdo tem margem de `{spacing.4}`, e os cartões ficam a `{spacing.3}` um do outro.
- Linha superior: o cartão da fatura ocupa cerca de 40% da largura, e o cartão dos Blocos, 60%, com **6 Blocos em 2 linhas de 3**. Com mais de 6 Blocos, eles continuam em linhas de 3 e o cartão cresce. [ASSUMPTION]
- A grade ocupa o resto da altura e rola por dentro do cartão. A barra de seleção fica presa embaixo e só aparece quando há Seleção.
- O painel lateral do Lançamento tem 400 px e abre por cima da grade, pela direita.

No PC, a largura extra vai para a grade, que ganha colunas (Lançado por, data, cartão). No iPad em pé (834 pt), os Blocos ficam em 3 colunas abaixo do cartão da fatura, e a grade rola para os lados, com a caixa de seleção e o Nome fixos. Nenhuma coluna é escondida.

## Elevation & Depth

Quase sem sombra: a separação vem do contraste entre fundo e superfície e de bordas de 1 px. Só três elementos flutuam com sombra suave: a barra de seleção, o painel lateral e as janelas (modais), que também escurecem o fundo em 40%.

## Shapes

Os cantos são arredondados, mas discretos: `{rounded.lg}` (14 px) em cartões e janelas, `{rounded.md}` (10 px) em Blocos, barra de seleção e alertas, `{rounded.sm}` (6 px) em botões e campos, e `{rounded.full}` em etiquetas de pessoa, selos de Status e na barra de distribuição.

## Components

- **Cartão da fatura** (`invoice-hero`): sobrelinha com mês e vencimento; o valor total a pagar em `{typography.hero-value}`; a barra de distribuição por pessoa (segmentos nas cores das pessoas, proporcionais à soma de cada Responsável); a legenda com bolinhas; e o selo "✓ Conferido" (verde) ou "⚠ Diferença de R$ X" (âmbar).
- **Bloco** (`block-card`): nome com a bolinha da pessoa (quando o Bloco é de uma pessoa só), valor em `{typography.block-value}` e subtítulo com a contagem de itens ou a Fórmula legível. O Bloco ativo (filtrando) tem borda `{colors.accent}`. No canto de baixo, à direita, ficam dois botões quadrados de 26 px com área de toque de 44 pt: ⋯ (menu do Bloco) e 💬 (mensagem). O cabeçalho do cartão dos Blocos tem "Reordenar" (secundário) e "＋ Novo bloco" (primário, compacto).
- **Grade** (`grid-row`): linhas de `{spacing.row-height}`, divisórias finas e, na linha selecionada, fundo `{colors.selection}`. As colunas seguem a planilha: caixa de seleção, Nome (ou Apelido em negrito + Nome em cinza), Parcela, Valor (alinhado à direita), Tipo, Responsável (etiqueta), Lançado por e Status (selo). O selo "Previsto" fica junto do Nome.
- **Etiqueta de pessoa** (`person-tag`): pílula com o nome do Responsável, fundo e borda na cor da pessoa (claros) e texto na cor da pessoa.
- **Selo de Status** (`status-pill`): pílula pequena com o par fundo e texto do estado.
- **Marca "verificar"**: bolinha de 8 px em `{colors.verify}` antes do Nome. Não é um selo de Status.
- **Barra de seleção** (`selection-bar`): fundo `{colors.nav}`, com "N selecionados", o total em negrito, "Aplicar status" (secundário) e "Gerar mensagem" (primário).
- **Botões**: o primário é verde e preenchido; o secundário é contornado. Os dois têm altura mínima de 44 pt.
- **Painel lateral** e **janelas**: superfície branca (ou `{colors.surface-dark}`), título em `{typography.title}`, ações no rodapé.

## Do's and Don'ts

- **Faça:** use a cor de uma pessoa sempre igual em barra, Bloco e etiqueta.
- **Faça:** alinhe todos os valores à direita, com algarismos tabulares e no formato "R$ 1.140,74" ou "- R$ 0,08".
- **Faça:** mostre o Apelido em negrito e o Nome original em cinza ao lado.
- **Não faça:** pintar a linha da grade com a cor da pessoa ou do Status.
- **Não faça:** usar o verde do destaque para algo que não seja ação, seleção ou "conferido".
- **Não faça:** usar vermelho fora de "atrasado" e "verificar".
- **Não faça:** usar fontes decorativas, gradientes ou ilustrações. É uma ferramenta de análise.
