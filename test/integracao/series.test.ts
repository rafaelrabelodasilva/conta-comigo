// Prova, contra o Supabase local (CI), as Séries e os previstos (História 3.5):
// a RPC `importar_fatura` acha ou cria a Série de cada parcela, cria os
// previstos n+1/N a N/N nos Meses seguintes (mes = somarMeses), não duplica ao
// reinserir, recusa a parcela que já tem previsto quando o núcleo não calculou o casamento (rede de segurança; o casamento é da 3.6), não
// cria previsto em Mês que já tem Fatura e, na reimportação simplificada,
// apaga só os previstos que ninguém tocou. O teste de aceite: duas compras
// idênticas na mesma Fatura são duas Séries (ocorrencia 1 e 2), sem erro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { somarMeses } from "../../src/domain/ciclo";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import { gerarPrevistos, atribuirSeries } from "../../src/domain/previstos";
import { ligado, planoApagarTudo, supabaseLocal, type Cliente, type Usuario } from "./apoio";

type Parcela = { nome: string; n: number | null; total: number | null; valor: number };

/** Uma Fatura de `mes` com as parcelas dadas; `mesesComFatura` vai ao núcleo (decisão 1-A). */
function fatura(mes: string, parcelas: Parcela[], mesesComFatura: string[] = []): Importacao {
  const lancamentos: LancamentoParaGravar[] = parcelas.map((p, i) => ({
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
  const comSeries = atribuirSeries(lancamentos, mes);
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
    lancamentos: comSeries,
    previstos: gerarPrevistos(comSeries, mes, mesesComFatura),
  };
}

async function importar(cliente: Cliente, imp: Importacao, extra: { lidoEm?: string | null; substituir?: string } = {}) {
  // Reimportação (3.12): estes testes usam o plano "apagar tudo" (nenhuma linha nova pareia com as antigas).
  const plano = extra.substituir ? await planoApagarTudo(cliente, extra.substituir) : null;
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    dados_previstos: imp.previstos as unknown as Json,
    ...(extra.lidoEm ? { lancamentos_atualizados_em: extra.lidoEm } : {}),
    ...(extra.substituir ? { substituir_fatura_id: extra.substituir } : {}),
    ...(plano ? { dados_reimportacao: plano as unknown as Json } : {}),
  });
}

type Gravados = {
  fatura: { id: string };
  lancamentos: { id: string; serie_id: string | null; parcela_n: number | null }[];
  previstos: { id: string; mes: string; parcela_n: number; origem_lancamento_id: string | null }[];
  removidos: { lancamentos: string[]; previstos: string[] } | null;
};

describe.skipIf(!ligado)("Séries e previstos no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("series");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  /** Os lançamentos do dono `a` de uma Série (por Nome), não excluídos ou não. */
  async function daSerie(nome: string, dono = a.id) {
    const { data, error } = await local.admin
      .from("lancamentos")
      .select("*")
      .eq("owner_id", dono)
      .eq("nome_normalizado", nome)
      .order("parcela_n");
    expect(error).toBeNull();
    return data ?? [];
  }

  it("05/10 de out/26: Série criada e previstos 06/10 a 10/10 em nov/26 a mar/27, iguais à linha, sem fila", async () => {
    const { data, error } = await importar(a.cliente, fatura("2026-10", [{ nome: "MAGALU", n: 5, total: 10, valor: 44589 }]));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    expect(g.lancamentos[0].serie_id).not.toBeNull();
    expect(g.previstos.map((p) => [p.parcela_n, p.mes])).toEqual([
      [6, "2026-11"],
      [7, "2026-12"],
      [8, "2027-01"],
      [9, "2027-02"],
      [10, "2027-03"],
    ]);
    const linhas = await daSerie("MAGALU");
    expect(linhas).toHaveLength(6);
    const real = linhas.find((l) => l.parcela_n === 5)!;
    const previstos = linhas.filter((l) => l.parcela_n! > 5);
    for (const p of previstos) {
      expect(p).toMatchObject({
        lancado_por: "sistema",
        nome: "MAGALU",
        valor_centavos: 44589,
        parcela_total: 10,
        serie_id: real.serie_id,
        origem_lancamento_id: real.id,
        fatura_id: null,
        ordem_fatura: null,
        data: null,
        revisao_motivo: null,
        excluido_em: null,
        mes: somarMeses("2026-10", p.parcela_n! - 5),
      });
    }
    const { data: series } = await local.admin.from("series").select("*").eq("owner_id", a.id).eq("nome_normalizado", "MAGALU");
    expect(series).toEqual([
      expect.objectContaining({ parcela_total: 10, valor_parcela_centavos: 44589, mes_primeira_parcela: "2026-06", ocorrencia: 1 }),
    ]);
  });

  it("aceite: duas compras idênticas na mesma Fatura são duas Séries (ocorrencia 1 e 2), cada uma com os seus previstos, sem erro", async () => {
    const dupla: Parcela = { nome: "RENNER", n: 3, total: 5, valor: 10000 };
    const { data, error } = await importar(a.cliente, fatura("2025-03", [dupla, { nome: "PADARIA", n: null, total: null, valor: 500 }, dupla]));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    const reais = g.lancamentos.filter((l) => l.parcela_n === 3);
    expect(reais).toHaveLength(2);
    expect(reais[0].serie_id).not.toBe(reais[1].serie_id);
    const { data: series } = await local.admin
      .from("series")
      .select("ocorrencia")
      .eq("owner_id", a.id)
      .eq("nome_normalizado", "RENNER")
      .order("ocorrencia");
    expect(series!.map((s) => s.ocorrencia)).toEqual([1, 2]);
    // Cada Série tem o 4/5 e o 5/5 previstos (4 previstos no total).
    expect(g.previstos).toHaveLength(4);
    const linhas = await daSerie("RENNER");
    expect(linhas).toHaveLength(6);
  });

  it("última parcela: a Série existe e a linha é ligada, mas não há previsto", async () => {
    const { data, error } = await importar(a.cliente, fatura("2025-08", [{ nome: "OTICA", n: 10, total: 10, valor: 27000 }]));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    expect(g.lancamentos[0].serie_id).not.toBeNull();
    expect(g.previstos).toEqual([]);
    expect(await daSerie("OTICA")).toHaveLength(1);
  });

  it("à vista e crédito não têm Série nem previstos", async () => {
    const { data, error } = await importar(
      a.cliente,
      fatura("2025-07", [
        { nome: "PADARIA 7", n: null, total: null, valor: 500 },
        { nome: "ESTORNO", n: 2, total: 4, valor: -300 },
      ]),
    );
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    expect(g.lancamentos.every((l) => l.serie_id === null)).toBe(true);
    expect(g.previstos).toEqual([]);
  });

  it("índice único: duas linhas-mãe não excluídas na mesma parcela da Série são recusadas; excluída libera", async () => {
    const linhas = await daSerie("MAGALU");
    const previsto = linhas.find((l) => l.parcela_n === 7)!;
    const copia = { ...previsto, id: undefined, created_at: undefined, updated_at: undefined };
    const repetida = await local.admin.from("lancamentos").insert(copia as never);
    expect(repetida.error?.message).toContain("lancamentos_serie_id_parcela_n_key");
    // Excluído (exclusão lógica): a parcela fica livre para uma linha nova.
    await local.admin.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", previsto.id);
    const livre = await local.admin.from("lancamentos").insert(copia as never);
    expect(livre.error).toBeNull();
  });

  it("linha real em parcela que já tem previsto, sem o casamento calculado: fatura.previstos_sem_casamento e nada é gravado (rede de segurança; o casamento da 3.6 está em casamento.test.ts)", async () => {
    // O 07/10 de MAGALU existe em dez/26 (previsto). Sem o plano do núcleo, a RPC não decide sozinha.
    const antes = await local.admin.from("faturas").select("id", { count: "exact", head: true }).eq("owner_id", a.id);
    const { data: ult } = await local.admin
      .from("lancamentos")
      .select("updated_at")
      .eq("owner_id", a.id)
      .eq("mes", "2026-12")
      .order("updated_at", { ascending: false })
      .limit(1);
    const { error } = await importar(a.cliente, fatura("2026-12", [{ nome: "MAGALU", n: 7, total: 10, valor: 44589 }]), {
      lidoEm: ult![0].updated_at,
    });
    expect(error?.message).toBe("fatura.previstos_sem_casamento");
    const depois = await local.admin.from("faturas").select("id", { count: "exact", head: true }).eq("owner_id", a.id);
    expect(depois.count).toBe(antes.count);
    const { count } = await local.admin
      .from("lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", a.id)
      .eq("mes", "2026-12")
      .eq("lancado_por", "fatura");
    expect(count).toBe(0);
  });

  it("Mês que já tem Fatura não recebe previsto (a RPC também protege), mesmo que o núcleo mande", async () => {
    const { error: e1 } = await importar(b.cliente, fatura("2026-06", [{ nome: "OUTRA", n: null, total: null, valor: 100 }]));
    expect(e1).toBeNull();
    // Sem `mesesComFatura`, o núcleo mandaria o previsto de jun/26; a RPC não cria.
    const { data, error } = await importar(b.cliente, fatura("2026-02", [{ nome: "NOVA", n: 5, total: 10, valor: 20000 }]));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    // 06/10 a 10/10 cairiam em mar a jul/26; jun/26 já tem Fatura e fica de fora.
    expect(g.previstos.map((p) => p.mes)).toEqual(["2026-03", "2026-04", "2026-05", "2026-07"]);
    const meses = (await daSerie("NOVA", b.id)).map((l) => l.mes);
    expect(meses).not.toContain("2026-06");
    expect(meses).toContain("2026-03");
  });

  it("reimportação (plano 'apagar tudo' da 3.12): a Série é reaproveitada, os previstos intocados são recriados, o editado fica e o excluído não ressuscita", async () => {
    const mes = "2026-05";
    const primeira = await importar(a.cliente, fatura(mes, [{ nome: "LOJA S", n: 2, total: 6, valor: 9900 }]));
    expect(primeira.error).toBeNull();
    const g1 = primeira.data as unknown as Gravados;
    expect(g1.previstos.map((p) => p.parcela_n)).toEqual([3, 4, 5, 6]);
    const [p3, p4, p5, p6] = g1.previstos;
    // O 4/6 foi editado à mão; o 5/6 foi excluído.
    await local.admin.from("lancamentos").update({ editado_em: new Date().toISOString(), observacao: "meu" }).eq("id", p4.id);
    await local.admin.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", p5.id);

    const { data: ult } = await local.admin
      .from("lancamentos")
      .select("updated_at")
      .eq("owner_id", a.id)
      .eq("mes", mes)
      .order("updated_at", { ascending: false })
      .limit(1);
    const segunda = await importar(a.cliente, fatura(mes, [{ nome: "LOJA S", n: 2, total: 6, valor: 9900 }]), {
      lidoEm: ult![0].updated_at,
      substituir: g1.fatura.id,
    });
    expect(segunda.error).toBeNull();
    const g2 = segunda.data as unknown as Gravados;
    // Saíram a linha real antiga e os previstos intocados (3/6 e 6/6); ficaram o editado e o excluído.
    expect(g2.removidos!.previstos.sort()).toEqual([p3.id, p6.id].sort());
    expect(g2.removidos!.lancamentos).toHaveLength(1);

    const linhas = await daSerie("LOJA S");
    // Uma linha por parcela: nada duplicou e o excluído não voltou.
    expect(linhas.map((l) => [l.parcela_n, l.excluido_em !== null])).toEqual([
      [2, false],
      [3, false],
      [4, false],
      [5, true],
      [6, false],
    ]);
    const nova = linhas.find((l) => l.parcela_n === 2)!;
    // O previsto editado foi religado à linha nova; os recriados também apontam para ela.
    expect(linhas.filter((l) => l.parcela_n! > 2 && l.excluido_em === null).every((l) => l.origem_lancamento_id === nova.id)).toBe(true);
    expect(linhas.find((l) => l.parcela_n === 4)).toMatchObject({ id: p4.id, observacao: "meu" });
    // Nenhuma Série nova: a mesma chave.
    const { data: series } = await local.admin.from("series").select("id").eq("owner_id", a.id).eq("nome_normalizado", "LOJA S");
    expect(series).toHaveLength(1);
  });

  it("RLS: outro dono não vê as Séries nem os previstos", async () => {
    const { data: deB } = await b.cliente.from("series").select("nome_normalizado");
    expect(deB!.every((s) => s.nome_normalizado === "NOVA" || s.nome_normalizado === "OUTRA")).toBe(true);
    const { data: lancB } = await b.cliente.from("lancamentos").select("nome_normalizado").eq("nome_normalizado", "MAGALU");
    expect(lancB).toEqual([]);
  });
});
