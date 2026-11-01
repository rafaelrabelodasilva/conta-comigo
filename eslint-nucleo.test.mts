// Garante a regra AD-1: o lint falha se src/domain importar outras camadas,
// Next, React, Supabase ou o alias @/.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

async function errosDeImport(codigo: string, arquivo: string) {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  return resultado.messages.filter(
    (m) =>
      m.ruleId === "no-restricted-imports" ||
      m.ruleId === "no-restricted-syntax",
  );
}

describe("lint do núcleo (AD-1)", () => {
  it.each([
    'import { createClient } from "@supabase/supabase-js";',
    'import Link from "next/link";',
    'import x from "../data/x";',
    'import x from "../ui/botao";',
    'import x from "../server/log";',
    'import x from "../features/x";',
    'import x from "../app/x";',
    'import x from "../../src/data/x";',
    'import x from "./../data/x";',
    'import x from "@/domain/exemplo";',
    'import { loadEnvConfig } from "@next/env";',
    'import { useState } from "react";',
    'import { createRoot } from "react-dom";',
    'export const m = await import("@supabase/supabase-js");',
    'export const l = require("next/link");',
  ])("recusa em src/domain: %s", async (linha) => {
    const erros = await errosDeImport(`${linha}\n`, "src/domain/teste.ts");
    expect(erros).toHaveLength(1);
  });

  it("recusa import proibido em arquivo .mts do núcleo", async () => {
    const erros = await errosDeImport(
      'import Link from "next/link";\n',
      "src/domain/teste.mts",
    );
    expect(erros).toHaveLength(1);
  });

  it("aceita import relativo dentro do núcleo", async () => {
    const erros = await errosDeImport(
      'import { somarCentavos } from "./exemplo";\n',
      "src/domain/teste.ts",
    );
    expect(erros).toHaveLength(0);
  });

  it("aceita @/ fora do núcleo", async () => {
    const erros = await errosDeImport(
      'import { somarCentavos } from "@/domain/exemplo";\n',
      "src/data/teste.ts",
    );
    expect(erros).toHaveLength(0);
  });
});
