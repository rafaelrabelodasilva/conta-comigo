import { describe, expect, it } from "vitest";
import {
  ESPACO,
  arredondar,
  dividirEmPartes,
  ehValorDeFatura,
  formatarDinheiro,
  lerReais,
  paraCentavos,
} from "./dinheiro";

const e = (texto: string) => texto.replace(/ /g, ESPACO);

describe("formatarDinheiro", () => {
  it("monta o valor com milhar, vírgula e espaço inseparável", () => {
    expect(formatarDinheiro(114074)).toBe(e("R$ 1.140,74"));
    expect(formatarDinheiro(100)).toBe(e("R$ 1,00"));
    expect(formatarDinheiro(150)).toBe(e("R$ 1,50"));
    expect(formatarDinheiro(0)).toBe(e("R$ 0,00"));
    expect(formatarDinheiro(5)).toBe(e("R$ 0,05"));
    expect(formatarDinheiro(928023)).toBe(e("R$ 9.280,23"));
    expect(formatarDinheiro(123456789)).toBe(e("R$ 1.234.567,89"));
  });

  it("negativo leva o sinal antes de R$", () => {
    expect(formatarDinheiro(-8)).toBe(e("- R$ 0,08"));
    expect(formatarDinheiro(-114074)).toBe(e("- R$ 1.140,74"));
  });

  it("recusa centavos que não são inteiros", () => {
    expect(() => formatarDinheiro(1.5)).toThrow();
    expect(() => formatarDinheiro(Number.NaN)).toThrow();
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

  it("lê negativos e o que formatarDinheiro escreve", () => {
    expect(lerReais(e("- R$ 0,08"))).toEqual({ ok: true, valor: -8 });
    expect(lerReais("-0")).toEqual({ ok: true, valor: 0 });
    for (const c of [0, 1, 99, 100, 114074, -8, 123456789]) {
      expect(lerReais(formatarDinheiro(c))).toEqual({ ok: true, valor: c });
    }
  });

  it("ilegível é recusado", () => {
    for (const texto of ["", "abc", "1,505", "1,", ",50", "1.5.0", "1.50,00", "R$", "1 ,50x", "--1"]) {
      expect(lerReais(texto), texto).toEqual({ ok: false, erro: { codigo: "dinheiro.invalido" } });
    }
  });
});

describe("paraCentavos", () => {
  it("lê o formato da Fatura", () => {
    expect(paraCentavos("1.140,74")).toEqual({ ok: true, valor: 114074 });
    expect(paraCentavos("8.327,39")).toEqual({ ok: true, valor: 832739 });
    expect(paraCentavos("8327,39")).toEqual({ ok: true, valor: 832739 });
    expect(paraCentavos("0,08")).toEqual({ ok: true, valor: 8 });
    expect(paraCentavos("1.234.567,89")).toEqual({ ok: true, valor: 123456789 });
    expect(paraCentavos(" 639,62 ")).toEqual({ ok: true, valor: 63962 });
  });

  it("crédito com `-` vira negativo; -0,00 é zero", () => {
    expect(paraCentavos("-0,08")).toEqual({ ok: true, valor: -8 });
    expect(paraCentavos("-1.140,74")).toEqual({ ok: true, valor: -114074 });
    expect(paraCentavos("-0,00")).toEqual({ ok: true, valor: 0 });
  });

  it("é estrito: recusa o que lerReais aceitaria", () => {
    for (const texto of ["", "1", "1,5", "1.50", "R$ 1,50", "1.140,7", "1,505", "11.40,74", "1.1400,74", "- 0,08", "--1,00", "+1,00", "1,00-", "abc"]) {
      expect(paraCentavos(texto), texto).toEqual({ ok: false, erro: { codigo: "dinheiro.invalido" } });
      expect(ehValorDeFatura(texto), texto).toBe(false);
    }
    expect(ehValorDeFatura("1.140,74")).toBe(true);
  });
});

describe("arredondar", () => {
  it("meio para longe do zero", () => {
    expect(arredondar(0.5)).toBe(1);
    expect(arredondar(-0.5)).toBe(-1);
    expect(arredondar(1, 2)).toBe(1);
    expect(arredondar(-1, 2)).toBe(-1);
    expect(arredondar(2, 3)).toBe(1);
    expect(arredondar(-2, 3)).toBe(-1);
    expect(arredondar(1, 3)).toBe(0);
    expect(arredondar(-1, 3)).toBe(0);
    expect(arredondar(1.49)).toBe(1);
    expect(arredondar(2.5)).toBe(3);
    expect(arredondar(-2.5)).toBe(-3);
    expect(arredondar(7)).toBe(7);
    expect(arredondar(0)).toBe(0);
    expect(Object.is(arredondar(-1, 3), 0)).toBe(true);
  });

  it("é exata com inteiros", () => {
    expect(arredondar(93200, 3)).toBe(31067); // 31066,67
    expect(arredondar(-100, 3)).toBe(-33);
    expect(arredondar(5, 10)).toBe(1);
    expect(arredondar(Number.MAX_SAFE_INTEGER, 2)).toBe(4503599627370496);
  });

  it("recusa denominador ≤ 0 ou número inválido", () => {
    expect(() => arredondar(1, 0)).toThrow();
    expect(() => arredondar(1, -2)).toThrow();
    expect(() => arredondar(Number.NaN)).toThrow();
    expect(() => arredondar(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("com fração usa o ramo de ponto flutuante e lança fora do finito", () => {
    expect(arredondar(0.5)).toBe(1);
    expect(arredondar(-0.5)).toBe(-1);
    expect(() => arredondar(1, 1e-320)).toThrow();
    expect(() => arredondar(Number.MAX_SAFE_INTEGER * 2, 1)).toThrow();
  });
});

describe("dividirEmPartes", () => {
  const f = (numerador: number, denominador: number) => ({ numerador, denominador });

  it("Monjaro: R$ 466,00 em 2/3 + 1/3 = R$ 310,67 + R$ 155,33", () => {
    expect(dividirEmPartes(46600, [f(2, 3), f(1, 3)])).toEqual({ ok: true, valor: [31067, 15533] });
  });

  it("crédito: a última parte fecha a soma", () => {
    const r = dividirEmPartes(-100, [f(1, 3), f(1, 3), f(1, 3)]);
    expect(r).toEqual({ ok: true, valor: [-33, -33, -34] });
  });

  it("a soma das partes é sempre o valor", () => {
    for (const valor of [1, 2, 99, 563935, -8, 0]) {
      const r = dividirEmPartes(valor, [f(1, 2), f(1, 4), f(1, 4)]);
      expect(r.ok && r.valor.reduce((a, b) => a + b, 0)).toBe(valor);
    }
    expect(dividirEmPartes(563935, [f(1, 2), f(1, 2)])).toEqual({ ok: true, valor: [281968, 281967] });
    expect(dividirEmPartes(1000, [f(1, 1)])).toEqual({ ok: true, valor: [1000] });
  });

  it("recusa frações que não somam 1, lista vazia ou fração inválida", () => {
    const erro = { ok: false, erro: { codigo: "divisao.fracoes_invalidas" } };
    expect(dividirEmPartes(100, [f(1, 2)])).toEqual(erro);
    expect(dividirEmPartes(100, [])).toEqual(erro);
    expect(dividirEmPartes(100, [f(1, 0), f(1, 1)])).toEqual(erro);
    expect(dividirEmPartes(100, [f(1, -2), f(3, 2)])).toEqual(erro);
    expect(dividirEmPartes(100, [f(0.5, 1), f(1, 2)])).toEqual(erro);
    expect(dividirEmPartes(100, [f(2, 3), f(2, 3)])).toEqual(erro);
    expect(dividirEmPartes(3, [f(1, 2), f(1, 2), f(0, 1)])).toEqual(erro);
  });
});
