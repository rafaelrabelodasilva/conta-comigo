// Prova, contra o Supabase local (CI), a reimportação que mantém a
// classificação (História 3.12, FR-51, AD-7.6): o núcleo casa as linhas novas
// com as antigas e decide o destino das que sobram; `importar_fatura` só
// executa. Casadas mantêm `id`, classificação, Apelido e Série; a sem par e
// sem trabalho é apagada (com os previstos que ninguém tocou); a mexida à mão
// sai da Fatura com `sumiu_na_reimportacao`; a casada sem par volta a
// previsto; um plano que não cobre as linhas da Fatura é recusado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { lerDivisao } from "../../src/domain/divisao";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import {
  aplicarCasamento,
  atribuirSeries,
  casarPrevistos,
  gerarPrevistos,
  type PrevistoParaCasar,
} from "../../src/domain/previstos";
import {
  aplicarReimportacao,
  casarSobrasComPrevistos,
  planejarReimportacao,
  type AntigaParaReimportar,
} from "../../src/domain/reimportacao";
import { ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

type Parcela = { nome: string; n: number | null; total: number | null; valor: number };

function base(mes: string, parcelas: Parcela[]): LancamentoParaGravar[] {
  return parcelas.map((p, i) => ({
    nome: p.nome,
    nome_normalizado: p.nome,
    valor_centavos: p.valor,
    data: `${mes}-01`,
    parcela_n: p.n,
    parcela_total: p.total,
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
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    mes,
    vencimento: `${mes}-06`,
    fechamento: null,
    total_despesas_centavos: total,
    total_creditos_centavos: 0,
    saldo_anterior_centavos: null,
    pagamentos_centavos: null,
    total_a_pagar_centavos: null,
  };
}

/** Importação normal (primeira vez), como a tela monta. */
function primeira(mes: string, parcelas: Parcela[]): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const casamento = casarPrevistos(comSeries, []);
  const lancamentos = aplicarCasamento(comSeries, casamento, []);
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: total }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, []),
    previstos_sem_par: [],
  };
}

/** Reimportação como a tela monta: plano do núcleo sobre as linhas antigas e os previstos lidos do banco. */
function reimportacao(mes: string, parcelas: Parcela[], antigas: AntigaParaReimportar[], previstosDoMes: PrevistoParaCasar[]): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const plano = planejarReimportacao(comSeries, antigas, { statusPadraoId: null });
  const lancamentos = aplicarReimportacao(comSeries, plano, antigas, previstosDoMes, []);
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: total }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, [mes]),
    previstos_sem_par: casarSobrasComPrevistos(comSeries, plano, previstosDoMes).semPar,
    reimportacao: {
      apagar: plano.apagar,
      sumiram: plano.sumiram,
      voltar_a_previsto: plano.voltar_a_previsto,
      resumo: plano.resumo,
    },
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

describe.skipIf(!ligado)("Reimportar mantendo a classificação no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("reimportacao");
    a = await local.criarUsuario("a");
  });

  afterAll(async () => {
    await local.limpar();
  });

  /** As linhas do Mês, as antigas da Fatura e os previstos do Mês, como `lerReimportacao` e `lerPrevistosDoMes`. */
  async function lerMes(mes: string) {
    const { data } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mes);
    const linhas = data ?? [];
    const { data: f } = await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", mes).maybeSingle();
    const { data: series } = await local.admin.from("series").select("*").eq("owner_id", a.id);
    const dasSeries = new Map((series ?? []).map((s) => [s.id, s]));
    const chave = (id: string | null) => {
      const s = id === null ? undefined : dasSeries.get(id);
      return s
        ? {
            nome_normalizado: s.nome_normalizado,
            parcela_total: s.parcela_total!,
            valor_parcela_centavos: s.valor_parcela_centavos,
            mes_primeira_parcela: s.mes_primeira_parcela,
            ocorrencia: s.ocorrencia,
          }
        : null;
    };
    const antigas: AntigaParaReimportar[] = linhas
      .filter((l) => f && l.fatura_id === f.id && l.dividido_de_id === null)
      .map((l) => ({
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
        divisao: lerDivisao(l.divisao),
        revisao_motivo: l.revisao_motivo,
        revisao_dados: l.revisao_dados,
        serie: chave(l.serie_id),
      }));
    const previstos: PrevistoParaCasar[] = linhas
      .filter((l) => l.lancado_por === "sistema" && l.excluido_em === null && l.fatura_id === null && l.serie_id)
      .map((l) => ({
        id: l.id,
        nome_normalizado: l.nome_normalizado,
        parcela_n: l.parcela_n,
        parcela_total: l.parcela_total,
        valor_centavos: l.valor_centavos,
        ocorrencia: dasSeries.get(l.serie_id!)!.ocorrencia,
        responsavel_id: l.responsavel_id,
        tipo_id: l.tipo_id,
        serie: chave(l.serie_id) ?? undefined,
      }));
    const atualizadoEm = linhas.map((l) => l.updated_at).sort().at(-1) ?? null;
    return { faturaId: f?.id ?? null, antigas, previstos, atualizadoEm };
  }

  const idDe = async (mes: string, nome: string, ordem: number) =>
    (await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", mes).eq("nome", nome).eq("ordem_fatura", ordem).single()).data!.id;
  const linha = async (id: string) => (await local.admin.from("lancamentos").select("*").eq("id", id).maybeSingle()).data;

  const inicial: Parcela[] = [
    { nome: "A", n: null, total: null, valor: 1000 },
    { nome: "B", n: null, total: null, valor: 2000 },
    { nome: "B", n: null, total: null, valor: 2000 },
    { nome: "PARC", n: 1, total: 3, valor: 3000 },
    { nome: "PERDIDA", n: 1, total: 3, valor: 4000 },
    { nome: "SUMIDA", n: null, total: null, valor: 700 },
    { nome: "EXCL", n: null, total: null, valor: 55 },
  ];
  const novas: Parcela[] = [
    { nome: "B", n: null, total: null, valor: 2000 },
    { nome: "A", n: null, total: null, valor: 1100 },
    { nome: "B", n: null, total: null, valor: 2000 },
    { nome: "PARC", n: 1, total: 3, valor: 3000 },
    { nome: "NOVA", n: null, total: null, valor: 123 },
  ];

  it("mantém id, classificação e Apelido das casadas; apaga a sem trabalho; a mexida sai da Fatura; as novas entram", async () => {
    const gravada = await chamar(a.cliente, primeira("2026-10", inicial));
    expect(gravada.error).toBeNull();
    const [iA, iB1, iB2, iP, iPerdida, iSumida, iExcl] = await Promise.all(inicial.map((p, i) => idDe("2026-10", p.nome, i + 1)));
    const fid = (gravada.data as { fatura: { id: string } }).fatura.id;
    const { data: resp } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Casal", cor: 1, ordem: 1 }).select().single();
    const { data: tipo } = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Casa" }).select().single();
    const agora = new Date().toISOString();
    await local.admin
      .from("lancamentos")
      .update({ responsavel_id: resp!.id, tipo_id: tipo!.id, apelido: "Meu A", observacao: "obs", editado_em: agora, revisao_motivo: null })
      .eq("id", iA);
    await local.admin.from("lancamentos").update({ editado_em: agora, observacao: "mexida" }).eq("id", iSumida);
    await local.admin.from("lancamentos").update({ excluido_em: agora }).eq("id", iExcl);
    const previstosDePerdida = (await local.admin.from("lancamentos").select("id").eq("origem_lancamento_id", iPerdida)).data!.map((l) => l.id);
    const previstosDeP = (await local.admin.from("lancamentos").select("id").eq("origem_lancamento_id", iP)).data!.map((l) => l.id);
    expect(previstosDePerdida).toHaveLength(2);

    const lido = await lerMes("2026-10");
    const imp = reimportacao("2026-10", novas, lido.antigas, lido.previstos);
    expect(imp.reimportacao?.resumo).toMatchObject({ mantidas: 4, novas: 1, apagadas: 1, sumiram: 1, valorMudou: 1, excluidos: 1 });
    const r = await chamar(a.cliente, imp, { lidoEm: lido.atualizadoEm, substituir: fid });
    expect(r.error).toBeNull();
    const out = r.data as { fatura: { id: string }; removidos: { fatura_id: string | null; previstos: string[]; lancamentos: string[] } };
    expect(out.fatura.id).toBe(fid);
    expect(out.removidos.fatura_id).toBeNull();

    const a1 = await linha(iA);
    expect(a1).toMatchObject({ responsavel_id: resp!.id, tipo_id: tipo!.id, apelido: "Meu A", observacao: "obs", valor_centavos: 1100, ordem_fatura: 2, revisao_motivo: "valor_mudou" });
    expect(a1!.editado_em).not.toBeNull();
    expect(await linha(iB1)).toMatchObject({ ordem_fatura: 1 });
    expect(await linha(iB2)).toMatchObject({ ordem_fatura: 3 });
    expect(await linha(iP)).toMatchObject({ fatura_id: fid, ordem_fatura: 4, casado_em: null });
    expect(await linha(iPerdida)).toBeNull();
    // A excluída é apagada (se a Fatura nova a trouxesse, voltaria como linha nova).
    expect(await linha(iExcl)).toBeNull();
    for (const id of previstosDePerdida) expect(await linha(id)).toBeNull();
    expect(out.removidos.lancamentos).toContain(iPerdida);
    for (const id of previstosDeP) expect(await linha(id)).not.toBeNull();
    expect(await linha(iSumida)).toMatchObject({
      fatura_id: null,
      ordem_fatura: null,
      lancado_por: "manual",
      revisao_motivo: "sumiu_na_reimportacao",
      observacao: "mexida",
    });
    const nova = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("fatura_id", fid).eq("nome", "NOVA").single();
    expect(nova.data).toMatchObject({ ordem_fatura: 5, lancado_por: "fatura" });
    const { count } = await local.admin.from("lancamentos").select("id", { count: "exact", head: true }).eq("fatura_id", fid).is("excluido_em", null);
    expect(count).toBe(5);
    expect((await local.admin.from("faturas").select("id", { count: "exact", head: true }).eq("owner_id", a.id)).count).toBe(1);
  });

  it("a casada sem par volta a previsto, com o mesmo id, e vai para 'Não veio na fatura'", async () => {
    // Os previstos de nov/26 que a Fatura de out/26 criou: PARC 2/3 casa com a Fatura de nov/26.
    const previsto = (await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-11").eq("nome", "PARC").single()).data!.id;
    const lido = await lerMes("2026-11");
    const g = await chamar(a.cliente, primeira2("2026-11", lido.previstos), { lidoEm: lido.atualizadoEm });
    expect(g.error).toBeNull();
    const fid = (g.data as { fatura: { id: string } }).fatura.id;
    expect(await linha(previsto)).toMatchObject({ lancado_por: "fatura", fatura_id: fid });
    expect((await linha(previsto))!.casado_em).not.toBeNull();

    // Reimporta nov/26 sem a PARC.
    const l2 = await lerMes("2026-11");
    const imp = reimportacao("2026-11", [{ nome: "OUTRA", n: null, total: null, valor: 999 }], l2.antigas, l2.previstos);
    expect(imp.reimportacao?.voltar_a_previsto).toEqual([previsto]);
    const r = await chamar(a.cliente, imp, { lidoEm: l2.atualizadoEm, substituir: fid });
    expect(r.error).toBeNull();
    expect(await linha(previsto)).toMatchObject({
      lancado_por: "sistema",
      fatura_id: null,
      ordem_fatura: null,
      data: null,
      final_cartao: null,
      casado_em: null,
      revisao_motivo: "nao_veio_na_fatura",
    });
    expect((await linha(previsto))!.serie_id).not.toBeNull();
  });

  it("plano que não cobre as linhas vivas da Fatura: fatura.mes_mudou e nada é gravado; sem plano: salvar.falhou", async () => {
    const lido = await lerMes("2026-10");
    const imp = reimportacao("2026-10", novas, lido.antigas, lido.previstos);
    const antes = await local.admin.from("lancamentos").select("id, updated_at").eq("owner_id", a.id).eq("mes", "2026-10");
    // Tira um id do plano: a Fatura tem uma linha viva que o plano não cobre.
    const incompleto: Importacao = {
      ...imp,
      lancamentos: imp.lancamentos.map((l, i) => (i === 0 ? { ...l, antiga_id: null } : l)),
    };
    const { error } = await chamar(a.cliente, incompleto, { lidoEm: lido.atualizadoEm, substituir: lido.faturaId! });
    expect(error?.message).toBe("fatura.mes_mudou");
    const semPlano = await a.cliente.rpc("importar_fatura", {
      dados_fatura: imp.fatura as unknown as Json,
      dados_cartoes: imp.cartoes as unknown as Json,
      dados_lancamentos: imp.lancamentos as unknown as Json,
      lancamentos_atualizados_em: lido.atualizadoEm!,
      substituir_fatura_id: lido.faturaId!,
    });
    expect(semPlano.error?.message).toBe("salvar.falhou");
    const depois = await local.admin.from("lancamentos").select("id, updated_at").eq("owner_id", a.id).eq("mes", "2026-10");
    expect(depois.data).toEqual(antes.data);
  });

  /** nov/26: a PARC 2/3 do previsto casa e as outras linhas são novas. */
  function primeira2(mes: string, previstosDoMes: PrevistoParaCasar[]): Importacao {
    const parcelas: Parcela[] = [{ nome: "PARC", n: 2, total: 3, valor: 3000 }];
    const comSeries = atribuirSeries(base(mes, parcelas), mes);
    const casamento = casarPrevistos(comSeries, previstosDoMes);
    const lancamentos = aplicarCasamento(comSeries, casamento, previstosDoMes);
    return {
      fatura: fatura(mes, parcelas),
      cartoes: [{ final: "5061", total_centavos: 3000 }],
      lancamentos,
      previstos: gerarPrevistos(lancamentos, mes, []),
      previstos_sem_par: casamento.semPar,
    };
  }
});
