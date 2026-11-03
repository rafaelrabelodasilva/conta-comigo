# Epic 2 Context: Importar a fatura e conferir

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rafael sobe o PDF da fatura do Santander com a senha e vê todos os Lançamentos do Mês na grade do Painel, com a Conferência geral e por cartão, a marca "verificar", os Ajustes de centavos, a correção à mão (incluindo classificar Responsável, Tipo e Status pelo painel do Lançamento) e a navegação entre Meses. É o primeiro épico que traz dados reais para o app e é a base de tudo o que vem depois (classificação, Blocos, Recebimentos). Começa por uma prova técnica que valida o caminho pdf.js + Gemini no iPad antes de construir as telas em cima dele.

## Stories

- Story 2.1: Prova técnica: ler a fatura de outubro no iPad
- Story 2.2: Formatos de dinheiro, data e Mês
- Story 2.3: Importar a fatura do Mês
- Story 2.4: Painel do Mês com a grade de Lançamentos
- Story 2.5: Conferência e marca "verificar"
- Story 2.6: Barra de filtros e busca
- Story 2.7: Painel do Lançamento: classificar, corrigir, incluir e excluir
- Story 2.8: Ajustes de centavos

## Requirements & Constraints

- **Importação:** PDF + senha digitada no app; senha errada é avisada e pedida de novo. Nem o PDF nem a senha são guardados. Antes de gravar, mostra vencimento e Mês lidos para confirmação. Grava só os Lançamentos e os totais da Fatura (vencimento, fechamento, total de despesas, total de créditos, saldo anterior, pagamentos, total a pagar) e o "VALOR TOTAL" de cada cartão.
- **Extração:** todos os Lançamentos (despesas, parcelamentos, créditos, estornos) de todos os cartões, com Nome, data, Parcela, Valor e final do cartão, `lancado_por = fatura`. O pagamento da fatura anterior não vira Lançamento. Créditos entram negativos.
- **Conferência:** soma das despesas = total de despesas, soma dos créditos = total de créditos, também por cartão. Avisa sem bloquear. Saldo anterior e pagamentos não entram. O alerta fica até bater ou ser dispensado.
- **"Verificar"** não é Status: é derivado (cartão com diferença), nunca gravado; `duvida_extracao` só ordena dentro do cartão. Some sozinho quando a Conferência bate.
- **Ajuste de centavos:** crédito sem Parcela, na mesma Fatura, com o mesmo `nome_normalizado` de uma parcela e valor absoluto abaixo do limite (padrão R$ 1,00, em `configuracoes`) vira Ajuste da parcela, herda Tipo e Responsável, pode ser desvinculado e continua na Conferência como crédito.
- **Correção à mão:** editar, incluir e excluir Lançamentos com a Conferência recalculada na hora.
- **Navegação:** o app sempre abre no Mês atual; dá para ir a Meses passados e futuros.
- **Aceite de outubro/2026 (vence 06/10/26):** exatamente 49 Lançamentos, despesas R$ 8.327,39, créditos R$ 639,62, soma dos cinco cartões = total de despesas. Caso de Ajuste: "MSC CRUZEIROS 02/12 R$ 1.140,74" + "MSC CRUZEIROS - R$ 0,08".
- **Desempenho:** do PDF à gravação em menos de 1 minuto (~50 Lançamentos).
- **Formatos (todas as telas):** "R$ 1.140,74", "- R$ 0,08", "R$ 0,00" (espaço inseparável), datas DD/MM/AA, horas HH:MM, Meses "Out/26" e "outubro/26".
- **Privacidade:** CPF, endereço e número do cartão (exceto o final de 4 dígitos) são removidos no aparelho antes de ir ao Gemini (desvio aceito: plano gratuito). Fixtures no repositório são texto sem dados pessoais, nunca o PDF.
- **Plataforma:** iPad Pro 11" (Safari, iPadOS 18+) e PC no navegador. Sem internet, só leitura.

## Technical Decisions

- **Pipeline (AD-7):** `pdfjs-dist` 5.6.x, build **legacy**, carregado só no cliente, abre o PDF com a senha → `removerDadosPessoais(texto)` do núcleo → `POST /api/fatura/extrair` (`runtime = 'nodejs'`, `maxDuration = 60`, sessão obrigatória) → **uma** chamada ao Gemini (`@google/genai`, modelo em `GEMINI_MODEL`) com `responseJsonSchema` gerado por `z.toJSONSchema` do **schema zod único** de extração do núcleo (inclui `tipo_sugerido` e `duvida`) → validação pelo mesmo schema → Conferência, Ajustes e classificação no núcleo → RPC atômica `importar_fatura`. A rota não grava nada e não registra o texto em log. Plano B (leitor próprio do PDF) só se a prova técnica falhar.
- **RPC `importar_fatura`:** uma transação, tudo ou nada; recebe o `updated_at` mais recente lido e recusa se o Mês mudou; devolve as linhas gravadas para o gerenciador de Realtime aplicar. Grava `nome_normalizado = normalizarNome(nome)`, `ordem_fatura`, Status padrão de `configuracoes.status_padrao_id`.
- **Núcleo puro (AD-1):** `removerDadosPessoais`, `paraCentavos`, `formatarDinheiro`, arredondamento único, `dividirEmPartes`, formatadores de data/Mês, `normalizarNome`, `conferir(fatura, cartoes, lancamentos)`, `precisaVerificar`, `reconhecerAjustes(lancamentos, limite)`, regra de Ciclo/Mês. Erros como `{ ok, valor | erro: { codigo, detalhe } }`, sem exceção; textos do usuário vêm do mapa único `codigo → mensagem`.
- **Dinheiro (AD-2):** inteiros em centavos (`*_centavos integer`), um único arredondamento meio para longe do zero; formatador próprio, nunca `Intl` direto; lint impede formatação fora dos formatadores.
- **Schema (AD-14):** migrações criam `faturas` (`mes`, vencimento, fechamento, totais lidos, `alerta_dispensado_em`, `unique (owner_id, mes)`), `fatura_cartoes (fatura_id, final, total_centavos)` e `lancamentos` (`nome`, `nome_normalizado`, `apelido`, `valor_centavos`, `data`, `parcela_n`, `parcela_total`, `final_cartao`, `mes`, `fatura_id`, `ordem_fatura`, `duvida_extracao`, `lancado_por` enum `fatura|sistema|manual|historico`, `responsavel_id`, `tipo_id`, `status_id`, `observacao`, `editado_em`, `excluido_em`); depois `ajuste_de_id`. Toda tabela com `owner_id default auth.uid()`, RLS e `replica identity full`. Tipos gerados em `src/data/database.types.ts`.
- **Quem entra na Conferência:** os Lançamentos com aquele `fatura_id`. Um Lançamento incluído à mão como correção da extração recebe o `fatura_id`.
- **Mês (AD-9):** `mes` `AAAA-MM` fixado na criação e nunca recalculado: na Fatura, o vencimento lido; criado no app com data, pela regra de Ciclo vigente; sem data, o Mês aberto. Fuso `America/Sao_Paulo`.
- **Gravação e tempo real (AD-3, AD-4):** toda gravação passa pelos repositórios de `src/data` (nunca `supabase.from()` na tela); manda só as colunas alteradas; `updated_at` pelo banco decide. Telas leem do gerenciador único `src/data/realtime.ts`. Totais lidos da Fatura são gravados; totais calculados nunca.
- **Exclusão lógica (AD-16):** `excluido_em`; "Desfazer" limpa o campo e mantém o mesmo `id`; restrições únicas como índices parciais.
- **Ajuste (AD-8):** aponta para a mãe por `ajuste_de_id`, recebe e acompanha a classificação dela na mesma gravação.
- **Segredos e log (AD-12, AD-17):** `GEMINI_API_KEY` só em `src/server` com `import "server-only"`; log só via `src/server/log.ts`, sem texto de Fatura, nomes nem valores.

## UX & Interaction Patterns

- **Importar fatura (UX-DR20):** janela de 3 passos (PDF, senha, conferência e resumo), progresso "Abrindo PDF / Lendo lançamentos / Conferindo / Classificando", "Cancelar" em qualquer passo sem gravar. Estados: "Senha incorreta" (borda `danger-fg`), "Este PDF não parece ser uma fatura do Santander. Confira o arquivo", "Não conseguimos ler todos os lançamentos (lemos N)…", "A conexão caiu. Nada foi gravado. Tentar de novo", Mês já importado (neste épico só avisa e não grava).
- **Painel:** `invoice-hero` com sobrelinha "FATURA DE OUTUBRO · VENCE 06/10/26", total, barra por Responsável (toque filtra), selo "✓ Conferido" ou "⚠ Diferença de R$ X" (toque aplica "Verificar"); variante "Fatura ainda não importada". Faixa âmbar de diferença com "Ver lançamentos" e "Dispensar".
- **Grade (UX-DR10):** caixa, Nome (Apelido em negrito + Nome em cinza), Parcela, Valor à direita em tnum, Tipo, Responsável (`person-tag`), Lançado por, Status (`status-pill`); ordem da fatura; cabeçalho ordena/inverte; cabeçalho fixo e rolagem lateral com caixa e Nome fixos; linha nunca pintada com cor; bolinha `verify`; Ajuste recuado com líquido em `text-muted`. Toque na caixa seleciona, no resto abre o painel; toque longo ou ⋯ abre o menu.
- **`month-switcher`:** "◀ Out/26 ▶", setas de 44 pt, popover de meses; trocar de Mês mantém os filtros.
- **`filter-bar` (UX-DR9):** busca ao digitar (só Mês aberto); pílulas por coluna com popover de múltipla escolha, contagem, "Limpar"/"Aplicar"; E entre colunas, OU dentro; "Verificar"; "Limpar filtros"; "Mais ▾" no iPad em pé; vazio "Nenhum lançamento com esses filtros".
- **`side-panel` (UX-DR14):** abre pela direita sem esconder a grade; salva ao sair do campo com "Salvando… / Salvo às HH:MM / Não salvo, tentando de novo"; seletores `form-field`; Conferência ao vivo ao mudar Valor; faixa "alterado em outro aparelho às HH:MM"; rodapé "Excluir" com `toast` "Excluído · Desfazer" de 6 s.
- **Gerais:** `skeleton` sem tela branca; layouts iPad deitado/em pé/PC (UX-DR31); toque mínimo 44 pt, contraste ≥ 4,5:1, VoiceOver lê a linha como "Nome, Valor, Parcela, Responsável, Status" e a bolinha como "verificar este lançamento"; tokens do DESIGN.md, sem cor literal.

## Cross-Story Dependencies

- Depende do Épico 1: projeto, login e RLS, tokens e menu, Responsáveis/Tipos/Status, Status padrão e `configuracoes`, Ciclo, gerenciador de Realtime e detector de conexão.
- 2.1 decide se o caminho pdf.js + Gemini segue, precisa de ajuste de prompt ou aciona o plano B; registra em `docs/prova-tecnica-fatura.md`. Cria o schema zod de extração, `removerDadosPessoais`, `paraCentavos` e a rota, reaproveitados pela 2.3.
- 2.2 (formatadores) é usada por todas as telas seguintes.
- 2.3 cria as tabelas e a RPC; 2.4 a 2.8 dependem delas. 2.5 usa a grade (2.4) e o filtro "Verificar" encaixa na barra da 2.6. 2.7 recalcula a Conferência da 2.5. 2.8 acrescenta `ajuste_de_id` e altera a importação e a grade.
- Fica para o Épico 3: Regras, herança de parcelas, previstos e casamento, fila do Revisar e reimportação (a 2.3 só recusa Mês já importado). Seleção e Blocos ficam para o Épico 4.
