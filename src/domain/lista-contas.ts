// Lista de Contas manuais (História 5.2, FR-16, UX-DR24, AD-1, AD-15, AD-16).
// Tudo o que a lista decide mora aqui, puro: a situação da Conta (Ativa ou
// Encerrada, dado o Mês atual), o filtro "Ativas / Encerradas / Todas", a
// ordem, e a linha pronta para a tela (descrição da repetição, Valor por mês,
// etiquetas de Responsável ou Divisão, Tipo). A tela só lê as Contas pelo
// gerenciador de Realtime, chama estas funções e desenha.
//
// Situação (decisão da 5.2, a mesma data que `parcelasDaConta` usa):
// - a Conta cobre os Meses de `mes_inicial` até o ÚLTIMO MÊS dela: o fim da
//   contagem (`mes_inicial + parcela_total − 1`, só nas parcelas) ou o Mês
//   anterior a `encerrada_em_mes`, o que vier primeiro; sem nenhum dos dois,
//   não tem fim (Mensal até encerrar);
// - **Encerrada** = o último Mês é anterior ao Mês atual (a Conta já acabou);
//   o último Mês igual ao Mês atual ainda é Ativa (a última parcela é a deste
//   Mês); uma Conta encerrada antes de começar (último Mês anterior ao
//   `mes_inicial`) nunca vale e é Encerrada;
// - **Ativa** = o resto: inclusive a que ainda não começou (`mes_inicial` no
//   futuro) e a que tem `encerrada_em_mes` no futuro (acaba depois do Mês
//   atual; o fim aparece na descrição, "Mensal · Jan/26 a Dez/26").
// Dado ilegível (Mês inválido) conta como Ativa: nada some da lista por defeito.

import { ehMes, somarMeses } from "./ciclo";
import { descricaoDaRepeticao, type RepeticaoConta } from "./contas-manuais";
import { lerDivisao, valoresDasPartes } from "./divisao";
import { TEXTOS_CONTAS, rotuloArquivado, rotuloPartesDaConta } from "./mensagens";

export type SituacaoDaConta = "ativa" | "encerrada";
export type FiltroDeContas = "ativas" | "encerradas" | "todas";

/** O filtro com que a tela abre: o que está valendo. */
export const FILTRO_PADRAO_DE_CONTAS: FiltroDeContas = "ativas";
export const FILTROS_DE_CONTAS: readonly FiltroDeContas[] = ["ativas", "encerradas", "todas"];

/** A Conta como a tabela `contas_manuais` a entrega (a lista lê só estas colunas). */
export type ContaDaLista = {
  id: string;
  nome: string;
  valor_centavos: number;
  tipo_id: string;
  responsavel_id: string | null;
  mes_inicial: string;
  repeticao: string;
  parcela_total: number | null;
  /** A Divisão em frações (`divisao.ts`); nula com um Responsável só. */
  divisao: unknown;
  encerrada_em_mes: string | null;
  created_at: string;
};

export type ResponsavelDaLista = { id: string; nome: string; cor: number; arquivado: boolean };
export type TipoDaLista = { id: string; nome: string; arquivado: boolean };
export type CadastrosDaLista = {
  responsaveis: readonly ResponsavelDaLista[];
  tipos: readonly TipoDaLista[];
};

// --------------------------------------------------------------- situação

const comoRepeticao = (r: string): RepeticaoConta => (r === "parcelas" ? "parcelas" : "mensal");

/**
 * O último Mês em que a Conta vale; `null` = sem fim (Mensal até encerrar).
 * Parcelas: o Mês da última parcela, ou o anterior a `encerrada_em_mes` se
 * ela veio antes.
 */
export function ultimoMesDaConta(
  c: Pick<ContaDaLista, "mes_inicial" | "repeticao" | "parcela_total" | "encerrada_em_mes">,
): string | null {
  const fimDasParcelas =
    comoRepeticao(c.repeticao) === "parcelas" && c.parcela_total !== null && c.parcela_total >= 1 && ehMes(c.mes_inicial)
      ? somarMeses(c.mes_inicial, c.parcela_total - 1)
      : null;
  const fimPorEncerramento =
    c.encerrada_em_mes !== null && ehMes(c.encerrada_em_mes) ? somarMeses(c.encerrada_em_mes, -1) : null;
  if (fimDasParcelas === null) return fimPorEncerramento;
  if (fimPorEncerramento === null) return fimDasParcelas;
  return fimPorEncerramento < fimDasParcelas ? fimPorEncerramento : fimDasParcelas;
}

/** Ativa ou Encerrada no `mesAtual` (ver o cabeçalho do arquivo para os casos limite). */
export function situacaoDaConta(
  c: Pick<ContaDaLista, "mes_inicial" | "repeticao" | "parcela_total" | "encerrada_em_mes">,
  mesAtual: string,
): SituacaoDaConta {
  if (!ehMes(c.mes_inicial) || !ehMes(mesAtual)) return "ativa";
  const ultimo = ultimoMesDaConta(c);
  if (ultimo === null) return "ativa";
  return ultimo < mesAtual || ultimo < c.mes_inicial ? "encerrada" : "ativa";
}

export function rotuloDaSituacao(s: SituacaoDaConta): string {
  return s === "ativa" ? TEXTOS_CONTAS.situacao_ativa : TEXTOS_CONTAS.situacao_encerrada;
}

// ----------------------------------------------------------------- filtro

/** A situação aparece neste filtro? */
export function situacaoNoFiltro(s: SituacaoDaConta, filtro: FiltroDeContas): boolean {
  return filtro === "todas" || (filtro === "ativas" ? s === "ativa" : s === "encerrada");
}

/**
 * O filtro a deixar depois de salvar uma Conta: o atual, se ele mostra a Conta
 * nova; senão o que mostra (uma parcelada que já acabou salva em "Ativas" iria
 * sumir da tela sem explicação).
 */
export function filtroQueMostra(situacao: SituacaoDaConta, atual: FiltroDeContas): FiltroDeContas {
  if (situacaoNoFiltro(situacao, atual)) return atual;
  return situacao === "ativa" ? "ativas" : "encerradas";
}

/** Quantas Contas cada filtro mostra (os números dos botões e o que o leitor de tela ouve). */
export function contagemPorFiltro(
  contas: readonly Pick<ContaDaLista, "mes_inicial" | "repeticao" | "parcela_total" | "encerrada_em_mes">[],
  mesAtual: string,
): Record<FiltroDeContas, number> {
  let ativas = 0;
  for (const c of contas) if (situacaoDaConta(c, mesAtual) === "ativa") ativas++;
  return { ativas, encerradas: contas.length - ativas, todas: contas.length };
}

// ------------------------------------------------------------------ ordem

/**
 * A ordem da lista: as Ativas primeiro, depois as Encerradas; em cada grupo,
 * por Nome (sem distinguir maiúsculas nem acento, "Conta 2" antes de "Conta
 * 10"); empate pelo cadastro mais antigo e, por fim, pelo id. Não muta a lista.
 */
export function ordenarContas<C extends ContaDaLista>(contas: readonly C[], mesAtual: string): C[] {
  const grupo = (c: C) => (situacaoDaConta(c, mesAtual) === "ativa" ? 0 : 1);
  return [...contas].sort(
    (a, b) =>
      grupo(a) - grupo(b) ||
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true }) ||
      (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

// ------------------------------------------------------------------ linha

/** Uma etiqueta de Responsável (`person-tag`); `cor` é nula quando o cadastro não existe mais. */
export type EtiquetaDaConta = {
  /** O texto: o nome, com "(arquivado)" se o cadastro foi arquivado, ou "Removido". */
  texto: string;
  cor: number | null;
  arquivado: boolean;
  removido: boolean;
};

export type LinhaDaLista = {
  id: string;
  nome: string;
  /** "Mensal · desde Jan/26", "6 parcelas · Jul/26 a Dez/26". */
  descricao: string;
  /** "3 partes de R$ 106,00" quando há Divisão; senão nulo. */
  divisao: string | null;
  /** Valor por mês (por parcela, nas parcelas): na Divisão é a soma das partes. */
  valorCentavos: number;
  /** "por parcela" só nas parcelas; o Mensal não precisa. */
  legendaDoValor: string | null;
  /** Uma etiqueta por parte (Divisão) ou uma só (Responsável); vazia se não há como saber. */
  etiquetas: EtiquetaDaConta[];
  tipo: { texto: string; arquivado: boolean; removido: boolean };
  situacao: SituacaoDaConta;
  rotuloDaSituacao: string;
};

function etiquetaDe(responsavelId: string, responsaveis: ReadonlyMap<string, ResponsavelDaLista>): EtiquetaDaConta {
  const r = responsaveis.get(responsavelId);
  if (!r) return { texto: TEXTOS_CONTAS.removido, cor: null, arquivado: false, removido: true };
  return { texto: r.arquivado ? rotuloArquivado(r.nome) : r.nome, cor: r.cor, arquivado: r.arquivado, removido: false };
}

/**
 * A linha da Conta para a tela. Responsável ou Divisão: com Divisão, uma
 * etiqueta por parte, na ordem dela; senão, uma etiqueta do Responsável. Um
 * cadastro arquivado continua com o nome e "(arquivado)" (AD-16: arquivar não
 * apaga das somas); um que sumiu (não deveria, a exclusão exige substituto)
 * aparece como "Removido", sem cor.
 */
export function linhaDaConta(c: ContaDaLista, cadastros: CadastrosDaLista, mesAtual: string): LinhaDaLista {
  const responsaveis = new Map(cadastros.responsaveis.map((r) => [r.id, r]));
  const tipo = cadastros.tipos.find((t) => t.id === c.tipo_id);
  const situacao = situacaoDaConta(c, mesAtual);
  const parcelada = comoRepeticao(c.repeticao) === "parcelas";

  let etiquetas: EtiquetaDaConta[] = [];
  let divisao: string | null = null;
  if (c.divisao !== null && c.divisao !== undefined) {
    const d = lerDivisao(c.divisao);
    if (d !== null) {
      etiquetas = d.partes.map((p) => etiquetaDe(p.responsavel_id, responsaveis));
      const valores = valoresDasPartes(c.valor_centavos, d);
      if (valores.ok) divisao = rotuloPartesDaConta(valores.valor);
    }
  } else if (c.responsavel_id !== null) {
    etiquetas = [etiquetaDe(c.responsavel_id, responsaveis)];
  }

  return {
    id: c.id,
    nome: c.nome,
    descricao: descricaoDaRepeticao({
      repeticao: comoRepeticao(c.repeticao),
      parcela_total: c.parcela_total,
      mes_inicial: c.mes_inicial,
      encerrada_em_mes: c.encerrada_em_mes,
    }),
    divisao,
    valorCentavos: c.valor_centavos,
    legendaDoValor: parcelada ? TEXTOS_CONTAS.por_parcela : null,
    etiquetas,
    tipo: tipo
      ? { texto: tipo.arquivado ? rotuloArquivado(tipo.nome) : tipo.nome, arquivado: tipo.arquivado, removido: false }
      : { texto: TEXTOS_CONTAS.removido, arquivado: false, removido: true },
    situacao,
    rotuloDaSituacao: rotuloDaSituacao(situacao),
  };
}

/** A lista que a tela desenha: filtrada, ordenada e com as linhas prontas. */
export function linhasDaLista(
  contas: readonly ContaDaLista[],
  filtro: FiltroDeContas,
  cadastros: CadastrosDaLista,
  mesAtual: string,
): LinhaDaLista[] {
  return ordenarContas(contas, mesAtual)
    .filter((c) => situacaoNoFiltro(situacaoDaConta(c, mesAtual), filtro))
    .map((c) => linhaDaConta(c, cadastros, mesAtual));
}
