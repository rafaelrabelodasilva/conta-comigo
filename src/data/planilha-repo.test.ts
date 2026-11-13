import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { PlanoDaAba } from "@/domain/importacao-planilha";
import type { Database } from "./database.types";
import { criarRepoPlanilha } from "./planilha-repo";
import type { Gerenciador } from "./realtime";

// Repositório da planilha (História 3.10): lê o estado do app, grava uma aba
// pela RPC e aplica o resultado na memória. Cliente falso encadeado.

type Linha = Record<string, unknown>;

function montar(opcoes: {
  faturas?: Linha[];
  lancamentos?: Linha[];
  rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  online?: boolean;
  erroFaturas?: boolean;
} = {}) {
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];
  const filtros: string[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: (colunas: string) => {
        if (tabela === "faturas") {
          return Promise.resolve(opcoes.erroFaturas ? { data: null, error: { code: "x" } } : { data: opcoes.faturas ?? [], error: null });
        }
        filtros.push(`${tabela}:${colunas}`);
        const cadeia: Record<string, unknown> = {
          is: (c: string) => (filtros.push(`is ${c}`), cadeia),
          eq: (c: string, v: unknown) => (filtros.push(`eq ${c}=${String(v)}`), cadeia),
          order: () => cadeia,
          range: async (de: number, ate: number) => ({ data: (opcoes.lancamentos ?? []).slice(de, ate + 1), error: null }),
        };
        return cadeia;
      },
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return opcoes.rpc ? opcoes.rpc(nome, args) : { data: null, error: { message: "sem rpc" } };
    },
  } as unknown as SupabaseClient<Database>;
  const remover = vi.fn();
  const aplicarLote = vi.fn();
  const lancamentos = { remover, aplicarLote } as unknown as Gerenciador<never>;
  const repo = criarRepoPlanilha({ obterCliente: () => cliente, lancamentos, online: () => opcoes.online ?? true });
  return { repo, rpcs, filtros, remover, aplicarLote };
}

const PLANO: PlanoDaAba = {
  mes: "2026-03",
  nome: "03/2026",
  soRegras: false,
  substitui: false,
  linhas: [{ nome: "A" }] as unknown as PlanoDaAba["linhas"],
  previstos: [],
  resumo: { lancamentos: 1, digitadosAMao: 0, divisoes: 0, series: 0, previstos: 0 },
};

describe("lerEstado", () => {
  it("devolve os Meses com Fatura, os com histórico e as linhas com a origem do previsto", async () => {
    const m = montar({
      faturas: [{ mes: "2026-10" }],
      lancamentos: [
        { id: "h", nome: "OTICAS", mes: "2026-09", parcela_n: 9, parcela_total: 10, lancado_por: "historico", editado_em: null, origem_lancamento_id: null },
        { id: "p", nome: "OTICAS", mes: "2026-10", parcela_n: 10, parcela_total: 10, lancado_por: "sistema", editado_em: null, origem_lancamento_id: "h" },
        { id: "e", nome: "X", mes: "2026-11", parcela_n: null, parcela_total: null, lancado_por: "fatura", editado_em: "2026-11-01T00:00:00Z", origem_lancamento_id: null },
      ],
    });
    const r = await m.repo.lerEstado();
    expect(r.ok && r.estado.mesesComFatura).toEqual(["2026-10"]);
    expect(r.ok && r.estado.mesesComHistorico).toEqual(["2026-09"]);
    expect(r.ok && r.estado.linhas).toEqual([
      { nome: "OTICAS", mes: "2026-09", parcela_n: 9, parcela_total: 10, lancado_por: "historico", editado: false, origem_historico_mes: null },
      { nome: "OTICAS", mes: "2026-10", parcela_n: 10, parcela_total: 10, lancado_por: "sistema", editado: false, origem_historico_mes: "2026-09" },
      { nome: "X", mes: "2026-11", parcela_n: null, parcela_total: null, lancado_por: "fatura", editado: true, origem_historico_mes: null },
    ]);
    // Só linhas-mãe não excluídas.
    expect(m.filtros).toContain("is excluido_em");
    expect(m.filtros).toContain("is dividido_de_id");
  });

  it("erro de leitura: { ok: false }", async () => {
    expect((await montar({ erroFaturas: true }).repo.lerEstado()).ok).toBe(false);
  });
});

describe("importarAba", () => {
  it("chama a RPC com o Mês, as linhas e os previstos e aplica na memória (removidos saem antes)", async () => {
    const m = montar({
      rpc: () => ({
        data: {
          lancamentos: [{ id: "a", dividido_de_id: null }, { id: "f", dividido_de_id: "a" }],
          previstos: [{ id: "p" }],
          removidos: { lancamentos: ["x"], previstos: ["y"] },
        },
        error: null,
      }),
    });
    const r = await m.repo.importarAba(PLANO);
    expect(r).toEqual({ ok: true, lancamentos: 1 });
    expect(m.rpcs[0]).toEqual({ nome: "importar_aba_planilha", args: { p_mes: "2026-03", p_linhas: PLANO.linhas, p_previstos: [] } });
    expect(m.remover).toHaveBeenCalledWith(["x", "y"]);
    expect(m.aplicarLote).toHaveBeenCalledWith([{ id: "a", dividido_de_id: null }, { id: "f", dividido_de_id: "a" }, { id: "p" }]);
  });

  it("aba só de Regras não chama a RPC", async () => {
    const m = montar();
    expect(await m.repo.importarAba({ ...PLANO, soRegras: true })).toEqual({ ok: true, lancamentos: 0 });
    expect(m.rpcs).toEqual([]);
  });

  it("os códigos da RPC chegam como estão; erro desconhecido vira salvar.falhou", async () => {
    const com = (message: string) => montar({ rpc: () => ({ data: null, error: { message } }) }).repo.importarAba(PLANO);
    expect(await com("planilha.mes_com_fatura")).toEqual({ ok: false, codigo: "planilha.mes_com_fatura" });
    expect(await com("planilha.serie_ocupada")).toEqual({ ok: false, codigo: "planilha.serie_ocupada" });
    expect(await com("boom")).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("sem conexão não tenta; resposta torta é falha", async () => {
    const sem = montar({ online: false });
    expect(await sem.repo.importarAba(PLANO)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(sem.rpcs).toEqual([]);
    const torta = montar({ rpc: () => ({ data: { lancamentos: 1 }, error: null }) });
    expect(await torta.repo.importarAba(PLANO)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});

describe("apagarHistorico e mesesComHistorico", () => {
  it("chama a RPC do Mês e tira os ids da memória", async () => {
    const m = montar({ rpc: () => ({ data: { lancamentos: ["a", "b"], previstos: ["p"], series: 1 }, error: null }) });
    expect(await m.repo.apagarHistorico("2026-03")).toEqual({ ok: true, quantidade: 2 });
    expect(m.rpcs[0]).toEqual({ nome: "apagar_historico_do_mes", args: { p_mes: "2026-03" } });
    expect(m.remover).toHaveBeenCalledWith(["a", "b", "p"]);
  });

  it("conta as linhas de histórico por Mês, do mais antigo ao mais novo", async () => {
    const m = montar({ lancamentos: [{ mes: "2026-03" }, { mes: "2026-01" }, { mes: "2026-03" }] });
    expect(await m.repo.mesesComHistorico()).toEqual({
      ok: true,
      meses: [{ mes: "2026-01", quantidade: 1 }, { mes: "2026-03", quantidade: 2 }],
    });
    expect(m.filtros).toContain("eq lancado_por=historico");
  });
});
