import { describe, expect, it } from "vitest";
import extracaoOutubro from "../../test/fixtures/extracao-2026-10.json";
import { chavesDeRegrasUsadas, classificarImportacao, lerDadosRevisao, type CadastrosParaClassificar, type LinhaParaClassificar } from "./classificacao";
import type { Extracao, LancamentoExtraido } from "./extracao-fatura";
import { prepararImportacao } from "./importacao-fatura";
import type { RegraGravada } from "./regras";

const cadastros: CadastrosParaClassificar = {
  responsaveis: [
    { id: "rafael", arquivado: false },
    { id: "mae", arquivado: false },
    { id: "casal", arquivado: false },
    { id: "ze", arquivado: true },
  ],
  tipos: [
    { id: "casa", nome: "Casa", arquivado: false },
    { id: "gatos", nome: "Gatos", arquivado: false },
    { id: "saude", nome: "Saúde", arquivado: false },
    { id: "musica", nome: "Música", arquivado: false },
    { id: "velho", nome: "Velho", arquivado: true },
  ],
};

const regra = (chave: string, extra: Partial<RegraGravada> = {}): RegraGravada => ({
  chave,
  versao_normalizacao: 1,
  responsavel_id: null,
  tipo_id: null,
  contagem: [],
  ultimo_uso: "2026-10-01T00:00:00.000Z",
  ...extra,
});

let ordem = 0;
const linha = (nome: string, extra: Partial<LinhaParaClassificar> = {}): LinhaParaClassificar => ({
  nome,
  tipo_sugerido: null,
  ordem_fatura: ++ordem,
  ajuste_de_ordem: null,
  ...extra,
});

const classificacao = (l: { responsavel_id: unknown; tipo_id: unknown; revisao_motivo: unknown; revisao_dados: unknown }) => ({
  responsavel_id: l.responsavel_id,
  tipo_id: l.tipo_id,
  revisao_motivo: l.revisao_motivo,
  revisao_dados: l.revisao_dados,
});

describe("classificarImportacao", () => {
  it("Regra limpa: grava Casal · Casa, sem motivo", () => {
    const [r] = classificarImportacao(
      [linha("LOJA DA CASA")],
      [regra("LOJA DA CASA", { responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 4 }] })],
      cadastros,
    );
    expect(classificacao(r)).toEqual({ responsavel_id: "casal", tipo_id: "casa", revisao_motivo: null, revisao_dados: null });
  });

  it("Regra com dúvida (Rafael 2, Mãe 1): não aplica; sugere Rafael · Tipo e vai para a fila", () => {
    const [r] = classificarImportacao(
      [linha("GRASSO FARMACIA LTDA", { tipo_sugerido: "Casa" })],
      [
        regra("GRASSO FARMACIA LTDA", {
          responsavel_id: "mae",
          tipo_id: "saude",
          contagem: [
            { responsavel_id: "rafael", n: 2 },
            { responsavel_id: "mae", n: 1 },
          ],
        }),
      ],
      cadastros,
    );
    expect(classificacao(r)).toEqual({
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sugestao_duvida",
      revisao_dados: { responsavel_id: "rafael", tipo_id: "saude", outros_responsaveis: ["mae"] },
    });
  });

  it("dúvida com o Tipo da Regra arquivado: o tipo_sugerido completa a sugestão", () => {
    const [r] = classificarImportacao(
      [linha("FARMACIA", { tipo_sugerido: "Saúde" })],
      [regra("FARMACIA", { tipo_id: "velho", contagem: [{ responsavel_id: "rafael", n: 1 }, { responsavel_id: "mae", n: 1 }] })],
      cadastros,
    );
    expect(r.revisao_dados).toEqual({ responsavel_id: "rafael", tipo_id: "saude", outros_responsaveis: ["mae"] });
  });

  it("Sem Regra, com tipo_sugerido: não aplica; sugere Gatos e vai para a fila", () => {
    const [r] = classificarImportacao([linha("PETZ", { tipo_sugerido: "Gatos" })], [], cadastros);
    expect(classificacao(r)).toEqual({
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sugestao",
      revisao_dados: { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] },
    });
  });

  it("tipo_sugerido pelo nome normalizado; Tipo arquivado ou desconhecido não sugere", () => {
    expect(classificarImportacao([linha("A", { tipo_sugerido: "SAUDE" })], [], cadastros)[0].revisao_dados?.tipo_id).toBe("saude");
    expect(classificarImportacao([linha("B", { tipo_sugerido: "Velho" })], [], cadastros)[0].revisao_motivo).toBe(
      "sem_classificacao",
    );
    expect(classificarImportacao([linha("C", { tipo_sugerido: "Nenhum" })], [], cadastros)[0].revisao_motivo).toBe(
      "sem_classificacao",
    );
  });

  it("Sem nada: sem classificação, motivo sem_classificacao", () => {
    const [r] = classificarImportacao([linha("NOVA LOJA")], [regra("OUTRA")], cadastros);
    expect(classificacao(r)).toEqual({
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
    });
  });

  it("Regra só com cadastros arquivados conta como ausente; com tipo_sugerido, sugere", () => {
    const regras = [regra("LOJA", { responsavel_id: "ze", tipo_id: "velho", contagem: [{ responsavel_id: "ze", n: 2 }] })];
    expect(classificarImportacao([linha("LOJA")], regras, cadastros)[0].revisao_motivo).toBe("sem_classificacao");
    expect(classificarImportacao([linha("LOJA", { tipo_sugerido: "Casa" })], regras, cadastros)[0].revisao_motivo).toBe(
      "sugestao",
    );
  });

  it("Regra só com Tipo: aplica o Tipo e a linha segue na fila (falta o Responsável)", () => {
    const [r] = classificarImportacao([linha("LOJA")], [regra("LOJA", { tipo_id: "casa" })], cadastros);
    expect(classificacao(r)).toEqual({ responsavel_id: null, tipo_id: "casa", revisao_motivo: "sem_classificacao", revisao_dados: null });
  });

  it("Regra só com Responsável e tipo_sugerido ativo: aplica o Responsável e sugere o Tipo", () => {
    const regras = [regra("LOJA", { responsavel_id: "casal", contagem: [{ responsavel_id: "casal", n: 1 }] })];
    const [comSugestao, semSugestao] = classificarImportacao(
      [linha("LOJA", { tipo_sugerido: "Gatos" }), linha("LOJA", { tipo_sugerido: "Velho" })],
      regras,
      cadastros,
    );
    expect(classificacao(comSugestao)).toEqual({
      responsavel_id: "casal",
      tipo_id: null,
      revisao_motivo: "sugestao",
      revisao_dados: { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] },
    });
    expect(classificacao(semSugestao)).toEqual({
      responsavel_id: "casal",
      tipo_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
    });
  });

  it("a chave tolera variações do Nome (DM*SPOTIFY P4750 usa a Regra SPOTIFY); créditos também", () => {
    const regras = [regra("SPOTIFY", { responsavel_id: "rafael", tipo_id: "musica", contagem: [{ responsavel_id: "rafael", n: 1 }] })];
    const [a, b] = classificarImportacao([linha("DM*SPOTIFY P4750"), linha("EBN *SPOTIFY")], regras, cadastros);
    expect([a.responsavel_id, a.tipo_id, b.responsavel_id, b.tipo_id]).toEqual(["rafael", "musica", "rafael", "musica"]);
  });

  it("Parcela com Regra e Ajuste vinculado: o Ajuste recebe a classificação da mãe, sem motivo", () => {
    const mae = linha("MSC CRUZEIROS");
    const outra = linha("PADARIA", { tipo_sugerido: "Casa" });
    const ajuste = linha("MSC CRUZEIROS", { ajuste_de_ordem: mae.ordem_fatura });
    const regras = [regra("MSC CRUZEIROS", { responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 1 }] })];
    const r = classificarImportacao([mae, outra, ajuste], regras, cadastros);
    expect(r.map(classificacao)).toEqual([
      { responsavel_id: "casal", tipo_id: "casa", revisao_motivo: null, revisao_dados: null },
      {
        responsavel_id: null,
        tipo_id: null,
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: "casa", outros_responsaveis: [] },
      },
      { responsavel_id: "casal", tipo_id: "casa", revisao_motivo: null, revisao_dados: null },
    ]);
  });

  it("Ajuste de mãe sem classificação fica sem classificação e sem motivo próprio", () => {
    const mae = linha("MSC CRUZEIROS", { tipo_sugerido: "Casa" });
    const ajuste = linha("MSC CRUZEIROS", { ajuste_de_ordem: mae.ordem_fatura, tipo_sugerido: "Gatos" });
    const [, a] = classificarImportacao([mae, ajuste], [], cadastros);
    expect(classificacao(a)).toEqual({ responsavel_id: null, tipo_id: null, revisao_motivo: null, revisao_dados: null });
  });

  it("mantém os outros campos da linha", () => {
    const [r] = classificarImportacao([{ ...linha("X"), valor_centavos: 100 }], [], cadastros);
    expect(r.valor_centavos).toBe(100);
  });

  it("outubro/2026 com a matriz: parcela MSC 01/12 e Spotify aplicados, o resto na fila", () => {
    const outubro = extracaoOutubro as Extracao;
    const lancamentos: LancamentoExtraido[] = outubro.lancamentos.map((l) =>
      l.nome === "COBASI CRICIUMA" ? { ...l, tipoSugerido: "Gatos" } : l,
    );
    const preparada = prepararImportacao({ ...outubro, lancamentos });
    expect(preparada.ok).toBe(true);
    if (!preparada.ok) return;
    const regras = [
      regra("MSC CRUZEIROS", { responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 1 }] }),
      regra("SPOTIFY", { responsavel_id: "rafael", tipo_id: "musica", contagem: [{ responsavel_id: "rafael", n: 1 }] }),
      regra("CASHBACK ESFERA", { responsavel_id: "casal", tipo_id: "casa" }),
    ];
    const r = classificarImportacao(preparada.valor.lancamentos, regras, cadastros);
    expect(r).toHaveLength(49);
    const de = (nome: string) => r.find((l) => l.nome === nome)!;
    expect(classificacao(de("MSC CRUZEIROS"))).toMatchObject({ responsavel_id: "casal", revisao_motivo: null });
    expect(classificacao(de("DM*SPOTIFY P4750"))).toMatchObject({ responsavel_id: "rafael", tipo_id: "musica", revisao_motivo: null });
    // Crédito com Regra.
    expect(classificacao(de("CASHBACK ESFERA - 314835478"))).toMatchObject({ responsavel_id: "casal", revisao_motivo: null });
    expect(de("COBASI CRICIUMA").revisao_motivo).toBe("sugestao");
    const motivos = r.map((l) => l.revisao_motivo);
    expect(motivos.filter((m) => m === null)).toHaveLength(3);
    expect(motivos.filter((m) => m === "sem_classificacao")).toHaveLength(45);
  });
});

describe("lerDadosRevisao", () => {
  it("lê a sugestão; id anulado (exclusão sem substituto) vira null e sai dos outros", () => {
    expect(lerDadosRevisao({ responsavel_id: "a", tipo_id: null, outros_responsaveis: ["b", null] })).toEqual({
      responsavel_id: "a",
      tipo_id: null,
      outros_responsaveis: ["b"],
    });
    expect(lerDadosRevisao(null)).toBeNull();
    expect(lerDadosRevisao([1])).toBeNull();
    expect(lerDadosRevisao({})).toEqual({ responsavel_id: null, tipo_id: null, outros_responsaveis: [] });
  });

  it("outros_responsaveis sem repetidos e sem o sugerido (depois de substituir)", () => {
    expect(
      lerDadosRevisao({ responsavel_id: "casal", tipo_id: "saude", outros_responsaveis: ["casal", "rafael", "rafael", "mae"] }),
    ).toEqual({ responsavel_id: "casal", tipo_id: "saude", outros_responsaveis: ["rafael", "mae"] });
  });
});

describe("chavesDeRegrasUsadas (3.4)", () => {
  it("as Regras ativas que a importação usou; Ajuste e Regra de cadastro arquivado não contam", () => {
    const regras = [
      regra("SPOTIFY", { responsavel_id: "casal", tipo_id: "musica" }),
      regra("FANTASMA", { responsavel_id: "ze" }),
      regra("AMAZON", { tipo_id: "casa" }),
    ];
    const usadas = chavesDeRegrasUsadas(
      [
        { nome: "DM*SPOTIFY", ajuste_de_ordem: null },
        { nome: "EBN SPOTIFY", ajuste_de_ordem: null },
        { nome: "FANTASMA", ajuste_de_ordem: null },
        { nome: "AMAZON", ajuste_de_ordem: 1 },
      ],
      regras,
      cadastros,
    );
    expect(usadas).toEqual(["SPOTIFY"]);
  });
});

describe("classificarImportacao com a Regra da planilha (3.10)", () => {
  it("o Nome da fatura com `*` acha a Regra criada com o Nome da planilha (sem `*`)", () => {
    const [r] = classificarImportacao(
      [linha("SHOPEE *CELLSOLUTIONS")],
      [regra("SHOPEE CELLSOLUTIONS", { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 3 }] })],
      cadastros,
    );
    expect(classificacao(r)).toEqual({ responsavel_id: "rafael", tipo_id: "casa", revisao_motivo: null, revisao_dados: null });
  });

  it("a Regra de hoje vale mais que a da planilha para o mesmo Nome", () => {
    const [r] = classificarImportacao(
      [linha("SHOPEE *CELLSOLUTIONS")],
      [
        regra("SHOPEE CELLSOLUTIONS", { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 3 }] }),
        regra("SHOPEE*CELLSOLUTIONS", { responsavel_id: "mae", tipo_id: "saude", contagem: [{ responsavel_id: "mae", n: 1 }] }),
      ],
      cadastros,
    );
    expect(classificacao(r)).toMatchObject({ responsavel_id: "mae", tipo_id: "saude" });
  });

  it("chavesDeRegrasUsadas devolve a chave da planilha que classificou", () => {
    const regras = [regra("SHOPEE CELLSOLUTIONS", { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 1 }] })];
    expect(chavesDeRegrasUsadas([{ nome: "SHOPEE *CELLSOLUTIONS", ajuste_de_ordem: null }], regras, cadastros)).toEqual(["SHOPEE CELLSOLUTIONS"]);
  });
});
