import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { criarGerenciador } from "./realtime";

// Gerenciador com um cliente falso: a leitura responde o que o teste mandar
// e o canal guarda a ordem das chamadas e o callback do `subscribe()`.

type L = { id: string; updated_at: string; nome: string };

const T1 = "2026-11-02T12:00:00+00:00";
const T2 = "2026-11-02T12:00:05+00:00";

function montar() {
  const ordem: string[] = [];
  let leitura: { data: L[] | null; error: unknown } = { data: [], error: null };
  let avisarStatus: (s: string) => void = () => {};
  let aoMudar: (payload: unknown) => void = () => {};
  const cliente = {
    from: () => ({
      select: async () => {
        ordem.push("select");
        return leitura;
      },
    }),
    channel: () => ({
      on(_tipo: string, _filtro: unknown, cb: (payload: unknown) => void) {
        ordem.push("on");
        aoMudar = cb;
        return this;
      },
      subscribe(cb: (s: string) => void) {
        ordem.push("subscribe");
        avisarStatus = cb;
        return this;
      },
    }),
    removeChannel: async () => {
      ordem.push("removeChannel");
    },
  } as unknown as SupabaseClient;

  const g = criarGerenciador<L>({ tabela: "responsaveis", obterCliente: () => cliente });
  return {
    g,
    ordem,
    responder: (r: typeof leitura) => (leitura = r),
    status: (s: string) => avisarStatus(s),
    evento: (payload: unknown) => aoMudar(payload),
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("gerenciador de Realtime", () => {
  it("registra o ouvinte antes do subscribe() e só lê depois do SUBSCRIBED", async () => {
    const m = montar();
    m.g.assinar(() => {});
    expect(m.ordem).toEqual(["on", "subscribe"]);
    expect(m.g.retrato().status).toBe("carregando");
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.ordem).toEqual(["on", "subscribe", "select"]);
    expect(m.g.retrato().status).toBe("pronto");
  });

  it("relê a tabela a cada reconexão", async () => {
    const m = montar();
    m.g.assinar(() => {});
    m.responder({ data: [{ id: "a", updated_at: T1, nome: "Rafael" }], error: null });
    m.status("SUBSCRIBED");
    await esperar();
    m.status("CHANNEL_ERROR");
    m.responder({ data: [{ id: "a", updated_at: T2, nome: "Rafa" }], error: null });
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.ordem.filter((x) => x === "select")).toHaveLength(2);
    expect(m.g.linha("a")?.nome).toBe("Rafa");
  });

  it("falha na leitura mostra erro; Tentar de novo relê e fica pronto", async () => {
    const m = montar();
    m.g.assinar(() => {});
    m.responder({ data: null, error: { message: "falhou" } });
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.g.retrato().status).toBe("erro");

    m.responder({ data: [{ id: "a", updated_at: T1, nome: "Rafael" }], error: null });
    await m.g.recarregar();
    expect(m.g.retrato().status).toBe("pronto");
    expect(m.g.linhas()).toHaveLength(1);
  });

  it("aplica evento mais novo e ignora o velho, avisando as telas só quando muda", async () => {
    const m = montar();
    let avisos = 0;
    m.g.assinar(() => avisos++);
    m.responder({ data: [{ id: "a", updated_at: T2, nome: "Rafael" }], error: null });
    m.status("SUBSCRIBED");
    await esperar();
    const antes = avisos;

    m.evento({ eventType: "UPDATE", new: { id: "a", updated_at: T1, nome: "Velho" }, old: {} });
    expect(m.g.linha("a")?.nome).toBe("Rafael");
    expect(avisos).toBe(antes);

    m.evento({
      eventType: "UPDATE",
      new: { id: "a", updated_at: "2026-11-02 12:00:06.5+00", nome: "Novo" },
      old: {},
    });
    expect(m.g.linha("a")?.nome).toBe("Novo");
    expect(avisos).toBe(antes + 1);
  });

  it("CHANNEL_ERROR/TIMED_OUT antes do SUBSCRIBED dá erro; Tentar de novo reabre o canal", async () => {
    for (const falha of ["CHANNEL_ERROR", "TIMED_OUT"]) {
      const m = montar();
      m.g.assinar(() => {});
      m.status(falha);
      expect(m.g.retrato().status).toBe("erro");

      await m.g.recarregar();
      expect(m.ordem).toEqual(["on", "subscribe", "removeChannel", "on", "subscribe"]);
      m.responder({ data: [{ id: "a", updated_at: T1, nome: "Rafael" }], error: null });
      m.status("SUBSCRIBED");
      await esperar();
      expect(m.ordem.at(-1)).toBe("select");
      expect(m.g.retrato().status).toBe("pronto");
    }
  });

  it("CLOSED antes do SUBSCRIBED dá erro (sem esqueleto para sempre)", () => {
    const m = montar();
    m.g.assinar(() => {});
    m.status("CLOSED");
    expect(m.g.retrato().status).toBe("erro");
  });

  it("releitura que falha depois de carregar mantém a lista", async () => {
    const m = montar();
    m.g.assinar(() => {});
    m.responder({ data: [{ id: "a", updated_at: T1, nome: "Rafael" }], error: null });
    m.status("SUBSCRIBED");
    await esperar();
    m.responder({ data: null, error: { message: "falhou" } });
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.g.retrato().status).toBe("pronto");
    expect(m.g.linha("a")?.nome).toBe("Rafael");
  });

  it("linha criada enquanto a releitura estava em curso não some", async () => {
    const m = montar();
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    m.status("SUBSCRIBED"); // reconexão: leitura em curso, sem a linha nova
    m.g.aplicarLote([{ id: "novo", updated_at: T2, nome: "Lucas" }]);
    await esperar();
    expect(m.g.linha("novo")?.nome).toBe("Lucas");
  });

  it("remover tira as linhas da memória e avisa as telas; id desconhecido não muda nada", async () => {
    const m = montar();
    let avisos = 0;
    m.g.assinar(() => avisos++);
    m.responder({
      data: [
        { id: "a", updated_at: T1, nome: "Rafael" },
        { id: "b", updated_at: T1, nome: "Lucas" },
      ],
      error: null,
    });
    m.status("SUBSCRIBED");
    await esperar();
    const antes = avisos;

    m.g.remover(["a"]);
    expect(m.g.linha("a")).toBeUndefined();
    expect(m.g.linhas().map((l) => l.id)).toEqual(["b"]);
    expect(avisos).toBe(antes + 1);

    m.g.remover(["nao-existe"]);
    expect(avisos).toBe(antes + 1);

    // O DELETE do Realtime que chega depois não muda nada.
    m.evento({ eventType: "DELETE", new: {}, old: { id: "a" } });
    expect(m.g.linhas()).toHaveLength(1);
    expect(avisos).toBe(antes + 1);
  });
});

// Gerenciador por Mês (`lancamentos`, AD-4): a leitura registra o filtro
// `.eq("mes", …)` e responde só as linhas daquele Mês.
type LM = { id: string; updated_at: string; mes: string; nome: string };

function montarPorMes(banco: LM[]) {
  const leituras: (string | null)[] = [];
  let avisarStatus: (s: string) => void = () => {};
  let aoMudar: (payload: unknown) => void = () => {};
  let segurar: Promise<void> | null = null;
  let canais = 0;
  const cliente = {
    from: () => ({
      select: () => ({
        eq: async (coluna: string, valor: string) => {
          leituras.push(coluna === "mes" ? valor : null);
          if (segurar) await segurar;
          return { data: banco.filter((l) => l.mes === valor), error: null };
        },
        then: () => {
          throw new Error("leu a tabela inteira");
        },
      }),
    }),
    channel: () => ({
      _n: ++canais,
      on(_tipo: string, _filtro: unknown, cb: (payload: unknown) => void) {
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
  const g = criarGerenciador<LM>({ tabela: "lancamentos", obterCliente: () => cliente, porMes: true });
  return {
    g,
    leituras,
    status: (s: string) => avisarStatus(s),
    evento: (payload: unknown) => aoMudar(payload),
    segurar: (p: Promise<void> | null) => (segurar = p),
    canais: () => canais,
  };
}

const OUT = (id: string, extra: Partial<LM> = {}): LM => ({ id, updated_at: T1, mes: "2026-10", nome: id, ...extra });
const NOV = (id: string, extra: Partial<LM> = {}): LM => ({ id, updated_at: T1, mes: "2026-11", nome: id, ...extra });

describe("gerenciador por Mês", () => {
  it("sem Mês aberto não lê nada e fica carregando", async () => {
    const m = montarPorMes([OUT("a")]);
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.leituras).toEqual([]);
    expect(m.g.retrato()).toEqual({ status: "carregando", linhas: [], mes: null });
  });

  it("relê só o Mês aberto ao assinar, a cada SUBSCRIBED e ao trocar de Mês", async () => {
    const m = montarPorMes([OUT("a"), OUT("b"), NOV("c")]);
    m.g.abrirMes("2026-10");
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.leituras).toEqual(["2026-10"]);
    expect(m.g.retrato().mes).toBe("2026-10");
    expect(m.g.linhas().map((l) => l.id).sort()).toEqual(["a", "b"]);

    m.status("SUBSCRIBED");
    await esperar();
    expect(m.leituras).toEqual(["2026-10", "2026-10"]);

    m.g.abrirMes("2026-11");
    // Troca: memória vazia (esqueleto) até a releitura do Mês novo.
    expect(m.g.retrato()).toEqual({ status: "carregando", linhas: [], mes: "2026-11" });
    await esperar();
    expect(m.leituras.at(-1)).toBe("2026-11");
    expect(m.g.linhas().map((l) => l.id)).toEqual(["c"]);
    expect(m.g.mesAberto()).toBe("2026-11");

    // Mesmo Mês: nada muda.
    m.g.abrirMes("2026-11");
    await esperar();
    expect(m.leituras).toHaveLength(3);
  });

  it("a leitura do Mês anterior que chega depois da troca é descartada", async () => {
    const m = montarPorMes([OUT("a"), NOV("c")]);
    m.g.abrirMes("2026-10");
    m.g.assinar(() => {});
    let soltar: () => void = () => {};
    m.segurar(new Promise<void>((r) => (soltar = r)));
    m.status("SUBSCRIBED");
    await esperar();
    m.segurar(null);
    m.g.abrirMes("2026-11");
    await esperar();
    soltar();
    await esperar();
    expect(m.g.linhas().map((l) => l.id)).toEqual(["c"]);
    expect(m.g.retrato().mes).toBe("2026-11");
  });

  it("evento de outro Mês é ignorado; UPDATE que sai do Mês aberto tira a linha", async () => {
    const m = montarPorMes([OUT("a")]);
    m.g.abrirMes("2026-10");
    let avisos = 0;
    m.g.assinar(() => avisos++);
    m.status("SUBSCRIBED");
    await esperar();
    const antes = avisos;

    m.evento({ eventType: "INSERT", new: NOV("x", { updated_at: T2 }), old: {} });
    m.evento({ eventType: "UPDATE", new: NOV("y", { updated_at: T2 }), old: {} });
    expect(m.g.linhas().map((l) => l.id)).toEqual(["a"]);
    expect(avisos).toBe(antes);

    m.evento({ eventType: "INSERT", new: OUT("n", { updated_at: T2 }), old: {} });
    expect(m.g.linhas().map((l) => l.id).sort()).toEqual(["a", "n"]);

    m.evento({ eventType: "UPDATE", new: NOV("a", { updated_at: T2 }), old: {} });
    expect(m.g.linha("a")).toBeUndefined();
    expect(m.g.linhas().map((l) => l.id)).toEqual(["n"]);
  });

  it("UPDATE de outro Mês fora de ordem (mais velho que a memória) não tira a linha", async () => {
    const m = montarPorMes([OUT("a", { updated_at: T2 })]);
    m.g.abrirMes("2026-10");
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    m.evento({ eventType: "UPDATE", new: NOV("a", { updated_at: T1 }), old: {} });
    expect(m.g.linha("a")?.mes).toBe("2026-10");
  });

  it("trocar de Mês com o canal caído reabre o canal; o SUBSCRIBED relê o Mês novo", async () => {
    const m = montarPorMes([OUT("a"), NOV("c")]);
    m.g.abrirMes("2026-10");
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    m.status("CHANNEL_ERROR");
    m.g.abrirMes("2026-11");
    await esperar();
    expect(m.canais()).toBe(2);
    expect(m.g.retrato().status).toBe("carregando");
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.leituras.at(-1)).toBe("2026-11");
    expect(m.g.retrato()).toMatchObject({ status: "pronto", mes: "2026-11" });
    expect(m.g.linhas().map((l) => l.id)).toEqual(["c"]);
  });

  it("lote de outro Mês (importação de outro Mês) não entra na memória", async () => {
    const m = montarPorMes([]);
    m.g.abrirMes("2026-11");
    m.g.assinar(() => {});
    m.status("SUBSCRIBED");
    await esperar();
    m.g.aplicarLote([OUT("velho", { updated_at: T2 }), NOV("novo", { updated_at: T2 })]);
    expect(m.g.linhas().map((l) => l.id)).toEqual(["novo"]);
  });

  it("Mês aberto antes do canal: o primeiro SUBSCRIBED lê esse Mês", async () => {
    const m = montarPorMes([NOV("c")]);
    m.g.assinar(() => {});
    m.g.abrirMes("2026-11");
    expect(m.leituras).toEqual([]);
    m.status("SUBSCRIBED");
    await esperar();
    expect(m.leituras).toEqual(["2026-11"]);
    expect(m.g.retrato().status).toBe("pronto");
  });

  it("fora do escopo por Mês, abrirMes não faz nada", () => {
    const m = montar();
    m.g.abrirMes("2026-10");
    expect(m.g.mesAberto()).toBeNull();
    expect(m.g.retrato().mes).toBeUndefined();
  });
});
