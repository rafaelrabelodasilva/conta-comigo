import { describe, expect, it } from "vitest";
import extracaoOutubro from "../../test/fixtures/extracao-2026-10.json";
import type { Extracao, LancamentoExtraido } from "./extracao-fatura";
import {
  ESPERADO_OUTUBRO_2026,
  comporTotalAPagar,
  conferirImportacao,
  dataDoLancamento,
  formatarParcela,
  lancamentosDaFatura,
  lerDataDaFatura,
  normalizarNome,
  pareceFaturaSantander,
  prepararImportacao,
  primeiraDiferenca,
} from "./importacao-fatura";

// A extração de outubro/2026 foi gravada uma vez com o Gemini de verdade
// (PROVA_GEMINI=1), já em centavos: o aceite roda sem chamar o Gemini.
const outubro = extracaoOutubro as Extracao;

const lanc = (extra: Partial<LancamentoExtraido> = {}): LancamentoExtraido => ({
  nome: "PADARIA",
  data: "10/09",
  parcelaN: null,
  parcelaTotal: null,
  valorCentavos: 1000,
  finalCartao: "1234",
  tipoSugerido: null,
  duvida: false,
  ...extra,
});

const extracao = (lancamentos: LancamentoExtraido[], extra: Partial<Extracao["fatura"]> = {}): Extracao => {
  const despesas = lancamentos.filter((l) => l.valorCentavos > 0).reduce((s, l) => s + l.valorCentavos, 0);
  const creditos = lancamentos.filter((l) => l.valorCentavos < 0).reduce((s, l) => s - l.valorCentavos, 0);
  return {
    lancamentos,
    fatura: {
      vencimento: "06/10/2026",
      fechamento: null,
      totalDespesasCentavos: despesas,
      totalCreditosCentavos: creditos,
      saldoAnteriorCentavos: null,
      pagamentosCentavos: null,
      totalAPagarCentavos: null,
      ...extra,
    },
    cartoes: [{ final: "1234", valorTotalCentavos: despesas }],
  };
};

// Sem classificação: `classificarImportacao` (3.1) é quem classifica.
const SEM_CLASSIFICACAO = {
  tipo_sugerido: null,
  responsavel_id: null,
  tipo_id: null,
  revisao_motivo: "sem_classificacao",
  revisao_dados: null,
} as const;

describe("normalizarNome", () => {
  it("maiúsculas, sem acento e espaços colapsados", () => {
    expect(normalizarNome("  Óticas  Exata\tLtda ")).toBe("OTICAS EXATA LTDA");
    expect(normalizarNome("Conceição  çã")).toBe("CONCEICAO CA");
    expect(normalizarNome("SHOPEE *CELLSOLUTIONS")).toBe("SHOPEE *CELLSOLUTIONS");
  });
});

describe("pareceFaturaSantander", () => {
  it("texto com SANTANDER e o detalhamento ou o resumo da fatura", () => {
    expect(pareceFaturaSantander("cartão SANTANDER ELITE\nDetalhamento da Fatura")).toBe(true);
    expect(pareceFaturaSantander("santander\nResumo  da fatura")).toBe(true);
  });

  it("extrato de conta ou fatura de outro banco não", () => {
    expect(pareceFaturaSantander("Extrato de conta corrente\nSaldo 1.000,00")).toBe(false);
    expect(pareceFaturaSantander("Banco X\nResumo da Fatura")).toBe(false);
    expect(pareceFaturaSantander("SANTANDER\nExtrato da conta")).toBe(false);
  });
});

describe("formatarParcela", () => {
  it("dois dígitos ou vazio", () => {
    expect(formatarParcela(2, 12)).toBe("02/12");
    expect(formatarParcela(10, 10)).toBe("10/10");
    expect(formatarParcela(null, null)).toBe("");
  });
});

describe("datas da Fatura", () => {
  it("lerDataDaFatura aceita AAAA e AA e recusa data que não existe", () => {
    expect(lerDataDaFatura("06/10/2026")).toBe("2026-10-06");
    expect(lerDataDaFatura("06/10/26")).toBe("2026-10-06");
    expect(lerDataDaFatura("31/02/2026")).toBeNull();
    expect(lerDataDaFatura("2026-10-06")).toBeNull();
  });

  it("o ano é o do corte, ou o anterior se a data passar dele", () => {
    expect(dataDoLancamento("29/09", "2026-10-06")).toBe("2026-09-29");
    expect(dataDoLancamento("06/10", "2026-10-06")).toBe("2026-10-06");
    expect(dataDoLancamento("07/10", "2026-10-06")).toBe("2025-10-07");
    expect(dataDoLancamento("28/11", "2026-10-06")).toBe("2025-11-28");
    expect(dataDoLancamento("15/12", "2027-01-06")).toBe("2026-12-15");
    // Com o fechamento como corte, "01/10" é do ano anterior.
    expect(dataDoLancamento("01/10", "2026-09-29")).toBe("2025-10-01");
    expect(dataDoLancamento("9/9", "2026-10-06")).toBeNull();
    expect(dataDoLancamento("31/02", "2026-10-06")).toBeNull();
  });

  it("29/02 em ano não bissexto recua até um ano bissexto", () => {
    expect(dataDoLancamento("29/02", "2026-10-06")).toBe("2024-02-29");
    expect(dataDoLancamento("29/02", "2028-10-06")).toBe("2028-02-29");
  });
});

describe("prepararImportacao", () => {
  it("Mês do vencimento, datas completas, ordem do PDF, Nome normalizado e crédito negativo", () => {
    const r = prepararImportacao(
      extracao([
        lanc({ nome: "Ótica  Exata", data: "15/12", parcelaN: 10, parcelaTotal: 10, valorCentavos: 27000 }),
        lanc({ nome: "MSC CRUZEIROS", data: "04/09", valorCentavos: -8, duvida: true }),
        lanc({ nome: "SHOPEE", data: "01/10", parcelaN: 12, parcelaTotal: 12, valorCentavos: 52366 }),
      ], { fechamento: "29/09/26", saldoAnteriorCentavos: 748311 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.fatura).toEqual({
      mes: "2026-10",
      vencimento: "2026-10-06",
      fechamento: "2026-09-29",
      total_despesas_centavos: 79366,
      total_creditos_centavos: 8,
      saldo_anterior_centavos: 748311,
      pagamentos_centavos: null,
      total_a_pagar_centavos: null,
    });
    expect(r.valor.lancamentos).toEqual([
      {
        nome: "Ótica  Exata",
        nome_normalizado: "OTICA EXATA",
        valor_centavos: 27000,
        data: "2025-12-15",
        parcela_n: 10,
        parcela_total: 10,
        final_cartao: "1234",
        ordem_fatura: 1,
        duvida_extracao: false,
        ajuste_de_ordem: null,
        ...SEM_CLASSIFICACAO,
        serie: {
          nome_normalizado: "OTICA EXATA",
          parcela_total: 10,
          valor_parcela_centavos: 27000,
          mes_primeira_parcela: "2026-01",
          ocorrencia: 1,
        },
      },
      {
        nome: "MSC CRUZEIROS",
        nome_normalizado: "MSC CRUZEIROS",
        valor_centavos: -8,
        data: "2026-09-04",
        parcela_n: null,
        parcela_total: null,
        final_cartao: "1234",
        ordem_fatura: 2,
        duvida_extracao: true,
        ajuste_de_ordem: null,
        ...SEM_CLASSIFICACAO,
        serie: null,
      },
      {
        nome: "SHOPEE",
        nome_normalizado: "SHOPEE",
        valor_centavos: 52366,
        data: "2025-10-01",
        parcela_n: 12,
        parcela_total: 12,
        final_cartao: "1234",
        ordem_fatura: 3,
        duvida_extracao: false,
        ajuste_de_ordem: null,
        ...SEM_CLASSIFICACAO,
        serie: {
          nome_normalizado: "SHOPEE",
          parcela_total: 12,
          valor_parcela_centavos: 52366,
          mes_primeira_parcela: "2025-11",
          ocorrencia: 1,
        },
      },
    ]);
    expect(r.valor.previstos).toEqual([]);
    expect(r.valor.cartoes).toEqual([{ final: "1234", total_centavos: 79366 }]);
  });

  it("Séries (História 3.5): chave sem a data e duas compras idênticas com ocorrencia 1 e 2", () => {
    const r = prepararImportacao(
      extracao([
        lanc({ nome: "MAGALU", data: "03/10", parcelaN: 5, parcelaTotal: 10, valorCentavos: 44589 }),
        lanc({ nome: "PADARIA", valorCentavos: 1000 }),
        lanc({ nome: "MAGALU", data: "03/10", parcelaN: 5, parcelaTotal: 10, valorCentavos: 44589 }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.lancamentos.map((l) => l.serie?.ocorrencia ?? null)).toEqual([1, null, 2]);
    expect(r.valor.lancamentos[0].serie).toMatchObject({
      nome_normalizado: "MAGALU",
      parcela_total: 10,
      valor_parcela_centavos: 44589,
      mes_primeira_parcela: "2026-06",
    });
  });

  it("repassa o tipo_sugerido da extração (História 3.1)", () => {
    const r = prepararImportacao(extracao([lanc({ tipoSugerido: "Gatos" })]));
    expect(r.ok && r.valor.lancamentos[0].tipo_sugerido).toBe("Gatos");
  });

  it("o pagamento da fatura anterior não vira Lançamento", () => {
    const e = extracao([lanc({ nome: "PAGAMENTO DE FATURA-INTERNET", valorCentavos: -745721 }), lanc()]);
    const r = prepararImportacao(e);
    expect(r.ok && r.valor.lancamentos.map((l) => [l.nome, l.ordem_fatura])).toEqual([["PADARIA", 1]]);
    expect(lancamentosDaFatura(e)).toHaveLength(1);
  });

  it("final repetido nos cartões soma num cartão só", () => {
    const e = extracao([lanc()]);
    e.cartoes = [
      { final: "1234", valorTotalCentavos: 600 },
      { final: "1234", valorTotalCentavos: 400 },
      { final: "9999", valorTotalCentavos: 0 },
    ];
    const r = prepararImportacao(e);
    expect(r.ok && r.valor.cartoes).toEqual([
      { final: "1234", total_centavos: 1000 },
      { final: "9999", total_centavos: 0 },
    ]);
  });

  it("Ajuste de centavos: o crédito leva a ordem da mãe em ajuste_de_ordem (História 2.8)", () => {
    const e = extracao([
      lanc({ nome: "MSC CRUZEIROS", data: "04/09", parcelaN: 2, parcelaTotal: 12, valorCentavos: 114074, finalCartao: "5061" }),
      lanc({ nome: "PADARIA", valorCentavos: 2000 }),
      lanc({ nome: "MSC CRUZEIROS", data: "04/09", valorCentavos: -8, finalCartao: "5061" }),
    ]);
    const r = prepararImportacao(e);
    expect(r.ok && r.valor.lancamentos.map((l) => [l.ordem_fatura, l.ajuste_de_ordem])).toEqual([
      [1, null],
      [2, null],
      [3, 1],
    ]);
    // O Ajuste não tem motivo próprio (História 3.1).
    expect(r.ok && r.valor.lancamentos.map((l) => l.revisao_motivo)).toEqual(["sem_classificacao", "sem_classificacao", null]);
    // O limite vem de configuracoes: com R$ 0,05, R$ 0,08 não é Ajuste.
    const comLimite = prepararImportacao(e, 5);
    expect(comLimite.ok && comLimite.valor.lancamentos.map((l) => l.ajuste_de_ordem)).toEqual([null, null, null]);
  });

  it("outubro/2026: nenhum Ajuste (a grade fica como na 2.7)", () => {
    const r = prepararImportacao(outubro);
    expect(r.ok && r.valor.lancamentos.every((l) => l.ajuste_de_ordem === null)).toBe(true);
  });

  it("vencimento, fechamento ou data ilegível → leitura falhou", () => {
    expect(prepararImportacao(extracao([lanc()], { vencimento: "31/02/2026" }))).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "fatura.vencimento" },
    });
    expect(prepararImportacao(extracao([lanc()], { fechamento: "xx" }))).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "fatura.fechamento" },
    });
    // O índice é o da extração, contando o pagamento da fatura anterior que sai.
    const comPagamento = extracao([lanc({ nome: "PAGAMENTO DE FATURA", valorCentavos: -100 }), lanc(), lanc({ data: "30/02" })]);
    expect(prepararImportacao(comPagamento)).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "lancamentos.2.data" },
    });
  });
});

describe("conferirImportacao", () => {
  it("tudo batendo: conferido e completa", () => {
    const c = conferirImportacao(extracao([lanc(), lanc({ valorCentavos: -8 })]));
    expect(c).toMatchObject({ quantidade: 2, conferido: true, incompleta: false });
    expect(primeiraDiferenca(c)).toBeNull();
  });

  it("diferença num cartão aparece por cartão, sem ser incompleta", () => {
    const e = extracao([lanc(), lanc({ finalCartao: "5678", valorCentavos: 500 })]);
    e.cartoes = [
      { final: "1234", valorTotalCentavos: 1000 },
      { final: "5678", valorTotalCentavos: 492 },
    ];
    const c = conferirImportacao(e);
    expect(c.conferido).toBe(false);
    expect(c.incompleta).toBe(false);
    expect(c.porCartao).toContainEqual({ final: "5678", lidoCentavos: 492, despesasCentavos: 500, diferencaCentavos: 8 });
    expect(primeiraDiferenca(c)).toEqual({ centavos: 8, final: "5678" });
  });

  it("soma das despesas ou dos créditos abaixo do lido → incompleta", () => {
    expect(conferirImportacao(extracao([lanc()], { totalDespesasCentavos: 2000 })).incompleta).toBe(true);
    expect(conferirImportacao(extracao([lanc()], { totalCreditosCentavos: 8 })).incompleta).toBe(true);
    const acima = conferirImportacao(extracao([lanc()], { totalDespesasCentavos: 900 }));
    expect(acima.incompleta).toBe(false);
    expect(acima.conferido).toBe(false);
  });

  it("o pagamento da fatura anterior não entra nos créditos", () => {
    const c = conferirImportacao(extracao([lanc(), lanc({ nome: "PAGAMENTO DE FATURA", valorCentavos: -5000 })], { totalCreditosCentavos: 0 }));
    expect(c).toMatchObject({ quantidade: 1, creditosCentavos: 0, conferido: true });
  });
});

describe("aceite de outubro/2026 (extração gravada)", () => {
  it("49 Lançamentos, R$ 8.327,39 / R$ 639,62, cinco cartões que batem", () => {
    const c = conferirImportacao(outubro);
    expect(c.quantidade).toBe(ESPERADO_OUTUBRO_2026.quantidade);
    expect(c.despesasCentavos).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);
    expect(c.creditosCentavos).toBe(ESPERADO_OUTUBRO_2026.creditosCentavos);
    expect(c.conferido).toBe(true);
    expect(c.incompleta).toBe(false);
    expect(c.porCartao).toHaveLength(5);
    expect(c.porCartao.reduce((s, p) => s + p.lidoCentavos, 0)).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);
  });

  it("prepara 1 Fatura de 2026-10, 5 cartões e 49 linhas em ordem, com o crédito de 8 centavos negativo", () => {
    const r = prepararImportacao(outubro);
    if (!r.ok) throw new Error(r.erro.codigo);
    expect(r.valor.fatura.mes).toBe("2026-10");
    expect(r.valor.fatura.vencimento).toBe("2026-10-06");
    expect(r.valor.cartoes).toHaveLength(5);
    expect(r.valor.lancamentos).toHaveLength(49);
    expect(r.valor.lancamentos.map((l) => l.ordem_fatura)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
    // Nada depois do fechamento (29/09/26): a SHOPEE 12/12 de 01/10 é de 2025.
    expect(r.valor.fatura.fechamento).toBe("2026-09-29");
    expect(r.valor.lancamentos.every((l) => l.data <= "2026-09-29" && l.data > "2025-09-29")).toBe(true);
    expect(r.valor.lancamentos.find((l) => l.nome === "SHOPEE *CELLSOLUTIONS")?.data).toBe("2025-10-01");
    // Compras de fim de ano são do ano anterior ao vencimento.
    expect(r.valor.lancamentos.find((l) => l.nome === "AMAZON PRIME BR")?.data).toBe("2025-11-28");
    const creditos = r.valor.lancamentos.filter((l) => l.valor_centavos < 0);
    expect(creditos.reduce((s, l) => s - l.valor_centavos, 0)).toBe(ESPERADO_OUTUBRO_2026.creditosCentavos);
    expect(r.valor.lancamentos.some((l) => /PAGAMENTO DE FATURA/.test(l.nome))).toBe(false);
  });
});

describe("comporTotalAPagar", () => {
  it("outubro: R$ 7.687,77 + R$ 7.483,11 − R$ 7.457,21 = R$ 7.713,67, igual ao total a pagar lido", () => {
    const r = prepararImportacao(outubro);
    if (!r.ok) throw new Error(r.erro.codigo);
    const c = comporTotalAPagar(r.valor.fatura, r.valor.lancamentos.map((l) => l.valor_centavos));
    expect(c).toEqual({
      lancamentosCentavos: 768_777,
      saldoAnteriorCentavos: 748_311,
      pagamentosCentavos: 745_721,
      calculadoCentavos: 771_367,
      lidoCentavos: 771_367,
      diferencaCentavos: 0,
    });
  });

  it("saldo e pagamentos não lidos contam zero; sem o total lido, a diferença é null", () => {
    const fatura = { saldo_anterior_centavos: null, pagamentos_centavos: null, total_a_pagar_centavos: null };
    expect(comporTotalAPagar(fatura, [1000, -8])).toMatchObject({
      lancamentosCentavos: 992,
      calculadoCentavos: 992,
      lidoCentavos: null,
      diferencaCentavos: null,
    });
  });

  it("diferença é calculado − lido", () => {
    const fatura = { saldo_anterior_centavos: 500, pagamentos_centavos: 500, total_a_pagar_centavos: 1100 };
    expect(comporTotalAPagar(fatura, [1000]).diferencaCentavos).toBe(-100);
    expect(comporTotalAPagar(fatura, []).lancamentosCentavos).toBe(0);
  });
});
