import { describe, expect, it } from "vitest";
import type { LancamentoParaGravar } from "./importacao-fatura";
import {
  aplicarReimportacao,
  casarReimportacao,
  planejarReimportacao,
  temTrabalhoManual,
  type AntigaParaReimportar,
  type NovaParaPar,
} from "./reimportacao";

let contador = 0;
function antiga(sobre: Partial<AntigaParaReimportar> = {}): AntigaParaReimportar {
  contador++;
  return {
    id: `a${String(contador).padStart(3, "0")}`,
    nome_normalizado: "LOJA",
    valor_centavos: 1000,
    parcela_n: null,
    parcela_total: null,
    ordem_fatura: contador,
    ajuste_de_id: null,
    casado_em: null,
    excluido_em: null,
    responsavel_id: null,
    tipo_id: null,
    status_id: null,
    observacao: null,
    apelido: null,
    editado_em: null,
    divisao: null,
    revisao_motivo: null,
    revisao_dados: null,
    serie: null,
    ...sobre,
  };
}

function nova(ordem: number, sobre: Partial<NovaParaPar> = {}): NovaParaPar {
  return {
    nome_normalizado: "LOJA",
    valor_centavos: 1000,
    parcela_n: null,
    parcela_total: null,
    ordem_fatura: ordem,
    ajuste_de_ordem: null,
    ...sobre,
  };
}

describe("casarReimportacao", () => {
  it("pareia a mesma compra à vista, ignorando a ordem de entrada", () => {
    const a1 = antiga({ ordem_fatura: 1 });
    const a2 = antiga({ nome_normalizado: "OUTRA", ordem_fatura: 2 });
    const r = casarReimportacao([nova(2, { nome_normalizado: "OUTRA" }), nova(1)], [a2, a1]);
    expect(r.pares).toEqual([
      { ordem_fatura: 1, antiga_id: a1.id },
      { ordem_fatura: 2, antiga_id: a2.id },
    ]);
    expect(r.semPar).toEqual([]);
  });

  it("duas compras idênticas: a 1ª com a 1ª e a 2ª com a 2ª pela ordem da fatura", () => {
    const a1 = antiga({ ordem_fatura: 5 });
    const a2 = antiga({ ordem_fatura: 9 });
    const r = casarReimportacao([nova(3), nova(4)], [a2, a1]);
    expect(r.pares).toEqual([
      { ordem_fatura: 3, antiga_id: a1.id },
      { ordem_fatura: 4, antiga_id: a2.id },
    ]);
  });

  it("Valor igual pareia primeiro; o Valor corrigido pega o que sobrou do mesmo Nome (2ª passada)", () => {
    const igual = antiga({ ordem_fatura: 2, valor_centavos: 500 });
    const outro = antiga({ ordem_fatura: 1, valor_centavos: 700 });
    const r = casarReimportacao([nova(1, { valor_centavos: 500 }), nova(2, { valor_centavos: 999 })], [outro, igual]);
    expect(r.pares).toEqual([
      { ordem_fatura: 1, antiga_id: igual.id },
      { ordem_fatura: 2, antiga_id: outro.id },
    ]);
  });

  it("parcela pareia só com a mesma parcela do mesmo Nome; à vista e parcelada não se misturam", () => {
    const p3 = antiga({ parcela_n: 3, parcela_total: 10 });
    const vista = antiga();
    const r = casarReimportacao([nova(1, { parcela_n: 4, parcela_total: 10 }), nova(2, { parcela_n: 3, parcela_total: 10 })], [p3, vista]);
    expect(r.pares).toEqual([{ ordem_fatura: 2, antiga_id: p3.id }]);
    expect(r.semPar).toEqual([vista.id]);
  });

  it("o Ajuste pareia com o Ajuste da mãe pareada; sem Ajuste novo, o antigo fica sem par", () => {
    const mae = antiga({ ordem_fatura: 1, parcela_n: 2, parcela_total: 3 });
    const ajuste = antiga({ ordem_fatura: 2, nome_normalizado: "AJUSTE", valor_centavos: -8, ajuste_de_id: mae.id });
    const novas = [
      nova(1, { parcela_n: 2, parcela_total: 3 }),
      nova(2, { nome_normalizado: "AJUSTE", valor_centavos: -8, ajuste_de_ordem: 1 }),
    ];
    expect(casarReimportacao(novas, [mae, ajuste]).pares).toHaveLength(2);
    const semAjuste = casarReimportacao([novas[0]], [mae, ajuste]);
    expect(semAjuste.pares).toEqual([{ ordem_fatura: 1, antiga_id: mae.id }]);
    expect(semAjuste.semPar).toEqual([ajuste.id]);
  });

  it("linha excluída não pareia e não aparece como sem par", () => {
    const morta = antiga({ excluido_em: "2026-11-01T00:00:00Z" });
    const r = casarReimportacao([nova(1)], [morta]);
    expect(r.pares).toEqual([]);
    expect(r.semPar).toEqual([]);
  });
});

describe("planejarReimportacao", () => {
  const opcoes = { statusPadraoId: "padrao" };

  it("sem trabalho à mão: apaga; com trabalho à mão, Apelido, Observação ou Status: sai da Fatura", () => {
    const limpa = antiga({ nome_normalizado: "L1", status_id: "padrao", responsavel_id: "r", tipo_id: "t" });
    const editada = antiga({ nome_normalizado: "L2", status_id: "padrao", editado_em: "2026-11-02T00:00:00Z" });
    const apelido = antiga({ nome_normalizado: "L3", status_id: "padrao", apelido: "Mercado" });
    const obs = antiga({ nome_normalizado: "L4", status_id: "padrao", observacao: "pagar dia 5" });
    const status = antiga({ nome_normalizado: "L5", status_id: "pago" });
    const plano = planejarReimportacao([], [limpa, editada, apelido, obs, status], opcoes);
    expect(plano.apagar).toEqual([limpa.id]);
    expect(plano.sumiram.sort()).toEqual([editada.id, apelido.id, obs.id, status.id].sort());
    expect(plano.voltar_a_previsto).toEqual([]);
  });

  it("Observação só com espaços não conta como trabalho", () => {
    expect(temTrabalhoManual({ editado_em: null, apelido: null, observacao: "  ", status_id: null }, null)).toBe(false);
  });

  it("a casada sem par volta a previsto, mesmo mexida à mão", () => {
    const a = antiga({ casado_em: "2026-11-01T00:00:00Z", editado_em: "2026-11-02T00:00:00Z", parcela_n: 2, parcela_total: 5 });
    const plano = planejarReimportacao([], [a], opcoes);
    expect(plano.voltar_a_previsto).toEqual([a.id]);
    expect(plano.sumiram).toEqual([]);
  });

  it("linha referenciada (Pagamento, Épico 6) sai da Fatura em vez de ser apagada", () => {
    const a = antiga({ status_id: "padrao" });
    const plano = planejarReimportacao([], [a], { ...opcoes, referenciadas: new Set([a.id]) });
    expect(plano.sumiram).toEqual([a.id]);
    expect(plano.apagar).toEqual([]);
  });

  it("o Ajuste sem par acompanha a mãe: sai com ela se ela sai, senão é apagado", () => {
    const mae = antiga({ editado_em: "2026-11-02T00:00:00Z", status_id: "padrao" });
    const ajuste = antiga({ ajuste_de_id: mae.id, valor_centavos: -8, status_id: "padrao" });
    const mae2 = antiga({ casado_em: "2026-11-01T00:00:00Z" });
    const ajuste2 = antiga({ ajuste_de_id: mae2.id, valor_centavos: -8 });
    const plano = planejarReimportacao([], [mae, ajuste, mae2, ajuste2], opcoes);
    expect(plano.sumiram.sort()).toEqual([mae.id, ajuste.id].sort());
    expect(plano.voltar_a_previsto).toEqual([mae2.id]);
    expect(plano.apagar).toEqual([ajuste2.id]);
  });

  it("conta o resumo: mantidas, Valor mudou, novas, apagadas, sumiram, voltaram e excluídos", () => {
    const mantida = antiga({ nome_normalizado: "A", valor_centavos: 100 });
    const mudou = antiga({ nome_normalizado: "B", valor_centavos: 200 });
    const apagada = antiga({ nome_normalizado: "C", status_id: "padrao" });
    const sumiu = antiga({ nome_normalizado: "D", editado_em: "2026-11-02T00:00:00Z" });
    const voltou = antiga({ nome_normalizado: "E", casado_em: "2026-11-01T00:00:00Z" });
    const excluida = antiga({ nome_normalizado: "F", excluido_em: "2026-11-03T00:00:00Z" });
    const novas = [
      nova(1, { nome_normalizado: "A", valor_centavos: 100 }),
      nova(2, { nome_normalizado: "B", valor_centavos: 250 }),
      nova(3, { nome_normalizado: "G" }),
      nova(4, { nome_normalizado: "F" }),
    ];
    const plano = planejarReimportacao(novas, [mantida, mudou, apagada, sumiu, voltou, excluida], { statusPadraoId: "padrao" });
    expect(plano.resumo).toEqual({
      quantidade: 5,
      mantidas: 2,
      valorMudou: 1,
      novas: 2,
      apagadas: 1,
      sumiram: 1,
      voltaramAPrevisto: 1,
      excluidos: 1,
    });
  });
});

type Nova = LancamentoParaGravar;
function linhaNova(ordem: number, sobre: Partial<Nova> = {}): Nova {
  return {
    nome: "LOJA",
    nome_normalizado: "LOJA",
    valor_centavos: 1000,
    data: "2026-10-01",
    parcela_n: null,
    parcela_total: null,
    final_cartao: "1234",
    ordem_fatura: ordem,
    duvida_extracao: false,
    ajuste_de_ordem: null,
    tipo_sugerido: null,
    responsavel_id: "regra-r",
    tipo_id: "regra-t",
    revisao_motivo: null,
    revisao_dados: null,
    serie: null,
    ...sobre,
  };
}

describe("aplicarReimportacao", () => {
  it("a classificação da casada vence a da Regra e ela mantém o id", () => {
    const a = antiga({ responsavel_id: "meu-r", tipo_id: "meu-t", status_id: "padrao" });
    const plano = planejarReimportacao([linhaNova(1)], [a], { statusPadraoId: "padrao" });
    const [l] = aplicarReimportacao([linhaNova(1)], plano, [a], []);
    expect(l).toMatchObject({ antiga_id: a.id, previsto_id: null, responsavel_id: "meu-r", tipo_id: "meu-t", revisao_motivo: null });
  });

  it("a Regra só completa o campo vazio da casada", () => {
    const a = antiga({ responsavel_id: "meu-r", tipo_id: null });
    const plano = planejarReimportacao([linhaNova(1)], [a], { statusPadraoId: null });
    const [l] = aplicarReimportacao([linhaNova(1)], plano, [a], []);
    expect(l).toMatchObject({ responsavel_id: "meu-r", tipo_id: "regra-t", revisao_motivo: null });
  });

  it("Valor diferente e já classificada: Valor mudou com o Valor de antes", () => {
    const a = antiga({ responsavel_id: "meu-r", tipo_id: "meu-t", valor_centavos: 1000 });
    const novaLinha = linhaNova(1, { valor_centavos: 1234 });
    const plano = planejarReimportacao([novaLinha], [a], { statusPadraoId: null });
    const [l] = aplicarReimportacao([novaLinha], plano, [a], []);
    expect(l).toMatchObject({ revisao_motivo: "valor_mudou", revisao_dados: { antes_centavos: 1000 } });
  });

  it("Valor diferente mas sem classificação completa: o motivo é o da classificação normal", () => {
    const a = antiga({ valor_centavos: 1000 });
    const novaLinha = linhaNova(1, { valor_centavos: 1234, responsavel_id: null, tipo_id: null, revisao_motivo: "sem_classificacao" });
    const plano = planejarReimportacao([novaLinha], [a], { statusPadraoId: null });
    const [l] = aplicarReimportacao([novaLinha], plano, [a], []);
    expect(l.revisao_motivo).toBe("sem_classificacao");
  });

  it("Valor igual: o "+'"Valor mudou"'+" que Rafael ainda não resolveu continua na fila", () => {
    const a = antiga({
      responsavel_id: "meu-r",
      tipo_id: "meu-t",
      revisao_motivo: "valor_mudou",
      revisao_dados: { antes_centavos: 900 },
    });
    const plano = planejarReimportacao([linhaNova(1)], [a], { statusPadraoId: null });
    const [l] = aplicarReimportacao([linhaNova(1)], plano, [a], []);
    expect(l).toMatchObject({ revisao_motivo: "valor_mudou", revisao_dados: { antes_centavos: 900 } });
  });

  it("a Divisão da casada é mantida e as partes refeitas no Valor novo, com o id das filhas", () => {
    const divisao = {
      modo: "proporcao" as const,
      partes: [
        { responsavel_id: "r1", numerador: 1, denominador: 3, filha_id: "f1" },
        { responsavel_id: "r2", numerador: 2, denominador: 3, filha_id: "f2" },
      ],
    };
    const a = antiga({ divisao, tipo_id: "meu-t", valor_centavos: 900 });
    const novaLinha = linhaNova(1, { valor_centavos: 1000 });
    const plano = planejarReimportacao([novaLinha], [a], { statusPadraoId: null });
    const [l] = aplicarReimportacao([novaLinha], plano, [a], []);
    expect(l.responsavel_id).toBeNull();
    expect(l.divisao).not.toBeNull();
    expect(l.partes?.map((p) => p.filha_id)).toEqual(["f1", "f2"]);
    expect(l.partes?.reduce((s, p) => s + p.valor_centavos, 0)).toBe(1000);
  });

  it("a nova sem par usa as Regras de agora e não tem antiga", () => {
    const plano = planejarReimportacao([linhaNova(1)], [], { statusPadraoId: null });
    const [l] = aplicarReimportacao([linhaNova(1)], plano, [], []);
    expect(l).toMatchObject({ antiga_id: null, previsto_id: null, responsavel_id: "regra-r", tipo_id: "regra-t" });
  });

  it("o Ajuste pareado não tem motivo próprio e segue a mãe", () => {
    const mae = antiga({ ordem_fatura: 1, responsavel_id: "meu-r", tipo_id: "meu-t", valor_centavos: 5000 });
    const ajuste = antiga({ ordem_fatura: 2, nome_normalizado: "AJ", valor_centavos: -8, ajuste_de_id: mae.id });
    const novas = [
      linhaNova(1, { valor_centavos: 5000 }),
      linhaNova(2, { nome_normalizado: "AJ", nome: "AJ", valor_centavos: -9, ajuste_de_ordem: 1 }),
    ];
    const plano = planejarReimportacao(novas, [mae, ajuste], { statusPadraoId: null });
    const r = aplicarReimportacao(novas, plano, [mae, ajuste], []);
    expect(r[1]).toMatchObject({ antiga_id: ajuste.id, revisao_motivo: null, responsavel_id: "meu-r", tipo_id: "meu-t" });
  });

  it("a nova sem par de uma Série ocupada por uma antiga que sai da Fatura sobe a ocorrência", () => {
    const serie = { nome_normalizado: "LOJA", parcela_total: 5, valor_parcela_centavos: 1000, mes_primeira_parcela: "2026-09", ocorrencia: 1 };
    const sumida = antiga({ parcela_n: 2, parcela_total: 5, serie, editado_em: "2026-11-02T00:00:00Z" });
    const novaLinha = linhaNova(1, { parcela_n: 2, parcela_total: 5, serie, nome_normalizado: "LOJA" });
    // Outro Nome: não pareia com a antiga, mas a Série (mesma chave) está ocupada pela que sai.
    const plano = planejarReimportacao([{ ...novaLinha, nome_normalizado: "OUTRO" }], [sumida], { statusPadraoId: null });
    expect(plano.sumiram).toEqual([sumida.id]);
    const [l] = aplicarReimportacao([novaLinha], { ...plano, pares: [] }, [sumida], []);
    expect(l.serie?.ocorrencia).toBe(2);
  });
});
