import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regra "sem cor literal": só `src/app/globals.css` define cores. Todo o
// resto usa as classes dos tokens (`bg-surface`, `text-danger-fg`…).

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(RAIZ, "src");
const UNICO_COM_COR = join("src", "app", "globals.css");

const PALETA_PADRAO =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITARIOS_DE_COR =
  "bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|placeholder|accent|caret|decoration|shadow|inset-shadow|inset-ring";

const REGRAS: { nome: string; regex: RegExp }[] = [
  { nome: "cor hexadecimal", regex: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi },
  { nome: "função de cor", regex: /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/gi },
  {
    nome: "classe da paleta padrão",
    regex: new RegExp(
      `(?<![\\w-])(?:[\\w-]+:)*(?:${UTILITARIOS_DE_COR})-(?:(?:${PALETA_PADRAO})-(?:50|[1-9]00|950)|white|black)(?:\\/\\d+)?(?![\\w-])`,
      "g",
    ),
  },
];

/** Trechos com cor literal no texto (vazio = limpo). */
function coresLiterais(texto: string): string[] {
  return REGRAS.flatMap(({ nome, regex }) =>
    [...texto.matchAll(regex)].map((m) => `${nome}: ${m[0]}`),
  );
}

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx|css)$/.test(e.name) ? [caminho] : [];
  });
}

describe("detector de cor literal", () => {
  it("acha classe da paleta padrão num Client Component", () => {
    const componente = `"use client";\nexport function X() { return <div className="p-2 bg-red-500" />; }`;
    expect(coresLiterais(componente)).toEqual(["classe da paleta padrão: bg-red-500"]);
  });

  it("acha variantes, opacidade, branco e preto", () => {
    expect(coresLiterais(`"hover:text-blue-600 border-t-gray-200/50"`)).toHaveLength(2);
    expect(coresLiterais(`"text-white bg-black"`)).toHaveLength(2);
  });

  it("acha hex e funções de cor", () => {
    expect(coresLiterais(`color: #fff;`)).toHaveLength(1);
    expect(coresLiterais(`style={{ color: "#16A34A14" }}`)).toHaveLength(1);
    expect(coresLiterais(`"bg-[#123456]"`)).toHaveLength(1);
    expect(coresLiterais(`background: rgb(0 0 0); color: hsl(0 0% 0%)`)).toHaveLength(2);
  });

  it("não acusa tokens nem texto comum", () => {
    expect(
      coresLiterais(
        `"bg-accent text-accent-foreground border-danger-fg text-text-muted bg-person-3-bg ring-focus-ring"`,
      ),
    ).toEqual([]);
    expect(coresLiterais(`// passo #12, "Tentar de novo", red flag, ${"to"}-do`)).toEqual([]);
  });
});

describe("sem cor literal em src", () => {
  const lista = arquivos(SRC).filter((a) => relative(RAIZ, a) !== UNICO_COM_COR);

  it("varre os arquivos de src", () => {
    expect(lista.length).toBeGreaterThan(10);
    expect(lista.some((a) => a.endsWith(`${sep}NavRail.tsx`))).toBe(true);
  });

  it.each(lista.map((a) => [relative(RAIZ, a), a]))("%s não tem cor literal", (_nome, arquivo) => {
    expect(coresLiterais(readFileSync(arquivo, "utf8"))).toEqual([]);
  });
});
