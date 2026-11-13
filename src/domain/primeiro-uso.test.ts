import { describe, expect, it } from "vitest";
import {
  PASSOS_PRIMEIRO_USO,
  deveAbrirPrimeiroUso,
  numeroDoPasso,
  passoEscolhido,
  passosSeguintes,
  passoAnterior,
  proximoPasso,
} from "./primeiro-uso";

describe("passos do Primeiro uso", () => {
  it("seguem a ordem Responsáveis → Tipos → Status → Importar planilha → Ciclo", () => {
    expect(PASSOS_PRIMEIRO_USO).toEqual(["responsaveis", "tipos", "status", "planilha", "ciclo"]);
    expect(PASSOS_PRIMEIRO_USO.map(numeroDoPasso)).toEqual([1, 2, 3, 4, 5]);
  });

  it("o próximo passo anda um; no último não há próximo", () => {
    expect(proximoPasso("responsaveis")).toBe("tipos");
    expect(proximoPasso("tipos")).toBe("status");
    expect(proximoPasso("status")).toBe("planilha");
    expect(proximoPasso("planilha")).toBe("ciclo");
    expect(proximoPasso("ciclo")).toBeNull();
  });

  it("o passo anterior anda um para trás; no primeiro não há anterior", () => {
    expect(passoAnterior("responsaveis")).toBeNull();
    expect(passoAnterior("tipos")).toBe("responsaveis");
    expect(passoAnterior("status")).toBe("tipos");
    expect(passoAnterior("planilha")).toBe("status");
    expect(passoAnterior("ciclo")).toBe("planilha");
  });

  it("os passos seguintes são os que ainda faltam", () => {
    expect(passosSeguintes("responsaveis")).toEqual(["tipos", "status", "planilha", "ciclo"]);
    expect(passosSeguintes("status")).toEqual(["planilha", "ciclo"]);
    expect(passosSeguintes("ciclo")).toEqual([]);
  });
});

describe("passoEscolhido", () => {
  it("escolhe o passo pelo nome", () => {
    for (const passo of PASSOS_PRIMEIRO_USO) expect(passoEscolhido(passo)).toBe(passo);
  });

  it("ausente, desconhecido ou inválido cai no passo 1", () => {
    for (const valor of [undefined, "", "xyz", "2", "toString", "__proto__", "Tipos"]) {
      expect(passoEscolhido(valor)).toBe("responsaveis");
    }
    expect(passoEscolhido([])).toBe("responsaveis");
  });

  it("lista usa o primeiro valor", () => {
    expect(passoEscolhido(["status", "tipos"])).toBe("status");
  });
});

describe("deveAbrirPrimeiroUso", () => {
  it("primeira entrada: sem cadastros e sem marca abre", () => {
    expect(deveAbrirPrimeiroUso({ concluidoEm: null, temCadastro: false })).toBe(true);
    // Sem a linha de configuracoes.
    expect(deveAbrirPrimeiroUso({ concluidoEm: undefined, temCadastro: false })).toBe(true);
  });

  it("já tem cadastro (mesmo arquivado): não abre", () => {
    expect(deveAbrirPrimeiroUso({ concluidoEm: null, temCadastro: true })).toBe(false);
  });

  it("já concluído ou pulado: não abre, mesmo sem cadastros", () => {
    expect(deveAbrirPrimeiroUso({ concluidoEm: "2026-11-02T12:00:00+00:00", temCadastro: false })).toBe(false);
    expect(deveAbrirPrimeiroUso({ concluidoEm: "2026-11-02T12:00:00+00:00", temCadastro: true })).toBe(false);
  });
});
