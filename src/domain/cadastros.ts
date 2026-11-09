// Exclusão e substituição de cadastros em uso (História 1.6). Responsável,
// Tipo e Status só são apagados pela RPC `substituir_cadastro`, que troca o
// id em todas as referências listadas aqui e apaga o item, numa transação.
//
// REFERENCIAS_COLUNAS e REFERENCIAS_JSONB espelham a função SQL
// `referencias_cadastro()`; o teste de integração exige que sejam iguais.
// Toda história que criar uma referência a um cadastro acrescenta-a às duas.

import type { ItemComNome } from "./nome-cadastro";
import type { Resultado } from "./resultado";

export type Cadastro = "responsavel" | "tipo" | "status";

export const CADASTROS: readonly Cadastro[] = ["responsavel", "tipo", "status"];

/** Tabela de cada cadastro no banco. */
export const TABELA_DO_CADASTRO = {
  responsavel: "responsaveis",
  tipo: "tipos",
  status: "status",
} as const satisfies Record<Cadastro, string>;

/**
 * Onde um cadastro é citado. `contaUso`: entra no "N registros" e exige
 * substituto para excluir; sem ele, a referência vira nula ao excluir sem
 * substituto (ex.: o Status padrão).
 */
export type Referencia = {
  cadastro: Cadastro;
  tabela: string;
  coluna: string;
  contaUso: boolean;
};

/** Colunas `uuid` que guardam o id de um cadastro. */
export const REFERENCIAS_COLUNAS: readonly Referencia[] = [
  { cadastro: "status", tabela: "configuracoes", coluna: "status_padrao_id", contaUso: false },
  { cadastro: "responsavel", tabela: "lancamentos", coluna: "responsavel_id", contaUso: true },
  { cadastro: "tipo", tabela: "lancamentos", coluna: "tipo_id", contaUso: true },
  { cadastro: "status", tabela: "lancamentos", coluna: "status_id", contaUso: true },
  // Regras (História 3.1): não contam uso; excluir sem substituto anula a coluna.
  { cadastro: "responsavel", tabela: "regras", coluna: "responsavel_id", contaUso: false },
  { cadastro: "tipo", tabela: "regras", coluna: "tipo_id", contaUso: false },
];

/**
 * Colunas `jsonb` em que o id aparece como texto (valor ou chave, em qualquer
 * nível). Com substituto, o id é trocado; sem substituto, uma referência sem
 * `contaUso` não bloqueia e o id vira `null` no documento (por isso essas
 * guardam ids só como valores, nunca como chave).
 */
export const REFERENCIAS_JSONB: readonly Referencia[] = [
  // História 3.1: a contagem por Responsável da Regra e a sugestão da fila.
  { cadastro: "responsavel", tabela: "regras", coluna: "contagem", contaUso: false },
  { cadastro: "responsavel", tabela: "lancamentos", coluna: "revisao_dados", contaUso: false },
  { cadastro: "tipo", tabela: "lancamentos", coluna: "revisao_dados", contaUso: false },
];

/**
 * Substitutos possíveis para excluir `deId`: os ativos do mesmo cadastro,
 * sem ele mesmo, na ordem recebida (cada cadastro passa a sua ordem).
 */
export function opcoesDeSubstituto<T extends ItemComNome>(itens: readonly T[], deId: string): T[] {
  return itens.filter((i) => !i.arquivado && i.id !== deId);
}

/**
 * Confere o pedido de exclusão antes de chamar a RPC. Sem uso, exclui sem
 * substituto (`paraId` ignorado). Em uso, o substituto é obrigatório e
 * precisa estar entre as `opcoes`.
 */
export function validarExclusao(
  usos: number,
  paraId: string | null | undefined,
  opcoes: readonly { id: string }[],
): Resultado<{ paraId: string | null }> {
  if (usos <= 0) return { ok: true, valor: { paraId: null } };
  if (!paraId) return { ok: false, erro: { codigo: "cadastro.sem_substituto" } };
  if (!opcoes.some((o) => o.id === paraId)) {
    return { ok: false, erro: { codigo: "cadastro.substituto_invalido" } };
  }
  return { ok: true, valor: { paraId } };
}
