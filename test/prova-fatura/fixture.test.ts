import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TITULAR, removerDadosPessoais } from "@/domain/dados-pessoais";
import { pareceFaturaSantander } from "@/domain/importacao-fatura";

// O fixture é o texto de outubro/2026 já limpo por `removerDadosPessoais`
// (baixado na prova técnica da 2.1 e limpo de novo na 2.3, com o nome do
// titular e a conta do débito) e revisado antes do commit. Nunca o PDF.
// Enquanto não existir, o teste fica pulado.
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
    const logradouro = /^\s*(?:RUA|R\.?|AV\.?|AVENIDA|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA|PRA[CÇ]A)(?=[\s.:,]|$)/i;
    const linhas = texto.split(/\r?\n/).filter((l) => logradouro.test(l));
    expect(linhas).toEqual([]);
  });

  it("o nome do titular e dos adicionais virou TITULAR", () => {
    const linhas = texto.split(/\r?\n/);
    const saudacoes = linhas.flatMap((l) => [...l.matchAll(/Ol[áa],\s*([^!]+)!/g)].map((m) => m[1]));
    expect(saudacoes).toEqual([TITULAR]);
    const cabecalhos = linhas
      .map((l) => /^\s*(?:@\s*)?(.+?)\s+-\s+final\s+\d{4}\s*$/.exec(l)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(cabecalhos.length).toBeGreaterThan(0);
    expect(new Set(cabecalhos)).toEqual(new Set([TITULAR]));
  });

  it("o bloco do débito automático não tem o final da conta", () => {
    const linhas = texto.split(/\r?\n/);
    const inicio = linhas.findIndex((l) => /D[ÉE]BITO AUTOM[ÁA]TICO/i.test(l));
    expect(inicio).toBeGreaterThanOrEqual(0);
    const fechou = linhas.findIndex((l, i) => i > inicio && /^\s*(?:\d+\/\d+)?\s*$/.test(l));
    // Sem linha que feche o bloco, ele vai até o fim do texto.
    const fim = fechou === -1 ? linhas.length : fechou;
    expect(linhas.slice(inicio, fim).join("\n")).not.toMatch(/^\s*final\s+\d{4}\s*$/im);
  });

  it("tem as marcas da fatura do Santander", () => {
    expect(pareceFaturaSantander(texto)).toBe(true);
  });

  it("já está limpo: limpar de novo não muda nada", () => {
    expect(removerDadosPessoais(texto)).toBe(texto);
  });
});
