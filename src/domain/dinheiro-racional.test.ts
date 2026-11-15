import { describe, expect, it } from "vitest";
import {
  ESPACO,
  arredondar,
  arredondarRacional,
  formatarRacionalDecimal,
  formatarRacionalEmReais,
} from "./dinheiro";

const e = (texto: string) => texto.replaceAll(" ", ESPACO);
const big = (n: number) => BigInt(n);

describe("arredondarRacional (AD-2)", () => {
  it("meio para longe do zero: 563935 / 2 → 281968 (a Casal ÷ 2 de outubro)", () => {
    expect(arredondarRacional(big(563935), big(2))).toBe(281968);
  });

  it("0,5 → 1 e -0,5 → -1; abaixo do meio desce", () => {
    expect(arredondarRacional(big(1), big(2))).toBe(1);
    expect(arredondarRacional(big(-1), big(2))).toBe(-1);
    expect(arredondarRacional(big(1), big(3))).toBe(0);
    expect(arredondarRacional(big(-1), big(3))).toBe(0);
    expect(Object.is(arredondarRacional(big(-1), big(3)), 0)).toBe(true);
    expect(arredondarRacional(big(2), big(3))).toBe(1);
  });

  it("concorda com `arredondar` nos inteiros", () => {
    for (const n of [-1001, -7, -2, -1, 0, 1, 2, 5, 7, 99, 1001, 563935]) {
      for (const d of [1, 2, 3, 4, 7, 10, 100]) {
        expect(arredondarRacional(big(n), big(d))).toBe(arredondar(n, d));
      }
    }
  });

  it("recusa denominador não positivo e resultado fora dos inteiros seguros", () => {
    expect(() => arredondarRacional(big(1), big(0))).toThrow();
    expect(() => arredondarRacional(big(1), big(-2))).toThrow();
    expect(() => arredondarRacional(BigInt("99999999999999999999"), big(1))).toThrow();
  });
});

describe("formatarRacionalEmReais", () => {
  it("o centavo inteiro sai como formatarDinheiro (2 casas)", () => {
    expect(formatarRacionalEmReais(big(563935), big(1))).toBe(e("R$ 5.639,35"));
    expect(formatarRacionalEmReais(big(0), big(1))).toBe(e("R$ 0,00"));
    expect(formatarRacionalEmReais(big(-8), big(1))).toBe(e("- R$ 0,08"));
  });

  it("o meio centavo mostra a terceira casa exata: R$ 2.819,675", () => {
    expect(formatarRacionalEmReais(big(563935), big(2))).toBe(e("R$ 2.819,675"));
    expect(formatarRacionalEmReais(big(-1), big(2))).toBe(e("- R$ 0,005"));
  });

  it("reduz a fração antes de contar as casas", () => {
    expect(formatarRacionalEmReais(big(200), big(4))).toBe(e("R$ 0,50"));
  });

  it("o que não termina em decimal sai aproximado, com ≈", () => {
    expect(formatarRacionalEmReais(big(500000), big(3))).toBe(e("≈ R$ 1.666,667"));
    expect(formatarRacionalEmReais(big(-500000), big(3))).toBe(e("- ≈ R$ 1.666,667"));
  });
});

describe("formatarRacionalDecimal", () => {
  it("número sem unidade, só com as casas que precisa", () => {
    expect(formatarRacionalDecimal(big(2), big(1))).toBe("2");
    expect(formatarRacionalDecimal(big(1), big(2))).toBe("0,5");
    expect(formatarRacionalDecimal(big(5), big(4))).toBe("1,25");
    expect(formatarRacionalDecimal(big(1200), big(1))).toBe("1.200");
    expect(formatarRacionalDecimal(big(-3), big(2))).toBe("-1,5");
  });

  it("aproximado quando não termina", () => {
    expect(formatarRacionalDecimal(big(1), big(3))).toBe(e("≈ 0,333"));
    expect(formatarRacionalDecimal(big(2), big(3))).toBe(e("≈ 0,667"));
  });
});
