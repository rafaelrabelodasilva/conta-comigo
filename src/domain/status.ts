// Regras puras do cadastro de Status (História 1.6). Mesmas regras de Tipos
// (nome comum de `nome-cadastro.ts`, ordem alfabética, arquivados no fim,
// desarquivar sem nome repetido), com os códigos `status.*`, mais a marca
// "conta como pago" e o Status padrão das linhas novas, que não pode ser
// arquivado.

import { validarNomeCadastro } from "./nome-cadastro";
import type { Resultado } from "./resultado";

/** O que o núcleo precisa saber de um Status. */
export type Status = {
  id: string;
  nome: string;
  arquivado: boolean;
};

const CODIGOS_NOME = {
  vazio: "status.nome_vazio",
  longo: "status.nome_longo",
  repetido: "status.nome_repetido",
};

/** Valida o nome digitado e devolve o nome limpo (regra comum dos cadastros). */
export function validarNomeStatus(
  nome: string,
  status: readonly Status[],
  idProprio?: string,
): Resultado<string> {
  return validarNomeCadastro(nome, status, CODIGOS_NOME, idProprio);
}

/** Desarquivar `id`: volta às escolhas, então o nome não pode repetir o de um ativo. */
export function validarDesarquivarStatus(status: readonly Status[], id: string): Resultado<true> {
  const alvo = status.find((s) => s.id === id);
  if (!alvo || !alvo.arquivado) return { ok: false, erro: { codigo: "status.nao_arquivado" } };
  const nome = validarNomeStatus(alvo.nome, status, id);
  if (!nome.ok) return nome;
  return { ok: true, valor: true };
}

/**
 * Arquivar `status`: o Status padrão das linhas novas não pode sumir das
 * escolhas; antes, escolha outro padrão (ou "Nenhum").
 */
export function validarArquivarStatus(
  status: Status,
  padraoId: string | null | undefined,
): Resultado<true> {
  if (padraoId != null && status.id === padraoId) {
    return { ok: false, erro: { codigo: "status.padrao_nao_arquiva" } };
  }
  return { ok: true, valor: true };
}

function alfabetica(a: Status, b: Status): number {
  return (
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) ||
    a.nome.localeCompare(b.nome, "pt-BR") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Os que aparecem nas listas de escolha: sem arquivados, em ordem alfabética. */
export function ativos<T extends Status>(status: readonly T[]): T[] {
  return status.filter((s) => !s.arquivado).sort(alfabetica);
}

/** Lista de Configurações: ativos em ordem alfabética e, no fim, os arquivados. */
export function ordenarParaConfiguracoes<T extends Status>(status: readonly T[]): T[] {
  return [...ativos(status), ...status.filter((s) => s.arquivado).sort(alfabetica)];
}

/**
 * O padrão que o seletor mostra: o id escolhido se ainda for um Status
 * ativo; senão `null` ("Nenhum (não pago)").
 */
export function padraoVigente(status: readonly Status[], padraoId: string | null | undefined): string | null {
  if (padraoId == null) return null;
  return status.some((s) => s.id === padraoId && !s.arquivado) ? padraoId : null;
}
