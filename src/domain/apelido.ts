// Apelido em massa (História 3.9, FR-52, AD-1, AD-6). Puro: o relógio entra
// como parâmetro (`agora`, ISO) e quem lê e grava é o repositório de
// Lançamentos (a RPC do lote, `classificar_em_lote`).
//
// - "Mesmo Nome" é `nome_normalizado` (AD-6), nunca `chaveDeRegra`. O Apelido
//   não casa previsto, Série, Regra nem Ajuste; `nome` nunca muda.
// - `planejarApelidoEmMassa`: dado o Apelido que a linha aberta acabou de
//   receber (ou perdeu), diz quais OUTRAS linhas do mesmo `nome_normalizado`
//   mudariam, o que gravar em cada uma e o retrato de antes (o "Desfazer").
//   "Aplicar a todos" iguala todas as outras ao novo valor (vazias e com
//   outro Apelido; remover limpa todas).
// - Entram as linhas comuns e as mães, de todos os Meses, inclusive previstos
//   (`sistema`). Ajustes e excluídas ficam de fora. As filhas de uma Divisão
//   acompanham o Apelido da mãe (copiam, como na 3.8) e entram na mesma
//   gravação; não são contadas na pergunta.
// - `editado_em`: as linhas reais recebem o relógio (como o lote); os previstos
//   não (como a 3.5: a reimportação simplificada ainda os recria).
// - Pergunta só se alguma outra linha mudaria (`mudam > 0`).

import type { CorpoDoLote, ItemDoLote } from "./lote";

/** O que o planejador usa de uma linha de `lancamentos`. */
export type LinhaParaApelido = {
  id: string;
  nome_normalizado: string;
  apelido: string | null;
  lancado_por: string;
  editado_em: string | null;
  ajuste_de_id: string | null;
  dividido_de_id: string | null;
  excluido_em: string | null;
};

/** A linha aberta, que acabou de gravar o Apelido. */
export type OrigemDoApelido = { id: string; nome_normalizado: string };

export type PlanoDoApelido = {
  /** Os itens da RPC: as linhas que mudam e as filhas delas. */
  itens: ItemDoLote[];
  /** Como estavam antes (o "Desfazer" grava isto). */
  antes: ItemDoLote[];
  /** Quantas outras linhas (sem as filhas) passam a ter o Apelido; 0 = sem pergunta. */
  mudam: number;
  /** Dessas, quantas já têm outro Apelido, que será trocado. */
  comOutro: number;
};

const igual = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);

/**
 * Quais linhas mudam para `depois` (o Apelido da linha aberta; `null` =
 * removido). `candidatas` pode trazer qualquer linha: só as de mesmo
 * `nome_normalizado` entram. O Nome continua intacto.
 */
export function planejarApelidoEmMassa(
  origem: OrigemDoApelido,
  depois: string | null,
  candidatas: readonly LinhaParaApelido[],
  agora: string,
): PlanoDoApelido {
  const itens: ItemDoLote[] = [];
  const antes: ItemDoLote[] = [];
  let mudam = 0;
  let comOutro = 0;
  for (const l of candidatas) {
    if (l.id === origem.id || l.nome_normalizado !== origem.nome_normalizado) continue;
    if (l.ajuste_de_id !== null || l.excluido_em !== null) continue;
    // As filhas da própria linha aberta já foram gravadas junto com ela.
    if (l.dividido_de_id === origem.id) continue;
    if (igual(l.apelido, depois)) continue;
    const filha = l.dividido_de_id !== null;
    const corpo: CorpoDoLote = { apelido: depois };
    const retrato: CorpoDoLote = { apelido: l.apelido ?? null };
    if (l.lancado_por !== "sistema") {
      corpo.editado_em = agora;
      retrato.editado_em = l.editado_em ?? null;
    }
    itens.push({ id: l.id, corpo });
    antes.push({ id: l.id, corpo: retrato });
    if (!filha) {
      mudam += 1;
      if (l.apelido !== null) comOutro += 1;
    }
  }
  return { itens, antes, mudam, comOutro };
}
