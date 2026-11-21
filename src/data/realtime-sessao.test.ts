import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gerenciador, gerenciadorFila, zerarGerenciadores } from "./realtime";

// Sair e entrar sem recarregar a página (Defeito 10; spec 1.4). O "Sair" é uma Server Action com `redirect`, e na
// documentação do Next o redirect de uma Server Action é uma NAVEGAÇÃO NO CLIENTE (a página não recarrega): os
// módulos, e com eles o mapa de gerenciadores de Realtime (AD-4), seguem vivos. Sem zerar, quem entra depois (B) vê,
// até a releitura, os dados de quem saiu (A). Aqui o Supabase é falso e a sessão muda no meio.

type Linha = { id: string; updated_at: string; nome: string };
type Canal = {
  nome: string;
  aoMudar: (payload: unknown) => void;
  status: (s: string) => void;
  fechado: boolean;
};

const mundo = vi.hoisted(() => ({
  usuario: "A" as "A" | "B",
  canais: [] as Canal[],
}));

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

/** O que cada usuário enxerga (o RLS do banco, de mentira). */
const DADOS: Record<"A" | "B", Linha[]> = {
  A: [{ id: "a1", updated_at: T1, nome: "Mãe da Ana" }],
  B: [{ id: "b1", updated_at: T1, nome: "Casal do Beto" }],
};

/** A consulta do PostgREST: aceita os filtros que os gerenciadores usam e resolve com os dados do usuário de agora. */
function consulta() {
  const c = {
    or: () => c,
    is: () => c,
    eq: () => c,
    order: () => c,
    range: () => c,
    then: (ok: (r: { data: Linha[]; error: null }) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve({ data: DADOS[mundo.usuario], error: null }).then(ok, falha),
  };
  return c;
}

vi.mock("./supabase/navegador", () => ({
  criarClienteNavegador: () =>
    ({
      from: () => ({ select: () => consulta() }),
      channel: (nome: string) => {
        const canal: Canal = { nome, aoMudar: () => {}, status: () => {}, fechado: false };
        mundo.canais.push(canal);
        const api = {
          on(_tipo: string, _filtro: unknown, cb: (payload: unknown) => void) {
            canal.aoMudar = cb;
            return api;
          },
          subscribe(cb: (s: string) => void) {
            canal.status = cb;
            return api;
          },
          __canal: canal,
        };
        return api;
      },
      removeChannel: async (api: { __canal: Canal }) => {
        api.__canal.fechado = true;
      },
    }) as unknown as SupabaseClient,
}));

const esperar = () => new Promise((r) => setTimeout(r, 0));
const nomes = (linhas: readonly Linha[]) => linhas.map((l) => l.nome);

/** As assinaturas abertas pelo teste: soltas no fim, para o próximo começar sem canal aberto. */
const paradas: (() => void)[] = [];
const assinar = (g: { assinar: (o: () => void) => () => void }) => {
  const parar = g.assinar(() => {});
  paradas.push(parar);
  return parar;
};

beforeEach(() => {
  mundo.usuario = "A";
  mundo.canais.length = 0;
});

afterEach(async () => {
  for (const parar of paradas.splice(0)) parar();
  await zerarGerenciadores();
});

describe("entra como A, sai e entra como B sem recarregar a página (Defeito 10)", () => {
  async function aEntra() {
    const g = gerenciador("responsaveis");
    const parar = assinar(g);
    mundo.canais[0].status("SUBSCRIBED");
    await esperar();
    expect(nomes(g.linhas() as unknown as Linha[])).toEqual(["Mãe da Ana"]);
    return { g, parar };
  }

  it("sem zerar, os dados de A ficam na memória depois que B entra (é o que o defeito é)", async () => {
    const { g, parar } = await aEntra();
    parar(); // "Sair": a tela some, mas o módulo e o gerenciador continuam
    mundo.usuario = "B";
    // Ninguém zerou: o gerenciador único ainda tem os dados de A.
    expect(nomes(gerenciador("responsaveis").linhas() as unknown as Linha[])).toEqual(["Mãe da Ana"]);
    expect(gerenciador("responsaveis")).toBe(g);
  });

  it("zerar esvazia a memória, fecha o canal de A e mantém o MESMO gerenciador (os repositórios guardam a referência)", async () => {
    const { g, parar } = await aEntra();
    parar();
    await zerarGerenciadores();
    expect(g.linhas()).toEqual([]);
    expect(g.retrato().status).toBe("carregando");
    expect(mundo.canais[0].fechado).toBe(true);
    expect(gerenciador("responsaveis")).toBe(g);
  });

  it("B entra: abre um canal NOVO (com a sessão de agora) e lê só os dados de B; um evento atrasado do canal de A não entra", async () => {
    const { g, parar } = await aEntra();
    parar();
    await zerarGerenciadores();
    mundo.usuario = "B";
    assinar(g);
    expect(mundo.canais).toHaveLength(2);
    mundo.canais[1].status("SUBSCRIBED");
    await esperar();
    expect(nomes(g.linhas() as unknown as Linha[])).toEqual(["Casal do Beto"]);
    // Um INSERT que ainda chegue pelo canal velho (já fechado) não suja a memória de B.
    mundo.canais[0].aoMudar({ eventType: "INSERT", new: { id: "a2", updated_at: T2, nome: "Outra da Ana" } });
    expect(nomes(g.linhas() as unknown as Linha[])).toEqual(["Casal do Beto"]);
    // O canal novo segue recebendo eventos normalmente.
    mundo.canais[1].aoMudar({ eventType: "INSERT", new: { id: "b2", updated_at: T2, nome: "Lucas do Beto" } });
    expect(nomes(g.linhas() as unknown as Linha[]).sort()).toEqual(["Casal do Beto", "Lucas do Beto"]);
  });

  it("zera todos os gerenciadores, inclusive os de escopo próprio (a fila do Revisar)", async () => {
    const fila = gerenciadorFila();
    assinar(fila);
    mundo.canais[0].status("SUBSCRIBED");
    await esperar();
    expect(fila.retrato().status).toBe("pronto");
    await zerarGerenciadores();
    expect(fila.linhas()).toEqual([]);
    expect(fila.retrato().status).toBe("carregando");
  });

  it("se ainda há quem assine na hora de zerar (troca de sessão com a tela aberta), o canal é reaberto para a sessão de agora", async () => {
    const g = gerenciador("responsaveis");
    assinar(g);
    mundo.canais[0].status("SUBSCRIBED");
    await esperar();
    mundo.usuario = "B";
    await zerarGerenciadores();
    expect(mundo.canais).toHaveLength(2);
    expect(mundo.canais[0].fechado).toBe(true);
    mundo.canais[1].status("SUBSCRIBED");
    await esperar();
    expect(nomes(g.linhas() as unknown as Linha[])).toEqual(["Casal do Beto"]);
  });

  it("zerar sem nada aberto não faz nada nem lança", async () => {
    await expect(zerarGerenciadores()).resolves.toBeUndefined();
    await expect(zerarGerenciadores()).resolves.toBeUndefined();
  });
});
