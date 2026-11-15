// Blocos (História 4.1, FR-19): um totalizador nomeado do Painel, calculado por
// uma Fórmula. Aqui, as regras do cadastro (nome, ordem, "meu Bloco", o que a
// gravação recebe); a conta é de `formula.ts`. Puro: sem relógio, rede ou banco.

import {
  avaliar,
  lerFormula,
  montarFormula,
  type Avaliacao,
  type Ficha,
  type Formula,
  type LinhaDaFormula,
  type No,
} from "./formula";
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

// ----------------------------------------------------- Blocos no Painel (4.2)

/** O que o `block-card` mostra de um Bloco: tudo sai de `avaliar` sobre a projeção do Painel. */
export type ResumoDoBloco = {
  id: string;
  /** O valor arredondado; `null` só quando a Fórmula não cabe nos números seguros. */
  valorCentavos: number | null;
  /** A avaliação inteira: "Ver cálculo" mostra o passo a passo desta mesma. */
  avaliacao: Avaliacao | null;
  /** Algum previsto entra na conta: o Bloco mostra "inclui previstos". */
  incluiPrevistos: boolean;
  /** O Responsável de um Bloco que é de uma pessoa só (a bolinha). */
  responsavelId: string | null;
};

/**
 * Calcula o Bloco sobre a projeção do Painel do Mês (`projetarPainel`). Os
 * previstos já estão na projeção (um Mês sem Fatura é feito deles);
 * `incluiPrevistos` diz se algum deles entra neste Bloco. O valor do
 * `block-card`, o passo a passo e, depois, a mensagem leem esta avaliação.
 */
export function resumirBloco(
  bloco: Pick<Bloco, "id" | "formula">,
  projecao: readonly LinhaDaFormula[],
  idsDosPrevistos: ReadonlySet<string>,
): ResumoDoBloco {
  const a = avaliar(bloco.formula, projecao);
  const avaliacao = a.ok ? a.valor : null;
  return {
    id: bloco.id,
    valorCentavos: avaliacao ? avaliacao.valorCentavos : null,
    avaliacao,
    incluiPrevistos: avaliacao ? avaliacao.entram.some((id) => idsDosPrevistos.has(id)) : false,
    responsavelId: responsavelUnico(bloco.formula),
  };
}

/** Os Responsáveis e Tipos que a Fórmula cita, sem repetir, na ordem em que aparecem. */
export function citacoesDaFormula(formula: Formula): { responsaveis: string[]; tipos: string[] } {
  const responsaveis = new Set<string>();
  const tipos = new Set<string>();
  const visitar = (n: No): void => {
    switch (n.tipo) {
      case "responsavel":
        responsaveis.add(n.id);
        return;
      case "tipo":
        tipos.add(n.id);
        return;
      case "responsavel_em_tipo":
        responsaveis.add(n.responsavel_id);
        tipos.add(n.tipo_id);
        return;
      case "operacao":
        visitar(n.esquerda);
        visitar(n.direita);
        return;
      case "grupo":
        visitar(n.interno);
        return;
      default:
    }
  };
  visitar(formula);
  return { responsaveis: [...responsaveis], tipos: [...tipos] };
}

/**
 * O Responsável de um Bloco "de uma pessoa só": todo operando é dele
 * (Responsável ou Responsável em Tipo). Com Tipo, Todos ou mais de uma
 * pessoa (como "Rangel + (Casal ÷ 2)"), não há bolinha.
 */
export function responsavelUnico(formula: Formula): string | null {
  let soResponsaveis = true;
  const visitar = (n: No): void => {
    switch (n.tipo) {
      case "tipo":
      case "todos":
        soResponsaveis = false;
        return;
      case "operacao":
        visitar(n.esquerda);
        visitar(n.direita);
        return;
      case "grupo":
        visitar(n.interno);
        return;
      default:
    }
  };
  visitar(formula);
  if (!soResponsaveis) return null;
  const { responsaveis } = citacoesDaFormula(formula);
  return responsaveis.length === 1 ? responsaveis[0] : null;
}

/**
 * Os nomes dos Responsáveis e Tipos arquivados que a Fórmula cita. Arquivar
 * mantém o cadastro nas somas (AD-16), então o valor não muda; o Bloco só avisa.
 */
export function arquivadosNaFormula(
  formula: Formula,
  cadastros: {
    responsaveis: readonly { id: string; nome: string; arquivado: boolean }[];
    tipos: readonly { id: string; nome: string; arquivado: boolean }[];
  },
): string[] {
  const citados = citacoesDaFormula(formula);
  const nomes: string[] = [];
  for (const id of citados.responsaveis) {
    const r = cadastros.responsaveis.find((x) => x.id === id);
    if (r?.arquivado) nomes.push(r.nome);
  }
  for (const id of citados.tipos) {
    const t = cadastros.tipos.find((x) => x.id === id);
    if (t?.arquivado) nomes.push(t.nome);
  }
  return nomes;
}

/** Move o item de `de` para `para`; índice fora da lista, ou igual, devolve a mesma ordem. */
export function moverNaOrdem<T>(itens: readonly T[], de: number, para: number): T[] {
  const copia = [...itens];
  if (de === para || de < 0 || para < 0 || de >= copia.length || para >= copia.length) return copia;
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** O que a gravação da ordem recebe. */
export type PlanoDeOrdem = {
  /** Os Blocos na ordem nova (a RPC `reordenar_blocos` recebe isto). */
  ids: string[];
  /** A `ordem` de cada um depois (1, 2, 3…): o que a tela mostra enquanto grava. */
  ordens: { id: string; ordem: number }[];
  /** Falso quando a ordem nova é a que já valia (nada a gravar). */
  mudou: boolean;
};

/**
 * Confere a ordem nova (os mesmos Blocos, sem repetir nem faltar) e devolve o
 * que gravar.
 */
export function planejarReordenar(
  blocos: readonly Pick<Bloco, "id" | "ordem">[],
  idsNovos: readonly string[],
): Resultado<PlanoDeOrdem> {
  const atuais = new Set(blocos.map((b) => b.id));
  const novos = new Set(idsNovos);
  if (novos.size !== idsNovos.length || novos.size !== atuais.size || idsNovos.some((id) => !atuais.has(id))) {
    return { ok: false, erro: { codigo: "bloco.ordem_invalida" } };
  }
  const ordens = idsNovos.map((id, i) => ({ id, ordem: i + 1 }));
  const mudou = ordens.some((o) => blocos.find((b) => b.id === o.id)?.ordem !== o.ordem);
  return { ok: true, valor: { ids: [...idsNovos], ordens, mudou } };
}
