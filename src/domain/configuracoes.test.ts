import { describe, expect, it } from "vitest";
import {
  APARENCIAS,
  APARENCIA_PADRAO,
  LIMITE_AJUSTE_PADRAO_CENTAVOS,
  TOLERANCIA_ATRASO_PADRAO_DIAS,
  aparenciaDe,
  ehAparencia,
  validarLimiteAjuste,
  validarToleranciaAtraso,
} from "./configuracoes";

describe("Aparência", () => {
  it("Sistema, Claro e Escuro; padrão Sistema", () => {
    expect(APARENCIAS).toEqual(["sistema", "claro", "escuro"]);
    expect(APARENCIA_PADRAO).toBe("sistema");
  });

  it("valor desconhecido cai no padrão", () => {
    expect(ehAparencia("escuro")).toBe(true);
    expect(ehAparencia("Escuro")).toBe(false);
    expect(aparenciaDe("claro")).toBe("claro");
    expect(aparenciaDe(undefined)).toBe("sistema");
    expect(aparenciaDe("roxo")).toBe("sistema");
    expect(aparenciaDe(1)).toBe("sistema");
  });
});

describe("padrões", () => {
  it("limite do Ajuste R$ 1,00 e tolerância de 10 dias", () => {
    expect(LIMITE_AJUSTE_PADRAO_CENTAVOS).toBe(100);
    expect(TOLERANCIA_ATRASO_PADRAO_DIAS).toBe(10);
  });
});

describe("validarLimiteAjuste", () => {
  it("lê reais e devolve centavos", () => {
    expect(validarLimiteAjuste("1,50")).toEqual({ ok: true, valor: 150 });
    expect(validarLimiteAjuste("0,01")).toEqual({ ok: true, valor: 1 });
    expect(validarLimiteAjuste("10")).toEqual({ ok: true, valor: 1000 });
    expect(validarLimiteAjuste("R$ 2,00")).toEqual({ ok: true, valor: 200 });
  });

  it("fora de R$ 0,01 a R$ 10,00", () => {
    for (const texto of ["0", "0,00", "10,01", "-1,00", "100"]) {
      expect(validarLimiteAjuste(texto), texto).toEqual({ ok: false, erro: { codigo: "ajuste.limite_fora" } });
    }
  });

  it("ilegível", () => {
    for (const texto of ["", "abc", "1,505"]) {
      expect(validarLimiteAjuste(texto), texto).toEqual({
        ok: false,
        erro: { codigo: "ajuste.limite_invalido" },
      });
    }
  });
});

describe("validarToleranciaAtraso", () => {
  it("de 0 a 60 dias inteiros", () => {
    expect(validarToleranciaAtraso("0")).toEqual({ ok: true, valor: 0 });
    expect(validarToleranciaAtraso(" 10 ")).toEqual({ ok: true, valor: 10 });
    expect(validarToleranciaAtraso("60")).toEqual({ ok: true, valor: 60 });
  });

  it("recusa fora do intervalo e não inteiro", () => {
    for (const texto of ["", "61", "-1", "2,5", "dez", "1000"]) {
      expect(validarToleranciaAtraso(texto), texto).toEqual({
        ok: false,
        erro: { codigo: "atraso.tolerancia_invalida" },
      });
    }
  });
});
