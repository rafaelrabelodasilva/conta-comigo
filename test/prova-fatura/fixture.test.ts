import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { removerDadosPessoais } from "@/domain/dados-pessoais";

// O fixture é o texto de outubro/2026 já limpo, baixado da página
// `/prova-fatura` ("Baixar texto sem dados pessoais") e revisado antes do
// commit. Nunca o PDF. Enquanto não existir, o teste fica pulado.
const CAMINHO_FIXTURE = fileURLToPath(new URL("../fixtures/fatura-2026-10.txt", import.meta.url));
const existe = existsSync(CAMINHO_FIXTURE);

describe.skipIf(!existe)("fixture fatura-2026-10.txt", () => {
  const texto = existe ? readFileSync(CAMINHO_FIXTURE, "utf8") : "";

  it("não tem CPF", () => {
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(texto).not.toMatch(/\bCPF\b\s*:?\s*\d{11}/i);
  });

  it("não tem CEP", () => {
    expect(texto).not.toMatch(/(?<!\d)\d{2}\.?\d{3}-\d{3}(?!\d)/);
  });

  it("não tem número de cartão (só o final de 4 dígitos)", () => {
    // Mesmas bordas do `CARTAO` de `dados-pessoais.ts`.
    expect(texto).not.toMatch(/(?<![\dX*•])(?:[\dX*•]{4}[ .-]?){3}\d{4}(?![\dX*•])/i);
  });

  it("nenhuma linha começa com logradouro", () => {
    const logradouro = /^\s*(?:RUA|AV\.?|AVENIDA|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA|PRA[CÇ]A)(?=[\s.:,]|$)/i;
    const linhas = texto.split(/\r?\n/).filter((l) => logradouro.test(l));
    expect(linhas).toEqual([]);
  });

  it("já está limpo: limpar de novo não muda nada", () => {
    expect(removerDadosPessoais(texto)).toBe(texto);
  });
});
