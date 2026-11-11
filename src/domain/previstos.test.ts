import { describe, expect, it } from "vitest";
import type { MotivoRevisao } from "./classificacao";
import {
  aplicarCasamento,
  atribuirSeries,
  casarPrevistos,
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

  it("a herdeira empresta Apelido e Observação aos previstos seguintes (História 3.7)", () => {
    const [p] = gerarPrevistos([prever({ ordem_fatura: 1, apelido: "Sofá", observacao: "10x" })], "2026-10");
    expect(p).toMatchObject({ apelido: "Sofá", observacao: "10x" });
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

// ---------------------------------------------------------------------------
// Casamento (História 3.6)

describe("casarPrevistos", () => {
  const real = (ordem: number, valor: number, over: Partial<Parameters<typeof casarPrevistos>[0][number]> = {}) => ({
    nome_normalizado: "MAGALU",
    valor_centavos: valor,
    parcela_n: 7,
    parcela_total: 10,
    ordem_fatura: ordem,
    ajuste_de_ordem: null,
    ...over,
  });
  const prev = (id: string, valor: number, ocorrencia: number, over: Partial<Parameters<typeof casarPrevistos>[1][number]> = {}) => ({
    id,
    nome_normalizado: "MAGALU",
    parcela_n: 7,
    parcela_total: 10,
    valor_centavos: valor,
    ocorrencia,
    responsavel_id: null,
    tipo_id: null,
    ...over,
  });

  it("casa um real com o previsto de mesmo Valor", () => {
    const r = casarPrevistos([real(3, 44589)], [prev("p1", 44589, 1)]);
    expect(r).toEqual({ casados: [{ ordem_fatura: 3, previsto_id: "p1" }], semPar: [] });
  });

  it("duas compras idênticas casam na ordem da fatura e da ocorrencia", () => {
    const r = casarPrevistos([real(5, 100), real(2, 100)], [prev("p2", 100, 2), prev("p1", 100, 1)]);
    expect(r.casados).toEqual([
      { ordem_fatura: 2, previsto_id: "p1" },
      { ordem_fatura: 5, previsto_id: "p2" },
    ]);
    expect(r.semPar).toEqual([]);
  });

  it("Valor igual vem primeiro, mesmo contra a ocorrencia", () => {
    const r = casarPrevistos([real(1, 200), real(2, 100)], [prev("p1", 100, 1), prev("p2", 200, 2)]);
    expect(r.casados).toEqual([
      { ordem_fatura: 1, previsto_id: "p2" },
      { ordem_fatura: 2, previsto_id: "p1" },
    ]);
  });

  it("um Valor diferente não rouba o par de quem tem Valor igual", () => {
    const r = casarPrevistos([real(1, 150), real(2, 100)], [prev("p1", 100, 1), prev("p2", 200, 2)]);
    expect(r.casados).toEqual([
      { ordem_fatura: 1, previsto_id: "p2" },
      { ordem_fatura: 2, previsto_id: "p1" },
    ]);
  });

  it("sem previsto de Valor igual, usa a menor ocorrencia", () => {
    const r = casarPrevistos([real(1, 44910)], [prev("p2", 44589, 2), prev("p1", 44589, 1)]);
    expect(r.casados).toEqual([{ ordem_fatura: 1, previsto_id: "p1" }]);
    expect(r.semPar).toEqual(["p2"]);
  });

  it("menos reais que previstos: o que sobra é sem par", () => {
    const r = casarPrevistos([real(1, 100)], [prev("p1", 100, 1), prev("p2", 100, 2)]);
    expect(r.semPar).toEqual(["p2"]);
  });

  it("mais reais que previstos: o real que sobra fica sem par de previsto", () => {
    const r = casarPrevistos([real(1, 100), real(2, 100)], [prev("p1", 100, 1)]);
    expect(r.casados).toEqual([{ ordem_fatura: 1, previsto_id: "p1" }]);
  });

  it("só casa dentro da chave (Nome, parcela, total)", () => {
    const r = casarPrevistos(
      [real(1, 100, { parcela_n: 8 }), real(2, 100, { nome_normalizado: "OUTRA" }), real(3, 100, { parcela_total: 12 })],
      [prev("p1", 100, 1)],
    );
    expect(r.casados).toEqual([]);
    expect(r.semPar).toEqual(["p1"]);
  });

  it("ignora Ajuste, crédito e linha sem parcela", () => {
    const r = casarPrevistos(
      [real(1, 100, { ajuste_de_ordem: 9 }), real(2, -100), real(3, 100, { parcela_n: null, parcela_total: null })],
      [prev("p1", 100, 1)],
    );
    expect(r.casados).toEqual([]);
  });

  it("não depende da ordem em que os previstos chegam", () => {
    const a = casarPrevistos([real(1, 100), real(2, 100)], [prev("p1", 100, 1), prev("p2", 100, 2)]);
    const b = casarPrevistos([real(1, 100), real(2, 100)], [prev("p2", 100, 2), prev("p1", 100, 1)]);
    expect(b).toEqual(a);
  });
});

describe("aplicarCasamento", () => {
  const base = {
    nome_normalizado: "MAGALU",
    parcela_n: 7,
    parcela_total: 10,
    ordem_fatura: 1,
    ajuste_de_ordem: null,
    valor_centavos: 44910,
    responsavel_id: null as string | null,
    tipo_id: null as string | null,
    revisao_motivo: "sem_classificacao" as MotivoRevisao | null,
    revisao_dados: null,
    serie: { nome_normalizado: "MAGALU", parcela_total: 10, valor_parcela_centavos: 44910, mes_primeira_parcela: "2026-06", ocorrencia: 1 },
  };
  const previsto = (over: Partial<Parameters<typeof aplicarCasamento>[2][number]> = {}) => ({
    id: "p1",
    nome_normalizado: "MAGALU",
    parcela_n: 7,
    parcela_total: 10,
    valor_centavos: 44589,
    ocorrencia: 1,
    responsavel_id: "r1" as string | null,
    tipo_id: "t1" as string | null,
    ...over,
  });
  const par = { casados: [{ ordem_fatura: 1, previsto_id: "p1" }], semPar: [] };

  it("linha sem par fica como está, sem previsto_id", () => {
    const [l] = aplicarCasamento([base], { casados: [], semPar: ["p1"] }, [previsto()]);
    expect(l.previsto_id).toBeNull();
    expect(l.serie).toBe(base.serie);
  });

  it("Valor igual e classificado: mantém a classificação, sem motivo, e perde a chave da Série", () => {
    const [l] = aplicarCasamento([{ ...base, valor_centavos: 44589 }], par, [previsto()]);
    expect(l).toMatchObject({ previsto_id: "p1", serie: null, responsavel_id: "r1", tipo_id: "t1", revisao_motivo: null, revisao_dados: null });
  });

  it("Valor diferente e classificado: 'valor_mudou' com o antes", () => {
    const [l] = aplicarCasamento([base], par, [previsto()]);
    expect(l).toMatchObject({ valor_centavos: 44910, revisao_motivo: "valor_mudou", revisao_dados: { antes_centavos: 44589 } });
  });

  it("previsto vazio: recebe o que as Regras calcularam e, se completo, sai da fila", () => {
    const [l] = aplicarCasamento([{ ...base, valor_centavos: 44589, responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null }], par, [
      previsto({ responsavel_id: null, tipo_id: null }),
    ]);
    expect(l).toMatchObject({ responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null });
  });

  it("a classificação do previsto vale sobre a das Regras; a Regra completa só o que falta", () => {
    const [l] = aplicarCasamento([{ ...base, valor_centavos: 44589, responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null }], par, [
      previsto({ tipo_id: null }),
    ]);
    expect(l).toMatchObject({ responsavel_id: "r1", tipo_id: "t2", revisao_motivo: null });
  });

  it("o Ajuste de centavos da mãe casada recebe a classificação final dela, sem motivo", () => {
    const ajuste = { ...base, ordem_fatura: 2, ajuste_de_ordem: 1, parcela_n: null, parcela_total: null, valor_centavos: -8, revisao_motivo: null, serie: null };
    const [mae, aj] = aplicarCasamento([{ ...base, valor_centavos: 44589 }, ajuste], par, [previsto()]);
    expect(mae).toMatchObject({ responsavel_id: "r1", tipo_id: "t1" });
    expect(aj).toMatchObject({ responsavel_id: "r1", tipo_id: "t1", revisao_motivo: null, previsto_id: null });
  });

  it("compras idênticas com um previsto só: a parcela sem par sobe a ocorrencia para uma Série livre", () => {
    const chave = (ocorrencia: number) => ({ ...base.serie, ocorrencia });
    const real1 = { ...base, valor_centavos: 44589, ordem_fatura: 1, serie: chave(1) };
    const real2 = { ...base, valor_centavos: 44589, ordem_fatura: 2, serie: chave(2) };
    // Só sobrou o previsto da ocorrencia 2 (o da 1 foi excluído): o 1º real casa com ele e o 2º ficaria na mesma Série.
    const p2 = previsto({ serie: chave(2), responsavel_id: null, tipo_id: null });
    const casamento = casarPrevistos([real1, real2], [p2]);
    const [a, b] = aplicarCasamento([real1, real2], casamento, [p2]);
    expect(a.previsto_id).toBe("p1");
    expect(a.serie).toBeNull();
    expect(b.previsto_id).toBeNull();
    expect(b.serie?.ocorrencia).toBe(3);
  });

  it("sem conflito de Série a ocorrencia calculada fica como está", () => {
    const real = { ...base, ordem_fatura: 1 };
    const [l] = aplicarCasamento([real], { casados: [], semPar: [] }, [previsto({ serie: { ...base.serie, ocorrencia: 7 } })]);
    expect(l.serie?.ocorrencia).toBe(1);
  });

  it("incompleto com Valor diferente: vale o motivo de classificação (Q2-A)", () => {
    const [l] = aplicarCasamento([base], par, [previsto({ responsavel_id: null, tipo_id: null })]);
    expect(l).toMatchObject({ valor_centavos: 44910, revisao_motivo: "sem_classificacao", revisao_dados: null });
  });
});

describe("aplicarCasamento com herança (História 3.7)", () => {
  const chave = (ocorrencia: number, mes = "2026-07") => ({
    nome_normalizado: "MAGALU",
    parcela_total: 10,
    valor_parcela_centavos: 44589,
    mes_primeira_parcela: mes,
    ocorrencia,
  });
  const nova = (ordem_fatura: number, over: Record<string, unknown> = {}) => ({
    nome_normalizado: "MAGALU",
    parcela_n: 5,
    parcela_total: 10,
    ordem_fatura,
    ajuste_de_ordem: null as number | null,
    valor_centavos: 44589,
    responsavel_id: null as string | null,
    tipo_id: null as string | null,
    revisao_motivo: "sem_classificacao" as MotivoRevisao | null,
    revisao_dados: null,
    serie: chave(ordem_fatura),
    ...over,
  });
  const candidata = (id: string, ocorrencia: number | null, over: Record<string, unknown> = {}) => ({
    id,
    nome_normalizado: "MAGALU",
    parcela_n: 4,
    parcela_total: 10,
    valor_centavos: 44589,
    ordem_fatura: null,
    responsavel_id: "r1" as string | null,
    tipo_id: "t1" as string | null,
    apelido: null as string | null,
    observacao: null as string | null,
    serie: ocorrencia === null ? null : chave(ocorrencia),
    proxima_ocupada: false,
    ...over,
  });
  const semCasar = { casados: [], semPar: [] as string[] };

  it("herda a classificação, entra na Série da candidata e sai da fila", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, [], [candidata("c1", 1, { apelido: "Sofá", observacao: "10x" })]);
    expect(l).toMatchObject({
      responsavel_id: "r1",
      tipo_id: "t1",
      apelido: "Sofá",
      observacao: "10x",
      revisao_motivo: null,
      herdado_de_id: "c1",
      previsto_id: null,
      serie: chave(1, "2026-07"),
    });
  });

  it("entra na ocorrencia da candidata, mesmo diferente da calculada pela fatura", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, [], [candidata("c2", 2)]);
    expect(l.serie?.ocorrencia).toBe(2);
    expect(l.herdado_de_id).toBe("c2");
  });

  it("várias candidatas: escolhe a de menor ocorrencia", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, [], [candidata("c3", 3), candidata("c1", 1), candidata("c2", 2)]);
    expect(l.herdado_de_id).toBe("c1");
  });

  it("compras idênticas: cada real herda uma candidata, sem estourar a restrição única", () => {
    const [a, b] = aplicarCasamento([nova(1, { serie: chave(1) }), nova(2, { serie: chave(2) })], semCasar, [], [candidata("c2", 2), candidata("c1", 1)]);
    expect([a.herdado_de_id, a.serie?.ocorrencia]).toEqual(["c1", 1]);
    expect([b.herdado_de_id, b.serie?.ocorrencia]).toEqual(["c2", 2]);
  });

  it("a parcela sem par que sobra sobe a ocorrencia para fugir da Série que a herdeira tomou", () => {
    // Só a candidata da ocorrencia 2 serve (a 1 tem a parcela seguinte ocupada): a 1ª real herda a 2 e a 2ª, que
    // a fatura calculou como 2, sobe para 3.
    const [a, b] = aplicarCasamento(
      [nova(1, { serie: chave(1) }), nova(2, { serie: chave(2) })],
      semCasar,
      [],
      [candidata("c1", 1, { proxima_ocupada: true }), candidata("c2", 2)],
    );
    expect([a.herdado_de_id, a.serie?.ocorrencia]).toEqual(["c2", 2]);
    expect([b.herdado_de_id, b.serie?.ocorrencia]).toEqual([null, 3]);
  });

  it("duas reais e uma candidata: a 1ª herda; a 2ª segue as Regras numa Série livre", () => {
    const [a, b] = aplicarCasamento(
      [nova(1, { serie: chave(1) }), nova(2, { serie: chave(2), responsavel_id: "r9", tipo_id: null, revisao_motivo: "sugestao" })],
      semCasar,
      [],
      [candidata("c1", 1)],
    );
    expect(a.herdado_de_id).toBe("c1");
    expect(b).toMatchObject({ herdado_de_id: null, responsavel_id: "r9", tipo_id: null, revisao_motivo: "sugestao" });
    expect(b.serie?.ocorrencia).toBe(2);
  });

  it("a linha que casou com um previsto não herda: vale o previsto (3.6)", () => {
    const previsto = { id: "p1", nome_normalizado: "MAGALU", parcela_n: 5, parcela_total: 10, valor_centavos: 44589, ocorrencia: 1, responsavel_id: "r5", tipo_id: "t5" };
    const [l] = aplicarCasamento([nova(1)], { casados: [{ ordem_fatura: 1, previsto_id: "p1" }], semPar: [] }, [previsto], [candidata("c1", 1)]);
    expect(l).toMatchObject({ previsto_id: "p1", responsavel_id: "r5", tipo_id: "t5", herdado_de_id: null });
  });

  it("a candidata cuja Série já tem a parcela n num previsto do Mês não serve", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, [], [candidata("c1", 1, { proxima_ocupada: true })]);
    expect(l.herdado_de_id).toBeNull();
    expect(l.revisao_motivo).toBe("sem_classificacao");
  });

  it("a primeira parcela, a à vista e o Ajuste não herdam", () => {
    const ajuste = nova(3, { ajuste_de_ordem: 1, parcela_n: null, parcela_total: null, valor_centavos: -8, revisao_motivo: null, serie: null });
    const r = aplicarCasamento(
      [nova(1, { parcela_n: 1 }), nova(2, { parcela_n: null, parcela_total: null, serie: null }), ajuste],
      semCasar,
      [],
      [candidata("c0", 1, { parcela_n: 0 }), candidata("c1", 1)],
    );
    expect(r.map((l) => l.herdado_de_id)).toEqual([null, null, null]);
  });

  it("candidata sem Série empresta os campos e a linha fica na Série da 3.5", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, [], [candidata("c1", null)]);
    expect(l).toMatchObject({ herdado_de_id: "c1", responsavel_id: "r1", serie: chave(1, "2026-07") });
  });

  it("candidata sem classificação entra na Série mas não conta como herança e a linha segue as Regras", () => {
    const [l] = aplicarCasamento(
      [nova(1, { responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null })],
      semCasar,
      [],
      [candidata("c1", 2, { responsavel_id: null, tipo_id: null })],
    );
    expect(l).toMatchObject({ herdado_de_id: null, responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null });
    expect(l.serie?.ocorrencia).toBe(2);
  });

  it("a herança vale sobre a Regra; a Regra completa o que a candidata não tem", () => {
    const [l] = aplicarCasamento(
      [nova(1, { responsavel_id: "r2", tipo_id: "t2", revisao_motivo: null })],
      semCasar,
      [],
      [candidata("c1", 1, { tipo_id: null })],
    );
    expect(l).toMatchObject({ responsavel_id: "r1", tipo_id: "t2", revisao_motivo: null, herdado_de_id: "c1" });
  });

  it("o Ajuste de centavos da mãe herdeira recebe a classificação herdada", () => {
    const ajuste = nova(2, { ajuste_de_ordem: 1, parcela_n: null, parcela_total: null, valor_centavos: -8, revisao_motivo: null, serie: null });
    const [, aj] = aplicarCasamento([nova(1), ajuste], semCasar, [], [candidata("c1", 1)]);
    expect(aj).toMatchObject({ responsavel_id: "r1", tipo_id: "t1", revisao_motivo: null, herdado_de_id: null });
  });

  it("sem candidatas nada muda", () => {
    const [l] = aplicarCasamento([nova(1)], semCasar, []);
    expect(l).toMatchObject({ herdado_de_id: null, revisao_motivo: "sem_classificacao" });
    expect(l.serie).toEqual(chave(1));
  });
});
