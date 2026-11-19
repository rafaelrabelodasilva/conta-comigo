import { describe, expect, it } from "vitest";
import { resumirBloco, type Bloco } from "./blocos";
import { avaliar, validarFormula, type Formula, type No } from "./formula";
import { TEXTOS_PREVISAO } from "./mensagens";
import {
  TIPO_SEM_TIPO_NO_ENDERECO,
  acharMeuBloco,
  enderecoDoPainelPorTipo,
  lerTipoDoEndereco,
  mesesComLancamentos,
  mesesDoMeuGasto,
  projetarMeuGasto,
  type BarraDoMeuGasto,
  type LancamentoParaMeuGasto,
  type MeuGastoDoMes,
} from "./meu-gasto";
import { idsDosPrevistos, projetarPainel } from "./projecoes";
import type { Tipo } from "./tipos";

// Meu gasto por Tipo (História 7.3, FR-31). Hoje é 19/11/26. Casos: sem "meu Bloco"; Fórmula "Rafael"; "Rafael + (Casal ÷ 2)";
// Mês vazio; 1 Tipo; vários Tipos; "Sem tipo"; Tipo arquivado; crédito; Divisão; excluído; previsto; valor fixo; Fórmula que
// não calcula; ordem e desempate; porcentagem; e, o principal, a soma das barras igual ao valor do Bloco nos casos de borda
// do arredondamento (meio centavo, negativos, vários Tipos empatados no resto) e num conjunto de Fórmulas e Lançamentos
// sorteados (sempre os mesmos, por semente fixa). O valor do Bloco é o do `resumirBloco` do Painel daquele Mês.

const RAFAEL = "r-rafael";
const CASAL = "r-casal";
const ANTIGA = "r-antiga";

const CASA: Tipo = { id: "t-casa", nome: "Casa", arquivado: false };
const BOBICAS: Tipo = { id: "t-bobicas", nome: "Bobiças", arquivado: false };
const SAUDE: Tipo = { id: "t-saude", nome: "Saúde", arquivado: false };
const VELHO: Tipo = { id: "t-velho", nome: "Antigo", arquivado: true };
const TIPOS = [CASA, VELHO, BOBICAS, SAUDE];

const MES = "2026-10";

let n = 0;
function lanc(valor: number, extra: Partial<LancamentoParaMeuGasto> = {}): LancamentoParaMeuGasto {
  return {
    id: `l${++n}`,
    mes: MES,
    excluido_em: null,
    valor_centavos: valor,
    responsavel_id: RAFAEL,
    tipo_id: CASA.id,
    dividido_de_id: null,
    divisao: null,
    ajuste_de_id: null,
    lancado_por: "fatura",
    conta_manual_id: null,
    vencimento_combinado: null,
    ...extra,
  };
}

const operando = (responsavel: string): No => ({ tipo: "responsavel", id: responsavel });
const numero = (valor: string): No => ({ tipo: "numero", valor });
const soma = (esquerda: No, direita: No): No => ({ tipo: "operacao", operacao: "soma", esquerda, direita });
const dividir = (esquerda: No, direita: No): No => ({ tipo: "operacao", operacao: "divisao", esquerda, direita });
const grupo = (interno: No): No => ({ tipo: "grupo", interno });

/** "Rafael" */
const SO_RAFAEL: Formula = operando(RAFAEL);
/** "Rafael + (Casal ÷ 2)" */
const RAFAEL_E_METADE: Formula = soma(operando(RAFAEL), grupo(dividir(operando(CASAL), numero("2"))));
/** "Casal ÷ 2" */
const METADE_DO_CASAL: Formula = dividir(operando(CASAL), numero("2"));

function bloco(formula: Formula, extra: Partial<Bloco> = {}): Bloco {
  return { id: "b-meu", nome: "Meu", formula, ordem: 1, de_cobranca: false, meu_bloco: true, ...extra };
}

type Ok = Extract<MeuGastoDoMes, { estado: "ok" }>;

function meuGasto(
  linhas: LancamentoParaMeuGasto[],
  formula: Formula = RAFAEL_E_METADE,
  extra: { mes?: string; tipos?: Tipo[]; mesesComFatura?: string[]; blocos?: Bloco[] } = {},
): MeuGastoDoMes {
  return projetarMeuGasto(linhas, {
    mes: extra.mes ?? MES,
    blocos: extra.blocos ?? [bloco(formula)],
    tipos: extra.tipos ?? TIPOS,
    mesesComFatura: extra.mesesComFatura ?? [MES],
  });
}

function ok(resultado: MeuGastoDoMes): Ok {
  expect(resultado.estado).toBe("ok");
  return resultado as Ok;
}

const nomes = (barras: BarraDoMeuGasto[]) => barras.map((b) => b.nome);
const valores = (barras: BarraDoMeuGasto[]) => barras.map((b) => b.centavos);
const somaDasBarras = (barras: BarraDoMeuGasto[]) => barras.reduce((s, b) => s + b.centavos, 0);

describe("sem 'meu Bloco'", () => {
  it("nenhum Bloco no cadastro", () => {
    expect(meuGasto([lanc(1000)], SO_RAFAEL, { blocos: [] })).toEqual({ estado: "sem_bloco" });
  });

  it("há Blocos, mas nenhum marcado 'É o meu Bloco'", () => {
    const r = meuGasto([lanc(1000)], SO_RAFAEL, { blocos: [bloco(SO_RAFAEL, { meu_bloco: false })] });
    expect(r).toEqual({ estado: "sem_bloco" });
  });

  it("com mais de um marcado (não deveria existir), vale o de menor ordem", () => {
    const a = bloco(SO_RAFAEL, { id: "b-a", nome: "A", ordem: 5 });
    const b = bloco(operando(CASAL), { id: "b-b", nome: "B", ordem: 2 });
    expect(acharMeuBloco([a, b])?.id).toBe("b-b");
    const r = ok(meuGasto([lanc(1000), lanc(500, { responsavel_id: CASAL })], SO_RAFAEL, { blocos: [a, b] }));
    expect(r.bloco.id).toBe("b-b");
    expect(r.totalCentavos).toBe(500);
  });
});

describe("Fórmula 'Rafael'", () => {
  it("reparte por Tipo, do maior para o menor, com o valor e a %", () => {
    const r = ok(
      meuGasto(
        [
          lanc(10000, { tipo_id: CASA.id }),
          lanc(2500, { tipo_id: CASA.id }),
          lanc(5000, { tipo_id: BOBICAS.id }),
          lanc(7500, { tipo_id: SAUDE.id }),
          lanc(99900, { responsavel_id: CASAL, tipo_id: SAUDE.id }), // não entra: não é do Rafael
        ],
        SO_RAFAEL,
      ),
    );
    expect(r.totalCentavos).toBe(25000);
    expect(r.barras.map((b) => [b.nome, b.centavos, b.percentual])).toEqual([
      ["Casa", 12500, 50],
      ["Saúde", 7500, 30],
      ["Bobiças", 5000, 20],
    ]);
    expect(r.maiorBarraCentavos).toBe(12500);
    expect(r.mesVazio).toBe(false);
    expect(r.incluiPrevistos).toBe(false);
  });

  it("um só Tipo: uma barra de 100%", () => {
    const r = ok(meuGasto([lanc(4000), lanc(1000)], SO_RAFAEL));
    expect(r.barras).toEqual([
      { chave: CASA.id, natureza: "tipo", tipoId: CASA.id, nome: "Casa", arquivado: false, centavos: 5000, percentual: 100 },
    ]);
  });

  it("o tipo de bloco e a fórmula voltam para a tela escrever 'pelo meu Bloco'", () => {
    const r = ok(meuGasto([lanc(100)], SO_RAFAEL));
    expect(r.bloco).toEqual({ id: "b-meu", nome: "Meu", formula: SO_RAFAEL });
  });
});

describe("Fórmula 'Rafael + (Casal ÷ 2)'", () => {
  it("soma a parte do Rafael e a metade do Casal em cada Tipo", () => {
    const r = ok(
      meuGasto([
        lanc(10000, { tipo_id: CASA.id }),
        lanc(5000, { responsavel_id: CASAL, tipo_id: CASA.id }),
        lanc(8000, { responsavel_id: CASAL, tipo_id: BOBICAS.id }),
        lanc(3000, { tipo_id: SAUDE.id }),
      ]),
    );
    // Casa 10000 + 2500, Bobiças 4000, Saúde 3000.
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([
      ["Casa", 12500],
      ["Bobiças", 4000],
      ["Saúde", 3000],
    ]);
    expect(r.totalCentavos).toBe(19500);
    expect(somaDasBarras(r.barras)).toBe(r.totalCentavos);
  });

  it("os números de outubro: o Casal ÷ 2 de R$ 5.639,35 (R$ 2.819,675) fecha em R$ 2.819,68", () => {
    const r = ok(meuGasto([lanc(563935, { responsavel_id: CASAL })], METADE_DO_CASAL));
    expect(r.totalCentavos).toBe(281968);
    expect(valores(r.barras)).toEqual([281968]);
  });
});

describe("arredondamento (AD-2): a soma das barras é o valor do Bloco", () => {
  it("o caso que quebra o arredondamento de cada Tipo: 125,505 e 25,505 dariam 151,02, e o Bloco vale 151,01", () => {
    const r = ok(
      meuGasto([
        lanc(10000, { tipo_id: CASA.id }),
        lanc(5101, { responsavel_id: CASAL, tipo_id: CASA.id }),
        lanc(5101, { responsavel_id: CASAL, tipo_id: BOBICAS.id }),
      ]),
    );
    expect(r.totalCentavos).toBe(15101);
    // 12550,5 e 2550,5 centavos, restos iguais: o centavo que falta vai ao maior valor exato (Casa).
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([
      ["Casa", 12551],
      ["Bobiças", 2550],
    ]);
    expect(somaDasBarras(r.barras)).toBe(15101);
  });

  it("meio centavo em dois Tipos (1 + 1 de Casal ÷ 2): o Bloco vale R$ 0,01 e só uma barra o recebe, pela ordem dos nomes", () => {
    const linhas = [lanc(1, { responsavel_id: CASAL, tipo_id: CASA.id }), lanc(1, { responsavel_id: CASAL, tipo_id: BOBICAS.id })];
    const r = ok(meuGasto(linhas, METADE_DO_CASAL));
    expect(r.totalCentavos).toBe(1);
    expect(r.barras.map((b) => [b.nome, b.centavos, b.percentual])).toEqual([["Bobiças", 1, 100]]);
  });

  it("negativos: -1 e -1 de Casal ÷ 2 dão -R$ 0,01 no Bloco, em uma barra só", () => {
    const linhas = [lanc(-1, { responsavel_id: CASAL, tipo_id: CASA.id }), lanc(-1, { responsavel_id: CASAL, tipo_id: BOBICAS.id })];
    const r = ok(meuGasto(linhas, METADE_DO_CASAL));
    expect(r.totalCentavos).toBe(-1);
    expect(valores(r.barras)).toEqual([-1]);
    expect(r.barras[0].percentual).toBeNull();
    expect(somaDasBarras(r.barras)).toBe(-1);
  });

  it("um Tipo positivo e um negativo de meio centavo (+1 e -1): o Bloco vale R$ 0,00 e a soma das barras também", () => {
    const linhas = [lanc(1, { responsavel_id: CASAL, tipo_id: CASA.id }), lanc(-1, { responsavel_id: CASAL, tipo_id: BOBICAS.id })];
    const r = ok(meuGasto(linhas, METADE_DO_CASAL));
    expect(r.totalCentavos).toBe(0);
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([
      ["Casa", 1],
      ["Bobiças", -1],
    ]);
    expect(somaDasBarras(r.barras)).toBe(0);
    expect(r.barras.every((b) => b.percentual === null)).toBe(true);
  });

  it("quatro Tipos empatados no resto (1 centavo de Casal ÷ 2 em cada): o Bloco vale R$ 0,02, e ficam os dois primeiros pelo nome", () => {
    const tipos: Tipo[] = ["Dani", "Ana", "Cris", "Bia"].map((nome) => ({ id: `t-${nome}`, nome, arquivado: false }));
    const linhas = tipos.map((t) => lanc(1, { responsavel_id: CASAL, tipo_id: t.id }));
    const r = ok(meuGasto(linhas, METADE_DO_CASAL, { tipos }));
    expect(r.totalCentavos).toBe(2);
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([
      ["Ana", 1],
      ["Bia", 1],
    ]);
    // A ordem em que as linhas e os Tipos chegam não muda nada.
    const outra = ok(meuGasto([...linhas].reverse(), METADE_DO_CASAL, { tipos: [...tipos].reverse() }));
    expect(outra).toEqual(r);
  });

  it("oito Tipos de valor ímpar em Casal ÷ 2 (50,5 centavos cada): 4 recebem 51 e 4 recebem 50, nenhuma passa de 1 centavo do exato", () => {
    const tipos: Tipo[] = Array.from({ length: 8 }, (_, i) => ({ id: `t-${i}`, nome: `Tipo ${i + 1}`, arquivado: false }));
    const linhas = tipos.map((t) => lanc(101, { responsavel_id: CASAL, tipo_id: t.id }));
    const r = ok(meuGasto(linhas, METADE_DO_CASAL, { tipos }));
    expect(r.totalCentavos).toBe(404);
    expect(somaDasBarras(r.barras)).toBe(404);
    expect(valores(r.barras)).toEqual([51, 51, 51, 51, 50, 50, 50, 50]);
    expect(nomes(r.barras)).toEqual(["Tipo 1", "Tipo 2", "Tipo 3", "Tipo 4", "Tipo 5", "Tipo 6", "Tipo 7", "Tipo 8"]);
  });

  it("restos diferentes: o centavo que falta vai ao maior resto (Casal ÷ 3 com 2 e 1 centavos)", () => {
    const tres: Formula = dividir(operando(CASAL), numero("3"));
    const r = ok(
      meuGasto([lanc(2, { responsavel_id: CASAL, tipo_id: CASA.id }), lanc(1, { responsavel_id: CASAL, tipo_id: BOBICAS.id })], tres),
    );
    // 2/3 e 1/3: o Bloco vale 1 centavo e o resto maior é o do Casa.
    expect(r.totalCentavos).toBe(1);
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([["Casa", 1]]);
  });

  it("três Tipos de 1/3 de centavo: um centavo no total, pelo nome", () => {
    const tres: Formula = dividir(operando(CASAL), numero("3"));
    const linhas = [CASA, BOBICAS, SAUDE].map((t) => lanc(1, { responsavel_id: CASAL, tipo_id: t.id }));
    const r = ok(meuGasto(linhas, tres));
    expect(r.totalCentavos).toBe(1);
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([["Bobiças", 1]]);
  });

  it("o centavo que falta vai ao maior resto, não ao maior valor: Casa 5000,0 e Bobiças 0,5 dão 5000 + 1", () => {
    const r = ok(
      meuGasto([lanc(10000, { responsavel_id: CASAL, tipo_id: CASA.id }), lanc(1, { responsavel_id: CASAL, tipo_id: BOBICAS.id })], METADE_DO_CASAL),
    );
    expect(r.totalCentavos).toBe(5001); // 5000,5 arredonda para 5001
    expect(r.barras.map((b) => [b.nome, b.centavos])).toEqual([
      ["Casa", 5000],
      ["Bobiças", 1],
    ]);
  });
});

describe("a soma das barras é sempre o valor do Bloco (Fórmulas e Lançamentos sorteados)", () => {
  // Gerador com semente fixa (mulberry32): os mesmos casos em toda rodada.
  function sorteador(semente: number) {
    let s = semente >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NUMEROS = ["2", "3", "0,5", "1,25", "7", "100", "1,5"];
  const RESPONSAVEIS = [RAFAEL, CASAL, ANTIGA, "r-fantasma"];

  function formulaSorteada(sorte: () => number, profundidade: number): No {
    const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(sorte() * lista.length)];
    const folha = (): No => {
      const tipo = Math.floor(sorte() * 4);
      if (tipo === 0) return { tipo: "responsavel", id: escolher(RESPONSAVEIS) };
      if (tipo === 1) return { tipo: "tipo", id: escolher([CASA.id, BOBICAS.id, VELHO.id, "t-fantasma"]) };
      if (tipo === 2) return { tipo: "responsavel_em_tipo", responsavel_id: escolher(RESPONSAVEIS), tipo_id: escolher([CASA.id, SAUDE.id]) };
      return { tipo: "todos" };
    };
    if (profundidade === 0) return folha();
    const interna = () => formulaSorteada(sorte, profundidade - 1);
    switch (Math.floor(sorte() * 7)) {
      case 0:
        return soma(interna(), interna());
      case 1:
        return { tipo: "operacao", operacao: "subtracao", esquerda: interna(), direita: interna() };
      case 2:
        return { tipo: "operacao", operacao: "multiplicacao", esquerda: interna(), direita: numero(escolher(NUMEROS)) };
      case 3:
        return { tipo: "operacao", operacao: "multiplicacao", esquerda: numero(escolher(NUMEROS)), direita: interna() };
      case 4:
        return dividir(interna(), numero(escolher(NUMEROS)));
      case 5:
        return soma(interna(), numero(escolher(NUMEROS)));
      default:
        return grupo(interna());
    }
  }

  function linhasSorteadas(sorte: () => number): LancamentoParaMeuGasto[] {
    const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(sorte() * lista.length)];
    return Array.from({ length: 24 }, () =>
      lanc(Math.floor(sorte() * 60001) - 20000, {
        responsavel_id: escolher([...RESPONSAVEIS, null]),
        tipo_id: escolher([CASA.id, BOBICAS.id, SAUDE.id, VELHO.id, null, "t-fantasma"]),
        excluido_em: sorte() < 0.1 ? "2026-11-01T00:00:00Z" : null,
      }),
    );
  }

  it("600 Fórmulas e Lançamentos sorteados: soma = Bloco do Painel, % soma 100, ordem do maior ao menor, mesma saída em outra ordem", () => {
    const sorte = sorteador(73);
    let reparticoes = 0;
    for (let caso = 0; caso < 600; caso++) {
      const formula = formulaSorteada(sorte, 1 + Math.floor(sorte() * 3));
      if (!validarFormula(formula).ok) continue;
      const linhas = linhasSorteadas(sorte);
      const resultado = meuGasto(linhas, formula);
      expect(resultado.estado, `caso ${caso}`).toBe("ok");
      const r = resultado as Ok;

      const noPainel = resumirBloco(bloco(formula), projetarPainel(linhas, MES), new Set()).valorCentavos;
      expect(r.totalCentavos, `caso ${caso}`).toBe(noPainel);
      expect(somaDasBarras(r.barras), `caso ${caso}`).toBe(noPainel);
      if (r.totalCentavos > 0 && r.barras.length > 0) {
        expect(r.barras.reduce((s, b) => s + (b.percentual ?? 0), 0), `caso ${caso}`).toBe(100);
      } else {
        expect(r.barras.every((b) => b.percentual === null)).toBe(true);
      }
      const dosTipos = r.barras.filter((b) => b.natureza !== "fixo");
      for (let i = 1; i < dosTipos.length; i++) expect(dosTipos[i - 1].centavos).toBeGreaterThanOrEqual(dosTipos[i].centavos);
      if (r.barras.some((b) => b.natureza === "fixo")) expect(r.barras.at(-1)?.natureza).toBe("fixo");
      expect(r.barras.every((b) => b.centavos !== 0)).toBe(true);

      // Cada barra de Tipo está a no máximo 2 centavos do que a Fórmula daria só com as linhas daquele Tipo (menos a parte fixa).
      const projecao = projetarPainel(linhas, MES);
      const fixo = (avaliar(formula, []) as { ok: true; valor: { valorCentavos: number } }).valor.valorCentavos;
      for (const b of r.barras.filter((x) => x.natureza === "tipo")) {
        const doTipo = projecao.filter((l) => l.tipo_id === b.tipoId);
        const sozinho = (avaliar(formula, doTipo) as { ok: true; valor: { valorCentavos: number } }).valor.valorCentavos - fixo;
        expect(Math.abs(b.centavos - sozinho), `caso ${caso} ${b.nome}`).toBeLessThanOrEqual(2);
      }

      const outraOrdem = meuGasto([...linhas].reverse(), formula, { tipos: [...TIPOS].reverse() });
      expect(outraOrdem, `caso ${caso}`).toEqual(r);
      reparticoes += 1;
    }
    expect(reparticoes).toBeGreaterThan(500);
  });
});

describe("Mês vazio e Mês sem gasto do Bloco", () => {
  it("Mês sem Lançamento: ok, sem barras, 'mesVazio'", () => {
    const r = ok(meuGasto([lanc(1000, { mes: "2026-09" })], SO_RAFAEL));
    expect(r).toMatchObject({ totalCentavos: 0, barras: [], mesVazio: true, maiorBarraCentavos: 0 });
  });

  it("Mês com Lançamentos, mas nenhum que a Fórmula soma: sem barras e sem 'mesVazio'", () => {
    const r = ok(meuGasto([lanc(1000, { responsavel_id: CASAL })], SO_RAFAEL));
    expect(r).toMatchObject({ totalCentavos: 0, barras: [], mesVazio: false });
  });

  it("um Bloco que cita um Responsável arquivado ou que não existe mais não quebra: o arquivado soma, o que sumiu vale R$ 0,00", () => {
    const antiga = ok(meuGasto([lanc(700, { responsavel_id: ANTIGA })], operando(ANTIGA)));
    expect(valores(antiga.barras)).toEqual([700]);
    const fantasma = ok(meuGasto([lanc(700)], operando("r-fantasma")));
    expect(fantasma.barras).toEqual([]);
  });

  it("um Tipo cujas linhas se anulam (compra e estorno) não aparece", () => {
    const r = ok(meuGasto([lanc(500, { tipo_id: BOBICAS.id }), lanc(-500, { tipo_id: BOBICAS.id }), lanc(100)], SO_RAFAEL));
    expect(nomes(r.barras)).toEqual(["Casa"]);
  });
});

describe("Sem tipo, Tipo arquivado, crédito", () => {
  it("'Sem tipo' entra com o nome e sem id; uma linha com Tipo que o cadastro não tem cai nele também", () => {
    const r = ok(
      meuGasto([lanc(3000, { tipo_id: null }), lanc(2000, { tipo_id: "t-fantasma" }), lanc(1000)], SO_RAFAEL),
    );
    expect(r.barras.map((b) => [b.nome, b.centavos, b.natureza, b.tipoId])).toEqual([
      [TEXTOS_PREVISAO.sem_tipo, 5000, "sem_tipo", null],
      ["Casa", 1000, "tipo", CASA.id],
    ]);
    expect(somaDasBarras(r.barras)).toBe(r.totalCentavos);
  });

  it("Tipo arquivado continua aparecendo, marcado", () => {
    const r = ok(meuGasto([lanc(800, { tipo_id: VELHO.id }), lanc(100)], SO_RAFAEL));
    expect(r.barras.map((b) => [b.nome, b.arquivado])).toEqual([
      ["Antigo", true],
      ["Casa", false],
    ]);
  });

  it("crédito: o Tipo líquido negativo fica no fim, sem barra desenhável (maior = o maior positivo), com % negativa", () => {
    const r = ok(meuGasto([lanc(10000), lanc(-3000, { tipo_id: BOBICAS.id })], SO_RAFAEL));
    expect(r.totalCentavos).toBe(7000);
    expect(r.barras.map((b) => [b.nome, b.centavos, b.percentual])).toEqual([
      ["Casa", 10000, 143],
      ["Bobiças", -3000, -43],
    ]);
    expect(r.maiorBarraCentavos).toBe(10000);
  });

  it("crédito dentro do mesmo Tipo reduz o valor dele", () => {
    const r = ok(meuGasto([lanc(10000), lanc(-2500)], SO_RAFAEL));
    expect(valores(r.barras)).toEqual([7500]);
  });

  it("total zero ou negativo: sem porcentagem em nenhuma barra", () => {
    const zero = ok(meuGasto([lanc(100), lanc(-100, { tipo_id: BOBICAS.id })], SO_RAFAEL));
    expect(zero.totalCentavos).toBe(0);
    expect(zero.barras.map((b) => b.percentual)).toEqual([null, null]);
    const negativo = ok(meuGasto([lanc(-100)], SO_RAFAEL));
    expect(negativo.barras.map((b) => [b.centavos, b.percentual])).toEqual([[-100, null]]);
  });
});

describe("Divisão, excluído e previsto: as linhas são as do Painel", () => {
  it("a mãe dividida nunca soma; as filhas valem, cada uma com o Responsável dela", () => {
    const mae = lanc(10001, { id: "mae", responsavel_id: null, divisao: { modo: "valor", partes: [] } });
    const f1 = lanc(5001, { dividido_de_id: "mae", responsavel_id: RAFAEL });
    const f2 = lanc(5000, { dividido_de_id: "mae", responsavel_id: CASAL });
    const r = ok(meuGasto([mae, f1, f2]));
    // Rafael 50,01 + Casal 50,00 ÷ 2.
    expect(r.totalCentavos).toBe(7501);
    expect(valores(r.barras)).toEqual([7501]);
  });

  it("linha excluída nunca entra", () => {
    const r = ok(meuGasto([lanc(1000), lanc(9999, { excluido_em: "2026-11-02T10:00:00Z" })], SO_RAFAEL));
    expect(r.totalCentavos).toBe(1000);
  });

  it("só os Lançamentos do Mês escolhido entram", () => {
    const linhas = [lanc(1000), lanc(4000, { mes: "2026-11" })];
    expect(ok(meuGasto(linhas, SO_RAFAEL)).totalCentavos).toBe(1000);
    expect(ok(meuGasto(linhas, SO_RAFAEL, { mes: "2026-11" })).totalCentavos).toBe(4000);
  });

  it("previsto (Série do Cron) entra e o Mês diz 'inclui previstos'; no Mês de uma Fatura, a Conta manual deixa de ser previsto", () => {
    const sistema = lanc(2000, { lancado_por: "sistema", mes: "2026-12" });
    const conta = lanc(3000, { lancado_por: "manual", conta_manual_id: "c1", mes: "2026-12" });
    const semFatura = ok(meuGasto([sistema, conta], SO_RAFAEL, { mes: "2026-12", mesesComFatura: [MES] }));
    expect(semFatura.totalCentavos).toBe(5000);
    expect(semFatura.incluiPrevistos).toBe(true);

    const soConta = ok(meuGasto([conta], SO_RAFAEL, { mes: "2026-12", mesesComFatura: [MES] }));
    expect(soConta.incluiPrevistos).toBe(true);
    const comFatura = ok(meuGasto([conta], SO_RAFAEL, { mes: "2026-12", mesesComFatura: [MES, "2026-12"] }));
    expect(comFatura.totalCentavos).toBe(3000);
    expect(comFatura.incluiPrevistos).toBe(false);
  });

  it("um previsto que a Fórmula não soma não faz o Bloco 'incluir previstos'", () => {
    const previstoDoCasal = lanc(2000, { lancado_por: "sistema", responsavel_id: CASAL });
    expect(ok(meuGasto([previstoDoCasal, lanc(100)], SO_RAFAEL)).incluiPrevistos).toBe(false);
  });
});

describe("o valor é o do cartão do Bloco no Painel daquele Mês (AD-11)", () => {
  const sistema = lanc(2200, { lancado_por: "sistema", mes: "2026-12", responsavel_id: CASAL, tipo_id: BOBICAS.id });
  const conta = lanc(3333, { lancado_por: "manual", conta_manual_id: "c1", mes: "2026-12", responsavel_id: RAFAEL, tipo_id: SAUDE.id });
  const mae = lanc(10001, { id: "mae-pn", responsavel_id: null, divisao: { modo: "valor", partes: [] } });
  const linhas = [
    lanc(12345),
    lanc(-250, { tipo_id: SAUDE.id }),
    lanc(7777, { responsavel_id: CASAL, tipo_id: BOBICAS.id }),
    lanc(3, { responsavel_id: CASAL, tipo_id: null }),
    lanc(9999, { excluido_em: "2026-11-01T00:00:00Z" }),
    mae,
    lanc(5001, { dividido_de_id: "mae-pn", responsavel_id: RAFAEL, tipo_id: BOBICAS.id }),
    lanc(5000, { dividido_de_id: "mae-pn", responsavel_id: CASAL, tipo_id: BOBICAS.id }),
    sistema,
    conta,
  ];

  it.each([
    ["Mês de Fatura", "2026-10", ["2026-10"]],
    ["Mês sem Fatura (previstos)", "2026-12", ["2026-10"]],
    ["Mês vazio", "2027-03", ["2026-10"]],
  ])("%s", (_nome, mes, mesesComFatura) => {
    const doMes = linhas.map((l) => (l.mes === "2026-10" && mes !== "2026-10" ? { ...l } : l));
    for (const formula of [SO_RAFAEL, RAFAEL_E_METADE, METADE_DO_CASAL, soma(RAFAEL_E_METADE, numero("100"))]) {
      const r = ok(meuGasto(doMes, formula, { mes, mesesComFatura }));
      const painel = resumirBloco(
        bloco(formula),
        projetarPainel(doMes, mes),
        idsDosPrevistos(doMes, mes, mesesComFatura.includes(mes)),
      );
      expect(r.totalCentavos).toBe(painel.valorCentavos);
      expect(r.incluiPrevistos).toBe(painel.incluiPrevistos);
      expect(somaDasBarras(r.barras)).toBe(painel.valorCentavos);
    }
  });
});

describe("valor fixo da Fórmula", () => {
  const MAIS_CEM: Formula = soma(operando(RAFAEL), numero("100"));

  it("'Rafael + 100': a parte fixa vira a barra 'Valor fixo do Bloco', sempre por último, e a soma fecha", () => {
    const r = ok(meuGasto([lanc(2000, { tipo_id: CASA.id }), lanc(500, { tipo_id: BOBICAS.id })], MAIS_CEM));
    expect(r.totalCentavos).toBe(12500);
    expect(r.barras.map((b) => [b.nome, b.centavos, b.natureza, b.tipoId])).toEqual([
      ["Casa", 2000, "tipo", CASA.id],
      ["Bobiças", 500, "tipo", BOBICAS.id],
      [TEXTOS_PREVISAO.meu_gasto_fixo, 10000, "fixo", null],
    ]);
    expect(somaDasBarras(r.barras)).toBe(12500);
  });

  it("o valor fixo fica por último mesmo sendo o maior", () => {
    const r = ok(meuGasto([lanc(50)], MAIS_CEM));
    expect(r.barras.map((b) => b.natureza)).toEqual(["tipo", "fixo"]);
  });

  it("uma Fórmula só de número ('Valor fixo') é uma barra só, mesmo com o Mês vazio", () => {
    const r = ok(meuGasto([], numero("250")));
    expect(r.totalCentavos).toBe(25000);
    expect(r.barras.map((b) => [b.natureza, b.centavos, b.percentual])).toEqual([["fixo", 25000, 100]]);
    expect(r.mesVazio).toBe(true);
  });

  it("a parte fixa também passa pelo arredondamento: 'Casal ÷ 2 + 0,005' (meio centavo de fixo) não quebra a soma", () => {
    const f = soma(METADE_DO_CASAL, dividir(numero("1"), numero("200")));
    const r = ok(meuGasto([lanc(101, { responsavel_id: CASAL })], f));
    expect(somaDasBarras(r.barras)).toBe(r.totalCentavos);
  });
});

describe("Fórmula que não calcula", () => {
  it("R$ com R$ (Rafael × Casal): o Bloco 'não calcula', com o código da razão", () => {
    const quebrada: Formula = { tipo: "operacao", operacao: "multiplicacao", esquerda: operando(RAFAEL), direita: operando(CASAL) };
    const r = meuGasto([lanc(1000)], quebrada);
    expect(r).toEqual({
      estado: "sem_valor",
      bloco: { id: "b-meu", nome: "Meu", formula: quebrada },
      codigo: "formula.dinheiro_com_dinheiro",
    });
  });

  it("valor grande demais para os inteiros seguros", () => {
    const grande: Formula = { tipo: "operacao", operacao: "multiplicacao", esquerda: operando(RAFAEL), direita: numero("999999999") };
    const r = meuGasto([lanc(Number.MAX_SAFE_INTEGER / 4)], grande);
    expect(r.estado).toBe("sem_valor");
  });
});

describe("ordem e desempate", () => {
  it("do maior para o menor; o empate segue o nome (pt-BR, 'Bobiças' antes de 'Casa' e de 'Saúde')", () => {
    const r = ok(
      meuGasto(
        [lanc(500, { tipo_id: SAUDE.id }), lanc(500, { tipo_id: CASA.id }), lanc(500, { tipo_id: BOBICAS.id }), lanc(900, { tipo_id: VELHO.id })],
        SO_RAFAEL,
      ),
    );
    expect(nomes(r.barras)).toEqual(["Antigo", "Bobiças", "Casa", "Saúde"]);
  });

  it("'Sem tipo' fica depois dos Tipos quando o valor empata", () => {
    const r = ok(meuGasto([lanc(500, { tipo_id: null }), lanc(500, { tipo_id: SAUDE.id })], SO_RAFAEL));
    expect(nomes(r.barras)).toEqual(["Saúde", TEXTOS_PREVISAO.sem_tipo]);
  });

  it("'Sem tipo' maior que os Tipos vem na frente (a ordem é o valor)", () => {
    const r = ok(meuGasto([lanc(900, { tipo_id: null }), lanc(500)], SO_RAFAEL));
    expect(nomes(r.barras)).toEqual([TEXTOS_PREVISAO.sem_tipo, "Casa"]);
  });

  it("a mesma entrada dá a mesma saída, qualquer que seja a ordem das linhas", () => {
    const linhas = [lanc(500, { tipo_id: SAUDE.id }), lanc(500, { tipo_id: CASA.id }), lanc(301, { responsavel_id: CASAL, tipo_id: BOBICAS.id })];
    expect(meuGasto([...linhas].reverse())).toEqual(meuGasto(linhas));
  });
});

describe("porcentagem", () => {
  it("soma 100: oito Tipos iguais (12,5% cada) ficam 13, 13, 13, 13, 12, 12, 12, 12", () => {
    const tipos: Tipo[] = Array.from({ length: 8 }, (_, i) => ({ id: `t-${i}`, nome: `T${i + 1}`, arquivado: false }));
    const r = ok(meuGasto(tipos.map((t) => lanc(1000, { tipo_id: t.id })), SO_RAFAEL, { tipos }));
    expect(r.barras.map((b) => b.percentual)).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);
  });

  it("soma 100: um terço cada", () => {
    const r = ok(meuGasto([CASA, BOBICAS, SAUDE].map((t) => lanc(1000, { tipo_id: t.id })), SO_RAFAEL));
    expect(r.barras.map((b) => b.percentual)).toEqual([34, 33, 33]);
    expect(r.barras.reduce((s, b) => s + (b.percentual ?? 0), 0)).toBe(100);
  });

  it("uma fatia muito pequena aparece como 0%, e a soma continua 100", () => {
    const r = ok(meuGasto([lanc(100000), lanc(1, { tipo_id: BOBICAS.id })], SO_RAFAEL));
    expect(r.barras.map((b) => b.percentual)).toEqual([100, 0]);
  });
});

describe("endereço do Painel filtrado por Tipo", () => {
  const ID = "0f6f7f0e-2f4a-4c53-8d3a-9a1f6c2b7e10";

  it("monta /?mes=AAAA-MM&tipo=<id>, ou tipo=sem para 'Sem tipo'", () => {
    expect(enderecoDoPainelPorTipo("2026-10", ID)).toBe(`/?mes=2026-10&tipo=${ID}`);
    expect(enderecoDoPainelPorTipo("2026-10", null)).toBe(`/?mes=2026-10&tipo=${TIPO_SEM_TIPO_NO_ENDERECO}`);
  });

  it("lê um uuid, 'sem' e ignora o resto", () => {
    expect(lerTipoDoEndereco(ID)).toBe(ID);
    expect(lerTipoDoEndereco(ID.toUpperCase())).toBe(ID.toUpperCase());
    expect(lerTipoDoEndereco("sem")).toBeNull();
    expect(lerTipoDoEndereco(undefined)).toBeUndefined();
    expect(lerTipoDoEndereco("")).toBeUndefined();
    expect(lerTipoDoEndereco("casa")).toBeUndefined();
    expect(lerTipoDoEndereco("SEM")).toBeUndefined();
    expect(lerTipoDoEndereco(`${ID}x`)).toBeUndefined();
    expect(lerTipoDoEndereco("1; drop table")).toBeUndefined();
  });

  it("uma lista de valores vale pelo primeiro", () => {
    expect(lerTipoDoEndereco([ID, "sem"])).toBe(ID);
    expect(lerTipoDoEndereco(["sem", ID])).toBeNull();
    expect(lerTipoDoEndereco(["lixo", ID])).toBeUndefined();
    expect(lerTipoDoEndereco([])).toBeUndefined();
  });
});

describe("seletor de Mês da aba", () => {
  it("Meses com Lançamento (excluídos não contam), sem repetir, em ordem", () => {
    expect(
      mesesComLancamentos([
        { mes: "2026-10", excluido_em: null },
        { mes: "2026-08", excluido_em: null },
        { mes: "2026-10", excluido_em: null },
        { mes: "2026-01", excluido_em: "2026-02-01T00:00:00Z" },
      ]),
    ).toEqual(["2026-08", "2026-10"]);
  });

  it("vai do Mês mais antigo (Fatura ou Lançamento) até o Mês atual + 1", () => {
    expect(mesesDoMeuGasto("2026-11", ["2026-10"], ["2026-08", "2026-10"], "2026-11")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("sem Fatura nem Lançamento: o Mês atual e o seguinte", () => {
    expect(mesesDoMeuGasto("2026-11", [], [], "2026-11")).toEqual(["2026-11", "2026-12"]);
  });

  it("o Mês aberto entra mesmo fora do intervalo (as setas andam sem limite)", () => {
    expect(mesesDoMeuGasto("2026-11", [], [], "2027-03")).toEqual(["2026-11", "2026-12", "2027-03"]);
  });
});
