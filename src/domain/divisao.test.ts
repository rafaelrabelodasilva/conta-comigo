import { describe, expect, it } from "vitest";
import {
  agruparPartes,
  avaliarRascunho,
  converterRascunho,
  copiarDivisao,
  ehFilha,
  ehMaeDividida,
  estaClassificada,
  filhasPorMae,
  juntarItensDividir,
  lerDivisao,
  lerFracao,
  linhasDaFatura,
  mesmaDivisao,
  motivoParaNaoDividir,
  partesDaImportacao,
  planejarDesfazerDivisao,
  planejarDivisao,
  planejarDivisaoNosPrevistos,
  rascunhoDaDivisao,
  unidadesDoMes,
  valoresDasPartes,
  type Divisao,
  type MaeParaDividir,
  type ParteRascunho,
  type PrevistoParaDividir,
} from "./divisao";

const MAE = "mae-1";
const RAFAEL = "r-rafael";
const MAE_PESSOA = "r-mae";

const doisTercos: Divisao = {
  modo: "proporcao",
  partes: [
    { responsavel_id: MAE_PESSOA, numerador: 2, denominador: 3 },
    { responsavel_id: RAFAEL, numerador: 1, denominador: 3 },
  ],
};

const mae = (extra: Partial<MaeParaDividir> = {}): MaeParaDividir => ({
  id: MAE,
  valor_centavos: 46600,
  responsavel_id: null,
  tipo_id: "t-saude",
  fatura_id: "f-1",
  revisao_motivo: "sem_classificacao",
  revisao_dados: null,
  divisao: null,
  ...extra,
});

const rascunho = (...partes: [string | null, string][]): ParteRascunho[] =>
  partes.map(([responsavel_id, texto]) => ({ responsavel_id, texto, status_id: null }));

describe("lerFracao", () => {
  it("lê a/b e percentual, sempre reduzida", () => {
    expect(lerFracao("2/3")).toEqual({ ok: true, valor: { numerador: 2, denominador: 3 } });
    expect(lerFracao(" 4 / 6 ")).toEqual({ ok: true, valor: { numerador: 2, denominador: 3 } });
    expect(lerFracao("50%")).toEqual({ ok: true, valor: { numerador: 1, denominador: 2 } });
    expect(lerFracao("33,33%")).toEqual({ ok: true, valor: { numerador: 3333, denominador: 10000 } });
    expect(lerFracao("12.5%")).toEqual({ ok: true, valor: { numerador: 1, denominador: 8 } });
  });

  it("recusa zero, termos grandes e texto solto", () => {
    for (const t of ["", "0/3", "1/0", "abc", "1/2/3", "0%", "101%", "2000000/3", "0,001%", "1"]) {
      expect(lerFracao(t)).toEqual({ ok: false, erro: { codigo: "divisao.fracao_invalida" } });
    }
  });
});

describe("avaliarRascunho (aceite: a soma das partes é sempre o Valor)", () => {
  it("Monjaro: 2/3 + 1/3 de R$ 466,00 = R$ 310,67 + R$ 155,33", () => {
    const a = avaliarRascunho(46600, "proporcao", rascunho([MAE_PESSOA, "2/3"], [RAFAEL, "1/3"]));
    expect(a.erro).toBeNull();
    expect(a.valores).toEqual([31067, 15533]);
    expect(a.somaCentavos).toBe(46600);
    expect(a.divisao?.partes.map((p) => [p.numerador, p.denominador])).toEqual([[2, 3], [1, 3]]);
  });

  it("por valor guarda valor/total e reproduz os mesmos centavos", () => {
    const a = avaliarRascunho(46600, "valor", rascunho([MAE_PESSOA, "310,67"], [RAFAEL, "155,33"]));
    expect(a.erro).toBeNull();
    expect(a.valores).toEqual([31067, 15533]);
    const d = a.divisao as Divisao;
    expect(d.modo).toBe("valor");
    expect(d.partes[0]).toMatchObject({ numerador: 31067, denominador: 46600 });
    expect(valoresDasPartes(46600, d)).toEqual({ ok: true, valor: [31067, 15533] });
  });

  it("por valor com soma diferente não libera e mostra a soma digitada", () => {
    const a = avaliarRascunho(46600, "valor", rascunho([MAE_PESSOA, "300,00"], [RAFAEL, "155,33"]));
    expect(a.erro).toBe("divisao.soma_diferente");
    expect(a.somaCentavos).toBe(45533);
    expect(a.divisao).toBeNull();
  });

  it("crédito divide e a soma é o Valor (− R$ 100,01 em 1/3 + 2/3)", () => {
    const a = avaliarRascunho(-10001, "proporcao", rascunho([RAFAEL, "1/3"], [MAE_PESSOA, "2/3"]));
    expect(a.erro).toBeNull();
    expect(a.valores).toEqual([-3334, -6667]);
    expect(a.valores.reduce((s: number, v) => s + (v as number), 0)).toBe(-10001);
  });

  it("crédito por valor aceita os valores sem sinal", () => {
    const a = avaliarRascunho(-10001, "valor", rascunho([RAFAEL, "33,34"], [MAE_PESSOA, "66,67"]));
    expect(a.erro).toBeNull();
    expect(a.valores).toEqual([-3334, -6667]);
    expect(valoresDasPartes(-10001, a.divisao as Divisao)).toEqual({ ok: true, valor: [-3334, -6667] });
  });

  it("a soma das filhas é sempre o Valor, em vários Valores e proporções", () => {
    const valores = [1, 2, 3, 99, 100, 101, 46600, 123457, -1, -7, -46601, 89_999_999, -90_000_000];
    const fracoes = ["1/2,1/2", "1/3,1/3,1/3", "1/7,2/7,4/7", "33,33%,33,33%,33,34%", "1/10,9/10"];
    for (const v of valores) {
      for (const f of fracoes) {
        const textos = f.includes("%") ? f.match(/\d+,\d+%/g)! : f.split(",");
        const partes = rascunho(...textos.map((t, i): [string, string] => [`r${i}`, t]));
        const a = avaliarRascunho(v, "proporcao", partes);
        if (a.erro === null) expect(a.valores.reduce((s: number, x) => s + (x as number), 0)).toBe(v);
        else expect(a.erro).toBe("divisao.parte_zerada");
      }
    }
  });

  it("frações que não somam 1 não liberam", () => {
    const a = avaliarRascunho(46600, "proporcao", rascunho([MAE_PESSOA, "1/2"], [RAFAEL, "1/3"]));
    expect(a.erro).toBe("divisao.fracoes_invalidas");
    expect(a.somaCentavos).toBeNull();
  });

  it("parte zerada pelo arredondamento é recusada", () => {
    const a = avaliarRascunho(1, "proporcao", rascunho([MAE_PESSOA, "1/3"], [RAFAEL, "2/3"]));
    expect(a.erro).toBe("divisao.parte_zerada");
  });

  it("limites: Valor zero, Valor grande, poucas e demais partes, sem Responsável", () => {
    expect(avaliarRascunho(0, "proporcao", rascunho([RAFAEL, "1/2"], [MAE_PESSOA, "1/2"])).erro).toBe("divisao.valor_zero");
    expect(avaliarRascunho(90_000_001, "proporcao", rascunho([RAFAEL, "1/2"], [MAE_PESSOA, "1/2"])).erro).toBe(
      "divisao.valor_grande",
    );
    expect(avaliarRascunho(1000, "proporcao", rascunho([RAFAEL, "1/1"])).erro).toBe("divisao.poucas_partes");
    const onze = Array.from({ length: 11 }, (_, i): [string, string] => [`r${i}`, "1/11"]);
    expect(avaliarRascunho(100000, "proporcao", rascunho(...onze)).erro).toBe("divisao.partes_demais");
    const dez = Array.from({ length: 10 }, (_, i): [string, string] => [`r${i}`, "1/10"]);
    expect(avaliarRascunho(100000, "proporcao", rascunho(...dez)).erro).toBeNull();
    expect(avaliarRascunho(1000, "proporcao", rascunho([null, "1/2"], [RAFAEL, "1/2"])).erro).toBe("divisao.sem_responsavel");
  });

  it("valor ilegível ou parte zerada no modo valor", () => {
    expect(avaliarRascunho(1000, "valor", rascunho([RAFAEL, "abc"], [MAE_PESSOA, "5,00"])).erro).toBe("dinheiro.invalido");
    expect(avaliarRascunho(1000, "valor", rascunho([RAFAEL, "0"], [MAE_PESSOA, "10,00"])).erro).toBe("divisao.parte_zerada");
  });

  it("o valor mais perto do teto não estoura", () => {
    const a = avaliarRascunho(90_000_000, "valor", rascunho([RAFAEL, "899.999,99"], [MAE_PESSOA, "0,01"]));
    expect(a.erro).toBeNull();
    expect(valoresDasPartes(90_000_000, a.divisao as Divisao)).toEqual({ ok: true, valor: [89_999_999, 1] });
  });
});

describe("converterRascunho / rascunhoDaDivisao", () => {
  it("troca o modo mostrando a mesma Divisão", () => {
    const prop = rascunho([MAE_PESSOA, "2/3"], [RAFAEL, "1/3"]);
    const valor = converterRascunho(46600, "proporcao", prop);
    expect(valor.map((p) => p.texto)).toEqual(["310,67", "155,33"]);
    const volta = converterRascunho(46600, "valor", valor);
    expect(volta.map((p) => p.texto)).toEqual(["31067/46600", "15533/46600"].map((t) => t));
  });

  it("rascunho inválido não muda", () => {
    const ruim = rascunho([MAE_PESSOA, "2/3"], [RAFAEL, "x"]);
    expect(converterRascunho(46600, "proporcao", ruim)).toEqual(ruim);
  });

  it("reabre uma Divisão gravada com o Status de cada filha", () => {
    const d: Divisao = {
      modo: "valor",
      partes: [
        { responsavel_id: MAE_PESSOA, numerador: 31067, denominador: 46600, filha_id: "f1" },
        { responsavel_id: RAFAEL, numerador: 15533, denominador: 46600, filha_id: "f2" },
      ],
    };
    const r = rascunhoDaDivisao(46600, d, new Map([["f1", "s-pago"]]), "s-padrao");
    expect(r).toEqual([
      { responsavel_id: MAE_PESSOA, texto: "310,67", status_id: "s-pago", filha_id: "f1" },
      { responsavel_id: RAFAEL, texto: "155,33", status_id: "s-padrao", filha_id: "f2" },
    ]);
  });
});

describe("lerDivisao / copiarDivisao / mesmaDivisao", () => {
  it("lê só Divisão válida", () => {
    expect(lerDivisao(doisTercos)).toEqual(doisTercos);
    expect(lerDivisao(null)).toBeNull();
    expect(lerDivisao({ modo: "x", partes: doisTercos.partes })).toBeNull();
    expect(lerDivisao({ modo: "valor", partes: [doisTercos.partes[0]] })).toBeNull();
    expect(lerDivisao({ modo: "valor", partes: [{ responsavel_id: "a", numerador: 0, denominador: 1 }, doisTercos.partes[1]] })).toBeNull();
  });

  it("copia sem filha_id nem Responsável de antes", () => {
    const d: Divisao = {
      ...doisTercos,
      responsavel_antes: "x",
      partes: [{ ...doisTercos.partes[0], filha_id: "f1" }, doisTercos.partes[1]],
    };
    expect(copiarDivisao(d)).toEqual(doisTercos);
    expect(mesmaDivisao(d, doisTercos)).toBe(true);
    expect(mesmaDivisao(d, null)).toBe(false);
    expect(mesmaDivisao(null, null)).toBe(true);
  });
});

describe("quem entra em soma", () => {
  const linhas = [
    { id: "a", divisao: null, dividido_de_id: null },
    { id: "m", divisao: doisTercos, dividido_de_id: null },
    { id: "f1", divisao: null, dividido_de_id: "m" },
    { id: "f2", divisao: null, dividido_de_id: "m" },
  ];

  it("unidades tira as mães divididas; a Fatura tira as filhas", () => {
    expect(unidadesDoMes(linhas).map((l) => l.id)).toEqual(["a", "f1", "f2"]);
    expect(linhasDaFatura(linhas).map((l) => l.id)).toEqual(["a", "m"]);
    expect(ehMaeDividida(linhas[1])).toBe(true);
    expect(ehFilha(linhas[2])).toBe(true);
  });

  it("classificada: Tipo e (Responsável ou Divisão)", () => {
    expect(estaClassificada({ responsavel_id: null, tipo_id: "t", divisao: doisTercos })).toBe(true);
    expect(estaClassificada({ responsavel_id: "r", tipo_id: "t" })).toBe(true);
    expect(estaClassificada({ responsavel_id: null, tipo_id: "t" })).toBe(false);
    expect(estaClassificada({ responsavel_id: null, tipo_id: null, divisao: doisTercos })).toBe(false);
  });

  it("filhas por mãe, na ordem das partes, sem as excluídas", () => {
    const d: Divisao = {
      ...doisTercos,
      partes: [
        { ...doisTercos.partes[0], filha_id: "f2" },
        { ...doisTercos.partes[1], filha_id: "f1" },
      ],
    };
    const ls = [
      { id: "m", divisao: d, dividido_de_id: null, excluido_em: null },
      { id: "f1", divisao: null, dividido_de_id: "m", excluido_em: null },
      { id: "f2", divisao: null, dividido_de_id: "m", excluido_em: null },
      { id: "f3", divisao: null, dividido_de_id: "m", excluido_em: "2026-11-11" },
    ];
    expect(filhasPorMae(ls).get("m")?.map((f) => f.id)).toEqual(["f2", "f1"]);
  });
});

describe("planejarDivisao / planejarDesfazerDivisao", () => {
  it("divide: mãe sem Responsável, sai da fila, partes com os valores", () => {
    const r = planejarDivisao(mae({ responsavel_id: "r-antes" }), doisTercos, { agora: "AGORA", status: ["s1", undefined] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.corpo).toEqual({
      divisao: { ...doisTercos, responsavel_antes: "r-antes" },
      responsavel_id: null,
      revisao_motivo: null,
      revisao_dados: null,
      revisado_em: "AGORA",
      editado_em: "AGORA",
    });
    expect(r.valor.partes).toEqual([
      { filha_id: null, responsavel_id: MAE_PESSOA, valor_centavos: 31067, status_id: "s1" },
      { filha_id: null, responsavel_id: RAFAEL, valor_centavos: 15533 },
    ]);
  });

  it("redividir mantém o Responsável de antes e as filhas pela posição", () => {
    const antes: Divisao = {
      ...doisTercos,
      responsavel_antes: "r-antes",
      partes: [
        { ...doisTercos.partes[0], filha_id: "f1" },
        { ...doisTercos.partes[1], filha_id: "f2" },
      ],
    };
    const nova: Divisao = {
      modo: "proporcao",
      partes: [
        { responsavel_id: MAE_PESSOA, numerador: 1, denominador: 2, filha_id: "f1" },
        { responsavel_id: RAFAEL, numerador: 1, denominador: 2, filha_id: "f2" },
      ],
    };
    const r = planejarDivisao(mae({ divisao: antes, revisao_motivo: null }), nova, { agora: "A" });
    expect(r.ok && r.valor.corpo.divisao?.responsavel_antes).toBe("r-antes");
    expect(r.ok && r.valor.corpo.revisao_motivo).toBeUndefined();
    expect(r.ok && r.valor.partes.map((p) => [p.filha_id, p.valor_centavos])).toEqual([["f1", 23300], ["f2", 23300]]);
  });

  it("recusa sem Tipo, filha, Ajuste e parte zerada", () => {
    expect(planejarDivisao(mae({ tipo_id: null }), doisTercos)).toEqual({ ok: false, erro: { codigo: "divisao.sem_tipo" } });
    expect(planejarDivisao(mae({ dividido_de_id: "x" }), doisTercos).ok).toBe(false);
    expect(planejarDivisao(mae({ ajuste_de_id: "x" }), doisTercos).ok).toBe(false);
    expect(planejarDivisao(mae({ valor_centavos: 1 }), doisTercos)).toEqual({
      ok: false,
      erro: { codigo: "divisao.parte_zerada" },
    });
  });

  it("propagação a previsto não marca editado_em nem revisado_em", () => {
    const r = planejarDivisao(mae({ fatura_id: null, revisao_motivo: null }), doisTercos);
    expect(r.ok && r.valor.corpo).toEqual({ divisao: { ...doisTercos, responsavel_antes: null }, responsavel_id: null });
  });

  it("desfazer devolve o Responsável de antes", () => {
    const d: Divisao = { ...doisTercos, responsavel_antes: "r-antes" };
    const r = planejarDesfazerDivisao(mae({ divisao: d, revisao_motivo: null }), "A");
    expect(r).toEqual({
      ok: true,
      valor: { id: MAE, corpo: { divisao: null, responsavel_id: "r-antes", editado_em: "A" }, partes: [] },
    });
  });

  it("desfazer uma Divisão da Regra volta à fila como sem classificação", () => {
    const d: Divisao = { ...doisTercos, regra_chave: "JIM COM", responsavel_antes: null };
    const r = planejarDesfazerDivisao(mae({ divisao: d, revisao_motivo: null }), "A");
    expect(r.ok && r.valor.corpo).toEqual({
      divisao: null,
      responsavel_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
      revisado_em: null,
      editado_em: "A",
    });
  });

  it("desfazer linha sem Divisão é recusado", () => {
    expect(planejarDesfazerDivisao(mae()).ok).toBe(false);
  });
});

describe("propagação aos previstos", () => {
  const previsto = (id: string, extra: Partial<PrevistoParaDividir> = {}): PrevistoParaDividir => ({
    ...mae({ id, fatura_id: null, revisao_motivo: null, valor_centavos: 46600 }),
    ...extra,
  });
  const sem = { responsavel_id: null, divisao: null };

  it("previsto vazio recebe sozinho; previsto com outro Responsável pergunta", () => {
    const plano = planejarDivisaoNosPrevistos({ responsavel_id: "r1", divisao: null }, { responsavel_id: null, divisao: doisTercos }, [
      previsto("p1"),
      previsto("p2", { responsavel_id: "r9" }),
    ]);
    expect(plano.silenciosos.map((i) => i.id)).toEqual(["p1"]);
    expect(plano.aPerguntar.map((i) => i.id)).toEqual(["p2"]);
  });

  it("se a parcela não tinha nada antes, previsto preenchido não pergunta", () => {
    const plano = planejarDivisaoNosPrevistos(sem, { responsavel_id: null, divisao: doisTercos }, [
      previsto("p2", { responsavel_id: "r9" }),
    ]);
    expect(plano).toEqual({ silenciosos: [], aPerguntar: [] });
  });

  it("cada previsto é dividido com o próprio Valor", () => {
    const plano = planejarDivisaoNosPrevistos(sem, { responsavel_id: null, divisao: doisTercos }, [previsto("p1", { valor_centavos: 100 })]);
    expect(plano.silenciosos[0].partes.map((p) => p.valor_centavos)).toEqual([67, 33]);
  });

  it("previsto já dividido igual não muda; redividir reaproveita as filhas", () => {
    const nova: Divisao = { modo: "proporcao", partes: [
      { responsavel_id: MAE_PESSOA, numerador: 1, denominador: 2 },
      { responsavel_id: RAFAEL, numerador: 1, denominador: 2 },
    ] };
    const jaDividido = (extra: Partial<Divisao> = {}) =>
      previsto("p3", {
        divisao: {
          ...doisTercos,
          ...extra,
          partes: [
            { ...doisTercos.partes[0], filha_id: "fa" },
            { ...doisTercos.partes[1], filha_id: "fb" },
          ],
        },
      });
    const igual = planejarDivisaoNosPrevistos({ responsavel_id: null, divisao: doisTercos }, { responsavel_id: null, divisao: doisTercos }, [jaDividido()]);
    expect(igual).toEqual({ silenciosos: [], aPerguntar: [] });
    const plano = planejarDivisaoNosPrevistos({ responsavel_id: null, divisao: doisTercos }, { responsavel_id: null, divisao: nova }, [jaDividido()]);
    expect(plano.silenciosos).toEqual([]);
    expect(plano.aPerguntar[0].partes.map((p) => p.filha_id)).toEqual(["fa", "fb"]);
  });

  it("desfazer desfaz sozinho só os previstos com a mesma Divisão", () => {
    const dividido = (id: string, d: Divisao) => previsto(id, { divisao: d });
    const outra: Divisao = { ...doisTercos, partes: [{ ...doisTercos.partes[0], numerador: 1, denominador: 2 }, { ...doisTercos.partes[1], numerador: 1, denominador: 2 }] };
    const plano = planejarDivisaoNosPrevistos({ responsavel_id: null, divisao: doisTercos }, { responsavel_id: "r-antes", divisao: null }, [
      dividido("p1", doisTercos),
      dividido("p2", outra),
      previsto("p3"),
    ]);
    expect(plano.silenciosos.map((i) => [i.id, i.corpo.divisao, i.corpo.responsavel_id])).toEqual([["p1", null, "r-antes"]]);
    expect(plano.aPerguntar).toEqual([]);
  });

  it("junta itens do mesmo previsto", () => {
    const a = { id: "p", corpo: { divisao: null }, partes: [] };
    const b = { id: "p", corpo: { divisao: null, responsavel_id: "x" }, partes: [] };
    expect(juntarItensDividir([a], [b])).toEqual([b]);
  });
});

describe("partesDaImportacao", () => {
  it("calcula as partes ou devolve null se alguma zera", () => {
    expect(partesDaImportacao(46600, doisTercos)?.map((p) => p.valor_centavos)).toEqual([31067, 15533]);
    expect(partesDaImportacao(1, doisTercos)).toBeNull();
    expect(partesDaImportacao(0, doisTercos)).toBeNull();
  });
});

describe("agruparPartes", () => {
  const d: Divisao = {
    ...doisTercos,
    partes: [
      { ...doisTercos.partes[0], filha_id: "f1" },
      { ...doisTercos.partes[1], filha_id: "f2" },
    ],
  };
  type L = { id: string; divisao: Divisao | null; dividido_de_id: string | null; excluido_em: string | null };
  const mae: L = { id: "m", divisao: d, dividido_de_id: null, excluido_em: null };
  const f1: L = { id: "f1", divisao: null, dividido_de_id: "m", excluido_em: null };
  const f2: L = { id: "f2", divisao: null, dividido_de_id: "m", excluido_em: null };
  const comum: L = { id: "c", divisao: null, dividido_de_id: null, excluido_em: null };
  const e = (linha: L) => ({ linha, mae: null });

  it("a mãe vira cabeçalho antes da primeira parte visível e as partes ficam juntas, na ordem das partes", () => {
    const r = agruparPartes([e(comum), e(f2), e(f1)], new Map([["m", mae]]));
    expect(r.map((x) => [x.linha.id, x.papel ?? "linha"])).toEqual([
      ["c", "linha"],
      ["m", "cabecalho"],
      ["f1", "parte"],
      ["f2", "parte"],
    ]);
  });

  it("só aparecem as partes que passaram pelos filtros; sem nenhuma, a mãe não aparece", () => {
    expect(agruparPartes([e(f2)], new Map([["m", mae]])).map((x) => x.linha.id)).toEqual(["m", "f2"]);
    expect(agruparPartes([e(comum)], new Map([["m", mae]])).map((x) => x.linha.id)).toEqual(["c"]);
  });

  it("parte sem a mãe na lista fica como linha comum", () => {
    expect(agruparPartes([e(f1)], new Map()).map((x) => [x.linha.id, x.papel ?? "linha"])).toEqual([["f1", "linha"]]);
  });
});

describe("motivoParaNaoDividir", () => {
  const base = { valor_centavos: 46600, tipo_id: "t", dividido_de_id: null, ajuste_de_id: null };
  it("pode: linha comum com Tipo, Valor e sem Ajuste", () => {
    expect(motivoParaNaoDividir(base, false)).toBeNull();
    expect(motivoParaNaoDividir({ ...base, valor_centavos: -100 }, false)).toBeNull();
  });
  it("explica por que não", () => {
    expect(motivoParaNaoDividir({ ...base, dividido_de_id: "m" }, false)).toBe("indisponivel_ajuste_proprio");
    expect(motivoParaNaoDividir({ ...base, ajuste_de_id: "m" }, false)).toBe("indisponivel_ajuste_proprio");
    expect(motivoParaNaoDividir(base, true)).toBe("indisponivel_ajuste");
    expect(motivoParaNaoDividir({ ...base, valor_centavos: 0 }, false)).toBe("indisponivel_zero");
    expect(motivoParaNaoDividir({ ...base, valor_centavos: 90_000_001 }, false)).toBe("indisponivel_grande");
    expect(motivoParaNaoDividir({ ...base, tipo_id: null }, false)).toBe("indisponivel_tipo");
  });
});
