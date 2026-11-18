// Meses anteriores da Fatura (História 6.8, FR-30): por Mês de Fatura importada, o saldo anterior, o pagamento da
// fatura, o resíduo e o selo de Conferência. Só monta as linhas da tabela de Recebimentos; a tela chama e desenha.
//
// - O que a Fatura escreveu vem guardado (AD-4): saldo anterior e pagamento são os `faturas.saldo_anterior_centavos` e
//   `pagamentos_centavos`. O resíduo é calculado e nunca guardado: saldo anterior − pagamento (outubro/2026:
//   R$ 7.483,11 − R$ 7.457,21 = R$ 25,90). Negativo é pagamento a mais e fica com o sinal; saldo anterior ou pagamento
//   não lidos (`null`) deixam o resíduo `null` (nada de "zero por falta de dado").
// - O selo é a Conferência do Épico 2 (`conferir`), a mesma do Painel. Saldo anterior e pagamento não entram nela
//   (FR-6). O alerta dispensado (2.5) esconde só a faixa do Painel; aqui o selo continua dizendo a diferença e a linha
//   leva `alertaDispensado`, para a tela avisar que o alerta foi dispensado.
// - Continuidade (o motivo do FR-30): o saldo anterior de um Mês é o "total a pagar" da Fatura do Mês anterior
//   (7.483,11 + 8.327,39 − 7.457,21 − 639,62 = 7.713,67, e o resíduo de R$ 25,90 já está dentro desse total). A linha
//   leva um aviso só quando as duas Faturas são de Meses seguidos, os dois valores foram lidos e eles diferem.
//   Nunca esconde nem corrige o que a Fatura escreveu.

import {
  conferir,
  type CartaoParaConferir,
  type Conferencia,
  type FaturaParaConferir,
  type LancamentoParaConferir,
} from "./conferencia";
import { somarMeses } from "./ciclo";

/** Quantos Meses a tabela mostra antes de "Ver os outros". Um ano; a lista cresce uns 12 por ano. */
export const MESES_VISIVEIS_NA_TABELA = 12;

/** O que a tabela usa de uma Fatura (colunas de `faturas`; os totais lidos podem faltar). */
export type FaturaDaTabela = FaturaParaConferir & {
  mes: string;
  saldo_anterior_centavos: number | null;
  pagamentos_centavos: number | null;
  total_a_pagar_centavos: number | null;
  alerta_dispensado_em: string | null;
};

/** O saldo anterior não é o total a pagar da Fatura do Mês anterior. */
export type AvisoDeContinuidade = {
  /** O Mês anterior (`AAAA-MM`) cuja Fatura tem o total a pagar que deveria ser o saldo anterior. */
  mesAnterior: string;
  /** O total a pagar lido na Fatura do Mês anterior. */
  totalAPagarCentavos: number;
};

export type LinhaDosMesesAnteriores = {
  faturaId: string;
  /** `AAAA-MM`. */
  mes: string;
  saldoAnteriorCentavos: number | null;
  /** O pagamento da Fatura (positivo, como a Fatura escreve). */
  pagamentoCentavos: number | null;
  /** Saldo anterior − pagamento; `null` se um dos dois não foi lido; negativo = pago a mais. */
  residuoCentavos: number | null;
  /** A Conferência da Fatura (o selo vem de `rotuloSeloConferencia`). */
  conferencia: Conferencia;
  /** O alerta da Conferência foi dispensado no Painel (2.5). */
  alertaDispensado: boolean;
  continuidade: AvisoDeContinuidade | null;
};

/** Saldo anterior − pagamento da fatura; `null` quando um dos dois não foi lido. */
export function residuoDaFatura(saldoAnteriorCentavos: number | null, pagamentoCentavos: number | null): number | null {
  if (saldoAnteriorCentavos === null || pagamentoCentavos === null) return null;
  return saldoAnteriorCentavos - pagamentoCentavos;
}

/**
 * Uma linha por Fatura, do Mês mais novo para o mais antigo. Mês sem Fatura (só previstos ou histórico da planilha)
 * não tem linha. `lancamentos` pode ser de todos os Meses: cada Fatura confere só os dela (`fatura_id`).
 */
export function montarMesesAnteriores(
  faturas: readonly FaturaDaTabela[],
  cartoes: readonly CartaoParaConferir[],
  lancamentos: readonly LancamentoParaConferir[],
): LinhaDosMesesAnteriores[] {
  // Uma passada em vez de uma por Fatura (cada `conferir` já filtra pelo `fatura_id`, aqui só chega o que é dela).
  const lancamentosPorFatura = agrupar(lancamentos, (l) => l.fatura_id);
  const cartoesPorFatura = agrupar(cartoes, (c) => c.fatura_id);
  const totalAPagarDoMes = new Map<string, number | null>(faturas.map((f) => [f.mes, f.total_a_pagar_centavos]));

  return [...faturas]
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0))
    .map((f) => {
      const anterior = somarMeses(f.mes, -1);
      const totalAnterior = totalAPagarDoMes.get(anterior) ?? null;
      const continuidade =
        f.saldo_anterior_centavos !== null && totalAnterior !== null && f.saldo_anterior_centavos !== totalAnterior
          ? { mesAnterior: anterior, totalAPagarCentavos: totalAnterior }
          : null;
      return {
        faturaId: f.id,
        mes: f.mes,
        saldoAnteriorCentavos: f.saldo_anterior_centavos,
        pagamentoCentavos: f.pagamentos_centavos,
        residuoCentavos: residuoDaFatura(f.saldo_anterior_centavos, f.pagamentos_centavos),
        conferencia: conferir(f, cartoesPorFatura.get(f.id) ?? [], lancamentosPorFatura.get(f.id) ?? []),
        alertaDispensado: f.alerta_dispensado_em !== null,
        continuidade,
      };
    });
}

function agrupar<T>(itens: readonly T[], chave: (item: T) => string | null): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const c = chave(item);
    if (c === null) continue;
    const grupo = grupos.get(c);
    if (grupo) grupo.push(item);
    else grupos.set(c, [item]);
  }
  return grupos;
}
