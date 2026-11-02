import { describe, expect, it } from "vitest";
import {
  CADASTROS,
  REFERENCIAS_COLUNAS,
  REFERENCIAS_JSONB,
  TABELA_DO_CADASTRO,
  opcoesDeSubstituto,
  validarExclusao,
} from "./cadastros";

const i = (id: string, arquivado = false) => ({ id, nome: id, arquivado });

describe("referências", () => {
  it("cada cadastro tem a sua tabela", () => {
    expect(TABELA_DO_CADASTRO).toEqual({ responsavel: "responsaveis", tipo: "tipos", status: "status" });
    expect(CADASTROS).toEqual(["responsavel", "tipo", "status"]);
  });

  it("hoje a única referência é o Status padrão, que não conta uso", () => {
    expect(REFERENCIAS_COLUNAS).toEqual([
      { cadastro: "status", tabela: "configuracoes", coluna: "status_padrao_id", contaUso: false },
    ]);
    expect(REFERENCIAS_JSONB).toEqual([]);
  });

  it("toda referência aponta para um cadastro conhecido", () => {
    for (const r of [...REFERENCIAS_COLUNAS, ...REFERENCIAS_JSONB]) {
      expect(CADASTROS).toContain(r.cadastro);
    }
  });
});

describe("opcoesDeSubstituto", () => {
  it("ativos do cadastro, sem o excluído, na ordem recebida", () => {
    const itens = [i("c"), i("a"), i("b", true), i("d")];
    expect(opcoesDeSubstituto(itens, "a").map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("vazio quando só sobra ele mesmo", () => {
    expect(opcoesDeSubstituto([i("a"), i("b", true)], "a")).toEqual([]);
  });
});

describe("validarExclusao", () => {
  const opcoes = [i("p"), i("q")];

  it("sem uso, exclui sem substituto", () => {
    expect(validarExclusao(0, null, opcoes)).toEqual({ ok: true, valor: { paraId: null } });
    expect(validarExclusao(0, "p", opcoes)).toEqual({ ok: true, valor: { paraId: null } });
  });

  it("em uso, exige substituto", () => {
    expect(validarExclusao(3, null, opcoes)).toEqual({
      ok: false,
      erro: { codigo: "cadastro.sem_substituto" },
    });
    expect(validarExclusao(3, "", opcoes)).toEqual({
      ok: false,
      erro: { codigo: "cadastro.sem_substituto" },
    });
  });

  it("em uso, o substituto precisa estar entre as opções", () => {
    expect(validarExclusao(3, "x", opcoes)).toEqual({
      ok: false,
      erro: { codigo: "cadastro.substituto_invalido" },
    });
    expect(validarExclusao(3, "q", opcoes)).toEqual({ ok: true, valor: { paraId: "q" } });
  });
});
