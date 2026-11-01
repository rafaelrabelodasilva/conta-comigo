---
title: 'Revisão adversarial — Architecture Spine Conta Comigo'
reviewed: ../ARCHITECTURE-SPINE.md
lens: 'Duas unidades construídas em paralelo, cada uma obedecendo a todo AD ao pé da letra, que ainda assim saem incompatíveis'
date: '2026-11-01'
verdict: 'NÃO PRONTA para quebrar em stories paralelas — 4 críticos e 13 altos precisam de AD novo ou apertado'
counts: { critical: 4, high: 13, medium: 12, low: 6 }
---

# Revisão adversarial da Spine — Conta Comigo

## Método

Para cada achado, montei duas unidades um nível abaixo da Spine (stories/épicos) entregues a agentes de IA diferentes, em paralelo. Cada agente lê a Spine, o PRD e o EXPERIENCE.md e obedece **a todos os ADs ao pé da letra**. Mesmo assim, os dois entregam código que não encaixa: formato de dado diferente, dois donos da mesma entidade, dois caminhos de mudança de estado ou identidade ambígua. Cada achado termina com o texto exato da **Rule** que fecha o buraco (AD novo ou emenda a um AD existente).

A Spine acerta no essencial: núcleo puro (AD-1), centavos (AD-2), sem fila offline (AD-3), linha única previsto/real (AD-8) e fórmula como árvore (AD-11). Os buracos estão quase todos na **fronteira entre entidades**: Série × Divisão × Ajuste × Pagamento × Reimportação, e em **quem decide** o que entra em cada soma.

## Veredito

**Não está pronta para paralelizar.** Os quatro críticos (identidade da linha dividida, dono do "está pago", reimportação destrutiva e materialização das Contas manuais) produzem valores duplicados ou perdidos. É exatamente o que o NFR "Precisão" proíbe, e os testes de aceite de outubro/2026 não pegam esses casos porque usam um único mês, sem reimportação e sem desfazer. Os altos fazem telas discordarem do mesmo número (Painel × Recebimentos × Mensagem × Lembrete). Com as Rules propostas, a Spine fica apta.

| Severidade | Quantidade |
| --- | --- |
| Crítico | 4 |
| Alto | 13 |
| Médio | 12 |
| Baixo | 6 |

---

## Críticos

### C-1 — Linha dividida: quem carrega a identidade da parcela e quem entra nas somas

- **Unidades:** A = story "Dividir lançamento" (RPC `dividir_lancamento`, `features/revisar`); B = story "Previstos e casamento" (`domain/previstos`, RPC `importar_fatura`); C = story "Conferência".
- **Como cada uma obedece:** AD-8 diz que a restrição única `(serie_id, parcela_n)` vale "entre os Lançamentos não excluídos e não divididos", que as linhas da Divisão apontam para o original com `dividido_de_id` e que o original "fica oculto".
  - A lê "não divididos" como "linhas que não são filhas" e grava `serie_id`/`parcela_n` nas filhas (FR-15: "as linhas mantêm o mesmo Nome e a mesma Parcela"). Para não violar a restrição, cria o índice parcial `where dividido_de_id is null`.
  - B lê "não divididos" como "o original que foi dividido sai da restrição" e faz o casamento (FR-45) procurar o previsto por `(serie_id, parcela_n)` entre as linhas visíveis, ou seja, as filhas. Encontra duas e não sabe qual vira `fatura`.
  - Para gerar os previstos de uma parcela dividida (FR-44 copia a "Divisão"), B cria **um** previsto com os dados do original, sem filhas. A, por sua vez, espera que uma Divisão seja pai oculto + filhas.
  - C soma os Lançamentos `fatura` do Mês para a Conferência e conta o pai oculto **e** as filhas: R$ 466,00 entram duas vezes.
- **Colisão:** a mesma parcela tem dois portadores de identidade, as somas duplicam ou omitem e o casamento quebra no primeiro mês seguinte a uma Divisão.
- **Rule proposta (emenda ao AD-8, novo parágrafo "Divisão"):**
  > A parcela é sempre representada por **uma linha-mãe**: o Lançamento com `dividido_de_id is null`. Só a linha-mãe tem `serie_id`, `parcela_n`, `parcela_total`, `fatura_id` e `lancado_por` com significado de identidade; a restrição única é `unique (serie_id, parcela_n) where dividido_de_id is null and excluido_em is null`. Uma linha-mãe dividida tem `dividida = true` e nunca aparece em grade, Bloco, Seleção, Pagamento ou Mensagem; as filhas (`dividido_de_id = mãe`) nunca entram em casamento, Conferência ou geração de previstos. A Divisão é guardada na mãe como `divisao jsonb` (partes com `responsavel_id`, `status_id` e fração racional `num/den`) e as filhas são **materializações** dela, recriadas pelo núcleo sempre que o Valor da mãe muda (casamento com valor diferente, FR-7), com o resto na última parte (AD-2). Um previsto de parcela dividida é criado como mãe + filhas, com a mesma `divisao`. Conferência = mães; Blocos, grade, Seleção, Pagamento e Mensagem = linhas folha (mãe não dividida ou filha). O núcleo exporta `linhasFolha(lancamentos)` e `linhasDeIdentidade(lancamentos)`, e ninguém filtra por conta própria.

### C-2 — Dois donos do "está pago": `status_id` × `pagamento_itens`

- **Unidades:** A = story "Pagamento / Aplicar status" (`domain/pagamento`, RPC `aplicar_pagamento`); B = story "Painel do Lançamento" (edição de Status no painel lateral, FR-21/FR-14); C = story "Importar planilha" (FR-2, Status dívida → Status).
- **Como cada uma obedece:** AD-10 diz que o Lançamento "guarda só `status_id`", que "Pago parcialmente" é derivado e que o Pagamento tem itens com o valor quitado.
  - A deriva o pendente como `valor − Σ itens` e considera pago quando Σ itens = valor.
  - B troca `status_id` para "Pago" direto pelo repositório, sem Pagamento (FR-14 permite atribuir Status em lote).
  - C importa 10 meses com Status "Pago" e nenhum Pagamento.
  - Resultado: para A, todo o histórico está pendente. Para a grade, que mostra o `status_id`, tudo está pago. O Saldo pendente de Recebimentos e o selo da grade discordam.
  - Desfazer (AD-10: "devolve o Status anterior guardado no item"): o Lucas paga R$ 100 (P1, status anterior "Não pago") e depois R$ 115,16 (P2, status anterior "Não pago", porque o item ficou parcial). Desfazer P1 restaura "Não pago" num item que P2 deixou quitado.
  - Aplicar "Não pago" em itens com Pagamento deixa itens órfãos com o selo "Não pago" e o restante zerado.
- **Colisão:** duas verdades sobre o mesmo fato, um desfazer fora de ordem que corrompe o estado e um histórico inteiro mal interpretado.
- **Rule proposta (substitui o AD-10):**
  > **Fonte única do "pago":** `ehPago(l) = status(l).conta_como_pago`. `restante(l) = ehPago(l) ? 0 : l.valor_centavos − Σ itens(l).valor_quitado_centavos`. "Pago parcialmente" = `!ehPago(l) && Σ itens(l) > 0`. Mudar `status_id` direto (painel, lote, planilha) é permitido e não cria Pagamento. `status_id` é anulável: `null` significa "não conta como pago" (FR-1 permite pular os Status). A única forma de criar ou apagar `pagamento_itens` é a RPC `aplicar_pagamento` / `desfazer_pagamento`. Cada item guarda `status_anterior_id` e `status_aplicado_id`. Ao desfazer, um Lançamento só volta a `status_anterior_id` se o `status_id` atual ainda for o `status_aplicado_id` desse item **e** nenhum Pagamento posterior tiver item nele; senão o Status fica como está e só o `restante` muda. Aplicar um Status que não conta como pago num Lançamento com itens é recusado com o código `tem_pagamento` ("Desfaça o pagamento antes"). `valor_quitado_centavos` é o que sai do pendente; `valor_recebido_centavos` é o dinheiro que entrou. Os dois só diferem no modo `minha_parte`, e "Recebido no mês" usa `valor_recebido_centavos`.

### C-3 — Reimportação (FR-51) destrói Séries, previstos já casados e Pagamentos

- **Unidades:** A = story "Reimportar Mês" (RPC `importar_fatura`, ramo de reimportação); B = story "Previstos" (`domain/previstos`); C = story "Recebimentos".
- **Como cada uma obedece:** AD-7.4 diz que a reimportação "apaga antes os Lançamentos `fatura` do Mês e os previstos criados por ela".
  - Os Lançamentos `fatura` de outubro incluem previstos de setembro que casaram (AD-8: a mesma linha mudou de `sistema` para `fatura`). A apaga essas linhas. Se a Série é apagada em cascata, as parcelas de novembro em diante ficam órfãs; se não é, a nova importação cria Séries novas e os previstos de novembro duplicam (duas Séries para a mesma compra) ou estouram a restrição única.
  - "Os previstos criados por ela" inclui previstos de novembro que **a Fatura de novembro já casou**. A apaga Lançamentos reais de outro Mês.
  - Não existe coluna que diga qual Fatura criou um previsto. A inventa `criado_por_fatura_id`; B infere pela `serie.mes_inicial`.
  - Lançamentos com `pagamento_itens`: FK `on delete cascade` apaga itens e deixa Pagamentos com `valor_recebido` sem itens; `restrict` faz a RPC falhar sempre que existe pagamento, embora o PRD mande avisar e seguir.
- **Colisão:** dinheiro perdido ou duplicado entre Meses, e a regra "tudo ou nada" do AD-7 vira "nada, sempre".
- **Rule proposta (emenda ao AD-7.4, novo AD "Reimportação"):**
  > A reimportação de um Mês M, dentro de `importar_fatura`: (1) apaga os Lançamentos com `fatura_id = fatura antiga de M` cuja Série começou em M (compras novas de M) e as filhas e Ajustes deles; (2) **reverte para `sistema`** (mantendo id, Série, classificação e Apelido) os Lançamentos de M que eram previstos casados de Séries anteriores; (3) apaga apenas os previstos de Meses > M que ainda são `lancado_por = 'sistema'`, que pertencem a Séries iniciadas em M e que não têm `pagamento_itens`; (4) nunca apaga uma Série que tenha Lançamento fora de M; (5) apaga os Pagamentos que tenham item em Lançamento apagado no passo 1 (o Pagamento inteiro, com todos os itens, restaurando Status pela regra de desfazer do AD-10) e devolve na resposta a lista desses Pagamentos para o aviso; (6) depois casa e gera previstos com `insert … on conflict (serie_id, parcela_n) do nothing`. Lançamentos `manual` com `fatura_id = M` (incluídos à mão, FR-7) são apagados junto, e o aviso conta quantos são. Todo previsto guarda `origem_lancamento_id` (a parcela que o gerou), que é a única forma de saber "quem o criou".

### C-4 — Conta manual: quem materializa os Lançamentos, até quando e com que `parcela_n`

- **Unidades:** A = story "Contas manuais" (`features/contas-manuais`); B = story "Painel / navegar Meses" (FR-22); C = story "Previsão" (FR-32).
- **Como cada uma obedece:** AD-8 diz que "toda Conta manual tem uma `serie`" e que cada parcela é um Lançamento. FR-17 diz "cria os Lançamentos das Contas manuais ativas em cada Mês", sem dizer quando.
  - A, ao salvar, cria as N parcelas de uma conta parcelada. Uma recorrente ("até encerrar") é infinita, e A cria 12 meses.
  - B, ao abrir um Mês sem Lançamento da Conta, gera o do Mês aberto (preguiçoso) com `parcela_n` = posição no ano. A usou o índice desde o início. A restrição única não pega a duplicata, porque os números diferem, e a Conta aparece duas vezes.
  - C precisa de 6 Meses futuros e lê o que existe. Se só B gera, a Previsão mostra só o Mês aberto.
  - FR-18 ("vale do Mês atual em diante"): A atualiza as linhas futuras, inclusive uma já paga ou com `vencimento_combinado`; B as recria.
  - Bombinhas: são 3 partes, uma delas Dívida programada (06/04/27). A cria 3 Séries; B cria 1 Série com Divisão.
- **Colisão:** linhas duplicadas, Previsão incompleta e edição que reescreve algo já pago.
- **Rule proposta (novo AD "Materialização de Contas manuais"):**
  > Os Lançamentos de Contas manuais são materializados só pela RPC idempotente `materializar_contas_manuais(ate_mes)`, que usa a função `parcelasDaConta(conta, ate_mes)` do núcleo. O horizonte é o Mês atual + 12, e ela roda ao salvar, alterar ou encerrar uma Conta e no cron diário (AD-13). Nenhuma tela cria Lançamento de Conta manual por conta própria. `parcela_n` = índice do Mês desde `mes_inicial` (1 no primeiro Mês), também para as recorrentes (`parcela_total null`). A inserção usa `on conflict (serie_id, parcela_n) do nothing`. Uma Conta manual tem **uma** Série; as partes viram `divisao` na linha-mãe (C-1), cada uma com `vencimento_combinado` opcional, copiado para a filha. A alteração (FR-18) recria só as linhas com `mes ≥ mês atual` que não têm `pagamento_itens` nem edição manual depois da geração (`editado_em is null`); as demais ficam e são listadas no aviso.

---

## Altos

### H-1 — O que o avaliador da Fórmula recebe: Painel, Recebimentos e Mensagem projetam linhas diferentes

- **Unidades:** A = `domain/formula` (avaliador, AD-11); B = `features/recebimentos` (Saldo pendente, FR-26); C = `domain/mensagem` (FR-53).
- **Colisão:** AD-11 diz que só o avaliador calcula o valor e a lista de Lançamentos. A recebe `Lancamento[]` e soma `valor_centavos`. B precisa do `restante` (C-2) de todos os Meses, sem Dívidas programadas não vencidas. C precisa do Mês, sem pagos, sem R$ 0,00, sem previstos (exceto com "Incluir previstos"), com o restante dos parciais e com Ajustes. Cada um filtra por conta própria antes de chamar A, e o "R$ 2.819,68" do Painel, da Mensagem e do cartão do Rangel diverge assim que existe um pagamento parcial. Também fica indefinido se previstos sem par (FR-45) entram nos Blocos de um Mês já importado.
- **Rule proposta (emenda ao AD-11):**
  > O avaliador tem uma assinatura só: `avaliar(formula, linhas: LinhaAvaliavel[])`, com `LinhaAvaliavel = { id, responsavelId, tipoId, centavos }`. Ele nunca lê `valor_centavos` nem Status. As linhas vêm de três projeções do núcleo, as únicas permitidas: `projetarPainel(lancamentos, mes, faturas)` (folhas do Mês, valor cheio, inclui pagos; inclui previstos só se o Mês não tem Fatura; previsto sem par num Mês com Fatura não entra), `projetarPendente(lancamentos, hoje)` (folhas de todos os Meses com `restante ≠ 0`, sem Dívida programada não vencida, com `centavos = restante`) e `projetarMensagem(lancamentos, mes, opcoes)` (regras de inclusão do EXPERIENCE.md, `centavos = restante`). Bloco, Ver cálculo, filtro da grade, Mensagem forma 2, cartão de Recebimentos, "Falta receber", Meu gasto por Tipo e lembrete de atraso chamam `avaliar` sobre a projeção nomeada aqui, e nenhuma tela filtra linhas antes.

### H-2 — Vencimento do Mês e "Atrasado": tela e Edge Function usam fontes diferentes

- **Unidades:** A = `domain/lembretes` + Edge Function (AD-13); B = `domain/pagamento` (estado derivado Atrasado, FR-49).
- **Colisão:** FR-49 usa "o vencimento da Fatura + tolerância". Um Mês sem Fatura (Contas manuais, Bombinhas da Mãe) não tem `faturas.vencimento`. B calcula o vencimento pela configuração do Ciclo; A usa `faturas.vencimento` e ignora Meses sem Fatura. Resultado: o selo "Atrasado" aparece no app e o lembrete nunca chega, ou o contrário. A tolerância também fica em lugar indefinido (B: em memória do Configurações; A: só lê o banco).
- **Rule proposta (novo item no AD-9):**
  > `vencimentoDoMes(mes, faturas, configsCiclo)` no núcleo é a única fonte: usa o vencimento da Fatura importada do Mês, senão o dia de vencimento da configuração de Ciclo vigente naquele Mês. `estaAtrasado(l, hoje, faturas, configsCiclo, toleranciaDias)` usa `l.vencimento_combinado` quando existe, senão `vencimentoDoMes(l.mes) + toleranciaDias`, e exige `restante(l) > 0` e que `l` não seja previsto. Tolerância, limite do Ajuste e chaves de lembrete ficam na tabela `configuracoes` (uma linha por `owner_id`), e nunca em armazenamento local.

### H-3 — "Previsto" tem duas definições (`lancado_por` × Mês futuro)

- **Unidades:** A = grade/selo (EXPERIENCE "Previsto"); B = `domain/mensagem`; C = Contas manuais (FR-17: "os Meses futuros mostram esses Lançamentos como previstos").
- **Colisão:** AD-6 fecha `lancado_por` em `fatura|sistema|manual|historico`. As linhas de Conta manual são `manual` (FR-17), mas devem aparecer como previstas nos Meses futuros. A usa `lancado_por = 'sistema'` e mostra a Bombinhas de março/27 sem selo. B exclui previstos pela mesma regra e inclui uma parcela futura de Conta manual na mensagem de um Mês futuro.
- **Rule proposta (emenda ao AD-6):**
  > `ehPrevisto(l, mesAtual)` do núcleo é a única definição: `l.lancado_por = 'sistema'` **ou** (`l.lancado_por = 'manual'` e `l.conta_manual_id is not null` e `l.mes > mesAtual`). Selo, filtros, Conferência, Mensagem, Previsão e atraso usam essa função; ninguém compara `lancado_por` direto para decidir "previsto".

### H-4 — Mês de um Lançamento criado no app: Mês aberto × Ciclo × soma de meses

- **Unidades:** A = "＋ Lançamento" no Painel (EXPERIENCE: "incluir à mão no Mês aberto"); B = `domain/ciclo` (AD-9: "calcula `mes` a partir da data"); C = `domain/previstos` (Mês das parcelas futuras).
- **Colisão:** A grava `mes = Mês exibido`. B recalcula pela data (data 07/11 com fechamento dia 5 → dezembro), e o Lançamento some do Painel em que Rafael o criou. C, para os previstos, ora soma meses ao `mes` da parcela, ora aplica o Ciclo à `data_compra + k meses`; quando o fechamento muda, as duas dão Meses diferentes. Conta manual usa "Começa em" (Mês escolhido), sem data.
- **Rule proposta (substitui o 2º período do AD-9):**
  > O `mes` de um Lançamento é decidido uma vez, na criação, por uma destas três regras e nunca recalculado: (a) Fatura: o Mês do vencimento lido; (b) previsto ou parcela de Conta manual: `somarMeses(mesOrigem, k)` do núcleo, sem Ciclo; (c) Lançamento avulso com data (`＋ Lançamento`): `mesDoCiclo(data, configs)`, e o painel mostra o Mês resultante antes de salvar ("Vai para Dez/26"); se Rafael não informar a data, vale o Mês aberto. Editar a data de um Lançamento avulso recalcula pela regra (c); nas regras (a) e (b), editar a data não muda o `mes`.

### H-5 — Regra: chave exata × comparação tolerante; quem grava; Divisão em centavos

- **Unidades:** A = `domain/classificacao` (FR-9, FR-10); B = `domain/normalizacao` (AD-6); C = Painel do Lançamento e Revisar (os dois classificam).
- **Colisão:** AD-6: `nome_normalizado` é "a única chave de Regras, previstos e Ajustes". FR-9: a Regra tolera "DM*SPOTIFY" / "EBN SPOTIFY" / "EBANX SPOTIFY".
  - B faz a normalização agressiva (tira prefixos de adquirente), e o casamento de previstos e Ajustes passa a juntar lojas diferentes.
  - A mantém a normalização leve e adiciona uma busca aproximada só para as Regras, o que contradiz "única chave".
  - C: Revisar atualiza a Regra ao classificar; o painel do Lançamento não atualiza (FR-10 fala de "revisão"). Os dois guardam formatos diferentes (Revisar: último valor; planilha: o mais frequente).
  - A Regra do Monjaro guarda a Divisão "por valor" (31067/15533), que não serve para outro Valor.
  - Mudar a função de normalização deixa o `nome_normalizado` gravado com a versão antiga.
- **Rule proposta (emenda ao AD-6):**
  > Existem duas chaves no núcleo: `normalizarNome` (exata: maiúsculas, sem acento, espaços colapsados, sem parcela) para previstos, Ajustes e Séries, e `chaveDeRegra` (deriva de `normalizarNome` e remove prefixos de adquirente de uma lista do núcleo) só para Regras e sugestões. As duas são gravadas (`nome_normalizado`, `chave_regra`) junto com `normalizacao_versao`; mudar qualquer uma exige uma migração que recalcula as colunas. `regras` tem `unique (owner_id, chave_regra)`. Toda mudança de Tipo, Responsável ou Divisão feita pelo usuário num Lançamento não previsto, em qualquer tela, chama `aprenderRegra` do núcleo e grava pelo único repositório `regrasRepo.upsert`. A Divisão de uma Regra é guardada só em frações racionais (`num/den`); uma Divisão "por valor" é convertida para `valor_parte / valor_total` ao aprender. A frequência por Responsável (FR-9) é calculada a partir dos Lançamentos e nunca gravada na Regra.

### H-6 — Fila de Revisar: derivada das linhas ou estado gravado?

- **Unidades:** A = `importar_fatura` (produz "valor mudou", "previsto sem par", "Ajuste reconhecido"); B = `features/revisar` (fila e contador "Faltam N").
- **Colisão:** "Valor mudou de R$ 445,89 para R$ 449,10" não é derivável depois do casamento (a mesma linha já tem o valor novo). A grava uma coluna `revisao_motivo`. B deriva a fila de `responsavel_id is null or tipo_id is null` e recalcula as sugestões na hora, com Regras que podem ter mudado. O contador da importação ("17 para revisar") e o do menu divergem; as variantes (c), (d) e (e) nunca aparecem em B.
- **Rule proposta (novo AD "Fila de revisão"):**
  > A pendência de revisão é estado gravado no Lançamento: `revisao_motivo` (enum `sem_classificacao | sugestao | sugestao_duvidosa | valor_mudou | previsto_sem_par | ajuste`, anulável), `revisao_dados jsonb` (sugestão gravada, valor anterior) e `revisado_em`. Só a importação (`importar_fatura`) e a importação da planilha preenchem esses campos, com o resultado da classificação do núcleo. Qualquer classificação, confirmação, "Manter", "Remover previsto" ou "Desvincular" limpa `revisao_motivo`. A fila = Lançamentos do Mês da última Fatura com `revisao_motivo is not null`, e o contador é a contagem dessa mesma consulta.

### H-7 — Excluir ou substituir Responsável, Tipo ou Status em uso: referências em `jsonb` sem FK

- **Unidades:** A = `features/configuracoes` (FR-46: substituto ou arquivar); B = `domain/formula` (árvore em `jsonb`, AD-11); C = Regras e Contas manuais (Divisão em `jsonb`).
- **Colisão:** A troca `lancamentos.responsavel_id` e apaga o Responsável. Os ids dentro de `blocos.formula`, `regras.divisao`, `contas_manuais.partes` e `lancamentos.divisao` (C-1) continuam apontando para o id apagado, sem FK que impeça. O avaliador falha na validação zod ou soma zero em silêncio, e o Bloco "Rangel" vira R$ 0,00. Arquivar: B esconde o operando do Montador e não sabe se o arquivado ainda soma.
- **Rule proposta (novo AD "Referências a cadastros"):**
  > Responsável, Tipo e Status nunca são apagados com `delete` direto. A exclusão é a RPC `substituir_cadastro(tipo, de_id, para_id)`, que numa transação reescreve todas as referências, inclusive as de `jsonb` (`blocos.formula`, `regras.divisao`, `lancamentos.divisao`, `contas_manuais.partes`), e só depois apaga. A lista de colunas `jsonb` que guardam ids fica numa constante do núcleo (`REFERENCIAS_JSONB`), que tem teste. Arquivar (`arquivado_em`) só esconde o cadastro dos seletores: Fórmulas, Regras e somas continuam usando o arquivado normalmente. Se a substituição deixar uma Fórmula com o mesmo operando duas vezes, a RPC devolve a lista desses Blocos para o aviso.

### H-8 — Quem entra na Conferência: `lancado_por = 'fatura'` × `fatura_id`

- **Unidades:** A = `domain/conferencia` (FR-6); B = Painel do Lançamento / "＋ Lançamento" (FR-7: "incluir Lançamentos de uma Fatura importada", EXPERIENCE: Lançado por = Manual).
- **Colisão:** A soma `lancado_por = 'fatura'`. B cria a linha que faltou (o caso "lemos 41") como `manual`, sem `fatura_id` nem final do cartão. A Conferência nunca volta a bater, e a marca "verificar" nunca some.
- **Rule proposta (emenda ao AD-7.3):**
  > A Conferência de uma Fatura soma as linhas de identidade (C-1) com `fatura_id = F` e `excluido_em is null`, separadas por `final_cartao` e por sinal, independentemente de `lancado_por`. Um Lançamento incluído à mão num Mês com Fatura pode receber `fatura_id` e `final_cartao` (o painel pergunta "Faz parte da fatura?"); então entra na Conferência e mantém `lancado_por = 'manual'`. Ajustes entram na Conferência como créditos.

### H-9 — Ajuste: dono da classificação, Seleção e Pagamento

- **Unidades:** A = `domain/ajuste` (FR-47, `ajuste_de_id`); B = Painel/Seleção (FR-48); C = `domain/pagamento`.
- **Colisão:** "O Ajuste herda o Tipo e o Responsável". A copia esses valores ao vincular; outro agente, para manter a herança ao reclassificar a parcela, os deriva na leitura (`coalesce` com a parcela). A reclassificação da parcela atualiza só a parcela, e o Ajuste fica com o Responsável antigo no Bloco. Na grade, o Ajuste aparece "recuado sob a parcela": B não sabe se marcar a parcela marca o Ajuste. Mãe paga R$ 1.140,66 (líquido) com a Seleção só da parcela (R$ 1.140,74); o valor recebido fica menor que o total e o app pergunta da diferença por R$ 0,08. Se a parcela for dividida, a herança de "o Responsável" fica sem sentido.
- **Rule proposta (emenda ao AD-8, parágrafo "Ajuste"):**
  > O Ajuste é uma linha folha própria com `ajuste_de_id` apontando para a **linha-mãe** da parcela, sem Série. `responsavel_id`, `tipo_id` e `status_id` dele são gravados e sempre iguais aos da parcela: toda gravação que muda esses campos na parcela muda o Ajuste na mesma chamada, pelo repositório ou RPC. Se a parcela é dividida, o Ajuste é dividido nas mesmas frações. Na Seleção, marcar ou desmarcar uma parcela marca ou desmarca os Ajustes dela, e "selecionar todos" inclui os Ajustes. Na alocação do Pagamento, o Ajuste é quitado junto com a parcela. Desvincular (`ajuste_de_id = null`) torna o Ajuste um Lançamento comum, com classificação própria.

### H-10 — Edge Function no Deno importa `src/domain` escrito para o Next

- **Unidades:** A = qualquer story do núcleo (escrita com `moduleResolution: bundler`, imports sem extensão e `import { z } from 'zod'`); B = story "Lembretes" (Edge Function).
- **Colisão:** AD-1 e AD-13 exigem que o mesmo núcleo rode no Deno, mas o Deno não resolve `./dinheiro` sem extensão nem `zod` sem import map, e o bundler das Edge Functions só segue o grafo a partir de `supabase/functions`. A entrega um núcleo que passa no Vitest; B descobre na implantação que não compila e duplica a regra de atraso "só por enquanto", violando AD-13.
- **Rule proposta (emenda ao AD-1):**
  > `src/domain` usa imports relativos com extensão `.ts` (`allowImportingTsExtensions` + `noEmit` no tsconfig do Next) e só importa `zod` por especificador nu, resolvido no Deno por `supabase/functions/deno.json` (`"imports": { "zod": "npm:zod@<versão do package.json>" }`). A CI roda `deno check supabase/functions/lembretes/index.ts` e falha se o núcleo não compilar no Deno. Nenhum arquivo de `supabase/functions` contém regra de negócio além da orquestração.

### H-11 — RPC com várias linhas + Realtime + atualização otimista + "última gravação vale"

- **Unidades:** A = `src/data/realtime` (AD-4); B = Painel do Lançamento (salva campo a campo); C = RPCs (`dividir_lancamento`, `aplicar_pagamento`).
- **Colisão:** a RPC `dividir` emite UPDATE da mãe e INSERT das filhas como eventos separados. A os aplica um a um, e por um quadro os Blocos ficam sem os R$ 466,00 (mãe oculta, filhas ainda não chegaram). B grava a linha inteira a partir do formulário, e a mudança de Tipo feita no PC (último evento) é sobrescrita pelo Apelido salvo no iPad com o Tipo velho: "última gravação vale" por linha apaga um campo que o outro aparelho mudou. O eco dos próprios eventos desfaz a atualização otimista quando chega fora de ordem. Os DELETE no Realtime trazem só a chave primária.
- **Rule proposta (emenda ao AD-3 e AD-4):**
  > Toda gravação de repositório é um `update` só das colunas alteradas (nunca da linha inteira); "última gravação vale" é por coluna. Toda RPC devolve as linhas afetadas, e o cliente as aplica ao estado **como um lote único** antes de qualquer evento Realtime da mesma transação. Um evento Realtime só substitui a linha local se `updated_at` do evento for maior que o local; DELETE remove pela chave. As tabelas assinadas usam `replica identity full`. Uma atualização otimista é descartada quando chega a linha do banco com `updated_at` mais novo ou quando a gravação falha, e nunca por timeout.

### H-12 — Identidade da Série: duas compras iguais no mesmo Mês e o desempate do casamento

- **Unidades:** A = `domain/previstos` / casamento (FR-45: "pelo Nome normalizado e pela Parcela"); B = `domain/importacao-planilha` (FR-2, FR-8, cria Séries a partir do histórico).
- **Colisão:** duas compras "SHOPEE*X 01/03 R$ 59,90" na mesma Fatura viram duas Séries. Em novembro, chegam duas "02/03" e existem dois previstos com o mesmo Nome e a mesma Parcela. A casa os dois reais com o mesmo previsto e estoura `unique (serie_id, parcela_n)`, e a importação inteira falha (AD-7: tudo ou nada). B, sem Série no histórico, agrupa por `(nome_normalizado, parcela_total, valor)` e junta as duas compras numa Série só, com duas linhas `parcela_n = 1`, o que faz a migração da planilha falhar.
- **Rule proposta (emenda ao AD-8):**
  > Uma Série é identificada por `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)`, onde `ocorrencia` é o índice (1, 2, …) entre compras idênticas no mesmo Mês, na ordem da Fatura ou da planilha; essa chave é única. O casamento do núcleo é uma atribuição 1-para-1: para cada `(nome_normalizado, parcela_n, parcela_total)`, ordena os reais pela ordem da Fatura e os previstos por `(valor igual primeiro, ocorrencia)` e casa em pares; os que sobram seguem FR-45 (previsto sem par / real sem previsto). A RPC nunca resolve conflitos de casamento por conta própria.

### H-13 — Excluir um Lançamento que já tem Pagamento

- **Unidades:** A = Excluir (FR-46; EXPERIENCE: "O Saldo pendente da Mãe muda de R$ 0,00 para - R$ 310,67"); B = Saldo pendente (FR-26, "Fórmula aplicada aos Lançamentos não pagos").
- **Colisão:** a UX espera que a exclusão deixe um crédito (saldo negativo). B só soma Lançamentos não pagos e não tem de onde tirar - R$ 310,67. A apaga em cascata os itens (e o Pagamento fica maior que a soma dos itens) ou exclui logicamente e os itens continuam contando para um Lançamento invisível. Cada agente escolhe um caminho, e o Histórico de Pagamentos diverge do Saldo.
- **Rule proposta (emenda ao AD-10):**
  > Excluir é sempre lógico (`excluido_em`). Os `pagamento_itens` de um Lançamento excluído permanecem. `projetarPendente` (H-1) emite, para cada Lançamento excluído com itens, uma linha com `centavos = − Σ itens` e o Responsável e Tipo do excluído, e é assim que nasce o crédito "- R$ 310,67". "Desfazer" da exclusão limpa `excluido_em`. Desfazer o Pagamento remove o crédito.

---

## Médios

### M-1 — Lembretes: deduplicação, preferências e dono com a chave de serviço
- **Colisão:** `lembretes_enviados (tipo, referencia, dia)`. Com `dia` na chave, o lembrete de atraso se repete todo dia; sem `dia`, um segundo atraso do mesmo Bloco nunca é avisado. As preferências ficam em "Configurações → Aparência", e a story da tela as grava no navegador, onde a Edge Function não consegue ler. A Edge Function usa a chave de serviço (RLS desligado) e, sem filtro explícito, mistura os donos.
- **Rule:**
  > Fechamento: `referencia = mes`, único por `(owner_id, tipo, referencia)`. Atraso: um lembrete por Bloco de cobrança cada vez que **um novo Lançamento** entra em atraso; `referencia = bloco_id || ':' || lancamento_id`, único por `(owner_id, tipo, referencia)`, e os novos do mesmo dia vão numa única notificação. As preferências ficam em `configuracoes.lembretes jsonb`. A Edge Function processa um `owner_id` por vez e filtra toda consulta por ele. A faixa do app usa as mesmas funções e a mesma tabela para saber o que já foi avisado.

### M-2 — Data de início da configuração do Ciclo
- **Colisão:** AD-9 fala em "configuração com data de início"; FR-36 diz "vale a partir do próximo Ciclo". A tela de Configurações grava `data_inicio = hoje`; o núcleo espera o início do próximo Ciclo. O Lançamento de amanhã cai num Mês diferente em cada interpretação.
- **Rule:**
  > `config_ciclo.vigente_desde` = o dia seguinte ao próximo fechamento calculado pela configuração anterior, calculado por `proximoInicioDeCiclo` do núcleo; a tela não envia a data.

### M-3 — Ordem de alocação e créditos na Seleção paga parcialmente
- **Colisão:** "do mais antigo para o mais novo" sem chave total; a RPC reordena por `created_at` e o núcleo por `mes`. Um estorno negativo na Seleção recebe item negativo antes ou depois, e o último "parcial" muda.
- **Rule:**
  > A ordem é `(mes, data, ordem_fatura, id)`. Os créditos (valor < 0) são quitados por inteiro primeiro e aumentam o valor disponível; depois, as despesas na ordem. A RPC insere os itens exatamente como o núcleo os gerou e não ordena nada.

### M-4 — "Mesmo Nome" no Apelido em massa e nos previstos
- **Colisão:** FR-52 "aplicar aos outros com o mesmo Nome". Um agente usa `nome` exato; outro, `nome_normalizado`; outro, a Série.
- **Rule:**
  > "Aplicar a todos" do Apelido atinge os Lançamentos com o mesmo `nome_normalizado`, em todos os Meses, inclusive previstos. "Aplicar a todos" de reclassificação (FR-44) atinge só os Lançamentos da mesma Série com `mes` maior e `ehPrevisto`.

### M-5 — Importação calculada no cliente sobre dados velhos
- **Colisão:** o núcleo casa os previstos que o aparelho carregou. Se o outro aparelho removeu um previsto, a RPC insere um casamento com id inexistente ou já `fatura`.
- **Rule:**
  > `importar_fatura` recebe, para cada previsto casado, `(id, updated_at)` e aborta com `dados_mudaram` se algum não estiver mais `sistema` com o mesmo `updated_at`; o cliente recarrega e recalcula.

### M-6 — Exclusão lógica filtrada em lugares diferentes
- **Colisão:** AD-8 pressupõe "não excluídos". O repositório filtra `excluido_em`; a assinatura Realtime e a Edge Function, não.
- **Rule:**
  > Toda função do núcleo que recebe Lançamentos ignora `excluido_em is not null`, exceto `projetarPendente` (H-13); os repositórios filtram também. Teste de propriedade no núcleo: uma linha excluída nunca muda Bloco, Conferência ou Mensagem.

### M-7 — Marca "verificar": gravada ou derivada
- **Colisão:** "some sozinha quando a Conferência bate". A importação grava `verificar = true`; o Painel deriva da Conferência. A marca de dúvida da extração nunca some ou some cedo demais.
- **Rule:**
  > Grava-se só `duvida_extracao boolean`. `precisaVerificar(l, conferencia) = conferencia.cartao(l.final_cartao).bate === false`. Com o cartão conferido, nenhuma marca aparece. Com diferença, todas as linhas do cartão ficam marcadas, e as com `duvida_extracao` aparecem primeiro no filtro "Verificar".

### M-8 — Status padrão de linhas novas
- **Colisão:** FR-1 começa sem Status. A importação usa o "primeiro Status que não conta como pago"; outra story grava `null`; as filhas da Divisão copiam o Status da mãe.
- **Rule:**
  > `configuracoes.status_padrao_id` (anulável). Lançamentos novos (Fatura, previsto, manual) recebem esse Status; `null` vale "Não pago" (C-2). Os previstos nunca copiam o Status da origem.

### M-9 — Editar o Valor de uma linha dividida
- **Colisão:** o painel permite editar o Valor (FR-7). Editar uma filha quebra "soma = original"; editar a mãe oculta é impossível pela grade.
- **Rule:**
  > O Valor de uma filha só muda pela janela Dividir. Editar o Valor no painel de uma filha edita a mãe e rematerializa as filhas (C-1), com aviso.

### M-10 — Dois schemas da extração
- **Colisão:** a semente põe "prompt e schema de extração" em `src/server`; AD-7.3 exige schema zod do núcleo. A rota valida com um, o núcleo com outro.
- **Rule:**
  > O schema zod da extração vive em `src/domain/importacao/fatura-extraida.ts`; `src/server/gemini` o importa e gera dele o `responseSchema` do Gemini. Não existe outro schema.

### M-11 — Dividir ou reclassificar algo já pago
- **Colisão:** a RPC `dividir` cria filhas sem itens enquanto a mãe tem `pagamento_itens`, e o Pagamento fica sem dono visível.
- **Rule:**
  > `dividir_lancamento` recusa uma mãe com `pagamento_itens` (`tem_pagamento`). Mudar o Responsável de uma linha com itens é permitido, e o aviso do FR-46 mostra o impacto no Saldo.

### M-12 — Ids que desaparecem com a reimportação e a Seleção aberta
- **Colisão:** o outro aparelho tem uma Seleção ou um painel aberto com ids apagados pela reimportação, e "Aplicar status" vai com ids mortos.
- **Rule:**
  > Toda RPC que recebe ids de Lançamento valida que todos existem, não estão excluídos e são folhas; senão, aborta com `selecao_desatualizada`. Ao receber DELETE de um id selecionado, o cliente o tira da Seleção e mostra o aviso.

## Baixos

- **L-1 — "Recebido no mês":** fica indefinido se é o mês civil de `pagamentos.data` ou o Mês (vencimento). **Rule:** "Recebido no mês = Pagamentos com `to_char(data,'YYYY-MM') = mes`, mês civil em America/Sao_Paulo".
- **L-2 — "meu Bloco" único:** **Rule:** "`create unique index on blocos(owner_id) where meu_bloco`".
- **L-3 — Ordem da fatura:** a grade exige a ordem do PDF. **Rule:** "`ordem_fatura integer` gravado na importação; manuais com `null` vão ao fim, por `created_at`; previstos herdam a ordem da origem".
- **L-4 — "Dispensar" o alerta de Conferência entre aparelhos:** **Rule:** "`faturas.alerta_dispensado_em timestamptz`; o alerta volta se a diferença mudar".
- **L-5 — Horário do `pg_cron`:** o cron é em UTC. **Rule:** "agendar `0 12 * * *` (09:00 em São Paulo, sem horário de verão) e a Edge Function calcular 'hoje' em America/Sao_Paulo, sem confiar no horário do disparo".
- **L-6 — Forma de `configuracoes`:** **Rule:** "uma tabela `configuracoes` com uma linha por `owner_id` (PK = `owner_id`), criada no primeiro login; Ciclo fica em `config_ciclo` com histórico".

## Notas para a próxima versão da Spine

1. Acrescentar uma seção **"Fontes únicas"** que liste: `ehPago`, `restante`, `ehPrevisto`, `estaAtrasado`, `vencimentoDoMes`, `linhasFolha`, `linhasDeIdentidade`, `projetarPainel/Pendente/Mensagem`, `normalizarNome`, `chaveDeRegra`. Toda story cita a função que usa e nunca a reescreve.
2. Acrescentar ao ER: `lancamentos.divisao jsonb`, `dividida`, `origem_lancamento_id`, `conta_manual_id`, `fatura_id`, `final_cartao`, `ordem_fatura`, `excluido_em`, `editado_em`, `revisao_*`, `duvida_extracao`, `chave_regra`, `normalizacao_versao`; `pagamento_itens.status_anterior_id/status_aplicado_id/valor_quitado_centavos`; `series` com a chave natural do H-12; `configuracoes`.
3. Acrescentar aos testes de aceite obrigatórios: (a) dividir a parcela em outubro e importar novembro (casamento da mãe e filhas recriadas); (b) pagar parcial, pagar o resto e desfazer o primeiro; (c) reimportar outubro com novembro já importado; (d) duas compras parceladas idênticas na mesma Fatura; (e) a mesma regra de atraso no Vitest e no `deno check`.
