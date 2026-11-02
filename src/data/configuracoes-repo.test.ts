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
  aparencia: "sistema",
  limite_ajuste_centavos: 100,
  tolerancia_atraso_dias: 10,
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

  it("Aparência e Conferência gravam só as colunas alteradas", async () => {
    const m = montar([linha()], (c) => ({
      data: linha({ ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.definirAparencia("escuro")).toEqual({ ok: true });
    expect(await m.repo.definirConferencia({ limite_ajuste_centavos: 150, tolerancia_atraso_dias: 10 })).toEqual({
      ok: true,
    });
    expect(await m.repo.definirConferencia({ limite_ajuste_centavos: 200, tolerancia_atraso_dias: 15 })).toEqual({
      ok: true,
    });
    expect(m.chamadas.map((c) => c.corpo)).toEqual([
      { aparencia: "escuro" },
      { limite_ajuste_centavos: 150 },
      { limite_ajuste_centavos: 200, tolerancia_atraso_dias: 15 },
    ]);
    expect(m.chamadas.every((c) => (c.opcoes as { onConflict: string }).onConflict === "owner_id")).toBe(true);
  });

  it("sem linha, a Conferência cria a linha num só upsert com as duas colunas", async () => {
    const m = montar([], (c) => ({ data: linha(c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.definirConferencia({ limite_ajuste_centavos: 150, tolerancia_atraso_dias: 15 })).toEqual({
      ok: true,
    });
    expect(m.chamadas.map((c) => c.corpo)).toEqual([{ limite_ajuste_centavos: 150, tolerancia_atraso_dias: 15 }]);
    expect(m.memoria.linha("cfg")).toMatchObject({ limite_ajuste_centavos: 150, tolerancia_atraso_dias: 15 });
  });

  it("sem linha, a Aparência cria a linha só com ela (o resto fica com o padrão do banco)", async () => {
    const m = montar([], (c) => ({ data: linha(c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.definirAparencia("claro")).toEqual({ ok: true });
    expect(m.chamadas.map((c) => c.corpo)).toEqual([{ aparencia: "claro" }]);
    expect(m.memoria.linha("cfg")?.aparencia).toBe("claro");
  });

  it("valor igual não chama o banco; recusa volta o anterior", async () => {
    const m = montar([linha({ aparencia: "escuro" })], () => ({ data: null, error: { code: "23514" } }));
    await pronto(m);
    expect(await m.repo.definirAparencia("escuro")).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);

    const gravacao = m.repo.definirConferencia({ limite_ajuste_centavos: 5000, tolerancia_atraso_dias: 20 });
    expect(m.memoria.linha("cfg")).toMatchObject({ limite_ajuste_centavos: 5000, tolerancia_atraso_dias: 20 }); // otimista
    expect(await gravacao).toEqual({ ok: false });
    // Um só desfazer: as duas colunas voltam juntas.
    expect(m.memoria.linha("cfg")).toMatchObject({ limite_ajuste_centavos: 100, tolerancia_atraso_dias: 10 });
    expect(m.chamadas).toHaveLength(1);
  });
});
