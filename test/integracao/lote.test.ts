// Prova, contra o Supabase local (CI), a RPC `classificar_em_lote` (História
// 3.3): grava várias linhas numa transação (tudo ou nada), cada uma com o
// seu corpo (chave ausente = intocada, null = grava nulo), recusa id sumido,
// excluído, repetido, coluna fora da lista e mais de 1000 itens, respeita o
// RLS (outro dono não toca) e o "Desfazer" é a mesma chamada com os valores
// de antes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

type Item = { id: string; corpo: Record<string, unknown> };

describe.skipIf(!ligado)("classificar_em_lote no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let casal: string;
  let rafael: string;
  let casa: string;
  let saude: string;

  beforeAll(async () => {
    local = supabaseLocal("lote");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const resp = async (nome: string, cor: number) => {
      const { data, error } = await a.cliente.from("responsaveis").insert({ nome, cor, ordem: cor }).select().single();
      expect(error).toBeNull();
      return data!.id;
    };
    const tipo = async (nome: string) => {
      const { data, error } = await a.cliente.from("tipos").insert({ nome }).select().single();
      expect(error).toBeNull();
      return data!.id;
    };
    casal = await resp("Casal", 1);
    rafael = await resp("Rafael", 2);
    casa = await tipo("Casa");
    saude = await tipo("Saúde");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function nova(nome: string, extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await a.cliente
      .from("lancamentos")
      .insert({
        nome,
        nome_normalizado: nome,
        valor_centavos: 1000,
        lancado_por: "manual",
        mes: "2026-11",
        revisao_motivo: "sem_classificacao",
        ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  const chamar = (u: Usuario, itens: unknown) => u.cliente.rpc("classificar_em_lote", { p_itens: itens as Json });
  const ler = async (id: string) => (await local.admin.from("lancamentos").select("*").eq("id", id).single()).data!;

  it("grava cada linha com o seu corpo numa chamada só e devolve as linhas; o que não vem fica como está", async () => {
    const x = await nova("SHOPEE X", { observacao: "antes" });
    const y = await nova("AMAZON Y");
    const antes = await ler(x);
    const agora = "2026-11-10T15:00:00.000Z";
    const itens: Item[] = [
      { id: x, corpo: { responsavel_id: casal, tipo_id: casa, revisao_motivo: null, revisao_dados: null, revisado_em: agora, editado_em: agora } },
      { id: y, corpo: { responsavel_id: rafael, status_id: null, editado_em: agora } },
    ];
    const { data, error } = await chamar(a, itens);
    expect(error).toBeNull();
    const linhas = data as unknown as { id: string; responsavel_id: string }[];
    expect(linhas.map((l) => l.id).sort()).toEqual([x, y].sort());

    expect(await ler(x)).toMatchObject({
      responsavel_id: casal,
      tipo_id: casa,
      revisao_motivo: null,
      revisao_dados: null,
      observacao: "antes", // chave ausente: intocada
    });
    expect(new Date((await ler(x)).revisado_em!).toISOString()).toBe(agora);
    expect(new Date((await ler(x)).updated_at).getTime()).toBeGreaterThan(new Date(antes.updated_at).getTime());
    // O outro item: só o Responsável mudou; continua na fila.
    expect(await ler(y)).toMatchObject({ responsavel_id: rafael, tipo_id: null, revisao_motivo: "sem_classificacao" });
  });

  it("null grava nulo (e é assim que o Desfazer devolve o que estava)", async () => {
    const x = await nova("COBASI", { observacao: "nota" });
    const { error } = await chamar(a, [{ id: x, corpo: { observacao: null, responsavel_id: casal, tipo_id: saude } }]);
    expect(error).toBeNull();
    expect(await ler(x)).toMatchObject({ observacao: null, responsavel_id: casal, tipo_id: saude });
    const desfeito = await chamar(a, [{ id: x, corpo: { observacao: "nota", responsavel_id: null, tipo_id: null } }]);
    expect(desfeito.error).toBeNull();
    expect(await ler(x)).toMatchObject({ observacao: "nota", responsavel_id: null, tipo_id: null });
  });

  it("revisao_dados é um objeto; outro formato grava nulo", async () => {
    const x = await nova("MAGALU");
    const dados = { responsavel_id: casal, tipo_id: casa, outros_responsaveis: [] };
    await chamar(a, [{ id: x, corpo: { revisao_motivo: "sugestao", revisao_dados: dados } }]);
    expect((await ler(x)).revisao_dados).toEqual(dados);
    await chamar(a, [{ id: x, corpo: { revisao_dados: null } }]);
    expect((await ler(x)).revisao_dados).toBeNull();
  });

  it("tudo ou nada: um id que não existe desfaz o lote inteiro", async () => {
    const x = await nova("SHOPEE Z");
    const { error } = await chamar(a, [
      { id: x, corpo: { responsavel_id: casal } },
      { id: "00000000-0000-4000-8000-000000000000", corpo: { responsavel_id: casal } },
    ]);
    expect(error?.message).toBe("salvar.falhou");
    expect((await ler(x)).responsavel_id).toBeNull();
  });

  it("recusa linha excluída, id repetido, coluna fora da lista, item mal formado e não-lista", async () => {
    const x = await nova("SHOPEE W");
    const excluida = await nova("EXCLUIDA", { excluido_em: "2026-11-01T00:00:00Z" });
    const casos: unknown[] = [
      [{ id: x, corpo: { responsavel_id: casal } }, { id: excluida, corpo: { responsavel_id: casal } }],
      [{ id: x, corpo: { responsavel_id: casal } }, { id: x, corpo: { responsavel_id: rafael } }],
      [{ id: x, corpo: { valor_centavos: 1 } }],
      [{ id: x, corpo: { excluido_em: "2026-11-01T00:00:00Z" } }],
      [{ id: x }],
      [{ corpo: { responsavel_id: casal } }],
      [{ id: x, corpo: [] }],
      { id: x, corpo: {} },
      null,
    ];
    for (const caso of casos) {
      const { error } = await chamar(a, caso);
      expect(error?.message, JSON.stringify(caso)).toBe("salvar.falhou");
    }
    expect(await ler(x)).toMatchObject({ responsavel_id: null, valor_centavos: 1000, excluido_em: null });
  });

  it("lista vazia devolve [] sem tocar em nada; mais de 1000 itens é recusado", async () => {
    const vazia = await chamar(a, []);
    expect(vazia.error).toBeNull();
    expect(vazia.data).toEqual([]);
    const muitos = Array.from({ length: 1001 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      corpo: { responsavel_id: casal },
    }));
    expect((await chamar(a, muitos)).error?.message).toBe("salvar.falhou");
  });

  it("RLS: outro dono não toca nas linhas de A (e nada é gravado); sem login, nem executa", async () => {
    const x = await nova("SHOPEE RLS");
    const { error } = await chamar(b, [{ id: x, corpo: { observacao: "invasor" } }]);
    expect(error?.message).toBe("salvar.falhou");
    expect((await ler(x)).observacao).toBeNull();
    const anonimo = await local.anonimo.rpc("classificar_em_lote", { p_itens: [{ id: x, corpo: {} }] as Json });
    expect(anonimo.error).not.toBeNull();
    expect((await ler(x)).observacao).toBeNull();
  });

  it("o Realtime entrega o UPDATE do lote ao outro aparelho do mesmo dono", async () => {
    const x = await nova("SHOPEE RT");
    const outro = await local.entrar(a.email, a.senha);
    try {
      const evento = await esperarEvento<{ id: string; observacao: string | null }>(
        outro,
        "lancamentos",
        "UPDATE",
        (l) => l.id === x && l.observacao === "via lote",
        () => chamar(a, [{ id: x, corpo: { observacao: "via lote" } }]),
      );
      expect(evento.observacao).toBe("via lote");
    } finally {
      await outro.removeAllChannels();
    }
  });
});
