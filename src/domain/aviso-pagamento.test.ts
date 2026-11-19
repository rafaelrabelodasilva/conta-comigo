import { describe, expect, it } from "vitest";
import { avisarMudancaComPagamento, type AvisoDePagamento, type EntradaDoAviso, type ItemDoAviso } from "./aviso-pagamento";
import type { Formula } from "./formula";
import { rotuloDatasDoPagamento, textoDoAvisoDePagamento } from "./mensagens";
import { projetarPendente, type LancamentoParaPendente } from "./projecoes";
import { avaliar } from "./formula";

// O aviso de 6.9 (FR-46, AD-10, AD-11): o "antes e depois" do Saldo pendente vem de `projetarPendente` e da Fórmula
// de cada Bloco de cobrança, nunca de uma conta à parte.

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const EXCLUIDO = "2026-11-12T12:00:00Z";

const linha = (id: string, extra: Partial<LancamentoParaPendente> = {}): LancamentoParaPendente => ({
  id,
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: 31_067,
  responsavel_id: "mae",
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

const item = (lancamento_id: string, valor_centavos: number, pagamento_id = "p1", extra: Partial<ItemDoAviso> = {}): ItemDoAviso => ({
  lancamento_id,
  pagamento_id,
  valor_centavos,
  status_aplicado_id: PAGO,
  ...extra,
});

const resp = (id: string): Formula => ({ tipo: "responsavel", id });
const MAE = { id: "b-mae", nome: "Mãe", formula: resp("mae"), de_cobranca: true };
// Rangel = Rangel + Casal ÷ 2
const RANGEL = {
  id: "b-rangel",
  nome: "Rangel",
  formula: {
    tipo: "operacao",
    operacao: "soma",
    esquerda: resp("rangel"),
    direita: { tipo: "operacao", operacao: "divisao", esquerda: resp("casal"), direita: { tipo: "numero", valor: "2" } },
  } as Formula,
  de_cobranca: true,
};

// O dinheiro usa espaço não separável; os textos esperados abaixo usam o espaço comum.
const texto = (a: AvisoDePagamento) => textoDoAvisoDePagamento(a).replaceAll(" ", " ");

const PAGAMENTOS = [{ id: "p1", data: "2026-10-08" }];

const entrada = (extra: Partial<EntradaDoAviso> = {}): EntradaDoAviso => ({
  lancamentos: [linha("a", { status_id: PAGO })],
  mudancas: [{ id: "a", patch: { excluido_em: EXCLUIDO } }],
  itens: [item("a", 31_067)],
  pagamentos: PAGAMENTOS,
  blocos: [MAE],
  statusPagos: new Set([PAGO]),
  hoje: "2026-11-15",
  ...extra,
});

describe("avisarMudancaComPagamento: excluir", () => {
  it("o exemplo do EXPERIENCE: a Mãe vai de R$ 0,00 para - R$ 310,67 (o crédito do que foi pago)", () => {
    const aviso = avisarMudancaComPagamento(entrada());
    expect(aviso).toEqual({
      quantidade: 1,
      datas: ["2026-10-08"],
      efeitos: [{ blocoId: "b-mae", nome: "Mãe", antesCentavos: 0, depoisCentavos: -31_067 }],
    });
    expect(texto(aviso!)).toBe(
      "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 0,00 para - R$ 310,67.",
    );
  });

  it("o antes e o depois são o `projetarPendente` do núcleo, não uma conta à parte", () => {
    const e = entrada();
    const opcoes = { statusPagos: e.statusPagos, itens: e.itens, hoje: e.hoje };
    const depois = e.lancamentos.map((l) => ({ ...l, excluido_em: EXCLUIDO }));
    const esperado = avaliar(MAE.formula, projetarPendente(depois, opcoes));
    expect(esperado.ok && esperado.valor.valorCentavos).toBe(-31_067);
    expect(avisarMudancaComPagamento(e)?.efeitos[0].depoisCentavos).toBe(-31_067);
  });

  it("Pagamento parcial: o crédito é o que já entrou e o Saldo troca o restante pelo crédito", () => {
    // R$ 310,67, R$ 100,00 pagos (Status não pago): antes R$ 210,67; excluída, só o crédito de - R$ 100,00.
    const aviso = avisarMudancaComPagamento(
      entrada({ lancamentos: [linha("a")], itens: [item("a", 10_000, "p1", { status_aplicado_id: null })] }),
    );
    expect(aviso?.efeitos).toEqual([{ blocoId: "b-mae", nome: "Mãe", antesCentavos: 21_067, depoisCentavos: -10_000 }]);
  });

  it("`minha_parte`: o crédito segue os itens (o restante inteiro de cada linha), como na 6.5", () => {
    // Casal R$ 100,00 quitado com R$ 50,00 recebidos; os itens guardam R$ 100,00. A Fórmula do Rangel divide por 2:
    // o crédito de - R$ 100,00 do Casal vira - R$ 50,00 no Saldo, que é o que entrou. Não se divide de novo.
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { valor_centavos: 10_000, responsavel_id: "casal", status_id: PAGO })],
        itens: [item("a", 10_000)],
        blocos: [RANGEL],
      }),
    );
    expect(aviso?.efeitos).toEqual([{ blocoId: "b-rangel", nome: "Rangel", antesCentavos: 0, depoisCentavos: -5_000 }]);
  });

  it("uma exclusão de linha sem Pagamento não avisa", () => {
    expect(avisarMudancaComPagamento(entrada({ itens: [] }))).toBeNull();
  });

  it("Pagamento desfeito (item excluído) não conta", () => {
    expect(avisarMudancaComPagamento(entrada({ itens: [item("a", 31_067, "p1", { excluido_em: EXCLUIDO })] }))).toBeNull();
  });

  it("vários Blocos: cada um com o seu de-para; o que não muda não entra", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { responsavel_id: "casal", valor_centavos: 10_000, status_id: PAGO })],
        itens: [item("a", 10_000)],
        blocos: [MAE, RANGEL],
      }),
    );
    expect(aviso?.efeitos.map((e) => e.nome)).toEqual(["Rangel"]);
  });

  it("Bloco que não é de cobrança fica de fora", () => {
    const aviso = avisarMudancaComPagamento(entrada({ blocos: [{ ...MAE, de_cobranca: false }] }));
    expect(aviso).toEqual({ quantidade: 1, datas: ["2026-10-08"], efeitos: [] });
    expect(texto(aviso!)).toBe(
      "Este lançamento tem pagamento registrado em 08/10/26. Nenhum Saldo pendente muda.",
    );
  });

  it("Fórmula que não calcula (divisão por zero) fica de fora", () => {
    const quebrado = {
      id: "b-x",
      nome: "Quebrado",
      de_cobranca: true,
      formula: { tipo: "operacao", operacao: "divisao", esquerda: resp("mae"), direita: { tipo: "numero", valor: "0" } } as Formula,
    };
    expect(avisarMudancaComPagamento(entrada({ blocos: [quebrado] }))?.efeitos).toEqual([]);
  });

  it("uma exclusão em lote conta as linhas com Pagamento e junta as datas", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { status_id: PAGO }), linha("b", { status_id: PAGO }), linha("c")],
        mudancas: [
          { id: "a", patch: { excluido_em: EXCLUIDO } },
          { id: "b", patch: { excluido_em: EXCLUIDO } },
          { id: "c", patch: { excluido_em: EXCLUIDO } },
        ],
        itens: [item("a", 31_067, "p1"), item("b", 31_067, "p2")],
        pagamentos: [...PAGAMENTOS, { id: "p2", data: "2026-10-12" }],
      }),
    );
    expect(aviso?.quantidade).toBe(2);
    expect(aviso?.datas).toEqual(["2026-10-08", "2026-10-12"]);
    expect(texto(aviso!)).toBe(
      "2 lançamentos têm pagamentos registrados em 08/10/26 e 12/10/26. O Saldo pendente do Bloco Mãe muda de R$ 310,67 para - R$ 621,34.",
    );
  });
});

describe("avisarMudancaComPagamento: editar", () => {
  it("o Valor de uma linha parcialmente paga muda o Saldo: o aviso traz de R$ X para R$ Y", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { valor_centavos: 20_000 })],
        itens: [item("a", 5_000, "p1", { status_aplicado_id: null })],
        mudancas: [{ id: "a", patch: { valor_centavos: 30_000 } }],
      }),
    );
    expect(aviso?.efeitos).toEqual([{ blocoId: "b-mae", nome: "Mãe", antesCentavos: 15_000, depoisCentavos: 25_000 }]);
  });

  it("o Valor de uma linha paga por inteiro não move o Saldo, mas avisa (o Pagamento deixa de bater)", () => {
    const aviso = avisarMudancaComPagamento(entrada({ mudancas: [{ id: "a", patch: { valor_centavos: 40_000 } }] }));
    expect(aviso).toEqual({ quantidade: 1, datas: ["2026-10-08"], efeitos: [] });
  });

  it("mudar o Responsável de uma linha paga parcialmente move o Saldo de dois Blocos", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { valor_centavos: 20_000 })],
        itens: [item("a", 5_000, "p1", { status_aplicado_id: null })],
        mudancas: [{ id: "a", patch: { responsavel_id: "rangel" } }],
        blocos: [MAE, RANGEL],
      }),
    );
    expect(aviso?.efeitos.map((e) => [e.nome, e.antesCentavos, e.depoisCentavos])).toEqual([
      ["Mãe", 15_000, 0],
      ["Rangel", 0, 15_000],
    ]);
  });

  it("mudar o Tipo sem mexer em nenhum Saldo, o Responsável ou o Valor não avisa", () => {
    expect(avisarMudancaComPagamento(entrada({ mudancas: [{ id: "a", patch: { tipo_id: "lazer" } }] }))).toBeNull();
  });

  it("um Status pago à mão numa linha parcial move o Saldo e avisa", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { valor_centavos: 20_000 })],
        itens: [item("a", 5_000, "p1", { status_aplicado_id: null })],
        mudancas: [{ id: "a", patch: { status_id: PAGO } }],
      }),
    );
    expect(aviso?.efeitos).toEqual([{ blocoId: "b-mae", nome: "Mãe", antesCentavos: 15_000, depoisCentavos: 0 }]);
  });

  it("uma linha sem Pagamento não avisa, nem editando o Valor", () => {
    expect(
      avisarMudancaComPagamento(entrada({ itens: [], mudancas: [{ id: "a", patch: { valor_centavos: 1 } }] })),
    ).toBeNull();
  });

  it("não olha o Mês: a conta é a de todos os Meses (a mesma do cartão de Recebimentos)", () => {
    const aviso = avisarMudancaComPagamento(
      entrada({
        lancamentos: [linha("a", { status_id: PAGO }), linha("outra", { mes: "2026-09", valor_centavos: 1_000 })],
      }),
    );
    expect(aviso?.efeitos).toEqual([{ blocoId: "b-mae", nome: "Mãe", antesCentavos: 1_000, depoisCentavos: -30_067 }]);
  });
});

describe("rotuloDatasDoPagamento e o texto", () => {
  it("uma, duas, três e muitas datas", () => {
    expect(rotuloDatasDoPagamento(["2026-10-08"])).toBe("08/10/26");
    expect(rotuloDatasDoPagamento(["2026-10-08", "2026-10-12"])).toBe("08/10/26 e 12/10/26");
    expect(rotuloDatasDoPagamento(["2026-10-08", "2026-10-12", "2026-10-15"])).toBe("08/10/26, 12/10/26 e 15/10/26");
    expect(rotuloDatasDoPagamento(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-20"])).toBe("4 datas, de 01/10/26 a 20/10/26");
  });

  it("vários Blocos viram frases ligadas por ponto e vírgula", () => {
    expect(
      texto({
        quantidade: 1,
        datas: ["2026-10-08"],
        efeitos: [
          { blocoId: "1", nome: "Mãe", antesCentavos: 0, depoisCentavos: -100 },
          { blocoId: "2", nome: "Rangel", antesCentavos: 500, depoisCentavos: 450 },
        ],
      }),
    ).toBe(
      "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 0,00 para - R$ 1,00; o do Bloco Rangel muda de R$ 5,00 para R$ 4,50.",
    );
  });
});
