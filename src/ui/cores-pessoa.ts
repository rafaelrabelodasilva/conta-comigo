// Classes das 8 cores de pessoa (tokens `person-N`). Escritas por extenso
// para o Tailwind encontrá-las. O número da cor (1..8) vem do núcleo.

export type ClassesPessoa = {
  /** Cor pura: círculo do seletor, bolinha do Bloco, barra. */
  fundo: string;
  /** Anel em volta da cor escolhida. */
  anel: string;
  /** Etiqueta (`person-tag`): par fg/bg próprio de cada modo. */
  etiqueta: string;
};

export const CLASSES_PESSOA: Readonly<Record<number, ClassesPessoa>> = {
  1: { fundo: "bg-person-1", anel: "ring-person-1", etiqueta: "bg-person-1-bg text-person-1-fg" },
  2: { fundo: "bg-person-2", anel: "ring-person-2", etiqueta: "bg-person-2-bg text-person-2-fg" },
  3: { fundo: "bg-person-3", anel: "ring-person-3", etiqueta: "bg-person-3-bg text-person-3-fg" },
  4: { fundo: "bg-person-4", anel: "ring-person-4", etiqueta: "bg-person-4-bg text-person-4-fg" },
  5: { fundo: "bg-person-5", anel: "ring-person-5", etiqueta: "bg-person-5-bg text-person-5-fg" },
  6: { fundo: "bg-person-6", anel: "ring-person-6", etiqueta: "bg-person-6-bg text-person-6-fg" },
  7: { fundo: "bg-person-7", anel: "ring-person-7", etiqueta: "bg-person-7-bg text-person-7-fg" },
  8: { fundo: "bg-person-8", anel: "ring-person-8", etiqueta: "bg-person-8-bg text-person-8-fg" },
};

/**
 * Token do ✓ sobre a cor pura. `nav` tem contraste ≥ 3:1 sobre as 8 cores
 * nos dois modos (medido em `tokens.test.ts`); o branco falha no âmbar.
 */
export const TOKEN_MARCA_PESSOA = "nav";
export const CLASSE_MARCA_PESSOA = "text-nav";

export function classesPessoa(cor: number): ClassesPessoa {
  return CLASSES_PESSOA[cor] ?? CLASSES_PESSOA[1];
}
