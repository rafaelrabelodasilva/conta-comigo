// Prova, contra o Supabase local (CI), a migração da História 8.1 (`20261203120000_avisos_lidos.sql`): `avisos_lidos`,
// o "lido" da Central de Avisos que vale em todos os aparelhos. A chave é a do aviso do sistema (`tipo`, `referencia`,
// `dia`), única por dono; o RLS é por dono (outro dono não vê, não marca nem apaga); a tabela está no Realtime, então
// marcar num aparelho chega ao outro do mesmo dono; e o repositório do navegador (`criarRepoAvisos`) marca um, marca
// vários de uma vez e ignora o que já está lido.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarRepoAvisos, type LinhaAvisoLido } from "../../src/data/avisos-repo";
import { criarGerenciador } from "../../src/data/realtime";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Avisos lidos no Supabase local (História 8.1)", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let seq = 0;

  const chave = (extra: Partial<{ tipo: string; referencia: string; dia: string }> = {}) => ({
    tipo: "atraso",
    referencia: `bloco-${Date.now()}-${++seq}`,
    dia: "2026-11-17",
    ...extra,
  });

  beforeAll(async () => {
    local = supabaseLocal("avisos-lidos");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    // Estado limpo: os usuários e as linhas são compartilhados dentro do arquivo, e os blocos abaixo contam linhas.
    await local.admin.from("avisos_lidos").delete().in("owner_id", [a.id, b.id]);
  });

  afterAll(async () => {
    await local.limpar();
  });

  describe("a tabela e a restrição única", () => {
    it("o dono marca: owner_id, id e datas vêm do banco", async () => {
      const c = chave();
      const { data, error } = await a.cliente.from("avisos_lidos").insert(c).select().single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ owner_id: a.id, ...c });
      expect(data!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(data!.created_at).getFullYear()).toBeGreaterThan(2000);
      expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000);
    });

    it("a mesma chave duas vezes: a restrição única recusa (23505)", async () => {
      const c = chave();
      expect((await a.cliente.from("avisos_lidos").insert(c)).error).toBeNull();
      const { error } = await a.cliente.from("avisos_lidos").insert(c);
      expect(error?.code).toBe("23505");
      expect(error?.message).toContain("avisos_lidos_chave_key");
    });

    it("a mesma referência com outro dia ('desde' novo) ou outro tipo é outra chave", async () => {
      const c = chave();
      expect((await a.cliente.from("avisos_lidos").insert(c)).error).toBeNull();
      expect((await a.cliente.from("avisos_lidos").insert({ ...c, dia: "2026-12-17" })).error).toBeNull();
      expect((await a.cliente.from("avisos_lidos").insert({ ...c, tipo: "fechamento" })).error).toBeNull();
    });

    it("dois donos podem ter a mesma chave (a unicidade é por dono)", async () => {
      const c = chave();
      expect((await a.cliente.from("avisos_lidos").insert(c)).error).toBeNull();
      expect((await b.cliente.from("avisos_lidos").insert(c)).error).toBeNull();
    });

    it("upsert pela chave com `ignoreDuplicates` (o que o repositório faz) devolve só o que inseriu", async () => {
      const ja = chave();
      expect((await a.cliente.from("avisos_lidos").insert(ja)).error).toBeNull();
      const nova1 = chave();
      const nova2 = chave({ tipo: "fechamento", dia: "2026-10-28" });
      const { data, error } = await a.cliente
        .from("avisos_lidos")
        .upsert([ja, nova1, nova2], { onConflict: "owner_id,tipo,referencia,dia", ignoreDuplicates: true })
        .select();
      expect(error).toBeNull();
      expect(data!.map((l) => l.referencia).sort()).toEqual([nova1.referencia, nova2.referencia].sort());
      // Repetir tudo não erra nem duplica.
      const { data: de_novo, error: erro2 } = await a.cliente
        .from("avisos_lidos")
        .upsert([ja, nova1, nova2], { onConflict: "owner_id,tipo,referencia,dia", ignoreDuplicates: true })
        .select();
      expect(erro2).toBeNull();
      expect(de_novo).toEqual([]);
    });

    it("o `id` que o cliente sorteia é o que fica (o otimismo do navegador depende disso)", async () => {
      const id = crypto.randomUUID();
      const c = chave();
      const { data, error } = await a.cliente.from("avisos_lidos").insert({ id, ...c }).select().single();
      expect(error).toBeNull();
      expect(data!.id).toBe(id);
    });

    it("cada coluna tem a sua restrição: tipo vazio ou longo, referência vazia ou longa, dia que não é data", async () => {
      const c = chave();
      for (const ruim of [
        { ...c, tipo: "" },
        { ...c, tipo: "t".repeat(33) },
        { ...c, referencia: "" },
        { ...c, referencia: "r".repeat(65) },
        { ...c, dia: "ontem" },
      ]) {
        const { error } = await a.cliente.from("avisos_lidos").insert(ruim);
        expect(error, JSON.stringify(ruim).slice(0, 40)).not.toBeNull();
      }
      // O limite exato passa (tipos novos da 8.2 entram sem migração).
      expect(
        (await a.cliente.from("avisos_lidos").insert({ ...c, tipo: "t".repeat(32), referencia: "r".repeat(64) })).error,
      ).toBeNull();
    });
  });

  describe("RLS por dono", () => {
    it("outro dono não vê o que o dono leu", async () => {
      const c = chave();
      await a.cliente.from("avisos_lidos").insert(c);
      const { data } = await b.cliente.from("avisos_lidos").select().eq("referencia", c.referencia);
      expect(data).toEqual([]);
      const { data: doDono } = await a.cliente.from("avisos_lidos").select().eq("referencia", c.referencia);
      expect(doDono).toHaveLength(1);
    });

    it("outro dono não marca em nome do dono (owner_id alheio é recusado)", async () => {
      const c = chave();
      const { error } = await b.cliente.from("avisos_lidos").insert({ ...c, owner_id: a.id });
      expect(error).not.toBeNull();
      const { data } = await local.admin.from("avisos_lidos").select().eq("referencia", c.referencia);
      expect(data).toEqual([]);
    });

    it("outro dono não altera nem apaga a linha do dono", async () => {
      const c = chave();
      await a.cliente.from("avisos_lidos").insert(c);
      const { data: alteradas } = await b.cliente
        .from("avisos_lidos")
        .update({ dia: "2020-01-01" })
        .eq("referencia", c.referencia)
        .select();
      expect(alteradas).toEqual([]);
      const { data: apagadas } = await b.cliente.from("avisos_lidos").delete().eq("referencia", c.referencia).select();
      expect(apagadas).toEqual([]);
      const { data: depois } = await local.admin.from("avisos_lidos").select().eq("referencia", c.referencia);
      expect(depois).toHaveLength(1);
      expect(depois![0].dia).toBe(c.dia);
    });

    it("o dono apaga a própria linha (e muda o `updated_at` só pelo banco)", async () => {
      const c = chave();
      const { data: criada } = await a.cliente.from("avisos_lidos").insert(c).select().single();
      const { data: movida, error } = await a.cliente
        .from("avisos_lidos")
        .update({ referencia: `${c.referencia}-x` })
        .eq("id", criada!.id)
        .select()
        .single();
      expect(error).toBeNull();
      expect(new Date(movida!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(criada!.updated_at).getTime());
      const { data: apagadas } = await a.cliente.from("avisos_lidos").delete().eq("id", criada!.id).select();
      expect(apagadas).toHaveLength(1);
    });

    it("o anônimo não lê nem grava", async () => {
      const c = chave();
      await a.cliente.from("avisos_lidos").insert(c);
      const lido = await local.anonimo.from("avisos_lidos").select();
      expect(lido.error !== null || (lido.data ?? []).length === 0).toBe(true);
      expect((await local.anonimo.from("avisos_lidos").insert(chave())).error).not.toBeNull();
    });
  });

  describe("Realtime: o lido chega ao outro aparelho do mesmo dono", () => {
    it("marcar num aparelho dispara o INSERT no outro (replica identity full, na publicação)", async () => {
      const outroAparelho = await local.entrar(a.email, a.senha);
      const prefixo = `rt-${Date.now()}`;
      const evento = await esperarEvento<LinhaAvisoLido>(
        outroAparelho,
        "avisos_lidos",
        "INSERT",
        (linha) => linha.referencia.startsWith(prefixo),
        (tentativa) => a.cliente.from("avisos_lidos").insert(chave({ referencia: `${prefixo}-${tentativa}` })),
      );
      expect(evento).toMatchObject({ owner_id: a.id, tipo: "atraso" });
      await outroAparelho.removeAllChannels();
    });

    it("outro dono não recebe o evento do dono (o RLS vale no Realtime)", async () => {
      const prefixo = `rt-b-${Date.now()}`;
      const recebidos: string[] = [];
      const canal = b.cliente
        .channel(`teste-avisos-b-${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos_lidos" }, (p) => {
          recebidos.push((p.new as LinhaAvisoLido).referencia);
        });
      await new Promise<void>((resolver, rejeitar) => {
        const limite = setTimeout(() => rejeitar(new Error("canal não conectou")), 15_000);
        canal.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            clearTimeout(limite);
            resolver();
          }
        });
      });
      await a.cliente.from("avisos_lidos").insert(chave({ referencia: `${prefixo}-1` }));
      await new Promise((r) => setTimeout(r, 3_000));
      await b.cliente.removeChannel(canal);
      expect(recebidos.filter((r) => r.startsWith(prefixo))).toEqual([]);
    });
  });

  describe("o repositório do navegador contra o banco de verdade", () => {
    it("marcar um, marcar vários de uma vez e ignorar o que já está lido", async () => {
      const u = await local.criarUsuario("repo");
      const memoria = criarGerenciador<LinhaAvisoLido>({ tabela: "avisos_lidos", obterCliente: () => u.cliente });
      const repo = criarRepoAvisos({ obterCliente: () => u.cliente, memoria, online: () => true });
      memoria.assinar(() => {});
      await new Promise((r) => setTimeout(r, 1_500));

      const c1 = chave();
      expect(await repo.marcarUm(c1)).toEqual({ ok: true });
      const c2 = chave();
      const c3 = chave({ tipo: "fechamento", referencia: "2026-11", dia: "2026-10-28" });
      // "Marcar tudo": um pedido só; o c1 já está lido e é ignorado.
      expect(await repo.marcar([c1, c2, c3])).toEqual({ ok: true });
      // Marcar de novo não erra nem duplica.
      expect(await repo.marcar([c1, c2, c3])).toEqual({ ok: true });

      const { data } = await u.cliente.from("avisos_lidos").select();
      expect(data!.map((l) => `${l.tipo}|${l.referencia}|${l.dia}`).sort()).toEqual(
        [c1, c2, c3].map((c) => `${c.tipo}|${c.referencia}|${c.dia}`).sort(),
      );
      // As linhas da memória são as do banco (o `id` que o cliente sorteou é o que ficou).
      expect(memoria.linhas().map((l) => l.id).sort()).toEqual(data!.map((l) => l.id).sort());
      expect(memoria.linhas().every((l) => l.owner_id === u.id)).toBe(true);
    });

    it("outro aparelho do mesmo dono vê o lido pela leitura do gerenciador", async () => {
      const u = await local.criarUsuario("repo2");
      const c = chave();
      expect((await u.cliente.from("avisos_lidos").insert(c)).error).toBeNull();
      const outroAparelho = await local.entrar(u.email, u.senha);
      const memoria = criarGerenciador<LinhaAvisoLido>({ tabela: "avisos_lidos", obterCliente: () => outroAparelho });
      memoria.assinar(() => {});
      await new Promise((r) => setTimeout(r, 1_500));
      expect(memoria.retrato().status).toBe("pronto");
      expect(memoria.linhas().map((l) => l.referencia)).toEqual([c.referencia]);
      await outroAparelho.removeAllChannels();
    });
  });
});
