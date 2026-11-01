---
title: "Product Brief: Conta Comigo"
status: draft
created: 2026-11-01
updated: 2026-11-01
---

# Product Brief: Conta Comigo

## Resumo

O Conta Comigo é para quem deixa outras pessoas comprarem no próprio cartão de crédito e, todo mês, precisa descobrir quanto cada uma deve. Você envia o PDF da fatura. O app extrai os lançamentos, já sabe de quem é a maior parte deles pelo histórico dos meses anteriores e deixa para você só o que é realmente novo. No fim, ele gera a mensagem de cobrança de cada pessoa e acompanha quem já pagou.

Hoje esse trabalho é feito à mão: o PDF vira CSV no Gemini, o CSV é colado numa planilha, e cada uma das quase 50 linhas recebe um responsável e uma categoria. Os totais são conferidos e as mensagens vão uma a uma pelo WhatsApp. A parte que mais cansa é classificar linha por linha. E é justamente a mais repetitiva: em outubro/2026, cerca de 55% das linhas (65% do valor) eram parcelas em andamento ou assinaturas com o mesmo responsável de sempre.

## O problema

Rafael paga um cartão que, na prática, é de cinco "contas": a dele, a do Rangel (namorado), a do casal (dividida 50/50), a da mãe e a do irmão Lucas. Todo mês ele:

1. Baixa o PDF da fatura do Santander. A fatura junta o cartão titular e quatro adicionais, todos dele.
2. Converte o PDF em CSV com um prompt no Gemini e cola o resultado numa aba nova da planilha.
3. Marca responsável e categoria em cada linha, dividindo algumas entre pessoas (ex.: um remédio dividido dois terços para a mãe e um terço para ele).
4. Inclui contas que não passam pelo cartão (pagamentos fixos mensais, uma viagem dividida em 6x).
5. Lê os totais e manda uma mensagem por pessoa no WhatsApp, com o total, a chave Pix e o detalhamento.

**O que custa:**
- **Tempo e repetição.** Parcelas de 10x e 12x são classificadas de novo todo mês, apesar de o responsável nunca mudar.
- **Risco de erro.** A conferência é frágil. O prompt exige que o somatório "feche" com o total a pagar, mas isso nem sempre é possível: em outubro, os R$ 25,90 que sobraram da fatura anterior fizeram a soma dos lançamentos (R$ 7.687,77) não bater com o total (R$ 7.713,67), e o Gemini respondeu com uma justificativa errada.
- **Cobrança sem controle.** A planilha tem uma coluna para o status da dívida, mas ela nunca é preenchida. Não há um registro claro de quem já pagou.

## A solução

Um app que transforma "fatura em PDF" em "mensagem de cobrança por pessoa", com o mínimo de trabalho manual:

- **Importação da fatura.** Você envia o PDF e o app extrai despesas, parcelamentos e créditos/estornos, separando o que é pagamento da fatura anterior. Ele confere o resultado com o resumo da fatura, levando em conta o saldo anterior, e avisa quando algo não bate.
- **Classificação automática.** Parcelas que continuam herdam o responsável, a categoria e a divisão do mês anterior. Estabelecimentos recorrentes seguem regras aprendidas, e o app tolera variações de nome ("DM*SPOTIFY" e "EBN SPOTIFY").
- **Revisão rápida do que é novo.** As compras novas aparecem numa fila, com sugestão de responsável quando houver histórico. Você confirma ou corrige com poucos toques, e pode dividir um lançamento entre várias pessoas.
- **Contas fora do cartão.** Cadastro manual de contas com valor, número de parcelas ou recorrência mensal e responsável. Elas entram sozinhas nos meses seguintes.
- **Totais e cobrança.** Mostra o total do mês por pessoa (com o Casal dividido entre Rafael e Rangel) e gera a mensagem no formato que ele já usa: total, chave Pix e detalhes `Nome | Parcela | Valor`, prontos para enviar pelo WhatsApp.
- **Controle de pagamento.** Marca, por pessoa e por mês, quem já pagou.
- **Visão do próprio gasto.** Quanto o próprio Rafael gastou no mês, por categoria.

Funciona no PC, no iPhone e no iPad. [ASSUMPTION: um web app responsivo, instalável na tela inicial, atende os três sem precisar de app nativo]

## O que torna diferente

Apps de divisão de contas, como o Splitwise, pedem que cada gasto seja digitado à mão. Apps de finanças pessoais leem a fatura, mas organizam o gasto de uma pessoa só. O Conta Comigo junta as duas coisas para um caso comum no Brasil e mal atendido: **um cartão, várias pessoas, todo mês**. A vantagem dele não é técnica. Ele foi pensado para o fluxo real da fatura brasileira (parcelas "05/10", cartões adicionais, estornos, cashback, saldo remanescente) e aprende com o histórico de quem usa. [ASSUMPTION: não há concorrente direto que faça isso; verificar antes do PRD]

## Para quem é

- **Usuário principal: o dono do cartão** (Rafael). Só ele opera o app. Ele quer gastar minutos por mês nisso, e não uma tarde.
- **Quem recebe a cobrança** (Rangel, mãe, Lucas). Não usa o app, só recebe a mensagem no WhatsApp e paga por Pix.
- **No futuro, um segundo dono de cartão** (Rangel). Pode enviar a própria fatura para que as contas do casal fiquem num painel único (ex.: a internet que está no cartão dele).

## Critérios de sucesso

- Do envio do PDF às mensagens prontas em **menos de 10 minutos** [ASSUMPTION: meta inicial; medir o tempo atual].
- **Pelo menos 55% das linhas classificadas sem intervenção** já no segundo mês de uso, crescendo com o histórico.
- **Zero divergência não explicada** entre a soma dos lançamentos e o total da fatura.
- A planilha do Google deixa de ser necessária.
- Todo mês fica claro quem já pagou.

## Escopo

**Na primeira versão:**
- Um usuário (Rafael), uma fatura por mês (Santander), as pessoas e categorias que ele já usa.
- Importação do PDF, conciliação com o resumo, classificação automática com revisão, divisão de lançamentos, contas manuais recorrentes ou parceladas, totais por pessoa, mensagem para o WhatsApp e status de pagamento.
- Importação do histórico da planilha atual, para o app já começar sabendo classificar. [ASSUMPTION: vale o esforço; sem isso, o primeiro mês é todo manual]

**Fora da primeira versão:**
- Contas para outras pessoas e outros bancos.
- Fatura do Rangel e painel do casal.
- Envio automático da cobrança e confirmação automática do Pix (o envio continua manual, pelo próprio WhatsApp).
- Integração direta com o banco (Open Finance).

## Visão

Se resolver bem o mês do Rafael, o Conta Comigo passa a aceitar a fatura do parceiro e mostra as finanças do casal num só lugar. Depois, abre para qualquer pessoa que divide o cartão com família, parceiro ou amigos, com faturas de outros bancos. A ideia é que fechar o mês seja sempre o mesmo gesto: subir a fatura, confirmar o que é novo e enviar as cobranças.

## Em aberto

- A forma de extrair a fatura (IA, como hoje com o Gemini, ou leitura estruturada do PDF), e o custo e a privacidade de mandar dados financeiros para um serviço de IA.
- Se o Rangel usaria o painel do casal o suficiente para justificar a segunda fase.
- Como lidar com faturas de outros bancos quando o app abrir para outras pessoas.
