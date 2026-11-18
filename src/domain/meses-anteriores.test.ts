import { describe, expect, it } from "vitest";
import { valorDaDiferenca, type LancamentoParaConferir } from "./conferencia";
import {
  MESES_VISIVEIS_NA_TABELA,
  montarMesesAnteriores,
  residuoDaFatura,
  type FaturaDaTabela,
} from "./meses-anteriores";
import { rotuloContinuidade, rotuloSeloConferencia, rotuloVerOutrosMeses } from "./mensagens";

// Meses anteriores da Fatura (História 6.8, FR-30): a matriz do spec. Outubro/2026 é o caso do aceite:
// R$ 7.483,11 − R$ 7.457,21 = R$ 25,90, com despesas R$ 8.327,39 e créditos R$ 639,62 (Conferência batendo).

function fatura(id: string, mes: string, extra: Partial<FaturaDaTabela> = {}): FaturaDaTabela {
  return {
    id,
    mes,
    total_despesas_centavos: 0,
    total_creditos_centavos: 0,
    saldo_anterior_centavos: null,
    pagamentos_centavos: null,
    total_a_pagar_centavos: null,
    alerta_dispensado_em: null,
    ...extra,
  };
}

function lanc(faturaId: string | null, valor: number, extra: Partial<LancamentoParaConferir> = {}): LancamentoParaConferir {
  return { fatura_id: faturaId, valor_centavos: valor, final_cartao: null, excluido_em: null, dividido_de_id: null, ...extra };
}

const OUT = fatura("f-out", "2026-10", {
  total_despesas_centavos: 832_739,
  total_creditos_centavos: 63_962,
  saldo_anterior_centavos: 748_311,
  pagamentos_centavos: 745_721,
  total_a_pagar_centavos: 771_367,
});
const SET = fatura("f-set", "2026-09", {
  total_despesas_centavos: 100_000,
  total_creditos_centavos: 0,
  saldo_anterior_centavos: 780_712,
  pagamentos_centavos: 780_712,
  total_a_pagar_centavos: 748_311,
});
const LANCAMENTOS = [lanc("f-out", 832_739), lanc("f-out", -63_962), lanc("f-set", 100_000)];

describe("residuoDaFatura", () => {
  it("é o saldo anterior menos o pagamento", () => {
    expect(residuoDaFatura(748_311, 745_721)).toBe(2_590);
    expect(residuoDaFatura(780_712, 780_712)).toBe(0);
  });
  it("pagou a mais: negativo, com o sinal", () => {
    expect(residuoDaFatura(10_000, 12_000)).toBe(-2_000);
  });
  it("valor não lido: nulo, nunca zero", () => {
    expect(residuoDaFatura(null, 745_721)).toBeNull();
    expect(residuoDaFatura(748_311, null)).toBeNull();
    expect(residuoDaFatura(null, null)).toBeNull();
  });
});

describe("montarMesesAnteriores", () => {
  it("outubro/2026 mostra o resíduo de R$ 25,90 e setembro R$ 0,00, do mais novo para o mais antigo", () => {
    const linhas = montarMesesAnteriores([SET, OUT], [], LANCAMENTOS);
    expect(linhas.map((l) => l.mes)).toEqual(["2026-10", "2026-09"]);
    expect(linhas[0]).toMatchObject({
      faturaId: "f-out",
      saldoAnteriorCentavos: 748_311,
      pagamentoCentavos: 745_721,
      residuoCentavos: 2_590,
    });
    expect(linhas[1]).toMatchObject({ saldoAnteriorCentavos: 780_712, pagamentoCentavos: 780_712, residuoCentavos: 0 });
  });

  it("a ordem de entrada não importa e a entrada não é alterada", () => {
    const entrada = [SET, OUT];
    const copia = [...entrada];
    expect(montarMesesAnteriores(entrada, [], LANCAMENTOS).map((l) => l.mes)).toEqual(["2026-10", "2026-09"]);
    expect(entrada).toEqual(copia);
    expect(montarMesesAnteriores([OUT, SET], [], LANCAMENTOS).map((l) => l.mes)).toEqual(["2026-10", "2026-09"]);
  });

  it("sem nenhuma Fatura: nenhuma linha (Mês só com previstos ou histórico da planilha fica fora)", () => {
    expect(montarMesesAnteriores([], [], LANCAMENTOS)).toEqual([]);
    // Lançamentos de um Mês sem Fatura não criam linha.
    const soPrevistos = [lanc(null, 5_000)];
    expect(montarMesesAnteriores([OUT], [], soPrevistos)).toHaveLength(1);
  });

  describe("o selo de Conferência (o `conferir` do Épico 2)", () => {
    it("bate: '✓ Conferido'", () => {
      const [out] = montarMesesAnteriores([OUT], [], LANCAMENTOS);
      expect(valorDaDiferenca(out!.conferencia)).toBeNull();
      expect(rotuloSeloConferencia(out!.conferencia)).toBe("✓ Conferido");
      expect(out!.alertaDispensado).toBe(false);
    });

    it("não bate: '⚠ Diferença de R$ X' (despesas gravadas R$ 0,08 abaixo do lido)", () => {
      const [out] = montarMesesAnteriores([OUT], [], [lanc("f-out", 832_731), lanc("f-out", -63_962)]);
      expect(valorDaDiferenca(out!.conferencia)).toBe(8);
      expect(rotuloSeloConferencia(out!.conferencia)).toBe("⚠ Diferença de R$ 0,08");
    });

    it("alerta dispensado: o selo continua dizendo a diferença e a linha avisa que foi dispensado", () => {
      const dispensada = { ...OUT, alerta_dispensado_em: "2026-11-02T10:00:00.000000+00:00" };
      const [out] = montarMesesAnteriores([dispensada], [], [lanc("f-out", 832_731), lanc("f-out", -63_962)]);
      expect(rotuloSeloConferencia(out!.conferencia)).toBe("⚠ Diferença de R$ 0,08");
      expect(out!.alertaDispensado).toBe(true);
    });

    it("cada Fatura confere só os Lançamentos dela; excluídos e filhas de Divisão não entram", () => {
      const linhas = montarMesesAnteriores([OUT, SET], [], [
        ...LANCAMENTOS,
        lanc("f-out", 99_999, { excluido_em: "2026-11-02T10:00:00.000000+00:00" }),
        lanc("f-out", 400_000, { dividido_de_id: "mae" }),
        lanc(null, 7_777),
      ]);
      expect(valorDaDiferenca(linhas[0]!.conferencia)).toBeNull();
      expect(valorDaDiferenca(linhas[1]!.conferencia)).toBeNull();
    });

    it("o cartão lido de uma Fatura não vaza para a outra", () => {
      const cartoes = [{ fatura_id: "f-set", final: "1234", total_centavos: 50_000 }];
      const [out, set] = montarMesesAnteriores([OUT, SET], cartoes, LANCAMENTOS);
      expect(valorDaDiferenca(out!.conferencia)).toBeNull();
      // Setembro lê R$ 500,00 no cartão 1234 e não tem lançamento com esse final: diferença de cartão.
      expect(set!.conferencia.cartoesComDiferenca).toEqual(["1234"]);
      expect(valorDaDiferenca(set!.conferencia)).toBe(50_000);
    });
  });

  describe("valores que a Fatura não trouxe", () => {
    it("sem saldo anterior: resíduo nulo, o selo segue (saldo e pagamento não entram na Conferência)", () => {
      const [out] = montarMesesAnteriores([{ ...OUT, saldo_anterior_centavos: null }], [], LANCAMENTOS);
      expect(out).toMatchObject({ saldoAnteriorCentavos: null, pagamentoCentavos: 745_721, residuoCentavos: null });
      expect(rotuloSeloConferencia(out!.conferencia)).toBe("✓ Conferido");
    });
    it("sem pagamento: resíduo nulo", () => {
      const [out] = montarMesesAnteriores([{ ...OUT, pagamentos_centavos: null }], [], LANCAMENTOS);
      expect(out).toMatchObject({ saldoAnteriorCentavos: 748_311, pagamentoCentavos: null, residuoCentavos: null });
    });
    it("pagamento R$ 0,00 lido é um valor, não ausência: o resíduo é o saldo inteiro", () => {
      const [out] = montarMesesAnteriores([{ ...OUT, pagamentos_centavos: 0 }], [], LANCAMENTOS);
      expect(out!.residuoCentavos).toBe(748_311);
    });
  });

  describe("continuidade: o saldo anterior é o total a pagar do Mês anterior", () => {
    const NOV = fatura("f-nov", "2026-11", {
      saldo_anterior_centavos: 771_367,
      pagamentos_centavos: 771_367,
      total_a_pagar_centavos: 500_000,
    });

    it("bate (7.713,67 de outubro é o saldo anterior de novembro): sem aviso", () => {
      const linhas = montarMesesAnteriores([NOV, OUT, SET], [], LANCAMENTOS);
      expect(linhas.map((l) => l.continuidade)).toEqual([null, null, null]);
    });

    it("não bate: o aviso traz o Mês anterior e o total a pagar dele", () => {
      const torto = { ...NOV, saldo_anterior_centavos: 771_300 };
      const [nov] = montarMesesAnteriores([torto, OUT], [], LANCAMENTOS);
      expect(nov!.continuidade).toEqual({ mesAnterior: "2026-10", totalAPagarCentavos: 771_367 });
      expect(rotuloContinuidade("2026-10", 771_367)).toBe("O saldo anterior não é o total a pagar de Out/26 (R$ 7.713,67)");
    });

    it("o resíduo NÃO é a conta da continuidade: saldo anterior igual ao resíduo do Mês anterior avisa", () => {
      const comoResiduo = { ...NOV, saldo_anterior_centavos: 2_590 };
      const [nov] = montarMesesAnteriores([comoResiduo, OUT], [], LANCAMENTOS);
      expect(nov!.continuidade).not.toBeNull();
    });

    it("sem a Fatura do Mês anterior (buraco entre Meses): nada a comparar", () => {
      const dezembro = fatura("f-dez", "2026-12", { saldo_anterior_centavos: 1 });
      const [dez] = montarMesesAnteriores([dezembro, OUT], [], LANCAMENTOS);
      expect(dez!.continuidade).toBeNull();
    });

    it("total a pagar do Mês anterior ou saldo anterior não lido: nada a comparar", () => {
      const semTotal = { ...OUT, total_a_pagar_centavos: null };
      expect(montarMesesAnteriores([NOV, semTotal], [], LANCAMENTOS)[0]!.continuidade).toBeNull();
      const semSaldo = { ...NOV, saldo_anterior_centavos: null };
      expect(montarMesesAnteriores([semSaldo, OUT], [], LANCAMENTOS)[0]!.continuidade).toBeNull();
    });

    it("vira o ano: janeiro/27 olha dezembro/26", () => {
      const dez = fatura("f-dez", "2026-12", { total_a_pagar_centavos: 100 });
      const jan = fatura("f-jan", "2027-01", { saldo_anterior_centavos: 99 });
      const [linhaJan] = montarMesesAnteriores([dez, jan], [], []);
      expect(linhaJan).toMatchObject({ mes: "2027-01", continuidade: { mesAnterior: "2026-12", totalAPagarCentavos: 100 } });
    });

    it("a primeira Fatura (sem anterior) nunca avisa", () => {
      const linhas = montarMesesAnteriores([SET], [], LANCAMENTOS);
      expect(linhas[0]!.continuidade).toBeNull();
    });
  });

  it("devolve todas as Faturas; o limite de Meses visíveis é só da tela", () => {
    const muitas = Array.from({ length: 15 }, (_, i) => fatura(`f${i}`, `2025-${String(i < 12 ? i + 1 : 12).padStart(2, "0")}`));
    // Meses repetidos não derrubam nada: uma linha por Fatura.
    expect(montarMesesAnteriores(muitas, [], [])).toHaveLength(15);
    expect(MESES_VISIVEIS_NA_TABELA).toBe(12);
  });
});

describe("rotuloVerOutrosMeses", () => {
  it("singular e plural", () => {
    expect(rotuloVerOutrosMeses(1)).toBe("Ver o outro mês");
    expect(rotuloVerOutrosMeses(3)).toBe("Ver os outros 3 meses");
  });
});
