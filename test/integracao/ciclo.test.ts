// Prova, contra o Supabase local (CI), a migração da História 1.7:
// `config_ciclo` só de inserção (RLS só select/insert, sem update nem
// delete, `vigente_desde` no passado recusado), as colunas novas de
// `configuracoes` (padrões e checks) e os eventos do Realtime da Aparência e
// do Ciclo chegando a outro aparelho do mesmo dono.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TablesInsert } from "../../src/data/database.types";
import { hojeEmSaoPaulo, mesDaData, somarMeses } from "../../src/domain/ciclo";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Ciclo do cartão e Aparência no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  const mesAtual = mesDaData(hojeEmSaoPaulo(new Date()));

  beforeAll(async () => {
    local = supabaseLocal("ciclo");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function inserirCiclo(u: Usuario, dia_fechamento: number, dia_vencimento: number, vigente_desde: string) {
    const { data, error } = await u.cliente
      .from("config_ciclo")
      .insert({ dia_fechamento, dia_vencimento, vigente_desde })
      .select()
      .single();
    expect(error).toBeNull();
    return data!;
  }

  it("config_ciclo: owner_id e updated_at vêm do banco; aceita o mês corrente e os seguintes", async () => {
    const { data, error } = await a.cliente
      .from("config_ciclo")
      .insert({ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: mesAtual, updated_at: "2000-01-01T00:00:00Z" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.owner_id).toBe(a.id);
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000);
    await inserirCiclo(a, 5, 15, somarMeses(mesAtual, 1));
  });

  it("config_ciclo: recusa vigente_desde no passado", async () => {
    for (const vigente_desde of [somarMeses(mesAtual, -1), "2020-01"]) {
      const { error } = await a.cliente
        .from("config_ciclo")
        .insert({ dia_fechamento: 28, dia_vencimento: 6, vigente_desde });
      expect(error?.message).toBe("ciclo.vigente_no_passado");
    }
  });

  it("config_ciclo: recusa dias fora de 1 a 31 e mês mal formado", async () => {
    const futuro = somarMeses(mesAtual, 2);
    for (const linha of [
      { dia_fechamento: 0, dia_vencimento: 6, vigente_desde: futuro },
      { dia_fechamento: 28, dia_vencimento: 32, vigente_desde: futuro },
      { dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2099-13" },
      { dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2099-1" },
      { dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2099-01-01" },
    ]) {
      const { error } = await a.cliente.from("config_ciclo").insert(linha);
      expect(error?.code, JSON.stringify(linha)).toBe("23514");
    }
  });

  it("config_ciclo: o banco recusa update e delete, também do próprio dono", async () => {
    const linha = await inserirCiclo(a, 10, 20, somarMeses(mesAtual, 1));

    const { data: alterados, error: erroUpdate } = await a.cliente
      .from("config_ciclo")
      .update({ dia_fechamento: 1 })
      .eq("id", linha.id)
      .select();
    expect(erroUpdate).toBeNull();
    expect(alterados).toEqual([]);

    const { data: apagados, error: erroDelete } = await a.cliente
      .from("config_ciclo")
      .delete()
      .eq("id", linha.id)
      .select();
    expect(erroDelete).toBeNull();
    expect(apagados).toEqual([]);

    const { data: depois } = await local.admin.from("config_ciclo").select("*").eq("id", linha.id).single();
    expect(depois).toEqual(linha);
  });

  it("config_ciclo: outro usuário não lê nem insere em nome do dono", async () => {
    await inserirCiclo(a, 28, 6, somarMeses(mesAtual, 1));
    const { data: lidos } = await b.cliente.from("config_ciclo").select("*");
    expect(lidos).toEqual([]);
    const { error } = await b.cliente
      .from("config_ciclo")
      .insert({ dia_fechamento: 1, dia_vencimento: 2, vigente_desde: mesAtual, owner_id: a.id });
    expect(error?.code).toBe("42501");
    const { error: anonimo } = await local.anonimo
      .from("config_ciclo")
      .insert({ dia_fechamento: 1, dia_vencimento: 2, vigente_desde: mesAtual });
    expect(anonimo).not.toBeNull();
  });

  it("configuracoes: as colunas novas nascem com os padrões", async () => {
    const u = await local.criarUsuario("padroes");
    const { data, error } = await u.cliente
      .from("configuracoes")
      .upsert({ aparencia: "escuro" }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      aparencia: "escuro",
      limite_ajuste_centavos: 100,
      tolerancia_atraso_dias: 10,
      status_padrao_id: null,
    });

    const { data: semAparencia } = await b.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: null }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(semAparencia!.aparencia).toBe("sistema");
  });

  it("configuracoes: checks de Aparência, limite do Ajuste e tolerância", async () => {
    const u = await local.criarUsuario("checks");
    const { error: criar } = await u.cliente
      .from("configuracoes")
      .upsert({ limite_ajuste_centavos: 1, tolerancia_atraso_dias: 0 }, { onConflict: "owner_id" });
    expect(criar).toBeNull();
    const { error: maximos } = await u.cliente
      .from("configuracoes")
      .upsert({ limite_ajuste_centavos: 1000, tolerancia_atraso_dias: 60 }, { onConflict: "owner_id" });
    expect(maximos).toBeNull();

    const recusados: TablesInsert<"configuracoes">[] = [
      { aparencia: "roxo" },
      { aparencia: "Escuro" },
      { limite_ajuste_centavos: 0 },
      { limite_ajuste_centavos: 1001 },
      { tolerancia_atraso_dias: -1 },
      { tolerancia_atraso_dias: 61 },
    ];
    for (const corpo of recusados) {
      const { error } = await u.cliente.from("configuracoes").upsert(corpo, { onConflict: "owner_id" });
      expect(error?.code, JSON.stringify(corpo)).toBe("23514");
    }
  });

  it("o evento do Realtime da Aparência e do Ciclo chega a outro aparelho do mesmo dono", async () => {
    const outroAparelho = await local.entrar(a.email, a.senha);

    const cfg = await esperarEvento<{ owner_id: string; aparencia: string }>(
      outroAparelho,
      "configuracoes",
      "UPDATE",
      (n) => n.owner_id === a.id && n.aparencia === "escuro",
      (t) =>
        // Alterna para gerar um UPDATE a cada tentativa (a primeira cria a linha).
        a.cliente
          .from("configuracoes")
          .upsert({ aparencia: t % 2 === 1 ? "escuro" : "claro" }, { onConflict: "owner_id" }),
    );
    expect(cfg.aparencia).toBe("escuro");

    const ciclo = await esperarEvento<{ owner_id: string; dia_fechamento: number; vigente_desde: string }>(
      outroAparelho,
      "config_ciclo",
      "INSERT",
      (n) => n.owner_id === a.id && n.dia_fechamento === 17,
      () =>
        a.cliente
          .from("config_ciclo")
          .insert({ dia_fechamento: 17, dia_vencimento: 27, vigente_desde: somarMeses(mesAtual, 1) }),
    );
    expect(ciclo.vigente_desde).toBe(somarMeses(mesAtual, 1));
  }, 60_000);
});
