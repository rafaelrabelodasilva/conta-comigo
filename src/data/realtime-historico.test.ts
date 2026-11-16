import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { criarGerenciador, ESCOPO_DO_HISTORICO } from "./realtime";

// O Histórico de Pagamentos (História 6.3, AD-16): o gerenciador lê por páginas de 1000 (o corte do
// PostgREST) e guarda só o que está vivo. Um cliente falso com a tabela inteira em memória,
// `.order("id").range(de, ate)` e `.is("excluido_em", null)`.

type L = { id: string; updated_at: string; excluido_em: string | null };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";
const id = (n: number) => `id-${String(n).padStart(5, "0")}`;
const linha = (n: number, extra: Partial<L> = {}): L => ({ id: id(n), updated_at: T1, excluido_em: null, ...extra });

function montar(opcoes: { tabela: L[]; falhaNaPagina?: number }) {
  const intervalos: [number, number][] = [];
  const filtrosIs: string[] = [];
  let aoMudar: (payload: unknown) => void = () => {};
  let avisarStatus: (s: string) => void = () => {};
  const cliente = {
    from: () => ({
      select: () => {
        let vivas = false;
        let intervalo: [number, number] | null = null;
        const c = {
          is(coluna: string, valor: unknown) {
            filtrosIs.push(coluna + "=" + String(valor));
            vivas = coluna === "excluido_em" && valor === null;
            return c;
          },
          order() {
            return c;
          },
          range(de: number, ate: number) {
            intervalo = [de, ate];
            intervalos.push([de, ate]);
            return c;
          },
          then(ok: (r: { data: L[] | null; error: unknown }) => unknown) {
            if (intervalo === null) return Promise.resolve({ data: null, error: { message: "sem página" } }).then(ok);
            if (opcoes.falhaNaPagina !== undefined && intervalos.length === opcoes.falhaNaPagina) {
              return Promise.resolve({ data: null, error: { message: "falhou" } }).then(ok);
            }
            const base = (vivas ? opcoes.tabela.filter((l) => l.excluido_em === null) : opcoes.tabela).slice().sort((a, b) => a.id.localeCompare(b.id));
            return Promise.resolve({ data: base.slice(intervalo[0], intervalo[1] + 1), error: null }).then(ok);
          },
        };
        return c;
      },
    }),
    channel: () => ({
      on(_t: string, _f: unknown, cb: (payload: unknown) => void) {
        aoMudar = cb;
        return this;
      },
      subscribe(cb: (s: string) => void) {
        avisarStatus = cb;
        return this;
      },
    }),
    removeChannel: async () => {},
  } as unknown as SupabaseClient;
  const g = criarGerenciador<L>({ tabela: "pagamentos", obterCliente: () => cliente, ...ESCOPO_DO_HISTORICO });
  return { g, intervalos, filtrosIs, status: (s: string) => avisarStatus(s), evento: (p: unknown) => aoMudar(p) };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("gerenciador paginado do Histórico", () => {
  it("lê por páginas de 1000 até uma página vir incompleta (2.500 linhas = 3 páginas)", async () => {
    const m = montar({ tabela: Array.from({ length: 2500 }, (_, i) => linha(i)) });
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.intervalos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(m.g.retrato().status).toBe("pronto");
    expect(m.g.linhas()).toHaveLength(2500);
  });

  it("uma página cheia e exata ainda pede a seguinte (vazia) antes de parar", async () => {
    const m = montar({ tabela: Array.from({ length: 1000 }, (_, i) => linha(i)) });
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.intervalos).toHaveLength(2);
    expect(m.g.linhas()).toHaveLength(1000);
  });

  it("lê só o que está vivo (excluido_em is null) e a memória não guarda o desfeito", async () => {
    const m = montar({ tabela: [linha(1), linha(2, { excluido_em: T1 }), linha(3)] });
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.filtrosIs).toContain("excluido_em=null");
    expect(m.g.linhas().map((l) => l.id)).toEqual([id(1), id(3)]);
  });

  it("uma página que falha no meio vira erro (nada pela metade)", async () => {
    const m = montar({ tabela: Array.from({ length: 2500 }, (_, i) => linha(i)), falhaNaPagina: 2 });
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.g.retrato().status).toBe("erro");
    expect(m.g.linhas()).toEqual([]);
  });

  it("um Pagamento desfeito em outro aparelho (UPDATE com excluido_em) sai da memória; um novo (INSERT) entra", async () => {
    const m = montar({ tabela: [linha(1), linha(2)] });
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    m.evento({ eventType: "UPDATE", new: linha(1, { excluido_em: T2, updated_at: T2 }), old: linha(1) });
    expect(m.g.linhas().map((l) => l.id)).toEqual([id(2)]);
    m.evento({ eventType: "INSERT", new: linha(9, { updated_at: T2 }), old: {} });
    expect(m.g.linhas().map((l) => l.id).sort()).toEqual([id(2), id(9)]);
  });
});
