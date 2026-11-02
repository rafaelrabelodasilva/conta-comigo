import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Dois caminhos que diferem só em maiúsculas (ex.: `Toast.tsx` e `toast.ts`)
// funcionam no Linux do CI, mas quebram `tsc` e `vitest` no macOS, cujo
// disco não diferencia maiúsculas. Nenhum par assim pode existir em `src/`
// nem em `test/`. A comparação ignora a extensão de código (.ts, .tsx…),
// porque o import `./toast` não a escreve: foi esse o conflito da 1.5.

const EXTENSAO_DE_CODIGO = /\.(?:[cm]?[jt]sx?)$/i;

/** Chave de comparação: sem maiúsculas e sem a extensão de código. */
export function chaveDoCaminho(caminho: string): string {
  return caminho.toLowerCase().replace(EXTENSAO_DE_CODIGO, "");
}

const RAIZ = fileURLToPath(new URL("../", import.meta.url));

function caminhos(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = join(dir, entrada.name);
    saida.push(relative(RAIZ, completo));
    if (entrada.isDirectory()) saida.push(...caminhos(completo));
  }
  return saida;
}

describe("nomes de arquivo", () => {
  it("nenhum caminho de src/ e test/ difere de outro só em maiúsculas", () => {
    const grupos = new Map<string, string[]>();
    for (const caminho of [...caminhos(join(RAIZ, "src")), ...caminhos(join(RAIZ, "test"))]) {
      const chave = chaveDoCaminho(caminho);
      grupos.set(chave, [...(grupos.get(chave) ?? []), caminho]);
    }
    const conflitos = [...grupos.values()].filter((g) => g.length > 1);
    expect(conflitos).toEqual([]);
  });

  it("a chave junta o par que quebrou o macOS e separa nomes distintos", () => {
    expect(chaveDoCaminho("src/ui/Toast.tsx")).toBe(chaveDoCaminho("src/ui/toast.ts"));
    expect(chaveDoCaminho("src/ui/Toast.tsx")).not.toBe(chaveDoCaminho("src/ui/toast-estado.ts"));
    expect(chaveDoCaminho("src/ui/toast.test.ts")).not.toBe(chaveDoCaminho("src/ui/toast.ts"));
  });
});
