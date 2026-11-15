import { describe, expect, it } from "vitest";
import {
  arquivadosNaFormula,
  citacoesDaFormula,
  moverNaOrdem,
  planejarReordenar,
  resumirBloco,
  responsavelUnico,
} from "./blocos";
import type { Formula, LinhaDaFormula } from "./formula";
import { idsDosPrevistos, projetarPainel, type LancamentoParaProjetar } from "./projecoes";

// Blocos no Painel (História 4.2): o resumo do `block-card`, a bolinha, o aviso
// de cadastro arquivado e a ordem. Tudo puro.

const resp = (id: string): Formula => ({ tipo: "responsavel", id });
const tipo = (id: string): Formula => ({ tipo: "tipo", id });
const em = (responsavel_id: string, tipo_id: string): Formula => ({ tipo: "responsavel_em_tipo", responsavel_id, tipo_id });
const soma = (esquerda: Formula, direita: Formula): Formula => ({ tipo: "operacao", operacao: "soma", esquerda, direita });
const dividir = (esquerda: Formula, direita: Formula): Formula => ({ tipo: "operacao", operacao: "divisao", esquerda, direita });
const grupo = (interno: Formula): Formula => ({ tipo: "grupo", interno });
const dois: Formula = { tipo: "numero", valor: "2" };

const linhas: LinhaDaFormula[] = [
  { id: "a", valor_centavos: 10_000, responsavel_id: "casal", tipo_id: "casa" },
  { id: "b", valor_centavos: 5_000, responsavel_id: "rafael", tipo_id: "mercado" },
  { id: "p", valor_centavos: 2_500, responsavel_id: "rafael", tipo_id: "casa" },
];

describe("resumirBloco", () => {
  it("valor, avaliação e Responsável vêm de `avaliar`", () => {
    const r = resumirBloco({ id: "x", formula: soma(resp("rafael"), grupo(dividir(resp("casal"), dois))) }, linhas, new Set());
    expect(r.valorCentavos).toBe(5_000 + 2_500 + 5_000);
    expect(r.avaliacao?.valorCentavos).toBe(r.valorCentavos);
    expect(r.incluiPrevistos).toBe(false);
    // Duas pessoas: sem bolinha.
    expect(r.responsavelId).toBeNull();
  });

  it("um Responsável só: a bolinha dele", () => {
    const r = resumirBloco({ id: "x", formula: resp("rafael") }, linhas, new Set());
    expect(r.valorCentavos).toBe(7_500);
    expect(r.responsavelId).toBe("rafael");
  });

  it('"inclui previstos" só quando um previsto entra no Bloco', () => {
    const previstos = new Set(["p"]);
    expect(resumirBloco({ id: "x", formula: resp("rafael") }, linhas, previstos).incluiPrevistos).toBe(true);
    expect(resumirBloco({ id: "x", formula: resp("casal") }, linhas, previstos).incluiPrevistos).toBe(false);
    expect(resumirBloco({ id: "x", formula: { tipo: "todos" } }, linhas, previstos).incluiPrevistos).toBe(true);
  });

  it("sem Lançamentos, o valor é R$ 0,00 e nada é previsto", () => {
    const r = resumirBloco({ id: "x", formula: { tipo: "todos" } }, [], new Set());
    expect(r.valorCentavos).toBe(0);
    expect(r.incluiPrevistos).toBe(false);
  });

  it("valor fora dos inteiros seguros: sem valor, sem lançar", () => {
    const enorme: LinhaDaFormula[] = [{ id: "g", valor_centavos: Number.MAX_SAFE_INTEGER, responsavel_id: "r", tipo_id: null }];
    const mult: Formula = {
      tipo: "operacao",
      operacao: "multiplicacao",
      esquerda: resp("r"),
      direita: { tipo: "numero", valor: "999999999" },
    };
    const r = resumirBloco({ id: "x", formula: mult }, enorme, new Set());
    expect(r.valorCentavos).toBeNull();
    expect(r.avaliacao).toBeNull();
    expect(r.incluiPrevistos).toBe(false);
  });
});

describe("responsavelUnico", () => {
  it("Responsável, e Responsável em Tipo do mesmo, com contas e números", () => {
    expect(responsavelUnico(resp("r"))).toBe("r");
    expect(responsavelUnico(soma(resp("r"), em("r", "t")))).toBe("r");
    expect(responsavelUnico(grupo(dividir(resp("r"), dois)))).toBe("r");
    expect(responsavelUnico(em("r", "t"))).toBe("r");
  });

  it("duas pessoas, Tipo, Todos ou só número: nenhum", () => {
    expect(responsavelUnico(soma(resp("r"), resp("s")))).toBeNull();
    expect(responsavelUnico(soma(resp("r"), tipo("t")))).toBeNull();
    expect(responsavelUnico({ tipo: "todos" })).toBeNull();
    expect(responsavelUnico(tipo("t"))).toBeNull();
    expect(responsavelUnico(dois)).toBeNull();
  });
});

describe("citacoesDaFormula e arquivadosNaFormula", () => {
  const formula = soma(resp("r"), grupo(soma(em("r", "t"), tipo("u"))));

  it("lista cada cadastro uma vez", () => {
    expect(citacoesDaFormula(formula)).toEqual({ responsaveis: ["r"], tipos: ["t", "u"] });
  });

  it("os arquivados citados, pelo nome", () => {
    const responsaveis = [{ id: "r", nome: "Rangel", arquivado: true }];
    const tipos = [
      { id: "t", nome: "Casa", arquivado: false },
      { id: "u", nome: "Viagem", arquivado: true },
    ];
    expect(arquivadosNaFormula(formula, { responsaveis, tipos })).toEqual(["Rangel", "Viagem"]);
    expect(
      arquivadosNaFormula(formula, {
        responsaveis: [{ ...responsaveis[0], arquivado: false }],
        tipos: [tipos[0], { ...tipos[1], arquivado: false }],
      }),
    ).toEqual([]);
  });

  it("cadastro que nem existe mais não é 'arquivado'", () => {
    expect(arquivadosNaFormula(resp("sumiu"), { responsaveis: [], tipos: [] })).toEqual([]);
  });
});

describe("moverNaOrdem", () => {
  it("move um item e deixa os outros na ordem", () => {
    expect(moverNaOrdem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moverNaOrdem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("mesmo lugar ou fora da lista: a mesma ordem, em cópia", () => {
    const itens = ["a", "b"];
    expect(moverNaOrdem(itens, 1, 1)).toEqual(["a", "b"]);
    expect(moverNaOrdem(itens, -1, 0)).toEqual(["a", "b"]);
    expect(moverNaOrdem(itens, 0, 2)).toEqual(["a", "b"]);
    expect(moverNaOrdem(itens, 0, 1)).not.toBe(itens);
  });
});

describe("planejarReordenar", () => {
  const blocos = [
    { id: "a", ordem: 1 },
    { id: "b", ordem: 2 },
    { id: "c", ordem: 5 },
  ];

  it("ordens 1, 2, 3… na ordem nova", () => {
    expect(planejarReordenar(blocos, ["c", "a", "b"])).toEqual({
      ok: true,
      valor: {
        ids: ["c", "a", "b"],
        ordens: [
          { id: "c", ordem: 1 },
          { id: "a", ordem: 2 },
          { id: "b", ordem: 3 },
        ],
        mudou: true,
      },
    });
  });

  it("a mesma ordem não grava; numeração com buraco se conserta", () => {
    const certa = planejarReordenar(
      [
        { id: "a", ordem: 1 },
        { id: "b", ordem: 2 },
      ],
      ["a", "b"],
    );
    expect(certa.ok && certa.valor.mudou).toBe(false);
    // `c` valia 5 e passa a 3.
    const buraco = planejarReordenar(blocos, ["a", "b", "c"]);
    expect(buraco.ok && buraco.valor.mudou).toBe(true);
  });

  it("recusa Bloco repetido, faltando, sobrando ou desconhecido", () => {
    const recusa = { ok: false, erro: { codigo: "bloco.ordem_invalida" } };
    expect(planejarReordenar(blocos, ["a", "a", "b"])).toEqual(recusa);
    expect(planejarReordenar(blocos, ["a", "b"])).toEqual(recusa);
    expect(planejarReordenar(blocos, ["a", "b", "c", "d"])).toEqual(recusa);
    expect(planejarReordenar(blocos, ["a", "b", "z"])).toEqual(recusa);
  });
});

describe("idsDosPrevistos", () => {
  const base = (id: string, extra: Partial<LancamentoParaProjetar> = {}): LancamentoParaProjetar => ({
    id,
    mes: "2026-12",
    excluido_em: null,
    valor_centavos: 100,
    responsavel_id: "r",
    tipo_id: "t",
    ...extra,
  });

  it("os `sistema` do Mês, sem excluídos nem a mãe dividida; linha sem a coluna não é previsto", () => {
    const todas = [
      base("a", { lancado_por: "sistema" }),
      base("b", { lancado_por: "importacao" }),
      base("c"),
      base("d", { lancado_por: "sistema", excluido_em: "2026-12-01T00:00:00Z" }),
      base("e", { lancado_por: "sistema", mes: "2027-01" }),
      base("mae", { lancado_por: "sistema", divisao: { modo: "valor", partes: [] } }),
      base("filha", { lancado_por: "sistema", dividido_de_id: "mae" }),
    ];
    expect([...idsDosPrevistos(todas, "2026-12")].sort()).toEqual(["a", "filha"]);
    // Todo previsto é uma linha que a Fórmula também soma.
    const projecao = projetarPainel(todas, "2026-12").map((l) => l.id);
    for (const id of idsDosPrevistos(todas, "2026-12")) expect(projecao).toContain(id);
  });
});
