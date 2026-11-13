// Prova, contra o Supabase local (CI), a Divisão de um Lançamento (História
// 3.8, FR-15, AD-2, AD-8): a RPC `dividir_lancamento` grava a mãe e as filhas
// com os valores do núcleo (Monjaro R$ 466,00 = R$ 310,67 + R$ 155,33), recria
// só o que muda (a filha na mesma posição mantém o `id`, a que sobra sai em
// lógico e revive pelo `filha_id`), recusa o que não pode (mãe com Ajuste,
// soma errada, filha de outra mãe, outro dono) e a soma das filhas é sempre o
// Valor da mãe, inclusive negativo. A importação cria as filhas da Divisão da
// Regra e dos previstos; o casado mantém as filhas; a reimportação as apaga
// junto; o `REFERENCIAS_JSONB` troca o Responsável dentro da `divisao`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { classificarImportacao } from "../../src/domain/classificacao";
import {
  avaliarRascunho,
  lerDivisao,
  planejarDesfazerDivisao,
  planejarDivisao,
  type Divisao,
  type ItemDividir,
  type MaeParaDividir,
} from "../../src/domain/divisao";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import { aplicarCasamento, atribuirSeries, casarPrevistos, gerarPrevistos } from "../../src/domain/previstos";
import { ligado, planoApagarTudo, supabaseLocal, type Cliente, type Usuario } from "./apoio";

type Linha = { nome: string; n: number | null; total: number | null; valor: number; ajusteDe?: number };

function base(mes: string, linhas: Linha[]): LancamentoParaGravar[] {
  return linhas.map((p, i) => ({
    nome: p.nome,
    nome_normalizado: p.nome,
    valor_centavos: p.valor,
    data: `${mes}-01`,
    parcela_n: p.n,
    parcela_total: p.total,
    final_cartao: "5061",
    ordem_fatura: i + 1,
    duvida_extracao: false,
    // Ajuste de centavos: aponta para a ordem da mãe e não tem motivo próprio.
    ajuste_de_ordem: p.ajusteDe ?? null,
    tipo_sugerido: null,
    responsavel_id: null,
    tipo_id: null,
    revisao_motivo: p.ajusteDe === undefined ? "sem_classificacao" : null,
    revisao_dados: null,
    serie: null,
  }));
}

describe.skipIf(!ligado)("Divisão de um Lançamento no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae: string;
  let rafael: string;
  let tipoId: string;

  beforeAll(async () => {
    local = supabaseLocal("divisao");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const { data: m } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Mãe", cor: 3, ordem: 1 }).select().single();
    const { data: r } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Rafael", cor: 1, ordem: 2 }).select().single();
    const { data: t } = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Saúde" }).select().single();
    mae = m!.id;
    rafael = r!.id;
    tipoId = t!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  const doisTercos = (): Divisao => ({
    modo: "proporcao",
    partes: [
      { responsavel_id: mae, numerador: 2, denominador: 3 },
      { responsavel_id: rafael, numerador: 1, denominador: 3 },
    ],
  });

  async function importar(cliente: Cliente, imp: Importacao, lidoEm: string | null = null) {
    return cliente.rpc("importar_fatura", {
      dados_fatura: imp.fatura as unknown as Json,
      dados_cartoes: imp.cartoes as unknown as Json,
      dados_lancamentos: imp.lancamentos as unknown as Json,
      dados_previstos: imp.previstos as unknown as Json,
      previstos_sem_par: (imp.previstos_sem_par ?? []) as unknown as Json,
      ...(lidoEm ? { lancamentos_atualizados_em: lidoEm } : {}),
    });
  }

  /** Monta a importação como a tela: Regra, casamento, previstos. */
  function montar(mes: string, linhas: Linha[], comRegra: boolean): Importacao {
    const regra = comRegra
      ? [{ chave: "JIM COM", versao_normalizacao: 1, responsavel_id: null, tipo_id: tipoId, contagem: [], ultimo_uso: "2026-11-01T00:00:00Z", divisao: doisTercos() }]
      : [];
    const classificadas = classificarImportacao(
      atribuirSeries(base(mes, linhas), mes),
      regra,
      { responsaveis: [{ id: mae, arquivado: false }, { id: rafael, arquivado: false }], tipos: [{ id: tipoId, nome: "Saúde", arquivado: false }] },
    );
    const lancamentos = aplicarCasamento(classificadas, casarPrevistos(classificadas, []), []);
    const total = linhas.reduce((s, p) => s + p.valor, 0);
    return {
      fatura: { mes, vencimento: `${mes}-06`, fechamento: null, total_despesas_centavos: total, total_creditos_centavos: 0, saldo_anterior_centavos: null, pagamentos_centavos: null, total_a_pagar_centavos: null },
      cartoes: [{ final: "5061", total_centavos: total }],
      lancamentos,
      previstos: gerarPrevistos(lancamentos, mes),
      previstos_sem_par: [],
    };
  }

  const mesDe = (id: string) => local.admin.from("lancamentos").select("*").eq("id", id).single();
  const filhasDe = (id: string) => local.admin.from("lancamentos").select("*").eq("dividido_de_id", id).order("created_at");
  const paraDividir = (l: Awaited<ReturnType<typeof mesDe>>["data"]): MaeParaDividir => l as unknown as MaeParaDividir;
  const dividirRpc = (cliente: Cliente, itens: ItemDividir[]) => cliente.rpc("dividir_lancamento", { p_itens: itens as unknown as Json });

  it("Monjaro: R$ 466,00 = R$ 310,67 + R$ 155,33; a soma das filhas é o Valor da mãe; mãe e filhas dividem a posição na Fatura", async () => {
    const r = await importar(a.cliente, montar("2026-10", [{ nome: "MONJARO", n: null, total: null, valor: 46600 }], false));
    expect(r.error).toBeNull();
    const id = ((r.data as { lancamentos: { id: string }[] }).lancamentos[0]).id;
    await local.admin.from("lancamentos").update({ tipo_id: tipoId, responsavel_id: rafael }).eq("id", id);
    const atual = (await mesDe(id)).data!;
    const plano = planejarDivisao(paraDividir(atual), doisTercos(), { agora: "2026-11-11T13:00:00.000Z" });
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    const { data, error } = await dividirRpc(a.cliente, [plano.valor]);
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(3);
    const filhas = (await filhasDe(id)).data!;
    expect(filhas.map((f) => f.valor_centavos).sort((x, y) => y - x)).toEqual([31067, 15533]);
    expect(filhas.reduce((s, f) => s + f.valor_centavos, 0)).toBe(46600);
    expect(filhas.every((f) => f.fatura_id === atual.fatura_id && f.ordem_fatura === 1 && f.final_cartao === "5061" && f.tipo_id === tipoId && f.revisao_motivo === null)).toBe(true);
    const depois = (await mesDe(id)).data!;
    expect(depois.responsavel_id).toBeNull();
    expect(new Set(lerDivisao(depois.divisao)?.partes.map((p) => p.filha_id))).toEqual(new Set(filhas.map((f) => f.id)));
    expect(lerDivisao(depois.divisao)?.responsavel_antes).toBe(rafael);
  });

  it("redividir mantém o id das filhas, a que sobra sai em lógico e 'Desfazer' a revive; desfazer devolve o Responsável de antes", async () => {
    const r = await importar(a.cliente, montar("2026-09", [{ nome: "OUTRO", n: null, total: null, valor: 10000 }], false));
    const id = ((r.data as { lancamentos: { id: string }[] }).lancamentos[0]).id;
    await local.admin.from("lancamentos").update({ tipo_id: tipoId, responsavel_id: rafael }).eq("id", id);
    const dividir = async (d: Divisao) => {
      const atual = (await mesDe(id)).data!;
      const plano = planejarDivisao(paraDividir(atual), d, { agora: "2026-11-11T13:00:00.000Z" });
      expect(plano.ok).toBe(true);
      if (!plano.ok) throw new Error("plano");
      const res = await dividirRpc(a.cliente, [plano.valor]);
      expect(res.error).toBeNull();
      return plano.valor;
    };
    await dividir(doisTercos());
    const antes = (await filhasDe(id)).data!.map((f) => f.id).sort();
    const gravada = lerDivisao((await mesDe(id)).data!.divisao)!;
    const trio: Divisao = {
      modo: "proporcao",
      partes: [
        { responsavel_id: mae, numerador: 1, denominador: 2, filha_id: gravada.partes[0].filha_id },
        { responsavel_id: rafael, numerador: 1, denominador: 4, filha_id: gravada.partes[1].filha_id },
        { responsavel_id: mae, numerador: 1, denominador: 4 },
      ],
    };
    await dividir(trio);
    const vivas = (await filhasDe(id)).data!.filter((f) => f.excluido_em === null);
    expect(vivas.length).toBe(3);
    expect(antes.every((i) => vivas.some((f) => f.id === i))).toBe(true);
    expect(vivas.reduce((s, f) => s + f.valor_centavos, 0)).toBe(10000);
    // Volta a 2 partes: a sobra sai em lógico (continua na tabela).
    const dois = lerDivisao((await mesDe(id)).data!.divisao)!;
    await dividir({ ...doisTercos(), partes: doisTercos().partes.map((p, i) => ({ ...p, filha_id: dois.partes[i].filha_id })) });
    expect((await filhasDe(id)).data!.length).toBe(3);
    expect((await filhasDe(id)).data!.filter((f) => f.excluido_em === null).length).toBe(2);
    // Desfazer divisão: filhas excluídas e Responsável de antes de volta.
    const desfeito = planejarDesfazerDivisao(paraDividir((await mesDe(id)).data!), "2026-11-11T13:10:00.000Z");
    expect(desfeito.ok).toBe(true);
    if (!desfeito.ok) return;
    expect((await dividirRpc(a.cliente, [desfeito.valor])).error).toBeNull();
    const mae0 = (await mesDe(id)).data!;
    expect(mae0.divisao).toBeNull();
    expect(mae0.responsavel_id).toBe(rafael);
    expect((await filhasDe(id)).data!.filter((f) => f.excluido_em === null)).toEqual([]);
  });

  it("recusas: soma errada, mãe com Ajuste, filha de outra mãe, filha como mãe, coluna fora da lista e outro dono", async () => {
    const r = await importar(
      a.cliente,
      montar(
        "2026-08",
        [
          { nome: "PARCELA", n: 1, total: 3, valor: 11407 },
          { nome: "PARCELA", n: null, total: null, valor: -8, ajusteDe: 1 },
          { nome: "SOLTA", n: null, total: null, valor: 5000 },
        ],
        false,
      ),
    );
    const lancamentos = (r.data as { lancamentos: { id: string; nome: string; valor_centavos: number; ajuste_de_id: string | null }[] }).lancamentos;
    const parcela = lancamentos.find((l) => l.valor_centavos === 11407)!;
    const solta = lancamentos.find((l) => l.nome === "SOLTA")!;
    expect(lancamentos.find((l) => l.valor_centavos === -8)?.ajuste_de_id).toBe(parcela.id);
    await local.admin.from("lancamentos").update({ tipo_id: tipoId }).in("id", [parcela.id, solta.id]);
    const item = (id: string, valor: number, partes?: { filha_id: string | null; valor: number }[]): ItemDividir => ({
      id,
      corpo: { divisao: doisTercos() },
      partes: (partes ?? [{ filha_id: null, valor: Math.round(valor * 2 / 3) }, { filha_id: null, valor: valor - Math.round(valor * 2 / 3) }]).map((p, i) => ({
        filha_id: p.filha_id,
        responsavel_id: i === 0 ? mae : rafael,
        valor_centavos: p.valor,
      })),
    });
    expect((await dividirRpc(a.cliente, [item(parcela.id, 11407)])).error?.message).toContain("divisao.com_ajuste");
    expect((await dividirRpc(a.cliente, [item(solta.id, 5000, [{ filha_id: null, valor: 3000 }, { filha_id: null, valor: 1000 }])])).error?.message).toContain("divisao.soma_diferente");
    expect((await dividirRpc(a.cliente, [{ ...item(solta.id, 5000), corpo: { divisao: doisTercos(), nome: "x" } as never }])).error?.message).toContain("salvar.falhou");
    expect((await dividirRpc(b.cliente, [item(solta.id, 5000)])).error?.message).toContain("divisao.mae_invalida");
    expect((await filhasDe(solta.id)).data).toEqual([]);
    // Filha de outra mãe e filha como mãe.
    expect((await dividirRpc(a.cliente, [item(solta.id, 5000)])).error).toBeNull();
    const filha = (await filhasDe(solta.id)).data![0];
    expect((await dividirRpc(a.cliente, [item(filha.id, 1000)])).error?.message).toContain("divisao.mae_invalida");
    const outra = lancamentos.find((l) => l.valor_centavos === 11407)!;
    expect((await dividirRpc(a.cliente, [{ id: outra.id, corpo: { divisao: doisTercos() }, partes: [{ filha_id: filha.id, responsavel_id: mae, valor_centavos: 7605 }, { filha_id: null, responsavel_id: rafael, valor_centavos: 3802 }] }])).error?.message).toMatch(/com_ajuste|filha_invalida/);
  });

  it("a soma das filhas é sempre o Valor da mãe, inclusive negativo", async () => {
    for (const [i, valor] of [[0, 100], [1, 46601], [2, -10001], [3, -7]] as const) {
      const r = await importar(a.cliente, montar(`2025-0${i + 1}`, [{ nome: `VALOR${i}`, n: null, total: null, valor }], false));
      const id = ((r.data as { lancamentos: { id: string }[] }).lancamentos[0]).id;
      await local.admin.from("lancamentos").update({ tipo_id: tipoId }).eq("id", id);
      const av = avaliarRascunho(valor, "proporcao", [
        { responsavel_id: mae, texto: "1/3", status_id: null },
        { responsavel_id: rafael, texto: "2/3", status_id: null },
      ]);
      if (av.erro !== null) {
        // Valores pequenos zeram uma parte: o núcleo recusa antes de gravar.
        expect(av.erro).toBe("divisao.parte_zerada");
        continue;
      }
      const plano = planejarDivisao(paraDividir((await mesDe(id)).data!), av.divisao!);
      expect(plano.ok).toBe(true);
      if (!plano.ok) continue;
      expect((await dividirRpc(a.cliente, [plano.valor])).error).toBeNull();
      const filhas = (await filhasDe(id)).data!;
      expect(filhas.reduce((s, f) => s + f.valor_centavos, 0)).toBe(valor);
    }
  });

  it("importação: a Regra com Divisão cria a mãe com as filhas; o previsto nasce dividido; a reimportação apaga as filhas junto", async () => {
    const imp = montar("2027-01", [{ nome: "JIM COM", n: 1, total: 3, valor: 46600 }], true);
    expect(imp.lancamentos[0].divisao?.regra_chave).toBe("JIM COM");
    const r = await importar(a.cliente, imp);
    expect(r.error).toBeNull();
    const out = r.data as { lancamentos: { id: string; dividido_de_id: string | null; divisao: unknown; responsavel_id: string | null; revisao_motivo: string | null }[]; previstos: { id: string; dividido_de_id: string | null; divisao: unknown; valor_centavos: number }[]; fatura: { id: string } };
    const maes = out.lancamentos.filter((l) => l.dividido_de_id === null);
    expect(maes.length).toBe(1);
    expect(maes[0].responsavel_id).toBeNull();
    expect(maes[0].revisao_motivo).toBeNull();
    expect(lerDivisao(maes[0].divisao)?.regra_chave).toBe("JIM COM");
    expect(out.lancamentos.filter((l) => l.dividido_de_id === maes[0].id).length).toBe(2);
    const previstos = out.previstos.filter((p) => p.dividido_de_id === null);
    expect(previstos.length).toBe(2);
    for (const p of previstos) {
      const fs = out.previstos.filter((x) => x.dividido_de_id === p.id);
      expect(fs.length).toBe(2);
      expect(fs.reduce((s, f) => s + f.valor_centavos, 0)).toBe(p.valor_centavos);
    }
    // Reimportar o Mês (sem casados): mãe, filhas e os previstos intocados saem; a nova importação recria.
    const imp2 = montar("2027-01", [{ nome: "JIM COM", n: 1, total: 3, valor: 46600 }], true);
    const { data: ult } = await local.admin.from("lancamentos").select("updated_at").eq("owner_id", a.id).eq("mes", "2027-01").order("updated_at", { ascending: false }).limit(1);
    const r2 = await a.cliente.rpc("importar_fatura", {
      dados_fatura: imp2.fatura as unknown as Json,
      dados_cartoes: imp2.cartoes as unknown as Json,
      dados_lancamentos: imp2.lancamentos as unknown as Json,
      dados_previstos: imp2.previstos as unknown as Json,
      previstos_sem_par: [] as unknown as Json,
      lancamentos_atualizados_em: ult![0].updated_at,
      substituir_fatura_id: out.fatura.id,
      dados_reimportacao: (await planoApagarTudo(a.cliente, out.fatura.id)) as unknown as Json,
    });
    expect(r2.error).toBeNull();
    const { data: orfas } = await local.admin.from("lancamentos").select("id, dividido_de_id").eq("owner_id", a.id).not("dividido_de_id", "is", null);
    const ids = new Set((await local.admin.from("lancamentos").select("id").eq("owner_id", a.id)).data!.map((l) => l.id));
    expect((orfas ?? []).every((f) => ids.has(f.dividido_de_id!))).toBe(true);
  });

  it("substituir_cadastro troca o Responsável dentro da divisão (jsonb sem contar uso)", async () => {
    const { data: regra } = await local.admin
      .from("regras")
      .insert({ owner_id: a.id, chave: "TESTE JSONB", versao_normalizacao: 1, tipo_id: tipoId, divisao: doisTercos() as unknown as Json })
      .select()
      .single();
    const { data: novo } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Novo", cor: 5, ordem: 9 }).select().single();
    const { data: velho } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Velho", cor: 6, ordem: 10 }).select().single();
    await local.admin.from("regras").update({ divisao: { modo: "proporcao", partes: [{ responsavel_id: velho!.id, numerador: 1, denominador: 2 }, { responsavel_id: mae, numerador: 1, denominador: 2 }] } as unknown as Json }).eq("id", regra!.id);
    const { error } = await a.cliente.rpc("substituir_cadastro", { cadastro: "responsavel", de_id: velho!.id, para_id: novo!.id });
    expect(error).toBeNull();
    const { data: depois } = await local.admin.from("regras").select("divisao").eq("id", regra!.id).single();
    expect(lerDivisao(depois!.divisao)?.partes[0].responsavel_id).toBe(novo!.id);
  });
});
