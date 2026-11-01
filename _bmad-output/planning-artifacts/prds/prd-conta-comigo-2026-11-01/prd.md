---
title: "PRD: Conta Comigo"
status: draft
created: 2026-11-01
updated: 2026-11-01
---

# PRD: Conta Comigo

## 0. Sobre este documento

Este PRD detalha a primeira versão do Conta Comigo para quem vai desenhar a experiência (UX), definir a arquitetura e quebrar o trabalho em histórias. Ele parte do product brief aprovado (`../../briefs/brief-conta-comigo-2026-11-01/brief.md`) e não repete o que está lá. Os termos do Glossário (§3) valem para o documento inteiro, os requisitos (FR) são numerados de forma global e as suposições aparecem marcadas como `[ASSUMPTION]` e reunidas no §10. Os detalhes técnicos e os exemplos reais ficam no `addendum.md`.

## 1. Visão

O Conta Comigo é um app de finanças pessoais construído em torno do cartão de crédito do Rafael, que ele divide com outras pessoas. Ele sobe o PDF da fatura do Santander e digita a senha. O app extrai os lançamentos, confere com os totais da fatura e classifica sozinho o que já conhece, aprendendo com os meses anteriores: parcelas em andamento, assinaturas e contas fixas. Sobra para o Rafael só o que é novo, numa fila rápida de revisão.

O Painel mostra o mês atual em Blocos que o próprio Rafael monta: quanto cada pessoa deve, quanto ele gastou e em quê. Tocar num Bloco filtra os lançamentos que formam aquele total, e um botão copia a mensagem de cobrança pronta para o WhatsApp. Fora do Painel, o app acompanha o que foi recebido, o que ficou pendente de meses anteriores e as dívidas combinadas para o futuro, para que nenhuma parcela se perca. A meta é trocar quase 1h50 de trabalho manual por menos de 10 minutos. Depois, numa segunda fase, o app passa a responder a pergunta que Rafael não consegue responder hoje: quanto sobra do salário. Ainda mais à frente, ele ajuda a planejar compras com Objetivos.

## 2. Usuário

### 2.1 Jobs To Be Done

- **Fechar o mês sem retrabalho:** saber quanto cada pessoa deve sem classificar de novo o que já foi classificado no mês anterior.
- **Confiar no número:** ter certeza de que os lançamentos conferem com a fatura antes de cobrar alguém.
- **Cobrar sem constrangimento:** mandar uma mensagem clara, com total, Pix e detalhes, que a pessoa entende sem perguntar.
- **Não perder dinheiro:** lembrar do que ficou pendente, do que foi pago pela metade e do que só vai ser pago no futuro.
- **Entender o próprio dinheiro:** ver quanto do cartão é dele, em quais Categorias, e o que já está comprometido nos próximos meses.

### 2.2 Quem não usa o app (v1)

Rangel, Mãe e Lucas não acessam o app. Eles só recebem a mensagem de cobrança pelo WhatsApp e pagam por Pix. O app não tem acesso de outras pessoas, não tem contas para outros usuários e não aceita faturas de outros bancos.

### 2.3 Jornadas

- **UJ-0. Rafael configura o app pela primeira vez.**
  O app começa vazio. Rafael cadastra os Responsáveis (Rafael, Rangel, Casal, Mãe, Lucas) e as Categorias. Depois importa o histórico de 2026 da planilha e monta os Blocos do jeito que quer, por exemplo "Rangel" = Rangel + (Casal ÷ 2). Por fim, configura o modelo da Mensagem de cobrança.

- **UJ-1. Rafael fecha a fatura de novembro no iPad.**
  No dia 5 a fatura fecha e o PDF chega por e-mail, protegido por senha. Rafael abre o app no iPad, sobe o PDF e digita a senha. O app mostra o resumo da importação: 47 Lançamentos, conferidos com os totais da fatura, 30 já classificados e 17 para revisar. Na fila, ele classifica as compras novas da Shopee e da Amazon, marcando várias de uma vez quando são da mesma pessoa. Ele também divide um remédio entre Mãe e ele, e atribui à Mãe o estorno de uma compra dela. No Painel do mês, toca no Bloco "Mãe": a grade passa a mostrar só os Lançamentos da Mãe, e ele confere. Toca de novo para limpar o filtro. Por fim, aperta "Copiar" no Bloco e cola a mensagem no WhatsApp dela. **Edge case:** se os Lançamentos não conferem com os totais da fatura, o app mostra a diferença antes de liberar a cobrança.

- **UJ-2. Rafael registra o que recebeu.**
  A Mãe manda o Pix com o total do mês. Na área de Recebimentos, Rafael seleciona as Cobranças de novembro da Mãe e marca como pagas em 08/11. O Lucas paga só R$ 100 de R$ 215. Rafael registra o pagamento parcial, e os R$ 115 que faltam ficam como Saldo pendente do Lucas.

- **UJ-3. Rafael lança uma viagem dividida que não está no cartão.**
  Ele cadastra uma Conta manual, "Bombinhas", de R$ 636 em 6 parcelas mensais, dividida em três partes iguais: Mãe (Mãe e Pai), Casal (Rafael e Rangel) e Lucas (Lucas e Miri). A Mãe paga mês a mês. O Lucas combinou de pagar tudo no final, então a parte dele vira uma Dívida programada com vencimento em abril. Até lá, ela fica em "A receber".

- **UJ-4. Em viagem, Rafael confere pelo iPhone quem pagou.**
  Sem o iPad, ele abre o app no iPhone, vê os Saldos pendentes e copia a mensagem do Rangel. A revisão linha a linha fica para quando ele tiver uma tela maior.

## 3. Glossário

- **Fatura**: o PDF mensal do cartão Santander, com vencimento, totais de despesas e de créditos, saldo anterior, pagamentos e total a pagar. Uma Fatura por mês.
- **Ciclo**: o período de compras de uma Fatura, do dia seguinte ao fechamento anterior até o dia de fechamento. O dia de fechamento é configurável e pode mudar.
- **Mês**: o mês de vencimento de uma Fatura, que corresponde a um Ciclo. O Painel sempre mostra um Mês, por padrão o atual.
- **Lançamento**: uma linha extraída da Fatura ou gerada por uma Conta manual. Tem descrição, data, valor (negativo se for crédito ou estorno), Parcela e, se veio da Fatura, o final do cartão.
- **Parcela**: posição "n/N" de um Lançamento parcelado ("05/10"). "1/1" significa à vista.
- **Responsável**: a quem um Lançamento, ou uma parte dele, é atribuído. Pode ser uma pessoa (Rafael, Rangel, Mãe, Lucas) ou um grupo (Casal). Rafael cadastra, renomeia e arquiva os Responsáveis.
- **Categoria**: o tipo do gasto (Casa, Saúde, Gatos, Bobiças…). Lista mantida por Rafael.
- **Divisão**: repartição de um Lançamento entre Responsáveis, por valor ou por proporção.
- **Regra**: associação aprendida entre um estabelecimento (descrição normalizada) e um Responsável, uma Categoria e uma Divisão. Pode ser vista, editada e apagada.
- **Conta manual**: uma conta que não passa pelo cartão (ex.: Silvia, Bombinhas). Pode ser recorrente mensal ou parcelada, e gera Lançamentos nos Meses correspondentes.
- **Cobrança**: o valor que um Responsável deve por um Lançamento (ou pela parte dele), num Mês. Pode ser negativo, quando é um estorno. Tem um estado: pendente, paga parcialmente ou paga.
- **Pagamento**: o registro de que um Responsável pagou, numa data, um valor que quita uma ou mais Cobranças, total ou parcialmente.
- **Saldo pendente**: a soma das Cobranças não quitadas de um Responsável, de todos os Meses.
- **Dívida programada**: uma Cobrança com vencimento futuro combinado (ex.: Lucas paga Bombinhas no fim).
- **Bloco**: um totalizador nomeado do Painel, calculado por uma Fórmula sobre os Lançamentos do Mês.
- **Fórmula**: a expressão de um Bloco, montada por seleção (sem digitação livre), com Responsáveis e Categorias como operandos, as operações somar, subtrair, multiplicar e dividir, números e parênteses. Exemplo: Rangel + (Casal ÷ 2).
- **Painel**: a tela do Mês com os Blocos e a grade de Lançamentos.
- **Mensagem de cobrança**: o texto gerado a partir de um Bloco, pronto para colar no WhatsApp.
- **Conferência**: a checagem dos Lançamentos extraídos de uma Fatura contra os totais de despesas e de créditos dessa Fatura.
- **Lançamento previsto**: um Lançamento que o próprio app criou num Mês futuro porque sabe que ele virá: as parcelas restantes de uma compra parcelada da Fatura ou de uma Conta manual. Fica sempre identificado como "previsto pelo sistema" até ser confirmado pela Fatura daquele Mês.
- **Previsão**: o conjunto dos Lançamentos previstos dos próximos Meses.
- **Salário**: a renda mensal que Rafael cadastra (fase 2).
- **Despesa extra**: um gasto do Rafael fora do cartão, cadastrado à mão (Pix, débito, aluguel…), que só entra no cálculo da Sobra (fase 2).
- **Sobra**: estimativa de quanto restou do Salário no Mês. Não precisa ser exata (fase 2).
- **Orçamento**: limite mensal de gasto do Rafael numa Categoria (fase 2).
- **Objetivo**: uma compra planejada (ex.: placa de vídeo), com valor total e data final, que vira parcelas mensais forçadas (fase 3).

## 4. Funcionalidades

### 4.1 Configuração inicial
**Descrição:** o app começa vazio. Nada vem pré-configurado: Rafael monta tudo do jeito dele ao começar a usar. Realiza UJ-0.

#### FR-1: Começar do zero
No primeiro uso, o app não tem Responsáveis, Categorias, Blocos nem modelo de mensagem prontos. Um passo a passo guia Rafael pela criação de cada um, e ele pode pular qualquer etapa e voltar depois.

#### FR-2: Importar histórico
Rafael pode importar as abas 01/2026 a 10/2026 da planilha "Cartão" (colunas Despesa, Valor, Parcela, Observação, Tipo, Responsabilidade). A importação cria os Responsáveis, as Categorias, as Regras iniciais e as parcelas em andamento.
- Lançamentos divididos em várias linhas na planilha (ex.: Monjaro) viram uma Divisão.
- Depois da importação, o app mostra as Regras criadas para Rafael revisar.

### 4.2 Importação da Fatura
**Descrição:** Rafael sobe o PDF e digita a senha. O app extrai os Lançamentos, deixa de fora o pagamento da fatura anterior (que não é despesa), faz a Conferência e descarta o PDF. Realiza UJ-1.

#### FR-3: Importar PDF protegido
Rafael pode enviar o PDF da Fatura e informar a senha no próprio app.
- O app abre PDFs protegidos com a senha informada. Se a senha estiver errada, ele avisa e pede de novo.
- A senha não é guardada depois da importação. [ASSUMPTION: Rafael prefere digitar todo mês a deixar a senha salva]
- Uma Fatura do mesmo vencimento já importada não é duplicada. O app oferece substituir ou cancelar.

#### FR-4: Não guardar o PDF
O app usa o PDF só durante a importação. Depois da extração ele descarta o arquivo e guarda apenas os Lançamentos e os totais da Fatura (vencimento, fechamento, totais de despesas e de créditos, saldo anterior, pagamentos e total a pagar).

#### FR-5: Extrair Lançamentos
O app extrai todos os Lançamentos da Fatura (despesas, parcelamentos, créditos e estornos) de todos os cartões, titular e adicionais, com data, descrição, Parcela, valor e final do cartão.
- O pagamento da fatura anterior não vira Lançamento.
- Os créditos e estornos entram com valor negativo e são classificados como qualquer Lançamento: podem ser do Rafael, da Mãe ou de qualquer Responsável.
- Na Fatura de exemplo (outubro/2026), o app extrai exatamente os 49 Lançamentos esperados (ver addendum do brief).

#### FR-6: Conferir com a Fatura do Mês
O app confere os Lançamentos extraídos com os totais da própria Fatura: soma das despesas = "Total despesas", e soma dos créditos = "Total de créditos" (em outubro/2026, R$ 8.327,39 e R$ 639,62).
- Quando tudo confere, mostra "Conferido".
- Quando algo não confere, mostra a diferença e bloqueia a geração das Mensagens de cobrança até Rafael corrigir. [ASSUMPTION: bloquear, e não apenas avisar]
- Saldo anterior e pagamentos não entram na Conferência do Mês. Eles aparecem só na área de Meses anteriores (FR-27).

#### FR-36: Ciclo da Fatura
Rafael configura o dia de fechamento e o dia de vencimento do cartão, e pode alterá-los quando mudar o fechamento no banco.
- A mudança vale a partir do próximo Ciclo, e os Ciclos já fechados não mudam.
- Cada Mês tem um estado: aberto (ainda recebe Lançamentos manuais) ou fechado (Fatura importada e conferida).
- Lançamentos criados no app (Contas manuais e, na fase 3, parcelas de Objetivos) entram no Mês cujo Ciclo contém a data deles: uma data depois do fechamento vai para o Mês seguinte.
- A data de fechamento extraída da Fatura importada prevalece sobre a configuração se as duas forem diferentes, e o app avisa. [ASSUMPTION]

#### FR-7: Corrigir a extração
Rafael pode editar, incluir e excluir Lançamentos de uma Fatura importada. A Conferência é recalculada na hora.

### 4.3 Classificação e aprendizado
**Descrição:** antes de mostrar a fila, o app atribui Responsável, Categoria e Divisão a tudo o que reconhece, aprendendo com os Meses anteriores. Realiza UJ-1.

#### FR-8: Herdar parcelas em andamento
Um Lançamento com Parcela n/N (n > 1) que corresponde ao Lançamento n−1/N do Mês anterior (mesma descrição normalizada e mesmo valor) recebe o mesmo Responsável, a mesma Categoria, a mesma Divisão e a mesma observação.
- Normalmente a parcela já chega como Lançamento previsto (FR-44, FR-45). Esta regra cobre os casos sem previsto, como a primeira importação ou o histórico da planilha.

#### FR-44: Lançar as parcelas futuras
Ao importar uma Fatura, para cada Lançamento parcelado n/N com n < N, o app cria os Lançamentos previstos n+1/N até N/N nos Meses seguintes, com o mesmo valor, Responsável, Categoria, Divisão e observação.
- Um Lançamento previsto é visualmente diferente de um Lançamento real (ex.: selo "previsto pelo sistema"), em todas as telas e na grade.
- Ao tocar nele, o app mostra a origem: "criado a partir da parcela 05/10 de MAGALU na Fatura de 10/2026".
- Se Rafael reclassificar a parcela atual, o app pergunta se deve aplicar a mudança às parcelas previstas.
- As Contas manuais seguem a mesma lógica: as parcelas futuras ficam visíveis como previstas.

#### FR-45: Casar previstos com a Fatura real
Ao importar a Fatura de um Mês, o app compara cada Lançamento extraído com os Lançamentos previstos daquele Mês (mesma descrição normalizada e mesma Parcela).
- **Casou:** o previsto vira o Lançamento real, com a classificação mantida. Nunca ficam dois Lançamentos para a mesma parcela.
- **Casou, mas com valor diferente:** o app usa o valor da Fatura, mantém a classificação e mostra a diferença na fila de revisão.
- **Previsto sem par na Fatura** (ex.: compra antecipada ou cancelada): continua marcado como previsto, não entra na Conferência e vai para a fila. Rafael decide se remove ou mantém.
- **Parcela real sem previsto:** segue o fluxo normal (FR-8 e FR-9).
- Os Lançamentos previstos nunca entram na Conferência (FR-6) nem na Mensagem de cobrança de um Mês cuja Fatura ainda não foi importada, a não ser que Rafael escolha incluí-los. [ASSUMPTION]

#### FR-9: Aplicar Regras
Um Lançamento à vista cujo estabelecimento tem Regra recebe a classificação da Regra. A comparação tolera variações de nome ("DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY").
- Se o estabelecimento tem histórico com Responsáveis diferentes (ex.: farmácias), o app **sugere** o mais frequente, mas deixa o Lançamento na fila para confirmação.

#### FR-10: Aprender com a revisão
Quando Rafael classifica um Lançamento, o app cria ou atualiza a Regra daquele estabelecimento. [ASSUMPTION: aprende sozinho; Rafael não precisa confirmar cada Regra]

#### FR-11: Sugerir para estabelecimentos novos
Para um estabelecimento sem histórico, o app pode sugerir a Categoria (e, quando houver pista, o Responsável) a partir da descrição, por exemplo "COBASI" → Gatos. A sugestão sempre passa pela fila.
- **Nota para a arquitetura:** avaliar se essa sugestão usa IA. É desejável, mas não obrigatória na v1. [NOTE FOR PM]

#### FR-12: Gerenciar Regras
Rafael pode ver todas as Regras, editar e apagar. Se ele editar uma Regra, o app pergunta se deve reaplicá-la aos Lançamentos do Mês atual.

### 4.4 Revisão
**Descrição:** uma fila com o que o app não classificou, ou classificou com dúvida, pensada para poucos toques. Inspirada no Listonic: lista simples, agrupada, com ação de um toque. Realiza UJ-1.

#### FR-13: Fila de revisão
O app lista os Lançamentos sem classificação e os sugeridos, agrupados (ex.: por estabelecimento), com a sugestão visível.
- Confirmar uma sugestão leva um toque.
- O contador "faltam N" chega a zero quando a fila esvazia.

#### FR-14: Classificar em lote
Rafael pode selecionar vários Lançamentos e atribuir de uma vez Responsável, Categoria e observação.

#### FR-15: Dividir um Lançamento
Rafael pode dividir um Lançamento entre dois ou mais Responsáveis, por valor ou por proporção (ex.: 2/3 Mãe, 1/3 Rafael).
- A soma das partes é sempre igual ao valor do Lançamento. O app ajusta os centavos da divisão na última parte.

### 4.5 Contas manuais
**Descrição:** contas fora do cartão entram uma vez e se repetem sozinhas. Realiza UJ-3.

#### FR-16: Cadastrar Conta manual
Rafael pode cadastrar uma Conta manual com nome, valor, Categoria, Responsável ou Divisão, Mês inicial e duração: recorrente mensal (até encerrar) ou N parcelas.

#### FR-17: Gerar Lançamentos das Contas manuais
Ao abrir um Mês, o app cria os Lançamentos das Contas manuais ativas, com Parcela n/N quando forem parceladas. Eles entram já classificados e não passam pela fila.

#### FR-18: Encerrar ou alterar uma Conta manual
Rafael pode encerrar ou alterar uma Conta manual. A mudança vale do Mês atual em diante, e os Meses anteriores não mudam.

### 4.6 Painel do Mês
**Descrição:** tudo o que o Painel mostra é do Mês selecionado, por padrão o atual. Ele reúne os Blocos de Rafael e a grade de Lançamentos, e um Bloco também funciona como filtro da grade. Realiza UJ-1 e UJ-4.

#### FR-19: Montar Blocos
Rafael pode criar, renomear, reordenar e apagar Blocos, montando a Fórmula por seleção: escolhe Responsáveis e Categorias, operações (+ − × ÷), números e parênteses.
- Não existe campo de texto livre para a Fórmula.
- O app mostra a Fórmula legível, como (Rafael + Rangel) ÷ 2, e o resultado ao vivo.
- Uma Fórmula incompleta ou inválida (ex.: divisão por zero, parêntese aberto) não pode ser salva.
- Um operando pode combinar Responsável e Categoria (ex.: "Rafael em Bobiças").
- Nenhum Bloco vem pronto (FR-1).

#### FR-20: Filtrar a grade pelo Bloco
Tocar num Bloco filtra a grade do Painel para mostrar só os Lançamentos que compõem aquele total. Tocar de novo no mesmo Bloco desfaz o filtro, e também existe um botão "Limpar filtros".
- Com o filtro ativo, o total da grade é igual ao valor do Bloco. Quando a Fórmula divide, como Casal ÷ 2, a grade mostra a fração que entra no Bloco.

#### FR-21: Grade de Lançamentos
O Painel mostra todos os Lançamentos do Mês numa grade, com filtros por Responsável, Categoria, cartão e estado da classificação. Rafael pode editar qualquer linha ali mesmo.

#### FR-22: Navegar entre Meses
Rafael pode trocar o Mês exibido no Painel para consultar Meses anteriores. O Mês atual é sempre o padrão ao abrir o app.

### 4.7 Mensagem de cobrança
**Descrição:** cada Bloco gera a mensagem do WhatsApp com um toque, a partir de um modelo que Rafael define. Realiza UJ-1 e UJ-4.

#### FR-23: Configurar o modelo da mensagem
Rafael define o modelo da Mensagem de cobrança: saudação, frase do total, chave Pix, rodapé e o formato de cada linha de detalhe, escolhendo os campos (nome, Parcela, valor). O modelo atual dele é:
```
Oi
Esse mês deu R$ 1.350,14
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Nome da conta | Parcela | Valor
```

#### FR-24: Copiar a Mensagem de cobrança
O botão "Copiar" de um Bloco coloca na área de transferência a mensagem preenchida com o total e os detalhes do Bloco no Mês.
- Os estornos atribuídos ao Responsável aparecem como linhas negativas e reduzem o total.
- As Dívidas programadas ainda não vencidas não entram.
- A mensagem traz só o Mês atual. O Saldo pendente de Meses anteriores não entra no total, e Rafael cobra esse saldo pela área de Recebimentos (FR-28).

### 4.8 Recebimentos e Meses anteriores
**Descrição:** uma área separada do Painel para o que atravessa os Meses: o que foi pago, o que ficou pendente, o que vence no futuro e o histórico da Fatura. Realiza UJ-2 e UJ-3.

#### FR-25: Registrar Pagamento
Rafael pode selecionar uma ou várias Cobranças de um Responsável, de qualquer Mês, e registrar um Pagamento com data e valor.
- Se o valor for igual à soma das Cobranças, todas viram "paga".
- Se o valor for menor, o Pagamento quita as Cobranças em ordem (das mais antigas para as mais novas), e a última fica "paga parcialmente" com o restante pendente. [ASSUMPTION: a ordem é das mais antigas para as mais novas]
- Um Pagamento pode ser desfeito.

#### FR-26: Saldo pendente por Responsável
Para cada Responsável, o app mostra o Saldo pendente total e a lista das Cobranças não quitadas, com Mês e valor restante.

#### FR-27: Dívida programada
Rafael pode marcar Cobranças como Dívida programada, com vencimento combinado.
- Elas aparecem em "A receber", com data e valor.
- No Mês do vencimento, passam a entrar na Mensagem de cobrança daquele Mês.
- Depois do vencimento, se não forem pagas, aparecem destacadas como atrasadas.

[ASSUMPTION: esse é o mecanismo para "não esquecer uma conta futura", e substitui o lançamento mensal que Rafael fazia para o Lucas]

#### FR-28: Cobrar pendências
Na área de Recebimentos, Rafael pode copiar uma mensagem com o Saldo pendente de um Responsável, usando o mesmo modelo (FR-23) e listando as Cobranças em aberto por Mês.

#### FR-29: Histórico de Pagamentos
Rafael pode consultar todos os Pagamentos de um Responsável, com data, valor e as Cobranças que cada um quitou.

#### FR-30: Meses anteriores da Fatura
Uma seção mostra, por Mês, o saldo anterior, os pagamentos da Fatura e o resíduo que passou de um Mês para outro (ex.: R$ 25,90 em outubro/2026), para Rafael conferir a continuidade entre as Faturas.

### 4.9 Previsão e finanças pessoais
**Descrição:** como app de finanças pessoais, o Conta Comigo também mostra para onde vai o dinheiro do Rafael e o que já está comprometido.

#### FR-31: Gasto do Rafael por Categoria
Para o Mês selecionado, o app mostra quanto Rafael gastou em cada Categoria, contando só a parte dele, incluindo a metade do Casal se a Fórmula dele disser isso. [ASSUMPTION: a "parte do Rafael" é definida por um Bloco que ele escolhe]

#### FR-32: Previsão dos próximos Meses
A partir dos Lançamentos previstos (FR-44), o app mostra quanto já está comprometido nos próximos Meses, no total, por Responsável e por Categoria. Por exemplo: "MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses". Rafael pode abrir um Mês futuro no Painel e ver os Blocos calculados com os previstos.

#### FR-33: Evolução entre Meses
Rafael pode ver como os totais por Categoria e por Responsável evoluíram nos últimos Meses. [ASSUMPTION: um gráfico simples basta na v1]

### 4.10 Acesso e aparelhos

#### FR-34: Entrar e sincronizar
Só Rafael acessa o app, com login próprio. Os dados ficam iguais no PC, no iPad e no iPhone, e uma alteração feita num aparelho aparece nos outros.

#### FR-35: Instalar como app
O web app pode ser instalado na tela inicial do iPhone e do iPad, sem App Store.

### 4.11 Planejamento (fase 2)
**Descrição:** depois que o fechamento do cartão estiver funcionando bem, o app passa a mostrar quanto sobra do Salário e a controlar orçamentos. A Sobra é uma estimativa, porque Pix e combinados informais ficam de fora.

#### FR-37: Cadastrar Salário
Rafael cadastra o Salário mensal e pode ajustar o valor de um Mês específico (ex.: 13º, bônus).

#### FR-38: Cadastrar Despesas extras
Rafael cadastra Despesas extras fora do cartão, avulsas ou recorrentes, com valor, Categoria e Mês.

#### FR-39: Sobra do Mês
O Painel principal do Mês mostra a Sobra numa barra de % do Salário:
Sobra = Salário − total da Fatura + Pagamentos recebidos no Mês − Despesas extras.
- A barra muda de cor quando a Sobra fica baixa ou negativa. [ASSUMPTION: abaixo de 10% e abaixo de zero]
- O app mostra a composição do cálculo, para Rafael entender de onde vem o número.

#### FR-40: Orçamento por Categoria
Rafael define um limite mensal para uma Categoria (ex.: Bobiças até R$ 300), considerando só a parte dele.
- O Painel mostra, para cada Orçamento, quanto já foi usado em % e destaca quando passar de 80% e de 100%. [ASSUMPTION: esses limites de alerta]

### 4.12 Objetivos (fase 3)
**Descrição:** um Objetivo força Rafael a se organizar para uma compra: o app transforma o valor total em parcelas mensais até a data escolhida. É um dos últimos recursos a construir.

#### FR-41: Criar Objetivo
Rafael cadastra um Objetivo com nome (ex.: "Placa de vídeo XPTO"), valor total e data final. O app calcula quantas parcelas cabem até lá, considerando os Ciclos (FR-36), e o valor de cada uma, e mostra a proposta antes de confirmar.

#### FR-42: Lançar as parcelas do Objetivo
Ao confirmar, o app cria um Lançamento por Mês com a parcela do Objetivo, atribuído ao Rafael. Esses Lançamentos entram na Sobra (FR-39) como despesa do Mês.

#### FR-43: Acompanhar o Objetivo
Rafael vê quanto já foi acumulado em cada Objetivo, em valor e em %, e quanto falta. O app mostra se o Objetivo está em dia com as parcelas. Ele também pode alterar a data final ou o valor, e o app recalcula as parcelas restantes.

## 5. Plataforma e telas

- **Prioridade:** PC e iPad primeiro, com a experiência completa (grade, fila, Blocos, Recebimentos).
- **Celular (v1):** tudo funciona, mas o foco é consultar Blocos, copiar mensagens, registrar Pagamentos e ver Saldos pendentes. No celular, a grade aparece em formato de lista. [ASSUMPTION: essa é a versão mínima aceitável no celular; uma experiência otimizada para ele fica para depois]

## 6. Requisitos não funcionais

- **Precisão:** nenhum valor pode ser perdido ou duplicado na extração, na Divisão ou nos Pagamentos. Valores são tratados em centavos, sem arredondamento acumulado.
- **Privacidade:** os dados financeiros ficam acessíveis só ao Rafael. Nem o PDF nem a senha são guardados.
- **Desempenho:** importar e classificar uma Fatura de cerca de 50 Lançamentos leva menos de 1 minuto. [ASSUMPTION]
- **Formato brasileiro:** moeda em R$ com vírgula decimal, datas dd/mm/aaaa e interface em português.

## 7. Não objetivos

- Não envia mensagens pelo WhatsApp nem confirma Pix automaticamente. Rafael copia, cola e registra o Pagamento.
- Não lê faturas de outros bancos nem outros layouts do Santander.
- Não conecta com o banco (Open Finance) nem acompanha contas correntes ou investimentos.
- Não tem acesso para as pessoas cobradas.

## 8. Escopo da primeira versão

**Dentro (v1):** §4.1 a §4.10 (incluindo FR-36) e §5.

**Fora (por fase):**
- **Fase 2 (planejamento):** §4.11, com Salário, Despesas extras, Sobra e Orçamento. Também a experiência otimizada para o celular.
- **Fase 3 (últimas etapas):** §4.12 Objetivos, e a Fatura do Rangel com o painel do casal. [ASSUMPTION: as duas ficam na mesma fase final]
- **Só se o app abrir para outras pessoas:** contas para outros usuários, outros bancos, pesquisa de mercado completa e custo e privacidade da IA.

## 9. Métricas de sucesso

- **SM-1:** fechamento do Mês (do envio do PDF à última mensagem copiada) em menos de 10 minutos. Hoje leva cerca de 1h50. Valida FR-3 a FR-24.
- **SM-2:** pelo menos 55% dos Lançamentos do Mês classificados sem revisão desde o primeiro Mês, crescendo depois. Valida FR-8 a FR-12.
- **SM-3:** 100% das Faturas com status "Conferido" antes de cobrar. Valida FR-6.
- **SM-4:** nenhuma Cobrança esquecida. Todo valor devido está pago, pendente ou programado. Valida FR-25 a FR-28.

**Contramétrica**
- **SM-C1:** não aumentar a classificação automática à custa de classificar errado. Uma sugestão incerta vai para a fila em vez de ser aplicada. Contrabalança SM-2.

## 10. Perguntas em aberto e suposições

**Perguntas em aberto**
1. A IA para sugerir Categorias de estabelecimentos novos (FR-11) entra na v1 ou depois? Será decidido na arquitetura.

**Índice de suposições**
- §4.2 FR-3: a senha do PDF não é guardada.
- §4.2 FR-6: uma Conferência divergente bloqueia a cobrança até ser resolvida.
- §4.3 FR-10: as Regras são aprendidas sem confirmação.
- §4.8 FR-25: um pagamento parcial quita as Cobranças das mais antigas para as mais novas.
- §4.8 FR-27: a Dívida programada é o mecanismo para lembrar de contas futuras.
- §4.9 FR-31: a "parte do Rafael" é definida por um Bloco que ele escolhe.
- §4.9 FR-33: um gráfico simples de evolução basta na v1.
- §5: no celular, a grade aparece como lista, com foco em consultar, copiar e registrar Pagamentos.
- §6: a importação leva menos de 1 minuto.
- §4.3 FR-45: previstos de um Mês sem Fatura importada não entram na cobrança, a menos que Rafael escolha.
- §4.2 FR-36: a data de fechamento lida na Fatura prevalece sobre a configurada.
- §4.11 FR-39: a barra da Sobra muda de cor abaixo de 10% e abaixo de zero.
- §4.11 FR-40: alertas de Orçamento em 80% e 100%.
- §8: Objetivos e painel do casal ficam juntos na fase 3.
