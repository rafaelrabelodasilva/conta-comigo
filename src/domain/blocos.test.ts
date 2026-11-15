import { describe, expect, it } from "vitest";
import { lerBlocos, planejarSalvarBloco, proximaOrdemBloco, validarNomeBloco, type LinhaDoBloco } from "./blocos";
import type { Ficha } from "./formula";

const casal: Ficha = { tipo: "responsavel", id: "casal" };
const DIV: Ficha = { tipo: "operacao", operacao: "divisao" };
const dois: Ficha = { tipo: "numero", valor: "2" };

const existentes = [
  { id: "b1", nome: "Casal", ordem: 1 },
  { id: "b2", nome: "Total", ordem: 3 },
];

describe("validarNomeBloco", () => {
  it("nome limpo, de 1 a 30 caracteres", () => {
    expect(validarNomeBloco("  Rangel ", [])).toEqual({ ok: true, valor: "Rangel" });
    expect(validarNomeBloco("   ", [])).toEqual({ ok: false, erro: { codigo: "bloco.nome_vazio" } });
    expect(validarNomeBloco("x".repeat(31), [])).toEqual({ ok: false, erro: { codigo: "bloco.nome_longo" } });
    expect(validarNomeBloco("x".repeat(30), []).ok).toBe(true);
  });

  it("único, sem diferenciar maiúsculas e acentos, menos o próprio", () => {
    expect(validarNomeBloco("casal", existentes)).toEqual({ ok: false, erro: { codigo: "bloco.nome_repetido" } });
    expect(validarNomeBloco("CASAL", existentes, "b1").ok).toBe(true);
  });
});

describe("proximaOrdemBloco", () => {
  it("a maior + 1", () => {
    expect(proximaOrdemBloco([])).toBe(1);
    expect(proximaOrdemBloco(existentes)).toBe(4);
  });
});

describe("planejarSalvarBloco", () => {
  const rascunho = { nome: "Rangel", fichas: [casal, DIV, dois], de_cobranca: true, meu_bloco: false };

  it("monta o pedido da RPC com a Fórmula e a próxima ordem", () => {
    const r = planejarSalvarBloco(rascunho, existentes);
    expect(r).toEqual({
      ok: true,
      valor: {
        p_id: null,
        p_nome: "Rangel",
        p_formula: {
          tipo: "operacao",
          operacao: "divisao",
          esquerda: { tipo: "responsavel", id: "casal" },
          direita: { tipo: "numero", valor: "2" },
        },
        p_ordem: 4,
        p_de_cobranca: true,
        p_meu_bloco: false,
      },
    });
  });

  it("num Bloco que já existe, mantém a ordem e aceita o próprio nome", () => {
    const r = planejarSalvarBloco({ ...rascunho, nome: "Casal" }, existentes, "b1");
    expect(r.ok && r.valor).toMatchObject({ p_id: "b1", p_nome: "Casal", p_ordem: 1 });
  });

  it("a razão da Fórmula vem antes da do nome", () => {
    expect(planejarSalvarBloco({ ...rascunho, nome: "", fichas: [casal, DIV] }, [])).toEqual({
      ok: false,
      erro: { codigo: "formula.termina_com_operacao" },
    });
    expect(planejarSalvarBloco({ ...rascunho, nome: "" }, [])).toEqual({
      ok: false,
      erro: { codigo: "bloco.nome_vazio" },
    });
  });

  it("Fórmula inválida não vira pedido", () => {
    const r = planejarSalvarBloco({ ...rascunho, fichas: [casal, DIV, { tipo: "numero", valor: "0" }] }, []);
    expect(r).toEqual({ ok: false, erro: { codigo: "formula.divisao_por_zero" } });
  });
});

describe("lerBlocos", () => {
  const linha = (id: string, ordem: number, formula: unknown): LinhaDoBloco => ({
    id,
    nome: id,
    formula,
    ordem,
    de_cobranca: false,
    meu_bloco: false,
  });

  it("ordena pela ordem e deixa de fora a Fórmula ilegível", () => {
    const blocos = lerBlocos([
      linha("b", 2, { tipo: "todos" }),
      linha("quebrado", 1, { tipo: "responsavel" }),
      linha("a", 1, { tipo: "responsavel", id: "casal" }),
    ]);
    expect(blocos.map((b) => b.id)).toEqual(["a", "b"]);
  });
});
