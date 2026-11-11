// Prova, contra o Supabase local (CI), o casamento dos previstos com a Fatura
// real (História 3.6, FR-45, AD-8): a RPC `importar_fatura` transforma o
// previsto casado na linha real (mesmo `id`, Série, Apelido e classificação),
// marca o previsto sem par como "Não veio na fatura", recusa a reimportação
// de uma Fatura com linhas casadas e recusa um plano velho (`mes_mudou`). O
// teste de aceite: duas compras idênticas casam as duas parcelas seguintes
// sem estourar a restrição única da Série.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import {
  aplicarCasamento,
  atribuirSeries,
  casarPrevistos,
  gerarPrevistos,
  type PrevistoParaCasar,
} from "../../src/domain/previstos";
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

/** Monta a importação como a tela: Séries, casamento com os previstos lidos do banco e previstos novos. */
function importacao(mes: string, parcelas: Parcela[], previstosDoMes: PrevistoParaCasar[], mesesComFatura: string[] = []): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const casamento = casarPrevistos(comSeries, previstosDoMes);
  const lancamentos = aplicarCasamento(comSeries, casamento, previstosDoMes);
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    fatura: {
      mes,
      vencimento: `${mes}-06`,
      fechamento: null,
      total_despesas_centavos: total,
      total_creditos_centavos: 0,
      saldo_anterior_centavos: null,
      pagamentos_centavos: null,
      total_a_pagar_centavos: null,
    },
    cartoes: [{ final: "5061", total_centavos: total }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, mesesComFatura),
    previstos_sem_par: casamento.semPar,
  };
}

function chamar(cliente: Cliente, imp: Importacao, extra: { lidoEm?: string | null; substituir?: string } = {}) {
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    dados_previstos: imp.previstos as unknown as Json,
    previstos_sem_par: (imp.previstos_sem_par ?? []) as unknown as Json,
    ...(extra.lidoEm ? { lancamentos_atualizados_em: extra.lidoEm } : {}),
    ...(extra.substituir ? { substituir_fatura_id: extra.substituir } : {}),
  });
}

type Gravados = {
  fatura: { id: string };
  lancamentos: Record<string, unknown>[] & { id: string }[];
  previstos: { id: string; revisao_motivo: string | null; lancado_por: string; fatura_id: string | null }[];
};

describe.skipIf(!ligado)("Casamento dos previstos no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("casamento");
    a = await local.criarUsuario("a");
  });

  afterAll(async () => {
    await local.limpar();
  });

  /** Os previstos do Mês e o updated_at mais novo do Mês, como `lerPrevistosDoMes`. */
  async function lerMes(mes: string) {
    const { data } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mes);
    const linhas = data ?? [];
    const { data: series } = await local.admin.from("series").select("*").eq("owner_id", a.id);
    const dasSeries = new Map((series ?? []).map((s) => [s.id, s]));
    const previstos: PrevistoParaCasar[] = linhas
      .filter((l) => l.lancado_por === "sistema" && l.excluido_em === null && l.fatura_id === null && l.serie_id)
      .map((l) => ({
        id: l.id,
        nome_normalizado: l.nome_normalizado,
        parcela_n: l.parcela_n!,
        parcela_total: l.parcela_total!,
        valor_centavos: l.valor_centavos,
        ocorrencia: dasSeries.get(l.serie_id!)!.ocorrencia,
        responsavel_id: l.responsavel_id,
        tipo_id: l.tipo_id,
        // Como `lerPrevistosDoMes`: a chave da Série evita a Série já ocupada.
        serie: {
          nome_normalizado: dasSeries.get(l.serie_id!)!.nome_normalizado,
          parcela_total: dasSeries.get(l.serie_id!)!.parcela_total,
          valor_parcela_centavos: dasSeries.get(l.serie_id!)!.valor_parcela_centavos,
          mes_primeira_parcela: dasSeries.get(l.serie_id!)!.mes_primeira_parcela,
          ocorrencia: dasSeries.get(l.serie_id!)!.ocorrencia,
        },
      }));
    const atualizadoEm = linhas.map((l) => l.updated_at).sort().at(-1) ?? null;
    return { previstos, atualizadoEm };
  }

  const dupla: Parcela = { nome: "RENNER", n: 3, total: 5, valor: 10000 };
  const outras: Parcela[] = [
    { nome: "MAGALU", n: 5, total: 10, valor: 44589 },
    { nome: "SUMIDA", n: 5, total: 10, valor: 5000 },
    dupla,
    dupla,
  ];

  it("aceite: dez/26 casa os previstos de nov/26, inclusive as duas compras idênticas, sem estourar a restrição única", async () => {
    const out = await chamar(a.cliente, importacao("2026-10", outras, []));
    expect(out.error).toBeNull();
    const { data: antes } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", "2026-11").eq("lancado_por", "sistema");
    expect(antes).toHaveLength(4);
    const idsPrevistos = new Set(antes!.map((l) => l.id));

    // Rafael classifica o previsto de MAGALU e dá um Apelido; a Fatura de nov/26 traz o Valor novo.
    const magalu = antes!.find((l) => l.nome_normalizado === "MAGALU")!;
    const { data: resp } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Casal", cor: 1, ordem: 1 }).select().single();
    const { data: tipo } = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Casa" }).select().single();
    await local.admin
      .from("lancamentos")
      .update({ responsavel_id: resp!.id, tipo_id: tipo!.id, apelido: "Sofá", editado_em: new Date().toISOString() })
      .eq("id", magalu.id);

    const lido = await lerMes("2026-11");
    const nov = await chamar(
      a.cliente,
      importacao(
        "2026-11",
        [
          { nome: "MAGALU", n: 6, total: 10, valor: 44910 },
          { ...dupla, n: 4 },
          { ...dupla, n: 4 },
        ],
        lido.previstos,
        ["2026-10"],
      ),
      { lidoEm: lido.atualizadoEm },
    );
    expect(nov.error).toBeNull();
    const g = nov.data as unknown as Gravados;

    // Casados: mesmo id, viraram da Fatura, entram na Conferência (fatura_id).
    const casados = (g.lancamentos as unknown as { id: string; lancado_por: string; fatura_id: string; casado_em: string | null }[]).filter((l) =>
      idsPrevistos.has(l.id),
    );
    expect(casados).toHaveLength(3);
    expect(casados.every((l) => l.lancado_por === "fatura" && l.fatura_id === g.fatura.id && l.casado_em !== null)).toBe(true);

    const { data: m } = await local.admin.from("lancamentos").select("*").eq("id", magalu.id).single();
    expect(m).toMatchObject({
      valor_centavos: 44910,
      responsavel_id: resp!.id,
      tipo_id: tipo!.id,
      apelido: "Sofá",
      revisao_motivo: "valor_mudou",
      revisao_dados: { antes_centavos: 44589 },
      serie_id: magalu.serie_id,
    });

    // Sem par: SUMIDA continua previsto, fora da Fatura, "Não veio na fatura".
    const sumida = g.previstos.find((p) => p.revisao_motivo === "nao_veio_na_fatura")!;
    expect(sumida).toMatchObject({ lancado_por: "sistema", fatura_id: null });

    // Uma linha por parcela de cada Série (a restrição única nunca disparou).
    const { data: todas } = await local.admin.from("lancamentos").select("serie_id, parcela_n").eq("owner_id", a.id).is("excluido_em", null).not("serie_id", "is", null);
    const chaves = (todas ?? []).map((l) => `${l.serie_id}:${l.parcela_n}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("reimportar a Fatura com linhas casadas: fatura.reimportacao_com_casados e nada é apagado", async () => {
    const { data: f } = await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", "2026-11").single();
    const antes = await local.admin.from("lancamentos").select("id", { count: "exact", head: true }).eq("owner_id", a.id);
    const lido = await lerMes("2026-11");
    const { error } = await chamar(a.cliente, importacao("2026-11", [{ nome: "NOVA", n: null, total: null, valor: 100 }], []), {
      lidoEm: lido.atualizadoEm,
      substituir: f!.id,
    });
    expect(error?.message).toBe("fatura.reimportacao_com_casados");
    const depois = await local.admin.from("lancamentos").select("id", { count: "exact", head: true }).eq("owner_id", a.id);
    expect(depois.count).toBe(antes.count);
  });

  it("plano velho: previsto casado que já não existe no Mês → fatura.mes_mudou e nada é gravado", async () => {
    const imp = importacao("2027-03", [{ nome: "X", n: 2, total: 4, valor: 100 }], [
      { id: "99999999-9999-4999-8999-999999999999", nome_normalizado: "X", parcela_n: 2, parcela_total: 4, valor_centavos: 100, ocorrencia: 1, responsavel_id: null, tipo_id: null },
    ]);
    const { error } = await chamar(a.cliente, imp);
    expect(error?.message).toBe("fatura.mes_mudou");
    const { count } = await local.admin.from("faturas").select("id", { count: "exact", head: true }).eq("owner_id", a.id).eq("mes", "2027-03");
    expect(count).toBe(0);
  });

  it("previsto excluído não ressuscita nem casa: o real vira linha nova, numa Série livre, sem recusar a importação", async () => {
    const par: Parcela = { nome: "PAR", n: 2, total: 5, valor: 3000 };
    const jan = await chamar(a.cliente, importacao("2027-08", [par, par], []));
    expect(jan.error).toBeNull();
    const { data: previstos } = await local.admin
      .from("lancamentos")
      .select("id, serie_id")
      .eq("owner_id", a.id)
      .eq("nome_normalizado", "PAR")
      .eq("parcela_n", 3);
    expect(previstos).toHaveLength(2);
    // Rafael exclui um dos dois previstos; a Fatura seguinte traz as duas compras.
    await local.admin.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", previstos![0].id);
    const lido = await lerMes("2027-09");
    const fev = await chamar(
      a.cliente,
      importacao("2027-09", [{ ...par, n: 3 }, { ...par, n: 3 }], lido.previstos),
      { lidoEm: lido.atualizadoEm },
    );
    expect(fev.error).toBeNull();
    const { data: ativas } = await local.admin
      .from("lancamentos")
      .select("id, lancado_por, excluido_em")
      .eq("owner_id", a.id)
      .eq("nome_normalizado", "PAR")
      .eq("parcela_n", 3)
      .is("excluido_em", null);
    // Uma casou com o previsto que restou, a outra é linha nova; o excluído continua excluído.
    expect(ativas).toHaveLength(2);
    expect(ativas!.every((l) => l.lancado_por === "fatura")).toBe(true);
    expect(ativas!.some((l) => l.id === previstos![0].id)).toBe(false);
  });

  it("parcela real sem previsto segue como linha nova, com Série e sem casado_em", async () => {
    const { data, error } = await chamar(a.cliente, importacao("2027-06", [{ nome: "LOJA N", n: 2, total: 4, valor: 700 }], []));
    expect(error).toBeNull();
    const l = (data as unknown as Gravados).lancamentos[0] as unknown as { serie_id: string | null; casado_em: string | null; lancado_por: string };
    expect(l).toMatchObject({ lancado_por: "fatura", casado_em: null });
    expect(l.serie_id).not.toBeNull();
  });
});
