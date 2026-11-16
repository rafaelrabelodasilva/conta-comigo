import { describe, expect, it } from "vitest";
import { avaliar, type Formula } from "./formula";
import {
  linhaDaFormulaPendente,
  pendentesDosLancamentos,
  projetarPainel,
  projetarPendente,
  type LancamentoParaPendente,
  type OpcoesDoPendente,
} from "./projecoes";

// `projetarPendente` (História 6.5, AD-10, AD-11): as linhas que `avaliar` recebe em Recebimentos, de todos os
// Meses, com o `restante` de cada Lançamento não pago e a linha de crédito de algo pago e depois excluído.

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const EXCLUIDO = "2026-11-12T12:00:00Z";

const linha = (id: string, extra: Partial<LancamentoParaPendente> = {}): LancamentoParaPendente => ({
  id,
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: 10_000,
  responsavel_id: "mae",
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

const opcoes = (extra: Partial<OpcoesDoPendente> = {}): OpcoesDoPendente => ({
  statusPagos: new Set([PAGO]),
  itens: [],
  ...extra,
});

const item = (lancamento_id: string, valor_centavos: number, extra: { excluido_em?: string | null } = {}) => ({
  lancamento_id,
  valor_centavos,
  ...extra,
});

const ids = (linhas: readonly { id: string }[]) => linhas.map((l) => l.id);

describe("projetarPendente: o que entra", () => {
  it("o valor cheio de quem não está pago, de todos os Meses", () => {
    const linhas = [linha("a"), linha("b", { mes: "2026-09", valor_centavos: 2_500 }), linha("c", { mes: "2026-11" })];
    expect(projetarPendente(linhas, opcoes())).toEqual([
      { id: "a", valor_centavos: 10_000, responsavel_id: "mae", tipo_id: "casa" },
      { id: "b", valor_centavos: 2_500, responsavel_id: "mae", tipo_id: "casa" },
      { id: "c", valor_centavos: 10_000, responsavel_id: "mae", tipo_id: "casa" },
    ]);
  });

  it("sem Status vale não pago; Status que conta como pago fica de fora", () => {
    const linhas = [linha("sem", { status_id: null }), linha("pago", { status_id: PAGO }), linha("nao")];
    expect(ids(projetarPendente(linhas, opcoes()))).toEqual(["sem", "nao"]);
  });

  it("um Pago parcialmente entra só com o que falta (AD-10)", () => {
    const r = projetarPendente([linha("a")], opcoes({ itens: [item("a", 4_000)] }));
    expect(r).toEqual([{ id: "a", valor_centavos: 6_000, responsavel_id: "mae", tipo_id: "casa" }]);
  });

  it("os itens que já cobrem o valor todo, sem Status pago, não deixam nada a cobrar", () => {
    expect(projetarPendente([linha("a")], opcoes({ itens: [item("a", 10_000)] }))).toEqual([]);
  });

  it("vários itens da mesma linha somam; item de um Pagamento desfeito não conta", () => {
    const itens = [item("a", 3_000), item("a", 2_000), item("a", 4_000, { excluido_em: EXCLUIDO })];
    expect(projetarPendente([linha("a")], opcoes({ itens }))[0]?.valor_centavos).toBe(5_000);
  });

  it("um Status pago manda: itens numa linha paga não reduzem nada (o restante já é zero)", () => {
    expect(projetarPendente([linha("a", { status_id: PAGO })], opcoes({ itens: [item("a", 4_000)] }))).toEqual([]);
  });

  it("valor zero não entra; crédito (estorno) não pago entra negativo e reduz o saldo", () => {
    const linhas = [linha("zero", { valor_centavos: 0 }), linha("estorno", { valor_centavos: -2_000 })];
    expect(projetarPendente(linhas, opcoes())).toEqual([
      { id: "estorno", valor_centavos: -2_000, responsavel_id: "mae", tipo_id: "casa" },
    ]);
  });

  it("o histórico da planilha não é previsto: entra se o Status não conta como pago", () => {
    const linhas = [linha("h1", { lancado_por: "historico", mes: "2026-03" }), linha("h2", { lancado_por: "historico", status_id: PAGO })];
    expect(ids(projetarPendente(linhas, opcoes()))).toEqual(["h1"]);
  });

  it("as linhas excluídas sem Pagamento nunca entram", () => {
    expect(projetarPendente([linha("a", { excluido_em: EXCLUIDO })], opcoes())).toEqual([]);
  });

  it("um Mês só, para o 'Falta receber' do Painel", () => {
    const linhas = [linha("a"), linha("b", { mes: "2026-09" }), linha("c", { mes: "2026-11" })];
    expect(ids(projetarPendente(linhas, opcoes({ mes: "2026-09" })))).toEqual(["b"]);
    expect(ids(projetarPendente(linhas, opcoes({ mes: "2026-12" })))).toEqual([]);
  });

  it("não muda a lista recebida", () => {
    const linhas = [linha("a"), linha("b")];
    const copia = structuredClone(linhas);
    projetarPendente(linhas, opcoes({ itens: [item("a", 100)] }));
    expect(linhas).toEqual(copia);
  });
});

describe("projetarPendente: previstos", () => {
  it("a parcela prevista da Série (`sistema`) não entra: ainda não é o que se cobra", () => {
    expect(projetarPendente([linha("p", { lancado_por: "sistema" })], opcoes())).toEqual([]);
  });

  it("a Conta manual de um Mês sem Fatura é previsto; com a Fatura importada, entra", () => {
    const conta = linha("silvia", { lancado_por: "manual", conta_manual_id: "c1", mes: "2026-12" });
    expect(projetarPendente([conta], opcoes({ mesesComFatura: new Set(["2026-10"]) }))).toEqual([]);
    expect(ids(projetarPendente([conta], opcoes({ mesesComFatura: new Set(["2026-12"]) })))).toEqual(["silvia"]);
  });

  it("sem a lista de Meses com Fatura, vale 'todos têm Fatura' (como no atraso)", () => {
    const conta = linha("silvia", { lancado_por: "manual", conta_manual_id: "c1", mes: "2026-12" });
    expect(ids(projetarPendente([conta], opcoes()))).toEqual(["silvia"]);
  });

  it("um Lançamento feito à mão no app (`manual` sem Conta) nunca é previsto", () => {
    const solto = linha("x", { lancado_por: "manual", mes: "2026-12" });
    expect(ids(projetarPendente([solto], opcoes({ mesesComFatura: new Set() })))).toEqual(["x"]);
  });
});

describe("projetarPendente: Divisão e Ajuste", () => {
  it("a mãe dividida não entra; valem as partes, cada uma com o Status dela", () => {
    const linhas = [
      linha("mae", { responsavel_id: null, valor_centavos: 46_600, divisao: { modo: "valor", partes: [] } }),
      linha("f1", { dividido_de_id: "mae", valor_centavos: 31_067, responsavel_id: "mae" }),
      linha("f2", { dividido_de_id: "mae", valor_centavos: 15_533, responsavel_id: "casal", status_id: PAGO }),
    ];
    expect(projetarPendente(linhas, opcoes())).toEqual([
      { id: "f1", valor_centavos: 31_067, responsavel_id: "mae", tipo_id: "casa" },
    ]);
  });

  it("o Ajuste de centavos é uma linha com o restante dele; pago com a parcela, sai com ela", () => {
    const aberto = [linha("p"), linha("aj", { ajuste_de_id: "p", valor_centavos: -8 })];
    expect(projetarPendente(aberto, opcoes()).map((l) => l.valor_centavos)).toEqual([10_000, -8]);
    const pagos = [linha("p", { status_id: PAGO }), linha("aj", { ajuste_de_id: "p", valor_centavos: -8, status_id: PAGO })];
    expect(projetarPendente(pagos, opcoes())).toEqual([]);
  });

  it("um Ajuste que ficou em aberto depois do 'Fica pendente' continua a cobrar (restante dele)", () => {
    const linhas = [linha("p", { status_id: PAGO }), linha("aj", { ajuste_de_id: "p", valor_centavos: 3 })];
    expect(projetarPendente(linhas, opcoes())).toEqual([{ id: "aj", valor_centavos: 3, responsavel_id: "mae", tipo_id: "casa" }]);
  });
});

describe("projetarPendente: a linha de crédito de algo pago e depois excluído (AD-11)", () => {
  it("vira uma linha negativa de -Σ itens, do Responsável e do Tipo da linha excluída", () => {
    const r = pendentesDosLancamentos([linha("a", { status_id: PAGO, excluido_em: EXCLUIDO, valor_centavos: 31_067 })], opcoes({ itens: [item("a", 31_067)] }));
    expect(r).toEqual([
      {
        id: "a",
        mes: "2026-10",
        responsavel_id: "mae",
        tipo_id: "casa",
        restanteCentavos: -31_067,
        valorCentavos: 0,
        recebidoCentavos: 31_067,
        credito: true,
      },
    ]);
    expect(linhaDaFormulaPendente(r[0]!).valor_centavos).toBe(-31_067);
  });

  it("o Saldo do Bloco reflete o crédito (da exclusão do EXPERIENCE: de R$ 0,00 para - R$ 310,67)", () => {
    const formula: Formula = { tipo: "responsavel", id: "mae" };
    const linhas = [linha("a", { status_id: PAGO, excluido_em: EXCLUIDO, valor_centavos: 31_067 })];
    const a = avaliar(formula, projetarPendente(linhas, opcoes({ itens: [item("a", 31_067)] })));
    expect(a.ok && a.valor.valorCentavos).toBe(-31_067);
  });

  it("excluída depois de um pagamento parcial: o que já entrou vira crédito", () => {
    const r = projetarPendente([linha("a", { excluido_em: EXCLUIDO })], opcoes({ itens: [item("a", 4_000)] }));
    expect(r.map((l) => l.valor_centavos)).toEqual([-4_000]);
  });

  it("um Pagamento desfeito (item excluído) não deixa crédito", () => {
    expect(projetarPendente([linha("a", { excluido_em: EXCLUIDO })], opcoes({ itens: [item("a", 4_000, { excluido_em: EXCLUIDO })] }))).toEqual([]);
  });

  it("respeita o Mês pedido e vale em qualquer Mês", () => {
    const linhas = [linha("a", { mes: "2026-08", excluido_em: EXCLUIDO })];
    const itens = [item("a", 500)];
    expect(ids(projetarPendente(linhas, opcoes({ itens })))).toEqual(["a"]);
    expect(ids(projetarPendente(linhas, opcoes({ itens, mes: "2026-08" })))).toEqual(["a"]);
    expect(ids(projetarPendente(linhas, opcoes({ itens, mes: "2026-10" })))).toEqual([]);
  });
});

describe("projetarPendente com avaliar (AD-11)", () => {
  it("o Rangel aparece com a metade do Casal, somando todos os Meses", () => {
    const formula: Formula = {
      tipo: "operacao",
      operacao: "soma",
      esquerda: { tipo: "responsavel", id: "rangel" },
      direita: { tipo: "grupo", interno: { tipo: "operacao", operacao: "divisao", esquerda: { tipo: "responsavel", id: "casal" }, direita: { tipo: "numero", valor: "2" } } },
    };
    const linhas = [
      linha("a", { responsavel_id: "casal", mes: "2026-09", valor_centavos: 10_000 }),
      linha("b", { responsavel_id: "casal", mes: "2026-10", valor_centavos: 10_000 }),
      linha("c", { responsavel_id: "rangel", mes: "2026-10", valor_centavos: 1_000 }),
      linha("d", { responsavel_id: "casal", mes: "2026-10", valor_centavos: 4_000, status_id: PAGO }),
    ];
    const a = avaliar(formula, projetarPendente(linhas, opcoes()));
    expect(a.ok && a.valor.valorCentavos).toBe(11_000);
    expect(a.ok && a.valor.entram).toEqual(["a", "b", "c"]);
  });

  it("o mesmo número do Painel quando nada foi pago e tudo é da Fatura (AD-11)", () => {
    const formula: Formula = { tipo: "responsavel", id: "mae" };
    const linhas = [linha("a"), linha("b", { valor_centavos: 5_050 })];
    const doPendente = avaliar(formula, projetarPendente(linhas, opcoes()));
    const doPainel = avaliar(formula, projetarPainel(linhas, "2026-10"));
    expect(doPendente.ok && doPendente.valor.valorCentavos).toBe(15_050);
    expect(doPendente.ok && doPainel.ok && doPendente.valor.valorCentavos).toBe(doPainel.ok && doPainel.valor.valorCentavos);
  });
});
