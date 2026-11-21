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
// - `projetarCobrancaDoBloco` (6.7, FR-28): a forma 3 da mensagem, "Cobrar pendências". O total é o
//   Saldo do cartão (`avaliar` sobre as linhas de `projetarPendente`, uma conta e um arredondamento,
//   FR-54) e os detalhes são a mesma lista do "Ver", por Mês, do mais antigo ao mais novo.

import { avaliar, type Formula, type LinhaDaFormula, type NomesDaFormula } from "./formula";
import { responsavelUnico, type Bloco } from "./blocos";
import { compararPelaFatura } from "./painel";
import {
  linhaDaFormulaPendente,
  separarPendentes,
  termosDoBloco,
  type ForaDaMensagem,
  type LancamentoParaPendente,
  type LinhaPendente,
  type OpcoesDoPendente,
  type TermoDoBloco,
} from "./projecoes";
import type { Resultado } from "./resultado";

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
 * O "Falta receber" do Mês (`invoice-hero`): quanto falta receber das LINHAS DISTINTAS em aberto NESSE
 * Mês (as linhas de `projetarPendente` com `mes`) que algum Bloco de cobrança cita.
 *
 * Decisão (Defeito 4, revista da decisão 8 da 6.5, que somava os Blocos "literalmente"): cada linha
 * entra UMA vez, na Fórmula do PRIMEIRO Bloco que a cita (na ordem `ordem` dos Blocos). Com "Casal" e
 * "Casal ÷ 2" marcados, a linha do Casal entra no "Casal" e o "Casal ÷ 2" já não tem o que somar; antes
 * ela entrava nos dois e o hero mostrava mais do que a soma dos cartões distintos. Cada Bloco é avaliado
 * pela Fórmula dele (um só arredondamento) sobre as linhas que ainda não foram levadas por um Bloco
 * anterior. O cartão de cada Bloco em Recebimentos não muda (cada pessoa vê o saldo dela inteiro).
 *
 * Um Bloco cuja Fórmula não calcula não leva linha de ninguém, fica de fora da soma e é contado em
 * `semValor`: o hero diz "N Blocos não entraram na soma" em vez de calar.
 */
export function faltaReceberDoMes(
  blocos: readonly (Pick<Bloco, "formula" | "de_cobranca"> & Partial<Pick<Bloco, "ordem">>)[],
  pendentesDoMes: readonly LinhaPendente[],
): { totalCentavos: number; blocos: number; semValor: number } {
  const todas = pendentesDoMes.map(linhaDaFormulaPendente);
  const deCobranca = [...blocosDeCobranca(blocos)].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  let restantes = todas;
  let totalCentavos = 0;
  let semValor = 0;
  for (const bloco of deCobranca) {
    // O Bloco "não calcula" pelo mesmo critério do cartão (a Fórmula sobre todas as linhas).
    const cheio = avaliar(bloco.formula, todas);
    if (!cheio.ok) {
      semValor += 1;
      continue;
    }
    const doBloco = avaliar(bloco.formula, restantes);
    if (!doBloco.ok) {
      semValor += 1;
      continue;
    }
    totalCentavos += doBloco.valor.valorCentavos;
    const citadas = new Set(cheio.valor.entram);
    restantes = restantes.filter((l) => !citadas.has(l.id));
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

// ------------------------------------------------- Cobrar pendências (6.7)

/** As colunas de `lancamentos` que a forma 3 lê: as do pendente, as do "Ver" e o que a linha de detalhe mostra. */
export type LancamentoDaCobranca = LancamentoParaPendente &
  LancamentoDaLista & {
    nome: string;
    apelido: string | null;
    parcela_n: number | null;
    parcela_total: number | null;
  };

/** Um item da forma 3: o que FALTA de um Lançamento (AD-10) e os Ajustes dele, que ficam logo abaixo. */
export type ItemDaCobranca = {
  id: string;
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  /** O restante (o valor cheio, ou só o que falta de um Pago parcialmente). Negativo é estorno ou crédito. */
  valor_centavos: number;
  /** O crédito de algo pago e depois excluído (AD-11): sem ele os detalhes não fechariam com o total. */
  credito: boolean;
  ajustes: readonly { id: string; valor_centavos: number }[];
};

export type MesDaCobranca = { mes: string; itens: ItemDaCobranca[] };

export type ProjecaoDaCobranca = {
  /** O "Em aberto: R$ X": o Saldo pendente do Bloco, a mesma conta do cartão. */
  totalCentavos: number;
  /** Os Meses com algo em aberto, do mais antigo ao mais novo (a ordem em que o Pagamento quita). */
  meses: MesDaCobranca[];
  /**
   * Os termos da Fórmula, só quando ela NÃO é uma soma simples (tem ÷, ×, subtração ou valor fixo):
   * sem eles os detalhes, que mostram os valores cheios, não explicariam o total (o Rangel: o Casal ÷ 2).
   * Vazio numa Fórmula de soma simples.
   */
  termos: readonly Omit<TermoDoBloco, "ids">[];
  /** Só o motivo `programada` é contado aqui (os outros são o normal de todos os Meses). */
  fora: ForaDaMensagem;
};

/** A Fórmula só soma operandos inteiros (sem ÷, ×, subtração nem número solto): os detalhes já são o total. */
function ehSomaSimples(termos: readonly TermoDoBloco[]): boolean {
  return termos.every((t) => !t.subtraido && !t.valorFixo && t.fatores.length === 0);
}

/**
 * A forma 3 da mensagem (FR-28, EXPERIENCE.md "Formato da mensagem"): tudo o que um Bloco de cobrança
 * ainda deve, de todos os Meses.
 *
 * - **Uma regra de "em aberto" (AD-11):** as linhas são as de `separarPendentes` (as mesmas de
 *   `projetarPendente`, que alimenta o Saldo do cartão). O total é `avaliar(formula, essas linhas)`:
 *   um único arredondamento, no fim (FR-54). Nada aqui decide o que está em aberto.
 * - **Detalhes:** os Lançamentos que a Fórmula usa, com o restante de cada um, agrupados por Mês
 *   (`listaEmAberto`, a lista do "Ver": o Ajuste fica sob a parcela, a mãe dividida entra pelas
 *   partes) do mais antigo ao mais novo. Nenhum subtotal por Mês é calculado: dividir ou subtrair
 *   por Mês e somar os meses quebraria o arredondamento só no final.
 * - **Fórmula que não é soma simples:** os termos (`termosDoBloco`, os mesmos da forma 2) vêm à parte,
 *   calculados uma vez sobre todos os Meses.
 * - **Fora:** a Dívida programada ainda não vencida não entra (como no Saldo) e é contada em
 *   `fora.porMotivo.programada` para o aviso da janela.
 *
 * Erro só quando a Fórmula não calcula (o cartão mostra "—").
 */
export function projetarCobrancaDoBloco(
  formula: Formula,
  lancamentos: readonly LancamentoDaCobranca[],
  opcoes: OpcoesDoPendente,
  nomes: NomesDaFormula,
): Resultado<ProjecaoDaCobranca> {
  const { pendentes, programadas } = separarPendentes(lancamentos, opcoes);
  const linhas = pendentes.map(linhaDaFormulaPendente);
  const total = avaliar(formula, linhas);
  if (!total.ok) return total;
  const termos = termosDoBloco(formula, linhas, nomes);
  if (!termos.ok) return termos;

  const grupos = listaEmAberto(total.valor.entram, lancamentos, pendentes);
  const meses = grupos.reverse().map(
    ({ mes, itens }): MesDaCobranca => ({
      mes,
      itens: itens.map((i) => ({
        id: i.pendente.id,
        nome: i.lancamento.nome,
        apelido: i.lancamento.apelido,
        parcela_n: i.lancamento.parcela_n,
        parcela_total: i.lancamento.parcela_total,
        valor_centavos: i.pendente.restanteCentavos,
        credito: i.pendente.credito,
        ajustes: i.ajustes.map((a) => ({ id: a.pendente.id, valor_centavos: a.pendente.restanteCentavos })),
      })),
    }),
  );

  // As Dívidas programadas ainda não vencidas que são deste Bloco. O Ajuste de uma parcela programada
  // segue a parcela e não conta (como na forma 1).
  const adiadas = avaliar(formula, programadas.map(linhaDaFormulaPendente));
  const idsAdiados = new Set(programadas.map((p) => p.id));
  const donaDe = new Map(lancamentos.map((l) => [l.id, l.ajuste_de_id ?? null]));
  const programada = adiadas.ok
    ? adiadas.valor.entram.filter((id) => {
        const mae = donaDe.get(id) ?? null;
        return !(mae !== null && mae !== id && idsAdiados.has(mae));
      }).length
    : 0;

  return {
    ok: true,
    valor: {
      totalCentavos: total.valor.valorCentavos,
      meses,
      termos: ehSomaSimples(termos.valor)
        ? []
        : termos.valor.map((t) => ({
            nome: t.nome,
            subtraido: t.subtraido,
            valorFixo: t.valorFixo,
            subtotalCentavos: t.subtotalCentavos,
            fatores: t.fatores,
            resultadoCentavos: t.resultadoCentavos,
          })),
      fora: { quantidade: programada, porMotivo: { pago: 0, zero: 0, previsto: 0, programada } },
    },
  };
}
