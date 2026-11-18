// O que a janela "Gerar mensagem" recebe (História 4.7, FR-24, FR-53, UX-DR17): a
// mensagem pronta, o texto que ocupa o lugar do quadro quando não há mensagem e os
// avisos. A janela não sabe se veio de uma Seleção (forma 1) ou de um Bloco (forma
// 2): só chama `montar(incluirPrevistos)` e mostra. Toda regra mora no núcleo
// (`projetarMensagem`, `projetarMensagemDoBloco`, `gerarMensagem`,
// `gerarMensagemDoBloco`); aqui só se junta o que cada origem entrega.

import type { Formula, NomesDaFormula } from "./formula";
import {
  TEXTOS_GERAR,
  rotuloItensEmVariosGrupos,
  rotuloPagosNaoEntram,
} from "./mensagens";
import { formatarDinheiro } from "./dinheiro";
import {
  gerarMensagem,
  gerarMensagemDeCobranca,
  gerarMensagemDoBloco,
  type MensagemGerada,
  type ModeloMensagem,
} from "./modelo-mensagem";
import {
  avisoDosItensDeFora,
  projetarMensagem,
  projetarMensagemDoBloco,
  type LancamentoParaMensagem,
  type OpcoesDaMensagem,
  type OpcoesDoPendente,
} from "./projecoes";
import { projetarCobrancaDoBloco, type LancamentoDaCobranca } from "./recebimentos";

/** De onde vem a mensagem: só muda o texto de "nada a cobrar". */
export type OrigemDaMensagem = "selecao" | "bloco" | "cobranca";

export type MensagemDaJanela = {
  gerada: MensagemGerada;
  /** O que ocupa o lugar do quadro quando não há mensagem pronta; vazio quando há. */
  semTexto: string;
  /** Os avisos da janela (nunca vão no texto), na ordem: itens de fora, pagos, itens em mais de um grupo. */
  avisos: readonly string[];
};

function textoSemMensagem(gerada: MensagemGerada, origem: OrigemDaMensagem): string {
  switch (gerada.estado) {
    case "pronta":
      return "";
    case "nada_a_cobrar":
      if (origem === "cobranca") return TEXTOS_GERAR.nada_em_aberto;
      return origem === "bloco" ? TEXTOS_GERAR.nada_a_cobrar_bloco : TEXTOS_GERAR.nada_a_cobrar;
    case "sem_valor":
      return TEXTOS_GERAR.bloco_sem_valor;
    case "modelo_vazio":
      return TEXTOS_GERAR.modelo_vazio;
    case "modelo_sem_campos":
      return TEXTOS_GERAR.modelo_sem_campos;
  }
}

const soComTexto = (avisos: readonly string[]) => avisos.filter((a) => a !== "");

/** A mensagem da forma 1: os Lançamentos marcados na grade. */
export function mensagemDaSelecao(
  modelo: ModeloMensagem,
  selecao: ReadonlySet<string>,
  lancamentos: readonly LancamentoParaMensagem[],
  opcoes: OpcoesDaMensagem,
): MensagemDaJanela {
  const projecao = projetarMensagem(selecao, lancamentos, opcoes);
  const gerada = gerarMensagem(modelo, projecao);
  return {
    gerada,
    semTexto: textoSemMensagem(gerada, "selecao"),
    avisos: soComTexto([avisoDosItensDeFora(projecao.fora)]),
  };
}

/**
 * A mensagem da forma 2: a Fórmula do Bloco em grupos. Os avisos acrescentam o
 * quanto de itens já pagos o Bloco deixou de cobrar ("R$ X já foram pagos e não
 * entram", só se há diferença) e os itens que a Fórmula usa em mais de um
 * operando.
 */
export function mensagemDoBloco(
  modelo: ModeloMensagem,
  formula: Formula,
  lancamentos: readonly LancamentoParaMensagem[],
  opcoes: OpcoesDaMensagem,
  nomes: NomesDaFormula,
): MensagemDaJanela {
  const projecao = projetarMensagemDoBloco(formula, lancamentos, opcoes, nomes);
  const gerada = gerarMensagemDoBloco(modelo, projecao);
  if (!projecao.ok) return { gerada, semTexto: textoSemMensagem(gerada, "bloco"), avisos: [] };
  const bloco = projecao.valor;
  return {
    gerada,
    semTexto: textoSemMensagem(gerada, "bloco"),
    avisos: soComTexto([
      avisoDosItensDeFora(bloco.fora),
      bloco.pagosCentavos === 0 ? "" : rotuloPagosNaoEntram(formatarDinheiro(bloco.pagosCentavos)),
      bloco.itensEmVariosGrupos === 0 ? "" : rotuloItensEmVariosGrupos(bloco.itensEmVariosGrupos),
    ]),
  };
}

/**
 * A mensagem da forma 3, "Cobrar pendências" (6.7, FR-28): tudo o que o Bloco de cobrança ainda deve, de
 * todos os Meses (`projetarCobrancaDoBloco`). O único aviso é o dos itens que ficaram de fora: a Dívida
 * programada ainda não vencida ("1 item não entra: 1 dívida programada ainda não vencida").
 */
export function mensagemDeCobranca(
  modelo: ModeloMensagem,
  formula: Formula,
  lancamentos: readonly LancamentoDaCobranca[],
  opcoes: OpcoesDoPendente,
  nomes: NomesDaFormula,
): MensagemDaJanela {
  const projecao = projetarCobrancaDoBloco(formula, lancamentos, opcoes, nomes);
  const gerada = gerarMensagemDeCobranca(modelo, projecao);
  return {
    gerada,
    semTexto: textoSemMensagem(gerada, "cobranca"),
    avisos: projecao.ok ? soComTexto([avisoDosItensDeFora(projecao.valor.fora)]) : [],
  };
}
