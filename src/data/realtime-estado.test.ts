import { describe, expect, it } from "vitest";
import {
  aplicarEvento,
  aplicarLote,
  aplicarOtimista,
  aplicarReleitura,
  colunasAlteradas,
  desfazerOtimista,
  ehMaisNovo,
  estadoInicial,
  instanteMicros,
  marcarStatus,
  type EstadoTabela,
} from "./realtime-estado";

type L = { id: string; updated_at: string; nome: string; cor: number };

const T1 = "2026-11-02T12:00:00.000001+00:00";
const T2 = "2026-11-02T12:00:00.000002+00:00";
const T3 = "2026-11-02T12:00:01+00:00";

const l = (id: string, updated_at: string, nome = id, cor = 1): L => ({ id, updated_at, nome, cor });

function com(...linhas: L[]): EstadoTabela<L> {
  return aplicarReleitura(estadoInicial<L>(), linhas);
}

const lista = (e: EstadoTabela<L>) => [...e.porId.values()];

describe("instantes", () => {
  it("lê o formato do PostgREST e o do Realtime, com microssegundos", () => {
    const rest = instanteMicros("2026-11-02T12:00:00.123456+00:00");
    const rt = instanteMicros("2026-11-02 12:00:00.123456+00");
    expect(rest).toBe(rt);
    expect(rest % 1_000_000).toBe(123456);
  });

  it("respeita o fuso", () => {
    expect(instanteMicros("2026-11-02T09:00:00-03:00")).toBe(
      instanteMicros("2026-11-02T12:00:00Z"),
    );
  });

  it("compara por microssegundo; igual não é mais novo", () => {
    expect(ehMaisNovo(T2, T1)).toBe(true);
    expect(ehMaisNovo(T1, T2)).toBe(false);
    expect(ehMaisNovo(T1, T1)).toBe(false);
    expect(ehMaisNovo("lixo", T1)).toBe(false);
    expect(ehMaisNovo(T1, "lixo")).toBe(true);
  });
});

describe("eventos", () => {
  it("evento mais novo substitui; velho ou igual é ignorado", () => {
    const e = com(l("a", T2, "Rafael"));
    expect(aplicarEvento(e, { tipo: "UPDATE", nova: l("a", T3, "Rafa") }).porId.get("a")?.nome).toBe(
      "Rafa",
    );
    expect(aplicarEvento(e, { tipo: "UPDATE", nova: l("a", T1, "Velho") })).toBe(e);
    expect(aplicarEvento(e, { tipo: "UPDATE", nova: l("a", T2, "Igual") })).toBe(e);
  });

  it("INSERT de linha nova entra", () => {
    const e = aplicarEvento(com(), { tipo: "INSERT", nova: l("b", T1) });
    expect(lista(e).map((x) => x.id)).toEqual(["b"]);
  });

  it("DELETE remove", () => {
    const e = aplicarEvento(com(l("a", T1), l("b", T1)), { tipo: "DELETE", antiga: { id: "a" } });
    expect(lista(e).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("releitura", () => {
  it("fica pronto, tira o que sumiu e mantém linha da memória mais nova", () => {
    const antes = aplicarLote(estadoInicial<L>(), [l("a", T3, "Novo"), l("z", T1)]);
    expect(antes.status).toBe("carregando");
    const e = aplicarReleitura(antes, [l("a", T1, "Lido"), l("b", T1)]);
    expect(e.status).toBe("pronto");
    expect(e.porId.get("a")?.nome).toBe("Novo");
    expect(e.porId.has("z")).toBe(false);
    expect(e.porId.has("b")).toBe(true);
  });

  it("mantém linha aplicada durante a leitura que a leitura não trouxe", () => {
    const antes = aplicarLote(com(l("a", T1)), [l("novo", T2, "Lucas")]);
    const e = aplicarReleitura(antes, [l("a", T1)], new Set(["novo"]));
    expect(e.porId.get("novo")?.nome).toBe("Lucas");
    // Sem estar entre as aplicadas durante a leitura, sai.
    expect(aplicarReleitura(antes, [l("a", T1)]).porId.has("novo")).toBe(false);
  });

  it("linha lida mais nova vence", () => {
    const e = aplicarReleitura(com(l("a", T1, "Velho")), [l("a", T2, "Lido")]);
    expect(e.porId.get("a")?.nome).toBe("Lido");
  });

  it("marcarStatus só cria estado novo se mudar", () => {
    const e = com();
    expect(marcarStatus(e, "pronto")).toBe(e);
    expect(marcarStatus(e, "erro").status).toBe("erro");
  });
});

describe("lote (resposta de RPC)", () => {
  it("aplica cada linha pelo updated_at", () => {
    const e = aplicarLote(com(l("a", T2, "A"), l("b", T2, "B")), [
      l("a", T3, "A2"),
      l("b", T1, "B-velho"),
      l("c", T1, "C"),
    ]);
    expect(lista(e).map((x) => x.nome).sort()).toEqual(["A2", "B", "C"]);
  });

  it("sem mudança devolve o mesmo estado", () => {
    const e = com(l("a", T2));
    expect(aplicarLote(e, [l("a", T1)])).toBe(e);
  });
});

describe("otimismo", () => {
  it("mostra a mudança mantendo o updated_at anterior", () => {
    const e = com(l("a", T1, "Rafael", 1));
    const { estado, anteriores } = aplicarOtimista(e, [{ id: "a", cor: 4 }]);
    expect(estado.porId.get("a")).toEqual(l("a", T1, "Rafael", 4));
    expect(anteriores).toEqual([l("a", T1, "Rafael", 1)]);
  });

  it("ignora linha que não está na memória", () => {
    const e = com();
    const r = aplicarOtimista(e, [{ id: "x", cor: 2 }]);
    expect(r.estado).toBe(e);
    expect(r.anteriores).toEqual([]);
  });

  it("a resposta do banco substitui o otimista", () => {
    const { estado } = aplicarOtimista(com(l("a", T1, "Rafael", 1)), [{ id: "a", cor: 4 }]);
    const confirmado = aplicarLote(estado, [l("a", T2, "Rafael", 4)]);
    expect(confirmado.porId.get("a")?.updated_at).toBe(T2);
  });

  it("recusa do banco desfaz", () => {
    const { estado, anteriores } = aplicarOtimista(com(l("a", T1, "Rafael", 1)), [
      { id: "a", nome: "Rafa" },
    ]);
    expect(desfazerOtimista(estado, anteriores).porId.get("a")?.nome).toBe("Rafael");
  });

  it("não desfaz por cima de uma versão mais nova que chegou", () => {
    const { estado, anteriores } = aplicarOtimista(com(l("a", T1, "Rafael", 1)), [
      { id: "a", nome: "Rafa" },
    ]);
    const outroAparelho = aplicarEvento(estado, { tipo: "UPDATE", nova: l("a", T2, "Outro", 1) });
    expect(desfazerOtimista(outroAparelho, anteriores)).toBe(outroAparelho);
  });
});

describe("colunasAlteradas", () => {
  it("manda só o que mudou", () => {
    const atual = { nome: "Rafael", cor: 1, arquivado: false };
    expect(colunasAlteradas(atual, { nome: "Rafael", cor: 4 })).toEqual({ cor: 4 });
    expect(colunasAlteradas(atual, { nome: "Rafa", cor: 1, arquivado: false })).toEqual({
      nome: "Rafa",
    });
    expect(colunasAlteradas(atual, {})).toEqual({});
    expect(colunasAlteradas(atual, { cor: undefined })).toEqual({});
  });
});
