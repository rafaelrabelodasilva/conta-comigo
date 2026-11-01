---
status: draft
stepsCompleted: [1]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-conta-comigo-2026-11-01/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md
---

# Conta Comigo - Epic Breakdown

## Overview

Este documento quebra em épicos e histórias implementáveis os requisitos do PRD, do UX (DESIGN.md + EXPERIENCE.md) e da Arquitetura do Conta Comigo v1. Escopo: PRD §4.1 a §4.10 e §5. As fases 2 (FR-37 a FR-40, iPhone) e 3 (FR-41 a FR-43, Fatura do Rangel) ficam fora.

## Requirements Inventory

### Functional Requirements

**4.1 Configuração inicial**
- FR-1: No primeiro uso o app não tem Responsáveis, Tipos, Status, Blocos nem modelo de mensagem. Um passo a passo guia a criação de cada um, e qualquer etapa pode ser pulada e retomada depois.
- FR-2: Importar as abas 01/2026 a 10/2026 da planilha "Cartão", mapeando Despesa → Nome, Valor, Parcela, Observação, Tipo, Resposabilidade → Responsável e Status dívida → Status, com Lançado por = Histórico. Cria Responsáveis, Tipos, Regras iniciais e parcelas em andamento. Linhas divididas na planilha (ex.: Monjaro) viram uma Divisão. No fim, mostra as Regras criadas para revisão.
- FR-50: Criar, renomear, editar e excluir Status, com a marca "conta como pago". Excluir um Status em uso avisa quantos Lançamentos o usam e pede um substituto.

**4.2 Importação da Fatura**
- FR-3: Enviar o PDF da Fatura e digitar a senha no app. Senha errada é avisada e pedida de novo. A senha não é guardada. Antes de gravar, mostra o vencimento e o Mês lidos para confirmação.
- FR-51: Reimportar um Mês já importado: avisa o que será substituído, quantos Lançamentos já têm Pagamento ou classificação manual, e só faz depois da confirmação. Reaplica Regras e parcelas herdadas. Contas manuais do Mês não são tocadas.
- FR-4: O PDF é usado só na importação. Guarda apenas os Lançamentos e os totais da Fatura (vencimento, fechamento, totais de despesas e créditos, saldo anterior, pagamentos, total a pagar).
- FR-5: Extrair todos os Lançamentos (despesas, parcelamentos, créditos, estornos) de todos os cartões, com Nome, data, Parcela, Valor e final do cartão, Lançado por = Fatura. O pagamento da fatura anterior não vira Lançamento. Créditos entram negativos e são classificáveis. Em 10/2026, exatamente 49 Lançamentos.
- FR-6: Conferência: soma das despesas = "Total despesas" e dos créditos = "Total de créditos" (10/2026: R$ 8.327,39 e R$ 639,62), também por cartão ("VALOR TOTAL" de cada final). Avisa sem bloquear. Linhas com dúvida ou do cartão com diferença ganham a marca "verificar" (não é Status) e há filtro "Verificar". O alerta fica no Painel até bater ou ser dispensado. Saldo anterior e pagamentos não entram.
- FR-36: Configurar dia de fechamento e de vencimento. A mudança vale a partir do próximo Ciclo. Cada Mês é aberto ou fechado. Lançamentos criados no app entram no Mês cujo Ciclo contém sua data. O fechamento não é usado na importação.
- FR-47: Ajuste de centavos: crédito sem Parcela, na mesma Fatura, com o mesmo Nome normalizado de uma parcela e valor absoluto abaixo do limite (padrão R$ 1,00) vira Ajuste da parcela, herda Tipo e Responsável, aparece junto com o líquido na grade e como linha "↳ Ajuste" na mensagem. Não altera previstos nem o casamento. Pode ser desvinculado.
- FR-7: Editar, incluir e excluir Lançamentos de uma Fatura importada, com a Conferência recalculada na hora.

**4.3 Classificação e aprendizado**
- FR-44: Para cada parcela n/N com n < N, criar os previstos n+1/N até N/N nos Meses seguintes, com mesmo Nome, Apelido, Valor, Tipo, Responsável, Divisão e Observação, Lançado por = Sistema. Selo "previsto" em todas as telas, origem visível ao tocar. Reclassificar a parcela atual pergunta se aplica aos previstos. Contas manuais seguem a mesma lógica.
- FR-45: Casar os Lançamentos extraídos com os previstos do Mês por Nome normalizado e Parcela: casou → vira real mantendo classificação e Apelido; valor diferente → usa o da Fatura e vai para a fila; previsto sem par → continua previsto, fora da Conferência, vai para a fila; real sem previsto → fluxo normal. Previstos não entram na Conferência nem na mensagem de Mês sem Fatura, salvo escolha.
- FR-8: Parcela n/N (n > 1) sem previsto, que corresponde à n−1/N do Mês anterior (mesmo Nome normalizado e Valor), herda Apelido, Tipo, Responsável, Divisão e Observação.
- FR-9: Lançamento à vista com Regra recebe a classificação dela, tolerando variações de Nome (DM*SPOTIFY, EBN SPOTIFY…). Histórico com Responsáveis diferentes → sugere o mais frequente e manda para a fila.
- FR-10: Classificar um Lançamento cria ou atualiza a Regra daquele Nome, sem confirmação.
- FR-11: Para Nome sem histórico, sugerir Tipo (e Responsável quando houver pista). Sempre passa pela fila. (Arquitetura: `tipo_sugerido` vem na própria extração do Gemini.)
- FR-12: Ver, editar e apagar Regras. Editar pergunta se reaplica aos Lançamentos do Mês atual.

**4.4 Revisão**
- FR-13: Fila com os não classificados e os sugeridos, agrupados por Nome, com sugestão visível, confirmação em um toque e contador "faltam N" que chega a zero.
- FR-14: Selecionar vários e atribuir de uma vez Tipo, Responsável, Status e Observação.
- FR-15: Dividir um Lançamento em 2+ linhas por valor ou proporção, cada uma com Responsável e Status. A soma é sempre o Valor original, com os centavos na última parte. As partes mantêm Nome e Parcela e ficam ligadas ao original.
- FR-52: Dar, trocar ou remover Apelido, perguntando se aplica aos outros Lançamentos com o mesmo Nome (inclusive previstos). O Apelido substitui o Nome nas telas e na mensagem; o Nome fica no detalhe.

**4.5 Contas manuais**
- FR-16: Cadastrar Conta manual com Nome, Valor, Tipo, Responsável ou Divisão, Observação, Mês inicial e duração (mensal até encerrar ou N parcelas).
- FR-17: Gerar os Lançamentos das Contas ativas em cada Mês, Lançado por = Manual, Parcela n/N quando parcelada, já classificados, fora da fila. Meses futuros mostram como previstos.
- FR-18: Encerrar ou alterar uma Conta manual, valendo do Mês atual em diante.

**4.6 Painel do Mês**
- FR-19: Criar, renomear, reordenar e apagar Blocos, montando a Fórmula por seleção (Responsáveis, Tipos, "Todos", Responsável em Tipo, + − × ÷, números, parênteses), sem texto livre, com Fórmula legível e resultado ao vivo. Fórmula inválida não salva. Nenhum Bloco vem pronto.
- FR-20: Tocar num Bloco filtra a grade pelos Lançamentos da Fórmula; tocar de novo desfaz; há "Limpar filtros". Em soma simples, o total da grade filtrada = valor do Bloco.
- FR-21: Grade com as colunas da planilha (Nome ou Apelido, Valor, Parcela, Tipo, Responsável, Lançado por, Status), Observação ao abrir, filtros por qualquer coluna e edição de qualquer linha.
- FR-22: Trocar o Mês do Painel para passados e futuros (com previstos). Ao abrir o app, sempre o Mês atual.

**4.7 Seleção e Mensagem de cobrança**
- FR-23: Configurar o modelo da mensagem: saudação, frase do total, chave Pix, rodapé e campos da linha de detalhe (Nome ou Apelido, Parcela, Valor).
- FR-48: Marcar Lançamentos um a um ou "selecionar todos" do filtro. Barra sempre visível com quantidade e soma, atualizada a cada toque.
- FR-24: "Gerar mensagem" a partir da Seleção, com o modelo, o total e os detalhes, e "Copiar". Estornos como linhas negativas. Só o Mês da mensagem. Sem Dívidas programadas não vencidas. Lançamentos de R$ 0,00 nunca entram.
- FR-53: Botão "Mensagem" em cada Bloco: total = resultado da Fórmula, detalhes agrupados por operando com a operação aplicada (formato do EXPERIENCE.md). Mesmas regras do FR-24.
- FR-54: Cálculo passo a passo de qualquer Bloco: subtotal por operando, cada operação e resultado. Precedência usual. Cálculo em centavos com arredondamento só no final, meio para cima. Bloco, passo a passo e mensagem sempre iguais. Aceite: Casal R$ 5.639,35; Casal ÷ 2 = R$ 2.819,68; Total R$ 9.280,23; Mãe R$ 1.350,14; Lucas R$ 215,16.

**4.8 Recebimentos e Meses anteriores**
- FR-25: Aplicar Status que conta como pago a uma Seleção de qualquer Mês, com data (padrão hoje), registrando um Pagamento. Valor recebido menor → pergunta: "Fica pendente" (quita do mais antigo ao mais novo, o último fica Pago parcialmente) ou "Não é dívida, é a minha parte" (tudo pago, Pagamento registra o valor recebido). Pagamento pode ser desfeito.
- FR-26: Em Recebimentos, um cartão por Bloco de cobrança com Saldo pendente (Fórmula do Bloco sobre os não pagos de todos os Meses) e a lista desses Lançamentos com Mês e restante.
- FR-27: Marcar Lançamentos como Dívida programada, com vencimento combinado. Aparecem em "A receber", entram na mensagem no Mês do vencimento e ficam atrasados se não pagos depois dele.
- FR-28: Em Recebimentos, selecionar os não pagos de um Responsável e gerar mensagem com o mesmo modelo, agrupada por Mês.
- FR-49: Não pago até o vencimento da Fatura + tolerância (padrão 10 dias) fica "Atrasado": destacado na grade e em Recebimentos e filtrável. Dívida programada usa o vencimento combinado.
- FR-29: Consultar todos os Pagamentos de um Responsável, com data, valor e Lançamentos quitados.
- FR-30: Seção com, por Mês, saldo anterior, pagamentos da Fatura e resíduo entre Meses (ex.: R$ 25,90 em 10/2026).

**4.9 Previsão e finanças pessoais**
- FR-31: Gasto do Rafael por Tipo no Mês selecionado, usando o "meu Bloco" escolhido.
- FR-32: Comprometido nos próximos Meses a partir dos previstos, no total, por Responsável e por Tipo. Abrir um Mês futuro no Painel mostra os Blocos com os previstos.
- FR-33: Evolução dos totais por Tipo e Responsável nos últimos 6 Meses, com gráfico simples.

**4.10 Acesso, edição e aparelhos**
- FR-34: Só Rafael acessa, com login. Dados iguais no PC e no iPad.
- FR-46: Editar e excluir qualquer Lançamento, Conta manual, Pagamento, Regra, Bloco, Responsável, Tipo e Status, com todos os totais recalculados na hora em todas as telas e aparelhos. Excluir parcelado ou Conta manual pergunta sobre os previstos. Editar ou excluir algo com Pagamento avisa o efeito no Saldo pendente. Excluir cadastro em uso pede substituto ou arquiva.
- FR-55: Lembretes por notificação (app instalado e permissão dada) e faixa no app: no dia do fechamento e quando alguém passa a ter itens atrasados. Cada tipo pode ser desligado.
- FR-35: Instalar o web app na tela inicial do iPad, sem App Store.

### NonFunctional Requirements

- NFR1 (Precisão): nenhum valor perdido ou duplicado na extração, Divisão, casamento de previstos, reimportação ou Pagamentos. Valores em centavos, sem arredondamento acumulado.
- NFR2 (Privacidade): dados financeiros acessíveis só ao Rafael. Nem o PDF nem a senha são guardados. (Desvio aceito: o texto da Fatura, sem CPF, endereço e número do cartão, vai ao Gemini gratuito.)
- NFR3 (Desempenho): importar e classificar uma Fatura de cerca de 50 Lançamentos em menos de 1 minuto.
- NFR4 (Formatos): datas DD/MM/AA, horas HH:MM (24 h), valores "R$ 1.140,74", negativos "- R$ 0,08", meses "Out/26" e "outubro/26", interface em português, em todas as telas e mensagens.
- NFR5 (Tempo real): qualquer mudança aparece em todas as telas e aparelhos abertos sem recarregar.
- NFR6 (Plataforma): v1 para iPad Pro 11" (M4, iPadOS 18+) e PC no navegador. Celular (< 700 px) mostra só um aviso e os Blocos do Mês em leitura.
- NFR7 (Sem internet): só leitura do que já foi carregado; toda ação de gravar avisa "Sem conexão…".
- NFR8 (Acessibilidade): toque mínimo 44 × 44 pt, contraste ≥ 4,5:1 nos dois modos, informação nunca só por cor, texto do sistema até 130%, rótulos de VoiceOver definidos.
- NFR9 (Métricas): fechamento do Mês em menos de 10 minutos (SM-1) e ≥ 55% dos Lançamentos classificados sem revisão desde o primeiro Mês (SM-2).

### Additional Requirements

Da Arquitetura (ARCHITECTURE-SPINE.md, final):

- **Starter (Epic 1, Story 1):** `create-next-app --ts --tailwind --app --src-dir` com Next.js 16.3.x (piso 16.2.11), React 19, TypeScript 6.x (sem `baseUrl`), Tailwind 4, Cache Components desligado; shadcn/ui (base Radix) ajustado aos tokens; Vitest; Supabase CLI fixada; estrutura `src/{domain,data,features,ui,server,app}`, `src/proxy.ts`, `supabase/migrations`.
- Núcleo puro em `src/domain` (AD-1): só TS e zod 4, imports relativos, "hoje" e Mês aberto como parâmetro; toda regra de negócio vive ali, com testes Vitest.
- Dinheiro em centavos inteiros e um único arredondamento (meio para longe do zero); Divisão com a última parte recebendo a diferença; formatador próprio (sem `Intl` direto) (AD-2).
- Supabase como única fonte da verdade; detector de conexão único; service worker só com o casco; gravação só das colunas alteradas (AD-3).
- Gerenciador único de Realtime em `src/data/realtime.ts`; ouvintes antes do `subscribe()`; releitura ao reconectar; RPCs devolvem linhas afetadas; `updated_at` decide; `replica identity full`; totais calculados nunca gravados, totais da Fatura gravados (AD-4).
- Supabase Auth e-mail + senha, cadastro público desligado, "Esqueci a senha"; `owner_id default auth.uid()` + RLS em toda tabela; chaves `sb_publishable_…` / `sb_secret_…`; sessão renovada em `proxy.ts` com `getClaims()` (AD-5).
- Chaves de identidade: `normalizarNome` (previstos, Ajustes, "mesmo Nome") e `chaveDeRegra` (Regras, com `versao_normalizacao`); `lancado_por` enum fechado; `regrasRepo.aprender()` é o único que grava Regra; Divisão de Regra em frações (AD-6).
- Pipeline de importação: pdf.js legacy só no cliente → remoção de CPF/endereço/número do cartão no aparelho → `POST /api/fatura/extrair` (Node, `maxDuration 60`, uma chamada Gemini, `GEMINI_MODEL`, `responseJsonSchema` via `z.toJSONSchema`, inclui `tipo_sugerido` e `duvida`) → validação zod → Conferência, Ajustes, casamento, classificação no núcleo → RPC atômica `importar_fatura` com checagem de concorrência (AD-7).
- Reimportação preserva `id`, classificação e Pagamentos das linhas casadas; linhas sem par e com Pagamento ficam com `revisao_motivo = 'sumiu_na_reimportacao'`; nunca apaga Série com parcela em outro Mês (AD-7.6).
- Série com chave `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)`; linha-mãe única por `(serie_id, parcela_n)`; casamento 1-para-1 determinístico; Divisão como `divisao jsonb` na mãe com filhas recriadas pela RPC `dividir_lancamento`; Ajuste aponta para a mãe (AD-8).
- `mes` (AAAA-MM) fixado na criação por três regras; Ciclo com `vigente_desde`; fuso `America/Sao_Paulo`; `vencimentoDoMes` (AD-9).
- `ehPago`, `restante`, "Pago parcialmente" e `estaAtrasado` como funções únicas; Status padrão em `configuracoes`; RPC `aplicar_pagamento`; itens com `status_anterior_id`/`status_aplicado_id`; regras de desfazer (AD-10).
- Fórmula em `jsonb` validada por zod; `avaliar(formula, linhas)` só recebe `projetarPainel`, `projetarPendente` ou `projetarMensagem`; "meu Bloco" único (AD-11).
- Segredos (`GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) só no servidor; rotas `/api` exigem sessão, `/api/cron/*` exige `CRON_SECRET` (AD-12).
- Vercel Cron diário `0 12 * * *` UTC → `GET /api/cron/diario`: materializa Contas manuais e envia lembretes (Web Push via `web-push`); dedup em `lembretes_enviados` antes do envio; inscrições 404/410 apagadas; permissão só por gesto, com app instalado (AD-13).
- Schema só por migração, tipos gerados em `src/data/database.types.ts` (AD-14).
- RPC idempotente `materializar_contas_manuais(ate_mes)`, horizonte Mês atual + 12, uma Série por Conta com `divisao`, alteração só em linhas futuras sem Pagamento e sem edição (AD-15).
- Exclusão lógica (`excluido_em`) com "Desfazer"; índices únicos parciais; `arquivado` em Responsável/Tipo/Status; RPC `substituir_cadastro` com `REFERENCIAS_JSONB` (AD-16).
- Operação: Supabase Free + Vercel Hobby; backup semanal com `supabase db dump` criptografado com `age` em GitHub Actions (artifact, 90 dias); teste de restauração antes do primeiro uso real (AD-17).
- Ambientes: `main` → Vercel Production + Supabase de produção (`supabase db push` após merge); PRs → Vercel Preview com Supabase local ou projeto de dev; nunca Preview em produção.
- Colunas obrigatórias: `faturas unique (owner_id, mes)`, `fatura_cartoes`, `lancamentos.{ordem_fatura, fatura_id, duvida_extracao, origem_lancamento_id, editado_em, revisao_motivo, revisao_dados}`, `faturas.alerta_dispensado_em`, `configuracoes`, `push_inscricoes`, `lembretes_enviados`.
- Testes de aceite obrigatórios: números de 10/2026 (Blocos, 49 Lançamentos, Conferência), Monjaro R$ 310,67 + R$ 155,33, duas compras idênticas na mesma Fatura, reimportação de Mês com Pagamento. Fixtures sem CPF, endereço nem número de cartão.
- CI (lint, typecheck, testes) e monitoramento de erros definidos na primeira story de infraestrutura; logs nunca com texto de Fatura nem valores.

### UX Design Requirements

**Tokens e base visual**
- UX-DR1: Implementar os tokens do DESIGN.md como variáveis CSS e tema do Tailwind, nos modos claro e escuro: fundo/superfície/bordas/textos grafite, `nav`, `accent` (#15803D) e `accent-line` (#16A34A), `accent-dark` (#22C55E), 8 cores de pessoa com pares `person-N-fg/bg` por modo, estados (`status-*`, `forecast-*`, `verify`), `danger-*`, `alert-warning-*`, `focus-ring`, `selection`, `scrim`. Nenhuma cor literal em componente.
- UX-DR2: Tipografia do sistema com os papéis `hero-value` 34/700, `block-value` 20/700, `title` 17/700, `body` 13, `body-strong`, `number` 13 tnum, `label` 12/600, `eyebrow` 12 maiúsculas, `caption` 11, `nav-label` 10, `message` mono 12,5; algarismos tabulares nos números.
- UX-DR3: Espaçamento de 4 em 4 px (`spacing.1`…`6`), `rail-width`, `side-panel`, `row-height` 44 pt, `icon-button`; raios `lg` 14, `md` 10, `sm` 6, `full`; sombras só em flutuantes; véu 40% / 60%.
- UX-DR4: Modo claro/escuro seguindo o sistema, com opção de fixar em Configurações → Aparência.

**Componentes reutilizáveis**
- UX-DR5: `nav-rail` com 6 itens (Painel, Revisar com contador `verify`, Receber, Previsão, Contas, Config.), ícones de traço 22 px, item ativo com fundo branco 8% e ícone `accent-line`; atalhos ⌘/Ctrl + 1…6 no PC.
- UX-DR6: `month-switcher` "◀ Out/26 ▶" com setas de 44 pt e popover de meses com selo "Previsto" nos futuros; trocar de Mês mantém filtros e limpa a Seleção com aviso.
- UX-DR7: `invoice-hero` com sobrelinha, total em `hero-value`, barra de distribuição por Responsável (toque filtra), legenda, selo "✓ Conferido" ou "⚠ Diferença de R$ X" (toque aplica "Verificar") e mini-cartões "Recebido no mês" e "Falta receber" (toque abre Recebimentos); variante "Fatura ainda não importada".
- UX-DR8: `block-card` com bolinha da pessoa, valor em `block-value`, subtítulo com contagem ou Fórmula legível com parênteses, botões ⋯ e 💬 no rodapé (44 pt de toque), estado ativo com borda `accent-line`; cartão dos Blocos com "＋ Novo bloco" e "Reordenar" (tremor + arrastar + "Concluir").
- UX-DR9: `filter-bar` com `search-field` (só Mês aberto, filtra ao digitar), `filter-chip` por coluna (Responsável, Tipo, Status, Lançado por, Parcela, cartão) com popover de múltipla escolha, contagem, "Limpar" e "Aplicar"; pílula "Bloco: Nome ✕"; "Verificar"; "Limpar filtros"; E entre colunas, OU dentro da coluna; "Mais ▾" quando não couber.
- UX-DR10: `grid-row` com colunas caixa, Nome (Apelido em negrito + Nome em cinza), Parcela, Valor à direita, Tipo, Responsável (etiqueta), Lançado por (contornado), Status (selo); ordem padrão = ordem da fatura com Contas manuais no fim; ordenação por cabeçalho; cabeçalho fixo; rolagem lateral com caixa e Nome fixos; "↳" e recuo de 16 px para divididas e Ajuste com líquido; selo "Previsto"; bolinha "verificar"; toque na caixa seleciona, no resto abre o painel; toque longo ou ⋯ abre o menu.
- UX-DR11: Caixa do cabeçalho seleciona todos os Lançamentos do filtro, inclusive os não visíveis.
- UX-DR12: `selection-bar` presa embaixo, "N selecionados · R$ total" atualizado a cada toque, ações "Limpar", "Aplicar status", "⋯ Mais" (Programar dívida, Classificar em lote, Excluir) e "Gerar mensagem"; Seleção sempre de um único Mês; anúncio do total ao VoiceOver.
- UX-DR13: `person-tag` (pílula com `person-N-bg/fg`; toque filtra) e `status-pill`; a linha nunca é pintada com cor de pessoa ou Status.
- UX-DR14: `side-panel` do Lançamento: editáveis (Apelido, Tipo, Responsável, Status, Observação, Dívida programada, Valor e data), somente leitura (Nome, Parcela, cartão, Lançado por, origem), salvar ao sair do campo com "Salvando… / Salvo às HH:MM / Não salvo, tentando de novo", Conferência ao vivo ao mudar Valor, `inline-question` "Só este / Aplicar a todos", rodapé com "Dividir" e "Excluir", faixa "alterado em outro aparelho às HH:MM"; 70% da largura no iPad em pé.
- UX-DR15: Janela "Dividir lançamento" por valor ou proporção, "＋ Parte" com Responsável e Status por parte, rodapé "Soma das partes: R$ X de R$ X ✓" liberando "Dividir" só quando bate, modo edição com "Desfazer divisão" e aviso de Divisão vinda de Regra.
- UX-DR16: Janela "Montador de Bloco": nome, área da Fórmula com borda tracejada e `formula-chip` removíveis por toque, paleta (`palette-chip` de Responsáveis, Tipos, "Responsável em Tipo", "Todos", "Número…", `operator-key` 44 × 44, parênteses), resultado e passo a passo ao vivo, "Salvar" desativado com a razão ("Falta fechar um parêntese", "Divisão por zero", "A fórmula termina com uma operação"), opções "Usar em Recebimentos" e "É o meu Bloco", modo só leitura "Ver cálculo".
- UX-DR17: Janela "Gerar mensagem" com quadro `message`, aviso dos itens que ficaram de fora, interruptor "Incluir previstos" (só Mês sem Fatura), "Copiar" (fecha e mostra "Copiado"), "Editar modelo", "Fechar", estado "Nada a cobrar nesta seleção" e falha de cópia com texto selecionável; três formas (Seleção, Bloco, Cobrar pendências) conforme "Formato da mensagem".
- UX-DR18: Janela "Aplicar status" com lista de Status, Data e Valor recebido quando conta como pago, `cartões de opção` alinhados para "Fica pendente" / "Não é dívida, é a minha parte" (rádio 18 px, mesma altura, valor sem quebra), validação "não pode passar de R$ X" e aviso "N lançamentos marcados como pagos · Desfazer".
- UX-DR19: Janela "Programar dívida" com data obrigatória e observação; selo "Programada · DD/MM/AA".
- UX-DR20: Janela "Importar fatura" em 3 passos (PDF, senha, conferência e resumo) com `progress` por etapa ("Abrindo PDF", "Lendo lançamentos", "Conferindo", "Classificando"), "Cancelar" em qualquer passo sem gravar, e os estados senha errada, não é Santander, extração incompleta, conexão perdida e Mês já importado.
- UX-DR21: `review-item` de 64 pt em colunas fixas 30 / 1fr / 210 / 84 / 104, com as 5 variantes (sugestão, sem sugestão, valor mudou, não veio na fatura, Ajuste), seletores "Mudar" com os mais usados primeiro, ações em lote "Aplicar sugestões", "Responsável…", "Tipo…", faixa de resumo da importação e contador "Faltam N".
- UX-DR22: Cartão de Recebimentos (etiqueta, selo Em dia / Não pago / Atrasado, Saldo pendente, meses em aberto, "Ver" e "Cobrar pendências"), lista "A receber", Histórico de Pagamentos com detalhe e "Desfazer pagamento", tabela "Meses anteriores da Fatura".
- UX-DR23: Previsão com 3 abas lembradas, `chart-bar` empilhado por pessoa, seletor "Por Responsável / Por Tipo", tabela Responsável × Mês, barras horizontais do "meu Bloco" por Tipo com valor e %.
- UX-DR24: Contas manuais: lista (Ativas/Encerradas/Todas, ⋯ Editar/Encerrar/Excluir) e formulário (repetição, parcelas, "Começa em", Divisão com partes "Mensal" ou "Dívida programada" com data, aviso "Vale a partir de Mmm/AA", "Encerrar" pergunta o Mês).
- UX-DR25: Configurações com lista de seções à esquerda e conteúdo à direita: Responsáveis (nome + seletor de 8 cores em círculos de 24 px com ✓, sem repetir), Tipos, Status (conta como pago + contagem), Regras aprendidas (busca, reaplicar, excluir), Blocos de cobrança e "meu Bloco", Modelo da mensagem (campos, marcador {total}, caixas da linha de detalhe, prévia ao vivo), Ciclo do cartão, Conferência e atraso, Aparência (tema e lembretes), Importar planilha (abas, progresso, resumo) e Sair.
- UX-DR26: Seletores de formulário como `form-field` (valor + ▾), nunca botões preenchidos; campo extra ao lado quando a opção pede dado.
- UX-DR27: Botões primário (`accent`), secundário (contornado) e destrutivo (`danger-fg`), altura 44 pt, compactos de 30 px com toque de 44 pt; campos de 44 pt com erro em `danger-fg`.
- UX-DR28: `toast` de 6 s com "Desfazer" (um substitui o outro); `offline-banner` "Sem conexão. Você pode consultar, mas não alterar"; `skeleton` sem tela branca e sem esqueleto ao recalcular.

**Estados, fluxos e plataforma**
- UX-DR29: Entrar (e-mail, senha, "Esqueci a senha"), "Sua sessão expirou. Entre de novo" e Primeiro uso em tela cheia (Responsáveis → Tipos → Status → Importar planilha → Blocos → Mensagem → Ciclo, cada passo pulável).
- UX-DR30: Todos os estados vazios e de erro do EXPERIENCE.md (sem Blocos, Mês sem Fatura com "inclui previstos", Mês fechado com selo, filtro sem resultado, fila vazia, ninguém deve nada, sem Blocos de cobrança, sem previstos/pouco histórico, sem Contas manuais, sem Regras, erro ao carregar).
- UX-DR31: Layouts responsivos: iPad deitado 1194 pt (fatura 40% / Blocos 60% em linhas de 3), iPad em pé 834 pt (fatura em largura total, Blocos em 3 colunas, grade com rolagem lateral, filtros com "Mais ▾"), PC ≥ 1280 px (grade com todas as colunas), celular < 700 px (aviso + Blocos em leitura).
- UX-DR32: Interações: toque como ação principal, toque longo = ⋯, arrastar só em "Reordenar", Esc/Enter/⌘A no PC, anel de foco de 2 px, confirmação só nas destrutivas, "Desfazer" nas demais, perguntas sempre "Só este / Aplicar a todos".
- UX-DR33: Acessibilidade: toque 44 × 44 pt, contraste ≥ 4,5:1 (bordas e ícones ≥ 3:1), texto do sistema até 130%, VoiceOver (linha lida como "Nome, Valor, Parcela, Responsável, Status"; "Gerar mensagem do Bloco {nome}"; "Ações do Bloco {nome}"; "verificar este lançamento").
- UX-DR34: Voz e tom: termos do Glossário, botões que dizem o que fazem, avisos com o que aconteceu e o que fazer, confirmações curtas; textos de erro vêm do mapa único `codigo → mensagem`.

### FR Coverage Map

{{requirements_coverage_map}}

## Epic List

{{epics_list}}
