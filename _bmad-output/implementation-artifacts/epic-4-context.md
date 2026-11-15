# Epic 4 Context: Blocos e mensagem de cobrança

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rafael monta os Blocos por fichas (nunca por texto livre), vê o cálculo passo a passo, filtra a grade pelo Bloco, seleciona Lançamentos com o total sempre visível e gera e copia a mensagem de cobrança do WhatsApp, a partir da Seleção ou de um Bloco. É o que transforma o Mês importado e classificado (Épicos 2 e 3) em "quanto cada pessoa me deve", com o mesmo número no Painel, no passo a passo e na mensagem.

## Stories

- Story 4.1: Montar um Bloco com fichas
- Story 4.2: Blocos no Painel
- Story 4.3: Filtrar a grade pelo Bloco
- Story 4.4: Selecionar e ver o total
- Story 4.5: Configurar o modelo da mensagem
- Story 4.6: Gerar a mensagem a partir da Seleção
- Story 4.7: Gerar a mensagem a partir de um Bloco

## Requirements & Constraints

- **Bloco** é um totalizador nomeado, calculado por uma **Fórmula** sobre os Lançamentos do Mês. Operandos: Responsável, Tipo, Responsável em Tipo e "Todos"; mais números, + − × ÷ e parênteses. Não existe campo de texto livre; Fórmula incompleta ou inválida (parêntese aberto, termina com operação, divisão por zero) não salva. Nenhum Bloco vem pronto.
- Cálculo em racional exato, precedência usual, arredondamento único e só no resultado final (meio para longe do zero). Bloco, passo a passo e mensagem mostram sempre o mesmo número.
- Números de aceite (outubro/2026): Casal R$ 5.639,35; Casal ÷ 2 = R$ 2.819,68 (de R$ 2.819,675); Total R$ 9.280,23; Mãe R$ 1.350,14 (7 itens); Lucas R$ 215,16; "Rangel" = Rangel + (Casal ÷ 2) = R$ 2.819,68.
- Dois flags por Bloco: "Usar em Recebimentos" (Bloco de cobrança, usado no Épico 6) e "É o meu Bloco" (único; usado em Meu gasto por Tipo, Épico 7).
- Tocar num Bloco filtra a grade pelos Lançamentos que entram na Fórmula (um Bloco por vez, soma-se aos filtros de coluna); em soma simples, total da grade filtrada = valor do Bloco.
- Seleção é sempre de um único Mês, com total atualizado a cada toque; "selecionar todos" pega todos do filtro, inclusive os não visíveis.
- Mensagem: modelo configurável (saudação, frase com `{total}`, Pix, rodapé, campos da linha); entram só Lançamentos do Mês cujo Status não conta como pago, sem R$ 0,00 e sem previstos (salvo "Incluir previstos" em Mês sem Fatura); estorno é linha negativa; Ajuste é linha própria "↳ Ajuste". Forma 2 (Bloco) agrupa por operando com a operação aplicada e avisa quanto já foi pago.
- Os valores dos Blocos mudam no lugar, sem esqueleto e sem recarregar, em qualquer aparelho.

## Technical Decisions

- **Núcleo puro (AD-1, AD-11):** a Fórmula é uma árvore (operando, número, operação, grupo) validada por schema zod em `src/domain`. Só `avaliar(formula, linhas)` calcula valor, passo a passo e Lançamentos que entram, e `linhas` vem sempre de uma projeção do núcleo: `projetarPainel(mes)`, `projetarPendente(mes)` (Épico 6) ou `projetarMensagem(selecao)` (4.6). Nenhuma tela filtra linhas antes. Só o gerador de mensagem do núcleo produz o texto.
- **Projeção do Painel:** usa as filhas das Divisões, nunca a mãe dividida; inclui Ajustes, previstos, Contas manuais e todos os Lançamentos não excluídos do Mês.
- **Dinheiro (AD-2):** centavos inteiros; intermediários da Fórmula em racional exato; um só arredondamento; exibição só pelos formatadores do núcleo (o intermediário exato aparece como "R$ 2.819,675").
- **Tabela `blocos`:** `nome`, `formula jsonb`, `ordem`, `de_cobranca`, `meu_bloco` (índice único parcial por dono), `owner_id`, RLS, `replica identity full`, publicação no Realtime. A Fórmula cita ids de Responsável e Tipo dentro do `jsonb`; essas referências entram em `REFERENCIAS_JSONB` (e em `referencias_cadastro()`) e contam uso, então excluir um Responsável ou Tipo em uso exige substituto (`substituir_cadastro`, AD-16).
- **Dados e tempo real (AD-3, AD-4):** gravação só por `src/data` (repositório de Blocos; multi-linha como RPC); a tela lê pelo gerenciador único de Realtime; totais calculados nunca são gravados.
- **Schema (AD-14):** toda mudança é migração em `supabase/migrations`, tipos do banco em `src/data/database.types.ts`.

## UX & Interaction Patterns

- **Montador de Bloco (UX-DR16):** janela com nome, área da Fórmula de borda tracejada com `formula-chip` removíveis por toque, paleta de `palette-chip` (Responsáveis com a bolinha da pessoa, Tipos, "Responsável em Tipo" que abre dois seletores, "Todos", "Número…" com teclado numérico), `operator-key` 44 × 44 (+ − × ÷ e parênteses), cartão de resultado com valor e passo a passo ao vivo, "Salvar" desativado com a razão em uma linha, opções "Usar em Recebimentos" e "É o meu Bloco", modo só leitura "Ver cálculo".
- **Cartão dos Blocos no Painel (UX-DR8):** `block-card` com bolinha da pessoa (Bloco de um Responsável só), valor, subtítulo com a Fórmula legível com os parênteses como montados, ⋯ e 💬; "＋ Novo bloco", "Reordenar" (tremor, arrastar, "Concluir"); estado ativo com borda `accent-line`; vazio "Crie seu primeiro Bloco para ver os totais por pessoa".
- **Seleção (UX-DR11, UX-DR12):** `selection-bar` presa embaixo ("N selecionados · R$ total", Limpar, ⋯ Mais, Gerar mensagem); trocar de Mês limpa a Seleção com aviso.
- **Gerar mensagem (UX-DR17):** quadro `message` (mono), aviso do que ficou de fora, "Copiar" (fecha e mostra "Copiado"), "Editar modelo", "Fechar"; "Nada a cobrar nesta seleção"; falha de cópia com texto selecionável; "Incluir previstos" só em Mês sem Fatura.
- **Gerais:** toque 44 pt, contraste ≥ 4,5:1, tokens sem cor literal, VoiceOver "Gerar mensagem do Bloco {nome}" e "Ações do Bloco {nome}", textos de erro do mapa único `codigo → mensagem`.

## Cross-Story Dependencies

- Depende dos Épicos 1 a 3: Responsáveis e Tipos, `substituir_cadastro` e `REFERENCIAS_JSONB`, gerenciador de Realtime, Painel e grade, filtros, Divisão (filhas), Ajustes, previstos e Status "conta como pago".
- 4.1 cria a Fórmula, `avaliar`, `projetarPainel`, a tabela `blocos` e o Montador; 4.2 mostra, renomeia, reordena e exclui os Blocos no Painel (e põe o passo "Blocos" no Primeiro uso); 4.3 filtra a grade com os Lançamentos que `avaliar` devolve; 4.4 cria a Seleção; 4.5 o modelo; 4.6 `projetarMensagem` e `gerarMensagem` para a Seleção; 4.7 reusa a mesma janela para o Bloco, aplicando a Fórmula só aos itens que entram.
- Fora do Épico: Recebimentos (Épico 6) usa `de_cobranca` e `projetarPendente`; Previsão e "Meu gasto por Tipo" (Épico 7) usam `meu_bloco`.
