# PRD Quality Review: Conta Comigo (rodada silenciosa, stakes pessoais)

## Overall verdict
O PRD está pronto para UX e arquitetura no essencial. A tese ("um cartão, várias pessoas, todo mês", com o mínimo de trabalho manual) guia as funcionalidades, e os FRs têm consequências testáveis com exemplos reais. O risco principal é uma lacuna de modelo: como o pagamento do Rangel quita Cobranças do Casal.

## Decision-readiness: adequate
- **high** Pagamento de Responsável em grupo (§4.8 FR-25, §4.6 FR-19). As Cobranças são por Responsável, mas o Rangel deve "Rangel + Casal ÷ 2", uma Fórmula de Bloco. Não está definido como um Pagamento do Rangel quita metade das Cobranças do Casal, nem como fica o Saldo pendente do Casal. *Fix:* definir que o Pagamento é registrado contra um Bloco de pessoa e quita as frações das Cobranças que compõem o Bloco.

## Substance over theater: strong
Sem personas fictícias; as jornadas usam pessoas e valores reais. Os NFRs têm limites concretos (formatos, centavos, tempo real).

## Strategic coherence: strong
As fases seguem a dor (fechamento → planejamento → objetivos/casal). SM-C1 protege contra a classificação automática errada.

## Done-ness clarity: adequate
- **medium** FR-11 (sugestão por IA) não tem critério de aceite. É aceitável enquanto estiver marcado como desejável.
- **low** FR-33 "evolução" sem período definido. *Fix:* os últimos 6 Meses.

## Mechanical notes
- Os IDs são estáveis, mas fora de ordem no texto (FR-36, FR-44, FR-45 e FR-47 aparecem dentro de outras seções). O §0 deveria avisar.
- O Índice de suposições confere com as 13 tags inline.
