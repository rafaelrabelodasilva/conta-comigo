# Epic 3 Context: Classificar quase sozinho

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Depois de importar a fatura (Épico 2), o app passa a classificar sozinho: aprende Regras a cada classificação e as aplica na próxima fatura, herda a classificação de parcelas em andamento, cria os previstos das parcelas futuras e os casa com a fatura real, e sugere Tipo para Nomes novos. O que sobra vai para a fila curta do Revisar, com confirmação em um toque, classificação em lote, Divisão e Apelido. Rafael também importa o histórico de 2026 da planilha "Cartão" (.xlsx), gerencia as Regras aprendidas e pode reimportar um Mês sem perder o que já fez. É o épico que entrega a meta de fechar o Mês em menos de 10 minutos, com pelo menos 55% dos Lançamentos classificados sem revisão desde o primeiro Mês.

## Stories

- Story 3.1: Regras que aprendem com a classificação
- Story 3.2: Fila do Revisar
- Story 3.3: Classificar em lote
- Story 3.4: Gerenciar Regras aprendidas
- Story 3.5: Séries e parcelas previstas
- Story 3.6: Casar os previstos com a fatura real
- Story 3.7: Herdar parcelas sem previsto
- Story 3.8: Dividir um Lançamento
- Story 3.9: Dar Apelido
- Story 3.10: Importar o histórico da planilha
- Story 3.11: Reimportar um Mês

## Requirements & Constraints

- **Aprender e aplicar Regras:** classificar (Responsável e Tipo) em qualquer tela cria ou atualiza a Regra daquele Nome, sem confirmação. Lançamento à vista com Regra recebe a classificação dela, tolerando variações de Nome ("DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY"). Regra com histórico de Responsáveis diferentes (ex.: farmácias) só sugere o mais frequente e manda para a fila. Nome sem Regra recebe o `tipo_sugerido` da extração como sugestão e sempre passa pela fila.
- **Fila do Revisar:** só os não classificados e os sugeridos, agrupados por Nome, com sugestão visível, confirmação em um toque (que também ensina a Regra) e contador "Faltam N" que chega a zero. Fila e contador vêm da mesma consulta; classificar limpa o motivo.
- **Lote:** selecionar vários e atribuir Tipo, Responsável, Status e Observação numa única gravação, aprendendo cada Regra, com "Desfazer". A mesma função serve a barra de Seleção do Painel (Épico 4).
- **Regras aprendidas:** ver (chave → Responsável, Tipo, Divisão, último uso), buscar, editar e apagar (com confirmação). Editar pergunta se reaplica aos Lançamentos do Mês aberto que vieram daquela Regra.
- **Previstos:** parcela n/N com n < N cria n+1/N até N/N nos Meses seguintes com mesmo Nome, Apelido, Valor, Tipo, Responsável, Divisão e Observação, `lancado_por = sistema`, sem duplicar ao reinserir. Selo "Previsto" em todas as telas e origem visível no painel. Reclassificar a parcela atual pergunta se aplica aos previstos. Previstos não entram na Conferência. Mês futuro sem Fatura mostra os previstos na grade.
- **Casamento:** casou → vira real na mesma linha mantendo `id`, classificação e Apelido; valor diferente → usa o da fatura e vai para a fila ("Valor mudou"); previsto sem par → continua previsto e vai para a fila ("Não veio na fatura"); real sem previsto → Regras e herança normais. O resumo da importação mostra quantos previstos casaram.
- **Herança sem previsto:** parcela n/N (n > 1) com a n−1/N no Mês anterior de mesmo `nome_normalizado` e Valor entra na mesma Série, herda Apelido, Tipo, Responsável, Divisão e Observação e não vai para a fila. Várias candidatas → escolha determinística (menor `ocorrencia`).
- **Divisão:** 2+ partes por valor ou proporção, cada uma com Responsável e Status (padrão: o do original). A soma é sempre o Valor original, centavos na última parte, inclusive com Valor negativo. Partes mantêm Nome e Parcela e ficam ligadas à mãe.
- **Apelido:** dar, trocar ou remover, perguntando se aplica aos outros com o mesmo `nome_normalizado` (inclusive previstos). Substitui o Nome nas telas e na mensagem; o Nome fica no detalhe e nunca muda.
- **Histórico da planilha:** lê o `.xlsx` no navegador (sem integração Google), abas 01/2026 a 10/2026 marcadas por padrão. Mapeia Despesa → Nome, Valor, Parcela, Observação, Tipo, Resposabilidade → Responsável, Status dívida → Status, `lancado_por = historico`. Cria cadastros que faltam, Regras iniciais, Séries, parcelas em andamento e previstos. Linhas divididas (Monjaro) viram mãe com Divisão e filhas. Uma transação por aba; aba com erro não para as outras.
- **Reimportar:** avisa o que será substituído e quantos já estão pagos ou classificados à mão, só faz após confirmação, reaplica Regras e herança, não toca Contas manuais do Mês, tudo numa transação.
- **Precisão:** nenhum valor perdido ou duplicado em Divisão, casamento ou reimportação. Testes de aceite obrigatórios: Monjaro R$ 466,00 = R$ 310,67 + R$ 155,33; duas compras idênticas na mesma fatura (duas Séries, `ocorrencia` 1 e 2, casamento sem estourar a restrição única); reimportação de Mês (o caso com Pagamento é testado no Épico 6).
- **Desempenho:** importar e classificar ~50 Lançamentos em menos de 1 minuto.

## Technical Decisions

- **Núcleo puro (AD-1):** classificação (Regras, herança, sugestões), geração e casamento de previstos, Divisão e mapeamento da planilha são funções puras de `src/domain` (`domain/classificacao`, `domain/previstos`, `domain/importacao-planilha`), com Vitest. As RPCs só gravam o que o núcleo calculou. Erros como `{ ok, valor | erro: { codigo, detalhe } }`. Entradas externas (linha da planilha) passam por schema zod do núcleo.
- **Duas chaves de identidade (AD-6):** `normalizarNome` é a chave de previstos, Ajustes e "mesmo Nome" (Apelido em massa). `chaveDeRegra(nome)` (normalização + sem prefixo de adquirente, ex.: `MP*`, `PG*`, `IFD*`) é a única chave de `regras`, guardada com `versao_normalizacao`, e é diferente de `normalizarNome`. Apelido nunca é usado para casar nada.
- **Tabela `regras`:** `chave`, `versao_normalizacao`, `responsavel_id`, `tipo_id`, contagem por Responsável, Divisão em frações, `ultimo_uso`, `owner_id`, RLS, `unique (owner_id, chave)`. Só `regrasRepo.aprender()` grava em `regras`. Suas referências entram na `substituir_cadastro` (`REFERENCIAS_JSONB`).
- **Revisão:** colunas `revisao_motivo`, `revisao_dados`, `revisado_em` em `lancamentos`; a importação grava o motivo (sem classificação, sugestão, sugestão com dúvida, valor mudou, não veio na fatura, `sumiu_na_reimportacao`) e classificar limpa.
- **Séries (AD-8):** `series` com chave única `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)`; `ocorrencia` separa compras idênticas no mesmo Mês na ordem da fatura. `lancamentos.serie_id` e `origem_lancamento_id`; índice único parcial `(serie_id, parcela_n) where dividido_de_id is null and excluido_em is null`. Previsto e real da mesma parcela são a mesma linha-mãe (`sistema` → `fatura`, ganha `fatura_id`).
- **Mês dos previstos (AD-9):** `mes = somarMeses(mes_origem, k)`, fixado na criação e nunca recalculado.
- **Casamento (AD-8):** `casarPrevistos(extraidos, previstos)` 1-para-1 e determinístico por `(nome_normalizado, parcela_n, parcela_total)`: reais na ordem da fatura, previstos por valor igual primeiro e depois `ocorrencia`.
- **Divisão (AD-2, AD-8):** `divisao jsonb` na mãe (partes com Responsável, Tipo, fração, `vencimento_combinado` opcional) e `dividido_de_id` nas filhas, recriadas pela RPC `dividir_lancamento` com `dividirEmPartes` (cada parte `arredondar(valor × fração)`, a última recebe a diferença). Conferência, casamento e previstos usam a mãe; Blocos, Seleção, Pagamento e Mensagem usam as filhas; a mãe dividida não entra em soma. O previsto seguinte herda a `divisao`.
- **Reimportação (AD-7.6):** `importar_fatura` em modo reimportação casa novas com antigas pela chave de casamento; casadas mantêm `id`, classificação, Divisão e referências. Antigas sem par e sem referências são apagadas (exclusão física só aqui); previsto que tinha casado volta a `sistema`. Antigas sem par com referências ficam com `revisao_motivo = 'sumiu_na_reimportacao'`. Série com parcela em outro Mês nunca é apagada; previstos da fatura anterior só são apagados se ainda `sistema` e sem Pagamento.
- **Gravação e tempo real (AD-3, AD-4):** tudo pelos repositórios de `src/data`; operações multi-linha (importar, dividir, lote, planilha por aba) são RPCs em transação que devolvem as linhas afetadas ao gerenciador `src/data/realtime.ts`. Só colunas alteradas; `updated_at` do banco decide.
- **Schema (AD-14):** cada mudança acima é uma migração em `supabase/migrations`, com `owner_id default auth.uid()`, RLS e `replica identity full`; tipos regenerados em `src/data/database.types.ts`.

## UX & Interaction Patterns

- **Revisar:** fila agrupada por Nome, faixa de resumo da importação no topo, "Faltam N" ao lado do título, seletor de Mês só para mostrar o mês da fila. `review-item` de 64 pt em colunas fixas 30 / 1fr / 210 / 84 / 104, com 5 variantes: sugestão ("Sugestão: Casal · Casa"; com dúvida "Casal · Saúde (às vezes Rafael)") com ✓ e "Mudar"; sem sugestão ("Mudar"); valor mudou ("Antes R$ 445,89 → agora R$ 449,10", ✓ "Manter classificação"); não veio na fatura ("Remover previsto" / "Manter"); Ajuste (✓ / "Desvincular"). "Mudar" abre seletores de Responsável e Tipo com os mais usados primeiro. Lote: "Aplicar sugestões", "Responsável…", "Tipo…". Fila vazia: "Tudo revisado. Nada novo neste mês". Mockup em `ux-designs/.../mockups/revisar.html`.
- **Menu e importação:** contador do Revisar (`verify`) no `nav-rail` enquanto houver itens, some ao zerar. Passo 3 da importação mostra classificados, previstos casados e "para revisar", com "Ir para revisão" (principal) e "Ver no Painel".
- **Perguntas:** sempre `inline-question` "Só este / Aplicar a todos" (previstos, Apelido em massa, reaplicar Regra "Reaplicar aos lançamentos de Out/26?"). Confirmação só nas destrutivas (excluir Regra, "Importar de novo"); nas demais, `toast` "Desfazer" de 6 s.
- **Previsto:** selo "Previsto" junto do Nome, texto um pouco mais claro; origem no painel: "criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26".
- **Dividir (UX-DR15):** "Por valor / Por proporção", "＋ Parte" com Responsável, valor ou fração e Status; rodapé "Soma das partes: R$ 466,00 de R$ 466,00 ✓" libera "Dividir" só quando bate; modo edição com "Desfazer divisão"; aviso "Divisão aplicada pela Regra de NOME". Filhas na grade com "↳" e recuo de 16 px.
- **Apelido:** grade mostra Apelido em negrito e Nome em cinza.
- **Regras aprendidas:** lista com busca, editar, reaplicar e excluir; vazio "As Regras aparecem conforme você classifica os lançamentos".
- **Importar planilha:** escolha de abas, progresso por aba, "Não foi possível ler a aba 03/2026", resumo "N lançamentos, N Responsáveis, N Tipos, N Regras criadas" levando a Regras aprendidas filtrada por "criadas agora"; passo também no Primeiro uso.
- **Reimportar:** aviso "Esta fatura já foi importada. Importar de novo apaga os N lançamentos de outubro vindos da fatura (X já estão pagos ou classificados à mão) e importa tudo de novo", com "Importar de novo" (destrutivo) e "Cancelar".
- **Gerais:** toque 44 pt, contraste ≥ 4,5:1, tokens do DESIGN.md sem cor literal, formatadores do núcleo para dinheiro, datas e Meses, textos de erro do mapa `codigo → mensagem`.

## Cross-Story Dependencies

- Depende do Épico 2: tabelas `faturas`, `fatura_cartoes`, `lancamentos`, RPC `importar_fatura`, schema de extração com `tipo_sugerido` e `duvida`, `normalizarNome`, `dividirEmPartes`, Conferência, Ajustes (`ajuste_de_id`), grade, filtros e painel do Lançamento. E do Épico 1: cadastros, `substituir_cadastro`, `configuracoes`, Ciclo, Primeiro uso e gerenciador de Realtime.
- 3.1 cria `regras`, `chaveDeRegra` e `regrasRepo.aprender()`, usados por 3.2, 3.3, 3.4, 3.8 (Divisão na Regra), 3.10 e 3.11.
- 3.2 cria as colunas de revisão e a tela; 3.3 adiciona o lote nela; 3.6 e 3.11 acrescentam as variantes "valor mudou", "não veio na fatura" e "sumiu na reimportação".
- 3.5 cria `series` e previstos; 3.6 (casamento) e 3.7 (herança) dependem dela; 3.8 faz o previsto herdar a `divisao`; 3.9 aplica Apelido também aos previstos.
- 3.10 usa Regras, Séries, previstos e Divisão (3.1, 3.5, 3.8). 3.11 usa casamento, Regras e herança e substitui a recusa de Mês já importado da 2.3.
- Ficam para depois: Seleção na grade e mensagem (Épico 4, que reusa `classificarEmLote`), Contas manuais com Série e `divisao` (Épico 5), Pagamentos e o teste de reimportação com Pagamento (Épico 6).
