import { describe, expect, it } from "vitest";
import { emprestaAlgo, escolherCandidatas, mesclarHerdada, type CandidataParaHerdar, type RealParaHerdar } from "./heranca";

function candidata(p: Partial<CandidataParaHerdar> & { id: string }): CandidataParaHerdar {
  return {
    nome_normalizado: "MAGALU",
    parcela_n: 4,
    parcela_total: 10,
    valor_centavos: 44_589,
    ordem_fatura: null,
    responsavel_id: "r1",
    tipo_id: "t1",
    apelido: null,
    observacao: null,
    serie: { nome_normalizado: "MAGALU", parcela_total: 10, valor_parcela_centavos: 44_589, mes_primeira_parcela: "2026-07", ocorrencia: 1 },
    proxima_ocupada: false,
    ...p,
  };
}

const real = (ordem_fatura: number, over: Partial<RealParaHerdar> = {}): RealParaHerdar => ({
  ordem_fatura,
  nome_normalizado: "MAGALU",
  valor_centavos: 44_589,
  parcela_n: 5,
  parcela_total: 10,
  ...over,
});

const serie = (ocorrencia: number) => ({
  nome_normalizado: "MAGALU",
  parcela_total: 10,
  valor_parcela_centavos: 44_589,
  mes_primeira_parcela: "2026-07",
  ocorrencia,
});

describe("escolherCandidatas", () => {
  it("acha a n−1/N de mesmo Nome, total e Valor", () => {
    const r = escolherCandidatas([real(3)], [candidata({ id: "c1" })]);
    expect(r.get(3)?.id).toBe("c1");
  });

  it("não herda de Valor, Nome, total ou parcela diferentes", () => {
    const r = escolherCandidatas(
      [real(1), real(2), real(3), real(4)],
      [
        candidata({ id: "valor", valor_centavos: 44_590 }),
        candidata({ id: "nome", nome_normalizado: "OUTRA" }),
        candidata({ id: "total", parcela_total: 12 }),
        candidata({ id: "parcela", parcela_n: 3 }),
      ],
    );
    expect(r.size).toBe(0);
  });

  it("a primeira parcela (n = 1) não herda", () => {
    expect(escolherCandidatas([real(1, { parcela_n: 1 })], [candidata({ id: "c1", parcela_n: 0 })]).size).toBe(0);
  });

  it("várias candidatas: escolhe a de menor ocorrencia, em qualquer ordem de entrada", () => {
    const c1 = candidata({ id: "c1", serie: serie(1) });
    const c2 = candidata({ id: "c2", serie: serie(2) });
    const c3 = candidata({ id: "c3", serie: serie(3) });
    expect(escolherCandidatas([real(1)], [c3, c1, c2]).get(1)?.id).toBe("c1");
    expect(escolherCandidatas([real(1)], [c2, c3, c1]).get(1)?.id).toBe("c1");
  });

  it("compras idênticas: duas reais e duas candidatas casam 1-para-1 na ordem", () => {
    const r = escolherCandidatas([real(7), real(2)], [candidata({ id: "c2", serie: serie(2) }), candidata({ id: "c1", serie: serie(1) })]);
    expect(r.get(2)?.id).toBe("c1");
    expect(r.get(7)?.id).toBe("c2");
  });

  it("duas reais e uma candidata: só a primeira herda", () => {
    const r = escolherCandidatas([real(1), real(2)], [candidata({ id: "c1" })]);
    expect([...r.keys()]).toEqual([1]);
  });

  it("candidata cuja Série já tem a parcela n não serve; a seguinte serve", () => {
    const ocupada = candidata({ id: "c1", serie: serie(1), proxima_ocupada: true });
    const livre = candidata({ id: "c2", serie: serie(2) });
    expect(escolherCandidatas([real(1)], [ocupada, livre]).get(1)?.id).toBe("c2");
    expect(escolherCandidatas([real(1)], [ocupada]).size).toBe(0);
  });

  it("candidata sem Série (antes da 3.5) vem depois das com Série, por ordem_fatura e id", () => {
    const semA = candidata({ id: "b", serie: null, ordem_fatura: 9 });
    const semB = candidata({ id: "a", serie: null, ordem_fatura: 9 });
    const semC = candidata({ id: "z", serie: null, ordem_fatura: 2 });
    const com = candidata({ id: "m", serie: serie(5) });
    const r = escolherCandidatas([real(1), real(2), real(3), real(4)], [semA, semB, semC, com]);
    expect([1, 2, 3, 4].map((o) => r.get(o)?.id)).toEqual(["m", "z", "a", "b"]);
  });

  it("não depende da ordem em que as candidatas chegam", () => {
    const cs = [candidata({ id: "c1", serie: serie(1) }), candidata({ id: "c2", serie: serie(2) }), candidata({ id: "c3", serie: null, ordem_fatura: 4 })];
    const a = escolherCandidatas([real(1), real(2)], cs);
    const b = escolherCandidatas([real(1), real(2)], [...cs].reverse());
    expect([...b]).toEqual([...a]);
  });
});

describe("mesclarHerdada", () => {
  const l = { responsavel_id: null as string | null, tipo_id: null as string | null, revisao_motivo: "sem_classificacao" as const, revisao_dados: null };

  it("a candidata completa tira a linha da fila e dá Apelido e Observação", () => {
    const r = mesclarHerdada(l, { responsavel_id: "r1", tipo_id: "t1", apelido: "Sofá", observacao: "10x" });
    expect(r).toEqual({ responsavel_id: "r1", tipo_id: "t1", apelido: "Sofá", observacao: "10x", revisao_motivo: null, revisao_dados: null });
  });

  it("a herança vale sobre as Regras onde a candidata tem valor; a Regra completa o resto", () => {
    const r = mesclarHerdada(
      { ...l, responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null },
      { responsavel_id: "r1", tipo_id: null, apelido: null, observacao: null },
    );
    expect(r).toMatchObject({ responsavel_id: "r1", tipo_id: "t2", revisao_motivo: null });
  });

  it("a herança resolve a dúvida da Regra quando fica completa", () => {
    const r = mesclarHerdada(
      { ...l, revisao_motivo: "sugestao_duvida" as never, revisao_dados: { responsavel_id: "r3", tipo_id: "t3", outros_responsaveis: [] } as never },
      { responsavel_id: "r1", tipo_id: "t1", apelido: null, observacao: null },
    );
    expect(r).toMatchObject({ revisao_motivo: null, revisao_dados: null });
  });

  it("incompleta: segue o motivo da classificação normal", () => {
    const r = mesclarHerdada(l, { responsavel_id: "r1", tipo_id: null, apelido: null, observacao: null });
    expect(r).toMatchObject({ responsavel_id: "r1", tipo_id: null, revisao_motivo: "sem_classificacao" });
  });
});

describe("emprestaAlgo", () => {
  it("candidata sem nenhum campo não conta como herança", () => {
    expect(emprestaAlgo({ responsavel_id: null, tipo_id: null, apelido: null, observacao: null })).toBe(false);
    expect(emprestaAlgo({ responsavel_id: null, tipo_id: null, apelido: null, observacao: "x" })).toBe(true);
  });
});
