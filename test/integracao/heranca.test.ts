// Prova, contra o Supabase local (CI), a herança das parcelas sem previsto
// (História 3.7, FR-8, AD-8): a parcela n/N que chega sem previsto entra na
// Série da n−1/N do Mês anterior e a RPC `importar_fatura` grava a
// classificação herdada (inclusive Apelido e Observação). Teste de aceite:
// duas compras idênticas herdam, na ordem, as duas Séries (`ocorrencia` 1 e
// 2) sem estourar a restrição única; os previstos seguintes copiam a herança
// e não duplicam.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import type { CandidataParaHerdar } from "../../src/domain/heranca";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import { aplicarCasamento, atribuirSeries, casarPrevistos, gerarPrevistos } from "../../src/domain/previstos";
import { ligado, planoApagarTudo, supabaseLocal, type Cliente, type Usuario } from "./apoio";

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

/** Monta a importação como a tela: Séries, casamento (sem previstos lidos), herança e previstos novos. */
function importacao(mes: string, parcelas: Parcela[], candidatas: CandidataParaHerdar[], mesesComFatura: string[] = []): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const casamento = casarPrevistos(comSeries, []);
  const lancamentos = aplicarCasamento(comSeries, casamento, [], candidatas);
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
    previstos_sem_par: [],
  };
}

function chamar(cliente: Cliente, imp: Importacao, lidoEm: string | null = null) {
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    dados_previstos: imp.previstos as unknown as Json,
    previstos_sem_par: [] as unknown as Json,
    ...(lidoEm ? { lancamentos_atualizados_em: lidoEm } : {}),
  });
}

describe.skipIf(!ligado)("Herança das parcelas sem previsto no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let responsavelId: string;
  let tipoId: string;

  beforeAll(async () => {
    local = supabaseLocal("heranca");
    a = await local.criarUsuario("a");
    const { data: resp } = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Casal", cor: 1, ordem: 1 }).select().single();
    const { data: tipo } = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Casa" }).select().single();
    responsavelId = resp!.id;
    tipoId = tipo!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  /** As parcelas do Mês anterior, como `lerParcelasDoMesAnterior` (mães, não excluídas, com a chave da Série). */
  async function lerCandidatas(mes: string, mesAnterior: string): Promise<CandidataParaHerdar[]> {
    const { data } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mesAnterior);
    const { data: series } = await local.admin.from("series").select("*").eq("owner_id", a.id);
    const { data: todas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).is("excluido_em", null).not("serie_id", "is", null);
    const dasSeries = new Map((series ?? []).map((s) => [s.id, s]));
    const ocupadas = new Set(
      (todas ?? []).filter((x) => x.dividido_de_id === null && !(x.mes === mes && x.fatura_id !== null)).map((x) => `${x.serie_id}:${x.parcela_n}`),
    );
    return (data ?? [])
      .filter((l) => l.excluido_em === null && l.dividido_de_id === null && l.ajuste_de_id === null && l.parcela_n !== null && l.valor_centavos > 0)
      .map((l) => {
        const s = l.serie_id ? dasSeries.get(l.serie_id) : undefined;
        return {
          id: l.id,
          nome_normalizado: l.nome_normalizado,
          parcela_n: l.parcela_n!,
          parcela_total: l.parcela_total!,
          valor_centavos: l.valor_centavos,
          ordem_fatura: l.ordem_fatura,
          responsavel_id: l.responsavel_id,
          tipo_id: l.tipo_id,
          apelido: l.apelido,
          observacao: l.observacao,
          serie: s
            ? {
                nome_normalizado: s.nome_normalizado,
                parcela_total: s.parcela_total!,
                valor_parcela_centavos: s.valor_parcela_centavos,
                mes_primeira_parcela: s.mes_primeira_parcela,
                ocorrencia: s.ocorrencia,
              }
            : null,
          proxima_ocupada: l.serie_id !== null && ocupadas.has(`${l.serie_id}:${l.parcela_n! + 1}`),
        };
      });
  }

  const dupla: Parcela = { nome: "RENNER", n: 4, total: 10, valor: 10000 };

  it("aceite: nov/26 sem previstos herda de out/26, inclusive as duas compras idênticas, sem estourar a restrição única", async () => {
    // out/26 entra sem previstos (como antes da 3.6): MAGALU, SEM SÉRIE e duas compras idênticas.
    const out = importacao("2026-10", [{ nome: "MAGALU", n: 4, total: 10, valor: 44589 }, dupla, dupla, { nome: "OUTRA", n: 4, total: 10, valor: 3000 }], []);
    out.previstos = [];
    const g0 = await chamar(a.cliente, out);
    expect(g0.error).toBeNull();
    const linhas = (g0.data as unknown as { lancamentos: { id: string; ordem_fatura: number }[] }).lancamentos;
    const id = (ordem: number) => linhas.find((l) => l.ordem_fatura === ordem)!.id;
    await local.admin.from("lancamentos").update({ responsavel_id: responsavelId, tipo_id: tipoId, apelido: "Sofá", observacao: "10x" }).eq("id", id(1));
    await local.admin.from("lancamentos").update({ responsavel_id: responsavelId, tipo_id: tipoId, apelido: "Renner A" }).eq("id", id(2));
    await local.admin.from("lancamentos").update({ responsavel_id: responsavelId, tipo_id: tipoId, apelido: "Renner B" }).eq("id", id(3));

    const candidatas = await lerCandidatas("2026-11", "2026-10");
    const nov = await chamar(
      a.cliente,
      importacao(
        "2026-11",
        [
          { nome: "MAGALU", n: 5, total: 10, valor: 44589 },
          { ...dupla, n: 5 },
          { ...dupla, n: 5 },
          { nome: "OUTRA", n: 5, total: 10, valor: 3001 },
        ],
        candidatas,
        ["2026-10"],
      ),
    );
    expect(nov.error).toBeNull();

    const { data: novas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", "2026-11").not("fatura_id", "is", null).order("ordem_fatura");
    expect(novas).toHaveLength(4);
    const [magalu, rennerA, rennerB, outra] = novas!;
    expect(magalu).toMatchObject({ apelido: "Sofá", observacao: "10x", responsavel_id: responsavelId, tipo_id: tipoId, revisao_motivo: null });
    expect(rennerA).toMatchObject({ apelido: "Renner A", revisao_motivo: null });
    expect(rennerB).toMatchObject({ apelido: "Renner B", revisao_motivo: null });
    // Valor diferente: não herda, segue para a fila.
    expect(outra).toMatchObject({ apelido: null, responsavel_id: null, revisao_motivo: "sem_classificacao" });

    // Cada herdeira ficou na Série da candidata (ocorrencia 1 e 2 para as idênticas).
    const { data: mae } = await local.admin.from("lancamentos").select("serie_id").eq("id", id(1)).single();
    expect(magalu.serie_id).toBe(mae!.serie_id);
    const { data: sA } = await local.admin.from("lancamentos").select("serie_id").eq("id", id(2)).single();
    const { data: sB } = await local.admin.from("lancamentos").select("serie_id").eq("id", id(3)).single();
    expect(rennerA.serie_id).toBe(sA!.serie_id);
    expect(rennerB.serie_id).toBe(sB!.serie_id);
    expect(rennerA.serie_id).not.toBe(rennerB.serie_id);

    // Os previstos seguintes copiam a herança e nenhuma Série tem a mesma parcela duas vezes.
    const { data: p6 } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("lancado_por", "sistema").eq("parcela_n", 6).eq("nome_normalizado", "MAGALU");
    expect(p6).toHaveLength(1);
    expect(p6![0]).toMatchObject({ apelido: "Sofá", observacao: "10x", responsavel_id: responsavelId, tipo_id: tipoId });
    const { data: todas } = await local.admin.from("lancamentos").select("serie_id, parcela_n").eq("owner_id", a.id).is("excluido_em", null).not("serie_id", "is", null);
    const chaves = (todas ?? []).map((l) => `${l.serie_id}:${l.parcela_n}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("reimportar nov/26 (herdeiras não têm casado_em) refaz a herança sem recusa", async () => {
    const { data: f } = await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", "2026-11").single();
    const candidatas = await lerCandidatas("2026-11", "2026-10");
    const { data: lidas } = await local.admin.from("lancamentos").select("updated_at").eq("owner_id", a.id).eq("mes", "2026-11");
    const lidoEm = (lidas ?? []).map((l) => l.updated_at).sort().at(-1)!;
    const imp = importacao("2026-11", [{ nome: "MAGALU", n: 5, total: 10, valor: 44589 }], candidatas, ["2026-10"]);
    const r = await a.cliente.rpc("importar_fatura", {
      dados_fatura: imp.fatura as unknown as Json,
      dados_cartoes: imp.cartoes as unknown as Json,
      dados_lancamentos: imp.lancamentos as unknown as Json,
      dados_previstos: imp.previstos as unknown as Json,
      previstos_sem_par: [] as unknown as Json,
      lancamentos_atualizados_em: lidoEm,
      substituir_fatura_id: f!.id,
      dados_reimportacao: (await planoApagarTudo(a.cliente, f!.id)) as unknown as Json,
    });
    expect(r.error).toBeNull();
    const { data: novas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", "2026-11").not("fatura_id", "is", null);
    expect(novas).toHaveLength(1);
    expect(novas![0]).toMatchObject({ apelido: "Sofá", casado_em: null });
  });
});
