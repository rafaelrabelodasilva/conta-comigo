// Ajustes de centavos (História 2.8, FR-47, AD-8). Um crédito pequeno sem
// Parcela, na mesma Fatura e com o mesmo Nome normalizado de uma parcela, é
// Ajuste dessa parcela (a "mãe"): aparece recuado sob ela na grade, com o
// líquido, e acompanha o Tipo e o Responsável dela. Continua na Conferência
// como crédito (nada aqui muda a Conferência).
//
// - É Ajuste: `valor < 0`, sem Parcela, `|valor| < limite` (menor estrito),
//   mesma Fatura e mesmo `nome_normalizado` de uma linha com `parcela_n`.
// - Mais de uma mãe possível: a do mesmo cartão; depois a de menor
//   `ordem_fatura`; depois a primeira da lista. Uma parcela pode ter mais de
//   um Ajuste; um Ajuste nunca é mãe (não tem Parcela).
// - A mesma regra está escrita em SQL só para vincular, uma vez, os
//   créditos já gravados (migração 20261109120000_ajustes.sql); um teste de
//   integração confere que as duas dão os mesmos pares.

import { formatarDinheiro } from "./dinheiro";

/** O que o reconhecimento usa de uma linha (colunas de `lancamentos`). */
export type LinhaParaAjuste = {
  valor_centavos: number;
  parcela_n: number | null;
  nome_normalizado: string;
  final_cartao: string | null;
  ordem_fatura: number | null;
  /**
   * A Fatura da linha. Na importação (todas da mesma Fatura) fica de fora;
   * `null` é uma linha fora de Fatura, que nunca é Ajuste nem mãe.
   */
  fatura_id?: string | null;
};

/** Um Ajuste e a mãe dele, pelos índices na lista recebida. */
export type ParAjuste = { ajuste: number; mae: number };

/** O crédito pode ser Ajuste (falta só achar a mãe)? */
export function podeSerAjuste(l: LinhaParaAjuste, limiteCentavos: number): boolean {
  return l.valor_centavos < 0 && l.parcela_n === null && -l.valor_centavos < limiteCentavos && l.fatura_id !== null;
}

/**
 * Os Ajustes da lista e as mães deles, na ordem da lista. O limite vem de
 * `configuracoes.limite_ajuste_centavos` (sem a linha,
 * `LIMITE_AJUSTE_PADRAO_CENTAVOS`).
 */
export function reconhecerAjustes(linhas: readonly LinhaParaAjuste[], limiteCentavos: number): ParAjuste[] {
  const pares: ParAjuste[] = [];
  for (const [i, credito] of linhas.entries()) {
    if (!podeSerAjuste(credito, limiteCentavos)) continue;
    let escolhida = -1;
    for (const [j, mae] of linhas.entries()) {
      if (
        mae.parcela_n === null ||
        mae.nome_normalizado !== credito.nome_normalizado ||
        mae.fatura_id === null ||
        mae.fatura_id !== credito.fatura_id
      ) {
        continue;
      }
      if (escolhida === -1 || melhorMae(mae, linhas[escolhida], credito)) escolhida = j;
    }
    if (escolhida !== -1) pares.push({ ajuste: i, mae: escolhida });
  }
  return pares;
}

/** `a` ganha de `b` como mãe de `credito`: o mesmo cartão primeiro, depois a menor `ordem_fatura`. */
function melhorMae(a: LinhaParaAjuste, b: LinhaParaAjuste, credito: LinhaParaAjuste): boolean {
  const mesmoA = a.final_cartao === credito.final_cartao;
  const mesmoB = b.final_cartao === credito.final_cartao;
  if (mesmoA !== mesmoB) return mesmoA;
  const ordemA = a.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  const ordemB = b.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  return ordemA < ordemB;
}

// ------------------------------------------------------------------ Grade

/** O que a grade usa para juntar o Ajuste à mãe. */
export type LinhaComAjuste = { id: string; ajuste_de_id?: string | null; ordem_fatura: number | null };

export type SeparacaoAjustes<L> = {
  /** As linhas que a grade julga (filtros, busca, "Verificar", contagens): todas menos os Ajustes com a mãe na lista. */
  maes: L[];
  /** Os Ajustes de cada mãe (pelo id dela), na ordem da Fatura. */
  ajustesPorMae: Map<string, L[]>;
};

function porOrdemFatura(a: LinhaComAjuste, b: LinhaComAjuste): number {
  return (a.ordem_fatura ?? Number.MAX_SAFE_INTEGER) - (b.ordem_fatura ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Separa os Ajustes das outras linhas do Mês. Um Ajuste cuja mãe não está
 * na lista (outro Mês, excluída) fica como linha comum.
 */
export function separarAjustes<L extends LinhaComAjuste>(linhas: readonly L[]): SeparacaoAjustes<L> {
  const ids = new Set(linhas.map((l) => l.id));
  const maes: L[] = [];
  const ajustesPorMae = new Map<string, L[]>();
  for (const l of linhas) {
    const mae = l.ajuste_de_id ?? null;
    if (mae === null || mae === l.id || !ids.has(mae)) {
      maes.push(l);
      continue;
    }
    const lista = ajustesPorMae.get(mae) ?? [];
    lista.push(l);
    ajustesPorMae.set(mae, lista);
  }
  for (const lista of ajustesPorMae.values()) lista.sort(porOrdemFatura);
  return { maes, ajustesPorMae };
}

/** Uma linha da grade: a própria linha e, num Ajuste, a mãe dele. */
export type LinhaAgrupada<L> = { linha: L; mae: L | null };

/**
 * A ordem da grade com os Ajustes: cada mãe (na ordem recebida, já
 * ordenada) e, logo abaixo, os Ajustes dela. Vale em qualquer ordenação.
 */
export function agruparComAjustes<L extends LinhaComAjuste>(
  maes: readonly L[],
  ajustesPorMae: ReadonlyMap<string, readonly L[]>,
): LinhaAgrupada<L>[] {
  return maes.flatMap((mae) => [
    { linha: mae, mae: null },
    ...(ajustesPorMae.get(mae.id) ?? []).map((a) => ({ linha: a, mae })),
  ]);
}

/** O líquido da mãe: o valor dela mais os Ajustes (créditos, negativos). */
export function liquidoCentavos(
  mae: { valor_centavos: number },
  ajustes: readonly { valor_centavos: number }[],
): number {
  return ajustes.reduce((soma, a) => soma + a.valor_centavos, mae.valor_centavos);
}

/** A soma dos Ajustes da mãe (negativa). */
export function somaDosAjustes(ajustes: readonly { valor_centavos: number }[]): number {
  return ajustes.reduce((soma, a) => soma + a.valor_centavos, 0);
}

/**
 * O líquido sob o Nome do Ajuste: "R$ 1.140,74 - R$ 0,08 = R$ 1.140,66"
 * (todos os Ajustes da mãe somados).
 */
export function textoLiquido(
  mae: { valor_centavos: number },
  ajustes: readonly { valor_centavos: number }[],
): string {
  const soma = somaDosAjustes(ajustes);
  const parcela = soma < 0 ? formatarDinheiro(soma) : `+ ${formatarDinheiro(soma)}`;
  return `${formatarDinheiro(mae.valor_centavos)} ${parcela} = ${formatarDinheiro(liquidoCentavos(mae, ajustes))}`;
}

/**
 * Os Ajustes que acompanham a linha `id` numa gravação (Tipo, Responsável,
 * exclusão): os não excluídos com `ajuste_de_id = id`.
 */
export function idsQueAcompanham(
  id: string,
  linhas: readonly { id: string; ajuste_de_id?: string | null; excluido_em?: string | null }[],
): string[] {
  return linhas.filter((l) => l.id !== id && l.ajuste_de_id === id && (l.excluido_em ?? null) === null).map((l) => l.id);
}
