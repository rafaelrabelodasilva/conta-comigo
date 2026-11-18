import { beforeEach, describe, expect, it } from "vitest";
import type { Bloco } from "./blocos";
import { ESPACO } from "./dinheiro";
import { avaliar, type Formula, type NomesDaFormula, type No, type Operacao } from "./formula";
import { mensagemDeCobranca } from "./mensagem-janela";
import { gerarMensagemDeCobranca, type ModeloMensagem } from "./modelo-mensagem";
import { projetarPendente, separarPendentes, type OpcoesDoPendente } from "./projecoes";
import {
  montarCartoesDeCobranca,
  projetarCobrancaDoBloco,
  type LancamentoDaCobranca,
} from "./recebimentos";

// Testes de aceite da História 6.7 (FR-28, FR-23, FR-54): a forma 3 da mensagem, "Cobrar pendências". Puro: o total é
// o Saldo do cartão (`avaliar` sobre `projetarPendente`) e os detalhes são a lista "Ver" por Mês, do mais antigo ao mais
// novo. Hoje 15/10/26. O dinheiro tem espaço inseparável; `e` o põe nos textos escritos à mão.

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$", `-${ESPACO}R$`);

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const HOJE = "2026-10-15";

const NOMES: NomesDaFormula = {
  responsaveis: new Map([
    ["lucas", "Lucas"],
    ["mae", "Mãe"],
    ["rangel", "Rangel"],
    ["casal", "Casal"],
  ]),
  tipos: new Map(),
};

const MODELO: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "pix@exemplo.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

const resp = (id: string): No => ({ tipo: "responsavel", id });
const num = (valor: string): No => ({ tipo: "numero", valor });
const op = (operacao: Operacao, esquerda: No, direita: No): No => ({ tipo: "operacao", operacao, esquerda, direita });
const gp = (interno: No): No => ({ tipo: "grupo", interno });
const LUCAS: Formula = resp("lucas");
const RANGEL: Formula = op("soma", resp("rangel"), gp(op("divisao", resp("casal"), num("2"))));

let n = 0;
function l(extra: Partial<LancamentoDaCobranca> & { nome: string; valor_centavos: number }): LancamentoDaCobranca {
  n += 1;
  return {
    id: `l${n}`,
    mes: "2026-10",
    excluido_em: null,
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    status_id: NAO_PAGO,
    lancado_por: "fatura",
    ordem_fatura: n,
    responsavel_id: "lucas",
    tipo_id: null,
    ...extra,
  };
}

const opcoes = (extra: Partial<OpcoesDoPendente> = {}): OpcoesDoPendente => ({
  statusPagos: new Set([PAGO]),
  itens: [],
  hoje: HOJE,
  ...extra,
});

function cobrar(
  lancamentos: readonly LancamentoDaCobranca[],
  formula: Formula = LUCAS,
  extra: Partial<OpcoesDoPendente> = {},
  modelo: ModeloMensagem = MODELO,
) {
  return mensagemDeCobranca(modelo, formula, lancamentos, opcoes(extra), NOMES);
}

const texto = (m: ReturnType<typeof cobrar>) => (m.gerada.estado === "pronta" ? m.gerada.texto : `(${m.gerada.estado})`);

// Cada teste monta os ids do zero (`ordem_fatura` crescente dentro do teste).
beforeEach(() => {
  n = 0;
});

describe("a forma 3: Em aberto, por Mês, do mais antigo ao mais novo (FR-28)", () => {
  const lucas = () => [
    l({ nome: "SPOTIFY", valor_centavos: 5_000, mes: "2026-10" }),
    l({ nome: "NETFLIX", valor_centavos: 10_000, mes: "2026-09" }),
    l({ nome: "PAGO JA", valor_centavos: 7_000, mes: "2026-10", status_id: PAGO }),
  ];

  it("usa o mesmo modelo, com 'Em aberto: R$ X' no lugar da frase do total e os Meses por extenso", () => {
    const m = cobrar(lucas());
    expect(texto(m)).toBe(
      e(
        [
          "Oi",
          "Em aberto: R$ 150,00",
          "Pix pix@exemplo.com",
          "",
          "Detalhes:",
          "Setembro/26",
          "  NETFLIX | R$ 100,00",
          "Outubro/26",
          "  SPOTIFY | R$ 50,00",
          "Total: R$ 150,00",
        ].join("\n"),
      ),
    );
    expect(m.avisos).toEqual([]);
  });

  it("a ordem dos Meses é do mais antigo ao mais novo, qualquer que seja a ordem da leitura", () => {
    const linhas = [
      l({ nome: "C", valor_centavos: 300, mes: "2026-10" }),
      l({ nome: "A", valor_centavos: 100, mes: "2025-12" }),
      l({ nome: "B", valor_centavos: 200, mes: "2026-02" }),
    ];
    const p = projetarCobrancaDoBloco(LUCAS, linhas, opcoes(), NOMES);
    expect(p.ok && p.valor.meses.map((x) => x.mes)).toEqual(["2025-12", "2026-02", "2026-10"]);
    expect(texto(cobrar(linhas)).split("\n").filter((x) => /\/\d\d$/.test(x))).toEqual(["Dezembro/25", "Fevereiro/26", "Outubro/26"]);
  });

  it("dentro do Mês vale a ordem da fatura, e os campos do modelo mandam na linha (parcela, nome)", () => {
    const linhas = [
      l({ nome: "SEGUNDO", valor_centavos: 200, ordem_fatura: 2 }),
      l({ nome: "PRIMEIRO", valor_centavos: 100, ordem_fatura: 1, parcela_n: 3, parcela_total: 10 }),
    ];
    const t = texto(cobrar(linhas));
    expect(t.indexOf("PRIMEIRO")).toBeLessThan(t.indexOf("SEGUNDO"));
    expect(t).toContain(e("  PRIMEIRO | 03/10 | R$ 1,00"));
    const so = texto(cobrar(linhas, LUCAS, {}, { ...MODELO, campos: { nome: true, parcela: false, valor: false } }));
    expect(so).toContain("  PRIMEIRO\n");
    expect(so).not.toContain("03/10");
  });

  it("o 'Em aberto' é o Saldo do cartão: a mesma conta sobre as mesmas linhas (AD-11)", () => {
    const linhas = lucas();
    const bloco: Bloco = { id: "b", nome: "Lucas", formula: LUCAS, ordem: 1, de_cobranca: true, meu_bloco: false };
    const [cartao] = montarCartoesDeCobranca(
      [bloco],
      separarPendentes(linhas, opcoes()).pendentes,
      new Map(),
    );
    const direto = avaliar(LUCAS, projetarPendente(linhas, opcoes()));
    const p = projetarCobrancaDoBloco(LUCAS, linhas, opcoes(), NOMES);
    expect(p.ok && p.valor.totalCentavos).toBe(15_000);
    expect(p.ok && p.valor.totalCentavos).toBe(cartao?.saldoCentavos);
    expect(direto.ok && direto.valor.valorCentavos).toBe(15_000);
  });

  it("o Pago parcialmente entra só com o que falta (o valor restante, não o cheio)", () => {
    const linhas = [l({ id: "spot", nome: "SPOTIFY", valor_centavos: 5_000 })];
    const m = cobrar(linhas, LUCAS, { itens: [{ lancamento_id: "spot", valor_centavos: 2_000 }] });
    expect(texto(m)).toContain(e("  SPOTIFY | R$ 30,00"));
    expect(texto(m)).toContain(e("Em aberto: R$ 30,00"));
    expect(texto(m)).not.toContain("R$ 50,00");
  });

  it("o histórico da planilha e os Meses antigos entram (é o que o dado diz, 6.5)", () => {
    const m = cobrar([l({ nome: "ANTIGO", valor_centavos: 4_000, mes: "2025-03", lancado_por: "historico" })]);
    expect(texto(m)).toContain("Março/25");
    expect(texto(m)).toContain(e("Total: R$ 40,00"));
  });
});

describe("mãe dividida, Ajuste, estorno e crédito", () => {
  it("a mãe dividida nunca entra: valem as partes em aberto, cada uma com o valor da parte", () => {
    const linhas = [
      l({ id: "mae", nome: "MONJARO", valor_centavos: 31_067, divisao: [{ partes: 2 }], responsavel_id: "casal" }),
      l({ id: "f1", nome: "MONJARO", valor_centavos: 15_534, dividido_de_id: "mae", responsavel_id: "lucas" }),
      l({ id: "f2", nome: "MONJARO", valor_centavos: 15_533, dividido_de_id: "mae", responsavel_id: "lucas", status_id: PAGO }),
    ];
    const t = texto(cobrar(linhas));
    expect(t).toContain(e("  MONJARO | R$ 155,34"));
    expect(t).not.toContain("155,33");
    expect(t).not.toContain("310,67");
    expect(t).toContain(e("Total: R$ 155,34"));
  });

  it("o Ajuste de centavos fica logo abaixo da parcela ('↳ Ajuste') e soma no total", () => {
    const linhas = [
      l({ id: "p", nome: "SPOTIFY", valor_centavos: 5_000 }),
      l({ id: "aj", nome: "Ajuste", valor_centavos: -8, ajuste_de_id: "p", ordem_fatura: 99 }),
    ];
    const t = texto(cobrar(linhas));
    expect(t).toContain(e("  SPOTIFY | R$ 50,00\n  ↳ Ajuste | - R$ 0,08"));
    expect(t).toContain(e("Em aberto: R$ 49,92"));
  });

  it("o Ajuste que ficou em aberto depois de a parcela ser paga continua cobrando, sozinho (regra do Saldo, 6.5)", () => {
    const linhas = [
      l({ id: "p", nome: "SPOTIFY", valor_centavos: 5_000, status_id: PAGO }),
      l({ id: "aj", nome: "Ajuste", valor_centavos: 3, ajuste_de_id: "p", status_id: NAO_PAGO }),
    ];
    const t = texto(cobrar(linhas));
    expect(t).toContain(e("  Ajuste | R$ 0,03"));
    expect(t).not.toContain("SPOTIFY");
    expect(t).toContain(e("Em aberto: R$ 0,03"));
  });

  it("um estorno entra como linha negativa e reduz o total", () => {
    const linhas = [
      l({ nome: "MERCADO", valor_centavos: 15_990 }),
      l({ nome: "ESTORNO", valor_centavos: -2_590 }),
    ];
    const t = texto(cobrar(linhas));
    expect(t).toContain(e("  ESTORNO | - R$ 25,90"));
    expect(t).toContain(e("Em aberto: R$ 134,00"));
  });

  it("o crédito de algo pago e depois excluído é uma linha negativa no Mês dele, e fecha com o total (AD-11)", () => {
    const linhas = [
      l({ nome: "NETFLIX", valor_centavos: 10_000, mes: "2026-09" }),
      l({ id: "ex", nome: "ESTORNADO", valor_centavos: 1_000, mes: "2026-08", status_id: PAGO, excluido_em: "2026-10-01T00:00:00Z" }),
    ];
    const m = cobrar(linhas, LUCAS, { itens: [{ lancamento_id: "ex", valor_centavos: 1_000 }] });
    expect(texto(m)).toBe(
      e(
        [
          "Oi",
          "Em aberto: R$ 90,00",
          "Pix pix@exemplo.com",
          "",
          "Detalhes:",
          "Agosto/26",
          "  ESTORNADO | - R$ 10,00",
          "Setembro/26",
          "  NETFLIX | R$ 100,00",
          "Total: R$ 90,00",
        ].join("\n"),
      ),
    );
  });

  it("previstos ficam de fora, como no Saldo: o mesmo conjunto", () => {
    const linhas = [
      l({ nome: "NETFLIX", valor_centavos: 10_000, mes: "2026-10" }),
      l({ nome: "PARCELA PREVISTA", valor_centavos: 9_999, mes: "2026-11", lancado_por: "sistema" }),
    ];
    const t = texto(cobrar(linhas));
    expect(t).toContain("Outubro/26");
    expect(t).not.toContain("PREVISTA");
    expect(t).not.toContain("Novembro/26");
  });
});

describe("Dívida programada ainda não vencida (6.6): fica fora, como no Saldo, e a janela avisa", () => {
  const bombinhas = () => [
    l({ nome: "NETFLIX", valor_centavos: 10_000, mes: "2026-10" }),
    l({ nome: "BOMBINHAS", valor_centavos: 63_600, mes: "2026-07", parcela_n: 1, parcela_total: 6, vencimento_combinado: "2027-04-06" }),
  ];

  it("antes do Mês do vencimento: não entra no total nem nos detalhes e o aviso diz quantas ficaram de fora", () => {
    const m = cobrar(bombinhas());
    expect(texto(m)).toContain(e("Em aberto: R$ 100,00"));
    expect(texto(m)).not.toContain("BOMBINHAS");
    expect(m.avisos).toEqual(["1 item não entra: 1 dívida programada ainda não vencida"]);
  });

  it("no Mês do vencimento (até no dia 1) passa a entrar, sem aviso", () => {
    const m = cobrar(bombinhas(), LUCAS, { hoje: "2027-04-01" });
    expect(texto(m)).toContain(e("  BOMBINHAS | 01/06 | R$ 636,00"));
    expect(texto(m)).toContain("Julho/26");
    expect(m.avisos).toEqual([]);
  });

  it("o Ajuste de uma parcela programada segue a parcela e não conta como item de fora", () => {
    const linhas = [
      l({ id: "p", nome: "BOMBINHAS", valor_centavos: 10_600, vencimento_combinado: "2027-04-06" }),
      l({ id: "aj", nome: "Ajuste", valor_centavos: -8, ajuste_de_id: "p", vencimento_combinado: "2027-04-06" }),
      l({ nome: "OUTRA", valor_centavos: 5_000, vencimento_combinado: "2027-05-10" }),
    ];
    expect(cobrar(linhas).avisos).toEqual(["2 itens não entram: 2 dívidas programadas ainda não vencidas"]);
  });

  it("só conta as do Bloco (a de outra pessoa não é aviso dele) e só as que ainda têm o que cobrar (a paga não)", () => {
    const linhas = [
      l({ nome: "DO LUCAS", valor_centavos: 10_000, vencimento_combinado: "2027-04-06" }),
      l({ nome: "DA MAE", valor_centavos: 20_000, responsavel_id: "mae", vencimento_combinado: "2027-04-06" }),
      l({ nome: "PAGA", valor_centavos: 30_000, status_id: PAGO, vencimento_combinado: "2027-04-06" }),
    ];
    expect(cobrar(linhas).avisos).toEqual(["1 item não entra: 1 dívida programada ainda não vencida"]);
  });

  it("um Pago parcialmente que é Dívida programada não vencida também fica de fora (o restante é adiado)", () => {
    const linhas = [l({ id: "d", nome: "OCULOS", valor_centavos: 27_000, vencimento_combinado: "2026-12-06" })];
    const m = cobrar(linhas, LUCAS, { itens: [{ lancamento_id: "d", valor_centavos: 5_000 }] });
    expect(m.gerada.estado).toBe("nada_a_cobrar");
    expect(m.avisos).toEqual(["1 item não entra: 1 dívida programada ainda não vencida"]);
  });
});

describe("o Bloco com Fórmula que divide ou subtrai: um arredondamento, só no final (FR-54)", () => {
  const casal = (nome: string, valor: number, mes: string) => l({ nome, valor_centavos: valor, mes, responsavel_id: "casal" });

  it("o Rangel: os detalhes mostram os valores cheios e o termo do Casal explica o total", () => {
    const linhas = [
      l({ nome: "ACADEMIA", valor_centavos: 1_000, responsavel_id: "rangel" }),
      casal("MERCADO", 20_000, "2026-10"),
    ];
    expect(texto(cobrar(linhas, RANGEL))).toBe(
      e(
        [
          "Oi",
          "Em aberto: R$ 110,00",
          "Pix pix@exemplo.com",
          "",
          "Detalhes:",
          "Outubro/26",
          "  ACADEMIA | R$ 10,00",
          "  MERCADO | R$ 200,00",
          "Rangel: R$ 10,00",
          "Casal: R$ 200,00 ÷ 2 = R$ 100,00",
          "Total: R$ 110,00",
        ].join("\n"),
      ),
    );
  });

  it("dois Meses de R$ 100,01 do Casal: o total é R$ 100,01 (200,02 ÷ 2), não R$ 100,02 (cada Mês arredondado)", () => {
    const linhas = [casal("A", 10_001, "2026-09"), casal("B", 10_001, "2026-10")];
    const m = cobrar(linhas, RANGEL);
    expect(texto(m)).toContain(e("Em aberto: R$ 100,01"));
    expect(texto(m)).toContain(e("Casal: R$ 200,02 ÷ 2 = R$ 100,01"));
    expect(texto(m)).toContain(e("Total: R$ 100,01"));
    // Nenhum subtotal por Mês: as linhas dos Meses só trazem os itens.
    expect(texto(m)).not.toContain("50,01");
    expect(texto(m)).not.toContain("50,00");
    const p = projetarCobrancaDoBloco(RANGEL, linhas, opcoes(), NOMES);
    const saldo = avaliar(RANGEL, projetarPendente(linhas, opcoes()));
    expect(p.ok && p.valor.totalCentavos).toBe(saldo.ok ? saldo.valor.valorCentavos : null);
  });

  it("uma Fórmula de soma simples (um operando, ou vários inteiros) não traz linhas de termo", () => {
    const linhas = [l({ nome: "A", valor_centavos: 100 }), casal("B", 200, "2026-10")];
    for (const f of [LUCAS, op("soma", resp("lucas"), resp("casal"))]) {
      const p = projetarCobrancaDoBloco(f, linhas, opcoes(), NOMES);
      expect(p.ok && p.valor.termos).toEqual([]);
    }
  });

  it("subtração e valor fixo também pedem as linhas de termo", () => {
    const linhas = [l({ nome: "A", valor_centavos: 10_000 }), casal("B", 3_000, "2026-10")];
    const subtracao = texto(cobrar(linhas, op("subtracao", resp("lucas"), resp("casal"))));
    expect(subtracao).toContain(e("Lucas: R$ 100,00"));
    expect(subtracao).toContain(e("Menos Casal: - R$ 30,00"));
    expect(subtracao).toContain(e("Em aberto: R$ 70,00"));
    const fixo = texto(cobrar(linhas, op("soma", resp("lucas"), num("5"))));
    expect(fixo).toContain(e("Valor fixo: R$ 5,00"));
  });
});

describe("sem pendência, sem valor e modelo que não serve", () => {
  it("Bloco 'Em dia': nada em aberto, sem texto para copiar", () => {
    const m = cobrar([l({ nome: "PAGO", valor_centavos: 1_000, status_id: PAGO })]);
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
    expect(m.semTexto).toBe("Nada em aberto neste bloco");
    expect(m.avisos).toEqual([]);
  });

  it("sem nenhum Lançamento do Bloco: o mesmo", () => {
    expect(cobrar([l({ nome: "DA MAE", valor_centavos: 1_000, responsavel_id: "mae" })]).gerada).toEqual({ estado: "nada_a_cobrar" });
  });

  it("o crédito que cobre a dívida (total que não passa de R$ 0,00) também é 'nada em aberto'", () => {
    const linhas = [
      l({ nome: "NETFLIX", valor_centavos: 1_000 }),
      l({ id: "ex", nome: "ESTORNADO", valor_centavos: 5_000, status_id: PAGO, excluido_em: "2026-10-01T00:00:00Z" }),
    ];
    const m = cobrar(linhas, LUCAS, { itens: [{ lancamento_id: "ex", valor_centavos: 5_000 }] });
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
  });

  it("'Em dia' por só ter Dívida programada adiada: nada em aberto, e o aviso diz o que ficou de fora", () => {
    const m = cobrar([l({ nome: "BOMBINHAS", valor_centavos: 63_600, vencimento_combinado: "2027-04-06" })]);
    expect(m.gerada).toEqual({ estado: "nada_a_cobrar" });
    expect(m.semTexto).toBe("Nada em aberto neste bloco");
    expect(m.avisos).toEqual(["1 item não entra: 1 dívida programada ainda não vencida"]);
  });

  it("Fórmula que não calcula: o Bloco está sem valor (sem aviso)", () => {
    const m = cobrar([l({ nome: "A", valor_centavos: 100 })], op("divisao", resp("lucas"), num("0")));
    expect(m.gerada).toEqual({ estado: "sem_valor" });
    expect(m.semTexto).toBe("Este bloco está sem valor. Edite a fórmula para gerar a mensagem.");
    expect(m.avisos).toEqual([]);
  });

  it("modelo vazio e modelo sem caixa não geram texto (depois do 'nada em aberto')", () => {
    const linhas = [l({ nome: "A", valor_centavos: 100 })];
    const vazio: ModeloMensagem = { saudacao: "", frase_total: "", chave_pix: "", rodape: "", campos: { nome: false, parcela: false, valor: false } };
    expect(cobrar(linhas, LUCAS, {}, vazio).gerada).toEqual({ estado: "modelo_vazio" });
    expect(cobrar(linhas, LUCAS, {}, { ...MODELO, campos: { nome: false, parcela: false, valor: false } }).gerada).toEqual({
      estado: "modelo_sem_campos",
    });
    expect(cobrar([], LUCAS, {}, vazio).gerada).toEqual({ estado: "nada_a_cobrar" });
  });

  it("a frase do modelo é substituída mesmo se estiver vazia; saudação, Pix e rodapé seguem o modelo", () => {
    const m = cobrar([l({ nome: "A", valor_centavos: 100 })], LUCAS, {}, { ...MODELO, frase_total: "", rodape: "Obrigado!" });
    expect(texto(m)).toBe(e(["Oi", "Em aberto: R$ 1,00", "Pix pix@exemplo.com", "", "Detalhes:", "Outubro/26", "  A | R$ 1,00", "Total: R$ 1,00", "", "Obrigado!"].join("\n")));
  });

  it("`gerarMensagemDeCobranca` aceita o erro da projeção", () => {
    expect(gerarMensagemDeCobranca(MODELO, { ok: false, erro: { codigo: "formula.divisao_por_zero" } })).toEqual({ estado: "sem_valor" });
  });
});

describe("separarPendentes (a regra de 'em aberto' é uma só)", () => {
  it("as pendentes são as mesmas de antes; a Dívida programada adiada sai à parte, com o restante", () => {
    const linhas = [
      l({ id: "a", nome: "A", valor_centavos: 1_000 }),
      l({ id: "d", nome: "D", valor_centavos: 5_000, vencimento_combinado: "2027-04-06" }),
      l({ id: "dp", nome: "DP", valor_centavos: 5_000, status_id: PAGO, vencimento_combinado: "2027-04-06" }),
    ];
    const { pendentes, programadas } = separarPendentes(linhas, opcoes());
    expect(pendentes.map((p) => p.id)).toEqual(["a"]);
    expect(programadas.map((p) => [p.id, p.restanteCentavos])).toEqual([["d", 5_000]]);
  });
});
