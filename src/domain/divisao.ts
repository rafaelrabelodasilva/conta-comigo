// Dividir um Lançamento (História 3.8, FR-15, UX-DR15, AD-2, AD-8). Uma
// linha-mãe guarda a `divisao` em frações; as filhas (`dividido_de_id`) levam
// os valores que o núcleo calcula com `dividirEmPartes`. Puro: sem relógio,
// rede ou banco; a RPC `dividir_lancamento` só grava o que sai daqui.
//
// - Formato: `{ modo, partes: [{ responsavel_id, numerador, denominador,
//   filha_id? }], regra_chave?, responsavel_antes? }`. Cada parte é fração de
//   inteiros e a soma é 1 exata. "Por valor" guarda `valor / total`, então o
//   mesmo Valor dá os mesmos centavos. `modo` só diz como a janela reabre.
// - Quem entra em soma (regra única): `unidadesDoMes` tira as mães divididas
//   (grade, rodapé, barra por Responsável, filtros, seleção); `linhasDaFatura`
//   tira as filhas (Conferência, "Total a pagar", "verificar", resumos).
// - Classificada: `tipo_id` e (`responsavel_id` ou `divisao`). A mãe dividida
//   tem Responsável nulo.

import { dividirEmPartes, lerReais, type Fracao } from "./dinheiro";
import type { Resultado } from "./resultado";

export const MIN_PARTES = 2;
export const MAX_PARTES = 10;
/** Maior Valor que a janela divide (R$ 900.000,00): `valor × numerador` fica nos inteiros seguros. */
export const VALOR_MAXIMO_CENTAVOS = 90_000_000;
/** Maior numerador ou denominador digitado numa fração. */
const MAIOR_TERMO = 1_000_000;

export type ModoDivisao = "valor" | "proporcao";

export type ParteDaDivisao = {
  responsavel_id: string;
  numerador: number;
  denominador: number;
  /** A filha desta parte (só na mãe, gravada pela RPC). */
  filha_id?: string;
};

export type Divisao = {
  modo: ModoDivisao;
  partes: ParteDaDivisao[];
  /** A Divisão veio da Regra desta chave (a janela mostra "Divisão aplicada pela Regra de NOME"). */
  regra_chave?: string;
  /** O Responsável da mãe antes de ser dividida à mão (o "Desfazer divisão" o devolve). */
  responsavel_antes?: string | null;
};

// ---------------------------------------------------------------- leitura

const ehInteiroPositivo = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const ehTexto = (v: unknown): v is string => typeof v === "string" && v !== "";

/** Lê o `jsonb` do banco; `null` quando não é uma Divisão válida (2 a 10 partes). */
export function lerDivisao(dados: unknown): Divisao | null {
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (d.modo !== "valor" && d.modo !== "proporcao") return null;
  if (!Array.isArray(d.partes) || d.partes.length < MIN_PARTES || d.partes.length > MAX_PARTES) return null;
  const partes: ParteDaDivisao[] = [];
  for (const p of d.partes as unknown[]) {
    if (typeof p !== "object" || p === null) return null;
    const { responsavel_id, numerador, denominador, filha_id } = p as Record<string, unknown>;
    if (!ehTexto(responsavel_id) || !ehInteiroPositivo(numerador) || !ehInteiroPositivo(denominador)) return null;
    partes.push({ responsavel_id, numerador, denominador, ...(ehTexto(filha_id) ? { filha_id } : {}) });
  }
  const divisao: Divisao = { modo: d.modo, partes };
  if (ehTexto(d.regra_chave)) divisao.regra_chave = d.regra_chave;
  if (d.responsavel_antes === null || ehTexto(d.responsavel_antes)) divisao.responsavel_antes = d.responsavel_antes;
  return divisao;
}

/** As frações da Divisão, na ordem das partes. */
export function fracoesDaDivisao(d: Divisao): Fracao[] {
  return d.partes.map((p) => ({ numerador: p.numerador, denominador: p.denominador }));
}

/** O que o previsto, a herança e a Regra copiam: as partes sem `filha_id` e sem o Responsável de antes. */
export function copiarDivisao(d: Divisao): Divisao {
  const copia: Divisao = {
    modo: d.modo,
    partes: d.partes.map((p) => ({ responsavel_id: p.responsavel_id, numerador: p.numerador, denominador: p.denominador })),
  };
  if (d.regra_chave !== undefined) copia.regra_chave = d.regra_chave;
  return copia;
}

/** As duas dividem do mesmo jeito (Responsáveis e frações, na ordem)? */
export function mesmaDivisao(a: Divisao | null, b: Divisao | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.partes.length === b.partes.length &&
    a.partes.every(
      (p, i) =>
        p.responsavel_id === b.partes[i].responsavel_id &&
        p.numerador === b.partes[i].numerador &&
        p.denominador === b.partes[i].denominador,
    )
  );
}

/** Todos os Responsáveis da Divisão estão ativos? (Um arquivado ou inexistente a invalida.) */
export function divisaoComResponsaveisAtivos(d: Divisao, ativos: ReadonlySet<string>): boolean {
  return d.partes.every((p) => ativos.has(p.responsavel_id));
}

/** Os valores de cada parte (a soma é sempre o Valor, inclusive negativo) ou o erro do núcleo. */
export function valoresDasPartes(valorCentavos: number, d: Divisao): Resultado<number[]> {
  if (!Number.isSafeInteger(valorCentavos) || Math.abs(valorCentavos) > VALOR_MAXIMO_CENTAVOS) {
    return { ok: false, erro: { codigo: "divisao.valor_grande" } };
  }
  return dividirEmPartes(valorCentavos, fracoesDaDivisao(d));
}

// ---------------------------------------------- quem é mãe, filha e unidade

type ComParentesco = { dividido_de_id?: string | null; divisao?: unknown };

/** É uma parte (filha) de uma mãe dividida? */
export function ehFilha(l: Pick<ComParentesco, "dividido_de_id">): boolean {
  return (l.dividido_de_id ?? null) !== null;
}

/** É uma mãe dividida (tem `divisao` e não é filha)? */
export function ehMaeDividida(l: ComParentesco): boolean {
  return !ehFilha(l) && (l.divisao ?? null) !== null;
}

/** As linhas que entram em soma, filtro, contagem e seleção: tudo menos as mães divididas. */
export function unidadesDoMes<L extends ComParentesco>(linhas: readonly L[]): L[] {
  return linhas.filter((l) => !ehMaeDividida(l));
}

/** As linhas da Fatura (Conferência, "Total a pagar", resumos): tudo menos as filhas. */
export function linhasDaFatura<L extends ComParentesco>(linhas: readonly L[]): L[] {
  return linhas.filter((l) => !ehFilha(l));
}

/** Responsável e Tipo (ou Divisão) completos: a linha está classificada e fora da fila. */
export function estaClassificada(l: {
  responsavel_id: string | null;
  tipo_id: string | null;
  divisao?: unknown;
}): boolean {
  return l.tipo_id !== null && (l.responsavel_id !== null || (l.divisao ?? null) !== null);
}

/** As filhas de cada mãe (pelo id dela), na ordem das partes da `divisao`; filha sem mãe na lista não entra. */
export function filhasPorMae<L extends { id: string; dividido_de_id?: string | null; excluido_em?: string | null; divisao?: unknown }>(
  linhas: readonly L[],
): Map<string, L[]> {
  const maes = new Map(linhas.filter(ehMaeDividida).map((l) => [l.id, l]));
  const porMae = new Map<string, L[]>();
  for (const l of linhas) {
    const mae = l.dividido_de_id ?? null;
    if (mae === null || !maes.has(mae) || (l.excluido_em ?? null) !== null) continue;
    const lista = porMae.get(mae) ?? [];
    lista.push(l);
    porMae.set(mae, lista);
  }
  for (const [id, lista] of porMae) {
    const partes = lerDivisao(maes.get(id)?.divisao)?.partes ?? [];
    const posicao = (f: L) => {
      const i = partes.findIndex((p) => p.filha_id === f.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    lista.sort((a, b) => posicao(a) - posicao(b) || (a.id < b.id ? -1 : 1));
  }
  return porMae;
}

/** A mãe dividida e suas filhas na grade: o cabeçalho (a mãe), depois as partes visíveis. */
export type PapelNaGrade = "cabecalho" | "parte";

/**
 * Põe cada mãe dividida como cabeçalho logo antes da primeira filha visível
 * (na ordem recebida) e junta as filhas visíveis dela embaixo, na ordem das
 * partes. A mãe só aparece se alguma filha passou pelos filtros. Filha cuja
 * mãe não está em `maesPorId` fica como linha comum. `entradas` são as linhas
 * já ordenadas (e com os Ajustes agrupados).
 */
export function agruparPartes<L extends { id: string; dividido_de_id?: string | null; divisao?: unknown; excluido_em?: string | null }>(
  entradas: readonly { linha: L; mae: L | null }[],
  maesPorId: ReadonlyMap<string, L>,
): { linha: L; mae: L | null; papel?: PapelNaGrade }[] {
  const visiveis = filhasPorMae(
    [...maesPorId.values(), ...entradas.map((e) => e.linha).filter((l) => ehFilha(l))],
  );
  const emitidas = new Set<string>();
  const saida: { linha: L; mae: L | null; papel?: PapelNaGrade }[] = [];
  for (const e of entradas) {
    const maeId = e.linha.dividido_de_id ?? null;
    const mae = maeId === null ? undefined : maesPorId.get(maeId);
    if (maeId === null || mae === undefined) {
      saida.push(e);
      continue;
    }
    if (emitidas.has(maeId)) continue;
    emitidas.add(maeId);
    saida.push({ linha: mae, mae: null, papel: "cabecalho" });
    for (const f of visiveis.get(maeId) ?? []) saida.push({ linha: f, mae: null, papel: "parte" });
  }
  return saida;
}

/** Por que a linha não pode ser dividida (chave de `TEXTOS_DIVISAO`), ou `null` se pode. */
export function motivoParaNaoDividir(
  l: { valor_centavos: number; tipo_id: string | null; dividido_de_id?: string | null; ajuste_de_id?: string | null; excluido_em?: string | null },
  temAjuste: boolean,
): "indisponivel_ajuste_proprio" | "indisponivel_ajuste" | "indisponivel_tipo" | "indisponivel_zero" | "indisponivel_grande" | null {
  if (ehFilha(l) || (l.ajuste_de_id ?? null) !== null) return "indisponivel_ajuste_proprio";
  if (temAjuste) return "indisponivel_ajuste";
  if (l.valor_centavos === 0) return "indisponivel_zero";
  if (Math.abs(l.valor_centavos) > VALOR_MAXIMO_CENTAVOS) return "indisponivel_grande";
  if (l.tipo_id === null) return "indisponivel_tipo";
  return null;
}

// ------------------------------------------------------------- a janela

/** Uma linha da janela "Dividir": o que se digita. */
export type ParteRascunho = {
  responsavel_id: string | null;
  /** Fração ("2/3", "50%") no modo proporção; valor em reais ("310,67") no modo valor. */
  texto: string;
  status_id: string | null;
  /** A filha que esta linha já tem (modo edição). */
  filha_id?: string | null;
};

const erro = (codigo: string): { ok: false; erro: { codigo: string } } => ({ ok: false, erro: { codigo } });

function mdc(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reduzir(numerador: number, denominador: number): Fracao {
  const g = mdc(numerador, denominador);
  return { numerador: numerador / g, denominador: denominador / g };
}

/** "2/3" ou "33,33%" → fração reduzida. Termos de 1 a 1.000.000. */
export function lerFracao(texto: string): Resultado<Fracao> {
  const limpo = texto.replace(/\s+/g, "");
  const barra = /^(\d{1,7})\/(\d{1,7})$/.exec(limpo);
  if (barra) {
    const n = Number(barra[1]);
    const d = Number(barra[2]);
    if (n < 1 || d < 1 || n > MAIOR_TERMO || d > MAIOR_TERMO) return erro("divisao.fracao_invalida");
    return { ok: true, valor: reduzir(n, d) };
  }
  const percentual = /^(\d{1,3})(?:[.,](\d{1,2}))?%$/.exec(limpo);
  if (percentual) {
    const n = Number(percentual[1]) * 100 + Number((percentual[2] ?? "").padEnd(2, "0"));
    if (n < 1 || n > 10_000) return erro("divisao.fracao_invalida");
    return { ok: true, valor: reduzir(n, 10_000) };
  }
  return erro("divisao.fracao_invalida");
}

export type AvaliacaoDoRascunho = {
  /** O código do que impede de dividir; `null` quando "Dividir" pode ser liberado. */
  erro: string | null;
  /** O valor de cada parte, com o sinal do Valor da mãe, quando dá para calcular. */
  valores: (number | null)[];
  /**
   * A soma que o rodapé mostra: no modo valor, a digitada; no modo proporção,
   * a dos valores quando as frações fecham. `null` quando não dá para somar.
   */
  somaCentavos: number | null;
  /** A Divisão a gravar (sem `filha_id` novo); `null` quando há erro. */
  divisao: Divisao | null;
};

const SEM_VALORES = (n: number, codigo: string): AvaliacaoDoRascunho => ({
  erro: codigo,
  valores: Array.from({ length: n }, () => null),
  somaCentavos: null,
  divisao: null,
});

/**
 * Avalia o que se digitou na janela. Quanto vale cada parte, se a soma bate e
 * se "Dividir" pode ser liberado. Limites: 2 a 10 partes, Valor até R$ 900.000,00,
 * Valor zero não divide, nenhuma parte zerada, Responsável em toda parte.
 */
export function avaliarRascunho(
  valorCentavos: number,
  modo: ModoDivisao,
  partes: readonly ParteRascunho[],
): AvaliacaoDoRascunho {
  const n = partes.length;
  if (valorCentavos === 0) return SEM_VALORES(n, "divisao.valor_zero");
  if (Math.abs(valorCentavos) > VALOR_MAXIMO_CENTAVOS) return SEM_VALORES(n, "divisao.valor_grande");
  const sinal = valorCentavos < 0 ? -1 : 1;
  const total = Math.abs(valorCentavos);

  const montar = (fracoes: Fracao[], valores: (number | null)[], soma: number | null, codigo: string | null): AvaliacaoDoRascunho => {
    if (codigo === null && (n < MIN_PARTES || n > MAX_PARTES)) codigo = n < MIN_PARTES ? "divisao.poucas_partes" : "divisao.partes_demais";
    if (codigo === null && partes.some((p) => p.responsavel_id === null)) codigo = "divisao.sem_responsavel";
    if (codigo !== null) return { erro: codigo, valores, somaCentavos: soma, divisao: null };
    return {
      erro: null,
      valores,
      somaCentavos: soma,
      divisao: {
        modo,
        partes: partes.map((p, i) => ({
          responsavel_id: p.responsavel_id as string,
          numerador: fracoes[i].numerador,
          denominador: fracoes[i].denominador,
          ...(p.filha_id ? { filha_id: p.filha_id } : {}),
        })),
      },
    };
  };

  if (modo === "valor") {
    const lidos: (number | null)[] = partes.map((p) => {
      const r = lerReais(p.texto);
      return r.ok ? Math.abs(r.valor) : null;
    });
    const valores = lidos.map((v) => (v === null ? null : sinal * v));
    if (lidos.some((v) => v === null)) return montar([], valores, null, "dinheiro.invalido");
    const numeros = lidos as number[];
    const soma = numeros.reduce((s, v) => s + v, 0);
    const somaComSinal = sinal * soma;
    if (numeros.some((v) => v === 0)) return montar([], valores, somaComSinal, "divisao.parte_zerada");
    if (soma !== total) return montar([], valores, somaComSinal, "divisao.soma_diferente");
    return montar(
      numeros.map((v) => reduzir(v, total)),
      valores,
      somaComSinal,
      null,
    );
  }

  const fracoes: Fracao[] = [];
  for (const p of partes) {
    const f = lerFracao(p.texto);
    if (!f.ok) return SEM_VALORES(n, f.erro.codigo);
    fracoes.push(f.valor);
  }
  const calculado = dividirEmPartes(valorCentavos, fracoes);
  if (!calculado.ok) return SEM_VALORES(n, calculado.erro.codigo);
  const soma = calculado.valor.reduce((s, v) => s + v, 0);
  if (calculado.valor.some((v) => v === 0)) return montar(fracoes, calculado.valor, soma, "divisao.parte_zerada");
  return montar(fracoes, calculado.valor, soma, null);
}

/** Texto de uma fração para o campo: "2/3". */
export function textoDaFracao(f: Fracao): string {
  return `${f.numerador}/${f.denominador}`;
}

/** Texto de um valor em reais para o campo, sem "R$": "310,67". */
export function textoDeReais(centavos: number): string {
  const absoluto = Math.abs(centavos);
  return `${Math.floor(absoluto / 100)},${String(absoluto % 100).padStart(2, "0")}`;
}

/**
 * A janela troca de modo: os campos passam a mostrar a mesma Divisão no outro
 * modo (valores de "2/3 + 1/3" em "310,67 + 155,33" e vice-versa). Se o
 * rascunho não está válido, os campos ficam como estão.
 */
export function converterRascunho(
  valorCentavos: number,
  de: ModoDivisao,
  partes: readonly ParteRascunho[],
): ParteRascunho[] {
  // A conversão não depende de já haver Responsável em cada parte.
  const a = avaliarRascunho(valorCentavos, de, partes.map((p) => ({ ...p, responsavel_id: p.responsavel_id ?? "-" })));
  if (a.divisao === null) return [...partes];
  return partes.map((p, i) => ({
    ...p,
    texto:
      de === "proporcao"
        ? textoDeReais(a.valores[i] as number)
        : textoDaFracao({ numerador: a.divisao!.partes[i].numerador, denominador: a.divisao!.partes[i].denominador }),
  }));
}

/** O rascunho de uma Divisão já gravada (a janela em modo edição). */
export function rascunhoDaDivisao(
  valorCentavos: number,
  d: Divisao,
  statusPorFilha: ReadonlyMap<string, string | null>,
  statusPadrao: string | null,
): ParteRascunho[] {
  const valores = valoresDasPartes(valorCentavos, d);
  return d.partes.map((p, i) => ({
    responsavel_id: p.responsavel_id,
    texto:
      d.modo === "valor" && valores.ok
        ? textoDeReais(valores.valor[i])
        : textoDaFracao({ numerador: p.numerador, denominador: p.denominador }),
    status_id: p.filha_id !== undefined && statusPorFilha.has(p.filha_id) ? (statusPorFilha.get(p.filha_id) ?? null) : statusPadrao,
    ...(p.filha_id ? { filha_id: p.filha_id } : {}),
  }));
}

/** O rascunho de uma janela nova: duas partes iguais, ainda sem Responsável. */
export function rascunhoInicial(statusPadrao: string | null): ParteRascunho[] {
  return [
    { responsavel_id: null, texto: "1/2", status_id: statusPadrao },
    { responsavel_id: null, texto: "1/2", status_id: statusPadrao },
  ];
}

// ----------------------------------------------------- o que a RPC grava

/** A mãe como o planejamento a lê (colunas de `lancamentos`). */
export type MaeParaDividir = {
  id: string;
  valor_centavos: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  fatura_id: string | null;
  ajuste_de_id?: string | null;
  dividido_de_id?: string | null;
  revisao_motivo: string | null;
  revisao_dados: unknown;
  revisado_em?: string | null;
  divisao: unknown;
};

/** Uma parte a gravar na filha; `status_id` ausente mantém (ou usa o da mãe numa filha nova). */
export type ParteParaGravar = {
  filha_id: string | null;
  responsavel_id: string;
  valor_centavos: number;
  status_id?: string | null;
};

/** Um item de `dividir_lancamento(p_itens)`. */
export type ItemDividir = {
  id: string;
  corpo: {
    divisao: Divisao | null;
    responsavel_id?: string | null;
    revisao_motivo?: string | null;
    revisao_dados?: unknown;
    revisado_em?: string | null;
    editado_em?: string | null;
  };
  partes: ParteParaGravar[];
};

export type OpcoesDividir = {
  /** Dividir exige Tipo (padrão); a propagação a previsto não exige. */
  exigirTipo?: boolean;
  /** `editado_em` e `revisado_em` (a mão do Rafael). Sem `agora`, é propagação a previsto: nada é marcado. */
  agora?: string;
  /** Os Status por parte (na ordem das partes); `undefined` mantém o da filha (ou usa o da mãe). */
  status?: readonly (string | null | undefined)[];
};

/**
 * "Dividir" (ou editar a Divisão): o item da RPC para a mãe. A mãe fica sem
 * Responsável (guarda o de antes em `responsavel_antes` se a Divisão é nova),
 * sai da fila se estava nela e tem Tipo. Exige Tipo, Valor sem Ajuste e que
 * não seja filha nem Ajuste.
 */
export function planejarDivisao(
  mae: MaeParaDividir,
  divisao: Divisao,
  opcoes: OpcoesDividir = {},
): Resultado<ItemDividir> {
  if (ehFilha(mae) || (mae.ajuste_de_id ?? null) !== null) return erro("divisao.mae_invalida");
  if (mae.tipo_id === null && opcoes.exigirTipo !== false) return erro("divisao.sem_tipo");
  const valores = valoresDasPartes(mae.valor_centavos, divisao);
  if (!valores.ok) return valores;
  if (valores.valor.some((v) => v === 0)) return erro("divisao.parte_zerada");
  const antes = lerDivisao(mae.divisao);
  const jaDividida = antes !== null;
  const gravada: Divisao = { ...divisao };
  if (!jaDividida) gravada.responsavel_antes = mae.responsavel_id;
  else if (antes.responsavel_antes !== undefined) gravada.responsavel_antes = antes.responsavel_antes;
  const corpo: ItemDividir["corpo"] = { divisao: gravada, responsavel_id: null };
  if (mae.revisao_motivo !== null || mae.revisao_dados !== null) {
    corpo.revisao_motivo = null;
    corpo.revisao_dados = null;
    if (opcoes.agora !== undefined) corpo.revisado_em = opcoes.agora;
  }
  if (opcoes.agora !== undefined) corpo.editado_em = opcoes.agora;
  return {
    ok: true,
    valor: {
      id: mae.id,
      corpo,
      partes: divisao.partes.map((p, i) => ({
        filha_id: p.filha_id ?? null,
        responsavel_id: p.responsavel_id,
        valor_centavos: valores.valor[i],
        ...(opcoes.status && opcoes.status[i] !== undefined ? { status_id: opcoes.status[i] } : {}),
      })),
    },
  };
}

/**
 * "Desfazer divisão": a mãe volta a ser linha comum. Devolve o Responsável de
 * antes (divisão feita à mão); se não havia, a linha da Fatura volta à fila
 * como `sem_classificacao`. As filhas são excluídas pela RPC.
 */
export function planejarDesfazerDivisao(mae: MaeParaDividir, agora?: string): Resultado<ItemDividir> {
  const atual = lerDivisao(mae.divisao);
  if (atual === null || ehFilha(mae)) return erro("divisao.mae_invalida");
  const responsavel = atual.responsavel_antes ?? null;
  const corpo: ItemDividir["corpo"] = { divisao: null, responsavel_id: responsavel };
  if (responsavel === null && mae.fatura_id !== null && mae.revisao_motivo === null) {
    corpo.revisao_motivo = "sem_classificacao";
    corpo.revisao_dados = null;
    if (agora !== undefined) corpo.revisado_em = null;
  }
  if (agora !== undefined) corpo.editado_em = agora;
  return { ok: true, valor: { id: mae.id, corpo, partes: [] } };
}

/** A linha-mãe e as filhas como estavam, para o "Desfazer" do toast. */
export type FilhaParaRestaurar = {
  id: string;
  responsavel_id: string | null;
  valor_centavos: number;
  status_id: string | null;
};

/**
 * O item da RPC que devolve a mãe (e as filhas, se estava dividida) ao que
 * era antes: o "Desfazer" do toast de Dividir e de Desfazer divisão. A filha
 * excluída nesse meio-tempo é revivida pelo `filha_id`.
 */
export function itemParaRestaurar(
  mae: MaeParaDividir & { editado_em?: string | null },
  filhas: readonly FilhaParaRestaurar[],
): ItemDividir {
  const divisao = lerDivisao(mae.divisao);
  const corpo: ItemDividir["corpo"] = {
    divisao: divisao === null ? null : (mae.divisao as Divisao),
    responsavel_id: mae.responsavel_id,
    revisao_motivo: mae.revisao_motivo,
    revisao_dados: mae.revisao_dados ?? null,
    revisado_em: mae.revisado_em ?? null,
    editado_em: mae.editado_em ?? null,
  };
  if (divisao === null) return { id: mae.id, corpo, partes: [] };
  const porId = new Map(filhas.map((f) => [f.id, f]));
  const partes: ParteParaGravar[] = [];
  for (const p of divisao.partes) {
    const f = p.filha_id === undefined ? undefined : porId.get(p.filha_id);
    if (f === undefined || f.responsavel_id === null) return { id: mae.id, corpo: { ...corpo, divisao: null }, partes: [] };
    partes.push({ filha_id: f.id, responsavel_id: f.responsavel_id, valor_centavos: f.valor_centavos, status_id: f.status_id });
  }
  return { id: mae.id, corpo, partes };
}

// --------------------------------------------- propagação aos previstos

/** O que a propagação olha na parcela: o Responsável e a Divisão. */
export type DivisaoDaParcela = { responsavel_id: string | null; divisao: Divisao | null };

/** Um previsto da Série (colunas de `lancamentos`). */
export type PrevistoParaDividir = MaeParaDividir & { status_id?: string | null };

export type PlanoDaDivisaoNosPrevistos = {
  /** Previstos que recebem sem perguntar (vazios, ou com a mesma Divisão que a parcela tinha antes). */
  silenciosos: ItemDividir[];
  /** Previstos com outro Responsável ou outra Divisão, que só mudam com "Aplicar a todos". */
  aPerguntar: ItemDividir[];
};

/**
 * Como a mudança de Divisão da parcela real chega aos previstos (como a 4-A da
 * 3.5). Dividir ou redividir: previsto sem Responsável nem Divisão recebe
 * sozinho; com outro Responsável ou outra Divisão, só se a parcela já tinha
 * um dos dois e Rafael responder "Aplicar a todos". Desfazer a divisão
 * (`depois.divisao` nula): só os previstos com a mesma Divisão de antes
 * voltam, sozinhos. Cada previsto é dividido com o próprio Valor.
 */
export function planejarDivisaoNosPrevistos(
  antes: DivisaoDaParcela,
  depois: DivisaoDaParcela,
  previstos: readonly PrevistoParaDividir[],
): PlanoDaDivisaoNosPrevistos {
  const silenciosos: ItemDividir[] = [];
  const aPerguntar: ItemDividir[] = [];
  if (depois.divisao === null) {
    if (antes.divisao === null) return { silenciosos, aPerguntar };
    for (const p of previstos) {
      if (!mesmaDivisao(lerDivisao(p.divisao), antes.divisao)) continue;
      const item = planejarDesfazerDivisao(p);
      if (item.ok) silenciosos.push({ ...item.valor, corpo: { ...item.valor.corpo, responsavel_id: depois.responsavel_id } });
    }
    return { silenciosos, aPerguntar };
  }
  if (mesmaDivisao(antes.divisao, depois.divisao)) return { silenciosos, aPerguntar };
  const tinhaAlgo = antes.divisao !== null || antes.responsavel_id !== null;
  for (const p of previstos) {
    const atual = lerDivisao(p.divisao);
    if (mesmaDivisao(atual, depois.divisao)) continue;
    const vazio = atual === null && p.responsavel_id === null;
    if (!vazio && !tinhaAlgo) continue;
    // Previsto já dividido: as filhas dele são reaproveitadas pela posição.
    const partesNovas = depois.divisao.partes.map((parte, i) => ({
      ...parte,
      ...(atual?.partes[i]?.filha_id ? { filha_id: atual.partes[i].filha_id } : {}),
    }));
    const item = planejarDivisao(p, { ...copiarDivisao(depois.divisao), partes: partesNovas }, { exigirTipo: false });
    if (!item.ok) continue;
    (vazio ? silenciosos : aPerguntar).push(item.valor);
  }
  return { silenciosos, aPerguntar };
}

/** Junta os itens do mesmo previsto (um item por id; vale o último) para uma gravação só. */
export function juntarItensDividir(...listas: readonly (readonly ItemDividir[])[]): ItemDividir[] {
  const porId = new Map<string, ItemDividir>();
  for (const lista of listas) for (const item of lista) porId.set(item.id, item);
  return [...porId.values()];
}

// ------------------------------------------------- partes na importação

/** As partes (filhas) de uma linha que a importação grava com Divisão; `null` se a Divisão não vale para o Valor. */
export function partesDaImportacao(
  valorCentavos: number,
  divisao: Divisao,
  filhasExistentes: readonly (string | undefined)[] = [],
  permitirZero = false,
): ParteParaGravar[] | null {
  const valores = valoresDasPartes(valorCentavos, divisao);
  if (!valores.ok || (!permitirZero && valores.valor.some((v) => v === 0))) return null;
  return divisao.partes.map((p, i) => ({
    filha_id: filhasExistentes[i] ?? p.filha_id ?? null,
    responsavel_id: p.responsavel_id,
    valor_centavos: valores.valor[i],
  }));
}
