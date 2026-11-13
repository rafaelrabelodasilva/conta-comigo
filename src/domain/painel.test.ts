import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import {
  ORDEM_PADRAO,
  alternarOrdem,
  distribuicaoPorResponsavel,
  mesAtual,
  mesesDaLista,
  ehOrdemPadrao,
  nomeExibido,
  ordenarGrade,
  ordenarLancamentos,
  rotuloLinhaAcessivel,
  somarValores,
  type LancamentoGrade,
  type NomesCadastros,
  resumoDoHistorico,
} from "./painel";

const lanc = (id: string, extra: Partial<LancamentoGrade> = {}): LancamentoGrade => ({
  id,
  nome: `LOJA ${id}`,
  apelido: null,
  parcela_n: null,
  parcela_total: null,
  valor_centavos: 1000,
  tipo_id: null,
  responsavel_id: null,
  status_id: null,
  lancado_por: "fatura",
  ordem_fatura: null,
  final_cartao: "5061",
  fatura_id: "f10",
  duvida_extracao: false,
  ...extra,
});

const nomes: NomesCadastros = {
  tipos: new Map([
    ["t-casa", "Casa"],
    ["t-viagem", "Viagem"],
  ]),
  responsaveis: new Map([
    ["r-rafael", "Rafael"],
    ["r-casal", "Casal"],
  ]),
  status: new Map([
    ["s-pago", "Pago"],
    ["s-nao", "Não pago"],
  ]),
  lancadoPor: { fatura: "Fatura", sistema: "Sistema", manual: "Manual", historico: "Histórico" },
};

const ids = (linhas: readonly LancamentoGrade[]) => linhas.map((l) => l.id);

describe("mesAtual", () => {
  it("é o mês do calendário de hoje (08/11/26 → novembro/26)", () => {
    expect(mesAtual("2026-11-08")).toBe("2026-11");
    expect(mesAtual("2026-12-31")).toBe("2026-12");
  });
});

describe("mesesDaLista", () => {
  it("do Mês mais antigo com Fatura até o Mês atual + 1", () => {
    expect(mesesDaLista(["2026-11", "2026-10"], "2026-11", "2026-11")).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("sem Fatura: do Mês atual ao seguinte, virando o ano", () => {
    expect(mesesDaLista([], "2026-12", "2026-12")).toEqual(["2026-12", "2027-01"]);
  });

  it("inclui o Mês aberto fora do intervalo, na ordem", () => {
    expect(mesesDaLista(["2026-10"], "2026-11", "2027-03")).toEqual(["2026-10", "2026-11", "2026-12", "2027-03"]);
    expect(mesesDaLista([], "2026-11", "2026-05")).toEqual(["2026-05", "2026-11", "2026-12"]);
  });
});

describe("ordenarLancamentos", () => {
  const linhas = [
    lanc("c", { ordem_fatura: 3, valor_centavos: -8, nome: "MSC CRUZEIROS" }),
    lanc("sem", { ordem_fatura: null, valor_centavos: 500, nome: "CONTA MANUAL" }),
    lanc("a", { ordem_fatura: 1, valor_centavos: 114074, parcela_n: 2, parcela_total: 12, tipo_id: "t-viagem" }),
    lanc("b", { ordem_fatura: 2, valor_centavos: 0, apelido: "Academia", parcela_n: 1, parcela_total: 3, tipo_id: "t-casa" }),
  ];

  it("padrão: a ordem da fatura, sem ordem no fim", () => {
    expect(ids(ordenarLancamentos(linhas, ORDEM_PADRAO, nomes))).toEqual(["a", "b", "c", "sem"]);
  });

  it("Valor: crescente e depois decrescente", () => {
    const cresc = alternarOrdem(ORDEM_PADRAO, "valor");
    expect(cresc).toEqual({ coluna: "valor", sentido: "crescente" });
    expect(ids(ordenarLancamentos(linhas, cresc, nomes))).toEqual(["c", "b", "sem", "a"]);
    const decresc = alternarOrdem(cresc, "valor");
    expect(decresc.sentido).toBe("decrescente");
    expect(ids(ordenarLancamentos(linhas, decresc, nomes))).toEqual(["a", "sem", "b", "c"]);
    // Outra coluna começa crescente.
    expect(alternarOrdem(decresc, "nome")).toEqual({ coluna: "nome", sentido: "crescente" });
  });

  it("Nome usa o Apelido quando há", () => {
    expect(ids(ordenarLancamentos(linhas, { coluna: "nome", sentido: "crescente" }, nomes))).toEqual([
      "b", // Academia
      "sem", // CONTA MANUAL
      "a", // LOJA a
      "c", // MSC CRUZEIROS
    ]);
  });

  it("vazios ficam no fim nos dois sentidos; empate segue a fatura", () => {
    const porParcela = (sentido: "crescente" | "decrescente") =>
      ids(ordenarLancamentos(linhas, { coluna: "parcela", sentido }, nomes));
    expect(porParcela("crescente")).toEqual(["b", "a", "c", "sem"]);
    expect(porParcela("decrescente")).toEqual(["a", "b", "c", "sem"]);
    expect(ids(ordenarLancamentos(linhas, { coluna: "tipo", sentido: "decrescente" }, nomes))).toEqual([
      "a",
      "b",
      "c",
      "sem",
    ]);
  });

  it("Responsável, Status e Lançado por pelo nome mostrado", () => {
    const outras = [
      lanc("x", { ordem_fatura: 1, responsavel_id: "r-rafael", status_id: "s-pago", lancado_por: "manual" }),
      lanc("y", { ordem_fatura: 2, responsavel_id: "r-casal", status_id: "s-nao", lancado_por: "fatura" }),
      lanc("z", { ordem_fatura: 3 }),
    ];
    expect(ids(ordenarLancamentos(outras, { coluna: "responsavel", sentido: "crescente" }, nomes))).toEqual(["y", "x", "z"]);
    expect(ids(ordenarLancamentos(outras, { coluna: "status", sentido: "crescente" }, nomes))).toEqual(["y", "x", "z"]);
    expect(ids(ordenarLancamentos(outras, { coluna: "lancado_por", sentido: "crescente" }, nomes))).toEqual(["y", "z", "x"]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...linhas];
    ordenarLancamentos(linhas, { coluna: "valor", sentido: "crescente" }, nomes);
    expect(linhas).toEqual(copia);
  });
});

describe("soma dos valores", () => {
  it("a soma dos valores desconta os créditos", () => {
    expect(somarValores([lanc("a", { valor_centavos: 114074 }), lanc("b", { valor_centavos: -8 })])).toBe(114066);
    expect(somarValores([])).toBe(0);
  });
});

describe("distribuicaoPorResponsavel", () => {
  it("soma líquida por Responsável, na ordem dada; sem responsável à parte", () => {
    const d = distribuicaoPorResponsavel(
      [
        lanc("a", { responsavel_id: "r-rafael", valor_centavos: 1000 }),
        lanc("b", { responsavel_id: "r-casal", valor_centavos: 3000 }),
        lanc("c", { responsavel_id: "r-rafael", valor_centavos: -200 }),
        lanc("d", { valor_centavos: 500 }),
      ],
      ["r-casal", "r-rafael"],
    );
    expect(d.segmentos).toEqual([
      { responsavelId: "r-casal", centavos: 3000 },
      { responsavelId: "r-rafael", centavos: 800 },
    ]);
    expect(d.semResponsavelCentavos).toBe(500);
  });

  it("somas zero ou negativas não viram segmento", () => {
    const d = distribuicaoPorResponsavel([
      lanc("a", { responsavel_id: "r-rafael", valor_centavos: -100 }),
      lanc("b", { responsavel_id: "r-casal", valor_centavos: 0 }),
      lanc("c", { valor_centavos: -50 }),
    ]);
    expect(d).toEqual({ segmentos: [], semResponsavelCentavos: 0 });
  });

  it("outubro importado sem classificação: um segmento só, sem responsável", () => {
    const d = distribuicaoPorResponsavel([lanc("a", { valor_centavos: 768777 })]);
    expect(d.segmentos).toEqual([]);
    expect(d.semResponsavelCentavos).toBe(768777);
  });
});

describe("ordenarGrade", () => {
  const linhas = [
    lanc("a", { ordem_fatura: 1, nome: "B" }),
    lanc("b", { ordem_fatura: 2, nome: "A", duvida_extracao: true }),
    lanc("c", { ordem_fatura: 3, nome: "C" }),
    lanc("d", { ordem_fatura: 4, nome: "D", duvida_extracao: true }),
  ];

  it("com Verificar e a ordem padrão: dúvidas primeiro, depois a ordem da fatura", () => {
    expect(ids(ordenarGrade(linhas, ORDEM_PADRAO, nomes, true))).toEqual(["b", "d", "a", "c"]);
  });

  it("sem Verificar, a ordem da fatura; com coluna ordenada, vale a coluna", () => {
    expect(ids(ordenarGrade(linhas, ORDEM_PADRAO, nomes, false))).toEqual(["a", "b", "c", "d"]);
    expect(ids(ordenarGrade(linhas, { coluna: "nome", sentido: "crescente" }, nomes, true))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("ehOrdemPadrao", () => {
    expect(ehOrdemPadrao(ORDEM_PADRAO)).toBe(true);
    expect(ehOrdemPadrao({ coluna: "fatura", sentido: "decrescente" })).toBe(false);
    expect(ehOrdemPadrao({ coluna: "valor", sentido: "crescente" })).toBe(false);
  });
});

describe("rotuloLinhaAcessivel", () => {
  it("Ajuste: 'Ajuste de NOME, - R$ 0,08, líquido R$ 1.140,66, Responsável, Status'", () => {
    expect(
      rotuloLinhaAcessivel({
        nome: "MSC CRUZEIROS",
        valorCentavos: -8,
        parcelaN: null,
        parcelaTotal: null,
        responsavel: "Casal",
        status: "Não pago",
        ajuste: { nomeMae: "Cruzeiro", liquidoCentavos: 114066 },
      }),
    ).toBe(`Ajuste de Cruzeiro, -${ESPACO}R$${ESPACO}0,08, líquido R$${ESPACO}1.140,66, Casal, Não pago`);
  });

  it("linha marcada termina com 'verificar este lançamento'", () => {
    expect(
      rotuloLinhaAcessivel({
        nome: "BELLA PIETRA",
        valorCentavos: 8000,
        parcelaN: 3,
        parcelaTotal: 4,
        responsavel: "Casal",
        status: "Não pago",
        verificar: true,
      }),
    ).toBe(`BELLA PIETRA, R$${ESPACO}80,00, parcela 3 de 4, Casal, Não pago, verificar este lançamento`);
  });

  it("Nome, Valor, Parcela, Responsável, Status", () => {
    expect(
      rotuloLinhaAcessivel({
        nome: "MSC CRUZEIROS",
        valorCentavos: 114074,
        parcelaN: 2,
        parcelaTotal: 12,
        responsavel: "Casal",
        status: "Não pago",
      }),
    ).toBe(`MSC CRUZEIROS, R$${ESPACO}1.140,74, parcela 2 de 12, Casal, Não pago`);
  });

  it("à vista e sem Status ficam de fora; crédito e zero aparecem", () => {
    expect(
      rotuloLinhaAcessivel({
        nome: "MSC CRUZEIROS",
        valorCentavos: -8,
        parcelaN: null,
        parcelaTotal: null,
        responsavel: "Sem responsável",
        status: null,
      }),
    ).toBe(`MSC CRUZEIROS, -${ESPACO}R$${ESPACO}0,08, Sem responsável`);
    expect(
      rotuloLinhaAcessivel({ nome: "X", valorCentavos: 0, parcelaN: null, parcelaTotal: null, responsavel: "Rafael", status: "Pago" }),
    ).toBe(`X, R$${ESPACO}0,00, Rafael, Pago`);
  });

  it("nome exibido: o Apelido, ou o Nome", () => {
    expect(nomeExibido({ nome: "MAGALU", apelido: "Lava e seca" })).toBe("Lava e seca");
    expect(nomeExibido({ nome: "MAGALU", apelido: null })).toBe("MAGALU");
    expect(nomeExibido({ nome: "MAGALU", apelido: "  " })).toBe("MAGALU");
  });
});

describe("resumoDoHistorico (História 3.10)", () => {
  const linha = (extra: Record<string, unknown>) => ({ lancado_por: "historico" as const, valor_centavos: 1000, dividido_de_id: null, divisao: null, ...extra });

  it("soma só as linhas `historico`, conta a mãe dividida uma vez e usa as filhas no valor", () => {
    const r = resumoDoHistorico([
      linha({ valor_centavos: 10000 }),
      linha({ valor_centavos: -2500 }),
      linha({ valor_centavos: 46600, divisao: { modo: "valor" } }),
      linha({ valor_centavos: 31067, dividido_de_id: "m" }),
      linha({ valor_centavos: 15533, dividido_de_id: "m" }),
      linha({ lancado_por: "sistema", valor_centavos: 99999 }),
    ]);
    expect(r).toEqual({ totalCentavos: 10000 - 2500 + 31067 + 15533, quantidade: 3 });
  });

  it("sem linhas de histórico, null", () => {
    expect(resumoDoHistorico([])).toBeNull();
    expect(resumoDoHistorico([linha({ lancado_por: "sistema" })])).toBeNull();
  });
});

describe("ordem do histórico da planilha (História 3.10)", () => {
  it("sem `ordem_fatura`, a ordem padrão segue a ordem em que a aba foi gravada (created_at), seja qual for a ordem do array", () => {
    const h = (id: string, created_at: string) => lanc(id, { lancado_por: "historico", fatura_id: null, final_cartao: null, created_at });
    const linhas = [
      h("c", "2026-11-13T12:00:00.300000+00:00"),
      h("a", "2026-11-13T12:00:00.100000+00:00"),
      h("b", "2026-11-13T12:00:00.200000+00:00"),
    ];
    expect(ordenarLancamentos(linhas, ORDEM_PADRAO, nomes).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("linha com `ordem_fatura` vem antes de empates sem ela, e sem `created_at` o empate continua estável", () => {
    const linhas = [lanc("x"), lanc("y", { ordem_fatura: 1 }), lanc("z")];
    expect(ordenarLancamentos(linhas, ORDEM_PADRAO, nomes).map((l) => l.id)).toEqual(["y", "x", "z"]);
  });
});
