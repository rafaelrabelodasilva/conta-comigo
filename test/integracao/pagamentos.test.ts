// Prova, contra o Supabase local (CI), Marcar como pago (História 6.1) e o Pagamento
// parcial e "a minha parte" (História 6.2) (FR-25, AD-10, AD-16): as RPCs
// `aplicar_pagamento` (modos `total`, `parcial` e `minha_parte`) e `desfazer_pagamento`,
// o gatilho que recusa tirar o "pago" de uma linha que um Pagamento quitou (gravação
// simples e `classificar_em_lote`), a idempotência pelo `id` da tela, a trava pelo
// `updated_at`, o RLS, os `grant` e o Realtime (selos e itens, só o Mês aberto
// importa para a tela). Quem decide o que o Pagamento quita e o que o desfazer
// devolve é o núcleo (`pagamento.ts`); aqui o núcleo monta o pedido com as linhas
// lidas pelo PostgREST (os `updated_at` de verdade) e o banco confere.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import {
  planejarDesfazerPagamento,
  planejarPagamento,
  projetarPagamento,
  type LancamentoParaPagar,
} from "../../src/domain/pagamento";
import { esperarEvento, ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Marcar como pago no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let pago: string;
  let pix: string;
  let naoPago: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("pagamentos");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const status = async (nome: string, contaComoPago: boolean) =>
      (await local.admin.from("status").insert({ owner_id: a.id, nome, conta_como_pago: contaComoPago }).select().single()).data!.id;
    pago = await status("Pago", true);
    pix = await status("Pix", true);
    naoPago = await status("Não pago", false);
    await local.admin.from("configuracoes").insert({ owner_id: a.id, status_padrao_id: naoPago });
  });

  afterAll(async () => {
    await local.limpar();
  });

  const uuid = () => `00000000-0000-4000-b000-${String(++seq).padStart(12, "0")}`;

  async function nova(valor: number, mes = "2026-11", extra: Record<string, unknown> = {}): Promise<string> {
    seq += 1;
    const { data, error } = await local.admin
      .from("lancamentos")
      .insert({
        owner_id: a.id,
        nome: `PAGAR ${seq}`,
        nome_normalizado: `PAGAR ${seq}`,
        valor_centavos: valor,
        lancado_por: "manual",
        mes,
        ordem_fatura: seq,
        status_id: naoPago,
        ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  /** As linhas como a tela as lê (PostgREST, com os `updated_at` de verdade). */
  async function ler(cliente: Cliente, ids: string[]): Promise<LancamentoParaPagar[]> {
    const { data, error } = await cliente.from("lancamentos").select("*").in("id", ids);
    expect(error).toBeNull();
    return data as unknown as LancamentoParaPagar[];
  }

  /** Os Status que contam como pago e os itens vivos, como a tela os tem. */
  async function contexto(cliente: Cliente) {
    const { data: itens } = await cliente.from("pagamento_itens").select("lancamento_id, valor_centavos, excluido_em");
    return { statusPagos: new Set([pago, pix]), itens: itens ?? [] };
  }

  /**
   * O pedido que o núcleo monta para pagar `ids` (hoje). Sem `valorTexto`, o total (modo
   * `total`); com valor menor, `diferenca` escolhe "Fica pendente" ou "a minha parte".
   */
  async function pedido(
    cliente: Cliente,
    ids: string[],
    id = uuid(),
    statusId = pago,
    valorTexto?: string,
    diferenca: "pendente" | "minha_parte" | null = null,
  ) {
    const linhas = await ler(cliente, ids);
    const ctx = await contexto(cliente);
    const projecao = projetarPagamento(new Set(ids), linhas, ctx);
    const plano = planejarPagamento({
      id,
      statusId,
      statusPagos: ctx.statusPagos,
      data: "2026-11-15",
      valorTexto: valorTexto ?? (projecao.totalCentavos / 100).toFixed(2).replace(".", ","),
      hoje: "2026-11-15",
      projecao,
      diferenca,
    });
    expect(plano.ok).toBe(true);
    return plano.ok ? plano.valor.pedido : (undefined as never);
  }

  const aplicar = (cliente: Cliente, p: unknown) => cliente.rpc("aplicar_pagamento", { p_pedido: p as Json });
  const desfazer = (cliente: Cliente, p: unknown) => cliente.rpc("desfazer_pagamento", { p_pedido: p as Json });

  /** O plano do desfazer, como o repositório lê (itens vivos, linhas e itens de outros Pagamentos). */
  async function planoDeDesfazer(cliente: Cliente, pagamentoId: string) {
    const { data: itens } = await cliente
      .from("pagamento_itens")
      .select("lancamento_id, status_anterior_id, status_aplicado_id, created_at")
      .eq("pagamento_id", pagamentoId)
      .is("excluido_em", null);
    const ids = (itens ?? []).map((i) => i.lancamento_id);
    const { data: linhas } = await cliente.from("lancamentos").select("id, status_id, updated_at").in("id", ids);
    const { data: outros } = await cliente
      .from("pagamento_itens")
      .select("lancamento_id, created_at")
      .in("lancamento_id", ids)
      .neq("pagamento_id", pagamentoId)
      .is("excluido_em", null);
    return planejarDesfazerPagamento(itens ?? [], linhas ?? [], outros ?? []);
  }

  const statusDe = async (id: string) => (await local.admin.from("lancamentos").select("status_id").eq("id", id).single()).data!.status_id;

  it("aplica um Pagamento total sobre linhas de Meses diferentes: pagamento, itens e Status numa transação", async () => {
    const l1 = await nova(10000, "2026-10");
    const l2 = await nova(21516, "2026-11");
    const l3 = await nova(-2500, "2026-11");
    const p = await pedido(a.cliente, [l1, l2, l3]);
    const { data, error } = await aplicar(a.cliente, p);
    expect(error).toBeNull();
    const r = data as unknown as {
      pagamento: { id: string; valor_recebido_centavos: number; modo: string; data: string };
      itens: { lancamento_id: string; mes: string; valor_centavos: number; status_anterior_id: string; status_aplicado_id: string }[];
      lancamentos: { id: string; status_id: string }[];
    };
    expect(r.pagamento).toMatchObject({ id: p.id, valor_recebido_centavos: 29016, modo: "total", data: "2026-11-15" });
    expect(r.itens).toHaveLength(3);
    expect(r.itens.every((i) => i.status_anterior_id === naoPago && i.status_aplicado_id === pago)).toBe(true);
    expect(Object.fromEntries(r.itens.map((i) => [i.lancamento_id, [i.mes, i.valor_centavos]]))).toEqual({
      [l1]: ["2026-10", 10000],
      [l2]: ["2026-11", 21516],
      [l3]: ["2026-11", -2500],
    });
    expect(r.lancamentos.every((l) => l.status_id === pago)).toBe(true);
    for (const id of [l1, l2, l3]) expect(await statusDe(id)).toBe(pago);
  });

  it("repetir o mesmo pedido (resposta perdida, duplo toque) devolve o mesmo Pagamento sem gravar de novo", async () => {
    const l = await nova(5000);
    const p = await pedido(a.cliente, [l]);
    expect((await aplicar(a.cliente, p)).error).toBeNull();
    const [um, dois] = await Promise.all([aplicar(a.cliente, p), aplicar(a.cliente, p)]);
    expect(um.error).toBeNull();
    expect(dois.error).toBeNull();
    const { data: itens } = await local.admin.from("pagamento_itens").select("id").eq("pagamento_id", p.id);
    expect(itens).toHaveLength(1);
    const { data: pagamentos } = await local.admin.from("pagamentos").select("id").eq("id", p.id);
    expect(pagamentos).toHaveLength(1);
  });

  it("outro pedido sobre linhas que já mudaram é recusado (pagamento.mudou) e nada fica gravado", async () => {
    const l = await nova(5000);
    const velho = await pedido(a.cliente, [l]);
    // Outro aparelho muda o Valor da linha: o `updated_at` anda.
    await a.cliente.from("lancamentos").update({ valor_centavos: 5100 }).eq("id", l);
    const { error } = await aplicar(a.cliente, { ...velho, id: uuid() });
    expect(error?.message).toContain("pagamento.mudou");
    expect(await statusDe(l)).toBe(naoPago);
    const { data } = await local.admin.from("pagamentos").select("id").eq("owner_id", a.id).eq("valor_recebido_centavos", 5000);
    expect((data ?? []).filter((x) => x.id === velho.id)).toHaveLength(0);
  });

  it("recusas do banco: soma, item acima do restante, modo, Status inválido, duplicado, vazio, mãe dividida e Status arquivado", async () => {
    const l1 = await nova(5000);
    const l2 = await nova(3000);
    const base = await pedido(a.cliente, [l1, l2]);
    const falha = async (p: unknown, esperado: string) => {
      const { error } = await aplicar(a.cliente, p);
      expect(error?.message, esperado).toContain(esperado);
    };
    await falha({ ...base, valor_recebido_centavos: base.valor_recebido_centavos + 1 }, "salvar.falhou");
    // A soma fecha, mas um item passa do restante da linha.
    await falha(
      {
        ...base,
        itens: [
          { ...base.itens[0], valor_centavos: base.itens[0].valor_centavos + 1 },
          { ...base.itens[1], valor_centavos: base.itens[1].valor_centavos - 1 },
        ],
      },
      "salvar.falhou",
    );
    await falha({ ...base, modo: "inventado" }, "salvar.falhou");
    // O modo `parcial` exige `quita` coerente com o restante; sem ele, nada passa.
    await falha({ ...base, itens: base.itens.map((i) => ({ lancamento_id: i.lancamento_id, valor_centavos: i.valor_centavos, atualizado_em: i.atualizado_em })) }, "salvar.falhou");
    await falha({ ...base, status_id: naoPago }, "pagamento.status_invalido");
    await falha({ ...base, itens: [base.itens[0], base.itens[0]] }, "salvar.falhou");
    await falha({ ...base, itens: [] }, "salvar.falhou");
    const mae = await nova(46600, "2026-11", { divisao: { modo: "proporcao", partes: [] } });
    const [lmae] = await ler(a.cliente, [mae]);
    await falha(
      { ...base, valor_recebido_centavos: 46600, itens: [{ lancamento_id: mae, valor_centavos: 46600, atualizado_em: lmae.updated_at, quita: true }] },
      "salvar.falhou",
    );
    const arquivado = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Antigo", conta_como_pago: true, arquivado: true }).select().single()).data!.id;
    await falha({ ...base, status_id: arquivado }, "pagamento.status_invalido");
    expect(await statusDe(l1)).toBe(naoPago);
    expect(await statusDe(l2)).toBe(naoPago);
  });

  it("o Status 'não pago' numa linha com Pagamento é recusado, também pelo lote (tudo ou nada); outro Status pago passa", async () => {
    const l = await nova(7000);
    const outra = await nova(900);
    expect((await aplicar(a.cliente, await pedido(a.cliente, [l]))).error).toBeNull();
    const simples = await a.cliente.from("lancamentos").update({ status_id: naoPago }).eq("id", l);
    expect(simples.error?.message).toContain("pagamento.desfazer_antes");
    const nulo = await a.cliente.from("lancamentos").update({ status_id: null }).eq("id", l);
    expect(nulo.error?.message).toContain("pagamento.desfazer_antes");
    const lote = await a.cliente.rpc("classificar_em_lote", {
      p_itens: [
        { id: outra, corpo: { status_id: pago } },
        { id: l, corpo: { status_id: naoPago } },
      ] as unknown as Json,
    });
    expect(lote.error?.message).toContain("pagamento.desfazer_antes");
    expect(await statusDe(outra)).toBe(naoPago);
    expect(await statusDe(l)).toBe(pago);
    expect((await a.cliente.from("lancamentos").update({ status_id: pix }).eq("id", l)).error).toBeNull();
    expect(await statusDe(l)).toBe(pix);
  });

  type Retorno = {
    pagamento: { id: string; modo: string; valor_recebido_centavos: number };
    itens: { lancamento_id: string; valor_centavos: number; status_anterior_id: string | null; status_aplicado_id: string | null }[];
    lancamentos: { id: string; status_id: string | null }[];
  };
  const versaoDe = async (id: string) => (await local.admin.from("lancamentos").select("updated_at").eq("id", id).single()).data!.updated_at;

  it("Fica pendente (o Lucas): R$ 100,00 de R$ 215,16 grava um item parcial; a linha segue com o Status e a versão anda", async () => {
    const l = await nova(21516);
    const antes = await versaoDe(l);
    const p = await pedido(a.cliente, [l], uuid(), pago, "100,00", "pendente");
    expect(p).toMatchObject({ modo: "parcial", valor_recebido_centavos: 10000 });
    const { data, error } = await aplicar(a.cliente, p);
    expect(error).toBeNull();
    const r = data as unknown as Retorno;
    expect(r.pagamento).toMatchObject({ modo: "parcial", valor_recebido_centavos: 10000 });
    expect(r.itens).toMatchObject([{ lancamento_id: l, valor_centavos: 10000, status_anterior_id: naoPago, status_aplicado_id: null }]);
    expect(await statusDe(l)).toBe(naoPago);
    expect(await versaoDe(l)).not.toBe(antes);
    // Sobram R$ 115,16 (o núcleo lê o item vivo).
    const projecao = projetarPagamento(new Set([l]), await ler(a.cliente, [l]), await contexto(a.cliente));
    expect(projecao.totalCentavos).toBe(11516);
  });

  it("Fica pendente: quita dos mais antigos aos mais novos, o último fica parcial; uma segunda cobrança fecha e a linha vira paga", async () => {
    const velha = await nova(5000, "2026-08");
    const nova1 = await nova(9000, "2026-10");
    const p1 = await pedido(a.cliente, [nova1, velha], uuid(), pago, "100,00", "pendente");
    expect(p1.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
      [velha, 5000, true],
      [nova1, 5000, false],
    ]);
    expect((await aplicar(a.cliente, p1)).error).toBeNull();
    expect(await statusDe(velha)).toBe(pago);
    expect(await statusDe(nova1)).toBe(naoPago);
    // O que falta da segunda: R$ 40,00. Pagar R$ 40,00 fecha o valor e quita.
    const p2 = await pedido(a.cliente, [nova1], uuid(), pago, "40,00");
    expect(p2).toMatchObject({ modo: "total", itens: [{ lancamento_id: nova1, valor_centavos: 4000, quita: true }] });
    expect((await aplicar(a.cliente, p2)).error).toBeNull();
    expect(await statusDe(nova1)).toBe(pago);
    // Desfazer o que fechou devolve a linha a "não pago" (o item parcial do primeiro segue vivo e o gatilho aceita).
    const plano = await planoDeDesfazer(a.cliente, p2.id);
    expect((await desfazer(a.cliente, { pagamento_id: p2.id, devolver: plano.devolver })).error).toBeNull();
    expect(await statusDe(nova1)).toBe(naoPago);
    // Desfazer o parcial: o Status não muda, o item sai e a versão anda.
    const antes = await versaoDe(nova1);
    const plano1 = await planoDeDesfazer(a.cliente, p1.id);
    expect(plano1.devolver.map((d) => d.lancamento_id)).toEqual([velha]);
    expect((await desfazer(a.cliente, { pagamento_id: p1.id, devolver: plano1.devolver })).error).toBeNull();
    expect(await statusDe(velha)).toBe(naoPago);
    expect(await statusDe(nova1)).toBe(naoPago);
    expect(await versaoDe(nova1)).not.toBe(antes);
  });

  it("Não é dívida, é a minha parte (o Rangel): todas ficam quitadas, o Pagamento guarda o valor recebido e desfazer devolve", async () => {
    const x = await nova(80000);
    const y = await nova(44589);
    const p = await pedido(a.cliente, [x, y], uuid(), pago, "500,00", "minha_parte");
    expect(p).toMatchObject({ modo: "minha_parte", valor_recebido_centavos: 50000 });
    const { data, error } = await aplicar(a.cliente, p);
    expect(error).toBeNull();
    const r = data as unknown as Retorno;
    expect(r.pagamento).toMatchObject({ modo: "minha_parte", valor_recebido_centavos: 50000 });
    expect(r.itens.reduce((s, i) => s + i.valor_centavos, 0)).toBe(124589);
    expect(r.itens.every((i) => i.status_aplicado_id === pago)).toBe(true);
    expect(await statusDe(x)).toBe(pago);
    expect(await statusDe(y)).toBe(pago);
    const plano = await planoDeDesfazer(a.cliente, p.id);
    expect((await desfazer(a.cliente, { pagamento_id: p.id, devolver: plano.devolver })).error).toBeNull();
    expect(await statusDe(x)).toBe(naoPago);
    expect(await statusDe(y)).toBe(naoPago);
  });

  it("recusas dos modos novos: soma, item parcial a mais, minha parte sem sobra, item fora do restante, valor zero, parcial em crédito", async () => {
    const x = await nova(5000);
    const y = await nova(3000);
    const cred = await nova(-1000);
    const total = await pedido(a.cliente, [x, y]);
    const parcial = await pedido(a.cliente, [x, y], uuid(), pago, "60,00", "pendente");
    expect(parcial.modo).toBe("parcial");
    const falha = async (p: unknown) => expect((await aplicar(a.cliente, p)).error?.message).toContain("salvar.falhou");
    // parcial: a soma tem de ser o valor recebido
    await falha({ ...parcial, valor_recebido_centavos: parcial.valor_recebido_centavos + 1 });
    // total com item parcial; parcial com dois itens parciais
    await falha({ ...total, itens: [{ ...total.itens[0], quita: false, valor_centavos: 1000 }, total.itens[1]], valor_recebido_centavos: 1000 + total.itens[1].valor_centavos });
    await falha({ ...parcial, itens: parcial.itens.map((i) => ({ ...i, quita: false, valor_centavos: 1 })), valor_recebido_centavos: parcial.itens.length });
    // minha parte: precisa sobrar (soma dos itens maior que o valor recebido) e todos quitam
    await falha({ ...total, modo: "minha_parte" });
    const minha = await pedido(a.cliente, [x, y], uuid(), pago, "10,00", "minha_parte");
    await falha({ ...minha, valor_recebido_centavos: 0 });
    await falha({ ...minha, itens: minha.itens.map((i, n) => (n === 0 ? { ...i, valor_centavos: i.valor_centavos - 1 } : i)) });
    // parcial num crédito não existe
    const [lc] = await ler(a.cliente, [cred]);
    await falha({ id: uuid(), status_id: pago, data: "2026-11-15", valor_recebido_centavos: 100, modo: "parcial", itens: [{ lancamento_id: cred, valor_centavos: -100, atualizado_em: lc.updated_at, quita: false }] });
    expect(await statusDe(x)).toBe(naoPago);
    expect(await statusDe(y)).toBe(naoPago);
    expect(await statusDe(cred)).toBe(naoPago);
  });

  it("o gatilho: numa linha parcial, 'não pago' troca por outro 'não pago' e por 'sem Status'; numa quitada, tirar o pago é recusado", async () => {
    const l = await nova(21516);
    const emAnalise = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Em análise", conta_como_pago: false }).select().single()).data!.id;
    expect((await aplicar(a.cliente, await pedido(a.cliente, [l], uuid(), pago, "100,00", "pendente"))).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: emAnalise }).eq("id", l)).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: null }).eq("id", l)).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: naoPago }).eq("id", l)).error).toBeNull();
    // Pagar o restante quita a linha (Status pago aplicado por Pagamento): agora tirar o pago é recusado.
    expect((await aplicar(a.cliente, await pedido(a.cliente, [l]))).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: naoPago }).eq("id", l)).error?.message).toContain("pagamento.desfazer_antes");
    // Já à mão: uma linha com só um item parcial que Rafael marcou como paga à mão volta a "não pago" sem recusa.
    const m = await nova(1000);
    expect((await aplicar(a.cliente, await pedido(a.cliente, [m], uuid(), pago, "4,00", "pendente"))).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: pix }).eq("id", m)).error).toBeNull();
    expect((await a.cliente.from("lancamentos").update({ status_id: naoPago }).eq("id", m)).error).toBeNull();
  });

  it("uma linha parcial que outro aparelho pagou no meio: o pedido com a versão velha é recusado (pagamento.mudou)", async () => {
    const l = await nova(10000);
    const velho = await pedido(a.cliente, [l], uuid(), pago, "30,00", "pendente");
    // Outro aparelho cobra R$ 20,00 da mesma linha: o item parcial move o `updated_at`.
    expect((await aplicar(a.cliente, await pedido(a.cliente, [l], uuid(), pago, "20,00", "pendente"))).error).toBeNull();
    expect((await aplicar(a.cliente, velho)).error?.message).toContain("pagamento.mudou");
    const { data } = await local.admin.from("pagamento_itens").select("valor_centavos").eq("lancamento_id", l).is("excluido_em", null);
    expect(data).toEqual([{ valor_centavos: 2000 }]);
  });

  it("desfazer: o Status anterior volta onde o atual ainda é o aplicado; a linha mexida à mão fica; o gatilho libera", async () => {
    const l1 = await nova(4000);
    const l2 = await nova(6000);
    const p = await pedido(a.cliente, [l1, l2]);
    expect((await aplicar(a.cliente, p)).error).toBeNull();
    // Rafael troca à mão o Status de l2 para outro que conta como pago: não é o aplicado.
    expect((await a.cliente.from("lancamentos").update({ status_id: pix }).eq("id", l2)).error).toBeNull();
    const plano = await planoDeDesfazer(a.cliente, p.id);
    expect(plano.devolver.map((d) => d.lancamento_id)).toEqual([l1]);
    expect(plano.mantidas).toBe(1);
    const { data, error } = await desfazer(a.cliente, { pagamento_id: p.id, devolver: plano.devolver });
    expect(error).toBeNull();
    expect((data as unknown as { pagamento: { excluido_em: string | null } }).pagamento.excluido_em).not.toBeNull();
    expect(await statusDe(l1)).toBe(naoPago);
    expect(await statusDe(l2)).toBe(pix);
    const { data: itens } = await local.admin.from("pagamento_itens").select("excluido_em").eq("pagamento_id", p.id);
    expect(itens?.every((i) => i.excluido_em !== null)).toBe(true);
    // Sem item vivo, o Status 'não pago' volta a valer em l2.
    expect((await a.cliente.from("lancamentos").update({ status_id: naoPago }).eq("id", l2)).error).toBeNull();
    // Desfazer de novo não faz nada; repetir o pedido de aplicar não traz o Pagamento de volta.
    expect((await desfazer(a.cliente, { pagamento_id: p.id, devolver: [] })).error).toBeNull();
    expect((await aplicar(a.cliente, p)).error?.message).toContain("pagamento.ja_desfeito");
    expect((await desfazer(a.cliente, { pagamento_id: uuid(), devolver: [] })).error?.message).toContain("pagamento.nao_encontrado");
  });

  it("desfazer com a linha mudada desde a leitura é recusado inteiro", async () => {
    const l = await nova(4000);
    const p = await pedido(a.cliente, [l]);
    expect((await aplicar(a.cliente, p)).error).toBeNull();
    const plano = await planoDeDesfazer(a.cliente, p.id);
    await a.cliente.from("lancamentos").update({ observacao: "mexi" }).eq("id", l);
    const { error } = await desfazer(a.cliente, { pagamento_id: p.id, devolver: plano.devolver });
    expect(error?.message).toContain("pagamento.mudou");
    expect(await statusDe(l)).toBe(pago);
    const { data } = await local.admin.from("pagamentos").select("excluido_em").eq("id", p.id).single();
    expect(data!.excluido_em).toBeNull();
  });

  it("isolamento por dono e grants: outro usuário não vê nem toca, e quem não entrou não chama as RPCs", async () => {
    const l = await nova(1500);
    const p = await pedido(a.cliente, [l]);
    expect((await aplicar(a.cliente, p)).error).toBeNull();
    expect((await b.cliente.from("pagamentos").select("id")).data).toEqual([]);
    expect((await b.cliente.from("pagamento_itens").select("id")).data).toEqual([]);
    // b não paga a linha de a: o Status e a linha são de outro dono, nada existe para ele.
    const outra = await nova(1600);
    const pb = await pedido(a.cliente, [outra]);
    expect((await aplicar(b.cliente, pb)).error?.message).toContain("pagamento.status_invalido");
    expect(await statusDe(outra)).toBe(naoPago);
    expect((await desfazer(b.cliente, { pagamento_id: p.id, devolver: [] })).error?.message).toContain("pagamento.nao_encontrado");
    const anonimo = await local.anonimo.rpc("aplicar_pagamento", { p_pedido: p as unknown as Json });
    expect(anonimo.error).not.toBeNull();
    // Ninguém apaga um Pagamento pela API (sem política de DELETE).
    const apagar = await a.cliente.from("pagamentos").delete().eq("id", p.id).select();
    expect(apagar.data ?? []).toEqual([]);
    const { data } = await local.admin.from("pagamentos").select("id").eq("id", p.id);
    expect(data).toHaveLength(1);
  });

  it("Realtime: o selo (a linha vira Pago) e o item de Pagamento do Mês chegam a outro aparelho do mesmo usuário", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const linha = await esperarEvento<{ id: string; status_id: string | null; mes: string }>(
      outro,
      "lancamentos",
      "UPDATE",
      (l) => l.status_id === pago && l.mes === "2026-09",
      async () => {
        const id = await nova(1234, "2026-09");
        return aplicar(a.cliente, await pedido(a.cliente, [id]));
      },
    );
    expect(linha.status_id).toBe(pago);
    const item = await esperarEvento<{ mes: string; status_aplicado_id: string; excluido_em: string | null }>(
      outro,
      "pagamento_itens",
      "INSERT",
      (i) => i.mes === "2026-09" && i.status_aplicado_id === pago,
      async () => {
        const id = await nova(4321, "2026-09");
        return aplicar(a.cliente, await pedido(a.cliente, [id]));
      },
    );
    expect(item.excluido_em).toBeNull();
    await outro.removeAllChannels();
  }, 60_000);

  it("Realtime: o item parcial chega a outro aparelho (sem Status aplicado) e a linha anda de versão com o mesmo Status", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const id = await nova(9999, "2026-09");
    const item = await esperarEvento<{ mes: string; status_aplicado_id: string | null; lancamento_id: string; valor_centavos: number }>(
      outro,
      "pagamento_itens",
      "INSERT",
      (i) => i.lancamento_id === id && i.status_aplicado_id === null,
      // Cada tentativa grava um item novo (R$ 1,00 de uma linha que deve R$ 99,99): o evento sempre chega.
      async () => aplicar(a.cliente, await pedido(a.cliente, [id], uuid(), pago, "1,00", "pendente")),
    );
    expect(item.mes).toBe("2026-09");
    const linha = await esperarEvento<{ id: string; status_id: string | null }>(
      outro,
      "lancamentos",
      "UPDATE",
      (l) => l.id === id && l.status_id === naoPago,
      async () => aplicar(a.cliente, await pedido(a.cliente, [id], uuid(), pago, "1,00", "pendente")),
    );
    expect(linha.status_id).toBe(naoPago);
    await outro.removeAllChannels();
  }, 60_000);

  it("Realtime: desfazer chega como UPDATE do item com `excluido_em` (replica identity full)", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const item = await esperarEvento<{ excluido_em: string | null; pagamento_id: string }>(
      outro,
      "pagamento_itens",
      "UPDATE",
      (i) => i.excluido_em !== null,
      async () => {
        const id = await nova(777, "2026-09");
        const p = await pedido(a.cliente, [id]);
        const r = await aplicar(a.cliente, p);
        if (r.error) return r;
        const plano = await planoDeDesfazer(a.cliente, p.id);
        return desfazer(a.cliente, { pagamento_id: p.id, devolver: plano.devolver });
      },
    );
    expect(item.excluido_em).not.toBeNull();
    await outro.removeAllChannels();
  }, 60_000);
});
