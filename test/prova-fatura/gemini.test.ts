import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { converterExtracao, resumirExtracao } from "@/domain/extracao-fatura";
import { ESPERADO_OUTUBRO_2026 } from "@/domain/importacao-fatura";
import { extrairFatura } from "@/server/gemini";

// Chamada de verdade ao Gemini com o fixture de outubro/2026. Só roda local:
//   PROVA_GEMINI=1 node --env-file=.env.local node_modules/.bin/vitest run test/prova-fatura
// Nunca no CI (sem PROVA_GEMINI, fica pulado).
const CAMINHO = fileURLToPath(new URL("../fixtures/fatura-2026-10.txt", import.meta.url));
const ligado = process.env.PROVA_GEMINI === "1";

describe.skipIf(!ligado)("Gemini lê a fatura de outubro/2026", () => {
  it("49 Lançamentos, R$ 8.327,39 de despesas, R$ 639,62 de créditos, cartões = despesas", { timeout: 70_000 }, async () => {
    expect(existsSync(CAMINHO), "falta test/fixtures/fatura-2026-10.txt").toBe(true);
    const texto = readFileSync(CAMINHO, "utf8");
    const inicio = Date.now();
    const lida = await extrairFatura(texto, []);
    const ms = Date.now() - inicio;
    if (!lida.ok) throw new Error(`extração falhou: ${lida.erro.codigo} ${lida.erro.detalhe ?? ""}`);
    const convertida = converterExtracao(lida.valor, []);
    if (!convertida.ok) throw new Error(convertida.erro.codigo);
    const resumo = resumirExtracao(convertida.valor);
    // Só números no relatório: sem nomes de Lançamentos.
    process.stdout.write(`${JSON.stringify({ ms, ...resumo })}\n`);

    expect(resumo.quantidade).toBe(ESPERADO_OUTUBRO_2026.quantidade);
    expect(resumo.despesasCentavos).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);
    expect(resumo.creditosCentavos).toBe(ESPERADO_OUTUBRO_2026.creditosCentavos);
    expect(resumo.cartoesCentavos).toBe(resumo.despesasCentavos);
    expect(resumo.pagamentosDeFatura).toBe(0);
    expect(ms).toBeLessThan(60_000);
  });
});
