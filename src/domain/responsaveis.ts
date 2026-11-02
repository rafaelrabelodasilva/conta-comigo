// Regras puras do cadastro de Responsáveis (História 1.4). Telas, repositório
// e SQL chamam estas funções; o banco só garante as restrições (cor 1..8,
// cor única por dono, nome sem espaços nas pontas e com 1 a 30 caracteres).

import type { Resultado } from "./resultado";

/** O que o núcleo precisa saber de um Responsável. */
export type Responsavel = {
  id: string;
  nome: string;
  /** Número da cor de pessoa (1..8), mapeado para os tokens `person-N`. */
  cor: number;
  ordem: number;
  arquivado: boolean;
};

export type CorPessoa = { cor: number; nome: string };

/** As 8 cores de pessoa do DESIGN.md, com o nome lido pelo VoiceOver. */
export const CORES_PESSOA: readonly CorPessoa[] = [
  { cor: 1, nome: "Azul" },
  { cor: 2, nome: "Roxo" },
  { cor: 3, nome: "Âmbar" },
  { cor: 4, nome: "Azul-petróleo" },
  { cor: 5, nome: "Rosa" },
  { cor: 6, nome: "Laranja" },
  { cor: 7, nome: "Índigo" },
  { cor: 8, nome: "Ocre" },
];

export const NOME_MAX = 30;

/** Nome da cor `n`, ou `undefined` se não for uma das 8. */
export function nomeDaCor(n: number): string | undefined {
  return CORES_PESSOA.find((c) => c.cor === n)?.nome;
}

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
 * Precisa ter de 1 a 30 caracteres e ser único entre os não arquivados
 * (sem diferenciar maiúsculas e acentos). `idProprio` é ignorado na
 * comparação (renomear para o mesmo nome não é repetição).
 */
export function validarNome(
  nome: string,
  responsaveis: readonly Responsavel[],
  idProprio?: string,
): Resultado<string> {
  const limpo = nome.trim();
  if (limpo.length === 0) return { ok: false, erro: { codigo: "responsavel.nome_vazio" } };
  // Conta por caractere (code point), como o `char_length` do banco.
  if ([...limpo].length > NOME_MAX) {
    return { ok: false, erro: { codigo: "responsavel.nome_longo" } };
  }
  const chave = chaveDoNome(limpo);
  const repetido = responsaveis.some(
    (r) => !r.arquivado && r.id !== idProprio && chaveDoNome(r.nome) === chave,
  );
  if (repetido) return { ok: false, erro: { codigo: "responsavel.nome_repetido" } };
  return { ok: true, valor: limpo };
}

/**
 * Cores que `idProprio` pode escolher: as que nenhum outro Responsável usa.
 * Arquivado continua com a cor reservada (decisão de 02/11).
 */
export function coresLivres(
  responsaveis: readonly Responsavel[],
  idProprio?: string,
): number[] {
  const usadas = new Set(responsaveis.filter((r) => r.id !== idProprio).map((r) => r.cor));
  return CORES_PESSOA.map((c) => c.cor).filter((n) => !usadas.has(n));
}

/** Primeira cor livre para um Responsável novo; com as 8 em uso, erro. */
export function proximaCor(responsaveis: readonly Responsavel[]): Resultado<number> {
  const livres = coresLivres(responsaveis);
  if (livres.length === 0) {
    return { ok: false, erro: { codigo: "responsavel.sem_cor_livre" } };
  }
  return { ok: true, valor: livres[0] };
}

/** Ordem de um Responsável novo (ou desarquivado): a maior + 1. */
export function proximaOrdem(responsaveis: readonly Responsavel[]): number {
  return responsaveis.reduce((maior, r) => Math.max(maior, r.ordem), 0) + 1;
}

/**
 * Desarquivar `id`: ele volta às listas de escolha, então o nome não pode
 * repetir o de um ativo. Devolve a ordem nova (a maior + 1).
 */
export function validarDesarquivar(
  responsaveis: readonly Responsavel[],
  id: string,
): Resultado<number> {
  const alvo = responsaveis.find((r) => r.id === id);
  if (!alvo || !alvo.arquivado) {
    return { ok: false, erro: { codigo: "responsavel.nao_arquivado" } };
  }
  const nome = validarNome(alvo.nome, responsaveis, id);
  if (!nome.ok) return nome;
  return { ok: true, valor: proximaOrdem(responsaveis) };
}

function porOrdem(a: Responsavel, b: Responsavel): number {
  return a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Os que aparecem nas listas de escolha: sem arquivados, pela ordem. */
export function ativos<R extends Responsavel>(responsaveis: readonly R[]): R[] {
  return responsaveis.filter((r) => !r.arquivado).sort(porOrdem);
}

/** Lista de Configurações: ativos pela ordem e, no fim, os arquivados. */
export function ordenarParaConfiguracoes<R extends Responsavel>(responsaveis: readonly R[]): R[] {
  return [...ativos(responsaveis), ...responsaveis.filter((r) => r.arquivado).sort(porOrdem)];
}

export type Direcao = "cima" | "baixo";

/** Se o Responsável ativo `id` pode subir ou descer entre os ativos. */
export function podeMover(
  responsaveis: readonly Responsavel[],
  id: string,
): { cima: boolean; baixo: boolean } {
  const lista = ativos(responsaveis);
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) return { cima: false, baixo: false };
  return { cima: i > 0, baixo: i < lista.length - 1 };
}

/**
 * Nova ordem dos ativos depois de mover `id` uma posição. Devolve os ids na
 * ordem nova (a posição + 1 vira a `ordem`). O primeiro não sobe e o último
 * não desce; arquivado não se move.
 */
export function moverResponsavel(
  responsaveis: readonly Responsavel[],
  id: string,
  direcao: Direcao,
): Resultado<string[]> {
  const ids = ativos(responsaveis).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) {
    return { ok: false, erro: { codigo: "responsavel.nao_move" } };
  }
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ok: true, valor: ids };
}
