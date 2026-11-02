import { describe, expect, it } from "vitest";
import {
  configVigente,
  diaNoMes,
  diasNoMes,
  ehData,
  fechamentoDoMes,
  formatarData,
  formatarMes,
  hojeEmSaoPaulo,
  mesDoLancamento,
  planejarMudancaCiclo,
  resumoDoCiclo,
  somarMeses,
  validarDia,
  vencimentoDoMes,
  vigenteDesdeDaMudanca,
  type ConfigCiclo,
} from "./ciclo";

const cfg = (
  dia_fechamento: number,
  dia_vencimento: number,
  vigente_desde: string,
  created_at = "2026-11-02T12:00:00Z",
): ConfigCiclo => ({ dia_fechamento, dia_vencimento, vigente_desde, created_at });

const mes = (data: string, configs: ConfigCiclo[]) => {
  const r = mesDoLancamento(data, configs);
  if (!r.ok) throw new Error(r.erro.codigo);
  return r.valor;
};

describe("datas e meses", () => {
  it("somarMeses atravessa o ano nos dois sentidos", () => {
    expect(somarMeses("2026-11", 1)).toBe("2026-12");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2027-01", -1)).toBe("2026-12");
    expect(somarMeses("2026-11", -23)).toBe("2024-12");
    expect(somarMeses("2026-11", 0)).toBe("2026-11");
    expect(() => somarMeses("2026-13", 1)).toThrow();
  });

  it("dias no mês, com fevereiro bissexto", () => {
    expect(diasNoMes("2027-02")).toBe(28);
    expect(diasNoMes("2028-02")).toBe(29);
    expect(diasNoMes("2100-02")).toBe(28);
    expect(diasNoMes("2000-02")).toBe(29);
    expect(diasNoMes("2026-11")).toBe(30);
    expect(diasNoMes("2026-12")).toBe(31);
  });

  it("dia que não existe vira o último dia do mês", () => {
    expect(diaNoMes("2027-02", 31)).toBe("2027-02-28");
    expect(diaNoMes("2028-02", 30)).toBe("2028-02-29");
    expect(diaNoMes("2026-11", 31)).toBe("2026-11-30");
    expect(diaNoMes("2026-12", 6)).toBe("2026-12-06");
  });

  it("formata Mês e data", () => {
    expect(formatarMes("2026-10")).toBe("Out/26");
    expect(formatarMes("2027-01")).toBe("Jan/27");
    expect(formatarMes("2026-02")).toBe("Fev/26");
    expect(formatarData("2026-11-02")).toBe("02/11/26");
  });

  it("ehData confere o calendário", () => {
    expect(ehData("2026-11-30")).toBe(true);
    expect(ehData("2026-11-31")).toBe(false);
    expect(ehData("2027-02-29")).toBe(false);
    expect(ehData("2028-02-29")).toBe(true);
    expect(ehData("02/11/26")).toBe(false);
  });
});

describe("hojeEmSaoPaulo", () => {
  it("usa o fuso de São Paulo, não o UTC", () => {
    // 02:30 UTC de 03/11 ainda é 02/11 em São Paulo (UTC−3).
    expect(hojeEmSaoPaulo(new Date("2026-11-03T02:30:00Z"))).toBe("2026-11-02");
    expect(hojeEmSaoPaulo(new Date("2026-11-03T03:00:00Z"))).toBe("2026-11-03");
    expect(hojeEmSaoPaulo(new Date("2027-01-01T02:59:59Z"))).toBe("2026-12-31");
  });
});

describe("configVigente", () => {
  const configs = [
    cfg(28, 6, "2026-11", "2026-10-20T10:00:00Z"),
    cfg(5, 15, "2027-01", "2026-11-02T10:00:00Z"),
    cfg(10, 20, "2027-01", "2026-11-02T11:00:00Z"),
  ];

  it("vale a de maior vigente_desde ≤ Mês; no empate, a mais nova", () => {
    expect(configVigente("2026-11", configs)).toBe(configs[0]);
    expect(configVigente("2026-12", configs)).toBe(configs[0]);
    expect(configVigente("2027-01", configs)).toBe(configs[2]);
    expect(configVigente("2028-06", configs)).toBe(configs[2]);
  });

  it("antes da primeira vale a primeira; sem nenhuma, undefined", () => {
    expect(configVigente("2020-01", configs)).toBe(configs[0]);
    expect(configVigente("2026-11", [])).toBeUndefined();
  });

  it("não depende da ordem da lista", () => {
    expect(configVigente("2027-03", [...configs].reverse())).toBe(configs[2]);
  });
});

describe("fechamentoDoMes", () => {
  it("V ≤ F fecha no mês anterior; V > F fecha no próprio Mês", () => {
    expect(fechamentoDoMes("2026-12", { dia_fechamento: 28, dia_vencimento: 6 })).toBe("2026-11-28");
    expect(fechamentoDoMes("2026-12", { dia_fechamento: 1, dia_vencimento: 10 })).toBe("2026-12-01");
    expect(fechamentoDoMes("2027-01", { dia_fechamento: 28, dia_vencimento: 6 })).toBe("2026-12-28");
    expect(fechamentoDoMes("2027-03", { dia_fechamento: 31, dia_vencimento: 10 })).toBe("2027-02-28");
    expect(fechamentoDoMes("2026-12", { dia_fechamento: 10, dia_vencimento: 10 })).toBe("2026-11-10");
  });
});

describe("mesDoLancamento (matriz da História 1.7)", () => {
  const padrao = [cfg(28, 6, "2026-11")];

  it("depois do fechamento vai para o Mês seguinte", () => {
    expect(mes("2026-10-29", padrao)).toBe("2026-12");
  });

  it("no dia do fechamento fica no Mês", () => {
    expect(mes("2026-10-28", padrao)).toBe("2026-11");
  });

  it("vira o ano", () => {
    expect(mes("2026-11-30", padrao)).toBe("2027-01");
    expect(vencimentoDoMes("2027-01", padrao)).toEqual({ ok: true, valor: "2027-01-06" });
  });

  it("V > F", () => {
    const c = [cfg(1, 10, "2026-11")];
    expect(mes("2026-11-02", c)).toBe("2026-12");
    expect(vencimentoDoMes("2026-12", c)).toEqual({ ok: true, valor: "2026-12-10" });
    expect(mes("2026-11-01", c)).toBe("2026-11");
  });

  it("dia inexistente vira o último dia", () => {
    expect(mes("2027-02-28", [cfg(31, 10, "2026-11")])).toBe("2027-03");
    expect(mes("2027-03-01", [cfg(31, 10, "2026-11")])).toBe("2027-04");
  });

  it("mudança de fechamento não muda as datas do Ciclo antigo", () => {
    const configs = [cfg(28, 6, "2026-11"), cfg(5, 15, "2027-01")];
    expect(mes("2026-11-28", configs)).toBe("2026-12");
    expect(mes("2026-10-29", configs)).toBe("2026-12");
    expect(mes("2026-11-29", configs)).toBe("2027-01");
    expect(mes("2027-01-05", configs)).toBe("2027-01");
    expect(mes("2027-01-06", configs)).toBe("2027-02");
  });

  it("Ciclo mais curto, sem caso especial", () => {
    // Fechava no dia 5 do próprio Mês; passa a fechar no dia 28 do anterior.
    const configs = [cfg(5, 15, "2026-11"), cfg(28, 6, "2027-01")];
    expect(mes("2026-12-05", configs)).toBe("2026-12");
    expect(mes("2026-12-06", configs)).toBe("2027-01");
    expect(mes("2026-12-28", configs)).toBe("2027-01");
    expect(mes("2026-12-29", configs)).toBe("2027-02");
  });

  it("antes da primeira configuração, vale a primeira", () => {
    expect(mes("2025-03-10", padrao)).toBe("2025-04");
  });

  it("sem configuração ou com data inválida, erro", () => {
    expect(mesDoLancamento("2026-11-02", [])).toEqual({
      ok: false,
      erro: { codigo: "ciclo.sem_configuracao" },
    });
    expect(mesDoLancamento("2026-11-31", padrao)).toEqual({
      ok: false,
      erro: { codigo: "ciclo.data_invalida" },
    });
  });
});

describe("vencimentoDoMes", () => {
  it("usa o vencimento da configuração vigente no Mês", () => {
    const configs = [cfg(28, 6, "2026-11"), cfg(5, 31, "2027-01")];
    expect(vencimentoDoMes("2026-12", configs)).toEqual({ ok: true, valor: "2026-12-06" });
    expect(vencimentoDoMes("2027-02", configs)).toEqual({ ok: true, valor: "2027-02-28" });
  });

  it("sem configuração ou Mês inválido, erro", () => {
    expect(vencimentoDoMes("2026-12", [])).toEqual({ ok: false, erro: { codigo: "ciclo.sem_configuracao" } });
    expect(vencimentoDoMes("2026-13", [cfg(1, 2, "2026-11")])).toEqual({
      ok: false,
      erro: { codigo: "ciclo.mes_invalido" },
    });
  });
});

describe("vigenteDesdeDaMudanca", () => {
  it("primeira gravação vale já para o Mês de hoje", () => {
    expect(vigenteDesdeDaMudanca("2026-11-02", [], { dia_fechamento: 28, dia_vencimento: 6 })).toEqual({
      ok: true,
      valor: "2026-12",
    });
    expect(vigenteDesdeDaMudanca("2026-11-02", [], { dia_fechamento: 5, dia_vencimento: 15 })).toEqual({
      ok: true,
      valor: "2026-11",
    });
  });

  it("as mudanças seguintes esperam o próximo Ciclo", () => {
    const configs = [cfg(28, 6, "2026-12")];
    expect(vigenteDesdeDaMudanca("2026-11-02", configs, { dia_fechamento: 5, dia_vencimento: 15 })).toEqual({
      ok: true,
      valor: "2027-01",
    });
    expect(vigenteDesdeDaMudanca("2026-11-29", configs, { dia_fechamento: 5, dia_vencimento: 15 })).toEqual({
      ok: true,
      valor: "2027-02",
    });
  });
});

describe("planejarMudancaCiclo", () => {
  it("primeira gravação: linha com o Mês de hoje", () => {
    expect(planejarMudancaCiclo("2026-11-02", [], { dia_fechamento: 28, dia_vencimento: 6 })).toEqual({
      ok: true,
      valor: { dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-12" },
    });
  });

  it("mudar de novo antes de valer: outra linha com o mesmo vigente_desde", () => {
    const configs = [
      cfg(28, 6, "2026-12", "2026-11-01T10:00:00Z"),
      cfg(5, 15, "2027-01", "2026-11-02T10:00:00Z"),
    ];
    const r = planejarMudancaCiclo("2026-11-02", configs, { dia_fechamento: 10, dia_vencimento: 20 });
    expect(r).toEqual({ ok: true, valor: { dia_fechamento: 10, dia_vencimento: 20, vigente_desde: "2027-01" } });
    // Inserida, passa a valer no lugar da anterior.
    const depois = [...configs, cfg(10, 20, "2027-01", "2026-11-02T11:00:00Z")];
    expect(configVigente("2027-01", depois)).toMatchObject({ dia_fechamento: 10, dia_vencimento: 20 });
    // Voltar aos dias de hoje também grava (desfaz a mudança futura).
    expect(planejarMudancaCiclo("2026-11-02", depois, { dia_fechamento: 28, dia_vencimento: 6 })).toEqual({
      ok: true,
      valor: { dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2027-01" },
    });
  });

  it("valores iguais aos que já valeriam naquele Mês não gravam", () => {
    const configs = [cfg(28, 6, "2026-12")];
    expect(planejarMudancaCiclo("2026-11-02", configs, { dia_fechamento: 28, dia_vencimento: 6 })).toEqual({
      ok: true,
      valor: null,
    });
  });

  it("dia fora de 1 a 31 é recusado", () => {
    for (const nova of [
      { dia_fechamento: 0, dia_vencimento: 6 },
      { dia_fechamento: 28, dia_vencimento: 32 },
      { dia_fechamento: 2.5, dia_vencimento: 6 },
    ]) {
      expect(planejarMudancaCiclo("2026-11-02", [], nova)).toEqual({
        ok: false,
        erro: { codigo: "ciclo.dia_invalido" },
      });
    }
  });
});

describe("validarDia", () => {
  it("aceita de 1 a 31", () => {
    expect(validarDia("1")).toEqual({ ok: true, valor: 1 });
    expect(validarDia(" 31 ")).toEqual({ ok: true, valor: 31 });
    expect(validarDia("06")).toEqual({ ok: true, valor: 6 });
  });

  it("recusa vazio, zero, acima de 31 e não inteiro", () => {
    for (const texto of ["", "0", "32", "2,5", "-1", "abc", "100"]) {
      expect(validarDia(texto)).toEqual({ ok: false, erro: { codigo: "ciclo.dia_invalido" } });
    }
  });
});

describe("resumoDoCiclo", () => {
  it("mostra a configuração de hoje e a mudança já salva", () => {
    const configs = [cfg(28, 6, "2026-12"), cfg(5, 15, "2027-01")];
    expect(resumoDoCiclo("2026-11-02", configs)).toEqual({
      atual: { mes: "2026-12", config: configs[0] },
      proxima: { mes: "2027-01", config: configs[1] },
    });
  });

  it("sem mudança futura, só a de hoje; sem nada, nenhuma", () => {
    const configs = [cfg(28, 6, "2026-12")];
    expect(resumoDoCiclo("2026-11-02", configs)).toEqual({
      atual: { mes: "2026-12", config: configs[0] },
      proxima: null,
    });
    expect(resumoDoCiclo("2026-11-02", [])).toEqual({ atual: null, proxima: null });
  });

  it("a mudança que já começou passa a ser a de hoje", () => {
    const configs = [cfg(28, 6, "2026-12"), cfg(5, 15, "2027-01")];
    expect(resumoDoCiclo("2026-12-10", configs)).toEqual({
      atual: { mes: "2027-01", config: configs[1] },
      proxima: null,
    });
  });
});
