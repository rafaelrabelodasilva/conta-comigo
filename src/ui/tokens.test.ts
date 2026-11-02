import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compor, contraste, lerHex, lerTokens, type Tokens } from "./contraste";

// Lê o próprio globals.css (fonte única dos tokens) e o DESIGN.md (fonte
// da verdade dos valores) e mede o contraste dos pares usados nas telas.

const raiz = new URL("../../", import.meta.url);
const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(caminho, raiz)), "utf8");

const css = ler("src/app/globals.css");
const design = ler(
  "_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/DESIGN.md",
);
const { claro, escuro } = lerTokens(css);

/** Cores do bloco `colors:` do frontmatter do DESIGN.md. */
function coresDoDesign(texto: string): Record<string, string> {
  const inicio = texto.indexOf("\ncolors:");
  const fim = texto.indexOf("\ntypography:", inicio);
  const bloco = texto.slice(inicio, fim);
  const cores: Record<string, string> = {};
  for (const [, nome, valor] of bloco.matchAll(/^\s+([a-z0-9-]+):\s*'(#[0-9A-Fa-f]+)'/gm)) {
    cores[nome] = valor;
  }
  return cores;
}

const cores = coresDoDesign(design);
const nomesBase = Object.keys(cores).filter((n) => !n.endsWith("-dark"));

describe("tokens do DESIGN.md no globals.css", () => {
  it("lê as cores do DESIGN.md", () => {
    expect(nomesBase.length).toBeGreaterThan(50);
    expect(nomesBase).toContain("person-8-bg");
  });

  it.each(nomesBase)("%s existe nos dois modos com o valor do DESIGN.md", (nome) => {
    const valorClaro = cores[nome];
    const valorEscuro = cores[`${nome}-dark`] ?? valorClaro;
    expect(claro[nome], `--${nome} no claro`).toBeDefined();
    expect(escuro[nome], `--${nome} no escuro`).toBeDefined();
    expect(lerHex(claro[nome])).toEqual(lerHex(valorClaro));
    expect(lerHex(escuro[nome])).toEqual(lerHex(valorEscuro));
  });

  it("o tema do Tailwind tira a paleta padrão", () => {
    expect(css).toMatch(/--color-\*:\s*initial/);
  });
});

type Par = { frente: string; fundo: string; sobre?: string };

/** Contraste do par num modo. Fundos com transparência são compostos sobre `sobre` (padrão: surface). */
function medir(tokens: Tokens, { frente, fundo, sobre = "surface" }: Par): number {
  const base = lerHex(tokens[sobre]);
  const corFundo = compor(lerHex(tokens[fundo]), base);
  const corFrente = compor(lerHex(tokens[frente]), corFundo);
  return contraste(corFrente, corFundo);
}

const PARES_TEXTO: Par[] = [
  { frente: "text", fundo: "background" },
  { frente: "text", fundo: "surface" },
  { frente: "text-muted", fundo: "background" },
  { frente: "text-muted", fundo: "surface" },
  { frente: "accent-foreground", fundo: "accent" },
  { frente: "accent", fundo: "surface" },
  { frente: "accent", fundo: "background" },
  { frente: "nav-label", fundo: "nav" },
  { frente: "on-dark", fundo: "nav" },
  { frente: "on-dark", fundo: "nav-active", sobre: "nav" },
  { frente: "on-verify", fundo: "verify" },
  { frente: "danger-fg", fundo: "surface" },
  { frente: "danger-fg", fundo: "danger-bg" },
  { frente: "text", fundo: "alert-warning-bg" },
  { frente: "text", fundo: "selection" },
  { frente: "forecast-fg", fundo: "forecast-bg" },
  ...["paid", "unpaid", "partial", "late"].map((s) => ({
    frente: `status-${s}-fg`,
    fundo: `status-${s}-bg`,
  })),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    frente: `person-${n}-fg`,
    fundo: `person-${n}-bg`,
  })),
];

const PARES_GRAFICOS: Par[] = [
  { frente: "nav-icon-idle", fundo: "nav" },
  { frente: "accent-line", fundo: "surface" },
  { frente: "focus-ring", fundo: "background" },
  { frente: "focus-ring", fundo: "surface" },
  { frente: "focus-ring", fundo: "nav" },
  { frente: "verify", fundo: "surface" },
];

const nome = ({ frente, fundo }: Par) => `${frente} / ${fundo}`;

describe.each([
  ["claro", claro],
  ["escuro", escuro],
] as const)("contraste no modo %s", (_modo, tokens) => {
  it.each(PARES_TEXTO.map((p) => [nome(p), p] as const))("texto %s ≥ 4,5:1", (_n, par) => {
    expect(medir(tokens, par)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PARES_GRAFICOS.map((p) => [nome(p), p] as const))(
    "borda/ícone %s ≥ 3:1",
    (_n, par) => {
      expect(medir(tokens, par)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("contraste (funções puras)", () => {
  const branco = lerHex(claro["surface"]);
  const preto = { r: 0, g: 0, b: 0, a: 1 };

  it("branco sobre preto é 21:1 e a ordem não importa", () => {
    expect(contraste(branco, preto)).toBeCloseTo(21, 5);
    expect(contraste(preto, branco)).toBeCloseTo(21, 5);
  });

  it("lê hex curto, longo e com alfa", () => {
    expect(lerHex(claro["selection"]).a).toBeCloseTo(0x14 / 255, 5);
    expect(() => lerHex("azul")).toThrow();
  });

  it("composição com alfa 0 devolve o fundo e com alfa 1 a frente", () => {
    expect(compor({ ...preto, a: 0 }, branco)).toEqual(branco);
    expect(compor(preto, branco)).toEqual(preto);
  });

  it("o escuro herda do claro o que não redefine", () => {
    expect(escuro["person-1"]).toBe(claro["person-1"]);
    expect(escuro["background"]).not.toBe(claro["background"]);
  });
});
