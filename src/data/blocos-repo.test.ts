import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { BlocoParaGravar } from "@/domain/blocos";
import { criarRepoBlocos, type LinhaBlocoBanco } from "./blocos-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";

// Cliente falso: registra a chamada da RPC e responde o que o teste mandar.

const T1 = "2026-11-21T12:00:00+00:00";
const T2 = "2026-11-21T12:00:05+00:00";

const linha = (id: string, extra: Partial<LinhaBlocoBanco> = {}): LinhaBlocoBanco => ({
  id,
  owner_id: "dono",
  nome: id,
  formula: { tipo: "todos" },
  ordem: 1,
  de_cobranca: false,
  meu_bloco: false,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

const pedido = (extra: Partial<BlocoParaGravar> = {}): BlocoParaGravar => ({
  p_id: null,
  p_nome: "Rangel",
  p_formula: { tipo: "todos" },
  p_ordem: 1,
  p_de_cobranca: false,
  p_meu_bloco: false,
  ...extra,
});

function montar(
  iniciais: LinhaBlocoBanco[],
  responder: () => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
  online = true,
) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  const cliente = {
    from: () => ({ select: async () => ({ data: iniciais, error: null }) }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return responder();
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
  const memoria = criarGerenciador<LinhaBlocoBanco>({ tabela: "blocos", obterCliente: () => cliente });
  const repo = criarRepoBlocos({ obterCliente: () => cliente, memoria, online: () => online });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(m.memoria.retrato().status).toBe("pronto");
}

describe("repositório de Blocos", () => {
  it("cria pela RPC (sem p_id) e aplica a linha devolvida", async () => {
    const m = montar([], () => ({ data: [linha("novo", { nome: "Rangel" })], error: null }));
    await pronto(m);
    expect(await m.repo.salvar(pedido())).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      {
        nome: "salvar_bloco",
        args: { p_nome: "Rangel", p_formula: { tipo: "todos" }, p_ordem: 1, p_de_cobranca: false, p_meu_bloco: false },
      },
    ]);
    expect(m.memoria.linha("novo")?.nome).toBe("Rangel");
  });

  it("altera mandando p_id", async () => {
    const m = montar([linha("a")], () => ({ data: [linha("a", { nome: "Novo", updated_at: T2 })], error: null }));
    await pronto(m);
    await m.repo.salvar(pedido({ p_id: "a", p_nome: "Novo" }));
    expect(m.chamadas[0].args).toMatchObject({ p_id: "a", p_nome: "Novo" });
    expect(m.memoria.linha("a")?.nome).toBe("Novo");
  });

  it('"É o meu Bloco": aplica o salvo e o que perdeu a marca', async () => {
    const m = montar([linha("velho", { meu_bloco: true })], () => ({
      data: [linha("novo", { meu_bloco: true, updated_at: T2 }), linha("velho", { meu_bloco: false, updated_at: T2 })],
      error: null,
    }));
    await pronto(m);
    await m.repo.salvar(pedido({ p_meu_bloco: true }));
    expect(m.memoria.linha("velho")?.meu_bloco).toBe(false);
    expect(m.memoria.linha("novo")?.meu_bloco).toBe(true);
  });

  it("recusa do banco: falha e nada muda na memória", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: { code: "23514" } }));
    await pronto(m);
    expect(await m.repo.salvar(pedido())).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linhas()).toHaveLength(1);
  });

  it("falha de rede (lançou): falha", async () => {
    const m = montar([], () => Promise.reject(new Error("caiu")));
    await pronto(m);
    expect(await m.repo.salvar(pedido())).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("sem conexão, nada é chamado", async () => {
    const m = montar([], () => ({ data: [], error: null }), false);
    await pronto(m);
    expect(await m.repo.salvar(pedido())).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.chamadas).toEqual([]);
  });
});
