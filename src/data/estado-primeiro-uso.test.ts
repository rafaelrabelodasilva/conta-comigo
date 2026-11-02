import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { lerEstadoPrimeiroUso } from "./estado-primeiro-uso";

type Resposta = { data?: unknown; count?: number | null; error: unknown };

function cliente(respostas: Record<string, Resposta>, consultas: unknown[] = []) {
  return {
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: unknown) => {
        consultas.push({ tabela, colunas, opcoes });
        const r = respostas[tabela];
        if (tabela === "configuracoes") return { maybeSingle: async () => r };
        return Promise.resolve(r);
      },
    }),
  } as unknown as SupabaseClient<Database>;
}

const vazio = { count: 0, error: null };
const base = { configuracoes: { data: null, error: null }, responsaveis: vazio, tipos: vazio, status: vazio };
const MARCA = "2026-11-02T12:00:00+00:00";

describe("lerEstadoPrimeiroUso", () => {
  it("sem marca: lê a marca e conta os três cadastros só com head", async () => {
    const consultas: unknown[] = [];
    expect(await lerEstadoPrimeiroUso(cliente(base, consultas))).toEqual({
      ok: true,
      estado: { concluidoEm: null, temCadastro: false },
    });
    expect(consultas).toEqual([
      { tabela: "configuracoes", colunas: "primeiro_uso_em", opcoes: undefined },
      { tabela: "responsaveis", colunas: "id", opcoes: { count: "exact", head: true } },
      { tabela: "tipos", colunas: "id", opcoes: { count: "exact", head: true } },
      { tabela: "status", colunas: "id", opcoes: { count: "exact", head: true } },
    ]);
  });

  it("um Tipo basta para ter cadastro", async () => {
    expect(await lerEstadoPrimeiroUso(cliente({ ...base, tipos: { count: 1, error: null } }))).toEqual({
      ok: true,
      estado: { concluidoEm: null, temCadastro: true },
    });
  });

  it("com a marca preenchida, não faz as contagens", async () => {
    const consultas: unknown[] = [];
    const estado = await lerEstadoPrimeiroUso(
      cliente({ configuracoes: { data: { primeiro_uso_em: MARCA }, error: null } }, consultas),
    );
    expect(estado).toEqual({ ok: true, estado: { concluidoEm: MARCA, temCadastro: false } });
    expect(consultas).toHaveLength(1);
  });

  it("qualquer falha devolve só o código do erro", async () => {
    expect(
      await lerEstadoPrimeiroUso(cliente({ ...base, configuracoes: { data: null, error: { code: "42501" } } })),
    ).toEqual({ ok: false, codigo: "42501" });
    expect(await lerEstadoPrimeiroUso(cliente({ ...base, status: { count: null, error: null } }))).toEqual({
      ok: false,
      codigo: "sem_codigo",
    });
    expect(
      await lerEstadoPrimeiroUso(cliente({ ...base, tipos: { count: null, error: { code: "PGRST301", message: "x" } } })),
    ).toEqual({ ok: false, codigo: "PGRST301" });
    const quebrado = {
      from: () => {
        throw new Error("rede caiu");
      },
    } as unknown as SupabaseClient<Database>;
    expect(await lerEstadoPrimeiroUso(quebrado)).toEqual({ ok: false, codigo: "excecao" });
  });
});
