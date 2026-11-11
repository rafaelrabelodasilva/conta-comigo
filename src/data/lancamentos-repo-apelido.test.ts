import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { criarRepoLancamentos, type LinhaLancamento } from "./lancamentos-repo";
import type { Gerenciador } from "./realtime";

// Apelido em massa (História 3.9): o repositório lê as linhas do Nome (todos
// os Meses), o núcleo decide e a RPC do lote grava. Cliente falso encadeado.

type Filtro = { tipo: string; coluna: string; valor: unknown };
type ItemRpc = { id: string; corpo: Record<string, unknown> };

const linhaDoBanco = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome_normalizado: "PAG*JOSEDASILVA",
  apelido: null,
  lancado_por: "fatura",
  editado_em: null,
  ajuste_de_id: null,
  dividido_de_id: null,
  excluido_em: null,
  ...extra,
});

function montar(opcoes: { linhas?: unknown[]; rpc?: (itens: ItemRpc[]) => { data: unknown; error: unknown }; erroLeitura?: boolean; online?: boolean; limite?: number }) {
  const filtros: Filtro[] = [];
  const limites: number[] = [];
  const rpcs: { nome: string; itens: ItemRpc[] }[] = [];
  const cliente = {
    from: () => ({
      select: (colunas: string) => {
        filtros.push({ tipo: "select", coluna: "", valor: colunas });
        const resposta = () => (opcoes.erroLeitura ? { data: null, error: { code: "x" } } : { data: opcoes.linhas ?? [], error: null });
        const cadeia: Record<string, unknown> = {
          eq: (coluna: string, valor: unknown) => (filtros.push({ tipo: "eq", coluna, valor }), cadeia),
          is: (coluna: string, valor: unknown) => (filtros.push({ tipo: "is", coluna, valor }), cadeia),
          limit: (n: number) => (limites.push(n), cadeia),
          then: (resolver: (r: unknown) => unknown) => Promise.resolve(resposta()).then(resolver),
        };
        return cadeia;
      },
    }),
    rpc: async (nome: string, args: { p_itens: ItemRpc[] }) => {
      rpcs.push({ nome, itens: args.p_itens });
      if (opcoes.rpc) return opcoes.rpc(args.p_itens);
      return { data: args.p_itens.map((i) => ({ id: i.id, ...i.corpo })), error: null };
    },
  } as unknown as SupabaseClient<Database>;
  const aplicarLote = vi.fn();
  const memoria = { aplicarLote } as unknown as Gerenciador<LinhaLancamento>;
  const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria, online: () => opcoes.online ?? true });
  return { repo, filtros, limites, rpcs, aplicarLote };
}

const ORIGEM = { id: "o", nome_normalizado: "PAG*JOSEDASILVA" };
const AGORA = new Date("2026-11-11T12:00:00Z");

describe("planejarApelido (História 3.9)", () => {
  it("lê as linhas do Nome (não excluídas, de todos os Meses) e devolve o plano sem gravar", async () => {
    const m = montar({ linhas: [linhaDoBanco("o"), linhaDoBanco("a"), linhaDoBanco("p", { lancado_por: "sistema" })] });
    const r = await m.repo.planejarApelido(ORIGEM, "Celular da mãe", AGORA);
    expect(r.ok && r.plano.mudam).toBe(2);
    expect(r.ok && r.plano.itens).toEqual([
      { id: "a", corpo: { apelido: "Celular da mãe", editado_em: AGORA.toISOString() } },
      { id: "p", corpo: { apelido: "Celular da mãe" } },
    ]);
    expect(m.filtros).toContainEqual({ tipo: "eq", coluna: "nome_normalizado", valor: "PAG*JOSEDASILVA" });
    expect(m.filtros).toContainEqual({ tipo: "is", coluna: "excluido_em", valor: null });
    // Nenhum filtro por Mês: o Apelido vale para todos.
    expect(m.filtros.some((f) => f.coluna === "mes")).toBe(false);
    expect(m.rpcs).toEqual([]);
    expect(m.aplicarLote).not.toHaveBeenCalled();
  });

  it("erro de leitura, teto de leitura e sem conexão viram falha", async () => {
    expect((await montar({ erroLeitura: true }).repo.planejarApelido(ORIGEM, "X", AGORA)).ok).toBe(false);
    const cheio = Array.from({ length: 1000 }, (_, i) => linhaDoBanco(`l${i}`));
    expect((await montar({ linhas: cheio }).repo.planejarApelido(ORIGEM, "X", AGORA)).ok).toBe(false);
    expect(await montar({ online: false }).repo.planejarApelido(ORIGEM, "X", AGORA)).toEqual({
      ok: false,
      codigo: "conexao.gravar_sem_conexao",
    });
  });
});

describe("aplicarApelido (História 3.9)", () => {
  const itens = [
    { id: "a", corpo: { apelido: "Celular da mãe" } },
    { id: "p", corpo: { apelido: "Celular da mãe" } },
  ] as never;

  it("grava tudo numa chamada da RPC do lote e aplica o que voltou na memória", async () => {
    const m = montar({});
    const r = await m.repo.aplicarApelido(itens);
    expect(r).toEqual({ ok: true, gravadas: 2 });
    expect(m.rpcs).toEqual([{ nome: "classificar_em_lote", itens }]);
    expect(m.aplicarLote).toHaveBeenCalledOnce();
  });

  it("a RPC recusa ou responde pela metade: falha e a memória não muda", async () => {
    const recusa = montar({ rpc: () => ({ data: null, error: { code: "x" } }) });
    expect(await recusa.repo.aplicarApelido(itens)).toEqual({ ok: false, codigo: "salvar.falhou" });
    const metade = montar({ rpc: () => ({ data: [{ id: "a" }], error: null }) });
    expect(await metade.repo.aplicarApelido(itens)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(recusa.aplicarLote).not.toHaveBeenCalled();
    expect(metade.aplicarLote).not.toHaveBeenCalled();
  });

  it("lista vazia não chama a RPC; sem conexão falha", async () => {
    const m = montar({});
    expect(await m.repo.aplicarApelido([])).toEqual({ ok: true, gravadas: 0 });
    expect(m.rpcs).toEqual([]);
    expect(await montar({ online: false }).repo.aplicarApelido(itens)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
  });
});
