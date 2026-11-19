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

  it("modelo_mensagem nasce {}, o dono grava e lê o modelo, e o banco só aceita objeto pequeno (História 4.5)", async () => {
    const u = await local.criarUsuario("modelo");
    const { data: criada, error } = await u.cliente
      .from("configuracoes")
      .upsert({ aparencia: "claro" }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(criada!.modelo_mensagem).toEqual({});

    const modelo = {
      saudacao: "Oi",
      frase_total: "Esse mês deu {total}",
      chave_pix: "rafael@exemplo.com",
      rodape: "",
      campos: { nome: true, parcela: true, valor: true },
    };
    const { data: gravada, error: erroGravar } = await u.cliente
      .from("configuracoes")
      .upsert({ modelo_mensagem: modelo }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(erroGravar).toBeNull();
    expect(gravada!.id).toBe(criada!.id);
    expect(gravada!.modelo_mensagem).toEqual(modelo);
    // Só a coluna do modelo mudou.
    expect(gravada!.aparencia).toBe("claro");

    // Lista, texto solto e objeto grande demais não passam pelo check.
    for (const ruim of [[], "texto", 7, null, { rodape: "a".repeat(9000) }]) {
      const { error: recusa } = await u.cliente
        .from("configuracoes")
        .upsert({ modelo_mensagem: ruim as never }, { onConflict: "owner_id" })
        .select()
        .single();
      expect(recusa, JSON.stringify(ruim).slice(0, 30)).not.toBeNull();
    }
    const { data: depois } = await u.cliente.from("configuracoes").select("modelo_mensagem").single();
    expect(depois!.modelo_mensagem).toEqual(modelo);
  });

  it("outro usuário não lê o modelo do dono", async () => {
    const dono = await local.criarUsuario("modelo-dono");
    const outro = await local.criarUsuario("modelo-outro");
    await dono.cliente
      .from("configuracoes")
      .upsert({ modelo_mensagem: { saudacao: "Oi" } }, { onConflict: "owner_id" });
    const { data } = await outro.cliente.from("configuracoes").select("modelo_mensagem");
    expect(data).toEqual([]);
  });

  it("lembretes: as duas colunas nascem ligadas, o dono liga e desliga cada uma e o banco não aceita nulo (História 7.4)", async () => {
    const u = await local.criarUsuario("lembretes");
    // A linha nasce só com a Aparência: as colunas novas ganham o padrão (é o que a linha antiga também ganha).
    const { data: criada, error } = await u.cliente
      .from("configuracoes")
      .upsert({ aparencia: "claro" }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(criada!.lembrete_fechamento).toBe(true);
    expect(criada!.lembrete_atraso).toBe(true);

    // Desliga só o do fechamento; as outras colunas ficam como estavam.
    const { data: sem, error: erroSem } = await u.cliente
      .from("configuracoes")
      .upsert({ lembrete_fechamento: false }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(erroSem).toBeNull();
    expect(sem!.id).toBe(criada!.id);
    expect(sem!.lembrete_fechamento).toBe(false);
    expect(sem!.lembrete_atraso).toBe(true);
    expect(sem!.aparencia).toBe("claro");

    const { data: ambos } = await u.cliente
      .from("configuracoes")
      .upsert({ lembrete_atraso: false, lembrete_fechamento: true }, { onConflict: "owner_id" })
      .select()
      .single();
    expect(ambos).toMatchObject({ lembrete_fechamento: true, lembrete_atraso: false });

    // Nulo não passa (not null): o núcleo lê coluna ausente ou nula como ligada, mas o banco nunca guarda nulo.
    for (const ruim of [{ lembrete_fechamento: null }, { lembrete_atraso: null }]) {
      const { error: recusa } = await u.cliente
        .from("configuracoes")
        .upsert(ruim as never, { onConflict: "owner_id" })
        .select()
        .single();
      expect(recusa, JSON.stringify(ruim)).not.toBeNull();
    }
    const { data: depois } = await u.cliente.from("configuracoes").select("lembrete_fechamento, lembrete_atraso").single();
    expect(depois).toEqual({ lembrete_fechamento: true, lembrete_atraso: false });
  });

  it("outro usuário não lê nem muda os lembretes do dono (RLS)", async () => {
    const dono = await local.criarUsuario("lembretes-dono");
    const outro = await local.criarUsuario("lembretes-outro");
    await dono.cliente.from("configuracoes").upsert({ lembrete_atraso: false }, { onConflict: "owner_id" });
    const { data } = await outro.cliente.from("configuracoes").select("lembrete_atraso");
    expect(data).toEqual([]);
    const { data: lido } = await dono.cliente.from("configuracoes").select("lembrete_atraso").single();
    expect(lido!.lembrete_atraso).toBe(false);
  });
});
