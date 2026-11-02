import { describe, expect, it } from "vitest";
import { ESPACO, formatarReais, lerReais } from "./dinheiro";

const e = (texto: string) => texto.replace(/ /g, ESPACO);

describe("formatarReais", () => {
  it("monta o valor com milhar, vírgula e espaço inseparável", () => {
    expect(formatarReais(114074)).toBe(e("R$ 1.140,74"));
    expect(formatarReais(100)).toBe(e("R$ 1,00"));
    expect(formatarReais(150)).toBe(e("R$ 1,50"));
    expect(formatarReais(0)).toBe(e("R$ 0,00"));
    expect(formatarReais(5)).toBe(e("R$ 0,05"));
    expect(formatarReais(928023)).toBe(e("R$ 9.280,23"));
    expect(formatarReais(123456789)).toBe(e("R$ 1.234.567,89"));
  });

  it("negativo leva o sinal antes de R$", () => {
    expect(formatarReais(-8)).toBe(e("- R$ 0,08"));
    expect(formatarReais(-114074)).toBe(e("- R$ 1.140,74"));
  });

  it("recusa centavos que não são inteiros", () => {
    expect(() => formatarReais(1.5)).toThrow();
    expect(() => formatarReais(Number.NaN)).toThrow();
  });
});

describe("lerReais", () => {
  it("lê o que se digita num campo", () => {
    expect(lerReais("1,50")).toEqual({ ok: true, valor: 150 });
    expect(lerReais("1,5")).toEqual({ ok: true, valor: 150 });
    expect(lerReais("1")).toEqual({ ok: true, valor: 100 });
    expect(lerReais("0,01")).toEqual({ ok: true, valor: 1 });
    expect(lerReais("R$ 1.140,74")).toEqual({ ok: true, valor: 114074 });
    expect(lerReais(e("R$ 10,00"))).toEqual({ ok: true, valor: 1000 });
    expect(lerReais(" 2,30 ")).toEqual({ ok: true, valor: 230 });
    expect(lerReais("1.50")).toEqual({ ok: true, valor: 150 });
    expect(lerReais("1.500")).toEqual({ ok: true, valor: 150000 });
    expect(lerReais("1500,00")).toEqual({ ok: true, valor: 150000 });
  });

  it("lê negativos e o que formatarReais escreve", () => {
    expect(lerReais(e("- R$ 0,08"))).toEqual({ ok: true, valor: -8 });
    expect(lerReais("-0")).toEqual({ ok: true, valor: 0 });
    for (const c of [0, 1, 99, 100, 114074, -8, 123456789]) {
      expect(lerReais(formatarReais(c))).toEqual({ ok: true, valor: c });
    }
  });

  it("ilegível é recusado", () => {
    for (const texto of ["", "abc", "1,505", "1,", ",50", "1.5.0", "1.50,00", "R$", "1 ,50x", "--1"]) {
      expect(lerReais(texto), texto).toEqual({ ok: false, erro: { codigo: "dinheiro.invalido" } });
    }
  });
});
