import { afterEach, describe, expect, it, vi } from "vitest";
import { linhaDeLog, log, type OpcoesLog } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("escreve uma linha JSON com evento, código e campos permitidos", () => {
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    log("importacao.concluida", {
      codigo: "ok",
      campos: { rota: "/api/importar", quantidade: 42, duracao_ms: 1200 },
    });
    expect(espiao).toHaveBeenCalledTimes(1);
    const linha = espiao.mock.calls[0][0] as string;
    expect(linha).not.toContain("\n");
    expect(JSON.parse(linha)).toEqual({
      nivel: "info",
      evento: "importacao.concluida",
      codigo: "ok",
      rota: "/api/importar",
      quantidade: 42,
      duracao_ms: 1200,
    });
  });

  it("descarta valor_centavos, descricao e nome", () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    log("lancamento.falhou", {
      nivel: "error",
      codigo: "gravacao_recusada",
      // Campos proibidos não compilam; o cast simula um chamador que ignora os tipos.
      campos: {
        valor_centavos: 114074,
        descricao: "UBER *TRIP SAO PAULO",
        nome: "Maria",
        tabela: "lancamentos",
      } as unknown as OpcoesLog["campos"],
    });
    const linha = espiao.mock.calls[0][0] as string;
    const registro = JSON.parse(linha);
    expect(registro).not.toHaveProperty("valor_centavos");
    expect(registro).not.toHaveProperty("descricao");
    expect(registro).not.toHaveProperty("nome");
    expect(linha).not.toContain("114074");
    expect(linha).not.toContain("UBER");
    expect(linha).not.toContain("Maria");
    expect(registro.tabela).toBe("lancamentos");
  });

  it("não aceita texto livre em evento ou código", () => {
    const registro = JSON.parse(
      linhaDeLog("Compra de R$ 10,00 na PADARIA", { codigo: "x y" }),
    );
    expect(registro.evento).toBe("invalido");
    expect(registro.codigo).toBe("invalido");
  });

  it("descarta valores que não são número, booleano ou texto", () => {
    // Simula um chamador que ignora os tipos (ex.: dados vindos de fora).
    const campos = {
      quantidade: { valor_centavos: 1 },
      tentativa: Number.NaN,
    } as unknown as OpcoesLog["campos"];
    const registro = JSON.parse(linhaDeLog("teste", { campos }));
    expect(registro).not.toHaveProperty("quantidade");
    expect(registro).not.toHaveProperty("tentativa");
  });

  it("usa console.warn para nível warn", () => {
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});
    log("conexao.lenta", { nivel: "warn" });
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(JSON.parse(espiao.mock.calls[0][0] as string).nivel).toBe("warn");
  });

  it("volta para info quando o nível é inválido", () => {
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    log("teste", { nivel: "debug" as unknown as OpcoesLog["nivel"] });
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(JSON.parse(espiao.mock.calls[0][0] as string).nivel).toBe("info");
  });

  it("descarta texto com query string ou espaços", () => {
    const registro = JSON.parse(
      linhaDeLog("teste", {
        campos: {
          rota: "/x?nome=Maria",
          tabela: "lancamentos da Maria",
          request_id: "a%20b",
          metodo: "GET",
        },
      }),
    );
    expect(registro).not.toHaveProperty("rota");
    expect(registro).not.toHaveProperty("tabela");
    expect(registro).not.toHaveProperty("request_id");
    expect(registro.metodo).toBe("GET");
  });

  it("aceita texto seguro de até 120 caracteres e descarta o mais longo", () => {
    const limite = "a".repeat(120);
    const longo = "a".repeat(121);
    const registro = JSON.parse(
      linhaDeLog("teste", { campos: { request_id: limite, rota: longo } }),
    );
    expect(registro.request_id).toBe(limite);
    expect(registro).not.toHaveProperty("rota");
  });
});
