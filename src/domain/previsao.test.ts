import { describe, expect, it } from "vitest";
import { resumirBloco } from "./blocos";
import { somarMeses } from "./ciclo";
import { rotuloDaSerie, rotuloVerOutrasSeries } from "./mensagens";
import { idsDosPrevistos, projetarPainel } from "./projecoes";
import {
  MESES_DA_PREVISAO,
  lerAba,
  mesesDaPrevisao,
  projetarPrevisao,
  seriesEmAndamento,
  type Agrupamento,
  type LancamentoParaPrever,
} from "./previsao";
import type { Responsavel } from "./responsaveis";
import type { Tipo } from "./tipos";

// Previsão dos próximos Meses (História 7.1). Hoje é 19/11/26: o Mês atual é 2026-11 e a janela é Dez/26 a Mai/27.
// Casos: o Mês atual fora, previstos de Série, Conta manual materializada, Divisão, excluído, crédito, R$ 0,00, sem
// Responsável, arquivados, por Tipo, o Mês com Fatura, vazio, o desempate das Séries e o total igual ao do Painel.

const ATUAL = "2026-11";

// O dinheiro usa espaço não separável ("R$ 1.140,74"): os textos esperados comparam com espaço comum.
const sem = (t: string) => t.replace(/ /g, " ");

const RAFAEL: Responsavel = { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false };
const CASAL: Responsavel = { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false };
const LUCAS: Responsavel = { id: "r-lucas", nome: "Lucas", cor: 3, ordem: 3, arquivado: false };
const ANTIGA: Responsavel = { id: "r-antiga", nome: "Antiga", cor: 4, ordem: 4, arquivado: true };
const RESPONSAVEIS = [CASAL, RAFAEL, LUCAS, ANTIGA];

const CASA: Tipo = { id: "t-casa", nome: "Casa", arquivado: false };
const BOBICAS: Tipo = { id: "t-bobicas", nome: "Bobiças", arquivado: false };
const VELHO: Tipo = { id: "t-velho", nome: "Antigo", arquivado: true };
const TIPOS = [CASA, VELHO, BOBICAS];

let n = 0;
function lanc(mes: string, valor: number, extra: Partial<LancamentoParaPrever> = {}): LancamentoParaPrever {
  return {
    id: `l${++n}`,
    mes,
    excluido_em: null,
    valor_centavos: valor,
    responsavel_id: RAFAEL.id,
    tipo_id: CASA.id,
    dividido_de_id: null,
    divisao: null,
    ajuste_de_id: null,
    lancado_por: "sistema",
    conta_manual_id: null,
    vencimento_combinado: null,
    nome: "MSC CRUZEIROS",
    apelido: null,
    serie_id: null,
    parcela_n: null,
    parcela_total: null,
    ...extra,
  };
}

function prever(
  linhas: LancamentoParaPrever[],
  agrupamento: Agrupamento = "responsavel",
  mesesComFatura: string[] = [],
  responsaveis: Responsavel[] = RESPONSAVEIS,
) {
  return projetarPrevisao(linhas, { mesAtual: ATUAL, mesesComFatura, agrupamento, responsaveis, tipos: TIPOS });
}

describe("mesesDaPrevisao", () => {
  it("são os 6 Meses seguintes ao atual, sem o atual", () => {
    expect(mesesDaPrevisao("2026-11")).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]);
    expect(MESES_DA_PREVISAO).toBe(6);
  });

  it("vira o ano (o mockup, em outubro, vai de Nov/26 a Abr/27)", () => {
    expect(mesesDaPrevisao("2026-10")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });
});

describe("projetarPrevisao: o que entra em cada Mês", () => {
  it("soma os previstos de Série por Responsável, Mês a Mês", () => {
    const p = prever([
      lanc("2026-12", 114074),
      lanc("2026-12", 20000, { responsavel_id: CASAL.id }),
      lanc("2027-01", 114074),
    ]);
    expect(p.meses.map((m) => m.mes)).toEqual(mesesDaPrevisao(ATUAL));
    expect(p.grupos.map((g) => g.nome)).toEqual(["Rafael", "Casal"]);
    const rafael = p.grupos.find((g) => g.chave === RAFAEL.id)!;
    expect(rafael.porMes).toEqual([114074, 114074, 0, 0, 0, 0]);
    expect(rafael.totalCentavos).toBe(228148);
    expect(p.meses[0].totalCentavos).toBe(134074);
    expect(p.meses[1].totalCentavos).toBe(114074);
    expect(p.vazia).toBe(false);
  });

  it("o Mês atual e o sétimo Mês ficam de fora", () => {
    const p = prever([lanc("2026-11", 99999), lanc("2026-12", 100), lanc("2027-06", 88888)]);
    expect(p.meses.map((m) => m.totalCentavos)).toEqual([100, 0, 0, 0, 0, 0]);
  });

  it("meses anteriores ao atual não entram", () => {
    expect(prever([lanc("2026-10", 5000)]).vazia).toBe(true);
  });

  it("a Conta manual já materializada entra (Mês sem Fatura)", () => {
    const conta = lanc("2027-01", 31800, { lancado_por: "manual", conta_manual_id: "c1", nome: "Academia", tipo_id: BOBICAS.id });
    const p = prever([conta, lanc("2027-01", 10000)]);
    expect(p.meses[1].totalCentavos).toBe(41800);
  });

  it("a Conta e o previsto da Série do mesmo Mês somam cada um uma vez (nada é contado duas vezes)", () => {
    const linhas = [
      lanc("2026-12", 31800, { lancado_por: "manual", conta_manual_id: "c1" }),
      lanc("2026-12", 31800, { lancado_por: "sistema", serie_id: "s1", parcela_n: 2, parcela_total: 6 }),
    ];
    expect(prever(linhas).meses[0].totalCentavos).toBe(63600);
  });

  it("a linha excluída nunca entra (um previsto excluído, AD-16)", () => {
    const p = prever([lanc("2026-12", 5000, { excluido_em: "2026-11-10T10:00:00Z" }), lanc("2026-12", 700)]);
    expect(p.meses[0].totalCentavos).toBe(700);
    expect(p.meses[0].quantidade).toBe(1);
  });

  it("a mãe dividida nunca soma: valem as filhas", () => {
    const mae = lanc("2026-12", 10001, {
      responsavel_id: null,
      divisao: { partes: [{ responsavel_id: RAFAEL.id, fracao: "1/2" }, { responsavel_id: CASAL.id, fracao: "1/2" }] },
    });
    const filhaA = lanc("2026-12", 5001, { dividido_de_id: mae.id, responsavel_id: RAFAEL.id });
    const filhaB = lanc("2026-12", 5000, { dividido_de_id: mae.id, responsavel_id: CASAL.id });
    const p = prever([mae, filhaA, filhaB]);
    expect(p.meses[0].totalCentavos).toBe(10001);
    expect(p.meses[0].quantidade).toBe(2);
    expect(p.grupos.find((g) => g.chave === RAFAEL.id)!.porMes[0]).toBe(5001);
    expect(p.grupos.find((g) => g.chave === CASAL.id)!.porMes[0]).toBe(5000);
  });

  it("uma filha excluída sai e a mãe continua fora", () => {
    const mae = lanc("2026-12", 10000, { responsavel_id: null, divisao: { partes: [] } });
    const filhaA = lanc("2026-12", 5000, { dividido_de_id: mae.id });
    const filhaB = lanc("2026-12", 5000, { dividido_de_id: mae.id, responsavel_id: CASAL.id, excluido_em: "2026-11-10T10:00:00Z" });
    expect(prever([mae, filhaA, filhaB]).meses[0].totalCentavos).toBe(5000);
  });

  it("o Ajuste de centavos (linha própria do Mês) entra como o Painel o soma", () => {
    const parcela = lanc("2026-12", 114074);
    const ajuste = lanc("2026-12", -8, { ajuste_de_id: parcela.id, lancado_por: "fatura" });
    expect(prever([parcela, ajuste]).meses[0].totalCentavos).toBe(114066);
  });

  it("o crédito entra com o sinal e R$ 0,00 conta como linha sem mudar a soma", () => {
    const p = prever([lanc("2026-12", 10000), lanc("2026-12", -2500), lanc("2026-12", 0)]);
    expect(p.meses[0].totalCentavos).toBe(7500);
    expect(p.meses[0].quantidade).toBe(3);
  });

  it("a barra só soma os segmentos positivos; o total continua líquido", () => {
    const p = prever([lanc("2026-12", 10000), lanc("2026-12", -3000, { responsavel_id: CASAL.id })]);
    expect(p.meses[0].totalCentavos).toBe(7000);
    expect(p.meses[0].barraCentavos).toBe(10000);
    expect(p.maiorBarraCentavos).toBe(10000);
  });

  it("sem linhas nos 6 Meses a Previsão é vazia", () => {
    const p = prever([]);
    expect(p.vazia).toBe(true);
    expect(p.grupos).toEqual([]);
    expect(p.maiorBarraCentavos).toBe(0);
  });

  it("só linhas de R$ 0,00 não é vazia, mas a barra é zero", () => {
    const p = prever([lanc("2026-12", 0)]);
    expect(p.vazia).toBe(false);
    expect(p.maiorBarraCentavos).toBe(0);
  });

  it("marca o Mês que já tem Fatura, sem mudar a soma", () => {
    const linhas = [lanc("2026-12", 5000, { lancado_por: "fatura" })];
    const p = prever(linhas, "responsavel", ["2026-12", "2026-09"]);
    expect(p.meses[0].temFatura).toBe(true);
    expect(p.meses[1].temFatura).toBe(false);
    expect(p.meses[0].totalCentavos).toBe(5000);
  });

  it("soma centavos inteiros sem arredondar nada (AD-2)", () => {
    const p = prever([lanc("2026-12", 33), lanc("2026-12", 33), lanc("2026-12", 34)]);
    expect(p.meses[0].totalCentavos).toBe(100);
  });
});

describe("projetarPrevisao: o agrupamento", () => {
  it("por Responsável: na ordem do cadastro, só quem tem linha, arquivado depois e 'Sem responsável' no fim", () => {
    const p = prever([
      lanc("2026-12", 100, { responsavel_id: null }),
      lanc("2026-12", 200, { responsavel_id: ANTIGA.id }),
      lanc("2026-12", 300, { responsavel_id: LUCAS.id }),
      lanc("2026-12", 400, { responsavel_id: RAFAEL.id }),
    ]);
    expect(p.grupos.map((g) => g.nome)).toEqual(["Rafael", "Lucas", "Antiga", "Sem responsável"]);
    expect(p.grupos.find((g) => g.nome === "Antiga")!.arquivado).toBe(true);
    expect(p.grupos.find((g) => g.nome === "Sem responsável")!.cor).toBeNull();
    expect(p.grupos.find((g) => g.nome === "Rafael")!.cor).toBe(1);
    expect(p.meses[0].totalCentavos).toBe(1000);
  });

  it("por Tipo: alfabético, arquivado depois e 'Sem tipo' no fim; as cores alternam", () => {
    const p = prever(
      [
        lanc("2026-12", 100, { tipo_id: null }),
        lanc("2026-12", 200, { tipo_id: VELHO.id }),
        lanc("2026-12", 300, { tipo_id: CASA.id }),
        lanc("2026-12", 400, { tipo_id: BOBICAS.id }),
      ],
      "tipo",
    );
    expect(p.agrupamento).toBe("tipo");
    expect(p.grupos.map((g) => g.nome)).toEqual(["Bobiças", "Casa", "Antigo", "Sem tipo"]);
    expect(p.grupos.map((g) => g.cor)).toEqual([1, 2, 3, null]);
    expect(p.meses[0].totalCentavos).toBe(1000);
  });

  it("o total do Mês é o mesmo nos dois agrupamentos", () => {
    const linhas = [lanc("2026-12", 100, { responsavel_id: null, tipo_id: null }), lanc("2026-12", 250, { tipo_id: BOBICAS.id })];
    expect(prever(linhas, "responsavel").meses.map((m) => m.totalCentavos)).toEqual(prever(linhas, "tipo").meses.map((m) => m.totalCentavos));
  });

  it("um Responsável que não está no cadastro lido cai em 'Sem responsável' e o total não perde a linha", () => {
    const p = prever([lanc("2026-12", 500, { responsavel_id: "r-fantasma" })]);
    expect(p.grupos.map((g) => g.nome)).toEqual(["Sem responsável"]);
    expect(p.meses[0].totalCentavos).toBe(500);
  });

  it("com mais de 8 Tipos, as cores recomeçam (o nome vai na legenda e na tabela)", () => {
    const tipos: Tipo[] = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, nome: `Tipo ${i}`, arquivado: false }));
    const linhas = tipos.map((t) => lanc("2026-12", 100, { tipo_id: t.id }));
    const p = projetarPrevisao(linhas, { mesAtual: ATUAL, mesesComFatura: [], agrupamento: "tipo", responsaveis: [], tipos });
    expect(p.grupos.map((g) => g.cor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1]);
  });
});

describe("a Previsão e o Painel: uma só projeção (AD-11)", () => {
  it("o total de cada Mês futuro é o valor do Bloco 'Todos' do Painel desse Mês, com 'inclui previstos'", () => {
    const mae = lanc("2027-01", 10001, { responsavel_id: null, divisao: { partes: [] } });
    const linhas = [
      lanc("2026-12", 114074, { serie_id: "s1", parcela_n: 2, parcela_total: 12 }),
      lanc("2026-12", 31800, { lancado_por: "manual", conta_manual_id: "c1", responsavel_id: CASAL.id }),
      lanc("2026-12", -2500, { responsavel_id: null, tipo_id: null }),
      lanc("2026-12", 9999, { excluido_em: "2026-11-01T00:00:00Z" }),
      mae,
      lanc("2027-01", 5001, { dividido_de_id: mae.id, responsavel_id: RAFAEL.id }),
      lanc("2027-01", 5000, { dividido_de_id: mae.id, responsavel_id: CASAL.id }),
      lanc("2027-03", 0),
    ];
    for (const agrupamento of ["responsavel", "tipo"] as const) {
      const p = prever(linhas, agrupamento);
      for (const m of p.meses) {
        const painel = resumirBloco({ id: "todos", formula: { tipo: "todos" } }, projetarPainel(linhas, m.mes), idsDosPrevistos(linhas, m.mes, m.temFatura));
        expect(m.totalCentavos).toBe(painel.valorCentavos);
        if (m.mes === "2026-12") expect(painel.incluiPrevistos).toBe(true);
      }
    }
  });
});

describe("seriesEmAndamento", () => {
  const msc = (mes: string, parcela: number, extra: Partial<LancamentoParaPrever> = {}) =>
    lanc(mes, 114074, { serie_id: "s-msc", parcela_n: parcela, parcela_total: 12, ...extra });

  it("'MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses': a parcela do Mês atual e o que falta", () => {
    // nov/26 (real, 1/12) e dez/26 a out/27 (previstos 2/12 a 12/12).
    const linhas = [msc("2026-11", 1, { lancado_por: "fatura" })];
    const futuras = Array.from({ length: 11 }, (_, i) => msc(somarMeses("2026-12", i), 2 + i));
    const [serie] = seriesEmAndamento([...linhas, ...futuras], ATUAL);
    expect(serie).toMatchObject({ nome: "MSC CRUZEIROS", parcelaAtual: 1, parcelaTotal: 12, restantes: 11, menorCentavos: 114074, maiorCentavos: 114074, comecaEm: null });
    expect(sem(rotuloDaSerie(serie))).toBe("MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses");
  });

  it("o N vem do total da Série, não das linhas gravadas (Conta parcelada só tem 12 Meses gravados)", () => {
    const linhas = [
      lanc("2026-11", 5000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s-c", parcela_n: 3, parcela_total: 36 }),
      lanc("2026-12", 5000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s-c", parcela_n: 4, parcela_total: 36 }),
      lanc("2027-01", 5000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s-c", parcela_n: 5, parcela_total: 36 }),
    ];
    const [serie] = seriesEmAndamento(linhas, ATUAL);
    expect(serie.restantes).toBe(33);
    expect(sem(rotuloDaSerie(serie))).toBe("MSC CRUZEIROS 03/36 → R$ 50,00 por mais 33 meses");
  });

  it("a última parcela é a do Mês atual: nada falta e a Série não aparece", () => {
    expect(seriesEmAndamento([msc("2026-10", 11), msc("2026-11", 12)], ATUAL)).toEqual([]);
  });

  it("uma Série sem linha depois do Mês atual não aparece", () => {
    expect(seriesEmAndamento([msc("2026-10", 11)], ATUAL)).toEqual([]);
  });

  it("falta 1 Mês: 'por mais 1 mês'", () => {
    const [serie] = seriesEmAndamento([msc("2026-11", 11), msc("2026-12", 12)], ATUAL);
    expect(sem(rotuloDaSerie(serie))).toBe("MSC CRUZEIROS 11/12 → R$ 1.140,74 por mais 1 mês");
  });

  it("a Série que só começa depois do Mês atual diz quando começa", () => {
    const linhas = [1, 2, 3].map((p) =>
      lanc(`2027-0${p}`, 12000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s-nova", parcela_n: p, parcela_total: 3, nome: "Curso" }),
    );
    const [serie] = seriesEmAndamento(linhas, ATUAL);
    expect(serie).toMatchObject({ parcelaAtual: null, restantes: 3, comecaEm: "2027-01" });
    expect(sem(rotuloDaSerie(serie))).toBe("Curso → R$ 120,00 por 3 meses, a partir de Jan/27");
  });

  it("a Conta mensal sem fim não tem 'por mais N meses'", () => {
    const linhas = ["2026-11", "2026-12", "2027-01"].map((mes, i) =>
      lanc(mes, 25000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s-aluguel", parcela_n: 5 + i, parcela_total: null, nome: "Aluguel" }),
    );
    const [serie] = seriesEmAndamento(linhas, ATUAL);
    expect(serie).toMatchObject({ parcelaAtual: null, parcelaTotal: null, restantes: null, comecaEm: null });
    expect(sem(rotuloDaSerie(serie))).toBe("Aluguel → R$ 250,00 por mês, sem data para acabar");
  });

  it("a Conta mensal que só começa depois diz quando", () => {
    const [serie] = seriesEmAndamento(
      [lanc("2027-02", 25000, { lancado_por: "manual", conta_manual_id: "c", serie_id: "s", parcela_n: 1, parcela_total: null, nome: "Aluguel" })],
      ATUAL,
    );
    expect(sem(rotuloDaSerie(serie))).toBe("Aluguel → R$ 250,00 por mês, sem data para acabar, a partir de Fev/27");
  });

  it("o Valor que mudou no meio mostra o intervalo", () => {
    const [serie] = seriesEmAndamento([msc("2026-11", 1), msc("2026-12", 2), msc("2027-01", 3, { valor_centavos: 120000 })], ATUAL);
    expect(sem(rotuloDaSerie(serie))).toBe("MSC CRUZEIROS 01/12 → de R$ 1.140,74 a R$ 1.200,00 por mais 11 meses");
  });

  it("usa o Apelido quando há", () => {
    const [serie] = seriesEmAndamento([msc("2026-11", 1), msc("2026-12", 2, { apelido: "Cruzeiro" })], ATUAL);
    expect(serie.nome).toBe("Cruzeiro");
  });

  it("não usa linhas excluídas nem filhas de Divisão", () => {
    const mae = msc("2026-12", 2, { responsavel_id: null, divisao: { partes: [] } });
    const linhas = [
      msc("2026-11", 1),
      mae,
      msc("2026-12", 2, { dividido_de_id: mae.id, valor_centavos: 57037 }),
      msc("2027-01", 3, { excluido_em: "2026-11-02T00:00:00Z" }),
    ];
    const [serie] = seriesEmAndamento(linhas, ATUAL);
    expect(serie.menorCentavos).toBe(114074);
    expect(serie.maiorCentavos).toBe(114074);
  });

  it("linha sem Série ou sem parcela fica de fora", () => {
    expect(seriesEmAndamento([lanc("2026-12", 100), lanc("2026-12", 100, { serie_id: "s", parcela_n: null })], ATUAL)).toEqual([]);
  });

  it("ordena pelo maior Valor e depois pelo nome", () => {
    const serie = (id: string, nome: string, valor: number) =>
      lanc("2026-12", valor, { serie_id: id, parcela_n: 2, parcela_total: 6, nome });
    const ordem = seriesEmAndamento(
      [serie("a", "Zeta", 5000), serie("b", "Beta", 9000), serie("c", "Alfa", 5000)],
      ATUAL,
    ).map((s) => s.nome);
    expect(ordem).toEqual(["Beta", "Alfa", "Zeta"]);
  });
});

describe("rotuloVerOutrasSeries", () => {
  it("fala no singular e no plural", () => {
    expect(rotuloVerOutrasSeries(1)).toBe("Ver a outra série");
    expect(rotuloVerOutrasSeries(4)).toBe("Ver as outras 4 séries");
  });
});

describe("lerAba", () => {
  it("devolve a aba guardada e abre a primeira para qualquer outro valor", () => {
    expect(lerAba("evolucao")).toBe("evolucao");
    expect(lerAba("meu_gasto")).toBe("meu_gasto");
    for (const lixo of [null, undefined, "", "outra", 3, {}]) expect(lerAba(lixo)).toBe("proximos_meses");
  });
});
