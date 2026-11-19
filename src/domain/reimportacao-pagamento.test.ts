import { describe, expect, it } from "vitest";
import { avaliar, type Formula } from "./formula";
import type { ItemLido } from "./pagamento";
import { projetarPendente, type LancamentoParaPendente } from "./projecoes";
import { planejarReimportacao, type AntigaParaReimportar, type PlanoDeReimportacao } from "./reimportacao";

// O teste de aceite da 6.9 no núcleo (FR-51, AD-10, AD-11, AD-15): reimportar um Mês com Pagamentos termina com o
// MESMO Saldo pendente. A RPC só executa o plano; aqui o plano do núcleo é aplicado a um Mês simulado e o Saldo
// (`projetarPendente` + a Fórmula do Bloco) é comparado antes e depois. A prova no banco é `test/integracao/pagamento-reimportar.test.ts`.

const PADRAO = "s-nao";
const PAGO = "s-pago";
const MAE: Formula = { tipo: "responsavel", id: "mae" };
const EXCLUIDA = "2026-11-03T00:00:00Z";

const antiga = (id: string, ordem: number, extra: Partial<AntigaParaReimportar> = {}): AntigaParaReimportar => ({
  id,
  nome_normalizado: id.toUpperCase(),
  valor_centavos: 10_000,
  parcela_n: null,
  parcela_total: null,
  ordem_fatura: ordem,
  ajuste_de_id: null,
  casado_em: null,
  excluido_em: null,
  responsavel_id: "mae",
  tipo_id: "casa",
  status_id: PADRAO,
  observacao: null,
  apelido: null,
  editado_em: null,
  divisao: null,
  revisao_motivo: null,
  revisao_dados: null,
  serie: null,
  ...extra,
});

const nova = (a: AntigaParaReimportar, i: number) => ({
  nome_normalizado: a.nome_normalizado,
  valor_centavos: a.valor_centavos,
  parcela_n: null,
  parcela_total: null,
  ordem_fatura: i + 1,
  ajuste_de_ordem: null,
});

const paraPendente = (a: AntigaParaReimportar): LancamentoParaPendente => ({
  id: a.id,
  mes: "2026-10",
  excluido_em: a.excluido_em,
  valor_centavos: a.valor_centavos,
  responsavel_id: a.responsavel_id,
  tipo_id: a.tipo_id,
  status_id: a.status_id,
  lancado_por: "fatura",
});

function saldo(linhas: readonly AntigaParaReimportar[], itens: readonly ItemLido[]): number {
  const r = avaliar(
    MAE,
    projetarPendente(linhas.map(paraPendente), { statusPagos: new Set([PAGO]), itens, hoje: "2026-11-15" }),
  );
  if (!r.ok) throw new Error("a Fórmula não calcula");
  return r.valor.valorCentavos;
}

/** O que a RPC faz com o plano: pareadas e `sumiram` ficam (vivas), `apagar` sai, a excluída sem item sai, a com item fica. */
function aplicar(
  antigas: readonly AntigaParaReimportar[],
  plano: PlanoDeReimportacao,
  comItem: ReadonlySet<string>,
): AntigaParaReimportar[] {
  const apagadas = new Set(plano.apagar);
  return antigas.filter((a) => !apagadas.has(a.id) && !(a.excluido_em !== null && !comItem.has(a.id)));
}

describe("reimportar um Mês com Pagamentos termina com o mesmo Saldo pendente (aceite da 6.9)", () => {
  // Outubro: A e D pagas por inteiro, B paga em parte (item de R$ 20,00), C em aberto, E paga e depois excluída.
  const A = antiga("a", 1, { status_id: PAGO });
  const B = antiga("b", 2, { valor_centavos: 5_000 });
  const C = antiga("c", 3, { valor_centavos: 3_000 });
  const D = antiga("d", 4, { valor_centavos: 700, status_id: PAGO });
  const E = antiga("e", 5, { valor_centavos: 2_000, status_id: PAGO, excluido_em: EXCLUIDA });
  const antigas = [A, B, C, D, E];
  const itens: ItemLido[] = [
    { lancamento_id: "a", valor_centavos: 10_000, status_aplicado_id: PAGO },
    { lancamento_id: "b", valor_centavos: 2_000, status_aplicado_id: null },
    { lancamento_id: "d", valor_centavos: 700, status_aplicado_id: PAGO },
    { lancamento_id: "e", valor_centavos: 2_000, status_aplicado_id: PAGO },
  ];
  const referenciadas = new Set(itens.map((i) => i.lancamento_id));

  it("a Fatura nova só traz A, B e C: D sai da Fatura (continua contando), E fica excluída com o crédito, o Saldo é o mesmo", () => {
    const antes = saldo(antigas, itens);
    expect(antes).toBe(3_000 + 3_000 - 2_000);

    const plano = planejarReimportacao([A, B, C].map(nova), antigas, { statusPadraoId: PADRAO, referenciadas });
    expect(plano.pares.map((p) => p.antiga_id)).toEqual(["a", "b", "c"]);
    expect(plano.sumiram).toEqual(["d"]);
    expect(plano.apagar).toEqual([]);
    expect(plano.resumo).toMatchObject({ mantidas: 3, sumiram: 1, apagadas: 0, excluidos: 1, excluidosComPagamento: 1 });

    expect(saldo(aplicar(antigas, plano, referenciadas), itens)).toBe(antes);
  });

  it("uma linha sem par com Pagamento e SEM trabalho manual nunca vai para `apagar` (era a falha pela FK)", () => {
    const parcial = antiga("p", 6, { valor_centavos: 4_000 });
    const itensParcial: ItemLido[] = [{ lancamento_id: "p", valor_centavos: 1_000, status_aplicado_id: null }];
    const plano = planejarReimportacao([], [parcial], { statusPadraoId: PADRAO, referenciadas: new Set(["p"]) });
    expect(plano.apagar).toEqual([]);
    expect(plano.sumiram).toEqual(["p"]);
    expect(saldo(aplicar([parcial], plano, new Set(["p"])), itensParcial)).toBe(saldo([parcial], itensParcial));
  });

  it("a invariante: nenhuma linha com item (vivo ou de um Pagamento desfeito) cai em `apagar`, só a limpa", () => {
    const limpa = antiga("limpa", 7);
    const comDesfeito = antiga("desfeito", 8);
    const plano = planejarReimportacao([], [limpa, comDesfeito], { statusPadraoId: PADRAO, referenciadas: new Set(["desfeito"]) });
    expect(plano.apagar).toEqual(["limpa"]);
    expect(plano.sumiram).toEqual(["desfeito"]);
  });

  it("sem `referenciadas` (leitura velha) o plano apagaria a linha paga: é o que a RPC recusa (fatura.mes_mudou)", () => {
    const plano = planejarReimportacao([], [B], { statusPadraoId: PADRAO, referenciadas: new Set() });
    expect(plano.apagar).toEqual(["b"]);
  });
});
