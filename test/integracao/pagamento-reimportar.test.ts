// Prova, contra o Supabase local (CI), editar, excluir e reimportar algo já pago (História 6.9, FR-46, FR-51,
// AD-10, AD-11, AD-15): `importar_fatura` nunca apaga uma linha com item de Pagamento (a viva sem par sai da
// Fatura com `sumiu_na_reimportacao`, a excluída fica excluída com o Pagamento), o teste de aceite "reimportar
// outubro com Pagamentos" termina com o MESMO Saldo pendente, e `excluir_linhas_da_conta` recusa uma linha com
// Pagamento vivo. Quem decide o destino de cada linha é o núcleo (`reimportacao.ts`, `projecoes.ts`); aqui o
// núcleo monta o plano com as linhas e os itens lidos do banco e o banco confere.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { avaliar } from "../../src/domain/formula";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import { planejarDesfazerPagamento, planejarPagamento, projetarPagamento, type LancamentoParaPagar } from "../../src/domain/pagamento";
import { atribuirSeries, aplicarCasamento, casarPrevistos, gerarPrevistos } from "../../src/domain/previstos";
import { projetarPendente, type LancamentoParaPendente } from "../../src/domain/projecoes";
import { aplicarReimportacao, casarSobrasComPrevistos, planejarReimportacao, type AntigaParaReimportar } from "../../src/domain/reimportacao";
import { ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

type Parcela = { nome: string; valor: number };

function base(mes: string, parcelas: Parcela[]): LancamentoParaGravar[] {
  return parcelas.map((p, i) => ({
    nome: p.nome,
    nome_normalizado: p.nome,
    valor_centavos: p.valor,
    data: `${mes}-01`,
    parcela_n: null,
    parcela_total: null,
    final_cartao: "5061",
    ordem_fatura: i + 1,
    duvida_extracao: false,
    ajuste_de_ordem: null,
    tipo_sugerido: null,
    responsavel_id: null,
    tipo_id: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    serie: null,
  }));
}

function fatura(mes: string, parcelas: Parcela[]): Importacao["fatura"] {
  return {
    mes,
    vencimento: `${mes}-06`,
    fechamento: null,
    total_despesas_centavos: parcelas.reduce((s, p) => s + p.valor, 0),
    total_creditos_centavos: 0,
    saldo_anterior_centavos: null,
    pagamentos_centavos: null,
    total_a_pagar_centavos: null,
  };
}

function primeira(mes: string, parcelas: Parcela[]): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const lancamentos = aplicarCasamento(comSeries, casarPrevistos(comSeries, []), []);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: parcelas.reduce((s, p) => s + p.valor, 0) }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, []),
    previstos_sem_par: [],
  };
}

/** Reimportação como a tela monta (o plano do núcleo sobre as antigas, com as `referenciadas` que o repositório leu). */
function reimportacao(
  mes: string,
  parcelas: Parcela[],
  antigas: AntigaParaReimportar[],
  opcoes: { statusPadraoId: string | null; referenciadas: ReadonlySet<string> },
): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const plano = planejarReimportacao(comSeries, antigas, opcoes);
  const lancamentos = aplicarReimportacao(comSeries, plano, antigas, [], []);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: parcelas.reduce((s, p) => s + p.valor, 0) }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, [mes]),
    previstos_sem_par: casarSobrasComPrevistos(comSeries, plano, []).semPar,
    reimportacao: { apagar: plano.apagar, sumiram: plano.sumiram, voltar_a_previsto: plano.voltar_a_previsto, resumo: plano.resumo },
  };
}

function chamar(cliente: Cliente, imp: Importacao, extra: { lidoEm?: string | null; substituir?: string } = {}) {
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    dados_previstos: imp.previstos as unknown as Json,
    previstos_sem_par: (imp.previstos_sem_par ?? []) as unknown as Json,
    ...(imp.reimportacao && extra.substituir
      ? {
          dados_reimportacao: {
            apagar: imp.reimportacao.apagar,
            sumiram: imp.reimportacao.sumiram,
            voltar_a_previsto: imp.reimportacao.voltar_a_previsto,
          } as unknown as Json,
        }
      : {}),
    ...(extra.lidoEm ? { lancamentos_atualizados_em: extra.lidoEm } : {}),
    ...(extra.substituir ? { substituir_fatura_id: extra.substituir } : {}),
  });
}

describe.skipIf(!ligado)("Editar, excluir e reimportar algo já pago no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let mae: string;
  let tipo: string;
  let pago: string;
  let naoPago: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("pagamento-reimportar");
    a = await local.criarUsuario("a");
    mae = (await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Mãe", cor: 3, ordem: 1 }).select().single()).data!.id;
    tipo = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Casa" }).select().single()).data!.id;
    pago = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Pago", conta_como_pago: true }).select().single()).data!.id;
    naoPago = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Não pago", conta_como_pago: false }).select().single()).data!.id;
    await local.admin.from("configuracoes").insert({ owner_id: a.id, status_padrao_id: naoPago });
  });

  afterAll(async () => {
    await local.limpar();
  });

  const uuid = () => `00000000-0000-4000-c000-${String(++seq).padStart(12, "0")}`;
  const linha = async (id: string) => (await local.admin.from("lancamentos").select("*").eq("id", id).maybeSingle()).data;
  const itensDe = async (id: string) => (await local.admin.from("pagamento_itens").select("*").eq("lancamento_id", id)).data ?? [];

  /** Importa o Mês, classifica tudo como Mãe (o Bloco "Mãe" é só ela) e devolve os ids por Nome. */
  async function importar(mes: string, parcelas: Parcela[]) {
    const r = await chamar(a.cliente, primeira(mes, parcelas));
    expect(r.error).toBeNull();
    const faturaId = (r.data as { fatura: { id: string } }).fatura.id;
    await local.admin
      .from("lancamentos")
      .update({ responsavel_id: mae, tipo_id: tipo, revisao_motivo: null })
      .eq("owner_id", a.id)
      .eq("mes", mes);
    const { data } = await local.admin.from("lancamentos").select("id, nome").eq("owner_id", a.id).eq("mes", mes);
    return { faturaId, ids: Object.fromEntries((data ?? []).map((l) => [l.nome, l.id])) as Record<string, string> };
  }

  /** As linhas, os itens e a leitura da reimportação, como `lerReimportacao` as lê (PostgREST). */
  async function lerMes(mes: string) {
    const { data: linhas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mes);
    const todas = linhas ?? [];
    const { data: f } = await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", mes).maybeSingle();
    const { data: itens } = await local.admin
      .from("pagamento_itens")
      .select("lancamento_id")
      .in("lancamento_id", todas.map((l) => l.id));
    const comItem = new Set((itens ?? []).map((i) => i.lancamento_id));
    const daFatura = todas.filter((l) => f && l.fatura_id === f.id && l.dividido_de_id === null);
    const antigas: AntigaParaReimportar[] = daFatura.map((l) => ({
      id: l.id,
      nome_normalizado: l.nome_normalizado,
      valor_centavos: l.valor_centavos,
      parcela_n: l.parcela_n,
      parcela_total: l.parcela_total,
      ordem_fatura: l.ordem_fatura ?? 0,
      ajuste_de_id: l.ajuste_de_id,
      casado_em: l.casado_em,
      excluido_em: l.excluido_em,
      responsavel_id: l.responsavel_id,
      tipo_id: l.tipo_id,
      status_id: l.status_id,
      observacao: l.observacao,
      apelido: l.apelido,
      editado_em: l.editado_em,
      divisao: null,
      revisao_motivo: l.revisao_motivo,
      revisao_dados: l.revisao_dados,
      serie: null,
    }));
    const referenciadas = new Set(
      daFatura.filter((l) => comItem.has(l.id) || todas.some((x) => x.dividido_de_id === l.id && comItem.has(x.id))).map((l) => l.id),
    );
    const atualizadoEm = todas.map((l) => l.updated_at).sort().at(-1) ?? null;
    return { faturaId: f?.id ?? "", antigas, referenciadas, atualizadoEm };
  }

  /** O Saldo pendente do Bloco "Mãe" no Mês (o `projetarPendente` do núcleo sobre as linhas e os itens do banco). */
  async function saldo(mes: string): Promise<number> {
    const { data: linhas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id);
    const { data: itens } = await local.admin.from("pagamento_itens").select("*").eq("owner_id", a.id);
    const projetadas = projetarPendente((linhas ?? []) as unknown as LancamentoParaPendente[], {
      statusPagos: new Set([pago]),
      itens: itens ?? [],
      hoje: "2026-11-15",
      mes,
    });
    const r = avaliar({ tipo: "responsavel", id: mae }, projetadas);
    expect(r.ok).toBe(true);
    return r.ok ? r.valor.valorCentavos : Number.NaN;
  }

  async function ler(ids: string[]): Promise<LancamentoParaPagar[]> {
    const { data } = await a.cliente.from("lancamentos").select("*").in("id", ids);
    return data as unknown as LancamentoParaPagar[];
  }

  /** Paga `ids` (o núcleo monta o pedido): sem `valorTexto`, o total; com valor menor, "Fica pendente". */
  async function pagar(ids: string[], valorTexto?: string) {
    const linhas = await ler(ids);
    const { data: itens } = await a.cliente.from("pagamento_itens").select("lancamento_id, valor_centavos, excluido_em");
    const ctx = { statusPagos: new Set([pago]), itens: itens ?? [] };
    const projecao = projetarPagamento(new Set(ids), linhas, ctx);
    const plano = planejarPagamento({
      id: uuid(),
      statusId: pago,
      statusPagos: ctx.statusPagos,
      data: "2026-11-15",
      valorTexto: valorTexto ?? (projecao.totalCentavos / 100).toFixed(2).replace(".", ","),
      hoje: "2026-11-15",
      projecao,
      diferenca: valorTexto ? "pendente" : null,
    });
    expect(plano.ok).toBe(true);
    const pedido = plano.ok ? plano.valor.pedido : (undefined as never);
    const r = await a.cliente.rpc("aplicar_pagamento", { p_pedido: pedido as unknown as Json });
    expect(r.error).toBeNull();
    return pedido.id as string;
  }

  const excluir = (id: string) => local.admin.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", id);

  it("ACEITE: reimportar outubro com Pagamentos termina com o mesmo Saldo pendente de antes", async () => {
    const mes = "2026-10";
    const inicial: Parcela[] = [
      { nome: "A", valor: 10000 },
      { nome: "B", valor: 5000 },
      { nome: "C", valor: 3000 },
      { nome: "D", valor: 700 },
      { nome: "E", valor: 2000 },
    ];
    const { faturaId, ids } = await importar(mes, inicial);
    await pagar([ids.A, ids.D]); // total: A e D ficam Pagos
    await pagar([ids.B], "20,00"); // "Fica pendente": B leva um item parcial de R$ 20,00 e segue não pago
    await pagar([ids.E]);
    await excluir(ids.E); // pago e depois excluído: vira crédito de - R$ 20,00 (AD-11)
    // B 3.000 + C 3.000 - E 2.000 (crédito): D e A estão pagos.
    const antes = await saldo(mes);
    expect(antes).toBe(4000);

    // A Fatura nova traz A, B e C (os mesmos valores) e não traz mais D nem E.
    const lido = await lerMes(mes);
    expect([...lido.referenciadas].sort()).toEqual([ids.A, ids.B, ids.D, ids.E].sort());
    const imp = reimportacao(mes, inicial.slice(0, 3), lido.antigas, { statusPadraoId: naoPago, referenciadas: lido.referenciadas });
    expect(imp.reimportacao?.resumo).toMatchObject({ mantidas: 3, novas: 0, apagadas: 0, sumiram: 1, excluidos: 1, excluidosComPagamento: 1 });
    const r = await chamar(a.cliente, imp, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId });
    expect(r.error).toBeNull();

    // As casadas mantêm o id e os Pagamentos; a sem par com Pagamento sai da Fatura e vai ao Revisar.
    expect(await linha(ids.A)).toMatchObject({ fatura_id: faturaId, status_id: pago });
    expect(await linha(ids.B)).toMatchObject({ fatura_id: faturaId, status_id: naoPago });
    expect(await itensDe(ids.B)).toHaveLength(1);
    expect(await linha(ids.D)).toMatchObject({
      fatura_id: null,
      ordem_fatura: null,
      lancado_por: "manual",
      revisao_motivo: "sumiu_na_reimportacao",
      status_id: pago,
    });
    expect(await itensDe(ids.D)).toHaveLength(1);
    // A excluída com Pagamento NÃO derruba a reimportação pela FK: fica excluída, com o Pagamento.
    expect(await linha(ids.E)).toMatchObject({ excluido_em: expect.any(String) });
    expect(await itensDe(ids.E)).toHaveLength(1);
    // O Saldo é o mesmo de antes.
    expect(await saldo(mes)).toBe(antes);
  });

  it("a trava de estrutura: um plano velho que manda apagar uma linha com Pagamento é recusado (fatura.mes_mudou), sem gravar nada", async () => {
    const mes = "2026-09";
    const inicial: Parcela[] = [
      { nome: "F", valor: 4000 },
      { nome: "G", valor: 1500 },
      { nome: "H", valor: 900 },
    ];
    const { ids } = await importar(mes, inicial);
    await pagar([ids.F], "10,00"); // item parcial: o Status segue o padrão, a linha não tem "trabalho manual"
    const lido = await lerMes(mes);

    // Plano feito com a leitura velha (antes do Pagamento): F parece "limpa" e cai em `apagar`.
    const velho = reimportacao(mes, [inicial[1], inicial[2]], lido.antigas, { statusPadraoId: naoPago, referenciadas: new Set() });
    expect(velho.reimportacao?.apagar).toContain(ids.F);
    const recusada = await chamar(a.cliente, velho, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId });
    expect(recusada.error?.message).toContain("fatura.mes_mudou");
    expect(await linha(ids.F)).toMatchObject({ valor_centavos: 4000, excluido_em: null });
    expect(await itensDe(ids.F)).toHaveLength(1);

    // Com as `referenciadas` lidas, o mesmo Mês reimporta: F sai da Fatura, com o Pagamento.
    const certo = reimportacao(mes, [inicial[1], inicial[2]], lido.antigas, { statusPadraoId: naoPago, referenciadas: lido.referenciadas });
    expect(certo.reimportacao?.sumiram).toEqual([ids.F]);
    const ok = await chamar(a.cliente, certo, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId });
    expect(ok.error).toBeNull();
    expect(await linha(ids.F)).toMatchObject({ fatura_id: null, revisao_motivo: "sumiu_na_reimportacao" });
    expect(await itensDe(ids.F)).toHaveLength(1);
  });

  it("o item de um Pagamento DESFEITO também segura a linha (a FK): a viva sai da Fatura, a excluída fica", async () => {
    const mes = "2026-08";
    const inicial: Parcela[] = [
      { nome: "I", valor: 2500 },
      { nome: "J", valor: 1200 },
      { nome: "K", valor: 800 },
    ];
    const { ids } = await importar(mes, inicial);
    const desfeito = await pagar([ids.I]);
    const { data: itensDoDesfeito } = await a.cliente
      .from("pagamento_itens")
      .select("lancamento_id, status_anterior_id, status_aplicado_id, created_at")
      .eq("pagamento_id", desfeito)
      .is("excluido_em", null);
    const plano = planejarDesfazerPagamento(itensDoDesfeito ?? [], [{ id: ids.I, status_id: pago, updated_at: (await linha(ids.I))!.updated_at }], []);
    const d = await a.cliente.rpc("desfazer_pagamento", { p_pedido: { pagamento_id: desfeito, devolver: plano.devolver } as unknown as Json });
    expect(d.error).toBeNull();
    expect((await itensDe(ids.I))[0].excluido_em).not.toBeNull();
    // Excluída, só com item desfeito: não pode ser apagada.
    const pagoJ = await pagar([ids.J]);
    expect(pagoJ).toBeTruthy();
    await excluir(ids.J);

    const lido = await lerMes(mes);
    expect([...lido.referenciadas].sort()).toEqual([ids.I, ids.J].sort());
    const imp = reimportacao(mes, [inicial[2]], lido.antigas, { statusPadraoId: naoPago, referenciadas: lido.referenciadas });
    const r = await chamar(a.cliente, imp, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId });
    expect(r.error).toBeNull();
    expect(await linha(ids.I)).toMatchObject({ fatura_id: null, revisao_motivo: "sumiu_na_reimportacao" });
    expect(await linha(ids.J)).not.toBeNull();
  });

  it("a excluída com Pagamento que a Fatura nova traz de novo: a linha volta como NOVA e o crédito segue (o Saldo sobe o valor dela)", async () => {
    const mes = "2026-07";
    const inicial: Parcela[] = [
      { nome: "L", valor: 6000 },
      { nome: "M", valor: 3000 },
    ];
    const { ids } = await importar(mes, inicial);
    await pagar([ids.M]);
    await excluir(ids.M);
    const antes = await saldo(mes); // L 6.000 + crédito de M - 3.000
    expect(antes).toBe(3000);

    const lido = await lerMes(mes);
    const imp = reimportacao(mes, inicial, lido.antigas, { statusPadraoId: naoPago, referenciadas: lido.referenciadas });
    const r = await chamar(a.cliente, imp, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId });
    expect(r.error).toBeNull();
    expect(await linha(ids.M)).toMatchObject({ excluido_em: expect.any(String) });
    expect(await itensDe(ids.M)).toHaveLength(1);
    const { data: novas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mes).eq("nome", "M").is("excluido_em", null);
    expect(novas).toHaveLength(1);
    expect(novas![0].id).not.toBe(ids.M);
    // A linha voltou como qualquer excluída (3.11): em aberto, R$ 30,00 (nova, sem classificação até o Revisar), com o
    // crédito de R$ 30,00 da antiga. Classificada como Mãe, o Saldo sobe o valor dela.
    await local.admin.from("lancamentos").update({ responsavel_id: mae, tipo_id: tipo, revisao_motivo: null }).eq("id", novas![0].id);
    expect(await saldo(mes)).toBe(antes + 3000);
  });

  it("excluir_linhas_da_conta recusa (conta.mudou) uma linha com Pagamento vivo e exclui a sem Pagamento", async () => {
    const contaId = uuid();
    const { error: eConta } = await local.admin.from("contas_manuais").insert({
      id: contaId,
      owner_id: a.id,
      nome: "Conta com pagamento",
      valor_centavos: 5000,
      tipo_id: tipo,
      responsavel_id: mae,
      mes_inicial: "2026-11",
      repeticao: "mensal",
    });
    expect(eConta).toBeNull();
    const parcela = async (nome: string) =>
      (
        await local.admin
          .from("lancamentos")
          .insert({
            owner_id: a.id,
            nome,
            nome_normalizado: nome,
            valor_centavos: 5000,
            lancado_por: "manual",
            mes: "2026-12",
            status_id: naoPago,
            responsavel_id: mae,
            tipo_id: tipo,
            conta_manual_id: contaId,
          })
          .select("id, updated_at")
          .single()
      ).data!;
    const paga = await parcela("CONTA PAGA");
    const livre = await parcela("CONTA LIVRE");
    await pagar([paga.id]);

    const atual = (await linha(paga.id))!.updated_at;
    const recusada = await a.cliente.rpc("excluir_linhas_da_conta", {
      p_conta_id: contaId,
      p_itens: [{ id: paga.id, atualizado_em: atual }] as unknown as Json,
      p_mes_atual: "2026-12",
    });
    expect(recusada.error?.message).toContain("conta.mudou");
    expect(await linha(paga.id)).toMatchObject({ excluido_em: null });

    const ok = await a.cliente.rpc("excluir_linhas_da_conta", {
      p_conta_id: contaId,
      p_itens: [{ id: livre.id, atualizado_em: livre.updated_at }] as unknown as Json,
      p_mes_atual: "2026-12",
    });
    expect(ok.error).toBeNull();
    expect(await linha(livre.id)).toMatchObject({ excluido_em: expect.any(String) });
  });
});
