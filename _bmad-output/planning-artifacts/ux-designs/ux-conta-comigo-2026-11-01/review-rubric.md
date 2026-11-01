# Spine Pair Review — conta-comigo

Revisão independente de `DESIGN.md` + `EXPERIENCE.md` (draft, 01/11/26) contra o PRD (`prd.md`, v1 = §4.1–§4.10 e §5), o memlog e os 15 arquivos em `mockups/`.

## Overall verdict

O par está bem formado e a linguagem visual está decidida. A estrutura segue a spec, todas as referências `{token}` resolvem, todos os mocks estão linkados, e as decisões do Rafael registradas no memlog (direção B, Grafite com verde, etiqueta de pessoa, densidade, barra de filtros, rolagem lateral) aparecem fielmente. **Ainda não serve como contrato para histórias**, porque quatro telas da IA (Recebimentos, Previsão, Contas manuais, Configurações) não têm nenhum comportamento definido, porque vários FRs da v1 não têm cobertura (FR-31, FR-34, FR-15, FR-27 em Lançamentos da Fatura, FR-7) e porque duas decisões que mexem com dinheiro ficaram em aberto: o formato da mensagem por Bloco, que o PRD delegou explicitamente ao UX (FR-53), e o registro do Pagamento do Rangel (FR-25 × UJ-4). Há também falhas de contraste em combinações que aparecem em todas as telas (botão primário, etiqueta de pessoa).

## 1. Flow coverage — thin

Verificado: UJ-0 a UJ-4 contra os Key Flows 1–4; cada FR da v1 com comportamento visível (FR-1–36, 44–54) contra a IA, os Component Patterns, os State Patterns e os Flows.

Mapa resumido: UJ-1 → Flow 1 (parcial); UJ-2 → Flow 2 (parcial: falta o pagamento do Rangel por Casal + Rangel); UJ-4 → Flow 1 passo 7 + Flow 3 (falta o pagamento); UJ-0 → só o State "Primeiro uso"; **UJ-3 → nenhum Flow** (só o mock `contas-manuais.html`).

### Findings
- **high** Quatro telas da IA não têm nenhuma linha em Component Patterns nem em State Patterns: Recebimentos, Previsão, Contas manuais e Configurações (EXPERIENCE.md §Information Architecture, linhas 32–35; §Component Patterns). O comportamento de FR-26, FR-28 ("Cobrar pendências", com mensagem listando o que está em aberto por Mês), FR-29, FR-30, FR-16–18 ("a mudança vale do Mês atual em diante"), FR-12 (perguntar se reaplica a Regra editada), FR-2 (mostrar as Regras criadas para revisão depois da importação da planilha), FR-23 (editor do modelo: escolha dos campos da linha de detalhe) e FR-33 só pode ser deduzido dos mocks, o que contradiz a regra "valem estes documentos" e deixa quem implementa sem fonte de verdade. *Fix:* adicionar linhas de Component Patterns para Cartão de pessoa em Recebimentos (Ver / Cobrar pendências), Lista "A receber", Histórico de Pagamentos, Meses anteriores da Fatura, Tabela da Previsão + gráfico de evolução, Lista e formulário de Conta manual, Seções de Configurações (Responsáveis, Tipos, Status, Regras, Modelo da mensagem, Ciclo, Importar planilha).
- **high** FR-31 (Gasto do Rafael por Tipo, com a "parte do Rafael" definida por um Bloco escolhido) não tem cobertura em nenhum lugar: nem tela, nem componente, nem mock (EXPERIENCE.md IA; nenhum mock). *Fix:* decidir onde aparece (Previsão? seção do Painel?) e onde o Rafael escolhe o Bloco "parte do Rafael" (Configurações), e adicionar à IA e aos Component Patterns.
- **high** FR-34 (login próprio) não tem superfície nem estados: tela de entrada, sessão expirada, primeiro login antes do Primeiro uso (EXPERIENCE.md IA e State Patterns). *Fix:* adicionar "Entrar" à IA e os estados "sessão expirada" e "sem acesso".
- **high** FR-15 (Dividir) aparece só como botão "Dividir" no Painel do Lançamento (EXPERIENCE.md l.74; `lancamento.html`). Faltam a interação (por valor ou proporção, ex.: 2/3 · 1/3), o ajuste de centavos na última linha, o Status por linha, o desfazer da Divisão e o caso de Divisão vinda da Regra. O passo de UJ-1 "divide um remédio entre Mãe e ele" também foi omitido do Flow 1. *Fix:* adicionar uma linha "Dividir lançamento" (janela ou modo no painel) e o passo correspondente no Flow 1.
- **high** FR-7 e FR-46 entram em conflito com o Painel do Lançamento. Nele, Nome, Valor, Parcela e data são somente leitura (l.74), mas FR-7 exige editar, **incluir** e excluir Lançamentos de uma Fatura importada (corrigir a extração), com a Conferência recalculada. Não há ponto de entrada para "incluir Lançamento" à mão (Lançado por = Manual, "inclusão à mão", Glossário §3.1). Também faltam as perguntas de exclusão do FR-46: excluir também os previstos seguintes, aviso do impacto no Saldo pendente quando já há Pagamento, e substituto ou arquivamento de Responsável/Tipo em uso. *Fix:* tornar Valor (e data) editáveis em Lançamentos da Fatura, com recálculo visível da Conferência; adicionar "＋ Lançamento" no Painel; adicionar os três diálogos do FR-46.
- **high** FR-27 (marcar **qualquer** Lançamento como Dívida programada, com vencimento) só existe dentro do formulário de Conta manual (`contas-manuais.html`). O Painel do Lançamento não tem esse campo (l.74), mas o mock `recebimentos.html` mostra "Óculos (resto) · Mãe · vence 06/12/26" em "A receber", o que pressupõe um caminho que os spines não definem. *Fix:* adicionar "Programar dívida" (data combinada) ao Painel do Lançamento e à Seleção, e um Flow curto para UJ-3.
- **medium** A Fila de Revisar não cobre os tipos de item do FR-45: previsto que casou com valor diferente (mostrar a diferença) e previsto sem par na Fatura (decidir entre remover e manter). Também não cobre o "sugere o mais frequente" do FR-9 com indicação de dúvida, que aparece no mock ("às vezes Rafael") mas não no spine (EXPERIENCE.md l.79). *Fix:* acrescentar variantes de item da fila com as ações "Remover previsto" e "Manter".
- **medium** Faltam caminhos de falha nos Flows 1–3 (o exemplo da skill pede "Failure:" em cada um): Conferência com diferença durante o fechamento (o próprio edge case do UJ-1), Fórmula inválida no Flow 3, e desfazer um Pagamento depois que o aviso "Desfazer" some (FR-25: "Um Pagamento pode ser desfeito"; não há lugar definido, como o histórico de Recebimentos). O Montador também não oferece o operando combinado "Rafael em Bobiças" (FR-19), e não está claro o que "Ver cálculo" (FR-54) abre. *Fix:* acrescentar uma linha "Falha:" em cada Flow, uma ficha "Responsável em Tipo" na paleta, e definir o destino de "Ver cálculo" (o Montador em modo leitura?).

## 2. Token completeness — thin

Verificado: todas as chaves do frontmatter; todas as referências `{…}` no frontmatter e na prosa dos dois arquivos (`colors.*`, `spacing.*`, `rounded.*`, `typography.*`, `components.selection-bar`, `components.nav-rail`, `components.alert-warning`). **Todas resolvem.** Os pares claro/escuro existem para todas as cores de sistema (24 pares). Os contrastes foram calculados com a fórmula WCAG contra o piso de 4,5:1 que o próprio EXPERIENCE.md (l.114) declara.

### Findings
- **high** Botão primário: texto `{colors.accent-foreground}` #FFFFFF sobre `{colors.accent}` #16A34A dá **3,30:1**, abaixo de 4,5:1, com rótulo de 13 px, que não conta como texto grande (DESIGN.md l.17–18, l.171–175). Ele aparece em "Gerar mensagem", "Importar", "Copiar" e "Salvar". O mesmo verde usado como texto ("✓ Conferido") sobre a superfície branca também dá 3,30:1. No escuro, o par passa (~9:1). *Fix:* escurecer o accent do modo claro para os preenchimentos e textos (ex.: #15803D, cerca de 5:1 com branco), mantendo #16A34A só para bordas e caixas marcadas, onde 3:1 basta.
- **high** Etiqueta de pessoa: a cor da pessoa como texto sobre a mesma cor a 12% falha nas **8** cores no modo claro, entre 1,82:1 (#84CC16) e 3,85:1 (#6366F1), com âmbar #F59E0B a 1,96:1 e verde #22C55E a 2,05:1. No escuro, a 20%, #A855F7 (3,5), #EC4899 (3,9) e #6366F1 (3,2) falham. A etiqueta aparece em toda linha da grade. O `[NOTE FOR UX: validar contraste]` (EXPERIENCE.md l.114) ficou sem resolver, e `person-tag` usa prosa ("cor da pessoa a 12%") no lugar de tokens (DESIGN.md l.149–154). *Fix:* definir `person-N-fg` / `person-N-bg` / `person-N-fg-dark` / `person-N-bg-dark` (o fg é um tom escurecido no claro e clareado no escuro), mantendo a cor pura só na barra de distribuição e na bolinha do Bloco.
- **medium** `person-4` #22C55E é **idêntico** a `{colors.accent-dark}`, o que contradiz a regra do próprio DESIGN.md "O verde do destaque não aparece na paleta de pessoas" (l.207, marcado só como ASSUMPTION). `person-8` #84CC16 também é verde. *Fix:* trocar o person-4 (ex.: um azul-petróleo ou vermelho-tijolo seguro) e documentar a regra de distância mínima do accent.
- **medium** Tokens ausentes para estados que os spines usam: ação destrutiva ("Importar de novo (destrutivo)", "Excluir bloco", EXPERIENCE.md l.90, l.68), erro de campo ("O campo fica vermelho com 'Senha incorreta'", l.89, que **contradiz** o "Não faça: usar vermelho fora de 'atrasado' e 'verificar'" de DESIGN.md l.265), anel de foco para o PC com teclado (l.108), aviso/Toast, sombra "suave" e véu de 40% (DESIGN.md l.240) sem valores. *Fix:* adicionar `danger-*`, `focus-ring`, `shadow-float` e `scrim` (com pares escuros) e reescrever o Don't do vermelho para incluir erro e destrutivo, ou escolher outra cor para eles.
- **medium** `nav-rail.icon-idle: {colors.nav-icon}` #3A4144 sobre `{colors.nav}` #1F2426 dá **1,51:1** (escuro: 1,47:1). Lido ao pé da letra, o ícone inativo fica invisível. No mock, `--ni` é só o quadrado de placeholder do ícone, e a cor do rótulo do menu não tem token. Além disso, `selection-bar.foreground` é #FFFFFF fixo, e `nav-dark` (#0A0B0C) sobre `background-dark` (#0F1112) dá 1,04:1, então a barra flutuante no escuro depende só da sombra, que não tem valor. *Fix:* separar `nav-icon-idle` (≥ 3:1) e `nav-label`, e dar à `selection-bar` no escuro uma borda `{colors.border-dark}` ou uma superfície mais clara.
- **low** Algarismos tabulares são "obrigatórios" (DESIGN.md l.68, l.213), mas não estão em nenhum token tipográfico (`fontFeature: tnum`). O documento mistura px (tokens) e pt (prosa: 44 pt, 1194 pt) sem dizer a equivalência. *Fix:* adicionar `fontFeature: "'tnum'"` aos papéis numéricos e uma nota "1 pt = 1 px CSS no iPad".

## 3. Component coverage — thin

Verificado: todo nome de componente usado nos dois spines tem (a) especificação visual em DESIGN.md §Components ou nos tokens `components` e (b) uma linha em EXPERIENCE.md §Component Patterns.

| Componente | Visual (DESIGN) | Comportamento (EXPERIENCE) |
|---|---|---|
| Cartão da fatura / Barra de distribuição / Bloco / Cartão dos Blocos / Grade / Linha / Caixa de seleção / Barra de Seleção / Painel do Lançamento / Etiqueta de pessoa / Selo de Status | ok | ok |
| Marca "verificar" / Alerta (faixa âmbar) | ok | só em State Patterns |
| Barra de filtros, Montador de Bloco (fichas, paleta, teclado), Fila de Revisar, Seletor de Mês | **falta** | ok |
| Gerar mensagem (quadro de leitura), Aplicar status, Importar fatura (passos, barra de progresso) | só `modal` genérico | ok |
| Menu lateral (`nav-rail`) | só tokens, sem prosa | **falta** |
| Aviso "Desfazer"/Toast, faixa "Sem conexão", faixa de pergunta "Aplicar a todos/Só este", contador do menu, campos e seletores, modo Reordenar, gráfico da Previsão, cartões de Recebimentos | **falta** | **falta** (ou só citado) |

### Findings
- **high** Barra de filtros, Montador de Bloco, Fila de Revisar e Seletor de Mês têm comportamento detalhado, mas nenhuma especificação visual (DESIGN.md §Components, l.246–256). São justamente as interações centrais do produto (filtrar, montar a Fórmula, revisar). A ficha da Fórmula, a lista com caixas e a contagem, e a linha de sugestão com ✓ só existem nos mocks. *Fix:* adicionar `filter-bar`/`filter-chip`/`filter-popover`, `formula-chip` (variantes Responsável, Tipo, operador, número), `review-item` e `month-switcher` aos tokens e à prosa de Components.
- **medium** Componentes citados nos fluxos e estados que não têm especificação em nenhum dos dois spines: aviso inferior com "Desfazer" (EXPERIENCE.md l.107, l.152), faixa "Sem conexão" (l.99), faixa de pergunta no Painel do Lançamento (l.74), barra de progresso da importação (l.88), campos e seletores de formulário (citados em Shapes, l.244), contador do menu (l.31), modo Reordenar com arrasto (l.105). *Fix:* uma linha visual e uma comportamental para cada um (principalmente o Toast, que carrega o único caminho de desfazer).
- **medium** `nav-rail` tem tokens, mas falta a prosa (estado ativo, rótulo, contador do Revisar) e falta a linha em Component Patterns. Item ativo, ordem dos itens e o que acontece com o contador quando a fila zera ficam espalhados entre a IA e State Patterns. *Fix:* adicionar "Menu lateral" aos dois spines.
- **low** Interaction Primitives diz que "Tudo o que está [no toque longo] também existe num botão '⋯' visível" (l.104), mas a Linha da grade não tem ⋯ nem menu definido (l.72). *Fix:* definir o menu da linha e o ⋯ visível, ou tirar a linha do toque longo.
- **low** O botão 💬 do Bloco não tem rótulo visível (o PRD o chama de "Mensagem", FR-53) nem rótulo acessível definido. *Fix:* definir `aria-label` "Gerar mensagem do Bloco {nome}" e o rótulo usado no ⋯.

## 4. State coverage — thin

Verificado, por superfície da IA, que estados ela deveria ter e quais estão cobertos.

| Superfície | Cobertos | Faltando |
|---|---|---|
| Painel | primeiro uso vazio, Mês sem Fatura, filtro sem resultado, Diferença, Verificar, Previsto, tempo real, offline | carregando, erro ao carregar, **sem Blocos** (passo pulado), Mês fechado/aberto (FR-36), Mês passado |
| Revisar | fila vazia | carregando, itens de previsto com diferença ou sem par |
| Recebimentos | Atrasado (selo) | vazio ("ninguém deve nada"), carregando |
| Previsão | — | sem previstos, menos de 6 Meses de histórico (FR-33) |
| Contas manuais | — | lista vazia, conta encerrada |
| Configurações | (confirmação de exclusão) | escolha de substituto (FR-50/46), Regras vazias, importação da planilha (progresso, erro, resumo) |
| Importar fatura | importando, senha errada, Mês já importado | **PDF inválido / não Santander / extração falhou**, perda de conexão no meio, Conferência com diferença no passo 3 |
| Painel do Lançamento | salvo, atualizado em outro aparelho | **falha ao salvar**, conflito offline |
| Gerar mensagem | — | mensagem vazia (só R$ 0,00 ou dívidas não vencidas), itens excluídos não sinalizados, falha ao copiar |
| Aplicar status | valor menor | valor maior que o total, Status que não conta como pago |
| Entrar (FR-34) | — | tudo |

### Findings
- **high** Salvamento automático sem estado de falha. O Painel do Lançamento salva cada campo "na hora" e mostra "Salvo" (EXPERIENCE.md l.74), e o offline com sincronização foi "confirmado" (l.99), mas não há "não salvou" nem regra de conflito quando o mesmo Lançamento muda offline em dois aparelhos (FR-46, §6 Precisão). Num app em que "nenhum valor pode ser perdido", esse é o estado mais crítico. *Fix:* definir os estados "Salvando… / Salvo / Não salvo, tentando de novo" e a regra visível de conflito (ex.: última gravação vence + aviso "Este lançamento foi alterado em outro aparelho; ver versão").
- **high** A importação não tem estados de erro além da senha (l.88–90): PDF que não é fatura Santander, layout desconhecido, extração parcial ou falha, conexão perdida no meio, e uma janela que "não dá para fechar no meio". O passo 3 também não descreve o caso da Conferência com diferença (o Flow e o mock só mostram "✓ Conferido"). *Fix:* adicionar esses estados com mensagens no padrão de Voice and Tone e uma saída segura (Cancelar sem gravar nada).
- **medium** Não há estado de carregamento em nenhuma superfície (abertura a frio, troca de Mês, recálculo dos Blocos). *Fix:* um padrão único (esqueleto da grade e dos Blocos) em State Patterns.
- **medium** Faltam estados vazios: Painel sem Blocos (o passo "Blocos" do Primeiro uso pode ser pulado), Recebimentos sem pendências, Previsão sem previstos ou com menos de 6 Meses, Contas manuais vazia, Regras vazias. *Fix:* uma linha para cada, com o texto e a ação primária.
- **medium** Gerar mensagem não tem casos de borda: Seleção cuja mensagem fica vazia depois das exclusões do FR-24 (R$ 0,00, Dívidas não vencidas, previstos), sinalização de que itens selecionados ficaram de fora, e o controle "incluir previstos" que o State "Previsto" promete ("a menos que Rafael escolha incluir", l.94) mas que nenhum componente tem. *Fix:* adicionar à linha Gerar mensagem a nota "N itens não entram (R$ 0,00 / dívida programada)" e o interruptor "Incluir previstos" quando o Mês não tem Fatura.
- **low** Aplicar status não diz o que acontece com valor recebido maior que o total, nem se o campo "Valor recebido" some quando o Status escolhido não conta como pago. Também não está definido se a Seleção sobrevive à troca de Mês (FR-25 permite qualquer Mês; FR-24 exige mensagem de um Mês só). *Fix:* definir esses três comportamentos na linha Aplicar status / Barra de Seleção.

## 5. Visual reference coverage — adequate

Verificado: os 15 arquivos em `mockups/` contra os links nos dois spines.
- DESIGN.md linka `direcoes-1.html`, `direcoes-2.html`, `temas-de-cor.html` e `painel.html` (l.200, l.225).
- EXPERIENCE.md §Mockups linka os 12 mocks de tela e diz o que cada um ilustra.
- **Órfãos: nenhum.** A regra "spines vencem" está declarada (EXPERIENCE.md l.13 e de novo em l.168).

### Findings
- **medium** Mocks contradizem os spines ou o PRD em pontos que um consumidor pode copiar:
  - `importar.html`: os previstos de novembro aparecem com "Lançado por: Fatura" (deveria ser Sistema, FR-44), um previsto aparece como "Pago" (KOLINA), e os Blocos mostram os valores de outubro sem a legenda "inclui previstos" que o State "Mês sem Fatura" exige.
  - `recebimentos.html` e `revisar.html` têm o seletor "◀ Out/26 ▶", mas a IA diz que o seletor fica só no Painel e na Previsão (l.48), e o Saldo pendente soma todos os Meses (FR-26).
  - `previsao.html` diz que ilustra FR-33, mas só mostra os 6 Meses **futuros**. FR-33 pede a evolução dos **últimos** 6 Meses por Tipo e por Responsável.
  - `contas-manuais.html` mostra "Valor total R$ 636,00" com três partes de R$ 106,00 por parcela, o que dá R$ 318,00/mês, como a própria lista mostra (total de R$ 1.908,00). A ambiguidade do UJ-3 foi propagada.

  *Fix:* corrigir os mocks e, no spine, resolver o valor da Bombinhas (total ou por parte) e o escopo temporal de Recebimentos.
- **low** Inconsistências menores entre mock e Flow: no `painel.html`, o Bloco Mãe mostra "7 itens", e o Flow 1 passo 6 mostra "23 selecionados" (o PRD diz 23). O mesmo mock mostra o Bloco Casal "filtrando" e o seletor "Responsável: Casal" ativos ao mesmo tempo, sem que o spine diga se o filtro do Bloco preenche a barra de filtros. *Fix:* alinhar a contagem e declarar a relação entre o filtro do Bloco e a barra de filtros.
- **low** Nenhum mock mostra os estados críticos Diferença (faixa âmbar + selo "⚠"), Sem conexão e Primeiro uso concluído com o Painel vazio. DESIGN.md cita `.working/density-1.html` (l.225), que não foi promovido para `mockups/`. A regra "spines vencem" aparece duas vezes no EXPERIENCE.md e nenhuma no DESIGN.md. *Fix:* promover ou remover a referência a `.working/` e deixar a regra uma vez só.

## 6. Bloat & overspecification — strong

Os dois arquivos são enxutos (266 + 185 linhas), não repetem o PRD e não discutem implementação. A pouca duplicação que existe (os controles do Bloco descritos nos dois spines, cada um no seu papel, visual e comportamental) é a esperada pelo par. Não há achados que acrescentem informação.

## 7. Inheritance discipline — adequate

Verificado: termos do Glossário do PRD usados ao pé da letra; nomes de componentes iguais entre os spines e os mocks; referências de token (todas resolvem, ver §2).

### Findings
- **high** "Ajustes" é o nome da tela de configurações nos mocks (menu, título, `ajustes.html`) e na tabela §Mockups do EXPERIENCE.md (l.182), mas a IA chama a tela de "Configurações" (l.35). Pior: **Ajuste** é um termo do Glossário do PRD (§3.2, FR-47, crédito de centavos), e a mesma tela tem a configuração "limite do Ajuste", o que deixa "Ajustes > limite do Ajuste" ambíguo para histórias e rotas. O menu do mock também diz "Contas", e a IA diz "Contas manuais". *Fix:* fixar "Configurações" (e "Contas manuais", ou um rótulo curto declarado na IA) em spines e mocks, e renomear `ajustes.html` → `configuracoes.html`.
- **medium** Os mocks `ajustes.html` e `primeiro-uso.html` descrevem Casal como "grupo: Rafael + Rangel" e os demais como "pessoa". Esse conceito de grupo com membros não existe no PRD (Casal "é um Responsável próprio", §3.1) e nenhum spine define se a composição afeta cálculos, Saldo pendente ou a barra de distribuição (que, pelo spine, considera só o "Responsável que é pessoa", l.66, outro critério indefinido). *Fix:* ou remover o tipo pessoa/grupo, ou defini-lo nos spines e levar ao PRD como mudança.
- **low** Deriva de textos e nomes:
  - "Só esta / Todas" (`lancamento.html`) contra "Aplicar a todos / Só este" (l.74).
  - "＋ Bloco" (Flow 3, l.157) contra "＋ Novo bloco".
  - A Fórmula legível aparece como "Rangel + Casal ÷ 2" (DESIGN.md l.223, subtítulo no mock) e como "Rangel + (Casal ÷ 2)" (Flow 3, PRD). FR-19 pede a forma legível com os parênteses que o Rafael montou.
  - O selo "Previsto" contra o "previsto pelo sistema" do PRD (FR-44, que diz "ex.", então é aceitável).

  *Fix:* padronizar textos e mostrar a Fórmula sempre com os parênteses digitados.
- **low** State Patterns fixa "Atrasado = vencimento + 10 dias" (l.95), mas FR-49 torna a tolerância configurável (e a própria IA a lista em Configurações). *Fix:* escrever "vencimento + tolerância (padrão 10 dias)".

## 8. Shape fit — strong

DESIGN.md segue a ordem canônica da spec (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts), e o frontmatter tem `name`, `description`, `colors`, `typography`, `rounded`, `spacing` e `components`. EXPERIENCE.md tem todas as seções dos exemplos (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Responsive & Platform, Inspiration & Anti-patterns, Key Flows), mais Mockups. Os Key Flows têm protagonista, momento, passos numerados e um **Clímax** marcado. Ponto menor: a tabela de Component Patterns não tem a coluna "Onde/Uso" do exemplo, e a rastreabilidade de FRs só existe na IA.

## 9. Contradições spines × PRD

### Findings
- **high** **FR-53: o formato da mensagem por Bloco não foi decidido.** O PRD diz: "O formato exato dos detalhes agrupados será definido no UX." Os spines não definem (a linha "Gerar mensagem", l.76, não descreve o corpo), e só o mock `gerar-mensagem.html` mostra um formato, que **omite** a linha "Total: R$ 2.819,68" do exemplo do PRD. Ficam em aberto: como agrupar operandos com − e ×; onde entram o Ajuste (FR-47, "linha própria logo abaixo da parcela") e os estornos negativos (FR-24); e se Lançamentos **já pagos** entram. O mock inclui "KOLINA … R$ 670,00", que está como Pago na grade. Também não estão repetidas as regras de paridade com FR-24 (só o Mês, sem R$ 0,00, sem Dívidas não vencidas). *Fix:* adicionar um bloco "Formato da mensagem" ao EXPERIENCE.md com o modelo FR-23 para Seleção e para Bloco, as regras de inclusão e exclusão (pagos? R$ 0,00, Dívidas, previstos), a linha de Ajuste, os negativos "- R$ 0,08" e a linha de Total.
- **high** **FR-25 × UJ-4: o Pagamento do Rangel.** Aplicar status usa "Valor recebido (padrão: total da Seleção)" e trata valor menor como parcial (l.77). Na UJ-4/FR-25, o Rangel paga o valor do **Bloco** (R$ 2.819,68), Rafael seleciona Casal + Rangel (total R$ 5.639,35) e tudo deve ficar **pago inteiro**. Seguindo o spine, ou o Pagamento é registrado como R$ 5.639,35 (valor que ele não recebeu, o que distorce o histórico FR-29), ou, se Rafael digitar o que recebeu, sobram R$ 2.819,67 pendentes por engano. O mock `recebimentos.html` reforça a ambiguidade: mostra o Saldo do Rangel como R$ 2.819,68, um valor de Bloco e não de Responsável, e um Pagamento de "Casal + Rangel · R$ 2.706,12". *Fix:* definir explicitamente um Flow "Rangel paga" e uma regra, por exemplo "Registrar pagamento do Bloco" (o valor recebido quita a Seleção do Bloco inteira) ou "Quitar inteiro, valor recebido = X", e definir se Recebimentos mostra o Saldo por Responsável (FR-26) ou por Bloco.
- **medium** O vermelho de "Senha incorreta" (EXPERIENCE.md l.89) contradiz o Don't do DESIGN.md (l.265); ver §2.
- **low** PRD §5 deixa o celular fora da v1. O spine acrescenta uma tela de celular com "resumo dos Blocos, só para leitura" (l.125), sem estados nem especificação. O memlog registra a confirmação, mas isso é escopo novo e precisa de dono. *Fix:* reduzir a tela ao aviso, ou registrar a tela como escopo aceito, com estados.
- **low** FR-21 pede edição de "qualquer linha ali mesmo". O spine resolve com um painel lateral, mantendo a grade visível. É uma interpretação razoável, mas está implícita. *Fix:* declarar em Component Patterns que "editar na grade" = painel lateral, para que o teste de aceite não espere edição na célula.

## Mechanical notes

- **Referências de token:** 0 referências quebradas em DESIGN.md (frontmatter + prosa) e EXPERIENCE.md (`{colors.accent}`, `{colors.verify}`, `{components.selection-bar}`, `{components.nav-rail}`, `{components.alert-warning}`).
- **Pares claro/escuro:** completos para as 24 cores de sistema. As cores de pessoa são as mesmas nos dois modos (decisão declarada), mas sem tokens de etiqueta por modo (§2). `selection-bar.foreground` é literal.
- **Contrastes calculados (WCAG):**

  | Combinação | Contraste | Resultado |
  |---|---|---|
  | branco / accent claro | 3,30 | falha |
  | text-muted / background | 5,12 (escuro 6,75) | passa |
  | verify / surface | 4,83 | passa |
  | forecast fg/bg | 6,15 | passa |
  | status-paid escuro | ~10 | passa |
  | status-unpaid escuro | ~9,8 | passa |
  | nav-icon / nav | 1,51 | falha |
  | etiquetas de pessoa, claro | 1,82–3,85 | 8/8 falham |
  | etiquetas de pessoa, escuro | 3,16–5,85 | 3/8 falham |

- **Conformidades confirmadas com o PRD:**
  - FR-6 "avisa, mas não bloqueia" foi respeitado (State "Diferença", l.92). O edge case do UJ-1, "antes de liberar a cobrança", foi corretamente resolvido em favor do FR-6.
  - FR-46 tempo real foi respeitado (l.98).
  - FR-24 × FR-53: os dois pontos de entrada estão distintos (barra de Seleção × 💬 do Bloco).
  - FR-51 reimportação foi respeitado (State + Flow 4).
  - FR-44 origem do previsto aparece no Painel do Lançamento.
- **Formatos (§6):** DD/MM/AA, HH:MM ("Salvo às 21:14"), "R$ 1.140,74" e "- R$ 0,08" / "- R$ 25,90" aparecem corretos nos spines e nos mocks; nenhum "-R$" ou "R$ -" foi encontrado. O formato de rótulo de Mês ("Out/26", "outubro/26", "Jul/26") não está no §6 e não está fixado no spine; vale declarar um.
- **Glossário:** Lançamento, Nome, Apelido, Tipo, Responsável, Lançado por, Status, Bloco, Fórmula, Seleção, Conferência, Dívida programada e Saldo pendente são usados ao pé da letra. A exceção é a colisão "Ajustes" (§7).
- **Mocks:** 15 arquivos, 15 linkados, 0 órfãos. Rascunhos em `.working/` (16 arquivos) não são referência, exceto `density-1.html`, citado no DESIGN.md.
- **ASSUMPTIONs abertas nos spines:** 7 (DESIGN l.207, l.232; EXPERIENCE l.22, l.66, l.73, l.76, l.108), mais 1 NOTE FOR UX (l.114). O memlog l.24 também pede "confirmar na revisão"; a confirmação aparece em l.27.
