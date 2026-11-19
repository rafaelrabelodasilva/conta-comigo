// Aviso ao mexer num Lançamento que já tem Pagamento (História 6.9, FR-46, AD-10, AD-11, AD-1). Puro:
// os Lançamentos de todos os Meses, os itens, os Pagamentos, os Blocos, os Status que contam como pago,
// os Meses com Fatura e o "hoje" chegam como parâmetro. A tela só chama e desenha; o SQL não decide nada.
//
// A conta é a do Saldo pendente de Recebimentos: `projetarPendente` (AD-11) antes e depois da mudança, e a
// Fórmula de cada Bloco de cobrança (`avaliar`) sobre as duas projeções. Nenhuma tela faz conta de Saldo.
//
// - **Quando avisa:** a mudança toca ao menos um Lançamento com item de Pagamento vivo E (a) mexe no Valor ou
//   exclui (as duas edições que o critério de aceite nomeia: o Pagamento deixa de bater com o Lançamento,
//   mesmo que nenhum Saldo mude) ou (b) muda o Saldo de algum Bloco de cobrança (Responsável, Tipo, Status).
//   Mudança que não move Saldo nenhum e não mexe em Valor nem exclui não avisa.
// - **Efeito:** só os Blocos de cobrança cujo Saldo muda entram, cada um com o "de R$ X para R$ Y". Um
//   Bloco cuja Fórmula não calcula (antes ou depois) fica de fora. Sem Bloco que mude, o aviso diz isso.
// - **Datas:** todas as datas distintas dos Pagamentos vivos que tocam as linhas mudadas, da mais antiga
//   para a mais nova.
// - O crédito de algo pago e depois excluído (AD-11) é de `projetarPendente`: aqui só se compara.

import { avaliar } from "./formula";
import type { Bloco } from "./blocos";
import { idsComPagamento, type ItemLido } from "./pagamento";
import { projetarPendente, type LancamentoParaPendente } from "./projecoes";
import { blocosDeCobranca } from "./recebimentos";

/** O item de Pagamento com o `pagamento_id` (para achar a data). */
export type ItemDoAviso = ItemLido & { pagamento_id: string };

/** O que o aviso lê de um Pagamento. */
export type PagamentoDoAviso = {
  id: string;
  /** `AAAA-MM-DD`. */
  data: string;
  excluido_em?: string | null;
};

/** As colunas de `lancamentos` que uma mudança do painel ou da exclusão pode trocar. */
export type PatchDaLinha = Partial<
  Pick<LancamentoParaPendente, "valor_centavos" | "responsavel_id" | "tipo_id" | "status_id" | "excluido_em">
>;

/** Uma linha que vai mudar: o `id` e o que muda nela (excluir é `excluido_em` preenchido). */
export type MudancaDeLinha = { id: string; patch: PatchDaLinha };

/** O Saldo pendente de um Bloco de cobrança, antes e depois. */
export type EfeitoNoSaldo = {
  blocoId: string;
  nome: string;
  antesCentavos: number;
  depoisCentavos: number;
};

export type AvisoDePagamento = {
  /** Quantas das linhas mudadas têm Pagamento. */
  quantidade: number;
  /** As datas distintas dos Pagamentos (`AAAA-MM-DD`), da mais antiga para a mais nova. */
  datas: string[];
  /** Os Blocos de cobrança cujo Saldo muda (vazio: nenhum muda). */
  efeitos: EfeitoNoSaldo[];
};

export type EntradaDoAviso = {
  /** Os Lançamentos de TODOS os Meses, como estão (excluídos também). */
  lancamentos: readonly LancamentoParaPendente[];
  mudancas: readonly MudancaDeLinha[];
  /** Os itens de Pagamento de todos os Meses (os desfeitos não contam). */
  itens: readonly ItemDoAviso[];
  pagamentos: readonly PagamentoDoAviso[];
  blocos: readonly Pick<Bloco, "id" | "nome" | "formula" | "de_cobranca">[];
  statusPagos: ReadonlySet<string>;
  /** Os Meses com Fatura importada (como no Saldo de Recebimentos). */
  mesesComFatura?: ReadonlySet<string>;
  /** Hoje (`AAAA-MM-DD`, America/Sao_Paulo). */
  hoje: string;
};

/** A mudança mexe no Valor ou exclui a linha (o que o Pagamento registrado deixa de acompanhar). */
function mexeNoValorOuExclui(patch: PatchDaLinha): boolean {
  return "valor_centavos" in patch || (patch.excluido_em ?? null) !== null;
}

/**
 * O aviso de uma mudança sobre Lançamentos com Pagamento, ou `null` quando não há o que avisar (nenhuma
 * linha mudada tem Pagamento vivo, ou a mudança nem mexe no Valor, nem exclui, nem move o Saldo de um Bloco).
 */
export function avisarMudancaComPagamento(e: EntradaDoAviso): AvisoDePagamento | null {
  const comPagamento = idsComPagamento(e.itens);
  const tocadas = e.mudancas.filter((m) => comPagamento.has(m.id));
  if (tocadas.length === 0) return null;

  const tocadasIds = new Set(tocadas.map((m) => m.id));
  // Todas as mudanças entram no "depois" (uma exclusão em lote leva as linhas sem Pagamento junto).
  const patches = new Map(e.mudancas.map((m) => [m.id, m.patch]));
  const depois = e.lancamentos.map((l) => {
    const patch = patches.get(l.id);
    return patch === undefined ? l : { ...l, ...patch };
  });
  const opcoes = { statusPagos: e.statusPagos, itens: e.itens, mesesComFatura: e.mesesComFatura, hoje: e.hoje };
  const linhasAntes = projetarPendente(e.lancamentos, opcoes);
  const linhasDepois = projetarPendente(depois, opcoes);

  const efeitos: EfeitoNoSaldo[] = [];
  for (const bloco of blocosDeCobranca(e.blocos)) {
    const antes = avaliar(bloco.formula, linhasAntes);
    const aposAMudanca = avaliar(bloco.formula, linhasDepois);
    if (!antes.ok || !aposAMudanca.ok) continue;
    if (antes.valor.valorCentavos === aposAMudanca.valor.valorCentavos) continue;
    efeitos.push({
      blocoId: bloco.id,
      nome: bloco.nome,
      antesCentavos: antes.valor.valorCentavos,
      depoisCentavos: aposAMudanca.valor.valorCentavos,
    });
  }
  if (efeitos.length === 0 && !tocadas.some((m) => mexeNoValorOuExclui(m.patch))) return null;

  const dataDoPagamento = new Map(e.pagamentos.filter((p) => (p.excluido_em ?? null) === null).map((p) => [p.id, p.data]));
  const datas = new Set<string>();
  for (const i of e.itens) {
    if ((i.excluido_em ?? null) !== null || !tocadasIds.has(i.lancamento_id)) continue;
    const data = dataDoPagamento.get(i.pagamento_id);
    if (data !== undefined) datas.add(data);
  }
  return { quantidade: tocadas.length, datas: [...datas].sort(), efeitos };
}
