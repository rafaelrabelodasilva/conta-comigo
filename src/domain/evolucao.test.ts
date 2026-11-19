import { describe, expect, it } from "vitest";
import { resumirBloco } from "./blocos";
import { idsDosPrevistos, projetarPainel } from "./projecoes";
import {
  MESES_DA_EVOLUCAO,
  MINIMO_DA_EVOLUCAO,
  mesesDaEvolucao,
  projetarEvolucao,
  projetarPrevisao,
  type Agrupamento,
  type LancamentoParaPrever,
} from "./previsao";
import type { Responsavel } from "./responsaveis";
import type { Tipo } from "./tipos";
import { tituloDaEvolucao } from "./mensagens";

// Evolução dos últimos Meses (História 7.2, FR-33). Hoje é 19/11/26: o Mês atual é 2026-11. Casos: 0, 1, 2, 5, 6 e 7 Meses
// importados, a ordem, o buraco entre Meses, o Mês futuro com Fatura, Divisão, excluído, crédito, sem Responsável,
// arquivado, por Tipo, a escala própria e o total de cada Mês igual ao Bloco "Todos" do Painel daquele Mês.

const ATUAL = "2026-11";

const RAFAEL: Responsavel = { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false };
const CASAL: Responsavel = { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false };
const ANTIGA: Responsavel = { id: "r-antiga", nome: "Antiga", cor: 4, ordem: 4, arquivado: true };
const RESPONSAVEIS = [CASAL, RAFAEL, ANTIGA];

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
    lancado_por: "fatura",
    conta_manual_id: null,
    vencimento_combinado: null,
    nome: "COMPRA",
    apelido: null,
    serie_id: null,
    parcela_n: null,
    parcela_total: null,
    ...extra,
  };
}

function evoluir(
  linhas: LancamentoParaPrever[],
  mesesComFatura: string[],
  agrupamento: Agrupamento = "responsavel",
  mesAtual = ATUAL,
) {
  return projetarEvolucao(linhas, { mesAtual, mesesComFatura, agrupamento, responsaveis: RESPONSAVEIS, tipos: TIPOS });
}

const MAIO_A_NOV = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

describe("mesesDaEvolucao: quais Meses entram", () => {
  it("são os 6 mais novos com Fatura, em ordem crescente (7 importados: o mais antigo sai)", () => {
    expect(mesesDaEvolucao(ATUAL, MAIO_A_NOV)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(MESES_DA_EVOLUCAO).toBe(6);
  });

  it("não depende da ordem em que as Faturas chegam, nem de Fatura repetida", () => {
    expect(mesesDaEvolucao(ATUAL, ["2026-11", "2026-09", "2026-10", "2026-09"])).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("o Mês atual entra quando já tem Fatura e não entra quando não tem", () => {
    expect(mesesDaEvolucao(ATUAL, ["2026-09", "2026-10", "2026-11"])).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(mesesDaEvolucao(ATUAL, ["2026-08", "2026-09", "2026-10"])).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("um Mês futuro com Fatura adiantada é da Previsão e não entra (cada Mês aparece em uma aba só)", () => {
    expect(mesesDaEvolucao(ATUAL, ["2026-10", "2026-11", "2026-12", "2027-01"])).toEqual(["2026-10", "2026-11"]);
    const futuro = projetarPrevisao([lanc("2026-12", 5000)], { mesAtual: ATUAL, mesesComFatura: ["2026-12"], agrupamento: "responsavel", responsaveis: RESPONSAVEIS, tipos: TIPOS });
    expect(futuro.meses[0].mes).toBe("2026-12");
    expect(futuro.meses[0].temFatura).toBe(true);
  });

  it("buraco entre Meses: só os importados, na ordem (Jan e Mar, sem Fev)", () => {
    expect(mesesDaEvolucao("2027-03", ["2027-01", "2027-03"])).toEqual(["2027-01", "2027-03"]);
  });

  it("vira o ano na ordem", () => {
    expect(mesesDaEvolucao("2027-02", ["2026-12", "2027-01", "2027-02"])).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("projetarEvolucao: quantos Meses importados", () => {
  const unidade = (mes: string) => lanc(mes, 10000);

  it("0 Meses importados: indisponível, sem Meses nem grupos", () => {
    const e = evoluir([unidade("2026-10")], []);
    expect(e.disponivel).toBe(false);
    expect(e.importados).toBe(0);
    expect(e.meses).toEqual([]);
    expect(e.grupos).toEqual([]);
    expect(e.maiorBarraCentavos).toBe(0);
  });

  it("1 Mês importado: indisponível (o mínimo é 2), mesmo com Lançamentos nele", () => {
    const e = evoluir([unidade("2026-10")], ["2026-10"]);
    expect(MINIMO_DA_EVOLUCAO).toBe(2);
    expect(e.disponivel).toBe(false);
    expect(e.importados).toBe(1);
    expect(e.meses).toEqual([]);
  });

  it("2 Meses importados: já desenha os dois", () => {
    const e = evoluir([unidade("2026-09"), unidade("2026-10")], ["2026-09", "2026-10"]);
    expect(e.disponivel).toBe(true);
    expect(e.meses.map((m) => m.mes)).toEqual(["2026-09", "2026-10"]);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual([10000, 10000]);
  });

  it("5 Meses importados: mostra os 5", () => {
    const meses = MAIO_A_NOV.slice(2);
    const e = evoluir(meses.map(unidade), meses);
    expect(e.meses).toHaveLength(5);
    expect(e.importados).toBe(5);
  });

  it("6 Meses importados: mostra os 6", () => {
    const meses = MAIO_A_NOV.slice(1);
    const e = evoluir(meses.map(unidade), meses);
    expect(e.meses.map((m) => m.mes)).toEqual(meses);
  });

  it("7 Meses importados: mostra os 6 mais novos e diz que há 7", () => {
    const e = evoluir(MAIO_A_NOV.map(unidade), MAIO_A_NOV);
    expect(e.meses.map((m) => m.mes)).toEqual(MAIO_A_NOV.slice(1));
    expect(e.importados).toBe(7);
  });

  it("o Mês futuro com Fatura não conta para o mínimo", () => {
    const e = evoluir([unidade("2026-10"), unidade("2026-12")], ["2026-10", "2026-12"]);
    expect(e.disponivel).toBe(false);
    expect(e.importados).toBe(1);
  });

  it("todo Mês mostrado leva temFatura", () => {
    const e = evoluir([unidade("2026-09"), unidade("2026-10")], ["2026-09", "2026-10"]);
    expect(e.meses.every((m) => m.temFatura)).toBe(true);
  });
});

describe("projetarEvolucao: o buraco entre Meses", () => {
  const dois = (a: string, b: string) => [lanc(a, 100), lanc(b, 200)];

  it("Jan e Mar, sem Fev: só os dois, e o aviso de que há buraco", () => {
    const e = evoluir(dois("2027-01", "2027-03"), ["2027-01", "2027-03"], "responsavel", "2027-03");
    expect(e.meses.map((m) => m.mes)).toEqual(["2027-01", "2027-03"]);
    expect(e.temBuraco).toBe(true);
  });

  it("Meses seguidos (mesmo virando o ano): sem buraco", () => {
    const e = evoluir(dois("2026-12", "2027-01"), ["2026-12", "2027-01"], "responsavel", "2027-01");
    expect(e.temBuraco).toBe(false);
  });

  it("um Mês sem Fatura no meio dos mostrados é buraco; o Mês sem Fatura antes dos mostrados não é", () => {
    const meses = ["2026-07", "2026-09", "2026-10", "2026-11"];
    const e = evoluir(meses.map((m) => lanc(m, 100)), meses);
    expect(e.temBuraco).toBe(true);
    const so = ["2026-09", "2026-10", "2026-11"];
    expect(evoluir(so.map((m) => lanc(m, 100)), so).temBuraco).toBe(false);
  });
});

describe("projetarEvolucao: o valor de cada Mês", () => {
  const M = ["2026-09", "2026-10"];

  it("o Mês sem Lançamentos mas com Fatura entra com R$ 0,00 (e a barra é zero)", () => {
    const e = evoluir([lanc("2026-10", 500)], M);
    expect(e.disponivel).toBe(true);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual([0, 500]);
    expect(e.meses[0].quantidade).toBe(0);
  });

  it("nenhuma linha em nenhum Mês: os Meses entram com zero, sem grupos", () => {
    const e = evoluir([], M);
    expect(e.disponivel).toBe(true);
    expect(e.grupos).toEqual([]);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual([0, 0]);
    expect(e.maiorBarraCentavos).toBe(0);
  });

  it("soma por Responsável, Mês a Mês, na ordem do cadastro", () => {
    const e = evoluir(
      [lanc("2026-09", 1000), lanc("2026-09", 3000, { responsavel_id: CASAL.id }), lanc("2026-10", 2000), lanc("2026-10", 4000, { responsavel_id: CASAL.id })],
      M,
    );
    expect(e.grupos.map((g) => g.nome)).toEqual(["Rafael", "Casal"]);
    expect(e.grupos.find((g) => g.chave === RAFAEL.id)!.porMes).toEqual([1000, 2000]);
    expect(e.grupos.find((g) => g.chave === CASAL.id)!.porMes).toEqual([3000, 4000]);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual([4000, 6000]);
  });

  it("Mês de outro tempo não entra: só as linhas dos Meses mostrados", () => {
    const e = evoluir([lanc("2026-08", 9999), lanc("2026-09", 100), lanc("2026-10", 200), lanc("2026-12", 7777)], M);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual([100, 200]);
  });

  it("a mãe dividida nunca soma: valem as filhas, cada uma no seu Responsável", () => {
    const mae = lanc("2026-10", 10001, { responsavel_id: null, divisao: { partes: [] } });
    const e = evoluir(
      [mae, lanc("2026-10", 5001, { dividido_de_id: mae.id }), lanc("2026-10", 5000, { dividido_de_id: mae.id, responsavel_id: CASAL.id })],
      M,
    );
    expect(e.meses[1].totalCentavos).toBe(10001);
    expect(e.meses[1].quantidade).toBe(2);
    expect(e.grupos.find((g) => g.chave === CASAL.id)!.porMes[1]).toBe(5000);
  });

  it("a linha excluída nunca entra", () => {
    const e = evoluir([lanc("2026-10", 5000, { excluido_em: "2026-11-02T10:00:00Z" }), lanc("2026-10", 700)], M);
    expect(e.meses[1].totalCentavos).toBe(700);
    expect(e.meses[1].quantidade).toBe(1);
  });

  it("o Ajuste de centavos entra como o Painel o soma", () => {
    const parcela = lanc("2026-10", 114074);
    expect(evoluir([parcela, lanc("2026-10", -8, { ajuste_de_id: parcela.id })], M).meses[1].totalCentavos).toBe(114066);
  });

  it("o crédito entra com o sinal; a barra soma só o positivo", () => {
    const e = evoluir([lanc("2026-10", 10000), lanc("2026-10", -3000, { responsavel_id: CASAL.id })], M);
    expect(e.meses[1].totalCentavos).toBe(7000);
    expect(e.meses[1].barraCentavos).toBe(10000);
    expect(e.grupos.find((g) => g.chave === CASAL.id)!.porMes[1]).toBe(-3000);
  });

  it("o Mês com o previsto que ficou sem par soma o que o Painel soma (e a Conta manual e a linha à mão)", () => {
    const e = evoluir(
      [
        lanc("2026-10", 100000),
        lanc("2026-10", 114074, { lancado_por: "sistema", serie_id: "s1", parcela_n: 2, parcela_total: 12 }),
        lanc("2026-10", 31800, { lancado_por: "manual", conta_manual_id: "c1" }),
        lanc("2026-10", 1500, { lancado_por: "manual" }),
      ],
      M,
    );
    expect(e.meses[1].totalCentavos).toBe(100000 + 114074 + 31800 + 1500);
  });

  it("centavos inteiros: somar não arredonda nada (AD-2)", () => {
    expect(evoluir([lanc("2026-10", 33), lanc("2026-10", 33), lanc("2026-10", 34)], M).meses[1].totalCentavos).toBe(100);
  });

  it("a escala é da aba: a maior barra é a maior dos Meses mostrados", () => {
    const e = evoluir([lanc("2026-09", 1000), lanc("2026-10", 4000), lanc("2027-02", 999999)], M);
    expect(e.maiorBarraCentavos).toBe(4000);
  });
});

describe("projetarEvolucao: o agrupamento", () => {
  const M = ["2026-09", "2026-10"];

  it("por Responsável: arquivado depois e 'Sem responsável' no fim, só quem tem linha", () => {
    const e = evoluir(
      [
        lanc("2026-10", 100, { responsavel_id: null }),
        lanc("2026-10", 200, { responsavel_id: ANTIGA.id }),
        lanc("2026-10", 400, { responsavel_id: RAFAEL.id }),
      ],
      M,
    );
    expect(e.grupos.map((g) => g.nome)).toEqual(["Rafael", "Antiga", "Sem responsável"]);
    expect(e.grupos[1].arquivado).toBe(true);
    expect(e.grupos[2].cor).toBeNull();
    expect(e.grupos[0].cor).toBe(1);
    expect(e.meses[1].totalCentavos).toBe(700);
  });

  it("por Tipo: alfabético, arquivado depois, 'Sem tipo' no fim; as cores alternam; mesmo total", () => {
    const linhas = [
      lanc("2026-10", 100, { tipo_id: null }),
      lanc("2026-10", 200, { tipo_id: VELHO.id }),
      lanc("2026-10", 300, { tipo_id: CASA.id }),
      lanc("2026-10", 400, { tipo_id: BOBICAS.id }),
    ];
    const e = evoluir(linhas, M, "tipo");
    expect(e.agrupamento).toBe("tipo");
    expect(e.grupos.map((g) => g.nome)).toEqual(["Bobiças", "Casa", "Antigo", "Sem tipo"]);
    expect(e.grupos.map((g) => g.cor)).toEqual([1, 2, 3, null]);
    expect(e.meses.map((m) => m.totalCentavos)).toEqual(evoluir(linhas, M, "responsavel").meses.map((m) => m.totalCentavos));
  });

  it("um Responsável fora do cadastro lido cai em 'Sem responsável' e o total não perde a linha", () => {
    const e = evoluir([lanc("2026-10", 500, { responsavel_id: "r-fantasma" })], M);
    expect(e.grupos.map((g) => g.nome)).toEqual(["Sem responsável"]);
    expect(e.meses[1].totalCentavos).toBe(500);
  });

  it("os mesmos grupos e a mesma ordem da Previsão para as mesmas linhas", () => {
    const linhas = [
      lanc("2026-12", 100, { responsavel_id: null }),
      lanc("2026-12", 200, { responsavel_id: ANTIGA.id }),
      lanc("2026-12", 400, { responsavel_id: CASAL.id }),
      lanc("2026-10", 100, { responsavel_id: null }),
      lanc("2026-10", 200, { responsavel_id: ANTIGA.id }),
      lanc("2026-10", 400, { responsavel_id: CASAL.id }),
    ];
    const prev = projetarPrevisao(linhas, { mesAtual: ATUAL, mesesComFatura: [], agrupamento: "responsavel", responsaveis: RESPONSAVEIS, tipos: TIPOS });
    const evol = evoluir(linhas, M);
    expect(evol.grupos.map((g) => [g.nome, g.cor, g.arquivado])).toEqual(prev.grupos.map((g) => [g.nome, g.cor, g.arquivado]));
  });
});

describe("a Evolução e o Painel: uma só projeção (AD-11)", () => {
  it("o total de cada Mês é o valor do Bloco 'Todos' do Painel daquele Mês", () => {
    const mae = lanc("2026-10", 10001, { responsavel_id: null, divisao: { partes: [] } });
    const parcela = lanc("2026-09", 114074);
    const linhas = [
      parcela,
      lanc("2026-09", -8, { ajuste_de_id: parcela.id }),
      lanc("2026-09", 31800, { lancado_por: "manual", conta_manual_id: "c1", responsavel_id: CASAL.id }),
      lanc("2026-09", -2500, { responsavel_id: null, tipo_id: null }),
      lanc("2026-09", 9999, { excluido_em: "2026-10-01T00:00:00Z" }),
      mae,
      lanc("2026-10", 5001, { dividido_de_id: mae.id }),
      lanc("2026-10", 5000, { dividido_de_id: mae.id, responsavel_id: CASAL.id }),
      lanc("2026-11", 0),
      lanc("2026-11", 77700, { lancado_por: "sistema", serie_id: "s1", parcela_n: 3, parcela_total: 12 }),
    ];
    for (const agrupamento of ["responsavel", "tipo"] as const) {
      const e = evoluir(linhas, ["2026-09", "2026-10", "2026-11"], agrupamento);
      expect(e.meses.map((m) => m.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
      for (const m of e.meses) {
        const painel = resumirBloco({ id: "todos", formula: { tipo: "todos" } }, projetarPainel(linhas, m.mes), idsDosPrevistos(linhas, m.mes, true));
        expect(m.totalCentavos).toBe(painel.valorCentavos);
      }
    }
  });

  it("a soma dos grupos de cada Mês é o total do Mês", () => {
    const linhas = [lanc("2026-09", 100), lanc("2026-09", 250, { responsavel_id: CASAL.id }), lanc("2026-10", -40, { responsavel_id: null })];
    const e = evoluir(linhas, ["2026-09", "2026-10"]);
    e.meses.forEach((m, i) => expect(e.grupos.reduce((s, g) => s + g.porMes[i], 0)).toBe(m.totalCentavos));
  });
});

describe("tituloDaEvolucao", () => {
  it("diz 'Últimos 6 meses' quando há 6 e 'Os N meses' quando há menos", () => {
    expect(tituloDaEvolucao(6)).toBe("Últimos 6 meses com Fatura importada");
    expect(tituloDaEvolucao(3)).toBe("Os 3 meses com Fatura importada");
    expect(tituloDaEvolucao(2)).toBe("Os 2 meses com Fatura importada");
  });
});
