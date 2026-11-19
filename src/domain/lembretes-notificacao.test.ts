import { describe, expect, it } from "vitest";
import { lerBlocos } from "./blocos";
import {
  chaveDeNotificacao,
  lembretesDasLinhas,
  lembretesDoDia,
  lembretesParaExibir,
  lembretesParaNotificar,
  preferenciasDeLembretes,
  type ChaveDeNotificacao,
  type LinhasParaLembretes,
} from "./lembretes";
import { formatarDinheiro } from "./dinheiro";
import { TEXTOS_NOTIFICACOES, avisoDoLembrete, textoDoLembrete } from "./mensagens";
import { somaDosItens } from "./pagamento";

// O aviso do sistema dos lembretes (História 7.5, FR-55, AD-13): quais lembretes do dia saem como notificação e com
// que chave, a mesma montagem de contexto da faixa e do Cron, e o texto do aviso. O Ciclo fecha dia 28 e vence dia 06,
// a tolerância é 10 e o Lucas é Bloco de cobrança.

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const formulaDe = (responsavel: string) => ({ tipo: "responsavel", id: responsavel });
const blocoDb = (id: string, nome: string, responsavel: string, ordem = 1, de_cobranca = true) => ({
  id,
  nome,
  formula: formulaDe(responsavel),
  ordem,
  de_cobranca,
  meu_bloco: false,
});

const lanc = (id: string, responsavel: string, extra: Record<string, unknown> = {}) => ({
  id,
  mes: "2026-11",
  excluido_em: null,
  valor_centavos: 10_000,
  responsavel_id: responsavel,
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

const CICLO = [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }];

/** As linhas cruas do banco; por padrão as Faturas de Out e Nov/26 estão importadas. */
function linhas(extra: Partial<LinhasParaLembretes> = {}): LinhasParaLembretes {
  return {
    ciclo: CICLO,
    lancamentos: [],
    blocos: [blocoDb("b-lucas", "Lucas", "lucas")],
    status: [
      { id: PAGO, conta_como_pago: true },
      { id: NAO_PAGO, conta_como_pago: false },
    ],
    itens: [],
    faturas: [
      { mes: "2026-10", vencimento: "2026-10-06" },
      { mes: "2026-11", vencimento: "2026-11-06" },
    ],
    configuracao: null,
    ...extra,
  };
}

const SEM_FATURA_DE_NOVEMBRO = { faturas: [{ mes: "2026-10", vencimento: "2026-10-06" }] };

const notificar = (hoje: string, l: LinhasParaLembretes, jaEnviados: ChaveDeNotificacao[] = []) =>
  lembretesParaNotificar(lembretesDasLinhas(hoje, l), jaEnviados);

const chaves = (hoje: string, l: LinhasParaLembretes, jaEnviados: ChaveDeNotificacao[] = []) =>
  notificar(hoje, l, jaEnviados).map(({ tipo, referencia, dia }) => ({ tipo, referencia, dia }));

const ATRASO_DO_LUCAS = { tipo: "atraso", referencia: "b-lucas", dia: "2026-11-17" } as const;
const FECHAMENTO_DE_NOVEMBRO = { tipo: "fechamento", referencia: "2026-11", dia: "2026-10-28" } as const;

describe("lembretesParaNotificar: fechamento", () => {
  it("no dia do fechamento sai um aviso, com a chave (fechamento, Mês da Fatura, dia do fechamento)", () => {
    expect(chaves("2026-10-28", linhas(SEM_FATURA_DE_NOVEMBRO))).toEqual([FECHAMENTO_DE_NOVEMBRO]);
  });

  it("o aviso leva o lembrete inteiro (o texto sai dele)", () => {
    const [n] = notificar("2026-10-28", linhas(SEM_FATURA_DE_NOVEMBRO));
    expect(n.lembrete).toMatchObject({ tipo: "fechamento", mes: "2026-11", destino: "/?mes=2026-11" });
  });

  it("Cron que falhou no dia: nos dias seguintes da janela ainda avisa, com a MESMA chave (o dia do fechamento)", () => {
    for (const hoje of ["2026-10-29", "2026-10-31", "2026-11-02"]) {
      expect(chaves(hoje, linhas(SEM_FATURA_DE_NOVEMBRO))).toEqual([FECHAMENTO_DE_NOVEMBRO]);
    }
  });

  it("Cron que falhou no dia e voltou: avisa uma vez só (depois de enviado, os outros dias da janela ficam quietos)", () => {
    expect(chaves("2026-10-30", linhas(SEM_FATURA_DE_NOVEMBRO))).toEqual([FECHAMENTO_DE_NOVEMBRO]);
    for (const hoje of ["2026-10-31", "2026-11-01", "2026-11-02"]) {
      expect(chaves(hoje, linhas(SEM_FATURA_DE_NOVEMBRO), [FECHAMENTO_DE_NOVEMBRO])).toEqual([]);
    }
  });

  it("no dia do fechamento já avisado, o mesmo dia de novo (duas execuções) não repete", () => {
    expect(chaves("2026-10-28", linhas(SEM_FATURA_DE_NOVEMBRO), [FECHAMENTO_DE_NOVEMBRO])).toEqual([]);
  });

  it("antes do dia e depois da janela de 6 dias: nada", () => {
    expect(chaves("2026-10-27", linhas(SEM_FATURA_DE_NOVEMBRO))).toEqual([]);
    expect(chaves("2026-11-03", linhas(SEM_FATURA_DE_NOVEMBRO))).toEqual([]);
  });

  it("Fatura do Mês já importada: nada", () => {
    expect(chaves("2026-10-28", linhas())).toEqual([]);
  });

  it("preferência de fechamento desligada: nada", () => {
    const l = linhas({ ...SEM_FATURA_DE_NOVEMBRO, configuracao: { lembrete_fechamento: false } });
    expect(chaves("2026-10-28", l)).toEqual([]);
  });
});

describe("lembretesParaNotificar: atraso", () => {
  const comAtraso = (extra: Partial<LinhasParaLembretes> = {}) =>
    linhas({ lancamentos: [lanc("l1", "lucas", { valor_centavos: 11_516 })], ...extra });

  it("atraso novo: no primeiro dia de atraso sai um aviso, com a chave (atraso, id do Bloco, desde)", () => {
    expect(chaves("2026-11-16", comAtraso())).toEqual([]);
    expect(chaves("2026-11-17", comAtraso())).toEqual([ATRASO_DO_LUCAS]);
  });

  it("o corpo do aviso é o texto da faixa: 'O Lucas tem R$ 115,16 em atraso desde 17/11/26'", () => {
    const [n] = notificar("2026-11-17", comAtraso());
    expect(avisoDoLembrete(n.lembrete)).toEqual({
      titulo: TEXTOS_NOTIFICACOES.titulo_aviso,
      corpo: `O Lucas tem ${formatarDinheiro(11_516)} em atraso desde 17/11/26`,
      destino: "/recebimentos",
      tag: "atraso:b-lucas",
    });
  });

  it("atraso que continua: nos dias seguintes não repete (a chave é o 'desde', não 'hoje')", () => {
    for (const hoje of ["2026-11-18", "2026-11-25", "2026-12-20"]) {
      expect(chaves(hoje, comAtraso(), [ATRASO_DO_LUCAS])).toEqual([]);
    }
  });

  it("o valor mudar (Pagamento parcial) não avisa de novo", () => {
    const parcial = comAtraso({ itens: [{ lancamento_id: "l1", valor_centavos: 4_000 }] });
    expect(chaves("2026-11-20", parcial, [ATRASO_DO_LUCAS])).toEqual([]);
  });

  it("Cron que falhou no primeiro dia de atraso: o próximo dia avisa (o atraso é estado) e a chave é a mesma", () => {
    expect(chaves("2026-11-18", comAtraso())).toEqual([ATRASO_DO_LUCAS]);
  });

  it("Bloco que pagou e atrasou de novo: o atraso novo tem outro 'desde' e avisa", () => {
    // Novembro quitado (Status pago) e um item de dezembro (vence 06/12; atrasa desde 17/12).
    const pago = linhas({
      lancamentos: [
        lanc("l1", "lucas", { status_id: PAGO }),
        lanc("l2", "lucas", { mes: "2026-12", valor_centavos: 5_000 }),
      ],
      faturas: [
        { mes: "2026-11", vencimento: "2026-11-06" },
        { mes: "2026-12", vencimento: "2026-12-06" },
      ],
    });
    expect(chaves("2026-12-16", pago, [ATRASO_DO_LUCAS])).toEqual([]);
    expect(chaves("2026-12-17", pago, [ATRASO_DO_LUCAS])).toEqual([
      { tipo: "atraso", referencia: "b-lucas", dia: "2026-12-17" },
    ]);
  });

  it("pagou o item mais antigo e outro mais novo segue atrasado: o 'desde' mudou, avisa de novo", () => {
    const l = linhas({
      lancamentos: [
        lanc("l1", "lucas", { status_id: PAGO }),
        lanc("l2", "lucas", { mes: "2026-12", valor_centavos: 5_000 }),
      ],
      faturas: [{ mes: "2026-12", vencimento: "2026-12-06" }],
    });
    const [n] = notificar("2026-12-20", l, [ATRASO_DO_LUCAS]);
    expect(n).toMatchObject({ tipo: "atraso", referencia: "b-lucas", dia: "2026-12-17" });
  });

  it("Pagamento desfeito: o mesmo atraso volta com a mesma chave e NÃO avisa de novo (nunca duas vezes)", () => {
    expect(chaves("2026-11-26", comAtraso(), [ATRASO_DO_LUCAS])).toEqual([]);
  });

  it("preferência de atraso desligada: nada", () => {
    expect(chaves("2026-11-17", comAtraso({ configuracao: { lembrete_atraso: false } }))).toEqual([]);
  });

  it("dois Blocos: um aviso por Bloco, na ordem da faixa", () => {
    const dois = linhas({
      blocos: [blocoDb("b-rangel", "Rangel", "rangel", 2), blocoDb("b-lucas", "Lucas", "lucas", 1)],
      lancamentos: [lanc("l1", "lucas"), lanc("l2", "rangel", { valor_centavos: 3_000 })],
    });
    expect(chaves("2026-11-17", dois)).toEqual([
      ATRASO_DO_LUCAS,
      { tipo: "atraso", referencia: "b-rangel", dia: "2026-11-17" },
    ]);
  });

  it("um Bloco já avisado e outro novo: só o novo sai", () => {
    const dois = linhas({
      blocos: [blocoDb("b-lucas", "Lucas", "lucas", 1), blocoDb("b-rangel", "Rangel", "rangel", 2)],
      lancamentos: [lanc("l1", "lucas"), lanc("l2", "rangel", { valor_centavos: 3_000 })],
    });
    expect(chaves("2026-11-17", dois, [ATRASO_DO_LUCAS])).toEqual([
      { tipo: "atraso", referencia: "b-rangel", dia: "2026-11-17" },
    ]);
  });

  it("fechamento e atraso no mesmo dia: dois avisos, o do fechamento primeiro", () => {
    const l = linhas({
      ...SEM_FATURA_DE_NOVEMBRO,
      lancamentos: [lanc("l1", "lucas", { mes: "2026-10" })],
    });
    expect(chaves("2026-10-28", l)).toEqual([
      FECHAMENTO_DE_NOVEMBRO,
      { tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" },
    ]);
  });

  it("os dois tipos desligados: nada", () => {
    const l = linhas({
      ...SEM_FATURA_DE_NOVEMBRO,
      lancamentos: [lanc("l1", "lucas", { mes: "2026-10" })],
      configuracao: { lembrete_fechamento: false, lembrete_atraso: false },
    });
    expect(chaves("2026-10-28", l)).toEqual([]);
  });

  it("nada atrasado e nada fechando: nada", () => {
    expect(chaves("2026-11-19", linhas())).toEqual([]);
  });

  it("só os que a faixa mostra: 5 Blocos atrasados são 3 avisos; o 4º só sai quando um dos 3 quitar", () => {
    const nomes = ["Ana", "Beto", "Caio", "Duda", "Eva"];
    const cinco = linhas({
      blocos: nomes.map((n, i) => blocoDb(`b-${n}`, n, n, i + 1)),
      lancamentos: nomes.map((n, i) => lanc(`l${i}`, n)),
    });
    expect(chaves("2026-11-17", cinco).map((c) => c.referencia)).toEqual(["b-Ana", "b-Beto", "b-Caio"]);
    // A Ana quitou: o Duda entra no que a faixa mostra e, agora sim, é avisado.
    const semAna = { ...cinco, lancamentos: cinco.lancamentos.map((x, i) => (i === 0 ? { ...x, status_id: PAGO } : x)) };
    const jaAvisados: ChaveDeNotificacao[] = [{ tipo: "atraso", referencia: "b-Beto", dia: "2026-11-17" }];
    expect(chaves("2026-11-17", semAna, jaAvisados).map((c) => c.referencia)).toEqual(["b-Caio", "b-Duda"]);
  });

  it("a mesma referência com outro tipo ou outro dia não conta como já enviada", () => {
    const outroTipo: ChaveDeNotificacao[] = [{ tipo: "fechamento", referencia: "b-lucas", dia: "2026-11-17" }];
    const outroDia: ChaveDeNotificacao[] = [{ tipo: "atraso", referencia: "b-lucas", dia: "2026-11-16" }];
    expect(chaves("2026-11-17", comAtraso(), outroTipo)).toEqual([ATRASO_DO_LUCAS]);
    expect(chaves("2026-11-17", comAtraso(), outroDia)).toEqual([ATRASO_DO_LUCAS]);
  });

  it("hoje inválido: nada", () => {
    expect(lembretesParaNotificar(lembretesDasLinhas("2026-02-30", comAtraso()), [])).toEqual([]);
  });
});

describe("chaveDeNotificacao", () => {
  it("fechamento: o dia do fechamento; atraso: o 'desde'", () => {
    expect(
      chaveDeNotificacao({
        tipo: "fechamento",
        referencia: "2026-11",
        mes: "2026-11",
        fechouEm: "2026-10-28",
        destino: "/?mes=2026-11",
      }),
    ).toEqual(FECHAMENTO_DE_NOVEMBRO);
    expect(
      chaveDeNotificacao({
        tipo: "atraso",
        referencia: "b-lucas",
        blocoId: "b-lucas",
        blocoNome: "Lucas",
        valorCentavos: 1,
        desde: "2026-11-17",
        destino: "/recebimentos",
      }),
    ).toEqual(ATRASO_DO_LUCAS);
  });
});

describe("o servidor e a faixa dizem a mesma coisa (AD-10)", () => {
  // O jeito de a faixa montar o contexto ANTES da 7.5 (a conta do `FaixaDeLembretes` da 7.4), escrito de novo à mão:
  // `lembretesDasLinhas` precisa devolver o mesmo que ele para as mesmas linhas.
  function comoAFaixaMontava(hoje: string, l: LinhasParaLembretes) {
    const linha = l.configuracao;
    return lembretesDoDia(
      hoje,
      l.ciclo,
      l.lancamentos,
      lerBlocos(l.blocos).filter((b) => b.de_cobranca),
      preferenciasDeLembretes(linha),
      {
        statusPagos: new Set(l.status.filter((s) => s.conta_como_pago).map((s) => s.id)),
        itens: l.itens,
        vencimentosDasFaturas: new Map(l.faturas.map((f) => [f.mes, f.vencimento] as const)),
        tolerancia: linha?.tolerancia_atraso_dias ?? 10,
      },
    );
  }

  const cenarios: [string, LinhasParaLembretes][] = [
    ["sem nada", linhas()],
    [
      "atraso e fechamento, itens parciais, Bloco que não é de cobrança",
      linhas({
        ...SEM_FATURA_DE_NOVEMBRO,
        blocos: [blocoDb("b-lucas", "Lucas", "lucas"), blocoDb("b-meu", "Meu", "rafael", 2, false)],
        lancamentos: [
          lanc("l1", "lucas", { mes: "2026-10", valor_centavos: 20_000 }),
          lanc("l2", "rafael", { mes: "2026-10" }),
          lanc("l3", "lucas", { mes: "2026-10", status_id: PAGO }),
          lanc("l4", "lucas", { mes: "2026-10", excluido_em: "2026-10-30T00:00:00Z" }),
        ],
        itens: [{ lancamento_id: "l1", valor_centavos: 5_000 }],
      }),
    ],
    [
      "tolerância e preferências do dono",
      linhas({
        lancamentos: [lanc("l1", "lucas")],
        configuracao: { lembrete_fechamento: false, lembrete_atraso: true, tolerancia_atraso_dias: 3 },
      }),
    ],
    [
      "Fórmula ilegível é ignorada",
      linhas({
        lancamentos: [lanc("l1", "lucas")],
        blocos: [{ ...blocoDb("b-x", "X", "lucas"), formula: { quebrada: true } }, blocoDb("b-lucas", "Lucas", "lucas")],
      }),
    ],
  ];

  const dias = ["2026-10-27", "2026-10-28", "2026-10-31", "2026-11-03", "2026-11-09", "2026-11-17", "2026-11-18", "2026-12-30"];

  for (const [nome, l] of cenarios) {
    it(`${nome}: mesmas linhas, mesmos lembretes, todos os dias`, () => {
      for (const hoje of dias) expect(lembretesDasLinhas(hoje, l)).toEqual(comoAFaixaMontava(hoje, l));
    });

    it(`${nome}: todo aviso é um lembrete da faixa, com o mesmo texto`, () => {
      for (const hoje of dias) {
        const faixa = lembretesParaExibir(lembretesDasLinhas(hoje, l)).visiveis;
        for (const aviso of notificar(hoje, l)) {
          const igual = faixa.find((f) => f.tipo === aviso.tipo && f.referencia === aviso.referencia);
          expect(igual).toEqual(aviso.lembrete);
          expect(avisoDoLembrete(aviso.lembrete).corpo).toBe(textoDoLembrete(igual!));
        }
      }
    });
  }

  it("o Pagamento parcial entra pelo que falta, como na faixa", () => {
    const l = linhas({
      lancamentos: [lanc("l1", "lucas", { valor_centavos: 10_000 })],
      itens: [{ lancamento_id: "l1", valor_centavos: 4_000 }],
    });
    expect(somaDosItens(l.itens).get("l1")).toBe(4_000);
    const [a] = lembretesDasLinhas("2026-11-17", l);
    expect(a).toMatchObject({ tipo: "atraso", valorCentavos: 6_000 });
  });
});
