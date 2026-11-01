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

O Conta Comigo fecha o mês do cartão de crédito do Rafael. Ele sobe o PDF da fatura do Santander, digita a senha, e o app extrai os lançamentos, confere a soma com o total da fatura e classifica sozinho o que já conhece: parcelas em andamento, assinaturas e contas fixas. Sobra para o Rafael só o que é novo, numa fila rápida de revisão. No painel, blocos de totais montados por ele mostram quanto cada pessoa deve e quanto ele gastou por categoria. Cada bloco tem um botão que copia a mensagem de cobrança pronta para o WhatsApp.

O app também acompanha o que foi recebido. Ele mostra o que cada pessoa já pagou, o que ficou pendente de meses anteriores e as dívidas combinadas para o futuro, para que nenhuma parcela se perca. A meta é trocar quase 1h50 de trabalho manual por menos de 10 minutos.

## 2. Usuário

### 2.1 Jobs To Be Done

- **Fechar o mês sem retrabalho:** saber quanto cada pessoa deve sem classificar de novo o que já foi classificado no mês anterior.
- **Confiar no número:** ter certeza de que a soma confere com a fatura antes de cobrar alguém.
- **Cobrar sem constrangimento:** mandar uma mensagem clara, com total, Pix e detalhes, que a pessoa entende sem perguntar.
- **Não perder dinheiro:** lembrar do que ficou pendente, do que foi pago pela metade e do que só vai ser pago no futuro.
- **Entender o próprio gasto:** ver quanto do cartão é dele e em quê (gatos, besteiras, saúde…).

### 2.2 Quem não usa o app (v1)

Rangel, Mãe e Lucas não acessam o app. Eles só recebem a mensagem de cobrança pelo WhatsApp e pagam por Pix. O app não tem acesso de outras pessoas, não tem contas para outros usuários e não aceita faturas de outros bancos.

### 2.3 Jornadas

- **UJ-1. Rafael fecha a fatura de novembro no iPad.**
  No dia 5 a fatura fecha e o PDF chega por e-mail, protegido por senha. Rafael abre o app no iPad e sobe o PDF. Ele digita a senha, e o app mostra o resumo da importação: 47 lançamentos, a conciliação com o total da fatura confere, 30 já classificados e 17 para revisar. Na fila, ele atribui responsável e categoria às compras novas da Shopee e da Amazon, marcando várias de uma vez quando são da mesma pessoa, e divide um remédio entre Mãe e ele. O painel mostra os blocos Mãe, Lucas, Rangel e Gatos. Ele toca em "Copiar" no bloco Mãe e cola a mensagem no WhatsApp dela. **Edge case:** se a conciliação não confere, o app mostra a diferença e de onde ela pode vir (ex.: saldo anterior) antes de liberar a cobrança.

- **UJ-2. Rafael registra o que recebeu.**
  A Mãe manda o Pix com o total do mês. Rafael abre o bloco dela, seleciona todas as cobranças de novembro e marca como pagas em 08/11. O Lucas paga só R$ 100 de um total de R$ 215. Rafael seleciona as cobranças do Lucas, registra o pagamento parcial de R$ 100, e o restante fica como saldo pendente. Esse saldo aparece na próxima mensagem dele.

- **UJ-3. Rafael lança uma viagem dividida que não está no cartão.**
  Ele cadastra uma conta manual, "Bombinhas", de R$ 636, em 6 parcelas mensais, dividida em três partes iguais: Mãe (Mãe e Pai), Casal (Rafael e Rangel) e Lucas (Lucas e Miri). A Mãe vai pagar mês a mês. O Lucas combinou de pagar tudo no final, então a parte dele vira uma dívida programada com vencimento em abril. Até lá, ela aparece no painel "A receber", e não na mensagem de cada mês.

- **UJ-4. Em viagem, Rafael confere pelo iPhone quem pagou.**
  Sem o iPad, ele abre o app no iPhone, vê os saldos pendentes por pessoa e copia a mensagem do Rangel. A revisão linha a linha fica para quando ele tiver uma tela maior.

## 3. Glossário

- **Fatura**: o PDF mensal do cartão Santander, com vencimento, saldo anterior, pagamentos, créditos e total a pagar. Uma fatura por mês.
- **Lançamento**: uma linha extraída da Fatura ou gerada por uma Conta manual. Tem descrição, data, valor (negativo se for crédito ou estorno), Parcela e, se veio da Fatura, o final do cartão.
- **Parcela**: posição "n/N" de um Lançamento parcelado ("05/10"). "1/1" significa à vista.
- **Responsável**: a quem um Lançamento, ou uma parte dele, é atribuído. Pode ser uma pessoa (Rafael, Rangel, Mãe, Lucas) ou um grupo (Casal). Rafael cadastra, renomeia e arquiva os Responsáveis.
- **Categoria**: o tipo do gasto (Casa, Saúde, Gatos, Bobiças…). Lista mantida por Rafael.
- **Divisão**: repartição de um Lançamento entre Responsáveis, por valor ou por proporção.
- **Regra**: associação aprendida entre um estabelecimento (descrição normalizada) e um Responsável, uma Categoria e uma Divisão. Pode ser vista, editada e apagada.
- **Conta manual**: uma conta que não passa pelo cartão (ex.: Silvia, Bombinhas). Pode ser recorrente mensal ou parcelada, e gera Lançamentos nos meses correspondentes.
- **Cobrança**: o valor que um Responsável deve por um Lançamento (ou pela parte dele), num mês. Tem um estado: pendente, paga parcialmente ou paga.
- **Pagamento**: o registro de que um Responsável pagou, numa data, um valor que quita uma ou mais Cobranças, total ou parcialmente.
- **Saldo pendente**: a soma das Cobranças não quitadas de um Responsável, de todos os meses.
- **Dívida programada**: uma Cobrança com vencimento futuro combinado (ex.: Lucas paga Bombinhas no fim). Não entra na mensagem do mês até vencer, mas aparece em "A receber".
- **Bloco**: um totalizador nomeado do Painel, calculado por uma Fórmula.
- **Fórmula**: a expressão de um Bloco, montada por seleção (sem digitação livre), com Responsáveis e Categorias como operandos, as operações somar, subtrair, multiplicar e dividir, números e parênteses. Exemplo: "Rangel" = Rangel + (Casal ÷ 2).
- **Painel**: a tela do mês com os Blocos.
- **Mensagem de cobrança**: o texto gerado a partir de um Bloco, pronto para colar no WhatsApp.
- **Conciliação**: a conferência entre os Lançamentos extraídos e o resumo da Fatura.

## 4. Funcionalidades

### 4.1 Importação da Fatura
**Descrição:** Rafael sobe o PDF e digita a senha. O app extrai os Lançamentos, separa o pagamento da fatura anterior (que não é despesa), faz a Conciliação e mostra um resumo. Realiza UJ-1.

#### FR-1: Importar PDF protegido
Rafael pode enviar o PDF da Fatura e informar a senha no próprio app.
- O app abre PDFs protegidos com a senha informada. Se a senha estiver errada, ele avisa e pede de novo.
- A senha não é guardada depois da importação. [ASSUMPTION: Rafael prefere digitar todo mês a deixar a senha salva]
- Uma Fatura do mesmo vencimento já importada não é duplicada. O app oferece substituir ou cancelar.

#### FR-2: Extrair Lançamentos
O app extrai todos os Lançamentos da Fatura: despesas, parcelamentos, créditos e estornos, de todos os cartões (titular e adicionais), com data, descrição, Parcela, valor e final do cartão.
- O pagamento da fatura anterior não vira Lançamento.
- Os créditos e estornos entram com valor negativo. [ASSUMPTION: créditos e cashback ficam com o Rafael, sem Responsável, como na planilha de hoje]
- Na Fatura de exemplo (outubro/2026), o app extrai exatamente os 49 Lançamentos esperados (ver addendum do brief).

#### FR-3: Conciliar com o resumo
O app confere: saldo anterior − pagamentos + despesas − créditos = total a pagar.
- Quando a conta confere, mostra "Conciliado".
- Quando não confere, mostra a diferença e bloqueia a geração das Mensagens de cobrança até Rafael corrigir ou aceitar a diferença. [ASSUMPTION: bloquear, e não apenas avisar]
- O resíduo do saldo anterior (ex.: R$ 25,90 em outubro) aparece explicado, e não como erro.

#### FR-4: Corrigir a extração
Rafael pode editar, incluir e excluir Lançamentos de uma Fatura importada. A Conciliação é recalculada na hora.

### 4.2 Classificação automática
**Descrição:** antes de mostrar a fila, o app atribui Responsável, Categoria e Divisão a tudo o que reconhece. Realiza UJ-1.

#### FR-5: Herdar parcelas em andamento
Um Lançamento com Parcela n/N (n > 1) que corresponde ao Lançamento n−1/N do mês anterior (mesma descrição normalizada e mesmo valor) recebe o mesmo Responsável, a mesma Categoria, a mesma Divisão e a mesma observação.

#### FR-6: Aplicar Regras
Um Lançamento à vista cujo estabelecimento tem Regra recebe a classificação da Regra. A comparação tolera variações de nome ("DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY").
- Se o estabelecimento tem histórico com Responsáveis diferentes (ex.: farmácias), o app **sugere** o mais frequente, mas deixa o Lançamento na fila para confirmação.

#### FR-7: Aprender com a revisão
Quando Rafael classifica um Lançamento novo, o app cria ou atualiza a Regra daquele estabelecimento. [ASSUMPTION: aprende sozinho; Rafael não precisa confirmar cada Regra]

#### FR-8: Gerenciar Regras
Rafael pode ver todas as Regras, editar e apagar. Se ele editar uma Regra, o app pergunta se deve reaplicá-la aos Lançamentos do mês aberto.

#### FR-9: Importar histórico
Rafael pode importar as abas 01/2026 a 10/2026 da planilha "Cartão" (colunas Despesa, Valor, Parcela, Observação, Tipo, Responsabilidade) para criar as Regras iniciais e as parcelas em andamento.
- Lançamentos divididos em várias linhas na planilha (ex.: Monjaro) viram uma Divisão.
- Depois da importação, o app mostra as Regras criadas para Rafael revisar.

### 4.3 Revisão
**Descrição:** uma fila com o que o app não classificou, ou classificou com dúvida, pensada para poucos toques. Inspirada no Listonic: lista simples, agrupada, com ação de um toque. Realiza UJ-1.

#### FR-10: Fila de revisão
O app lista os Lançamentos sem classificação e os sugeridos, agrupados (ex.: por estabelecimento), com a sugestão visível.
- Confirmar uma sugestão leva um toque.
- O contador "faltam N" chega a zero quando a fila esvazia.

#### FR-11: Classificar em lote
Rafael pode selecionar vários Lançamentos e atribuir de uma vez Responsável, Categoria e observação.

#### FR-12: Dividir um Lançamento
Rafael pode dividir um Lançamento entre dois ou mais Responsáveis, por valor ou por proporção (ex.: 2/3 Mãe, 1/3 Rafael).
- A soma das partes é sempre igual ao valor do Lançamento. O app ajusta os centavos da divisão na última parte.

#### FR-13: Ver a fatura completa
Rafael pode ver todos os Lançamentos do mês numa grade, filtrar por Responsável, Categoria, cartão e estado da classificação, e editar qualquer linha.

### 4.4 Contas manuais
**Descrição:** contas fora do cartão entram uma vez e se repetem sozinhas. Realiza UJ-3.

#### FR-14: Cadastrar Conta manual
Rafael pode cadastrar uma Conta manual com nome, valor, Categoria, Responsável ou Divisão, mês inicial e duração: recorrente mensal (até encerrar) ou N parcelas.

#### FR-15: Gerar Lançamentos das Contas manuais
Ao abrir um mês, o app cria os Lançamentos das Contas manuais ativas, com Parcela n/N quando forem parceladas. Eles entram já classificados e não passam pela fila.

#### FR-16: Encerrar ou alterar uma Conta manual
Rafael pode encerrar ou alterar uma Conta manual. A mudança vale do mês aberto em diante, e os meses anteriores não mudam.

### 4.5 Painel e Blocos
**Descrição:** o Painel mostra os totais do mês em Blocos que Rafael monta, por pessoa ou por categoria. Realiza UJ-1 e UJ-4.

#### FR-17: Blocos padrão
Ao configurar o app, cada Responsável ganha um Bloco. O Bloco do Rangel já vem com a Fórmula Rangel + (Casal ÷ 2), e o do Rafael com Rafael + (Casal ÷ 2). [ASSUMPTION: o Casal é dividido 50/50 e não vira cobrança por si só]

#### FR-18: Montar Blocos personalizados
Rafael pode criar, renomear, reordenar e apagar Blocos, montando a Fórmula por seleção: escolhe Responsáveis e Categorias, operações (+ − × ÷), números e parênteses.
- Não existe campo de texto livre para a Fórmula.
- O app mostra a Fórmula legível, como (Rafael + Rangel) ÷ 2, e o resultado ao vivo.
- Uma Fórmula incompleta ou inválida (ex.: divisão por zero, parêntese aberto) não pode ser salva.
- Um Bloco pode filtrar ao mesmo tempo por Responsável e por Categoria (ex.: "Rafael em Bobiças").

#### FR-19: Ver o detalhe de um Bloco
Tocar num Bloco mostra os Lançamentos que compõem o total.

#### FR-20: Gasto por Categoria
O Painel mostra quanto Rafael gastou em cada Categoria no mês (só a parte dele).

### 4.6 Mensagem de cobrança
**Descrição:** cada Bloco de pessoa gera a mensagem do WhatsApp com um toque. Realiza UJ-1 e UJ-4.

#### FR-21: Copiar a Mensagem de cobrança
O botão "Copiar" de um Bloco coloca na área de transferência o texto no modelo do Rafael:
```
Oi
Esse mês deu R$ 1.350,14
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Nome da conta | Parcela | Valor
```
- O total e os detalhes são os do Bloco no mês.
- Se o Responsável tiver Saldo pendente de meses anteriores, a mensagem inclui uma linha "Pendente de meses anteriores: R$ X" e soma esse valor ao total. [ASSUMPTION: o pendente entra no total]
- As Dívidas programadas ainda não vencidas não entram na mensagem.

#### FR-22: Ajustar o modelo da mensagem
Rafael pode editar a saudação, a chave Pix e o rodapé do modelo. A estrutura dos detalhes é fixa.

### 4.7 Recebimentos
**Descrição:** registrar quem pagou, total ou parcialmente, e nunca perder uma Cobrança. Realiza UJ-2 e UJ-3.

#### FR-23: Registrar Pagamento
Rafael pode selecionar uma ou várias Cobranças de um Responsável e registrar um Pagamento com data e valor.
- Se o valor for igual à soma das Cobranças, todas viram "paga".
- Se o valor for menor, o Pagamento quita as Cobranças em ordem (das mais antigas para as mais novas), e a última fica "paga parcialmente" com o restante pendente. [ASSUMPTION: a ordem é das mais antigas para as mais novas]
- Um Pagamento pode ser desfeito.

#### FR-24: Ver Saldo pendente
Para cada Responsável, o app mostra o Saldo pendente total e a lista das Cobranças não quitadas, com mês e valor restante.

#### FR-25: Dívida programada
Rafael pode marcar Cobranças como Dívida programada, com vencimento combinado.
- Elas aparecem numa área "A receber", com data e valor.
- No mês do vencimento, passam a entrar na Mensagem de cobrança.
- Depois do vencimento, se não forem pagas, aparecem destacadas como atrasadas.

[ASSUMPTION: esse é o mecanismo para "não esquecer uma conta futura", e substitui o lançamento mensal que Rafael fazia para o Lucas]

#### FR-26: Histórico de Pagamentos
Rafael pode consultar todos os Pagamentos de um Responsável, com data, valor e as Cobranças que cada um quitou.

### 4.8 Acesso e aparelhos

#### FR-27: Entrar e sincronizar
Só Rafael acessa o app, com login próprio. Os dados ficam iguais no PC, no iPad e no iPhone, e uma alteração feita num aparelho aparece nos outros.

#### FR-28: Instalar como app
O web app pode ser instalado na tela inicial do iPhone e do iPad, sem App Store.

## 5. Plataforma e telas

- **Prioridade:** PC e iPad primeiro, com a experiência completa (grade, fila, Blocos, Recebimentos).
- **Celular (v1):** tudo funciona, mas o foco é consultar Blocos, copiar mensagens, registrar Pagamentos e ver Saldos pendentes. A grade completa (FR-13) aparece em formato de lista no celular. [ASSUMPTION: essa é a versão mínima aceitável no celular; uma experiência otimizada para ele fica para depois]

## 6. Requisitos não funcionais

- **Precisão:** nenhum valor pode ser perdido ou duplicado na extração, na Divisão ou nos Pagamentos. Valores são tratados em centavos, sem arredondamento acumulado.
- **Privacidade:** os dados financeiros ficam acessíveis só ao Rafael. A senha do PDF não é guardada. O PDF original pode ser guardado para consulta. [ASSUMPTION]
- **Desempenho:** importar e classificar uma Fatura de cerca de 50 Lançamentos leva menos de 1 minuto. [ASSUMPTION]
- **Formato brasileiro:** moeda em R$ com vírgula decimal, datas dd/mm/aaaa e interface em português.

## 7. Não objetivos

- Não envia mensagens pelo WhatsApp nem confirma Pix automaticamente. Rafael copia, cola e registra o Pagamento.
- Não lê faturas de outros bancos nem outros layouts do Santander.
- Não conecta com o banco (Open Finance).
- Não é um app de finanças pessoais completo: não tem orçamento, metas nem contas bancárias.
- Não tem acesso para as pessoas cobradas.

## 8. Escopo da primeira versão

**Dentro:** §4.1 a §4.8 e §5.

**Fora (por fase):**
- **Depois:** experiência otimizada para o celular.
- **Última etapa:** a Fatura do Rangel e o painel do casal com as duas Faturas.
- **Só se o app abrir para outras pessoas:** contas para outros usuários, outros bancos, pesquisa de mercado completa e custo e privacidade da IA.

## 9. Métricas de sucesso

- **SM-1:** fechamento do mês (do envio do PDF à última mensagem copiada) em menos de 10 minutos. Hoje leva cerca de 1h50. Valida FR-1 a FR-21.
- **SM-2:** pelo menos 55% dos Lançamentos do mês classificados sem revisão desde o primeiro mês, crescendo depois. Valida FR-5 a FR-9.
- **SM-3:** 100% das Faturas conciliadas, ou com a diferença explicada, antes de cobrar. Valida FR-3.
- **SM-4:** nenhuma Cobrança esquecida. Todo valor devido está pago, pendente ou programado. Valida FR-23 a FR-25.

**Contramétrica**
- **SM-C1:** não aumentar a classificação automática à custa de classificar errado. Uma sugestão incerta vai para a fila em vez de ser aplicada. Contrabalança SM-2.

## 10. Perguntas em aberto e suposições

**Perguntas em aberto**
1. O app pode guardar o PDF original de cada mês para consulta?
2. Os créditos e o cashback ficam sempre com o Rafael, ou algum dia são divididos (ex.: estorno de uma compra da Mãe)?

**Índice de suposições**
- §4.1 FR-1: a senha do PDF não é guardada.
- §4.1 FR-2: créditos e cashback ficam com o Rafael, sem Responsável.
- §4.1 FR-3: uma Conciliação divergente bloqueia a cobrança até ser resolvida.
- §4.2 FR-7: as Regras são aprendidas sem confirmação.
- §4.5 FR-17: o Casal é dividido 50/50, e os Blocos padrão de Rafael e Rangel já somam a metade.
- §4.6 FR-21: o Saldo pendente entra no total da mensagem.
- §4.7 FR-23: um pagamento parcial quita as Cobranças das mais antigas para as mais novas.
- §4.7 FR-25: a Dívida programada é o mecanismo para lembrar de contas futuras.
- §5: no celular, a grade aparece como lista, com foco em consultar, copiar e registrar Pagamentos.
- §6: o PDF original pode ser guardado; a importação leva menos de 1 minuto.
