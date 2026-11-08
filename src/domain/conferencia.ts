// Conferência da Fatura gravada (História 2.5, FR-6) e a marca "verificar".
// A regra da soma é a mesma da importação (`somarConferencia` em
// `extracao-fatura.ts`, `montarConferencia` em `importacao-fatura.ts`):
// aqui ela só recebe as linhas gravadas em vez da extração.
//
// - Entram só os Lançamentos não excluídos com o `fatura_id` da Fatura.
// - "Verificar" é derivado, nunca gravado: o Lançamento está num cartão com
//   diferença; sem cartão com diferença e com os créditos diferentes, os
//   créditos. Some sozinho quando a Conferência bate. `duvida_extracao`
//   sozinho não marca: só põe a linha primeiro na ordem padrão.

import { somarConferencia } from "./extracao-fatura";
import { montarConferencia, type ConferenciaImportacao } from "./importacao-fatura";

/** O que a Conferência usa da Fatura (colunas de `faturas`). */
export type FaturaParaConferir = {
  id: string;
  total_despesas_centavos: number;
  total_creditos_centavos: number;
};

/** O que a Conferência usa de um cartão lido (colunas de `fatura_cartoes`). */
export type CartaoParaConferir = { fatura_id: string; final: string; total_centavos: number };

/** O que a Conferência usa de um Lançamento (colunas de `lancamentos`). */
export type LancamentoParaConferir = {
  fatura_id: string | null;
  valor_centavos: number;
  final_cartao: string | null;
  excluido_em: string | null;
};

export type Conferencia = ConferenciaImportacao & {
  faturaId: string;
  /** Finais com diferença, em ordem crescente. */
  cartoesComDiferenca: string[];
};

/**
 * Conferência geral e por cartão da Fatura a partir das linhas gravadas.
 * Os cartões entram em ordem de final (o texto da faixa não depende da
 * ordem de leitura); finais que só existem nos Lançamentos vêm depois, com
 * lido R$ 0,00.
 */
export function conferir(
  fatura: FaturaParaConferir,
  cartoes: readonly CartaoParaConferir[],
  lancamentos: readonly LancamentoParaConferir[],
): Conferencia {
  const daFatura = lancamentos.filter((l) => l.fatura_id === fatura.id && l.excluido_em === null);
  const lidos = cartoes
    .filter((c) => c.fatura_id === fatura.id)
    .map((c) => ({ final: c.final, valorTotalCentavos: c.total_centavos }))
    .sort((a, b) => (a.final < b.final ? -1 : a.final > b.final ? 1 : 0));
  const soma = somarConferencia(
    daFatura.map((l) => ({ valorCentavos: l.valor_centavos, finalCartao: l.final_cartao ?? "" })),
    lidos,
    { totalDespesasCentavos: fatura.total_despesas_centavos, totalCreditosCentavos: fatura.total_creditos_centavos },
  );
  const c = montarConferencia(daFatura.length, soma);
  const cartoesComDiferenca = c.porCartao
    .filter((p) => p.diferencaCentavos !== 0)
    .map((p) => p.final)
    .sort();
  return { ...c, faturaId: fatura.id, cartoesComDiferenca };
}

/** O que a marca "verificar" usa de um Lançamento. */
export type LancamentoParaVerificar = Pick<LancamentoParaConferir, "fatura_id" | "valor_centavos" | "final_cartao">;

/**
 * O Lançamento leva "verificar"? Só os da Fatura conferida: os do cartão
 * com diferença; se nenhum cartão difere e os créditos diferem, os créditos.
 */
export function precisaVerificar(lancamento: LancamentoParaVerificar, conferencia: Conferencia): boolean {
  if (conferencia.conferido || lancamento.fatura_id !== conferencia.faturaId) return false;
  if (conferencia.cartoesComDiferenca.length > 0) {
    return conferencia.cartoesComDiferenca.includes(lancamento.final_cartao ?? "");
  }
  return conferencia.diferencaCreditosCentavos !== 0 && lancamento.valor_centavos < 0;
}

/** Dúvidas de extração primeiro; depois (e dentro de cada grupo), a ordem da fatura. */
export function ordenarDuvidasPrimeiro<L extends { duvida_extracao: boolean; ordem_fatura: number | null }>(
  linhas: readonly L[],
): L[] {
  const ordem = (l: L) => l.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  return [...linhas].sort((a, b) => Number(b.duvida_extracao) - Number(a.duvida_extracao) || ordem(a) - ordem(b));
}

export type SentidoDiferenca = "abaixo" | "acima";

export type ParteDiferenca = { centavos: number; sentido: SentidoDiferenca };

/** As partes da diferença que a faixa explica; tudo `null`/vazio quando bate. */
export type PartesDiferenca = {
  despesas: ParteDiferenca | null;
  creditos: ParteDiferenca | null;
  /** Finais com diferença, em ordem crescente. */
  cartoes: string[];
};

function parte(diferenca: number): ParteDiferenca | null {
  if (diferenca === 0) return null;
  return { centavos: Math.abs(diferenca), sentido: diferenca < 0 ? "abaixo" : "acima" };
}

export function partesDaDiferenca(c: Conferencia): PartesDiferenca {
  return {
    despesas: parte(c.diferencaDespesasCentavos),
    creditos: parte(c.diferencaCreditosCentavos),
    cartoes: c.cartoesComDiferenca,
  };
}

/**
 * O valor do selo "⚠ Diferença de R$ X": a diferença das despesas, senão a
 * dos créditos, senão a maior de cartão (em valor absoluto). Conferido: null.
 */
export function valorDaDiferenca(c: Conferencia): number | null {
  if (c.diferencaDespesasCentavos !== 0) return Math.abs(c.diferencaDespesasCentavos);
  if (c.diferencaCreditosCentavos !== 0) return Math.abs(c.diferencaCreditosCentavos);
  const maior = c.porCartao.reduce((m, p) => Math.max(m, Math.abs(p.diferencaCentavos)), 0);
  return maior === 0 ? null : maior;
}
