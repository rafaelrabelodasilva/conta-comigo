import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { criarRepoConfiguracoes, type LinhaConfiguracoes } from "./configuracoes-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";

type Chamada = { tabela: string; corpo: unknown; opcoes: unknown };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";
const AGORA = "2026-11-02T15:30:00.000Z";

const linha = (extra: Partial<LinhaConfiguracoes> = {}): LinhaConfiguracoes => ({
  id: "cfg",
  owner_id: "dono",
  status_padrao_id: null,
  aparencia: "sistema",
  limite_ajuste_centavos: 100,
  tolerancia_atraso_dias: 10,
  primeiro_uso_em: null,
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
  const repo = criarRepoConfiguracoes({ obterCliente: () => cliente, memoria, agora: () => new Date(AGORA) });
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
    expect(await gravacao).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("cfg")?.status_padrao_id).toBe("pago");
  });

  it("sem linha, recusa ou exceção não criam nada", async () => {
    const recusa = montar([], () => ({ data: null, error: { code: "42501" } }));
    await pronto(recusa);
    expect(await recusa.repo.definirStatusPadrao("pago")).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(recusa.memoria.linhas()).toEqual([]);

    const excecao = montar([], () => {
      throw new Error("rede caiu");
    });
    await pronto(excecao);
    expect(await excecao.repo.definirStatusPadrao("pago")).toEqual({ ok: false, codigo: "salvar.falhou" });

    const semCliente = criarRepoConfiguracoes({ obterCliente: () => null, memoria: recusa.memoria });
    expect(await semCliente.definirStatusPadrao("pago")).toEqual({ ok: false, codigo: "salvar.falhou" });
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
    expect(await gravacao).toEqual({ ok: false, codigo: "salvar.falhou" });
    // Um só desfazer: as duas colunas voltam juntas.
    expect(m.memoria.linha("cfg")).toMatchObject({ limite_ajuste_centavos: 100, tolerancia_atraso_dias: 10 });
    expect(m.chamadas).toHaveLength(1);
  });

  it("concluir o Primeiro uso sem linha cria a linha só com a marca", async () => {
    const m = montar([], (c) => ({ data: linha(c.corpo as object), error: null }));
    await pronto(m);
    expect(await m.repo.concluirPrimeiroUso()).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      { tabela: "configuracoes", corpo: { primeiro_uso_em: AGORA }, opcoes: { onConflict: "owner_id" } },
    ]);
    expect(m.memoria.linha("cfg")?.primeiro_uso_em).toBe(AGORA);
  });

  it("concluir o Primeiro uso com linha grava só a marca; recusa volta a nula", async () => {
    const ok = montar([linha({ aparencia: "escuro" })], (c) => ({
      data: linha({ aparencia: "escuro", ...(c.corpo as object), updated_at: T2 }),
      error: null,
    }));
    await pronto(ok);
    expect(await ok.repo.concluirPrimeiroUso()).toEqual({ ok: true });
    expect(ok.chamadas.map((c) => c.corpo)).toEqual([{ primeiro_uso_em: AGORA }]);
    expect(ok.memoria.linha("cfg")).toMatchObject({ primeiro_uso_em: AGORA, aparencia: "escuro" });

    const recusa = montar([linha()], () => ({ data: null, error: { code: "42501" } }));
    await pronto(recusa);
    expect(await recusa.repo.concluirPrimeiroUso()).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(recusa.memoria.linha("cfg")?.primeiro_uso_em).toBeNull();
  });
});

describe("Configurações sem conexão", () => {
  it("com ou sem linha, nada é gravado nem mostrado", async () => {
    for (const iniciais of [[], [linha()]]) {
      const m = montar(iniciais, () => ({ data: null, error: null }));
      await pronto(m);
      const obterCliente = vi.fn();
      const offline = criarRepoConfiguracoes({ obterCliente, memoria: m.memoria, online: () => false });
      const antes = m.memoria.retrato().linhas;
      expect(await offline.definirAparencia("escuro")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      expect(await offline.definirStatusPadrao("pago")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      expect(
        await offline.definirConferencia({ limite_ajuste_centavos: 200, tolerancia_atraso_dias: 5 }),
      ).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      expect(await offline.concluirPrimeiroUso()).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      expect(obterCliente).not.toHaveBeenCalled();
      expect(m.chamadas).toEqual([]);
      expect(m.memoria.retrato().linhas).toBe(antes);
    }
  });
});
