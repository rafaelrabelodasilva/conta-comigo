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
          divisao: null,
        },
        onConflict: "owner_id,chave",
      },
    ]);
  });

  it("História 3.8: aprender grava a Divisão em frações (sem filha_id); só limpar a Divisão de um Nome sem Regra não cria Regra", async () => {
    const m = montar();
    const divisao = {
      modo: "proporcao" as const,
      partes: [
        { responsavel_id: "mae", numerador: 2, denominador: 3, filha_id: "f1" },
        { responsavel_id: "rafael", numerador: 1, denominador: 3 },
      ],
    };
    const r = await m.repo.aprender({ nome: "JIM COM 5765", responsavelAntes: null, responsavelDepois: null, tipoDepois: "saude", divisao });
    expect(r.ok).toBe(true);
    expect(m.upserts[0].corpo).toMatchObject({
      chave: "JIM COM",
      tipo_id: "saude",
      contagem: [],
      divisao: {
        modo: "proporcao",
        partes: [
          { responsavel_id: "mae", numerador: 2, denominador: 3 },
          { responsavel_id: "rafael", numerador: 1, denominador: 3 },
        ],
      },
    });
    expect(JSON.stringify(m.upserts[0].corpo)).not.toContain("filha_id");
    const antes = m.upserts.length;
    const limpar = await m.repo.aprender({ nome: "OUTRO NOME", responsavelAntes: null, responsavelDepois: null, tipoDepois: null, divisao: null });
    expect(limpar).toEqual({ ok: false });
    expect(m.upserts.length).toBe(antes);
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

// Editar, excluir e marcar uso (História 3.4): cliente falso por id e uma memória mínima.

function montarEdicao(opcoes: { falharUpdate?: boolean; falharDelete?: boolean; online?: boolean } = {}) {
  const base = {
    id: "r1",
    chave: "SPOTIFY",
    versao_normalizacao: 1,
    responsavel_id: "casal",
    tipo_id: "casa",
    contagem: [
      { responsavel_id: "casal", n: 3 },
      { responsavel_id: "rafael", n: 1 },
    ],
    ultimo_uso: "2026-10-01T00:00:00.000Z",
  } as unknown as LinhaRegra;
  const tabela = new Map<string, LinhaRegra>([[base.id, base]]);
  const memoria = new Map<string, LinhaRegra>([[base.id, base]]);
  const updates: { corpo: Record<string, unknown>; filtro: string }[] = [];
  const usos: { corpo: Record<string, unknown>; chaves: string[] }[] = [];
  const cliente = {
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => {
            await tique();
            return { data: tabela.get(id) ?? null, error: null };
          },
        }),
      }),
      update: (corpo: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            single: async () => {
              await tique();
              updates.push({ corpo, filtro: id });
              if (opcoes.falharUpdate) return { data: null, error: { code: "x" } };
              const linha = { ...tabela.get(id)!, ...corpo } as LinhaRegra;
              tabela.set(id, linha);
              return { data: linha, error: null };
            },
          }),
        }),
        in: async (_c: string, chaves: string[]) => {
          usos.push({ corpo, chaves });
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (_c: string, id: string) => {
          await tique();
          if (opcoes.falharDelete) return { error: { code: "x" } };
          tabela.delete(id);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  const gerenciadorFalso = {
    linha: (id: string) => memoria.get(id),
    aplicarOtimista: (mudancas: (Partial<LinhaRegra> & { id: string })[]) => {
      const antes = mudancas.map((m) => memoria.get(m.id)!);
      for (const m of mudancas) memoria.set(m.id, { ...memoria.get(m.id)!, ...m });
      return () => {
        for (const a of antes) memoria.set(a.id, a);
      };
    },
    aplicarLote: (linhas: LinhaRegra[]) => {
      for (const l of linhas) memoria.set(l.id, l);
    },
    remover: (ids: string[]) => {
      for (const id of ids) memoria.delete(id);
    },
  } as unknown as Parameters<typeof criarRepoRegras>[0]["memoria"];
  const repo = criarRepoRegras({
    obterCliente: () => cliente,
    agora: () => AGORA,
    memoria: gerenciadorFalso,
    online: () => opcoes.online ?? true,
  });
  return { repo, tabela, memoria, updates, usos };
}

describe("repositório de Regras: editar, excluir e marcar uso", () => {
  it("editar o Responsável grava Responsável e contagem (soma antiga), sem tocar em ultimo_uso, e atualiza a memória", async () => {
    const m = montarEdicao();
    const r = await m.repo.editar("r1", { responsavel_id: "rafael" });
    expect(r.ok).toBe(true);
    expect(m.updates).toEqual([
      {
        corpo: { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 4 }] },
        filtro: "r1",
      },
    ]);
    expect(m.memoria.get("r1")?.responsavel_id).toBe("rafael");
    expect(m.tabela.get("r1")?.ultimo_uso).toBe("2026-10-01T00:00:00.000Z");
  });

  it("História 3.8: 'Remover divisão' grava só divisao = null, junto do Responsável, Tipo e contagem que a edição devolve", async () => {
    const m = montarEdicao();
    m.tabela.set("r1", { ...m.tabela.get("r1")!, divisao: { modo: "proporcao", partes: [{ responsavel_id: "casal", numerador: 1, denominador: 2 }, { responsavel_id: "rafael", numerador: 1, denominador: 2 }] } } as never);
    const r = await m.repo.editar("r1", { divisao: null });
    expect(r.ok).toBe(true);
    expect(m.updates).toEqual([
      {
        corpo: {
          responsavel_id: "casal",
          tipo_id: "casa",
          contagem: [
            { responsavel_id: "casal", n: 3 },
            { responsavel_id: "rafael", n: 1 },
          ],
          divisao: null,
        },
        filtro: "r1",
      },
    ]);
  });

  it("editar sem mudança não grava; limpar os dois recusa com regra.vazia", async () => {
    const m = montarEdicao();
    expect(await m.repo.editar("r1", { responsavel_id: "casal" })).toEqual({ ok: true, regra: null });
    expect(await m.repo.editar("r1", { responsavel_id: null, tipo_id: null })).toEqual({ ok: false, codigo: "regra.vazia" });
    expect(m.updates).toEqual([]);
  });

  it("falha no banco desfaz o otimismo; sem conexão não tenta; id desconhecido falha", async () => {
    const falha = montarEdicao({ falharUpdate: true });
    expect(await falha.repo.editar("r1", { tipo_id: "saude" })).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(falha.memoria.get("r1")?.tipo_id).toBe("casa");
    const off = montarEdicao({ online: false });
    expect(await off.repo.editar("r1", { tipo_id: "saude" })).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(off.updates).toEqual([]);
    expect(await off.repo.excluir("r1")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await montarEdicao().repo.editar("nao-existe", { tipo_id: "x" })).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("excluir apaga no banco e tira da memória; falha deixa tudo como estava", async () => {
    const m = montarEdicao();
    expect(await m.repo.excluir("r1")).toEqual({ ok: true });
    expect(m.tabela.has("r1")).toBe(false);
    expect(m.memoria.has("r1")).toBe(false);
    const falha = montarEdicao({ falharDelete: true });
    expect(await falha.repo.excluir("r1")).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(falha.memoria.has("r1")).toBe(true);
  });

  it("marcarUso muda só o ultimo_uso, em páginas de 50 chaves; lista vazia não chama", async () => {
    const m = montarEdicao();
    const chaves = Array.from({ length: 120 }, (_, i) => `C${i}`);
    expect(await m.repo.marcarUso(chaves)).toEqual({ ok: true });
    expect(m.usos.map((u) => u.chaves.length)).toEqual([50, 50, 20]);
    expect(m.usos[0].corpo).toEqual({ ultimo_uso: "2026-11-09T12:00:00.000Z" });
    await m.repo.marcarUso([]);
    expect(m.usos).toHaveLength(3);
  });
});
