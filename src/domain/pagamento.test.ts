import { describe, expect, it } from "vitest";
import {
  alocarPagamento,
  campoDoErroDoPagamento,
  compararParaAlocar,
  diferencaDoPagamento,
  ehPago,
  faltaDoParcial,
  idsComPagamento,
  idsQuitadosPorPagamento,
  pagoParcialmente,
  lerDataDoPagamento,
  lerValorRecebido,
  planejarDesfazerPagamento,
  planejarPagamento,
  projetarPagamento,
  recusarStatusNaoPago,
  restante,
  textoDoValorRecebido,
  somaDosItens,
  type LancamentoParaPagar,
} from "./pagamento";

const PAGO = "st-pago";
const NAO_PAGO = "st-nao-pago";
const PAGOS = new Set([PAGO]);

let n = 0;
function lanc(parcial: Partial<LancamentoParaPagar> & { valor_centavos: number }): LancamentoParaPagar {
  n += 1;
  return {
    id: `l${n}`,
    mes: "2026-10",
    excluido_em: null,
    updated_at: `2026-11-10T12:00:0${n % 10}.000000+00:00`,
    status_id: NAO_PAGO,
    lancado_por: "fatura",
    data: null,
    ordem_fatura: n,
    created_at: null,
    dividido_de_id: null,
    divisao: null,
    ajuste_de_id: null,
    ...parcial,
  };
}

const sel = (...ids: string[]) => new Set(ids);

describe("ehPago e restante (AD-10)", () => {
  it("ehPago é o Status que conta como pago; sem Status vale não pago", () => {
    expect(ehPago({ status_id: PAGO }, PAGOS)).toBe(true);
    expect(ehPago({ status_id: NAO_PAGO }, PAGOS)).toBe(false);
    expect(ehPago({ status_id: null }, PAGOS)).toBe(false);
  });

  it("restante: pago é 0; senão valor menos o que os itens quitaram", () => {
    expect(restante({ status_id: PAGO, valor_centavos: 21516 }, PAGOS, 0)).toBe(0);
    expect(restante({ status_id: NAO_PAGO, valor_centavos: 21516 }, PAGOS)).toBe(21516);
    expect(restante({ status_id: null, valor_centavos: 21516 }, PAGOS, 10000)).toBe(11516);
    expect(restante({ status_id: NAO_PAGO, valor_centavos: -500 }, PAGOS)).toBe(-500);
  });

  it("os itens de um Pagamento desfeito não contam", () => {
    const itens = [
      { lancamento_id: "a", valor_centavos: 1000 },
      { lancamento_id: "a", valor_centavos: 500, excluido_em: null },
      { lancamento_id: "a", valor_centavos: 9999, excluido_em: "2026-11-10T00:00:00Z" },
      { lancamento_id: "b", valor_centavos: 700, excluido_em: "2026-11-10T00:00:00Z" },
    ];
    expect(somaDosItens(itens).get("a")).toBe(1500);
    expect(somaDosItens(itens).has("b")).toBe(false);
    expect([...idsComPagamento(itens)]).toEqual(["a"]);
  });
});

describe("projetarPagamento", () => {
  const nenhum = { statusPagos: PAGOS, itens: [] };

  it("entram as marcadas não pagas, com o restante e o total", () => {
    const a = lanc({ valor_centavos: 10000 });
    const b = lanc({ valor_centavos: 21516 });
    const c = lanc({ valor_centavos: 999 });
    const p = projetarPagamento(sel(a.id, b.id), [a, b, c], nenhum);
    expect(p.entram.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(p.totalCentavos).toBe(31516);
    expect(p.quantidade).toBe(2);
    expect(p.fora.quantidade).toBe(0);
  });

  it("de fora, com o motivo: previsto, já pago e R$ 0,00", () => {
    const prev = lanc({ valor_centavos: 5000, lancado_por: "sistema" });
    const pago = lanc({ valor_centavos: 5000, status_id: PAGO });
    const zero = lanc({ valor_centavos: 0 });
    const ok = lanc({ valor_centavos: 100 });
    const p = projetarPagamento(sel(prev.id, pago.id, zero.id, ok.id), [prev, pago, zero, ok], nenhum);
    expect(p.entram.map((i) => i.id)).toEqual([ok.id]);
    expect(p.fora).toEqual({ quantidade: 3, porMotivo: { ja_pago: 1, zero: 1, previsto: 1 } });
    expect(p.totalCentavos).toBe(100);
  });

  it("uma parcela de Conta manual entra (é `manual`), mesmo num Mês sem Fatura", () => {
    const conta = lanc({ valor_centavos: 10600, lancado_por: "manual" });
    const p = projetarPagamento(sel(conta.id), [conta], nenhum);
    expect(p.quantidade).toBe(1);
  });

  it("a mãe dividida nunca entra: o Pagamento recai sobre as partes, de mães diferentes", () => {
    const mae1 = lanc({ valor_centavos: 46600, divisao: { modo: "fracao", partes: [] } });
    const f1a = lanc({ valor_centavos: 31067, dividido_de_id: mae1.id });
    const f1b = lanc({ valor_centavos: 15533, dividido_de_id: mae1.id });
    const mae2 = lanc({ valor_centavos: 10000, divisao: { modo: "fracao", partes: [] } });
    const f2a = lanc({ valor_centavos: 5000, dividido_de_id: mae2.id });
    const p = projetarPagamento(sel(mae1.id, f1a.id, f2a.id), [mae1, f1a, f1b, mae2, f2a], nenhum);
    expect(p.entram.map((i) => i.id).sort()).toEqual([f1a.id, f2a.id].sort());
    expect(p.totalCentavos).toBe(36067);
  });

  it("o Status é por parte: uma parte já paga fica de fora e a outra entra", () => {
    const mae = lanc({ valor_centavos: 46600, divisao: { modo: "fracao", partes: [] } });
    const f1 = lanc({ valor_centavos: 31067, dividido_de_id: mae.id, status_id: PAGO });
    const f2 = lanc({ valor_centavos: 15533, dividido_de_id: mae.id });
    const p = projetarPagamento(sel(f1.id, f2.id), [mae, f1, f2], nenhum);
    expect(p.entram.map((i) => i.id)).toEqual([f2.id]);
    expect(p.fora.porMotivo.ja_pago).toBe(1);
  });

  it("o Ajuste entra junto com a parcela, com o restante dele, e não conta como lançamento", () => {
    const mae = lanc({ valor_centavos: 10000 });
    const ajuste = lanc({ valor_centavos: -8, ajuste_de_id: mae.id });
    const p = projetarPagamento(sel(mae.id), [mae, ajuste], nenhum);
    expect(p.entram.map((i) => i.id).sort()).toEqual([mae.id, ajuste.id].sort());
    expect(p.entram.find((i) => i.id === ajuste.id)?.ehAjuste).toBe(true);
    expect(p.totalCentavos).toBe(9992);
    expect(p.quantidade).toBe(1);
  });

  it("o Ajuste marcado junto com a mãe não vira um item à parte nem entra duas vezes", () => {
    const mae = lanc({ valor_centavos: 10000 });
    const ajuste = lanc({ valor_centavos: -8, ajuste_de_id: mae.id });
    const p = projetarPagamento(sel(mae.id, ajuste.id), [mae, ajuste], nenhum);
    expect(p.entram).toHaveLength(2);
    expect(p.totalCentavos).toBe(9992);
  });

  it("o Ajuste que já está pago não entra; o de uma parcela que já está paga também não", () => {
    const mae = lanc({ valor_centavos: 10000 });
    const ajustePago = lanc({ valor_centavos: -8, ajuste_de_id: mae.id, status_id: PAGO });
    expect(projetarPagamento(sel(mae.id), [mae, ajustePago], nenhum).totalCentavos).toBe(10000);
    const maePaga = lanc({ valor_centavos: 10000, status_id: PAGO });
    const ajuste = lanc({ valor_centavos: -8, ajuste_de_id: maePaga.id });
    const p = projetarPagamento(sel(maePaga.id), [maePaga, ajuste], nenhum);
    expect(p.entram).toHaveLength(0);
    expect(p.fora.quantidade).toBe(1);
  });

  it("um Ajuste marcado sem a parcela é um item como outro qualquer", () => {
    const mae = lanc({ valor_centavos: 10000 });
    const ajuste = lanc({ valor_centavos: -8, ajuste_de_id: mae.id });
    const p = projetarPagamento(sel(ajuste.id), [mae, ajuste], nenhum);
    expect(p.entram.map((i) => i.id)).toEqual([ajuste.id]);
    expect(p.totalCentavos).toBe(-8);
  });

  it("linha excluída não entra e não vira item de fora", () => {
    const a = lanc({ valor_centavos: 100, excluido_em: "2026-11-01T00:00:00Z" });
    const p = projetarPagamento(sel(a.id), [a], nenhum);
    expect(p.entram).toHaveLength(0);
    expect(p.fora.quantidade).toBe(0);
  });

  it("não supõe um Mês: junta Lançamentos de Meses diferentes, dos mais antigos para os mais novos", () => {
    const nov = lanc({ valor_centavos: 300, mes: "2026-11" });
    const set = lanc({ valor_centavos: 100, mes: "2026-09" });
    const out = lanc({ valor_centavos: 200, mes: "2026-10" });
    const p = projetarPagamento(sel(nov.id, set.id, out.id), [nov, set, out], nenhum);
    expect(p.entram.map((i) => i.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(p.totalCentavos).toBe(600);
  });

  it("os créditos vêm primeiro; no mesmo Mês, pela data e depois pela ordem da fatura", () => {
    const tarde = lanc({ valor_centavos: 100, data: "2026-10-20", ordem_fatura: 1 });
    const cedo = lanc({ valor_centavos: 100, data: "2026-10-05", ordem_fatura: 9 });
    const sem = lanc({ valor_centavos: 100, data: null, ordem_fatura: 2 });
    const credito = lanc({ valor_centavos: -50, data: "2026-10-28", ordem_fatura: 3 });
    const p = projetarPagamento(sel(tarde.id, cedo.id, sem.id, credito.id), [tarde, cedo, sem, credito], nenhum);
    expect(p.entram.map((i) => i.id)).toEqual([credito.id, cedo.id, tarde.id, sem.id]);
  });

  it("compararParaAlocar desempata pelo id", () => {
    const base = { mes: "2026-10", restanteCentavos: 1, atualizadoEm: "x", ehAjuste: false, credito: false, data: null, ordemFatura: 1, criadoEm: null };
    expect(compararParaAlocar({ ...base, id: "a", chaveId: "a" }, { ...base, id: "b", chaveId: "b" })).toBeLessThan(0);
    expect(compararParaAlocar({ ...base, id: "b", chaveId: "b" }, { ...base, id: "a", chaveId: "a" })).toBeGreaterThan(0);
  });

  it("o restante conta os itens já gravados (Status ainda não pago)", () => {
    const a = lanc({ valor_centavos: 21516 });
    const p = projetarPagamento(sel(a.id), [a], { statusPagos: PAGOS, itens: [{ lancamento_id: a.id, valor_centavos: 10000 }] });
    expect(p.totalCentavos).toBe(11516);
  });

  it("guarda o updated_at visto de cada linha (a trava da RPC)", () => {
    const a = lanc({ valor_centavos: 100, updated_at: "2026-11-10T12:00:00.123456+00:00" });
    const p = projetarPagamento(sel(a.id), [a], nenhum);
    expect(p.entram[0].atualizadoEm).toBe("2026-11-10T12:00:00.123456+00:00");
  });
});

describe("alocarPagamento (modo total)", () => {
  const dois = () => {
    const a = lanc({ valor_centavos: 10000, mes: "2026-10" });
    const b = lanc({ valor_centavos: 21516, mes: "2026-09" });
    return projetarPagamento(sel(a.id, b.id), [a, b], { statusPagos: PAGOS, itens: [] }).entram;
  };

  it("valor igual ao total: um item por linha com o restante, do mais antigo ao mais novo", () => {
    const entram = dois();
    const r = alocarPagamento(entram, 31516);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.modo).toBe("total");
    expect(r.valor.itens.map((i) => i.valor_centavos)).toEqual([21516, 10000]);
    expect(r.valor.itens.every((i) => i.quita)).toBe(true);
    expect(r.valor.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(31516);
  });

  it("maior que o total é recusado com o total no detalhe", () => {
    const r = alocarPagamento(dois(), 31517);
    expect(r).toEqual({ ok: false, erro: { codigo: "pagamento.valor_acima", detalhe: "31516" } });
  });

  it("menor que o total sem escolha pede a escolha, com a diferença no detalhe", () => {
    const r = alocarPagamento(dois(), 10000);
    expect(r).toEqual({ ok: false, erro: { codigo: "pagamento.diferenca_sem_escolha", detalhe: "21516" } });
  });

  it("valor igual ao total ignora a escolha da diferença: vira total", () => {
    const r = alocarPagamento(dois(), 31516, "minha_parte");
    expect(r.ok && r.valor.modo).toBe("total");
    const p = alocarPagamento(dois(), 31516, "pendente");
    expect(p.ok && p.valor.modo).toBe("total");
  });

  it("zero e negativo são recusados; sem linhas e total que não passa de zero também", () => {
    expect(alocarPagamento(dois(), 0)).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
    expect(alocarPagamento(dois(), -5)).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
    expect(alocarPagamento([], 100)).toMatchObject({ ok: false, erro: { codigo: "pagamento.sem_itens" } });
    const credito = lanc({ valor_centavos: -500 });
    const so = projetarPagamento(sel(credito.id), [credito], { statusPagos: PAGOS, itens: [] }).entram;
    expect(alocarPagamento(so, 500)).toMatchObject({ ok: false, erro: { codigo: "pagamento.nada_a_receber" } });
  });

  it("crédito e despesa juntos: o total é o líquido e o crédito vai primeiro", () => {
    const d = lanc({ valor_centavos: 10000 });
    const c = lanc({ valor_centavos: -2500 });
    const entram = projetarPagamento(sel(d.id, c.id), [d, c], { statusPagos: PAGOS, itens: [] }).entram;
    const r = alocarPagamento(entram, 7500);
    expect(r.ok && r.valor.itens.map((i) => i.valor_centavos)).toEqual([-2500, 10000]);
  });
});

describe("a diferença do Pagamento", () => {
  it("só há pergunta com 0 < recebido < total", () => {
    expect(diferencaDoPagamento(21516, 10000)).toBe(11516);
    expect(diferencaDoPagamento(563935, 281968)).toBe(281967);
    expect(diferencaDoPagamento(21516, 21516)).toBeNull();
    expect(diferencaDoPagamento(21516, 30000)).toBeNull();
    expect(diferencaDoPagamento(21516, 0)).toBeNull();
    expect(diferencaDoPagamento(0, 100)).toBeNull();
    expect(diferencaDoPagamento(-500, 100)).toBeNull();
  });
});

describe("alocarPagamento: Fica pendente (modo parcial)", () => {
  const projetar = (linhas: LancamentoParaPagar[], itens: { lancamento_id: string; valor_centavos: number }[] = []) =>
    projetarPagamento(new Set(linhas.map((l) => l.id)), linhas, { statusPagos: PAGOS, itens }).entram;
  const alocar = (entram: ReturnType<typeof projetar>, recebido: number) => {
    const r = alocarPagamento(entram, recebido, "pendente");
    if (!r.ok) throw new Error(r.erro.codigo);
    return r.valor;
  };

  it("o Lucas: R$ 100,00 de R$ 215,16 num lançamento só: item parcial, ficam R$ 115,16", () => {
    const a = lanc({ valor_centavos: 21516 });
    const r = alocar(projetar([a]), 10000);
    expect(r.modo).toBe("parcial");
    expect(r.itens).toEqual([{ lancamento_id: a.id, valor_centavos: 10000, atualizado_em: a.updated_at, quita: false }]);
    expect(restante({ status_id: NAO_PAGO, valor_centavos: 21516 }, PAGOS, 10000)).toBe(11516);
  });

  it("quita dos mais antigos para os mais novos: os inteiros quitam e o último fica parcial", () => {
    const velho = lanc({ valor_centavos: 5000, mes: "2026-08" });
    const meio = lanc({ valor_centavos: 3000, mes: "2026-09" });
    const novo = lanc({ valor_centavos: 9000, mes: "2026-10" });
    const r = alocar(projetar([novo, velho, meio]), 10000);
    expect(r.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
      [velho.id, 5000, true],
      [meio.id, 3000, true],
      [novo.id, 2000, false],
    ]);
    expect(r.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(10000);
  });

  it("o valor cai exatamente no fim de uma linha: sem item parcial e as seguintes ficam de fora", () => {
    const a = lanc({ valor_centavos: 5000, mes: "2026-08" });
    const b = lanc({ valor_centavos: 3000, mes: "2026-09" });
    const r = alocar(projetar([a, b]), 5000);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ lancamento_id: a.id, valor_centavos: 5000, quita: true });
  });

  it("menos que o primeiro lançamento: só ele leva valor, parcial", () => {
    const a = lanc({ valor_centavos: 5000, mes: "2026-08" });
    const b = lanc({ valor_centavos: 3000, mes: "2026-09" });
    const r = alocar(projetar([a, b]), 1);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ lancamento_id: a.id, valor_centavos: 1, quita: false });
  });

  it("os créditos entram primeiro, inteiros, e aumentam o que sobra para as dívidas", () => {
    const credito = lanc({ valor_centavos: -3000, mes: "2026-10" });
    const velho = lanc({ valor_centavos: 10000, mes: "2026-08" });
    const novo = lanc({ valor_centavos: 10000, mes: "2026-09" });
    const r = alocar(projetar([velho, novo, credito]), 2000);
    // sobra = 2.000 + 3.000 = 5.000: o velho leva 5.000 (parcial) e o novo nada.
    expect(r.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
      [credito.id, -3000, true],
      [velho.id, 5000, false],
    ]);
    expect(r.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(2000);
  });

  it("só cobre o crédito e um pouco: o crédito quita e a dívida leva o resto", () => {
    const credito = lanc({ valor_centavos: -3000 });
    const divida = lanc({ valor_centavos: 10000 });
    const r = alocar(projetar([credito, divida]), 500);
    expect(r.itens.map((i) => [i.valor_centavos, i.quita])).toEqual([
      [-3000, true],
      [3500, false],
    ]);
  });

  it("nunca grava item zero nem passa do restante, em muitas combinações", () => {
    const linhas = [
      lanc({ valor_centavos: 700, mes: "2026-07" }),
      lanc({ valor_centavos: -250, mes: "2026-08" }),
      lanc({ valor_centavos: 1, mes: "2026-08" }),
      lanc({ valor_centavos: 1999, mes: "2026-09" }),
      lanc({ valor_centavos: 300, mes: "2026-10" }),
    ];
    const entram = projetar(linhas);
    const total = entram.reduce((s, i) => s + i.restanteCentavos, 0);
    for (let recebido = 1; recebido < total; recebido += 1) {
      const r = alocar(entram, recebido);
      const porId = new Map(entram.map((i) => [i.id, i.restanteCentavos]));
      expect(r.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(recebido);
      expect(r.itens.every((i) => i.valor_centavos !== 0)).toBe(true);
      expect(r.itens.filter((i) => !i.quita).length).toBeLessThanOrEqual(1);
      for (const i of r.itens) {
        const rest = porId.get(i.lancamento_id)!;
        expect(Math.abs(i.valor_centavos)).toBeLessThanOrEqual(Math.abs(rest));
        expect(i.quita).toBe(i.valor_centavos === rest);
      }
    }
  });

  it("uma linha que já recebeu um parcial: o restante dela é o teto, e fechar o valor quita", () => {
    const a = lanc({ valor_centavos: 21516 });
    const jaPagou = [{ lancamento_id: a.id, valor_centavos: 10000 }];
    const entram = projetar([a], jaPagou);
    expect(entram[0].restanteCentavos).toBe(11516);
    const r = alocar(entram, 5000);
    expect(r.itens[0]).toMatchObject({ valor_centavos: 5000, quita: false });
    expect(alocarPagamento(entram, 11516)).toMatchObject({ ok: true, valor: { modo: "total", itens: [{ valor_centavos: 11516, quita: true }] } });
    expect(alocarPagamento(entram, 11517)).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_acima", detalhe: "11516" } });
  });

  it("o Ajuste vem logo depois da parcela e é quitado depois dela", () => {
    const parcela = lanc({ valor_centavos: 10000, mes: "2026-09" });
    const ajuste = lanc({ valor_centavos: 7, ajuste_de_id: parcela.id, mes: "2026-09" });
    const outra = lanc({ valor_centavos: 5000, mes: "2026-10" });
    const entram = projetar([parcela, ajuste, outra]);
    expect(entram.map((i) => i.id)).toEqual([parcela.id, ajuste.id, outra.id]);
    // Paga a parcela inteira: o Ajuste (R$ 0,07) é o próximo e leva o resto.
    const r = alocar(entram, 10003);
    expect(r.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
      [parcela.id, 10000, true],
      [ajuste.id, 3, false],
    ]);
  });

  it("um Ajuste negativo não vira crédito: acompanha a parcela e só entra se ainda há o que pagar", () => {
    const parcela = lanc({ valor_centavos: 10000, mes: "2026-09" });
    const ajuste = lanc({ valor_centavos: -8, ajuste_de_id: parcela.id, mes: "2026-09" });
    const entram = projetar([parcela, ajuste]);
    expect(entram.map((i) => i.id)).toEqual([parcela.id, ajuste.id]);
    // 5.000 < parcela: acaba na parcela, o Ajuste fica em aberto.
    const poucoR = alocar(entram, 5000);
    expect(poucoR.itens.map((i) => i.lancamento_id)).toEqual([parcela.id]);
    expect(poucoR.itens[0]).toMatchObject({ valor_centavos: 5000, quita: false });
    // 9.991: a parcela quita 9.991? total é 9.992; 9.991 < total: parcela 9.991 parcial, Ajuste fora.
    const quase = alocar(entram, 9991);
    expect(quase.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([[parcela.id, 9991, false]]);
    expect(quase.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(9991);
  });

  it("filhas de mães diferentes: só as partes entram, em ordem de Mês", () => {
    const mae1 = lanc({ valor_centavos: 46600, mes: "2026-09", divisao: { modo: "fracao", partes: [] } });
    const f1 = lanc({ valor_centavos: 31067, dividido_de_id: mae1.id, mes: "2026-09" });
    const mae2 = lanc({ valor_centavos: 10000, mes: "2026-10", divisao: { modo: "fracao", partes: [] } });
    const f2 = lanc({ valor_centavos: 5000, dividido_de_id: mae2.id, mes: "2026-10" });
    const entram = projetarPagamento(new Set([mae1.id, f1.id, mae2.id, f2.id]), [mae1, f1, mae2, f2], { statusPagos: PAGOS, itens: [] }).entram;
    const r = alocar(entram, 32000);
    expect(r.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
      [f1.id, 31067, true],
      [f2.id, 933, false],
    ]);
  });
});

describe("alocarPagamento: Não é dívida, é a minha parte", () => {
  it("o Rangel: todos ficam quitados com o restante inteiro e o Pagamento guarda o valor recebido", () => {
    const linhas = [lanc({ valor_centavos: 80000 }), lanc({ valor_centavos: 44589 }), lanc({ valor_centavos: 439346 })];
    const entram = projetarPagamento(new Set(linhas.map((l) => l.id)), linhas, { statusPagos: PAGOS, itens: [] }).entram;
    const total = 80000 + 44589 + 439346;
    expect(total).toBe(563935);
    const r = alocarPagamento(entram, 281968, "minha_parte");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.modo).toBe("minha_parte");
    expect(r.valor.itens).toHaveLength(3);
    expect(r.valor.itens.every((i) => i.quita)).toBe(true);
    // Σ itens = o que as linhas quitam, não o que entrou: a diferença é a parte do Rafael.
    expect(r.valor.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(563935);
    expect(563935 - 281968).toBe(281967);
  });

  it("recebido muito pequeno vale: todas as linhas ficam quitadas", () => {
    const linhas = [lanc({ valor_centavos: 5000 }), lanc({ valor_centavos: 3000 })];
    const entram = projetarPagamento(new Set(linhas.map((l) => l.id)), linhas, { statusPagos: PAGOS, itens: [] }).entram;
    const r = alocarPagamento(entram, 1, "minha_parte");
    expect(r.ok && r.valor.itens.map((i) => i.valor_centavos)).toEqual([5000, 3000]);
  });

  it("uma linha que já recebeu parcial entra com o restante dela", () => {
    const a = lanc({ valor_centavos: 21516 });
    const entram = projetarPagamento(new Set([a.id]), [a], { statusPagos: PAGOS, itens: [{ lancamento_id: a.id, valor_centavos: 10000 }] }).entram;
    const r = alocarPagamento(entram, 5000, "minha_parte");
    expect(r.ok && r.valor.itens[0].valor_centavos).toBe(11516);
  });

  it("total líquido que não passa de zero: nada a receber, mesmo com a escolha", () => {
    const d = lanc({ valor_centavos: 1000 });
    const c = lanc({ valor_centavos: -1000 });
    const entram = projetarPagamento(new Set([d.id, c.id]), [d, c], { statusPagos: PAGOS, itens: [] }).entram;
    expect(alocarPagamento(entram, 500, "pendente")).toMatchObject({ ok: false, erro: { codigo: "pagamento.nada_a_receber" } });
  });
});

describe("Pago parcialmente (derivado, nunca gravado)", () => {
  const a = { status_id: NAO_PAGO, valor_centavos: 21516 };

  it("0 < Σ itens < valor, sem Status pago", () => {
    expect(pagoParcialmente(a, PAGOS, 10000)).toBe(true);
    expect(pagoParcialmente(a, PAGOS, 0)).toBe(false);
    expect(pagoParcialmente(a, PAGOS, 21516)).toBe(false);
    expect(pagoParcialmente({ status_id: PAGO, valor_centavos: 21516 }, PAGOS, 10000)).toBe(false);
    expect(pagoParcialmente({ status_id: null, valor_centavos: 21516 }, PAGOS, 10000)).toBe(true);
    expect(pagoParcialmente({ status_id: NAO_PAGO, valor_centavos: -500 }, PAGOS, -500)).toBe(false);
  });

  it("falta R$ X: o restante só de quem está parcialmente pago", () => {
    expect(faltaDoParcial(a, PAGOS, 10000)).toBe(11516);
    expect(faltaDoParcial(a, PAGOS, 0)).toBeNull();
    expect(faltaDoParcial({ status_id: PAGO, valor_centavos: 21516 }, PAGOS, 10000)).toBeNull();
  });

  it("os itens de um Pagamento desfeito não contam, nem os que não aplicaram Status entre os quitados", () => {
    const itens = [
      { lancamento_id: "a", valor_centavos: 100, status_aplicado_id: null },
      { lancamento_id: "b", valor_centavos: 100, status_aplicado_id: PAGO },
      { lancamento_id: "c", valor_centavos: 100, status_aplicado_id: PAGO, excluido_em: "2026-11-10T00:00:00Z" },
    ];
    expect([...idsQuitadosPorPagamento(itens)]).toEqual(["b"]);
    expect([...idsComPagamento(itens)].sort()).toEqual(["a", "b"]);
  });
});

describe("ler a Data e o Valor recebido", () => {
  it("o valor: vírgula, ponto e R$; vazio, texto, zero e negativo são recusados", () => {
    expect(lerValorRecebido("2.819,68")).toEqual({ ok: true, valor: 281968 });
    expect(lerValorRecebido("R$ 100,00")).toEqual({ ok: true, valor: 10000 });
    expect(lerValorRecebido("")).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_vazio" } });
    expect(lerValorRecebido("abc")).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
    expect(lerValorRecebido("0,00")).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
    expect(lerValorRecebido("-10")).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
    expect(lerValorRecebido("99999999,99")).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_invalido" } });
  });

  it("a data: hoje e o passado valem; o futuro, o vazio e a data impossível não", () => {
    expect(lerDataDoPagamento("2026-11-15", "2026-11-15")).toEqual({ ok: true, valor: "2026-11-15" });
    expect(lerDataDoPagamento("2026-01-02", "2026-11-15")).toEqual({ ok: true, valor: "2026-01-02" });
    expect(lerDataDoPagamento("2026-11-16", "2026-11-15")).toMatchObject({ ok: false, erro: { codigo: "pagamento.data_futura" } });
    expect(lerDataDoPagamento("", "2026-11-15")).toMatchObject({ ok: false, erro: { codigo: "pagamento.data_vazia" } });
    expect(lerDataDoPagamento("2026-02-30", "2026-11-15")).toMatchObject({ ok: false, erro: { codigo: "pagamento.data_invalida" } });
    expect(lerDataDoPagamento("15/11/2026", "2026-11-15")).toMatchObject({ ok: false, erro: { codigo: "pagamento.data_invalida" } });
  });

  it("o padrão do campo é o total sem o R$; sem total a receber, vazio", () => {
    expect(textoDoValorRecebido(281968)).toBe("2.819,68");
    expect(textoDoValorRecebido(21516)).toBe("215,16");
    expect(textoDoValorRecebido(5)).toBe("0,05");
    expect(textoDoValorRecebido(0)).toBe("");
    expect(textoDoValorRecebido(-100)).toBe("");
    expect(lerValorRecebido(textoDoValorRecebido(563935))).toEqual({ ok: true, valor: 563935 });
  });

  it("cada erro tem o campo onde a janela o mostra", () => {
    expect(campoDoErroDoPagamento("pagamento.sem_status")).toBe("status");
    expect(campoDoErroDoPagamento("pagamento.data_futura")).toBe("data");
    expect(campoDoErroDoPagamento("pagamento.valor_acima")).toBe("valor");
    expect(campoDoErroDoPagamento("pagamento.mudou")).toBe("geral");
  });
});

describe("planejarPagamento", () => {
  const lucas = () => {
    const a = lanc({ valor_centavos: 15000, mes: "2026-09" });
    const b = lanc({ valor_centavos: 6516, mes: "2026-10" });
    return projetarPagamento(sel(a.id, b.id), [a, b], { statusPagos: PAGOS, itens: [] });
  };
  const entrada = (extra: Partial<Parameters<typeof planejarPagamento>[0]> = {}) => ({
    id: "pg-1",
    statusId: PAGO,
    statusPagos: PAGOS,
    data: "2026-11-15",
    valorTexto: "215,16",
    hoje: "2026-11-15",
    projecao: lucas(),
    ...extra,
  });

  it("monta o pedido da RPC: modo total, um item por linha, soma igual ao valor recebido", () => {
    const r = planejarPagamento(entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.pedido).toMatchObject({
      id: "pg-1",
      status_id: PAGO,
      data: "2026-11-15",
      valor_recebido_centavos: 21516,
      modo: "total",
    });
    expect(r.valor.pedido.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(21516);
    expect(r.valor.quantidade).toBe(2);
    expect(r.valor.quitados).toBe(2);
  });

  it("o Lucas, Fica pendente: modo parcial, soma = valor recebido, o último fica parcial", () => {
    const r = planejarPagamento(entrada({ valorTexto: "100,00", diferenca: "pendente" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.pedido.modo).toBe("parcial");
    expect(r.valor.pedido.valor_recebido_centavos).toBe(10000);
    expect(r.valor.pedido.itens.map((i) => [i.valor_centavos, i.quita])).toEqual([[10000, false]]);
    expect(r.valor.quitados).toBe(0);
    expect(r.valor.quantidade).toBe(2);
  });

  it("minha parte: modo minha_parte, o valor recebido é o digitado e os itens somam o que as linhas quitam", () => {
    const r = planejarPagamento(entrada({ valorTexto: "100,00", diferenca: "minha_parte" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.pedido.modo).toBe("minha_parte");
    expect(r.valor.pedido.valor_recebido_centavos).toBe(10000);
    expect(r.valor.pedido.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(21516);
    expect(r.valor.quitados).toBe(2);
  });

  it("menor que o total sem escolha: o erro pede a escolha e a janela o mostra na pergunta", () => {
    const r = planejarPagamento(entrada({ valorTexto: "100,00" }));
    expect(r).toMatchObject({ ok: false, erro: { codigo: "pagamento.diferenca_sem_escolha", detalhe: "11516" } });
    expect(campoDoErroDoPagamento("pagamento.diferenca_sem_escolha")).toBe("diferenca");
  });

  it("valor igual ao total depois de escolher: a escolha some e o modo é total", () => {
    const r = planejarPagamento(entrada({ valorTexto: "215,16", diferenca: "minha_parte" }));
    expect(r.ok && r.valor.pedido.modo).toBe("total");
  });

  it("o primeiro erro vence: Status, depois Data, depois Valor", () => {
    expect(planejarPagamento(entrada({ statusId: "" }))).toMatchObject({ ok: false, erro: { codigo: "pagamento.sem_status" } });
    expect(planejarPagamento(entrada({ statusId: NAO_PAGO }))).toMatchObject({ ok: false, erro: { codigo: "pagamento.status_invalido" } });
    expect(planejarPagamento(entrada({ data: "2026-12-01", valorTexto: "" }))).toMatchObject({
      ok: false,
      erro: { codigo: "pagamento.data_futura" },
    });
    expect(planejarPagamento(entrada({ valorTexto: "300,00" }))).toMatchObject({ ok: false, erro: { codigo: "pagamento.valor_acima", detalhe: "21516" } });
  });
});

describe("recusarStatusNaoPago (AD-10)", () => {
  const linhas = [
    { id: "a", status_id: PAGO },
    { id: "b", status_id: PAGO },
  ];

  it("a linha parcialmente paga (Status não pago, item parcial) troca de não pago para outro não pago", () => {
    const parcial = [{ id: "p", status_id: NAO_PAGO }];
    expect(recusarStatusNaoPago("st-em-analise", PAGOS, parcial, new Set())).toEqual({ ok: true, valor: true });
    expect(recusarStatusNaoPago(null, PAGOS, parcial, new Set())).toEqual({ ok: true, valor: true });
    // O item parcial não aplicou Status: mesmo que a linha tenha sido paga à mão, tirar o pago é livre.
    expect(recusarStatusNaoPago(NAO_PAGO, PAGOS, [{ id: "p", status_id: PAGO }], new Set())).toEqual({ ok: true, valor: true });
  });

  it("Status que não conta como pago numa linha com itens é recusado", () => {
    const r = recusarStatusNaoPago(NAO_PAGO, PAGOS, linhas, new Set(["a"]));
    expect(r).toEqual({ ok: false, erro: { codigo: "pagamento.desfazer_antes", detalhe: "1" } });
    expect(recusarStatusNaoPago(null, PAGOS, linhas, new Set(["a", "b"]))).toMatchObject({ ok: false, erro: { detalhe: "2" } });
  });

  it("vale para o lote todo: uma linha com item recusa tudo", () => {
    const r = recusarStatusNaoPago(NAO_PAGO, PAGOS, linhas, new Set(["b"]));
    expect(r.ok).toBe(false);
  });

  it("outro Status que conta como pago, linha sem itens e linha que já tem o Status passam", () => {
    expect(recusarStatusNaoPago("st-quitado", new Set([PAGO, "st-quitado"]), linhas, new Set(["a"]))).toEqual({ ok: true, valor: true });
    expect(recusarStatusNaoPago(NAO_PAGO, PAGOS, linhas, new Set())).toEqual({ ok: true, valor: true });
    expect(recusarStatusNaoPago(NAO_PAGO, PAGOS, [{ id: "a", status_id: NAO_PAGO }], new Set(["a"]))).toEqual({ ok: true, valor: true });
  });
});

describe("planejarDesfazerPagamento (AD-10)", () => {
  const item = (id: string, aplicado: string | null, anterior: string | null, criado: string) => ({
    lancamento_id: id,
    status_anterior_id: anterior,
    status_aplicado_id: aplicado,
    created_at: criado,
  });

  it("devolve o Status anterior onde o atual ainda é o aplicado", () => {
    const plano = planejarDesfazerPagamento(
      [item("a", PAGO, NAO_PAGO, "2026-11-10T10:00:00Z"), item("b", PAGO, null, "2026-11-10T10:00:00Z")],
      [
        { id: "a", status_id: PAGO, updated_at: "u1" },
        { id: "b", status_id: PAGO, updated_at: "u2" },
      ],
      [],
    );
    expect(plano.devolver).toEqual([
      { lancamento_id: "a", status_id: NAO_PAGO, atualizado_em: "u1" },
      { lancamento_id: "b", status_id: null, atualizado_em: "u2" },
    ]);
    expect(plano.mantidas).toBe(0);
  });

  it("deixa como está a linha cujo Status mudou à mão ou que sumiu", () => {
    const plano = planejarDesfazerPagamento(
      [item("a", PAGO, NAO_PAGO, "2026-11-10T10:00:00Z"), item("b", PAGO, NAO_PAGO, "2026-11-10T10:00:00Z")],
      [{ id: "a", status_id: "st-outro", updated_at: "u1" }],
      [],
    );
    expect(plano.devolver).toEqual([]);
    expect(plano.mantidas).toBe(2);
  });

  it("o item parcial não mudou o Status: não há o que devolver e a linha não conta como mantida", () => {
    const plano = planejarDesfazerPagamento(
      [item("a", null, NAO_PAGO, "2026-11-10T10:00:00Z")],
      [{ id: "a", status_id: NAO_PAGO, updated_at: "u1" }],
      [],
    );
    expect(plano).toEqual({ devolver: [], mantidas: 0 });
  });

  it("parcial e depois o que fecha o valor: desfazer o que fecha devolve o não pago; desfazer o parcial não mexe no Status", () => {
    const parcial = item("a", null, NAO_PAGO, "2026-11-10T10:00:00Z");
    const fecha = item("a", PAGO, NAO_PAGO, "2026-11-11T10:00:00Z");
    const linha = [{ id: "a", status_id: PAGO, updated_at: "u1" }];
    expect(planejarDesfazerPagamento([fecha], linha, [{ lancamento_id: "a", created_at: parcial.created_at }]).devolver).toEqual([
      { lancamento_id: "a", status_id: NAO_PAGO, atualizado_em: "u1" },
    ]);
    expect(planejarDesfazerPagamento([parcial], linha, [{ lancamento_id: "a", created_at: fecha.created_at }])).toEqual({ devolver: [], mantidas: 0 });
  });

  it("dois Pagamentos fora de ordem não estragam o Status: o anterior só desfaz depois do posterior", () => {
    // P1 (10:00) quitou a linha; P2 (11:00) tocou a mesma linha depois.
    const p1 = [item("a", PAGO, NAO_PAGO, "2026-11-10T10:00:00Z")];
    const linha = [{ id: "a", status_id: PAGO, updated_at: "u1" }];
    const p2Item = { lancamento_id: "a", created_at: "2026-11-10T11:00:00Z" };
    // Desfazer P1 primeiro: P2 é posterior e tocou a linha: ela fica como está.
    expect(planejarDesfazerPagamento(p1, linha, [p2Item])).toEqual({ devolver: [], mantidas: 1 });
    // Desfazer P2 primeiro: P1 é anterior, não impede.
    const p2 = [item("a", PAGO, PAGO, "2026-11-10T11:00:00Z")];
    expect(planejarDesfazerPagamento(p2, linha, [{ lancamento_id: "a", created_at: "2026-11-10T10:00:00Z" }]).devolver).toHaveLength(1);
  });
});
