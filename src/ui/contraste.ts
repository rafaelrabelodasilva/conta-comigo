// Funções puras de cor: leitura dos tokens do `globals.css`, composição de
// cores com transparência e contraste WCAG 2.x. Usadas pelo teste de
// contraste (`tokens.test.ts`); não dependem de DOM nem de Node.

/** Cor RGB de 0 a 255 com alfa de 0 a 1. */
export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Lê `#rgb`, `#rgba`, `#rrggbb` ou `#rrggbbaa`. Outro formato lança erro. */
export function lerHex(valor: string): Rgba {
  const casamento = HEX.exec(valor.trim());
  if (!casamento) throw new Error(`Cor inválida: ${valor}`);
  let hex = casamento[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  const canal = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return {
    r: canal(0),
    g: canal(1),
    b: canal(2),
    a: hex.length === 8 ? canal(3) / 255 : 1,
  };
}

/** Compõe `frente` (talvez transparente) sobre `fundo` opaco. */
export function compor(frente: Rgba, fundo: Rgba): Rgba {
  if (fundo.a !== 1) throw new Error("O fundo da composição precisa ser opaco.");
  const mistura = (f: number, b: number) => f * frente.a + b * (1 - frente.a);
  return {
    r: mistura(frente.r, fundo.r),
    g: mistura(frente.g, fundo.g),
    b: mistura(frente.b, fundo.b),
    a: 1,
  };
}

function linear(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (WCAG 2.x) de uma cor opaca. */
export function luminancia(cor: Rgba): number {
  if (cor.a !== 1) throw new Error("Componha a cor antes de medir a luminância.");
  return 0.2126 * linear(cor.r) + 0.7152 * linear(cor.g) + 0.0722 * linear(cor.b);
}

/** Razão de contraste entre duas cores opacas (de 1 a 21). */
export function contraste(a: Rgba, b: Rgba): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Tokens = Readonly<Record<string, string>>;

function declaracoes(bloco: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const regex = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const [, nome, valor] of bloco.matchAll(regex)) saida[nome] = valor.trim();
  return saida;
}

/** Conteúdo entre a chave que abre em `inicio` e a que fecha par com ela. */
function blocoDesde(css: string, inicio: number): string {
  const abre = css.indexOf("{", inicio);
  if (abre < 0) return "";
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") nivel++;
    else if (css[i] === "}" && --nivel === 0) return css.slice(abre + 1, i);
  }
  return css.slice(abre + 1);
}

function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Tokens de cor resolvidos em cada modo, a partir do texto do `globals.css`:
 * o claro é o primeiro `:root { … }` de nível superior; o escuro é o claro
 * sobrescrito pelo `:root` dentro de `@media (prefers-color-scheme: dark)`.
 */
export function lerTokens(cssBruto: string): { claro: Tokens; escuro: Tokens } {
  const css = semComentarios(cssBruto);
  const raiz = /(^|\n)\s*:root\s*\{/.exec(css);
  if (!raiz) throw new Error("globals.css sem :root.");
  const claro = declaracoes(blocoDesde(css, raiz.index));

  const midia = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(css);
  if (!midia) throw new Error("globals.css sem o modo escuro.");
  const dentro = blocoDesde(css, midia.index);
  const raizEscura = /:root\s*\{/.exec(dentro);
  const escuro = raizEscura ? declaracoes(blocoDesde(dentro, raizEscura.index)) : {};

  return { claro, escuro: { ...claro, ...escuro } };
}
