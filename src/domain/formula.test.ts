import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import {
  avaliar,
  descreverCalculo,
  fichasDaFormula,
  lerFormula,
  montarFormula,
  normalizarNumero,
  textoDaFormula,
  validarFormula,
  type Ficha,
  type Formula,
  type LinhaDaFormula,
  type NomesDaFormula,
  type Operacao,
} from "./formula";

// Só o espaço de "R$ ", de "- R$ " e de "≈ " é inseparável; o resto do texto tem espaço comum.
const e = (texto: string) =>
  texto
    .replaceAll("- R$ ", `-${ESPACO}R$ `)
    .replaceAll("≈ ", `≈${ESPACO}`)
    .replaceAll("R$ ", `R$${ESPACO}`);

const resp = (id: string): Ficha => ({ tipo: "responsavel", id });
const tipo = (id: string): Ficha => ({ tipo: "tipo", id });
const num = (valor: string): Ficha => ({ tipo: "numero", valor });
const op = (operacao: Operacao): Ficha => ({ tipo: "operacao", operacao });
const TODOS: Ficha = { tipo: "todos" };
const ABRE: Ficha = { tipo: "abre" };
const FECHA: Ficha = { tipo: "fecha" };
const MAIS = op("soma");
const MENOS = op("subtracao");
const VEZES = op("multiplicacao");
const DIV = op("divisao");

const nomes: NomesDaFormula = {
  responsaveis: new Map([
    ["rafael", "Rafael"],
    ["rangel", "Rangel"],
    ["casal", "Casal"],
    ["mae", "Mãe"],
  ]),
  tipos: new Map([
    ["casa", "Casa"],
    ["bobicas", "Bobiças"],
  ]),
};

const linha = (id: string, valor: number, responsavel: string | null, t: string | null = null): LinhaDaFormula => ({
  id,
  valor_centavos: valor,
  responsavel_id: responsavel,
  tipo_id: t,
});

const linhas: LinhaDaFormula[] = [
  linha("a", 10000, "rafael", "bobicas"),
  linha("b", 20000, "casal", "casa"),
  linha("c", 5000, "mae", "casa"),
  linha("d", 3000, "rafael", "casa"),
];

function montar(...fichas: Ficha[]): Formula {
  const r = montarFormula(fichas);
  if (!r.ok) throw new Error(`fichas inválidas: ${r.erro.codigo}`);
  return r.valor;
}

function valor(formula: Formula, l: LinhaDaFormula[] = linhas): number {
  const r = avaliar(formula, l);
  if (!r.ok) throw new Error(r.erro.codigo);
  return r.valor.valorCentavos;
}

function codigo(...fichas: Ficha[]): string | undefined {
  const r = montarFormula(fichas);
  return r.ok ? undefined : r.erro.codigo;
}

describe("operandos", () => {
  it("Responsável, Tipo, Responsável em Tipo e Todos", () => {
    expect(valor(montar(resp("rafael")))).toBe(13000);
    expect(valor(montar(tipo("casa")))).toBe(28000);
    expect(valor(montar({ tipo: "responsavel_em_tipo", responsavel_id: "rafael", tipo_id: "bobicas" }))).toBe(10000);
    expect(valor(montar(TODOS))).toBe(38000);
  });

  it("devolve os Lançamentos que entram, uma vez cada, na ordem das linhas", () => {
    const r = avaliar(montar(resp("rafael"), MAIS, TODOS), linhas);
    expect(r.ok && r.valor.entram).toEqual(["a", "b", "c", "d"]);
    const so = avaliar(montar(resp("mae")), linhas);
    expect(so.ok && so.valor.entram).toEqual(["c"]);
  });

  it("um operando sem Lançamentos vale R$ 0,00", () => {
    expect(valor(montar(resp("rangel")))).toBe(0);
  });
});

describe("precedência e associatividade", () => {
  it("× e ÷ antes de + e −", () => {
    // Rafael 13000 + Casal 20000 × 2
    expect(valor(montar(resp("rafael"), MAIS, resp("casal"), VEZES, num("2")))).toBe(53000);
  });

  it("parênteses mudam a ordem", () => {
    expect(valor(montar(ABRE, resp("rafael"), MAIS, resp("casal"), FECHA, VEZES, num("2")))).toBe(66000);
  });

  it("− e ÷ seguem da esquerda para a direita", () => {
    expect(valor(montar(resp("casal"), MENOS, resp("mae"), MENOS, resp("rafael")))).toBe(2000);
    expect(valor(montar(resp("casal"), DIV, num("2"), DIV, num("5")))).toBe(2000);
  });
});

describe("racional exato e um só arredondamento", () => {
  it("não arredonda no meio: Casal ÷ 3 × 3 volta ao valor", () => {
    expect(valor(montar(resp("casal"), DIV, num("3"), VEZES, num("3")), [linha("x", 100, "casal")])).toBe(100);
  });

  it("meio para longe do zero, no final", () => {
    expect(valor(montar(resp("casal"), DIV, num("2")), [linha("x", 563935, "casal")])).toBe(281968);
    expect(valor(montar(resp("casal"), DIV, num("2")), [linha("x", -1, "casal")])).toBe(-1);
    expect(valor(montar(resp("casal"), DIV, num("2")), [linha("x", 1, "casal")])).toBe(1);
  });

  it("duas metades somadas não perdem o centavo (arredonda só no fim)", () => {
    const um = [linha("x", 563935, "casal")];
    const duas = montar(ABRE, resp("casal"), DIV, num("2"), FECHA, MAIS, ABRE, resp("casal"), DIV, num("2"), FECHA);
    expect(valor(duas, um)).toBe(563935);
  });
});

describe("números", () => {
  it("fator com decimais: Casal × 0,5", () => {
    expect(valor(montar(resp("casal"), VEZES, num("0,5")))).toBe(10000);
    expect(valor(montar(resp("casal"), VEZES, num("1,25")))).toBe(25000);
  });

  it("somado a um valor em R$, vale em reais (Valor fixo)", () => {
    expect(valor(montar(resp("mae"), MAIS, num("100")))).toBe(15000);
    expect(valor(montar(num("100"), MENOS, resp("mae")))).toBe(5000);
    expect(valor(montar(resp("mae"), MAIS, ABRE, num("1"), MAIS, num("1"), FECHA))).toBe(5200);
  });

  it("uma Fórmula só de números vale em reais", () => {
    expect(valor(montar(num("100")))).toBe(10000);
    expect(valor(montar(num("2"), VEZES, num("3")))).toBe(600);
  });

  it("número vezes grupo de valores", () => {
    expect(valor(montar(num("2"), VEZES, ABRE, resp("rafael"), MAIS, resp("mae"), FECHA))).toBe(36000);
  });
});

describe("fichas inválidas", () => {
  it("vazia", () => expect(codigo()).toBe("formula.vazia"));

  it("Falta fechar um parêntese", () => {
    expect(codigo(ABRE, resp("casal"))).toBe("formula.parentese_aberto");
    expect(codigo(resp("rangel"), MAIS, ABRE, resp("casal"), DIV, num("2"))).toBe("formula.parentese_aberto");
    expect(codigo(resp("rangel"), MAIS, ABRE)).toBe("formula.parentese_aberto");
  });

  it("A fórmula termina com uma operação", () => {
    expect(codigo(resp("rangel"), MAIS)).toBe("formula.termina_com_operacao");
    expect(codigo(resp("rangel"), MAIS, ABRE, resp("casal"), DIV)).toBe("formula.termina_com_operacao");
  });

  it("Divisão por zero", () => {
    expect(codigo(resp("casal"), DIV, num("0"))).toBe("formula.divisao_por_zero");
    expect(codigo(resp("casal"), DIV, ABRE, num("2"), MENOS, num("2"), FECHA)).toBe("formula.divisao_por_zero");
    expect(codigo(num("1"), DIV, num("0,5"), DIV, num("0"))).toBe("formula.divisao_por_zero");
  });

  it("outras razões, cada uma com o seu código", () => {
    expect(codigo(MAIS, resp("casal"))).toBe("formula.comeca_com_operacao");
    expect(codigo(ABRE, MAIS, resp("casal"), FECHA)).toBe("formula.grupo_comeca_com_operacao");
    expect(codigo(resp("rangel"), MAIS, VEZES, resp("casal"))).toBe("formula.operacoes_seguidas");
    expect(codigo(ABRE, FECHA)).toBe("formula.grupo_vazio");
    expect(codigo(resp("casal"), FECHA)).toBe("formula.fecha_sobrando");
    expect(codigo(FECHA)).toBe("formula.fecha_sobrando");
    expect(codigo(resp("rangel"), resp("casal"))).toBe("formula.falta_operacao");
    expect(codigo(resp("casal"), num("2"))).toBe("formula.falta_operacao");
    expect(codigo(num("2"), ABRE, resp("casal"), FECHA)).toBe("formula.falta_operacao");
    expect(codigo(ABRE, resp("casal"), FECHA, ABRE, resp("mae"), FECHA)).toBe("formula.falta_operacao");
    expect(codigo(ABRE, resp("casal"), MAIS, FECHA)).toBe("formula.operacao_sem_valor");
  });

  it("valor em R$ vezes ou dividido por valor em R$", () => {
    expect(codigo(resp("casal"), VEZES, resp("mae"))).toBe("formula.dinheiro_com_dinheiro");
    expect(codigo(resp("casal"), DIV, resp("mae"))).toBe("formula.dinheiro_com_dinheiro");
    expect(codigo(num("2"), DIV, resp("casal"))).toBe("formula.dinheiro_com_dinheiro");
    expect(codigo(ABRE, resp("casal"), MAIS, resp("mae"), FECHA, VEZES, TODOS)).toBe("formula.dinheiro_com_dinheiro");
  });

  it("fichas demais", () => {
    const muitas: Ficha[] = [resp("casal")];
    for (let i = 0; i < 31; i++) muitas.push(MAIS, resp("casal"));
    expect(codigo(...muitas)).toBe("formula.grande");
  });
});

describe("a Fórmula é uma árvore com o grupo como foi montado", () => {
  const rangel = montar(resp("rangel"), MAIS, ABRE, resp("casal"), DIV, num("2"), FECHA);

  it("Rangel + (Casal ÷ 2)", () => {
    expect(rangel).toEqual({
      tipo: "operacao",
      operacao: "soma",
      esquerda: { tipo: "responsavel", id: "rangel" },
      direita: {
        tipo: "grupo",
        interno: {
          tipo: "operacao",
          operacao: "divisao",
          esquerda: { tipo: "responsavel", id: "casal" },
          direita: { tipo: "numero", valor: "2" },
        },
      },
    });
  });

  it("texto legível com os parênteses como montados", () => {
    expect(textoDaFormula(rangel, nomes)).toBe("Rangel + (Casal ÷ 2)");
    expect(textoDaFormula(montar(ABRE, ABRE, resp("rafael"), FECHA, FECHA, VEZES, num("1,5")), nomes)).toBe("((Rafael)) × 1,5");
    expect(
      textoDaFormula(montar({ tipo: "responsavel_em_tipo", responsavel_id: "rafael", tipo_id: "bobicas" }, MENOS, TODOS), nomes),
    ).toBe("Rafael em Bobiças − Todos");
  });

  it("volta a ser as mesmas fichas (editar um Bloco)", () => {
    const fichas: Ficha[] = [resp("rangel"), MAIS, ABRE, resp("casal"), DIV, num("2"), FECHA, MENOS, tipo("casa")];
    expect(fichasDaFormula(montar(...fichas))).toEqual(fichas);
  });

  it("nome de cadastro que não existe mais vira ?", () => {
    expect(textoDaFormula(montar(resp("sumiu")), nomes)).toBe("?");
  });
});

describe("passo a passo (FR-54)", () => {
  const casal = [linha("x", 563935, "casal")];

  function passo(formula: Formula, l: LinhaDaFormula[]): string {
    const r = avaliar(formula, l);
    if (!r.ok) throw new Error(r.erro.codigo);
    return descreverCalculo(r.valor, nomes);
  }

  it("Rangel + (Casal ÷ 2): o do aceite", () => {
    const f = montar(resp("rangel"), MAIS, ABRE, resp("casal"), DIV, num("2"), FECHA);
    expect(passo(f, casal)).toBe(e("Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68"));
  });

  it("sem grupo, só o resultado no fim", () => {
    const f = montar(resp("casal"), DIV, num("2"));
    expect(passo(f, casal)).toBe(e("Casal R$ 5.639,35 ÷ 2 = R$ 2.819,68"));
  });

  it("um operando sozinho mostra só o subtotal", () => {
    expect(passo(montar(resp("casal")), casal)).toBe(e("Casal R$ 5.639,35"));
    expect(passo(montar(TODOS), casal)).toBe(e("Todos R$ 5.639,35"));
  });

  it("valor que não termina em decimal sai aproximado no grupo", () => {
    const f = montar(ABRE, resp("casal"), DIV, num("3"), FECHA, VEZES, num("3"));
    expect(passo(f, [linha("x", 500000, "casal")])).toBe(
      e("(Casal R$ 5.000,00 ÷ 3 = ≈ R$ 1.666,667) × 3 = R$ 5.000,00"),
    );
  });

  it("número somado a valor aparece em reais", () => {
    expect(passo(montar(resp("casal"), MAIS, num("100")), casal)).toBe(e("Casal R$ 5.639,35 + R$ 100,00 = R$ 5.739,35"));
    expect(passo(montar(num("100")), casal)).toBe(e("R$ 100,00"));
  });

  it("grupo de números somado a valor", () => {
    const f = montar(resp("casal"), MAIS, ABRE, num("1"), MAIS, num("1"), FECHA);
    expect(passo(f, casal)).toBe(e("Casal R$ 5.639,35 + ((1 + 1 = 2) = R$ 2,00) = R$ 5.641,35"));
  });

  it("créditos entram com o sinal: - R$ 25,90", () => {
    expect(passo(montar(resp("casal")), [linha("x", -2590, "casal")])).toBe(e("Casal - R$ 25,90"));
  });
});

describe("validarFormula e lerFormula", () => {
  it("validarFormula pega a divisão por zero de uma árvore vinda do banco", () => {
    const f: Formula = {
      tipo: "operacao",
      operacao: "divisao",
      esquerda: { tipo: "todos" },
      direita: { tipo: "numero", valor: "0" },
    };
    expect(validarFormula(f)).toEqual({ ok: false, erro: { codigo: "formula.divisao_por_zero" } });
    expect(validarFormula({ tipo: "todos" })).toEqual({ ok: true, valor: { tipo: "todos" } });
  });

  it("lê a árvore do jsonb", () => {
    const f = montar(resp("rangel"), MAIS, ABRE, resp("casal"), DIV, num("2"), FECHA);
    expect(lerFormula(JSON.parse(JSON.stringify(f)))).toEqual({ ok: true, valor: f });
  });

  it("recusa o que não é uma Fórmula", () => {
    const invalida = { ok: false, erro: { codigo: "formula.invalida" } };
    expect(lerFormula(null)).toEqual(invalida);
    expect(lerFormula("Rangel + Casal")).toEqual(invalida);
    expect(lerFormula({ tipo: "responsavel" })).toEqual(invalida);
    expect(lerFormula({ tipo: "responsavel", id: "" })).toEqual(invalida);
    expect(lerFormula({ tipo: "todos", extra: 1 })).toEqual(invalida);
    expect(lerFormula({ tipo: "numero", valor: "02" })).toEqual(invalida);
    expect(lerFormula({ tipo: "numero", valor: "2,50" })).toEqual(invalida);
    expect(lerFormula({ tipo: "numero", valor: "-2" })).toEqual(invalida);
    expect(lerFormula({ tipo: "numero", valor: "1234567890" })).toEqual(invalida);
    expect(lerFormula({ tipo: "operacao", operacao: "potencia", esquerda: { tipo: "todos" }, direita: { tipo: "todos" } })).toEqual(
      invalida,
    );
    expect(lerFormula({ tipo: "grupo" })).toEqual(invalida);
  });

  it("aceita números canônicos", () => {
    for (const valor of ["0", "2", "0,5", "1,25", "100", "123456789", "0,0001"]) {
      expect(lerFormula({ tipo: "numero", valor }).ok).toBe(true);
    }
  });

  it("recusa árvore grande demais", () => {
    let f: unknown = { tipo: "todos" };
    for (let i = 0; i < 70; i++) f = { tipo: "grupo", interno: f };
    expect(lerFormula(f)).toEqual({ ok: false, erro: { codigo: "formula.invalida" } });
  });
});

describe("normalizarNumero", () => {
  it("forma canônica", () => {
    expect(normalizarNumero("2")).toBe("2");
    expect(normalizarNumero("2,50")).toBe("2,5");
    expect(normalizarNumero("0.5")).toBe("0,5");
    expect(normalizarNumero(" 007 ")).toBe("7");
    expect(normalizarNumero("1,2500")).toBe("1,25");
    expect(normalizarNumero("0")).toBe("0");
    expect(normalizarNumero("3,0")).toBe("3");
  });

  it("recusa o que não cabe", () => {
    for (const t of ["", "abc", "-2", "1,23456", "1234567890", "1,", ",5", "1,2,3", "2 3"]) {
      expect(normalizarNumero(t)).toBeNull();
    }
  });

  it("o que normaliza é aceito pelo schema", () => {
    for (const t of ["2", "0,50", "100,0", "0,0001"]) {
      const valor = normalizarNumero(t);
      expect(valor).not.toBeNull();
      expect(lerFormula({ tipo: "numero", valor }).ok).toBe(true);
    }
  });
});

describe("tamanho do valor", () => {
  it("soma que passa dos inteiros seguros dá erro, sem lançar", () => {
    const grandes = [linha("x", Number.MAX_SAFE_INTEGER, "casal"), linha("y", Number.MAX_SAFE_INTEGER, "casal")];
    expect(avaliar(montar(resp("casal")), grandes)).toEqual({ ok: false, erro: { codigo: "formula.valor_grande" } });
    const um = [linha("x", Number.MAX_SAFE_INTEGER, "casal")];
    expect(avaliar(montar(resp("casal"), VEZES, num("2")), um)).toEqual({
      ok: false,
      erro: { codigo: "formula.valor_grande" },
    });
  });
});
