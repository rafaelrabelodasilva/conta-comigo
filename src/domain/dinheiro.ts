// Dinheiro em centavos inteiros (AD-2). Formatação montada à mão, sem o
// `Intl` direto: "R$ 1.140,74" e "- R$ 0,08", com espaço inseparável.
// A leitura aceita o que se digita num campo ("1,50", "R$ 1.140,74", "2").
// `arredondar` é a única função de arredondamento do núcleo; a divisão em
// partes (`dividirEmPartes`) usa só ela.

import type { Resultado } from "./resultado";

/** Espaço inseparável: "R$" e o número nunca quebram de linha. */
export const ESPACO = "\u00a0";

function milhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "R$ 1.140,74"; negativos "- R$ 0,08". `centavos` precisa ser inteiro. */
export function formatarDinheiro(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new Error(`Centavos inválidos: ${centavos}`);
  const absoluto = Math.abs(centavos);
  const reais = milhares(String(Math.floor(absoluto / 100)));
  const resto = String(absoluto % 100).padStart(2, "0");
  const texto = `R$${ESPACO}${reais},${resto}`;
  return centavos < 0 ? `-${ESPACO}${texto}` : texto;
}

// Com vírgula decimal (pontos de milhar opcionais), só inteiro, ou ponto
// decimal com 1 ou 2 casas ("1.50"). "1.500" é mil e quinhentos.
const COM_MILHAR = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;
const PONTO_DECIMAL = /^(\d+)\.(\d{1,2})$/;

/** Lê um valor em reais digitado e devolve centavos. */
export function lerReais(texto: string): Resultado<number> {
  let limpo = texto.replace(/[\s\u00a0]/g, "");
  let negativo = false;
  if (limpo.startsWith("-")) {
    negativo = true;
    limpo = limpo.slice(1);
  }
  if (/^r\$/i.test(limpo)) limpo = limpo.slice(2);

  let inteiro: string;
  let fracao: string;
  const ponto = PONTO_DECIMAL.exec(limpo);
  const virgula = COM_MILHAR.exec(limpo);
  if (ponto) {
    inteiro = ponto[1];
    fracao = ponto[2];
  } else if (virgula) {
    inteiro = virgula[1].replace(/\./g, "");
    fracao = virgula[2] ?? "";
  } else {
    return { ok: false, erro: { codigo: "dinheiro.invalido" } };
  }

  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return { ok: false, erro: { codigo: "dinheiro.invalido" } };
  return { ok: true, valor: negativo && centavos !== 0 ? -centavos : centavos };
}

// Valor como a Fatura escreve: sempre 2 casas com vírgula, milhar com ponto
// opcional e `-` opcional na frente ("1.140,74", "-0,08", "8327,39").
const VALOR_FATURA = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;

/** Diz se o texto está no formato estrito de valor da Fatura (`paraCentavos`). */
export function ehValorDeFatura(texto: string): boolean {
  return VALOR_FATURA.test(texto.trim());
}

/**
 * Converte um valor no formato estrito da Fatura em centavos. Diferente de
 * `lerReais` (campo digitado), não aceita "R$", ponto decimal nem casas
 * faltando: o que vem da extração tem de estar exatamente assim.
 */
export function paraCentavos(texto: string): Resultado<number> {
  const partes = VALOR_FATURA.exec(texto.trim());
  if (!partes) return { ok: false, erro: { codigo: "dinheiro.invalido" } };
  const [, sinal, inteiro, fracao] = partes;
  const centavos = Number(inteiro.replace(/\./g, "")) * 100 + Number(fracao);
  if (!Number.isSafeInteger(centavos)) return { ok: false, erro: { codigo: "dinheiro.invalido" } };
  return { ok: true, valor: sinal && centavos !== 0 ? -centavos : centavos };
}

/**
 * A única função de arredondamento do núcleo (AD-2): `numerador /
 * denominador` arredondado meio para longe do zero (0,5 → 1; -0,5 → -1).
 * A conta só é exata com dois inteiros (resto inteiro, sem fração em ponto
 * flutuante); com fração, usa o quociente em ponto flutuante. `denominador`
 * precisa ser maior que zero; resultado fora dos inteiros seguros lança.
 */
export function arredondar(numerador: number, denominador = 1): number {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador) || denominador <= 0) {
    throw new Error(`Arredondamento inválido: ${numerador}/${denominador}`);
  }
  const sinal = numerador < 0 ? -1 : 1;
  const absoluto = Math.abs(numerador);
  let inteiro: number;
  let meioOuMais: boolean;
  if (Number.isSafeInteger(absoluto) && Number.isSafeInteger(denominador)) {
    const resto = absoluto % denominador;
    inteiro = (absoluto - resto) / denominador;
    meioOuMais = resto * 2 >= denominador;
  } else {
    const quociente = absoluto / denominador;
    if (!Number.isFinite(quociente)) {
      throw new Error(`Arredondamento inválido: ${numerador}/${denominador}`);
    }
    inteiro = Math.floor(quociente);
    meioOuMais = quociente - inteiro >= 0.5;
  }
  const resultado = meioOuMais ? inteiro + 1 : inteiro;
  if (!Number.isSafeInteger(resultado)) {
    throw new Error(`Arredondamento fora dos inteiros seguros: ${numerador}/${denominador}`);
  }
  return resultado === 0 ? 0 : sinal * resultado;
}

/** Fração de uma divisão: inteiros, `numerador` e `denominador` > 0. */
export type Fracao = { numerador: number; denominador: number };

function fracaoValida(f: Fracao): boolean {
  return (
    Number.isSafeInteger(f.numerador) &&
    Number.isSafeInteger(f.denominador) &&
    f.numerador > 0 &&
    f.denominador > 0
  );
}

/** Diz se as frações somam exatamente 1 (conta em inteiros grandes). */
function somaUm(fracoes: readonly Fracao[]): boolean {
  let num = BigInt(0);
  let den = BigInt(1);
  for (const f of fracoes) {
    const d = BigInt(f.denominador);
    num = num * d + BigInt(f.numerador) * den;
    den = den * d;
  }
  return num === den;
}

/**
 * Divide `valorCentavos` nas `fracoes` (AD-2): cada parte, menos a última, é
 * `arredondar(valor × n, d)`; a última recebe `valor − soma das outras`, e
 * a soma das partes é sempre o valor. Monjaro: 46600 em 2/3 + 1/3 =
 * [31067, 15533]. Lista vazia, fração inválida ou soma diferente de 1 →
 * `divisao.fracoes_invalidas`.
 */
export function dividirEmPartes(valorCentavos: number, fracoes: readonly Fracao[]): Resultado<number[]> {
  if (!Number.isSafeInteger(valorCentavos)) throw new Error(`Centavos inválidos: ${valorCentavos}`);
  if (fracoes.length === 0 || !fracoes.every(fracaoValida) || !somaUm(fracoes)) {
    return { ok: false, erro: { codigo: "divisao.fracoes_invalidas" } };
  }
  const partes: number[] = [];
  let soma = 0;
  for (const f of fracoes.slice(0, -1)) {
    const produto = valorCentavos * f.numerador;
    if (!Number.isSafeInteger(produto)) throw new Error(`Valor grande demais para dividir: ${valorCentavos}`);
    const parte = arredondar(produto, f.denominador);
    partes.push(parte);
    soma += parte;
  }
  partes.push(valorCentavos - soma);
  return { ok: true, valor: partes };
}

// ------------------------------------------------- racional exato (Fórmula)

// Os intermediários de uma Fórmula (Bloco) são racionais exatos
// (`numerador / denominador`, em centavos, `bigint`). Só o resultado final
// passa por `arredondarRacional`, com a mesma regra de `arredondar`: meio
// para longe do zero. Sem literais `0n`: o alvo do TypeScript é ES2017.

const ZERO = BigInt(0);
const UM = BigInt(1);
const DOIS = BigInt(2);
const CINCO = BigInt(5);
const DEZ = BigInt(10);
const CEM = BigInt(100);
const MAIOR_INTEIRO_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);

/** Máximo de casas decimais que um valor exato mostra; mais que isso sai aproximado. */
const MAX_CASAS_EXATAS = 6;
/** Casas de um valor aproximado (que não termina em decimal). */
const CASAS_APROXIMADO = 3;

function mdcBig(a: bigint, b: bigint): bigint {
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}

/**
 * `numerador / denominador` arredondado meio para longe do zero (0,5 → 1;
 * -0,5 → -1). `denominador` precisa ser maior que zero; resultado fora dos
 * inteiros seguros lança, como `arredondar`.
 */
export function arredondarRacional(numerador: bigint, denominador: bigint): number {
  if (denominador <= ZERO) throw new Error(`Arredondamento inválido: ${numerador}/${denominador}`);
  const negativo = numerador < ZERO;
  const absoluto = negativo ? -numerador : numerador;
  const quociente = absoluto / denominador;
  const resto = absoluto % denominador;
  const arredondado = resto * DOIS >= denominador ? quociente + UM : quociente;
  if (arredondado > MAIOR_INTEIRO_SEGURO) {
    throw new Error(`Arredondamento fora dos inteiros seguros: ${numerador}/${denominador}`);
  }
  const resultado = Number(arredondado);
  return resultado === 0 ? 0 : negativo ? -resultado : resultado;
}

/** O valor em casas decimais: `inteiro` e `fracao` (texto), exato ou aproximado a 3 casas. */
function emDecimal(
  numerador: bigint,
  denominador: bigint,
  minimoDeCasas: number,
): { negativo: boolean; inteiro: bigint; fracao: string; aproximado: boolean } {
  const negativo = numerador < ZERO;
  const absoluto = negativo ? -numerador : numerador;
  const g = mdcBig(absoluto, denominador);
  const n = g === ZERO ? ZERO : absoluto / g;
  const d = g === ZERO ? UM : denominador / g;
  // Termina em decimal quando o denominador só tem os fatores 2 e 5.
  let resto = d;
  let dois = 0;
  let cinco = 0;
  while (resto % DOIS === ZERO) {
    resto /= DOIS;
    dois++;
  }
  while (resto % CINCO === ZERO) {
    resto /= CINCO;
    cinco++;
  }
  const exato = resto === UM && Math.max(dois, cinco) <= MAX_CASAS_EXATAS;
  const casas = exato ? Math.max(dois, cinco, minimoDeCasas) : CASAS_APROXIMADO;
  const escala = DEZ ** BigInt(casas);
  let escalado = (n * escala) / d;
  if (!exato && ((n * escala) % d) * DOIS >= d) escalado += UM;
  return {
    negativo: negativo && escalado !== ZERO,
    inteiro: escalado / escala,
    fracao: casas === 0 ? "" : String(escalado % escala).padStart(casas, "0"),
    aproximado: !exato,
  };
}

/**
 * Um valor em centavos que pode ter fração ("R$ 2.819,675" para 281967,5
 * centavos), com as casas que precisar (no mínimo 2). Um valor que não
 * termina em decimal sai aproximado, com "≈" na frente ("≈ R$ 1.666,667").
 */
export function formatarRacionalEmReais(numerador: bigint, denominador: bigint): string {
  // Reais = centavos / 100.
  const d = emDecimal(numerador, denominador * CEM, 2);
  const texto = `R$${ESPACO}${milhares(String(d.inteiro))},${d.fracao}`;
  const comAproximacao = d.aproximado ? `≈${ESPACO}${texto}` : texto;
  return d.negativo ? `-${ESPACO}${comAproximacao}` : comAproximacao;
}

/** Um número sem unidade ("2", "0,5", "≈ 0,333"), com as casas que precisar. */
export function formatarRacionalDecimal(numerador: bigint, denominador: bigint): string {
  const d = emDecimal(numerador, denominador, 0);
  const inteiro = milhares(String(d.inteiro));
  const corpo = d.fracao === "" ? inteiro : `${inteiro},${d.fracao}`;
  const comAproximacao = d.aproximado ? `≈${ESPACO}${corpo}` : corpo;
  return d.negativo ? `-${comAproximacao}` : comAproximacao;
}
