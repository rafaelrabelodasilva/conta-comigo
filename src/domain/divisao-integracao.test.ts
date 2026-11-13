// História 3.8: a Divisão nas regras que já existiam (Regra, classificação,
// herança, previstos, casamento, fila, lote, Conferência e reimportação).
import { describe, expect, it } from "vitest";
import { classificarImportacao } from "./classificacao";
import { conferir } from "./conferencia";
import { type Divisao } from "./divisao";
import { mesclarHerdada } from "./heranca";
import { planejarReimportacao, type AntigaParaReimportar } from "./reimportacao";
import { planejarGravacao, planejarLote, type LinhaParaGravar } from "./lote";
import { aplicarCasamento, casarPrevistos, gerarPrevistos, type PrevistoParaCasar } from "./previstos";
import {
  aprenderRegra,
  divisaoDaRegra,
  editarRegra,
  entradasDaReaplicacao,
  type RegraGravada,
} from "./regras";
import { contarFila, ehDaFila, resumoDaImportacao } from "./revisar";

const AGORA = "2026-11-11T12:00:00.000Z";
const MAE = "r-mae";
const RAFAEL = "r-rafael";

const doisTercos: Divisao = {
  modo: "proporcao",
  partes: [
    { responsavel_id: MAE, numerador: 2, denominador: 3 },
    { responsavel_id: RAFAEL, numerador: 1, denominador: 3 },
  ],
};

const regra = (extra: Partial<RegraGravada> = {}): RegraGravada => ({
  chave: "JIM COM",
  versao_normalizacao: 1,
  responsavel_id: null,
  tipo_id: "t-saude",
  contagem: [],
  ultimo_uso: AGORA,
  divisao: doisTercos,
  ...extra,
});

const ativos = { responsaveis: new Set([MAE, RAFAEL]), tipos: new Set(["t-saude"]) };

describe("Regra com Divisão", () => {
  it("dividir ensina a Divisão à Regra, sem filha_id, e escolher Responsável a limpa", () => {
    const comFilha: Divisao = { ...doisTercos, partes: [{ ...doisTercos.partes[0], filha_id: "f1" }, doisTercos.partes[1]], responsavel_antes: "x" };
    const ensinada = aprenderRegra(null, { nome: "JIM COM 123", responsavelAntes: null, responsavelDepois: null, tipoDepois: "t-saude", divisao: comFilha }, AGORA);
    expect(ensinada.divisao).toEqual(doisTercos);
    expect(ensinada.contagem).toEqual([]);
    expect(ensinada.tipo_id).toBe("t-saude");
    const escolhida = aprenderRegra(
      { ...ensinada, divisao: ensinada.divisao },
      { nome: "JIM COM 123", responsavelAntes: null, responsavelDepois: RAFAEL, tipoDepois: null },
      AGORA,
    );
    expect(escolhida.divisao).toBeNull();
    expect(escolhida.responsavel_id).toBe(RAFAEL);
  });

  it("gravar só o Tipo não mexe na Divisão; desfazer a divisão (null) a limpa", () => {
    const soTipo = aprenderRegra(regra(), { nome: "JIM COM", responsavelAntes: null, responsavelDepois: null, tipoDepois: "t-saude" }, AGORA);
    expect(soTipo.divisao).toEqual(doisTercos);
    const desfeita = aprenderRegra(regra(), { nome: "JIM COM", responsavelAntes: null, responsavelDepois: null, tipoDepois: null, divisao: null }, AGORA);
    expect(desfeita.divisao).toBeNull();
  });

  it("só vale com Tipo e Responsáveis ativos e leva a chave da Regra", () => {
    expect(divisaoDaRegra(regra(), ativos)).toEqual({ ...doisTercos, regra_chave: "JIM COM" });
    expect(divisaoDaRegra(regra({ tipo_id: null }), ativos)).toBeNull();
    expect(divisaoDaRegra(regra(), { ...ativos, responsaveis: new Set([MAE]) })).toBeNull();
    expect(divisaoDaRegra(regra({ divisao: { modo: "x" } }), ativos)).toBeNull();
    expect(divisaoDaRegra(regra({ divisao: undefined }), ativos)).toBeNull();
  });

  it("'Remover divisão' limpa só a Divisão; mudar o Responsável também a limpa", () => {
    const r = regra({ responsavel_id: RAFAEL, contagem: [{ responsavel_id: RAFAEL, n: 2 }] });
    expect(editarRegra(r, { divisao: null })).toEqual({
      ok: true,
      valor: { responsavel_id: RAFAEL, tipo_id: "t-saude", contagem: [{ responsavel_id: RAFAEL, n: 2 }], divisao: null },
    });
    const mudou = editarRegra(r, { responsavel_id: MAE });
    expect(mudou.ok && mudou.valor?.divisao).toBeNull();
    const soTipo = editarRegra(r, { tipo_id: "t-outro" });
    expect(soTipo.ok && soTipo.valor && "divisao" in soTipo.valor).toBe(false);
    expect(editarRegra(regra({ divisao: null }), { divisao: null })).toEqual({ ok: true, valor: null });
  });

  it("a reaplicação da Regra nunca chega às filhas", () => {
    const linhas = [
      { id: "m", nome: "JIM COM", mes: "2026-11", responsavel_id: null, tipo_id: null, ajuste_de_id: null, excluido_em: null },
      { id: "f", nome: "JIM COM", mes: "2026-11", responsavel_id: null, tipo_id: null, ajuste_de_id: null, excluido_em: null, dividido_de_id: "m" },
    ];
    expect(entradasDaReaplicacao("JIM COM", { tipo_id: "t" }, linhas, "2026-11").map((e) => e.id)).toEqual(["m"]);
  });
});

describe("classificarImportacao com a Divisão da Regra", () => {
  const cadastros = {
    responsaveis: [{ id: MAE, arquivado: false }, { id: RAFAEL, arquivado: false }],
    tipos: [{ id: "t-saude", nome: "Saúde", arquivado: false }],
  };
  const linha = (extra = {}) => ({ nome: "JIM COM 5765", tipo_sugerido: null, ordem_fatura: 1, ajuste_de_ordem: null, valor_centavos: 46600, ...extra });

  it("divide sozinha: mãe sem Responsável, sem motivo, com a Divisão e a chave", () => {
    const [l] = classificarImportacao([linha()], [regra()], cadastros);
    expect(l).toMatchObject({ responsavel_id: null, tipo_id: "t-saude", revisao_motivo: null, revisao_dados: null });
    expect(l.divisao).toEqual({ ...doisTercos, regra_chave: "JIM COM" });
  });

  it("não divide a mãe de um Ajuste, nem Valor que zera uma parte, nem Regra sem Tipo", () => {
    const [mae, ajuste] = classificarImportacao(
      [linha(), linha({ ordem_fatura: 2, ajuste_de_ordem: 1, valor_centavos: -8 })],
      [regra()],
      cadastros,
    );
    expect(mae.divisao).toBeUndefined();
    expect(mae.revisao_motivo).not.toBeNull();
    expect(ajuste.responsavel_id).toBeNull();
    const [pequena] = classificarImportacao([linha({ valor_centavos: 1 })], [regra()], cadastros);
    expect(pequena.divisao).toBeUndefined();
    const [semTipo] = classificarImportacao([linha()], [regra({ tipo_id: null })], cadastros);
    expect(semTipo.divisao).toBeUndefined();
  });
});

describe("herança da Divisão", () => {
  const l = { responsavel_id: null as string | null, tipo_id: null as string | null, revisao_motivo: "sem_classificacao" as const, revisao_dados: null };

  it("a candidata dividida deixa a linha dividida e sem Responsável, sem motivo", () => {
    const r = mesclarHerdada(l, { responsavel_id: null, tipo_id: "t1", apelido: null, observacao: null, divisao: doisTercos });
    expect(r).toMatchObject({ responsavel_id: null, tipo_id: "t1", divisao: doisTercos, revisao_motivo: null });
  });

  it("a candidata com Responsável tira a Divisão que a Regra pôs; sem nada, vale a da Regra", () => {
    const daRegra = { ...l, divisao: doisTercos };
    const r = mesclarHerdada(daRegra, { responsavel_id: "r1", tipo_id: "t1", apelido: null, observacao: null });
    expect(r).toMatchObject({ responsavel_id: "r1", divisao: null });
    const nada = mesclarHerdada({ ...daRegra, tipo_id: "t1", revisao_motivo: null as never }, { responsavel_id: null, tipo_id: null, apelido: null, observacao: null });
    expect(nada).toMatchObject({ responsavel_id: null, divisao: doisTercos, revisao_motivo: null });
  });
});

describe("previstos e casamento com Divisão", () => {
  const real = {
    nome: "MAG",
    nome_normalizado: "MAG",
    valor_centavos: 10000,
    parcela_n: 4,
    parcela_total: 6,
    ordem_fatura: 1,
    responsavel_id: null,
    tipo_id: "t-saude",
    divisao: doisTercos,
    serie: { nome_normalizado: "MAG", parcela_total: 6, valor_parcela_centavos: 10000, mes_primeira_parcela: "2026-07", ocorrencia: 1 },
  };

  it("o previsto herda a Divisão (sem filha_id) e nasce com as partes", () => {
    const comFilha: Divisao = { ...doisTercos, partes: [{ ...doisTercos.partes[0], filha_id: "x" }, doisTercos.partes[1]] };
    const ps = gerarPrevistos([{ ...real, divisao: comFilha }], "2026-10");
    expect(ps.map((p) => p.parcela_n)).toEqual([5, 6]);
    expect(ps[0].divisao).toEqual(doisTercos);
    expect(ps[0].partes?.map((p) => [p.filha_id, p.valor_centavos])).toEqual([[null, 6667], [null, 3333]]);
    expect(ps[0].responsavel_id).toBeNull();
  });

  it("sem Divisão o previsto não leva divisao nem partes", () => {
    const [p] = gerarPrevistos([{ ...real, divisao: null }], "2026-10");
    expect(p.divisao).toBeUndefined();
    expect(p.partes).toBeUndefined();
  });

  const previsto = (extra: Partial<PrevistoParaCasar> = {}): PrevistoParaCasar => ({
    id: "p1",
    nome_normalizado: "MAG",
    parcela_n: 5,
    parcela_total: 6,
    valor_centavos: 10000,
    ocorrencia: 1,
    responsavel_id: null,
    tipo_id: "t-saude",
    divisao: { ...doisTercos, partes: [{ ...doisTercos.partes[0], filha_id: "fa" }, { ...doisTercos.partes[1], filha_id: "fb" }] },
    ...extra,
  });
  const casada = (valor: number) => ({
    nome_normalizado: "MAG",
    valor_centavos: valor,
    parcela_n: 5,
    parcela_total: 6,
    ordem_fatura: 7,
    ajuste_de_ordem: null,
    responsavel_id: null,
    tipo_id: null,
    revisao_motivo: "sem_classificacao" as const,
    revisao_dados: null,
    serie: null,
  });

  it("o casado mantém a Divisão e as filhas do previsto (Valor igual: sem motivo)", () => {
    const p = previsto();
    const casamento = casarPrevistos([casada(10000)], [p]);
    const [l] = aplicarCasamento([casada(10000)], casamento, [p]);
    expect(l.previsto_id).toBe("p1");
    expect(l.divisao?.partes.map((x) => x.filha_id)).toEqual(["fa", "fb"]);
    expect(l.responsavel_id).toBeNull();
    expect(l.revisao_motivo).toBeNull();
    expect(l.partes?.map((x) => [x.filha_id, x.valor_centavos])).toEqual([["fa", 6667], ["fb", 3333]]);
  });

  it("Valor mudou: o núcleo recalcula as filhas (soma = Valor da Fatura) e pede revisão", () => {
    const p = previsto();
    const [l] = aplicarCasamento([casada(20000)], casarPrevistos([casada(20000)], [p]), [p]);
    expect(l.revisao_motivo).toBe("valor_mudou");
    expect(l.partes?.map((x) => x.valor_centavos)).toEqual([13333, 6667]);
    expect(l.partes?.reduce((s, x) => s + x.valor_centavos, 0)).toBe(20000);
  });

  it("a Divisão da Regra não vale para o casado sem Divisão no previsto", () => {
    const p = previsto({ divisao: null, responsavel_id: "r1" });
    const [l] = aplicarCasamento([{ ...casada(10000), divisao: doisTercos }], casarPrevistos([casada(10000)], [p]), [p]);
    expect(l.divisao).toBeNull();
    expect(l.responsavel_id).toBe("r1");
  });

  it("linha nova com Divisão da Regra ganha as partes; se alguma zera, perde a Divisão e vai para a fila", () => {
    const nova = (valor: number) => ({ ...casada(valor), parcela_n: null, parcela_total: null, tipo_id: "t-saude", revisao_motivo: null, divisao: doisTercos });
    const [ok] = aplicarCasamento([nova(46600)], { casados: [], semPar: [] }, []);
    expect(ok.partes?.map((x) => x.valor_centavos)).toEqual([31067, 15533]);
    const [zero] = aplicarCasamento([nova(1)], { casados: [], semPar: [] }, []);
    expect(zero.divisao).toBeNull();
    expect(zero.revisao_motivo).toBe("sem_classificacao");
  });
});

describe("fila, lote, Conferência e reimportação com Divisão", () => {
  it("filha nunca entra na fila; a mãe dividida sai quando tem Tipo", () => {
    const filha = { excluido_em: null, ajuste_de_id: null, dividido_de_id: "m", revisao_motivo: "sem_classificacao" as const };
    expect(ehDaFila(filha)).toBe(false);
    expect(contarFila([filha, { ...filha, dividido_de_id: null }])).toBe(1);
  });

  it("o resumo da importação não conta filhas", () => {
    const ls = [
      { fatura_id: "f", ajuste_de_id: null, excluido_em: null },
      { fatura_id: "f", ajuste_de_id: null, excluido_em: null, dividido_de_id: "x" },
    ];
    expect(resumoDaImportacao(ls, "f", 0).lancamentos).toBe(1);
  });

  it("mãe dividida ignora o pedido de Responsável e continua fora da fila", () => {
    const mae: LinhaParaGravar = {
      responsavel_id: null,
      tipo_id: "t",
      revisao_motivo: null,
      revisao_dados: null,
      editado_em: null,
      fatura_id: "f",
      ajuste_de_id: null,
      divisao: doisTercos,
    };
    expect(planejarGravacao(mae, { responsavel_id: RAFAEL }, AGORA)).toEqual({ vazio: true });
    const p = planejarGravacao(mae, { tipo_id: null }, AGORA);
    expect(p.vazio).toBe(false);
    if (!p.vazio) expect(p.soDaPrincipal).toMatchObject({ revisao_motivo: "sem_classificacao" });
    const lote = planejarLote(
      [{ id: "m", campos: { responsavel_id: RAFAEL, status_id: "s" } }],
      [{ ...mae, id: "m", nome: "JIM", valor_centavos: 100, status_id: null, observacao: null, revisado_em: null, excluido_em: null }],
      AGORA,
    );
    expect(lote.itens[0].corpo).not.toHaveProperty("responsavel_id");
    expect(lote.itens[0].corpo.status_id).toBe("s");
    expect(lote.eventos).toEqual([]);
  });

  it("o lote leva o Tipo e a Observação para as filhas da mãe dividida, mas não o Responsável", () => {
    const base = {
      responsavel_id: null,
      tipo_id: "t-velho",
      revisao_motivo: null,
      revisao_dados: null,
      editado_em: null,
      fatura_id: "f",
      ajuste_de_id: null,
      nome: "JIM",
      valor_centavos: 100,
      status_id: null,
      observacao: null,
      revisado_em: null,
      excluido_em: null,
    };
    const linhas = [
      { ...base, id: "m", divisao: doisTercos },
      { ...base, id: "f1", responsavel_id: MAE, dividido_de_id: "m" },
      { ...base, id: "f2", responsavel_id: RAFAEL, dividido_de_id: "m" },
      { ...base, id: "x", dividido_de_id: "outra" },
    ];
    const plano = planejarLote([{ id: "m", campos: { tipo_id: "t-novo", observacao: "nota", responsavel_id: RAFAEL } }], linhas, AGORA);
    expect(plano.itens.map((i) => i.id)).toEqual(["m", "f1", "f2"]);
    expect(plano.itens[0].corpo).toMatchObject({ tipo_id: "t-novo", observacao: "nota" });
    expect(plano.itens[0].corpo).not.toHaveProperty("responsavel_id");
    expect(plano.itens[1].corpo).toEqual({ tipo_id: "t-novo", observacao: "nota", editado_em: AGORA });
    expect(plano.antes.find((i) => i.id === "f1")?.corpo).toMatchObject({ tipo_id: "t-velho", observacao: null });
  });

  it("a Conferência soma a mãe e ignora as filhas", () => {
    const fatura = { id: "f", total_despesas_centavos: 46600, total_creditos_centavos: 0 };
    const base = { fatura_id: "f", final_cartao: "5061", excluido_em: null };
    const c = conferir(fatura, [{ fatura_id: "f", final: "5061", total_centavos: 46600 }], [
      { ...base, valor_centavos: 46600 },
      { ...base, valor_centavos: 31067, dividido_de_id: "m" },
      { ...base, valor_centavos: 15533, dividido_de_id: "m" },
    ]);
    expect(c.conferido).toBe(true);
    expect(c.quantidade).toBe(1);
  });

  it("a reimportação mantém a mãe dividida (pareia pelo Nome) e não olha as filhas", () => {
    const antiga: AntigaParaReimportar = {
      id: "m",
      nome_normalizado: "JIM COM",
      valor_centavos: 46600,
      parcela_n: null,
      parcela_total: null,
      ordem_fatura: 1,
      ajuste_de_id: null,
      casado_em: null,
      excluido_em: null,
      responsavel_id: null,
      tipo_id: "t",
      status_id: "s",
      observacao: null,
      apelido: null,
      editado_em: null,
      divisao: doisTercos,
      revisao_motivo: null,
      revisao_dados: null,
      serie: null,
    };
    const nova = { nome_normalizado: "JIM COM", valor_centavos: 46600, parcela_n: null, parcela_total: null, ordem_fatura: 1, ajuste_de_ordem: null };
    const plano = planejarReimportacao([nova], [antiga], { statusPadraoId: "s" });
    expect(plano.pares).toEqual([{ ordem_fatura: 1, antiga_id: "m" }]);
    expect(plano.resumo).toMatchObject({ quantidade: 1, mantidas: 1, novas: 0, apagadas: 0 });
  });

});
