import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";
import { criarRepoResponsaveis, type LinhaResponsavel } from "./responsaveis-repo";

// Cliente falso: registra o corpo de cada chamada e responde o que o teste mandar.

type Chamada = { tipo: "insert" | "update" | "rpc"; corpo: unknown; id?: string };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

const linha = (id: string, extra: Partial<LinhaResponsavel> = {}): LinhaResponsavel => ({
  id,
  owner_id: "dono",
  nome: id,
  cor: 1,
  ordem: 1,
  arquivado: false,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

function montar(iniciais: LinhaResponsavel[], responder: (c: Chamada) => { data: unknown; error: unknown }) {
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
    from: () => ({
      select: async () => ({ data: iniciais, error: null }),
      insert: (corpo: unknown) => consulta({ tipo: "insert", corpo }),
      update: (corpo: unknown) => consulta({ tipo: "update", corpo }),
    }),
    rpc: async (_nome: string, corpo: unknown) => {
      const c: Chamada = { tipo: "rpc", corpo };
      chamadas.push(c);
      return responder(c);
    },
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

  const memoria = criarGerenciador<LinhaResponsavel>({
    tabela: "responsaveis",
    obterCliente: () => cliente,
  });
  const repo = criarRepoResponsaveis({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(m.memoria.retrato().status).toBe("pronto");
}

describe("repositório de Responsáveis", () => {
  it("o corpo leva só as colunas alteradas", async () => {
    const m = montar([linha("a", { nome: "Rafael", cor: 1 })], () => ({
      data: linha("a", { nome: "Rafael", cor: 4, updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    const r = await m.repo.atualizar("a", { nome: "Rafael", cor: 4 });
    expect(r).toEqual({ ok: true });
    expect(m.chamadas).toEqual([{ tipo: "update", corpo: { cor: 4 }, id: "a" }]);
    expect(m.memoria.linha("a")?.updated_at).toBe(T2);
  });

  it("sem mudança, não chama o banco", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.atualizar("a", { nome: "a" })).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);
  });

  it("criar não manda updated_at nem owner_id", async () => {
    const m = montar([], (c) => ({ data: linha("novo", c.corpo as object), error: null }));
    await pronto(m);
    await m.repo.criar({ nome: "Lucas", cor: 4, ordem: 1 });
    expect(m.chamadas[0].corpo).toEqual({ nome: "Lucas", cor: 4, ordem: 1 });
    expect(m.memoria.linha("novo")?.nome).toBe("Lucas");
  });

  it("recusa do banco desfaz o otimismo", async () => {
    const m = montar([linha("a", { nome: "Rafael" })], () => ({
      data: null,
      error: { code: "23514" },
    }));
    await pronto(m);
    const gravacao = m.repo.atualizar("a", { nome: "Rafa" });
    expect(m.memoria.linha("a")?.nome).toBe("Rafa"); // otimista
    expect(await gravacao).toEqual({ ok: false });
    expect(m.memoria.linha("a")?.nome).toBe("Rafael");
  });

  it("reordenar manda os ids pela RPC e aplica as linhas devolvidas", async () => {
    const m = montar(
      [linha("a", { ordem: 1 }), linha("b", { ordem: 2, cor: 2 })],
      () => ({
        data: [linha("b", { ordem: 1, cor: 2, updated_at: T2 }), linha("a", { ordem: 2, updated_at: T2 })],
        error: null,
      }),
    );
    await pronto(m);
    expect(await m.repo.reordenar(["b", "a"])).toEqual({ ok: true });
    expect(m.chamadas).toEqual([{ tipo: "rpc", corpo: { ids: ["b", "a"] } }]);
    expect(m.memoria.linha("b")?.ordem).toBe(1);
  });

  it("desarquivar grava arquivado e a ordem nova", async () => {
    const m = montar([linha("a", { arquivado: true, ordem: 1 })], (c) => ({
      data: linha("a", { ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    await m.repo.desarquivar("a", 5);
    expect(m.chamadas[0].corpo).toEqual({ arquivado: false, ordem: 5 });
  });
});
