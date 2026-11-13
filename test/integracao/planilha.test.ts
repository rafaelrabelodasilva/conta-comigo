// Prova, contra o Supabase local (CI), o histórico da planilha (História 3.10):
// `importar_aba_planilha` grava uma aba numa transação (linhas `historico`
// sem Fatura, Série, Divisão com filhas e previstos), recusa Mês com Fatura,
// troca o histórico ao reimportar o Mês, não duplica a parcela da Série,
// respeita o RLS, e `apagar_historico_do_mes` é o caminho de volta. As contas
// (quem muda, Divisão, previstos) são do núcleo e vêm no corpo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Histórico da planilha no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae = "";
  let rafael = "";
  let tipoMae = "";
  let tipoSaude = "";

  beforeAll(async () => {
    local = supabaseLocal("planilha");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const r1 = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Mãe", cor: 3, ordem: 1 }).select().single();
    const r2 = await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Rafael", cor: 1, ordem: 2 }).select().single();
    const t1 = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Mãe" }).select().single();
    const t2 = await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Saúde" }).select().single();
    mae = r1.data!.id;
    rafael = r2.data!.id;
    tipoMae = t1.data!.id;
    tipoSaude = t2.data!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  const serie = (nome: string, total: number, valor: number, primeira: string) => ({
    nome_normalizado: nome,
    parcela_total: total,
    valor_parcela_centavos: valor,
    mes_primeira_parcela: primeira,
    ocorrencia: 1,
  });

  const oticas = (n: number) => ({
    nome: "OTICAS EXATA",
    nome_normalizado: "OTICAS EXATA",
    valor_centavos: 27000,
    parcela_n: n,
    parcela_total: 10,
    observacao: "Óculos",
    tipo_id: tipoMae,
    responsavel_id: mae,
    status_id: null,
    serie: serie("OTICAS EXATA", 10, 27000, "2026-01"),
    divisao: null,
    partes: null,
  });

  // Função: os ids (`tipoMae`) só existem depois do `beforeAll`.
  const monjaro = () => ({
    nome: "JIM COM 57653822 BAR",
    nome_normalizado: "JIM COM 57653822 BAR",
    valor_centavos: 46600,
    parcela_n: 3,
    parcela_total: 3,
    observacao: "Monjaro",
    tipo_id: tipoMae,
    responsavel_id: null,
    status_id: null,
    serie: serie("JIM COM 57653822 BAR", 3, 46600, "2026-01"),
    divisao: {
      modo: "valor",
      partes: [
        { responsavel_id: "MAE", numerador: 31067, denominador: 46600 },
        { responsavel_id: "RAFAEL", numerador: 15533, denominador: 46600 },
      ],
    },
    partes: [
      { filha_id: null, responsavel_id: "MAE", valor_centavos: 31067, status_id: null },
      { filha_id: null, responsavel_id: "RAFAEL", valor_centavos: 15533, status_id: null },
    ],
  });

  function comIds<T>(valor: T): T {
    return JSON.parse(JSON.stringify(valor).replaceAll("MAE", mae).replaceAll("RAFAEL", rafael));
  }

  const previsto = (n: number, mes: string) => ({
    ordem_origem: 1,
    nome: "OTICAS EXATA",
    nome_normalizado: "OTICAS EXATA",
    apelido: null,
    valor_centavos: 27000,
    parcela_n: n,
    parcela_total: 10,
    mes,
    responsavel_id: mae,
    tipo_id: tipoMae,
    observacao: "Óculos",
  });

  const importar = (u: Usuario, mes: string, linhas: unknown, previstos: unknown = []) =>
    u.cliente.rpc("importar_aba_planilha", { p_mes: mes, p_linhas: linhas as Json, p_previstos: previstos as Json });

  it("grava a aba: linhas `historico` sem Fatura, a Divisão com as filhas e os previstos da Série", async () => {
    const { data, error } = await importar(a, "2026-08", comIds([oticas(8), monjaro()]), [previsto(9, "2026-09"), previsto(10, "2026-10")]);
    expect(error).toBeNull();
    const r = data as unknown as { lancamentos: { id: string }[]; previstos: { mes: string }[]; removidos: { lancamentos: string[] } };
    expect(r.lancamentos).toHaveLength(4); // 2 mães + 2 filhas
    expect(r.previstos.map((p) => p.mes).sort()).toEqual(["2026-09", "2026-10"]);

    const { data: linhas } = await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", "2026-08").is("dividido_de_id", null);
    expect(linhas).toHaveLength(2);
    for (const l of linhas!) {
      expect(l.lancado_por).toBe("historico");
      expect(l.fatura_id).toBeNull();
      expect(l.ordem_fatura).toBeNull();
      expect(l.final_cartao).toBeNull();
    }
    const m = linhas!.find((l) => l.nome.startsWith("JIM"))!;
    expect(m.responsavel_id).toBeNull();
    const { data: filhas } = await local.admin.from("lancamentos").select("valor_centavos, responsavel_id").eq("dividido_de_id", m.id).order("valor_centavos", { ascending: false });
    expect(filhas!.map((f) => f.valor_centavos)).toEqual([31067, 15533]);
    expect(filhas!.reduce((s, f) => s + f.valor_centavos, 0)).toBe(46600);
    const { data: prev } = await local.admin.from("lancamentos").select("lancado_por, serie_id, origem_lancamento_id").eq("owner_id", a.id).eq("lancado_por", "sistema");
    expect(prev).toHaveLength(2);
    expect(prev!.every((p) => p.serie_id !== null && p.origem_lancamento_id !== null)).toBe(true);
  });

  it("reimportar o mesmo Mês troca o histórico e os previstos intocados, sem duplicar", async () => {
    const antes = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-08").is("dividido_de_id", null);
    const { error } = await importar(a, "2026-08", comIds([oticas(8), monjaro()]), [previsto(9, "2026-09"), previsto(10, "2026-10")]);
    expect(error).toBeNull();
    const depois = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-08").is("dividido_de_id", null);
    expect(depois.data).toHaveLength(2);
    expect(depois.data!.some((l) => antes.data!.some((x) => x.id === l.id))).toBe(false);
    const prev = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("lancado_por", "sistema");
    expect(prev.data).toHaveLength(2);
  });

  it("recusa o Mês que já tem Fatura e não grava nada", async () => {
    await local.admin.from("faturas").insert({ owner_id: a.id, mes: "2026-07", vencimento: "2026-07-06", total_despesas_centavos: 0, total_creditos_centavos: 0 });
    const { error } = await importar(a, "2026-07", comIds([oticas(7)]));
    expect(error?.message).toContain("planilha.mes_com_fatura");
    const { data } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-07");
    expect(data).toHaveLength(0);
  });

  it("a parcela repetida na Série recusa a aba inteira: planilha.serie_ocupada", async () => {
    const { error } = await importar(a, "2026-05", comIds([oticas(8)]));
    expect(error?.message).toContain("planilha.serie_ocupada");
    const { data } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-05");
    expect(data).toHaveLength(0);
  });

  it("linha inválida desfaz a aba (tudo ou nada)", async () => {
    const { error } = await importar(a, "2026-04", [{ ...oticas(4), serie: null }, { nome: "SEM VALOR" }]);
    expect(error).not.toBeNull();
    const { data } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-04");
    expect(data).toHaveLength(0);
  });

  it("RLS: outro usuário não vê o histórico, não o apaga e não o substitui", async () => {
    const visto = await b.cliente.from("lancamentos").select("id").eq("mes", "2026-08");
    expect(visto.data).toHaveLength(0);
    const apagou = await b.cliente.rpc("apagar_historico_do_mes", { p_mes: "2026-08" });
    expect(apagou.error).toBeNull();
    expect(((apagou.data as unknown as { lancamentos: string[] }).lancamentos)).toHaveLength(0);
    const { data } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", "2026-08").is("dividido_de_id", null);
    expect(data).toHaveLength(2);
  });

  it("apagar_historico_do_mes: apaga as linhas `historico`, os previstos intocados e a Série sem linha; o previsto editado fica", async () => {
    const editado = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("lancado_por", "sistema").eq("parcela_n", 10).single();
    await local.admin.from("lancamentos").update({ editado_em: new Date().toISOString() }).eq("id", editado.data!.id);
    const { data, error } = await a.cliente.rpc("apagar_historico_do_mes", { p_mes: "2026-08" });
    expect(error).toBeNull();
    const r = data as unknown as { lancamentos: string[]; previstos: string[]; series: number };
    expect(r.lancamentos.length).toBeGreaterThanOrEqual(2);
    expect(r.previstos).toHaveLength(1);
    const { data: hist } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("lancado_por", "historico");
    expect(hist).toHaveLength(0);
    const { data: restou } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("lancado_por", "sistema");
    expect(restou!.map((x) => x.id)).toEqual([editado.data!.id]);
    // A Série da Monjaro ficou sem linha e saiu; a das óticas ainda tem o previsto editado.
    const { data: series } = await local.admin.from("series").select("nome_normalizado").eq("owner_id", a.id);
    expect(series!.map((s) => s.nome_normalizado)).toEqual(["OTICAS EXATA"]);
  });

  it("as Regras iniciais não sobrescrevem a que já existe (upsert que ignora a chave repetida)", async () => {
    const regra = (tipo: string) => ({ owner_id: a.id, chave: "OTICAS EXATA", versao_normalizacao: 1, responsavel_id: mae, tipo_id: tipo, contagem: [{ responsavel_id: mae, n: 2 }] as unknown as NonNullable<Json> });
    expect((await a.cliente.from("regras").upsert(regra(tipoMae), { onConflict: "owner_id,chave", ignoreDuplicates: true }).select()).data).toHaveLength(1);
    const segunda = await a.cliente.from("regras").upsert(regra(tipoSaude), { onConflict: "owner_id,chave", ignoreDuplicates: true }).select();
    expect(segunda.error).toBeNull();
    expect(segunda.data).toHaveLength(0);
    const { data } = await local.admin.from("regras").select("tipo_id").eq("owner_id", a.id).eq("chave", "OTICAS EXATA").single();
    expect(data!.tipo_id).toBe(tipoMae);
  });
});
