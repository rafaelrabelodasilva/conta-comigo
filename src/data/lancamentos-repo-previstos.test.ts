import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { criarRepoLancamentos, type LinhaLancamento, type ParcelaReclassificada } from "./lancamentos-repo";
import type { Gerenciador } from "./realtime";

// Previstos (História 3.5): a propagação da classificação e a origem. Cliente
// falso com consulta encadeada; a memória é um stub (os previstos são de
// outros Meses).

type Filtro = { tipo: string; coluna: string; valor: unknown };
type Consulta = { tabela: string; colunas: string; filtros: Filtro[] };
type ItemRpc = { id: string; corpo: Record<string, unknown> };

function montar(opcoes: {
  previstos?: unknown[];
  origem?: unknown;
  fatura?: unknown;
  rpc?: (itens: ItemRpc[]) => { data: unknown; error: unknown };
  erroLeitura?: boolean;
  online?: boolean;
}) {
  const consultas: Consulta[] = [];
  const rpcs: ItemRpc[][] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: (colunas: string) => {
        const c: Consulta = { tabela, colunas, filtros: [] };
        consultas.push(c);
        const resposta = () => {
          if (opcoes.erroLeitura) return { data: null, error: { code: "x" } };
          if (tabela === "faturas") return { data: opcoes.fatura ?? null, error: null };
          if (c.filtros.some((f) => f.coluna === "id")) return { data: opcoes.origem ?? null, error: null };
          return { data: opcoes.previstos ?? [], error: null };
        };
        const cadeia: Record<string, unknown> = {
          in: (coluna: string, valor: unknown) => (c.filtros.push({ tipo: "in", coluna, valor }), cadeia),
          eq: (coluna: string, valor: unknown) => (c.filtros.push({ tipo: "eq", coluna, valor }), cadeia),
          is: (coluna: string, valor: unknown) => (c.filtros.push({ tipo: "is", coluna, valor }), cadeia),
          maybeSingle: async () => resposta(),
          then: (resolver: (r: unknown) => unknown) => Promise.resolve(resposta()).then(resolver),
        };
        return cadeia;
      },
    }),
    rpc: async (_nome: string, args: { p_itens: ItemRpc[] }) => {
      rpcs.push(args.p_itens);
      if (opcoes.rpc) return opcoes.rpc(args.p_itens);
      return { data: args.p_itens.map((i) => ({ id: i.id, ...i.corpo })), error: null };
    },
  } as unknown as SupabaseClient<Database>;
  const aplicarLote = vi.fn();
  const memoria = { aplicarLote } as unknown as Gerenciador<LinhaLancamento>;
  const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria, online: () => opcoes.online ?? true });
  return { repo, consultas, rpcs, aplicarLote };
}

const parcela = (extra: Partial<ParcelaReclassificada> = {}): ParcelaReclassificada => ({
  serie_id: "s1",
  parcela_n: 5,
  lancado_por: "fatura",
  antes: { responsavel_id: null, tipo_id: null },
  depois: { responsavel_id: "r1", tipo_id: "t1" },
  ...extra,
});

const previsto = (id: string, n: number, r: string | null = null, t: string | null = null) => ({
  id,
  serie_id: "s1",
  parcela_n: n,
  responsavel_id: r,
  tipo_id: t,
});

describe("propagarAosPrevistos (História 3.5)", () => {
  it("preenche os previstos vazios da Série, só os seguintes, sem editado_em", async () => {
    const m = montar({ previstos: [previsto("p4", 4), previsto("p6", 6), previsto("p7", 7)] });
    const r = await m.repo.propagarAosPrevistos([parcela()]);
    expect(r).toEqual({ ok: true, preenchidos: 2, aPerguntar: [] });
    expect(m.rpcs).toEqual([
      [
        { id: "p6", corpo: { responsavel_id: "r1", tipo_id: "t1" } },
        { id: "p7", corpo: { responsavel_id: "r1", tipo_id: "t1" } },
      ],
    ]);
    expect(m.consultas[0].filtros).toEqual([
      { tipo: "in", coluna: "serie_id", valor: ["s1"] },
      { tipo: "eq", coluna: "lancado_por", valor: "sistema" },
      { tipo: "is", coluna: "dividido_de_id", valor: null },
      { tipo: "is", coluna: "excluido_em", valor: null },
    ]);
    expect(m.aplicarLote).toHaveBeenCalledOnce();
  });

  it("previsto com outro valor: devolve para perguntar e não grava nada", async () => {
    const m = montar({ previstos: [previsto("p6", 6, "r1", "t1")] });
    const r = await m.repo.propagarAosPrevistos([
      parcela({ antes: { responsavel_id: "r1", tipo_id: "t1" }, depois: { responsavel_id: "r2", tipo_id: "t1" } }),
    ]);
    expect(r).toEqual({ ok: true, preenchidos: 0, aPerguntar: [{ id: "p6", corpo: { responsavel_id: "r2" } }] });
    expect(m.rpcs).toEqual([]);
  });

  it("linha sem Série, previsto ou nada que mudou: não lê nem grava", async () => {
    const m = montar({ previstos: [previsto("p6", 6)] });
    expect(await m.repo.propagarAosPrevistos([parcela({ serie_id: null })])).toEqual({ ok: true, preenchidos: 0, aPerguntar: [] });
    expect(await m.repo.propagarAosPrevistos([parcela({ lancado_por: "sistema" })])).toEqual({ ok: true, preenchidos: 0, aPerguntar: [] });
    expect(m.consultas).toEqual([]);
    // Lida mas nada muda: as duas classificações iguais.
    const igual = await m.repo.propagarAosPrevistos([parcela({ depois: { responsavel_id: null, tipo_id: null } })]);
    expect(igual).toEqual({ ok: true, preenchidos: 0, aPerguntar: [] });
    expect(m.rpcs).toEqual([]);
  });

  it("lote: uma leitura para várias Séries", async () => {
    const m = montar({
      previstos: [
        previsto("a6", 6),
        { ...previsto("b3", 3), serie_id: "s2" },
      ],
    });
    const r = await m.repo.propagarAosPrevistos([parcela(), parcela({ serie_id: "s2", parcela_n: 2 })]);
    expect(r).toMatchObject({ ok: true, preenchidos: 2 });
    expect(m.consultas).toHaveLength(1);
    expect(m.consultas[0].filtros[0]).toEqual({ tipo: "in", coluna: "serie_id", valor: ["s1", "s2"] });
  });

  it("falha na leitura ou na gravação: salvar.falhou; sem conexão: bloqueia", async () => {
    expect(await montar({ erroLeitura: true }).repo.propagarAosPrevistos([parcela()])).toEqual({
      ok: false,
      codigo: "salvar.falhou",
    });
    const recusa = montar({ previstos: [previsto("p6", 6)], rpc: () => ({ data: null, error: { code: "x" } }) });
    expect(await recusa.repo.propagarAosPrevistos([parcela()])).toEqual({ ok: false, codigo: "salvar.falhou" });
    const sem = montar({ online: false });
    expect(await sem.repo.propagarAosPrevistos([parcela()])).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(sem.consultas).toEqual([]);
  });
});

describe("aplicarAosPrevistos e lerOrigem (História 3.5)", () => {
  it("'Aplicar a todos' grava as mudanças que ficaram para perguntar", async () => {
    const m = montar({});
    const r = await m.repo.aplicarAosPrevistos([{ id: "p6", corpo: { responsavel_id: "r2" } }]);
    expect(r).toEqual({ ok: true, gravados: 1 });
    expect(m.rpcs).toEqual([[{ id: "p6", corpo: { responsavel_id: "r2" } }]]);
    expect(await m.repo.aplicarAosPrevistos([])).toEqual({ ok: true, gravados: 0 });
  });

  it("origem: a linha e o vencimento da Fatura dela", async () => {
    const m = montar({
      origem: { nome: "MAGALU", parcela_n: 5, parcela_total: 10, fatura_id: "f10" },
      fatura: { vencimento: "2026-10-06" },
    });
    expect(await m.repo.lerOrigem("o1")).toEqual({
      ok: true,
      origem: { nome: "MAGALU", parcela_n: 5, parcela_total: 10, vencimento: "2026-10-06" },
    });
  });

  it("origem apagada (reimportação): null", async () => {
    const m = montar({ origem: null });
    expect(await m.repo.lerOrigem("o1")).toEqual({ ok: true, origem: null });
  });
});
