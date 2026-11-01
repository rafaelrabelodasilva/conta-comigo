---
status: draft
stepsCompleted: [1, 2]
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

| FR | Épico | Resumo |
| --- | --- | --- |
| FR-1 | 1 | Começar do zero, passo a passo do Primeiro uso |
| FR-2 | 3 | Importar histórico da planilha (.xlsx) |
| FR-3 | 2 | Importar PDF protegido com senha |
| FR-4 | 2 | Não guardar o PDF, só Lançamentos e totais |
| FR-5 | 2 | Extrair os Lançamentos |
| FR-6 | 2 | Conferência geral e por cartão, marca "verificar" |
| FR-7 | 2 | Corrigir a extração |
| FR-8 | 3 | Herdar parcelas em andamento |
| FR-9 | 3 | Aplicar Regras |
| FR-10 | 3 | Aprender com a revisão |
| FR-11 | 3 | Sugerir Tipo para Nomes novos |
| FR-12 | 3 | Gerenciar Regras |
| FR-13 | 3 | Fila de revisão |
| FR-14 | 3 | Classificar em lote |
| FR-15 | 3 | Dividir um Lançamento |
| FR-16 | 5 | Cadastrar Conta manual |
| FR-17 | 5 | Gerar Lançamentos das Contas manuais |
| FR-18 | 5 | Encerrar ou alterar Conta manual |
| FR-19 | 4 | Montar Blocos |
| FR-20 | 4 | Filtrar a grade pelo Bloco |
| FR-21 | 2 | Grade de Lançamentos |
| FR-22 | 2 | Navegar entre Meses |
| FR-23 | 4 | Modelo da mensagem |
| FR-24 | 4 | Mensagem a partir da Seleção |
| FR-25 | 6 | Aplicar Status "Pago" e registrar Pagamento |
| FR-26 | 6 | Saldo pendente por Bloco de cobrança |
| FR-27 | 6 | Dívida programada |
| FR-28 | 6 | Cobrar pendências |
| FR-29 | 6 | Histórico de Pagamentos |
| FR-30 | 6 | Meses anteriores da Fatura |
| FR-31 | 7 | Gasto do Rafael por Tipo |
| FR-32 | 7 | Previsão dos próximos Meses |
| FR-33 | 7 | Evolução entre Meses |
| FR-34 | 1 | Entrar e sincronizar |
| FR-35 | 1 | Instalar como app |
| FR-36 | 1 | Ciclo da Fatura |
| FR-44 | 3 | Lançar as parcelas futuras (previstos) |
| FR-45 | 3 | Casar previstos com a Fatura real |
| FR-46 | 1 (base) + todos | Editar e excluir com atualização imediata; cada épico cobre suas entidades |
| FR-47 | 2 | Ajustes de centavos |
| FR-48 | 4 | Selecionar e ver o total |
| FR-49 | 6 | Atraso |
| FR-50 | 1 | Gerenciar Status |
| FR-51 | 3 (+ 6) | Reimportar um Mês; o caso com Pagamento é testado no Épico 6 |
| FR-52 | 3 | Dar Apelido |
| FR-53 | 4 | Mensagem a partir de um Bloco |
| FR-54 | 4 | Cálculo passo a passo do Bloco |
| FR-55 | 7 | Lembretes |

## Epic List

### Epic 1: Entrar e montar a base
Rafael entra no app pelo iPad e pelo PC com os dados sincronizados em tempo real, instala o app na tela inicial e monta seus cadastros (Responsáveis com cor, Tipos, Status e Ciclo do cartão) pelo Primeiro uso ou por Configurações. Inclui a fundação: projeto, banco protegido, tokens visuais, menu, modo sem internet e backup.
**FRs covered:** FR-1, FR-34, FR-35, FR-36, FR-50, FR-46 (cadastros, exclusão lógica, arquivar e substituir)

### Epic 2: Importar a fatura e conferir
Rafael sobe o PDF da fatura com a senha e vê todos os Lançamentos do Mês na grade do Painel, com a Conferência geral e por cartão, a marca "verificar", os Ajustes de centavos, a correção à mão (inclusive classificar Responsável, Tipo e Status pelo painel do Lançamento) e a navegação entre Meses. Começa por uma prova técnica com a fatura de outubro no iPad.
**FRs covered:** FR-3, FR-4, FR-5, FR-6, FR-7, FR-21, FR-22, FR-47

### Epic 3: Classificar quase sozinho
Rafael importa o histórico de 2026 (.xlsx) e o app passa a classificar sozinho: aplica Regras, herda parcelas, cria e casa os previstos e sugere Tipos. O que sobra vai para a fila do Revisar, com ações de um toque, em lote, Divisão e Apelido. Também é possível gerenciar as Regras e reimportar um Mês.
**FRs covered:** FR-2, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-44, FR-45, FR-51, FR-52

### Epic 4: Blocos e mensagem de cobrança
Rafael monta os Blocos por fichas, vê o cálculo passo a passo, filtra a grade pelo Bloco, seleciona Lançamentos com o total sempre visível e gera e copia a mensagem do WhatsApp a partir da Seleção ou do Bloco.
**FRs covered:** FR-19, FR-20, FR-23, FR-24, FR-48, FR-53, FR-54

### Epic 5: Contas manuais
Rafael cadastra contas fora do cartão (como a Bombinhas, com Divisão) que se repetem sozinhas nos Meses seguintes, e pode alterá-las e encerrá-las sem mexer no passado.
**FRs covered:** FR-16, FR-17, FR-18

### Epic 6: Recebimentos
Rafael registra quem pagou (total, "fica pendente" ou "minha parte"), desfaz Pagamentos e acompanha em Recebimentos o Saldo pendente de cada Bloco de cobrança, as Dívidas programadas, os atrasados, o histórico de Pagamentos e os Meses anteriores da fatura, e cobra pendências.
**FRs covered:** FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-49 (e o caso de reimportação com Pagamento do FR-51)

### Epic 7: Previsão e lembretes
Rafael vê quanto está comprometido nos próximos Meses, a evolução dos últimos 6 Meses e o próprio gasto por Tipo, e recebe lembretes no dia do fechamento e quando alguém atrasa.
**FRs covered:** FR-31, FR-32, FR-33, FR-55

## Epic 1: Entrar e montar a base

Rafael entra no app pelo iPad e pelo PC com os dados sincronizados em tempo real, instala o app na tela inicial e monta seus cadastros (Responsáveis com cor, Tipos, Status e Ciclo do cartão) pelo Primeiro uso ou por Configurações. Inclui a fundação: projeto, banco protegido, tokens visuais, menu, modo sem internet e backup.

### Story 1.1: Criar o projeto e publicá-lo na Vercel

As a Rafael,
I want o projeto do Conta Comigo criado e publicado num endereço próprio,
So that cada história seguinte já chegue ao iPad e ao PC assim que for concluída.

**Acceptance Criteria:**

**Given** o repositório `conta-comigo` sem código de app
**When** o projeto é criado com `create-next-app --ts --tailwind --app --src-dir` (Next.js 16.3.x, React 19, TypeScript 6.x sem `baseUrl`, Tailwind 4, Cache Components desligado)
**Then** existem as pastas `src/domain`, `src/data`, `src/features`, `src/ui`, `src/server`, `src/app` e `supabase/migrations`, conforme o Structural Seed
**And** `src/domain` só usa imports relativos e uma regra de lint impede que importe `src/data`, `src/ui`, `src/app`, Next.js ou Supabase (AD-1)

**Given** o projeto criado
**When** `npm test` roda
**Then** o Vitest executa ao menos um teste de exemplo do núcleo e passa
**And** existe um workflow de CI no GitHub Actions que roda lint, typecheck e testes em todo push e PR

**Given** um projeto Supabase de produção e outro de desenvolvimento (plano Free) e um projeto Vercel (Hobby) ligado ao repositório
**When** a branch `main` recebe um push
**Then** a Vercel publica em Production apontando para o Supabase de produção
**And** os Previews de PR apontam só para o Supabase de desenvolvimento, nunca para o de produção
**And** a Supabase CLI está fixada no `package.json` e `supabase start` sobe o banco local
**And** nenhuma variável secreta usa o prefixo `NEXT_PUBLIC_` (AD-12)

### Story 1.2: Entrar com e-mail e senha

As a Rafael,
I want entrar no app com meu e-mail e senha, e só eu,
So that meus dados financeiros fiquem protegidos (FR-34).

**Acceptance Criteria:**

**Given** o Supabase Auth com cadastro público desligado e o usuário do Rafael criado
**When** Rafael abre o app sem sessão
**Then** aparece a tela Entrar com e-mail, senha, "Entrar" e "Esqueci a senha" (UX-DR29)
**And** com credenciais corretas ele entra e vê o app; com credenciais erradas aparece a mensagem de erro do mapa `codigo → mensagem`, sem dizer qual campo errou

**Given** a tela Entrar
**When** Rafael toca em "Esqueci a senha" e informa o e-mail
**Then** o Supabase envia o e-mail de redefinição e o app mostra a confirmação

**Given** uma sessão aberta
**When** o app carrega qualquer página
**Then** `src/proxy.ts` renova a sessão com `getClaims()`
**And** se a sessão expirou, o app volta para Entrar com "Sua sessão expirou. Entre de novo"

**Given** o cliente Supabase do navegador
**When** o código é publicado
**Then** o navegador usa só a chave `sb_publishable_…` e a `sb_secret_…` existe só no servidor (AD-5, AD-12)
**And** existe uma opção "Sair" que encerra a sessão neste aparelho

### Story 1.3: Visual base e menu lateral

As a Rafael,
I want o app com as cores, fontes e o menu do DESIGN.md, em modo claro e escuro,
So that eu navegue entre as telas como no UX aprovado.

**Acceptance Criteria:**

**Given** o DESIGN.md
**When** os tokens são implementados
**Then** todas as cores (grafite, `nav`, `accent`, `accent-line`, `accent-dark`, 8 cores de pessoa com `fg/bg` por modo, estados, `danger`, `alert-warning`, `focus-ring`, `selection`, `scrim`), a tipografia (papéis de `hero-value` a `message`, com tnum nos números), o espaçamento, os raios e as sombras viram variáveis CSS e tema do Tailwind (UX-DR1, UX-DR2, UX-DR3)
**And** os componentes shadcn/ui (base Radix) usam esses tokens, sem cor literal, com botões e campos de 44 pt e versões compactas de 30 px mantendo 44 pt de toque (UX-DR27)

**Given** o app aberto
**When** Rafael navega
**Then** o `nav-rail` mostra Painel, Revisar, Receber, Previsão, Contas e Config., nessa ordem, com o item ativo destacado (UX-DR5)
**And** cada item abre uma tela com título e estado vazio provisório
**And** no PC, ⌘/Ctrl + 1…6 troca de tela e há anel de foco de 2 px na navegação por teclado

**Given** o sistema em modo escuro ou claro
**When** o app abre
**Then** segue o modo do sistema (UX-DR4)
**And** o contraste de todo texto é de pelo menos 4,5:1 nos dois modos (verificado por teste automatizado de contraste dos pares de tokens)

**Given** uma tela com menos de 700 px de largura
**When** o app abre
**Then** aparece o aviso "O Conta Comigo foi feito para iPad e computador" (UX-DR31)

**And** existem os componentes comuns `toast` (6 s, um substitui o outro, com "Desfazer" opcional) e `skeleton` (UX-DR28)

### Story 1.4: Cadastrar Responsáveis com cor, sincronizados entre aparelhos

As a Rafael,
I want cadastrar as pessoas que usam o cartão, cada uma com uma cor,
So that eu possa dizer de quem é cada conta e ver a mudança no outro aparelho na hora.

**Acceptance Criteria:**

**Given** a migração que cria `responsaveis` (`nome`, `cor`, `ordem`, `arquivado`, `owner_id default auth.uid()`, `updated_at`, RLS `owner_id = auth.uid()`, `replica identity full`)
**When** Rafael abre Configurações → Responsáveis
**Then** ele cria, renomeia, troca a cor e reordena Responsáveis
**And** a cor é escolhida entre as 8 cores de pessoa, em círculos de 24 px com ✓ na escolhida, sem repetir uma cor já usada (UX-DR25)
**And** os tipos do banco são gerados em `src/data/database.types.ts` (AD-14)

**Given** o gerenciador único `src/data/realtime.ts`
**When** Rafael cria ou edita um Responsável no PC
**Then** o iPad aberto mostra a mudança sem recarregar (FR-46, NFR5)
**And** o gerenciador registra os ouvintes antes do `subscribe()`, relê os dados ao reconectar e só aplica um evento se o `updated_at` for mais novo (AD-4)
**And** a tela lê os dados por hook do gerenciador e não chama `supabase.from()` diretamente

**Given** um Responsável
**When** Rafael o arquiva
**Then** ele some das listas de escolha e continua existindo (AD-16)
**And** a gravação manda só as colunas alteradas (AD-3)

**Given** a gravação recusada pelo banco
**When** Rafael edita um campo
**Then** o valor volta ao anterior e aparece "Não foi possível salvar. Tente de novo"

### Story 1.5: Cadastrar Tipos

As a Rafael,
I want cadastrar os Tipos de gasto (Casa, Gatos, Viagem…),
So that eu possa classificar cada Lançamento.

**Acceptance Criteria:**

**Given** a migração que cria `tipos` (`nome`, `arquivado`, dono, RLS, `replica identity full`)
**When** Rafael abre Configurações → Tipos
**Then** ele cria, renomeia e arquiva Tipos numa lista simples
**And** as mudanças aparecem nos outros aparelhos sem recarregar
**And** o estado vazio mostra um texto curto convidando a criar o primeiro Tipo

### Story 1.6: Gerenciar Status e substituir cadastros em uso

As a Rafael,
I want criar os meus Status (Não pago, Pago…) e dizer quais contam como pago,
So that o app saiba o que já foi quitado (FR-50).

**Acceptance Criteria:**

**Given** a migração que cria `status` (`nome`, `conta_como_pago`, `arquivado`, dono, RLS) e `configuracoes` (uma linha por dono, com `status_padrao_id` anulável)
**When** Rafael abre Configurações → Status
**Then** ele cria, renomeia e edita Status e liga ou desliga "conta como pago"
**And** cada Status mostra a contagem de uso
**And** ele escolhe o Status padrão das linhas novas (AD-10)

**Given** a RPC `substituir_cadastro(tipo, de_id, para_id)` e a constante `REFERENCIAS_JSONB` do núcleo
**When** Rafael exclui um Responsável, Tipo ou Status em uso
**Then** o app avisa quantos registros o usam e pede um substituto, ou oferece arquivar (FR-46, FR-50)
**And** a RPC troca o id em todas as colunas e em todos os campos `jsonb` listados, numa transação
**And** cada história futura que criar uma referência a esses cadastros acrescenta a referência à RPC e à `REFERENCIAS_JSONB`, com teste

**Given** um cadastro sem uso
**When** Rafael o exclui
**Then** ele é excluído após confirmação
**And** renomear nunca exige substituto

### Story 1.7: Configurar o Ciclo do cartão e a Aparência

As a Rafael,
I want informar o dia de fechamento e de vencimento do cartão e escolher o tema,
So that os lançamentos feitos à mão caiam no Mês certo (FR-36).

**Acceptance Criteria:**

**Given** a migração que cria `config_ciclo` (`dia_fechamento`, `dia_vencimento`, `vigente_desde` no formato `AAAA-MM`)
**When** Rafael salva o Ciclo em Configurações → Ciclo do cartão
**Then** a configuração vale a partir do próximo Ciclo e as anteriores continuam guardadas, sem reescrever o passado (AD-9)
**And** a tela mostra a nota "O fechamento só define em que mês entram as contas lançadas à mão"

**Given** a função de Ciclo do núcleo `mesDoLancamento(data, configs)` e `vencimentoDoMes(mes, configs)`
**When** os testes rodam
**Then** uma data depois do fechamento vai para o Mês seguinte, uma mudança de fechamento só afeta Ciclos novos e "hoje" é calculado em `America/Sao_Paulo` (recebido como parâmetro)

**Given** Configurações → Aparência
**When** Rafael escolhe Claro, Escuro ou Sistema
**Then** a escolha é guardada em `configuracoes` e vale em todos os aparelhos (UX-DR4)

**And** Configurações → Conferência e atraso guarda o limite do Ajuste (padrão R$ 1,00) e a tolerância de atraso (padrão 10 dias), mesmo que só sejam usados em épicos seguintes

### Story 1.8: Primeiro uso

As a Rafael,
I want um passo a passo na primeira vez que entro,
So that eu monte meus cadastros sem procurar onde fica cada coisa (FR-1).

**Acceptance Criteria:**

**Given** um usuário sem Responsáveis, Tipos nem Status
**When** Rafael entra pela primeira vez
**Then** abre o Primeiro uso em tela cheia com os passos Responsáveis → Tipos → Status → Ciclo, reaproveitando as telas de Configurações (UX-DR29)
**And** nada vem pré-cadastrado
**And** cada passo pode ser pulado, e o passo a passo pode ser retomado depois por Configurações

**Given** o Primeiro uso concluído ou pulado
**When** Rafael chega ao Painel
**Then** vê o estado vazio "Importe sua primeira fatura"
**And** os passos de épicos futuros (Importar planilha, Blocos, Mensagem) entram no passo a passo quando suas histórias forem feitas

### Story 1.9: Instalar como app e usar sem internet só para consulta

As a Rafael,
I want instalar o Conta Comigo na tela inicial do iPad e continuar consultando quando a internet cai,
So that ele funcione como um app e eu nunca perca uma alteração sem saber (FR-35, NFR7).

**Acceptance Criteria:**

**Given** o manifest da PWA e um único service worker em `src/app`
**When** Rafael usa "Adicionar à Tela de Início" no Safari do iPad (iPadOS 18+)
**Then** o app abre em tela cheia com nome e ícone próprios
**And** o service worker guarda só o casco do app e nunca responde gravações (AD-3)

**Given** o detector único `src/data/conexao.ts`
**When** a conexão cai
**Then** aparece a faixa "Sem conexão. Você pode consultar, mas não alterar" (UX-DR28)
**And** os dados já carregados continuam visíveis
**And** qualquer ação que grava mostra "Sem conexão. Tente de novo quando a internet voltar" e não grava nada, nem guarda fila no aparelho

**Given** a conexão volta
**When** o detector percebe
**Then** a faixa some e o gerenciador de Realtime relê os dados

### Story 1.10: Backup semanal fora do Supabase

As a Rafael,
I want uma cópia criptografada dos meus dados toda semana,
So that eu não perca o histórico se algo acontecer com o banco (AD-17).

**Acceptance Criteria:**

**Given** um workflow `.github/workflows/backup.yml` agendado semanalmente
**When** ele roda
**Then** executa `supabase db dump` do projeto de produção, criptografa com `age` usando a chave pública do repositório e guarda como artifact com 90 dias de retenção
**And** a senha do banco fica só nos segredos do GitHub
**And** a chave privada não está no repositório

**Given** um backup gerado
**When** a restauração é testada no Supabase local
**Then** os dados voltam completos, e o passo a passo da restauração fica documentado no repositório
**And** o workflow também pode ser disparado à mão
