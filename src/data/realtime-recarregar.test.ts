import { beforeEach, describe, expect, it, vi } from "vitest";

// Os gerenciadores únicos (`gerenciador(tabela)`) com o cliente do navegador
// e o detector de conexão simulados: a volta da conexão relê todos. O mapa de
// gerenciadores e a ligação ao detector são do módulo: cada teste reimporta
// `./realtime` do zero e começa com um falso limpo.

const falso = vi.hoisted(() => ({
  aoVoltar: [] as (() => void)[],
  leituras: [] as string[],
}));

vi.mock("./conexao", () => ({
  aoVoltar: (acao: () => void) => {
    falso.aoVoltar.push(acao);
    return () => {};
  },
}));

vi.mock("./supabase/navegador", () => {
  const cliente = {
    from: (tabela: string) => ({
      select: async () => {
        falso.leituras.push(tabela);
        return { data: [], error: null };
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
    removeChannel: async () => {},
  };
  return { criarClienteNavegador: () => cliente };
});

const esperar = () => new Promise((r) => setTimeout(r, 0));

async function realtimeNovo() {
  return import("./realtime");
}

describe("recarregarTodos", () => {
  beforeEach(() => {
    vi.resetModules();
    falso.aoVoltar.length = 0;
    falso.leituras.length = 0;
  });

  it("liga ao detector uma vez só, na primeira criação", async () => {
    const { gerenciador } = await realtimeNovo();
    expect(falso.aoVoltar).toHaveLength(0);
    gerenciador("tipos");
    gerenciador("status");
    gerenciador("tipos");
    expect(falso.aoVoltar).toHaveLength(1);
  });

  it("quando a conexão volta, relê todos os gerenciadores já criados", async () => {
    const { gerenciador } = await realtimeNovo();
    gerenciador("tipos").assinar(() => {});
    gerenciador("status").assinar(() => {});
    await esperar();
    expect(falso.leituras.sort()).toEqual(["status", "tipos"]);
    falso.leituras.length = 0;

    falso.aoVoltar[0]();
    await esperar();
    expect(falso.leituras.sort()).toEqual(["status", "tipos"]);
  });

  it("recarregarTodos espera a releitura de cada um", async () => {
    const { gerenciador, recarregarTodos } = await realtimeNovo();
    gerenciador("responsaveis").assinar(() => {});
    gerenciador("tipos").assinar(() => {});
    await esperar();
    falso.leituras.length = 0;
    await recarregarTodos();
    expect(falso.leituras.sort()).toEqual(["responsaveis", "tipos"]);
  });
});
