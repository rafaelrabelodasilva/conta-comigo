// Prova, contra o Supabase local (CI), o Apelido em massa (História 3.9):
// `classificar_em_lote` aceita `apelido` no corpo (texto grava, `null` remove),
// grava linhas de vários Meses e previstos numa transação (tudo ou nada), a
// restrição do formato do Apelido continua valendo, o Nome nunca muda, o
// RLS impede tocar em linha de outro dono e o "Desfazer" é a mesma chamada
// com os valores de antes. Quem decide quais linhas mudam é o núcleo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Apelido em massa no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("apelido");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function nova(usuario: Usuario, mes: string, extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await usuario.cliente
      .from("lancamentos")
      .insert({
        nome: "PAG*JOSEDASILVA",
        nome_normalizado: "PAG*JOSEDASILVA",
        valor_centavos: 5000,
        lancado_por: "manual",
        mes,
        ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  const lote = (u: Usuario, itens: unknown) => u.cliente.rpc("classificar_em_lote", { p_itens: itens as Json });
  const ler = async (id: string) => (await local.admin.from("lancamentos").select("*").eq("id", id).single()).data!;

  it("dar: grava o Apelido em linhas de vários Meses e em previstos, sem mexer no Nome nem no editado_em do previsto", async () => {
    const out = await nova(a, "2026-10");
    const nov = await nova(a, "2026-11");
    const dez = await nova(a, "2026-12", { lancado_por: "sistema" });
    const agora = "2026-11-11T12:00:00Z";
    const { data, error } = await lote(a, [
      { id: out, corpo: { apelido: "Celular da mãe", editado_em: agora } },
      { id: nov, corpo: { apelido: "Celular da mãe", editado_em: agora } },
      { id: dez, corpo: { apelido: "Celular da mãe" } },
    ]);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    for (const id of [out, nov, dez]) {
      const l = await ler(id);
      expect(l.apelido).toBe("Celular da mãe");
      expect(l.nome).toBe("PAG*JOSEDASILVA");
      expect(l.nome_normalizado).toBe("PAG*JOSEDASILVA");
    }
    expect((await ler(dez)).editado_em).toBeNull();
    expect((await ler(nov)).editado_em).not.toBeNull();
  });

  it("remover (null) e o 'Desfazer' com os valores de antes", async () => {
    const x = await nova(a, "2026-11", { apelido: "Celular" });
    const y = await nova(a, "2026-12", { apelido: "Celular" });
    expect((await lote(a, [{ id: x, corpo: { apelido: null } }, { id: y, corpo: { apelido: null } }])).error).toBeNull();
    expect((await ler(x)).apelido).toBeNull();
    expect((await ler(y)).apelido).toBeNull();
    expect((await lote(a, [{ id: x, corpo: { apelido: "Celular" } }, { id: y, corpo: { apelido: "Celular" } }])).error).toBeNull();
    expect((await ler(x)).apelido).toBe("Celular");
    expect((await ler(y)).apelido).toBe("Celular");
  });

  it("tudo ou nada: um Apelido fora do formato desfaz a transação inteira", async () => {
    const x = await nova(a, "2026-11");
    const y = await nova(a, "2026-12");
    const { error } = await lote(a, [
      { id: x, corpo: { apelido: "Valido" } },
      { id: y, corpo: { apelido: "x".repeat(61) } },
    ]);
    expect(error).not.toBeNull();
    expect((await ler(x)).apelido).toBeNull();
    expect((await lote(a, [{ id: x, corpo: { apelido: " com espaço na ponta" } }])).error).not.toBeNull();
    expect((await lote(a, [{ id: x, corpo: { apelido: "" } }])).error).not.toBeNull();
  });

  it("não grava o Nome (fora da lista fechada) nem em linha de outro dono", async () => {
    const x = await nova(a, "2026-11");
    expect((await lote(a, [{ id: x, corpo: { nome: "OUTRO" } }])).error).not.toBeNull();
    expect((await ler(x)).nome).toBe("PAG*JOSEDASILVA");
    const doB = await nova(b, "2026-11");
    expect((await lote(a, [{ id: doB, corpo: { apelido: "Invasor" } }])).error).not.toBeNull();
    expect((await ler(doB)).apelido).toBeNull();
  });

  it("mãe dividida e filhas recebem o Apelido na mesma chamada", async () => {
    const mae = await nova(a, "2026-11");
    const f1 = await nova(a, "2026-11", { dividido_de_id: mae });
    const f2 = await nova(a, "2026-11", { dividido_de_id: mae });
    const { data, error } = await lote(a, [mae, f1, f2].map((id) => ({ id, corpo: { apelido: "Celular da mãe" } })));
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect((await ler(f1)).apelido).toBe("Celular da mãe");
    expect((await ler(f2)).apelido).toBe("Celular da mãe");
  });
});
