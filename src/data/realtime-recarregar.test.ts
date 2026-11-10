import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILTRO_OR_DA_FILA } from "./realtime";

// Os gerenciadores únicos (`gerenciador(tabela)`) com o cliente do navegador
// e o detector de conexão simulados: a volta da conexão relê todos. O mapa de
// gerenciadores e a ligação ao detector são do módulo: cada teste reimporta
// `./realtime` do zero e começa com um falso limpo.

const falso = vi.hoisted(() => ({
  aoVoltar: [] as (() => void)[],
  leituras: [] as string[],
  canais: [] as string[],
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
      select: () => {
        const consulta = {
          // Filtros da fila (`filtrarLeitura`): a leitura que segue é registrada com eles.
          is: (coluna: string, valor: unknown) => {
            falso.leituras.push(`${tabela} ${coluna} is ${String(valor)}`);
            return consulta;
          },
          or: (filtro: string) => {
            falso.leituras.push(`${tabela} or ${filtro}`);
            return consulta;
          },
          eq: async (coluna: string, valor: string) => {
            falso.leituras.push(`${tabela} ${coluna}=${valor}`);
            return { data: [], error: null };
          },
          then: (resolver: (r: unknown) => unknown) => {
            falso.leituras.push(tabela);
            return Promise.resolve({ data: [], error: null }).then(resolver);
          },
        };
        return consulta;
      },
    }),
    channel: (nome: string) => ({
      _nome: falso.canais.push(nome),
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
    falso.canais.length = 0;
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

  it("o gerenciador de lancamentos é por Mês; os outros não", async () => {
    const { gerenciador } = await realtimeNovo();
    gerenciador("lancamentos").abrirMes("2026-10");
    gerenciador("lancamentos").assinar(() => {});
    await esperar();
    expect(falso.leituras).toEqual(["lancamentos mes=2026-10"]);
    expect(gerenciador("lancamentos").mesAberto()).toBe("2026-10");
    expect(gerenciador("tipos").mesAberto()).toBeNull();
  });

  it("a fila do Revisar tem canal e leitura próprios (todos os Meses, só a fila) e entra no recarregarTodos", async () => {
    const { gerenciador, gerenciadorFila, recarregarTodos } = await realtimeNovo();
    gerenciador("lancamentos").abrirMes("2026-10");
    gerenciador("lancamentos").assinar(() => {});
    gerenciadorFila().assinar(() => {});
    await esperar();
    expect(falso.canais.sort()).toEqual(["tabela:lancamentos", "tabela:lancamentos:fila"]);
    expect(falso.leituras).toContain("lancamentos mes=2026-10");
    expect(falso.leituras).toContain("lancamentos excluido_em is null");
    expect(falso.leituras).toContain(`lancamentos or ${FILTRO_OR_DA_FILA}`);
    // A fila não é por Mês: a leitura dela não filtra por `mes`.
    expect(falso.leituras.filter((l) => l.startsWith("lancamentos mes="))).toHaveLength(1);
    expect(gerenciadorFila().mesAberto()).toBeNull();
    expect(gerenciadorFila()).toBe(gerenciadorFila());

    falso.leituras.length = 0;
    await recarregarTodos();
    expect(falso.leituras).toContain("lancamentos");
    expect(falso.leituras).toContain(`lancamentos or ${FILTRO_OR_DA_FILA}`);
  });

  it("criar só a fila já liga ao detector", async () => {
    const { gerenciadorFila } = await realtimeNovo();
    gerenciadorFila();
    expect(falso.aoVoltar).toHaveLength(1);
  });
});
