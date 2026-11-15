// Regras do Painel do Mês (História 2.4, FR-21, FR-22, UX-DR10): o Mês
// atual, os Meses da lista do seletor, a ordenação da grade, a
// distribuição por Responsável da barra e o nome acessível da linha. Puro:
// "hoje" entra como parâmetro (a tela lê o relógio).

import { mesDaData, somarMeses } from "./ciclo";
import { instanteEmMicros } from "./datas";
import { ordenarDuvidasPrimeiro } from "./conferencia";
import { formatarDinheiro } from "./dinheiro";
import { linhasDaFatura, unidadesDoMes } from "./divisao";
import {
  ROTULO_PREVISTO,
  TEXTOS_CONFERENCIA,
  TEXTOS_DIVISAO,
  rotuloAjusteDe,
  rotuloLiquido,
  rotuloParcelaFalada,
  rotuloParteDe,
} from "./mensagens";

/** O que a grade usa de um Lançamento (as colunas da tabela `lancamentos`). */
export type LancamentoGrade = {
  id: string;
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  valor_centavos: number;
  tipo_id: string | null;
  responsavel_id: string | null;
  status_id: string | null;
  lancado_por: LancadoPor;
  ordem_fatura: number | null;
  /** Conferência por cartão e marca "verificar" (História 2.5). */
  final_cartao: string | null;
  fatura_id: string | null;
  /** A leitura ficou incerta: só põe a linha primeiro no filtro "Verificar". */
  duvida_extracao: boolean;
  /** Ajuste de centavos (História 2.8): a mãe (parcela) dele. */
  ajuste_de_id?: string | null;
  /** Divisão (História 3.8): a mãe da parte; nulo na linha comum e na mãe. */
  dividido_de_id?: string | null;
  /** A Divisão da mãe (`jsonb`); nulo na linha comum e na parte. */
  divisao?: unknown;
  /** Desempate das linhas sem `ordem_fatura` (o histórico da planilha, 3.10): a ordem em que a aba foi gravada. */
  created_at?: string | null;
};

export type LancadoPor = "fatura" | "sistema" | "manual" | "historico";

/**
 * Mês atual: o mês do calendário de hoje em São Paulo (decisão do Rafael,
 * 08/11/2026). `hoje` é `AAAA-MM-DD`, de `hojeEmSaoPaulo(agora)`.
 */
export function mesAtual(hoje: string): string {
  return mesDaData(hoje);
}

/**
 * Os Lançamentos que o Painel mostra de um Mês: os desse Mês, não excluídos
 * (mães e Ajustes). É a regra única: o Revisar mostra um subconjunto disto.
 */
export function linhasDoMes<L extends { mes: string; excluido_em: string | null }>(linhas: readonly L[], mes: string): L[] {
  return linhas.filter((l) => l.mes === mes && l.excluido_em === null);
}

/**
 * Meses da lista do seletor, do mais antigo para o mais novo: do Mês mais
 * antigo com Fatura (ou do Mês atual, sem Fatura) até o Mês atual + 1. O
 * Mês aberto entra mesmo fora desse intervalo (as setas andam sem limite).
 */
export function mesesDaLista(mesesComFatura: readonly string[], atual: string, aberto: string): string[] {
  let inicio = atual;
  for (const m of mesesComFatura) if (m < inicio) inicio = m;
  const fim = somarMeses(atual, 1);
  const meses: string[] = [];
  for (let m = inicio; m <= fim; m = somarMeses(m, 1)) meses.push(m);
  if (!meses.includes(aberto)) meses.push(aberto);
  return meses.sort();
}

/** Colunas que ordenam a grade; `fatura` é a ordem padrão (a do PDF). */
export type ColunaOrdem = "fatura" | "nome" | "parcela" | "valor" | "tipo" | "responsavel" | "lancado_por" | "status";

export type SentidoOrdem = "crescente" | "decrescente";

export type Ordem = { coluna: ColunaOrdem; sentido: SentidoOrdem };

export const ORDEM_PADRAO: Ordem = { coluna: "fatura", sentido: "crescente" };

/** Toque num cabeçalho: ordena por ele (crescente); de novo, inverte. */
export function alternarOrdem(atual: Ordem, coluna: ColunaOrdem): Ordem {
  if (atual.coluna !== coluna) return { coluna, sentido: "crescente" };
  return { coluna, sentido: atual.sentido === "crescente" ? "decrescente" : "crescente" };
}

/** Nomes dos cadastros por id, para ordenar pelo que a grade mostra. */
export type NomesCadastros = {
  tipos: ReadonlyMap<string, string>;
  responsaveis: ReadonlyMap<string, string>;
  status: ReadonlyMap<string, string>;
  lancadoPor: Readonly<Record<LancadoPor, string>>;
};

/** O nome que a grade mostra primeiro: o Apelido, ou o Nome. */
export function nomeExibido(l: Pick<LancamentoGrade, "nome" | "apelido">): string {
  return l.apelido?.trim() ? l.apelido : l.nome;
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

/** Chave de ordenação: `null` é vazio e vai sempre para o fim. */
function chave(l: LancamentoGrade, coluna: ColunaOrdem, nomes: NomesCadastros): string | number | null {
  const doCadastro = (mapa: ReadonlyMap<string, string>, id: string | null) =>
    id === null ? null : (mapa.get(id) ?? null);
  switch (coluna) {
    case "fatura":
      return l.ordem_fatura;
    case "nome":
      return nomeExibido(l);
    case "parcela":
      return l.parcela_n === null || l.parcela_total === null ? null : l.parcela_n * 10_000 + l.parcela_total;
    case "valor":
      return l.valor_centavos;
    case "tipo":
      return doCadastro(nomes.tipos, l.tipo_id);
    case "responsavel":
      return doCadastro(nomes.responsaveis, l.responsavel_id);
    case "status":
      return doCadastro(nomes.status, l.status_id);
    case "lancado_por":
      return nomes.lancadoPor[l.lancado_por];
  }
}

function compararChaves(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return compararTexto(String(a), String(b));
}

/**
 * A grade ordenada por uma coluna. Vazios (sem Parcela, sem Tipo, sem
 * ordem da fatura…) ficam no fim nos dois sentidos; empates seguem a ordem
 * da fatura. Não muda a lista recebida.
 */
export function ordenarLancamentos<L extends LancamentoGrade>(
  linhas: readonly L[],
  ordem: Ordem,
  nomes: NomesCadastros,
): L[] {
  const sinal = ordem.sentido === "crescente" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const ca = chave(a, ordem.coluna, nomes);
    const cb = chave(b, ordem.coluna, nomes);
    if (ca === null || cb === null) {
      if (ca !== cb) return ca === null ? 1 : -1;
    } else {
      const c = compararChaves(ca, cb) * sinal;
      if (c !== 0) return c;
    }
    return compararPelaFatura(a, b);
  });
}

/** A ordem da fatura (a padrão da grade): `ordem_fatura` (vazio no fim) e, no empate, a de criação. A mensagem usa a mesma. */
export function compararPelaFatura(
  a: Pick<LancamentoGrade, "ordem_fatura" | "created_at">,
  b: Pick<LancamentoGrade, "ordem_fatura" | "created_at">,
): number {
  const ordem = (l: Pick<LancamentoGrade, "ordem_fatura">) => l.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  return ordem(a) - ordem(b) || ordemDeCriacao(a, b);
}

/** Sem `ordem_fatura` nas duas (histórico da planilha), vale a ordem de criação; sem `created_at`, empata. */
function ordemDeCriacao(a: Pick<LancamentoGrade, "created_at">, b: Pick<LancamentoGrade, "created_at">): number {
  if (!a.created_at || !b.created_at) return 0;
  const d = instanteEmMicros(a.created_at) - instanteEmMicros(b.created_at);
  return Number.isNaN(d) ? 0 : d;
}

/** É a ordem padrão (a da fatura, crescente)? */
export function ehOrdemPadrao(ordem: Ordem): boolean {
  return ordem.coluna === ORDEM_PADRAO.coluna && ordem.sentido === ORDEM_PADRAO.sentido;
}

/**
 * A ordem da grade. Com o filtro "Verificar" e a ordem padrão, as linhas
 * de `duvida_extracao` vêm primeiro e depois a ordem da fatura; com uma
 * coluna ordenada, vale a coluna. Recebe só as mães (`separarAjustes`): os
 * Ajustes vão logo abaixo delas (`agruparComAjustes`).
 */
export function ordenarGrade<L extends LancamentoGrade>(
  linhas: readonly L[],
  ordem: Ordem,
  nomes: NomesCadastros,
  verificando: boolean,
): L[] {
  return verificando && ehOrdemPadrao(ordem) ? ordenarDuvidasPrimeiro(linhas) : ordenarLancamentos(linhas, ordem, nomes);
}

/**
 * O hero de um Mês sem Fatura mas com histórico da planilha (História 3.10):
 * a soma das linhas `historico` (as filhas valem no lugar da mãe dividida) e
 * quantas são (a mãe dividida conta uma vez). Sem histórico → null.
 */
export function resumoDoHistorico(
  doMes: readonly (Pick<LancamentoGrade, "lancado_por" | "valor_centavos" | "dividido_de_id" | "divisao">)[],
): { totalCentavos: number; quantidade: number } | null {
  const historico = doMes.filter((l) => l.lancado_por === "historico");
  if (historico.length === 0) return null;
  return {
    totalCentavos: unidadesDoMes(historico).reduce((soma, l) => soma + l.valor_centavos, 0),
    quantidade: linhasDaFatura(historico).length,
  };
}

/** Soma dos valores (créditos negativos). */
export function somarValores(linhas: readonly Pick<LancamentoGrade, "valor_centavos">[]): number {
  return linhas.reduce((soma, l) => soma + l.valor_centavos, 0);
}

export type SegmentoDistribuicao = { responsavelId: string; centavos: number };

export type DistribuicaoPorResponsavel = {
  /** Um por Responsável com soma líquida > 0, na ordem pedida. */
  segmentos: SegmentoDistribuicao[];
  /** Soma líquida dos Lançamentos sem Responsável (0 se não for positiva). */
  semResponsavelCentavos: number;
};

/**
 * Barra por Responsável: a soma líquida (créditos descontados) de cada um.
 * Só entram somas positivas; "sem responsável" fica à parte. `ordem` são
 * os ids na ordem dos Responsáveis (ids fora dela vão no fim).
 */
export function distribuicaoPorResponsavel(
  linhas: readonly Pick<LancamentoGrade, "responsavel_id" | "valor_centavos">[],
  ordem: readonly string[] = [],
): DistribuicaoPorResponsavel {
  const somas = new Map<string, number>();
  let sem = 0;
  for (const l of linhas) {
    if (l.responsavel_id === null) sem += l.valor_centavos;
    else somas.set(l.responsavel_id, (somas.get(l.responsavel_id) ?? 0) + l.valor_centavos);
  }
  const posicao = (id: string) => {
    const i = ordem.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const segmentos = [...somas]
    .filter(([, centavos]) => centavos > 0)
    .map(([responsavelId, centavos]) => ({ responsavelId, centavos }))
    .sort((a, b) => posicao(a.responsavelId) - posicao(b.responsavelId));
  return { segmentos, semResponsavelCentavos: sem > 0 ? sem : 0 };
}

/**
 * Nome acessível da linha (VoiceOver): "Nome, Valor, Parcela, Responsável,
 * Status" e, na linha marcada, "verificar este lançamento" no fim. Partes
 * vazias (à vista, sem Status) ficam de fora. Num Ajuste (`ajuste`, o Nome
 * da mãe e o líquido dela): "Ajuste de NOME, - R$ 0,08, líquido R$ 1.140,66,
 * Responsável, Status".
 */
export function rotuloLinhaAcessivel(partes: {
  nome: string;
  valorCentavos: number;
  parcelaN: number | null;
  parcelaTotal: number | null;
  responsavel: string;
  status: string | null;
  verificar?: boolean;
  /** Previsto (História 3.5): "Nome, previsto, Valor, …". */
  previsto?: boolean;
  ajuste?: { nomeMae: string; liquidoCentavos: number };
  /** Parte de uma Divisão (História 3.8): "Parte de NOME, …". */
  parteDe?: string;
  /** Mãe dividida (cabeçalho): "NOME, dividido, …". */
  dividido?: boolean;
}): string {
  const ajuste = partes.ajuste;
  return [
    ajuste ? rotuloAjusteDe(ajuste.nomeMae) : partes.parteDe !== undefined ? rotuloParteDe(partes.parteDe) : partes.nome,
    partes.dividido ? TEXTOS_DIVISAO.dividido.toLowerCase() : "",
    partes.previsto ? ROTULO_PREVISTO.toLowerCase() : "",
    formatarDinheiro(partes.valorCentavos),
    ajuste ? rotuloLiquido(ajuste.liquidoCentavos) : rotuloParcelaFalada(partes.parcelaN, partes.parcelaTotal),
    partes.responsavel,
    partes.status ?? "",
    partes.verificar ? TEXTOS_CONFERENCIA.verificar_lancamento : "",
  ]
    .filter((p) => p !== "")
    .join(", ");
}
