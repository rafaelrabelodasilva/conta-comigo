// Prova técnica da História 2.1: o quadro "esperado × lido" da Fatura de
// outubro/2026 (vence 06/10/26). Os números esperados são os do aceite do
// Épico 2. A página de teste e o teste local com o Gemini usam este quadro.

import { formatarReais } from "./dinheiro";
import type { ResumoExtracao } from "./extracao-fatura";

export const ESPERADO_OUTUBRO_2026 = {
  quantidade: 49,
  despesasCentavos: 832_739,
  creditosCentavos: 63_962,
} as const;

/** Do PDF ao resultado em menos de 1 minuto (NFR). */
export const LIMITE_TOTAL_MS = 60_000;

export type ItemQuadro =
  | "quantidade"
  | "despesas"
  | "creditos"
  | "total_despesas_lido"
  | "total_creditos_lido"
  | "cartoes"
  | "sem_pagamento_anterior"
  | "tempo_total";

export type LinhaQuadro = { item: ItemQuadro; esperado: string; lido: string; ok: boolean };

/** "12,3 s": milissegundos em segundos com uma casa. */
export function formatarSegundos(ms: number): string {
  const decimos = Math.round(Math.max(0, ms) / 100);
  return `${Math.floor(decimos / 10)},${decimos % 10} s`;
}

/** Monta o quadro da prova: cada linha diz o esperado, o lido e se bateu. */
export function montarQuadroProva(
  resumo: ResumoExtracao,
  totalMs: number,
  esperado: { quantidade: number; despesasCentavos: number; creditosCentavos: number } = ESPERADO_OUTUBRO_2026,
): LinhaQuadro[] {
  const reais = (centavos: number, alvo: number) => ({
    esperado: formatarReais(alvo),
    lido: formatarReais(centavos),
    ok: centavos === alvo,
  });
  return [
    {
      item: "quantidade",
      esperado: String(esperado.quantidade),
      lido: String(resumo.quantidade),
      ok: resumo.quantidade === esperado.quantidade,
    },
    { item: "despesas", ...reais(resumo.despesasCentavos, esperado.despesasCentavos) },
    { item: "creditos", ...reais(resumo.creditosCentavos, esperado.creditosCentavos) },
    { item: "total_despesas_lido", ...reais(resumo.totalDespesasLidoCentavos, esperado.despesasCentavos) },
    { item: "total_creditos_lido", ...reais(resumo.totalCreditosLidoCentavos, esperado.creditosCentavos) },
    // A soma dos cartões tem de ser igual à soma das despesas lidas.
    { item: "cartoes", ...reais(resumo.cartoesCentavos, resumo.despesasCentavos) },
    {
      item: "sem_pagamento_anterior",
      esperado: "0",
      lido: String(resumo.pagamentosDeFatura),
      ok: resumo.pagamentosDeFatura === 0,
    },
    {
      item: "tempo_total",
      esperado: `< ${formatarSegundos(LIMITE_TOTAL_MS)}`,
      lido: formatarSegundos(totalMs),
      ok: totalMs < LIMITE_TOTAL_MS,
    },
  ];
}
