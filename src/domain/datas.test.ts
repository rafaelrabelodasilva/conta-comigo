import { describe, expect, it } from "vitest";
import {
  dois,
  formatarData,
  formatarHora,
  formatarMes,
  formatarMesExtenso,
  hojeEmSaoPaulo,
  lerMes,
  partesMes,
} from "./datas";

describe("lerMes, partesMes e dois", () => {
  it("lê AAAA-MM e recusa o resto", () => {
    expect(lerMes("2026-10")).toEqual({ ano: 2026, mes: 10 });
    expect(lerMes("2026-13")).toBeNull();
    expect(partesMes("2026-10")).toEqual({ ano: 2026, mes: 10 });
    expect(() => partesMes("2026-13")).toThrow();
  });

  it("dois dígitos", () => {
    expect(dois(6)).toBe("06");
    expect(dois(12)).toBe("12");
  });
});

describe("formatarMes e formatarMesExtenso", () => {
  it("formata o Mês curto e por extenso", () => {
    expect(formatarMes("2026-10")).toBe("Out/26");
    expect(formatarMes("2027-01")).toBe("Jan/27");
    expect(formatarMes("2026-02")).toBe("Fev/26");
    expect(formatarMesExtenso("2026-10")).toBe("outubro/26");
    expect(formatarMesExtenso("2026-03")).toBe("março/26");
    expect(formatarMesExtenso("2030-12")).toBe("dezembro/30");
  });

  it("recusa Mês fora de AAAA-MM", () => {
    expect(() => formatarMes("2026-13")).toThrow();
    expect(() => formatarMesExtenso("10/26")).toThrow();
  });
});

describe("formatarData", () => {
  it("DD/MM/AA", () => {
    expect(formatarData("2026-11-06")).toBe("06/11/26");
    expect(formatarData("2026-11-02")).toBe("02/11/26");
  });

  it("recusa o que não é AAAA-MM-DD", () => {
    expect(() => formatarData("2026-11")).toThrow();
    expect(() => formatarData("06/11/26")).toThrow();
    expect(() => formatarData("2026-11-06T10:00:00Z")).toThrow();
  });
});

describe("formatarHora", () => {
  it("HH:MM em America/Sao_Paulo", () => {
    expect(formatarHora("2026-11-07T00:14:00Z")).toBe("21:14");
    expect(formatarHora("2026-11-07T03:05:00Z")).toBe("00:05");
    expect(formatarHora("2026-11-06T15:30:00-03:00")).toBe("15:30");
  });

  it("recusa instante inválido", () => {
    expect(() => formatarHora("não é data")).toThrow();
  });

  it("recusa instante sem fuso", () => {
    expect(() => formatarHora("2026-11-07T00:14:00")).toThrow();
    expect(() => formatarHora("2026-11-07")).toThrow();
  });
});

describe("hojeEmSaoPaulo", () => {
  it("usa o fuso de São Paulo, não o UTC", () => {
    // 02:30 UTC de 03/11 ainda é 02/11 em São Paulo (UTC−3).
    expect(hojeEmSaoPaulo(new Date("2026-11-03T02:30:00Z"))).toBe("2026-11-02");
    expect(hojeEmSaoPaulo(new Date("2026-11-03T03:00:00Z"))).toBe("2026-11-03");
    expect(hojeEmSaoPaulo(new Date("2027-01-01T02:59:59Z"))).toBe("2026-12-31");
  });

  it("recusa instante inválido", () => {
    expect(() => hojeEmSaoPaulo(new Date(Number.NaN))).toThrow();
  });
});
