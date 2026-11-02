import { describe, expect, it } from "vitest";
import {
  ativos,
  ordenarParaConfiguracoes,
  validarDesarquivarTipo,
  validarNomeTipo,
  type Tipo,
} from "./tipos";

const t = (id: string, nome: string, arquivado = false): Tipo => ({ id, nome, arquivado });

const lista = [t("v", "Viagem"), t("c", "Casa"), t("a", "Água"), t("g", "gatos"), t("x", "Escola", true)];

describe("validarNomeTipo", () => {
  it("devolve o nome limpo", () => {
    expect(validarNomeTipo("  Saúde ", lista)).toEqual({ ok: true, valor: "Saúde" });
  });

  it("usa os códigos tipo.*", () => {
    expect(validarNomeTipo("", lista)).toEqual({ ok: false, erro: { codigo: "tipo.nome_vazio" } });
    expect(validarNomeTipo("a".repeat(31), lista)).toEqual({
      ok: false,
      erro: { codigo: "tipo.nome_longo" },
    });
    expect(validarNomeTipo("CASA", lista)).toEqual({
      ok: false,
      erro: { codigo: "tipo.nome_repetido" },
    });
    expect(validarNomeTipo("agua", lista)).toEqual({
      ok: false,
      erro: { codigo: "tipo.nome_repetido" },
    });
  });

  it("não compara com arquivados nem consigo mesmo", () => {
    expect(validarNomeTipo("escola", lista).ok).toBe(true);
    expect(validarNomeTipo("CASA", lista, "c")).toEqual({ ok: true, valor: "CASA" });
  });
});

describe("ordem", () => {
  it("ativos sem arquivados, em ordem alfabética pt-BR (sem diferenciar maiúsculas e acentos)", () => {
    expect(ativos(lista).map((x) => x.nome)).toEqual(["Água", "Casa", "gatos", "Viagem"]);
  });

  it("Configurações mostra os arquivados no fim, também em ordem alfabética", () => {
    const comArquivados = [t("z", "Zoo", true), ...lista, t("b", "Banco", true)];
    expect(ordenarParaConfiguracoes(comArquivados).map((x) => x.id)).toEqual([
      "a",
      "c",
      "g",
      "v",
      "b",
      "x",
      "z",
    ]);
  });

  it("não altera a lista recebida", () => {
    const copia = [...lista];
    ativos(lista);
    expect(lista).toEqual(copia);
  });
});

describe("validarDesarquivarTipo", () => {
  it("aceita quando o nome não repete um ativo", () => {
    expect(validarDesarquivarTipo(lista, "x")).toEqual({ ok: true, valor: true });
  });

  it("recusa nome repetido de um ativo", () => {
    const comRepetido = [...lista, t("y", "VIAGEM", true)];
    expect(validarDesarquivarTipo(comRepetido, "y")).toEqual({
      ok: false,
      erro: { codigo: "tipo.nome_repetido" },
    });
  });

  it("recusa quem não está arquivado ou não existe", () => {
    const erro = { ok: false, erro: { codigo: "tipo.nao_arquivado" } };
    expect(validarDesarquivarTipo(lista, "c")).toEqual(erro);
    expect(validarDesarquivarTipo(lista, "nada")).toEqual(erro);
  });
});
