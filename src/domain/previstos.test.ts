import { describe, expect, it } from "vitest";
import {
  atribuirSeries,
  ehParcelaDeSerie,
  gerarPrevistos,
  juntarMudancas,
  planejarPropagacao,
  type LinhaParaPrever,
  type LinhaParaSerie,
} from "./previstos";

function linha(p: Partial<LinhaParaSerie> & { ordem_fatura: number }): LinhaParaSerie {
  return {
    nome_normalizado: "MAGALU",
    valor_centavos: 44_589,
    parcela_n: 5,
    parcela_total: 10,
    ajuste_de_ordem: null,
    ...p,
  };
}

describe("ehParcelaDeSerie", () => {
  it("aceita parcela válida com Valor positivo e que não é Ajuste", () => {
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1 }))).toBe(true);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, parcela_n: 10 }))).toBe(true);
  });

  it("recusa à vista, crédito, Ajuste e parcela inválida", () => {
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, parcela_n: null, parcela_total: null }))).toBe(false);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, valor_centavos: -500 }))).toBe(false);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, valor_centavos: 0 }))).toBe(false);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, ajuste_de_ordem: 2 }))).toBe(false);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, parcela_n: 11 }))).toBe(false);
    expect(ehParcelaDeSerie(linha({ ordem_fatura: 1, parcela_n: 1, parcela_total: 1 }))).toBe(false);
  });
});

describe("atribuirSeries", () => {
  it("chave sem a data: o Mês da primeira parcela vem do Mês da Fatura e da parcela", () => {
    const [l] = atribuirSeries([linha({ ordem_fatura: 1 })], "2026-10");
    expect(l.serie).toEqual({
      nome_normalizado: "MAGALU",
      parcela_total: 10,
      valor_parcela_centavos: 44_589,
      mes_primeira_parcela: "2026-06",
      ocorrencia: 1,
    });
  });

  it("parcela comprada há mais de 12 meses atravessa o ano", () => {
    const [l] = atribuirSeries([linha({ ordem_fatura: 1, parcela_n: 13, parcela_total: 18 })], "2026-10");
    expect(l.serie?.mes_primeira_parcela).toBe("2025-10");
  });

  it("a mesma parcela em Faturas diferentes cai na mesma Série", () => {
    const [out] = atribuirSeries([linha({ ordem_fatura: 7, parcela_n: 5 })], "2026-10");
    const [nov] = atribuirSeries([linha({ ordem_fatura: 3, parcela_n: 6 })], "2026-11");
    expect(out.serie).toEqual(nov.serie);
  });

  it("aceite: duas compras idênticas na mesma Fatura são duas Séries, ocorrencia 1 e 2", () => {
    const r = atribuirSeries([linha({ ordem_fatura: 4 }), linha({ ordem_fatura: 9 })], "2026-10");
    expect(r.map((l) => l.serie?.ocorrencia)).toEqual([1, 2]);
    expect(r[0].serie).not.toEqual(r[1].serie);
    expect({ ...r[0].serie, ocorrencia: 0 }).toEqual({ ...r[1].serie, ocorrencia: 0 });
  });

  it("três compras idênticas e uma diferente: 1, 2, 3 e 1", () => {
    const r = atribuirSeries(
      [
        linha({ ordem_fatura: 1 }),
        linha({ ordem_fatura: 2, valor_centavos: 100 }),
        linha({ ordem_fatura: 3 }),
        linha({ ordem_fatura: 4 }),
      ],
      "2026-10",
    );
    expect(r.map((l) => l.serie?.ocorrencia)).toEqual([1, 1, 2, 3]);
  });

  it("a ocorrencia segue a ordem da fatura, não a da lista", () => {
    const r = atribuirSeries([linha({ ordem_fatura: 9 }), linha({ ordem_fatura: 4 })], "2026-10");
    expect(r.map((l) => l.serie?.ocorrencia)).toEqual([2, 1]);
  });

  it("à vista, crédito e Ajuste ficam sem Série", () => {
    const r = atribuirSeries(
      [
        linha({ ordem_fatura: 1, parcela_n: null, parcela_total: null }),
        linha({ ordem_fatura: 2, valor_centavos: -1 }),
        linha({ ordem_fatura: 3, ajuste_de_ordem: 1 }),
      ],
      "2026-10",
    );
    expect(r.every((l) => l.serie === null)).toBe(true);
  });
});

function prever(p: Partial<LinhaParaPrever> & { ordem_fatura: number }): LinhaParaPrever {
  return {
    nome: "MAGALU",
    nome_normalizado: "MAGALU",
    valor_centavos: 44_589,
    parcela_n: 5,
    parcela_total: 10,
    responsavel_id: "r1",
    tipo_id: "t1",
    serie: {
      nome_normalizado: "MAGALU",
      parcela_total: 10,
      valor_parcela_centavos: 44_589,
      mes_primeira_parcela: "2026-06",
      ocorrencia: 1,
    },
    ...p,
  };
}

describe("gerarPrevistos", () => {
  it("05/10 de out/26 gera 06/10 a 10/10 de nov/26 a mar/27 com a mesma classificação", () => {
    const r = gerarPrevistos([prever({ ordem_fatura: 12 })], "2026-10");
    expect(r.map((p) => [p.parcela_n, p.mes])).toEqual([
      [6, "2026-11"],
      [7, "2026-12"],
      [8, "2027-01"],
      [9, "2027-02"],
      [10, "2027-03"],
    ]);
    expect(r[0]).toEqual({
      ordem_origem: 12,
      nome: "MAGALU",
      nome_normalizado: "MAGALU",
      apelido: null,
      valor_centavos: 44_589,
      parcela_n: 6,
      parcela_total: 10,
      mes: "2026-11",
      responsavel_id: "r1",
      tipo_id: "t1",
      observacao: null,
    });
  });

  it("a última parcela e a linha sem Série não geram previsto", () => {
    expect(gerarPrevistos([prever({ ordem_fatura: 1, parcela_n: 10 })], "2026-10")).toEqual([]);
    expect(gerarPrevistos([prever({ ordem_fatura: 1, serie: null })], "2026-10")).toEqual([]);
  });

  it("Mês que já tem Fatura fica de fora (decisão 1-A)", () => {
    const r = gerarPrevistos([prever({ ordem_fatura: 1 })], "2026-10", ["2026-11", "2027-01"]);
    expect(r.map((p) => p.mes)).toEqual(["2026-12", "2027-02", "2027-03"]);
  });

  it("copia a classificação vazia (previsto sem Responsável nem Tipo)", () => {
    const [p] = gerarPrevistos([prever({ ordem_fatura: 1, responsavel_id: null, tipo_id: null })], "2026-10");
    expect(p.responsavel_id).toBeNull();
    expect(p.tipo_id).toBeNull();
  });
});

describe("planejarPropagacao", () => {
  const vazia = { responsavel_id: null, tipo_id: null };

  it("primeira classificação: preenche os previstos vazios, sem perguntar", () => {
    const plano = planejarPropagacao(vazia, { responsavel_id: "r1", tipo_id: "t1" }, [
      { id: "p1", ...vazia },
      { id: "p2", ...vazia },
    ]);
    expect(plano.silenciosos).toEqual([
      { id: "p1", corpo: { responsavel_id: "r1", tipo_id: "t1" } },
      { id: "p2", corpo: { responsavel_id: "r1", tipo_id: "t1" } },
    ]);
    expect(plano.aPerguntar).toEqual([]);
  });

  it("mudar um valor já preenchido: os previstos com o valor antigo entram na pergunta", () => {
    const plano = planejarPropagacao(
      { responsavel_id: "r1", tipo_id: "t1" },
      { responsavel_id: "r2", tipo_id: "t1" },
      [{ id: "p1", responsavel_id: "r1", tipo_id: "t1" }],
    );
    expect(plano.silenciosos).toEqual([]);
    expect(plano.aPerguntar).toEqual([{ id: "p1", corpo: { responsavel_id: "r2" } }]);
  });

  it("antes vazio e previsto já com outro valor: não toca nele", () => {
    const plano = planejarPropagacao(vazia, { responsavel_id: "r2", tipo_id: null }, [
      { id: "p1", responsavel_id: "r1", tipo_id: null },
    ]);
    expect(plano).toEqual({ silenciosos: [], aPerguntar: [] });
  });

  it("limpar um campo não propaga; igual não muda nada", () => {
    expect(
      planejarPropagacao({ responsavel_id: "r1", tipo_id: "t1" }, { responsavel_id: null, tipo_id: "t1" }, [
        { id: "p1", responsavel_id: "r1", tipo_id: "t1" },
      ]),
    ).toEqual({ silenciosos: [], aPerguntar: [] });
  });

  it("campos diferentes do mesmo previsto: um silencioso e outro na pergunta", () => {
    const plano = planejarPropagacao(
      { responsavel_id: "r1", tipo_id: null },
      { responsavel_id: "r2", tipo_id: "t1" },
      [{ id: "p1", responsavel_id: "r1", tipo_id: null }],
    );
    expect(plano.silenciosos).toEqual([{ id: "p1", corpo: { tipo_id: "t1" } }]);
    expect(plano.aPerguntar).toEqual([{ id: "p1", corpo: { responsavel_id: "r2" } }]);
    expect(juntarMudancas(plano.silenciosos, plano.aPerguntar)).toEqual([
      { id: "p1", corpo: { tipo_id: "t1", responsavel_id: "r2" } },
    ]);
  });
});
