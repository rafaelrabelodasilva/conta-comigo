import { describe, expect, it } from "vitest";
import { separarAjustes } from "./ajustes";
import { ESPACO } from "./dinheiro";
import { unidadesDoMes } from "./divisao";
import { FILTROS_VAZIOS, aplicarFiltros, resolverBloco, restringirAoBloco } from "./filtros-grade";
import {
  avaliar,
  descreverCalculo,
  montarFormula,
  textoDaFormula,
  type Ficha,
  type Formula,
  type NomesDaFormula,
} from "./formula";
import { alternarTodos } from "./lancamento";
import { linhasDoMes, somarValores } from "./painel";
import { projetarPainel, type LancamentoParaProjetar } from "./projecoes";
import { resumoDaSelecao } from "./selecao";

// Testes de aceite da História 4.1 (AD, "Testes"): os totais de outubro/2026 do
// Painel, sobre um Mês montado à mão (sem dado pessoal): quatro pessoas, uma
// compra dividida (Monjaro), um Ajuste de centavos, um estorno, um excluído e
// um lançamento de outro Mês. Casal R$ 5.639,35, Mãe R$ 1.350,14 (7 itens),
// Lucas R$ 215,16 e Total R$ 9.280,23.
//
// História 4.3: o mesmo Mês, agora pela grade. Filtrar pelo Bloco deixa na
// grade só os Lançamentos que `avaliar` soma, então o total do rodapé de um Bloco
// de soma simples é o valor dele (Mãe = R$ 1.350,14, 7 itens).

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$ ", `-${ESPACO}R$ `);

const MES = "2026-10";

function l(
  id: string,
  valor: number,
  responsavel: string | null,
  tipo: string | null,
  extra: Partial<LancamentoParaProjetar> = {},
): LancamentoParaProjetar {
  return { id, mes: MES, excluido_em: null, valor_centavos: valor, responsavel_id: responsavel, tipo_id: tipo, ...extra };
}

const lancamentos: LancamentoParaProjetar[] = [
  // Casal: R$ 5.639,35
  l("c1", 80000, "casal", "casa"),
  l("c2", 44589, "casal", "casa"),
  l("c3", 47328, "casal", "casa"),
  l("c4", 114082, "casal", "viagem"),
  l("c4-ajuste", -8, "casal", "viagem", { ajuste_de_id: "c4" }),
  // Monjaro R$ 466,00 dividido em 2/3 + 1/3: a mãe não soma, as filhas somam.
  l("monjaro", 46600, null, "saude", { divisao: { modo: "proporcao", partes: [] } }),
  l("monjaro-1", 31067, "casal", "saude", { dividido_de_id: "monjaro" }),
  l("monjaro-2", 15533, "casal", "saude", { dividido_de_id: "monjaro" }),
  l("c6", 231344, "casal", "casa"),
  // Mãe: R$ 1.350,14 em 7 itens, com dois estornos
  l("m1", 50000, "mae", "saude"),
  l("m2", 30000, "mae", "casa"),
  l("m3", 25014, "mae", "saude"),
  l("m4", 20000, "mae", "casa"),
  l("m5", 15000, "mae", "saude"),
  l("m6", -2590, "mae", "saude"),
  l("m7", -2410, "mae", "casa"),
  // Lucas: R$ 215,16
  l("l1", 15000, "lucas", "casa"),
  l("l2", 6516, "lucas", "casa"),
  // Rafael: o que falta para o Total de R$ 9.280,23
  l("r1", 120000, "rafael", "bobicas"),
  l("r2", 60000, "rafael", "casa"),
  l("r3", 27558, "rafael", "saude"),
  // Não entram: excluído e outro Mês
  l("excluido", 99999, "casal", "casa", { excluido_em: "2026-10-20T12:00:00Z" }),
  l("novembro", 77777, "casal", "casa", { mes: "2026-11" }),
];

const nomes: NomesDaFormula = {
  responsaveis: new Map([
    ["rafael", "Rafael"],
    ["rangel", "Rangel"],
    ["casal", "Casal"],
    ["mae", "Mãe"],
    ["lucas", "Lucas"],
  ]),
  tipos: new Map([
    ["casa", "Casa"],
    ["saude", "Saúde"],
    ["viagem", "Viagem"],
    ["bobicas", "Bobiças"],
  ]),
};

const r = (id: string): Ficha => ({ tipo: "responsavel", id });
const DIV: Ficha = { tipo: "operacao", operacao: "divisao" };
const MAIS: Ficha = { tipo: "operacao", operacao: "soma" };
const dois: Ficha = { tipo: "numero", valor: "2" };

function formula(...fichas: Ficha[]): Formula {
  const m = montarFormula(fichas);
  if (!m.ok) throw new Error(m.erro.codigo);
  return m.valor;
}

const painel = projetarPainel(lancamentos, MES);

function avaliarPainel(f: Formula) {
  const a = avaliar(f, painel);
  if (!a.ok) throw new Error(a.erro.codigo);
  return a.valor;
}

describe("Painel de outubro/2026 (aceite da 4.1)", () => {
  it("projetarPainel: sem a mãe dividida, sem excluído, sem outro Mês; com as filhas e o Ajuste", () => {
    const ids = painel.map((x) => x.id);
    expect(ids).not.toContain("monjaro");
    expect(ids).not.toContain("excluido");
    expect(ids).not.toContain("novembro");
    expect(ids).toEqual(expect.arrayContaining(["monjaro-1", "monjaro-2", "c4-ajuste"]));
  });

  it("Casal R$ 5.639,35", () => {
    expect(avaliarPainel(formula(r("casal"))).valorCentavos).toBe(563935);
  });

  it("Casal ÷ 2 = R$ 2.819,68 (de R$ 2.819,675)", () => {
    const a = avaliarPainel(formula(r("casal"), DIV, dois));
    expect(a.valorCentavos).toBe(281968);
    expect(a.calculo.valor).toMatchObject({ dinheiro: true, numerador: BigInt(563935), denominador: BigInt(2) });
  });

  it("Total R$ 9.280,23", () => {
    expect(avaliarPainel(formula({ tipo: "todos" })).valorCentavos).toBe(928023);
  });

  it("Mãe R$ 1.350,14, em 7 itens", () => {
    const a = avaliarPainel(formula(r("mae")));
    expect(a.valorCentavos).toBe(135014);
    expect(a.entram).toHaveLength(7);
  });

  it("Lucas R$ 215,16", () => {
    expect(avaliarPainel(formula(r("lucas"))).valorCentavos).toBe(21516);
  });

  it("Rangel (= Rangel + (Casal ÷ 2)) vale R$ 2.819,68, igual ao passo a passo", () => {
    const f = formula(r("rangel"), MAIS, { tipo: "abre" }, r("casal"), DIV, dois, { tipo: "fecha" });
    const a = avaliarPainel(f);
    expect(textoDaFormula(f, nomes)).toBe("Rangel + (Casal ÷ 2)");
    expect(a.valorCentavos).toBe(281968);
    expect(descreverCalculo(a, nomes)).toBe(e("Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68"));
  });

  it("a soma das pessoas é o Total", () => {
    const soma = formula(r("rafael"), MAIS, r("casal"), MAIS, r("mae"), MAIS, r("lucas"));
    expect(avaliarPainel(soma).valorCentavos).toBe(928023);
  });

  it("Bloco de soma simples: os Lançamentos que entram somam o valor do Bloco (base do filtro da 4.3)", () => {
    const a = avaliarPainel(formula(r("mae")));
    const somaDosQueEntram = painel.filter((x) => a.entram.includes(x.id)).reduce((s, x) => s + x.valor_centavos, 0);
    expect(somaDosQueEntram).toBe(a.valorCentavos);
  });
});

// ----------------------------------------------- grade filtrada pelo Bloco (4.3)

/** Uma linha da grade a partir de um Lançamento do fixture (só o que a grade e os filtros leem). */
function naGrade(l: LancamentoParaProjetar) {
  return {
    ...l,
    nome: l.id.toUpperCase(),
    apelido: null,
    status_id: null,
    lancado_por: "fatura" as const,
    parcela_n: null,
    parcela_total: null,
    final_cartao: "5061",
    fatura_id: "f10",
    ordem_fatura: null as number | null,
  };
}

/** O que a grade mostra e o total do rodapé (as mães filtradas e os Ajustes delas), como o Painel monta. */
function gradeDoBloco(f: Formula, lancadas: readonly LancamentoParaProjetar[] = lancamentos) {
  const projecao = projetarPainel(lancadas, MES);
  const bloco = resolverBloco({ bloco: "b" }, [{ id: "b", nome: "Bloco", formula: f }], projecao);
  const unidades = unidadesDoMes(linhasDoMes(lancadas, MES)).map(naGrade);
  const { maes, ajustesPorMae } = separarAjustes(restringirAoBloco(unidades, bloco));
  const linhas = aplicarFiltros(maes, FILTROS_VAZIOS, null);
  const visiveis = linhas.flatMap((x) => [x, ...(ajustesPorMae.get(x.id) ?? [])]);
  const valor = avaliar(f, projecao);
  if (!valor.ok) throw new Error(valor.erro.codigo);
  return { linhas, ajustesPorMae, visiveis, total: somarValores(visiveis), valorDoBloco: valor.valor.valorCentavos };
}

describe("grade filtrada pelo Bloco (aceite da 4.3)", () => {
  it("Mãe: sete linhas e o total do rodapé é o valor do Bloco, R$ 1.350,14", () => {
    const g = gradeDoBloco(formula(r("mae")));
    expect(g.linhas.map((x) => x.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7"]);
    expect(g.valorDoBloco).toBe(135014);
    expect(g.total).toBe(135014);
  });

  it("soma simples de cada pessoa e Todos: total da grade = valor do Bloco", () => {
    for (const f of [formula(r("casal")), formula(r("lucas")), formula(r("rafael")), formula({ tipo: "todos" })]) {
      const g = gradeDoBloco(f);
      expect(g.total).toBe(g.valorDoBloco);
    }
    expect(gradeDoBloco(formula({ tipo: "todos" })).total).toBe(928023);
  });

  it("Casal: o Ajuste fica sob a mãe dele e as filhas da Divisão entram sem a mãe dividida", () => {
    const g = gradeDoBloco(formula(r("casal")));
    expect(g.valorDoBloco).toBe(563935);
    expect(g.total).toBe(563935);
    const ids = g.linhas.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["c4", "monjaro-1", "monjaro-2"]));
    expect(ids).not.toContain("monjaro");
    expect(ids).not.toContain("c4-ajuste");
    expect(g.ajustesPorMae.get("c4")?.map((x) => x.id)).toEqual(["c4-ajuste"]);
  });

  it("Ajuste com Responsável diferente da mãe: só entra o que o Bloco soma (vira linha comum no Bloco dele)", () => {
    const divergente = lancamentos.map((x) => (x.id === "c4-ajuste" ? { ...x, responsavel_id: "mae" } : x));
    const casal = gradeDoBloco(formula(r("casal")), divergente);
    expect(casal.valorDoBloco).toBe(563943);
    expect(casal.total).toBe(563943);
    expect(casal.ajustesPorMae.get("c4")).toBeUndefined();
    const mae = gradeDoBloco(formula(r("mae")), divergente);
    expect(mae.total).toBe(mae.valorDoBloco);
    // Sem a mãe no Bloco, o Ajuste não fica recuado: é uma linha própria da grade.
    expect(mae.linhas.map((x) => x.id)).toContain("c4-ajuste");
    expect(mae.ajustesPorMae.size).toBe(0);
  });

  it("mãe dividida cujas filhas entram só em parte: aparecem só as filhas que entram", () => {
    const parcial = lancamentos.map((x) => (x.id === "monjaro-2" ? { ...x, responsavel_id: "lucas" } : x));
    const casal = gradeDoBloco(formula(r("casal")), parcial);
    expect(casal.linhas.map((x) => x.id)).toContain("monjaro-1");
    expect(casal.linhas.map((x) => x.id)).not.toContain("monjaro-2");
    expect(casal.total).toBe(casal.valorDoBloco);
    const lucas = gradeDoBloco(formula(r("lucas")), parcial);
    expect(lucas.linhas.map((x) => x.id)).toEqual(expect.arrayContaining(["l1", "l2", "monjaro-2"]));
    expect(lucas.total).toBe(lucas.valorDoBloco);
  });

  it("Bloco de duas pessoas: a grade tem o Casal inteiro (a metade é só na conta, não na lista)", () => {
    const f = formula(r("rangel"), MAIS, { tipo: "abre" }, r("casal"), DIV, dois, { tipo: "fecha" });
    const g = gradeDoBloco(f);
    expect(g.valorDoBloco).toBe(281968);
    expect(g.total).toBe(563935);
  });
});

// --------------------------------------------------- Seleção e total (4.4)

/** "Selecionar todos" sobre a grade filtrada pelo Bloco, como o Painel faz, e o texto da barra. */
function barraDoBloco(f: Formula, lancadas: readonly LancamentoParaProjetar[] = lancamentos) {
  const g = gradeDoBloco(f, lancadas);
  const selecao = alternarTodos(new Set(), g.linhas.map((x) => x.id));
  return { g, resumo: resumoDaSelecao(selecao, g.visiveis) };
}

describe("Seleção e total (aceite da 4.4)", () => {
  it("Bloco Mãe filtrado e 'selecionar todos': '7 selecionados · R$ 1.350,14'", () => {
    const { resumo } = barraDoBloco(formula(r("mae")));
    expect(resumo.texto).toBe(e("7 selecionados · R$ 1.350,14"));
  });

  it("o total da barra é o valor do Bloco de soma simples, de cada pessoa e de Todos", () => {
    for (const f of [formula(r("mae")), formula(r("casal")), formula(r("lucas")), formula(r("rafael")), formula({ tipo: "todos" })]) {
      const { g, resumo } = barraDoBloco(f);
      expect(resumo.totalCentavos).toBe(g.valorDoBloco);
    }
  });

  it("Casal: o Ajuste segue a mãe (não é um item) e as filhas da Divisão contam, nunca a mãe dividida", () => {
    const { resumo } = barraDoBloco(formula(r("casal")));
    // c1, c2, c3, c4 (com o Ajuste), as duas filhas do Monjaro e c6.
    expect(resumo.quantidade).toBe(7);
    expect(resumo.totalCentavos).toBe(563935);
  });

  it("Ajuste de outro Responsável: o total é o do Bloco (só o que o Bloco soma)", () => {
    const divergente = lancamentos.map((x) => (x.id === "c4-ajuste" ? { ...x, responsavel_id: "mae" } : x));
    for (const id of ["casal", "mae"]) {
      const { g, resumo } = barraDoBloco(formula(r(id)), divergente);
      expect(resumo.totalCentavos).toBe(g.valorDoBloco);
    }
  });

  it("sem Bloco, 'selecionar todos' do Mês fecha no Total de R$ 9.280,23", () => {
    const { resumo } = barraDoBloco(formula({ tipo: "todos" }));
    expect(resumo.totalCentavos).toBe(928023);
  });
});
