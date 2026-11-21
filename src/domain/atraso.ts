// Atrasado (História 6.4, FR-49, AD-9, AD-10, AD-1). Puro: "hoje" (`AAAA-MM-DD`, de
// `hojeEmSaoPaulo(agora)`, em America/Sao_Paulo) e a tolerância entram como parâmetro; o
// núcleo não lê relógio. É calculado e nunca gravado: tela, filtro, lembrete (Épico 7) e
// os cartões por Bloco (6.5) usam estas mesmas funções.
//
// - Um Lançamento está atrasado quando NÃO está pago (`ehPago` falso, sem Status que conta
//   como pago) e `hoje` passa do vencimento + a tolerância. Datas de calendário
//   (`AAAA-MM-DD`) comparam como texto. O dia do vencimento e o último dia da tolerância
//   ainda estão em dia; o primeiro dia de atraso é vencimento + tolerância + 1
//   (`primeiroDiaDeAtraso`). Exemplo: vencimento 06/11/26, tolerância 10 → em dia até
//   16/11/26 e atrasado desde 17/11/26.
// - Vencimento (`vencimentoDoLancamento`): o `vencimento_combinado` da Dívida programada
//   (6.6; o campo ainda não existe no banco e vem opcional), senão o vencimento da Fatura
//   do Mês do Lançamento, senão o do Ciclo (`vencimentoDoMes`, com a configuração vigente
//   no Mês, AD-9). Sem nenhum dos três, o vencimento é desconhecido e a linha não atrasa.
// - Nunca atrasam: excluídas, mãe dividida (valem as partes, AD-8), Ajustes de centavos
//   (acompanham a parcela), o histórico da planilha (Defeito 3: é registro, a importação só
//   marca como pago o Status "Pago" e um Mês antigo ficaria todo em vermelho), previstos (Série `sistema` e Conta manual de um Mês sem Fatura),
//   linhas de valor zero ou negativo (crédito: não há o que cobrar) e as que um Pagamento
//   parcial já cobriu por inteiro.
// - "Pago parcialmente" com o restante vencido ESTÁ atrasado (o que falta é o que se cobra);
//   a grade mantém o selo "Pago parcialmente" e acrescenta "Atrasado" (decisão 2 da 6.4).

import { ehData, vencimentoDoMes, type ConfigCiclo } from "./ciclo";
import { somarDias } from "./datas";
import { ehMaeDividida } from "./divisao";
import { ehLinhaDeHistorico } from "./historico-do-mes";
import { ehPago } from "./pagamento";
import { ehPrevistoNoMes } from "./previstos";

/** As colunas de `lancamentos` que o atraso lê (`vencimento_combinado` só existe depois da 6.6). */
export type LancamentoParaAtraso = {
  id: string;
  /** O Mês da Fatura (`AAAA-MM`), fixado na criação (AD-9). */
  mes: string;
  valor_centavos: number;
  status_id: string | null;
  excluido_em?: string | null;
  lancado_por?: string;
  conta_manual_id?: string | null;
  /** Divisão (3.8): a mãe da parte; nulo na linha comum e na mãe. */
  dividido_de_id?: string | null;
  /** A Divisão da mãe; nulo na linha comum e na parte. */
  divisao?: unknown;
  /** Ajuste de centavos (2.8): a parcela dele. */
  ajuste_de_id?: string | null;
  /** Dívida programada (6.6): a data combinada de `AAAA-MM-DD`; ausente ou nula, vale a da Fatura ou a do Ciclo. */
  vencimento_combinado?: string | null;
};

/** O que o atraso precisa além do Lançamento e de "hoje". */
export type ContextoDeAtraso = {
  /** Os Status que contam como pago (`conta_como_pago`). */
  statusPagos: ReadonlySet<string>;
  /** O histórico do Ciclo (`config_ciclo`), para o vencimento de um Mês sem Fatura. */
  configsCiclo: readonly ConfigCiclo[];
  /**
   * O vencimento das Faturas importadas, por Mês (`AAAA-MM` → `AAAA-MM-DD`). Com ele, um Mês sem
   * Fatura tem as Contas manuais como previstos (5.1); sem ele (`undefined`), vale "o Mês tem Fatura".
   */
  vencimentosDasFaturas?: ReadonlyMap<string, string>;
  /** Σ dos itens de Pagamento não excluídos de cada Lançamento (`somaDosItens`); ausente vale 0. */
  recebidoCentavos?: ReadonlyMap<string, number>;
};

/** A linha é um Ajuste de centavos de outra linha? */
function ehAjuste(l: Pick<LancamentoParaAtraso, "id" | "ajuste_de_id">): boolean {
  const mae = l.ajuste_de_id ?? null;
  return mae !== null && mae !== l.id;
}

/**
 * A linha pode, em tese, atrasar? Não: excluída, mãe dividida, Ajuste de centavos, previsto e
 * valor zero ou negativo. Não olha o Status nem a data.
 */
export function podeAtrasar(l: LancamentoParaAtraso, ctx: Pick<ContextoDeAtraso, "vencimentosDasFaturas">): boolean {
  if ((l.excluido_em ?? null) !== null) return false;
  if (ehMaeDividida(l) || ehAjuste(l)) return false;
  // O histórico da planilha (3.10) é registro, não cobrança (Defeito 3, `ehLinhaDeHistorico`).
  if (ehLinhaDeHistorico(l)) return false;
  const temFatura = ctx.vencimentosDasFaturas === undefined || ctx.vencimentosDasFaturas.has(l.mes);
  if (l.lancado_por !== undefined && ehPrevistoNoMes({ lancado_por: l.lancado_por, conta_manual_id: l.conta_manual_id }, temFatura)) {
    return false;
  }
  return l.valor_centavos > 0;
}

/**
 * O vencimento (`AAAA-MM-DD`) de um Lançamento: o `vencimento_combinado`, senão o da Fatura do
 * Mês, senão o do Ciclo vigente no Mês. `null` quando não dá para saber (nenhuma configuração do
 * Ciclo, Mês ou data inválidos): a linha não atrasa e nada quebra.
 */
export function vencimentoDoLancamento(
  l: Pick<LancamentoParaAtraso, "mes" | "vencimento_combinado">,
  ctx: Pick<ContextoDeAtraso, "configsCiclo" | "vencimentosDasFaturas">,
): string | null {
  const combinado = l.vencimento_combinado ?? null;
  if (combinado !== null) return ehData(combinado) ? combinado : null;
  const daFatura = ctx.vencimentosDasFaturas?.get(l.mes);
  if (daFatura !== undefined) return ehData(daFatura) ? daFatura : null;
  const doCiclo = vencimentoDoMes(l.mes, ctx.configsCiclo);
  return doCiclo.ok ? doCiclo.valor : null;
}

/**
 * O primeiro dia em que o Lançamento fica atrasado (vencimento + tolerância + 1), se ele está
 * em aberto e pode atrasar; senão `null`. Não olha "hoje": serve ao "atrasado desde 17/11/26" e
 * ao lembrete do Épico 7.
 */
export function primeiroDiaDeAtraso(
  l: LancamentoParaAtraso,
  tolerancia: number,
  ctx: ContextoDeAtraso,
): string | null {
  if (!Number.isInteger(tolerancia) || tolerancia < 0) return null;
  if (!podeAtrasar(l, ctx) || ehPago(l, ctx.statusPagos)) return null;
  // Os itens de Pagamento já cobriram o valor todo (sem Status pago): não há o que cobrar.
  if (l.valor_centavos - (ctx.recebidoCentavos?.get(l.id) ?? 0) <= 0) return null;
  const vencimento = vencimentoDoLancamento(l, ctx);
  return vencimento === null ? null : somarDias(vencimento, tolerancia + 1);
}

/**
 * `hoje` passa do vencimento + a tolerância e o Lançamento não está pago (AD-10, FR-49).
 * Calculado, nunca gravado.
 */
export function estaAtrasado(
  l: LancamentoParaAtraso,
  hoje: string,
  tolerancia: number,
  ctx: ContextoDeAtraso,
): boolean {
  if (!ehData(hoje)) return false;
  const desde = primeiroDiaDeAtraso(l, tolerancia, ctx);
  return desde !== null && hoje >= desde;
}

/** Os Lançamentos atrasados de `linhas` e o primeiro dia de atraso de cada um (id → `AAAA-MM-DD`). */
export function atrasosDasLinhas(
  linhas: readonly LancamentoParaAtraso[],
  hoje: string,
  tolerancia: number,
  ctx: ContextoDeAtraso,
): Map<string, string> {
  const atrasos = new Map<string, string>();
  if (!ehData(hoje)) return atrasos;
  for (const l of linhas) {
    const desde = primeiroDiaDeAtraso(l, tolerancia, ctx);
    if (desde !== null && hoje >= desde) atrasos.set(l.id, desde);
  }
  return atrasos;
}
