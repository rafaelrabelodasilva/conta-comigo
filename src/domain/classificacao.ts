// Classificação na importação (História 3.1, FR-9/10/11, AD-1/6/7). Antes de
// gravar, cada Lançamento da Fatura passa pelas Regras (`regras.ts`) e pelo
// `tipo_sugerido` da extração. O que não é aplicado vai para a fila do
// Revisar com um motivo (`revisao_motivo`) e a sugestão (`revisao_dados`).
//
// - Regra sem dúvida: aplica o Responsável e o Tipo (ativos) dela. Com os
//   dois, a linha não vai para a fila; com só um, vai como `sem_classificacao`,
//   ou como `sugestao` quando falta o Tipo e há `tipo_sugerido` ativo (o
//   Responsável aplicado continua; `revisao_dados.tipo_id` = o sugerido).
// - Regra com dúvida: não aplica; sugere o Responsável mais frequente e o
//   Tipo da Regra (ou o `tipo_sugerido`), com os outros Responsáveis
//   (`sugestao_duvida`).
// - Sem Regra (ou Regra só com cadastros arquivados/inexistentes): com
//   `tipo_sugerido` (um Tipo ativo pelo nome) → só sugere (`sugestao`); sem
//   nada → `sem_classificacao`.
// - Créditos também passam pelas Regras; parcelas também (até a herança da
//   3.7). O Ajuste de centavos (`ajuste_de_ordem`) nunca tem Regra própria:
//   recebe a classificação calculada da mãe, sem motivo.

import { normalizarNome } from "./importacao-fatura";
import { avaliarRegra, chaveDeRegra, regrasUsadas, type CadastrosAtivos, type RegraGravada } from "./regras";

/** Por que a linha está na fila do Revisar (enum `revisao_motivo` do banco). */
export type MotivoRevisao = "sem_classificacao" | "sugestao" | "sugestao_duvida";

export const MOTIVOS_REVISAO: readonly MotivoRevisao[] = ["sem_classificacao", "sugestao", "sugestao_duvida"];

/** A sugestão guardada em `revisao_dados` (ids só como valores). */
export type DadosRevisao = {
  responsavel_id: string | null;
  tipo_id: string | null;
  outros_responsaveis: string[];
};

/** As colunas de classificação que a importação grava. */
export type Classificacao = {
  responsavel_id: string | null;
  tipo_id: string | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: DadosRevisao | null;
};

/** O que a classificação usa de uma linha da importação. */
export type LinhaParaClassificar = {
  nome: string;
  /** Nome de um Tipo (já filtrado pela lista de Tipos ativos na extração). */
  tipo_sugerido: string | null;
  ordem_fatura: number;
  ajuste_de_ordem: number | null;
};

/** Os cadastros do dono, com o arquivado (arquivado conta como ausente). */
export type CadastrosParaClassificar = {
  responsaveis: readonly { id: string; arquivado: boolean }[];
  tipos: readonly { id: string; nome: string; arquivado: boolean }[];
};

/** Linha sem classificação: Ajuste sem motivo; as outras, `sem_classificacao`. */
export function classificacaoVazia(ehAjuste: boolean): Classificacao {
  return { responsavel_id: null, tipo_id: null, revisao_motivo: ehAjuste ? null : "sem_classificacao", revisao_dados: null };
}

function ativos(cadastros: CadastrosParaClassificar): CadastrosAtivos {
  return {
    responsaveis: new Set(cadastros.responsaveis.filter((r) => !r.arquivado).map((r) => r.id)),
    tipos: new Set(cadastros.tipos.filter((t) => !t.arquivado).map((t) => t.id)),
  };
}

/** O id do Tipo ativo com esse nome (igual; senão, normalizado). */
function tipoPeloNome(nome: string | null, cadastros: CadastrosParaClassificar): string | null {
  if (nome === null) return null;
  const tipos = cadastros.tipos.filter((t) => !t.arquivado);
  const igual = tipos.find((t) => t.nome === nome);
  if (igual) return igual.id;
  const chave = normalizarNome(nome);
  return tipos.find((t) => normalizarNome(t.nome) === chave)?.id ?? null;
}

function classificarLinha(
  l: LinhaParaClassificar,
  regras: ReadonlyMap<string, RegraGravada>,
  cadastros: CadastrosParaClassificar,
  emUso: CadastrosAtivos,
): Classificacao {
  const sugerido = tipoPeloNome(l.tipo_sugerido, cadastros);
  const regra = regras.get(chaveDeRegra(l.nome));
  const avaliacao = regra ? avaliarRegra(regra, emUso) : ({ tipo: "nada" } as const);
  if (avaliacao.tipo === "aplicar") {
    const completa = avaliacao.responsavel_id !== null && avaliacao.tipo_id !== null;
    if (!completa && avaliacao.tipo_id === null && sugerido !== null) {
      return {
        responsavel_id: avaliacao.responsavel_id,
        tipo_id: null,
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: sugerido, outros_responsaveis: [] },
      };
    }
    return {
      responsavel_id: avaliacao.responsavel_id,
      tipo_id: avaliacao.tipo_id,
      revisao_motivo: completa ? null : "sem_classificacao",
      revisao_dados: null,
    };
  }
  if (avaliacao.tipo === "sugerir_duvida") {
    return {
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sugestao_duvida",
      revisao_dados: {
        responsavel_id: avaliacao.responsavel_id,
        tipo_id: avaliacao.tipo_id ?? sugerido,
        outros_responsaveis: avaliacao.outros_responsaveis,
      },
    };
  }
  if (sugerido !== null) {
    return {
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sugestao",
      revisao_dados: { responsavel_id: null, tipo_id: sugerido, outros_responsaveis: [] },
    };
  }
  return classificacaoVazia(false);
}

/**
 * Classifica as linhas da importação (na ordem recebida) pelas Regras do
 * dono e pelo `tipo_sugerido`. Devolve cada linha com `responsavel_id`,
 * `tipo_id`, `revisao_motivo` e `revisao_dados`; o Ajuste copia a
 * classificação calculada da mãe (`ajuste_de_ordem`), sem motivo.
 */
export function classificarImportacao<L extends LinhaParaClassificar>(
  lancamentos: readonly L[],
  regras: readonly RegraGravada[],
  cadastros: CadastrosParaClassificar,
): (L & Classificacao)[] {
  const porChave = new Map<string, RegraGravada>();
  for (const r of regras) porChave.set(r.chave, r);
  const emUso = ativos(cadastros);

  const porOrdem = new Map<number, Classificacao>();
  for (const l of lancamentos) {
    if (l.ajuste_de_ordem === null) porOrdem.set(l.ordem_fatura, classificarLinha(l, porChave, cadastros, emUso));
  }
  return lancamentos.map((l) => {
    if (l.ajuste_de_ordem === null) return { ...l, ...porOrdem.get(l.ordem_fatura)! };
    const mae = porOrdem.get(l.ajuste_de_ordem);
    return {
      ...l,
      responsavel_id: mae?.responsavel_id ?? null,
      tipo_id: mae?.tipo_id ?? null,
      revisao_motivo: null,
      revisao_dados: null,
    };
  });
}

/**
 * As chaves das Regras que a importação usou (aplicou ou sugeriu), para
 * `regrasRepo.marcarUso` mudar o `ultimo_uso` (História 3.4). Ajustes não têm
 * Regra própria e não entram.
 */
export function chavesDeRegrasUsadas(
  lancamentos: readonly Pick<LinhaParaClassificar, "nome" | "ajuste_de_ordem">[],
  regras: readonly RegraGravada[],
  cadastros: CadastrosParaClassificar,
): string[] {
  return regrasUsadas(
    lancamentos.filter((l) => l.ajuste_de_ordem === null).map((l) => l.nome),
    regras,
    ativos(cadastros),
  );
}

/**
 * A sugestão de uma linha da fila (`revisao_dados` lido do banco), ou null.
 * `outros_responsaveis` sai sem repetidos e sem o `responsavel_id` sugerido
 * (depois de uma substituição, A e B podem ter virado o mesmo id).
 */
export function lerDadosRevisao(dados: unknown): DadosRevisao | null {
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const responsavel = id(d.responsavel_id);
  const outros: string[] = [];
  if (Array.isArray(d.outros_responsaveis)) {
    for (const v of d.outros_responsaveis) {
      if (typeof v === "string" && v !== "" && v !== responsavel && !outros.includes(v)) outros.push(v);
    }
  }
  return { responsavel_id: responsavel, tipo_id: id(d.tipo_id), outros_responsaveis: outros };
}
