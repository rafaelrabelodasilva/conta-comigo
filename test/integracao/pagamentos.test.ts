// Prova, contra o Supabase local (CI), Marcar como pago (História 6.1, FR-25,
// AD-10, AD-16): as RPCs `aplicar_pagamento` e `desfazer_pagamento`, o gatilho que
// recusa um Status "não pago" numa linha com Pagamento (gravação simples e
// `classificar_em_lote`), a idempotência pelo `id` da tela, a trava pelo
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

  /** O pedido que o núcleo monta para pagar `ids` (total, hoje). */
  async function pedido(cliente: Cliente, ids: string[], id = uuid(), statusId = pago) {
    const linhas = await ler(cliente, ids);
    const ctx = await contexto(cliente);
    const projecao = projetarPagamento(new Set(ids), linhas, ctx);
    const plano = planejarPagamento({
      id,
      statusId,
      statusPagos: ctx.statusPagos,
      data: "2026-11-15",
      valorTexto: (projecao.totalCentavos / 100).toFixed(2).replace(".", ","),
      hoje: "2026-11-15",
      projecao,
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
    await falha({ ...base, modo: "parcial" }, "salvar.falhou");
    await falha({ ...base, status_id: naoPago }, "pagamento.status_invalido");
    await falha({ ...base, itens: [base.itens[0], base.itens[0]] }, "salvar.falhou");
    await falha({ ...base, itens: [] }, "salvar.falhou");
    const mae = await nova(46600, "2026-11", { divisao: { modo: "proporcao", partes: [] } });
    const [lmae] = await ler(a.cliente, [mae]);
    await falha(
      { ...base, valor_recebido_centavos: 46600, itens: [{ lancamento_id: mae, valor_centavos: 46600, atualizado_em: lmae.updated_at }] },
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
