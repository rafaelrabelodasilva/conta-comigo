import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import type { EventoAprender } from "@/domain/regras";
import { criarRepoRegras, type LinhaRegra } from "./regras-repo";

// Cliente falso de `regras`: uma tabela em memória com o upsert por chave.
// Cada leitura e cada upsert esperam um tique, para provar a fila por chave.

const AGORA = new Date("2026-11-09T12:00:00.000Z");
const tique = () => new Promise((r) => setTimeout(r, 0));

function montar(opcoes: { falharLeitura?: boolean; falharUpsert?: boolean; linhas?: number } = {}) {
  const tabela = new Map<string, LinhaRegra>();
  for (let i = 0; i < (opcoes.linhas ?? 0); i++) {
    const chave = `CHAVE ${String(i).padStart(5, "0")}`;
    tabela.set(chave, { chave } as LinhaRegra);
  }
  const upserts: { corpo: Record<string, unknown>; onConflict?: string }[] = [];
  const intervalos: [number, number][] = [];
  const leituras: string[] = [];
  const cliente = {
    from: () => ({
      select: () => ({
        eq: (_c: string, chave: string) => ({
          maybeSingle: async () => {
            leituras.push(chave);
            await tique();
            if (opcoes.falharLeitura) return { data: null, error: { code: "x" } };
            return { data: tabela.get(chave) ?? null, error: null };
          },
        }),
        order: () => ({
          range: async (de: number, ate: number) => {
            intervalos.push([de, ate]);
            if (opcoes.falharLeitura) return { data: null, error: { code: "x" } };
            return { data: [...tabela.values()].slice(de, ate + 1), error: null };
          },
        }),
      }),
      upsert: (corpo: Record<string, unknown>, o: { onConflict?: string }) => ({
        select: () => ({
          single: async () => {
            await tique();
            upserts.push({ corpo, onConflict: o.onConflict });
            if (opcoes.falharUpsert) return { data: null, error: { code: "x" } };
            const linha = { ...(tabela.get(corpo.chave as string) ?? {}), ...corpo } as LinhaRegra;
            tabela.set(corpo.chave as string, linha);
            return { data: linha, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  const repo = criarRepoRegras({ obterCliente: () => cliente, agora: () => AGORA });
  return { repo, tabela, upserts, intervalos, leituras };
}

describe("repositório de Regras", () => {
  it("aprender cria a Regra da chave com a contagem e o último uso, por upsert owner_id,chave", async () => {
    const m = montar();
    const r = await m.repo.aprender({
      nome: "DM*SPOTIFY P4750",
      responsavelAntes: null,
      responsavelDepois: "rafael",
      tipoDepois: "musica",
    });
    expect(r.ok).toBe(true);
    expect(m.upserts).toEqual([
      {
        corpo: {
          chave: "SPOTIFY",
          versao_normalizacao: 1,
          responsavel_id: "rafael",
          tipo_id: "musica",
          contagem: [{ responsavel_id: "rafael", n: 1 }],
          ultimo_uso: "2026-11-09T12:00:00.000Z",
        },
        onConflict: "owner_id,chave",
      },
    ]);
  });

  it("fila por chave: duas classificações seguidas não perdem incremento", async () => {
    const m = montar();
    await Promise.all([
      m.repo.aprender({ nome: "EBN SPOTIFY", responsavelAntes: null, responsavelDepois: "rafael", tipoDepois: null }),
      m.repo.aprender({ nome: "DM*SPOTIFY", responsavelAntes: null, responsavelDepois: "rafael", tipoDepois: null }),
      m.repo.aprender({ nome: "SPOTIFY", responsavelAntes: "rafael", responsavelDepois: "mae", tipoDepois: "musica" }),
    ]);
    expect(m.tabela.get("SPOTIFY")).toMatchObject({
      responsavel_id: "mae",
      tipo_id: "musica",
      // Só soma (6-A): as duas escolhas de Rafael contam e a troca para Mãe soma 1 a ela.
      contagem: [
        { responsavel_id: "rafael", n: 2 },
        { responsavel_id: "mae", n: 1 },
      ],
    });
  });

  it("lista de eventos (lote): uma leitura e um upsert por chave; três SHOPEE do Casal somam 3", async () => {
    const m = montar();
    const e = (nome: string, depois: string): EventoAprender => ({ nome, responsavelAntes: null, responsavelDepois: depois, tipoDepois: "casa" });
    const r = await m.repo.aprender([e("SHOPEE X", "casal"), e("SHOPEE X", "casal"), e("SHOPEE Y", "casal"), e("AMAZON Z", "rafael")]);
    expect(r.ok && r.regras.map((x) => x.chave).sort()).toEqual(["AMAZON Z", "SHOPEE X", "SHOPEE Y"]);
    expect(m.leituras.sort()).toEqual(["AMAZON Z", "SHOPEE X", "SHOPEE Y"]);
    expect(m.upserts).toHaveLength(3);
    expect(m.tabela.get("SHOPEE X")).toMatchObject({ contagem: [{ responsavel_id: "casal", n: 2 }], tipo_id: "casa" });
    expect(m.tabela.get("AMAZON Z")).toMatchObject({ contagem: [{ responsavel_id: "rafael", n: 1 }] });
  });

  it("lote: nomes diferentes com a mesma chave somam na mesma Regra", async () => {
    const m = montar();
    const e = (nome: string): EventoAprender => ({ nome, responsavelAntes: null, responsavelDepois: "casal", tipoDepois: null });
    await m.repo.aprender([e("DM*SPOTIFY P4750"), e("EBN SPOTIFY"), e("SPOTIFY")]);
    expect(m.upserts).toHaveLength(1);
    expect(m.tabela.get("SPOTIFY")).toMatchObject({ contagem: [{ responsavel_id: "casal", n: 3 }] });
  });

  it("lote e toque seguem a fila da chave: nenhum incremento se perde", async () => {
    const m = montar();
    const e = (antes: string | null): EventoAprender => ({ nome: "SHOPEE", responsavelAntes: antes, responsavelDepois: "casal", tipoDepois: null });
    await Promise.all([m.repo.aprender([e(null), e(null)]), m.repo.aprender(e(null)), m.repo.aprender([e(null)])]);
    expect(m.tabela.get("SHOPEE")).toMatchObject({ contagem: [{ responsavel_id: "casal", n: 4 }] });
  });

  it("lote: se uma chave falha, ok: false; as outras gravaram; lista vazia não grava", async () => {
    const falha = montar({ falharUpsert: true });
    expect(await falha.repo.aprender([{ nome: "X", responsavelAntes: null, responsavelDepois: "a", tipoDepois: null }])).toEqual({ ok: false });
    const vazio = montar();
    expect(await vazio.repo.aprender([])).toEqual({ ok: true, regras: [] });
    expect(vazio.upserts).toEqual([]);
  });

  it("falha na leitura ou no upsert devolve ok: false, sem lançar; a fila continua", async () => {
    const leitura = montar({ falharLeitura: true });
    expect(
      await leitura.repo.aprender({ nome: "X", responsavelAntes: null, responsavelDepois: "a", tipoDepois: null }),
    ).toEqual({ ok: false });
    expect(leitura.upserts).toEqual([]);
    const upsert = montar({ falharUpsert: true });
    expect(await upsert.repo.aprender({ nome: "X", responsavelAntes: null, responsavelDepois: "a", tipoDepois: null })).toEqual({
      ok: false,
    });
    expect(await upsert.repo.aprender({ nome: "X", responsavelAntes: null, responsavelDepois: "b", tipoDepois: null })).toEqual({
      ok: false,
    });
    expect(upsert.upserts).toHaveLength(2);
  });

  it("sem cliente, ok: false", async () => {
    const repo = criarRepoRegras({ obterCliente: () => null });
    expect(await repo.aprender({ nome: "X", responsavelAntes: null, responsavelDepois: null, tipoDepois: null })).toEqual({ ok: false });
    expect(await repo.listar()).toEqual({ ok: false });
  });

  it("listar lê em páginas de 1000 até a última", async () => {
    const m = montar({ linhas: 1500 });
    const r = await m.repo.listar();
    expect(r.ok && r.regras).toHaveLength(1500);
    expect(m.intervalos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(await montar({ falharLeitura: true }).repo.listar()).toEqual({ ok: false });
  });
});
