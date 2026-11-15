import { describe, expect, it } from "vitest";
import { projetarPainel, type LancamentoParaProjetar } from "./projecoes";

const linha = (id: string, extra: Partial<LancamentoParaProjetar> = {}): LancamentoParaProjetar => ({
  id,
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: 100,
  responsavel_id: "r1",
  tipo_id: "t1",
  ...extra,
});

describe("projetarPainel", () => {
  it("guarda só o que a Fórmula olha", () => {
    expect(projetarPainel([linha("a", { valor_centavos: 250, responsavel_id: null })], "2026-10")).toEqual([
      { id: "a", valor_centavos: 250, responsavel_id: null, tipo_id: "t1" },
    ]);
  });

  it("só o Mês pedido e nada de excluído", () => {
    const linhas = [
      linha("a"),
      linha("b", { mes: "2026-11" }),
      linha("c", { excluido_em: "2026-10-20T12:00:00Z" }),
    ];
    expect(projetarPainel(linhas, "2026-10").map((l) => l.id)).toEqual(["a"]);
    expect(projetarPainel(linhas, "2026-11").map((l) => l.id)).toEqual(["b"]);
  });

  it("a mãe dividida não entra; as filhas entram", () => {
    const linhas = [
      linha("mae", { responsavel_id: null, valor_centavos: 46600, divisao: { modo: "proporcao", partes: [] } }),
      linha("f1", { dividido_de_id: "mae", valor_centavos: 31067 }),
      linha("f2", { dividido_de_id: "mae", valor_centavos: 15533 }),
    ];
    expect(projetarPainel(linhas, "2026-10").map((l) => l.id)).toEqual(["f1", "f2"]);
  });

  it("a filha excluída sai e a mãe excluída também (a exclusão leva as filhas)", () => {
    const linhas = [
      linha("mae", { divisao: {}, excluido_em: "2026-10-20T12:00:00Z" }),
      linha("f1", { dividido_de_id: "mae", excluido_em: "2026-10-20T12:00:00Z" }),
      linha("f2", { dividido_de_id: "mae2" }),
    ];
    expect(projetarPainel(linhas, "2026-10").map((l) => l.id)).toEqual(["f2"]);
  });

  it("inclui previstos, Ajustes e Contas manuais (são linhas do Mês)", () => {
    const linhas = [linha("previsto"), linha("ajuste", { valor_centavos: -8 }), linha("manual")];
    expect(projetarPainel(linhas, "2026-10")).toHaveLength(3);
  });

  it("não muda a lista recebida", () => {
    const linhas = [linha("a"), linha("b")];
    const copia = structuredClone(linhas);
    projetarPainel(linhas, "2026-10");
    expect(linhas).toEqual(copia);
  });
});
