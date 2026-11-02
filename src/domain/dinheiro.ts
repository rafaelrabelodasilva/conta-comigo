// Dinheiro em centavos inteiros (AD-2). Formatação montada à mão, sem o
// `Intl` direto: "R$ 1.140,74" e "- R$ 0,08", com espaço inseparável.
// A leitura aceita o que se digita num campo ("1,50", "R$ 1.140,74", "2").

import type { Resultado } from "./resultado";

/** Espaço inseparável: "R$" e o número nunca quebram de linha. */
export const ESPACO = "\u00a0";

function milhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "R$ 1.140,74"; negativos "- R$ 0,08". `centavos` precisa ser inteiro. */
export function formatarReais(centavos: number): string {
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
