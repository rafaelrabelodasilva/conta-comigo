import { describe, expect, it } from "vitest";
import {
  TEXTOS_RECEBIMENTOS,
  rotuloCobrarPendencias,
  rotuloFaltaReceber,
  rotuloListaEmAberto,
  rotuloMarcarEmAberto,
  rotuloMesDaLista,
  rotuloMesesEmAberto,
  rotuloVerEmAberto,
} from "./mensagens";

// Os textos de Recebimentos (História 6.5, UX-DR22): a linha de detalhe do cartão e os nomes acessíveis.

describe("rotuloMesesEmAberto (a linha de detalhe do cartão)", () => {
  it("nenhum Mês: 'Nada em aberto'", () => {
    expect(rotuloMesesEmAberto([])).toBe(TEXTOS_RECEBIMENTOS.nada_em_aberto);
  });

  it("um, dois e três Meses, em ordem", () => {
    expect(rotuloMesesEmAberto(["2026-10"])).toBe("Em aberto: Out/26");
    expect(rotuloMesesEmAberto(["2026-09", "2026-10"])).toBe("Em aberto: Set/26 e Out/26");
    expect(rotuloMesesEmAberto(["2026-08", "2026-09", "2026-10"])).toBe("Em aberto: Ago/26, Set/26 e Out/26");
  });

  it("mais de três: conta e diz desde quando (a linha não cresce com os anos)", () => {
    expect(rotuloMesesEmAberto(["2026-03", "2026-04", "2026-05", "2026-10"])).toBe("Em aberto em 4 meses, desde Mar/26");
  });
});

describe("nomes acessíveis", () => {
  it("os botões do cartão dizem de qual Bloco são", () => {
    expect(rotuloVerEmAberto("Lucas")).toBe("Ver os lançamentos em aberto de Lucas");
    expect(rotuloCobrarPendencias("Lucas")).toBe("Cobrar pendências de Lucas");
  });

  it("a lista e o Mês dela", () => {
    expect(rotuloListaEmAberto("Lucas")).toBe("Em aberto · Lucas");
    expect(rotuloMesDaLista("2026-10", 1)).toBe("Outubro/26 · 1 lançamento");
    expect(rotuloMesDaLista("2026-09", 12)).toBe("Setembro/26 · 12 lançamentos");
  });

  it("a caixa de uma linha diz o nome e o valor", () => {
    expect(rotuloMarcarEmAberto("NETFLIX", "R$ 39,90")).toBe("Marcar NETFLIX, R$ 39,90");
  });

  it("o 'Falta receber' diz para onde leva", () => {
    expect(rotuloFaltaReceber("R$ 636,00")).toBe("Falta receber R$ 636,00, abrir Recebimentos");
  });
});
