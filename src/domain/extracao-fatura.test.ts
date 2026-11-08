import { describe, expect, it } from "vitest";
import {
  ESQUEMA_PEDIDO_EXTRACAO,
  converterExtracao,
  parecePagamentoDeFatura,
  resumirExtracao,
  somarConferencia,
  validarExtracao,
  type ExtracaoBruta,
} from "./extracao-fatura";

const lanc = (extra: Partial<ExtracaoBruta["lancamentos"][number]>): ExtracaoBruta["lancamentos"][number] => ({
  nome: "MSC CRUZEIROS",
  data: "06/09",
  parcela: "02/12",
  valor: "1.140,74",
  final_cartao: "9012",
  tipo_sugerido: "Viagem",
  duvida: false,
  ...extra,
});

const bruta = (extra: Partial<ExtracaoBruta> = {}): ExtracaoBruta => ({
  lancamentos: [
    lanc({}),
    lanc({ nome: "MSC CRUZEIROS", parcela: null, valor: "-0,08", tipo_sugerido: null }),
    lanc({ nome: "PADARIA", parcela: null, valor: "10,00", final_cartao: "1234", tipo_sugerido: "Inexistente" }),
  ],
  fatura: {
    vencimento: "06/10/2026",
    fechamento: "28/09/2026",
    total_despesas: "1.150,74",
    total_creditos: "0,08",
    saldo_anterior: "2.000,00",
    pagamentos: "-2.000,00",
    total_a_pagar: "1.150,66",
  },
  cartoes: [
    { final: "9012", valor_total: "1.140,74" },
    { final: "1234", valor_total: "10,00" },
  ],
  ...extra,
});

describe("validarExtracao", () => {
  it("aceita a extração no formato do schema", () => {
    const r = validarExtracao(bruta());
    expect(r.ok).toBe(true);
  });

  it("recusa valor fora do formato, data errada e campo faltando", () => {
    expect(validarExtracao(bruta({ lancamentos: [lanc({ valor: "1140.74" })] }))).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "lancamentos.0.valor" },
    });
    expect(validarExtracao(bruta({ lancamentos: [lanc({ data: "6/9" })] })).ok).toBe(false);
    expect(validarExtracao(bruta({ lancamentos: [lanc({ parcela: "2 de 12" })] })).ok).toBe(false);
    expect(validarExtracao(bruta({ lancamentos: [lanc({ final_cartao: "12" })] })).ok).toBe(false);
    expect(validarExtracao({ lancamentos: [] }).ok).toBe(false);
    expect(validarExtracao(null)).toEqual({ ok: false, erro: { codigo: "fatura.leitura_falhou", detalhe: "raiz" } });
  });
});

describe("converterExtracao", () => {
  it("passa para centavos, separa a parcela e limita o Tipo à lista", () => {
    const r = converterExtracao(bruta(), ["Viagem", "Casa"]);
    if (!r.ok) throw new Error("falhou");
    const [msc, ajuste, padaria] = r.valor.lancamentos;
    expect(msc).toEqual({
      nome: "MSC CRUZEIROS",
      data: "06/09",
      parcelaN: 2,
      parcelaTotal: 12,
      valorCentavos: 114074,
      finalCartao: "9012",
      tipoSugerido: "Viagem",
      duvida: false,
    });
    expect(ajuste.valorCentavos).toBe(-8);
    expect(ajuste.parcelaN).toBeNull();
    expect(padaria.tipoSugerido).toBeNull();
    expect(r.valor.fatura).toEqual({
      vencimento: "06/10/2026",
      fechamento: "28/09/2026",
      totalDespesasCentavos: 115074,
      totalCreditosCentavos: 8,
      saldoAnteriorCentavos: 200000,
      pagamentosCentavos: -200000,
      totalAPagarCentavos: 115066,
    });
    expect(r.valor.cartoes).toEqual([
      { final: "9012", valorTotalCentavos: 114074 },
      { final: "1234", valorTotalCentavos: 1000 },
    ]);
  });

  it("total de créditos com sinal vira valor absoluto", () => {
    const b = bruta();
    b.fatura.total_creditos = "-0,08";
    const r = converterExtracao(b, []);
    expect(r.ok && r.valor.fatura.totalCreditosCentavos).toBe(8);
  });
});

describe("resumirExtracao", () => {
  it("soma despesas, créditos e cartões e mostra as diferenças", () => {
    const r = converterExtracao(bruta(), []);
    if (!r.ok) throw new Error("falhou");
    const resumo = resumirExtracao(r.valor);
    expect(resumo).toMatchObject({
      quantidade: 3,
      despesasCentavos: 115074,
      creditosCentavos: 8,
      cartoesCentavos: 115074,
      diferencaDespesasCentavos: 0,
      diferencaCreditosCentavos: 0,
      diferencaCartoesCentavos: 0,
      pagamentosDeFatura: 0,
      duvidas: 0,
    });
    expect(resumo.porCartao).toEqual([
      { final: "9012", lidoCentavos: 114074, despesasCentavos: 114074, diferencaCentavos: 0 },
      { final: "1234", lidoCentavos: 1000, despesasCentavos: 1000, diferencaCentavos: 0 },
    ]);
  });

  it("aponta diferença, cartão que só aparece nos Lançamentos e pagamento da fatura anterior", () => {
    const b = bruta();
    b.lancamentos.push(lanc({ nome: "PAGAMENTO DE FATURA", parcela: null, valor: "-2.000,00", final_cartao: "5555", duvida: true }));
    b.lancamentos.push(lanc({ nome: "OUTRA", parcela: null, valor: "5,00", final_cartao: "7777" }));
    const r = converterExtracao(b, []);
    if (!r.ok) throw new Error("falhou");
    const resumo = resumirExtracao(r.valor);
    expect(resumo.diferencaDespesasCentavos).toBe(500);
    expect(resumo.diferencaCreditosCentavos).toBe(200000);
    expect(resumo.pagamentosDeFatura).toBe(1);
    expect(resumo.duvidas).toBe(1);
    expect(resumo.porCartao.at(-1)).toEqual({ final: "7777", lidoCentavos: 0, despesasCentavos: 500, diferencaCentavos: 500 });
  });
});

describe("resumirExtracao com final repetido", () => {
  it("um cartão repetido em `cartoes` vira uma linha só em porCartao", () => {
    const b = bruta();
    b.cartoes.push({ final: "9012", valor_total: "0,00" });
    const r = converterExtracao(b, []);
    if (!r.ok) throw new Error("falhou");
    const resumo = resumirExtracao(r.valor);
    expect(resumo.porCartao.map((c) => c.final)).toEqual(["9012", "1234"]);
    expect(resumo.porCartao[0].lidoCentavos).toBe(114074);
  });
});

describe("parecePagamentoDeFatura", () => {
  it("reconhece o pagamento da fatura anterior", () => {
    expect(parecePagamentoDeFatura("PAGAMENTO DE FATURA")).toBe(true);
    expect(parecePagamentoDeFatura("PAGTO FATURA CARTAO")).toBe(true);
    expect(parecePagamentoDeFatura("DEB AUTOM DE FATURA")).toBe(true);
    expect(parecePagamentoDeFatura("MSC CRUZEIROS")).toBe(false);
    expect(parecePagamentoDeFatura("PAGUE MENOS")).toBe(false);
    expect(parecePagamentoDeFatura("DEB AUT SEGURO")).toBe(false);
    expect(parecePagamentoDeFatura("DEBITO AUTOMATICO FATURA")).toBe(true);
  });
});

describe("ESQUEMA_PEDIDO_EXTRACAO", () => {
  it("exige texto não vazio", () => {
    expect(ESQUEMA_PEDIDO_EXTRACAO.safeParse({ texto: "abc" }).success).toBe(true);
    expect(ESQUEMA_PEDIDO_EXTRACAO.safeParse({ texto: "   " }).success).toBe(false);
    expect(ESQUEMA_PEDIDO_EXTRACAO.safeParse({}).success).toBe(false);
    expect(ESQUEMA_PEDIDO_EXTRACAO.safeParse({ texto: "x".repeat(200_001) }).success).toBe(false);
  });
});

describe("somarConferencia com final nulo", () => {
  it("o valor entra nas despesas, mas em nenhum cartão (não existe cartão \"\")", () => {
    const soma = somarConferencia(
      [
        { valorCentavos: 1000, finalCartao: "8673" },
        { valorCentavos: 500, finalCartao: null },
        { valorCentavos: -200, finalCartao: null },
      ],
      [{ final: "8673", valorTotalCentavos: 1000 }],
      { totalDespesasCentavos: 1000, totalCreditosCentavos: 0 },
    );
    expect(soma.despesasCentavos).toBe(1500);
    expect(soma.creditosCentavos).toBe(200);
    expect(soma.diferencaDespesasCentavos).toBe(500);
    expect(soma.porCartao).toEqual([{ final: "8673", lidoCentavos: 1000, despesasCentavos: 1000, diferencaCentavos: 0 }]);
  });
});
