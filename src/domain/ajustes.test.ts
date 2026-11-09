import { describe, expect, it } from "vitest";
import {
  agruparComAjustes,
  idsQueAcompanham,
  liquidoCentavos,
  reconhecerAjustes,
  separarAjustes,
  somaDosAjustes,
  textoLiquido,
  type LinhaParaAjuste,
} from "./ajustes";
import { LIMITE_AJUSTE_PADRAO_CENTAVOS } from "./configuracoes";
import { ESPACO } from "./dinheiro";

const sem = (t: string) => t.replaceAll(ESPACO, " ");

const linha = (extra: Partial<LinhaParaAjuste> = {}): LinhaParaAjuste => ({
  valor_centavos: 1000,
  parcela_n: null,
  nome_normalizado: "MSC CRUZEIROS",
  final_cartao: "5061",
  ordem_fatura: 1,
  ...extra,
});

/** "MSC CRUZEIROS 02/12 R$ 1.140,74" e "MSC CRUZEIROS - R$ 0,08" (aceite do Épico 2). */
const msc = linha({ valor_centavos: 114074, parcela_n: 2, ordem_fatura: 1 });
const credito = (valor: number, extra: Partial<LinhaParaAjuste> = {}) =>
  linha({ valor_centavos: valor, ordem_fatura: 2, ...extra });

describe("reconhecerAjustes", () => {
  it("MSC CRUZEIROS 02/12 R$ 1.140,74 + MSC CRUZEIROS - R$ 0,08, limite R$ 1,00: Ajuste da parcela", () => {
    expect(reconhecerAjustes([msc, credito(-8)], LIMITE_AJUSTE_PADRAO_CENTAVOS)).toEqual([{ ajuste: 1, mae: 0 }]);
  });

  it("limite é menor estrito: - R$ 1,00 e - R$ 1,50 não são Ajuste; - R$ 0,99 é", () => {
    expect(reconhecerAjustes([msc, credito(-100)], 100)).toEqual([]);
    expect(reconhecerAjustes([msc, credito(-150)], 100)).toEqual([]);
    expect(reconhecerAjustes([msc, credito(-99)], 100)).toEqual([{ ajuste: 1, mae: 0 }]);
    // Outro limite (Configurações): R$ 2,00 aceita - R$ 1,50; R$ 0,05 recusa - R$ 0,08.
    expect(reconhecerAjustes([msc, credito(-150)], 200)).toEqual([{ ajuste: 1, mae: 0 }]);
    expect(reconhecerAjustes([msc, credito(-8)], 5)).toEqual([]);
  });

  it("duas mães: fica a do mesmo cartão do crédito", () => {
    const no5061 = linha({ valor_centavos: 114074, parcela_n: 2, final_cartao: "5061", ordem_fatura: 1 });
    const no9277 = linha({ valor_centavos: 9900, parcela_n: 1, final_cartao: "9277", ordem_fatura: 2 });
    const c = credito(-8, { final_cartao: "9277", ordem_fatura: 3 });
    expect(reconhecerAjustes([no5061, no9277, c], 100)).toEqual([{ ajuste: 2, mae: 1 }]);
  });

  it("empate no cartão: a de menor ordem_fatura (na ordem da lista ou não)", () => {
    const segunda = linha({ valor_centavos: 500, parcela_n: 1, ordem_fatura: 5 });
    const primeira = linha({ valor_centavos: 500, parcela_n: 3, ordem_fatura: 2 });
    expect(reconhecerAjustes([segunda, primeira, credito(-8, { ordem_fatura: 9 })], 100)).toEqual([{ ajuste: 2, mae: 1 }]);
    // Nenhuma do mesmo cartão: a de menor ordem entre as outras.
    const outro = credito(-8, { final_cartao: "8673", ordem_fatura: 9 });
    expect(reconhecerAjustes([segunda, primeira, outro], 100)).toEqual([{ ajuste: 2, mae: 1 }]);
  });

  it("sem parcela: 'PADARIA' à vista + 'PADARIA' - R$ 0,05 não é Ajuste", () => {
    const padaria = linha({ nome_normalizado: "PADARIA", valor_centavos: 2000 });
    expect(reconhecerAjustes([padaria, credito(-5, { nome_normalizado: "PADARIA" })], 100)).toEqual([]);
  });

  it("outro Nome, despesa, crédito com Parcela ou outra Fatura: não é Ajuste", () => {
    expect(reconhecerAjustes([msc, credito(-8, { nome_normalizado: "MSC" })], 100)).toEqual([]);
    expect(reconhecerAjustes([msc, credito(8)], 100)).toEqual([]);
    expect(reconhecerAjustes([msc, credito(0)], 100)).toEqual([]);
    expect(reconhecerAjustes([msc, credito(-8, { parcela_n: 1 })], 100)).toEqual([]);
    const gravadas = [{ ...msc, fatura_id: "f10" }, credito(-8, { fatura_id: "f11" })];
    expect(reconhecerAjustes(gravadas, 100)).toEqual([]);
    // Fora de Fatura (incluído à mão sem a caixa): nunca.
    expect(reconhecerAjustes([{ ...msc, fatura_id: null }, credito(-8, { fatura_id: null })], 100)).toEqual([]);
    expect(reconhecerAjustes([{ ...msc, fatura_id: "f10" }, credito(-8, { fatura_id: "f10" })], 100)).toEqual([
      { ajuste: 1, mae: 0 },
    ]);
  });

  it("uma parcela pode ter mais de um Ajuste; um Ajuste nunca é mãe", () => {
    const pares = reconhecerAjustes([msc, credito(-8), credito(-3, { ordem_fatura: 3 })], 100);
    expect(pares).toEqual([
      { ajuste: 1, mae: 0 },
      { ajuste: 2, mae: 0 },
    ]);
    expect(pares.some((p) => p.mae !== 0)).toBe(false);
  });
});

type L = { id: string; ajuste_de_id?: string | null; ordem_fatura: number | null; valor_centavos: number; excluido_em?: string | null };

const mae: L = { id: "msc", ajuste_de_id: null, ordem_fatura: 1, valor_centavos: 114074 };
const ajuste: L = { id: "aj", ajuste_de_id: "msc", ordem_fatura: 3, valor_centavos: -8 };
const outro: L = { id: "pad", ajuste_de_id: null, ordem_fatura: 2, valor_centavos: 2000 };

describe("grade", () => {
  it("separarAjustes: as mães julgam; o Ajuste vai para a mãe; sem a mãe no Mês, é linha comum", () => {
    const { maes, ajustesPorMae } = separarAjustes([mae, outro, ajuste]);
    expect(maes.map((l) => l.id)).toEqual(["msc", "pad"]);
    expect(ajustesPorMae.get("msc")?.map((l) => l.id)).toEqual(["aj"]);
    const orfao = separarAjustes([outro, ajuste]);
    expect(orfao.maes.map((l) => l.id)).toEqual(["pad", "aj"]);
    expect(orfao.ajustesPorMae.size).toBe(0);
  });

  it("agruparComAjustes: o Ajuste logo abaixo da mãe, em qualquer ordem das mães", () => {
    const { ajustesPorMae } = separarAjustes([mae, outro, ajuste]);
    const ids = (maes: L[]) => agruparComAjustes(maes, ajustesPorMae).map((g) => [g.linha.id, g.mae?.id ?? null]);
    expect(ids([mae, outro])).toEqual([
      ["msc", null],
      ["aj", "msc"],
      ["pad", null],
    ]);
    expect(ids([outro, mae])).toEqual([
      ["pad", null],
      ["msc", null],
      ["aj", "msc"],
    ]);
  });

  it("líquido: 'R$ 1.140,74 - R$ 0,08 = R$ 1.140,66', somando todos os Ajustes da mãe", () => {
    expect(sem(textoLiquido(mae, [ajuste]))).toBe("R$ 1.140,74 - R$ 0,08 = R$ 1.140,66");
    const dois = [ajuste, { ...ajuste, id: "aj2", valor_centavos: -2 }];
    expect(sem(textoLiquido(mae, dois))).toBe("R$ 1.140,74 - R$ 0,10 = R$ 1.140,64");
    expect(liquidoCentavos(mae, dois)).toBe(114064);
    expect(somaDosAjustes(dois)).toBe(-10);
  });

  it("idsQueAcompanham: os Ajustes não excluídos da mãe; o do Ajuste, nenhum", () => {
    const excluido = { ...ajuste, id: "aj-x", excluido_em: "2026-11-09T00:00:00Z" };
    expect(idsQueAcompanham("msc", [mae, ajuste, outro, excluido])).toEqual(["aj"]);
    expect(idsQueAcompanham("aj", [mae, ajuste, outro])).toEqual([]);
  });
});
