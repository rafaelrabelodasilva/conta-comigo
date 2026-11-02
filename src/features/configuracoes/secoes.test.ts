import { describe, expect, it } from "vitest";
import { secaoEscolhida } from "./secoes";

describe("secaoEscolhida", () => {
  it("ausente ou desconhecida cai em Responsáveis", () => {
    expect(secaoEscolhida(undefined)).toBe("responsaveis");
    expect(secaoEscolhida("")).toBe("responsaveis");
    expect(secaoEscolhida("status")).toBe("responsaveis");
    expect(secaoEscolhida("toString")).toBe("responsaveis");
    expect(secaoEscolhida([])).toBe("responsaveis");
  });

  it("escolhe Tipos e Responsáveis pelo nome", () => {
    expect(secaoEscolhida("tipos")).toBe("tipos");
    expect(secaoEscolhida("responsaveis")).toBe("responsaveis");
  });

  it("com o parâmetro repetido, vale o primeiro", () => {
    expect(secaoEscolhida(["tipos", "responsaveis"])).toBe("tipos");
    expect(secaoEscolhida(["x", "tipos"])).toBe("responsaveis");
  });
});
