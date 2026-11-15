// Fórmula do Bloco (História 4.1, FR-19, FR-54, AD-2, AD-11). A Fórmula é uma
// árvore guardada em `jsonb` e validada por zod: operando (Responsável, Tipo,
// Responsável em Tipo, Todos), número, operação (+ − × ÷) e grupo. Rafael a
// monta por fichas (`Ficha`), nunca por texto; `montarFormula` transforma as
// fichas na árvore e recusa a Fórmula inválida com o código da razão.
//
// `avaliar(formula, linhas)` é a única conta: racional exato (`bigint`),
// precedência usual e um só arredondamento, no resultado final. `linhas` vem
// sempre de uma projeção do núcleo (`projetarPainel`, ...): nenhuma tela
// filtra antes. Devolve o valor, o cálculo (que `descreverCalculo` conta em
// texto) e os Lançamentos que entram.
//
// Números: um número é um fator ("÷ 2"). Somado a um valor em R$, vale em
// reais ("Rangel + 100" soma R$ 100,00). Valor em R$ × ou ÷ outro valor em R$
// não existe. Puro: sem relógio, rede ou banco.

import { z } from "zod";
import {
  arredondarRacional,
  formatarDinheiro,
  formatarRacionalDecimal,
  formatarRacionalEmReais,
} from "./dinheiro";
import type { Resultado } from "./resultado";

// ------------------------------------------------------------------ tipos

export type Operacao = "soma" | "subtracao" | "multiplicacao" | "divisao";

export const OPERACOES: readonly Operacao[] = ["soma", "subtracao", "multiplicacao", "divisao"];

/** Como a operação aparece nas fichas e no texto. */
export const SIMBOLO_OPERACAO: Readonly<Record<Operacao, string>> = {
  soma: "+",
  subtracao: "−",
  multiplicacao: "×",
  divisao: "÷",
};

export type Operando =
  | { tipo: "responsavel"; id: string }
  | { tipo: "tipo"; id: string }
  | { tipo: "responsavel_em_tipo"; responsavel_id: string; tipo_id: string }
  | { tipo: "todos" };

/** Número sem sinal, em texto canônico: "2", "0,5", "1,25" (até 9 inteiros e 4 casas). */
export type Numero = { tipo: "numero"; valor: string };

export type NoOperacao = { tipo: "operacao"; operacao: Operacao; esquerda: No; direita: No };

/** Parênteses, como Rafael os montou. */
export type NoGrupo = { tipo: "grupo"; interno: No };

export type No = Operando | Numero | NoOperacao | NoGrupo;

export type Formula = No;

/** Uma ficha da área da Fórmula: o que Rafael toca, na ordem. */
export type Ficha =
  | Operando
  | Numero
  | { tipo: "operacao"; operacao: Operacao }
  | { tipo: "abre" }
  | { tipo: "fecha" };

/** Mais fichas que isso não cabe na janela (e protege a leitura da árvore). */
export const MAX_FICHAS = 60;

// ------------------------------------------------------------------ schema

const id = z.string().min(1).max(64);
// Canônico: sem zeros à esquerda, sem zeros à direita depois da vírgula.
const VALOR_NUMERO = /^(0|[1-9]\d{0,8})(,\d{0,3}[1-9])?$/;

export const schemaFormula: z.ZodType<No> = z.lazy(() =>
  z.union([
    z.strictObject({ tipo: z.literal("responsavel"), id }),
    z.strictObject({ tipo: z.literal("tipo"), id }),
    z.strictObject({ tipo: z.literal("responsavel_em_tipo"), responsavel_id: id, tipo_id: id }),
    z.strictObject({ tipo: z.literal("todos") }),
    z.strictObject({ tipo: z.literal("numero"), valor: z.string().regex(VALOR_NUMERO) }),
    z.strictObject({
      tipo: z.literal("operacao"),
      operacao: z.enum(["soma", "subtracao", "multiplicacao", "divisao"]),
      esquerda: schemaFormula,
      direita: schemaFormula,
    }),
    z.strictObject({ tipo: z.literal("grupo"), interno: schemaFormula }),
  ]),
);

function contarNos(no: No): number {
  switch (no.tipo) {
    case "operacao":
      return 1 + contarNos(no.esquerda) + contarNos(no.direita);
    case "grupo":
      return 1 + contarNos(no.interno);
    default:
      return 1;
  }
}

/** Lê o `jsonb` do banco: a árvore válida, ou `formula.invalida`. Não confere as contas (use `validarFormula`). */
export function lerFormula(dados: unknown): Resultado<Formula> {
  const lido = schemaFormula.safeParse(dados);
  if (!lido.success || contarNos(lido.data) > MAX_FICHAS) {
    return { ok: false, erro: { codigo: "formula.invalida" } };
  }
  return { ok: true, valor: lido.data };
}

// ------------------------------------------------------------ número digitado

/**
 * O texto digitado no campo "Número…" em forma canônica ("2,50" → "2,5";
 * "0,5" e "0.5" → "0,5"), ou `null` se não é um número que cabe (maior que
 * zero ou zero, até 9 inteiros e 4 casas, sem sinal).
 */
export function normalizarNumero(texto: string): string | null {
  const limpo = texto.trim().replace(".", ",");
  const partes = /^(\d{1,9})(?:,(\d{1,4}))?$/.exec(limpo);
  if (!partes) return null;
  const inteiro = String(Number(partes[1]));
  const fracao = (partes[2] ?? "").replace(/0+$/, "");
  return fracao === "" ? inteiro : `${inteiro},${fracao}`;
}

// ------------------------------------------------------------------ racional

type Racional = { n: bigint; d: bigint };

const ZERO = BigInt(0);
const UM = BigInt(1);
const CEM = BigInt(100);

function mdc(a: bigint, b: bigint): bigint {
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}

function racional(n: bigint, d: bigint = UM): Racional {
  const g = mdc(n < ZERO ? -n : n, d);
  return g === ZERO || g === UM ? { n, d } : { n: n / g, d: d / g };
}

const somar = (a: Racional, b: Racional) => racional(a.n * b.d + b.n * a.d, a.d * b.d);
const subtrair = (a: Racional, b: Racional) => racional(a.n * b.d - b.n * a.d, a.d * b.d);
const multiplicar = (a: Racional, b: Racional) => racional(a.n * b.n, a.d * b.d);
const eZero = (a: Racional) => a.n === ZERO;

function dividir(a: Racional, b: Racional): Racional {
  const n = a.n * b.d;
  const d = a.d * b.n;
  return d < ZERO ? racional(-n, -d) : racional(n, d);
}

function lerNumero(valor: string): Racional {
  const [inteiro, fracao = ""] = valor.split(",");
  return racional(BigInt(inteiro + fracao), BigInt(`1${"0".repeat(fracao.length)}`));
}

// ------------------------------------------------------------------ avaliar

/** O que a Fórmula olha de um Lançamento (uma projeção do núcleo entrega só isto). */
export type LinhaDaFormula = {
  id: string;
  valor_centavos: number;
  responsavel_id: string | null;
  tipo_id: string | null;
};

/** O valor de um passo: em centavos (R$) ou um número sem unidade. */
export type ValorCalculado = { dinheiro: boolean; numerador: bigint; denominador: bigint };

/** O cálculo, com o valor de cada passo (a base do passo a passo, do 4.7 e do filtro do 4.3). */
export type Calculo =
  | { tipo: "operando"; operando: Operando; valor: ValorCalculado; centavos: number; ids: string[] }
  | { tipo: "numero"; texto: string; valor: ValorCalculado }
  /** Um número (ou conta só de números) que entrou numa soma com R$ e passou a valer reais. */
  | { tipo: "em_reais"; interno: Calculo; valor: ValorCalculado }
  | { tipo: "operacao"; operacao: Operacao; esquerda: Calculo; direita: Calculo; valor: ValorCalculado }
  | { tipo: "grupo"; interno: Calculo; valor: ValorCalculado };

export type Avaliacao = {
  /** O resultado final, arredondado uma única vez. */
  valorCentavos: number;
  calculo: Calculo;
  /** Os Lançamentos que entram em algum operando, na ordem de `linhas`. */
  entram: string[];
};

function casaComOperando(operando: Operando, l: LinhaDaFormula): boolean {
  switch (operando.tipo) {
    case "responsavel":
      return l.responsavel_id === operando.id;
    case "tipo":
      return l.tipo_id === operando.id;
    case "responsavel_em_tipo":
      return l.responsavel_id === operando.responsavel_id && l.tipo_id === operando.tipo_id;
    case "todos":
      return true;
  }
}

const erro = (codigo: string): { ok: false; erro: { codigo: string } } => ({ ok: false, erro: { codigo } });

const comoValor = (r: Racional, dinheiro: boolean): ValorCalculado => ({ dinheiro, numerador: r.n, denominador: r.d });
const comoRacional = (v: ValorCalculado): Racional => ({ n: v.numerador, d: v.denominador });

/** O número que entrou numa soma com R$ passa a valer reais (× 100 centavos). */
function emReais(c: Calculo): Calculo {
  const r = multiplicar(comoRacional(c.valor), racional(CEM));
  return { tipo: "em_reais", interno: c, valor: comoValor(r, true) };
}

function calcular(no: No, linhas: readonly LinhaDaFormula[]): Resultado<Calculo> {
  switch (no.tipo) {
    case "responsavel":
    case "tipo":
    case "responsavel_em_tipo":
    case "todos": {
      const doOperando = linhas.filter((l) => casaComOperando(no, l));
      const centavos = doOperando.reduce((soma, l) => soma + l.valor_centavos, 0);
      if (!Number.isSafeInteger(centavos)) return erro("formula.valor_grande");
      return {
        ok: true,
        valor: {
          tipo: "operando",
          operando: no,
          valor: comoValor(racional(BigInt(centavos)), true),
          centavos,
          ids: doOperando.map((l) => l.id),
        },
      };
    }
    case "numero":
      return { ok: true, valor: { tipo: "numero", texto: no.valor, valor: comoValor(lerNumero(no.valor), false) } };
    case "grupo": {
      const interno = calcular(no.interno, linhas);
      if (!interno.ok) return interno;
      return { ok: true, valor: { tipo: "grupo", interno: interno.valor, valor: interno.valor.valor } };
    }
    case "operacao": {
      const e = calcular(no.esquerda, linhas);
      if (!e.ok) return e;
      const d = calcular(no.direita, linhas);
      if (!d.ok) return d;
      let esquerda = e.valor;
      let direita = d.valor;
      const somando = no.operacao === "soma" || no.operacao === "subtracao";
      if (somando && esquerda.valor.dinheiro !== direita.valor.dinheiro) {
        if (esquerda.valor.dinheiro) direita = emReais(direita);
        else esquerda = emReais(esquerda);
      }
      const dinheiroE = esquerda.valor.dinheiro;
      const dinheiroD = direita.valor.dinheiro;
      const a = comoRacional(esquerda.valor);
      const b = comoRacional(direita.valor);
      let resultado: Racional;
      let dinheiro: boolean;
      switch (no.operacao) {
        case "soma":
          resultado = somar(a, b);
          dinheiro = dinheiroE;
          break;
        case "subtracao":
          resultado = subtrair(a, b);
          dinheiro = dinheiroE;
          break;
        case "multiplicacao":
          if (dinheiroE && dinheiroD) return erro("formula.dinheiro_com_dinheiro");
          resultado = multiplicar(a, b);
          dinheiro = dinheiroE || dinheiroD;
          break;
        case "divisao":
          if (dinheiroD) return erro("formula.dinheiro_com_dinheiro");
          if (eZero(b)) return erro("formula.divisao_por_zero");
          resultado = dividir(a, b);
          dinheiro = dinheiroE;
          break;
      }
      return {
        ok: true,
        valor: { tipo: "operacao", operacao: no.operacao, esquerda, direita, valor: comoValor(resultado, dinheiro) },
      };
    }
  }
}

function lancamentosQueEntram(calculo: Calculo, linhas: readonly LinhaDaFormula[]): string[] {
  const ids = new Set<string>();
  const percorrer = (c: Calculo) => {
    switch (c.tipo) {
      case "operando":
        for (const i of c.ids) ids.add(i);
        break;
      case "operacao":
        percorrer(c.esquerda);
        percorrer(c.direita);
        break;
      case "grupo":
      case "em_reais":
        percorrer(c.interno);
        break;
      case "numero":
        break;
    }
  };
  percorrer(calculo);
  return linhas.filter((l) => ids.has(l.id)).map((l) => l.id);
}

/**
 * Avalia a Fórmula sobre as linhas de uma projeção: o valor (racional exato,
 * um só arredondamento no final), o cálculo e os Lançamentos que entram.
 * Erros: `formula.divisao_por_zero`, `formula.dinheiro_com_dinheiro`,
 * `formula.valor_grande`.
 */
export function avaliar(formula: Formula, linhas: readonly LinhaDaFormula[]): Resultado<Avaliacao> {
  const c = calcular(formula, linhas);
  if (!c.ok) return c;
  // Uma Fórmula só de números ("2", "2 × 3") vale em reais: "Valor fixo".
  const calculo = c.valor.valor.dinheiro ? c.valor : emReais(c.valor);
  try {
    return {
      ok: true,
      valor: {
        valorCentavos: arredondarRacional(calculo.valor.numerador, calculo.valor.denominador),
        calculo,
        entram: lancamentosQueEntram(calculo, linhas),
      },
    };
  } catch {
    return erro("formula.valor_grande");
  }
}

/** A Fórmula faz sentido (sem linhas): divisão por zero e R$ com R$ não dependem dos dados. */
export function validarFormula(formula: Formula): Resultado<Formula> {
  const r = avaliar(formula, []);
  return r.ok ? { ok: true, valor: formula } : r;
}

// ------------------------------------------------------------------ fichas

const eOperacao = (f: Ficha): f is { tipo: "operacao"; operacao: Operacao } => f.tipo === "operacao";

/**
 * Procura a primeira razão pela qual as fichas não formam uma Fórmula:
 * varre da esquerda para a direita (esperando um valor, ou uma operação) e
 * só no fim olha como terminou.
 */
function razaoEstrutural(fichas: readonly Ficha[]): string | null {
  if (fichas.length === 0) return "formula.vazia";
  let esperaValor = true;
  let profundidade = 0;
  let anterior: Ficha | null = null;
  for (const f of fichas) {
    if (esperaValor) {
      if (eOperacao(f)) {
        if (anterior === null) return "formula.comeca_com_operacao";
        if (anterior.tipo === "abre") return "formula.grupo_comeca_com_operacao";
        return "formula.operacoes_seguidas";
      }
      if (f.tipo === "fecha") {
        if (anterior?.tipo === "abre") return "formula.grupo_vazio";
        if (anterior !== null && eOperacao(anterior)) return "formula.operacao_sem_valor";
        return "formula.fecha_sobrando";
      }
      if (f.tipo === "abre") profundidade++;
      else esperaValor = false;
    } else if (eOperacao(f)) {
      esperaValor = true;
    } else if (f.tipo === "fecha") {
      if (profundidade === 0) return "formula.fecha_sobrando";
      profundidade--;
    } else {
      return "formula.falta_operacao";
    }
    anterior = f;
  }
  if (anterior !== null && eOperacao(anterior)) return "formula.termina_com_operacao";
  if (profundidade > 0) return "formula.parentese_aberto";
  return null;
}

/** Monta a árvore de fichas já conferidas (`razaoEstrutural` null): × ÷ antes de + −, da esquerda para a direita. */
function montarArvore(fichas: readonly Ficha[]): No {
  let i = 0;
  const fator = (): No => {
    const f = fichas[i++];
    if (f.tipo === "abre") {
      const interno = expressao();
      i++; // o ")"
      return { tipo: "grupo", interno };
    }
    return { ...f } as Operando | Numero;
  };
  const termo = (): No => {
    let esquerda = fator();
    for (;;) {
      const f = fichas[i];
      if (!f || !eOperacao(f) || (f.operacao !== "multiplicacao" && f.operacao !== "divisao")) return esquerda;
      i++;
      esquerda = { tipo: "operacao", operacao: f.operacao, esquerda, direita: fator() };
    }
  };
  const expressao = (): No => {
    let esquerda = termo();
    for (;;) {
      const f = fichas[i];
      if (!f || !eOperacao(f) || (f.operacao !== "soma" && f.operacao !== "subtracao")) return esquerda;
      i++;
      esquerda = { tipo: "operacao", operacao: f.operacao, esquerda, direita: termo() };
    }
  };
  return expressao();
}

/**
 * As fichas viram a Fórmula, ou o código da razão (`formula.parentese_aberto`,
 * `formula.termina_com_operacao`, `formula.divisao_por_zero`, ...) que
 * deixa "Salvar" desativado.
 */
export function montarFormula(fichas: readonly Ficha[]): Resultado<Formula> {
  if (fichas.length > MAX_FICHAS) return erro("formula.grande");
  const razao = razaoEstrutural(fichas);
  if (razao !== null) return erro(razao);
  return validarFormula(montarArvore(fichas));
}

/** A Fórmula de volta em fichas, para editar um Bloco. */
export function fichasDaFormula(formula: Formula): Ficha[] {
  switch (formula.tipo) {
    case "operacao":
      return [
        ...fichasDaFormula(formula.esquerda),
        { tipo: "operacao", operacao: formula.operacao },
        ...fichasDaFormula(formula.direita),
      ];
    case "grupo":
      return [{ tipo: "abre" }, ...fichasDaFormula(formula.interno), { tipo: "fecha" }];
    default:
      return [{ ...formula }];
  }
}

// ------------------------------------------------------------------ texto

/** Os nomes dos cadastros, por id, para escrever a Fórmula e o cálculo. */
export type NomesDaFormula = {
  responsaveis: ReadonlyMap<string, string>;
  tipos: ReadonlyMap<string, string>;
};

/** Nome que aparece no lugar de um cadastro que não está mais na lista. */
export const NOME_DESCONHECIDO = "?";

/** O nome de um operando: "Casal", "Casa", "Rafael em Bobiças", "Todos". */
export function nomeDoOperando(operando: Operando, nomes: NomesDaFormula): string {
  const responsavel = (rid: string) => nomes.responsaveis.get(rid) ?? NOME_DESCONHECIDO;
  const tipo = (tid: string) => nomes.tipos.get(tid) ?? NOME_DESCONHECIDO;
  switch (operando.tipo) {
    case "responsavel":
      return responsavel(operando.id);
    case "tipo":
      return tipo(operando.id);
    case "responsavel_em_tipo":
      return `${responsavel(operando.responsavel_id)} em ${tipo(operando.tipo_id)}`;
    case "todos":
      return "Todos";
  }
}

/** A Fórmula legível, com os parênteses como foram montados: "Rangel + (Casal ÷ 2)". */
export function textoDaFormula(formula: Formula, nomes: NomesDaFormula): string {
  switch (formula.tipo) {
    case "operacao":
      return `${textoDaFormula(formula.esquerda, nomes)} ${SIMBOLO_OPERACAO[formula.operacao]} ${textoDaFormula(formula.direita, nomes)}`;
    case "grupo":
      return `(${textoDaFormula(formula.interno, nomes)})`;
    case "numero":
      return formula.valor;
    default:
      return nomeDoOperando(formula, nomes);
  }
}

function textoDoValor(v: ValorCalculado): string {
  return v.dinheiro
    ? formatarRacionalEmReais(v.numerador, v.denominador)
    : formatarRacionalDecimal(v.numerador, v.denominador);
}

function textoDoCalculo(c: Calculo, nomes: NomesDaFormula): string {
  switch (c.tipo) {
    case "operando":
      return `${nomeDoOperando(c.operando, nomes)} ${formatarDinheiro(c.centavos)}`;
    case "numero":
      return c.texto;
    case "em_reais":
      return c.interno.tipo === "numero"
        ? textoDoValor(c.valor)
        : `(${textoDoCalculo(c.interno, nomes)} = ${textoDoValor(c.valor)})`;
    case "operacao":
      return `${textoDoCalculo(c.esquerda, nomes)} ${SIMBOLO_OPERACAO[c.operacao]} ${textoDoCalculo(c.direita, nomes)}`;
    case "grupo":
      return `(${textoDoCalculo(c.interno, nomes)} = ${textoDoValor(c.interno.valor)})`;
  }
}

/**
 * O passo a passo (FR-54): o subtotal de cada operando, cada operação, o
 * valor exato de cada grupo e o resultado arredondado no fim: "Rangel R$ 0,00
 * + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68". Um operando
 * sozinho só mostra o subtotal.
 */
export function descreverCalculo(avaliacao: Avaliacao, nomes: NomesDaFormula): string {
  const texto = textoDoCalculo(avaliacao.calculo, nomes);
  const raiz = avaliacao.calculo;
  const folha =
    raiz.tipo === "operando" || raiz.tipo === "numero" || (raiz.tipo === "em_reais" && raiz.interno.tipo === "numero");
  return folha ? texto : `${texto} = ${formatarDinheiro(avaliacao.valorCentavos)}`;
}

// ------------------------------------------------------------------ termos

/** Um fator de × ou ÷ por número: o texto vem de como Rafael montou ("2", "0,5", "(1 + 1)"). */
export type FatorDoTermo = { operacao: "multiplicacao" | "divisao"; texto: string };

/**
 * Uma parcela da soma de mais alto nível da Fórmula (a base da mensagem em
 * grupos, História 4.7). `no` é a parcela inteira, sem o sinal: avaliada
 * sozinha dá o valor do grupo. `base` é o que o grupo mostra como subtotal
 * (um operando, um parêntese de soma ou um número solto) e `fatores` são as
 * operações × e ÷ por números que o grupo aplica a ele, de dentro para fora.
 */
export type Termo = {
  no: No;
  /** A parcela é subtraída ("Menos Casal"). */
  subtraido: boolean;
  base: No;
  fatores: readonly FatorDoTermo[];
};

const SEM_NOMES: NomesDaFormula = { responsaveis: new Map(), tipos: new Map() };

/** A árvore tem algum operando (Responsável, Tipo, Responsável em Tipo ou Todos)? */
export function temOperando(no: No): boolean {
  switch (no.tipo) {
    case "operacao":
      return temOperando(no.esquerda) || temOperando(no.direita);
    case "grupo":
      return temOperando(no.interno);
    case "numero":
      return false;
    default:
      return true;
  }
}

/** Soma ou subtração no topo (com ou sem parênteses em volta). */
function eAditivo(no: No): boolean {
  if (no.tipo === "grupo") return eAditivo(no.interno);
  return no.tipo === "operacao" && (no.operacao === "soma" || no.operacao === "subtracao");
}

/**
 * A base e os fatores de uma parcela. Desce pelos × e ÷ cujo outro lado é só
 * número e pelos parênteses de um termo só; para num operando, num número
 * solto ou num parêntese de soma. Um × ou ÷ entre dois lados só de números
 * (`2 × 3`) é um valor fixo: a base é ele mesmo.
 */
function baseDoTermo(no: No, fatores: FatorDoTermo[]): No {
  if (no.tipo === "grupo") return eAditivo(no.interno) ? no : baseDoTermo(no.interno, fatores);
  if (no.tipo !== "operacao" || (no.operacao !== "multiplicacao" && no.operacao !== "divisao")) return no;
  const numeroEsquerda = !temOperando(no.esquerda);
  const numeroDireita = !temOperando(no.direita);
  if (numeroEsquerda && numeroDireita) return no;
  if (numeroDireita) {
    const base = baseDoTermo(no.esquerda, fatores);
    fatores.push({ operacao: no.operacao, texto: textoDaFormula(no.direita, SEM_NOMES) });
    return base;
  }
  if (numeroEsquerda && no.operacao === "multiplicacao") {
    const base = baseDoTermo(no.direita, fatores);
    fatores.push({ operacao: "multiplicacao", texto: textoDaFormula(no.esquerda, SEM_NOMES) });
    return base;
  }
  // Os dois lados com operando (R$ × R$): a validação recusa; a parcela inteira vira a base.
  return no;
}

function termoDe(no: No, subtraido: boolean): Termo {
  const fatores: FatorDoTermo[] = [];
  const base = baseDoTermo(no, fatores);
  return { no, subtraido, base, fatores };
}

function achatar(no: No, subtraido: boolean, saida: Termo[]): void {
  if (no.tipo === "operacao" && (no.operacao === "soma" || no.operacao === "subtracao")) {
    achatar(no.esquerda, subtraido, saida);
    achatar(no.direita, no.operacao === "subtracao" ? !subtraido : subtraido, saida);
  } else if (no.tipo === "grupo" && eAditivo(no.interno)) {
    achatar(no.interno, subtraido, saida);
  } else {
    saida.push(termoDe(no, subtraido));
  }
}

/**
 * Os termos da Fórmula na ordem em que Rafael os montou: a soma de mais alto
 * nível achatada (um parêntese que só envolve soma ou subtração é desfeito e
 * o sinal se propaga: `Rangel − (Casal + Mãe)` dá Rangel, −Casal, −Mãe). Todo
 * termo de uma Fórmula válida cabe; nenhuma conta é feita aqui (a conta é
 * `avaliar`).
 */
export function termosDaFormula(formula: Formula): Termo[] {
  const termos: Termo[] = [];
  achatar(formula, false, termos);
  return termos;
}
