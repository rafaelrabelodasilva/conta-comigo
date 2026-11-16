import { describe, expect, it } from "vitest";
import {
  compararHistorico,
  detalharPagamento,
  ehAjusteDeCentavos,
  filtrarHistorico,
  mesmoPlanoDeDesfazer,
  modoLido,
  resumirDesfazer,
  resumirPagamentos,
  responsaveisDoHistorico,
  type ItemDoDetalhe,
  type ItemDoPagamentoLido,
  type LinhaDoHistorico,
  type PagamentoLido,
} from "./historico-pagamentos";
import {
  classificarDesfazerPagamento,
  planejarDesfazerPagamento,
  planejarPagamento,
  projetarPagamento,
  type ItemParaDesfazer,
  type LancamentoParaPagar,
} from "./pagamento";

const CASAL = "r-casal";
const RANGEL = "r-rangel";
const MAE = "r-mae";

const pg = (id: string, data: string, extra: Partial<PagamentoLido> = {}): PagamentoLido => ({
  id,
  data,
  modo: "total",
  valor_recebido_centavos: 1000,
  created_at: `${data}T12:00:00.000000+00:00`,
  excluido_em: null,
  ...extra,
});
const it_ = (pagamento_id: string, lancamento_id: string, valor_centavos: number, excluido_em: string | null = null): ItemDoPagamentoLido => ({
  pagamento_id,
  lancamento_id,
  valor_centavos,
  excluido_em,
});
const mapa = (...ls: LinhaDoHistorico[]) => new Map(ls.map((l) => [l.id, l]));

describe("resumirPagamentos (a lista do Histórico)", () => {
  it("o Rangel paga a metade do Casal: o Pagamento mostra o valor RECEBIDO (não Σ itens), o modo e os dois Responsáveis", () => {
    const linhas = mapa(
      { id: "c1", responsavel_id: CASAL },
      { id: "c2", responsavel_id: CASAL },
      { id: "r1", responsavel_id: RANGEL },
    );
    const resumos = resumirPagamentos(
      [pg("p1", "2026-11-10", { modo: "minha_parte", valor_recebido_centavos: 281968 })],
      [it_("p1", "c1", 400000), it_("p1", "c2", 163935), it_("p1", "r1", 50)],
      linhas,
    );
    expect(resumos).toEqual([
      {
        id: "p1",
        data: "2026-11-10",
        modo: "minha_parte",
        valorRecebidoCentavos: 281968,
        quantidade: 3,
        // O Casal tem mais valor: vem primeiro.
        responsaveis: [
          { id: CASAL, centavos: 563935 },
          { id: RANGEL, centavos: 50 },
        ],
        criadoEm: "2026-11-10T12:00:00.000000+00:00",
      },
    ]);
  });

  it("o Ajuste de centavos segue a parcela e não conta como lançamento (mas o valor dele entra no Responsável)", () => {
    const linhas = mapa({ id: "a", responsavel_id: MAE }, { id: "aj", responsavel_id: MAE, ajuste_de_id: "a" });
    const [r] = resumirPagamentos([pg("p1", "2026-11-10")], [it_("p1", "a", 1000), it_("p1", "aj", -1)], linhas);
    expect(r.quantidade).toBe(1);
    expect(r.responsaveis).toEqual([{ id: MAE, centavos: 1001 }]);
    expect(ehAjusteDeCentavos({ id: "aj", ajuste_de_id: "a" })).toBe(true);
    expect(ehAjusteDeCentavos({ id: "a", ajuste_de_id: null })).toBe(false);
    // Uma linha que aponta para si mesma não é Ajuste.
    expect(ehAjusteDeCentavos({ id: "z", ajuste_de_id: "z" })).toBe(false);
  });

  it("a ordem é a data do Pagamento (mais nova primeiro), depois a criação e o id", () => {
    const linhas = mapa({ id: "l", responsavel_id: MAE });
    const resumos = resumirPagamentos(
      [
        pg("antigo", "2026-10-01"),
        pg("b", "2026-11-10", { created_at: "2026-11-10T09:00:00.000000+00:00" }),
        pg("a", "2026-11-10", { created_at: "2026-11-10T09:00:00.000000+00:00" }),
        pg("tarde", "2026-11-10", { created_at: "2026-11-10T18:00:00.000000+00:00" }),
      ],
      ["antigo", "b", "a", "tarde"].map((p) => it_(p, "l", 100)),
      linhas,
    );
    expect(resumos.map((r) => r.id)).toEqual(["tarde", "b", "a", "antigo"]);
    expect(compararHistorico(resumos[0], resumos[0])).toBe(0);
  });

  it("o Pagamento desfeito e o item desfeito não entram; um Pagamento sem item vivo ainda não aparece", () => {
    const linhas = mapa({ id: "l", responsavel_id: MAE }, { id: "m", responsavel_id: RANGEL });
    const resumos = resumirPagamentos(
      [
        pg("vivo", "2026-11-10"),
        pg("desfeito", "2026-11-09", { excluido_em: "2026-11-11T10:00:00Z" }),
        pg("sem-itens", "2026-11-08"),
        pg("so-item-desfeito", "2026-11-07"),
      ],
      [it_("vivo", "l", 100), it_("vivo", "m", 50, "2026-11-12T10:00:00Z"), it_("desfeito", "l", 100), it_("so-item-desfeito", "l", 100, "2026-11-12T10:00:00Z")],
      linhas,
    );
    expect(resumos.map((r) => r.id)).toEqual(["vivo"]);
    expect(resumos[0].quantidade).toBe(1);
    expect(resumos[0].responsaveis).toEqual([{ id: MAE, centavos: 100 }]);
  });

  it("linha sem Responsável (ou que ainda não foi lida) vale 'sem Responsável' e vai por último", () => {
    const [r] = resumirPagamentos(
      [pg("p", "2026-11-10")],
      [it_("p", "x", 5000), it_("p", "y", 100), it_("p", "z", 100)],
      mapa({ id: "x", responsavel_id: null }, { id: "y", responsavel_id: MAE }),
    );
    // "x" (sem Responsável, 50,00) e "z" (não lida, 1,00) são "sem Responsável"; o de maior valor vem primeiro.
    expect(r.responsaveis).toEqual([
      { id: null, centavos: 5100 },
      { id: MAE, centavos: 100 },
    ]);
    expect(r.quantidade).toBe(3);
  });

  it("um modo desconhecido vale total", () => {
    expect(modoLido("parcial")).toBe("parcial");
    expect(modoLido("minha_parte")).toBe("minha_parte");
    expect(modoLido("inventado")).toBe("total");
  });
});

describe("filtrarHistorico e responsaveisDoHistorico", () => {
  const linhas = mapa({ id: "c", responsavel_id: CASAL }, { id: "r", responsavel_id: RANGEL }, { id: "m", responsavel_id: MAE });
  const resumos = resumirPagamentos(
    [pg("misto", "2026-11-10"), pg("mae", "2026-11-09"), pg("casal", "2026-11-08")],
    [it_("misto", "c", 5000), it_("misto", "r", 100), it_("mae", "m", 100), it_("casal", "c", 100)],
    linhas,
  );

  it("sem filtro mostra todos", () => {
    expect(filtrarHistorico(resumos, null).map((r) => r.id)).toEqual(["misto", "mae", "casal"]);
  });

  it("um Pagamento misto (Casal e Rangel) aparece no filtro dos dois", () => {
    expect(filtrarHistorico(resumos, RANGEL).map((r) => r.id)).toEqual(["misto"]);
    expect(filtrarHistorico(resumos, CASAL).map((r) => r.id)).toEqual(["misto", "casal"]);
    expect(filtrarHistorico(resumos, MAE).map((r) => r.id)).toEqual(["mae"]);
    expect(filtrarHistorico(resumos, "ninguem")).toEqual([]);
  });

  it("os Responsáveis do filtro são os que aparecem em algum Pagamento", () => {
    expect([...responsaveisDoHistorico(resumos)].sort()).toEqual([CASAL, MAE, RANGEL]);
    expect(responsaveisDoHistorico([])).toEqual([]);
  });
});

describe("detalharPagamento", () => {
  const item = (lancamento_id: string, valor_centavos: number, aplicado: string | null = "pago"): ItemDoDetalhe => ({
    lancamento_id,
    valor_centavos,
    status_anterior_id: "np",
    status_aplicado_id: aplicado,
    created_at: "2026-11-10T10:00:00Z",
  });
  const l = (id: string, mes: string, extra: Record<string, unknown> = {}) => ({ id, mes, data: null, ordem_fatura: null, created_at: null, ajuste_de_id: null, ...extra });

  it("ordena por Mês, data e fatura, com o Ajuste logo depois da parcela", () => {
    const linhas = new Map([
      ["nov2", l("nov2", "2026-11", { ordem_fatura: 2 })],
      ["ajuste", l("ajuste", "2026-11", { ordem_fatura: 9, ajuste_de_id: "nov1" })],
      ["nov1", l("nov1", "2026-11", { ordem_fatura: 1 })],
      ["out", l("out", "2026-10", { ordem_fatura: 7 })],
    ]);
    const d = detalharPagamento(
      { modo: "total", valor_recebido_centavos: 400 },
      [item("nov2", 100), item("ajuste", -1), item("nov1", 200), item("out", 101)],
      linhas,
    );
    expect(d.linhas.map((x) => x.item.lancamento_id)).toEqual(["out", "nov1", "ajuste", "nov2"]);
    expect(d.linhas.map((x) => x.ehAjuste)).toEqual([false, false, true, false]);
    expect(d.quantidade).toBe(3);
    expect(d.quitadoCentavos).toBe(400);
    expect(d.minhaParteCentavos).toBeNull();
  });

  it("o item parcial é marcado e a linha que não veio da leitura vai por último, sem quebrar", () => {
    const d = detalharPagamento({ modo: "parcial", valor_recebido_centavos: 100 }, [item("sumida", 40), item("a", 60, null)], new Map([["a", l("a", "2026-10")]]));
    expect(d.linhas.map((x) => [x.item.lancamento_id, x.parcial, x.linha === null])).toEqual([
      ["a", true, false],
      ["sumida", false, true],
    ]);
  });

  it("minha parte: Σ itens − valor recebido (R$ 5.639,35 quitados, R$ 2.819,68 recebidos = R$ 2.819,67)", () => {
    const d = detalharPagamento(
      { modo: "minha_parte", valor_recebido_centavos: 281968 },
      [item("a", 563935)],
      new Map([["a", l("a", "2026-10")]]),
    );
    expect(d.minhaParteCentavos).toBe(281967);
    // Sem sobra (dado estranho) não há "minha parte".
    expect(detalharPagamento({ modo: "minha_parte", valor_recebido_centavos: 100 }, [item("a", 100)], new Map()).minhaParteCentavos).toBeNull();
  });
});

describe("classificarDesfazerPagamento e resumirDesfazer", () => {
  const item = (lancamento_id: string, aplicado: string | null, anterior: string | null, created_at: string): ItemParaDesfazer => ({
    lancamento_id,
    status_anterior_id: anterior,
    status_aplicado_id: aplicado,
    created_at,
  });

  it("cada item tem um destino: devolver, status mudou, Pagamento posterior ou parcial", () => {
    const itens = [
      item("a", "pago", "np", "2026-11-10T10:00:00Z"),
      item("b", "pago", "np", "2026-11-10T10:00:00Z"),
      item("c", "pago", "np", "2026-11-10T10:00:00Z"),
      item("d", null, "np", "2026-11-10T10:00:00Z"),
      item("e", "pago", "np", "2026-11-10T10:00:00Z"),
    ];
    const linhas = [
      { id: "a", status_id: "pago", updated_at: "u1" },
      { id: "b", status_id: "pix", updated_at: "u2" },
      { id: "c", status_id: "pago", updated_at: "u3" },
      { id: "d", status_id: "np", updated_at: "u4" },
      // "e" não veio.
    ];
    const c = classificarDesfazerPagamento(itens, linhas, [{ lancamento_id: "c", created_at: "2026-11-10T11:00:00Z" }]);
    expect(c.map((x) => [x.lancamento_id, x.destino])).toEqual([
      ["a", "devolver"],
      ["b", "status_mudou"],
      ["c", "pagamento_posterior"],
      ["d", "parcial"],
      ["e", "status_mudou"],
    ]);
    expect(c[0].devolver).toEqual({ lancamento_id: "a", status_id: "np", atualizado_em: "u1" });
    // O plano de sempre sai da mesma classificação.
    expect(planejarDesfazerPagamento(itens, linhas, [{ lancamento_id: "c", created_at: "2026-11-10T11:00:00Z" }])).toEqual({
      devolver: [{ lancamento_id: "a", status_id: "np", atualizado_em: "u1" }],
      mantidas: 3,
    });
    expect(resumirDesfazer(c)).toEqual({ voltam: 1, ficamStatusMudou: 2, ficamPagamentoPosterior: 1, parciais: 1 });
    // Os Ajustes de centavos seguem a parcela e não contam.
    expect(resumirDesfazer(c, new Set(["a", "d"]))).toEqual({ voltam: 0, ficamStatusMudou: 2, ficamPagamentoPosterior: 1, parciais: 0 });
  });

  it("um Pagamento posterior vence o Status mudado (um motivo só por linha)", () => {
    const c = classificarDesfazerPagamento(
      [item("a", "pago", "np", "2026-11-10T10:00:00Z")],
      [{ id: "a", status_id: "pix", updated_at: "u" }],
      [{ lancamento_id: "a", created_at: "2026-11-10T11:00:00Z" }],
    );
    expect(c[0].destino).toBe("pagamento_posterior");
  });

  it("duas leituras do plano são iguais só se cada linha tem o mesmo destino", () => {
    const a = [
      { lancamento_id: "a", destino: "devolver" as const },
      { lancamento_id: "b", destino: "parcial" as const },
    ];
    expect(mesmoPlanoDeDesfazer(a, [...a].reverse())).toBe(true);
    expect(mesmoPlanoDeDesfazer(a, [a[0], { lancamento_id: "b", destino: "status_mudou" }])).toBe(false);
    expect(mesmoPlanoDeDesfazer(a, [a[0]])).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// O teste de aceite do AD-10 com o núcleo inteiro: dois ou mais Pagamentos desfeitos fora de ordem
// não estragam o Status. Um "banco" em memória faz o que as RPCs fazem (grava o que o núcleo montou
// e devolve o que ele mandou); no banco de verdade o mesmo roteiro roda em test/integracao.

const PAGO = "pago";
const PIX = "pix";
const NP = "np";
const STATUS_PAGOS = new Set([PAGO, PIX]);

type LinhaDoBanco = LancamentoParaPagar;
type ItemDoBanco = {
  pagamento_id: string;
  lancamento_id: string;
  valor_centavos: number;
  status_anterior_id: string | null;
  status_aplicado_id: string | null;
  created_at: string;
  excluido_em: string | null;
};

class BancoDeMemoria {
  linhas = new Map<string, LinhaDoBanco>();
  itens: ItemDoBanco[] = [];
  pagamentos = new Map<string, { excluido_em: string | null; modo: string; valor: number }>();
  private relogio = 0;
  private tique(): string {
    this.relogio += 1;
    return `2026-11-10T10:${String(Math.floor(this.relogio / 60)).padStart(2, "0")}:${String(this.relogio % 60).padStart(2, "0")}.000000+00:00`;
  }

  linha(id: string, valor: number, mes = "2026-11", extra: Partial<LinhaDoBanco> = {}) {
    this.linhas.set(id, {
      id,
      mes,
      excluido_em: null,
      updated_at: this.tique(),
      valor_centavos: valor,
      status_id: NP,
      lancado_por: "manual",
      data: null,
      ordem_fatura: this.linhas.size + 1,
      created_at: null,
      dividido_de_id: null,
      divisao: null,
      ajuste_de_id: null,
      ...extra,
    });
  }

  private itensVivos = () => this.itens.filter((i) => i.excluido_em === null);

  /** Paga `ids` pelo núcleo (projeção, alocação e pedido) e grava como a RPC `aplicar_pagamento`. */
  pagar(id: string, ids: string[], valorTexto: string, diferenca: "pendente" | "minha_parte" | null = null, statusId = PAGO) {
    const projecao = projetarPagamento(new Set(ids), [...this.linhas.values()], { statusPagos: STATUS_PAGOS, itens: this.itensVivos() });
    const plano = planejarPagamento({ id, statusId, statusPagos: STATUS_PAGOS, data: "2026-11-10", valorTexto, hoje: "2026-11-10", projecao, diferenca });
    if (!plano.ok) throw new Error(plano.erro.codigo);
    const { pedido } = plano.valor;
    const quando = this.tique();
    this.pagamentos.set(id, { excluido_em: null, modo: pedido.modo, valor: pedido.valor_recebido_centavos });
    for (const i of pedido.itens) {
      const linha = this.linhas.get(i.lancamento_id)!;
      this.itens.push({
        pagamento_id: id,
        lancamento_id: i.lancamento_id,
        valor_centavos: i.valor_centavos,
        status_anterior_id: linha.status_id,
        status_aplicado_id: i.quita ? statusId : null,
        created_at: quando,
        excluido_em: null,
      });
      this.linhas.set(linha.id, { ...linha, status_id: i.quita ? statusId : linha.status_id, updated_at: this.tique() });
    }
    return pedido;
  }

  /** Desfaz como o repositório: o núcleo classifica e a RPC grava o que ele mandou. */
  desfazer(id: string) {
    const meus = this.itensVivos().filter((i) => i.pagamento_id === id);
    const ids = meus.map((i) => i.lancamento_id);
    const linhas = ids.map((l) => this.linhas.get(l)!);
    const outros = this.itensVivos().filter((i) => i.pagamento_id !== id && ids.includes(i.lancamento_id));
    const plano = planejarDesfazerPagamento(meus, linhas, outros);
    const agora = this.tique();
    this.pagamentos.get(id)!.excluido_em = agora;
    for (const i of meus) i.excluido_em = agora;
    for (const d of plano.devolver) this.linhas.set(d.lancamento_id, { ...this.linhas.get(d.lancamento_id)!, status_id: d.status_id, updated_at: this.tique() });
    return plano;
  }

  status = (id: string) => this.linhas.get(id)!.status_id;
  restante = (id: string) => {
    const l = this.linhas.get(id)!;
    const pago = this.itensVivos().filter((i) => i.lancamento_id === id).reduce((s, i) => s + i.valor_centavos, 0);
    return STATUS_PAGOS.has(l.status_id ?? "") ? 0 : l.valor_centavos - pago;
  };
  nada = () => this.itensVivos().length === 0;
}

function permutacoes<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) => permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)]).map((r) => [x, ...r]));
}

describe("dois ou mais Pagamentos desfeitos fora de ordem não estragam o Status (AD-10, aceite da 6.3)", () => {
  it("parcial e depois o que fecha a linha: nas duas ordens as linhas voltam a 'não pago', sem itens", () => {
    for (const ordem of permutacoes(["p1", "p2"])) {
      const b = new BancoDeMemoria();
      b.linha("a", 21516);
      b.linha("b", 5000);
      // P1: o Lucas paga R$ 100,00 de A (Fica pendente). P2: paga o que falta de A e quita B.
      b.pagar("p1", ["a"], "100,00", "pendente");
      expect(b.status("a")).toBe(NP);
      expect(b.restante("a")).toBe(11516);
      b.pagar("p2", ["a", "b"], "165,16");
      expect(b.status("a")).toBe(PAGO);
      expect(b.status("b")).toBe(PAGO);
      for (const p of ordem) b.desfazer(p);
      expect([b.status("a"), b.status("b")], ordem.join()).toEqual([NP, NP]);
      expect(b.nada()).toBe(true);
      expect(b.restante("a")).toBe(21516);
    }
  });

  it("desfazer só o parcial deixa o Pagamento que fechou valendo; desfazer só o que fechou devolve a linha com o parcial vivo", () => {
    const b = new BancoDeMemoria();
    b.linha("a", 21516);
    b.pagar("p1", ["a"], "100,00", "pendente");
    b.pagar("p2", ["a"], "115,16");
    const antes = b.desfazer("p1");
    // O parcial nunca mudou o Status: nada a devolver e nada mantido.
    expect(antes).toEqual({ devolver: [], mantidas: 0 });
    expect(b.status("a")).toBe(PAGO);
    const c = new BancoDeMemoria();
    c.linha("a", 21516);
    c.pagar("p1", ["a"], "100,00", "pendente");
    c.pagar("p2", ["a"], "115,16");
    c.desfazer("p2");
    expect(c.status("a")).toBe(NP);
    // O parcial de P1 continua: faltam R$ 115,16.
    expect(c.restante("a")).toBe(11516);
  });

  it("três Pagamentos na mesma linha (dois parciais e o que fecha): as seis ordens de desfazer terminam no começo", () => {
    for (const ordem of permutacoes(["p1", "p2", "p3"])) {
      const b = new BancoDeMemoria();
      b.linha("a", 21516);
      b.pagar("p1", ["a"], "50,00", "pendente");
      b.pagar("p2", ["a"], "30,00", "pendente");
      b.pagar("p3", ["a"], "135,16");
      expect(b.status("a")).toBe(PAGO);
      for (const p of ordem) b.desfazer(p);
      expect(b.status("a"), ordem.join()).toBe(NP);
      expect(b.restante("a")).toBe(21516);
      expect(b.nada()).toBe(true);
    }
  });

  it("minha parte e um total em linhas diferentes, desfeitos em qualquer ordem, devolvem tudo", () => {
    for (const ordem of permutacoes(["p1", "p2"])) {
      const b = new BancoDeMemoria();
      b.linha("casal1", 400000);
      b.linha("casal2", 163935);
      b.linha("mae", 12000);
      b.pagar("p1", ["casal1", "casal2"], "2.819,68", "minha_parte");
      b.pagar("p2", ["mae"], "120,00");
      expect(["casal1", "casal2", "mae"].map(b.status)).toEqual([PAGO, PAGO, PAGO]);
      for (const p of ordem) b.desfazer(p);
      expect(["casal1", "casal2", "mae"].map(b.status), ordem.join()).toEqual([NP, NP, NP]);
      expect(b.nada()).toBe(true);
    }
  });

  it("um Status mudado à mão para outro 'pago' não é estragado ao desfazer, em qualquer ordem", () => {
    for (const ordem of permutacoes(["p1", "p2"])) {
      const b = new BancoDeMemoria();
      b.linha("a", 4000);
      b.linha("c", 6000);
      b.linha("d", 3000);
      b.pagar("p1", ["a", "c"], "100,00");
      b.pagar("p2", ["d"], "30,00");
      // Rafael troca à mão o Status de "c" para Pix (outro que conta como pago): não é o que o Pagamento aplicou.
      b.linhas.set("c", { ...b.linhas.get("c")!, status_id: PIX, updated_at: "mexido" });
      for (const p of ordem) b.desfazer(p);
      expect([b.status("a"), b.status("c"), b.status("d")], ordem.join()).toEqual([NP, PIX, NP]);
      expect(b.nada()).toBe(true);
    }
  });
});

describe("o segundo Pagamento que toca a mesma linha com Status aplicado", () => {
  it("só o posterior vale: desfazer o mais antigo primeiro mantém a linha; o mais novo devolve", () => {
    // P1 quitou a linha (NP → pago); depois o Status "pago" deixou de contar e P2 a quitou de novo (NP-like → pix).
    const p1 = [{ lancamento_id: "a", status_anterior_id: NP, status_aplicado_id: PAGO, created_at: "2026-11-10T10:00:00Z" }];
    const p2 = [{ lancamento_id: "a", status_anterior_id: PAGO, status_aplicado_id: PIX, created_at: "2026-11-10T11:00:00Z" }];
    const linha = [{ id: "a", status_id: PIX, updated_at: "u" }];
    // Desfazer P1 primeiro: P2 é posterior; a linha fica como está.
    expect(planejarDesfazerPagamento(p1, linha, [{ lancamento_id: "a", created_at: p2[0].created_at }])).toEqual({ devolver: [], mantidas: 1 });
    // Desfazer P2 primeiro: volta ao Status que tinha (pago de P1). Depois P1 já não tem posterior, mas o Status atual é o de P1: devolve o NP.
    const volta = planejarDesfazerPagamento(p2, linha, [{ lancamento_id: "a", created_at: p1[0].created_at }]);
    expect(volta.devolver).toEqual([{ lancamento_id: "a", status_id: PAGO, atualizado_em: "u" }]);
    const aposP2 = [{ id: "a", status_id: PAGO, updated_at: "u2" }];
    expect(planejarDesfazerPagamento(p1, aposP2, []).devolver).toEqual([{ lancamento_id: "a", status_id: NP, atualizado_em: "u2" }]);
  });
});
