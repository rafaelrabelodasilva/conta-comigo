import { describe, expect, it } from "vitest";
import { CHAVES_SECAO, secaoEscolhida } from "./secoes";

describe("secaoEscolhida", () => {
  it("ausente ou desconhecida cai em Responsáveis", () => {
    expect(secaoEscolhida(undefined)).toBe("responsaveis");
    expect(secaoEscolhida("")).toBe("responsaveis");
    expect(secaoEscolhida("desconhecida")).toBe("responsaveis");
    expect(secaoEscolhida("toString")).toBe("responsaveis");
    expect(secaoEscolhida([])).toBe("responsaveis");
  });

  it("escolhe Responsáveis, Tipos e Status pelo nome", () => {
    expect(secaoEscolhida("tipos")).toBe("tipos");
    expect(secaoEscolhida("status")).toBe("status");
    expect(secaoEscolhida("responsaveis")).toBe("responsaveis");
  });

  it("escolhe Ciclo do cartão, Conferência e atraso e Aparência (História 1.7)", () => {
    expect(secaoEscolhida("ciclo")).toBe("ciclo");
    expect(secaoEscolhida("conferencia")).toBe("conferencia");
    expect(secaoEscolhida("aparencia")).toBe("aparencia");
  });

  it("escolhe Regras aprendidas (História 3.4)", () => {
    expect(secaoEscolhida("regras")).toBe("regras");
  });

  it("a ordem é a do EXPERIENCE.md", () => {
    expect(CHAVES_SECAO).toEqual(["responsaveis", "tipos", "status", "ciclo", "conferencia", "regras", "aparencia"]);
  });

  it("com o parâmetro repetido, vale o primeiro", () => {
    expect(secaoEscolhida(["tipos", "responsaveis"])).toBe("tipos");
    expect(secaoEscolhida(["x", "tipos"])).toBe("responsaveis");
    expect(secaoEscolhida(["status", "tipos"])).toBe("status");
  });
});
