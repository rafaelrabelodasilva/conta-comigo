// Prova, contra o Supabase local (CI), a migração da História 1.8:
// `configuracoes.primeiro_uso_em` nasce nula, só o dono a grava e lê, e a
// leitura do Painel (`lerEstadoPrimeiroUso`) vê a marca e os cadastros
// (arquivados contam) de quem está entrando.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerEstadoPrimeiroUso } from "../../src/data/estado-primeiro-uso";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Primeiro uso em configuracoes no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;

  beforeAll(() => {
    local = supabaseLocal("primeiro-uso");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function marcar(u: Usuario, instante: string) {
    const { data, error } = await u.cliente
      .from("configuracoes")
      .upsert({ primeiro_uso_em: instante }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    return data!;
  }

  const vazio = { ok: true, estado: { concluidoEm: null, temCadastro: false } };
  const comCadastro = { ok: true, estado: { concluidoEm: null, temCadastro: true } };

  it("conta nova: sem linha nem cadastros, o Primeiro uso não terminou", async () => {
    const u = await local.criarUsuario("nova");
    expect(await lerEstadoPrimeiroUso(u.cliente)).toEqual(vazio);
  });

  it("primeiro_uso_em nasce nula e o dono a grava por upsert em owner_id", async () => {
    const u = await local.criarUsuario("marca");
    const { data: criada, error } = await u.cliente
      .from("configuracoes")
      .upsert({ aparencia: "claro" }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(criada!.primeiro_uso_em).toBeNull();

    const instante = new Date().toISOString();
    const marcada = await marcar(u, instante);
    expect(marcada.id).toBe(criada!.id);
    expect(new Date(marcada.primeiro_uso_em!).getTime()).toBe(new Date(instante).getTime());
    // Só a marca mudou.
    expect(marcada.aparencia).toBe("claro");

    const leitura = await lerEstadoPrimeiroUso(u.cliente);
    expect(leitura.ok).toBe(true);
    if (leitura.ok) expect(new Date(leitura.estado.concluidoEm!).getTime()).toBe(new Date(instante).getTime());
  });

  it("outro usuário não lê nem altera a marca do dono", async () => {
    const dono = await local.criarUsuario("dono");
    const outro = await local.criarUsuario("outro");
    await marcar(dono, new Date().toISOString());

    expect(await lerEstadoPrimeiroUso(outro.cliente)).toEqual(vazio);
    const { data: alteradas } = await outro.cliente
      .from("configuracoes")
      .update({ primeiro_uso_em: null })
      .eq("owner_id", dono.id)
      .select();
    expect(alteradas).toEqual([]);
    const { data: cfg } = await local.admin
      .from("configuracoes")
      .select("primeiro_uso_em")
      .eq("owner_id", dono.id)
      .single();
    expect(cfg!.primeiro_uso_em).not.toBeNull();
  });

  it("um Responsável, um Tipo arquivado ou um Status arquivado já contam como cadastro", async () => {
    const comResponsavel = await local.criarUsuario("responsavel");
    const { error: erroResponsavel } = await comResponsavel.cliente
      .from("responsaveis")
      .insert({ nome: "Ana", cor: 1, ordem: 1 });
    expect(erroResponsavel).toBeNull();
    expect(await lerEstadoPrimeiroUso(comResponsavel.cliente)).toEqual(comCadastro);

    const comTipo = await local.criarUsuario("tipo");
    const { error: erroTipo } = await comTipo.cliente.from("tipos").insert({ nome: "Casa", arquivado: true });
    expect(erroTipo).toBeNull();
    expect(await lerEstadoPrimeiroUso(comTipo.cliente)).toEqual(comCadastro);

    const comStatus = await local.criarUsuario("status");
    const { error: erroStatus } = await comStatus.cliente.from("status").insert({ nome: "Pago", arquivado: true });
    expect(erroStatus).toBeNull();
    expect(await lerEstadoPrimeiroUso(comStatus.cliente)).toEqual(comCadastro);
  });
});
