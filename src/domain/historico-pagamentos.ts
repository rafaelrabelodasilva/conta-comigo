// Histórico de Pagamentos (História 6.3, FR-25, FR-29, AD-1, AD-2, AD-10, AD-16). Puro: a tela lê
// os Pagamentos, os itens e as linhas que eles tocam e entrega aqui; nada de relógio nem de banco.
//
// - `resumirPagamentos`: uma linha da lista por Pagamento VIVO (o desfeito sai, AD-16): data,
//   Responsáveis, quantidade de Lançamentos, valor recebido e modo. O **valor da lista é
//   `valor_recebido_centavos`** (o que entrou), nunca Σ itens: em `minha_parte` os itens somam mais
//   que o recebido (6.2, decisão 2).
// - **Responsável de um Pagamento** (decisão 1 da 6.3): a tabela não guarda Responsável; vem das
//   linhas dos itens. Um Pagamento pode quitar linhas de vários (o Rangel paga "Casal" + "Rangel"):
//   a lista mostra TODOS, do que tem mais valor nos itens (Σ |valor|) para o que tem menos, e o
//   filtro por Responsável acha o Pagamento por qualquer um deles. Quem pagou (o Bloco de cobrança)
//   não é derivável das linhas; fica para quando a janela "Aplicar status" o gravar.
// - **Quantidade** = Lançamentos que o Pagamento toca; o Ajuste de centavos segue a parcela e não
//   conta (como o aviso do Pagamento e a projeção da 6.1).
// - `detalharPagamento`: os Lançamentos que o Pagamento quitou, na ordem do Mês, da data e da fatura
//   (o Ajuste logo depois da parcela), com o item de cada um. Em `minha_parte`, "a minha parte" é
//   Σ itens − valor recebido.
// - `resumirDesfazer`: o que a janela de confirmação diz (quantas linhas voltam ao Status anterior,
//   quantas ficam e por quê), a partir da classificação de `classificarDesfazerPagamento`.

import { instanteEmMicros } from "./datas";
import { compararParaAlocar, type DestinoDoItemAoDesfazer, type ItemAPagar, type ModoDoPagamento } from "./pagamento";

const MODOS: readonly ModoDoPagamento[] = ["total", "parcial", "minha_parte"];

/** Um modo gravado fora dos três (não acontece: o `check` do banco) vale `total`. */
export function modoLido(modo: string): ModoDoPagamento {
  return (MODOS as readonly string[]).includes(modo) ? (modo as ModoDoPagamento) : "total";
}

/** As colunas de `pagamentos` que o histórico lê. */
export type PagamentoLido = {
  id: string;
  data: string;
  modo: string;
  valor_recebido_centavos: number;
  created_at: string;
  excluido_em?: string | null;
};

/** As colunas de `pagamento_itens` que a lista lê. */
export type ItemDoPagamentoLido = {
  pagamento_id: string;
  lancamento_id: string;
  valor_centavos: number;
  excluido_em?: string | null;
};

/** O que a lista precisa de uma linha: de quem é e se é Ajuste de centavos. */
export type LinhaDoHistorico = {
  id: string;
  responsavel_id: string | null;
  ajuste_de_id?: string | null;
};

/** Ajuste de centavos: a linha acompanha uma parcela e não conta como "lançamento" na contagem. */
export function ehAjusteDeCentavos(l: { id: string; ajuste_de_id?: string | null }): boolean {
  const mae = l.ajuste_de_id ?? null;
  return mae !== null && mae !== l.id;
}

export type ResponsavelNoPagamento = {
  /** `null`: linha sem Responsável. */
  id: string | null;
  /** Σ |valor dos itens| das linhas dele neste Pagamento (para ordenar). */
  centavos: number;
};

export type ResumoDoPagamento = {
  id: string;
  data: string;
  modo: ModoDoPagamento;
  /** O que entrou (`pagamentos.valor_recebido_centavos`). */
  valorRecebidoCentavos: number;
  /** Lançamentos que o Pagamento toca (sem os Ajustes). */
  quantidade: number;
  /** Do de maior valor para o de menor (empate: o id). */
  responsaveis: ResponsavelNoPagamento[];
  criadoEm: string;
};

/** Ordem por id, com o "sem Responsável" por último. */
function compararIds(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function microsOuZero(instante: string): number {
  const m = instanteEmMicros(instante);
  return Number.isNaN(m) ? 0 : m;
}

/** A ordem da lista: a data do Pagamento (a mais nova primeiro), no empate a criação, depois o id. */
export function compararHistorico(a: ResumoDoPagamento, b: ResumoDoPagamento): number {
  if (a.data !== b.data) return a.data < b.data ? 1 : -1;
  const porCriacao = microsOuZero(b.criadoEm) - microsOuZero(a.criadoEm);
  if (porCriacao !== 0) return porCriacao;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * A lista do histórico. Só entram Pagamentos vivos e com ao menos um item vivo (um Pagamento acabou
 * de nascer e os itens ainda não chegaram: aparece quando chegam). Linhas que ainda não foram lidas
 * contam no total e valem "sem Responsável"; a tela espera a leitura antes de mostrar.
 */
export function resumirPagamentos(
  pagamentos: readonly PagamentoLido[],
  itens: readonly ItemDoPagamentoLido[],
  linhas: ReadonlyMap<string, LinhaDoHistorico>,
): ResumoDoPagamento[] {
  const doPagamento = new Map<string, ItemDoPagamentoLido[]>();
  for (const i of itens) {
    if ((i.excluido_em ?? null) !== null) continue;
    const lista = doPagamento.get(i.pagamento_id);
    if (lista) lista.push(i);
    else doPagamento.set(i.pagamento_id, [i]);
  }
  const saida: ResumoDoPagamento[] = [];
  for (const p of pagamentos) {
    if ((p.excluido_em ?? null) !== null) continue;
    const seus = doPagamento.get(p.id);
    if (!seus || seus.length === 0) continue;
    let quantidade = 0;
    const porResponsavel = new Map<string | null, number>();
    for (const i of seus) {
      const linha = linhas.get(i.lancamento_id);
      if (!linha || !ehAjusteDeCentavos(linha)) quantidade += 1;
      const quem = linha?.responsavel_id ?? null;
      porResponsavel.set(quem, (porResponsavel.get(quem) ?? 0) + Math.abs(i.valor_centavos));
    }
    const responsaveis = [...porResponsavel.entries()]
      .map(([id, centavos]) => ({ id, centavos }))
      .sort((a, b) => b.centavos - a.centavos || compararIds(a.id, b.id));
    saida.push({
      id: p.id,
      data: p.data,
      modo: modoLido(p.modo),
      valorRecebidoCentavos: p.valor_recebido_centavos,
      quantidade,
      responsaveis,
      criadoEm: p.created_at,
    });
  }
  return saida.sort(compararHistorico);
}

/** Os Responsáveis que aparecem em algum Pagamento (para o filtro), sem repetir e sem o "sem Responsável". */
export function responsaveisDoHistorico(resumos: readonly ResumoDoPagamento[]): string[] {
  const vistos = new Set<string>();
  for (const r of resumos) for (const x of r.responsaveis) if (x.id !== null) vistos.add(x.id);
  return [...vistos];
}

/**
 * O filtro por Responsável: `null` mostra todos. Um Pagamento que quitou linhas de vários (o Rangel
 * paga o Casal e o Rangel) aparece no filtro de cada um deles.
 */
export function filtrarHistorico(resumos: readonly ResumoDoPagamento[], responsavelId: string | null): ResumoDoPagamento[] {
  if (responsavelId === null) return [...resumos];
  return resumos.filter((r) => r.responsaveis.some((x) => x.id === responsavelId));
}

// ------------------------------------------------------------------ detalhe

/** As colunas de `pagamento_itens` que o detalhe lê. */
export type ItemDoDetalhe = {
  lancamento_id: string;
  valor_centavos: number;
  status_anterior_id: string | null;
  /** Nulo no item parcial: o Pagamento não mudou o Status. */
  status_aplicado_id: string | null;
  created_at: string;
};

/** O que o detalhe lê de uma linha para ordenar (a tela guarda o resto). */
export type LinhaOrdenavel = {
  id: string;
  mes: string;
  data?: string | null;
  ordem_fatura?: number | null;
  created_at?: string | null;
  ajuste_de_id?: string | null;
};

export type LinhaDoDetalhe<L> = {
  item: ItemDoDetalhe;
  /** `null` se a linha não veio da leitura. */
  linha: L | null;
  ehAjuste: boolean;
  /** Item parcial (o Status da linha não mudou). */
  parcial: boolean;
};

export type DetalheDoPagamento<L> = {
  linhas: LinhaDoDetalhe<L>[];
  /** Lançamentos que o Pagamento toca (sem os Ajustes). */
  quantidade: number;
  /** Σ itens: o que o Pagamento quitou. */
  quitadoCentavos: number;
  /** `minha_parte`: Σ itens − valor recebido (o que ficou com quem cobra); nos outros modos, `null`. */
  minhaParteCentavos: number | null;
};

function paraOrdenar<L extends LinhaOrdenavel>(item: ItemDoDetalhe, linha: L | undefined, ajustes: ReadonlyMap<string, L>): ItemAPagar {
  // A ordem é a da alocação (Mês, data, fatura, criação, id; o Ajuste logo depois da parcela), sem créditos primeiro.
  const mae = linha && ehAjusteDeCentavos(linha) ? (ajustes.get(linha.ajuste_de_id!) ?? null) : null;
  const base = mae ?? linha;
  return {
    id: item.lancamento_id,
    mes: base?.mes ?? "9999-99",
    restanteCentavos: item.valor_centavos,
    atualizadoEm: "",
    ehAjuste: mae !== null,
    credito: false,
    chaveId: mae?.id ?? item.lancamento_id,
    data: base?.data ?? null,
    ordemFatura: base?.ordem_fatura ?? null,
    criadoEm: base?.created_at ?? null,
  };
}

/**
 * Os Lançamentos que o Pagamento quitou, para o detalhe. `itens` são só os itens vivos DESTE
 * Pagamento; `linhas`, as linhas lidas por id (as excluídas depois também: o item guarda a FK).
 */
export function detalharPagamento<L extends LinhaOrdenavel>(
  pagamento: { modo: string; valor_recebido_centavos: number },
  itens: readonly ItemDoDetalhe[],
  linhas: ReadonlyMap<string, L>,
): DetalheDoPagamento<L> {
  const ordenados = itens
    .map((item) => ({ item, ordem: paraOrdenar(item, linhas.get(item.lancamento_id), linhas) }))
    .sort((a, b) => compararParaAlocar(a.ordem, b.ordem));
  const lista: LinhaDoDetalhe<L>[] = ordenados.map(({ item }) => {
    const linha = linhas.get(item.lancamento_id) ?? null;
    return { item, linha, ehAjuste: linha !== null && ehAjusteDeCentavos(linha), parcial: item.status_aplicado_id === null };
  });
  const quitado = itens.reduce((soma, i) => soma + i.valor_centavos, 0);
  const minha = modoLido(pagamento.modo) === "minha_parte" ? quitado - pagamento.valor_recebido_centavos : null;
  return {
    linhas: lista,
    quantidade: lista.filter((l) => !l.ehAjuste).length,
    quitadoCentavos: quitado,
    minhaParteCentavos: minha !== null && minha > 0 ? minha : null,
  };
}

// ----------------------------------------------------------------- desfazer

export type ResumoDoDesfazer = {
  /** Lançamentos que voltam ao Status anterior. */
  voltam: number;
  /** Lançamentos que ficam: o Status mudou desde o Pagamento. */
  ficamStatusMudou: number;
  /** Lançamentos que ficam: outro Pagamento tocou a linha depois. */
  ficamPagamentoPosterior: number;
  /** Lançamentos só com item parcial: o Status não muda, só o valor recebido sai da conta. */
  parciais: number;
};

/** Conta os destinos de `classificarDesfazerPagamento` por Lançamento (os Ajustes de centavos seguem a parcela e não contam). */
export function resumirDesfazer(
  itens: readonly { lancamento_id: string; destino: DestinoDoItemAoDesfazer }[],
  ajustes: ReadonlySet<string> = new Set(),
): ResumoDoDesfazer {
  const resumo: ResumoDoDesfazer = { voltam: 0, ficamStatusMudou: 0, ficamPagamentoPosterior: 0, parciais: 0 };
  for (const i of itens) {
    if (ajustes.has(i.lancamento_id)) continue;
    if (i.destino === "devolver") resumo.voltam += 1;
    else if (i.destino === "status_mudou") resumo.ficamStatusMudou += 1;
    else if (i.destino === "pagamento_posterior") resumo.ficamPagamentoPosterior += 1;
    else resumo.parciais += 1;
  }
  return resumo;
}

/**
 * Duas leituras do plano de desfazer querem dizer o mesmo? A janela mostrou uma; ao confirmar o
 * repositório lê de novo e só grava se for igual (senão `pagamento.mudou`, e a janela se refaz).
 */
export function mesmoPlanoDeDesfazer(
  a: readonly { lancamento_id: string; destino: DestinoDoItemAoDesfazer }[],
  b: readonly { lancamento_id: string; destino: DestinoDoItemAoDesfazer }[],
): boolean {
  const chave = (l: readonly { lancamento_id: string; destino: DestinoDoItemAoDesfazer }[]) =>
    l
      .map((i) => `${i.lancamento_id}:${i.destino}`)
      .sort()
      .join("|");
  return chave(a) === chave(b);
}
