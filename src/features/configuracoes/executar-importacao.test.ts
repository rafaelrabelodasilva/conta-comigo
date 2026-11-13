import { describe, expect, it, vi } from "vitest";
import type { AbaLida, CadastrosDoApp, EstadoDoApp, LinhaLida } from "@/domain/importacao-planilha";
import { executarImportacao, type DepsDaImportacao, type ProgressoDaAba } from "./executar-importacao";

function linha(despesa: string, valor: number, extra: Partial<LinhaLida> = {}): LinhaLida {
  return {
    linha: 2,
    despesa,
    valor_centavos: valor,
    parcela_n: null,
    parcela_total: null,
    observacao: null,
    tipo: "Casa",
    responsavel: "Rafael",
    status: null,
    digitado_a_mao: false,
    ...extra,
  };
}

const ABAS: AbaLida[] = [
  { nome: "01/2026", mes: "2026-01", linhas: [linha("SHOPEE CELLSOLUTIONS", 52366, { parcela_n: 1, parcela_total: 3 })] },
  { nome: "02/2026", mes: "2026-02", linhas: [linha("SHOPEE CELLSOLUTIONS", 52366, { parcela_n: 2, parcela_total: 3 })] },
  { nome: "03/2026", mes: "2026-03", linhas: [linha("OUTRA COISA", 1000)] },
];

const CADASTROS: CadastrosDoApp = {
  responsaveis: [{ id: "r1", nome: "Rafael", arquivado: false }],
  tipos: [{ id: "t1", nome: "Casa", arquivado: false }],
  status: [],
};
const ESTADO: EstadoDoApp = { mesesComFatura: [], mesesComHistorico: [], linhas: [] };

function deps(extra: Partial<DepsDaImportacao> = {}): DepsDaImportacao {
  return {
    lerEstado: async () => ({ ok: true, estado: ESTADO }),
    lerCadastros: async () => ({ ok: true, cadastros: CADASTROS }),
    criarCadastros: async () => ({ ok: true }),
    importarAba: async (p) => ({ ok: true, lancamentos: p.linhas.length }),
    criarRegras: async (regras) => ({ ok: true, criadas: regras.map((_, i) => ({ created_at: `2026-11-13T12:00:0${i}.000000+00:00` })) }),
    agora: () => new Date("2026-11-13T12:00:00Z"),
    ...extra,
  };
}

describe("executarImportacao", () => {
  it("grava as abas em ordem, uma por vez, com o progresso de cada uma, e resume", async () => {
    const importarAba = vi.fn(deps().importarAba);
    const passos: ProgressoDaAba[][] = [];
    const r = await executarImportacao(deps({ importarAba }), [ABAS[2], ABAS[0], ABAS[1]], (p) => passos.push(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(importarAba.mock.calls.map(([p]) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(r.valor.resumo).toMatchObject({ lancamentos: 3, responsaveis: 0, tipos: 0, regras: 2, abasComErro: [] });
    expect(r.valor.regrasDesde).toBe("2026-11-13T12:00:00.000000+00:00");
    expect(passos[0].map((p) => p.estado)).toEqual(["esperando", "esperando", "esperando"]);
    expect(passos.at(-1)?.map((p) => p.estado)).toEqual(["gravada", "gravada", "gravada"]);
    expect(passos.some((p) => p[1].estado === "gravando")).toBe(true);
  });

  it("uma aba com erro não para as outras e não ensina Regras", async () => {
    const criarRegras = vi.fn(deps().criarRegras);
    const r = await executarImportacao(
      deps({
        importarAba: async (p) => (p.mes === "2026-02" ? { ok: false, codigo: "planilha.serie_ocupada" } : { ok: true, lancamentos: p.linhas.length }),
        criarRegras,
      }),
      ABAS,
      () => {},
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.erros).toEqual([{ nome: "02/2026", codigo: "planilha.serie_ocupada" }]);
    expect(r.valor.resumo).toMatchObject({ lancamentos: 2, abasComErro: ["02/2026"] });
    // 01/2026 e 03/2026 ensinam; a Regra da SHOPEE vem só de 01/2026 (a 02/2026 falhou).
    const regras = criarRegras.mock.calls[0][0];
    expect(regras.map((x) => x.chave).sort()).toEqual(["OUTRA COISA", "SHOPEE CELLSOLUTIONS"]);
  });

  it("aba de Mês com Fatura não grava linhas, mas ensina Regras", async () => {
    const importarAba = vi.fn(deps().importarAba);
    const criarRegras = vi.fn(deps().criarRegras);
    const r = await executarImportacao(
      deps({ importarAba, criarRegras, lerEstado: async () => ({ ok: true, estado: { ...ESTADO, mesesComFatura: ["2026-03"] } }) }),
      [ABAS[2]],
      () => {},
    );
    expect(r.ok && r.valor.abas[0]).toMatchObject({ ok: true, lancamentos: 0 });
    expect(criarRegras.mock.calls[0][0].map((x) => x.chave)).toEqual(["OUTRA COISA"]);
    expect(importarAba.mock.calls[0][0].soRegras).toBe(true);
  });

  it("falha ao criar os cadastros: nada é gravado e o erro volta", async () => {
    const importarAba = vi.fn(deps().importarAba);
    const r = await executarImportacao(
      deps({ importarAba, criarCadastros: async () => ({ ok: false, codigo: "responsavel.sem_cor_livre" }) }),
      ABAS,
      () => {},
    );
    expect(r).toEqual({ ok: false, erro: { codigo: "responsavel.sem_cor_livre" } });
    expect(importarAba).not.toHaveBeenCalled();
  });

  it("falha ao ler os cadastros ou o estado: carregar.falhou, sem gravar", async () => {
    const importarAba = vi.fn(deps().importarAba);
    expect(await executarImportacao(deps({ importarAba, lerCadastros: async () => ({ ok: false }) }), ABAS, () => {})).toEqual({
      ok: false,
      erro: { codigo: "carregar.falhou" },
    });
    expect(await executarImportacao(deps({ importarAba, lerEstado: async () => ({ ok: false }) }), ABAS, () => {})).toEqual({
      ok: false,
      erro: { codigo: "carregar.falhou" },
    });
    expect(importarAba).not.toHaveBeenCalled();
  });

  it("falha ao gravar as Regras: as linhas ficam e o erro aparece", async () => {
    const r = await executarImportacao(deps({ criarRegras: async () => ({ ok: false }) }), [ABAS[2]], () => {});
    expect(r.ok && r.valor.resumo.regras).toBe(0);
    expect(r.ok && r.valor.erros).toEqual([{ nome: "Regras", codigo: "salvar.falhou" }]);
    expect(r.ok && r.valor.regrasDesde).toBeNull();
  });

  it("cadastros novos entram no resumo (Responsáveis e Tipos criados)", async () => {
    const r = await executarImportacao(
      deps({ lerCadastros: async () => ({ ok: true, cadastros: { responsaveis: [], tipos: [], status: [] } }) }),
      [ABAS[2]],
      () => {},
    );
    expect(r.ok && r.valor.resumo).toMatchObject({ responsaveis: 1, tipos: 1 });
  });
});
