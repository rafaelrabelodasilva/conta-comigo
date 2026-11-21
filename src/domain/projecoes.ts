// Projeções: as linhas que uma Fórmula (`avaliar`) recebe (AD-11). A Fórmula
// nunca olha direto os Lançamentos: cada tela e cada regra pede a projeção
// que lhe cabe, e o Painel, o passo a passo e a mensagem somam as mesmas
// linhas. `projetarMensagem` (4.6, a regra de inclusão da mensagem),
// `projetarMensagemDoBloco` (4.7, a forma 2) e `projetarPendente` (6.5, o que falta
// receber, em Recebimentos) estão neste arquivo. Desde a 6.2 a mensagem cobra só o que
// falta de um Lançamento "Pago parcialmente" (`restante`, AD-10). Desde a 6.6, uma Dívida programada
// ainda não vencida (o Mês do `vencimento_combinado` não chegou) fica fora da mensagem e do Saldo
// pendente (`dividaAindaNaoVence`, de `divida.ts`): a mesma regra nos dois, com `hoje` como parâmetro.
// Desde a 6.7, `separarPendentes` devolve também as Dívidas adiadas (para o aviso da forma 3, "Cobrar pendências")
// e `termosDoBloco` é a conta dos termos da Fórmula que a forma 2 e a forma 3 compartilham.

import { dividaAindaNaoVence } from "./divida";
import { ehMaeDividida, unidadesDoMes } from "./divisao";
import { ehLinhaDeHistorico } from "./historico-do-mes";
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
import { ehPago, restante, somaDosItens, type ItemLido } from "./pagamento";
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
  /** Dívida programada (6.6): a data combinada de `AAAA-MM-DD`; nula ou ausente, sem Dívida programada. */
  vencimento_combinado?: string | null;
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
export type AjusteDaMensagem = {
  id: string;
  /** O que falta do Ajuste (o valor cheio, salvo se um Pagamento já quitou parte dele). */
  valor_centavos: number;
};

/** Um item que entra na mensagem: a unidade da grade e os Ajustes dela. */
export type ItemProjetado = {
  id: string;
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  /** O que falta da própria linha (negativo é estorno), sem os Ajustes: o valor cheio, ou só o restante de um Pago parcialmente. */
  valor_centavos: number;
  /** O que um Pagamento já quitou da linha (0 se nada): é o que o aviso "já foram pagos" do Bloco soma. */
  pago_centavos: number;
  /** Os Ajustes dela, na ordem da fatura: viram linhas "↳ Ajuste" logo abaixo. */
  ajustes: readonly AjusteDaMensagem[];
  /** O líquido: o valor mais os Ajustes. É o que soma no total. */
  liquido_centavos: number;
};

/**
 * Por que um item da Seleção não entra: já pago, de R$ 0,00, previsto ou Dívida programada que
 * ainda não venceu (6.6).
 */
export const MOTIVOS_DE_FORA = ["pago", "zero", "previsto", "programada"] as const;
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
  /**
   * Hoje (`AAAA-MM-DD`, America/Sao_Paulo): uma Dívida programada só entra a partir do Mês do
   * vencimento combinado (6.6). O núcleo não lê o relógio; a tela passa `useHoje()`.
   */
  hoje: string;
  /**
   * Os itens de Pagamento das linhas (6.2): com eles um Lançamento "Pago parcialmente"
   * entra só com o que falta. Sem itens, tudo entra com o valor cheio (como antes).
   */
  itens?: readonly ItemLido[];
};

export type ProjecaoDaMensagem = {
  mes: string;
  /** Na ordem da fatura (a da grade); uma Divisão entra pelas partes, nunca pela mãe. */
  entram: readonly ItemProjetado[];
  /** A soma líquida dos itens que entram (estornos reduzem). */
  totalCentavos: number;
  fora: ForaDaMensagem;
  /** Quanto cada linha que ENTRA já recebeu de Pagamento parcial (a parcela e os Ajustes dela, só os que têm algo). */
  abatidos: readonly { id: string; centavos: number }[];
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
 * - "Pago parcialmente" (0 < Σ itens < valor, sem Status pago) entra só com o que
 *   falta (`restante`, AD-10), e o Ajuste dele também. Se os itens já cobrem o valor
 *   todo, o item sai como "já pago". Os itens valem de qualquer Mês: cada linha usa os dela.
 * - Dívida programada ainda não vencida (6.6): o Mês do `vencimento_combinado` ainda não chegou
 *   (`opcoes.hoje`). Fica de fora com o motivo "programada"; no Mês do vencimento passa a entrar.
 *   A precedência é previsto, pago, programada, zero.
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

  const quitado = somaDosItens(opcoes.itens ?? []);
  // O que falta de uma linha de Status não pago; um Ajuste pago por Status segue a parcela, valor cheio.
  const abertoDe = (l: LancamentoParaMensagem) =>
    ehPago(l, opcoes.statusPagos) ? l.valor_centavos : l.valor_centavos - (quitado.get(l.id) ?? 0);
  const jaRecebido = (l: LancamentoParaMensagem) => (ehPago(l, opcoes.statusPagos) ? 0 : (quitado.get(l.id) ?? 0));
  const entram: ItemProjetado[] = [];
  const abatidos: { id: string; centavos: number }[] = [];
  const idsPagos: string[] = [];
  const porMotivo: Record<MotivoDeFora, number> = { pago: 0, zero: 0, previsto: 0, programada: 0 };
  for (const l of marcadas) {
    const motivo: MotivoDeFora | null =
      ehPrevistoNoMes(l, opcoes.temFatura) && !incluirPrevistos
        ? "previsto"
        : ehPago(l, opcoes.statusPagos) || (jaRecebido(l) !== 0 && abertoDe(l) === 0)
          ? "pago"
          : dividaAindaNaoVence(l, opcoes.hoje)
            ? "programada"
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
      .map((a) => ({ id: a.id, valor_centavos: abertoDe(a) }));
    for (const x of [l, ...(ajustesDe.get(l.id) ?? [])]) {
      if (jaRecebido(x) !== 0) abatidos.push({ id: x.id, centavos: jaRecebido(x) });
    }
    entram.push({
      id: l.id,
      nome: l.nome,
      apelido: l.apelido,
      parcela_n: l.parcela_n,
      parcela_total: l.parcela_total,
      valor_centavos: abertoDe(l),
      pago_centavos: jaRecebido(l),
      ajustes,
      liquido_centavos: ajustes.reduce((soma, a) => soma + a.valor_centavos, abertoDe(l)),
    });
  }
  return {
    mes: opcoes.mes,
    entram,
    totalCentavos: entram.reduce((soma, i) => soma + i.liquido_centavos, 0),
    fora: { quantidade: porMotivo.pago + porMotivo.zero + porMotivo.previsto + porMotivo.programada, porMotivo },
    abatidos,
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
  /**
   * Quanto o que já foi pago tira do valor do Bloco ("R$ X já foram pagos e não entram"); 0 se nada:
   * os itens pagos por inteiro e a parte já recebida dos Pagos parcialmente (6.2).
   */
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

/** Um termo da Fórmula (um grupo da forma 2) sem os itens: `ids` são os Lançamentos que a base dele soma. */
export type TermoDoBloco = Omit<GrupoDoBloco, "itens"> & { ids: readonly string[] };

/**
 * Os termos da Fórmula avaliados sobre `linhas` (a forma 2 e a 6.7 usam a mesma conta): o subtotal
 * da base, as operações × e ÷ por números e o que o termo contribui, arredondado no fim do termo.
 * Erro só quando a Fórmula não calcula.
 */
export function termosDoBloco(
  formula: Formula,
  linhas: readonly LinhaDaFormula[],
  nomes: NomesDaFormula,
): Resultado<TermoDoBloco[]> {
  const termos: TermoDoBloco[] = [];
  for (const termo of termosDaFormula(formula)) {
    const resultado = avaliar(termo.no, linhas);
    if (!resultado.ok) return resultado;
    const base = avaliar(termo.base, linhas);
    if (!base.ok) return base;
    const valorFixo = !temOperando(termo.base);
    termos.push({
      nome: valorFixo ? "" : nomeDaBase(termo.base, nomes),
      subtraido: termo.subtraido,
      valorFixo,
      subtotalCentavos: valorFixo ? resultado.valor.valorCentavos : base.valor.valorCentavos,
      fatores: termo.fatores,
      resultadoCentavos: termo.subtraido ? -resultado.valor.valorCentavos : resultado.valor.valorCentavos,
      ids: base.valor.entram,
    });
  }
  return { ok: true, valor: termos };
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
  const abatido = new Map(projecao.abatidos.map((a) => [a.id, a.centavos]));
  const semPagos = avaliar(
    formula,
    painel
      .filter((l) => !pagos.has(l.id))
      .map((l) => (abatido.has(l.id) ? { ...l, valor_centavos: l.valor_centavos - abatido.get(l.id)! } : l)),
  );
  if (!semPagos.ok) return semPagos;

  const termos = termosDoBloco(formula, filtrada, nomes);
  if (!termos.ok) return termos;
  const grupos: GrupoDoBloco[] = termos.valor.map(({ ids, ...termo }) => {
    const deste = new Set(ids);
    return { ...termo, itens: projecao.entram.filter((i) => deste.has(i.id)) };
  });
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

// ------------------------------------------------------ projetarPendente (6.5)

/** As colunas de `lancamentos` que o pendente lê (`status_id` diz se está pago). */
export type LancamentoParaPendente = LancamentoParaProjetar & {
  status_id: string | null;
};

export type OpcoesDoPendente = {
  /** Os Status que contam como pago (`conta_como_pago`), arquivados também. Sem Status vale "não pago" (AD-10). */
  statusPagos: ReadonlySet<string>;
  /** Os itens de Pagamento vivos das linhas (de todos os Meses, ou os do `mes`). */
  itens: readonly ItemLido[];
  /**
   * Os Meses com Fatura importada: um Mês sem Fatura tem as Contas manuais como previstos (5.1).
   * Ausente vale "todos os Meses têm Fatura" (como em `atraso.ts`).
   */
  mesesComFatura?: ReadonlySet<string>;
  /** Só este Mês (o "Falta receber" do Painel). Ausente: todos os Meses (Recebimentos). */
  mes?: string;
  /**
   * Hoje (`AAAA-MM-DD`, America/Sao_Paulo): uma Dívida programada ainda não vencida (o Mês do
   * `vencimento_combinado` não chegou) não está em aberto para cobrar (6.6). Aparece em "A receber".
   */
  hoje: string;
};

/** Uma linha do que está em aberto: o que falta receber dela e de quem é. */
export type LinhaPendente = {
  id: string;
  mes: string;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** O que falta receber (AD-10): o valor cheio, ou só o que falta de um Pago parcialmente. Negativo é crédito. */
  restanteCentavos: number;
  /** O valor da linha (zero na linha de crédito de algo excluído). */
  valorCentavos: number;
  /** O que os Pagamentos já quitaram dela. */
  recebidoCentavos: number;
  /**
   * A linha foi paga (em parte ou toda) e depois EXCLUÍDA (AD-11): vira um crédito de
   * `-Σ itens`, porque o dinheiro já entrou e a conta que ele quitava saiu. Não é um lançamento.
   */
  credito: boolean;
};

/**
 * O que está em aberto, linha a linha (AD-10, AD-11), de um Mês ou de todos:
 *
 * - **Não pago (`restante` ≠ 0):** a linha viva, não previsto e não mãe dividida, que o Status
 *   não conta como paga. O `restante` é o valor menos o que os itens já quitaram. Uma Divisão
 *   entra pelas partes (a mãe nunca soma, AD-8). Um Ajuste de centavos é uma linha como outra:
 *   tem o restante dele, com a classificação da parcela.
 * - **Crédito:** a linha EXCLUÍDA que tem itens de Pagamento vivos vira uma linha de `-Σ itens`
 *   (AD-11). Só ela entra no Saldo; ela não é um lançamento a cobrar.
 * - **Fora:** previstos (Série `sistema` e Conta manual de um Mês sem Fatura, como na mensagem,
 *   porque ainda não são o que se cobra), pagos, zerados, a mãe dividida e a Dívida programada
 *   ainda não vencida (6.6, `dividaAindaNaoVence`: a mesma regra da mensagem; ela aparece em "A
 *   receber"). As linhas excluídas sem Pagamento nunca entram.
 * - O histórico da planilha (3.10) também fica fora (Defeito 3, `ehLinhaDeHistorico`: a mesma regra do
 *   atraso): a importação só marca como pago o nome "Pago", e um Mês antigo cheio de "Não pago" virava
 *   dívida de verdade no Saldo. Antes (6.4, decisão 14; 6.5, decisão 9) entrava se o Status não contava
 *   como pago. Uma linha do histórico excluída com item de Pagamento ainda vira crédito (o dinheiro entrou).
 */
export function pendentesDosLancamentos(
  lancamentos: readonly LancamentoParaPendente[],
  opcoes: OpcoesDoPendente,
): LinhaPendente[] {
  return separarPendentes(lancamentos, opcoes).pendentes;
}

/**
 * O que `pendentesDosLancamentos` devolve e, à parte, o que ela deixou de fora SÓ por ser Dívida
 * programada ainda não vencida (6.7): linhas com restante a cobrar que a data combinada adia. A
 * forma 3 da mensagem avisa quantas são ("1 dívida programada ainda não vencida"); é a mesma
 * decisão, tomada num lugar só (`dividaAindaNaoVence`), então o aviso nunca diverge do Saldo.
 */
export function separarPendentes(
  lancamentos: readonly LancamentoParaPendente[],
  opcoes: OpcoesDoPendente,
): { pendentes: LinhaPendente[]; programadas: LinhaPendente[] } {
  const quitado = somaDosItens(opcoes.itens);
  const saida: LinhaPendente[] = [];
  const programadas: LinhaPendente[] = [];
  for (const l of lancamentos) {
    if (opcoes.mes !== undefined && l.mes !== opcoes.mes) continue;
    const recebido = quitado.get(l.id) ?? 0;
    if (l.excluido_em !== null) {
      if (recebido === 0) continue;
      saida.push({
        id: l.id,
        mes: l.mes,
        responsavel_id: l.responsavel_id,
        tipo_id: l.tipo_id,
        restanteCentavos: -recebido,
        valorCentavos: 0,
        recebidoCentavos: recebido,
        credito: true,
      });
      continue;
    }
    if (ehMaeDividida(l)) continue;
    // O histórico da planilha (3.10) é registro, não dívida (Defeito 3): nunca está "em aberto".
    if (ehLinhaDeHistorico(l)) continue;
    const temFatura = opcoes.mesesComFatura === undefined || opcoes.mesesComFatura.has(l.mes);
    if (
      l.lancado_por !== undefined &&
      ehPrevistoNoMes({ lancado_por: l.lancado_por, conta_manual_id: l.conta_manual_id }, temFatura)
    ) {
      continue;
    }
    const restanteCentavos = restante(l, opcoes.statusPagos, recebido);
    if (restanteCentavos === 0) continue;
    (dividaAindaNaoVence(l, opcoes.hoje) ? programadas : saida).push({
      id: l.id,
      mes: l.mes,
      responsavel_id: l.responsavel_id,
      tipo_id: l.tipo_id,
      restanteCentavos,
      valorCentavos: l.valor_centavos,
      recebidoCentavos: ehPago(l, opcoes.statusPagos) ? 0 : recebido,
      credito: false,
    });
  }
  return { pendentes: saida, programadas };
}

/** A linha que `avaliar` lê de uma linha em aberto: o valor é o `restante`. */
export function linhaDaFormulaPendente(l: LinhaPendente): LinhaDaFormula {
  return { id: l.id, valor_centavos: l.restanteCentavos, responsavel_id: l.responsavel_id, tipo_id: l.tipo_id };
}

/**
 * A projeção do que falta receber (AD-11): as linhas que `avaliar` recebe em Recebimentos, de
 * todos os Meses (ou de um, com `opcoes.mes`). O valor de cada linha é o `restante` (AD-10), e a
 * linha de crédito de algo pago e depois excluído entra com valor negativo. Nenhuma tela filtra
 * linhas antes de `avaliar`.
 */
export function projetarPendente(
  lancamentos: readonly LancamentoParaPendente[],
  opcoes: OpcoesDoPendente,
): LinhaDaFormula[] {
  return pendentesDosLancamentos(lancamentos, opcoes).map(linhaDaFormulaPendente);
}
