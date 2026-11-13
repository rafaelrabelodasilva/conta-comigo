// Classificar em lote (História 3.3, FR-14, AD-1, AD-3). Puro: o relógio
// entra como parâmetro (`agora`, ISO) e quem grava é o repositório de
// Lançamentos, numa RPC só (`classificar_em_lote`).
//
// - `planejarGravacao`: o que uma gravação de campos deixa em UMA linha
//   (só as colunas que mudam; com Responsável e Tipo a linha sai da fila:
//   `revisao_motivo`/`revisao_dados` = null e `revisado_em`; `editado_em` é o
//   relógio do aparelho). É a regra de `atualizar` (painel, ✓ e "Mudar"),
//   extraída para o lote usar a mesma.
// - `planejarLote`: as entradas `{ id, campos }` viram os itens da RPC
//   (`{ id, corpo }`, mães e Ajustes), o retrato de antes (o "Desfazer" é a
//   mesma RPC com ele) e um evento de Regra por mãe.
// - A mãe que recebe Responsável ou Tipo leva os Ajustes dela no mesmo lote:
//   só `responsavel_id`/`tipo_id` (Status e Observação não), `editado_em` e,
//   se a mãe sai da fila, `revisado_em`. Ajuste não tem motivo nem ensina Regra.
// - `entradasDeSugestoes`: "Aplicar sugestões" (o que o ✓ de cada item grava).
// - `totalDaSelecao`: a soma líquida dos selecionados (mãe mais Ajustes).

import { idsQueAcompanham } from "./ajustes";
import type { MotivoRevisao } from "./classificacao";
import { estaClassificada } from "./divisao";
import type { EventoAprender } from "./regras";
import type { ItemDaFila } from "./revisar";

/** As colunas que o lote grava (a lista fechada que a RPC aceita). */
export const COLUNAS_DO_LOTE = [
  "responsavel_id",
  "tipo_id",
  "status_id",
  "observacao",
  "revisao_motivo",
  "revisao_dados",
  "revisado_em",
  "editado_em",
  "apelido",
] as const;

export type ColunaDoLote = (typeof COLUNAS_DO_LOTE)[number];

/** Uma coluna ausente fica como está; `null` grava nulo. */
export type CorpoDoLote = {
  responsavel_id?: string | null;
  tipo_id?: string | null;
  status_id?: string | null;
  observacao?: string | null;
  revisao_motivo?: MotivoRevisao | null;
  revisao_dados?: unknown;
  revisado_em?: string | null;
  editado_em?: string | null;
  /** Apelido em massa (História 3.9): o `apelido` novo, ou `null` para remover. */
  apelido?: string | null;
};

/** Um item da RPC: a linha e as colunas que ela recebe. */
export type ItemDoLote = { id: string; corpo: CorpoDoLote };

/** O que o lote escolhe: sem limpar Responsável ou Tipo. */
export type CamposDoLote = {
  responsavel_id?: string;
  tipo_id?: string;
  status_id?: string | null;
  observacao?: string | null;
};

/** Uma linha e o que o lote grava nela. */
export type EntradaDoLote = { id: string; campos: CamposDoLote };

/** O que a gravação usa de uma linha de `lancamentos`. */
export type LinhaParaGravar = {
  responsavel_id: string | null;
  tipo_id: string | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: unknown;
  editado_em: string | null;
  fatura_id: string | null;
  ajuste_de_id: string | null;
  /** Mãe dividida (História 3.8): o Responsável é das partes, nunca da mãe. */
  divisao?: unknown;
};

/** O que o lote usa de uma linha de `lancamentos`. */
export type LinhaDoLote = LinhaParaGravar & {
  id: string;
  nome: string;
  valor_centavos: number;
  status_id: string | null;
  observacao: string | null;
  revisado_em: string | null;
  excluido_em: string | null;
  /** Filha de uma Divisão (História 3.8): segue o Tipo e a Observação da mãe. */
  dividido_de_id?: string | null;
};

export type PlanoDeGravacao<L> =
  | { vazio: true }
  | {
      vazio: false;
      /** As colunas a gravar na linha (e nos Ajustes `junto`), com `editado_em`. */
      corpo: Partial<L>;
      /** Colunas só da linha principal: a que perdeu Responsável ou Tipo volta à fila. */
      soDaPrincipal: Partial<L> | null;
      /** A gravação escolheu um Responsável ou um Tipo (só limpar não ensina a Regra)? */
      ensina: boolean;
    };

/** Só as colunas de `mudanca` que diferem da linha (`Object.is`); `undefined` não conta. */
function colunasQueMudam<L extends object>(atual: L, mudanca: Partial<L>): Partial<L> {
  const saida: Partial<L> = {};
  for (const chave of Object.keys(mudanca) as (keyof L)[]) {
    if (mudanca[chave] === undefined) continue;
    if (!Object.is(atual[chave], mudanca[chave])) saida[chave] = mudanca[chave];
  }
  return saida;
}

const mudouClassificacao = (corpo: Partial<LinhaParaGravar>) => "responsavel_id" in corpo || "tipo_id" in corpo;

const limpouClassificacao = (corpo: Partial<LinhaParaGravar>) => corpo.responsavel_id === null || corpo.tipo_id === null;

const escolheuClassificacao = (corpo: Partial<LinhaParaGravar>) =>
  (corpo.responsavel_id !== undefined && corpo.responsavel_id !== null) ||
  (corpo.tipo_id !== undefined && corpo.tipo_id !== null);

/**
 * O que gravar em `atual` para aplicar `mudanca` (campos que o painel, o ✓,
 * o "Mudar" ou o lote escolhem):
 * - só as colunas que mudam, mais `editado_em` = `agora`;
 * - a linha da fila que fica com Responsável e Tipo sai dela no mesmo corpo
 *   (`revisao_motivo` e `revisao_dados` nulos, `revisado_em` = `agora`); quem
 *   pede Responsável ou Tipo a uma linha da fila que já os tem (o ✓ de uma
 *   linha completa) ainda precisa sair dela;
 * - a linha da Fatura (não Ajuste) fora da fila que perde Responsável ou Tipo
 *   volta como `sem_classificacao`, só na linha principal (`soDaPrincipal`);
 * - sem nada a mudar, `vazio`.
 */
export function planejarGravacao<L extends LinhaParaGravar>(atual: L, pedida: Partial<L>, agora: string): PlanoDeGravacao<L> {
  // A mãe dividida não tem Responsável: o pedido de Responsável é ignorado (História 3.8).
  let mudanca = pedida;
  if ((atual.divisao ?? null) !== null && pedida.responsavel_id !== undefined) {
    mudanca = { ...pedida };
    delete mudanca.responsavel_id;
  }
  const corpo: Partial<L> = colunasQueMudam<L>(atual, mudanca);
  const naFila = atual.revisao_motivo != null || atual.revisao_dados != null;
  const pedeClassificacao = mudanca.responsavel_id !== undefined || mudanca.tipo_id !== undefined;
  const fechaFila = naFila && pedeClassificacao;
  if (Object.keys(corpo).length === 0 && !(fechaFila && atual.responsavel_id !== null && atual.tipo_id !== null)) {
    return { vazio: true };
  }
  const ensina = escolheuClassificacao(corpo);
  const saida = corpo as Partial<LinhaParaGravar & { revisado_em: string | null }>;
  let soDaPrincipal: Partial<L> | null = null;
  if (mudouClassificacao(corpo) || fechaFila) {
    const depois = { ...atual, ...corpo };
    if (estaClassificada(depois)) {
      if (naFila) {
        saida.revisao_motivo = null;
        saida.revisao_dados = null;
        saida.revisado_em = agora;
      }
    } else if (
      limpouClassificacao(corpo) &&
      atual.revisao_motivo == null &&
      atual.fatura_id != null &&
      atual.ajuste_de_id == null
    ) {
      soDaPrincipal = { revisao_motivo: "sem_classificacao", revisao_dados: null, revisado_em: null } as unknown as Partial<L>;
    }
  }
  saida.editado_em = agora;
  return { vazio: false, corpo, soDaPrincipal, ensina };
}

/** O que o núcleo calcula para o lote. */
export type PlanoDoLote = {
  /** Os itens da RPC: as mães e os Ajustes delas, sem repetir id. */
  itens: ItemDoLote[];
  /** Como as colunas gravadas estavam antes, por linha (o "Desfazer" grava isto). */
  antes: ItemDoLote[];
  /** Um evento de Regra por mãe que recebeu Responsável ou Tipo. */
  eventos: EventoAprender[];
  /** Quantas linhas das entradas (sem os Ajustes que vão junto) mudam. */
  gravadas: number;
};

const COLUNAS_DO_AJUSTE = ["responsavel_id", "tipo_id"] as const;

/** O corpo do Ajuste a partir do que a mãe recebeu; `null` se não há o que gravar. */
function corpoDoAjuste(
  ajuste: LinhaDoLote,
  campos: CamposDoLote,
  corpoDaMae: CorpoDoLote,
  agora: string,
): CorpoDoLote | null {
  const corpo: CorpoDoLote = {};
  for (const coluna of COLUNAS_DO_AJUSTE) {
    const valor = campos[coluna];
    if (valor !== undefined && !Object.is(ajuste[coluna], valor)) corpo[coluna] = valor;
  }
  // A mãe saiu da fila: o Ajuste leva o mesmo `revisado_em` (nunca tem motivo).
  if (corpoDaMae.revisao_motivo === null && typeof corpoDaMae.revisado_em === "string") {
    corpo.revisado_em = corpoDaMae.revisado_em;
  }
  if (Object.keys(corpo).length === 0) return null;
  corpo.editado_em = agora;
  return corpo;
}

/** Só as colunas da lista fechada da RPC. */
function soColunasDoLote(corpo: object): CorpoDoLote {
  const saida: Record<string, unknown> = {};
  for (const coluna of COLUNAS_DO_LOTE) {
    if (coluna in corpo) saida[coluna] = (corpo as Record<string, unknown>)[coluna];
  }
  return saida as CorpoDoLote;
}

function retratoDe(linha: LinhaDoLote, corpo: CorpoDoLote): ItemDoLote {
  const antes: CorpoDoLote = {};
  for (const coluna of Object.keys(corpo) as ColunaDoLote[]) {
    (antes as Record<string, unknown>)[coluna] = linha[coluna as keyof LinhaDoLote] ?? null;
  }
  return { id: linha.id, corpo: antes };
}

/**
 * As entradas viram os itens da RPC. Entrada de id que não está em `linhas`
 * (ou excluído) é ignorada (o lote segue com as outras); id repetido vale o
 * primeiro. Linha sem nada a mudar não entra. Os Ajustes da mãe vão no mesmo
 * lote quando o lote escolhe Responsável ou Tipo, menos o que já é entrada.
 */
export function planejarLote(entradas: readonly EntradaDoLote[], linhas: readonly LinhaDoLote[], agora: string): PlanoDoLote {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const entrou = new Set(entradas.map((e) => e.id));
  const vistos = new Set<string>();
  const itens: ItemDoLote[] = [];
  const antes: ItemDoLote[] = [];
  const eventos: EventoAprender[] = [];
  let gravadas = 0;

  const incluir = (linha: LinhaDoLote, corpo: CorpoDoLote) => {
    itens.push({ id: linha.id, corpo });
    antes.push(retratoDe(linha, corpo));
  };

  for (const { id, campos } of entradas) {
    if (vistos.has(id)) continue;
    const atual = porId.get(id);
    if (!atual || atual.excluido_em != null) continue;
    vistos.add(id);
    const plano = planejarGravacao<LinhaDoLote>(atual, campos, agora);
    if (plano.vazio) continue;
    const corpo = soColunasDoLote({ ...plano.corpo, ...plano.soDaPrincipal });
    incluir(atual, corpo);
    gravadas += 1;
    if (atual.ajuste_de_id != null) continue;
    if (plano.ensina) {
      eventos.push({
        nome: atual.nome,
        responsavelAntes: atual.responsavel_id,
        responsavelDepois: corpo.responsavel_id !== undefined ? corpo.responsavel_id : atual.responsavel_id,
        tipoDepois: corpo.tipo_id !== undefined ? corpo.tipo_id : atual.tipo_id,
      });
    }
    // As filhas de uma mãe dividida seguem o Tipo e a Observação dela (o Responsável, o Status e o Valor são delas).
    if (campos.tipo_id !== undefined || campos.observacao !== undefined) {
      for (const filha of linhas) {
        if (filha.dividido_de_id !== id || filha.excluido_em != null || entrou.has(filha.id) || vistos.has(filha.id)) continue;
        const corpoFilha: CorpoDoLote = {};
        if (campos.tipo_id !== undefined && !Object.is(filha.tipo_id, campos.tipo_id)) corpoFilha.tipo_id = campos.tipo_id;
        if (campos.observacao !== undefined && !Object.is(filha.observacao, campos.observacao)) corpoFilha.observacao = campos.observacao;
        if (Object.keys(corpoFilha).length === 0) continue;
        corpoFilha.editado_em = agora;
        vistos.add(filha.id);
        incluir(filha, corpoFilha);
      }
    }
    if (campos.responsavel_id === undefined && campos.tipo_id === undefined) continue;
    for (const idAjuste of idsQueAcompanham(id, linhas)) {
      if (entrou.has(idAjuste) || vistos.has(idAjuste)) continue;
      const ajuste = porId.get(idAjuste);
      if (!ajuste) continue;
      const corpoAjuste = corpoDoAjuste(ajuste, campos, corpo, agora);
      if (!corpoAjuste) continue;
      vistos.add(idAjuste);
      incluir(ajuste, corpoAjuste);
    }
  }
  return { itens, antes, eventos, gravadas };
}

/** "Aplicar sugestões": o que o ✓ de cada item marcado grava, e quantos não têm sugestão completa. */
export function entradasDeSugestoes(itens: readonly ItemDaFila[]): { entradas: EntradaDoLote[]; semSugestao: number } {
  const entradas: EntradaDoLote[] = [];
  for (const item of itens) {
    if (item.aoConfirmar) entradas.push({ id: item.id, campos: { ...item.aoConfirmar } });
  }
  return { entradas, semSugestao: itens.length - entradas.length };
}

/**
 * O total da barra de lote: a soma líquida dos selecionados, cada mãe com os
 * Ajustes dela (não excluídos). Id fora de `linhas` não conta; nada é somado
 * duas vezes (um Ajuste também selecionado entra uma vez só).
 */
export function totalDaSelecao(
  selecao: ReadonlySet<string>,
  linhas: readonly { id: string; valor_centavos: number; ajuste_de_id?: string | null; excluido_em?: string | null }[],
): number {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const contados = new Set<string>();
  let total = 0;
  const somar = (id: string) => {
    const linha = porId.get(id);
    if (!linha || contados.has(id)) return;
    contados.add(id);
    total += linha.valor_centavos;
  };
  for (const id of selecao) {
    const linha = porId.get(id);
    if (!linha || (linha.excluido_em ?? null) !== null) continue;
    somar(id);
    for (const idAjuste of idsQueAcompanham(id, linhas)) somar(idAjuste);
  }
  return total;
}
