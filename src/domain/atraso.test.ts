import { describe, expect, it } from "vitest";
import {
  atrasosDasLinhas,
  estaAtrasado,
  podeAtrasar,
  primeiroDiaDeAtraso,
  vencimentoDoLancamento,
  type ContextoDeAtraso,
  type LancamentoParaAtraso,
} from "./atraso";
import type { ConfigCiclo } from "./ciclo";
import { hojeEmSaoPaulo } from "./datas";
import { projetarMensagem, type LancamentoParaMensagem } from "./projecoes";

const PAGO = "st-pago";
const NAO_PAGO = "st-nao-pago";

function config(dia_vencimento: number, vigente_desde: string, dia_fechamento = 28): ConfigCiclo {
  return { dia_fechamento, dia_vencimento, vigente_desde, created_at: `${vigente_desde}-01T00:00:00Z` };
}

/** Fechamento 28, vencimento 6 desde Jan/26. */
const CICLO = [config(6, "2026-01")];

const ctx = (extra: Partial<ContextoDeAtraso> = {}): ContextoDeAtraso => ({
  statusPagos: new Set([PAGO]),
  configsCiclo: CICLO,
  ...extra,
});

function lanc(extra: Partial<LancamentoParaAtraso> = {}): LancamentoParaAtraso {
  return {
    id: "l1",
    mes: "2026-11",
    valor_centavos: 21_516,
    status_id: NAO_PAGO,
    excluido_em: null,
    lancado_por: "fatura",
    ...extra,
  };
}

const atrasado = (hoje: string, tolerancia = 10, l = lanc(), c = ctx()) => estaAtrasado(l, hoje, tolerancia, c);

describe("o dia exato do limite (vencimento 06/11/26, tolerância 10)", () => {
  it("o dia do vencimento e todo o período da tolerância ainda estão em dia", () => {
    expect(atrasado("2026-11-05")).toBe(false);
    expect(atrasado("2026-11-06")).toBe(false);
    expect(atrasado("2026-11-07")).toBe(false);
    expect(atrasado("2026-11-15")).toBe(false);
  });

  it("vencimento + tolerância (16/11/26) ainda NÃO é atraso", () => {
    expect(atrasado("2026-11-16")).toBe(false);
  });

  it("vencimento + tolerância + 1 (17/11/26) já é atraso, e segue sendo", () => {
    expect(atrasado("2026-11-17")).toBe(true);
    expect(atrasado("2026-11-18")).toBe(true);
    expect(atrasado("2027-03-01")).toBe(true);
  });

  it("o primeiro dia de atraso é vencimento + tolerância + 1", () => {
    expect(primeiroDiaDeAtraso(lanc(), 10, ctx())).toBe("2026-11-17");
    expect(primeiroDiaDeAtraso(lanc(), 0, ctx())).toBe("2026-11-07");
  });
});

describe("tolerância 0 e 60", () => {
  it("tolerância 0: o dia do vencimento está em dia e o dia seguinte já é atraso", () => {
    expect(atrasado("2026-11-06", 0)).toBe(false);
    expect(atrasado("2026-11-07", 0)).toBe(true);
  });

  it("tolerância 60: atravessa o fim do ano (06/11/26 + 60 = 05/01/27)", () => {
    expect(atrasado("2026-12-31", 60)).toBe(false);
    expect(atrasado("2027-01-05", 60)).toBe(false);
    expect(atrasado("2027-01-06", 60)).toBe(true);
  });
});

describe("virada de mês e de ano", () => {
  it("virada de mês: vencimento 28/02/27 (dia 28), tolerância 10 → em dia até 10/03/27", () => {
    const c = ctx({ configsCiclo: [config(28, "2026-01", 20)] });
    const l = lanc({ mes: "2027-02" });
    expect(atrasado("2027-03-10", 10, l, c)).toBe(false);
    expect(atrasado("2027-03-11", 10, l, c)).toBe(true);
  });

  it("dia de vencimento que não existe no mês vira o último dia (31 em fevereiro de 2028, bissexto)", () => {
    const c = ctx({ configsCiclo: [config(31, "2026-01", 20)] });
    const l = lanc({ mes: "2028-02" });
    expect(vencimentoDoLancamento(l, c)).toBe("2028-02-29");
    expect(atrasado("2028-03-10", 10, l, c)).toBe(false);
    expect(atrasado("2028-03-11", 10, l, c)).toBe(true);
  });

  it("virada de ano: vencimento 28/12/26, tolerância 10 → em dia até 07/01/27", () => {
    const c = ctx({ configsCiclo: [config(28, "2026-01", 20)] });
    const l = lanc({ mes: "2026-12" });
    expect(atrasado("2027-01-07", 10, l, c)).toBe(false);
    expect(atrasado("2027-01-08", 10, l, c)).toBe(true);
  });
});

describe("hoje em America/Sao_Paulo, perto da meia-noite UTC", () => {
  // 03:00 UTC = 00:00 em São Paulo (UTC-3, sem horário de verão desde 2019).
  it("02:59:59 UTC do dia 17 ainda é dia 16 em São Paulo: no limite, ainda em dia", () => {
    const hoje = hojeEmSaoPaulo(new Date("2026-11-17T02:59:59Z"));
    expect(hoje).toBe("2026-11-16");
    expect(atrasado(hoje)).toBe(false);
  });

  it("03:00:00 UTC do dia 17 já é dia 17 em São Paulo: primeiro dia de atraso", () => {
    const hoje = hojeEmSaoPaulo(new Date("2026-11-17T03:00:00Z"));
    expect(hoje).toBe("2026-11-17");
    expect(atrasado(hoje)).toBe(true);
  });

  it("21:00 em São Paulo (00:00 UTC do dia seguinte) ainda é o mesmo dia", () => {
    expect(atrasado(hojeEmSaoPaulo(new Date("2026-11-17T00:00:00Z")))).toBe(false); // 16/11, 21:00
  });

  it("na virada do ano o dia de São Paulo manda, não o do UTC", () => {
    const c = ctx({ configsCiclo: [config(28, "2026-01", 20)] });
    const l = lanc({ mes: "2026-12" });
    expect(atrasado(hojeEmSaoPaulo(new Date("2027-01-08T02:59:59Z")), 10, l, c)).toBe(false); // 07/01 em SP
    expect(atrasado(hojeEmSaoPaulo(new Date("2027-01-08T03:00:00Z")), 10, l, c)).toBe(true); // 08/01 em SP
  });
});

describe("pago, não pago e parcial", () => {
  it("só o que NÃO está pago atrasa: Status que conta como pago nunca", () => {
    expect(atrasado("2026-12-31", 10, lanc({ status_id: PAGO }))).toBe(false);
  });

  it("sem Status vale não pago (AD-10)", () => {
    expect(atrasado("2026-11-17", 10, lanc({ status_id: null }))).toBe(true);
  });

  it("qualquer Status que não conta como pago atrasa, seja qual for o nome", () => {
    expect(atrasado("2026-11-17", 10, lanc({ status_id: "st-outro" }))).toBe(true);
  });

  it("Pago parcialmente com o restante vencido ESTÁ atrasado (o que falta é o que se cobra)", () => {
    const c = ctx({ recebidoCentavos: new Map([["l1", 10_000]]) });
    expect(atrasado("2026-11-16", 10, lanc(), c)).toBe(false);
    expect(atrasado("2026-11-17", 10, lanc(), c)).toBe(true);
  });

  it("itens que já cobrem o valor todo (sem Status pago) não deixam nada a cobrar", () => {
    const c = ctx({ recebidoCentavos: new Map([["l1", 21_516]]) });
    expect(atrasado("2026-12-31", 10, lanc(), c)).toBe(false);
  });
});

describe("o que nunca atrasa", () => {
  const tarde = "2026-12-31";

  it("excluída", () => {
    expect(atrasado(tarde, 10, lanc({ excluido_em: "2026-11-10T12:00:00Z" }))).toBe(false);
  });

  it("mãe dividida (valem as partes); cada parte atrasa por conta própria", () => {
    expect(atrasado(tarde, 10, lanc({ divisao: { partes: [] } }))).toBe(false);
    expect(atrasado(tarde, 10, lanc({ dividido_de_id: "mae" }))).toBe(true);
  });

  it("Ajuste de centavos (acompanha a parcela)", () => {
    expect(atrasado(tarde, 10, lanc({ ajuste_de_id: "mae", valor_centavos: -8 }))).toBe(false);
    expect(atrasado(tarde, 10, lanc({ ajuste_de_id: "mae", valor_centavos: 8 }))).toBe(false);
  });

  it("previsto de uma Série (`sistema`)", () => {
    expect(atrasado(tarde, 10, lanc({ lancado_por: "sistema" }))).toBe(false);
  });

  it("Conta manual de um Mês sem Fatura é previsto; com a Fatura importada atrasa", () => {
    const manual = lanc({ lancado_por: "manual", conta_manual_id: "cm" });
    const semFatura = ctx({ vencimentosDasFaturas: new Map() });
    const comFatura = ctx({ vencimentosDasFaturas: new Map([["2026-11", "2026-11-06"]]) });
    expect(atrasado(tarde, 10, manual, semFatura)).toBe(false);
    expect(atrasado(tarde, 10, manual, comFatura)).toBe(true);
  });

  it("Lançamento feito à mão (sem Conta manual) num Mês sem Fatura atrasa", () => {
    const aMao = lanc({ lancado_por: "manual", conta_manual_id: null });
    expect(atrasado(tarde, 10, aMao, ctx({ vencimentosDasFaturas: new Map() }))).toBe(true);
  });

  it("valor zero e crédito (negativo): não há o que cobrar", () => {
    expect(atrasado(tarde, 10, lanc({ valor_centavos: 0 }))).toBe(false);
    expect(atrasado(tarde, 10, lanc({ valor_centavos: -5_000 }))).toBe(false);
  });

  it("podeAtrasar olha só a natureza da linha, não o Status nem a data", () => {
    expect(podeAtrasar(lanc({ status_id: PAGO }), ctx())).toBe(true);
    expect(podeAtrasar(lanc({ lancado_por: "sistema" }), ctx())).toBe(false);
  });
});

describe("o vencimento", () => {
  it("sem vencimento_combinado: o do Ciclo vigente no Mês (AD-9)", () => {
    expect(vencimentoDoLancamento(lanc(), ctx())).toBe("2026-11-06");
  });

  it("o Ciclo vigente no Mês do Lançamento, não o de hoje: a mudança não reescreve o passado", () => {
    const c = ctx({ configsCiclo: [config(6, "2026-01"), config(15, "2027-01")] });
    expect(vencimentoDoLancamento(lanc({ mes: "2026-12" }), c)).toBe("2026-12-06");
    expect(vencimentoDoLancamento(lanc({ mes: "2027-01" }), c)).toBe("2027-01-15");
    expect(vencimentoDoLancamento(lanc({ mes: "2025-06" }), c)).toBe("2025-06-06"); // antes da primeira, vale a primeira
  });

  it("com o vencimento da Fatura importada, ele manda sobre o do Ciclo", () => {
    const c = ctx({ vencimentosDasFaturas: new Map([["2026-11", "2026-11-07"]]) });
    expect(vencimentoDoLancamento(lanc(), c)).toBe("2026-11-07");
    expect(atrasado("2026-11-17", 10, lanc(), c)).toBe(false);
    expect(atrasado("2026-11-18", 10, lanc(), c)).toBe(true);
  });

  it("vencimento_combinado manda sobre a Fatura e o Ciclo (Dívida programada, 6.6)", () => {
    const c = ctx({ vencimentosDasFaturas: new Map([["2026-11", "2026-11-06"]]) });
    const l = lanc({ vencimento_combinado: "2026-11-20" });
    expect(vencimentoDoLancamento(l, c)).toBe("2026-11-20");
    expect(atrasado("2026-11-30", 10, l, c)).toBe(false);
    expect(atrasado("2026-12-01", 10, l, c)).toBe(true);
  });

  it("vencimento_combinado de outro Mês: vale a data combinada, não o Mês da Fatura", () => {
    const l = lanc({ mes: "2026-11", vencimento_combinado: "2027-04-06" });
    expect(atrasado("2027-04-16", 10, l)).toBe(false);
    expect(atrasado("2027-04-17", 10, l)).toBe(true);
  });

  it("vencimento_combinado ausente ou nulo: volta ao vencimento do Ciclo (o campo ainda não existe no banco)", () => {
    expect(atrasado("2026-11-17", 10, lanc({ vencimento_combinado: null }))).toBe(true);
    expect(atrasado("2026-11-17", 10, lanc())).toBe(true);
    expect(atrasado("2026-11-16", 10, lanc({ vencimento_combinado: null }))).toBe(false);
  });

  it("sem como saber o vencimento, não atrasa e nada quebra", () => {
    expect(atrasado("2027-12-31", 10, lanc(), ctx({ configsCiclo: [] }))).toBe(false);
    expect(vencimentoDoLancamento(lanc({ mes: "2026-13" }), ctx())).toBeNull();
    expect(atrasado("2027-12-31", 10, lanc({ mes: "2026-13" }))).toBe(false);
    expect(atrasado("2027-12-31", 10, lanc({ vencimento_combinado: "2026-02-31" }))).toBe(false);
    expect(atrasado("2027-12-31", 10, lanc(), ctx({ vencimentosDasFaturas: new Map([["2026-11", "lixo"]]) }))).toBe(false);
  });
});

describe("entradas inválidas não quebram", () => {
  it("tolerância negativa, quebrada ou NaN: não atrasa", () => {
    expect(atrasado("2027-12-31", -1)).toBe(false);
    expect(atrasado("2027-12-31", 1.5)).toBe(false);
    expect(atrasado("2027-12-31", Number.NaN)).toBe(false);
  });

  it("hoje fora do formato: não atrasa", () => {
    expect(atrasado("17/11/26")).toBe(false);
    expect(atrasado("")).toBe(false);
  });
});

describe("atrasosDasLinhas", () => {
  it("devolve só os atrasados e o primeiro dia de atraso de cada um", () => {
    const linhas = [
      lanc({ id: "a" }),
      lanc({ id: "b", status_id: PAGO }),
      lanc({ id: "c", mes: "2026-12" }), // vence 06/12: ainda em dia
      lanc({ id: "d", lancado_por: "sistema" }),
      lanc({ id: "e", status_id: null }),
    ];
    const r = atrasosDasLinhas(linhas, "2026-11-17", 10, ctx());
    expect([...r]).toEqual([
      ["a", "2026-11-17"],
      ["e", "2026-11-17"],
    ]);
  });

  it("hoje inválido: ninguém atrasa", () => {
    expect(atrasosDasLinhas([lanc()], "", 10, ctx()).size).toBe(0);
  });
});

describe("a mensagem de cobrança não muda com o atraso (AD-10, UX: 'Não pago', 'Atrasado' e parcial entram)", () => {
  const msg = (id: string, extra: Partial<LancamentoParaMensagem> = {}): LancamentoParaMensagem => ({
    id,
    mes: "2026-11",
    excluido_em: null,
    valor_centavos: 10_000,
    responsavel_id: null,
    tipo_id: null,
    nome: `LOJA ${id}`,
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    status_id: NAO_PAGO,
    lancado_por: "fatura",
    ordem_fatura: Number(id),
    ...extra,
  });

  it("entra o que não está pago, esteja atrasado ou não: a regra olha o Status, nunca a data", () => {
    const linhas = [msg("1"), msg("2", { status_id: PAGO })];
    const opcoes = { mes: "2026-11", statusPagos: new Set([PAGO]), temFatura: true, incluirPrevistos: false, hoje: "2026-11-17" };
    const r = projetarMensagem(new Set(["1", "2"]), linhas, opcoes);
    expect(r.entram.map((i) => i.id)).toEqual(["1"]);
    expect(r.fora.porMotivo.pago).toBe(1);
    // A linha 1 está atrasada em 17/11 e em dia em 16/11, e a mensagem é a mesma nos dois dias.
    const cx = ctx();
    expect(estaAtrasado(lanc({ id: "1" }), "2026-11-17", 10, cx)).toBe(true);
    expect(estaAtrasado(lanc({ id: "1" }), "2026-11-16", 10, cx)).toBe(false);
    expect(projetarMensagem(new Set(["1", "2"]), linhas, opcoes)).toEqual(r);
  });
});
