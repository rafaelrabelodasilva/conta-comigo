import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import type { ResumoExtracao } from "./extracao-fatura";
import { ESPERADO_OUTUBRO_2026, formatarSegundos, montarQuadroProva } from "./prova-fatura";

const resumoOutubro = (extra: Partial<ResumoExtracao> = {}): ResumoExtracao => ({
  quantidade: 49,
  despesasCentavos: 832739,
  creditosCentavos: 63962,
  cartoesCentavos: 832739,
  totalDespesasLidoCentavos: 832739,
  totalCreditosLidoCentavos: 63962,
  diferencaDespesasCentavos: 0,
  diferencaCreditosCentavos: 0,
  diferencaCartoesCentavos: 0,
  porCartao: [],
  pagamentosDeFatura: 0,
  duvidas: 0,
  ...extra,
});

describe("montarQuadroProva", () => {
  it("outubro/2026 certo e rápido: tudo bate", () => {
    const quadro = montarQuadroProva(resumoOutubro(), 25_000);
    expect(quadro.every((l) => l.ok)).toBe(true);
    expect(quadro.find((l) => l.item === "despesas")).toEqual({
      item: "despesas",
      esperado: `R$${ESPACO}8.327,39`,
      lido: `R$${ESPACO}8.327,39`,
      ok: true,
    });
    expect(quadro.find((l) => l.item === "quantidade")?.lido).toBe("49");
  });

  it("mostra o que não bateu", () => {
    const quadro = montarQuadroProva(
      resumoOutubro({ quantidade: 48, cartoesCentavos: 832700, pagamentosDeFatura: 1 }),
      61_000,
    );
    const falhas = quadro.filter((l) => !l.ok).map((l) => l.item);
    expect(falhas).toEqual(["quantidade", "cartoes", "sem_pagamento_anterior", "tempo_total"]);
  });

  it("os números esperados são os do aceite", () => {
    expect(ESPERADO_OUTUBRO_2026).toEqual({ quantidade: 49, despesasCentavos: 832739, creditosCentavos: 63962 });
  });
});

describe("formatarSegundos", () => {
  it("uma casa, vírgula e espaço inseparável", () => {
    expect(formatarSegundos(12_345)).toBe(`12,3${ESPACO}s`);
    expect(formatarSegundos(60_000)).toBe(`60,0${ESPACO}s`);
    expect(formatarSegundos(49)).toBe(`0,0${ESPACO}s`);
    expect(formatarSegundos(-5)).toBe(`0,0${ESPACO}s`);
  });
});
