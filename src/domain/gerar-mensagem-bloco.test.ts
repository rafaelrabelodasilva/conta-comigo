import { describe, expect, it } from "vitest";
import { resumirBloco } from "./blocos";
import { ESPACO } from "./dinheiro";
import {
  avaliar,
  descreverCalculo,
  termosDaFormula,
  type Formula,
  type NomesDaFormula,
  type No,
  type Operacao,
} from "./formula";
import { gerarMensagemDoBloco, type ModeloMensagem } from "./modelo-mensagem";
import { mensagemDaSelecao, mensagemDoBloco } from "./mensagem-janela";
import {
  idsDosPrevistos,
  projetarMensagemDoBloco,
  projetarPainel,
  type LancamentoParaMensagem,
  type OpcoesDaMensagem,
} from "./projecoes";

// Testes de aceite da História 4.7 (FR-53, FR-54): a forma 2 do EXPERIENCE.md, com o
// Bloco "Rangel" = Rangel + (Casal ÷ 2) de outubro/2026 sobre um Mês montado à mão
// (sem dado pessoal): o Casal soma R$ 5.639,35 (como no Painel da 4.1), o Rangel não
// tem itens e o total é R$ 2.819,68. O dinheiro tem espaço inseparável; `e` o põe nos
// textos escritos à mão.

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$", `-${ESPACO}R$`);

const MES = "2026-10";
const PAGOS = new Set(["pago"]);

const NOMES: NomesDaFormula = {
  responsaveis: new Map([
    ["rangel", "Rangel"],
    ["casal", "Casal"],
    ["mae", "Mãe"],
  ]),
  tipos: new Map([
    ["casa", "Casa"],
    ["viagem", "Viagem"],
  ]),
};

const MODELO: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "pix@exemplo.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

// Fórmulas montadas à mão (a árvore que `montarFormula` gera).
const resp = (id: string): No => ({ tipo: "responsavel", id });
const tipo = (id: string): No => ({ tipo: "tipo", id });
const num = (valor: string): No => ({ tipo: "numero", valor });
const op = (operacao: Operacao, esquerda: No, direita: No): No => ({ tipo: "operacao", operacao, esquerda, direita });
const gp = (interno: No): No => ({ tipo: "grupo", interno });
const RANGEL: Formula = op("soma", resp("rangel"), gp(op("divisao", resp("casal"), num("2"))));

let contador = 0;
function l(extra: Partial<LancamentoParaMensagem> & { nome: string; valor_centavos: number }): LancamentoParaMensagem {
  contador += 1;
  return {
    id: `l${contador}`,
    mes: MES,
    excluido_em: null,
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    status_id: null,
    lancado_por: "fatura",
    ordem_fatura: contador,
    responsavel_id: "casal",
    tipo_id: "casa",
    ...extra,
  };
}

// O Casal de outubro: R$ 5.639,35 em 7 itens (a mãe do Monjaro não soma, as partes somam) e um Ajuste.
const aluguel = l({ id: "aluguel", nome: "ALUGUEL", valor_centavos: 80000 });
const lava = l({ nome: "LAVA E SECA", apelido: "Lava e seca", parcela_n: 5, parcela_total: 10, valor_centavos: 44589 });
const luz = l({ nome: "LUZ", valor_centavos: 47328 });
const viagem = l({ id: "viagem", nome: "BELLA PIETRA", parcela_n: 3, parcela_total: 4, valor_centavos: 114082, tipo_id: "viagem" });
const ajusteViagem = l({ nome: "AJUSTE", valor_centavos: -8, ajuste_de_id: "viagem", tipo_id: "viagem", ordem_fatura: viagem.ordem_fatura });
const monjaroMae = l({ id: "monjaro", nome: "MONJARO", valor_centavos: 46600, divisao: { modo: "proporcao", partes: [] }, responsavel_id: null, tipo_id: "saude" });
const monjaroCasal1 = l({ nome: "MONJARO", valor_centavos: 31067, dividido_de_id: "monjaro", tipo_id: "saude", ordem_fatura: monjaroMae.ordem_fatura });
const monjaroCasal2 = l({ nome: "MONJARO", valor_centavos: 15533, dividido_de_id: "monjaro", tipo_id: "saude", ordem_fatura: monjaroMae.ordem_fatura });
const reforma = l({ nome: "REFORMA", valor_centavos: 231344 });
const CASAL = [aluguel, lava, luz, viagem, ajusteViagem, monjaroCasal1, monjaroCasal2, reforma];
const CASAL_ITENS = 7;

// A Mãe: R$ 1.350,14 em 5 itens, com um estorno.
const celular = l({ nome: "CELULAR SAMSUNG", apelido: "Celular da mãe", parcela_n: 5, parcela_total: 10, valor_centavos: 57750, responsavel_id: "mae", tipo_id: "saude" });
const remedio = l({ nome: "REMEDIO", parcela_n: 3, parcela_total: 3, valor_centavos: 31067, responsavel_id: "mae", tipo_id: "saude" });
const mercado = l({ nome: "MERCADO", valor_centavos: 15990, responsavel_id: "mae" });
const farmacia = l({ nome: "FARMACIA", valor_centavos: 32797, responsavel_id: "mae" });
const estorno = l({ nome: "ESTORNO LOJA", valor_centavos: -2590, responsavel_id: "mae" });
const MAE = [celular, remedio, mercado, farmacia, estorno];

const MES_TODO = [...CASAL, monjaroMae, ...MAE];

const OPCOES: OpcoesDaMensagem = { mes: MES, statusPagos: PAGOS, temFatura: true, incluirPrevistos: false, hoje: "2026-11-10" };
const bloco = (formula: Formula, lancamentos = MES_TODO, opcoes: Partial<OpcoesDaMensagem> = {}, modelo = MODELO) =>
  mensagemDoBloco(modelo, formula, lancamentos, { ...OPCOES, ...opcoes }, NOMES);
const projecao = (formula: Formula, lancamentos = MES_TODO, opcoes: Partial<OpcoesDaMensagem> = {}) => {
  const p = projetarMensagemDoBloco(formula, lancamentos, { ...OPCOES, ...opcoes }, NOMES);
  if (!p.ok) throw new Error(p.erro.codigo);
  return p.valor;
};
const texto = (m: ReturnType<typeof bloco>) => (m.gerada.estado === "pronta" ? m.gerada.texto : `(${m.gerada.estado})`);
const linhasDe = (m: ReturnType<typeof bloco>) => texto(m).split("\n");

describe("o Bloco Rangel de outubro/2026 (forma 2)", () => {
  const m = bloco(RANGEL);

  it("o total é R$ 2.819,68: o mesmo do Bloco no Painel e do passo a passo", () => {
    const painel = projetarPainel(MES_TODO, MES);
    const resumo = resumirBloco({ id: "b", formula: RANGEL }, painel, idsDosPrevistos(MES_TODO, MES));
    expect(resumo.valorCentavos).toBe(281968);
    expect(m.gerada.estado === "pronta" && m.gerada.totalCentavos).toBe(281968);
    const passoAPasso = descreverCalculo(resumo.avaliacao!, NOMES);
    expect(passoAPasso).toBe(e("Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68"));
    expect(texto(m)).toContain(e("Total: R$ 2.819,68"));
  });

  it("sai no formato da forma 2: grupos, subtotal, operação e itens recuados", () => {
    expect(texto(m)).toBe(
      e(
        [
          "Oi",
          "Esse mês deu R$ 2.819,68",
          "Pix pix@exemplo.com",
          "",
          "Detalhes:",
          "Rangel: R$ 0,00",
          "Casal: R$ 5.639,35 ÷ 2 = R$ 2.819,68",
          "  ALUGUEL | R$ 800,00",
          "  Lava e seca | 05/10 | R$ 445,89",
          "  LUZ | R$ 473,28",
          "  BELLA PIETRA | 03/04 | R$ 1.140,82",
          "  ↳ Ajuste | - R$ 0,08",
          "  MONJARO | R$ 310,67",
          "  MONJARO | R$ 155,33",
          "  REFORMA | R$ 2.313,44",
          "Total: R$ 2.819,68",
        ].join("\n"),
      ),
    );
  });

  it("o grupo vazio (Rangel: R$ 0,00) aparece, sem itens", () => {
    const p = projecao(RANGEL);
    expect(p.grupos.map((g) => [g.nome, g.itens.length, g.resultadoCentavos])).toEqual([
      ["Rangel", 0, 0],
      ["Casal", CASAL_ITENS, 281968],
    ]);
  });

  it("a mãe dividida nunca entra: as partes do Casal entram, com o valor da parte", () => {
    const ids = projecao(RANGEL).entram.map((i) => i.id);
    expect(ids).not.toContain("monjaro");
    expect(ids).toContain(monjaroCasal1.id);
    expect(ids).toContain(monjaroCasal2.id);
  });

  it("sem aviso nenhum: nada pago, nada de fora, nada em dois grupos", () => {
    expect(m.avisos).toEqual([]);
    expect(m.semTexto).toBe("");
  });

  it("os subtotais e o total vêm de `avaliar` (não há soma própria)", () => {
    const p = projecao(RANGEL);
    const filtrada = p.entram.flatMap((i) => [
      { id: i.id, valor_centavos: i.valor_centavos, responsavel_id: "casal", tipo_id: null },
      ...i.ajustes.map((a) => ({ id: a.id, valor_centavos: a.valor_centavos, responsavel_id: "casal", tipo_id: null })),
    ]);
    const direto = avaliar(RANGEL, filtrada);
    expect(direto.ok && direto.valor.valorCentavos).toBe(p.totalCentavos);
    expect(p.grupos[1].subtotalCentavos).toBe(563935);
  });
});

describe("os grupos de cada forma de operando", () => {
  it("soma simples: o total da mensagem é o da forma 1 sobre os mesmos itens", () => {
    const m = bloco(resp("mae"));
    const forma1 = mensagemDaSelecao(MODELO, new Set(MAE.map((x) => x.id)), MES_TODO, OPCOES);
    expect(m.gerada.estado === "pronta" && m.gerada.totalCentavos).toBe(135014);
    expect(m.gerada.estado === "pronta" && m.gerada.totalCentavos).toBe(forma1.gerada.estado === "pronta" ? forma1.gerada.totalCentavos : -1);
    expect(linhasDe(m)[5]).toBe(e("Mãe: R$ 1.350,14"));
    expect(linhasDe(m).slice(6, 10)).toEqual(forma1.gerada.estado === "pronta" ? forma1.gerada.texto.split("\n").slice(5, 9).map((x) => `  ${x}`) : []);
  });

  it("subtraído: “Menos Nome: - R$ X” e o total desconta", () => {
    const m = bloco(op("subtracao", resp("casal"), resp("mae")));
    expect(linhasDe(m)).toContain(e("Casal: R$ 5.639,35"));
    expect(linhasDe(m)).toContain(e("Menos Mãe: - R$ 1.350,14"));
    expect(texto(m)).toContain(e("Total: R$ 4.289,21"));
    // Os itens do grupo subtraído mostram o valor deles, sem sinal trocado.
    expect(linhasDe(m)).toContain(e("  MERCADO | R$ 159,90"));
  });

  it("subtraído com ÷: o último valor é o que o grupo tira", () => {
    const m = bloco(op("subtracao", resp("casal"), gp(op("divisao", resp("mae"), num("2")))));
    expect(linhasDe(m)).toContain(e("Menos Mãe: R$ 1.350,14 ÷ 2 = - R$ 675,07"));
    expect(texto(m)).toContain(e("Total: R$ 4.964,28"));
  });

  it("número solto: “Valor fixo: R$ X”, sem itens, e soma em reais", () => {
    const m = bloco(op("soma", resp("rangel"), num("100")));
    expect(linhasDe(m)).toContain(e("Rangel: R$ 0,00"));
    expect(linhasDe(m)).toContain(e("Valor fixo: R$ 100,00"));
    expect(texto(m)).toContain(e("Total: R$ 100,00"));
  });

  it("número solto subtraído", () => {
    const m = bloco(op("subtracao", resp("mae"), num("100")));
    expect(linhasDe(m)).toContain(e("Menos Valor fixo: - R$ 100,00"));
    expect(texto(m)).toContain(e("Total: R$ 1.250,14"));
  });

  it("uma Fórmula só de números vale em reais: “Valor fixo”", () => {
    const m = bloco(op("multiplicacao", num("2"), num("3")));
    expect(linhasDe(m)).toContain(e("Valor fixo: R$ 6,00"));
  });

  it("“Todos” é um grupo com todos os itens que entram, e o nome é “Todos”", () => {
    const m = bloco(op("divisao", { tipo: "todos" }, num("3")));
    const p = projecao(op("divisao", { tipo: "todos" }, num("3")));
    expect(p.grupos).toHaveLength(1);
    expect(p.grupos[0].nome).toBe("Todos");
    expect(p.grupos[0].itens).toHaveLength(CASAL_ITENS + MAE.length);
    expect(linhasDe(m)).toContain(e("Todos: R$ 6.989,49 ÷ 3 = R$ 2.329,83"));
  });

  it("um Tipo é um grupo com o nome do Tipo; Responsável em Tipo, “Casal em Viagem”", () => {
    const m = bloco(op("soma", tipo("viagem"), { tipo: "responsavel_em_tipo", responsavel_id: "mae", tipo_id: "casa" }));
    expect(linhasDe(m)).toContain(e("Viagem: R$ 1.140,74"));
    expect(linhasDe(m)).toContain(e("Mãe em Casa: R$ 461,97"));
  });
});

describe("parênteses, vários fatores e Fórmulas que não são só operandos", () => {
  it("parêntese que só envolve soma é desfeito, e o sinal se propaga", () => {
    const termos = termosDaFormula(op("subtracao", resp("rangel"), gp(op("soma", resp("casal"), resp("mae")))));
    expect(termos.map((t) => [t.base, t.subtraido])).toEqual([
      [resp("rangel"), false],
      [resp("casal"), true],
      [resp("mae"), true],
    ]);
    const duplo = termosDaFormula(op("subtracao", resp("rangel"), gp(op("subtracao", resp("casal"), resp("mae")))));
    expect(duplo.map((t) => t.subtraido)).toEqual([false, true, false]);
  });

  it("parêntese de soma dividido: um grupo só, com o nome da soma e os itens dos operandos", () => {
    const f = gp(op("soma", resp("casal"), resp("mae")));
    const m = bloco(op("divisao", f, num("2")));
    expect(linhasDe(m)).toContain(e("Casal + Mãe: R$ 6.989,49 ÷ 2 = R$ 3.494,75"));
    expect(projecao(op("divisao", f, num("2"))).grupos[0].itens).toHaveLength(CASAL_ITENS + MAE.length);
    // O Painel diz o mesmo.
    const resumo = resumirBloco({ id: "b", formula: op("divisao", f, num("2")) }, projetarPainel(MES_TODO, MES), new Set());
    expect(resumo.valorCentavos).toBe(349475);
  });

  it("vários fatores, de dentro para fora; e o número na frente sai depois do valor", () => {
    const m = bloco(op("multiplicacao", gp(op("divisao", resp("mae"), num("2"))), num("3")));
    expect(linhasDe(m)).toContain(e("Mãe: R$ 1.350,14 ÷ 2 × 3 = R$ 2.025,21"));
    const frente = bloco(op("multiplicacao", num("2"), resp("mae")));
    expect(linhasDe(frente)).toContain(e("Mãe: R$ 1.350,14 × 2 = R$ 2.700,28"));
  });

  it("parêntese de um termo só é transparente: “(Casal ÷ 2)” e “Casal ÷ 2” saem iguais", () => {
    const com = bloco(op("soma", resp("rangel"), gp(op("divisao", resp("casal"), num("2")))));
    const sem = bloco(op("soma", resp("rangel"), op("divisao", resp("casal"), num("2"))));
    expect(texto(com)).toBe(texto(sem));
  });

  it("todo termo cabe: nenhuma Fórmula válida some do texto", () => {
    const formulas: Formula[] = [
      RANGEL,
      op("soma", op("soma", resp("rangel"), resp("casal")), resp("mae")),
      op("subtracao", gp(op("soma", resp("casal"), num("5"))), op("multiplicacao", num("2"), resp("mae"))),
    ];
    for (const f of formulas) {
      const p = projecao(f);
      const direto = avaliar(f, projetarPainel(MES_TODO, MES));
      expect(direto.ok && direto.valor.valorCentavos).toBe(p.totalCentavos);
    }
  });
});

describe("o arredondamento só no final (FR-54)", () => {
  it("o grupo “Casal ÷ 2” é R$ 5.639,35 ÷ 2 = R$ 2.819,68 (a metade exata é 2.819,675)", () => {
    const p = projecao(RANGEL);
    expect(p.grupos[1].subtotalCentavos).toBe(563935);
    expect(p.grupos[1].resultadoCentavos).toBe(281968);
  });

  it("dois grupos ímpares: o total vem de uma conta só e pode diferir R$ 0,01 da soma das linhas", () => {
    const a = l({ nome: "A", valor_centavos: 1, responsavel_id: "rangel", tipo_id: null });
    const b = l({ nome: "B", valor_centavos: 1, responsavel_id: "mae", tipo_id: null });
    const f = op("soma", op("divisao", resp("rangel"), num("2")), op("divisao", resp("mae"), num("2")));
    const p = projecao(f, [a, b]);
    // 0,5 + 0,5 = 1 centavo no total; cada linha mostra o seu 0,5 arredondado para 1.
    expect(p.totalCentavos).toBe(1);
    expect(p.grupos.map((g) => g.resultadoCentavos)).toEqual([1, 1]);
    const painel = avaliar(f, projetarPainel([a, b], MES));
    expect(painel.ok && painel.valor.valorCentavos).toBe(1);
  });
});

describe("a parte já paga", () => {
  const pagoDoCasal = l({ nome: "IPTU", valor_centavos: 100000, status_id: "pago" });
  const lancamentos = [...MES_TODO, pagoDoCasal];

  it("o total cai e a janela diz quanto o Bloco deixou de cobrar", () => {
    const m = bloco(RANGEL, lancamentos);
    // O Painel soma o IPTU: (563935 + 100000) ÷ 2 = 331967,5 → R$ 3.319,68; a mensagem não.
    const painel = avaliar(RANGEL, projetarPainel(lancamentos, MES));
    expect(painel.ok && painel.valor.valorCentavos).toBe(331968);
    expect(m.gerada.estado === "pronta" && m.gerada.totalCentavos).toBe(281968);
    expect(m.avisos).toEqual(["1 item não entra: 1 já pago", e("R$ 500,00 já foram pagos e não entram")]);
    expect(texto(m)).not.toContain("IPTU");
  });

  it("os avisos saem na ordem “de fora, pagos” e nunca vão no texto", () => {
    const m = bloco(RANGEL, lancamentos);
    expect(m.avisos[0]).toBe("1 item não entra: 1 já pago");
    expect(m.avisos[1]).toBe(e("R$ 500,00 já foram pagos e não entram"));
    expect(texto(m)).not.toContain("já foram pagos");
  });

  it("o aviso some sem diferença: pago de outro Responsável que a Fórmula não cita, ou de R$ 0,00", () => {
    const deOutro = l({ nome: "DO LUCAS", valor_centavos: 9000, responsavel_id: "lucas", status_id: "pago" });
    const zero = l({ nome: "ZERO", valor_centavos: 0 });
    const m = bloco(RANGEL, [...MES_TODO, deOutro, zero]);
    expect(m.avisos).toEqual(["1 item não entra: 1 de R$ 0,00".replace("R$ ", `R$${ESPACO}`)]);
    expect(m.avisos.join(" ")).not.toContain("já foram pagos");
  });

  it("parcela paga com Ajuste: saem juntos e o aviso conta os dois", () => {
    const pago = { ...viagem, status_id: "pago" };
    const m = bloco(resp("casal"), [...CASAL.filter((x) => x.id !== "viagem"), pago, monjaroMae]);
    expect(m.avisos[1]).toBe(e("R$ 1.140,74 já foram pagos e não entram"));
    expect(texto(m)).not.toContain("Ajuste");
  });

  it("tudo pago: nada a cobrar neste bloco, com o aviso", () => {
    const pagos = CASAL.map((x) => ({ ...x, status_id: "pago" }));
    const m = bloco(RANGEL, [...pagos, monjaroMae]);
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
    expect(m.semTexto).toBe("Nada a cobrar neste bloco");
    expect(m.avisos).toContain(e("R$ 2.819,68 já foram pagos e não entram"));
  });

  it("sem itens de Pagamento, um Status chamado “Pago parcialmente” entra cheio e não conta como pago", () => {
    const parcial = l({ nome: "PARCIAL", valor_centavos: 20000, status_id: "pago_parcialmente" });
    const m = bloco(RANGEL, [...MES_TODO, parcial]);
    expect(texto(m)).toContain("PARCIAL");
    expect(m.avisos.join(" ")).not.toContain("já foram pagos");
  });

  it("Pago parcialmente (6.2): o Bloco cobra só o restante e o aviso soma a parte já recebida", () => {
    // R$ 1.000,00 da REFORMA (R$ 2.313,44) já foram recebidos: o Casal cobra R$ 1.313,44 dela.
    const itens = [{ lancamento_id: reforma.id, valor_centavos: 100000 }];
    const p = projecao(RANGEL, MES_TODO, { itens });
    expect(p.entram.find((i) => i.id === reforma.id)).toMatchObject({ valor_centavos: 131344, pago_centavos: 100000 });
    // Rangel + Casal ÷ 2: o Casal é R$ 4.639,35, metade R$ 2.319,68 (um arredondamento só).
    expect(p.totalCentavos).toBe(231968);
    expect(p.pagosCentavos).toBe(50000);
    const m = bloco(RANGEL, MES_TODO, { itens });
    expect(m.avisos).toContain(e("R$ 500,00 já foram pagos e não entram"));
    expect(texto(m)).toContain(e("R$ 1.313,44"));
    expect(texto(m)).not.toContain(e("R$ 2.313,44"));
  });

  it("os grupos mostram o subtotal só com o restante", () => {
    const itens = [{ lancamento_id: reforma.id, valor_centavos: 100000 }];
    const casal = projecao(resp("casal"), MES_TODO, { itens });
    expect(casal.grupos[0].subtotalCentavos).toBe(463935);
    expect(casal.pagosCentavos).toBe(100000);
  });

  it("pago por inteiro e pago parcialmente juntos: o aviso soma os dois", () => {
    const itens = [{ lancamento_id: reforma.id, valor_centavos: 100000 }];
    const aluguelPago = { ...aluguel, status_id: "pago" };
    const m = bloco(resp("casal"), [aluguelPago, ...MES_TODO.filter((x) => x.id !== "aluguel")], { itens });
    expect(m.avisos).toContain(e("R$ 1.800,00 já foram pagos e não entram"));
  });
});

describe("as mesmas regras de inclusão da 4.6", () => {
  it("R$ 0,00 fica de fora e o aviso diz", () => {
    const zero = l({ nome: "ZERO", valor_centavos: 0 });
    const m = bloco(resp("casal"), [...MES_TODO, zero]);
    expect(texto(m)).not.toContain("ZERO");
    expect(m.avisos).toEqual([e("1 item não entra: 1 de R$ 0,00")]);
  });

  it("previsto fica de fora num Mês com Fatura, mesmo com “Incluir previstos”", () => {
    const previsto = l({ nome: "PREVISTO", valor_centavos: 7000, lancado_por: "sistema" });
    const lancamentos = [...MES_TODO, previsto];
    expect(texto(bloco(resp("casal"), lancamentos))).not.toContain("PREVISTO");
    expect(bloco(resp("casal"), lancamentos).avisos).toEqual(["1 item não entra: 1 previsto"]);
    expect(texto(bloco(resp("casal"), lancamentos, { incluirPrevistos: true }))).not.toContain("PREVISTO");
  });

  it("previsto num Mês sem Fatura: fora até ligar “Incluir previstos”; ligado, entra e soma", () => {
    const previsto = l({ nome: "PREVISTO", valor_centavos: 7000, lancado_por: "sistema" });
    const lancamentos = [...MES_TODO, previsto];
    const sem = bloco(resp("casal"), lancamentos, { temFatura: false });
    const com = bloco(resp("casal"), lancamentos, { temFatura: false, incluirPrevistos: true });
    expect(texto(sem)).not.toContain("PREVISTO");
    expect(texto(com)).toContain(e("PREVISTO | R$ 70,00"));
    expect(texto(com)).toContain(e("Total: R$ 5.709,35"));
    // Um previsto que fica de fora não é “pago”: o aviso de pagos não aparece.
    expect(sem.avisos.join(" ")).not.toContain("já foram pagos");
  });

  it("estorno entra como linha negativa e reduz o subtotal e o total", () => {
    const m = bloco(resp("mae"));
    expect(linhasDe(m)).toContain(e("  ESTORNO LOJA | - R$ 25,90"));
    expect(texto(m)).toContain(e("Total: R$ 1.350,14"));
  });

  it("só estorno, ou estorno que zera: nada a cobrar", () => {
    expect(bloco(resp("mae"), [estorno]).gerada).toEqual({ estado: "nada_a_cobrar" });
    const cheio = l({ nome: "CHEIO", valor_centavos: 2590, responsavel_id: "mae" });
    expect(bloco(resp("mae"), [estorno, cheio]).gerada).toEqual({ estado: "nada_a_cobrar" });
  });

  it("o Ajuste vem em “↳ Ajuste” e o total soma o líquido; sem a caixa Valor, é só “↳ Ajuste”", () => {
    const m = bloco(resp("casal"), MES_TODO, {}, { ...MODELO, campos: { nome: true, parcela: true, valor: false } });
    expect(linhasDe(m)).toContain("  BELLA PIETRA | 03/04");
    expect(linhasDe(m)).toContain("  ↳ Ajuste");
    expect(bloco(resp("casal")).gerada).toMatchObject({ totalCentavos: 563935 });
  });

  it("sem Status vale “não pago”: entra", () => {
    expect(texto(bloco(resp("mae")))).toContain("MERCADO");
  });

  it("Lançamentos de outro Mês e excluídos não existem para o Bloco", () => {
    const outro = l({ nome: "NOVEMBRO", valor_centavos: 7777, mes: "2026-11" });
    const excluido = l({ nome: "EXCLUIDO", valor_centavos: 9999, excluido_em: "2026-10-20T12:00:00Z" });
    const m = bloco(resp("casal"), [...MES_TODO, outro, excluido]);
    expect(texto(m)).not.toContain("NOVEMBRO");
    expect(texto(m)).not.toContain("EXCLUIDO");
    expect(m.avisos).toEqual([]);
  });

  it("a ordem dos itens é a da fatura, não a do array", () => {
    const m = bloco(resp("mae"), [...MES_TODO].reverse());
    const nomes = linhasDe(m).filter((x) => x.startsWith("  ")).map((x) => x.trim().split(" | ")[0]);
    expect(nomes).toEqual(["Celular da mãe", "REMEDIO", "MERCADO", "FARMACIA", "ESTORNO LOJA"]);
  });
});

describe("itens em mais de um operando", () => {
  it("aparecem nos dois grupos, contam nos dois, como no Painel, e a janela avisa", () => {
    const f = op("soma", resp("casal"), tipo("viagem"));
    const p = projecao(f);
    expect(p.grupos.map((g) => g.nome)).toEqual(["Casal", "Viagem"]);
    // BELLA PIETRA (Casal e Viagem) está nos dois; o Ajuste dela segue a parcela.
    expect(p.grupos[0].itens.map((i) => i.id)).toContain("viagem");
    expect(p.grupos[1].itens.map((i) => i.id)).toEqual(["viagem"]);
    expect(p.itensEmVariosGrupos).toBe(1);
    const painel = avaliar(f, projetarPainel(MES_TODO, MES));
    expect(p.totalCentavos).toBe(painel.ok ? painel.valor.valorCentavos : -1);
    expect(p.totalCentavos).toBe(563935 + 114074);
    expect(bloco(f).avisos).toEqual(["1 item aparece em mais de um grupo e conta em cada um, como no Painel"]);
  });

  it("sem sobreposição, sem aviso", () => {
    expect(bloco(op("soma", resp("casal"), resp("mae"))).avisos).toEqual([]);
  });
});

describe("Bloco que não calcula e estados da janela", () => {
  const dividePorZero: Formula = op("divisao", resp("casal"), num("0"));

  it("sem valor: estado `sem_valor`, texto no lugar do quadro e nenhum aviso", () => {
    const m = bloco(dividePorZero);
    expect(m.gerada).toEqual({ estado: "sem_valor" });
    expect(m.semTexto).toBe("Este bloco está sem valor. Edite a fórmula para gerar a mensagem.");
    expect(m.avisos).toEqual([]);
    expect(gerarMensagemDoBloco(MODELO, projetarMensagemDoBloco(dividePorZero, MES_TODO, OPCOES, NOMES))).toEqual({ estado: "sem_valor" });
  });

  it("só valor fixo, sem itens: há o que cobrar (o total passa de zero)", () => {
    const m = bloco(op("soma", resp("rangel"), num("100")), [celular]);
    expect(m.gerada.estado).toBe("pronta");
  });

  it("total que não passa de R$ 0,00 (subtração que zera): nada a cobrar neste bloco", () => {
    const f = op("subtracao", resp("mae"), resp("mae"));
    const m = bloco(f);
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
    expect(m.semTexto).toBe("Nada a cobrar neste bloco");
  });

  it("modelo vazio e modelo sem caixa não geram texto (depois do “nada a cobrar”)", () => {
    const vazio: ModeloMensagem = { saudacao: "", frase_total: "", chave_pix: "", rodape: "", campos: { nome: false, parcela: false, valor: false } };
    expect(bloco(RANGEL, MES_TODO, {}, vazio).gerada).toEqual({ estado: "modelo_vazio" });
    expect(bloco(RANGEL, MES_TODO, {}, { ...MODELO, campos: vazio.campos }).gerada).toEqual({ estado: "modelo_sem_campos" });
    expect(bloco(RANGEL, [], {}, vazio).gerada).toEqual({ estado: "nada_a_cobrar" });
  });

  it("só a caixa Parcela: os itens à vista somem, mas os grupos continuam com o valor", () => {
    const m = bloco(RANGEL, MES_TODO, {}, { ...MODELO, campos: { nome: false, parcela: true, valor: false } });
    expect(linhasDe(m)).toContain(e("Casal: R$ 5.639,35 ÷ 2 = R$ 2.819,68"));
    expect(linhasDe(m)).toContain("  05/10");
    expect(linhasDe(m)).not.toContain("  ALUGUEL");
  });
});

describe("a Seleção continua como na 4.6, pela mesma janela", () => {
  it("`mensagemDaSelecao` entrega a mensagem, o texto de “nada a cobrar” da Seleção e o aviso de fora", () => {
    const pago = l({ nome: "PAGO", valor_centavos: 5000, status_id: "pago" });
    const m = mensagemDaSelecao(MODELO, new Set([pago.id]), [pago], OPCOES);
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
    expect(m.semTexto).toBe("Nada a cobrar nesta seleção");
    expect(m.avisos).toEqual(["1 item não entra: 1 já pago"]);
  });
});
