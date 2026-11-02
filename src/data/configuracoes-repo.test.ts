import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { criarRepoConfiguracoes, type LinhaConfiguracoes } from "./configuracoes-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";

type Chamada = { tabela: string; corpo: unknown; opcoes: unknown };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

const linha = (extra: Partial<LinhaConfiguracoes> = {}): LinhaConfiguracoes => ({
  id: "cfg",
  owner_id: "dono",
  status_padrao_id: null,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

function montar(
  iniciais: LinhaConfiguracoes[],
  responder: (c: Chamada) => { data: unknown; error: unknown },
) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: iniciais, error: null }),
      upsert: (corpo: unknown, opcoes: unknown) => {
        const c = { tabela, corpo, opcoes };
        chamadas.push(c);
        const encadeada = { select: () => encadeada, single: async () => responder(c) };
        return encadeada;
      },
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
  const memoria = criarGerenciador<LinhaConfiguracoes>({
    tabela: "configuracoes",
    obterCliente: () => cliente,
  });
  const repo = criarRepoConfiguracoes({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

describe("repositório de Configurações", () => {
  it("sem linha, cria por upsert em owner_id e aplica a resposta", async () => {
    const m = montar([], (c) => ({ data: linha(c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.definirStatusPadrao("pago")).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      { tabela: "configuracoes", corpo: { status_padrao_id: "pago" }, opcoes: { onConflict: "owner_id" } },
    ]);
    expect(m.memoria.linha("cfg")?.status_padrao_id).toBe("pago");
  });

  it("com linha, grava só o Status padrão com otimismo", async () => {
    const m = montar([linha({ status_padrao_id: "pago" })], (c) => ({
      data: linha({ ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.definirStatusPadrao(null)).toEqual({ ok: true });
    expect(m.chamadas.map((c) => c.corpo)).toEqual([{ status_padrao_id: null }]);
    expect(m.memoria.linha("cfg")).toMatchObject({ status_padrao_id: null, updated_at: T2 });
  });

  it("o mesmo padrão não chama o banco", async () => {
    const m = montar([linha({ status_padrao_id: "pago" })], () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.definirStatusPadrao("pago")).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);
  });

  it("recusa do banco volta o padrão anterior", async () => {
    const m = montar([linha({ status_padrao_id: "pago" })], () => ({
      data: null,
      error: { code: "23503" },
    }));
    await pronto(m);
    const gravacao = m.repo.definirStatusPadrao("outro");
    expect(m.memoria.linha("cfg")?.status_padrao_id).toBe("outro"); // otimista
    expect(await gravacao).toEqual({ ok: false });
    expect(m.memoria.linha("cfg")?.status_padrao_id).toBe("pago");
  });

  it("sem linha, recusa ou exceção não criam nada", async () => {
    const recusa = montar([], () => ({ data: null, error: { code: "42501" } }));
    await pronto(recusa);
    expect(await recusa.repo.definirStatusPadrao("pago")).toEqual({ ok: false });
    expect(recusa.memoria.linhas()).toEqual([]);

    const excecao = montar([], () => {
      throw new Error("rede caiu");
    });
    await pronto(excecao);
    expect(await excecao.repo.definirStatusPadrao("pago")).toEqual({ ok: false });

    const semCliente = criarRepoConfiguracoes({ obterCliente: () => null, memoria: recusa.memoria });
    expect(await semCliente.definirStatusPadrao("pago")).toEqual({ ok: false });
  });
});
