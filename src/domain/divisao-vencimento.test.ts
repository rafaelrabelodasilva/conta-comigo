import { describe, expect, it } from "vitest";
import { copiarDivisao, lerDivisao, mesmaDivisao, mesmosVencimentosDasPartes, partesDaImportacao, type Divisao } from "./divisao";
import { temTrabalhoManual } from "./reimportacao";

// A data combinada por parte da Divisão (História 6.6, AD-8): receita da Conta manual. A coluna da filha é quem
// vale; a Regra, a herança e o previsto não copiam a data.

const divisao: Divisao = {
  modo: "valor",
  partes: [
    { responsavel_id: "mae", numerador: 1, denominador: 3 },
    { responsavel_id: "casal", numerador: 1, denominador: 3 },
    { responsavel_id: "lucas", numerador: 1, denominador: 3, vencimento_combinado: "2027-04-06" },
  ],
};

describe("a data combinada na parte da Divisão", () => {
  it("lerDivisao guarda a data válida e descarta a ilegível", () => {
    expect(lerDivisao(divisao)?.partes.map((p) => p.vencimento_combinado)).toEqual([undefined, undefined, "2027-04-06"]);
    const ruim = { ...divisao, partes: divisao.partes.map((p) => ({ ...p, vencimento_combinado: "2027-02-31" })) };
    expect(lerDivisao(ruim)?.partes.every((p) => p.vencimento_combinado === undefined)).toBe(true);
    const numero = { ...divisao, partes: divisao.partes.map((p) => ({ ...p, vencimento_combinado: 20270406 })) };
    expect(lerDivisao(numero)?.partes.every((p) => p.vencimento_combinado === undefined)).toBe(true);
  });

  it("copiarDivisao NÃO copia a data (previsto, herança e Regra); só a Conta manual a pede", () => {
    expect(copiarDivisao(divisao).partes.every((p) => !("vencimento_combinado" in p))).toBe(true);
    expect(copiarDivisao(divisao, true).partes[2].vencimento_combinado).toBe("2027-04-06");
    expect(copiarDivisao(divisao, true).partes[0]).not.toHaveProperty("vencimento_combinado");
  });

  it("partesDaImportacao leva a data à parte (só quando a parte a tem): é por aqui que a RPC grava a filha", () => {
    const partes = partesDaImportacao(31_800, divisao);
    expect(partes?.map((p) => p.vencimento_combinado)).toEqual([undefined, undefined, "2027-04-06"]);
    expect(partes?.[0]).not.toHaveProperty("vencimento_combinado");
    expect(partes?.map((p) => p.valor_centavos)).toEqual([10_600, 10_600, 10_600]);
  });

  it("a data não muda 'é a mesma Divisão' (previstos e herança comparam só Responsáveis e frações)", () => {
    const semData = copiarDivisao(divisao);
    expect(mesmaDivisao(divisao, semData)).toBe(true);
    expect(mesmosVencimentosDasPartes(divisao, semData)).toBe(false);
    expect(mesmosVencimentosDasPartes(divisao, copiarDivisao(divisao, true))).toBe(true);
    expect(mesmosVencimentosDasPartes(null, null)).toBe(true);
    expect(mesmosVencimentosDasPartes(divisao, null)).toBe(false);
  });
});

describe("a reimportação trata a Dívida programada como trabalho do Rafael", () => {
  const comum = { editado_em: null, apelido: null, observacao: null, status_id: "padrao" };

  it("uma linha com data combinada não some em silêncio (vai ao Revisar como 'sumiu')", () => {
    expect(temTrabalhoManual({ ...comum, vencimento_combinado: "2027-04-06" }, "padrao")).toBe(true);
    expect(temTrabalhoManual({ ...comum, vencimento_combinado: null }, "padrao")).toBe(false);
    expect(temTrabalhoManual(comum, "padrao")).toBe(false);
  });
});
