import { describe, expect, it } from "vitest";
import { somarCentavos } from "./exemplo";

describe("somarCentavos", () => {
  it("soma valores inteiros em centavos", () => {
    expect(somarCentavos([114074, -8, 34])).toEqual({ ok: true, valor: 114100 });
  });

  it("devolve zero para lista vazia", () => {
    expect(somarCentavos([])).toEqual({ ok: true, valor: 0 });
  });

  it("recusa valor não inteiro com código de erro", () => {
    const r = somarCentavos([100, 0.5]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe("centavos_invalido");
      expect(r.erro.detalhe).toBe("valor não inteiro");
    }
  });

  it("recusa inteiro fora do intervalo seguro", () => {
    const r = somarCentavos([2 ** 53]);
    expect(r).toEqual({
      ok: false,
      erro: {
        codigo: "centavos_invalido",
        detalhe: "valor fora do intervalo seguro",
      },
    });
  });

  it("recusa total que passa do intervalo seguro", () => {
    const r = somarCentavos([Number.MAX_SAFE_INTEGER, 1]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.detalhe).toBe("valor fora do intervalo seguro");
  });
});
