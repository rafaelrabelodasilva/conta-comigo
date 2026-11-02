import { describe, expect, it } from "vitest";
import {
  ativos,
  ordenarParaConfiguracoes,
  padraoVigente,
  validarArquivarStatus,
  validarDesarquivarStatus,
  validarNomeStatus,
  type Status,
} from "./status";

const s = (id: string, nome: string, arquivado = false): Status => ({ id, nome, arquivado });

const lista = [s("p", "Pago"), s("n", "Não pago"), s("a", "Atrasado"), s("x", "Parcial", true)];

describe("validarNomeStatus", () => {
  it("devolve o nome limpo", () => {
    expect(validarNomeStatus("  Pago em parte ", lista)).toEqual({ ok: true, valor: "Pago em parte" });
  });

  it("usa os códigos status.*", () => {
    expect(validarNomeStatus(" ", lista)).toEqual({ ok: false, erro: { codigo: "status.nome_vazio" } });
    expect(validarNomeStatus("a".repeat(31), lista)).toEqual({
      ok: false,
      erro: { codigo: "status.nome_longo" },
    });
    expect(validarNomeStatus("nao PAGO", lista)).toEqual({
      ok: false,
      erro: { codigo: "status.nome_repetido" },
    });
  });

  it("não compara com arquivados nem consigo mesmo", () => {
    expect(validarNomeStatus("parcial", lista).ok).toBe(true);
    expect(validarNomeStatus("PAGO", lista, "p")).toEqual({ ok: true, valor: "PAGO" });
  });
});

describe("ordem", () => {
  it("ativos em ordem alfabética pt-BR, sem arquivados", () => {
    expect(ativos(lista).map((x) => x.nome)).toEqual(["Atrasado", "Não pago", "Pago"]);
  });

  it("Configurações mostra os arquivados no fim", () => {
    expect(ordenarParaConfiguracoes([s("z", "Zero", true), ...lista]).map((x) => x.id)).toEqual([
      "a",
      "n",
      "p",
      "x",
      "z",
    ]);
  });
});

describe("validarDesarquivarStatus", () => {
  it("aceita quando o nome não repete um ativo", () => {
    expect(validarDesarquivarStatus(lista, "x")).toEqual({ ok: true, valor: true });
  });

  it("recusa nome repetido de um ativo", () => {
    expect(validarDesarquivarStatus([...lista, s("y", "PAGO", true)], "y")).toEqual({
      ok: false,
      erro: { codigo: "status.nome_repetido" },
    });
  });

  it("recusa quem não está arquivado ou não existe", () => {
    const erro = { ok: false, erro: { codigo: "status.nao_arquivado" } };
    expect(validarDesarquivarStatus(lista, "p")).toEqual(erro);
    expect(validarDesarquivarStatus(lista, "nada")).toEqual(erro);
  });
});

describe("validarArquivarStatus", () => {
  it("recusa arquivar o Status padrão", () => {
    expect(validarArquivarStatus(s("p", "Pago"), "p")).toEqual({
      ok: false,
      erro: { codigo: "status.padrao_nao_arquiva" },
    });
  });

  it("aceita os demais e qualquer um sem padrão", () => {
    expect(validarArquivarStatus(s("n", "Não pago"), "p")).toEqual({ ok: true, valor: true });
    expect(validarArquivarStatus(s("p", "Pago"), null)).toEqual({ ok: true, valor: true });
    expect(validarArquivarStatus(s("p", "Pago"), undefined)).toEqual({ ok: true, valor: true });
  });
});

describe("padraoVigente", () => {
  it("mantém o padrão ativo e cai em Nenhum quando arquivado, excluído ou ausente", () => {
    expect(padraoVigente(lista, "p")).toBe("p");
    expect(padraoVigente(lista, "x")).toBeNull();
    expect(padraoVigente(lista, "sumiu")).toBeNull();
    expect(padraoVigente(lista, null)).toBeNull();
  });
});
