import { describe, expect, it } from "vitest";
import { avisosDaCentral, type ChaveLida, type OrigemDoAviso } from "./avisos";
import type { FaturaParaAviso } from "./avisos-conferencia";
import {
  PREFERENCIAS_DE_AVISOS_PADRAO,
  TIPOS_DE_AVISO_COM_INTERRUPTOR,
  avisosDeTrabalho,
  preferenciasDeAvisos,
  type PreferenciasDeAvisos,
} from "./avisos-preferencias";
import type { CartaoParaConferir, LancamentoParaConferir } from "./conferencia";
import {
  PREFERENCIAS_DE_LEMBRETES_PADRAO,
  TIPOS_DE_LEMBRETE,
  lembretesDasLinhas,
  preferenciasDeLembretes,
  type Lembrete,
} from "./lembretes";
import { contarFila } from "./revisar";

// O interruptor dos avisos da Conferência e do Revisar (História 8.3, FR-55): o tipo desligado não aparece, não conta e
// não entra em "Marcar tudo", porque o filtro vale ANTES de `avisosDaCentral`. Não são lembretes: o Cron não os lê.

const LIGADOS: PreferenciasDeAvisos = { conferencia: true, revisar: true };
const SO_REVISAR: PreferenciasDeAvisos = { conferencia: false, revisar: true };
const SO_CONFERENCIA: PreferenciasDeAvisos = { conferencia: true, revisar: false };
const DESLIGADOS: PreferenciasDeAvisos = { conferencia: false, revisar: false };

/** Novembro com R$ 720,00 a menos do que a Fatura diz (R$ 1.000,00 lidos, R$ 280,00 gravados), no cartão 8673. */
const NOV: FaturaParaAviso & { updated_at: string } = {
  id: "f-2026-11",
  mes: "2026-11",
  total_despesas_centavos: 100_000,
  total_creditos_centavos: 0,
  fechamento: "2026-10-28",
  vencimento: "2026-11-06",
  alerta_dispensado_em: null,
  updated_at: "2026-11-18T12:00:00Z",
};
const CARTOES: CartaoParaConferir[] = [{ fatura_id: NOV.id, final: "8673", total_centavos: 100_000 }];
const LANCAMENTOS: LancamentoParaConferir[] = [
  { fatura_id: NOV.id, valor_centavos: 28_000, final_cartao: "8673", excluido_em: null },
];
const FILA = Array.from({ length: 17 }, () => ({
  excluido_em: null,
  ajuste_de_id: null,
  revisao_motivo: "sem_classificacao" as const,
}));

const FECHAMENTO: Lembrete = {
  tipo: "fechamento",
  referencia: "2026-12",
  mes: "2026-12",
  fechouEm: "2026-11-28",
  destino: "/?mes=2026-12",
};
const ATRASO_ANA: Lembrete = {
  tipo: "atraso",
  referencia: "b-ana",
  blocoId: "b-ana",
  blocoNome: "Ana",
  valorCentavos: 11_516,
  desde: "2026-10-17",
  destino: "/recebimentos",
};

const trabalho = (p: PreferenciasDeAvisos) => avisosDeTrabalho([NOV], CARTOES, LANCAMENTOS, FILA, p);
const tipos = (origens: readonly OrigemDoAviso[]) => origens.map((o) => o.tipo);

describe("preferenciasDeAvisos: o padrão e as colunas", () => {
  it("os dois tipos de aviso que têm interruptor, e o padrão é tudo ligado", () => {
    expect(TIPOS_DE_AVISO_COM_INTERRUPTOR).toEqual(["conferencia", "revisar"]);
    expect(PREFERENCIAS_DE_AVISOS_PADRAO).toEqual(LIGADOS);
  });

  it("sem linha, linha vazia ou coluna ausente (banco antes do db push): ligados", () => {
    expect(preferenciasDeAvisos(null)).toEqual(LIGADOS);
    expect(preferenciasDeAvisos(undefined)).toEqual(LIGADOS);
    expect(preferenciasDeAvisos({})).toEqual(LIGADOS);
    // Uma linha de `configuracoes` que só tem as colunas da 7.4 (o banco ainda sem a migração da 8.3).
    expect(preferenciasDeAvisos({ lembrete_fechamento: false, lembrete_atraso: false } as never)).toEqual(LIGADOS);
  });

  it("coluna nula vale ligado e false desliga só o tipo dela", () => {
    expect(preferenciasDeAvisos({ aviso_conferencia: null, aviso_revisar: null })).toEqual(LIGADOS);
    expect(preferenciasDeAvisos({ aviso_conferencia: false })).toEqual(SO_REVISAR);
    expect(preferenciasDeAvisos({ aviso_revisar: false })).toEqual(SO_CONFERENCIA);
    expect(preferenciasDeAvisos({ aviso_conferencia: false, aviso_revisar: false })).toEqual(DESLIGADOS);
    expect(preferenciasDeAvisos({ aviso_conferencia: true, aviso_revisar: true })).toEqual(LIGADOS);
  });
});

describe("avisosDeTrabalho: o filtro antes da Central", () => {
  it("ligados: a Conferência da Fatura e a fila do Revisar", () => {
    const r = trabalho(LIGADOS);
    expect(tipos(r)).toEqual(["conferencia", "revisar"]);
    expect(r[1]).toMatchObject({ tipo: "revisar", quantidade: 17 });
  });

  it("a Conferência desligada: só o Revisar", () => {
    expect(tipos(trabalho(SO_REVISAR))).toEqual(["revisar"]);
  });

  it("o Revisar desligado: só a Conferência", () => {
    expect(tipos(trabalho(SO_CONFERENCIA))).toEqual(["conferencia"]);
  });

  it("os dois desligados: nada", () => {
    expect(trabalho(DESLIGADOS)).toEqual([]);
  });

  it("não inventa aviso: sem diferença e sem fila, ligado não traz nada", () => {
    const bate: LancamentoParaConferir[] = [{ ...LANCAMENTOS[0], valor_centavos: 100_000 }];
    expect(avisosDeTrabalho([NOV], CARTOES, bate, [], LIGADOS)).toEqual([]);
  });

  it("o que o interruptor desliga é o aviso, não a fila: o contador 'para revisar' do menu é o mesmo", () => {
    expect(contarFila(FILA)).toBe(17);
    expect(tipos(trabalho(SO_CONFERENCIA))).not.toContain("revisar");
    // `contarFila` não conhece as preferências: o item Revisar do menu segue com o número de trabalho.
    expect(contarFila(FILA)).toBe(17);
  });

  it("mesma entrada, mesma saída, e a entrada não é alterada", () => {
    const entrada = [NOV, { ...NOV, id: "f-2026-10", mes: "2026-10" }];
    const antes = JSON.stringify([entrada, CARTOES, LANCAMENTOS, FILA]);
    const a = avisosDeTrabalho(entrada, CARTOES, LANCAMENTOS, FILA, LIGADOS);
    const b = avisosDeTrabalho(entrada, CARTOES, LANCAMENTOS, FILA, LIGADOS);
    expect(a).toEqual(b);
    expect(JSON.stringify([entrada, CARTOES, LANCAMENTOS, FILA])).toBe(antes);
  });
});

describe("a Central com os quatro tipos e os interruptores (o que a tela e o menu leem)", () => {
  const todas = (p: PreferenciasDeAvisos): OrigemDoAviso[] => [FECHAMENTO, ATRASO_ANA, ...trabalho(p)];

  it("os quatro ligados: Conferência, Revisar, fechamento e atraso, 4 não lidos e 4 chaves em 'Marcar tudo'", () => {
    const c = avisosDaCentral(todas(LIGADOS), []);
    expect(c.avisos.map((a) => a.origem.tipo)).toEqual(["conferencia", "revisar", "fechamento", "atraso"]);
    expect(c.naoLidos).toBe(4);
    expect(c.chavesNaoLidas.map((k) => k.tipo)).toEqual(["conferencia", "revisar", "fechamento", "atraso"]);
  });

  it("todas as combinações: o tipo desligado não aparece, não conta e não entra em 'Marcar tudo'", () => {
    const casos: [PreferenciasDeAvisos, string[]][] = [
      [LIGADOS, ["conferencia", "revisar", "fechamento", "atraso"]],
      [SO_REVISAR, ["revisar", "fechamento", "atraso"]],
      [SO_CONFERENCIA, ["conferencia", "fechamento", "atraso"]],
      [DESLIGADOS, ["fechamento", "atraso"]],
    ];
    for (const [prefs, esperados] of casos) {
      const c = avisosDaCentral(todas(prefs), []);
      expect(c.avisos.map((a) => a.origem.tipo), JSON.stringify(prefs)).toEqual(esperados);
      expect(c.naoLidos, JSON.stringify(prefs)).toBe(esperados.length);
      expect(c.chavesNaoLidas.map((k) => k.tipo), JSON.stringify(prefs)).toEqual(esperados);
      // O atraso é contado à parte e não depende dos dois interruptores novos.
      expect(c.blocosAtrasados).toBe(1);
    }
  });

  it("um lembrete desligado (7.4) continua valendo à parte: os dois grupos de interruptores não se misturam", () => {
    // O lembrete de fechamento desligado já não chega à Central (lembretesDoDia); o aviso da Conferência continua.
    const semFechamento: OrigemDoAviso[] = [ATRASO_ANA, ...trabalho(LIGADOS)];
    const c = avisosDaCentral(semFechamento, []);
    expect(c.avisos.map((a) => a.origem.tipo)).toEqual(["conferencia", "revisar", "atraso"]);
  });

  it("desligar e ligar de novo: o aviso lido continua lido (a chave é a mesma e a linha de avisos_lidos fica)", () => {
    const [conf, revisar] = trabalho(LIGADOS);
    const lidos: ChaveLida[] = [
      { tipo: "conferencia", referencia: conf.referencia, dia: conf.dia },
      { tipo: "revisar", referencia: revisar.referencia, dia: revisar.dia },
    ];
    const ligados = avisosDaCentral(trabalho(LIGADOS), lidos);
    expect(ligados.avisos.map((a) => a.lido)).toEqual([true, true]);
    // Desligado: some da lista e do contador (a linha lida segue no banco e não conta para nada).
    const desligados = avisosDaCentral(trabalho(DESLIGADOS), lidos);
    expect(desligados.avisos).toEqual([]);
    expect(desligados.naoLidos).toBe(0);
    // Religado: volta com o estado que a chave dá, lido continua lido.
    const religados = avisosDaCentral(trabalho(LIGADOS), lidos);
    expect(religados).toEqual(ligados);
    expect(religados.naoLidos).toBe(0);
  });

  it("desligar e ligar de novo: o aviso não lido continua não lido, e a diferença que mudou nesse meio tempo volta Nova", () => {
    const antes = avisosDaCentral(trabalho(LIGADOS), []);
    expect(antes.naoLidos).toBe(2);
    expect(avisosDaCentral(trabalho(DESLIGADOS), []).naoLidos).toBe(0);
    expect(avisosDaCentral(trabalho(LIGADOS), [])).toEqual(antes);
    // Com a Conferência lida e uma diferença nova (entrou um Lançamento): a chave é outra e o aviso volta como Novo.
    const [conf] = trabalho(LIGADOS);
    const lida: ChaveLida[] = [{ tipo: "conferencia", referencia: conf.referencia, dia: conf.dia }];
    const outraSoma: LancamentoParaConferir[] = [{ ...LANCAMENTOS[0], valor_centavos: 30_000 }];
    const depois = avisosDaCentral(avisosDeTrabalho([NOV], CARTOES, outraSoma, FILA, LIGADOS), lida);
    expect(depois.avisos.filter((a) => a.origem.tipo === "conferencia").map((a) => a.lido)).toEqual([false]);
  });

  it("mesma entrada, mesma saída (a ordem das origens e das chaves lidas não importa)", () => {
    const [conf] = trabalho(LIGADOS);
    const lidos: ChaveLida[] = [{ tipo: "conferencia", referencia: conf.referencia, dia: conf.dia }];
    const origens = todas(LIGADOS);
    const a = avisosDaCentral(origens, lidos);
    const b = avisosDaCentral([...origens].reverse().sort((x, y) => (x.tipo < y.tipo ? -1 : 1)), [...lidos].reverse());
    expect(b.avisos.map((x) => x.origem.tipo).sort()).toEqual(a.avisos.map((x) => x.origem.tipo).sort());
    expect(b.naoLidos).toBe(a.naoLidos);
  });
});

describe("não são lembretes: o Cron não os lê", () => {
  it("as preferências de lembretes continuam sendo só as duas, e as colunas novas não as mudam", () => {
    expect(TIPOS_DE_LEMBRETE).toEqual(["fechamento", "atraso"]);
    expect(Object.keys(PREFERENCIAS_DE_LEMBRETES_PADRAO)).toEqual(["fechamento", "atraso"]);
    const comAvisosDesligados = { aviso_conferencia: false, aviso_revisar: false };
    expect(preferenciasDeLembretes(comAvisosDesligados as never)).toEqual(PREFERENCIAS_DE_LEMBRETES_PADRAO);
  });

  it("lembretesDasLinhas (a função do Cron) dá os mesmos lembretes com os avisos ligados ou desligados", () => {
    const base = {
      ciclo: [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }],
      lancamentos: [],
      blocos: [],
      status: [],
      itens: [],
      faturas: [],
    };
    const hoje = "2026-11-29";
    const ligados = lembretesDasLinhas(hoje, { ...base, configuracao: { aviso_conferencia: true, aviso_revisar: true } as never });
    const desligados = lembretesDasLinhas(hoje, {
      ...base,
      configuracao: { aviso_conferencia: false, aviso_revisar: false } as never,
    });
    expect(ligados.length).toBeGreaterThan(0);
    expect(desligados).toEqual(ligados);
  });
});
