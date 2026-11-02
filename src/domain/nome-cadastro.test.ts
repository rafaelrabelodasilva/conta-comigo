import { describe, expect, it } from "vitest";
import { NOME_MAX, chaveDoNome, validarNomeCadastro, type ItemComNome } from "./nome-cadastro";

const codigos = { vazio: "x.vazio", longo: "x.longo", repetido: "x.repetido" };
const itens: ItemComNome[] = [
  { id: "a", nome: "Casa", arquivado: false },
  { id: "b", nome: "Gatos", arquivado: false },
  { id: "c", nome: "Viagem", arquivado: true },
];

describe("validarNomeCadastro", () => {
  it("devolve o nome sem espaços nas pontas", () => {
    expect(validarNomeCadastro("  Saúde ", itens, codigos)).toEqual({ ok: true, valor: "Saúde" });
  });

  it("usa os códigos do cadastro que chamou", () => {
    expect(validarNomeCadastro(" ", itens, codigos)).toEqual({ ok: false, erro: { codigo: "x.vazio" } });
    expect(validarNomeCadastro("a".repeat(NOME_MAX + 1), itens, codigos)).toEqual({
      ok: false,
      erro: { codigo: "x.longo" },
    });
    expect(validarNomeCadastro("CÁSA", itens, codigos)).toEqual({
      ok: false,
      erro: { codigo: "x.repetido" },
    });
  });

  it("aceita 30 caracteres e conta emoji como 1", () => {
    expect(validarNomeCadastro("a".repeat(30), itens, codigos).ok).toBe(true);
    expect(validarNomeCadastro("😀".repeat(30), itens, codigos).ok).toBe(true);
    expect(validarNomeCadastro("😀".repeat(31), itens, codigos).ok).toBe(false);
  });

  it("não compara com arquivados nem consigo mesmo", () => {
    expect(validarNomeCadastro("viagem", itens, codigos).ok).toBe(true);
    expect(validarNomeCadastro("CASA", itens, codigos, "a")).toEqual({ ok: true, valor: "CASA" });
  });

  it("chaveDoNome tira acentos, maiúsculas e espaços repetidos", () => {
    expect(chaveDoNome("  Mãe   Ana ")).toBe("mae ana");
  });
});
