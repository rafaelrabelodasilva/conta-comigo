// Recebimentos por Bloco de cobrança (História 6.5, FR-26, AD-11, AD-10). Puro: os Status pagos, os
// itens de Pagamento e o atraso (de `atraso.ts`) chegam como parâmetro. Tela e SQL só chamam estas
// funções.
//
// - `montarCartoesDeCobranca`: um cartão por Bloco de cobrança (`de_cobranca`), com o Saldo
//   pendente (`avaliar(formula, projetarPendente())`, a mesma conta do Painel e da mensagem), o selo
//   ("Em dia", "Não pago", "Atrasado") e os Meses em aberto. Um Bloco "meu" que não é de cobrança
//   não vira cartão.
// - `faltaReceberDoMes`: o "Falta receber" do `invoice-hero`: a soma dos Blocos de cobrança sobre o
//   que está em aberto num Mês (`projetarPendente` com `mes`).
// - `recebidoNoMes`: o "Recebido no mês": Σ do valor RECEBIDO dos Pagamentos com `data` no Mês
//   (calendário). Num Pagamento `minha_parte` o valor recebido é menor que o que ele quitou.
// - `listaEmAberto`: os Lançamentos em aberto de um Bloco, agrupados por Mês (o "Ver").

import { avaliar, type LinhaDaFormula } from "./formula";
import { responsavelUnico, type Bloco } from "./blocos";
import { compararPelaFatura } from "./painel";
import { linhaDaFormulaPendente, type LinhaPendente } from "./projecoes";

/** Os Blocos de cobrança (`de_cobranca`), na ordem recebida. "Meu Bloco" sozinho não conta. */
export function blocosDeCobranca<B extends Pick<Bloco, "de_cobranca">>(blocos: readonly B[]): B[] {
  return blocos.filter((b) => b.de_cobranca);
}

/** O selo do cartão: "Em dia", "Não pago" ou "Atrasado". */
export type SituacaoDeCobranca = "em_dia" | "nao_pago" | "atrasado";

export type CartaoDeCobranca = {
  id: string;
  nome: string;
  /** O Responsável de um Bloco de uma pessoa só (a bolinha); `null` nos outros. */
  responsavelId: string | null;
  /** O Saldo pendente; `null` só quando a Fórmula não calcula. */
  saldoCentavos: number | null;
  situacao: SituacaoDeCobranca;
  /** Os Meses (`AAAA-MM`) com algo em aberto neste Bloco, do mais antigo ao mais novo. */
  mesesEmAberto: string[];
  /** Os Lançamentos (ou créditos) que entram na Fórmula do Bloco. */
  ids: string[];
  /** O primeiro dia de atraso mais antigo entre os itens do Bloco; `null` se nenhum está atrasado. */
  atrasadoDesde: string | null;
};

/**
 * Os cartões de Recebimentos: um por Bloco de cobrança, na ordem dos Blocos.
 *
 * - O Saldo pendente é `avaliar(formula, projetarPendente())`: o Rangel (Rangel + Casal ÷ 2) aparece
 *   com a metade do Casal. Erro da Fórmula (divisão por zero…) deixa o Saldo `null`: o cartão
 *   mostra "—" e a situação sai só dos itens.
 * - Situação: "Atrasado" se ALGUM item do Bloco está atrasado (`atrasos`: id → primeiro dia de
 *   atraso, de `atrasosDasLinhas`); senão "Não pago" se o Saldo é maior que zero; senão "Em dia"
 *   (Saldo zero, ou negativo: crédito, nada a cobrar).
 * - Meses em aberto: os Meses das linhas do Bloco com `restante` positivo. O crédito de algo
 *   excluído não abre um Mês.
 */
export function montarCartoesDeCobranca(
  blocos: readonly Bloco[],
  pendentes: readonly LinhaPendente[],
  atrasos: ReadonlyMap<string, string>,
): CartaoDeCobranca[] {
  const linhas: LinhaDaFormula[] = pendentes.map(linhaDaFormulaPendente);
  const porId = new Map(pendentes.map((p) => [p.id, p]));
  return blocosDeCobranca(blocos).map((bloco): CartaoDeCobranca => {
    const a = avaliar(bloco.formula, linhas);
    const ids = a.ok ? a.valor.entram : [];
    const saldoCentavos = a.ok ? a.valor.valorCentavos : null;
    const emAberto = ids
      .map((id) => porId.get(id))
      .filter((p): p is LinhaPendente => p !== undefined && p.restanteCentavos > 0);
    const desde = ids
      .map((id) => atrasos.get(id))
      .filter((d): d is string => d !== undefined)
      .sort()[0];
    const aCobrar = saldoCentavos === null ? emAberto.length > 0 : saldoCentavos > 0;
    const situacao: SituacaoDeCobranca = desde !== undefined ? "atrasado" : aCobrar ? "nao_pago" : "em_dia";
    return {
      id: bloco.id,
      nome: bloco.nome,
      responsavelId: responsavelUnico(bloco.formula),
      saldoCentavos,
      situacao,
      mesesEmAberto: [...new Set(emAberto.map((p) => p.mes))].sort(),
      ids,
      atrasadoDesde: desde ?? null,
    };
  });
}

/**
 * O "Falta receber" do Mês (`invoice-hero`): a soma do Saldo dos Blocos de cobrança sobre o que está
 * em aberto NESSE Mês (as linhas de `projetarPendente` com `mes`). Um Bloco cuja Fórmula não calcula
 * fica de fora da soma e é contado em `semValor`.
 */
export function faltaReceberDoMes(
  blocos: readonly Pick<Bloco, "formula" | "de_cobranca">[],
  pendentesDoMes: readonly LinhaPendente[],
): { totalCentavos: number; blocos: number; semValor: number } {
  const linhas = pendentesDoMes.map(linhaDaFormulaPendente);
  let totalCentavos = 0;
  let semValor = 0;
  const deCobranca = blocosDeCobranca(blocos);
  for (const bloco of deCobranca) {
    const a = avaliar(bloco.formula, linhas);
    if (a.ok) totalCentavos += a.valor.valorCentavos;
    else semValor += 1;
  }
  return { totalCentavos, blocos: deCobranca.length, semValor };
}

/** O que o "Recebido no mês" lê de um Pagamento. */
export type PagamentoParaSomar = {
  /** `AAAA-MM-DD`: o dia em que o dinheiro entrou. */
  data: string;
  valor_recebido_centavos: number;
  excluido_em?: string | null;
};

/**
 * "Recebido no mês": o valor recebido dos Pagamentos (não desfeitos) cuja `data` cai no Mês
 * (`AAAA-MM`, pelo calendário). É o valor que entrou (`valor_recebido_centavos`), não o que os
 * itens quitaram: num Pagamento `minha_parte` os itens somam mais.
 */
export function recebidoNoMes(pagamentos: readonly PagamentoParaSomar[], mes: string): number {
  let total = 0;
  for (const p of pagamentos) {
    if ((p.excluido_em ?? null) !== null) continue;
    if (p.data.slice(0, 7) === mes) total += p.valor_recebido_centavos;
  }
  return total;
}

// ---------------------------------------------------------------- o "Ver"

/** O que a lista "Ver" lê de um Lançamento (as colunas de `lancamentos`). */
export type LancamentoDaLista = {
  id: string;
  mes: string;
  ajuste_de_id?: string | null;
  ordem_fatura: number | null;
  created_at?: string | null;
};

/** Uma linha da lista "Ver": o Lançamento, o que falta dele e os Ajustes que acompanham a parcela. */
export type ItemDaLista<L> = {
  lancamento: L;
  pendente: LinhaPendente;
  /** Os Ajustes de centavos em aberto dela (ficam logo abaixo, sem caixa). */
  ajustes: ItemDaLista<L>[];
};

export type GrupoDoMes<L> = { mes: string; itens: ItemDaLista<L>[] };

/**
 * Os Lançamentos em aberto de um Bloco (`ids`: os que a Fórmula usa), agrupados por Mês, do mais
 * novo para o mais antigo (como a forma 3 da mensagem). Em cada Mês, a ordem da fatura, com os
 * créditos de algo excluído no fim. O Ajuste de centavos de uma parcela que também está na lista fica
 * sob ela; sem a parcela, é uma linha própria. O crédito de algo excluído vira uma linha só de
 * leitura, que o chamador reconhece por `pendente.credito`.
 */
export function listaEmAberto<L extends LancamentoDaLista>(
  ids: readonly string[],
  lancamentos: readonly L[],
  pendentes: readonly LinhaPendente[],
): GrupoDoMes<L>[] {
  const doBloco = new Set(ids);
  const linhas = new Map(lancamentos.map((l) => [l.id, l]));
  const itens = new Map<string, ItemDaLista<L>>();
  for (const p of pendentes) {
    if (!doBloco.has(p.id)) continue;
    const lancamento = linhas.get(p.id);
    if (lancamento) itens.set(p.id, { lancamento, pendente: p, ajustes: [] });
  }
  const raizes: ItemDaLista<L>[] = [];
  for (const item of itens.values()) {
    const mae = item.lancamento.ajuste_de_id ?? null;
    const dona = mae !== null && mae !== item.lancamento.id ? itens.get(mae) : undefined;
    if (dona && !item.pendente.credito && !dona.pendente.credito) dona.ajustes.push(item);
    else raizes.push(item);
  }
  const porFatura = (a: ItemDaLista<L>, b: ItemDaLista<L>) =>
    Number(a.pendente.credito) - Number(b.pendente.credito) ||
    compararPelaFatura(a.lancamento, b.lancamento) ||
    (a.lancamento.id < b.lancamento.id ? -1 : 1);
  const grupos = new Map<string, ItemDaLista<L>[]>();
  for (const item of raizes) {
    item.ajustes.sort(porFatura);
    grupos.set(item.pendente.mes, [...(grupos.get(item.pendente.mes) ?? []), item]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([mes, lista]) => ({ mes, itens: lista.sort(porFatura) }));
}

/** Os ids que têm caixa na lista: as linhas a cobrar, sem os créditos e sem os Ajustes sob uma parcela. */
export function idsSelecionaveis<L>(grupos: readonly GrupoDoMes<L>[]): string[] {
  return grupos.flatMap((g) => g.itens.filter((i) => !i.pendente.credito).map((i) => i.pendente.id));
}
