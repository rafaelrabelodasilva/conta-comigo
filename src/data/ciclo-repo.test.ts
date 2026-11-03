import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { criarRepoCiclo, type LinhaConfigCiclo } from "./ciclo-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";

type Chamada = { tipo: string; tabela: string; corpo: unknown };

const T1 = "2026-11-02T12:00:00+00:00";

const linha = (id: string, extra: Partial<LinhaConfigCiclo> = {}): LinhaConfigCiclo => ({
  id,
  owner_id: "dono",
  dia_fechamento: 28,
  dia_vencimento: 6,
  vigente_desde: "2026-12",
  created_at: T1,
  updated_at: T1,
  ...extra,
});

function montar(iniciais: LinhaConfigCiclo[], responder: (c: Chamada) => { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: iniciais, error: null }),
      insert: (corpo: unknown) => {
        const c = { tipo: "insert", tabela, corpo };
        chamadas.push(c);
        const encadeada = { select: () => encadeada, single: async () => responder(c) };
        return encadeada;
      },
      update: () => {
        throw new Error("config_ciclo é só de inserção");
      },
      delete: () => {
        throw new Error("config_ciclo é só de inserção");
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
  const memoria = criarGerenciador<LinhaConfigCiclo>({ tabela: "config_ciclo", obterCliente: () => cliente });
  const repo = criarRepoCiclo({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

describe("repositório do Ciclo", () => {
  it("insere só os dias e o vigente_desde e aplica a linha devolvida; a antiga fica igual", async () => {
    const antiga = linha("a");
    const m = montar([antiga], (c) => ({
      data: linha("b", { ...(c.corpo as object), created_at: "2026-11-02T13:00:00+00:00" }),
      error: null,
    }));
    await pronto(m);
    const r = await m.repo.inserir({ dia_fechamento: 5, dia_vencimento: 15, vigente_desde: "2027-01" });
    expect(r).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      {
        tipo: "insert",
        tabela: "config_ciclo",
        corpo: { dia_fechamento: 5, dia_vencimento: 15, vigente_desde: "2027-01" },
      },
    ]);
    expect(m.memoria.linha("b")).toMatchObject({ dia_fechamento: 5, vigente_desde: "2027-01" });
    expect(m.memoria.linha("a")).toEqual(antiga);
  });

  it("recusa do banco, exceção ou sem cliente não mudam a memória", async () => {
    const recusa = montar([], () => ({ data: null, error: { message: "ciclo.vigente_no_passado" } }));
    await pronto(recusa);
    expect(
      await recusa.repo.inserir({ dia_fechamento: 5, dia_vencimento: 15, vigente_desde: "2020-01" }),
    ).toEqual({ ok: false, codigo: "ciclo.vigente_no_passado" });
    expect(recusa.memoria.linhas()).toEqual([]);

    const outra = montar([], () => ({ data: null, error: { message: "new row violates check", code: "23514" } }));
    await pronto(outra);
    expect(
      await outra.repo.inserir({ dia_fechamento: 0, dia_vencimento: 15, vigente_desde: "2027-01" }),
    ).toEqual({ ok: false, codigo: "salvar.falhou" });

    const excecao = montar([], () => {
      throw new Error("rede caiu");
    });
    await pronto(excecao);
    expect(
      await excecao.repo.inserir({ dia_fechamento: 5, dia_vencimento: 15, vigente_desde: "2027-01" }),
    ).toEqual({ ok: false, codigo: "salvar.falhou" });

    const semCliente = criarRepoCiclo({ obterCliente: () => null, memoria: recusa.memoria });
    expect(
      await semCliente.inserir({ dia_fechamento: 5, dia_vencimento: 15, vigente_desde: "2027-01" }),
    ).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});

describe("Ciclo sem conexão", () => {
  it("inserir não chama o cliente", async () => {
    const m = montar([], () => ({ data: null, error: null }));
    await pronto(m);
    const obterCliente = vi.fn();
    const offline = criarRepoCiclo({ obterCliente, memoria: m.memoria, online: () => false });
    expect(
      await offline.inserir({ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-12" }),
    ).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(obterCliente).not.toHaveBeenCalled();
    expect(m.chamadas).toEqual([]);
    expect(m.memoria.linhas()).toEqual([]);
  });
});
