import { beforeEach, describe, expect, it, vi } from "vitest";
import { gerenciador, gerenciadorTodosOsLancamentos } from "./realtime";

// Os Lançamentos de TODOS os Meses (História 6.5, AD-4): o gerenciador de Recebimentos tem canal próprio, lê por
// páginas de 1000 (o corte do PostgREST), não filtra por Mês nem por exclusão (o "não pago" depende dos Status do
// usuário e a linha excluída depois de paga vira crédito) e não se mistura com o gerenciador do Mês aberto.

type L = { id: string; mes: string; updated_at: string; excluido_em: string | null };
const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";
const id = (n: number) => `id-${String(n).padStart(5, "0")}`;
const linha = (n: number, extra: Partial<L> = {}): L => ({ id: id(n), mes: "2026-10", updated_at: T1, excluido_em: null, ...extra });

const falso = vi.hoisted(() => ({
  tabela: [] as L[],
  intervalos: [] as [number, number][],
  filtros: [] as string[],
  canais: [] as string[],
  aoMudar: (() => {}) as (payload: unknown) => void,
  avisarStatus: (() => {}) as (s: string) => void,
}));

vi.mock("./supabase/navegador", () => ({
  criarClienteNavegador: () => ({
    from: () => ({
      select: () => {
        let intervalo: [number, number] | null = null;
        const c = {
          eq(coluna: string) {
            falso.filtros.push(`eq:${coluna}`);
            return c;
          },
          is(coluna: string) {
            falso.filtros.push(`is:${coluna}`);
            return c;
          },
          or() {
            falso.filtros.push("or");
            return c;
          },
          order() {
            return c;
          },
          range(de: number, ate: number) {
            intervalo = [de, ate];
            falso.intervalos.push([de, ate]);
            return c;
          },
          then(ok: (r: { data: L[] | null; error: unknown }) => unknown) {
            if (intervalo === null) return Promise.resolve({ data: null, error: { message: "sem página" } }).then(ok);
            const base = falso.tabela.slice().sort((a, b) => a.id.localeCompare(b.id));
            return Promise.resolve({ data: base.slice(intervalo[0], intervalo[1] + 1), error: null }).then(ok);
          },
        };
        return c;
      },
    }),
    channel: (nome: string) => {
      falso.canais.push(nome);
      return {
        on(_t: string, _f: unknown, cb: (payload: unknown) => void) {
          falso.aoMudar = cb;
          return this;
        },
        subscribe(cb: (s: string) => void) {
          falso.avisarStatus = cb;
          return this;
        },
      };
    },
    removeChannel: async () => {},
  }),
}));

const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  falso.tabela = [];
  falso.intervalos = [];
  falso.filtros = [];
  falso.canais = [];
});

describe("gerenciadorTodosOsLancamentos", () => {
  it("é um só, à parte do gerenciador do Mês aberto (o AD-4 do Painel não muda)", () => {
    expect(gerenciadorTodosOsLancamentos()).toBe(gerenciadorTodosOsLancamentos());
    expect(gerenciadorTodosOsLancamentos()).not.toBe(gerenciador("lancamentos"));
    expect(gerenciador("lancamentos").mesAberto()).toBeNull();
  });

  it("lê por páginas de 1000, de todos os Meses, sem filtro de Mês nem de exclusão, em canal próprio", async () => {
    falso.tabela = Array.from({ length: 2300 }, (_, i) =>
      linha(i, { mes: i % 3 === 0 ? "2026-08" : i % 3 === 1 ? "2026-09" : "2026-10", excluido_em: i % 50 === 0 ? T2 : null }),
    );
    const g = gerenciadorTodosOsLancamentos();
    g.assinar(() => {});
    falso.avisarStatus("SUBSCRIBED");
    await esperar();
    expect(falso.intervalos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(falso.filtros).toEqual([]);
    expect(falso.canais).toEqual(["tabela:lancamentos:todos"]);
    expect(g.retrato().status).toBe("pronto");
    const linhas = g.linhas() as unknown as L[];
    expect(linhas).toHaveLength(2300);
    // As excluídas ficam (a linha de crédito de algo pago e depois excluído precisa delas).
    expect(linhas.filter((l) => l.excluido_em !== null).length).toBeGreaterThan(0);
    expect(new Set(linhas.map((l) => l.mes))).toEqual(new Set(["2026-08", "2026-09", "2026-10"]));
  });

  it("um evento de qualquer Mês entra; uma exclusão (UPDATE com excluido_em) mantém a linha, marcada", async () => {
    falso.tabela = [linha(1), linha(2, { mes: "2026-05" })];
    const g = gerenciadorTodosOsLancamentos();
    await g.recarregar();
    falso.avisarStatus("SUBSCRIBED");
    await esperar();
    falso.aoMudar({ eventType: "INSERT", new: linha(9, { mes: "2025-12", updated_at: T2 }), old: {} });
    expect(g.linhas().map((l) => l.id)).toContain(id(9));
    falso.aoMudar({ eventType: "UPDATE", new: linha(1, { excluido_em: T2, updated_at: T2 }), old: linha(1) });
    const excluida = (g.linhas() as unknown as L[]).find((l) => l.id === id(1));
    expect(excluida?.excluido_em).toBe(T2);
  });
});
