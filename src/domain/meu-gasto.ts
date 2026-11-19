// Meu gasto por Tipo (História 7.3, FR-31, AD-1/AD-2/AD-11). A aba "Meu gasto por Tipo" da Previsão mostra, para um Mês,
// quanto da Fórmula do "meu Bloco" (Configurações → "É o meu Bloco") vem de cada Tipo, em barras do maior para o menor.
// Puro: sem relógio, rede ou banco; a tela só chama e desenha, e nada é gravado.
//
// - Uma só projeção (AD-11): as linhas são `projetarPainel(linhas, mes)`, as mesmas que o Painel daquele Mês dá ao Bloco
//   (a mãe dividida nunca soma e as filhas valem, linha excluída nunca entra, crédito entra com o sinal, previsto e Conta
//   manual entram como no Bloco do Painel). `totalCentavos` é o `valorCentavos` do `resumirBloco` do Painel, então a aba
//   e o cartão do Bloco nunca discordam (um teste os amarra).
// - A Fórmula é aplicada a cada Tipo (as linhas do Tipo, com `avaliar`, a única conta) e o que se guarda é o valor EXATO
//   (racional, sem arredondar). Toda Fórmula válida é afim nos totais dos operandos (`Rafael + (Casal ÷ 2) + 100`: valor
//   em R$ × ou ÷ outro valor em R$ não existe), e cada operando é uma soma sobre as linhas, então o valor do Tipo é
//   `parte(Tipo) + K`, onde `K` é o que a Fórmula vale sem nenhuma linha (a parte fixa, `avaliar(formula, [])`). A
//   contribuição do Tipo é `F(linhas do Tipo) − K`, e a soma das contribuições mais `K` é o valor exato do Bloco. Um
//   `K` diferente de zero ("Rafael + 100") vira a linha "Valor fixo do Bloco", que não é um Tipo; assim a soma de TODAS
//   as barras é o valor do Bloco. `K` é conferido: se a soma das contribuições mais `K` não der o valor do Bloco (uma
//   Fórmula que não fosse afim), a aba diz que o Bloco não se reparte por Tipo, em vez de inventar um número.
// - Arredondamento (AD-2, um só): `arredondarRacional` é a única função de arredondamento. Arredondar cada Tipo e somar
//   pode diferir em centavos do Bloco (Casal ÷ 2 sobre valores ímpares: 0,5 + 0,5 arredonda para 1 + 1, e o Bloco vale
//   R$ 0,01). Por isso o valor de cada barra é repartido pelo "maior resto": o piso (derivado de `arredondarRacional`:
//   o arredondado, ou um a menos se passou do exato), e os centavos que faltam para chegar ao valor do Bloco vão, um a
//   um, aos maiores restos. Cada barra fica a menos de 1 centavo do exato e a soma é exatamente o Bloco. Empate de resto:
//   o maior valor exato primeiro, depois o nome (`pt-BR`), depois o id, que não dependem da ordem das linhas: mesma
//   entrada, mesma saída. A porcentagem é repartida pela mesma função (soma 100%).
// - Barras: Tipo (inclusive arquivado) com valor repartido diferente de zero; "Sem tipo" para a linha sem Tipo (ou com
//   um id que o cadastro não tem); o "Valor fixo do Bloco", se houver, sempre por último. Do maior para o menor valor;
//   empate pelo nome, com "Sem tipo" depois dos Tipos. A barra só desenha o valor positivo (um Tipo líquido negativo
//   fica sem barra, com o número e o sinal em texto).
// - Porcentagem: `centavos ÷ total do Bloco`, inteira, só com total maior que zero (com total zero ou negativo não há
//   "% do total": `percentual` é `null`). Com crédito, os positivos podem passar de 100% e os negativos aparecem com
//   sinal; a soma é 100%.
// - O Bloco é o marcado `meu_bloco` (no máximo um, índice parcial); com mais de um (não deveria) vale o de menor `ordem`.

import { resumirBloco, type Bloco } from "./blocos";
import { arredondarRacional } from "./dinheiro";
import { avaliar, type Avaliacao, type Formula, type LinhaDaFormula } from "./formula";
import { TEXTOS_PREVISAO } from "./mensagens";
import { mesesDaLista } from "./painel";
import { idsDosPrevistos, projetarPainel, type LancamentoParaProjetar } from "./projecoes";
import type { Tipo } from "./tipos";

// ------------------------------------------------------------------ endereço

/** O valor de `?tipo=` que filtra o Painel pelas linhas sem Tipo. */
export const TIPO_SEM_TIPO_NO_ENDERECO = "sem";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O endereço do Painel de um Mês filtrado por um Tipo (`null` é "Sem tipo"): `/?mes=2026-10&tipo=<id>`. */
export function enderecoDoPainelPorTipo(mes: string, tipoId: string | null): string {
  return `/?mes=${mes}&tipo=${tipoId ?? TIPO_SEM_TIPO_NO_ENDERECO}`;
}

/**
 * O filtro de Tipo que o endereço pede: `undefined` (sem filtro) para ausente ou inválido, `null` para "sem" (Sem tipo) e o
 * id do Tipo para um `uuid`. Qualquer outro texto é ignorado, como o `lancamento` da página. Lista → o primeiro valor.
 */
export function lerTipoDoEndereco(valor: string | string[] | undefined): string | null | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (v === undefined) return undefined;
  if (v === TIPO_SEM_TIPO_NO_ENDERECO) return null;
  return UUID.test(v) ? v : undefined;
}

// ------------------------------------------------------------------- Meses

/** Os Meses com ao menos um Lançamento não excluído, sem repetição, em ordem crescente. */
export function mesesComLancamentos(linhas: readonly { mes: string; excluido_em: string | null }[]): string[] {
  return [...new Set(linhas.filter((l) => l.excluido_em === null).map((l) => l.mes))].sort();
}

/**
 * A lista do seletor de Mês desta aba: do Mês mais antigo com Fatura ou com Lançamento até o Mês atual + 1 (o mesmo
 * intervalo do seletor do Painel, `mesesDaLista`), mais o Mês aberto se estiver fora. O histórico da planilha entra
 * porque vem dos Lançamentos que a Previsão já lê; as setas andam sem limite.
 */
export function mesesDoMeuGasto(
  mesAtual: string,
  mesesComFatura: readonly string[],
  mesesComLinhas: readonly string[],
  aberto: string,
): string[] {
  return mesesDaLista([...mesesComFatura, ...mesesComLinhas], mesAtual, aberto);
}

// ---------------------------------------------------------------- racional

type Racional = { n: bigint; d: bigint };

const ZERO = BigInt(0);
const UM = BigInt(1);

const racional = (n: bigint, d: bigint = UM): Racional => ({ n, d });
const subtrair = (a: Racional, b: Racional): Racional => racional(a.n * b.d - b.n * a.d, a.d * b.d);
const somar = (a: Racional, b: Racional): Racional => racional(a.n * b.d + b.n * a.d, a.d * b.d);
const comparar = (a: Racional, b: Racional): number => {
  const esquerda = a.n * b.d;
  const direita = b.n * a.d;
  return esquerda < direita ? -1 : esquerda > direita ? 1 : 0;
};
const exatoDe = (a: Avaliacao): Racional => racional(a.calculo.valor.numerador, a.calculo.valor.denominador);

/**
 * O maior inteiro que não passa de `x`. Sai de `arredondarRacional` (a única função de arredondamento): o arredondado
 * ao mais próximo é o piso ou o piso mais um, e passou do exato quando `arredondado × d > n`.
 */
function piso(x: Racional): number {
  const arredondado = arredondarRacional(x.n, x.d);
  return BigInt(arredondado) * x.d > x.n ? arredondado - 1 : arredondado;
}

/**
 * Reparte `total` (inteiro) entre os valores exatos, pelo maior resto: cada um recebe o piso e os centavos que faltam
 * para chegar a `total` vão, um a um, aos maiores restos (empate: o maior valor exato, depois a posição em `exatos`,
 * que o chamador já pôs na ordem de preferência). `total` precisa ser o valor exato da soma arredondado, o que garante
 * que faltam entre 0 e `exatos.length` unidades; fora disso lança (não deveria acontecer).
 */
function repartir(exatos: readonly Racional[], total: number): number[] {
  const pisos = exatos.map(piso);
  const restos = exatos.map((x, i) => subtrair(x, racional(BigInt(pisos[i]))));
  const faltam = total - pisos.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(faltam) || faltam < 0 || faltam > exatos.length) {
    throw new Error(`Repartição inválida: faltam ${faltam} de ${exatos.length}`);
  }
  const ordem = exatos
    .map((_, i) => i)
    .sort((a, b) => comparar(restos[b], restos[a]) || comparar(exatos[b], exatos[a]) || a - b);
  const partes = [...pisos];
  for (const i of ordem.slice(0, faltam)) partes[i] += 1;
  return partes;
}

// --------------------------------------------------------------------- tipos

export type NaturezaDaBarra = "tipo" | "sem_tipo" | "fixo";

/** Uma barra: um Tipo, "Sem tipo" ou o "Valor fixo do Bloco". */
export type BarraDoMeuGasto = {
  /** O id do Tipo, `"sem"` ou `"fixo"`. */
  chave: string;
  natureza: NaturezaDaBarra;
  /** O id do Tipo; `null` em "Sem tipo" e no valor fixo. */
  tipoId: string | null;
  nome: string;
  arquivado: boolean;
  /** A parte do Tipo no valor do Bloco, em centavos; a soma de todas as barras é o valor do Bloco. */
  centavos: number;
  /** A fatia do total do Bloco, em % inteira (a soma é 100); `null` quando o total não é maior que zero. */
  percentual: number | null;
};

export type MeuGastoDoMes =
  /** Nenhum Bloco marcado "É o meu Bloco": "Escolha qual Bloco representa o seu gasto". */
  | { estado: "sem_bloco" }
  /** A Fórmula não calcula (valor grande demais) ou não se reparte por Tipo: o `codigo` diz a razão. */
  | { estado: "sem_valor"; bloco: Pick<Bloco, "id" | "nome" | "formula">; codigo: string }
  | {
      estado: "ok";
      mes: string;
      bloco: Pick<Bloco, "id" | "nome" | "formula">;
      /** O valor do "meu Bloco" naquele Mês: o do cartão do Painel. */
      totalCentavos: number;
      /** Do maior para o menor valor; o "Valor fixo do Bloco", se houver, por último. */
      barras: BarraDoMeuGasto[];
      /** A maior barra positiva (a escala da tela); 0 se nenhuma. */
      maiorBarraCentavos: number;
      /** Algum previsto entra na conta: a tela diz "inclui previstos", como o Bloco do Painel. */
      incluiPrevistos: boolean;
      /** O Mês não tem Lançamento nenhum (nem para outro Bloco). */
      mesVazio: boolean;
    };

/** O que a aba lê de um Lançamento: as colunas que `projetarPainel` usa. */
export type LancamentoParaMeuGasto = LancamentoParaProjetar;

export type OpcoesDoMeuGasto = {
  mes: string;
  /** Os Blocos lidos (`lerBlocos`). */
  blocos: readonly Bloco[];
  tipos: readonly Tipo[];
  /** `AAAA-MM` das `faturas`: um Mês sem Fatura tem as Contas manuais como previstos (o "inclui previstos"). */
  mesesComFatura: readonly string[];
};

const SEM = "sem";
const FIXO = "fixo";

type Item = Omit<BarraDoMeuGasto, "centavos" | "percentual"> & { exato: Racional };

const doMesmoNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

/** A ordem de preferência dos empates: os Tipos por nome e id, "Sem tipo" depois e o valor fixo por último. */
function compararPreferencia(a: Item, b: Item): number {
  const posicao = (i: Item) => (i.natureza === "tipo" ? 0 : i.natureza === "sem_tipo" ? 1 : 2);
  return posicao(a) - posicao(b) || doMesmoNome(a, b) || (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0);
}

function semValor(bloco: Pick<Bloco, "id" | "nome" | "formula">, codigo: string): MeuGastoDoMes {
  return { estado: "sem_valor", bloco: { id: bloco.id, nome: bloco.nome, formula: bloco.formula }, codigo };
}

/** O "meu Bloco": o marcado, ou o de menor `ordem` se houver mais de um; `null` sem nenhum. */
export function acharMeuBloco(blocos: readonly Bloco[]): Bloco | null {
  const marcados = blocos.filter((b) => b.meu_bloco).sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return marcados[0] ?? null;
}

/**
 * O "meu Bloco" de um Mês repartido por Tipo. Sem Bloco marcado: `sem_bloco`. Fórmula que não calcula (ou que não se
 * reparte): `sem_valor` com o código (`formula.valor_grande`, `meu_gasto.nao_reparte`). Senão, as barras do maior para o
 * menor, que somam exatamente o valor do Bloco naquele Mês.
 */
export function projetarMeuGasto(linhas: readonly LancamentoParaMeuGasto[], opcoes: OpcoesDoMeuGasto): MeuGastoDoMes {
  const bloco = acharMeuBloco(opcoes.blocos);
  if (bloco === null) return { estado: "sem_bloco" };

  const projecao = projetarPainel(linhas, opcoes.mes);
  const previstos = idsDosPrevistos(linhas, opcoes.mes, opcoes.mesesComFatura.includes(opcoes.mes));
  const resumo = resumirBloco(bloco, projecao, previstos);
  const doBloco = resumo.avaliacao;
  if (doBloco === null) {
    const erro = avaliar(bloco.formula, projecao);
    return semValor(bloco, erro.ok ? "formula.valor_grande" : erro.erro.codigo);
  }

  try {
    const itens = itensDoMeuGasto(bloco.formula, projecao, doBloco, opcoes.tipos);
    if (itens === null) return semValor(bloco, "meu_gasto.nao_reparte");

    // `repartir` recebe os itens na ordem de preferência dos empates.
    const preferidos = [...itens].sort(compararPreferencia);
    const centavos = repartir(
      preferidos.map((i) => i.exato),
      doBloco.valorCentavos,
    );
    const comValor = preferidos
      .map((item, i) => ({ item, centavos: centavos[i], ordem: i }))
      .filter((x) => x.centavos !== 0)
      // Do maior para o menor; o empate segue a ordem de preferência; o valor fixo fica por último.
      .sort(
        (a, b) =>
          Number(a.item.natureza === "fixo") - Number(b.item.natureza === "fixo") ||
          b.centavos - a.centavos ||
          a.ordem - b.ordem,
      );

    const total = doBloco.valorCentavos;
    const percentuais =
      total > 0 && comValor.length > 0
        ? repartir(
            comValor.map((x) => racional(BigInt(x.centavos) * BigInt(100), BigInt(total))),
            100,
          )
        : null;

    const barras: BarraDoMeuGasto[] = comValor.map(({ item, centavos: c }, i) => ({
      chave: item.chave,
      natureza: item.natureza,
      tipoId: item.tipoId,
      nome: item.nome,
      arquivado: item.arquivado,
      centavos: c,
      percentual: percentuais === null ? null : percentuais[i],
    }));

    return {
      estado: "ok",
      mes: opcoes.mes,
      bloco: { id: bloco.id, nome: bloco.nome, formula: bloco.formula },
      totalCentavos: total,
      barras,
      maiorBarraCentavos: barras.reduce((maior, b) => Math.max(maior, b.centavos), 0),
      incluiPrevistos: resumo.incluiPrevistos,
      mesVazio: projecao.length === 0,
    };
  } catch {
    return semValor(bloco, "formula.valor_grande");
  }
}

/**
 * Um item por Tipo presente nas linhas (mais "Sem tipo" e, se houver, o valor fixo), cada um com o valor exato que
 * contribui ao Bloco. `null` quando a Fórmula não se reparte (a soma das contribuições mais a parte fixa não dá o valor
 * do Bloco, ou alguma avaliação falha).
 */
function itensDoMeuGasto(
  formula: Formula,
  projecao: readonly LinhaDaFormula[],
  doBloco: Avaliacao,
  tipos: readonly Tipo[],
): Item[] | null {
  const cadastro = new Map(tipos.map((t) => [t.id, t]));
  const grupos = new Map<string, LinhaDaFormula[]>();
  for (const l of projecao) {
    const chave = l.tipo_id !== null && cadastro.has(l.tipo_id) ? l.tipo_id : SEM;
    const lista = grupos.get(chave) ?? [];
    lista.push(l);
    grupos.set(chave, lista);
  }

  const semLinhas = avaliar(formula, []);
  if (!semLinhas.ok) return null;
  const fixo = exatoDe(semLinhas.valor);

  const itens: Item[] = [];
  let soma = racional(ZERO);
  for (const [chave, doTipo] of grupos) {
    const avaliado = avaliar(formula, doTipo);
    if (!avaliado.ok) return null;
    const exato = subtrair(exatoDe(avaliado.valor), fixo);
    soma = somar(soma, exato);
    const tipo = chave === SEM ? undefined : cadastro.get(chave);
    itens.push({
      chave,
      natureza: tipo === undefined ? "sem_tipo" : "tipo",
      tipoId: tipo === undefined ? null : tipo.id,
      nome: tipo === undefined ? TEXTOS_PREVISAO.sem_tipo : tipo.nome,
      arquivado: tipo?.arquivado ?? false,
      exato,
    });
  }

  // O que sobra do valor do Bloco depois dos Tipos é a parte fixa (K). Uma Fórmula afim sempre fecha.
  const sobra = subtrair(exatoDe(doBloco), soma);
  if (comparar(sobra, fixo) !== 0) return null;
  if (sobra.n !== ZERO) {
    itens.push({ chave: FIXO, natureza: "fixo", tipoId: null, nome: TEXTOS_PREVISAO.meu_gasto_fixo, arquivado: false, exato: sobra });
  }
  return itens;
}
