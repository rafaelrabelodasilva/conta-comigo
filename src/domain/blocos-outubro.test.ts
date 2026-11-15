import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import {
  avaliar,
  descreverCalculo,
  montarFormula,
  textoDaFormula,
  type Ficha,
  type Formula,
  type NomesDaFormula,
} from "./formula";
import { projetarPainel, type LancamentoParaProjetar } from "./projecoes";

// Testes de aceite da História 4.1 (AD, "Testes"): os totais de outubro/2026 do
// Painel, sobre um Mês montado à mão (sem dado pessoal): quatro pessoas, uma
// compra dividida (Monjaro), um Ajuste de centavos, um estorno, um excluído e
// um lançamento de outro Mês. Casal R$ 5.639,35, Mãe R$ 1.350,14 (7 itens),
// Lucas R$ 215,16 e Total R$ 9.280,23.

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
