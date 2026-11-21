import { describe, expect, it } from "vitest";
import { planejarMarcasDoBloco, type Bloco } from "./blocos";
import type { Formula } from "./formula";
import {
  blocosDeCobranca,
  faltaReceberDoMes,
  idsSelecionaveis,
  listaEmAberto,
  montarCartoesDeCobranca,
  recebidoNoMes,
} from "./recebimentos";
import { atrasosDasLinhas } from "./atraso";
import { pendentesDosLancamentos, type LancamentoParaPendente, type LinhaPendente } from "./projecoes";

// Recebimentos por Bloco de cobrança (História 6.5): os cartões, o "Falta receber" e o "Recebido no mês" do
// hero e a lista "Ver". Tudo puro: as contas são `avaliar` sobre `projetarPendente`.

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const resp = (id: string): Formula => ({ tipo: "responsavel", id });
const metadeDoCasal: Formula = {
  tipo: "operacao",
  operacao: "soma",
  esquerda: resp("rangel"),
  direita: {
    tipo: "grupo",
    interno: { tipo: "operacao", operacao: "divisao", esquerda: resp("casal"), direita: { tipo: "numero", valor: "2" } },
  },
};
const divisaoPorZero: Formula = {
  tipo: "operacao",
  operacao: "divisao",
  esquerda: resp("lucas"),
  direita: { tipo: "numero", valor: "0" },
};

const bloco = (id: string, nome: string, formula: Formula, extra: Partial<Bloco> = {}): Bloco => ({
  id,
  nome,
  formula,
  ordem: 1,
  de_cobranca: true,
  meu_bloco: false,
  ...extra,
});

const lancamento = (id: string, extra: Partial<LancamentoParaPendente> = {}): LancamentoParaPendente => ({
  id,
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: 10_000,
  responsavel_id: "lucas",
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

const pendentes = (linhas: LancamentoParaPendente[], itens: { lancamento_id: string; valor_centavos: number }[] = []) =>
  pendentesDosLancamentos(linhas, { statusPagos: new Set([PAGO]), itens, hoje: "2026-10-15" });

const SEM_ATRASO = new Map<string, string>();
const lucas = bloco("b-lucas", "Lucas", resp("lucas"));

describe("blocosDeCobranca", () => {
  it("só os marcados 'Usar em Recebimentos'; 'meu Bloco' sozinho não vira cartão", () => {
    const blocos = [lucas, bloco("b-meu", "Meu", resp("rafael"), { meu_bloco: true, de_cobranca: false })];
    expect(blocosDeCobranca(blocos).map((b) => b.id)).toEqual(["b-lucas"]);
  });

  it("um Bloco 'meu' que também é de cobrança aparece", () => {
    const duplo = bloco("b-x", "Rafael", resp("rafael"), { meu_bloco: true, de_cobranca: true });
    expect(blocosDeCobranca([duplo]).map((b) => b.id)).toEqual(["b-x"]);
  });
});

describe("montarCartoesDeCobranca", () => {
  it("o Saldo pendente é a Fórmula sobre o que falta: o Rangel aparece com a metade do Casal", () => {
    const rangel = bloco("b-rangel", "Rangel", metadeDoCasal);
    const linhas = [
      lancamento("a", { responsavel_id: "casal", valor_centavos: 20_000, mes: "2026-09" }),
      lancamento("b", { responsavel_id: "casal", valor_centavos: 10_000 }),
      lancamento("c", { responsavel_id: "rangel", valor_centavos: 1_000 }),
    ];
    const [c] = montarCartoesDeCobranca([rangel], pendentes(linhas), SEM_ATRASO);
    expect(c?.saldoCentavos).toBe(16_000);
    expect(c?.mesesEmAberto).toEqual(["2026-09", "2026-10"]);
    expect(c?.ids).toEqual(["a", "b", "c"]);
    expect(c?.situacao).toBe("nao_pago");
  });

  it("um cartão por Bloco de cobrança, na ordem dos Blocos", () => {
    const mae = bloco("b-mae", "Mãe", resp("mae"));
    const cartoes = montarCartoesDeCobranca([mae, lucas, bloco("b-meu", "Meu", resp("rafael"), { de_cobranca: false, meu_bloco: true })], [], SEM_ATRASO);
    expect(cartoes.map((c) => c.nome)).toEqual(["Mãe", "Lucas"]);
  });

  it("com tudo pago o cartão fica 'Em dia', sem Meses em aberto", () => {
    const linhas = [lancamento("a", { status_id: PAGO }), lancamento("b", { status_id: PAGO, mes: "2026-09" })];
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas), SEM_ATRASO);
    expect(c).toMatchObject({ saldoCentavos: 0, situacao: "em_dia", mesesEmAberto: [], ids: [], atrasadoDesde: null });
  });

  it("'Atrasado' se ALGUM item do Bloco está atrasado; senão 'Não pago'", () => {
    const linhas = [lancamento("a"), lancamento("b", { mes: "2026-09" })];
    const atrasos = new Map([["b", "2026-10-17"]]);
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas), atrasos);
    expect(c).toMatchObject({ situacao: "atrasado", atrasadoDesde: "2026-10-17", mesesEmAberto: ["2026-09", "2026-10"] });
    expect(montarCartoesDeCobranca([lucas], pendentes(linhas), SEM_ATRASO)[0]?.situacao).toBe("nao_pago");
  });

  it("o atraso mais antigo é o da data: 'desde' é o menor primeiro dia", () => {
    const linhas = [lancamento("a"), lancamento("b", { mes: "2026-09" })];
    const atrasos = new Map([
      ["a", "2026-11-17"],
      ["b", "2026-10-17"],
    ]);
    expect(montarCartoesDeCobranca([lucas], pendentes(linhas), atrasos)[0]?.atrasadoDesde).toBe("2026-10-17");
  });

  it("um atraso de outro Bloco não pinta este cartão", () => {
    const linhas = [lancamento("a"), lancamento("z", { responsavel_id: "mae" })];
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas), new Map([["z", "2026-10-17"]]));
    expect(c?.situacao).toBe("nao_pago");
  });

  it("Pago parcialmente: o saldo é só o que falta (fecha a pendência da 6.2) e continua 'Não pago'", () => {
    const linhas = [lancamento("a", { valor_centavos: 21_516 })];
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas, [{ lancamento_id: "a", valor_centavos: 10_000 }]), SEM_ATRASO);
    expect(c?.saldoCentavos).toBe(11_516);
    expect(c?.situacao).toBe("nao_pago");
  });

  it("Fórmula que não calcula: sem Saldo, mas o selo vem dos itens", () => {
    const [c] = montarCartoesDeCobranca([bloco("b", "Quebrado", divisaoPorZero)], pendentes([lancamento("a")]), SEM_ATRASO);
    expect(c?.saldoCentavos).toBeNull();
    expect(c?.situacao).toBe("em_dia");
    expect(c?.ids).toEqual([]);
  });

  it("o crédito de algo pago e depois excluído reduz o Saldo e não abre um Mês", () => {
    const linhas = [
      lancamento("a", { valor_centavos: 5_000 }),
      lancamento("x", { status_id: PAGO, excluido_em: "2026-11-12T12:00:00Z", mes: "2026-08", valor_centavos: 2_000 }),
    ];
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas, [{ lancamento_id: "x", valor_centavos: 2_000 }]), SEM_ATRASO);
    expect(c?.saldoCentavos).toBe(3_000);
    expect(c?.mesesEmAberto).toEqual(["2026-10"]);
  });

  it("crédito maior que a dívida: saldo negativo, nada a cobrar ('Em dia')", () => {
    const linhas = [lancamento("x", { status_id: PAGO, excluido_em: "2026-11-12T12:00:00Z", valor_centavos: 9_000 })];
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas, [{ lancamento_id: "x", valor_centavos: 9_000 }]), SEM_ATRASO);
    expect(c).toMatchObject({ saldoCentavos: -9_000, situacao: "em_dia", mesesEmAberto: [] });
  });

  it("previsto não conta no Saldo (nem a Conta manual de um Mês sem Fatura)", () => {
    const linhas = [lancamento("p", { lancado_por: "sistema" }), lancamento("c", { lancado_por: "manual", conta_manual_id: "k", mes: "2026-12" })];
    const p = pendentesDosLancamentos(linhas, { statusPagos: new Set([PAGO]), itens: [], mesesComFatura: new Set(["2026-10"]), hoje: "2026-10-15" });
    expect(montarCartoesDeCobranca([lucas], p, SEM_ATRASO)[0]?.saldoCentavos).toBe(0);
  });

  it("a bolinha é a do Responsável quando o Bloco é de uma pessoa só", () => {
    expect(montarCartoesDeCobranca([lucas], [], SEM_ATRASO)[0]?.responsavelId).toBe("lucas");
    expect(montarCartoesDeCobranca([bloco("b", "R", metadeDoCasal)], [], SEM_ATRASO)[0]?.responsavelId).toBeNull();
  });
});

describe("os cartões com o atraso do núcleo (6.4), de todos os Meses", () => {
  const ciclo = [{ vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z", dia_fechamento: 1, dia_vencimento: 6 }];
  const ctx = (extra = {}) => ({
    statusPagos: new Set([PAGO]),
    configsCiclo: ciclo,
    vencimentosDasFaturas: new Map([
      ["2026-09", "2026-09-06"],
      ["2026-10", "2026-10-06"],
    ]),
    ...extra,
  });

  it("a linha de um Mês antigo, vencida há muito, deixa o cartão 'Atrasado' desde o dia certo", () => {
    const linhas = [lancamento("velha", { mes: "2026-09" }), lancamento("nova")];
    const atrasos = atrasosDasLinhas(linhas, "2026-10-17", 10, ctx());
    // Setembro vence 06/09: atrasa desde 17/09. Outubro vence 06/10: atrasa desde 17/10.
    expect(atrasos.get("velha")).toBe("2026-09-17");
    expect(atrasos.get("nova")).toBe("2026-10-17");
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas), atrasos);
    expect(c).toMatchObject({ situacao: "atrasado", atrasadoDesde: "2026-09-17" });
  });

  it("um Mês só de histórico da planilha com Status 'Não pago' não vira dívida nem atraso: o cartão fica 'Em dia' e os três concordam (Defeito 3, AD-10)", () => {
    const historico = [
      lancamento("h1", { mes: "2026-03", lancado_por: "historico" }),
      lancamento("h2", { mes: "2026-03", lancado_por: "historico", valor_centavos: 25_000 }),
    ];
    const atrasos = atrasosDasLinhas(historico, "2026-12-31", 10, ctx());
    expect(atrasos.size).toBe(0);
    const [c] = montarCartoesDeCobranca([lucas], pendentes(historico), atrasos);
    expect(c).toMatchObject({ saldoCentavos: 0, situacao: "em_dia", mesesEmAberto: [], ids: [], atrasadoDesde: null });
    // Com uma linha de Fatura de verdade em aberto, só ela conta.
    const junto = [...historico, lancamento("real", { mes: "2026-10" })];
    const [d] = montarCartoesDeCobranca([lucas], pendentes(junto), atrasosDasLinhas(junto, "2026-10-10", 10, ctx()));
    expect(d).toMatchObject({ saldoCentavos: 10_000, situacao: "nao_pago", ids: ["real"] });
  });

  it("em dia na véspera do primeiro dia de atraso: 'Não pago'", () => {
    const linhas = [lancamento("nova")];
    const atrasos = atrasosDasLinhas(linhas, "2026-10-16", 10, ctx());
    expect(montarCartoesDeCobranca([lucas], pendentes(linhas), atrasos)[0]?.situacao).toBe("nao_pago");
  });

  it("o parcial cujo restante venceu fica 'Atrasado' e o saldo é só o restante", () => {
    const linhas = [lancamento("a", { mes: "2026-09", valor_centavos: 10_000 })];
    const itens = [{ lancamento_id: "a", valor_centavos: 4_000 }];
    const atrasos = atrasosDasLinhas(linhas, "2026-10-17", 10, ctx({ recebidoCentavos: new Map([["a", 4_000]]) }));
    const [c] = montarCartoesDeCobranca([lucas], pendentes(linhas, itens), atrasos);
    expect(c).toMatchObject({ situacao: "atrasado", saldoCentavos: 6_000 });
  });
});

describe("faltaReceberDoMes (o 'Falta receber' do hero)", () => {
  const mae = bloco("b-mae", "Mãe", resp("mae"));
  const linhas = [
    lancamento("a", { responsavel_id: "mae", valor_centavos: 3_000 }),
    lancamento("b", { responsavel_id: "lucas", valor_centavos: 2_000 }),
    lancamento("c", { responsavel_id: "lucas", valor_centavos: 500, status_id: PAGO }),
    lancamento("d", { responsavel_id: "rafael", valor_centavos: 9_999 }),
  ];

  it("soma os Blocos de cobrança sobre o que está em aberto no Mês", () => {
    const f = faltaReceberDoMes([mae, lucas], pendentes(linhas));
    expect(f).toEqual({ totalCentavos: 5_000, blocos: 2, semValor: 0 });
  });

  it("sem Blocos de cobrança, nada a somar", () => {
    expect(faltaReceberDoMes([bloco("m", "Meu", resp("rafael"), { de_cobranca: false })], pendentes(linhas))).toEqual({
      totalCentavos: 0,
      blocos: 0,
      semValor: 0,
    });
  });

  it("um Bloco que não calcula fica de fora e é contado", () => {
    const f = faltaReceberDoMes([mae, bloco("q", "Q", divisaoPorZero)], pendentes(linhas));
    expect(f).toEqual({ totalCentavos: 3_000, blocos: 2, semValor: 1 });
  });

  describe("dois Blocos que citam a mesma linha somam uma vez só (Defeito 4)", () => {
    const casal: Formula = resp("casal");
    const metade: Formula = {
      tipo: "operacao",
      operacao: "divisao",
      esquerda: resp("casal"),
      direita: { tipo: "numero", valor: "2" },
    };
    const doCasal = [lancamento("c1", { responsavel_id: "casal", valor_centavos: 10_000 })];

    it("'Casal' e 'Casal ÷ 2' juntos: a linha entra uma vez, na Fórmula do primeiro Bloco", () => {
      const f = faltaReceberDoMes([bloco("b1", "Casal", casal, { ordem: 1 }), bloco("b2", "Casal ÷ 2", metade, { ordem: 2 })], pendentes(doCasal));
      // Antes (soma literal dos Blocos): R$ 100,00 + R$ 50,00 = R$ 150,00 para uma linha de R$ 100,00.
      expect(f).toEqual({ totalCentavos: 10_000, blocos: 2, semValor: 0 });
    });

    it("a ordem dos Blocos decide qual Fórmula vale (o de menor `ordem` primeiro, mesmo vindo depois na lista)", () => {
      const f = faltaReceberDoMes([bloco("b2", "Casal ÷ 2", metade, { ordem: 2 }), bloco("b1", "Casal", casal, { ordem: 1 })], pendentes(doCasal));
      expect(f.totalCentavos).toBe(10_000);
      const invertida = faltaReceberDoMes([bloco("b1", "Casal", casal, { ordem: 2 }), bloco("b2", "Casal ÷ 2", metade, { ordem: 1 })], pendentes(doCasal));
      expect(invertida.totalCentavos).toBe(5_000);
    });

    it("Blocos que citam linhas diferentes somam normalmente; a linha que os dois citam entra uma vez", () => {
      const rangel = bloco("b-rangel", "Rangel", metadeDoCasal, { ordem: 1 });
      const linhasMistas = [
        lancamento("r1", { responsavel_id: "rangel", valor_centavos: 4_000 }),
        lancamento("c1", { responsavel_id: "casal", valor_centavos: 10_000 }),
        lancamento("m1", { responsavel_id: "mae", valor_centavos: 3_000 }),
      ];
      // Rangel = 4.000 + 10.000 ÷ 2 = 9.000; "Casal" já não tem a linha do Casal (o Rangel a levou); Mãe = 3.000.
      const f = faltaReceberDoMes([rangel, bloco("b-casal", "Casal", casal, { ordem: 2 }), bloco("b-mae", "Mãe", resp("mae"), { ordem: 3 })], pendentes(linhasMistas));
      expect(f).toEqual({ totalCentavos: 12_000, blocos: 3, semValor: 0 });
    });

    it("o total nunca passa da soma das linhas distintas em aberto que algum Bloco cita", () => {
      const f = faltaReceberDoMes([bloco("b1", "A", casal), bloco("b2", "B", casal), bloco("b3", "C", casal)], pendentes(doCasal));
      expect(f.totalCentavos).toBe(10_000);
    });

    it("um Bloco que não calcula continua contado em semValor e não leva linha de ninguém", () => {
      const f = faltaReceberDoMes([bloco("q", "Q", divisaoPorZero, { ordem: 1 }), bloco("b1", "Casal", casal, { ordem: 2 })], pendentes(doCasal));
      expect(f).toEqual({ totalCentavos: 10_000, blocos: 2, semValor: 1 });
    });
  });

  it("o restante de um Pago parcialmente, não o valor cheio", () => {
    const f = faltaReceberDoMes([mae], pendentes(linhas, [{ lancamento_id: "a", valor_centavos: 1_000 }]));
    expect(f.totalCentavos).toBe(2_000);
  });

  it("tudo pago: zero", () => {
    expect(faltaReceberDoMes([mae, lucas], pendentes(linhas.map((l) => ({ ...l, status_id: PAGO }))))).toMatchObject({ totalCentavos: 0 });
  });
});

describe("recebidoNoMes (o 'Recebido no mês' do hero)", () => {
  const pagamento = (data: string, valor_recebido_centavos: number, excluido_em: string | null = null) => ({
    data,
    valor_recebido_centavos,
    excluido_em,
  });

  it("soma o valor recebido dos Pagamentos com data no Mês (calendário)", () => {
    const pagamentos = [
      pagamento("2026-10-01", 1_000),
      pagamento("2026-10-31", 2_000),
      pagamento("2026-09-30", 4_000),
      pagamento("2026-11-01", 8_000),
    ];
    expect(recebidoNoMes(pagamentos, "2026-10")).toBe(3_000);
    expect(recebidoNoMes(pagamentos, "2026-11")).toBe(8_000);
    expect(recebidoNoMes(pagamentos, "2026-12")).toBe(0);
  });

  it("um Pagamento desfeito não conta", () => {
    expect(recebidoNoMes([pagamento("2026-10-10", 1_000), pagamento("2026-10-11", 5_000, "2026-10-12T00:00:00Z")], "2026-10")).toBe(1_000);
  });

  it("é o valor RECEBIDO, não o que os itens quitaram (minha parte: R$ 2.819,68 de R$ 5.639,35)", () => {
    expect(recebidoNoMes([pagamento("2026-10-20", 281_968)], "2026-10")).toBe(281_968);
  });

  it("sem Pagamentos, zero", () => {
    expect(recebidoNoMes([], "2026-10")).toBe(0);
  });
});

describe("listaEmAberto (o 'Ver')", () => {
  type L = LancamentoParaPendente & { ordem_fatura: number | null; created_at?: string | null };
  const l = (id: string, extra: Partial<L> = {}): L => ({ ...lancamento(id), ordem_fatura: 1, ...extra });
  const montar = (lancs: L[], itens: { lancamento_id: string; valor_centavos: number }[] = [], ids?: string[]) => {
    const p = pendentes(lancs, itens);
    return listaEmAberto(ids ?? p.map((x) => x.id), lancs, p);
  };

  it("agrupa por Mês, do mais novo para o mais antigo; em cada Mês, a ordem da fatura", () => {
    const grupos = montar([
      l("a", { mes: "2026-09", ordem_fatura: 2 }),
      l("b", { mes: "2026-10", ordem_fatura: 5 }),
      l("c", { mes: "2026-09", ordem_fatura: 1 }),
      l("d", { mes: "2026-10", ordem_fatura: 3 }),
    ]);
    expect(grupos.map((g) => g.mes)).toEqual(["2026-10", "2026-09"]);
    expect(grupos.map((g) => g.itens.map((i) => i.pendente.id))).toEqual([["d", "b"], ["c", "a"]]);
  });

  it("só o que o Bloco usa (os ids da Fórmula)", () => {
    const grupos = montar([l("a"), l("b"), l("c")], [], ["a", "c"]);
    expect(grupos.flatMap((g) => g.itens.map((i) => i.pendente.id))).toEqual(["a", "c"]);
  });

  it("o valor de cada linha é o que falta (um Pago parcialmente mostra o restante)", () => {
    const [g] = montar([l("a")], [{ lancamento_id: "a", valor_centavos: 4_000 }]);
    expect(g?.itens[0]?.pendente).toMatchObject({ restanteCentavos: 6_000, recebidoCentavos: 4_000, credito: false });
  });

  it("o Ajuste fica sob a parcela dele; sem a parcela na lista, é uma linha própria", () => {
    const grupos = montar([l("p"), l("aj", { ajuste_de_id: "p", valor_centavos: -8, ordem_fatura: 2 })]);
    expect(grupos[0]?.itens.map((i) => i.pendente.id)).toEqual(["p"]);
    expect(grupos[0]?.itens[0]?.ajustes.map((a) => a.pendente.id)).toEqual(["aj"]);
    const soAjuste = montar([l("p", { status_id: PAGO }), l("aj", { ajuste_de_id: "p", valor_centavos: 3 })]);
    expect(soAjuste[0]?.itens.map((i) => i.pendente.id)).toEqual(["aj"]);
  });

  it("o crédito de algo excluído fica no fim do Mês e não é selecionável", () => {
    const lancs = [l("a", { ordem_fatura: 9 }), l("x", { status_id: PAGO, excluido_em: "2026-11-12T12:00:00Z", ordem_fatura: 1 })];
    const grupos = montar(lancs, [{ lancamento_id: "x", valor_centavos: 2_000 }]);
    expect(grupos[0]?.itens.map((i) => i.pendente.id)).toEqual(["a", "x"]);
    expect(grupos[0]?.itens[1]?.pendente.credito).toBe(true);
    expect(idsSelecionaveis(grupos)).toEqual(["a"]);
  });

  it("os ids selecionáveis são as parcelas e os Ajustes sem parcela, não os que ficam sob uma parcela", () => {
    const grupos = montar([l("p"), l("aj", { ajuste_de_id: "p", valor_centavos: -8 }), l("q", { mes: "2026-09" })]);
    expect(idsSelecionaveis(grupos).sort()).toEqual(["p", "q"]);
  });

  it("nada em aberto: lista vazia", () => {
    expect(montar([l("a", { status_id: PAGO })])).toEqual([]);
  });

  it("um id da Fórmula que o chamador não tem (ainda carregando) é ignorado", () => {
    const p: LinhaPendente[] = pendentes([l("a")]);
    expect(listaEmAberto(["a"], [], p)).toEqual([]);
  });
});

describe("planejarMarcasDoBloco (Configurações → Blocos de cobrança, UX-DR25)", () => {
  const b = bloco("b1", "Lucas", resp("lucas"), { ordem: 3, de_cobranca: false, meu_bloco: false });

  it("liga 'Usar em Recebimentos' e mantém nome, Fórmula e ordem", () => {
    expect(planejarMarcasDoBloco(b, { de_cobranca: true })).toEqual({
      p_id: "b1",
      p_nome: "Lucas",
      p_formula: resp("lucas"),
      p_ordem: 3,
      p_de_cobranca: true,
      p_meu_bloco: false,
    });
  });

  it("marca 'É o meu Bloco' sem mexer em cobrança; desligar não escolhe outro", () => {
    expect(planejarMarcasDoBloco({ ...b, de_cobranca: true }, { meu_bloco: true })).toMatchObject({ p_de_cobranca: true, p_meu_bloco: true });
    expect(planejarMarcasDoBloco({ ...b, meu_bloco: true }, { meu_bloco: false })).toMatchObject({ p_meu_bloco: false });
  });

  it("sem mudança, repete as marcas", () => {
    expect(planejarMarcasDoBloco({ ...b, de_cobranca: true, meu_bloco: true }, {})).toMatchObject({ p_de_cobranca: true, p_meu_bloco: true });
  });
});
