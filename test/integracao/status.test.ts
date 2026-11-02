// Prova, contra o Supabase local (CI), as tabelas `status` e `configuracoes`
// da História 1.6: RLS por dono, `owner_id` e `updated_at` pelo banco,
// restrições (nome, uma linha de Configurações por dono, Status padrão do
// mesmo dono), upsert em owner_id e eventos do Realtime chegando a outro
// cliente do mesmo dono.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Status e Configurações no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("status");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function criarStatus(u: Usuario, nome: string) {
    const { data, error } = await u.cliente.from("status").insert({ nome }).select().single();
    expect(error).toBeNull();
    return data!;
  }

  it("status: owner_id e updated_at vêm do banco; conta como pago começa desligado", async () => {
    const { data, error } = await a.cliente
      .from("status")
      .insert({ nome: "Pago", updated_at: "2000-01-01T00:00:00Z" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.owner_id).toBe(a.id);
    expect(data!.conta_como_pago).toBe(false);
    expect(data!.arquivado).toBe(false);
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000);

    const { data: alterada, error: erroAlterar } = await a.cliente
      .from("status")
      .update({ conta_como_pago: true })
      .eq("id", data!.id)
      .select()
      .single();
    expect(erroAlterar).toBeNull();
    expect(alterada!.conta_como_pago).toBe(true);
    expect(alterada!.nome).toBe("Pago");
  });

  it("status: recusa nome inválido e gravação em nome de outro dono", async () => {
    for (const nome of ["", " Pago", "Pago ", "x".repeat(31)]) {
      const { error } = await a.cliente.from("status").insert({ nome });
      expect(error?.code).toBe("23514");
    }
    const { error } = await a.cliente.from("status").insert({ nome: "Intruso", owner_id: b.id });
    expect(error?.code).toBe("42501");
  });

  it("status e configuracoes: outro usuário não lê, não altera e não apaga", async () => {
    const proprio = await criarStatus(a, "Só de A");
    const { error: erroCfg } = await a.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: proprio.id }, { onConflict: "owner_id" });
    expect(erroCfg).toBeNull();

    for (const tabela of ["status", "configuracoes"] as const) {
      const { data: lidos } = await b.cliente.from(tabela).select("*");
      expect(lidos).toEqual([]);
      const { data: apagados } = await b.cliente.from(tabela).delete().eq("owner_id", a.id).select();
      expect(apagados).toEqual([]);
    }
    const { data: alterados } = await b.cliente
      .from("status")
      .update({ nome: "Invadido" })
      .eq("id", proprio.id)
      .select();
    expect(alterados).toEqual([]);
    const { data: cfgAlteradas } = await b.cliente
      .from("configuracoes")
      .update({ status_padrao_id: null })
      .eq("owner_id", a.id)
      .select();
    expect(cfgAlteradas).toEqual([]);

    const { data: cfg } = await local.admin.from("configuracoes").select("*").eq("owner_id", a.id).single();
    expect(cfg!.status_padrao_id).toBe(proprio.id);
  });

  it("configuracoes: upsert em owner_id cria a linha e depois só a altera (uma por dono)", async () => {
    const u = await local.criarUsuario("cfg");
    const s1 = await criarStatus(u, "Não pago");
    const s2 = await criarStatus(u, "Pago");

    const { data: criada, error } = await u.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: s1.id }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(criada!.owner_id).toBe(u.id);

    const { data: alterada, error: erroAlterar } = await u.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: s2.id }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(erroAlterar).toBeNull();
    expect(alterada!.id).toBe(criada!.id);
    expect(alterada!.status_padrao_id).toBe(s2.id);
    expect(new Date(alterada!.updated_at).getTime()).toBeGreaterThan(
      new Date(criada!.updated_at).getTime(),
    );

    const { error: erroSegunda } = await u.cliente.from("configuracoes").insert({ status_padrao_id: null });
    expect(erroSegunda?.code).toBe("23505");
  });

  it("o banco recusa arquivar o Status padrão (outro aparelho ou update direto)", async () => {
    const u = await local.criarUsuario("arq");
    const padrao = await criarStatus(u, "Não pago");
    const outro = await criarStatus(u, "Pago");
    const { error: erroCfg } = await u.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: padrao.id }, { onConflict: "owner_id" });
    expect(erroCfg).toBeNull();

    const { error } = await u.cliente.from("status").update({ arquivado: true }).eq("id", padrao.id);
    expect(error?.message).toBe("status.padrao_nao_arquiva");
    const { data: depois } = await local.admin.from("status").select("arquivado").eq("id", padrao.id).single();
    expect(depois!.arquivado).toBe(false);

    // Os demais arquivam normalmente; e o padrão continua renomeável.
    const { error: erroOutro } = await u.cliente.from("status").update({ arquivado: true }).eq("id", outro.id);
    expect(erroOutro).toBeNull();
    const { error: erroNome } = await u.cliente.from("status").update({ nome: "Em aberto" }).eq("id", padrao.id);
    expect(erroNome).toBeNull();
  });

  it("configuracoes: o Status padrão precisa ser do mesmo dono", async () => {
    const u = await local.criarUsuario("fk");
    const deB = await criarStatus(b, "De B");
    const { error } = await u.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: deB.id }, { onConflict: "owner_id" });
    expect(error?.code).toBe("23503");
  });

  it("o evento do Realtime de status e de configuracoes chega a outro aparelho do mesmo dono", async () => {
    const outroAparelho = await local.entrar(a.email, a.senha);
    const alvo = await criarStatus(a, "Atrasado");

    const nova = await esperarEvento<{ id: string; conta_como_pago: boolean; nome: string }>(
      outroAparelho,
      "status",
      "UPDATE",
      (n) => n.id === alvo.id && n.nome.startsWith("Atrasado "),
      (t) => a.cliente.from("status").update({ nome: `Atrasado ${t}`, conta_como_pago: true }).eq("id", alvo.id),
    );
    expect(nova.conta_como_pago).toBe(true);

    const cfg = await esperarEvento<{ owner_id: string; status_padrao_id: string | null }>(
      outroAparelho,
      "configuracoes",
      "UPDATE",
      (n) => n.owner_id === a.id && n.status_padrao_id === alvo.id,
      (t) =>
        // Alterna para gerar um UPDATE a cada tentativa.
        a.cliente
          .from("configuracoes")
          .upsert({ status_padrao_id: t % 2 === 1 ? alvo.id : null }, { onConflict: "owner_id" }),
    );
    expect(cfg.status_padrao_id).toBe(alvo.id);
  }, 60_000);
});
