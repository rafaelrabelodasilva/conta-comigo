// Garante a regra AD-2 / NFR4: fora de src/domain/dinheiro.ts e
// src/domain/datas.ts, o lint recusa formatar dinheiro ou data por conta
// própria (Intl.*Format, globalThis.Intl, toLocale*String, toFixed, toPrecision,
// toExponential).
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

async function errosDeFormato(codigo: string, arquivo: string) {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  return resultado.messages.filter((m) => m.ruleId === "no-restricted-properties");
}

const PROIBIDOS = [
  "export const a = (n: number) => n.toFixed(2);",
  'export const b = new Intl.NumberFormat("pt-BR");',
  'export const c = new Intl.DateTimeFormat("pt-BR");',
  "export const d = (n: number) => n.toLocaleString();",
  "export const e = (x: Date) => x.toLocaleDateString();",
  "export const f = (x: Date) => x.toLocaleTimeString();",
  'export const g = new globalThis.Intl.NumberFormat("pt-BR");',
  "export const h = (n: number) => n.toPrecision(3);",
  "export const i = (n: number) => n.toExponential(2);",
];

describe("lint dos formatos (AD-2)", () => {
  it.each(PROIBIDOS)("recusa em src/features/x.tsx: %s", async (linha) => {
    expect(await errosDeFormato(`${linha}\n`, "src/features/x.tsx")).toHaveLength(1);
  });

  it.each(PROIBIDOS)("recusa em src/domain/x.ts: %s", async (linha) => {
    expect(await errosDeFormato(`${linha}\n`, "src/domain/x.ts")).toHaveLength(1);
  });

  it("a mensagem aponta para os formatadores", async () => {
    const [erro] = await errosDeFormato("export const a = (n: number) => n.toFixed(2);\n", "src/ui/x.ts");
    expect(erro.message).toContain("formatarDinheiro");
    expect(erro.message).toContain("src/domain/datas.ts");
  });

  it.each(["src/domain/dinheiro.ts", "src/domain/datas.ts"])("aceita em %s", async (arquivo) => {
    expect(await errosDeFormato(`${PROIBIDOS.join("\n")}\n`, arquivo)).toHaveLength(0);
  });
});
