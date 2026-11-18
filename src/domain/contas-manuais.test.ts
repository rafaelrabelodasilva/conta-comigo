import { describe, expect, it } from "vitest";
import {
  HORIZONTE_MESES,
  adicionarParte,
  avaliarFormularioConta,
  chaveDaSerieDaConta,
  contaLegivel,
  contaMudou,
  descricaoDaRepeticao,
  horizonteDasContas,
  parcelasDaConta,
  pedidoMaterializar,
  pedidoMaterializarDoDono,
  pedidoSalvarConta,
  proximaOcorrencia,
  rascunhoDaConta,
  rascunhoInicialDaConta,
  removerParte,
  responsaveisDaConta,
  totalDaConta,
  type ContaManual,
  type ContextoDoFormulario,
  type NovaConta,
  type RascunhoDaConta,
} from "./contas-manuais";
import { compararPelaFatura } from "./painel";
import { idsDosPrevistos, projetarPainel, projetarMensagem, type LancamentoParaMensagem } from "./projecoes";
import { resumirBloco } from "./blocos";
import { ehPrevistoDeConta, ehPrevistoNoMes } from "./previstos";
import { mensagem } from "./mensagens";

const MAE = "r-mae";
const CASAL = "r-casal";
const LUCAS = "r-lucas";
const RAFAEL = "r-rafael";
const VIAGEM = "t-viagem";
const SAUDE = "t-saude";

const CTX: ContextoDoFormulario = {
  mesAtual: "2026-11",
  tiposAtivos: new Set([VIAGEM, SAUDE]),
  responsaveisAtivos: new Set([MAE, CASAL, LUCAS, RAFAEL]),
};

const BOMBINHAS: RascunhoDaConta = {
  nome: "Bombinhas",
  valor: "318,00",
  repeticao: "parcelas",
  parcelas: "6",
  comecaEm: "2026-07",
  tipo_id: VIAGEM,
  observacao: "",
  partes: [
    { responsavel_id: MAE, texto: "106,00" },
    { responsavel_id: CASAL, texto: "106,00" },
    { responsavel_id: LUCAS, texto: "106,00" },
  ],
};

function conta(r: RascunhoDaConta, id = "c1"): NovaConta {
  const a = avaliarFormularioConta(id, r, CTX);
  expect(a.erros).toEqual({});
  expect(a.conta).not.toBeNull();
  return a.conta as NovaConta;
}

const comoCadastro = (c: NovaConta, extra: Partial<ContaManual> = {}): ContaManual => ({ ...c, encerrada_em_mes: null, ...extra });

describe("parcelasDaConta: a Bombinhas", () => {
  const bombinhas = conta(BOMBINHAS);

  it("6 parcelas de Jul/26 a Dez/26, cada uma de R$ 318,00 com três partes de R$ 106,00", () => {
    const parcelas = parcelasDaConta(comoCadastro(bombinhas), horizonteDasContas("2026-11"));
    expect(parcelas.map((p) => [p.parcela_n, p.mes])).toEqual([
      [1, "2026-07"],
      [2, "2026-08"],
      [3, "2026-09"],
      [4, "2026-10"],
      [5, "2026-11"],
      [6, "2026-12"],
    ]);
    for (const p of parcelas) {
      expect(p.parcela_total).toBe(6);
      expect(p.valor_centavos).toBe(31_800);
      expect(p.partes?.map((x) => x.valor_centavos)).toEqual([10_600, 10_600, 10_600]);
      expect(p.partes?.map((x) => x.responsavel_id)).toEqual([MAE, CASAL, LUCAS]);
      expect(p.partes?.every((x) => x.filha_id === null)).toBe(true);
    }
  });

  it("a Divisão guardada é em frações (soma 1) e vale para qualquer parcela", () => {
    expect(bombinhas.divisao?.modo).toBe("valor");
    expect(bombinhas.divisao?.partes.map((p) => [p.numerador, p.denominador])).toEqual([
      [1, 3],
      [1, 3],
      [1, 3],
    ]);
    expect(bombinhas.responsavel_id).toBeNull();
  });

  it("o total da conta: 6 × R$ 318,00 = R$ 1.908,00", () => {
    expect(totalDaConta(31_800, 6)).toBe(190_800);
    expect(totalDaConta(31_800, null)).toBeNull();
    expect(totalDaConta(null, 6)).toBeNull();
  });
});

describe("parcelasDaConta: recorrente e horizonte", () => {
  const silvia = (extra: Partial<ContaManual> = {}): ContaManual => ({
    id: "silvia",
    nome: "Silvia",
    valor_centavos: 40_000,
    tipo_id: SAUDE,
    responsavel_id: RAFAEL,
    observacao: null,
    mes_inicial: "2026-01",
    repeticao: "mensal",
    parcela_total: null,
    divisao: null,
    encerrada_em_mes: null,
    ...extra,
  });

  it("parcela_n conta desde o Mês inicial e o horizonte é Mês atual + 12", () => {
    expect(HORIZONTE_MESES).toBe(12);
    const ate = horizonteDasContas("2026-11");
    expect(ate).toBe("2027-11");
    const parcelas = parcelasDaConta(silvia(), ate);
    expect(parcelas).toHaveLength(23);
    expect(parcelas[0]).toMatchObject({ parcela_n: 1, mes: "2026-01", parcela_total: null, partes: null });
    // O Mês atual (Nov/26) é a parcela 11; o último é Nov/27, parcela 23.
    expect(parcelas.find((p) => p.mes === "2026-11")?.parcela_n).toBe(11);
    expect(parcelas.at(-1)).toMatchObject({ parcela_n: 23, mes: "2027-11" });
  });

  it("uma parcelada longa pára no horizonte, e uma curta, em parcela_total", () => {
    const longa = silvia({ repeticao: "parcelas", parcela_total: 24, mes_inicial: "2026-11" });
    expect(parcelasDaConta(longa, "2027-11").map((p) => p.parcela_n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const curta = silvia({ repeticao: "parcelas", parcela_total: 3, mes_inicial: "2026-11" });
    expect(parcelasDaConta(curta, "2027-11").map((p) => p.mes)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("Mês inicial no futuro dentro do horizonte, e além dele (nenhuma parcela por enquanto)", () => {
    expect(parcelasDaConta(silvia({ mes_inicial: "2027-10" }), "2027-11").map((p) => p.mes)).toEqual(["2027-10", "2027-11"]);
    expect(parcelasDaConta(silvia({ mes_inicial: "2028-03" }), "2027-11")).toEqual([]);
  });

  it("a Conta encerrada pára antes do Mês do encerramento", () => {
    const encerrada = parcelasDaConta(silvia({ encerrada_em_mes: "2026-10" }), "2027-11");
    expect(encerrada.at(-1)).toMatchObject({ parcela_n: 9, mes: "2026-09" });
    expect(parcelasDaConta(silvia({ encerrada_em_mes: "2026-01" }), "2027-11")).toEqual([]);
  });

  it("virada de ano e rodar de novo dá exatamente o mesmo (puro)", () => {
    const a = parcelasDaConta(silvia({ mes_inicial: "2026-11" }), "2027-02");
    expect(a.map((p) => p.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(parcelasDaConta(silvia({ mes_inicial: "2026-11" }), "2027-02")).toEqual(a);
  });

  it("Conta mal formada ou Divisão que não vale: nenhuma linha (melhor que uma errada)", () => {
    expect(parcelasDaConta(silvia({ valor_centavos: 0 }), "2027-11")).toEqual([]);
    expect(parcelasDaConta(silvia({ valor_centavos: -100 }), "2027-11")).toEqual([]);
    expect(parcelasDaConta(silvia({ mes_inicial: "2026-13" }), "2027-11")).toEqual([]);
    expect(parcelasDaConta(silvia({ repeticao: "parcelas", parcela_total: null }), "2027-11")).toEqual([]);
    expect(parcelasDaConta(silvia({ divisao: { modo: "valor", partes: [] } }), "2027-11")).toEqual([]);
  });
});

describe("Divisão com arredondamento (R$ 100,00 em 3 partes)", () => {
  const cem = (partes: string[]): RascunhoDaConta => ({
    ...BOMBINHAS,
    nome: "Cem",
    valor: "100,00",
    repeticao: "mensal",
    parcelas: "",
    partes: partes.map((texto, i) => ({ responsavel_id: [MAE, CASAL, LUCAS][i], texto })),
  });

  it("33,33 + 33,33 + 33,34 fecham em R$ 100,00 e as filhas somam o Valor", () => {
    const c = conta(cem(["33,33", "33,33", "33,34"]));
    const [p] = parcelasDaConta(comoCadastro(c), "2026-11");
    expect(p.partes?.map((x) => x.valor_centavos)).toEqual([3_333, 3_333, 3_334]);
    expect(p.partes?.reduce((s, x) => s + x.valor_centavos, 0)).toBe(10_000);
  });

  it("33,33 três vezes não fecha: a soma tem que ser o Valor", () => {
    const a = avaliarFormularioConta("c", cem(["33,33", "33,33", "33,33"]), CTX);
    expect(a.conta).toBeNull();
    expect(a.erros.divisao).toBe("divisao.soma_diferente");
    expect(a.somaCentavos).toBe(9_999);
    expect(a.valorCentavos).toBe(10_000);
  });

  it("uma Divisão guardada em frações usa o arredondamento do AD-2 (última parte recebe o resto)", () => {
    const um3 = { numerador: 1, denominador: 3 };
    const c: ContaManual = {
      id: "x",
      nome: "Cem",
      valor_centavos: 10_000,
      tipo_id: VIAGEM,
      responsavel_id: null,
      observacao: null,
      mes_inicial: "2026-11",
      repeticao: "mensal",
      parcela_total: null,
      divisao: {
        modo: "proporcao",
        partes: [MAE, CASAL, LUCAS].map((responsavel_id) => ({ responsavel_id, ...um3 })),
      },
      encerrada_em_mes: null,
    };
    const [p] = parcelasDaConta(c, "2026-11");
    expect(p.partes?.map((x) => x.valor_centavos)).toEqual([3_333, 3_333, 3_334]);
  });

  it("Monjaro: 2/3 + 1/3 de R$ 466,00 = R$ 310,67 + R$ 155,33", () => {
    const c = conta({
      ...BOMBINHAS,
      nome: "Monjaro",
      valor: "466,00",
      partes: [
        { responsavel_id: MAE, texto: "310,67" },
        { responsavel_id: CASAL, texto: "155,33" },
      ],
    });
    const [p] = parcelasDaConta(comoCadastro(c), "2026-07");
    expect(p.partes?.map((x) => x.valor_centavos)).toEqual([31_067, 15_533]);
  });
});

describe("avaliarFormularioConta: validações e mensagens", () => {
  const avaliar = (extra: Partial<RascunhoDaConta>, ctx: ContextoDoFormulario = CTX) =>
    avaliarFormularioConta("c", { ...BOMBINHAS, ...extra }, ctx);
  const umResponsavel = (id: string | null): RascunhoDaConta["partes"] => [{ responsavel_id: id, texto: "" }];

  it("a Bombinhas é válida e vira a Conta a gravar", () => {
    const a = avaliar({});
    expect(a.erros).toEqual({});
    expect(a.conta).toMatchObject({
      id: "c",
      nome: "Bombinhas",
      nome_normalizado: "BOMBINHAS",
      valor_centavos: 31_800,
      tipo_id: VIAGEM,
      responsavel_id: null,
      observacao: null,
      mes_inicial: "2026-07",
      repeticao: "parcelas",
      parcela_total: 6,
    });
    expect(a.valoresDasPartes).toEqual([10_600, 10_600, 10_600]);
    expect(a.somaCentavos).toBe(31_800);
  });

  it("um Responsável só: sem Divisão, e a mensal ignora o campo Parcelas", () => {
    const a = avaliar({ repeticao: "mensal", parcelas: "abc", partes: umResponsavel(RAFAEL), nome: "  Silvia  ", observacao: " plano " });
    expect(a.erros).toEqual({});
    expect(a.conta).toMatchObject({ nome: "Silvia", responsavel_id: RAFAEL, divisao: null, parcela_total: null, observacao: "plano" });
  });

  it("Nome: vazio ou só espaços, e acima de 100 caracteres", () => {
    expect(avaliar({ nome: "   " }).erros.nome).toBe("conta.nome_vazio");
    expect(avaliar({ nome: "a".repeat(101) }).erros.nome).toBe("conta.nome_longo");
    expect(avaliar({ nome: "a".repeat(100) }).erros.nome).toBeUndefined();
    expect(mensagem("conta.nome_vazio")).toBe("Digite o nome da conta.");
  });

  it("Valor: inválido, R$ 0,00, negativo e grande demais", () => {
    expect(avaliar({ valor: "" }).erros.valor).toBe("conta.valor_invalido");
    expect(avaliar({ valor: "abc" }).erros.valor).toBe("conta.valor_invalido");
    expect(avaliar({ valor: "0,00" }).erros.valor).toBe("conta.valor_zero");
    expect(avaliar({ valor: "-318,00" }).erros.valor).toBe("conta.valor_zero");
    expect(avaliar({ valor: "900.000,01" }).erros.valor).toBe("conta.valor_grande");
    expect(avaliar({ valor: "900.000,00", partes: umResponsavel(RAFAEL) }).erros.valor).toBeUndefined();
    expect(mensagem("conta.valor_zero")).toContain("maior que R$ 0,00");
  });

  it("Valor inválido não calcula a Divisão (só o erro do Valor)", () => {
    const a = avaliar({ valor: "" });
    expect(a.erros.divisao).toBeUndefined();
    expect(a.conta).toBeNull();
    expect(a.somaCentavos).toBeNull();
  });

  it("Parcelas: de 2 a 120", () => {
    for (const ruim of ["", "1", "0", "121", "x", "2,5", "-3"]) {
      expect(avaliar({ parcelas: ruim }).erros.parcelas).toBe("conta.parcelas_invalidas");
    }
    for (const bom of ["2", "6", "120"]) expect(avaliar({ parcelas: bom }).erros.parcelas).toBeUndefined();
  });

  it('"Começa em": Mês válido e até 5 anos do Mês atual', () => {
    expect(avaliar({ comecaEm: "" }).erros.comecaEm).toBe("conta.mes_invalido");
    expect(avaliar({ comecaEm: "2026-13" }).erros.comecaEm).toBe("conta.mes_invalido");
    expect(avaliar({ comecaEm: "2021-10" }).erros.comecaEm).toBe("conta.mes_fora_do_limite");
    expect(avaliar({ comecaEm: "2021-11" }).erros.comecaEm).toBeUndefined();
    expect(avaliar({ comecaEm: "2031-12" }).erros.comecaEm).toBe("conta.mes_fora_do_limite");
    // Mês passado é permitido: a Conta recebe os Meses anteriores também.
    expect(avaliar({ comecaEm: "2026-01" }).erros.comecaEm).toBeUndefined();
  });

  it("Tipo: obrigatório e ativo", () => {
    expect(avaliar({ tipo_id: null }).erros.tipo).toBe("conta.sem_tipo");
    expect(avaliar({ tipo_id: "t-arquivado" }).erros.tipo).toBe("conta.tipo_arquivado");
  });

  it("Observação: até 200 caracteres", () => {
    expect(avaliar({ observacao: "a".repeat(201) }).erros.observacao).toBe("conta.observacao_longa");
    expect(avaliar({ observacao: "a".repeat(200) }).erros.observacao).toBeUndefined();
  });

  it("Responsável: obrigatório e ativo (um só); na Divisão, todas as partes", () => {
    expect(avaliar({ partes: umResponsavel(null) }).erros.divisao).toBe("conta.sem_responsavel");
    expect(avaliar({ partes: umResponsavel("r-arquivado") }).erros.divisao).toBe("conta.responsavel_arquivado");
    expect(avaliar({ partes: [{ responsavel_id: MAE, texto: "159,00" }, { responsavel_id: null, texto: "159,00" }] }).erros.divisao).toBe(
      "divisao.sem_responsavel",
    );
    expect(
      avaliar({ partes: [{ responsavel_id: MAE, texto: "159,00" }, { responsavel_id: "r-arquivado", texto: "159,00" }] }).erros.divisao,
    ).toBe("conta.responsavel_arquivado");
  });

  it("Divisão: soma diferente do Valor, parte zerada, valor ilegível e partes demais", () => {
    const duas = (a: string, b: string): RascunhoDaConta["partes"] => [
      { responsavel_id: MAE, texto: a },
      { responsavel_id: CASAL, texto: b },
    ];
    const soma = avaliar({ partes: duas("100,00", "100,00") });
    expect(soma.erros.divisao).toBe("divisao.soma_diferente");
    expect(soma.somaCentavos).toBe(20_000);
    expect(avaliar({ partes: duas("318,00", "0,00") }).erros.divisao).toBe("divisao.parte_zerada");
    expect(avaliar({ partes: duas("318,00", "x") }).erros.divisao).toBe("dinheiro.invalido");
    const onze = Array.from({ length: 11 }, () => ({ responsavel_id: MAE, texto: "1,00" }));
    expect(avaliar({ partes: onze }).erros.divisao).toBe("divisao.partes_demais");
    expect(mensagem("divisao.soma_diferente")).toContain("soma das partes");
  });

  it("vários erros de uma vez, sem Conta", () => {
    const a = avaliarFormularioConta(
      "c",
      { ...rascunhoInicialDaConta("2026-11"), repeticao: "parcelas" },
      CTX,
    );
    expect(Object.keys(a.erros).sort()).toEqual(["divisao", "nome", "parcelas", "tipo", "valor"]);
    expect(a.conta).toBeNull();
  });

  it("o rascunho inicial é mensal, no Mês atual e com uma linha de Responsável", () => {
    expect(rascunhoInicialDaConta("2026-11")).toMatchObject({ repeticao: "mensal", comecaEm: "2026-11", tipo_id: null });
    expect(rascunhoInicialDaConta("2026-11").partes).toEqual([{ responsavel_id: null, texto: "" }]);
  });
});

describe('"＋ Parte" e remover', () => {
  it("a segunda parte nasce com o Valor ao meio; as seguintes, vazias; no máximo 10", () => {
    const uma = [{ responsavel_id: MAE, texto: "" }];
    const duas = adicionarParte(uma, 31_800);
    expect(duas).toEqual([
      { responsavel_id: MAE, texto: "159,00" },
      { responsavel_id: null, texto: "159,00" },
    ]);
    const tres = adicionarParte(duas, 31_800);
    expect(tres).toHaveLength(3);
    expect(tres[2]).toEqual({ responsavel_id: null, texto: "" });
    expect(adicionarParte(uma, null)).toEqual([...uma, { responsavel_id: null, texto: "" }]);
    expect(adicionarParte(Array.from({ length: 10 }, () => ({ responsavel_id: MAE, texto: "1,00" })), 31_800)).toHaveLength(10);
  });

  it("meio centavo vai para a segunda parte (R$ 0,01 não divide em duas partes iguais)", () => {
    const [a, b] = adicionarParte([{ responsavel_id: MAE, texto: "" }], 101);
    expect([a.texto, b.texto]).toEqual(["0,51", "0,50"]);
  });

  it("remover mantém ao menos uma parte e ignora posição inválida", () => {
    const tres = [
      { responsavel_id: MAE, texto: "1,00" },
      { responsavel_id: CASAL, texto: "2,00" },
      { responsavel_id: LUCAS, texto: "3,00" },
    ];
    expect(removerParte(tres, 1).map((p) => p.responsavel_id)).toEqual([MAE, LUCAS]);
    expect(removerParte([tres[0]], 0)).toHaveLength(1);
    expect(removerParte(tres, 9)).toHaveLength(3);
  });
});

describe("a Série da Conta (AD-8) e as duas Contas idênticas", () => {
  it("a chave é (Nome normalizado, total, Valor, Mês inicial, ocorrencia); recorrente tem total nulo", () => {
    const b = conta(BOMBINHAS);
    expect(chaveDaSerieDaConta(b, 1)).toEqual({
      nome_normalizado: "BOMBINHAS",
      parcela_total: 6,
      valor_parcela_centavos: 31_800,
      mes_primeira_parcela: "2026-07",
      ocorrencia: 1,
    });
    const s = conta({ ...BOMBINHAS, nome: "tv box", valor: "30,00", repeticao: "mensal", partes: [{ responsavel_id: RAFAEL, texto: "" }] });
    expect(chaveDaSerieDaConta(s, 2)).toMatchObject({ nome_normalizado: "TV BOX", parcela_total: null, ocorrencia: 2 });
  });

  it("proximaOcorrencia usa a menor livre", () => {
    expect(proximaOcorrencia([])).toBe(1);
    expect(proximaOcorrencia([1])).toBe(2);
    expect(proximaOcorrencia([1, 2, 3])).toBe(4);
    expect(proximaOcorrencia([2, 3])).toBe(1);
    expect(proximaOcorrencia([1, 3])).toBe(2);
  });
});

describe("os pedidos às RPCs", () => {
  it("salvar: a Conta, a chave da Série e as parcelas até o horizonte", () => {
    const b = conta(BOMBINHAS);
    const p = pedidoSalvarConta(b, 1, "2027-11");
    expect(p.p_ate_mes).toBe("2027-11");
    expect(p.p_conta).toMatchObject({ id: "c1", nome: "Bombinhas", serie: { ocorrencia: 1, parcela_total: 6 } });
    expect(p.p_parcelas).toHaveLength(6);
    expect(p.p_parcelas[0]).toEqual({
      conta_id: "c1",
      parcela_n: 1,
      mes: "2026-07",
      valor_centavos: 31_800,
      partes: [
        { filha_id: null, responsavel_id: MAE, valor_centavos: 10_600 },
        { filha_id: null, responsavel_id: CASAL, valor_centavos: 10_600 },
        { filha_id: null, responsavel_id: LUCAS, valor_centavos: 10_600 },
      ],
    });
  });

  it("salvar de novo monta o mesmo pedido (a RPC é que não duplica, por `on conflict`)", () => {
    const b = conta(BOMBINHAS);
    expect(pedidoSalvarConta(b, 1, "2027-11")).toEqual(pedidoSalvarConta(b, 1, "2027-11"));
  });

  it("materializar (o cron da 5.3): as parcelas de todas as Contas até o horizonte", () => {
    const b = comoCadastro(conta(BOMBINHAS, "b"));
    const s = comoCadastro(
      conta({ ...BOMBINHAS, nome: "Silvia", valor: "400,00", repeticao: "mensal", comecaEm: "2026-10", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, "s"),
    );
    const p = pedidoMaterializar([b, s], "2026-12");
    expect(p.p_ate_mes).toBe("2026-12");
    expect(p.p_parcelas.filter((x) => x.conta_id === "b")).toHaveLength(6);
    expect(p.p_parcelas.filter((x) => x.conta_id === "s").map((x) => x.mes)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(p.p_parcelas.find((x) => x.conta_id === "s")?.partes).toBeNull();
  });
});

describe("descricaoDaRepeticao", () => {
  const base = { repeticao: "mensal", parcela_total: null, mes_inicial: "2026-01", encerrada_em_mes: null } as const;

  it("parcelas: N parcelas · primeiro a último Mês", () => {
    expect(descricaoDaRepeticao({ ...base, repeticao: "parcelas", parcela_total: 6, mes_inicial: "2026-07" })).toBe(
      "6 parcelas · Jul/26 a Dez/26",
    );
  });

  it("mensal: desde o Mês inicial; encerrada: até o Mês anterior ao encerramento", () => {
    expect(descricaoDaRepeticao(base)).toBe("Mensal · desde Jan/26");
    expect(descricaoDaRepeticao({ ...base, encerrada_em_mes: "2026-11" })).toBe("Mensal · Jan/26 a Out/26");
  });

  it("parcelada encerrada antes do fim termina no Mês anterior ao encerramento", () => {
    expect(
      descricaoDaRepeticao({ ...base, repeticao: "parcelas", parcela_total: 6, mes_inicial: "2026-07", encerrada_em_mes: "2026-10" }),
    ).toBe("6 parcelas · Jul/26 a Set/26");
  });
});

describe("Mês futuro: previsto, Bloco com “inclui previstos” e fim da grade", () => {
  const linha = (id: string, extra: Partial<LancamentoParaMensagem> = {}): LancamentoParaMensagem => ({
    id,
    mes: "2026-12",
    excluido_em: null,
    valor_centavos: 10_600,
    responsavel_id: MAE,
    tipo_id: VIAGEM,
    nome: "Bombinhas",
    apelido: null,
    parcela_n: 6,
    parcela_total: 6,
    status_id: null,
    lancado_por: "manual",
    conta_manual_id: "c1",
    ordem_fatura: null,
    ...extra,
  });

  it("é previsto só se veio de uma Conta, é manual e o Mês não tem Fatura", () => {
    expect(ehPrevistoDeConta({ lancado_por: "manual", conta_manual_id: "c1" }, false)).toBe(true);
    expect(ehPrevistoDeConta({ lancado_por: "manual", conta_manual_id: "c1" }, true)).toBe(false);
    // Um Lançamento feito à mão no app (sem Conta) nunca é previsto.
    expect(ehPrevistoDeConta({ lancado_por: "manual", conta_manual_id: null }, false)).toBe(false);
    expect(ehPrevistoDeConta({ lancado_por: "manual" }, false)).toBe(false);
    expect(ehPrevistoDeConta({ lancado_por: "fatura", conta_manual_id: "c1" }, false)).toBe(false);
    expect(ehPrevistoNoMes({ lancado_por: "sistema" }, true)).toBe(true);
    expect(ehPrevistoNoMes({ lancado_por: "manual", conta_manual_id: "c1" }, false)).toBe(true);
  });

  const mae = linha("mae", { divisao: { modo: "valor", partes: [] }, valor_centavos: 31_800, responsavel_id: null });
  const filhaMae = linha("f1", { dividido_de_id: "mae" });
  const filhaCasal = linha("f2", { dividido_de_id: "mae", responsavel_id: CASAL });
  const doCartao = linha("cartao", { lancado_por: "fatura", conta_manual_id: null, ordem_fatura: 1, valor_centavos: 5_000, responsavel_id: RAFAEL });
  const todas = [mae, filhaMae, filhaCasal, doCartao];

  it("Mês sem Fatura: as filhas da Conta são previstos (a mãe dividida nunca soma)", () => {
    expect([...idsDosPrevistos(todas, "2026-12", false)].sort()).toEqual(["f1", "f2"]);
  });

  it("Mês com Fatura importada: nenhuma é previsto", () => {
    expect([...idsDosPrevistos(todas, "2026-12", true)]).toEqual([]);
  });

  it('o Bloco soma a Conta e mostra "inclui previstos" só quando uma filha dela entra', () => {
    const projecao = projetarPainel(todas, "2026-12");
    const previstos = idsDosPrevistos(todas, "2026-12", false);
    const daMae = resumirBloco({ id: "b", formula: { tipo: "responsavel", id: MAE } }, projecao, previstos);
    expect(daMae.valorCentavos).toBe(10_600);
    expect(daMae.incluiPrevistos).toBe(true);
    const doRafael = resumirBloco({ id: "b", formula: { tipo: "responsavel", id: RAFAEL } }, projecao, previstos);
    expect(doRafael.valorCentavos).toBe(5_000);
    expect(doRafael.incluiPrevistos).toBe(false);
    const todos = resumirBloco({ id: "b", formula: { tipo: "todos" } }, projecao, previstos);
    expect(todos.valorCentavos).toBe(10_600 + 10_600 + 5_000);
    expect(todos.incluiPrevistos).toBe(true);
  });

  it("a mensagem deixa a Conta de fora (previsto) sem “Incluir previstos”, e inclui com ele", () => {
    const opcoes = { mes: "2026-12", statusPagos: new Set<string>(), temFatura: false, hoje: "2026-12-10" };
    const selecao = new Set(["f1", "f2"]);
    const sem = projetarMensagem(selecao, todas, { ...opcoes, incluirPrevistos: false });
    expect(sem.entram).toEqual([]);
    expect(sem.fora.porMotivo.previsto).toBe(2);
    const com = projetarMensagem(selecao, todas, { ...opcoes, incluirPrevistos: true });
    expect(com.totalCentavos).toBe(21_200);
    // Com Fatura no Mês, a Conta é uma linha comum.
    const comFatura = projetarMensagem(selecao, todas, { ...opcoes, temFatura: true, incluirPrevistos: false });
    expect(comFatura.totalCentavos).toBe(21_200);
  });

  it("na grade, as Contas ficam no fim, depois da ordem da fatura", () => {
    const criada = (id: string, created_at: string, ordem_fatura: number | null) => ({ id, ordem_fatura, created_at });
    const grade = [
      criada("conta-a", "2026-11-14T10:00:00.000Z", null),
      criada("fatura-2", "2026-11-14T09:00:00.000Z", 2),
      criada("conta-b", "2026-11-14T10:00:00.001Z", null),
      criada("fatura-1", "2026-11-14T09:00:00.000Z", 1),
    ];
    expect([...grade].sort(compararPelaFatura).map((l) => l.id)).toEqual(["fatura-1", "fatura-2", "conta-a", "conta-b"]);
  });
});

describe("o pedido do cron (5.3): o mesmo pedido, mais o dono", () => {
  it("pedidoMaterializarDoDono = pedidoMaterializar + p_owner_id", () => {
    const b = comoCadastro(conta(BOMBINHAS, "b"));
    const base = pedidoMaterializar([b], "2027-11");
    expect(pedidoMaterializarDoDono("dono-1", [b], "2027-11")).toEqual({ p_owner_id: "dono-1", ...base });
  });

  it("contaLegivel: o mesmo critério de `parcelasDaConta` (ilegível = nenhuma parcela, nunca uma errada)", () => {
    const b = comoCadastro(conta(BOMBINHAS, "b"));
    expect(contaLegivel(b)).toBe(true);
    expect(contaLegivel({ ...b, valor_centavos: 0 })).toBe(false);
    expect(contaLegivel({ ...b, mes_inicial: "2026-13" })).toBe(false);
    expect(contaLegivel({ ...b, parcela_total: null })).toBe(false);
    expect(contaLegivel({ ...b, repeticao: "mensal" })).toBe(false); // mensal com total
    expect(contaLegivel({ ...b, divisao: { modo: "valor", partes: "x" } })).toBe(false);
    for (const ruim of [{ ...b, valor_centavos: 0 }, { ...b, parcela_total: null }, { ...b, divisao: { modo: "valor", partes: "x" } }]) {
      expect(parcelasDaConta(ruim, "2027-11")).toEqual([]);
    }
    // Encerrada ou além do horizonte não é ilegível: só não tem parcelas a pedir.
    expect(contaLegivel({ ...b, encerrada_em_mes: b.mes_inicial })).toBe(true);
    expect(parcelasDaConta({ ...b, encerrada_em_mes: b.mes_inicial }, "2027-11")).toEqual([]);
  });
});

describe("editar uma Conta (História 5.4): o formulário abre preenchido", () => {
  const salvaBombinhas = (): ContaManual => comoCadastro(conta(BOMBINHAS, "b1"));

  it("rascunhoDaConta devolve o que a Conta tem hoje, com o valor de cada parte (AD-2)", () => {
    const r = rascunhoDaConta(salvaBombinhas());
    expect(r).toEqual({
      nome: "Bombinhas",
      valor: "318,00",
      repeticao: "parcelas",
      parcelas: "6",
      comecaEm: "2026-07",
      tipo_id: VIAGEM,
      observacao: "",
      partes: [
        { responsavel_id: MAE, texto: "106,00" },
        { responsavel_id: CASAL, texto: "106,00" },
        { responsavel_id: LUCAS, texto: "106,00" },
      ],
    });
  });

  it("um Responsável só vira uma parte sem valor; a Observação nula vira vazia; mensal não tem Parcelas", () => {
    const silvia = comoCadastro(
      conta({ ...BOMBINHAS, nome: "Silvia", repeticao: "mensal", parcelas: "", observacao: "plano", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, "s1"),
    );
    expect(rascunhoDaConta(silvia)).toMatchObject({ repeticao: "mensal", parcelas: "", observacao: "plano", partes: [{ responsavel_id: RAFAEL, texto: "" }] });
    expect(rascunhoDaConta({ ...silvia, observacao: null }).observacao).toBe("");
  });

  it("uma Divisão ilegível abre com uma parte vazia (Rafael escolhe de novo)", () => {
    const torta = { ...salvaBombinhas(), divisao: { modo: "valor", partes: "x" } };
    expect(rascunhoDaConta(torta).partes).toEqual([{ responsavel_id: null, texto: "" }]);
  });

  it("o rascunho de uma Conta salva, sem mexer, passa na validação e dá a mesma Conta (nada mudou)", () => {
    const salva = salvaBombinhas();
    const a = avaliarFormularioConta("b1", rascunhoDaConta(salva), { ...CTX, original: salva });
    expect(a.erros).toEqual({});
    expect(contaMudou(salva, a.conta as NovaConta)).toBe(false);
  });

  it("contaMudou: Nome, Valor, Tipo, Responsável, Observação, repetição, total e Divisão", () => {
    const salva = salvaBombinhas();
    const muda = (extra: Partial<RascunhoDaConta>) => {
      const a = avaliarFormularioConta("b1", { ...rascunhoDaConta(salva), ...extra }, { ...CTX, original: salva });
      expect(a.erros).toEqual({});
      return contaMudou(salva, a.conta as NovaConta);
    };
    expect(muda({ nome: "Bombinhas 2" })).toBe(true);
    expect(muda({ tipo_id: SAUDE })).toBe(true);
    expect(muda({ observacao: "pousada" })).toBe(true);
    expect(muda({ parcelas: "7" })).toBe(true);
    expect(muda({ repeticao: "mensal" })).toBe(true);
    expect(muda({ valor: "330,00", partes: BOMBINHAS.partes.map((p) => ({ ...p, texto: "110,00" })) })).toBe(true);
    // Outra Divisão com o mesmo Valor.
    expect(muda({ partes: [{ responsavel_id: MAE, texto: "100,00" }, { responsavel_id: CASAL, texto: "118,00" }, { responsavel_id: LUCAS, texto: "100,00" }] })).toBe(true);
    // Um Responsável só no lugar da Divisão.
    expect(muda({ partes: [{ responsavel_id: MAE, texto: "" }] })).toBe(true);
    // Espaços sobrando no Nome não são mudança (a validação os tira).
    expect(muda({ nome: "  Bombinhas " })).toBe(false);
  });

  it("o 'Começa em' é o salvo: o formulário não o muda e a janela de 5 anos não vale (Conta antiga continua editável)", () => {
    const antiga: ContaManual = {
      ...comoCadastro(conta({ ...BOMBINHAS, repeticao: "mensal", parcelas: "", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, "a1")),
      mes_inicial: "2020-12",
    };
    const a = avaliarFormularioConta("a1", { ...rascunhoDaConta(antiga), comecaEm: "2030-01", nome: "Antiga 2" }, { ...CTX, original: antiga });
    expect(a.erros).toEqual({});
    expect(a.conta?.mes_inicial).toBe("2020-12");
    // Para uma Conta nova a janela continua valendo.
    expect(avaliarFormularioConta("n", { ...rascunhoDaConta(antiga) }, CTX).erros.comecaEm).toBe("conta.mes_fora_do_limite");
  });

  it("Tipo e Responsável arquivados que a Conta já usa continuam valendo; trocar por outro arquivado, não (AD-16)", () => {
    const salva = salvaBombinhas();
    // Tipo da Conta e Responsável Lucas arquivados depois de salvar.
    const arquivados: ContextoDoFormulario = {
      mesAtual: "2026-11",
      tiposAtivos: new Set([SAUDE]),
      responsaveisAtivos: new Set([MAE, CASAL, RAFAEL]),
      original: salva,
    };
    const sem = avaliarFormularioConta("b1", { ...rascunhoDaConta(salva), nome: "Bombinhas 2" }, arquivados);
    expect(sem.erros).toEqual({});
    // Sem o `original` (Conta nova), os mesmos arquivados são recusados.
    const nova = avaliarFormularioConta("b1", rascunhoDaConta(salva), { ...arquivados, original: undefined });
    expect(nova.erros.tipo).toBe("conta.tipo_arquivado");
    expect(nova.erros.divisao).toBe("conta.responsavel_arquivado");
    // Trocar o Tipo por outro que está arquivado (e não é o da Conta) continua recusado.
    const outro = avaliarFormularioConta("b1", { ...rascunhoDaConta(salva), tipo_id: "t-velho" }, arquivados);
    expect(outro.erros.tipo).toBe("conta.tipo_arquivado");
    // Um Responsável arquivado que NÃO é da Conta também.
    const parte = avaliarFormularioConta(
      "b1",
      { ...rascunhoDaConta(salva), partes: [{ responsavel_id: MAE, texto: "106,00" }, { responsavel_id: CASAL, texto: "106,00" }, { responsavel_id: "r-velho", texto: "106,00" }] },
      arquivados,
    );
    expect(parte.erros.divisao).toBe("conta.responsavel_arquivado");
  });

  it("responsaveisDaConta: o Responsável único ou o de cada parte", () => {
    expect(responsaveisDaConta(salvaBombinhas())).toEqual([MAE, CASAL, LUCAS]);
    expect(responsaveisDaConta({ responsavel_id: RAFAEL, divisao: null })).toEqual([RAFAEL]);
    expect(responsaveisDaConta({ responsavel_id: null, divisao: { modo: "valor", partes: "x" } })).toEqual([]);
  });
});

describe("pedidoMaterializar com a versão da Conta (História 5.4, corrida com o cron)", () => {
  it("cada parcela leva `conta_atualizada_em` quando a Conta traz `atualizada_em`", () => {
    const b = { ...comoCadastro(conta(BOMBINHAS, "b1")), atualizada_em: "2026-11-10T12:00:00.123456+00:00" };
    const { p_parcelas } = pedidoMaterializar([b], "2027-11");
    expect(p_parcelas).toHaveLength(6);
    expect(p_parcelas.every((p) => p.conta_atualizada_em === "2026-11-10T12:00:00.123456+00:00")).toBe(true);
  });

  it("sem `atualizada_em` (salvar e os testes antigos) a chave nem existe no pedido", () => {
    const { p_parcelas } = pedidoMaterializar([comoCadastro(conta(BOMBINHAS, "b1"))], "2027-11");
    expect(p_parcelas.some((p) => "conta_atualizada_em" in p)).toBe(false);
    expect(pedidoSalvarConta(conta(BOMBINHAS, "b1"), 1, "2027-11").p_parcelas.some((p) => "conta_atualizada_em" in p)).toBe(false);
  });
});

describe("Dívida programada por parte (História 6.6, FR-27, Flow 5)", () => {
  // Na parte do Lucas: "Dívida programada" com a data 06/04/27; Mãe e Casal seguem "Mensal".
  const COM_DIVIDA: RascunhoDaConta = {
    ...BOMBINHAS,
    partes: [
      { responsavel_id: MAE, texto: "106,00" },
      { responsavel_id: CASAL, texto: "106,00" },
      { responsavel_id: LUCAS, texto: "106,00", programada: true, vencimento: "2027-04-06" },
    ],
  };

  it("a data vai na parte do Lucas da Divisão da Conta; as outras partes não levam data", () => {
    const c = conta(COM_DIVIDA);
    expect(c.divisao?.partes.map((p) => p.vencimento_combinado)).toEqual([undefined, undefined, "2027-04-06"]);
  });

  it("cada parcela leva a data só na parte do Lucas, e os valores continuam R$ 106,00 por parte (R$ 636,00 no total do Lucas)", () => {
    const parcelas = parcelasDaConta(comoCadastro(conta(COM_DIVIDA)), horizonteDasContas("2026-11"));
    expect(parcelas).toHaveLength(6);
    for (const p of parcelas) {
      expect(p.partes?.map((x) => x.valor_centavos)).toEqual([10_600, 10_600, 10_600]);
      expect(p.partes?.map((x) => x.vencimento_combinado)).toEqual([undefined, undefined, "2027-04-06"]);
    }
    expect(parcelas.reduce((soma, p) => soma + (p.partes?.[2].valor_centavos ?? 0), 0)).toBe(63_600);
  });

  it("o pedido às RPCs leva a data no corpo das partes e na Divisão da Conta", () => {
    const pedido = pedidoSalvarConta(conta(COM_DIVIDA), 1, "2027-11");
    expect(pedido.p_conta.divisao?.partes[2]).toMatchObject({ responsavel_id: LUCAS, vencimento_combinado: "2027-04-06" });
    expect(pedido.p_parcelas[0].partes?.[2]).toMatchObject({ responsavel_id: LUCAS, valor_centavos: 10_600, vencimento_combinado: "2027-04-06" });
    expect(pedido.p_parcelas[0].partes?.[0]).not.toHaveProperty("vencimento_combinado");
  });

  it("a data é obrigatória e válida na parte programada", () => {
    for (const vencimento of [undefined, "", "2027-02-30", "06/04/27", "1999-01-01"]) {
      const a = avaliarFormularioConta("c1", {
        ...COM_DIVIDA,
        partes: [COM_DIVIDA.partes[0], COM_DIVIDA.partes[1], { responsavel_id: LUCAS, texto: "106,00", programada: true, vencimento }],
      }, CTX);
      expect(a.conta, String(vencimento)).toBeNull();
      expect(a.erros.divisao, String(vencimento)).toBe("conta.vencimento_invalido");
    }
    expect(mensagem("conta.vencimento_invalido")).toBe("Escolha a data combinada de cada parte programada.");
  });

  it("voltar a 'Mensal' (programada: false) tira a data, mesmo com uma data ainda digitada", () => {
    const c = conta({
      ...COM_DIVIDA,
      partes: [COM_DIVIDA.partes[0], COM_DIVIDA.partes[1], { responsavel_id: LUCAS, texto: "106,00", programada: false, vencimento: "2027-04-06" }],
    });
    expect(c.divisao?.partes.every((p) => p.vencimento_combinado === undefined)).toBe(true);
  });

  it("uma Conta de uma parte só não tem o seletor: a data digitada é ignorada", () => {
    const c = conta({ ...BOMBINHAS, partes: [{ responsavel_id: MAE, texto: "", programada: true, vencimento: "2027-04-06" }] });
    expect(c.divisao).toBeNull();
    expect(parcelasDaConta(comoCadastro(c), "2026-12")[0].partes).toBeNull();
  });

  it("editar: o formulário abre com 'Dívida programada' e a data da parte", () => {
    const r = rascunhoDaConta(comoCadastro(conta(COM_DIVIDA, "b2")));
    expect(r.partes).toEqual([
      { responsavel_id: MAE, texto: "106,00" },
      { responsavel_id: CASAL, texto: "106,00" },
      { responsavel_id: LUCAS, texto: "106,00", programada: true, vencimento: "2027-04-06" },
    ]);
  });

  it("mudar só a data é mudança da Conta (senão 'Salvar' só fecharia); a mesma data não é", () => {
    const salva = comoCadastro(conta(COM_DIVIDA, "b3"));
    const outraData = conta(
      { ...COM_DIVIDA, partes: [COM_DIVIDA.partes[0], COM_DIVIDA.partes[1], { ...COM_DIVIDA.partes[2], vencimento: "2027-05-06" }] },
      "b3",
    );
    expect(contaMudou(salva, outraData)).toBe(true);
    expect(contaMudou(salva, conta(COM_DIVIDA, "b3"))).toBe(false);
    // Tirar a Dívida programada também muda.
    expect(contaMudou(salva, conta(BOMBINHAS, "b3"))).toBe(true);
  });

  it("o cron (pedido do dono) leva a mesma data às filhas", () => {
    const pedido = pedidoMaterializarDoDono("dono-1", [comoCadastro(conta(COM_DIVIDA, "b4"))], "2027-11");
    expect(pedido.p_parcelas.every((p) => p.partes?.[2].vencimento_combinado === "2027-04-06")).toBe(true);
  });

  it("Mãe e Casal continuam com R$ 106,00 por mês nas mensagens; o Lucas só entra no Mês do vencimento", () => {
    const parcelas = parcelasDaConta(comoCadastro(conta(COM_DIVIDA, "b5")), "2026-12");
    const linhas: LancamentoParaMensagem[] = parcelas[0].partes!.map((p, i) => ({
      id: `f${i}`,
      mes: "2026-07",
      excluido_em: null,
      valor_centavos: p.valor_centavos,
      responsavel_id: p.responsavel_id,
      tipo_id: VIAGEM,
      nome: "Bombinhas",
      apelido: null,
      parcela_n: 1,
      parcela_total: 6,
      status_id: null,
      lancado_por: "manual",
      ordem_fatura: i + 1,
      vencimento_combinado: p.vencimento_combinado ?? null,
    }));
    const opcoes = (hoje: string) => ({ mes: "2026-07", statusPagos: new Set<string>(), temFatura: true, incluirPrevistos: false, hoje });
    const ids = new Set(linhas.map((l) => l.id));
    const em = (hoje: string) => projetarMensagem(ids, linhas, opcoes(hoje)).entram.map((i) => [i.id, i.valor_centavos]);
    expect(em("2026-11-16")).toEqual([
      ["f0", 10_600],
      ["f1", 10_600],
    ]);
    expect(em("2027-04-01")).toHaveLength(3);
  });
});
