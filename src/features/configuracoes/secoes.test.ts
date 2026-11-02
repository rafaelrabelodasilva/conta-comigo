import { describe, expect, it } from "vitest";
import { secaoEscolhida } from "./secoes";

describe("secaoEscolhida", () => {
  it("ausente ou desconhecida cai em Responsáveis", () => {
    expect(secaoEscolhida(undefined)).toBe("responsaveis");
    expect(secaoEscolhida("")).toBe("responsaveis");
    expect(secaoEscolhida("ciclo")).toBe("responsaveis");
    expect(secaoEscolhida("toString")).toBe("responsaveis");
    expect(secaoEscolhida([])).toBe("responsaveis");
  });

  it("escolhe Responsáveis, Tipos e Status pelo nome", () => {
    expect(secaoEscolhida("tipos")).toBe("tipos");
    expect(secaoEscolhida("status")).toBe("status");
    expect(secaoEscolhida("responsaveis")).toBe("responsaveis");
  });

  it("com o parâmetro repetido, vale o primeiro", () => {
    expect(secaoEscolhida(["tipos", "responsaveis"])).toBe("tipos");
    expect(secaoEscolhida(["x", "tipos"])).toBe("responsaveis");
    expect(secaoEscolhida(["status", "tipos"])).toBe("status");
  });
});
