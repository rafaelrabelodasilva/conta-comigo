// Pagamento (Histórias 6.1 e 6.2, FR-25, AD-10, AD-1, AD-2). Puro: o relógio ("hoje",
// em America/Sao_Paulo), os Status que contam como pago e os itens de Pagamento
// entram como parâmetro. Tela e SQL só chamam estas funções.
//
// - `ehPago(l) = status.conta_como_pago` e `restante(l) = ehPago ? 0 : valor −
//   Σ itens não excluídos` (AD-10). "Pago parcialmente" (`pagoParcialmente`,
//   0 < Σ itens < valor, sem Status pago) é calculado e nunca gravado (6.2);
//   "Atrasado" vem com a 6.4.
// - `projetarPagamento`: da Seleção às linhas que o Pagamento quita. A Seleção
//   guarda unidades da grade (a linha comum e as partes de uma Divisão; a mãe
//   dividida nunca soma, AD-8) e o Ajuste de centavos entra junto com a parcela
//   dele. Ficam de fora, com o motivo: previsto da Série (`sistema`), já pago e
//   R$ 0,00. A projeção não supõe um Mês: Recebimentos (6.5) junta Meses.
// - `alocarPagamento`: o valor recebido vira os itens, dos mais antigos para os
//   mais novos, com os créditos primeiro. Três modos: `total` (valor = total, cada
//   linha quita o restante dela), `parcial` ("Fica pendente": o valor quita as
//   linhas em ordem e a última pode ficar com um item parcial, que não muda o Status)
//   e `minha_parte` ("Não é dívida": todas as linhas ficam quitadas e o Pagamento
//   guarda o valor realmente recebido). Valor maior que o total nunca é aceito
//   ("O valor recebido não pode passar de R$ X"); menor pede a escolha entre os dois
//   últimos (`diferencaDoPagamento`).
// - `planejarPagamento`: valida Status, Data e Valor e monta o pedido da RPC
//   `aplicar_pagamento`, que só grava e confere (dono, formato, soma, restante).
// - `recusarStatusNaoPago`: tirar à mão o "pago" de uma linha que um Pagamento
//   quitou é recusado: é preciso desfazer o Pagamento antes (AD-10). Uma linha
//   parcialmente paga segue "não paga" e troca de Status "não pago" à vontade.
// - `planejarDesfazerPagamento`: o Status anterior volta só nas linhas em que o
//   Status atual ainda é o aplicado e que nenhum Pagamento posterior tocou (AD-10);
//   o item parcial nunca mudou o Status da linha, então não há o que devolver.

import { instanteEmMicros } from "./datas";
import { ehData } from "./ciclo";
import { ESPACO, formatarDinheiro, lerReais } from "./dinheiro";
import { ehMaeDividida } from "./divisao";
import { ehPrevisto } from "./previstos";
import type { Resultado } from "./resultado";

/** O maior valor da coluna `integer` do Postgres (`valor_centavos`). */
const MAIOR_INTEGER = 2_147_483_647;

/** O modo do Pagamento: valor = total, "Fica pendente" ou "Não é dívida, é a minha parte". */
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
  /** Nulo no item parcial (o Pagamento não mudou o Status da linha). */
  status_aplicado_id?: string | null;
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
 * Os Lançamentos que um Pagamento quitou (item não excluído que aplicou um Status):
 * é o "pago" que não se tira à mão (AD-10). O item parcial não aplicou Status e fica de fora.
 */
export function idsQuitadosPorPagamento(itens: readonly ItemLido[]): Set<string> {
  return new Set(
    itens.filter((i) => (i.excluido_em ?? null) === null && (i.status_aplicado_id ?? null) !== null).map((i) => i.lancamento_id),
  );
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

/**
 * "Pago parcialmente" (AD-10): sem Status pago, com `0 < Σ itens < valor`. Calculado,
 * nunca gravado. Um crédito (valor negativo) nunca é parcial.
 */
export function pagoParcialmente(
  l: { status_id: string | null; valor_centavos: number },
  statusPagos: ReadonlySet<string>,
  pagoCentavos: number,
): boolean {
  return !ehPago(l, statusPagos) && l.valor_centavos > 0 && pagoCentavos > 0 && pagoCentavos < l.valor_centavos;
}

/** O "falta R$ X" do painel do Lançamento: o restante de uma linha paga parcialmente; `null` nas outras. */
export function faltaDoParcial(
  l: { status_id: string | null; valor_centavos: number },
  statusPagos: ReadonlySet<string>,
  pagoCentavos: number,
): number | null {
  return pagoParcialmente(l, statusPagos, pagoCentavos) ? restante(l, statusPagos, pagoCentavos) : null;
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
  /**
   * Crédito de verdade (a linha ou, no Ajuste, a parcela dele tem restante negativo): vai
   * primeiro. Um Ajuste negativo de uma parcela comum não é crédito: acompanha a parcela.
   */
  credito: boolean;
  /** A linha que manda na ordem: a própria, ou a parcela do Ajuste. */
  chaveId: string;
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

function doItem(l: LancamentoParaPagar, restanteCentavos: number, parcela: ItemAPagar | null): ItemAPagar {
  // O Ajuste herda a posição da parcela (Mês, data, ordem, crédito) e vem logo depois dela.
  return {
    id: l.id,
    mes: l.mes,
    restanteCentavos,
    atualizadoEm: l.updated_at,
    ehAjuste: parcela !== null,
    credito: parcela?.credito ?? restanteCentavos < 0,
    chaveId: parcela?.id ?? l.id,
    data: parcela ? parcela.data : (l.data ?? null),
    ordemFatura: parcela ? parcela.ordemFatura : l.ordem_fatura,
    criadoEm: parcela ? parcela.criadoEm : (l.created_at ?? null),
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
 * o mais novo (Mês, data, ordem da fatura, criação) e, no empate, pelo id. O
 * Ajuste de centavos fica logo depois da parcela dele (6.2).
 */
export function compararParaAlocar(a: ItemAPagar, b: ItemAPagar): number {
  const credito = (i: ItemAPagar) => (i.credito ? 0 : 1);
  if (credito(a) !== credito(b)) return credito(a) - credito(b);
  if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
  const dataA = a.data ?? "9999-99-99";
  const dataB = b.data ?? "9999-99-99";
  if (dataA !== dataB) return dataA < dataB ? -1 : 1;
  const porOrdem = ultimo(a.ordemFatura) - ultimo(b.ordemFatura);
  if (porOrdem !== 0) return porOrdem;
  const porCriacao = microsOuZero(a.criadoEm) - microsOuZero(b.criadoEm);
  if (porCriacao !== 0) return porCriacao;
  if (a.chaveId !== b.chaveId) return a.chaveId < b.chaveId ? -1 : 1;
  return Number(a.ehAjuste) - Number(b.ehAjuste);
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
    const parcela = doItem(l, r, null);
    entram.push(parcela);
    for (const a of ajustesDe.get(l.id) ?? []) {
      const ra = restanteDe(a);
      if (ra !== 0 && !ehPago(a, opcoes.statusPagos)) entram.push(doItem(a, ra, parcela));
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
  /**
   * O item quita o restante da linha (ela fica com o Status aplicado). `false` é o item
   * parcial: menos que o restante, a linha segue com o Status que tinha.
   */
  quita: boolean;
};

/** O que fazer com a diferença quando o Valor recebido é menor que o total (UX-DR18). */
export type EscolhaDaDiferenca = "pendente" | "minha_parte";

export type AlocacaoDoPagamento = { modo: ModoDoPagamento; itens: ItemAlocado[] };

/**
 * A diferença entre o total e o Valor recebido, em centavos, quando há pergunta a
 * fazer ("O que fazer com a diferença de R$ X?"): só se `0 < recebido < total`.
 * Igual ao total (ou maior) não pergunta nada.
 */
export function diferencaDoPagamento(totalCentavos: number, recebidoCentavos: number): number | null {
  return totalCentavos > 0 && recebidoCentavos > 0 && recebidoCentavos < totalCentavos ? totalCentavos - recebidoCentavos : null;
}

const inteiro = (i: ItemAPagar): ItemAlocado => ({
  lancamento_id: i.id,
  valor_centavos: i.restanteCentavos,
  atualizado_em: i.atualizadoEm,
  quita: true,
});

/**
 * Divide o valor recebido entre as linhas (créditos primeiro, dos mais antigos para
 * os mais novos; o Ajuste logo depois da parcela dele).
 *
 * - Valor = total: modo `total`, cada linha quita o restante dela.
 * - Valor < total e `diferenca = "pendente"` ("Fica pendente"): modo `parcial`. Os
 *   créditos entram inteiros (e aumentam o que sobra para pagar); depois cada linha
 *   leva `min(sobra, restante)`. As linhas que ficam sem sobra não entram no Pagamento;
 *   a última a levar valor pode ficar com um item parcial (`quita: false`). Nunca há
 *   item zero, e Σ itens = valor recebido.
 * - Valor < total e `diferenca = "minha_parte"`: modo `minha_parte`. Todas as linhas
 *   ficam quitadas (o item é o restante inteiro de cada uma) e o Pagamento guarda o
 *   valor realmente recebido: Σ itens − valor recebido é "a minha parte".
 *
 * Erros: `pagamento.sem_itens`, `pagamento.nada_a_receber` (o total não é maior que
 * zero), `pagamento.valor_invalido`, `pagamento.valor_acima` e
 * `pagamento.diferenca_sem_escolha` (o `detalhe` leva a diferença, em centavos).
 */
export function alocarPagamento(
  entram: readonly ItemAPagar[],
  valorRecebidoCentavos: number,
  diferenca: EscolhaDaDiferenca | null = null,
): Resultado<AlocacaoDoPagamento> {
  const total = entram.reduce((soma, i) => soma + i.restanteCentavos, 0);
  if (entram.length === 0) return { ok: false, erro: { codigo: "pagamento.sem_itens" } };
  if (total <= 0) return { ok: false, erro: { codigo: "pagamento.nada_a_receber" } };
  if (!Number.isInteger(valorRecebidoCentavos) || valorRecebidoCentavos <= 0) {
    return { ok: false, erro: { codigo: "pagamento.valor_invalido" } };
  }
  if (valorRecebidoCentavos > total) {
    return { ok: false, erro: { codigo: "pagamento.valor_acima", detalhe: String(total) } };
  }
  const ordenadas = [...entram].sort(compararParaAlocar);
  if (valorRecebidoCentavos === total) return { ok: true, valor: { modo: "total", itens: ordenadas.map(inteiro) } };
  if (diferenca === null) {
    return { ok: false, erro: { codigo: "pagamento.diferenca_sem_escolha", detalhe: String(total - valorRecebidoCentavos) } };
  }
  if (diferenca === "minha_parte") return { ok: true, valor: { modo: "minha_parte", itens: ordenadas.map(inteiro) } };

  let sobra = valorRecebidoCentavos;
  const itens: ItemAlocado[] = [];
  for (const i of ordenadas) {
    if (i.restanteCentavos < 0) {
      // Crédito de verdade: entra sempre, inteiro, e libera o que ele cobre. Um Ajuste
      // negativo de parcela comum só entra se ainda há o que pagar (senão fica em aberto).
      if (i.credito || sobra > 0) {
        itens.push(inteiro(i));
        sobra -= i.restanteCentavos;
      }
      continue;
    }
    if (sobra <= 0) continue;
    const valor = Math.min(sobra, i.restanteCentavos);
    itens.push({ ...inteiro(i), valor_centavos: valor, quita: valor === i.restanteCentavos });
    sobra -= valor;
  }
  return { ok: true, valor: { modo: "parcial", itens } };
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
export type CampoDoPagamento = "status" | "data" | "valor" | "diferenca" | "geral";

export function campoDoErroDoPagamento(codigo: string): CampoDoPagamento {
  if (codigo === "pagamento.sem_status" || codigo === "pagamento.status_invalido") return "status";
  if (codigo.startsWith("pagamento.data_")) return "data";
  if (codigo === "pagamento.diferenca_sem_escolha") return "diferenca";
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
  modo: ModoDoPagamento;
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
  /** A escolha da pergunta da diferença ("" não existe: `null` = ainda não escolheu). Ignorada quando o valor é o total. */
  diferenca?: EscolhaDaDiferenca | null;
};

export type PlanoDoPagamento = {
  pedido: PedidoDePagamento;
  /** Quantos lançamentos o Pagamento toca (o "N" do aviso de `total` e de `minha_parte`). */
  quantidade: number;
  /** Quantos lançamentos ficam quitados (Status pago); no `parcial` pode ser menos que os que ele toca. */
  quitados: number;
  valorRecebidoCentavos: number;
};

/** Quantos lançamentos o Pagamento quita (os Ajustes seguem a parcela e não contam). */
function quitadosDoPagamento(entram: readonly ItemAPagar[], itens: readonly ItemAlocado[]): number {
  const quitam = new Set(itens.filter((i) => i.quita).map((i) => i.lancamento_id));
  return entram.filter((i) => !i.ehAjuste && quitam.has(i.id)).length;
}

/** Valida a janela e monta o pedido; o primeiro erro vence (Status, Data, Valor, diferença). */
export function planejarPagamento(e: EntradaDoPagamento): Resultado<PlanoDoPagamento> {
  if (e.statusId === "") return { ok: false, erro: { codigo: "pagamento.sem_status" } };
  if (!e.statusPagos.has(e.statusId)) return { ok: false, erro: { codigo: "pagamento.status_invalido" } };
  const data = lerDataDoPagamento(e.data, e.hoje);
  if (!data.ok) return data;
  const valor = lerValorRecebido(e.valorTexto);
  if (!valor.ok) return valor;
  const alocacao = alocarPagamento(e.projecao.entram, valor.valor, e.diferenca ?? null);
  if (!alocacao.ok) return alocacao;
  return {
    ok: true,
    valor: {
      pedido: {
        id: e.id,
        status_id: e.statusId,
        data: data.valor,
        valor_recebido_centavos: valor.valor,
        modo: alocacao.valor.modo,
        itens: alocacao.valor.itens,
      },
      quantidade: e.projecao.quantidade,
      quitados: quitadosDoPagamento(e.projecao.entram, alocacao.valor.itens),
      valorRecebidoCentavos: valor.valor,
    },
  };
}

// ------------------------------------------- Status "não pago" à mão (AD-10)

/**
 * Aplicar à mão um Status que não conta como pago (`escolhido` nulo ou fora de
 * `statusPagos`) numa linha que um Pagamento quitou (`quitadas`: `idsQuitadosPorPagamento`)
 * e que hoje conta como paga é recusado: é preciso desfazer o Pagamento antes.
 * Uma linha parcialmente paga (item parcial, Status ainda "não pago") troca de
 * "não pago" para outro "não pago" sem problema (6.2). A tela confere antes de
 * gravar; o banco confere de novo (gatilho), então uma gravação de outro aparelho
 * também é recusada.
 */
export function recusarStatusNaoPago(
  escolhido: string | null,
  statusPagos: ReadonlySet<string>,
  linhas: readonly { id: string; status_id: string | null }[],
  quitadas: ReadonlySet<string>,
): Resultado<true> {
  if (escolhido !== null && statusPagos.has(escolhido)) return { ok: true, valor: true };
  const recusadas = linhas.filter((l) => ehPago(l, statusPagos) && quitadas.has(l.id)).length;
  return recusadas === 0
    ? { ok: true, valor: true }
    : { ok: false, erro: { codigo: "pagamento.desfazer_antes", detalhe: String(recusadas) } };
}

// --------------------------------------------------------------- desfazer

/** Um item do Pagamento a desfazer (lido do banco). */
export type ItemParaDesfazer = {
  lancamento_id: string;
  status_anterior_id: string | null;
  /** Nulo no item parcial: o Pagamento não mudou o Status da linha, então não há o que devolver. */
  status_aplicado_id: string | null;
  /** Quando o item foi criado (a ordem entre Pagamentos). */
  created_at: string;
};

/** Outro item, de outro Pagamento não desfeito, que toca um dos Lançamentos. */
export type OutroItemDoLancamento = { lancamento_id: string; created_at: string };

export type PlanoDeDesfazer = {
  /** As linhas que recebem de volta o Status anterior, com a versão lida (a trava da RPC). */
  devolver: { lancamento_id: string; status_id: string | null; atualizado_em: string }[];
  /** Quantas linhas ficam como estão (o Status mudou à mão ou um Pagamento posterior as tocou). O item parcial não conta: ele não mudou o Status. */
  mantidas: number;
};

/**
 * O que desfazer um Pagamento faz nas linhas (AD-10): o `status_anterior_id`
 * volta só onde o Status atual ainda é o `status_aplicado_id` e nenhum
 * Pagamento posterior (item criado depois, de outro Pagamento não desfeito)
 * tocou a linha. As demais ficam como estão; o Pagamento é excluído em lógico
 * de qualquer jeito. O item parcial (`status_aplicado_id` nulo) nunca mudou o Status da
 * linha: o Pagamento sai e a linha fica como está. `linhas`: o estado atual lido do banco.
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
    if (item.status_aplicado_id === null) continue;
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
