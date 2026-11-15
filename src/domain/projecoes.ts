// Projeções: as linhas que uma Fórmula (`avaliar`) recebe (AD-11). A Fórmula
// nunca olha direto os Lançamentos: cada tela e cada regra pede a projeção
// que lhe cabe, e o Painel, o passo a passo e a mensagem somam as mesmas
// linhas. `projetarMensagem` (4.6, a regra de inclusão da mensagem) e
// `projetarMensagemDoBloco` (4.7, a forma 2) estão no fim deste arquivo;
// `projetarPendente` (Épico 6) virá aqui.

import { unidadesDoMes } from "./divisao";
import {
  avaliar,
  nomeDoOperando,
  termosDaFormula,
  textoDaFormula,
  type FatorDoTermo,
  type Formula,
  type LinhaDaFormula,
  type No,
  type NomesDaFormula,
  temOperando,
} from "./formula";
import { compararPelaFatura, linhasDoMes } from "./painel";
import { ehPrevistoNoMes } from "./previstos";
import { rotuloItensDeFora } from "./mensagens";
import type { Resultado } from "./resultado";

/** As colunas de `lancamentos` que a projeção do Painel lê. */
export type LancamentoParaProjetar = {
  id: string;
  mes: string;
  excluido_em: string | null;
  valor_centavos: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** Divisão (3.8): a mãe da parte; nulo na linha comum e na mãe. */
  dividido_de_id?: string | null;
  /** A Divisão da mãe; nulo na linha comum e na parte. */
  divisao?: unknown;
  /** Ajuste de centavos (2.8): a parcela dele. O Ajuste entra como linha própria, com a classificação da mãe. */
  ajuste_de_id?: string | null;
  /** `sistema` = previsto (3.5). Sem a coluna, a linha não é previsto. */
  lancado_por?: string;
  /** A Conta manual que gerou a linha (5.1): previsto enquanto o Mês não tem Fatura. */
  conta_manual_id?: string | null;
};

/**
 * Os Lançamentos do Painel do Mês (FR-19): todos os não excluídos do Mês
 * (da Fatura, Contas manuais, histórico, previstos e Ajustes de centavos),
 * com as filhas de uma Divisão no lugar da mãe dividida, que nunca soma. É a
 * mesma regra das unidades da grade (`unidadesDoMes`), então o total da
 * grade filtrada por um Bloco de soma simples é o valor do Bloco.
 */
export function projetarPainel(linhas: readonly LancamentoParaProjetar[], mes: string): LinhaDaFormula[] {
  return unidadesDoMes(linhasDoMes(linhas, mes)).map((l) => ({
    id: l.id,
    valor_centavos: l.valor_centavos,
    responsavel_id: l.responsavel_id,
    tipo_id: l.tipo_id,
  }));
}

/**
 * Os previstos que a projeção do Painel traz (`lancado_por = 'sistema'` e, num
 * Mês sem Fatura, as Contas manuais): é o que os Blocos somam num Mês sem
 * Fatura e mostram como "inclui previstos". `mesTemFatura` padrão: tem.
 */
export function idsDosPrevistos(
  linhas: readonly LancamentoParaProjetar[],
  mes: string,
  mesTemFatura = true,
): Set<string> {
  return new Set(
    unidadesDoMes(linhasDoMes(linhas, mes))
      .filter((l) => l.lancado_por !== undefined && ehPrevistoNoMes({ lancado_por: l.lancado_por, conta_manual_id: l.conta_manual_id }, mesTemFatura))
      .map((l) => l.id),
  );
}

// -------------------------------------------------------- projetarMensagem

/** As colunas de `lancamentos` que a regra de inclusão da mensagem lê. */
export type LancamentoParaMensagem = LancamentoParaProjetar & {
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  status_id: string | null;
  lancado_por: string;
  ordem_fatura: number | null;
  /** Desempate das linhas sem `ordem_fatura` (o histórico da planilha), como na grade. */
  created_at?: string | null;
};

/** Um Ajuste de centavos que acompanha a parcela dele na mensagem. */
export type AjusteDaMensagem = { id: string; valor_centavos: number };

/** Um item que entra na mensagem: a unidade da grade e os Ajustes dela. */
export type ItemProjetado = {
  id: string;
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  /** O valor da própria linha (negativo é estorno), sem os Ajustes. */
  valor_centavos: number;
  /** Os Ajustes dela, na ordem da fatura: viram linhas "↳ Ajuste" logo abaixo. */
  ajustes: readonly AjusteDaMensagem[];
  /** O líquido: o valor mais os Ajustes. É o que soma no total. */
  liquido_centavos: number;
};

/** Por que um item da Seleção não entra: já pago, de R$ 0,00 ou previsto. */
export const MOTIVOS_DE_FORA = ["pago", "zero", "previsto"] as const;
export type MotivoDeFora = (typeof MOTIVOS_DE_FORA)[number];

export type ForaDaMensagem = {
  /** Quantos itens ficaram de fora (os Ajustes seguem a parcela e não contam). */
  quantidade: number;
  porMotivo: Readonly<Record<MotivoDeFora, number>>;
};

export type OpcoesDaMensagem = {
  /** O Mês da mensagem: só entram Lançamentos dele. */
  mes: string;
  /** Os Status que contam como pago (`conta_como_pago`). Sem Status vale "não pago" (AD-10). */
  statusPagos: ReadonlySet<string>;
  /** O Mês tem Fatura importada? */
  temFatura: boolean;
  /** "Incluir previstos": só vale num Mês sem Fatura. */
  incluirPrevistos: boolean;
};

export type ProjecaoDaMensagem = {
  mes: string;
  /** Na ordem da fatura (a da grade); uma Divisão entra pelas partes, nunca pela mãe. */
  entram: readonly ItemProjetado[];
  /** A soma líquida dos itens que entram (estornos reduzem). */
  totalCentavos: number;
  fora: ForaDaMensagem;
  /**
   * Os ids dos itens de fora por já estarem pagos, com os Ajustes deles: a 4.7 tira
   * só estes da conta para dizer quanto "já foi pago" (um previsto não é pago).
   */
  idsPagos: readonly string[];
};

/** "Incluir previstos" só existe num Mês sem Fatura (a tela usa isto para mostrar o interruptor). */
export function podeIncluirPrevistos(temFatura: boolean): boolean {
  return !temFatura;
}

/**
 * A regra de inclusão da mensagem (FR-24, EXPERIENCE.md "Formato da mensagem"),
 * igual para a Seleção (4.6) e o Bloco (4.7): quais Lançamentos entram e quais
 * ficam de fora, com o motivo.
 *
 * - Só Lançamentos do Mês (`opcoes.mes`) e não excluídos: um id da Seleção que
 *   não é desse Mês (não deveria ocorrer, a Seleção é de um Mês só) simplesmente
 *   não existe aqui, e não vira "item de fora".
 * - As unidades da grade: uma Divisão entra pelas partes, nunca pela mãe.
 * - O Ajuste segue a parcela dele (entra e sai com ela, e soma no líquido). Um
 *   Ajuste marcado sem a parcela é um item como outro qualquer, como no total da barra.
 * - Ficam de fora, nesta ordem de precedência: previsto (salvo "Incluir previstos"
 *   num Mês sem Fatura), Status que conta como pago, valor R$ 0,00. Sem Status
 *   o Lançamento vale "não pago".
 * - Estorno (valor negativo) entra e reduz o total.
 * - "Pago parcialmente" ainda é só o Status: o app não tem Pagamentos, então o
 *   item entra com o valor cheio; o "só o que falta" vem com os Pagamentos (Épico 6).
 * - Dívida programada ainda não vencida: sem Dívidas programadas no app, não há o que tirar (Épico 6).
 */
export function projetarMensagem(
  selecao: ReadonlySet<string>,
  lancamentos: readonly LancamentoParaMensagem[],
  opcoes: OpcoesDaMensagem,
): ProjecaoDaMensagem {
  const doMes = linhasDoMes(lancamentos, opcoes.mes);
  const incluirPrevistos = opcoes.incluirPrevistos && podeIncluirPrevistos(opcoes.temFatura);
  const ajustesDe = new Map<string, LancamentoParaMensagem[]>();
  for (const l of doMes) {
    const mae = l.ajuste_de_id ?? null;
    if (mae === null || mae === l.id) continue;
    ajustesDe.set(mae, [...(ajustesDe.get(mae) ?? []), l]);
  }
  const idsDoMes = new Set(doMes.map((l) => l.id));
  // Um Ajuste cuja parcela também está marcada (e é do Mês) segue a parcela: não é um item.
  const segueAParcela = (l: LancamentoParaMensagem) => {
    const mae = l.ajuste_de_id ?? null;
    return mae !== null && mae !== l.id && idsDoMes.has(mae) && selecao.has(mae);
  };
  const marcadas = unidadesDoMes(doMes)
    .filter((l) => selecao.has(l.id) && !segueAParcela(l))
    .sort(compararPelaFatura);

  const entram: ItemProjetado[] = [];
  const idsPagos: string[] = [];
  const porMotivo: Record<MotivoDeFora, number> = { pago: 0, zero: 0, previsto: 0 };
  for (const l of marcadas) {
    const motivo: MotivoDeFora | null =
      ehPrevistoNoMes(l, opcoes.temFatura) && !incluirPrevistos
        ? "previsto"
        : l.status_id !== null && opcoes.statusPagos.has(l.status_id)
          ? "pago"
          : l.valor_centavos === 0
            ? "zero"
            : null;
    if (motivo !== null) {
      porMotivo[motivo] += 1;
      if (motivo === "pago") idsPagos.push(l.id, ...(ajustesDe.get(l.id) ?? []).map((a) => a.id));
      continue;
    }
    const ajustes = (ajustesDe.get(l.id) ?? [])
      .sort(compararPelaFatura)
      .map((a) => ({ id: a.id, valor_centavos: a.valor_centavos }));
    entram.push({
      id: l.id,
      nome: l.nome,
      apelido: l.apelido,
      parcela_n: l.parcela_n,
      parcela_total: l.parcela_total,
      valor_centavos: l.valor_centavos,
      ajustes,
      liquido_centavos: ajustes.reduce((soma, a) => soma + a.valor_centavos, l.valor_centavos),
    });
  }
  return {
    mes: opcoes.mes,
    entram,
    totalCentavos: entram.reduce((soma, i) => soma + i.liquido_centavos, 0),
    fora: { quantidade: porMotivo.pago + porMotivo.zero + porMotivo.previsto, porMotivo },
    idsPagos,
  };
}

/** O aviso da janela: "2 itens não entram: 1 já pago, 1 de R$ 0,00"; vazio se nada ficou de fora. */
export function avisoDosItensDeFora(fora: ForaDaMensagem): string {
  return rotuloItensDeFora(fora.quantidade, fora.porMotivo);
}

// ------------------------------------------------- projetarMensagemDoBloco (4.7)

/** Um grupo da forma 2: um termo da Fórmula, com o subtotal, a operação aplicada e os itens dele. */
export type GrupoDoBloco = {
  /** "Casal", "Casa", "Todos", "Rangel + Casal" (parêntese de soma); sem o "Menos ". */
  nome: string;
  /** A parcela é subtraída ("Menos Casal"). */
  subtraido: boolean;
  /** Um número solto na Fórmula: o grupo é "Valor fixo" e não tem itens. */
  valorFixo: boolean;
  /** O subtotal da base, em R$ (o que o operando soma sozinho). */
  subtotalCentavos: number;
  /** As operações × e ÷ por números aplicadas ao subtotal, na ordem. */
  fatores: readonly FatorDoTermo[];
  /** O que o grupo contribui ao total, com sinal (negativo se subtraído), arredondado no fim do termo. */
  resultadoCentavos: number;
  /** Os itens da base, na ordem da fatura. Um item pode estar em mais de um grupo. */
  itens: readonly ItemProjetado[];
};

export type ProjecaoDoBloco = {
  mes: string;
  grupos: readonly GrupoDoBloco[];
  /** Os itens que entram na mensagem (cada um uma vez), na ordem da fatura. */
  entram: readonly ItemProjetado[];
  /** A Fórmula aplicada só aos itens que entram: uma conta, um arredondamento (FR-54). */
  totalCentavos: number;
  /** Quanto os itens já pagos tiram do valor do Bloco ("R$ X já foram pagos e não entram"); 0 se nada. */
  pagosCentavos: number;
  fora: ForaDaMensagem;
  /** Quantos itens aparecem em mais de um grupo (e contam em cada um, como no Painel). */
  itensEmVariosGrupos: number;
};

/** O nome do grupo: o do operando, ou a Fórmula do parêntese de soma ("Rangel + Casal"). */
function nomeDaBase(base: No, nomes: NomesDaFormula): string {
  if (base.tipo === "grupo") return textoDaFormula(base.interno, nomes);
  if (base.tipo === "numero" || base.tipo === "operacao") return textoDaFormula(base, nomes);
  return nomeDoOperando(base, nomes);
}

/**
 * A mensagem da forma 2 (FR-53): a regra de inclusão da 4.6 sobre os Lançamentos
 * que a Fórmula usa, mais a Fórmula aplicada só aos itens que entram.
 *
 * 1. `avaliar` sobre a projeção do Painel diz quais linhas o Bloco usa; só elas
 *    viram a Seleção (o aviso de "fora" fala só do Bloco, não do Mês todo).
 * 2. `projetarMensagem` decide quais entram, com o motivo dos de fora.
 * 3. Os itens que entram (e os Ajustes deles, com a classificação do próprio
 *    Lançamento, como no Painel) formam a projeção filtrada.
 * 4. `avaliar` sobre a filtrada dá o total e o valor de cada termo.
 *
 * Erro só quando a Fórmula não calcula (`formula.divisao_por_zero`,
 * `formula.valor_grande`...): é o Bloco "sem valor" do cartão.
 */
export function projetarMensagemDoBloco(
  formula: Formula,
  lancamentos: readonly LancamentoParaMensagem[],
  opcoes: OpcoesDaMensagem,
  nomes: NomesDaFormula,
): Resultado<ProjecaoDoBloco> {
  const painel = projetarPainel(lancamentos, opcoes.mes);
  const noPainel = avaliar(formula, painel);
  if (!noPainel.ok) return noPainel;

  const projecao = projetarMensagem(new Set(noPainel.valor.entram), lancamentos, opcoes);
  const classificacao = new Map(linhasDoMes(lancamentos, opcoes.mes).map((l) => [l.id, l]));
  const filtrada: LinhaDaFormula[] = [];
  const deLinha = (id: string, valor: number): LinhaDaFormula => {
    const l = classificacao.get(id);
    return { id, valor_centavos: valor, responsavel_id: l?.responsavel_id ?? null, tipo_id: l?.tipo_id ?? null };
  };
  for (const item of projecao.entram) {
    filtrada.push(deLinha(item.id, item.valor_centavos));
    for (const a of item.ajustes) filtrada.push(deLinha(a.id, a.valor_centavos));
  }
  const total = avaliar(formula, filtrada);
  if (!total.ok) return total;

  const pagos = new Set(projecao.idsPagos);
  const semPagos = avaliar(
    formula,
    painel.filter((l) => !pagos.has(l.id)),
  );
  if (!semPagos.ok) return semPagos;

  const grupos: GrupoDoBloco[] = [];
  for (const termo of termosDaFormula(formula)) {
    const resultado = avaliar(termo.no, filtrada);
    if (!resultado.ok) return resultado;
    const base = avaliar(termo.base, filtrada);
    if (!base.ok) return base;
    const valorFixo = !temOperando(termo.base);
    const deste = new Set(base.valor.entram);
    grupos.push({
      nome: valorFixo ? "" : nomeDaBase(termo.base, nomes),
      subtraido: termo.subtraido,
      valorFixo,
      subtotalCentavos: valorFixo ? resultado.valor.valorCentavos : base.valor.valorCentavos,
      fatores: termo.fatores,
      resultadoCentavos: termo.subtraido ? -resultado.valor.valorCentavos : resultado.valor.valorCentavos,
      itens: projecao.entram.filter((i) => deste.has(i.id)),
    });
  }
  const aparicoes = new Map<string, number>();
  for (const g of grupos) for (const i of g.itens) aparicoes.set(i.id, (aparicoes.get(i.id) ?? 0) + 1);
  return {
    ok: true,
    valor: {
      mes: opcoes.mes,
      grupos,
      entram: projecao.entram,
      totalCentavos: total.valor.valorCentavos,
      pagosCentavos: noPainel.valor.valorCentavos - semPagos.valor.valorCentavos,
      fora: projecao.fora,
      itensEmVariosGrupos: [...aparicoes.values()].filter((n) => n > 1).length,
    },
  };
}
