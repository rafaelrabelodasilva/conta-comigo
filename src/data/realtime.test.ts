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
