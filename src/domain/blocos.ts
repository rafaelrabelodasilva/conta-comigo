// Blocos (História 4.1, FR-19): um totalizador nomeado do Painel, calculado por
// uma Fórmula. Aqui, as regras do cadastro (nome, ordem, "meu Bloco", o que a
// gravação recebe); a conta é de `formula.ts`. Puro: sem relógio, rede ou banco.

import { montarFormula, lerFormula, type Ficha, type Formula } from "./formula";
import { validarNomeCadastro } from "./nome-cadastro";
import type { Resultado } from "./resultado";

const CODIGOS_NOME = {
  vazio: "bloco.nome_vazio",
  longo: "bloco.nome_longo",
  repetido: "bloco.nome_repetido",
};

/** O Bloco como o núcleo o lê (as colunas de `blocos`, com a Fórmula já validada). */
export type Bloco = {
  id: string;
  nome: string;
  formula: Formula;
  ordem: number;
  /** "Usar em Recebimentos": aparece como Bloco de cobrança (Épico 6). */
  de_cobranca: boolean;
  /** "É o meu Bloco": o do gasto do Rafael por Tipo (Épico 7). Só um. */
  meu_bloco: boolean;
};

/** A linha de `blocos` no banco; `formula` é o `jsonb` ainda não conferido. */
export type LinhaDoBloco = Omit<Bloco, "formula"> & { formula: unknown };

/** Lê as linhas do banco. A de Fórmula ilegível fica de fora (nunca deveria existir). */
export function lerBlocos(linhas: readonly LinhaDoBloco[]): Bloco[] {
  const blocos: Bloco[] = [];
  for (const l of linhas) {
    const formula = lerFormula(l.formula);
    if (formula.ok) {
      blocos.push({
        id: l.id,
        nome: l.nome,
        formula: formula.valor,
        ordem: l.ordem,
        de_cobranca: l.de_cobranca,
        meu_bloco: l.meu_bloco,
      });
    }
  }
  return blocos.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") || (a.id < b.id ? -1 : 1));
}

/** Nome de 1 a 30 caracteres, único entre os Blocos (sem diferenciar maiúsculas e acentos). */
export function validarNomeBloco(nome: string, blocos: readonly Pick<Bloco, "id" | "nome">[], idProprio?: string): Resultado<string> {
  return validarNomeCadastro(
    nome,
    blocos.map((b) => ({ ...b, arquivado: false })),
    CODIGOS_NOME,
    idProprio,
  );
}

/** Ordem de um Bloco novo: a maior + 1. */
export function proximaOrdemBloco(blocos: readonly Pick<Bloco, "ordem">[]): number {
  return blocos.reduce((maior, b) => Math.max(maior, b.ordem), 0) + 1;
}

/** O que Rafael preencheu no Montador. */
export type RascunhoDoBloco = {
  nome: string;
  fichas: readonly Ficha[];
  de_cobranca: boolean;
  meu_bloco: boolean;
};

/** O que a RPC `salvar_bloco` recebe. */
export type BlocoParaGravar = {
  p_id: string | null;
  p_nome: string;
  p_formula: Formula;
  p_ordem: number;
  p_de_cobranca: boolean;
  p_meu_bloco: boolean;
};

/**
 * Confere o rascunho e monta o pedido de gravação. A razão da Fórmula vem
 * antes da do nome (é a que "Salvar" mostra desativado). Num Bloco que já
 * existe (`idProprio`), a ordem é mantida.
 */
export function planejarSalvarBloco(
  rascunho: RascunhoDoBloco,
  blocos: readonly Pick<Bloco, "id" | "nome" | "ordem">[],
  idProprio?: string,
): Resultado<BlocoParaGravar> {
  const formula = montarFormula(rascunho.fichas);
  if (!formula.ok) return formula;
  const nome = validarNomeBloco(rascunho.nome, blocos, idProprio);
  if (!nome.ok) return nome;
  const atual = idProprio === undefined ? undefined : blocos.find((b) => b.id === idProprio);
  return {
    ok: true,
    valor: {
      p_id: idProprio ?? null,
      p_nome: nome.valor,
      p_formula: formula.valor,
      p_ordem: atual?.ordem ?? proximaOrdemBloco(blocos),
      p_de_cobranca: rascunho.de_cobranca,
      p_meu_bloco: rascunho.meu_bloco,
    },
  };
}
