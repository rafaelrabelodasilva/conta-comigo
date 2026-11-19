import { describe, expect, it } from "vitest";
import { atrasosDasLinhas, estaAtrasado, primeiroDiaDeAtraso, type ContextoDeAtraso } from "./atraso";
import type { Bloco } from "./blocos";
import type { ConfigCiclo } from "./ciclo";
import { formatarDinheiro } from "./dinheiro";
import type { Formula } from "./formula";
import {
  DIAS_DO_LEMBRETE_DE_FECHAMENTO,
  PREFERENCIAS_DE_LEMBRETES_PADRAO,
  lembretesDoDia,
  preferenciasDeLembretes,
  type ContextoDeLembretes,
  type Lembrete,
  type LancamentoParaLembrete,
  type PreferenciasDeLembretes,
} from "./lembretes";
import { textoDoLembrete } from "./mensagens";
import { somaDosItens } from "./pagamento";

// Lembretes do dia (História 7.4, FR-55): o do fechamento da fatura e o do Bloco de cobrança com itens
// atrasados. Hoje 19/11/26, Ciclo de fechamento 28 e vencimento 06, tolerância 10 salvo se disser outra.

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const config = (
  dia_fechamento: number,
  dia_vencimento: number,
  vigente_desde: string,
): ConfigCiclo => ({ dia_fechamento, dia_vencimento, vigente_desde, created_at: `${vigente_desde}-01T00:00:00Z` });

const CICLO = [config(28, 6, "2026-01")];
const LIGADOS: PreferenciasDeLembretes = { fechamento: true, atraso: true };

const resp = (id: string): Formula => ({ tipo: "responsavel", id });
const metadeDoCasal: Formula = {
  tipo: "operacao",
  operacao: "soma",
  esquerda: resp("rangel"),
  direita: {
    tipo: "grupo",
    interno: { tipo: "operacao", operacao: "divisao", esquerda: resp("casal"), direita: { tipo: "numero", valor: "2" } },
  },
};
const lucasMaisCem: Formula = {
  tipo: "operacao",
  operacao: "soma",
  esquerda: resp("lucas"),
  direita: { tipo: "numero", valor: "100" },
};
const divisaoPorZero: Formula = {
  tipo: "operacao",
  operacao: "divisao",
  esquerda: resp("lucas"),
  direita: { tipo: "numero", valor: "0" },
};
const soValorFixo: Formula = { tipo: "numero", valor: "250" };

const bloco = (id: string, nome: string, formula: Formula, extra: Partial<Bloco> = {}): Bloco => ({
  id,
  nome,
  formula,
  ordem: 1,
  de_cobranca: true,
  meu_bloco: false,
  ...extra,
});

const lucas = bloco("b-lucas", "Lucas", resp("lucas"));

const lanc = (id: string, extra: Partial<LancamentoParaLembrete> = {}): LancamentoParaLembrete => ({
  id,
  mes: "2026-11",
  excluido_em: null,
  valor_centavos: 10_000,
  responsavel_id: "lucas",
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

/** As Faturas de Out e Nov/26 já importadas (vencimento 06). */
const FATURAS = new Map([
  ["2026-10", "2026-10-06"],
  ["2026-11", "2026-11-06"],
]);

const contexto = (extra: Partial<ContextoDeLembretes> = {}): ContextoDeLembretes => ({
  statusPagos: new Set([PAGO]),
  itens: [],
  vencimentosDasFaturas: FATURAS,
  tolerancia: 10,
  ...extra,
});

const dia = (
  hoje: string,
  opcoes: {
    ciclo?: readonly ConfigCiclo[];
    linhas?: LancamentoParaLembrete[];
    blocos?: Bloco[];
    preferencias?: PreferenciasDeLembretes;
    contexto?: Partial<ContextoDeLembretes>;
  } = {},
): Lembrete[] =>
  lembretesDoDia(
    hoje,
    opcoes.ciclo ?? CICLO,
    opcoes.linhas ?? [],
    opcoes.blocos ?? [],
    opcoes.preferencias ?? LIGADOS,
    contexto(opcoes.contexto),
  );


describe("o lembrete de fechamento", () => {
  it("no dia do fechamento aparece, com o Mês da Fatura (o do vencimento) e o Painel dele", () => {
    // Fecha em 28/10 a fatura que vence em 06/11: é a "de novembro".
    expect(dia("2026-10-28", SEM_FATURA_OPCOES())).toEqual([
      {
        tipo: "fechamento",
        referencia: "2026-11",
        mes: "2026-11",
        fechouEm: "2026-10-28",
        destino: "/?mes=2026-11",
      },
    ]);
  });

  it("o texto diz o Mês da Fatura, não o mês do calendário", () => {
    const [l] = dia("2026-10-28", SEM_FATURA_OPCOES());
    expect(textoDoLembrete(l)).toBe("A fatura de novembro fechou. Importe o PDF quando chegar");
  });

  it("antes do fechamento não aparece", () => {
    expect(dia("2026-10-27", SEM_FATURA_OPCOES())).toEqual([]);
  });

  it(`dura ${DIAS_DO_LEMBRETE_DE_FECHAMENTO} dias depois do fechamento e some no seguinte`, () => {
    expect(DIAS_DO_LEMBRETE_DE_FECHAMENTO).toBe(5);
    expect(dia("2026-11-02", SEM_FATURA_OPCOES())).toHaveLength(1);
    expect(dia("2026-11-03", SEM_FATURA_OPCOES())).toEqual([]);
  });

  it("a referência e o fechamento são os mesmos durante toda a janela", () => {
    const a = dia("2026-10-28", SEM_FATURA_OPCOES())[0];
    const b = dia("2026-11-02", SEM_FATURA_OPCOES())[0];
    expect(b).toEqual(a);
  });

  it("some quando a Fatura do Mês foi importada, até no dia do fechamento", () => {
    const comFatura = new Map([["2026-11", "2026-11-06"]]);
    expect(dia("2026-10-28", { contexto: { vencimentosDasFaturas: comFatura } })).toEqual([]);
    expect(dia("2026-10-30", { contexto: { vencimentosDasFaturas: comFatura } })).toEqual([]);
  });

  it("a Fatura de outro Mês não esconde o lembrete", () => {
    const outra = new Map([["2026-10", "2026-10-06"]]);
    expect(dia("2026-10-28", { contexto: { vencimentosDasFaturas: outra } })).toHaveLength(1);
  });

  it("preferência desligada: não aparece", () => {
    expect(dia("2026-10-28", { ...SEM_FATURA_OPCOES(), preferencias: { fechamento: false, atraso: true } })).toEqual([]);
  });

  it("sem configuração do Ciclo: nenhum lembrete", () => {
    expect(dia("2026-10-28", { ...SEM_FATURA_OPCOES(), ciclo: [] })).toEqual([]);
  });

  it("hoje inválido: nenhum lembrete", () => {
    expect(dia("2026-02-30", SEM_FATURA_OPCOES())).toEqual([]);
    expect(dia("amanhã", SEM_FATURA_OPCOES())).toEqual([]);
  });

  describe("o dia do fechamento em fevereiro e com dia 31", () => {
    const dia31 = [config(31, 10, "2026-01")];

    it("dia 31 em fevereiro: fecha no último dia (28)", () => {
      // Mês 2027-03 fecha em fevereiro (V < F); 31 não existe, vale 28/02/27.
      const l = dia("2027-02-28", { ...SEM_FATURA_OPCOES(), ciclo: dia31 });
      expect(l).toMatchObject([{ mes: "2027-03", fechouEm: "2027-02-28" }]);
      expect(dia("2027-02-27", { ...SEM_FATURA_OPCOES(), ciclo: dia31 })).toEqual([]);
    });

    it("dia 31 em ano bissexto: 29/02/28", () => {
      const l = dia("2028-02-29", { ...SEM_FATURA_OPCOES(), ciclo: dia31 });
      expect(l).toMatchObject([{ mes: "2028-03", fechouEm: "2028-02-29" }]);
      expect(dia("2028-02-28", { ...SEM_FATURA_OPCOES(), ciclo: dia31 })).toEqual([]);
    });

    it("dia 31 num mês que tem 31: o dia 31", () => {
      const l = dia("2027-03-31", { ...SEM_FATURA_OPCOES(), ciclo: dia31 });
      expect(l).toMatchObject([{ mes: "2027-04", fechouEm: "2027-03-31" }]);
    });

    it("fechamento no dia 30 em fevereiro", () => {
      const l = dia("2027-02-28", { ...SEM_FATURA_OPCOES(), ciclo: [config(30, 10, "2026-01")] });
      expect(l).toMatchObject([{ mes: "2027-03", fechouEm: "2027-02-28" }]);
    });

    it("fechamento e vencimento no mesmo mês (V > F): o Mês é o do fechamento", () => {
      const l = dia("2026-11-10", { ...SEM_FATURA_OPCOES(), ciclo: [config(10, 20, "2026-01")] });
      expect(l).toMatchObject([{ mes: "2026-11", fechouEm: "2026-11-10" }]);
    });

    it("virada de ano: fecha em dezembro a fatura de janeiro", () => {
      const l = dia("2026-12-28", SEM_FATURA_OPCOES());
      expect(l).toMatchObject([{ mes: "2027-01", fechouEm: "2026-12-28", destino: "/?mes=2027-01" }]);
      expect(textoDoLembrete(l[0])).toBe("A fatura de janeiro fechou. Importe o PDF quando chegar");
    });
  });

  describe("troca de Ciclo", () => {
    // De dezembro em diante o fechamento passa a ser 25.
    const trocou = [config(28, 6, "2026-01"), config(25, 6, "2026-12")];

    it("o fechamento do Mês novo usa o Ciclo novo", () => {
      const l = dia("2026-11-25", { ...SEM_FATURA_OPCOES(), ciclo: trocou });
      expect(l).toMatchObject([{ mes: "2026-12", fechouEm: "2026-11-25" }]);
    });

    it("o Mês antigo segue o Ciclo antigo", () => {
      const l = dia("2026-10-28", { ...SEM_FATURA_OPCOES(), ciclo: trocou });
      expect(l).toMatchObject([{ mes: "2026-11", fechouEm: "2026-10-28" }]);
      // Com o Ciclo novo valendo para novembro, 28/10 não seria o fechamento.
      expect(dia("2026-10-25", { ...SEM_FATURA_OPCOES(), ciclo: trocou })).toEqual([]);
    });

    it("dois fechamentos na mesma janela: dois lembretes, por Mês", () => {
      // Nov fecha 28/11 (10 → 28, vence 30); Dez fecha 01/12 (01, vence 10).
      const ciclo = [config(28, 30, "2026-01"), config(1, 10, "2026-12")];
      const l = dia("2026-12-02", { ...SEM_FATURA_OPCOES(), ciclo });
      expect(l.map((x) => (x.tipo === "fechamento" ? x.mes : null))).toEqual(["2026-11", "2026-12"]);
    });
  });
});

/** O Mês de novembro ainda sem Fatura importada (só a de outubro). */
function SEM_FATURA_OPCOES() {
  return { contexto: { vencimentosDasFaturas: new Map([["2026-10", "2026-10-06"]]) } };
}

describe("o lembrete de atraso", () => {
  it("no primeiro dia de atraso (vencimento 06/11 + tolerância 10 + 1 = 17/11/26)", () => {
    const linhas = [lanc("l1", { valor_centavos: 11_516 })];
    expect(dia("2026-11-16", { linhas, blocos: [lucas] })).toEqual([]);
    expect(dia("2026-11-17", { linhas, blocos: [lucas] })).toEqual([
      {
        tipo: "atraso",
        referencia: "b-lucas",
        blocoId: "b-lucas",
        blocoNome: "Lucas",
        valorCentavos: 11_516,
        desde: "2026-11-17",
        destino: "/recebimentos",
      },
    ]);
  });

  it("o texto, sem artigo: 'Lucas: R$ 115,16 em atraso desde 17/11/26'", () => {
    const [l] = dia("2026-11-19", { linhas: [lanc("l1", { valor_centavos: 11_516 })], blocos: [lucas] });
    // O "R$ 115,16" leva o espaço sem quebra do formatador de dinheiro.
    expect(textoDoLembrete(l)).toBe(`Lucas: ${formatarDinheiro(11_516)} em atraso desde 17/11/26`);
    expect(textoDoLembrete(l).replace(/ /g, " ")).toBe("Lucas: R$ 115,16 em atraso desde 17/11/26");
  });

  it("tolerância 0: atrasa no dia seguinte ao vencimento", () => {
    const linhas = [lanc("l1")];
    const c = { tolerancia: 0 };
    expect(dia("2026-11-06", { linhas, blocos: [lucas], contexto: c })).toEqual([]);
    expect(dia("2026-11-07", { linhas, blocos: [lucas], contexto: c })).toMatchObject([{ desde: "2026-11-07" }]);
  });

  it("o valor é o que falta depois do Pagamento parcial; o 'desde' não muda", () => {
    const itens = [{ lancamento_id: "l1", valor_centavos: 4_000 }];
    expect(dia("2026-11-19", { linhas: [lanc("l1")], blocos: [lucas], contexto: { itens } })).toMatchObject([
      { valorCentavos: 6_000, desde: "2026-11-17" },
    ]);
  });

  it("Pagamento que cobriu tudo (sem Status pago), Status pago, linha excluída: nada", () => {
    const itens = [{ lancamento_id: "l1", valor_centavos: 10_000 }];
    expect(dia("2026-11-19", { linhas: [lanc("l1")], blocos: [lucas], contexto: { itens } })).toEqual([]);
    expect(dia("2026-11-19", { linhas: [lanc("l1", { status_id: PAGO })], blocos: [lucas] })).toEqual([]);
    expect(
      dia("2026-11-19", { linhas: [lanc("l1", { excluido_em: "2026-11-10T00:00:00Z" })], blocos: [lucas] }),
    ).toEqual([]);
  });

  it("linha paga ao lado de uma atrasada: só a atrasada entra no valor", () => {
    const linhas = [lanc("l1", { valor_centavos: 3_000 }), lanc("l2", { status_id: PAGO, valor_centavos: 9_000 })];
    expect(dia("2026-11-19", { linhas, blocos: [lucas] })).toMatchObject([{ valorCentavos: 3_000 }]);
  });

  it("vários itens, de Meses diferentes: o valor soma e o 'desde' é o mais antigo", () => {
    const linhas = [lanc("l1", { mes: "2026-10", valor_centavos: 2_000 }), lanc("l2", { valor_centavos: 5_000 })];
    expect(dia("2026-11-19", { linhas, blocos: [lucas] })).toMatchObject([
      { valorCentavos: 7_000, desde: "2026-10-17" },
    ]);
  });

  it("um item ainda em dia no mesmo Bloco não entra no valor", () => {
    // Dezembro vence 06/12: em dia em 19/11.
    const faturas = new Map([...FATURAS, ["2026-12", "2026-12-06"]]);
    const linhas = [lanc("l1", { valor_centavos: 4_000 }), lanc("l2", { mes: "2026-12", valor_centavos: 9_000 })];
    expect(dia("2026-11-19", { linhas, blocos: [lucas], contexto: { vencimentosDasFaturas: faturas } })).toMatchObject([
      { valorCentavos: 4_000 },
    ]);
  });

  it("previsto, mãe dividida, valor zero e crédito nunca atrasam", () => {
    const linhas = [
      lanc("prev", { lancado_por: "sistema" }),
      lanc("zero", { valor_centavos: 0 }),
      lanc("cred", { valor_centavos: -500 }),
      lanc("mae", { divisao: { partes: [] } }),
    ];
    expect(dia("2026-11-19", { linhas, blocos: [lucas] })).toEqual([]);
  });

  it("Divisão: as partes atrasam pelo Responsável de cada uma, a mãe não soma", () => {
    const linhas = [
      lanc("mae", { valor_centavos: 10_001, responsavel_id: "rafael", divisao: { partes: [] } }),
      lanc("f1", { valor_centavos: 5_001, dividido_de_id: "mae" }),
      lanc("f2", { valor_centavos: 5_000, dividido_de_id: "mae", responsavel_id: "rafael" }),
    ];
    expect(dia("2026-11-19", { linhas, blocos: [lucas] })).toMatchObject([{ valorCentavos: 5_001 }]);
  });

  it("a Fórmula do Bloco vale: Rangel + Casal ÷ 2 conta a metade do item atrasado do Casal", () => {
    const rangel = bloco("b-rangel", "Rangel", metadeDoCasal);
    const linhas = [lanc("c1", { responsavel_id: "casal", valor_centavos: 10_000 })];
    expect(dia("2026-11-19", { linhas, blocos: [rangel] })).toMatchObject([{ blocoNome: "Rangel", valorCentavos: 5_000 }]);
  });

  it("a parte fixa da Fórmula não entra no valor em atraso", () => {
    const comFixo = bloco("b-fixo", "Lucas fixo", lucasMaisCem);
    const linhas = [lanc("l1", { valor_centavos: 3_000 })];
    expect(dia("2026-11-19", { linhas, blocos: [comFixo] })).toMatchObject([{ valorCentavos: 3_000 }]);
    // Sem item atrasado, a parte fixa sozinha nunca vira lembrete.
    expect(dia("2026-11-19", { linhas: [], blocos: [comFixo] })).toEqual([]);
  });

  it("Bloco só de valor fixo, Fórmula que não calcula e Bloco sem atrasados: nada", () => {
    const linhas = [lanc("l1")];
    expect(dia("2026-11-19", { linhas, blocos: [bloco("b-250", "Fixo", soValorFixo)] })).toEqual([]);
    expect(dia("2026-11-19", { linhas, blocos: [bloco("b-zero", "Zero", divisaoPorZero)] })).toEqual([]);
    expect(dia("2026-11-19", { linhas, blocos: [bloco("b-rafael", "Rafael", resp("rafael"))] })).toEqual([]);
  });

  it("Bloco que não é de cobrança não vira lembrete", () => {
    const meu = bloco("b-meu", "Meu", resp("lucas"), { de_cobranca: false, meu_bloco: true });
    expect(dia("2026-11-19", { linhas: [lanc("l1")], blocos: [meu] })).toEqual([]);
  });

  it("preferência de atraso desligada: não aparece (e o fechamento segue ligado)", () => {
    const preferencias = { fechamento: true, atraso: false };
    expect(dia("2026-11-19", { linhas: [lanc("l1")], blocos: [lucas], preferencias })).toEqual([]);
    const onlyFechamento = dia("2026-10-28", { ...SEM_FATURA_OPCOES(), linhas: [lanc("l1", { mes: "2026-10" })], blocos: [lucas], preferencias });
    expect(onlyFechamento.map((l) => l.tipo)).toEqual(["fechamento"]);
  });

  it("os dois desligados: lista vazia", () => {
    const preferencias = { fechamento: false, atraso: false };
    expect(dia("2026-10-28", { ...SEM_FATURA_OPCOES(), linhas: [lanc("l1", { mes: "2026-10" })], blocos: [lucas], preferencias })).toEqual([]);
  });

  it("um por Bloco, na ordem dos Blocos, não na da entrada", () => {
    const a = bloco("b-a", "Zé", resp("ze"), { ordem: 2 });
    const b = bloco("b-b", "Ana", resp("ana"), { ordem: 1 });
    const c = bloco("b-c", "Beto", resp("beto"), { ordem: 1 });
    const linhas = [
      lanc("1", { responsavel_id: "ze" }),
      lanc("2", { responsavel_id: "ana" }),
      lanc("3", { responsavel_id: "beto" }),
    ];
    const esperado = ["Ana", "Beto", "Zé"];
    const nomes = (blocos: Bloco[]) =>
      dia("2026-11-19", { linhas, blocos }).map((l) => (l.tipo === "atraso" ? l.blocoNome : null));
    expect(nomes([a, b, c])).toEqual(esperado);
    expect(nomes([c, a, b])).toEqual(esperado);
  });

  it("fechamento vem antes do atraso", () => {
    // 28/10: a Fatura de novembro fecha e o Lucas já atrasou o que vencia em 06/10 (desde 17/10).
    const l = dia("2026-10-28", { ...SEM_FATURA_OPCOES(), linhas: [lanc("l1", { mes: "2026-10" })], blocos: [lucas] });
    expect(l.map((x) => x.tipo)).toEqual(["fechamento", "atraso"]);
  });

  it("mesma entrada, mesma saída, em qualquer ordem das linhas", () => {
    const linhas = [
      lanc("a", { valor_centavos: 1_001 }),
      lanc("b", { mes: "2026-10", valor_centavos: 2_002 }),
      lanc("c", { valor_centavos: 3_003 }),
    ];
    const certo = dia("2026-11-19", { linhas, blocos: [lucas] });
    expect(dia("2026-11-19", { linhas: [...linhas].reverse(), blocos: [lucas] })).toEqual(certo);
  });
});

describe("amarrada ao 'atrasado' da grade (estaAtrasado)", () => {
  // O mesmo conjunto de linhas, o mesmo contexto: quem os lembretes dizem atrasado é quem a grade diz.
  const itens = [
    { lancamento_id: "parcial", valor_centavos: 3_000 },
    { lancamento_id: "quitado", valor_centavos: 10_000 },
  ];
  const linhas: LancamentoParaLembrete[] = [
    lanc("em-dia", { mes: "2026-12" }),
    lanc("atrasado-1", { valor_centavos: 4_321 }),
    lanc("atrasado-2", { mes: "2026-10", valor_centavos: 777 }),
    lanc("parcial", { valor_centavos: 10_000 }),
    lanc("quitado"),
    lanc("pago", { status_id: PAGO }),
    lanc("sem-status", { status_id: null, valor_centavos: 1_500 }),
    lanc("excluido", { excluido_em: "2026-11-01T00:00:00Z" }),
    lanc("previsto", { lancado_por: "sistema" }),
    lanc("zero", { valor_centavos: 0 }),
    lanc("credito", { valor_centavos: -900 }),
    lanc("mae", { divisao: { partes: [] }, valor_centavos: 8_000 }),
    lanc("filha", { dividido_de_id: "mae", valor_centavos: 4_000 }),
    lanc("outro", { responsavel_id: "outro", valor_centavos: 9_999 }),
  ];
  const todos = bloco("b-todos", "Todos", { tipo: "todos" });
  const doLucas = bloco("b-lucas", "Lucas", resp("lucas"));
  const doOutro = bloco("b-outro", "Outro", resp("outro"));
  const ctxL = contexto({ itens });
  const ctxA: ContextoDeAtraso = {
    statusPagos: ctxL.statusPagos,
    configsCiclo: CICLO,
    vencimentosDasFaturas: ctxL.vencimentosDasFaturas,
    recebidoCentavos: somaDosItens(itens),
  };

  for (const hoje of ["2026-10-16", "2026-10-17", "2026-11-16", "2026-11-17", "2026-12-17", "2026-12-18"]) {
    it(`hoje ${hoje}: um Bloco aparece se e só se a grade marca um item dele como atrasado`, () => {
      const lembretes = dia(hoje, { linhas, blocos: [todos, doLucas, doOutro], contexto: { itens } });
      const atrasadas = linhas.filter((l) => estaAtrasado(l, hoje, 10, ctxA));
      const por = (responsavel: string | null) =>
        atrasadas.filter((l) => responsavel === null || l.responsavel_id === responsavel);
      const restante = (l: LancamentoParaLembrete) =>
        l.valor_centavos - (somaDosItens(itens).get(l.id) ?? 0);
      for (const [b, quem] of [
        [todos, null],
        [doLucas, "lucas"],
        [doOutro, "outro"],
      ] as const) {
        const dele = por(quem);
        const lembrete = lembretes.find((l) => l.tipo === "atraso" && l.blocoId === b.id);
        if (dele.length === 0) {
          expect(lembrete, b.nome).toBeUndefined();
          continue;
        }
        expect(lembrete, b.nome).toMatchObject({
          valorCentavos: dele.reduce((soma, l) => soma + restante(l), 0),
          desde: dele.map((l) => primeiroDiaDeAtraso(l, 10, ctxA)!).sort()[0],
        });
      }
      // E as linhas que a função de atraso do núcleo marca são as mesmas que a tela usa.
      expect([...atrasosDasLinhas(linhas, hoje, 10, ctxA).keys()].sort()).toEqual(atrasadas.map((l) => l.id).sort());
    });
  }
});

describe("o texto do lembrete de atraso (sem o artigo)", () => {
  const atraso = (blocoNome: string, valorCentavos: number, desde = "2026-10-17"): Lembrete => ({
    tipo: "atraso",
    referencia: "b-1",
    blocoId: "b-1",
    blocoNome,
    valorCentavos,
    desde,
    destino: "/recebimentos",
  });
  const texto = (l: Lembrete) => textoDoLembrete(l).replace(/ /g, " ");

  it("nome feminino não erra: 'Mãe: R$ 1.783,73 em atraso desde 17/10/26' (e não 'O Mãe')", () => {
    expect(texto(atraso("Mãe", 178_373))).toBe("Mãe: R$ 1.783,73 em atraso desde 17/10/26");
    expect(texto(atraso("Mãe", 178_373))).not.toMatch(/^O /);
  });

  it("o nome do Bloco vai como está, qualquer que seja ele", () => {
    expect(texto(atraso("Rangel", 526_347))).toBe("Rangel: R$ 5.263,47 em atraso desde 17/10/26");
    expect(texto(atraso("Casal do 2º andar", 100))).toBe("Casal do 2º andar: R$ 1,00 em atraso desde 17/10/26");
  });
});

describe("preferenciasDeLembretes", () => {
  it("sem linha, coluna ausente ou nula: ligados (o padrão do banco e o de antes da migração)", () => {
    expect(preferenciasDeLembretes(undefined)).toEqual({ fechamento: true, atraso: true });
    expect(preferenciasDeLembretes(null)).toEqual(PREFERENCIAS_DE_LEMBRETES_PADRAO);
    expect(preferenciasDeLembretes({})).toEqual({ fechamento: true, atraso: true });
    expect(preferenciasDeLembretes({ lembrete_fechamento: null, lembrete_atraso: null })).toEqual({
      fechamento: true,
      atraso: true,
    });
  });

  it("lê cada coluna", () => {
    expect(preferenciasDeLembretes({ lembrete_fechamento: false, lembrete_atraso: true })).toEqual({
      fechamento: false,
      atraso: true,
    });
    expect(preferenciasDeLembretes({ lembrete_fechamento: true, lembrete_atraso: false })).toEqual({
      fechamento: true,
      atraso: false,
    });
  });
});
