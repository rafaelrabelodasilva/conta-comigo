// Prova, contra o Supabase local (CI), a RPC `substituir_cadastro` e suas
// auxiliares (História 1.6): exclui sem uso, troca o Status padrão pelo
// substituto ou o anula, recusa substitutos inválidos e nunca toca cadastro
// de outro dono. Também exige que `referencias_cadastro()` seja igual às
// constantes do núcleo: história que criar referência e não acrescentá-la
// às duas listas quebra este teste.
//
// O caminho "em uso" (recusa sem substituto, contagem > 0) só tem teste no
// núcleo e no repositório: hoje nenhuma referência conta uso. O teste de
// integração dele chega com a primeira (Lançamentos, Épico 2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REFERENCIAS_COLUNAS, REFERENCIAS_JSONB, type Referencia } from "../../src/domain/cadastros";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("substituir_cadastro no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("subst");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function criar(u: Usuario, tabela: "status" | "tipos", nome: string, arquivado = false) {
    const { data, error } = await u.cliente.from(tabela).insert({ nome, arquivado }).select().single();
    expect(error).toBeNull();
    return data!.id;
  }

  async function existe(tabela: "status" | "tipos" | "responsaveis", id: string) {
    const { data } = await local.admin.from(tabela).select("id").eq("id", id);
    return (data ?? []).length === 1;
  }

  async function definirPadrao(u: Usuario, id: string | null) {
    const { error } = await u.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: id }, { onConflict: "owner_id" });
    expect(error).toBeNull();
  }

  async function padraoDe(u: Usuario) {
    const { data } = await local.admin
      .from("configuracoes")
      .select("status_padrao_id")
      .eq("owner_id", u.id)
      .single();
    return data!.status_padrao_id;
  }

  it("referencias_cadastro() é igual a REFERENCIAS_COLUNAS e REFERENCIAS_JSONB do núcleo", async () => {
    const { data, error } = await a.cliente.rpc("referencias_cadastro");
    expect(error).toBeNull();
    const doBanco = (forma: string): Referencia[] =>
      (data ?? [])
        .filter((r) => r.forma === forma)
        .map((r) => ({
          cadastro: r.cadastro as Referencia["cadastro"],
          tabela: r.tabela,
          coluna: r.coluna,
          contaUso: r.conta_uso,
        }));
    const ordenar = (lista: readonly Referencia[]) =>
      [...lista].sort((x, y) =>
        `${x.cadastro}.${x.tabela}.${x.coluna}`.localeCompare(`${y.cadastro}.${y.tabela}.${y.coluna}`),
      );
    expect(ordenar(doBanco("coluna"))).toEqual(ordenar(REFERENCIAS_COLUNAS));
    expect(ordenar(doBanco("jsonb"))).toEqual(ordenar(REFERENCIAS_JSONB));
    expect((data ?? []).every((r) => r.forma === "coluna" || r.forma === "jsonb")).toBe(true);
  });

  it("nenhuma chave estrangeira para responsaveis, tipos ou status fica fora de referencias_cadastro()", async () => {
    const { data, error } = await local.admin.rpc("referencias_fk_nao_listadas");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Só o service_role lê o catálogo por esta função.
    const { error: erroUsuario } = await a.cliente.rpc("referencias_fk_nao_listadas");
    expect(erroUsuario).not.toBeNull();
  });

  it("a exclusão chega como DELETE a outro aparelho do mesmo dono", async () => {
    const outroAparelho = await local.entrar(a.email, a.senha);
    const excluidos: string[] = [];
    // Cada tentativa cria e exclui um Status novo (um DELETE não se repete).
    const antiga = await esperarEvento<{ id: string }>(
      outroAparelho,
      "status",
      "DELETE",
      (old) => excluidos.includes(old.id),
      async (t) => {
        const deId = await criar(a, "status", `Excluir ${t}`);
        excluidos.push(deId);
        const { error } = await a.cliente.rpc("substituir_cadastro", { cadastro: "status", de_id: deId });
        expect(error).toBeNull();
      },
    );
    expect(excluidos).toContain(antiga.id);
    expect(await existe("status", antiga.id)).toBe(false);
  }, 40_000);

  it("exclui Tipo, Responsável e Status sem uso", async () => {
    const tipo = await criar(a, "tipos", "Casa");
    const status = await criar(a, "status", "Parcial");
    const { data: resp, error } = await a.cliente
      .from("responsaveis")
      .insert({ nome: "Lucas", cor: 2, ordem: 1 })
      .select()
      .single();
    expect(error).toBeNull();

    for (const [cadastro, id, tabela] of [
      ["tipo", tipo, "tipos"],
      ["status", status, "status"],
      ["responsavel", resp!.id, "responsaveis"],
    ] as const) {
      const { error: erroRpc } = await a.cliente.rpc("substituir_cadastro", { cadastro, de_id: id });
      expect(erroRpc).toBeNull();
      expect(await existe(tabela, id)).toBe(false);
    }
  });

  it("contar_usos_cadastro devolve 0 para cada item (nada conta uso ainda)", async () => {
    const id = await criar(a, "tipos", "Gatos");
    const { data, error } = await a.cliente.rpc("contar_usos_cadastro", { cadastro: "tipo" });
    expect(error).toBeNull();
    expect(data).toContainEqual({ id, usos: 0 });
    const { data: deB } = await b.cliente.rpc("contar_usos_cadastro", { cadastro: "tipo" });
    expect((deB ?? []).some((l) => l.id === id)).toBe(false);
  });

  it("excluir o Status padrão com substituto troca o padrão pelo substituto", async () => {
    const pago = await criar(a, "status", "Pago");
    const quitado = await criar(a, "status", "Quitado");
    await definirPadrao(a, pago);
    const { error } = await a.cliente.rpc("substituir_cadastro", {
      cadastro: "status",
      de_id: pago,
      para_id: quitado,
    });
    expect(error).toBeNull();
    expect(await existe("status", pago)).toBe(false);
    expect(await padraoDe(a)).toBe(quitado);
  });

  it("excluir o Status padrão sem substituto anula o padrão (o padrão não conta uso)", async () => {
    const pago = await criar(a, "status", "Pago 2");
    await definirPadrao(a, pago);
    const { error } = await a.cliente.rpc("substituir_cadastro", { cadastro: "status", de_id: pago });
    expect(error).toBeNull();
    expect(await existe("status", pago)).toBe(false);
    expect(await padraoDe(a)).toBeNull();
  });

  it("recusa substituto arquivado, de outro cadastro, de outro dono ou ele mesmo", async () => {
    const alvo = await criar(a, "status", "Alvo");
    const arquivado = await criar(a, "status", "Velho", true);
    const tipo = await criar(a, "tipos", "Viagem");
    const deB = await criar(b, "status", "De B");
    await definirPadrao(a, alvo);

    for (const para of [arquivado, tipo, deB, alvo, crypto.randomUUID()]) {
      const { error } = await a.cliente.rpc("substituir_cadastro", {
        cadastro: "status",
        de_id: alvo,
        para_id: para,
      });
      expect(error?.message).toBe("cadastro.substituto_invalido");
    }
    expect(await existe("status", alvo)).toBe(true);
    expect(await padraoDe(a)).toBe(alvo);
    expect(await existe("status", deB)).toBe(true);
  });

  it("não toca cadastro de outro dono", async () => {
    const deB = await criar(b, "tipos", "Só de B");
    const statusB = await criar(b, "status", "Padrão de B");
    await definirPadrao(b, statusB);
    const substitutoA = await criar(a, "status", "Substituto de A");

    const { error } = await a.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: deB });
    expect(error?.message).toBe("cadastro.nao_encontrado");
    const { error: erroStatus } = await a.cliente.rpc("substituir_cadastro", {
      cadastro: "status",
      de_id: statusB,
      para_id: substitutoA,
    });
    expect(erroStatus?.message).toBe("cadastro.nao_encontrado");

    expect(await existe("tipos", deB)).toBe(true);
    expect(await existe("status", statusB)).toBe(true);
    expect(await padraoDe(b)).toBe(statusB);
  });

  it("recusa cadastro desconhecido e chamada sem login", async () => {
    const tipo = await criar(a, "tipos", "Escola");
    const { error } = await a.cliente.rpc("substituir_cadastro", { cadastro: "fatura", de_id: tipo });
    expect(error?.message).toBe("cadastro.invalido");

    const { error: erroAnon } = await local.anonimo.rpc("substituir_cadastro", {
      cadastro: "tipo",
      de_id: tipo,
    });
    expect(erroAnon).not.toBeNull();
    expect(await existe("tipos", tipo)).toBe(true);
  });

  it("trocar_id_jsonb troca o id em valor, lista, chave e aninhado, sem tocar os outros", async () => {
    const de = crypto.randomUUID();
    const para = crypto.randomUUID();
    const outro = crypto.randomUUID();
    const doc = {
      valor: de,
      lista: [de, outro],
      [de]: 5,
      aninhado: { fundo: [{ id: de, nome: "x" }], [outro]: de },
      outro,
      parecido: `${de}-sufixo`,
    };
    const { data, error } = await a.cliente.rpc("trocar_id_jsonb", { doc, de, para });
    expect(error).toBeNull();
    expect(data).toEqual({
      valor: para,
      lista: [para, outro],
      [para]: 5,
      aninhado: { fundo: [{ id: para, nome: "x" }], [outro]: para },
      outro,
      parecido: `${de}-sufixo`,
    });
  });
});
