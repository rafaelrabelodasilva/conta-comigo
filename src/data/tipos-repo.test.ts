import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";
import { criarRepoTipos, type LinhaTipo } from "./tipos-repo";

// Cliente falso: registra o corpo de cada chamada e responde o que o teste mandar.

type Chamada = { tipo: "insert" | "update"; tabela: string; corpo: unknown; id?: string };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

const linha = (id: string, extra: Partial<LinhaTipo> = {}): LinhaTipo => ({
  id,
  owner_id: "dono",
  nome: id,
  arquivado: false,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

function montar(iniciais: LinhaTipo[], responder: (c: Chamada) => { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = [];
  const consulta = (c: Chamada) => {
    const encadeada = {
      eq(_coluna: string, valor: string) {
        c.id = valor;
        return encadeada;
      },
      select: () => encadeada,
      single: async () => responder(c),
    };
    chamadas.push(c);
    return encadeada;
  };
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: iniciais, error: null }),
      insert: (corpo: unknown) => consulta({ tipo: "insert", tabela, corpo }),
      update: (corpo: unknown) => consulta({ tipo: "update", tabela, corpo }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe(cb: (s: string) => void) {
        cb("SUBSCRIBED");
        return this;
      },
    }),
  } as unknown as SupabaseClient<Database>;

  const memoria = criarGerenciador<LinhaTipo>({ tabela: "tipos", obterCliente: () => cliente });
  const repo = criarRepoTipos({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(m.memoria.retrato().status).toBe("pronto");
}

describe("repositório de Tipos", () => {
  it("criar manda só o nome, na tabela tipos", async () => {
    const m = montar([], (c) => ({ data: linha("novo", c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.criar({ nome: "Casa" })).toEqual({ ok: true });
    expect(m.chamadas).toEqual([{ tipo: "insert", tabela: "tipos", corpo: { nome: "Casa" } }]);
    expect(m.memoria.linha("novo")?.nome).toBe("Casa");
  });

  it("criar recusado não muda a memória", async () => {
    const m = montar([], () => ({ data: null, error: { code: "23514" } }));
    await pronto(m);
    expect(await m.repo.criar({ nome: "Casa" })).toEqual({ ok: false });
    expect(m.memoria.linhas()).toEqual([]);
  });

  it("renomear manda só o nome", async () => {
    const m = montar([linha("a", { nome: "Casa" })], (c) => ({
      data: linha("a", { ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.atualizar("a", { nome: "Lar", arquivado: false })).toEqual({ ok: true });
    expect(m.chamadas).toEqual([{ tipo: "update", tabela: "tipos", corpo: { nome: "Lar" }, id: "a" }]);
    expect(m.memoria.linha("a")?.updated_at).toBe(T2);
  });

  it("sem mudança, não chama o banco", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.atualizar("a", { nome: "a" })).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);
  });

  it("arquivar e desarquivar mandam só arquivado", async () => {
    let segundo = 0;
    const m = montar([linha("a")], (c) => ({
      data: linha("a", { ...(c.corpo as object), updated_at: `2026-11-02T12:01:0${++segundo}+00:00` }),
      error: null,
    }));
    await pronto(m);
    await m.repo.arquivar("a");
    expect(m.memoria.linha("a")?.arquivado).toBe(true);
    await m.repo.desarquivar("a");
    expect(m.chamadas.map((c) => c.corpo)).toEqual([{ arquivado: true }, { arquivado: false }]);
    expect(m.memoria.linha("a")?.arquivado).toBe(false);
  });

  it("recusa do banco desfaz o otimismo", async () => {
    const m = montar([linha("a", { nome: "Casa" })], () => ({ data: null, error: { code: "23514" } }));
    await pronto(m);
    const gravacao = m.repo.arquivar("a");
    expect(m.memoria.linha("a")?.arquivado).toBe(true); // otimista
    expect(await gravacao).toEqual({ ok: false });
    expect(m.memoria.linha("a")?.arquivado).toBe(false);
  });

  it("sem cliente, criar e atualizar falham sem mexer na memória", async () => {
    const m = montar([linha("a", { nome: "Casa" })], () => ({ data: null, error: null }));
    await pronto(m);
    const semCliente = criarRepoTipos({ obterCliente: () => null, memoria: m.memoria });
    expect(await semCliente.criar({ nome: "Gatos" })).toEqual({ ok: false });
    expect(await semCliente.atualizar("a", { nome: "Lar" })).toEqual({ ok: false });
    expect(m.memoria.linha("a")?.nome).toBe("Casa");
    expect(m.memoria.linhas()).toHaveLength(1);
    expect(m.chamadas).toEqual([]);
  });

  it("atualizar id fora da memória falha sem chamar o banco", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.atualizar("nao-existe", { nome: "Lar" })).toEqual({ ok: false });
    expect(m.chamadas).toEqual([]);
  });

  it("cliente que lança desfaz o otimismo; criar que lança falha", async () => {
    const m = montar([linha("a", { nome: "Casa" })], () => {
      throw new Error("rede caiu");
    });
    await pronto(m);
    const gravacao = m.repo.atualizar("a", { nome: "Lar" });
    expect(m.memoria.linha("a")?.nome).toBe("Lar"); // otimista
    expect(await gravacao).toEqual({ ok: false });
    expect(m.memoria.linha("a")?.nome).toBe("Casa");
    expect(await m.repo.criar({ nome: "Gatos" })).toEqual({ ok: false });
    expect(m.memoria.linhas()).toHaveLength(1);
  });
});
