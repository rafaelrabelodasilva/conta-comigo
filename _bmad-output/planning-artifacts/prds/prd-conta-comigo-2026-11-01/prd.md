---
title: "PRD: Conta Comigo"
status: final
created: 2026-11-01
updated: 2026-11-01
---

# PRD: Conta Comigo

## 0. Sobre este documento

Este PRD detalha a primeira versão do Conta Comigo para quem vai desenhar a experiência (UX), definir a arquitetura e quebrar o trabalho em histórias. Ele parte do product brief aprovado (`../../briefs/brief-conta-comigo-2026-11-01/brief.md`) e não repete o que está lá.

**A planilha "Cartão" do Rafael (Google Sheets) é a base do app.** Os campos de um Lançamento (§3.1) são as colunas dela, e o app precisa fazer tudo o que a planilha faz hoje, só que com menos trabalho manual.

Os termos do Glossário (§3) valem para o documento inteiro. Os requisitos (FR) têm números globais estáveis: um FR novo recebe o próximo número livre, mesmo quando aparece no meio de uma seção. As suposições aparecem marcadas como `[ASSUMPTION]` e estão reunidas no §10. Os detalhes técnicos e os exemplos reais ficam no `addendum.md`.

## 1. Visão

O Conta Comigo é um app de finanças pessoais construído em torno do cartão de crédito do Rafael, que ele divide com outras pessoas. Ele sobe o PDF da fatura do Santander e digita a senha. O app extrai os Lançamentos, confere com os totais da fatura e classifica sozinho o que já conhece, aprendendo com os meses anteriores: parcelas em andamento, assinaturas e contas fixas. As parcelas futuras já ficam lançadas como previstas, o que dá ao Rafael uma previsão dos próximos meses. Sobra para ele só o que é novo, numa fila rápida de revisão.

O Painel mostra o mês atual em Blocos que o próprio Rafael monta (Rafael, Casal, Mãe, Lucas, Total…), e cada Bloco também filtra a grade. Na grade, ele filtra e seleciona os Lançamentos que quer cobrar, confere o total da seleção e gera a mensagem pronta para o WhatsApp. Quando a pessoa paga, ele seleciona os mesmos Lançamentos e aplica o Status "Pago".

A meta é trocar quase 1h50 de trabalho manual por menos de 10 minutos. Numa segunda fase, o app passa a responder a pergunta que Rafael não consegue responder hoje: quanto sobra do salário. Mais à frente, ele ajuda a planejar compras com Objetivos.

## 2. Usuário

### 2.1 Jobs To Be Done

- **Fechar o mês sem retrabalho:** saber quanto cada pessoa deve sem classificar de novo o que já foi classificado no mês anterior.
- **Confiar no número:** ter certeza de que os Lançamentos conferem com a fatura antes de cobrar alguém.
- **Cobrar sem constrangimento:** mandar uma mensagem clara, com total, Pix e detalhes, que a pessoa entende sem perguntar.
- **Não perder dinheiro:** saber o que está pago, o que ficou pendente, o que foi pago só em parte e o que só vai ser pago no futuro.
- **Entender o próprio dinheiro:** ver quanto do cartão é dele, de quais Tipos, e o que já está comprometido nos próximos meses.

### 2.2 Quem não usa o app (v1)

Rangel, Mãe e Lucas não acessam o app. Eles só recebem a mensagem de cobrança pelo WhatsApp e pagam por Pix. O app não tem acesso de outras pessoas, não tem contas para outros usuários e não aceita faturas de outros bancos.

### 2.3 Jornadas

- **UJ-0. Rafael configura o app pela primeira vez.**
  O app começa vazio. Rafael cadastra os Responsáveis (Rafael, Rangel, Casal, Mãe, Lucas), os Tipos (Casa, Saúde, Gatos, Bobiças…) e os Status (Pago, Não pago). Depois importa o histórico de 2026 da planilha e cria os Blocos: "Rafael" = Responsável Rafael, "Casal" = Responsável Casal, "Mãe", "Lucas" e "Total" = todos os Lançamentos do Mês. Por fim, configura o modelo da Mensagem de cobrança.

- **UJ-1. Rafael fecha a fatura de novembro no iPad.**
  No dia 5 a fatura fecha e o PDF chega por e-mail, protegido por senha. Rafael abre o app no iPad, sobe o PDF e digita a senha. O app mostra a Fatura de 06/11/26 e o resumo da importação: 47 Lançamentos conferidos com os totais da fatura, 30 já classificados (a maioria parcelas previstas que casaram) e 17 para revisar. Na fila, ele classifica as compras novas da Shopee e da Amazon, marcando várias de uma vez quando são da mesma pessoa. Ele dá o Apelido "Ração dos gatos" a "PETSUPERMARK OR2174325", divide um remédio entre Mãe e ele e atribui à Mãe o estorno de uma compra dela. No Painel, toca no Bloco "Mãe", e a grade mostra só os Lançamentos da Mãe. Ele toca em "selecionar todos", vê na barra "23 itens · R$ 1.350,14" e toca em "Gerar mensagem". Copia o texto e cola no WhatsApp dela.
  **Edge case:** se os Lançamentos não conferem com os totais da fatura, o app mostra a diferença antes de liberar a cobrança.
  **Edge case:** se ele subir por engano a fatura de outro mês, o app mostra o vencimento lido no PDF antes de importar. Se ele subir de novo a fatura de um Mês já importado, o app avisa que vai apagar os dados daquele Mês e importar tudo de novo.

- **UJ-2. Rafael registra o que recebeu.**
  A Mãe manda o Pix com o total do mês. Rafael filtra a grade pela Mãe, seleciona tudo, confere que a barra mostra o mesmo valor do Pix e aplica "Pago" em 08/11/26. O Rangel paga a parte dele: Rafael filtra os Responsáveis Casal e Rangel, seleciona tudo e aplica "Pago". O Lucas paga só R$ 100 de R$ 215. Rafael seleciona os itens do Lucas e aplica "Pago" informando R$ 100, e os R$ 115 que faltam ficam pendentes. No dia 17/11/26, dez dias depois do vencimento, o que ainda não foi pago aparece como atrasado.

- **UJ-3. Rafael lança uma viagem dividida que não está no cartão.**
  Ele cadastra uma Conta manual, "Bombinhas", de R$ 636 em 6 parcelas mensais, dividida em três partes iguais de R$ 106: Mãe (Mãe e Pai), Casal (Rafael e Rangel) e Lucas (Lucas e Miri). A Mãe paga mês a mês. O Lucas combinou de pagar tudo no final, então a parte dele vira uma Dívida programada com vencimento em abril. Até lá, ela fica em "A receber".

- **UJ-4. Rafael cobra o Rangel pelo Bloco.**
  Rafael criou o Bloco "Rangel" = Rangel + (Casal ÷ 2). No Painel de novembro, ele toca em "Mensagem" nesse Bloco. O app mostra o cálculo (Rangel R$ 0,00 + Casal R$ 5.639,35 ÷ 2 = R$ 2.819,68) e a mensagem com o total de R$ 2.819,68 e os detalhes agrupados. Rafael copia e cola no WhatsApp do Rangel. Quando o Rangel paga, ele filtra Casal e Rangel, seleciona tudo e aplica "Pago".

## 3. Glossário

### 3.1 O Lançamento e seus campos (espelham a planilha)

- **Lançamento**: uma conta, despesa ou crédito de um Mês. Pode vir da Fatura, de uma Conta manual ou do próprio sistema (previsto). É a unidade que se classifica, se seleciona, se cobra e se marca como paga. Seus campos são:
  - **Nome**: o texto exatamente como veio da Fatura (ou como foi digitado numa Conta manual), por exemplo "AMAZONMKTPLC*BAISMOVEI". Não muda. É sempre o Nome que o app usa para reconhecer o mesmo Lançamento entre Meses, casar previstos e aplicar Regras.
  - **Apelido**: um nome opcional dado por Rafael para lembrar da conta ("Lava-louças"). Quando existe, as telas e a mensagem mostram o Apelido no lugar do Nome. Nunca é usado para reconhecer Lançamentos.
  - **Valor**: em R$, negativo para crédito ou estorno. É o que somam a barra da Seleção e os Blocos.
  - **Parcela**: a posição "n/N" na compra parcelada ("05/10"). "1/1" é à vista. Lançamentos manuais avulsos podem não ter Parcela.
  - **Observação**: texto livre de Rafael. Aparece quando ele abre o Lançamento.
  - **Tipo**: do que se trata o gasto (Casa, Saúde, Gatos, Bobiças, Estudo…). Lista cadastrada por Rafael.
  - **Responsável**: quem precisa pagar (Rafael, Rangel, Casal, Mãe, Lucas…). Lista cadastrada por Rafael. **Casal** é um Responsável próprio: as contas que são do Rafael e do Rangel ao mesmo tempo.
  - **Lançado por**: como o Lançamento entrou no Mês: Fatura (upload), Sistema (previsto), Manual (Conta manual ou inclusão à mão), Histórico (importação da planilha). A lista pode crescer.
  - **Status**: se está pago ou não. A lista é cadastrada por Rafael (ex.: Pago, Não pago), e cada Status diz se conta como pago. "Pago parcialmente" e "Atrasado" são calculados pelo app.
  - Também guarda **data da compra** e, se veio da Fatura, o **final do cartão**.

### 3.2 Demais termos

- **Fatura**: o PDF mensal do cartão Santander, com vencimento, totais de despesas e de créditos, saldo anterior, pagamentos e total a pagar. Uma Fatura por Mês.
- **Ciclo**: o período de compras de uma Fatura, do dia seguinte ao fechamento anterior até o dia de fechamento. O dia de fechamento é configurável e pode mudar.
- **Mês**: o mês de vencimento de uma Fatura, que corresponde a um Ciclo. O Painel sempre mostra um Mês, por padrão o atual.
- **Divisão**: repartir um Lançamento em várias linhas, cada uma com seu Responsável, Valor e Status (ex.: Monjaro R$ 466,00 → R$ 310,67 Mãe + R$ 155,33 Rafael, como na planilha).
- **Regra**: a associação aprendida entre um Nome normalizado e um Tipo, um Responsável e uma Divisão. Pode ser vista, editada e apagada.
- **Conta manual**: uma conta que não passa pelo cartão (ex.: Silvia, Bombinhas). Pode ser recorrente mensal ou parcelada, e gera Lançamentos nos Meses correspondentes.
- **Lançamento previsto**: um Lançamento com Lançado por = Sistema, criado num Mês futuro porque o app sabe que ele virá: as parcelas restantes de uma compra parcelada ou de uma Conta manual. Fica identificado como "previsto pelo sistema" até a Fatura daquele Mês confirmá-lo.
- **Previsão**: o conjunto dos Lançamentos previstos dos próximos Meses.
- **Ajuste**: um pequeno crédito da Fatura vinculado a uma parcela de mesmo Nome (ex.: MSC CRUZEIROS - R$ 0,08). Veja FR-47.
- **Conferência**: a checagem dos Lançamentos extraídos de uma Fatura contra os totais de despesas e de créditos dessa Fatura.
- **Bloco**: um totalizador nomeado do Painel, calculado por uma Fórmula sobre os Lançamentos do Mês.
- **Fórmula**: a expressão de um Bloco, montada por seleção, sem digitação livre. Tem como operandos Responsáveis, Tipos e "Todos", as operações somar, subtrair, multiplicar e dividir, números e parênteses. Exemplos: "Casal"; "Total" = Todos; (Rafael + Rangel) ÷ 2.
- **Painel**: a tela do Mês com os Blocos e a grade de Lançamentos.
- **Seleção**: os Lançamentos que Rafael marca na grade, depois de filtrar. Sobre uma Seleção ele gera a Mensagem de cobrança ou aplica um Status.
- **Mensagem de cobrança**: o texto gerado a partir de uma Seleção, pronto para colar no WhatsApp.
- **Pagamento**: o registro de que Rafael recebeu, numa data, um valor referente a uma Seleção.
- **Saldo pendente**: o que falta receber de um Responsável, somando todos os Meses.
- **Dívida programada**: um Lançamento (ou parte dele) com vencimento futuro combinado (ex.: o Lucas paga Bombinhas no fim).
- **Salário**, **Despesa extra**, **Sobra**, **Orçamento** (fase 2) e **Objetivo** (fase 3): definidos nas seções §4.11 e §4.12.

## 4. Funcionalidades

### 4.1 Configuração inicial
**Descrição:** o app começa vazio. Nada vem pré-configurado: Rafael monta tudo do jeito dele ao começar a usar. Realiza UJ-0.

#### FR-1: Começar do zero
No primeiro uso, o app não tem Responsáveis, Tipos, Status, Blocos nem modelo de mensagem prontos. Um passo a passo guia Rafael pela criação de cada um, e ele pode pular qualquer etapa e voltar depois.

#### FR-2: Importar histórico
Rafael pode importar as abas 01/2026 a 10/2026 da planilha "Cartão". A importação mapeia as colunas Despesa → Nome, Valor, Parcela, Observação, Tipo, Resposabilidade → Responsável e Status dívida → Status, com Lançado por = Histórico. Ela cria os Responsáveis, os Tipos, as Regras iniciais e as parcelas em andamento.
- Lançamentos divididos em várias linhas na planilha (ex.: Monjaro) continuam como uma Divisão.
- Depois da importação, o app mostra as Regras criadas para Rafael revisar.

#### FR-50: Gerenciar Status
Rafael pode criar, renomear, editar e excluir Status, e marcar cada um como "conta como pago" ou não.
- Antes de excluir um Status em uso, o app avisa quantos Lançamentos o usam e pede um Status substituto. Renomear não exige isso.

### 4.2 Importação da Fatura
**Descrição:** Rafael sobe o PDF e digita a senha. O app extrai os Lançamentos, deixa de fora o pagamento da fatura anterior (que não é despesa), faz a Conferência e descarta o PDF. Realiza UJ-1.

#### FR-3: Importar PDF protegido
Rafael pode enviar o PDF da Fatura e informar a senha no próprio app.
- O app abre PDFs protegidos com a senha informada. Se a senha estiver errada, ele avisa e pede de novo.
- A senha não é guardada depois da importação.
- Antes de gravar, o app mostra o vencimento e o Mês lidos no PDF, para Rafael confirmar que é a Fatura certa.

#### FR-51: Reimportar um Mês
Se Rafael importar uma Fatura de um Mês que já tem Fatura importada, o app avisa que vai apagar todos os Lançamentos daquele Mês vindos da Fatura (e os previstos que ela criou nos Meses seguintes) e importar tudo de novo a partir do PDF novo.
- Só faz isso depois da confirmação.
- Antes de confirmar, o app avisa se algum desses Lançamentos já tem Pagamento registrado ou classificação feita à mão, e mostra quantos.
- Depois de reimportar, as Regras e as parcelas herdadas são reaplicadas, para Rafael não precisar classificar de novo o que já sabia.
- Lançamentos de Contas manuais do Mês não são apagados.

#### FR-4: Não guardar o PDF
O app usa o PDF só durante a importação. Depois da extração ele descarta o arquivo e guarda apenas os Lançamentos e os totais da Fatura (vencimento, fechamento, totais de despesas e de créditos, saldo anterior, pagamentos e total a pagar).

#### FR-5: Extrair Lançamentos
O app extrai todos os Lançamentos da Fatura (despesas, parcelamentos, créditos e estornos) de todos os cartões, titular e adicionais, com Nome, data, Parcela, Valor e final do cartão, e com Lançado por = Fatura.
- O pagamento da fatura anterior não vira Lançamento.
- Os créditos e estornos entram com Valor negativo e são classificados como qualquer Lançamento: podem ser do Rafael, da Mãe ou de qualquer Responsável.
- Na Fatura de exemplo (outubro/2026), o app extrai exatamente os 49 Lançamentos esperados (ver addendum do brief).

#### FR-6: Conferir com a Fatura do Mês
O app confere os Lançamentos extraídos com os totais da própria Fatura: soma das despesas = "Total despesas", e soma dos créditos = "Total de créditos" (em outubro/2026, R$ 8.327,39 e R$ 639,62).
- Quando tudo confere, mostra "Conferido".
- Quando algo não confere, o app **avisa, mas não bloqueia**: mostra a diferença num alerta, e Rafael pode seguir classificando e cobrando. Um problema em uma ou duas contas não pode obrigá-lo a lançar tudo à mão.
- Para ajudar a achar o erro, a Conferência também é feita por cartão: a Fatura traz o "VALOR TOTAL" de cada cartão (ex.: final 8673: R$ 4.360,69). Em 10/2026, a soma dos cinco cartões dá exatamente o Total despesas, R$ 8.327,39. Assim o alerta aponta em qual cartão está a diferença, e não só que existe uma.
- Os Lançamentos que o app leu com dúvida, ou que estão no cartão com diferença, recebem uma marca discreta de "verificar", que **não é um Status**. Existe também um filtro "Verificar" na grade. Quando a Conferência volta a bater, as marcas somem sozinhas.
- O alerta continua visível no Painel daquele Mês até a Conferência bater ou Rafael dispensá-lo.
- Saldo anterior e pagamentos não entram na Conferência do Mês. Eles aparecem só na área de Meses anteriores (FR-30).

#### FR-36: Ciclo da Fatura
Rafael configura o dia de fechamento e o dia de vencimento do cartão, e pode alterá-los quando mudar o fechamento no banco.
- A mudança vale a partir do próximo Ciclo, e os Ciclos já fechados não mudam.
- Cada Mês tem um estado: aberto (ainda recebe Lançamentos manuais) ou fechado (Fatura importada e conferida).
- Lançamentos criados no app (Contas manuais e, na fase 3, parcelas de Objetivos) entram no Mês cujo Ciclo contém a data deles: uma data depois do fechamento vai para o Mês seguinte.
- O dia de fechamento serve só para decidir o Mês dos Lançamentos criados no app. A importação da Fatura não compara nada com ele: só lê os valores do PDF.

#### FR-47: Ajustes de centavos
Às vezes a Fatura traz, junto de uma parcela, um pequeno crédito com o mesmo Nome. Por exemplo, na Fatura de 06/11/26 vieram "MSC CRUZEIROS 02/12 R$ 1.140,74" e "MSC CRUZEIROS - R$ 0,08". O app reconhece esse crédito como Ajuste da parcela, e não como um estorno solto.
- Critério: crédito sem Parcela, na mesma Fatura, com o mesmo Nome normalizado de um Lançamento parcelado e valor absoluto menor que um limite configurável, que começa em R$ 1,00.
- O Ajuste fica vinculado à parcela e herda o Tipo e o Responsável dela. Na grade, os dois aparecem juntos com o líquido: "R$ 1.140,74 - R$ 0,08 = R$ 1.140,66".
- Na Mensagem de cobrança, o Ajuste aparece como linha própria, logo abaixo da parcela, para a pessoa entender a diferença.
- O Ajuste não altera o Valor das parcelas previstas, e o casamento (FR-45) usa o Valor da parcela, não o líquido.
- Rafael pode desfazer o vínculo e tratar o crédito como um Lançamento comum.

#### FR-7: Corrigir a extração
Rafael pode editar, incluir e excluir Lançamentos de uma Fatura importada. A Conferência é recalculada na hora.

### 4.3 Classificação e aprendizado
**Descrição:** antes de mostrar a fila, o app atribui Tipo, Responsável e Divisão a tudo o que reconhece pelo Nome, aprendendo com os Meses anteriores. Realiza UJ-1.

#### FR-44: Lançar as parcelas futuras
Ao importar uma Fatura, para cada Lançamento parcelado n/N com n < N, o app cria os Lançamentos previstos n+1/N até N/N nos Meses seguintes, com o mesmo Nome, Apelido, Valor, Tipo, Responsável, Divisão e Observação, e com Lançado por = Sistema.
- Um Lançamento previsto é visualmente diferente de um real (ex.: selo "previsto pelo sistema"), em todas as telas e na grade.
- Ao tocar nele, o app mostra a origem: "criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26".
- Se Rafael reclassificar a parcela atual, o app pergunta se deve aplicar a mudança às parcelas previstas.
- As Contas manuais seguem a mesma lógica: as parcelas futuras ficam visíveis como previstas.

#### FR-45: Casar previstos com a Fatura real
Ao importar a Fatura de um Mês, o app compara cada Lançamento extraído com os Lançamentos previstos daquele Mês pelo Nome normalizado e pela Parcela.
- **Casou:** o previsto vira o Lançamento real (Lançado por = Fatura), mantendo a classificação e o Apelido. Nunca ficam dois Lançamentos para a mesma parcela.
- **Casou, mas com valor diferente:** o app usa o Valor da Fatura, mantém a classificação e mostra a diferença na fila de revisão.
- **Previsto sem par na Fatura** (ex.: compra antecipada ou cancelada): continua marcado como previsto, não entra na Conferência e vai para a fila. Rafael decide se remove ou mantém.
- **Parcela real sem previsto:** segue o fluxo normal (FR-8 e FR-9).
- Os Lançamentos previstos nunca entram na Conferência (FR-6) nem na Mensagem de cobrança de um Mês cuja Fatura ainda não foi importada, a não ser que Rafael escolha incluí-los.

#### FR-8: Herdar parcelas em andamento
Um Lançamento com Parcela n/N (n > 1) que corresponde ao Lançamento n−1/N do Mês anterior (mesmo Nome normalizado e mesmo Valor) recebe o mesmo Apelido, Tipo, Responsável, Divisão e Observação.
- Normalmente a parcela já chega como Lançamento previsto (FR-44, FR-45). Esta regra cobre os casos sem previsto, como a primeira importação ou o histórico da planilha.

#### FR-9: Aplicar Regras
Um Lançamento à vista cujo Nome tem Regra recebe a classificação da Regra. A comparação tolera variações de Nome ("DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY").
- Se o Nome tem histórico com Responsáveis diferentes (ex.: farmácias), o app **sugere** o mais frequente, mas deixa o Lançamento na fila para confirmação.

#### FR-10: Aprender com a revisão
Quando Rafael classifica um Lançamento, o app cria ou atualiza a Regra daquele Nome. Rafael não precisa confirmar cada Regra.

#### FR-11: Sugerir para Nomes novos
Para um Nome sem histórico, o app pode sugerir o Tipo (e, quando houver pista, o Responsável), por exemplo "COBASI" → Gatos. A sugestão sempre passa pela fila.
- **Nota para a arquitetura:** avaliar se essa sugestão usa IA. É desejável, mas não obrigatória na v1. [NOTE FOR PM]

#### FR-12: Gerenciar Regras
Rafael pode ver todas as Regras, editar e apagar. Se ele editar uma Regra, o app pergunta se deve reaplicá-la aos Lançamentos do Mês atual.

### 4.4 Revisão
**Descrição:** uma fila com o que o app não classificou, ou classificou com dúvida, pensada para poucos toques. Inspirada no Listonic: lista simples, agrupada, com ação de um toque. Realiza UJ-1.

#### FR-13: Fila de revisão
O app lista os Lançamentos sem classificação e os sugeridos, agrupados (ex.: por Nome), com a sugestão visível.
- Confirmar uma sugestão leva um toque.
- O contador "faltam N" chega a zero quando a fila esvazia.

#### FR-14: Classificar em lote
Rafael pode selecionar vários Lançamentos e atribuir de uma vez Tipo, Responsável, Status e Observação.

#### FR-15: Dividir um Lançamento
Rafael pode dividir um Lançamento em duas ou mais linhas, por valor ou por proporção (ex.: 2/3 Mãe, 1/3 Rafael), cada uma com seu Responsável e seu Status.
- A soma das linhas é sempre igual ao Valor original. O app ajusta os centavos na última linha.
- As linhas mantêm o mesmo Nome e a mesma Parcela, e continuam ligadas ao Lançamento original para o casamento de previstos.

#### FR-52: Dar Apelido
Rafael pode dar, trocar ou remover o Apelido de um Lançamento. O app pergunta se deve aplicar o mesmo Apelido aos outros Lançamentos com o mesmo Nome, incluindo os previstos. Quando há Apelido, ele aparece no lugar do Nome em todas as telas e na mensagem, e o Nome continua visível no detalhe do Lançamento.

### 4.5 Contas manuais
**Descrição:** contas fora do cartão entram uma vez e se repetem sozinhas. Realiza UJ-3.

#### FR-16: Cadastrar Conta manual
Rafael pode cadastrar uma Conta manual com Nome, Valor, Tipo, Responsável ou Divisão, Observação, Mês inicial e duração: recorrente mensal (até encerrar) ou N parcelas.

#### FR-17: Gerar Lançamentos das Contas manuais
O app cria os Lançamentos das Contas manuais ativas em cada Mês, com Lançado por = Manual e Parcela n/N quando forem parceladas. Eles entram já classificados e não passam pela fila. Os Meses futuros mostram esses Lançamentos como previstos (FR-44).

#### FR-18: Encerrar ou alterar uma Conta manual
Rafael pode encerrar ou alterar uma Conta manual. A mudança vale do Mês atual em diante, e os Meses anteriores não mudam.

### 4.6 Painel do Mês
**Descrição:** tudo o que o Painel mostra é do Mês selecionado, por padrão o atual. Ele reúne os Blocos de Rafael e a grade de Lançamentos, e um Bloco também funciona como filtro da grade. Realiza UJ-1 e UJ-4.

#### FR-19: Montar Blocos
Rafael pode criar, renomear, reordenar e apagar Blocos, montando a Fórmula por seleção: escolhe Responsáveis, Tipos ou "Todos", operações (+ − × ÷), números e parênteses.
- Não existe campo de texto livre para a Fórmula.
- O app mostra a Fórmula legível, como (Rafael + Rangel) ÷ 2, e o resultado ao vivo.
- Uma Fórmula incompleta ou inválida (ex.: divisão por zero, parêntese aberto) não pode ser salva.
- Um operando pode combinar Responsável e Tipo (ex.: "Rafael em Bobiças").
- Nenhum Bloco vem pronto (FR-1). Os Blocos que Rafael pretende criar são Rafael, Casal, Mãe, Lucas e Total (todos os Lançamentos do Mês, do cartão e manuais).

#### FR-20: Filtrar a grade pelo Bloco
Tocar num Bloco filtra a grade para mostrar só os Lançamentos que entram na Fórmula dele. Tocar de novo no mesmo Bloco desfaz o filtro, e também existe um botão "Limpar filtros".
- Quando a Fórmula é uma soma simples, o total da grade filtrada é igual ao valor do Bloco. Quando tem outras operações (ex.: ÷ 2), o Bloco mostra o resultado e a grade mostra os Lançamentos que entram no cálculo.

#### FR-21: Grade de Lançamentos
O Painel mostra todos os Lançamentos do Mês numa grade com as colunas da planilha: Nome (ou Apelido), Valor, Parcela, Tipo, Responsável, Lançado por e Status. A Observação aparece ao abrir o Lançamento. A grade tem filtros por qualquer coluna, e Rafael pode editar qualquer linha ali mesmo.

#### FR-22: Navegar entre Meses
Rafael pode trocar o Mês exibido no Painel para consultar Meses anteriores e futuros (com os previstos). O Mês atual é sempre o padrão ao abrir o app.

### 4.7 Seleção e Mensagem de cobrança
**Descrição:** há duas formas de gerar a mensagem, sempre a partir do modelo que Rafael define. Na primeira, a partir de uma Seleção, ele filtra a grade, seleciona alguns ou todos os Lançamentos e confere o total. Na segunda, a partir de um Bloco, a mensagem usa o resultado da Fórmula, por exemplo Rangel + (Casal ÷ 2). Realiza UJ-1 e UJ-4.

#### FR-23: Configurar o modelo da mensagem
Rafael define o modelo da Mensagem de cobrança: saudação, frase do total, chave Pix, rodapé e o formato de cada linha de detalhe, escolhendo os campos (Nome ou Apelido, Parcela, Valor). O modelo atual dele é:
```
Oi
Esse mês deu R$ 1.350,14
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Nome da conta | Parcela | Valor
```

#### FR-48: Selecionar e ver o total
Na grade, Rafael pode marcar Lançamentos um a um ou "selecionar todos" os que estão no filtro. Uma barra sempre visível mostra quantos itens estão selecionados e a soma dos Valores da Seleção, atualizada a cada marcação.

#### FR-24: Gerar a Mensagem de cobrança
Com uma Seleção feita, Rafael toca em "Gerar mensagem". O app mostra a mensagem preenchida com o modelo (FR-23), o total e os detalhes da Seleção, e um botão "Copiar" coloca o texto na área de transferência.
- Os estornos selecionados aparecem como linhas negativas e reduzem o total.
- A mensagem é sempre só do Mês a que se refere: nunca inclui Meses passados nem futuros. O Saldo pendente de Meses anteriores é cobrado pela área de Recebimentos (FR-28).
- As Dívidas programadas ainda não vencidas não entram.
- Lançamentos de R$ 0,00 (ex.: ANUIDADE DIFERENCIADA 09/12) aparecem na grade, mas nunca entram na mensagem.

#### FR-53: Gerar a mensagem a partir de um Bloco
Cada Bloco tem um botão "Mensagem". O app gera a Mensagem de cobrança com o total igual ao resultado da Fórmula do Bloco, e os detalhes agrupados por operando, mostrando a operação aplicada a cada grupo. Exemplo para o Bloco "Rangel" = Rangel + (Casal ÷ 2):
```
Rangel: R$ 0,00
Casal: R$ 5.639,35 ÷ 2 = R$ 2.819,68
  BELLA PIETRA ROCHAS E | 03/04 | R$ 800,00
  …
Total: R$ 2.819,68
```
O formato exato dos detalhes agrupados será definido no UX.
- Valem as mesmas regras do FR-24 (só o Mês, sem R$ 0,00, sem Dívidas programadas não vencidas).

#### FR-54: Mostrar e garantir o cálculo do Bloco
Para qualquer Bloco, Rafael pode abrir o cálculo passo a passo: o subtotal de cada operando, cada operação e o resultado.
- A Fórmula segue a precedência matemática usual (parênteses, depois × e ÷, depois + e −).
- Os cálculos são feitos em centavos, e o arredondamento para centavos só acontece no resultado final, com meio para cima.
- O resultado do Bloco, o detalhamento passo a passo e a mensagem do FR-53 sempre mostram o mesmo número.
- Exemplos de referência (outubro/2026) servem de teste de aceite: Casal = R$ 5.639,35, Casal ÷ 2 = R$ 2.819,68 (arredondado de R$ 2.819,675), Total = R$ 9.280,23, Mãe = R$ 1.350,14, Lucas = R$ 215,16.

### 4.8 Recebimentos e Meses anteriores
**Descrição:** o que atravessa os Meses fica numa área separada do Painel: o que foi pago, o que ficou pendente, o que vence no futuro e o histórico da Fatura. Realiza UJ-2 e UJ-3.

#### FR-25: Aplicar Status "Pago"
Rafael pode fazer uma Seleção (FR-48), de qualquer Mês, e aplicar um Status que conta como pago, com a data do pagamento (padrão: hoje). O app registra um Pagamento com o total da Seleção.
- Exemplo: o Rangel paga, e Rafael filtra Casal e Rangel, seleciona tudo e aplica "Pago". As contas do Casal ficam pagas inteiras, porque a parte do Rafael ele mesmo já pagou.
- Se Rafael informar um valor recebido menor que o total, os Lançamentos são quitados em ordem (dos mais antigos para os mais novos). O último fica "Pago parcialmente", com o restante pendente.
- Um Pagamento pode ser desfeito.

#### FR-26: Saldo pendente por Responsável
Para cada Responsável, o app mostra o Saldo pendente total e a lista dos Lançamentos não pagos, com Mês e valor restante.

#### FR-27: Dívida programada
Rafael pode marcar Lançamentos como Dívida programada, com vencimento combinado.
- Eles aparecem em "A receber", com data e valor.
- No Mês do vencimento, passam a entrar na Mensagem de cobrança daquele Mês.
- Depois do vencimento, se não forem pagos, aparecem como atrasados.

Esse é o mecanismo para "não esquecer uma conta futura", e substitui o lançamento mensal que Rafael fazia para o Lucas.

#### FR-28: Cobrar pendências
Na área de Recebimentos, Rafael filtra os Lançamentos não pagos de um Responsável, seleciona e gera uma mensagem com o mesmo modelo (FR-23), listando o que está em aberto por Mês.

#### FR-49: Atraso
Um Lançamento não pago até o vencimento da Fatura mais a tolerância (configurável, padrão de 10 dias) fica "Atrasado". Ele aparece destacado na grade e em Recebimentos, e pode ser usado como filtro. Uma Dívida programada usa o próprio vencimento combinado.

#### FR-29: Histórico de Pagamentos
Rafael pode consultar todos os Pagamentos de um Responsável, com data, valor e os Lançamentos que cada um quitou.

#### FR-30: Meses anteriores da Fatura
Uma seção mostra, por Mês, o saldo anterior, os pagamentos da Fatura e o resíduo que passou de um Mês para outro (ex.: R$ 25,90 em outubro/2026), para Rafael conferir a continuidade entre as Faturas.

### 4.9 Previsão e finanças pessoais
**Descrição:** como app de finanças pessoais, o Conta Comigo também mostra para onde vai o dinheiro do Rafael e o que já está comprometido.

#### FR-31: Gasto do Rafael por Tipo
Para o Mês selecionado, o app mostra quanto Rafael gastou em cada Tipo. A "parte do Rafael" é definida por um Bloco que ele escolhe, por exemplo Rafael ou Rafael + (Casal ÷ 2).

#### FR-32: Previsão dos próximos Meses
A partir dos Lançamentos previstos (FR-44), o app mostra quanto já está comprometido nos próximos Meses, no total, por Responsável e por Tipo. Por exemplo: "MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses". Rafael pode abrir um Mês futuro no Painel e ver os Blocos calculados com os previstos.

#### FR-33: Evolução entre Meses
Rafael pode ver como os totais por Tipo e por Responsável evoluíram nos últimos 6 Meses. Um gráfico simples basta na v1.

### 4.10 Acesso, edição e aparelhos

#### FR-34: Entrar e sincronizar
Só Rafael acessa o app, com login próprio. Os dados ficam iguais no PC e no iPad.

#### FR-46: Editar e excluir qualquer coisa, com atualização imediata
Rafael pode editar e excluir qualquer Lançamento, Conta manual, Pagamento, Regra, Bloco, Responsável, Tipo e Status.
- Todos os totais, Blocos, a barra da Seleção, os Saldos pendentes, as Previsões e a Conferência são recalculados na hora, em todas as telas e aparelhos abertos, sem Rafael precisar recarregar a página.
- Ao excluir um Lançamento parcelado ou uma Conta manual, o app pergunta se deve excluir também os Lançamentos previstos dos Meses seguintes.
- Ao editar ou excluir algo que já tem Pagamento registrado, o app avisa e mostra o que muda no Saldo pendente.
- Excluir um Responsável, Tipo ou Status em uso pede para escolher um substituto, ou arquiva em vez de excluir.

#### FR-35: Instalar como app
O web app pode ser instalado na tela inicial do iPad, sem App Store.

### 4.11 Planejamento (fase 2)
**Descrição:** depois que o fechamento do cartão estiver funcionando bem, o app passa a mostrar quanto sobra do Salário e a controlar orçamentos. A Sobra é uma estimativa, porque Pix e combinados informais ficam de fora.

- **Salário**: a renda mensal que Rafael cadastra.
- **Despesa extra**: um gasto do Rafael fora do cartão, cadastrado à mão (Pix, débito, aluguel…), que só entra no cálculo da Sobra.
- **Sobra**: estimativa de quanto restou do Salário no Mês.
- **Orçamento**: limite mensal de gasto do Rafael num Tipo.

#### FR-37: Cadastrar Salário
Rafael cadastra o Salário mensal e pode ajustar o valor de um Mês específico (ex.: 13º, bônus).

#### FR-38: Cadastrar Despesas extras
Rafael cadastra Despesas extras fora do cartão, avulsas ou recorrentes, com Valor, Tipo e Mês.

#### FR-39: Sobra do Mês
O Painel principal do Mês mostra a Sobra numa barra de % do Salário:
Sobra = Salário − total da Fatura + Pagamentos recebidos no Mês − Despesas extras.
- A barra muda de cor quando a Sobra fica baixa ou negativa. Os limites são abaixo de 10% e abaixo de zero.
- O app mostra a composição do cálculo, para Rafael entender de onde vem o número.

#### FR-40: Orçamento por Tipo
Rafael define um limite mensal para um Tipo (ex.: Bobiças até R$ 300), considerando só a parte dele.
- O Painel mostra, para cada Orçamento, quanto já foi usado em % e destaca quando passar de 80% e de 100%.

### 4.12 Objetivos (fase 3)
**Descrição:** um Objetivo é uma compra planejada (ex.: placa de vídeo) que força Rafael a se organizar: o app transforma o valor total em parcelas mensais até a data escolhida. É um dos últimos recursos a construir.

#### FR-41: Criar Objetivo
Rafael cadastra um Objetivo com nome (ex.: "Placa de vídeo XPTO"), valor total e data final. O app calcula quantas parcelas cabem até lá, considerando os Ciclos (FR-36), e o valor de cada uma, e mostra a proposta antes de confirmar.

#### FR-42: Lançar as parcelas do Objetivo
Ao confirmar, o app cria um Lançamento por Mês com a parcela do Objetivo, com Responsável Rafael e Lançado por = Sistema. Esses Lançamentos entram na Sobra (FR-39) como despesa do Mês.

#### FR-43: Acompanhar o Objetivo
Rafael vê quanto já foi acumulado em cada Objetivo, em valor e em %, e quanto falta. O app mostra se o Objetivo está em dia com as parcelas. Ele também pode alterar a data final ou o valor, e o app recalcula as parcelas restantes.

## 5. Plataforma e telas

- **v1: PC (navegador) e iPad Pro 11" (M4)**, com a experiência completa (grade, fila, Blocos, Recebimentos). As telas são pensadas para tela grande, com a grade de todas as colunas visível.
- **Celular (iPhone 13 Pro Max): fora da v1.** São muitas informações para uma tela pequena. Uma versão para o celular, com foco em consultar Blocos, gerar mensagens e aplicar "Pago", fica para a fase 2.

## 6. Requisitos não funcionais

- **Precisão:** nenhum valor pode ser perdido ou duplicado na extração, na Divisão, no casamento de previstos, na reimportação ou nos Pagamentos. Valores são tratados em centavos, sem arredondamento acumulado.
- **Privacidade:** os dados financeiros ficam acessíveis só ao Rafael. Nem o PDF nem a senha são guardados.
- **Desempenho:** importar e classificar uma Fatura de cerca de 50 Lançamentos leva menos de 1 minuto.
- **Formatos (obrigatórios em todas as telas e mensagens):** datas DD/MM/AA (ex.: 06/11/26), horas HH:MM (24 h), valores R$ 0,00, com ponto de milhar e vírgula decimal (ex.: R$ 1.140,74). Valores negativos aparecem como - R$ 0,08. Interface em português.
- **Atualização em tempo real:** qualquer mudança aparece em todas as telas e aparelhos abertos sem recarregar a página (FR-46).

## 7. Não objetivos

- Não envia mensagens pelo WhatsApp nem confirma Pix automaticamente. Rafael copia, cola e aplica o Status.
- Não lê faturas de outros bancos nem outros layouts do Santander.
- Não conecta com o banco (Open Finance) nem acompanha contas correntes ou investimentos.
- Não tem acesso para as pessoas cobradas.

## 8. Escopo da primeira versão

**Dentro (v1):** §4.1 a §4.10 e §5.

**Fora (por fase):**
- **Fase 2 (planejamento):** §4.11, com Salário, Despesas extras, Sobra e Orçamento. Também a versão para o celular (iPhone).
- **Fase 3 (últimas etapas):** §4.12 Objetivos, e a Fatura do Rangel com o painel do casal.
- **Só se o app abrir para outras pessoas:** contas para outros usuários, outros bancos, pesquisa de mercado completa e custo e privacidade da IA.

## 9. Métricas de sucesso

- **SM-1:** fechamento do Mês (do envio do PDF à última mensagem gerada) em menos de 10 minutos. Hoje leva cerca de 1h50. Valida FR-3 a FR-24.
- **SM-2:** pelo menos 55% dos Lançamentos do Mês classificados sem revisão desde o primeiro Mês, crescendo depois. Valida FR-8 a FR-12, FR-44 e FR-45.
- **SM-3:** toda Fatura fica "Conferida", ou tem a diferença localizada por cartão, antes de as cobranças irem para as pessoas. Valida FR-6.
- **SM-4:** nenhum valor esquecido. Todo Lançamento de outro Responsável está pago, pendente ou programado. Valida FR-25 a FR-28 e FR-49.

**Contramétrica**
- **SM-C1:** não aumentar a classificação automática à custa de classificar errado. Uma sugestão incerta vai para a fila em vez de ser aplicada. Contrabalança SM-2.

## 10. Perguntas em aberto e suposições

**Perguntas em aberto**
1. A IA para sugerir Tipos de Nomes novos (FR-11) entra na v1 ou depois? Será decidido na arquitetura.

**Índice de suposições**

Todas as suposições foram confirmadas por Rafael em 01/11/26 e incorporadas ao texto.
