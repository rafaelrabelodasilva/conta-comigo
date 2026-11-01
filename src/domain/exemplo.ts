// Exemplo do formato do núcleo: função pura, sem efeitos, com resultado
// `{ ok, valor }` ou `{ ok: false, erro: { codigo, detalhe } }`.
// Substituir pelas regras reais nas próximas histórias.

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: { codigo: string; detalhe?: string } };

const FORA_DO_INTERVALO = {
  ok: false,
  erro: { codigo: "centavos_invalido", detalhe: "valor fora do intervalo seguro" },
} as const;

/**
 * Soma valores em centavos (inteiros). Recusa valores não inteiros e
 * valores ou totais fora do intervalo de inteiros seguros.
 */
export function somarCentavos(valores: readonly number[]): Resultado<number> {
  let total = 0;
  for (const v of valores) {
    if (!Number.isInteger(v)) {
      return {
        ok: false,
        erro: { codigo: "centavos_invalido", detalhe: "valor não inteiro" },
      };
    }
    if (!Number.isSafeInteger(v)) return FORA_DO_INTERVALO;
    total += v;
    if (!Number.isSafeInteger(total)) return FORA_DO_INTERVALO;
  }
  return { ok: true, valor: total };
}
