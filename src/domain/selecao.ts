// Seleção do Painel (História 4.4, FR-48, UX-DR11, UX-DR12). Puro: a tela só
// guarda os ids marcados e chama estas funções.
//
// A Seleção é um conjunto de ids de UNIDADES da grade (a linha comum e as
// partes de uma Divisão; nunca a mãe dividida, que não soma, e nunca o Ajuste,
// que não tem caixa e segue a mãe). Regras:
//
// - O Ajuste segue a mãe: com a mãe marcada ele não é um item (o total o leva e a
//   gravação também). Só se o Bloco filtrado o tira de baixo da mãe (Ajuste de outro
//   Responsável, só por edição fora do app) a grade o mostra como linha própria, com
//   caixa, e então ele é um item como qualquer outro.
// - Um só Mês: trocar de Mês a limpa (`aoTrocarDeMes`), com o aviso só se havia
//   Seleção.
// - Um só filtro: a Seleção é sempre um subconjunto do que a grade mostra com os
//   filtros de agora (coluna, busca, Verificar, Bloco). O que sai do filtro sai da
//   Seleção (`selecaoValida` sobre os ids da grade): assim a contagem, o total e o
//   que "Classificar em lote" e "Excluir" tocam são exatamente as linhas marcadas
//   que Rafael vê. Também sai o que foi excluído (ou mudou de Mês) em outro aparelho.
// - O total é o do Revisar (`totalDaSelecao`, soma líquida): cada marcada com os
//   Ajustes dela que a grade mostra. O rodapé da grade soma as mesmas linhas.
// - "Selecionar todos" (caixa do cabeçalho) vale para todas as unidades do filtro,
//   as que rolam para fora da vista também (`alternarTodos`, em `lancamento.ts`).
//   ⌘/Ctrl+A só marca (`selecionarTudo`); desmarcar é a caixa ou "Limpar".

import { idsQueAcompanham } from "./ajustes";
import { formatarDinheiro } from "./dinheiro";
import type { CamposDoLote, EntradaDoLote } from "./lote";
import { totalDaSelecao } from "./lote";
import { TEXTOS_SELECAO, rotuloSelecionados } from "./mensagens";

/** O Ajuste cuja mãe também está marcada: não é um item, segue a mãe. */
const segueAMae = (l: { ajuste_de_id?: string | null }, selecao: ReadonlySet<string>) =>
  (l.ajuste_de_id ?? null) !== null && selecao.has(l.ajuste_de_id as string);

/** O que a Seleção lê de uma linha da grade (a mãe, o Ajuste dela ou a parte de uma Divisão). */
export type LinhaDaSelecao = {
  id: string;
  valor_centavos: number;
  ajuste_de_id?: string | null;
  excluido_em?: string | null;
  /** Parte (filha) de uma Divisão: só o Status é dela. */
  dividido_de_id?: string | null;
};

/** Os textos da barra: "3 selecionados", "R$ 209,10" e "3 selecionados · R$ 209,10". */
export type TextosDaBarra = { contagem: string; total: string; texto: string };

export function textosDaBarra(quantidade: number, totalCentavos: number): TextosDaBarra {
  const contagem = rotuloSelecionados(quantidade);
  const total = formatarDinheiro(totalCentavos);
  return { contagem, total, texto: `${contagem} · ${total}` };
}

export type ResumoDaSelecao = TextosDaBarra & {
  /** Quantas linhas marcadas (as unidades; os Ajustes seguem a mãe e não contam). */
  quantidade: number;
  /** A soma líquida: cada marcada com os Ajustes dela que a grade mostra. */
  totalCentavos: number;
};

/**
 * O resumo da Seleção sobre as linhas que a grade mostra (`visiveis`: as mães
 * filtradas e os Ajustes delas, as mesmas do rodapé). Id fora de `visiveis` não
 * conta. Sem nada marcado, `texto` é vazio (a região que anuncia fica vazia).
 */
export function resumoDaSelecao(selecao: ReadonlySet<string>, visiveis: readonly LinhaDaSelecao[]): ResumoDaSelecao {
  const marcadas = new Set(visiveis.filter((l) => selecao.has(l.id) && !segueAMae(l, selecao)).map((l) => l.id));
  const totalCentavos = totalDaSelecao(marcadas, visiveis);
  const textos = textosDaBarra(marcadas.size, totalCentavos);
  return { ...textos, texto: marcadas.size === 0 ? "" : textos.texto, quantidade: marcadas.size, totalCentavos };
}

/** ⌘/Ctrl+A: marca todas as do filtro e mantém as que já estavam (nunca desmarca). */
export function selecionarTudo(selecao: ReadonlySet<string>, idsDoFiltro: readonly string[]): Set<string> {
  const nova = new Set(selecao);
  for (const id of idsDoFiltro) nova.add(id);
  return nova;
}

/**
 * Trocar de Mês limpa a Seleção (ela é de um Mês só). O aviso só vem se havia
 * Seleção e o Mês mudou de fato; sem Seleção, nada a dizer.
 */
export function aoTrocarDeMes(
  selecao: ReadonlySet<string>,
  mesAberto: string,
  mesNovo: string,
): { selecao: ReadonlySet<string>; aviso: string | null } {
  if (mesAberto === mesNovo) return { selecao, aviso: null };
  return { selecao: new Set(), aviso: selecao.size > 0 ? TEXTOS_SELECAO.limpa_ao_trocar_de_mes : null };
}

// ------------------------------------------------------------ ⌘/Ctrl+A

/** A tecla como o navegador a entrega (só o que o atalho olha). */
export type TeclaPressionada = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
};

/** Onde está o foco: a tela lê do DOM e passa para o núcleo decidir. */
export type ContextoDoFoco = {
  /** O foco está num campo de texto (input de texto, área de texto, lista, campo editável). */
  emCampoDeTexto: boolean;
  /** Há uma janela, um menu ou outra sobreposição aberta. */
  sobreposicaoAberta: boolean;
};

/** ⌘/Ctrl+A (sem Alt nem Shift), fora de campo de texto, janela e menu. */
export function ehSelecionarTodos(tecla: TeclaPressionada, contexto: ContextoDoFoco): boolean {
  if (tecla.defaultPrevented) return false;
  if (tecla.key.toLowerCase() !== "a") return false;
  if (tecla.altKey || tecla.shiftKey) return false;
  if (!tecla.ctrlKey && !tecla.metaKey) return false;
  return !contexto.emCampoDeTexto && !contexto.sobreposicaoAberta;
}

// ------------------------------------------------------ Classificar em lote

/** O que a janela "Classificar em lote" escolhe: texto vazio = não mudar. */
export type EscolhaDoLote = {
  responsavelId: string;
  tipoId: string;
  /** "" não muda; `STATUS_NENHUM` limpa o Status; senão, o id do Status. */
  status: string;
  observacao: string;
};

/** O valor de "Sem status" no seletor (limpa o Status; vale "não pago", AD-10). */
export const STATUS_NENHUM = "__sem_status__";

/** Os campos que o lote grava a partir da escolha da janela; vazio = nada a mudar. */
export function montarCamposDoLote(escolha: EscolhaDoLote): CamposDoLote {
  const campos: CamposDoLote = {};
  if (escolha.responsavelId !== "") campos.responsavel_id = escolha.responsavelId;
  if (escolha.tipoId !== "") campos.tipo_id = escolha.tipoId;
  if (escolha.status === STATUS_NENHUM) campos.status_id = null;
  else if (escolha.status !== "") campos.status_id = escolha.status;
  const observacao = escolha.observacao.trim();
  if (observacao !== "") campos.observacao = observacao;
  return campos;
}

/** A parte de uma Divisão (filha). */
const ehParte = (l: LinhaDaSelecao) => (l.dividido_de_id ?? null) !== null;

/** Quantas das marcadas são partes de uma Divisão. */
export function contarPartes(selecao: ReadonlySet<string>, linhas: readonly LinhaDaSelecao[]): number {
  return linhas.filter((l) => selecao.has(l.id) && ehParte(l) && (l.excluido_em ?? null) === null).length;
}

/**
 * As entradas de `classificarEmLote` (a função da 3.3, que cuida de Ajustes,
 * Regras e "Desfazer") para a Seleção. A parte de uma Divisão só recebe o Status:
 * o Responsável é dela na Divisão e o Tipo e a Observação seguem a mãe. Id que não
 * existe mais (ou excluído) não entra; sem campos, nenhuma entrada.
 */
export function planejarClassificacaoEmLote(
  selecao: ReadonlySet<string>,
  linhas: readonly LinhaDaSelecao[],
  campos: CamposDoLote,
): EntradaDoLote[] {
  if (Object.keys(campos).length === 0) return [];
  const entradas: EntradaDoLote[] = [];
  for (const l of linhas) {
    if (!selecao.has(l.id) || (l.excluido_em ?? null) !== null || segueAMae(l, selecao)) continue;
    if (!ehParte(l)) {
      entradas.push({ id: l.id, campos });
      continue;
    }
    if (campos.status_id !== undefined) entradas.push({ id: l.id, campos: { status_id: campos.status_id } });
  }
  return entradas;
}

// ---------------------------------------------------------- Excluir em lote

/** O que "Excluir" leva: as marcadas (menos as partes de uma Divisão) e os Ajustes delas. */
export type PlanoDaExclusao = {
  /** Os ids excluídos como marcados (a primeira vai como principal). */
  ids: string[];
  /** Os Ajustes das marcadas: saem e voltam com elas. */
  ajustes: string[];
  /** Partes de uma Divisão marcadas: não se excluem (desfaz-se a Divisão). */
  partesQueFicam: number;
};

export function planejarExclusaoEmLote(selecao: ReadonlySet<string>, linhas: readonly LinhaDaSelecao[]): PlanoDaExclusao {
  const ids: string[] = [];
  const ajustes: string[] = [];
  let partesQueFicam = 0;
  for (const l of linhas) {
    if (!selecao.has(l.id) || (l.excluido_em ?? null) !== null || segueAMae(l, selecao)) continue;
    if (ehParte(l)) {
      partesQueFicam += 1;
      continue;
    }
    ids.push(l.id);
    for (const idAjuste of idsQueAcompanham(l.id, linhas)) if (!ajustes.includes(idAjuste)) ajustes.push(idAjuste);
  }
  return { ids, ajustes, partesQueFicam };
}
