import { describe, expect, it } from "vitest";
import { LIMITE_DO_CONTADOR_DE_AVISOS, avisosDaCentral, type ChaveLida } from "./avisos";
import { formatarDinheiro } from "./dinheiro";
import {
  chaveDeNotificacao,
  lembretesDasLinhas,
  type Lembrete,
  type LinhasParaLembretes,
} from "./lembretes";
import {
  TEXTOS_AVISOS,
  nomeDoContadorDeAvisos,
  rotuloDeAvisosNovos,
  rotuloResumoDeAtrasos,
  textoDoContadorDeAvisos,
  textoDoLembrete,
} from "./mensagens";

// A Central de Avisos (História 8.1, FR-55): os lembretes do dia mais o "lido" (a chave do aviso do sistema).
// O Ciclo fecha dia 28 e vence dia 06, a tolerância é 10. Os Blocos de cobrança atrasam desde 17/11/26.

const atraso = (blocoId: string, valorCentavos = 10_000, desde = "2026-11-17", blocoNome = blocoId): Lembrete => ({
  tipo: "atraso",
  referencia: blocoId,
  blocoId,
  blocoNome,
  valorCentavos,
  desde,
  destino: "/recebimentos",
});

const fechamento = (mes = "2026-11", fechouEm = "2026-10-28"): Lembrete => ({
  tipo: "fechamento",
  referencia: mes,
  mes,
  fechouEm,
  destino: `/?mes=${mes}`,
});

const lido = (l: Lembrete): ChaveLida => chaveDeNotificacao(l);
const referencias = (r: ReturnType<typeof avisosDaCentral>) => r.avisos.map((a) => a.chave.referencia);

describe("avisosDaCentral: o aviso e o 'lido'", () => {
  it("aviso novo: aparece como não lido e conta", () => {
    const r = avisosDaCentral([atraso("lucas")], []);
    expect(r.avisos).toEqual([{ chave: { tipo: "atraso", referencia: "lucas", dia: "2026-11-17" }, lembrete: atraso("lucas"), lido: false }]);
    expect(r.naoLidos).toBe(1);
    expect(r.chavesNaoLidas).toEqual([{ tipo: "atraso", referencia: "lucas", dia: "2026-11-17" }]);
  });

  it("sem lembretes: nada, contador zero", () => {
    expect(avisosDaCentral([], [])).toEqual({ avisos: [], naoLidos: 0, chavesNaoLidas: [], blocosAtrasados: 0 });
    expect(avisosDaCentral([], [{ tipo: "atraso", referencia: "lucas", dia: "2026-11-17" }]).naoLidos).toBe(0);
  });

  it("lido que continua: o atraso de sempre fica lido, mesmo com o valor mudando (Pagamento parcial)", () => {
    const lidos = [lido(atraso("lucas"))];
    expect(avisosDaCentral([atraso("lucas", 10_000)], lidos).avisos[0].lido).toBe(true);
    expect(avisosDaCentral([atraso("lucas", 6_000)], lidos).avisos[0].lido).toBe(true);
    expect(avisosDaCentral([atraso("lucas", 6_000)], lidos).naoLidos).toBe(0);
  });

  it("o 'desde' mudou (quitou o mais antigo com outro ainda atrasado): volta como não lido", () => {
    const lidos = [lido(atraso("lucas", 10_000, "2026-11-17"))];
    const r = avisosDaCentral([atraso("lucas", 5_000, "2026-12-17")], lidos);
    expect(r.avisos[0]).toMatchObject({ lido: false, chave: { dia: "2026-12-17" } });
    expect(r.naoLidos).toBe(1);
  });

  it("quitou e atrasou de novo: o atraso novo (outro 'desde') é não lido; o lido antigo não conta", () => {
    const lidos = [lido(atraso("lucas", 10_000, "2026-11-17"))];
    // Quitou: o aviso some da lista e do contador (a linha lida fica no banco, sem efeito).
    expect(avisosDaCentral([], lidos)).toMatchObject({ avisos: [], naoLidos: 0 });
    // Atrasou de novo em dezembro.
    expect(avisosDaCentral([atraso("lucas", 7_000, "2026-12-17")], lidos).naoLidos).toBe(1);
  });

  it("pagamento desfeito que traz o mesmo atraso de volta: continua lido (mesma chave)", () => {
    const lidos = [lido(atraso("lucas"))];
    expect(avisosDaCentral([], lidos).naoLidos).toBe(0);
    expect(avisosDaCentral([atraso("lucas")], lidos).avisos[0].lido).toBe(true);
  });

  it("a mesma referência com outro tipo ou outro dia não conta como lida", () => {
    const outroTipo: ChaveLida[] = [{ tipo: "fechamento", referencia: "lucas", dia: "2026-11-17" }];
    const outroDia: ChaveLida[] = [{ tipo: "atraso", referencia: "lucas", dia: "2026-11-16" }];
    expect(avisosDaCentral([atraso("lucas")], outroTipo).naoLidos).toBe(1);
    expect(avisosDaCentral([atraso("lucas")], outroDia).naoLidos).toBe(1);
  });

  it("fechamento: lido uma vez, fica lido na janela inteira; o do mês seguinte é outro aviso", () => {
    const lidos = [lido(fechamento("2026-11", "2026-10-28"))];
    expect(avisosDaCentral([fechamento("2026-11", "2026-10-28")], lidos).naoLidos).toBe(0);
    expect(avisosDaCentral([fechamento("2026-12", "2026-11-28")], lidos).naoLidos).toBe(1);
  });

  it("aviso que deixa de existir (Fatura importada, Bloco quitou) some da lista e do contador", () => {
    const lidos = [lido(fechamento()), lido(atraso("lucas"))];
    const r = avisosDaCentral([atraso("rangel")], lidos);
    expect(referencias(r)).toEqual(["rangel"]);
    expect(r.naoLidos).toBe(1);
  });

  it("linhas lidas de um tipo que o código não conhece (8.2) não casam com nada e não quebram", () => {
    const r = avisosDaCentral([atraso("lucas")], [{ tipo: "conferencia", referencia: "2026-11", dia: "2026-11-30" }]);
    expect(r.naoLidos).toBe(1);
  });
});

describe("avisosDaCentral: a ordem", () => {
  it("não lidos primeiro; dentro de cada grupo, a ordem dos lembretes (fechamento e, por Bloco, a ordem dos Blocos)", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto"), atraso("caio"), atraso("duda")];
    const r = avisosDaCentral(lembretes, [lido(lembretes[0]), lido(lembretes[2])]);
    expect(referencias(r)).toEqual(["ana", "caio", "duda", "2026-11", "beto"]);
    expect(r.avisos.map((a) => a.lido)).toEqual([false, false, false, true, true]);
    expect(r.naoLidos).toBe(3);
  });

  it("tudo não lido: a ordem do lembrete, o fechamento primeiro", () => {
    expect(referencias(avisosDaCentral([fechamento(), atraso("ana"), atraso("beto")], []))).toEqual(["2026-11", "ana", "beto"]);
  });

  it("tudo lido: a ordem do lembrete", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto")];
    const r = avisosDaCentral(lembretes, lembretes.map(lido));
    expect(referencias(r)).toEqual(["2026-11", "ana", "beto"]);
    expect(r.naoLidos).toBe(0);
    expect(r.chavesNaoLidas).toEqual([]);
  });

  it("mesma entrada, mesma saída: a ordem de `lidos` não importa e a entrada não muda", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto"), atraso("caio")];
    const lidos = [lido(lembretes[3]), lido(lembretes[1])];
    const copia = structuredClone({ lembretes, lidos });
    const a = avisosDaCentral(lembretes, lidos);
    expect(avisosDaCentral(lembretes, [...lidos].reverse())).toEqual(a);
    expect(avisosDaCentral(lembretes, lidos)).toEqual(a);
    expect({ lembretes, lidos }).toEqual(copia);
  });
});

describe("avisosDaCentral: vários Blocos, sem limite", () => {
  it("todos aparecem (o limite de 3 da faixa acabou): 4 Blocos são 4 avisos", () => {
    const lembretes = ["rangel", "mae", "lucas", "casal"].map((id) => atraso(id));
    const r = avisosDaCentral(lembretes, []);
    expect(referencias(r)).toEqual(["rangel", "mae", "lucas", "casal"]);
    expect(r.naoLidos).toBe(4);
    expect(r.blocosAtrasados).toBe(4);
  });

  it("120 Blocos: nada é cortado", () => {
    const lembretes = Array.from({ length: 120 }, (_, i) => atraso(`b-${i}`));
    const r = avisosDaCentral(lembretes, []);
    expect(r.avisos).toHaveLength(120);
    expect(r.naoLidos).toBe(120);
    expect(r.chavesNaoLidas).toHaveLength(120);
  });

  it("o resumo conta os Blocos atrasados, lidos ou não, e não conta o fechamento", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto")];
    const r = avisosDaCentral(lembretes, [lido(lembretes[1])]);
    expect(r.blocosAtrasados).toBe(2);
    expect(avisosDaCentral([fechamento()], []).blocosAtrasados).toBe(0);
  });

  it("lembretes com a mesma chave valem um só (a chave é única no banco)", () => {
    const r = avisosDaCentral([atraso("ana"), atraso("ana", 5_000)], []);
    expect(r.avisos).toHaveLength(1);
    expect(r.chavesNaoLidas).toHaveLength(1);
    expect(r.blocosAtrasados).toBe(1);
  });
});

describe("avisosDaCentral: marcar tudo", () => {
  it("as chaves de 'Marcar tudo' são só as dos não lidos, na ordem da lista, sem repetir", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto"), atraso("caio")];
    const r = avisosDaCentral(lembretes, [lido(lembretes[2])]);
    expect(r.chavesNaoLidas).toEqual([lembretes[0], lembretes[1], lembretes[3]].map(chaveDeNotificacao));
  });

  it("gravar essas chaves zera o contador e mantém todos na lista, como lidos", () => {
    const lembretes = [fechamento(), atraso("ana"), atraso("beto")];
    const antes = avisosDaCentral(lembretes, []);
    const depois = avisosDaCentral(lembretes, antes.chavesNaoLidas);
    expect(depois.naoLidos).toBe(0);
    expect(depois.avisos.every((a) => a.lido)).toBe(true);
    expect(depois.avisos).toHaveLength(3);
  });

  it("marcar tudo de novo não tem o que gravar", () => {
    const lembretes = [atraso("ana")];
    expect(avisosDaCentral(lembretes, lembretes.map(lido)).chavesNaoLidas).toEqual([]);
  });

  it("um atraso novo depois de marcar tudo volta a contar", () => {
    const lembretes = [atraso("ana")];
    const lidos = avisosDaCentral(lembretes, []).chavesNaoLidas;
    expect(avisosDaCentral([...lembretes, atraso("beto")], lidos).naoLidos).toBe(1);
  });
});

// ---------------------------------------------- a Central amarrada ao lembrete do dia (lembretesDasLinhas)

const NAO_PAGO = "s-nao";
const PAGO = "s-pago";
const blocoDb = (id: string, nome: string, responsavel: string, ordem = 1) => ({
  id,
  nome,
  formula: { tipo: "responsavel", id: responsavel },
  ordem,
  de_cobranca: true,
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
function linhas(extra: Partial<LinhasParaLembretes> = {}): LinhasParaLembretes {
  return {
    ciclo: [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }],
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

describe("a Central com os lembretes do dia", () => {
  const central = (hoje: string, l: LinhasParaLembretes, lidos: ChaveLida[] = []) =>
    avisosDaCentral(lembretesDasLinhas(hoje, l), lidos);

  it("o dia da virada: o atraso novo é não lido e a lista sai do vazio", () => {
    const l = linhas({ lancamentos: [lanc("l1", "lucas", { valor_centavos: 11_516 })] });
    expect(central("2026-11-16", l).avisos).toEqual([]);
    const r = central("2026-11-17", l);
    expect(r.naoLidos).toBe(1);
    expect(textoDoLembrete(r.avisos[0].lembrete)).toBe(`Lucas: ${formatarDinheiro(11_516)} em atraso desde 17/11/26`);
  });

  it("atraso que continua e já foi lido fica lido nos dias seguintes", () => {
    const l = linhas({ lancamentos: [lanc("l1", "lucas")] });
    const lidos = central("2026-11-17", l).chavesNaoLidas;
    for (const hoje of ["2026-11-18", "2026-11-25", "2026-12-20"]) {
      expect(central(hoje, l, lidos).naoLidos).toBe(0);
      expect(central(hoje, l, lidos).avisos).toHaveLength(1);
    }
  });

  it("quitou e atrasou de novo (outro item, outro vencimento): volta como não lido", () => {
    const novembro = lanc("l1", "lucas", { mes: "2026-11" });
    const lidos = central("2026-11-20", linhas({ lancamentos: [novembro] })).chavesNaoLidas;
    // Novembro quitado: some.
    const quitado = linhas({ lancamentos: [{ ...novembro, status_id: PAGO }] });
    expect(central("2026-12-10", quitado, lidos).avisos).toEqual([]);
    // Dezembro atrasa (vence 06/12 + 10 de tolerância + 1 = 17/12).
    const dezembro = linhas({
      faturas: [...linhas().faturas, { mes: "2026-12", vencimento: "2026-12-06" }],
      lancamentos: [{ ...novembro, status_id: PAGO }, lanc("l2", "lucas", { mes: "2026-12" })],
    });
    const r = central("2026-12-17", dezembro, lidos);
    expect(r.naoLidos).toBe(1);
    expect(r.avisos[0].chave).toEqual({ tipo: "atraso", referencia: "b-lucas", dia: "2026-12-17" });
  });

  it("pagou o mais antigo e outro segue atrasado: o 'desde' mudou, volta como não lido", () => {
    const outubro = lanc("l1", "lucas", { mes: "2026-10" });
    const novembro = lanc("l2", "lucas", { mes: "2026-11" });
    const antes = central("2026-11-20", linhas({ lancamentos: [outubro, novembro] }));
    expect(antes.avisos[0].chave.dia).toBe("2026-10-17");
    const lidos = antes.chavesNaoLidas;
    const depois = central("2026-11-20", linhas({ lancamentos: [{ ...outubro, status_id: PAGO }, novembro] }), lidos);
    expect(depois.avisos[0].chave.dia).toBe("2026-11-17");
    expect(depois.naoLidos).toBe(1);
  });

  it("tipo desligado: não aparece, não conta e não entra em 'Marcar tudo'", () => {
    const base = linhas({
      faturas: [{ mes: "2026-10", vencimento: "2026-10-06" }],
      lancamentos: [lanc("l1", "lucas", { mes: "2026-10" })],
    });
    const ligados = central("2026-10-28", base);
    expect(ligados.avisos.map((a) => a.chave.tipo)).toEqual(["fechamento", "atraso"]);
    const semAtraso = central("2026-10-28", { ...base, configuracao: { lembrete_atraso: false } });
    expect(semAtraso.avisos.map((a) => a.chave.tipo)).toEqual(["fechamento"]);
    expect(semAtraso.blocosAtrasados).toBe(0);
    const semFechamento = central("2026-10-28", { ...base, configuracao: { lembrete_fechamento: false } });
    expect(semFechamento.avisos.map((a) => a.chave.tipo)).toEqual(["atraso"]);
    const nenhum = central("2026-10-28", { ...base, configuracao: { lembrete_fechamento: false, lembrete_atraso: false } });
    expect(nenhum).toEqual({ avisos: [], naoLidos: 0, chavesNaoLidas: [], blocosAtrasados: 0 });
  });

  it("os 4 Blocos da tela do Rafael aparecem, com nome e valor, e o texto não erra o gênero", () => {
    const blocos = [
      blocoDb("b-rangel", "Rangel", "rangel", 1),
      blocoDb("b-mae", "Mãe", "mae", 2),
      blocoDb("b-lucas", "Lucas", "lucas", 3),
      blocoDb("b-casal", "Casal", "casal", 4),
    ];
    const l = linhas({
      blocos,
      lancamentos: [
        lanc("l1", "rangel", { mes: "2026-10", valor_centavos: 526_347 }),
        lanc("l2", "mae", { mes: "2026-10", valor_centavos: 178_373 }),
        lanc("l3", "lucas", { mes: "2026-10", valor_centavos: 11_516 }),
        lanc("l4", "casal", { mes: "2026-10", valor_centavos: 5_000 }),
      ],
    });
    const r = central("2026-11-19", l);
    expect(r.avisos).toHaveLength(4);
    expect(r.blocosAtrasados).toBe(4);
    const textos = r.avisos.map((a) => textoDoLembrete(a.lembrete).replace(/ /g, " "));
    expect(textos).toEqual([
      "Rangel: R$ 5.263,47 em atraso desde 17/10/26",
      "Mãe: R$ 1.783,73 em atraso desde 17/10/26",
      "Lucas: R$ 115,16 em atraso desde 17/10/26",
      "Casal: R$ 50,00 em atraso desde 17/10/26",
    ]);
    expect(textos.some((t) => /^O /.test(t))).toBe(false);
  });
});

describe("os textos da Central", () => {
  it("o contador: o número, '99+' acima de 99 e o nome falado", () => {
    expect(LIMITE_DO_CONTADOR_DE_AVISOS).toBe(99);
    expect(textoDoContadorDeAvisos(1)).toBe("1");
    expect(textoDoContadorDeAvisos(99)).toBe("99");
    expect(textoDoContadorDeAvisos(100)).toBe("99+");
    expect(nomeDoContadorDeAvisos(1)).toBe("1 não lido");
    expect(nomeDoContadorDeAvisos(3)).toBe("3 não lidos");
    expect(nomeDoContadorDeAvisos(99)).toBe("99 não lidos");
    expect(nomeDoContadorDeAvisos(100)).toBe("mais de 99 não lidos");
  });

  it("o resumo do topo", () => {
    expect(rotuloDeAvisosNovos(0)).toBe("Nenhum aviso novo");
    expect(rotuloDeAvisosNovos(1)).toBe("1 aviso novo");
    expect(rotuloDeAvisosNovos(3)).toBe("3 avisos novos");
    expect(rotuloResumoDeAtrasos(1)).toBe("1 Bloco com itens atrasados");
    expect(rotuloResumoDeAtrasos(4)).toBe("4 Blocos com itens atrasados");
  });

  it("os rótulos da tela", () => {
    expect(TEXTOS_AVISOS).toMatchObject({
      marcar_um: "Marcar como lido",
      marcar_tudo: "Marcar tudo como lido",
      estado_novo: "Novo",
      estado_lido: "Lido",
      vazio: "Nenhum aviso",
      todos_lidos: "Todos os avisos foram marcados como lidos",
    });
  });
});
