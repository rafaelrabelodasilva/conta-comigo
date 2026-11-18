// Dívida programada (História 6.6, FR-27, UX-DR19, AD-10, AD-8, AD-1). Puro: "hoje" e o instante
// da gravação entram como parâmetro; o núcleo não lê relógio. A Dívida programada é o
// `vencimento_combinado` do próprio Lançamento (AD-10): uma data combinada para cobrar, com uma
// observação opcional (`vencimento_observacao`). É dado do Lançamento, nunca calculado e gravado:
// "ainda não venceu" e "Atrasado" saem destas datas e de `hoje`.
//
// - O que a data muda: (1) é o vencimento do Lançamento (`vencimentoDoLancamento`, de `atraso.ts`,
//   manda sobre o da Fatura e o do Ciclo), então depois dele + a tolerância, sem pagar, fica
//   "Atrasado"; (2) até o MÊS do vencimento a linha fica FORA da cobrança: da mensagem
//   (`projetarMensagem`) e do Saldo pendente (`projetarPendente`). Quem decide é
//   `dividaAindaNaoVence`: o Mês de calendário do vencimento ainda não chegou (`hoje` em
//   America/Sao_Paulo, de `hojeEmSaoPaulo`). No Mês do vencimento ela passa a entrar, mesmo antes
//   do dia (a cobrança do mês), e só atrasa depois do dia + a tolerância.
// - `planejarProgramacao` / `planejarDesligar`: o que a RPC `programar_divida` grava e o que o
//   "Desfazer" devolve. A Dívida é de cada parte (AD-8): a mãe dividida vale pelas filhas, e o
//   Ajuste de centavos acompanha a parcela. Pago (ou já coberto por Pagamentos) e valor zero ou
//   negativo ficam de fora (não há o que cobrar).
// - `aReceber`: a seção "A receber" de Recebimentos: as Dívidas programadas em aberto, uma linha
//   por Série + Responsável + vencimento (a Bombinhas do Lucas é uma linha de R$ 636,00).

import { ehData, mesDaData } from "./ciclo";
import { ehMaeDividida } from "./divisao";
import { ehPago, restante, somaDosItens, type ItemLido } from "./pagamento";
import type { Resultado } from "./resultado";

/** A menor e a maior data combinada (as mesmas da restrição do banco). */
export const DATA_COMBINADA_MINIMA = "2000-01-01";
export const DATA_COMBINADA_MAXIMA = "2099-12-31";
export const LIMITE_OBSERVACAO_DA_DIVIDA = 500;

const erro = (codigo: string): { ok: false; erro: { codigo: string } } => ({ ok: false, erro: { codigo } });

/** A data digitada (`<input type="date">`, `AAAA-MM-DD`): obrigatória, válida e entre 2000 e 2099. */
export function lerDataCombinada(texto: string): Resultado<string> {
  const limpo = texto.trim();
  if (limpo === "") return erro("divida.data_vazia");
  if (!ehData(limpo)) return erro("divida.data_invalida");
  if (limpo < DATA_COMBINADA_MINIMA || limpo > DATA_COMBINADA_MAXIMA) return erro("divida.data_fora_do_limite");
  return { ok: true, valor: limpo };
}

/** A observação opcional, recortada, até 500 caracteres; em branco é `null`. */
export function lerObservacaoDaDivida(texto: string): Resultado<string | null> {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, valor: null };
  return limpo.length > LIMITE_OBSERVACAO_DA_DIVIDA ? erro("divida.observacao_longa") : { ok: true, valor: limpo };
}

type ComVencimento = { vencimento_combinado?: string | null };

/** O Lançamento é uma Dívida programada (tem data combinada válida)? */
export function ehDividaProgramada(l: ComVencimento): boolean {
  const v = l.vencimento_combinado ?? null;
  return v !== null && ehData(v);
}

/**
 * Dívida programada que ainda não entra na cobrança: o Mês de calendário do vencimento combinado
 * ainda não chegou (`hoje` é `AAAA-MM-DD`, em America/Sao_Paulo). No Mês do vencimento, e depois
 * dele, entra. Sem data combinada, ou com `hoje` ilegível, é `false` (nada é escondido).
 */
export function dividaAindaNaoVence(l: ComVencimento, hoje: string): boolean {
  const v = l.vencimento_combinado ?? null;
  if (v === null || !ehData(v) || !ehData(hoje)) return false;
  return mesDaData(v) > mesDaData(hoje);
}

// ------------------------------------------------------------ programar

/** As colunas que o plano lê de um Lançamento. */
export type LinhaParaProgramar = {
  id: string;
  excluido_em?: string | null;
  status_id: string | null;
  valor_centavos: number;
  /** A mãe da parte; nulo na linha comum e na mãe. */
  dividido_de_id?: string | null;
  /** A Divisão da mãe; nulo na linha comum e na parte. */
  divisao?: unknown;
  /** O Ajuste de centavos acompanha a parcela dele. */
  ajuste_de_id?: string | null;
  vencimento_combinado?: string | null;
  vencimento_observacao?: string | null;
  editado_em?: string | null;
};

/** Um item de `programar_divida(p_itens)`: data nula desliga (e limpa a observação). */
export type ItemProgramar = {
  id: string;
  vencimento_combinado: string | null;
  vencimento_observacao: string | null;
  /** O instante da edição à mão (a reimportação e "Alterar conta" preservam a linha). Ausente não mexe. */
  editado_em?: string | null;
};

export type PlanoDeProgramar = {
  /** O pedido de `programar_divida`. */
  itens: ItemProgramar[];
  /** O "Desfazer": os mesmos ids com os valores de antes. */
  desfazer: ItemProgramar[];
  /** Quantos Lançamentos (sem contar os Ajustes que vão junto) ganham a data. */
  programados: number;
  /** Quantos ficaram de fora por já estarem pagos. */
  pagos: number;
  /** Quantos ficaram de fora por terem valor zero ou negativo. */
  semValor: number;
};

export type ContextoDeProgramar = {
  /** Os Status que contam como pago. */
  statusPagos: ReadonlySet<string>;
  /** Σ dos itens de Pagamento de cada Lançamento (`somaDosItens`); ausente vale 0. */
  recebidoCentavos?: ReadonlyMap<string, number>;
  /** O instante da edição (ISO); o aparelho lê o relógio e passa aqui. */
  agora: string;
};

/**
 * Os Lançamentos que a escolha quer dizer: uma mãe dividida vira as filhas vivas dela (AD-8), e um
 * Ajuste cuja parcela também está na escolha segue a parcela (entra pelos `ajustesDe`).
 */
function alvosDe<L extends LinhaParaProgramar>(
  ids: Iterable<string>,
  linhas: readonly L[],
): { alvos: L[]; ajustesDe: Map<string, L[]> } {
  const vivas = linhas.filter((l) => (l.excluido_em ?? null) === null);
  const porId = new Map(vivas.map((l) => [l.id, l]));
  const filhasDe = new Map<string, L[]>();
  const ajustesDe = new Map<string, L[]>();
  for (const l of vivas) {
    const mae = l.dividido_de_id ?? null;
    if (mae !== null) filhasDe.set(mae, [...(filhasDe.get(mae) ?? []), l]);
    const ajustada = l.ajuste_de_id ?? null;
    if (ajustada !== null && ajustada !== l.id) ajustesDe.set(ajustada, [...(ajustesDe.get(ajustada) ?? []), l]);
  }
  const principais = new Map<string, L>();
  for (const id of ids) {
    const l = porId.get(id);
    if (l === undefined) continue;
    if (ehMaeDividida(l)) for (const f of filhasDe.get(l.id) ?? []) principais.set(f.id, f);
    else principais.set(l.id, l);
  }
  const alvos = [...principais.values()].filter((l) => {
    const mae = l.ajuste_de_id ?? null;
    return !(mae !== null && mae !== l.id && principais.has(mae));
  });
  return { alvos, ajustesDe };
}

const antes = (l: LinhaParaProgramar): ItemProgramar => ({
  id: l.id,
  vencimento_combinado: l.vencimento_combinado ?? null,
  vencimento_observacao: l.vencimento_observacao ?? null,
  editado_em: l.editado_em ?? null,
});

/**
 * "Programar dívida": a data combinada (`data`, obrigatória) e a observação opcional para os
 * Lançamentos de `ids` (a Seleção do Painel, ou o Lançamento do painel). Tudo ou nada na RPC.
 *
 * - Mãe dividida: programa as filhas dela (as não pagas); uma parte sozinha, só ela.
 * - Ajuste de centavos: recebe a mesma data da parcela, sem a observação.
 * - Fora: já pago (Status que conta, ou itens de Pagamento que já cobrem o valor) e valor zero ou
 *   negativo. Pago parcialmente PODE: o restante é o que se cobra na data.
 * - A data pode ter passado: a Dívida então já entra na cobrança e atrasa pela tolerância.
 * - O que já está com a mesma data e a mesma observação não é regravado.
 */
export function planejarProgramacao<L extends LinhaParaProgramar>(
  ids: Iterable<string>,
  linhas: readonly L[],
  ctx: ContextoDeProgramar,
  entrada: { data: string; observacao: string },
): Resultado<PlanoDeProgramar> {
  const data = lerDataCombinada(entrada.data);
  if (!data.ok) return data;
  const observacao = lerObservacaoDaDivida(entrada.observacao);
  if (!observacao.ok) return observacao;

  const { alvos, ajustesDe } = alvosDe(ids, linhas);
  const itens: ItemProgramar[] = [];
  const desfazer: ItemProgramar[] = [];
  let programados = 0;
  let pagos = 0;
  let semValor = 0;
  let validos = 0;
  for (const l of alvos) {
    const recebido = ctx.recebidoCentavos?.get(l.id) ?? 0;
    if (ehPago(l, ctx.statusPagos) || (l.valor_centavos > 0 && l.valor_centavos - recebido <= 0)) {
      pagos += 1;
      continue;
    }
    if (l.valor_centavos <= 0) {
      semValor += 1;
      continue;
    }
    validos += 1;
    let mudou = false;
    for (const x of [l, ...(ajustesDe.get(l.id) ?? [])]) {
      const nota = x === l ? observacao.valor : null;
      if ((x.vencimento_combinado ?? null) === data.valor && (x.vencimento_observacao ?? null) === nota) continue;
      itens.push({ id: x.id, vencimento_combinado: data.valor, vencimento_observacao: nota, editado_em: ctx.agora });
      desfazer.push(antes(x));
      mudou = true;
    }
    if (mudou) programados += 1;
  }
  if (validos === 0) return erro(pagos > 0 && semValor === 0 ? "divida.so_pagos" : "divida.nada_a_programar");
  return { ok: true, valor: { itens, desfazer, programados, pagos, semValor } };
}

/**
 * Desliga a Dívida programada dos Lançamentos de `ids` (data e observação saem). Só toca no que
 * está programado; um Ajuste acompanha a parcela. Sem nenhum programado: erro.
 */
export function planejarDesligar<L extends LinhaParaProgramar>(
  ids: Iterable<string>,
  linhas: readonly L[],
  ctx: Pick<ContextoDeProgramar, "agora">,
): Resultado<PlanoDeProgramar> {
  const { alvos, ajustesDe } = alvosDe(ids, linhas);
  const itens: ItemProgramar[] = [];
  const desfazer: ItemProgramar[] = [];
  let programados = 0;
  for (const l of alvos) {
    let mudou = false;
    for (const x of [l, ...(ajustesDe.get(l.id) ?? [])]) {
      if ((x.vencimento_combinado ?? null) === null) continue;
      itens.push({ id: x.id, vencimento_combinado: null, vencimento_observacao: null, editado_em: ctx.agora });
      desfazer.push(antes(x));
      mudou = true;
    }
    if (mudou) programados += 1;
  }
  if (itens.length === 0) return erro("divida.nada_a_desligar");
  return { ok: true, valor: { itens, desfazer, programados, pagos: 0, semValor: 0 } };
}

/** Quantos Lançamentos da escolha já são Dívida programada (para a janela abrir com a data de um deles). */
export function programadaDe<L extends LinhaParaProgramar>(ids: Iterable<string>, linhas: readonly L[]): L | null {
  const { alvos } = alvosDe(ids, linhas);
  return alvos.find((l) => ehDividaProgramada(l)) ?? null;
}

// ------------------------------------------------------------ A receber

/** As colunas de `lancamentos` que "A receber" lê. */
export type LancamentoParaReceber = {
  id: string;
  mes: string;
  excluido_em?: string | null;
  nome: string;
  apelido: string | null;
  valor_centavos: number;
  status_id: string | null;
  responsavel_id: string | null;
  serie_id?: string | null;
  parcela_n?: number | null;
  dividido_de_id?: string | null;
  divisao?: unknown;
  ajuste_de_id?: string | null;
  vencimento_combinado?: string | null;
  vencimento_observacao?: string | null;
};

/** Um lançamento de uma linha de "A receber" (o que se abre ao tocar). */
export type ItemAReceber = {
  id: string;
  mes: string;
  parcela_n: number | null;
  /** O que falta receber dele (o valor, ou só o que falta de um Pago parcialmente), com o Ajuste dele. */
  restanteCentavos: number;
  /** O primeiro dia de atraso, se está atrasado. */
  atrasadoDesde: string | null;
};

/** Uma linha de "A receber": uma Série + Responsável + vencimento (ou um Lançamento avulso). */
export type LinhaAReceber = {
  chave: string;
  /** Nome ou Apelido do primeiro lançamento. */
  nome: string;
  responsavelId: string | null;
  /** O vencimento combinado (`AAAA-MM-DD`). */
  vencimento: string;
  /** Σ do que falta receber. */
  valorCentavos: number;
  /** Os lançamentos, dos Meses mais antigos para os mais novos. */
  itens: ItemAReceber[];
  /** O primeiro dia de atraso mais antigo entre eles; `null` se nenhum está atrasado. */
  atrasadoDesde: string | null;
  /** A observação do combinado (a primeira que houver). */
  observacao: string | null;
};

export type ContextoAReceber = {
  statusPagos: ReadonlySet<string>;
  /** Os itens de Pagamento vivos (de todos os Meses). */
  itens: readonly ItemLido[];
  /** id → primeiro dia de atraso (`atrasosDasLinhas`, sobre os mesmos Lançamentos). */
  atrasos: ReadonlyMap<string, string>;
};

/**
 * "A receber" (Recebimentos): as Dívidas programadas em aberto, de todos os Meses, ordenadas por
 * data (e, na mesma data, pelo nome). Entram vivas, que não são mãe dividida (valem as partes), com
 * data combinada e algo a receber (`restante` positivo; o Ajuste soma na parcela dele). Previstos
 * entram: a Bombinhas ainda sem Fatura é parte do que se vai receber. Pagas saem. As do mesmo
 * Responsável, da mesma Série e do mesmo vencimento viram uma linha com a soma (o Lucas da Bombinhas:
 * R$ 636,00). Um Lançamento avulso é uma linha só.
 */
export function aReceber<L extends LancamentoParaReceber>(
  lancamentos: readonly L[],
  ctx: ContextoAReceber,
): LinhaAReceber[] {
  const quitado = somaDosItens(ctx.itens);
  const vivas = lancamentos.filter((l) => (l.excluido_em ?? null) === null && !ehMaeDividida(l));
  const ajustesDe = new Map<string, L[]>();
  for (const l of vivas) {
    const mae = l.ajuste_de_id ?? null;
    if (mae !== null && mae !== l.id) ajustesDe.set(mae, [...(ajustesDe.get(mae) ?? []), l]);
  }
  const falta = (l: L) => restante(l, ctx.statusPagos, quitado.get(l.id) ?? 0);
  const grupos = new Map<string, { base: L; itens: ItemAReceber[]; observacao: string | null }>();
  for (const l of vivas) {
    if (!ehDividaProgramada(l)) continue;
    const mae = l.ajuste_de_id ?? null;
    // Um Ajuste de uma parcela programada soma na parcela, não é linha.
    if (mae !== null && mae !== l.id && vivas.some((x) => x.id === mae && ehDividaProgramada(x))) continue;
    const doItem = falta(l);
    if (doItem <= 0) continue;
    const restanteCentavos = (ajustesDe.get(l.id) ?? []).reduce((soma, a) => soma + falta(a), doItem);
    const vencimento = l.vencimento_combinado as string;
    const chave = l.serie_id ? `${l.serie_id}|${l.responsavel_id ?? ""}|${vencimento}` : l.id;
    const item: ItemAReceber = {
      id: l.id,
      mes: l.mes,
      parcela_n: l.parcela_n ?? null,
      restanteCentavos,
      atrasadoDesde: ctx.atrasos.get(l.id) ?? null,
    };
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.itens.push(item);
      grupo.observacao ??= l.vencimento_observacao ?? null;
    } else {
      grupos.set(chave, { base: l, itens: [item], observacao: l.vencimento_observacao ?? null });
    }
  }
  const linhas: LinhaAReceber[] = [];
  for (const [chave, g] of grupos) {
    const itens = g.itens.sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : (a.parcela_n ?? 0) - (b.parcela_n ?? 0)));
    const atrasos = itens.map((i) => i.atrasadoDesde).filter((d): d is string => d !== null).sort();
    linhas.push({
      chave,
      nome: g.base.apelido ?? g.base.nome,
      responsavelId: g.base.responsavel_id,
      vencimento: g.base.vencimento_combinado as string,
      valorCentavos: itens.reduce((soma, i) => soma + i.restanteCentavos, 0),
      itens,
      atrasadoDesde: atrasos[0] ?? null,
      observacao: g.observacao,
    });
  }
  return linhas.sort(
    (a, b) =>
      (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0) ||
      a.nome.localeCompare(b.nome, "pt-BR") ||
      (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0),
  );
}
