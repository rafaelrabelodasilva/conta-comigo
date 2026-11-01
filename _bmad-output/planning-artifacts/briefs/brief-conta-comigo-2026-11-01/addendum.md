---
title: "Addendum: Conta Comigo"
created: 2026-11-01
updated: 2026-11-01
---

# Addendum: material de origem e detalhes para PRD/arquitetura

## Fluxo atual (manual, mensal)

1. Baixa o PDF da fatura do cartão (Santander Elite Mastercard).
2. Usa um prompt no Gemini para converter o PDF em CSV `nomedespesa;valor;parcela` (separador `;`, vírgula decimal, estornos negativos, parcela no formato `NN/NN` ou `1/1`).
3. Cola o CSV numa aba nova da planilha Google "Cartão" (uma aba por mês, de 07/2025 a 10/2026).
4. Preenche observação, tipo (categoria) e responsável para cada linha.
5. Lê os totais por responsável e manda uma mensagem no WhatsApp para cada pessoa com o valor a pagar.

## Estrutura da fatura (exemplo: vencimento 06/10/2026)

- Uma fatura agrupa vários cartões: titular (final 8175) e adicionais (finais 3967, 8673, 9277, 5061). Cada cartão tem seções "Pagamento e Demais Créditos", "Parcelamentos" e "Despesas".
- Cada lançamento traz data da compra, descrição, parcela e valor. Alguns têm um número na frente (ex.: 2, 3), que não está explicado no PDF.
- Resumo: saldo anterior 7.483,11; despesas 8.327,39; pagamentos 7.457,21; créditos 639,62; saldo da fatura 7.713,67.
- O pagamento da fatura anterior (-7.457,21) aparece como crédito, mas não é despesa, e o CSV do Gemini o exclui corretamente.

## Conferência do CSV do Gemini (outubro/2026)

- 49 linhas, que conferem uma a uma com o PDF.
- Despesas: 8.327,39. Créditos: -639,62. Soma líquida: 7.687,77.
- Essa soma **não** fecha com o total a pagar (7.713,67). A diferença de 25,90 é o saldo que sobrou da fatura anterior (7.483,11 - 7.457,21), e não é um lançamento. A regra 4 do prompt ("o somatório deve fechar exatamente com o total a pagar") é, portanto, impossível de cumprir sempre, e o Gemini justificou o valor com uma conta confusa. O app precisa conciliar com o saldo anterior e os pagamentos.

## Estrutura da planilha (aba 10/2026)

Colunas: Despesa | Valor | Parcela | Observação | Tipo | Responsabilidade | Lançado por | Status dívida.

- **Responsáveis:** Rafael, Rangel (namorado), Casal (dividido 50/50 entre Rafael e Rangel), Mãe, Lucas (irmão).
- **Tipos (categorias):** Steams (assinaturas), Casa, Mãe, Saúde, Presente, Gatos, Socializar, Lucas, Carro, Viagem, Bobiças, Estudo, Mercado, Comida, Lanches, Não sei.
- **Divisão de um lançamento:** um mesmo lançamento pode ser dividido entre responsáveis (ex.: JIM COM 466,00 virou 310,67 para a Mãe e 155,33 para o Rafael).
- **Lançamentos fora da fatura:** também entram despesas que não estão no cartão (ex.: Silvia 400,00; William 420,00; TVbox 30,00; "Bombinhas" 3 x 106,00 em 04/06, com observação "Total R$ 636,00").
- **Créditos e estornos:** ficam sem responsável.
- **Totais (10/2026):** Rafael 2.290,74; Rangel 0,00; Casal 5.639,35 (metade: 2.819,68); Mãe 1.350,14; Lucas 215,16; total 9.280,23.
- **Recorrência:** muitos lançamentos se repetem todo mês com o mesmo responsável e a mesma categoria (assinaturas, parcelamentos em andamento).

## Quanto da fatura se repete (análise das abas 08, 09 e 10/2026)

Classificação de outubro/2026 (44 linhas de despesa do cartão, sem contar créditos e lançamentos manuais):

| Situação | Linhas | Como o app resolveria |
|---|---|---|
| Continuação de parcela (02/04, 05/10…) | 20 | Copia o responsável e a categoria do mês anterior (mesmo nome, parcela n-1), incluindo divisões como o Monjaro (2/3 Mãe, 1/3 Rafael) |
| Avulsa recorrente com o mesmo responsável (Apple, Spotify, Amazon Music) | 4 | Regra por estabelecimento; precisa normalizar variações ("DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY") |
| Estabelecimento conhecido, mas responsável variável (Grasso, Panvel) | 2 | Sugere o mais provável e pede confirmação |
| Novo (5 parcelas 01/xx + 13 avulsas) | 18 | Precisa de Rafael; as parcelas novas passam a ser automáticas nos meses seguintes |

- Cerca de 55% das linhas e cerca de 65% do valor (R$ 5.444 em parcelas + R$ 107 em recorrentes, de R$ 8.327) sairiam classificados só pelo histórico.
- O que sobra é exatamente o que exige a memória de Rafael: compras avulsas novas em marketplaces (Shopee, Amazon, Mercado Livre).
- Os nomes mudam entre meses para o mesmo estabelecimento ("AMAZONMETPLC" e "AMAZONMKTPLC", "LITE VIVOEASYANJAL" e "VIVOEASYANUAL"), então a comparação precisa tolerar diferenças.

## Ideia futura: fatura do casal

Rangel também subiria a fatura dele, e as duas seriam reunidas num painel único (ex.: internet paga no cartão dele e dividida pelo casal). "Quem subiu a fatura" vira pista de responsável. A adesão do Rangel é incerta.

## Mensagem de cobrança atual (modelo)

```
Oi
Esse mês deu R$ 1.350,14
Pix rafaelrabelodasilva@outlook.com

Detalhes:
Nome da conta | Parcela | Valor R$ 0,00
```

## Contas fora do cartão

Cadastro manual com valor, número de parcelas (ou recorrência mensal) e responsável. Exemplos atuais: Silvia (R$ 400, mensal), William/Will (R$ 420, mensal), TVbox (R$ 30, mensal), Bombinhas (R$ 636 em 6x, dividido em três partes de R$ 106: Mãe e Pai, Rafael e Rangel, Lucas e Miri).

## Pesquisa de mercado (rápida, 01/11/2026)

- **Splitwise, Tricount, Splitser:** divisão de despesas em grupo com lançamento manual. As importações que oferecem são de outros apps de divisão, como o importador de Splitwise do Tricount e o serviço de migração do Splitser.
- **SplitMyExpenses:** conecta contas bancárias e cartões, aceita CSV e importa do Splitwise. A página não explica como as linhas importadas viram despesas divididas.
- **Billy, Tabify:** IA que lê a foto de uma conta (restaurante) e distribui os itens entre pessoas. Billy gera resumos por pessoa para enviar por mensagem.
- Não foi encontrado nenhum app que importe a fatura brasileira em PDF, acompanhe as parcelas e divida por pessoa todo mês. A pesquisa não foi exaustiva. Se o app abrir para outras pessoas, vale fazer uma pesquisa completa com `bmad-deep-recon`.

## Referência de usabilidade: Listonic

App de lista de compras de que o Rafael gosta. Itens adicionados rapidamente (por busca ou voz), agrupados por seção ou em ordem própria, marcados com um toque, sincronizados em tempo real entre aparelhos e funcionando offline. Inspira a fila de revisão (classificar com um toque, agrupada) e o controle de pagamento (marcar quem pagou).

## Histórico a importar

Apenas as abas 01/2026 a 10/2026 da planilha "Cartão". As abas de 2025 podem ter classificações erradas. A aba "TBC 00/2026" parece ser um modelo e precisa ser confirmada antes.
