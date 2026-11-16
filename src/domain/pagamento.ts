// Pagamento (História 6.1, FR-25, AD-10, AD-1, AD-2). Puro: o relógio ("hoje",
// em America/Sao_Paulo), os Status que contam como pago e os itens de Pagamento
// entram como parâmetro. Tela e SQL só chamam estas funções.
//
// - `ehPago(l) = status.conta_como_pago` e `restante(l) = ehPago ? 0 : valor −
//   Σ itens não excluídos` (AD-10). "Pago parcialmente" e "Atrasado" são derivados
//   e vêm com as Histórias 6.2 e 6.4.
// - `projetarPagamento`: da Seleção às linhas que o Pagamento quita. A Seleção
//   guarda unidades da grade (a linha comum e as partes de uma Divisão; a mãe
//   dividida nunca soma, AD-8) e o Ajuste de centavos entra junto com a parcela
//   dele. Ficam de fora, com o motivo: previsto da Série (`sistema`), já pago e
//   R$ 0,00. A projeção não supõe um Mês: Recebimentos (6.5) junta Meses.
// - `alocarPagamento`: o valor recebido vira um item por linha, dos mais antigos
//   para os mais novos, com os créditos primeiro. Nesta História só existe o
//   modo `total` (valor recebido = total): menor é recusado até a 6.2 e maior
//   nunca é aceito ("O valor recebido não pode passar de R$ X").
// - `planejarPagamento`: valida Status, Data e Valor e monta o pedido da RPC
//   `aplicar_pagamento`, que só grava e confere (dono, formato, soma, restante).
// - `recusarStatusNaoPago`: aplicar à mão um Status "não pago" numa linha com
//   itens de Pagamento é recusado: é preciso desfazer o Pagamento antes (AD-10).
// - `planejarDesfazerPagamento`: o Status anterior volta só nas linhas em que o
//   Status atual ainda é o aplicado e que nenhum Pagamento posterior tocou (AD-10).

import { instanteEmMicros } from "./datas";
import { ehData } from "./ciclo";
import { ESPACO, formatarDinheiro, lerReais } from "./dinheiro";
import { ehMaeDividida } from "./divisao";
import { ehPrevisto } from "./previstos";
import type { Resultado } from "./resultado";

/** O maior valor da coluna `integer` do Postgres (`valor_centavos`). */
const MAIOR_INTEGER = 2_147_483_647;

/** O modo do Pagamento. `parcial` e `minha_parte` são da História 6.2. */
export type ModoDoPagamento = "total" | "parcial" | "minha_parte";

// ------------------------------------------------------------ pago e restante

/** O Status conta como pago? Sem Status (`null`) vale "não pago" (AD-10). */
export function ehPago(l: { status_id: string | null }, statusPagos: ReadonlySet<string>): boolean {
  return l.status_id !== null && statusPagos.has(l.status_id);
}

/** O que o núcleo lê de um item de Pagamento (de `pagamento_itens`). */
export type ItemLido = {
  lancamento_id: string;
  valor_centavos: number;
  /** Item de um Pagamento desfeito (AD-16): não conta. */
  excluido_em?: string | null;
};

/** Σ dos itens não excluídos de cada Lançamento. */
export function somaDosItens(itens: readonly ItemLido[]): Map<string, number> {
  const soma = new Map<string, number>();
  for (const i of itens) {
    if ((i.excluido_em ?? null) !== null) continue;
    soma.set(i.lancamento_id, (soma.get(i.lancamento_id) ?? 0) + i.valor_centavos);
  }
  return soma;
}

/** Os Lançamentos com ao menos um item de Pagamento não excluído (o `comPagamento` do AD-15). */
export function idsComPagamento(itens: readonly ItemLido[]): Set<string> {
  return new Set(itens.filter((i) => (i.excluido_em ?? null) === null).map((i) => i.lancamento_id));
}

/**
 * O que falta receber de um Lançamento (AD-10): zero se o Status conta como
 * pago; senão o valor menos o que os itens já quitaram (`pagoCentavos`). Um
 * crédito (valor negativo) tem restante negativo.
 */
export function restante(
  l: { status_id: string | null; valor_centavos: number },
  statusPagos: ReadonlySet<string>,
  pagoCentavos = 0,
): number {
  return ehPago(l, statusPagos) ? 0 : l.valor_centavos - pagoCentavos;
}

// ----------------------------------------------------------------- projeção

/** As colunas de `lancamentos` que a projeção do Pagamento lê. */
export type LancamentoParaPagar = {
  id: string;
  mes: string;
  excluido_em: string | null;
  /** A versão que a tela viu: a RPC só grava se a linha não mudou desde então. */
  updated_at: string;
  valor_centavos: number;
  status_id: string | null;
  lancado_por: string;
  data?: string | null;
  ordem_fatura: number | null;
  created_at?: string | null;
  dividido_de_id?: string | null;
  divisao?: unknown;
  ajuste_de_id?: string | null;
};

/** Por que um item da Seleção não entra no Pagamento. */
export const MOTIVOS_FORA_DO_PAGAMENTO = ["ja_pago", "zero", "previsto"] as const;
export type MotivoForaDoPagamento = (typeof MOTIVOS_FORA_DO_PAGAMENTO)[number];

/** Uma linha que o Pagamento quita: o `restante` dela. */
export type ItemAPagar = {
  id: string;
  mes: string;
  /** O que falta receber desta linha (negativo é crédito). */
  restanteCentavos: number;
  /** O `updated_at` visto: a trava da RPC. */
  atualizadoEm: string;
  /** O Ajuste de centavos que acompanha a parcela dele (não conta como "lançamento" na contagem). */
  ehAjuste: boolean;
  /** Para ordenar a alocação. */
  data: string | null;
  ordemFatura: number | null;
  criadoEm: string | null;
};

export type ProjecaoDoPagamento = {
  /** As linhas que entram, já na ordem da alocação (créditos primeiro, dos mais antigos para os mais novos). */
  entram: readonly ItemAPagar[];
  /** Quantos lançamentos entram (os Ajustes seguem a parcela e não contam). */
  quantidade: number;
  /** Σ dos restantes que entram: o "total da Seleção" que o Valor recebido tem de igualar. */
  totalCentavos: number;
  fora: {
    /** Quantos itens da Seleção ficaram de fora (os Ajustes seguem a parcela e não contam). */
    quantidade: number;
    porMotivo: Readonly<Record<MotivoForaDoPagamento, number>>;
  };
};

export type OpcoesDaProjecaoDoPagamento = {
  /** Os Status que contam como pago (`conta_como_pago`), arquivados também. */
  statusPagos: ReadonlySet<string>;
  /** Os itens de Pagamento das linhas (só `lancamento_id`, valor e exclusão). */
  itens: readonly ItemLido[];
};

function doItem(l: LancamentoParaPagar, restanteCentavos: number, ehAjuste: boolean): ItemAPagar {
  return {
    id: l.id,
    mes: l.mes,
    restanteCentavos,
    atualizadoEm: l.updated_at,
    ehAjuste,
    data: l.data ?? null,
    ordemFatura: l.ordem_fatura,
    criadoEm: l.created_at ?? null,
  };
}

const ultimo = (n: number | null) => n ?? Number.MAX_SAFE_INTEGER;

function microsOuZero(instante: string | null): number {
  if (instante === null) return 0;
  const m = instanteEmMicros(instante);
  return Number.isNaN(m) ? 0 : m;
}

/**
 * A ordem da alocação (AD-10): os créditos primeiro, depois do mais antigo para
 * o mais novo (Mês, data, ordem da fatura, criação) e, no empate, pelo id.
 */
export function compararParaAlocar(a: ItemAPagar, b: ItemAPagar): number {
  const credito = (i: ItemAPagar) => (i.restanteCentavos < 0 ? 0 : 1);
  if (credito(a) !== credito(b)) return credito(a) - credito(b);
  if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
  const dataA = a.data ?? "9999-99-99";
  const dataB = b.data ?? "9999-99-99";
  if (dataA !== dataB) return dataA < dataB ? -1 : 1;
  const porOrdem = ultimo(a.ordemFatura) - ultimo(b.ordemFatura);
  if (porOrdem !== 0) return porOrdem;
  const porCriacao = microsOuZero(a.criadoEm) - microsOuZero(b.criadoEm);
  if (porCriacao !== 0) return porCriacao;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Da Seleção às linhas do Pagamento. `lancamentos` são as linhas que a tela tem
 * (um Mês, no Painel; vários, em Recebimentos): nada aqui supõe um Mês.
 *
 * - Só entram unidades vivas: a linha comum e as partes de uma Divisão. A mãe
 *   dividida nunca soma (AD-8): o Pagamento recai sobre as partes.
 * - O Ajuste de centavos entra junto com a parcela dele, com o restante dele; o
 *   que já está pago ou zerado não entra. Um Ajuste marcado sem a parcela é uma
 *   unidade como outra qualquer.
 * - De fora, com o motivo (nesta ordem): previsto da Série (`sistema`: a parcela
 *   ainda não veio na Fatura), já pago (Status que conta como pago) e restante
 *   zero. A Conta manual é `manual` e entra mesmo num Mês sem Fatura (AD-15).
 * - A mensagem de cobrança (`projetarMensagem`) tem a própria regra, que não muda.
 */
export function projetarPagamento(
  selecao: ReadonlySet<string>,
  lancamentos: readonly LancamentoParaPagar[],
  opcoes: OpcoesDaProjecaoDoPagamento,
): ProjecaoDoPagamento {
  const vivas = lancamentos.filter((l) => l.excluido_em === null);
  const pago = somaDosItens(opcoes.itens);
  const restanteDe = (l: LancamentoParaPagar) => restante(l, opcoes.statusPagos, pago.get(l.id) ?? 0);

  const ajustesDe = new Map<string, LancamentoParaPagar[]>();
  for (const l of vivas) {
    const mae = l.ajuste_de_id ?? null;
    if (mae === null || mae === l.id) continue;
    ajustesDe.set(mae, [...(ajustesDe.get(mae) ?? []), l]);
  }
  const idsVivos = new Set(vivas.map((l) => l.id));
  const segueAParcela = (l: LancamentoParaPagar) => {
    const mae = l.ajuste_de_id ?? null;
    return mae !== null && mae !== l.id && idsVivos.has(mae) && selecao.has(mae);
  };

  const entram: ItemAPagar[] = [];
  const porMotivo: Record<MotivoForaDoPagamento, number> = { ja_pago: 0, zero: 0, previsto: 0 };
  for (const l of vivas) {
    if (!selecao.has(l.id) || ehMaeDividida(l) || segueAParcela(l)) continue;
    const r = restanteDe(l);
    const motivo: MotivoForaDoPagamento | null = ehPrevisto(l)
      ? "previsto"
      : ehPago(l, opcoes.statusPagos)
        ? "ja_pago"
        : r === 0
          ? "zero"
          : null;
    if (motivo !== null) {
      porMotivo[motivo] += 1;
      continue;
    }
    entram.push(doItem(l, r, false));
    for (const a of ajustesDe.get(l.id) ?? []) {
      const ra = restanteDe(a);
      if (ra !== 0 && !ehPago(a, opcoes.statusPagos)) entram.push(doItem(a, ra, true));
    }
  }
  entram.sort(compararParaAlocar);
  return {
    entram,
    quantidade: entram.filter((i) => !i.ehAjuste).length,
    totalCentavos: entram.reduce((soma, i) => soma + i.restanteCentavos, 0),
    fora: { quantidade: porMotivo.ja_pago + porMotivo.zero + porMotivo.previsto, porMotivo },
  };
}

// ---------------------------------------------------------------- alocação

/** O item de Pagamento a gravar: quanto da linha o Pagamento quita. */
export type ItemAlocado = {
  lancamento_id: string;
  valor_centavos: number;
  /** A versão da linha que a tela viu (a trava da RPC). */
  atualizado_em: string;
};

/**
 * Divide o valor recebido entre as linhas. Modo `total`: o valor é exatamente o
 * total, e cada linha quita o restante dela (créditos primeiro, dos mais antigos
 * para os mais novos). Erros: `pagamento.nada_a_receber` (o total não é maior
 * que zero), `pagamento.valor_invalido`, `pagamento.valor_acima` e
 * `pagamento.valor_menor` (o `detalhe` leva o total, em centavos; o parcial é da 6.2).
 */
export function alocarPagamento(
  entram: readonly ItemAPagar[],
  valorRecebidoCentavos: number,
): Resultado<ItemAlocado[]> {
  const total = entram.reduce((soma, i) => soma + i.restanteCentavos, 0);
  if (entram.length === 0) return { ok: false, erro: { codigo: "pagamento.sem_itens" } };
  if (total <= 0) return { ok: false, erro: { codigo: "pagamento.nada_a_receber" } };
  if (!Number.isInteger(valorRecebidoCentavos) || valorRecebidoCentavos <= 0) {
    return { ok: false, erro: { codigo: "pagamento.valor_invalido" } };
  }
  if (valorRecebidoCentavos > total) {
    return { ok: false, erro: { codigo: "pagamento.valor_acima", detalhe: String(total) } };
  }
  if (valorRecebidoCentavos < total) {
    return { ok: false, erro: { codigo: "pagamento.valor_menor", detalhe: String(total) } };
  }
  return {
    ok: true,
    valor: [...entram]
      .sort(compararParaAlocar)
      .map((i) => ({ lancamento_id: i.id, valor_centavos: i.restanteCentavos, atualizado_em: i.atualizadoEm })),
  };
}

// ---------------------------------------------------------- ler os campos

/** O Valor recebido digitado → centavos. Vazio, ilegível, zero ou negativo é recusado. */
export function lerValorRecebido(texto: string): Resultado<number> {
  if (texto.trim() === "") return { ok: false, erro: { codigo: "pagamento.valor_vazio" } };
  const r = lerReais(texto);
  if (!r.ok || r.valor <= 0 || r.valor > MAIOR_INTEGER) return { ok: false, erro: { codigo: "pagamento.valor_invalido" } };
  return r;
}

/** O padrão do campo "Valor recebido": o total, sem o "R$" ("2.819,68"). Total que não passa de zero vira vazio. */
export function textoDoValorRecebido(totalCentavos: number): string {
  return totalCentavos > 0 ? formatarDinheiro(totalCentavos).replace(`R$${ESPACO}`, "") : "";
}

/**
 * A Data do pagamento (`AAAA-MM-DD`, do `<input type="date">`): obrigatória,
 * válida e não depois de `hoje` (America/Sao_Paulo). Uma data no passado vale
 * (o dinheiro pode ter entrado dias antes).
 */
export function lerDataDoPagamento(texto: string, hoje: string): Resultado<string> {
  const limpo = texto.trim();
  if (limpo === "") return { ok: false, erro: { codigo: "pagamento.data_vazia" } };
  if (!ehData(limpo)) return { ok: false, erro: { codigo: "pagamento.data_invalida" } };
  if (limpo > hoje) return { ok: false, erro: { codigo: "pagamento.data_futura" } };
  return { ok: true, valor: limpo };
}

/** Onde a janela mostra o erro de `planejarPagamento`. */
export type CampoDoPagamento = "status" | "data" | "valor" | "geral";

export function campoDoErroDoPagamento(codigo: string): CampoDoPagamento {
  if (codigo === "pagamento.sem_status" || codigo === "pagamento.status_invalido") return "status";
  if (codigo.startsWith("pagamento.data_")) return "data";
  if (codigo.startsWith("pagamento.valor_")) return "valor";
  return "geral";
}

// ------------------------------------------------------------------ pedido

/** O pedido da RPC `aplicar_pagamento`. */
export type PedidoDePagamento = {
  /** Gerado pela tela: repetir o pedido (duplo toque, resposta perdida) não grava de novo. */
  id: string;
  status_id: string;
  data: string;
  valor_recebido_centavos: number;
  modo: "total";
  itens: ItemAlocado[];
};

export type EntradaDoPagamento = {
  /** O `id` do Pagamento, gerado pela tela uma vez por abertura da janela. */
  id: string;
  /** O Status escolhido ("" = nenhum). */
  statusId: string;
  statusPagos: ReadonlySet<string>;
  data: string;
  valorTexto: string;
  hoje: string;
  projecao: ProjecaoDoPagamento;
};

export type PlanoDoPagamento = {
  pedido: PedidoDePagamento;
  /** Quantos lançamentos o Pagamento quita (o "N" do aviso). */
  quantidade: number;
  valorRecebidoCentavos: number;
};

/** Valida a janela e monta o pedido; o primeiro erro vence (Status, Data, Valor). */
export function planejarPagamento(e: EntradaDoPagamento): Resultado<PlanoDoPagamento> {
  if (e.statusId === "") return { ok: false, erro: { codigo: "pagamento.sem_status" } };
  if (!e.statusPagos.has(e.statusId)) return { ok: false, erro: { codigo: "pagamento.status_invalido" } };
  const data = lerDataDoPagamento(e.data, e.hoje);
  if (!data.ok) return data;
  const valor = lerValorRecebido(e.valorTexto);
  if (!valor.ok) return valor;
  const itens = alocarPagamento(e.projecao.entram, valor.valor);
  if (!itens.ok) return itens;
  return {
    ok: true,
    valor: {
      pedido: {
        id: e.id,
        status_id: e.statusId,
        data: data.valor,
        valor_recebido_centavos: valor.valor,
        modo: "total",
        itens: itens.valor,
      },
      quantidade: e.projecao.quantidade,
      valorRecebidoCentavos: valor.valor,
    },
  };
}

// ------------------------------------------- Status "não pago" à mão (AD-10)

/**
 * Aplicar à mão um Status que não conta como pago (`escolhido` nulo ou fora de
 * `statusPagos`) numa linha que tem itens de Pagamento é recusado: é preciso
 * desfazer o Pagamento antes. Só olha as linhas cujo Status mudaria. A tela
 * confere antes de gravar; o banco confere de novo (gatilho), então uma
 * gravação de outro aparelho também é recusada.
 */
export function recusarStatusNaoPago(
  escolhido: string | null,
  statusPagos: ReadonlySet<string>,
  linhas: readonly { id: string; status_id: string | null }[],
  comPagamento: ReadonlySet<string>,
): Resultado<true> {
  if (escolhido !== null && statusPagos.has(escolhido)) return { ok: true, valor: true };
  const recusadas = linhas.filter((l) => l.status_id !== escolhido && comPagamento.has(l.id)).length;
  return recusadas === 0
    ? { ok: true, valor: true }
    : { ok: false, erro: { codigo: "pagamento.desfazer_antes", detalhe: String(recusadas) } };
}

// --------------------------------------------------------------- desfazer

/** Um item do Pagamento a desfazer (lido do banco). */
export type ItemParaDesfazer = {
  lancamento_id: string;
  status_anterior_id: string | null;
  status_aplicado_id: string;
  /** Quando o item foi criado (a ordem entre Pagamentos). */
  created_at: string;
};

/** Outro item, de outro Pagamento não desfeito, que toca um dos Lançamentos. */
export type OutroItemDoLancamento = { lancamento_id: string; created_at: string };

export type PlanoDeDesfazer = {
  /** As linhas que recebem de volta o Status anterior, com a versão lida (a trava da RPC). */
  devolver: { lancamento_id: string; status_id: string | null; atualizado_em: string }[];
  /** Quantas linhas ficam como estão (o Status mudou à mão ou um Pagamento posterior as tocou). */
  mantidas: number;
};

/**
 * O que desfazer um Pagamento faz nas linhas (AD-10): o `status_anterior_id`
 * volta só onde o Status atual ainda é o `status_aplicado_id` e nenhum
 * Pagamento posterior (item criado depois, de outro Pagamento não desfeito)
 * tocou a linha. As demais ficam como estão; o Pagamento é excluído em lógico
 * de qualquer jeito. `linhas`: o estado atual lido do banco.
 */
export function planejarDesfazerPagamento(
  itens: readonly ItemParaDesfazer[],
  linhas: readonly { id: string; status_id: string | null; updated_at: string }[],
  outros: readonly OutroItemDoLancamento[],
): PlanoDeDesfazer {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const devolver: PlanoDeDesfazer["devolver"] = [];
  let mantidas = 0;
  for (const item of itens) {
    const linha = porId.get(item.lancamento_id);
    const posterior = outros.some(
      (o) => o.lancamento_id === item.lancamento_id && instanteEmMicros(o.created_at) > instanteEmMicros(item.created_at),
    );
    if (!linha || linha.status_id !== item.status_aplicado_id || posterior) {
      mantidas += 1;
      continue;
    }
    devolver.push({ lancamento_id: item.lancamento_id, status_id: item.status_anterior_id, atualizado_em: linha.updated_at });
  }
  return { devolver, mantidas };
}
