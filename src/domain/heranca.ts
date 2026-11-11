// Herdar parcelas sem previsto (História 3.7, FR-8, AD-1/8). Uma parcela real
// n/N (n > 1) que chegou sem previsto casado procura, no Mês anterior, a
// parcela n−1/N de mesmo `nome_normalizado` e mesmo Valor; se achar, entra na
// Série dela e herda a classificação (Responsável, Tipo, Apelido e
// Observação). Puro: sem relógio, rede ou banco. A tela lê as candidatas do
// banco (o Mês anterior não está na memória do Realtime) e a RPC só grava.
//
// - Candidata: linha-mãe (sem Ajuste), não excluída, do Mês imediatamente
//   anterior. Fatura, previsto e histórico servem. A chave da Série da
//   candidata tem o mesmo `mes_primeira_parcela` que a da linha nova, então só
//   a `ocorrencia` pode diferir.
// - Escolha 1-para-1 e determinística: os reais na ordem da fatura, as
//   candidatas por menor `ocorrencia` da Série (as sem Série vêm depois, por
//   `ordem_fatura` e `id`). Candidata cuja Série já tem a parcela n não serve.
// - Campo a campo: onde a candidata tem valor, vale a herança; as Regras só
//   completam o que falta (decisão Q2-A). Completo → sem motivo.
// - Divisão (3.8): a Divisão da candidata é herdada junto com o Responsável,
//   como um campo só: quem tem Divisão não tem Responsável (a mãe dividida
//   fica sem ele), e a herança nunca mistura os dois.

import type { DadosRevisao, DadosValorMudou, MotivoRevisao } from "./classificacao";
import { copiarDivisao, estaClassificada, type Divisao } from "./divisao";
import type { ChaveDaSerie } from "./previstos";

/** Os campos de classificação que a parcela anterior empresta. */
export const CAMPOS_HERDADOS = ["responsavel_id", "tipo_id", "apelido", "observacao", "divisao"] as const;

export type CampoHerdado = (typeof CAMPOS_HERDADOS)[number];

/** A parcela n−1/N do Mês anterior, como o repositório a lê do banco. */
export type CandidataParaHerdar = {
  id: string;
  nome_normalizado: string;
  parcela_n: number;
  parcela_total: number;
  valor_centavos: number;
  /** Só linhas de Fatura têm; previsto e histórico, não. */
  ordem_fatura: number | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  apelido: string | null;
  observacao: string | null;
  /** A Divisão da candidata (3.8), lida do `jsonb` do banco por `lerDivisao`. */
  divisao?: Divisao | null;
  /** A Série da candidata; null se ela foi gravada antes da 3.5. */
  serie: ChaveDaSerie | null;
  /** A Série já tem a parcela seguinte (n) fora da Fatura do Mês: a candidata não serve. */
  proxima_ocupada: boolean;
};

/** O que a escolha usa de uma parcela real sem previsto. */
export type RealParaHerdar = {
  ordem_fatura: number;
  nome_normalizado: string;
  valor_centavos: number;
  parcela_n: number;
  parcela_total: number;
};

const chaveDoPar = (nome: string, total: number, n: number, valor: number) => JSON.stringify([nome, total, n, valor]);

/**
 * Escolhe a candidata de cada real (1-para-1). `reais` são só as parcelas que
 * podem herdar (n > 1, sem previsto casado). Devolve `ordem_fatura` → candidata.
 */
export function escolherCandidatas(
  reais: readonly RealParaHerdar[],
  candidatas: readonly CandidataParaHerdar[],
): Map<number, CandidataParaHerdar> {
  const livres = new Map<string, CandidataParaHerdar[]>();
  const ordenadas = candidatas
    .filter((c) => !c.proxima_ocupada)
    .sort((a, b) => {
      if ((a.serie === null) !== (b.serie === null)) return a.serie === null ? 1 : -1;
      if (a.serie && b.serie && a.serie.ocorrencia !== b.serie.ocorrencia) return a.serie.ocorrencia - b.serie.ocorrencia;
      const oa = a.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
      const ob = b.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
      return oa - ob || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  for (const c of ordenadas) {
    const k = chaveDoPar(c.nome_normalizado, c.parcela_total, c.parcela_n + 1, c.valor_centavos);
    const lista = livres.get(k);
    if (lista) lista.push(c);
    else livres.set(k, [c]);
  }
  const escolhidas = new Map<number, CandidataParaHerdar>();
  for (const r of [...reais].sort((a, b) => a.ordem_fatura - b.ordem_fatura)) {
    if (r.parcela_n <= 1) continue;
    const c = livres.get(chaveDoPar(r.nome_normalizado, r.parcela_total, r.parcela_n, r.valor_centavos))?.shift();
    if (c) escolhidas.set(r.ordem_fatura, c);
  }
  return escolhidas;
}

/** O que a linha tem de classificação antes de herdar (as Regras já passaram). */
export type ClassificacaoParaMesclar = {
  responsavel_id: string | null;
  tipo_id: string | null;
  apelido?: string | null;
  observacao?: string | null;
  divisao?: Divisao | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: DadosRevisao | DadosValorMudou | null;
};

/** A candidata empresta algum campo? (Candidata sem classificação não conta como herança.) */
export function emprestaAlgo(c: Pick<CandidataParaHerdar, CampoHerdado>): boolean {
  return CAMPOS_HERDADOS.some((campo) => (c[campo] ?? null) !== null);
}

/**
 * Junta a classificação da candidata à da linha: campo a campo, a candidata
 * vale onde tem valor e a linha (Regras) completa o resto. Responsável e
 * Divisão são um campo só: a candidata dividida deixa a linha dividida e sem
 * Responsável; a candidata com Responsável tira a Divisão que a Regra pôs.
 * Completo (Tipo e Responsável ou Divisão) → sem motivo; incompleto → o motivo
 * da classificação normal.
 */
export function mesclarHerdada(
  l: ClassificacaoParaMesclar,
  c: Pick<CandidataParaHerdar, CampoHerdado>,
): Required<Pick<ClassificacaoParaMesclar, "responsavel_id" | "tipo_id" | "revisao_motivo" | "revisao_dados">> & {
  apelido: string | null;
  observacao: string | null;
  divisao: Divisao | null;
} {
  const daCandidata = c.divisao ?? null;
  let responsavel_id: string | null;
  let divisao: Divisao | null;
  if (daCandidata !== null) {
    responsavel_id = null;
    divisao = copiarDivisao(daCandidata);
  } else if (c.responsavel_id !== null) {
    responsavel_id = c.responsavel_id;
    divisao = null;
  } else {
    responsavel_id = l.responsavel_id;
    divisao = l.divisao ?? null;
  }
  const tipo_id = c.tipo_id ?? l.tipo_id;
  const completa = estaClassificada({ responsavel_id, tipo_id, divisao });
  return {
    responsavel_id,
    tipo_id,
    divisao,
    apelido: c.apelido ?? l.apelido ?? null,
    observacao: c.observacao ?? l.observacao ?? null,
    revisao_motivo: completa ? null : (l.revisao_motivo ?? "sem_classificacao"),
    revisao_dados: completa ? null : l.revisao_dados,
  };
}
