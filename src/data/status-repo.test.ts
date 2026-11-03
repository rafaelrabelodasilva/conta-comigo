import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";
import { criarRepoStatus, type LinhaStatus } from "./status-repo";

// Cliente falso: registra o corpo de cada chamada e responde o que o teste mandar.

type Chamada = { tipo: "insert" | "update"; tabela: string; corpo: unknown; id?: string };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

const linha = (id: string, extra: Partial<LinhaStatus> = {}): LinhaStatus => ({
  id,
  owner_id: "dono",
  nome: id,
  conta_como_pago: false,
  arquivado: false,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

function montar(iniciais: LinhaStatus[], responder: (c: Chamada) => { data: unknown; error: unknown }) {
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

  const memoria = criarGerenciador<LinhaStatus>({ tabela: "status", obterCliente: () => cliente });
  const repo = criarRepoStatus({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(m.memoria.retrato().status).toBe("pronto");
}

describe("repositório de Status", () => {
  it("criar manda só o nome, na tabela status", async () => {
    const m = montar([], (c) => ({ data: linha("novo", c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.criar({ nome: "Pago" })).toEqual({ ok: true });
    expect(m.chamadas).toEqual([{ tipo: "insert", tabela: "status", corpo: { nome: "Pago" } }]);
    expect(m.memoria.linha("novo")).toMatchObject({ nome: "Pago", conta_como_pago: false });
  });

  it("conta como pago grava só essa coluna", async () => {
    const m = montar([linha("p", { nome: "Pago" })], (c) => ({
      data: linha("p", { nome: "Pago", ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.definirContaComoPago("p", true)).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      { tipo: "update", tabela: "status", corpo: { conta_como_pago: true }, id: "p" },
    ]);
    expect(m.memoria.linha("p")?.conta_como_pago).toBe(true);
  });

  it("renomear, arquivar e desarquivar mandam só a coluna mudada", async () => {
    let segundo = 0;
    const m = montar([linha("a")], (c) => ({
      data: linha("a", { ...(c.corpo as object), updated_at: `2026-11-02T12:01:0${++segundo}+00:00` }),
      error: null,
    }));
    await pronto(m);
    await m.repo.atualizar("a", { nome: "Pago", conta_como_pago: false });
    await m.repo.arquivar("a");
    await m.repo.desarquivar("a");
    expect(m.chamadas.map((c) => c.corpo)).toEqual([
      { nome: "Pago" },
      { arquivado: true },
      { arquivado: false },
    ]);
  });

  it("recusa do banco desfaz o otimismo", async () => {
    const m = montar([linha("p")], () => ({ data: null, error: { code: "42501" } }));
    await pronto(m);
    const gravacao = m.repo.definirContaComoPago("p", true);
    expect(m.memoria.linha("p")?.conta_como_pago).toBe(true); // otimista
    expect(await gravacao).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("p")?.conta_como_pago).toBe(false);
  });

  it("sem cliente, falha sem mexer na memória", async () => {
    const m = montar([linha("p")], () => ({ data: null, error: null }));
    await pronto(m);
    const semCliente = criarRepoStatus({ obterCliente: () => null, memoria: m.memoria });
    expect(await semCliente.criar({ nome: "Pago" })).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(await semCliente.definirContaComoPago("p", true)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("p")?.conta_como_pago).toBe(false);
    expect(m.chamadas).toEqual([]);
  });
});

describe("sem conexão", () => {
  it("nenhuma gravação começa: sem otimismo, sem chamar o cliente", async () => {
    const m = montar([linha("a", { nome: "Pago" })], () => ({ data: null, error: null }));
    await pronto(m);
    const obterCliente = vi.fn();
    const offline = criarRepoStatus({ obterCliente, memoria: m.memoria, online: () => false });
    const antes = m.memoria.retrato().linhas;
    expect(await offline.criar({ nome: "Pendente" })).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await offline.atualizar("a", { nome: "Outro" })).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await offline.arquivar("a")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await offline.desarquivar("a")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await offline.definirContaComoPago("a", true)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(obterCliente).not.toHaveBeenCalled();
    expect(m.chamadas).toEqual([]);
    expect(m.memoria.retrato().linhas).toBe(antes);
  });
});
