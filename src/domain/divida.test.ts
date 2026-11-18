import { describe, expect, it } from "vitest";
import { atrasosDasLinhas } from "./atraso";
import {
  aReceber,
  dividaAindaNaoVence,
  ehDividaProgramada,
  lerDataCombinada,
  lerObservacaoDaDivida,
  planejarDesligar,
  planejarProgramacao,
  programadaDe,
  type LancamentoParaReceber,
  type LinhaParaProgramar,
} from "./divida";

// Dívida programada (História 6.6, FR-27): a data combinada, o que "ainda não venceu", o plano de
// programar e desligar (com o "Desfazer") e a lista "A receber".

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const AGORA = "2026-11-16T15:00:00.000Z";
const CTX = { statusPagos: new Set([PAGO]), agora: AGORA };

const linha = (id: string, extra: Partial<LinhaParaProgramar> = {}): LinhaParaProgramar => ({
  id,
  status_id: NAO_PAGO,
  valor_centavos: 10_000,
  excluido_em: null,
  dividido_de_id: null,
  divisao: null,
  ajuste_de_id: null,
  vencimento_combinado: null,
  vencimento_observacao: null,
  editado_em: null,
  ...extra,
});

describe("lerDataCombinada e lerObservacaoDaDivida", () => {
  it("a data é obrigatória, válida e de 2000 a 2099", () => {
    expect(lerDataCombinada("2027-04-06")).toEqual({ ok: true, valor: "2027-04-06" });
    expect(lerDataCombinada(" 2027-04-06 ")).toEqual({ ok: true, valor: "2027-04-06" });
    expect(lerDataCombinada("")).toMatchObject({ ok: false, erro: { codigo: "divida.data_vazia" } });
    expect(lerDataCombinada("06/04/27")).toMatchObject({ ok: false, erro: { codigo: "divida.data_invalida" } });
    expect(lerDataCombinada("2027-02-30")).toMatchObject({ ok: false, erro: { codigo: "divida.data_invalida" } });
    expect(lerDataCombinada("1999-12-31")).toMatchObject({ ok: false, erro: { codigo: "divida.data_fora_do_limite" } });
    expect(lerDataCombinada("2100-01-01")).toMatchObject({ ok: false, erro: { codigo: "divida.data_fora_do_limite" } });
    expect(lerDataCombinada("2000-01-01").ok).toBe(true);
    expect(lerDataCombinada("2099-12-31").ok).toBe(true);
  });

  it("uma data no passado vale (a Dívida então já entra na cobrança)", () => {
    expect(lerDataCombinada("2026-01-10").ok).toBe(true);
  });

  it("a observação é opcional, recortada e vai até 500 caracteres", () => {
    expect(lerObservacaoDaDivida("")).toEqual({ ok: true, valor: null });
    expect(lerObservacaoDaDivida("   ")).toEqual({ ok: true, valor: null });
    expect(lerObservacaoDaDivida("  combinado por WhatsApp ")).toEqual({ ok: true, valor: "combinado por WhatsApp" });
    expect(lerObservacaoDaDivida("x".repeat(500)).ok).toBe(true);
    expect(lerObservacaoDaDivida("x".repeat(501))).toMatchObject({ ok: false, erro: { codigo: "divida.observacao_longa" } });
  });
});

describe("dividaAindaNaoVence: o Mês do vencimento ainda não chegou", () => {
  const v = (d: string | null) => ({ vencimento_combinado: d });

  it("até o mês anterior ao do vencimento ainda não venceu; no mês dele e depois, entra", () => {
    expect(dividaAindaNaoVence(v("2027-04-06"), "2027-03-31")).toBe(true);
    expect(dividaAindaNaoVence(v("2027-04-06"), "2027-04-01")).toBe(false);
    expect(dividaAindaNaoVence(v("2027-04-06"), "2027-04-30")).toBe(false);
    expect(dividaAindaNaoVence(v("2027-04-06"), "2027-05-01")).toBe(false);
  });

  it("o corte é o mês de calendário, não o dia: antes do dia 06, dentro de abril, já entra", () => {
    expect(dividaAindaNaoVence(v("2027-04-30"), "2027-04-02")).toBe(false);
  });

  it("a virada de ano e um vencimento muito à frente", () => {
    expect(dividaAindaNaoVence(v("2027-01-05"), "2026-12-31")).toBe(true);
    expect(dividaAindaNaoVence(v("2027-01-05"), "2027-01-01")).toBe(false);
    expect(dividaAindaNaoVence(v("2030-06-01"), "2026-11-16")).toBe(true);
  });

  it("sem data combinada, ou com `hoje` ilegível, nada é escondido", () => {
    expect(dividaAindaNaoVence(v(null), "2026-11-16")).toBe(false);
    expect(dividaAindaNaoVence({}, "2026-11-16")).toBe(false);
    expect(dividaAindaNaoVence(v("2027-04-06"), "16/11/26")).toBe(false);
    expect(dividaAindaNaoVence(v("2027-02-31"), "2026-11-16")).toBe(false);
  });

  it("ehDividaProgramada: só com data válida", () => {
    expect(ehDividaProgramada(v("2027-04-06"))).toBe(true);
    expect(ehDividaProgramada(v(null))).toBe(false);
    expect(ehDividaProgramada(v("2027-02-31"))).toBe(false);
  });
});

describe("planejarProgramacao", () => {
  const entrada = { data: "2027-04-06", observacao: "tudo no final" };

  it("uma linha: a data e a observação, marcada como mexida à mão; o Desfazer devolve o que era", () => {
    const l = linha("a", { vencimento_combinado: "2026-12-01", vencimento_observacao: "antes", editado_em: "2026-11-01T10:00:00Z" });
    const r = planejarProgramacao(["a"], [l], CTX, entrada);
    expect(r).toEqual({
      ok: true,
      valor: {
        itens: [{ id: "a", vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final", editado_em: AGORA }],
        desfazer: [{ id: "a", vencimento_combinado: "2026-12-01", vencimento_observacao: "antes", editado_em: "2026-11-01T10:00:00Z" }],
        programados: 1,
        pagos: 0,
        semValor: 0,
      },
    });
  });

  it("observação em branco vira nula", () => {
    const r = planejarProgramacao(["a"], [linha("a")], CTX, { data: "2027-04-06", observacao: "   " });
    expect(r).toMatchObject({ ok: true, valor: { itens: [{ vencimento_observacao: null }] } });
  });

  it("data vazia, ilegível ou observação longa: erro do núcleo, nada a gravar", () => {
    expect(planejarProgramacao(["a"], [linha("a")], CTX, { data: "", observacao: "" })).toMatchObject({ ok: false, erro: { codigo: "divida.data_vazia" } });
    expect(planejarProgramacao(["a"], [linha("a")], CTX, { data: "2027-13-01", observacao: "" })).toMatchObject({
      ok: false,
      erro: { codigo: "divida.data_invalida" },
    });
    expect(planejarProgramacao(["a"], [linha("a")], CTX, { data: "2027-04-06", observacao: "x".repeat(501) })).toMatchObject({
      ok: false,
      erro: { codigo: "divida.observacao_longa" },
    });
  });

  it("a Seleção toda: um item por linha; a que já estava igual não é regravada", () => {
    const linhas = [linha("a"), linha("b", { vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final" }), linha("c")];
    const r = planejarProgramacao(["a", "b", "c"], linhas, CTX, entrada);
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["a", "c"]);
    expect(r.ok && r.valor.programados).toBe(2);
  });

  it("tudo já igual: ok, sem itens (a tela não grava nada)", () => {
    const l = linha("a", { vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final" });
    expect(planejarProgramacao(["a"], [l], CTX, entrada)).toMatchObject({ ok: true, valor: { itens: [], programados: 0 } });
  });

  it("já pago (Status que conta) fica de fora e é contado; só pagos: erro próprio", () => {
    const linhas = [linha("a"), linha("p", { status_id: PAGO })];
    const r = planejarProgramacao(["a", "p"], linhas, CTX, entrada);
    expect(r).toMatchObject({ ok: true, valor: { programados: 1, pagos: 1 } });
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["a"]);
    expect(planejarProgramacao(["p"], linhas, CTX, entrada)).toMatchObject({ ok: false, erro: { codigo: "divida.so_pagos" } });
  });

  it("Pago parcialmente PODE ser programado; os itens que já cobrem o valor, não", () => {
    const parcial = linha("a");
    const coberto = linha("b");
    const recebidoCentavos = new Map([
      ["a", 4_000],
      ["b", 10_000],
    ]);
    const r = planejarProgramacao(["a", "b"], [parcial, coberto], { ...CTX, recebidoCentavos }, entrada);
    expect(r).toMatchObject({ ok: true, valor: { programados: 1, pagos: 1 } });
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["a"]);
  });

  it("valor zero ou negativo (estorno) não tem o que cobrar: fica de fora", () => {
    const r = planejarProgramacao(["a", "z", "n"], [linha("a"), linha("z", { valor_centavos: 0 }), linha("n", { valor_centavos: -2_590 })], CTX, entrada);
    expect(r).toMatchObject({ ok: true, valor: { programados: 1, semValor: 2 } });
    expect(planejarProgramacao(["z"], [linha("z", { valor_centavos: 0 })], CTX, entrada)).toMatchObject({
      ok: false,
      erro: { codigo: "divida.nada_a_programar" },
    });
  });

  it("mãe dividida: programa as partes (filhas vivas), nunca a mãe; a parte paga fica de fora", () => {
    const mae = linha("m", { divisao: { modo: "valor", partes: [] }, valor_centavos: 31_800 });
    const f1 = linha("f1", { dividido_de_id: "m", valor_centavos: 10_600 });
    const f2 = linha("f2", { dividido_de_id: "m", valor_centavos: 21_200, status_id: PAGO });
    const excluida = linha("f3", { dividido_de_id: "m", excluido_em: "2026-11-01T00:00:00Z" });
    const r = planejarProgramacao(["m"], [mae, f1, f2, excluida], CTX, entrada);
    expect(r).toMatchObject({ ok: true, valor: { programados: 1, pagos: 1 } });
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["f1"]);
  });

  it("uma parte sozinha programa só ela (o resto da Divisão fica como está)", () => {
    const mae = linha("m", { divisao: { modo: "valor", partes: [] } });
    const f1 = linha("f1", { dividido_de_id: "m" });
    const f2 = linha("f2", { dividido_de_id: "m" });
    const r = planejarProgramacao(["f2"], [mae, f1, f2], CTX, entrada);
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["f2"]);
  });

  it("o Ajuste de centavos acompanha a parcela: mesma data, sem observação", () => {
    const parcela = linha("p", { valor_centavos: 114_074 });
    const ajuste = linha("aj", { valor_centavos: -8, ajuste_de_id: "p" });
    const r = planejarProgramacao(["p"], [parcela, ajuste], CTX, entrada);
    expect(r).toMatchObject({ ok: true, valor: { programados: 1 } });
    expect(r.ok && r.valor.itens).toEqual([
      { id: "p", vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final", editado_em: AGORA },
      { id: "aj", vencimento_combinado: "2027-04-06", vencimento_observacao: null, editado_em: AGORA },
    ]);
  });

  it("parcela e Ajuste marcados juntos: o Ajuste não é um item a mais", () => {
    const parcela = linha("p");
    const ajuste = linha("aj", { valor_centavos: -8, ajuste_de_id: "p" });
    const r = planejarProgramacao(["p", "aj"], [parcela, ajuste], CTX, entrada);
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["p", "aj"]);
    expect(r.ok && r.valor.programados).toBe(1);
  });

  it("excluída, ou que não existe, nunca entra", () => {
    const r = planejarProgramacao(["a", "x", "e"], [linha("a"), linha("e", { excluido_em: "2026-11-01T00:00:00Z" })], CTX, entrada);
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["a"]);
    expect(planejarProgramacao(["x"], [], CTX, entrada)).toMatchObject({ ok: false, erro: { codigo: "divida.nada_a_programar" } });
  });
});

describe("planejarDesligar", () => {
  it("só toca no que está programado, e o Desfazer devolve a data e a observação", () => {
    const programada = linha("a", { vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final" });
    const comum = linha("b");
    const r = planejarDesligar(["a", "b"], [programada, comum], { agora: AGORA });
    expect(r).toEqual({
      ok: true,
      valor: {
        itens: [{ id: "a", vencimento_combinado: null, vencimento_observacao: null, editado_em: AGORA }],
        desfazer: [{ id: "a", vencimento_combinado: "2027-04-06", vencimento_observacao: "tudo no final", editado_em: null }],
        programados: 1,
        pagos: 0,
        semValor: 0,
      },
    });
  });

  it("desliga também o Ajuste da parcela e as partes de uma mãe dividida", () => {
    const d = "2027-04-06";
    const parcela = linha("p", { vencimento_combinado: d });
    const ajuste = linha("aj", { ajuste_de_id: "p", vencimento_combinado: d });
    const mae = linha("m", { divisao: { modo: "valor", partes: [] } });
    const f = linha("f", { dividido_de_id: "m", vencimento_combinado: d });
    const r = planejarDesligar(["p", "m"], [parcela, ajuste, mae, f], { agora: AGORA });
    expect(r.ok && r.valor.itens.map((i) => i.id)).toEqual(["p", "aj", "f"]);
  });

  it("nada programado: erro", () => {
    expect(planejarDesligar(["a"], [linha("a")], { agora: AGORA })).toMatchObject({ ok: false, erro: { codigo: "divida.nada_a_desligar" } });
  });

  it("programadaDe: a primeira Dívida entre as escolhidas (para a janela abrir com a data)", () => {
    const a = linha("a");
    const b = linha("b", { vencimento_combinado: "2027-04-06" });
    expect(programadaDe(["a", "b"], [a, b])?.id).toBe("b");
    expect(programadaDe(["a"], [a, b])).toBeNull();
  });
});

describe("aReceber (a seção de Recebimentos)", () => {
  let n = 0;
  const lanc = (id: string, nome: string, resp: string | null, mes: string, valor: number, extra: Partial<LancamentoParaReceber> = {}): LancamentoParaReceber => ({
    id,
    mes,
    excluido_em: null,
    nome,
    apelido: null,
    valor_centavos: valor,
    status_id: NAO_PAGO,
    responsavel_id: resp,
    serie_id: null,
    parcela_n: ++n,
    dividido_de_id: null,
    divisao: null,
    ajuste_de_id: null,
    vencimento_combinado: null,
    vencimento_observacao: null,
    ...extra,
  });
  const ctx = (extra: Partial<Parameters<typeof aReceber>[1]> = {}) => ({
    statusPagos: new Set([PAGO]),
    itens: [],
    atrasos: new Map<string, string>(),
    ...extra,
  });

  // A Bombinhas (Flow 5): 6 parcelas, três partes de R$ 106,00; a do Lucas é Dívida programada até 06/04/27.
  function bombinhas(): LancamentoParaReceber[] {
    const meses = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
    return meses.flatMap((mes, i) => {
      const mae = lanc(`m${i}`, "Bombinhas", null, mes, 31_800, {
        serie_id: "s-bombinhas",
        parcela_n: i + 1,
        divisao: { modo: "valor", partes: [] },
      });
      return [
        mae,
        lanc(`mae${i}`, "Bombinhas", "mae", mes, 10_600, { serie_id: "s-bombinhas", parcela_n: i + 1, dividido_de_id: mae.id }),
        lanc(`casal${i}`, "Bombinhas", "casal", mes, 10_600, { serie_id: "s-bombinhas", parcela_n: i + 1, dividido_de_id: mae.id }),
        lanc(`lucas${i}`, "Bombinhas", "lucas", mes, 10_600, {
          serie_id: "s-bombinhas",
          parcela_n: i + 1,
          dividido_de_id: mae.id,
          vencimento_combinado: "2027-04-06",
        }),
      ];
    });
  }

  it("a Bombinhas: a parte do Lucas soma R$ 636,00 numa linha só, com vencimento em 06/04/27; Mãe e Casal não aparecem", () => {
    const r = aReceber(bombinhas(), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: "Bombinhas", responsavelId: "lucas", vencimento: "2027-04-06", valorCentavos: 63_600 });
    expect(r[0].itens.map((i) => i.mes)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(r[0].atrasadoDesde).toBeNull();
  });

  it("uma parcela paga sai da soma; só restam as outras", () => {
    const linhas = bombinhas().map((l) => (l.id === "lucas0" ? { ...l, status_id: PAGO } : l));
    const r = aReceber(linhas, ctx());
    expect(r[0].valorCentavos).toBe(53_000);
    expect(r[0].itens).toHaveLength(5);
  });

  it("um Pago parcialmente entra só com o que falta", () => {
    const linhas = [lanc("a", "ÓCULOS", "mae", "2026-10", 27_000, { vencimento_combinado: "2026-12-06" })];
    const r = aReceber(linhas, ctx({ itens: [{ lancamento_id: "a", valor_centavos: 7_000 }] }));
    expect(r[0].valorCentavos).toBe(20_000);
  });

  it("ordena pela data combinada e, na mesma data, pelo nome; Apelido no lugar do Nome", () => {
    const linhas = [
      lanc("a", "ZETA", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06" }),
      lanc("b", "ALFA", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06" }),
      lanc("c", "TARDE", "mae", "2026-10", 1_000, { vencimento_combinado: "2027-01-06" }),
      lanc("d", "CEDO", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-11-20", apelido: "Óculos" }),
    ];
    expect(aReceber(linhas, ctx()).map((l) => l.nome)).toEqual(["Óculos", "ALFA", "ZETA", "TARDE"]);
  });

  it("a vencida leva o 'desde' do atraso (o do vencimento combinado), a mais antiga da linha", () => {
    const linhas = [
      lanc("a", "ÓCULOS", "mae", "2026-10", 27_000, { vencimento_combinado: "2026-11-01" }),
      lanc("b", "ÓCULOS", "mae", "2026-11", 27_000, { vencimento_combinado: "2026-11-01", serie_id: "s", parcela_n: 2 }),
      lanc("c", "ÓCULOS", "mae", "2026-10", 27_000, { vencimento_combinado: "2026-11-01", serie_id: "s", parcela_n: 1 }),
    ];
    const atrasos = new Map([
      ["b", "2026-11-12"],
      ["c", "2026-11-12"],
    ]);
    const r = aReceber(linhas, ctx({ atrasos }));
    expect(r.find((l) => l.itens.length === 2)?.atrasadoDesde).toBe("2026-11-12");
    expect(r.find((l) => l.itens.length === 1)?.atrasadoDesde).toBeNull();
  });

  it("o atraso real: depois do vencimento combinado + a tolerância, pelo núcleo do atraso", () => {
    const l = lanc("a", "ÓCULOS", "mae", "2026-10", 27_000, { vencimento_combinado: "2026-11-01" });
    const contexto = { statusPagos: new Set([PAGO]), configsCiclo: [{ vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z", dia_fechamento: 1, dia_vencimento: 6 }] };
    expect([...atrasosDasLinhas([l], "2026-11-11", 10, contexto).keys()]).toEqual([]);
    expect(atrasosDasLinhas([l], "2026-11-12", 10, contexto).get("a")).toBe("2026-11-12");
  });

  it("a Série do mesmo Responsável com datas diferentes são linhas diferentes", () => {
    const linhas = [
      lanc("a", "CURSO", "lucas", "2026-10", 1_000, { serie_id: "s", vencimento_combinado: "2026-12-06" }),
      lanc("b", "CURSO", "lucas", "2026-11", 1_000, { serie_id: "s", vencimento_combinado: "2027-01-06" }),
    ];
    expect(aReceber(linhas, ctx())).toHaveLength(2);
  });

  it("previsto (Conta manual sem Fatura) ENTRA: a Dívida é parte do que se vai receber", () => {
    const linhas = [lanc("a", "BOMBINHAS", "lucas", "2027-02", 10_600, { vencimento_combinado: "2027-04-06" })];
    expect(aReceber(linhas, ctx())).toHaveLength(1);
  });

  it("o Ajuste de centavos soma na parcela, não é linha", () => {
    const linhas = [
      lanc("p", "MSC", "casal", "2026-10", 114_074, { vencimento_combinado: "2026-12-06" }),
      lanc("aj", "AJUSTE", "casal", "2026-10", -8, { ajuste_de_id: "p", vencimento_combinado: "2026-12-06" }),
    ];
    const r = aReceber(linhas, ctx());
    expect(r).toHaveLength(1);
    expect(r[0].valorCentavos).toBe(114_066);
    expect(r[0].itens).toHaveLength(1);
  });

  it("não entram: excluída, mãe dividida, sem data combinada, paga, ou com itens que já cobrem o valor", () => {
    const linhas = [
      lanc("e", "A", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06", excluido_em: "2026-11-01T00:00:00Z" }),
      lanc("m", "B", null, "2026-10", 1_000, { vencimento_combinado: "2026-12-06", divisao: { modo: "valor", partes: [] } }),
      lanc("s", "C", "mae", "2026-10", 1_000),
      lanc("p", "D", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06", status_id: PAGO }),
      lanc("c", "E", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06" }),
    ];
    expect(aReceber(linhas, ctx({ itens: [{ lancamento_id: "c", valor_centavos: 1_000 }] }))).toEqual([]);
  });

  it("sem nenhuma Dívida programada: lista vazia", () => {
    expect(aReceber([lanc("a", "X", "mae", "2026-10", 1_000)], ctx())).toEqual([]);
  });

  it("a observação do combinado vai à linha", () => {
    const linhas = [lanc("a", "X", "mae", "2026-10", 1_000, { vencimento_combinado: "2026-12-06", vencimento_observacao: "no 13º" })];
    expect(aReceber(linhas, ctx())[0].observacao).toBe("no 13º");
  });
});
