// Regras puras do cadastro de Tipos (História 1.5). Telas, repositório e SQL
// chamam estas funções; o banco só garante as restrições (nome sem espaços
// nas pontas e com 1 a 30 caracteres). Tipo não tem ordem manual, cor nem
// ícone: a lista é sempre alfabética.

import { validarNomeCadastro } from "./nome-cadastro";
import type { Resultado } from "./resultado";

/** O que o núcleo precisa saber de um Tipo. */
export type Tipo = {
  id: string;
  nome: string;
  arquivado: boolean;
};

const CODIGOS_NOME = {
  vazio: "tipo.nome_vazio",
  longo: "tipo.nome_longo",
  repetido: "tipo.nome_repetido",
};

/**
 * Valida o nome digitado e devolve o nome limpo. Mesma regra de nome dos
 * Responsáveis (`nome-cadastro.ts`), com os códigos `tipo.*`.
 */
export function validarNomeTipo(
  nome: string,
  tipos: readonly Tipo[],
  idProprio?: string,
): Resultado<string> {
  return validarNomeCadastro(nome, tipos, CODIGOS_NOME, idProprio);
}

/**
 * Desarquivar `id`: ele volta às listas de escolha, então o nome não pode
 * repetir o de um ativo.
 */
export function validarDesarquivarTipo(tipos: readonly Tipo[], id: string): Resultado<true> {
  const alvo = tipos.find((t) => t.id === id);
  if (!alvo || !alvo.arquivado) return { ok: false, erro: { codigo: "tipo.nao_arquivado" } };
  const nome = validarNomeTipo(alvo.nome, tipos, id);
  if (!nome.ok) return nome;
  return { ok: true, valor: true };
}

function alfabetica(a: Tipo, b: Tipo): number {
  return (
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) ||
    a.nome.localeCompare(b.nome, "pt-BR") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Os que aparecem nas listas de escolha: sem arquivados, em ordem alfabética. */
export function ativos<T extends Tipo>(tipos: readonly T[]): T[] {
  return tipos.filter((t) => !t.arquivado).sort(alfabetica);
}

/** Lista de Configurações: ativos em ordem alfabética e, no fim, os arquivados. */
export function ordenarParaConfiguracoes<T extends Tipo>(tipos: readonly T[]): T[] {
  return [...ativos(tipos), ...tipos.filter((t) => t.arquivado).sort(alfabetica)];
}
