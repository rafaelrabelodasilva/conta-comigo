// Regra de nome comum aos cadastros (Responsáveis, Tipos e, depois, Status).
// Nome sem espaços nas pontas, de 1 a 30 caracteres (contados por caractere,
// como o `char_length` do banco) e único entre os não arquivados, sem
// diferenciar maiúsculas e acentos. Cada cadastro informa os seus códigos.

import type { Resultado } from "./resultado";

export const NOME_MAX = 30;

/** O mínimo que a regra de nome precisa de um item do cadastro. */
export type ItemComNome = { id: string; nome: string; arquivado: boolean };

/** Códigos de erro do cadastro que chama a regra. */
export type CodigosNome = { vazio: string; longo: string; repetido: string };

/** Chave de comparação de nomes: sem maiúsculas, sem acentos, espaços colapsados. */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida o nome digitado e devolve o nome limpo (sem espaços nas pontas).
 * `idProprio` é ignorado na comparação (renomear para o mesmo nome não é
 * repetição).
 */
export function validarNomeCadastro(
  nome: string,
  itens: readonly ItemComNome[],
  codigos: CodigosNome,
  idProprio?: string,
): Resultado<string> {
  const limpo = nome.trim();
  if (limpo.length === 0) return { ok: false, erro: { codigo: codigos.vazio } };
  // Conta por caractere (code point), como o `char_length` do banco.
  if ([...limpo].length > NOME_MAX) return { ok: false, erro: { codigo: codigos.longo } };
  const chave = chaveDoNome(limpo);
  const repetido = itens.some(
    (i) => !i.arquivado && i.id !== idProprio && chaveDoNome(i.nome) === chave,
  );
  if (repetido) return { ok: false, erro: { codigo: codigos.repetido } };
  return { ok: true, valor: limpo };
}
