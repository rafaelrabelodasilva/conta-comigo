// Barra de filtros da grade (História 2.6, FR-21, UX-DR9): o estado dos
// filtros, quem passa por eles, a lista de valores de cada coluna com a
// contagem e o texto da pílula. Nada é gravado: o estado vive na tela.
//
// - Busca: Nome ou Apelido contendo o texto, sem diferença de maiúsculas e
//   acentos (`normalizarNome` nos dois lados); texto em branco não filtra.
// - Colunas: OU dentro da coluna, E entre colunas, E com a busca e com
//   "Verificar" (que só vale com a Conferência do Mês, isto é, com Fatura).
// - Contagem de um valor: quantos Lançamentos do Mês teriam aquele valor com
//   a busca, "Verificar" e as outras colunas aplicadas (a própria não entra).

import { precisaVerificar, type Conferencia } from "./conferencia";
import { normalizarNome } from "./importacao-fatura";
import {
  COLUNAS_FILTRO,
  ROTULOS_LANCADO_POR,
  TEXTOS_FILTROS,
  TEXTOS_PAINEL,
  rotuloCartaoFinal,
  rotuloPilulaFiltro,
} from "./mensagens";
import type { LancadoPor, LancamentoGrade } from "./painel";
import { ordenarParaConfiguracoes as ordenarResponsaveis, type Responsavel } from "./responsaveis";
import { ordenarParaConfiguracoes as ordenarStatus, type Status } from "./status";
import { ordenarParaConfiguracoes as ordenarTipos, type Tipo } from "./tipos";

/** As colunas que filtram, na ordem da barra. */
export type ColunaFiltro = keyof typeof COLUNAS_FILTRO;

export const COLUNAS_DA_BARRA: readonly ColunaFiltro[] = [
  "responsavel",
  "tipo",
  "status",
  "lancado_por",
  "parcela",
  "cartao",
];

/** Os valores da coluna Parcela. */
export type ValorParcela = "a_vista" | "parcelado" | "ultima_parcela";

/**
 * Um valor escolhido numa coluna: o id do cadastro, o `lancado_por`, o
 * `ValorParcela` ou o final do cartão; `null` é "Sem responsável", "Sem
 * tipo", "Sem status" ou "Sem cartão".
 */
export type ValorFiltro = string | null;

export type FiltrosGrade = {
  busca: string;
  verificar: boolean;
  /** Valores escolhidos por coluna; vazio é sem filtro naquela coluna. */
  colunas: Readonly<Record<ColunaFiltro, readonly ValorFiltro[]>>;
};

export const FILTROS_VAZIOS: FiltrosGrade = {
  busca: "",
  verificar: false,
  colunas: { responsavel: [], tipo: [], status: [], lancado_por: [], parcela: [], cartao: [] },
};

/** O que os filtros usam de um Lançamento. */
export type LancamentoFiltro = Pick<
  LancamentoGrade,
  | "nome"
  | "apelido"
  | "responsavel_id"
  | "tipo_id"
  | "status_id"
  | "lancado_por"
  | "parcela_n"
  | "parcela_total"
  | "final_cartao"
  | "fatura_id"
  | "valor_centavos"
>;

/**
 * Os valores de um Lançamento numa coluna. Na Parcela pode ser mais de um:
 * a última parcela de um parcelado é "Parcelado" e "Última parcela".
 */
export function valoresDoLancamento(l: LancamentoFiltro, coluna: ColunaFiltro): ValorFiltro[] {
  switch (coluna) {
    case "responsavel":
      return [l.responsavel_id];
    case "tipo":
      return [l.tipo_id];
    case "status":
      return [l.status_id];
    case "lancado_por":
      return [l.lancado_por];
    case "parcela": {
      const { parcela_n: n, parcela_total: total } = l;
      // Sem Parcela ou "1/1": à vista.
      if (n === null || total === null || total <= 1) return ["a_vista"];
      return n === total ? ["parcelado", "ultima_parcela"] : ["parcelado"];
    }
    case "cartao":
      return [l.final_cartao?.trim() ? l.final_cartao.trim() : null];
  }
}

/** O Lançamento passa pela busca? Texto em branco não filtra. */
export function passaNaBusca(l: Pick<LancamentoFiltro, "nome" | "apelido">, busca: string): boolean {
  const termo = normalizarNome(busca);
  if (termo === "") return true;
  return normalizarNome(l.nome).includes(termo) || (l.apelido !== null && normalizarNome(l.apelido).includes(termo));
}

function passaNaColuna(l: LancamentoFiltro, coluna: ColunaFiltro, escolhidos: readonly ValorFiltro[]): boolean {
  if (escolhidos.length === 0) return true;
  return valoresDoLancamento(l, coluna).some((v) => escolhidos.includes(v));
}

/**
 * As linhas que passam pelos filtros, na ordem recebida. "Verificar" só vale
 * com a Conferência (sem Fatura, fica guardado e não filtra). `exceto` deixa
 * uma coluna de fora (a contagem do popover dela).
 */
export function aplicarFiltros<L extends LancamentoFiltro>(
  linhas: readonly L[],
  filtros: FiltrosGrade,
  conferencia: Conferencia | null,
  exceto?: ColunaFiltro,
): L[] {
  const verificando = filtros.verificar && conferencia !== null;
  return linhas.filter(
    (l) =>
      (!verificando || precisaVerificar(l, conferencia)) &&
      passaNaBusca(l, filtros.busca) &&
      COLUNAS_DA_BARRA.every((c) => c === exceto || passaNaColuna(l, c, filtros.colunas[c])),
  );
}

/** Os cadastros que dão os valores de Responsável, Tipo e Status. */
export type CadastrosFiltro = {
  responsaveis: readonly Responsavel[];
  tipos: readonly Tipo[];
  status: readonly Status[];
};

/** Uma linha do popover. */
export type OpcaoFiltro = {
  valor: ValorFiltro;
  /** O texto da linha do popover ("Cartão final 8673"). */
  rotulo: string;
  /** O texto na pílula ativa ("8673"). */
  curto: string;
  contagem: number;
};

type Cadastro = { id: string; nome: string; arquivado: boolean };

/**
 * Valores de uma coluna de cadastro: os não arquivados na ordem do
 * cadastro; um arquivado só se o Mês o usa ou se já está escolhido; um id
 * escolhido que sumiu do cadastro continua (para poder ser desmarcado); e o
 * "Sem …" no fim.
 */
function valoresDoCadastro(
  ordenados: readonly Cadastro[],
  usados: ReadonlySet<ValorFiltro>,
  escolhidos: readonly ValorFiltro[],
  semRotulo: string,
): { valor: ValorFiltro; rotulo: string }[] {
  const lista: { valor: ValorFiltro; rotulo: string }[] = ordenados
    .filter((c) => !c.arquivado || usados.has(c.id) || escolhidos.includes(c.id))
    .map((c) => ({ valor: c.id, rotulo: c.nome }));
  const conhecidos = new Set(ordenados.map((c) => c.id));
  for (const v of escolhidos) {
    if (v !== null && !conhecidos.has(v)) lista.push({ valor: v, rotulo: TEXTOS_PAINEL.vazio });
  }
  lista.push({ valor: null, rotulo: semRotulo });
  return lista;
}

const VALORES_PARCELA: readonly { valor: ValorParcela; rotulo: string }[] = [
  { valor: "a_vista", rotulo: TEXTOS_FILTROS.a_vista },
  { valor: "parcelado", rotulo: TEXTOS_FILTROS.parcelado },
  { valor: "ultima_parcela", rotulo: TEXTOS_FILTROS.ultima_parcela },
];

const VALORES_LANCADO_POR: readonly LancadoPor[] = ["fatura", "sistema", "manual", "historico"];

/**
 * A lista do popover de uma coluna, com a contagem de cada valor. `linhas`
 * são os Lançamentos do Mês aberto (sem excluídos). `extras` são os valores
 * marcados no rascunho do popover aberto (História 2.7): como os já
 * escolhidos, continuam na lista mesmo que tenham sumido do Mês (uma
 * mudança em tempo real), com contagem 0.
 */
export function valoresDaColuna(
  coluna: ColunaFiltro,
  linhas: readonly LancamentoFiltro[],
  filtros: FiltrosGrade,
  conferencia: Conferencia | null,
  cadastros: CadastrosFiltro,
  extras: readonly ValorFiltro[] = [],
): OpcaoFiltro[] {
  const escolhidos = [...new Set([...filtros.colunas[coluna], ...extras])];
  const usados = new Set(linhas.flatMap((l) => valoresDoLancamento(l, coluna)));
  let lista: { valor: ValorFiltro; rotulo: string; curto?: string }[];
  switch (coluna) {
    case "responsavel":
      lista = valoresDoCadastro(ordenarResponsaveis(cadastros.responsaveis), usados, escolhidos, TEXTOS_PAINEL.sem_responsavel);
      break;
    case "tipo":
      lista = valoresDoCadastro(ordenarTipos(cadastros.tipos), usados, escolhidos, TEXTOS_FILTROS.sem_tipo);
      break;
    case "status":
      lista = valoresDoCadastro(ordenarStatus(cadastros.status), usados, escolhidos, TEXTOS_FILTROS.sem_status);
      break;
    case "lancado_por":
      lista = VALORES_LANCADO_POR.map((v) => ({ valor: v, rotulo: ROTULOS_LANCADO_POR[v] }));
      break;
    case "parcela":
      lista = [...VALORES_PARCELA];
      break;
    case "cartao": {
      // Os finais dos Lançamentos do Mês (não de `fatura_cartoes`) e os já escolhidos.
      const finais = new Set<string>();
      for (const v of [...usados, ...escolhidos]) if (v !== null) finais.add(v);
      lista = [...finais].sort().map((f) => ({ valor: f, rotulo: rotuloCartaoFinal(f), curto: f }));
      if (usados.has(null) || escolhidos.includes(null)) lista.push({ valor: null, rotulo: TEXTOS_FILTROS.sem_cartao });
      break;
    }
  }
  const base = aplicarFiltros(linhas, filtros, conferencia, coluna);
  return lista.map((o) => ({
    valor: o.valor,
    rotulo: o.rotulo,
    curto: o.curto ?? o.rotulo,
    contagem: base.filter((l) => valoresDoLancamento(l, coluna).includes(o.valor)).length,
  }));
}

/** Texto da pílula: "Responsável" ou "Responsável: Casal, Rangel" (valores na ordem da lista). */
export function rotuloDaPilula(coluna: ColunaFiltro, filtros: FiltrosGrade, opcoes: readonly OpcaoFiltro[]): string {
  const escolhidos = filtros.colunas[coluna];
  return rotuloPilulaFiltro(
    COLUNAS_FILTRO[coluna],
    opcoes.filter((o) => escolhidos.includes(o.valor)).map((o) => o.curto),
  );
}

/** Troca os valores escolhidos de uma coluna. */
export function definirColuna(filtros: FiltrosGrade, coluna: ColunaFiltro, valores: readonly ValorFiltro[]): FiltrosGrade {
  return { ...filtros, colunas: { ...filtros.colunas, [coluna]: [...valores] } };
}

/**
 * Toque na barra do hero ou na `person-tag`: se o filtro já é exatamente
 * aquele Responsável, limpa a coluna; senão, a coluna passa a ser só ele.
 */
export function alternarResponsavelUnico(filtros: FiltrosGrade, responsavelId: ValorFiltro): FiltrosGrade {
  const atual = filtros.colunas.responsavel;
  const soEle = atual.length === 1 && atual[0] === responsavelId;
  return definirColuna(filtros, "responsavel", soEle ? [] : [responsavelId]);
}

/** Algum filtro de coluna ou a busca está ativo ("Verificar" não conta)? */
function temFiltroAlemDeVerificar(filtros: FiltrosGrade): boolean {
  return filtros.busca.trim() !== "" || COLUNAS_DA_BARRA.some((c) => filtros.colunas[c].length > 0);
}

/** Há busca, filtro de coluna ou "Verificar"? */
export function temFiltro(filtros: FiltrosGrade): boolean {
  return filtros.verificar || temFiltroAlemDeVerificar(filtros);
}

/** Quantos filtros ativos o popover "Mais" guarda (as colunas dele e "Verificar", se estiver lá). */
export function filtrosAtivosEm(filtros: FiltrosGrade, colunas: readonly ColunaFiltro[], comVerificar: boolean): number {
  const n = colunas.filter((c) => filtros.colunas[c].length > 0).length;
  return n + (comVerificar && filtros.verificar ? 1 : 0);
}

/**
 * Por que a grade está vazia, quando é pelos filtros: "filtros" (com busca
 * ou coluna e o Mês tem Lançamentos) ou "verificar" (só "Verificar" deixa a
 * grade vazia). `null`: valem os vazios da 2.4 (sem Fatura, Mês vazio).
 * `filtros.verificar` aqui é o efetivo (só com Fatura).
 */
export function motivoDoVazio(filtros: FiltrosGrade, mesTemLancamentos: boolean): "filtros" | "verificar" | null {
  if (mesTemLancamentos && temFiltroAlemDeVerificar(filtros)) return "filtros";
  if (filtros.verificar) return "verificar";
  return null;
}
