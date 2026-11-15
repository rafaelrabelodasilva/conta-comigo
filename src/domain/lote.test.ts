import { describe, expect, it } from "vitest";
import {
  COLUNAS_DO_LOTE,
  entradasDeSugestoes,
  parcelasDoLote,
  planejarGravacao,
  planejarLote,
  totalDaSelecao,
  type LinhaDoLote,
} from "./lote";
import { montarFila, type CadastrosDaFila, type LinhaDaFila } from "./revisar";

const AGORA = "2026-11-10T15:00:00.000Z";
const CASAL = "r-casal";
const RAFAEL = "r-rafael";
const CASA = "t-casa";
const SAUDE = "t-saude";

const linha = (id: string, extra: Partial<LinhaDoLote> = {}): LinhaDoLote => ({
  id,
  nome: "SHOPEE",
  valor_centavos: 1000,
  responsavel_id: null,
  tipo_id: null,
  status_id: null,
  observacao: null,
  revisao_motivo: "sem_classificacao",
  revisao_dados: null,
  revisado_em: null,
  editado_em: null,
  fatura_id: "f11",
  ajuste_de_id: null,
  excluido_em: null,
  ...extra,
});

describe("planejarGravacao (a regra de atualizar, extraída)", () => {
  it("só as colunas que mudam, mais editado_em; sem mudança, vazio", () => {
    const a = linha("a", { revisao_motivo: null, apelido: "x" } as Partial<LinhaDoLote>);
    expect(planejarGravacao(a, { status_id: "pago" }, AGORA)).toEqual({
      vazio: false,
      corpo: { status_id: "pago", editado_em: AGORA },
      soDaPrincipal: null,
      ensina: false,
    });
    expect(planejarGravacao(a, { status_id: null }, AGORA)).toEqual({ vazio: true });
    expect(planejarGravacao(a, {}, AGORA)).toEqual({ vazio: true });
  });

  it("com Responsável e Tipo, a linha sai da fila: motivo e dados nulos e revisado_em", () => {
    const a = linha("a", { tipo_id: CASA, revisao_motivo: "sugestao", revisao_dados: { x: 1 } });
    const p = planejarGravacao(a, { responsavel_id: CASAL }, AGORA);
    expect(p).toEqual({
      vazio: false,
      corpo: {
        responsavel_id: CASAL,
        revisao_motivo: null,
        revisao_dados: null,
        revisado_em: AGORA,
        editado_em: AGORA,
      },
      soDaPrincipal: null,
      ensina: true,
    });
  });

  it("falta o Tipo: grava só o Responsável e a linha continua na fila", () => {
    const a = linha("a");
    const p = planejarGravacao(a, { responsavel_id: CASAL }, AGORA);
    expect(p).toMatchObject({ vazio: false, corpo: { responsavel_id: CASAL, editado_em: AGORA }, ensina: true });
    if (p.vazio) throw new Error("vazio");
    expect(p.corpo).not.toHaveProperty("revisao_motivo");
    expect(p.corpo).not.toHaveProperty("revisado_em");
  });

  it("o ✓ de uma linha da fila que já tem os dois ainda a tira da fila (sem ensinar)", () => {
    const a = linha("a", { responsavel_id: CASAL, tipo_id: CASA, revisao_motivo: "sugestao" });
    expect(planejarGravacao(a, { responsavel_id: CASAL, tipo_id: CASA }, AGORA)).toEqual({
      vazio: false,
      corpo: { revisao_motivo: null, revisao_dados: null, revisado_em: AGORA, editado_em: AGORA },
      soDaPrincipal: null,
      ensina: false,
    });
  });

  it("a linha da Fatura fora da fila que perde o Responsável volta como sem_classificacao, só na principal", () => {
    const a = linha("a", { responsavel_id: CASAL, tipo_id: CASA, revisao_motivo: null });
    const p = planejarGravacao(a, { responsavel_id: null }, AGORA);
    expect(p).toEqual({
      vazio: false,
      corpo: { responsavel_id: null, editado_em: AGORA },
      soDaPrincipal: { revisao_motivo: "sem_classificacao", revisao_dados: null, revisado_em: null },
      ensina: false,
    });
    // Ajuste ou linha fora da Fatura: não volta à fila.
    expect(planejarGravacao({ ...a, ajuste_de_id: "m" }, { responsavel_id: null }, AGORA)).toMatchObject({ soDaPrincipal: null });
    expect(planejarGravacao({ ...a, fatura_id: null }, { responsavel_id: null }, AGORA)).toMatchObject({ soDaPrincipal: null });
  });
});

describe("planejarLote", () => {
  const shopee = [linha("s1"), linha("s2"), linha("s3")].map((l) => ({ ...l, tipo_id: CASA }));

  it("3 SHOPEE do Casal, todas com Tipo: as 3 saem da fila numa chamada e geram 3 eventos", () => {
    const plano = planejarLote(
      shopee.map((l) => ({ id: l.id, campos: { responsavel_id: CASAL } })),
      shopee,
      AGORA,
    );
    expect(plano.gravadas).toBe(3);
    expect(plano.itens.map((i) => i.id)).toEqual(["s1", "s2", "s3"]);
    for (const i of plano.itens) {
      expect(i.corpo).toEqual({
        responsavel_id: CASAL,
        revisao_motivo: null,
        revisao_dados: null,
        revisado_em: AGORA,
        editado_em: AGORA,
      });
    }
    expect(plano.eventos).toEqual(
      shopee.map(() => ({ nome: "SHOPEE", responsavelAntes: null, responsavelDepois: CASAL, tipoDepois: CASA })),
    );
  });

  it("o retrato de antes guarda, por linha, as colunas que o lote muda", () => {
    const l = linha("s1", { tipo_id: CASA, revisao_motivo: "sugestao", revisao_dados: { a: 1 }, editado_em: "2026-11-01T00:00:00Z" });
    const plano = planejarLote([{ id: "s1", campos: { responsavel_id: CASAL } }], [l], AGORA);
    expect(plano.antes).toEqual([
      {
        id: "s1",
        corpo: {
          responsavel_id: null,
          revisao_motivo: "sugestao",
          revisao_dados: { a: 1 },
          revisado_em: null,
          editado_em: "2026-11-01T00:00:00Z",
        },
      },
    ]);
  });

  it("falta o Tipo: grava só o Responsável, a linha continua na fila", () => {
    const l = linha("s1");
    const plano = planejarLote([{ id: "s1", campos: { responsavel_id: CASAL } }], [l], AGORA);
    expect(plano.itens).toEqual([{ id: "s1", corpo: { responsavel_id: CASAL, editado_em: AGORA } }]);
  });

  it("a mãe leva os Ajustes: só Responsável/Tipo, editado_em e revisado_em; sem motivo e sem Regra", () => {
    const mae = linha("m", { tipo_id: CASA, revisao_motivo: "sugestao", valor_centavos: 5000 });
    const ajuste = linha("aj", { ajuste_de_id: "m", revisao_motivo: null, valor_centavos: -8, status_id: "s0", observacao: "obs" });
    const plano = planejarLote([{ id: "m", campos: { responsavel_id: CASAL, status_id: "pago", observacao: "nova" } }], [mae, ajuste], AGORA);
    expect(plano.itens.map((i) => i.id)).toEqual(["m", "aj"]);
    expect(plano.itens[1].corpo).toEqual({ responsavel_id: CASAL, revisado_em: AGORA, editado_em: AGORA });
    expect(plano.antes[1]).toEqual({ id: "aj", corpo: { responsavel_id: null, revisado_em: null, editado_em: null } });
    expect(plano.eventos).toHaveLength(1);
    expect(plano.gravadas).toBe(1);
  });

  it("mãe que não sai da fila: o Ajuste leva só a classificação", () => {
    const mae = linha("m");
    const ajuste = linha("aj", { ajuste_de_id: "m", revisao_motivo: null });
    const plano = planejarLote([{ id: "m", campos: { tipo_id: SAUDE } }], [mae, ajuste], AGORA);
    expect(plano.itens[1].corpo).toEqual({ tipo_id: SAUDE, editado_em: AGORA });
  });

  it("só Status ou Observação: os Ajustes não entram", () => {
    const mae = linha("m", { revisao_motivo: null });
    const ajuste = linha("aj", { ajuste_de_id: "m", revisao_motivo: null });
    const plano = planejarLote([{ id: "m", campos: { status_id: "pago" } }], [mae, ajuste], AGORA);
    expect(plano.itens.map((i) => i.id)).toEqual(["m"]);
    expect(plano.eventos).toEqual([]);
  });

  it("Ajuste já entrada do lote não entra duas vezes; Ajuste excluído nunca entra", () => {
    const mae = linha("m", { tipo_id: CASA });
    const ajuste = linha("aj", { ajuste_de_id: "m", revisao_motivo: null });
    const excluido = linha("ex", { ajuste_de_id: "m", revisao_motivo: null, excluido_em: "2026-11-01T00:00:00Z" });
    const plano = planejarLote(
      [
        { id: "m", campos: { responsavel_id: CASAL } },
        { id: "aj", campos: { responsavel_id: CASAL } },
      ],
      [mae, ajuste, excluido],
      AGORA,
    );
    expect(plano.itens.map((i) => i.id)).toEqual(["m", "aj"]);
    expect(plano.eventos).toHaveLength(1); // o Ajuste nunca ensina
    expect(plano.gravadas).toBe(2);
  });

  it("id repetido vale o primeiro; id desconhecido ou excluído é ignorado", () => {
    const l = linha("a");
    const plano = planejarLote(
      [
        { id: "a", campos: { responsavel_id: CASAL } },
        { id: "a", campos: { responsavel_id: RAFAEL } },
        { id: "fantasma", campos: { responsavel_id: CASAL } },
        { id: "x", campos: { responsavel_id: CASAL } },
      ],
      [l, linha("x", { excluido_em: "2026-11-01T00:00:00Z" })],
      AGORA,
    );
    expect(plano.itens).toEqual([{ id: "a", corpo: { responsavel_id: CASAL, editado_em: AGORA } }]);
  });

  it("lote vazio: nada muda, nada é planejado", () => {
    const l = linha("a", { revisao_motivo: null, responsavel_id: CASAL });
    expect(planejarLote([{ id: "a", campos: { responsavel_id: CASAL } }], [l], AGORA)).toEqual({
      itens: [],
      antes: [],
      eventos: [],
      gravadas: 0,
    });
    expect(planejarLote([], [l], AGORA).itens).toEqual([]);
  });

  it("itens com valores diferentes (Aplicar sugestões) cabem no mesmo plano", () => {
    const a = linha("a");
    const b = linha("b", { nome: "AMAZON" });
    const plano = planejarLote(
      [
        { id: "a", campos: { responsavel_id: CASAL, tipo_id: CASA } },
        { id: "b", campos: { responsavel_id: RAFAEL, tipo_id: SAUDE } },
      ],
      [a, b],
      AGORA,
    );
    expect(plano.itens.map((i) => i.corpo.responsavel_id)).toEqual([CASAL, RAFAEL]);
    expect(plano.eventos.map((e) => e.nome)).toEqual(["SHOPEE", "AMAZON"]);
  });

  it("o corpo só tem colunas da lista fechada da RPC", () => {
    const l = linha("a", { tipo_id: CASA });
    const plano = planejarLote([{ id: "a", campos: { responsavel_id: CASAL, status_id: "p", observacao: "o" } }], [l], AGORA);
    for (const i of [...plano.itens, ...plano.antes]) {
      for (const k of Object.keys(i.corpo)) expect(COLUNAS_DO_LOTE as readonly string[]).toContain(k);
    }
  });
});

describe("entradasDeSugestoes", () => {
  const cadastros: CadastrosDaFila = {
    responsaveis: [{ id: CASAL, nome: "Casal", arquivado: false }],
    tipos: [{ id: CASA, nome: "Casa", arquivado: false }],
  };
  const base = (id: string, extra: Partial<LinhaDaFila> = {}): LinhaDaFila => ({
    id,
    nome: `LOJA ${id}`,
    apelido: null,
    mes: "2026-11",
    valor_centavos: 1000,
    parcela_n: null,
    parcela_total: null,
    responsavel_id: null,
    tipo_id: null,
    ajuste_de_id: null,
    excluido_em: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    ordem_fatura: Number(id.replace(/\D/g, "")),
    ...extra,
  });

  it("o que o ✓ grava, inclusive com dúvida; os sem sugestão completa são contados", () => {
    const completa = { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] };
    const itens = montarFila(
      [
        base("a1", { revisao_motivo: "sugestao", revisao_dados: completa }),
        base("a2", { revisao_motivo: "sugestao_duvida", revisao_dados: { ...completa, outros_responsaveis: [] } }),
        base("a3"),
        base("a4", { revisao_motivo: "sugestao", revisao_dados: { responsavel_id: null, tipo_id: CASA, outros_responsaveis: [] } }),
      ],
      cadastros,
    ).flatMap((g) => g.itens);
    expect(entradasDeSugestoes(itens)).toEqual({
      entradas: [
        { id: "a1", campos: { responsavel_id: CASAL, tipo_id: CASA } },
        { id: "a2", campos: { responsavel_id: CASAL, tipo_id: CASA } },
      ],
      semSugestao: 2,
    });
    expect(entradasDeSugestoes([])).toEqual({ entradas: [], semSugestao: 0 });
  });
});

describe("totalDaSelecao", () => {
  const l = (id: string, valor: number, extra: { ajuste_de_id?: string; excluido_em?: string } = {}) => ({
    id,
    valor_centavos: valor,
    ...extra,
  });

  it("soma líquida: a mãe mais os Ajustes (não excluídos)", () => {
    const linhas = [l("m", 114074), l("aj", -8, { ajuste_de_id: "m" }), l("aj2", -2, { ajuste_de_id: "m", excluido_em: "x" }), l("o", 1000)];
    expect(totalDaSelecao(new Set(["m"]), linhas)).toBe(114066);
    expect(totalDaSelecao(new Set(["m", "o"]), linhas)).toBe(115066);
  });

  it("nada duas vezes (Ajuste também marcado) e id desconhecido ou excluído não conta", () => {
    const linhas = [l("m", 1000), l("aj", -8, { ajuste_de_id: "m" }), l("ex", 500, { excluido_em: "x" })];
    expect(totalDaSelecao(new Set(["m", "aj"]), linhas)).toBe(992);
    expect(totalDaSelecao(new Set(["fantasma", "ex"]), linhas)).toBe(0);
    expect(totalDaSelecao(new Set(), linhas)).toBe(0);
  });
});

describe("parcelasDoLote", () => {
  const gravada = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    serie_id: "s1",
    parcela_n: 2,
    lancado_por: "fatura",
    responsavel_id: CASAL,
    tipo_id: CASA,
    ...extra,
  });

  it("só as parcelas com Série, com a classificação de antes (o que mudou) e a de depois", () => {
    const r = parcelasDoLote({
      antes: [{ id: "a", corpo: { responsavel_id: RAFAEL } }],
      linhas: [gravada("a"), gravada("b", { serie_id: null })],
    });
    expect(r).toEqual([
      {
        serie_id: "s1",
        parcela_n: 2,
        lancado_por: "fatura",
        antes: { responsavel_id: RAFAEL, tipo_id: CASA },
        depois: { responsavel_id: CASAL, tipo_id: CASA },
      },
    ]);
  });

  it("coluna que o lote não tocou fica como está nos dois lados; nulo vira nulo", () => {
    const r = parcelasDoLote({
      antes: [{ id: "a", corpo: { tipo_id: null } }],
      linhas: [gravada("a", { responsavel_id: null })],
    });
    expect(r[0].antes).toEqual({ responsavel_id: null, tipo_id: null });
    expect(r[0].depois).toEqual({ responsavel_id: null, tipo_id: CASA });
  });
});
