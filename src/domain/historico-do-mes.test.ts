import { describe, expect, it } from "vitest";
import { historicoDoMes, mesesComHistorico, type LinhaParaHistorico } from "./historico-do-mes";
import { avisoContaComHistorico, avisoImportarComHistorico } from "./mensagens";

const linha = (mes: string, extra: Partial<LinhaParaHistorico> = {}): LinhaParaHistorico => ({
  mes,
  lancado_por: "historico",
  excluido_em: null,
  dividido_de_id: null,
  ...extra,
});

describe("historicoDoMes: o Mês já tem linhas da planilha?", () => {
  it("conta só as linhas `historico` vivas do Mês", () => {
    const linhas = [
      linha("2026-03"),
      linha("2026-03"),
      linha("2026-03", { excluido_em: "2026-11-01T00:00:00Z" }),
      linha("2026-03", { lancado_por: "fatura" }),
      linha("2026-03", { lancado_por: "manual" }),
      linha("2026-04"),
    ];
    expect(historicoDoMes(linhas, "2026-03")).toBe(2);
    expect(historicoDoMes(linhas, "2026-04")).toBe(1);
    expect(historicoDoMes(linhas, "2026-05")).toBe(0);
  });

  it("a filha de uma Divisão não conta (só a mãe é um lançamento)", () => {
    expect(historicoDoMes([linha("2026-03"), linha("2026-03", { dividido_de_id: "mae" })], "2026-03")).toBe(1);
  });
});

describe("mesesComHistorico: quais Meses recebem a Conta por cima do histórico", () => {
  const linhas = [linha("2026-02"), linha("2026-01"), linha("2026-01"), linha("2026-09"), linha("2026-10", { lancado_por: "fatura" })];

  it("lista os Meses com histórico em ordem, com a quantidade", () => {
    expect(mesesComHistorico(linhas)).toEqual([
      { mes: "2026-01", quantidade: 2 },
      { mes: "2026-02", quantidade: 1 },
      { mes: "2026-09", quantidade: 1 },
    ]);
  });

  it("uma Conta que começa em fev/26 só cai de fev/26 em diante: jan/26 fica de fora", () => {
    expect(mesesComHistorico(linhas, "2026-02").map((m) => m.mes)).toEqual(["2026-02", "2026-09"]);
  });

  it("começar depois do histórico não tem nada a avisar", () => {
    expect(mesesComHistorico(linhas, "2026-10")).toEqual([]);
  });
});

describe("os avisos dizem o número e o caminho, e não prometem apagar nada", () => {
  it("importar: o número, o Mês, o caminho e que nada é apagado sozinho", () => {
    const t = avisoImportarComHistorico("2026-03", 12);
    expect(t).toContain("12 lançamentos do histórico da planilha");
    expect(t).toContain("março");
    expect(t).toContain("Apagar histórico importado");
    expect(t).toContain("Nada é apagado sozinho");
    expect(avisoImportarComHistorico("2026-03", 1)).toContain("1 lançamento do histórico");
  });

  it("Conta: lista os Meses com o número de cada um (singular e plural)", () => {
    const um = avisoContaComHistorico([{ mes: "2026-01", quantidade: 12 }]);
    expect(um).toContain("Este mês já tem histórico da planilha: Jan/26 (12 lançamentos)");
    const varios = avisoContaComHistorico([
      { mes: "2026-01", quantidade: 12 },
      { mes: "2026-02", quantidade: 1 },
    ]);
    expect(varios).toContain("Estes meses já têm histórico da planilha: Jan/26 (12 lançamentos), Fev/26 (1 lançamento)");
    expect(varios).toContain("Apagar histórico importado");
    expect(varios).toContain("Nada é apagado sozinho");
  });
});
