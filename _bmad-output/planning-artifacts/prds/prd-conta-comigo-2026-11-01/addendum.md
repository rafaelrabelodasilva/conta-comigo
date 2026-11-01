---
title: "Addendum: PRD Conta Comigo"
created: 2026-11-01
updated: 2026-11-01
---

# Addendum: PRD Conta Comigo

Base: product brief final em `../../briefs/brief-conta-comigo-2026-11-01/` (inclui análise de recorrência, estrutura da planilha, modelo da mensagem e pesquisa de mercado).

## Relato do fechamento do mês (Rafael, 01/11/2026)

> No dia 05/11/2026 a fatura do Santander fecha. Recebo um e-mail com o PDF da fatura, salvo e mando para a IA ler informando a senha para descriptografar o PDF, e ela transforma em CSV. Faço o upload no app, ele processa os dados categorizando e me mostra o painel com totalizadores personalizados: o somatório da Mãe, do Lucas, do Casal, ou de outro que eu criar (um filtro com base nas categorias). Cada bloco tem um botão de copiar que deixa pronta a mensagem do WhatsApp. Colo no WhatsApp da pessoa.

- O PDF da fatura vem **protegido por senha**.
- Dúvida de apresentação: a grade de lançamentos no celular. No tablet e no PC é tranquilo.

## Exemplo de dívida com pagamentos diferentes: Bombinhas

Viagem paga à vista no cartão e dividida entre pessoas: R$ 636 em 6 partes de R$ 106 (Mãe e Pai, Rafael e Rangel, Lucas e Miri). A Mãe paga mês a mês; o Lucas vai pagar tudo no final. O app precisa mostrar, por pessoa, quanto já foi pago e quanto falta, para que nenhuma parcela se perca.

## Notas técnicas para a arquitetura (não são requisitos)

- **Leitura do PDF:** o PDF do Santander vem criptografado. A senha é usada só durante a importação para abrir o arquivo, e nem o PDF nem a senha são guardados: só os dados extraídos (como o CSV de hoje). Há duas opções para a extração: um parser do layout do Santander (texto com coordenadas; o layout tem duas colunas e seções por cartão) ou um LLM com saída estruturada, como faz o Gemini hoje. Em qualquer caso, a Conciliação (FR-3) valida o resultado. Custo e privacidade da IA não bloqueiam a v1, porque o app é de uso pessoal.
- **Forma do app:** web app instalável (PWA) para PC, iPad e iPhone, com sincronização entre aparelhos (precisa de backend com login).
- **Normalização de descrições:** remover asteriscos, espaços e prefixos de adquirente (DM*, EBN, EBANX, MP, PAG, IFD…) e tolerar pequenas diferenças (AMAZONMETPLC e AMAZONMKTPLC).
- **Valores:** armazenar em centavos (inteiros). Na Divisão, o resto dos centavos vai para a última parte.
- **Importação do histórico:** a planilha "Cartão" no Google Sheets, abas 01/2026 a 10/2026. As linhas sem Parcela são lançamentos manuais (Silvia, William, TVbox, Bombinhas) e podem virar Contas manuais.

## Planejamento pessoal (ideias do Rafael, 01/11/2026)

- **Orçamento por Categoria:** limite mensal, por exemplo "no máximo R$ 300 em Bobiças".
- **Cofrinho / metas:** objetivos de compra (ex.: placa de vídeo), com quanto ele está guardando para cada um.
- **Salário e sobra:** cadastrar o salário e ver, no painel principal do Mês, quanto sobrou, numa barra de %. "Hoje eu não sei quanto sobra do meu salário."
- **Casamento de previstos (FR-45):** a chave é a descrição normalizada + Parcela (n/N) + Mês. O valor serve para conferir, e não para casar, porque pode variar alguns centavos. Duas compras iguais no mesmo estabelecimento, com a mesma parcela, precisam de desempate pela data da compra original, que a Fatura informa.
- **Conferência por cartão (FR-6):** cada seção de cartão da Fatura termina com "VALOR TOTAL". Em 10/2026 eram: 8175 → R$ 0,00; 3967 → R$ 523,66; 8673 → R$ 4.360,69 (inclui créditos); 9277 → R$ 867,09; 5061 → R$ 2.575,95. Conferir por seção mostra onde está a diferença. A marca "verificar" pode vir da comparação por seção e da confiança da extração.
- **Cálculo dos Blocos (FR-54):** avaliar a Fórmula como árvore de expressão sobre inteiros (centavos), com divisão em racional ou decimal exato e arredondamento final meio para cima. Os números de outubro/2026 são testes de aceite.
