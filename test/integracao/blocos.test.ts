// Prova, contra o Supabase local (CI), a tabela `blocos` e a RPC
// `salvar_bloco` (História 4.1): cria e altera, "É o meu Bloco" é único e
// passa de um Bloco para o outro na mesma transação, o dono isola tudo e a
// Fórmula conta uso de Responsável e Tipo (excluir em uso exige substituto e
// a troca vale dentro do `jsonb`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerFormula, type Formula } from "../../src/domain/formula";
import type { Json } from "../../src/data/database.types";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("blocos no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let rafael: string;
  let casal: string;
  let casa: string;

  const rangel = (resp: string): Formula => ({
    tipo: "operacao",
    operacao: "soma",
    esquerda: { tipo: "responsavel", id: resp },
    direita: {
      tipo: "grupo",
      interno: {
        tipo: "operacao",
        operacao: "divisao",
        esquerda: { tipo: "responsavel_em_tipo", responsavel_id: resp, tipo_id: casa },
        direita: { tipo: "numero", valor: "2" },
      },
    },
  });

  beforeAll(async () => {
    local = supabaseLocal("blocos");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const criar = async (nome: string, cor: number, ordem: number) => {
      const { data, error } = await a.cliente.from("responsaveis").insert({ nome, cor, ordem }).select().single();
      expect(error).toBeNull();
      return data!.id;
    };
    rafael = await criar("Rafael", 1, 1);
    casal = await criar("Casal", 2, 2);
    const { data, error } = await a.cliente.from("tipos").insert({ nome: "Casa" }).select().single();
    expect(error).toBeNull();
    casa = data!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function salvar(
    u: Usuario,
    nome: string,
    formula: Formula,
    extra: { id?: string; ordem?: number; de_cobranca?: boolean; meu_bloco?: boolean } = {},
  ) {
    return u.cliente.rpc("salvar_bloco", {
      p_nome: nome,
      p_formula: formula as unknown as Json,
      p_ordem: extra.ordem ?? 1,
      p_de_cobranca: extra.de_cobranca ?? false,
      p_meu_bloco: extra.meu_bloco ?? false,
      ...(extra.id ? { p_id: extra.id } : {}),
    });
  }

  it("cria o Bloco e devolve a linha; a Fórmula volta como o núcleo a lê", async () => {
    const { data, error } = await salvar(a, "Rangel", rangel(rafael), { de_cobranca: true });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ nome: "Rangel", ordem: 1, de_cobranca: true, meu_bloco: false });
    expect(lerFormula(data![0].formula)).toEqual({ ok: true, valor: rangel(rafael) });
  });

  it("altera o Bloco pelo id", async () => {
    const { data: criado } = await salvar(a, "Mãe", { tipo: "todos" }, { ordem: 2 });
    const id = criado![0].id;
    const { data, error } = await salvar(a, "Mãe e Lucas", { tipo: "responsavel", id: casal }, { id, ordem: 2 });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ id, nome: "Mãe e Lucas", formula: { tipo: "responsavel", id: casal } });
  });

  it("não altera Bloco de outro dono", async () => {
    const { data: criado } = await salvar(a, "Só do A", { tipo: "todos" }, { ordem: 3 });
    const { error } = await salvar(b, "Invadido", { tipo: "todos" }, { id: criado![0].id });
    expect(error?.message).toBe("bloco.nao_encontrado");
    const { data: doB } = await b.cliente.from("blocos").select("id");
    expect(doB).toEqual([]);
    const { data: doBanco } = await local.admin.from("blocos").select("nome").eq("id", criado![0].id).single();
    expect(doBanco!.nome).toBe("Só do A");
  });

  it("sem sessão não grava", async () => {
    const { error } = await local.anonimo.rpc("salvar_bloco", {
      p_nome: "Anônimo",
      p_formula: { tipo: "todos" },
      p_ordem: 1,
      p_de_cobranca: false,
      p_meu_bloco: false,
    });
    expect(error).not.toBeNull();
  });

  it("recusa nome vazio, nome com espaços nas pontas e Fórmula que não é objeto", async () => {
    expect((await salvar(a, "", { tipo: "todos" })).error).not.toBeNull();
    expect((await salvar(a, " Total", { tipo: "todos" })).error).not.toBeNull();
    expect((await salvar(a, "x".repeat(31), { tipo: "todos" })).error).not.toBeNull();
    const { error } = await a.cliente.rpc("salvar_bloco", {
      p_nome: "Lista",
      p_formula: [1] as unknown as Json,
      p_ordem: 1,
      p_de_cobranca: false,
      p_meu_bloco: false,
    });
    expect(error).not.toBeNull();
  });

  it('"É o meu Bloco" é único: marcar outro tira a marca do primeiro, na mesma gravação', async () => {
    const { data: primeiro } = await salvar(a, "Meu 1", { tipo: "responsavel", id: rafael }, { ordem: 10, meu_bloco: true });
    expect(primeiro![0].meu_bloco).toBe(true);
    const { data: segundo, error } = await salvar(a, "Meu 2", { tipo: "responsavel", id: rafael }, { ordem: 11, meu_bloco: true });
    expect(error).toBeNull();
    // Devolve o Bloco salvo e o que perdeu a marca.
    expect(segundo!.map((l) => [l.nome, l.meu_bloco]).sort()).toEqual([
      ["Meu 1", false],
      ["Meu 2", true],
    ]);
    const { data: marcados } = await local.admin.from("blocos").select("nome").eq("owner_id", a.id).eq("meu_bloco", true);
    expect(marcados).toEqual([{ nome: "Meu 2" }]);
  });

  it("o índice único de meu_bloco vale também fora da RPC, e é por dono", async () => {
    const { error } = await a.cliente
      .from("blocos")
      .insert({ nome: "Escondido", formula: { tipo: "todos" }, ordem: 20, meu_bloco: true });
    expect(error?.code).toBe("23505");
    // O B tem o seu próprio "meu Bloco".
    const { data, error: erroB } = await salvar(b, "Meu do B", { tipo: "todos" }, { meu_bloco: true });
    expect(erroB).toBeNull();
    expect(data![0].meu_bloco).toBe(true);
  });

  describe("a Fórmula conta uso de Responsável e Tipo (AD-16)", () => {
    let dono: Usuario;
    let r1: string;
    let r2: string;
    let t1: string;
    let t2: string;

    beforeAll(async () => {
      dono = await local.criarUsuario("uso");
      const resp = async (nome: string, cor: number) => {
        const { data } = await dono.cliente.from("responsaveis").insert({ nome, cor, ordem: cor }).select().single();
        return data!.id;
      };
      const tipo = async (nome: string) => {
        const { data } = await dono.cliente.from("tipos").insert({ nome }).select().single();
        return data!.id;
      };
      r1 = await resp("Rafael", 1);
      r2 = await resp("Rangel", 2);
      t1 = await tipo("Casa");
      t2 = await tipo("Saúde");
      const formula: Formula = {
        tipo: "operacao",
        operacao: "soma",
        esquerda: { tipo: "responsavel", id: r1 },
        direita: { tipo: "responsavel_em_tipo", responsavel_id: r1, tipo_id: t1 },
      };
      const { error } = await salvar(dono, "Usa os dois", formula);
      expect(error).toBeNull();
    });

    async function usos(cadastro: "responsavel" | "tipo", id: string) {
      const { data, error } = await dono.cliente.rpc("contar_usos_cadastro", { cadastro });
      expect(error).toBeNull();
      return Number((data ?? []).find((l) => l.id === id)?.usos ?? 0);
    }

    it("conta um uso por Bloco que cita o cadastro", async () => {
      expect(await usos("responsavel", r1)).toBe(1);
      expect(await usos("tipo", t1)).toBe(1);
      expect(await usos("responsavel", r2)).toBe(0);
      expect(await usos("tipo", t2)).toBe(0);
    });

    it("recusa excluir sem substituto e troca o id dentro da Fórmula com substituto", async () => {
      const { error } = await dono.cliente.rpc("substituir_cadastro", { cadastro: "responsavel", de_id: r1 });
      expect(error?.message).toBe("cadastro.em_uso");

      const { error: erroTipo } = await dono.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: t1, para_id: t2 });
      expect(erroTipo).toBeNull();
      const { error: erroResp } = await dono.cliente.rpc("substituir_cadastro", { cadastro: "responsavel", de_id: r1, para_id: r2 });
      expect(erroResp).toBeNull();

      const { data } = await dono.cliente.from("blocos").select("formula").eq("nome", "Usa os dois").single();
      expect(lerFormula(data!.formula)).toEqual({
        ok: true,
        valor: {
          tipo: "operacao",
          operacao: "soma",
          esquerda: { tipo: "responsavel", id: r2 },
          direita: { tipo: "responsavel_em_tipo", responsavel_id: r2, tipo_id: t2 },
        },
      });
    });
  });
  // Blocos no Painel (História 4.2): reordenar e excluir.
  describe("reordenar e excluir (História 4.2)", () => {
    let dono: Usuario;
    let outro: Usuario;
    let ids: Record<string, string>;

    const ordem = async (u: Usuario) => {
      const { data } = await u.cliente.from("blocos").select("nome, ordem").order("ordem");
      return (data ?? []).map((l) => `${l.nome}:${l.ordem}`);
    };

    beforeAll(async () => {
      dono = await local.criarUsuario("ordem");
      outro = await local.criarUsuario("ordem-outro");
      ids = {};
      for (const [i, nome] of ["Um", "Dois", "Três", "Quatro"].entries()) {
        const { data, error } = await salvar(dono, nome, { tipo: "todos" }, { ordem: i + 1 });
        expect(error).toBeNull();
        ids[nome] = data![0].id;
      }
      const { error } = await salvar(outro, "Do outro", { tipo: "todos" }, { ordem: 1 });
      expect(error).toBeNull();
    });

    it("grava a ordem numa transação e devolve só as linhas que mudaram", async () => {
      const { data, error } = await dono.cliente.rpc("reordenar_blocos", {
        p_ids: [ids["Três"], ids["Um"], ids["Dois"], ids["Quatro"]],
      });
      expect(error).toBeNull();
      expect(data!.map((l) => l.nome).sort()).toEqual(["Dois", "Três", "Um"]);
      expect(await ordem(dono)).toEqual(["Três:1", "Um:2", "Dois:3", "Quatro:4"]);
      // A mesma ordem de novo: nada muda, nada volta.
      const { data: igual } = await dono.cliente.rpc("reordenar_blocos", {
        p_ids: [ids["Três"], ids["Um"], ids["Dois"], ids["Quatro"]],
      });
      expect(igual).toEqual([]);
    });

    it("Bloco que ficou fora da lista (criado em outro aparelho) vai depois, na ordem que tinha", async () => {
      const { error } = await dono.cliente.rpc("reordenar_blocos", { p_ids: [ids["Quatro"], ids["Dois"]] });
      expect(error).toBeNull();
      expect(await ordem(dono)).toEqual(["Quatro:1", "Dois:2", "Três:3", "Um:4"]);
    });

    it("ignora id de outro dono e não mexe nos Blocos dele", async () => {
      const { data: doOutro } = await outro.cliente.from("blocos").select("id, ordem");
      const idDoOutro = doOutro![0].id;
      const { error } = await dono.cliente.rpc("reordenar_blocos", { p_ids: [idDoOutro, ids["Um"]] });
      expect(error).toBeNull();
      const { data: depois } = await outro.cliente.from("blocos").select("ordem").eq("id", idDoOutro);
      expect(depois).toEqual([{ ordem: doOutro![0].ordem }]);
    });

    it("sem sessão não grava", async () => {
      const { error } = await local.anonimo.rpc("reordenar_blocos", { p_ids: [ids["Um"]] });
      expect(error).not.toBeNull();
    });

    it("excluir apaga só o Bloco do dono; o de outro dono continua", async () => {
      const { data: doOutro } = await outro.cliente.from("blocos").select("id");
      // O dono não enxerga nem apaga o do outro (RLS: nenhuma linha afetada).
      await dono.cliente.from("blocos").delete().eq("id", doOutro![0].id);
      expect((await outro.cliente.from("blocos").select("id")).data).toHaveLength(1);

      const { error } = await dono.cliente.from("blocos").delete().eq("id", ids["Quatro"]);
      expect(error).toBeNull();
      const { data } = await dono.cliente.from("blocos").select("id").eq("id", ids["Quatro"]);
      expect(data).toEqual([]);
    });

    it('excluir o "meu Bloco" libera a marca: nenhum outro a herda e outro Bloco pode recebê-la', async () => {
      const { data: meu } = await salvar(dono, "Meu", { tipo: "todos" }, { ordem: 9, meu_bloco: true });
      const { error } = await dono.cliente.from("blocos").delete().eq("id", meu![0].id);
      expect(error).toBeNull();
      const { data: marcados } = await local.admin.from("blocos").select("nome").eq("owner_id", dono.id).eq("meu_bloco", true);
      expect(marcados).toEqual([]);
      const { error: depois } = await salvar(dono, "Novo meu", { tipo: "todos" }, { ordem: 10, meu_bloco: true });
      expect(depois).toBeNull();
    });
  });
});
