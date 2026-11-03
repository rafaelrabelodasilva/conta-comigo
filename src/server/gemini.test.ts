import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O SDK do Gemini é falso: o teste confere o que vai na chamada e como a
// resposta é tratada. Nenhuma chamada de verdade (nem no CI).
const falso = vi.hoisted(() => ({ generateContent: vi.fn(), opcoesCliente: [] as unknown[] }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: falso.generateContent };
    constructor(opcoes: unknown) {
      falso.opcoesCliente.push(opcoes);
    }
  },
}));

const { extrairFatura, MODELO_PADRAO } = await import("./gemini");

const valida = {
  lancamentos: [
    {
      nome: "MSC CRUZEIROS",
      data: "06/09",
      parcela: "02/12",
      valor: "1.140,74",
      final_cartao: "9012",
      tipo_sugerido: null,
      duvida: false,
    },
  ],
  fatura: {
    vencimento: "06/10/2026",
    fechamento: null,
    total_despesas: "1.140,74",
    total_creditos: "0,00",
    saldo_anterior: null,
    pagamentos: null,
    total_a_pagar: null,
  },
  cartoes: [{ final: "9012", valor_total: "1.140,74" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  falso.opcoesCliente.length = 0;
  vi.stubEnv("GEMINI_API_KEY", "chave-de-teste");
  vi.stubEnv("GEMINI_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extrairFatura", () => {
  it("uma chamada, com o JSON Schema do núcleo, o prompt e os Tipos", async () => {
    falso.generateContent.mockResolvedValue({ text: JSON.stringify(valida) });
    const r = await extrairFatura("texto limpo", ["Casa", "Viagem"]);
    expect(r).toEqual({ ok: true, valor: valida });
    expect(falso.generateContent).toHaveBeenCalledTimes(1);
    expect(falso.opcoesCliente).toEqual([{ apiKey: "chave-de-teste" }]);
    const pedido = falso.generateContent.mock.calls[0][0];
    expect(pedido.model).toBe(MODELO_PADRAO);
    expect(pedido.contents).toContain("texto limpo");
    expect(pedido.contents).toContain("- Viagem");
    expect(pedido.config.responseMimeType).toBe("application/json");
    expect(pedido.config.responseJsonSchema.properties).toHaveProperty("lancamentos");
    expect(pedido.config.responseJsonSchema.properties.lancamentos.items.properties.valor.description).toMatch(/1\.234,56/);
    expect(pedido.config.systemInstruction).toMatch(/pagamento da fatura anterior/);
    expect(pedido.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("usa o modelo de GEMINI_MODEL", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-x-flash");
    falso.generateContent.mockResolvedValue({ text: JSON.stringify(valida) });
    await extrairFatura("t", []);
    expect(falso.generateContent.mock.calls[0][0].model).toBe("gemini-x-flash");
  });

  it("sem chave não chama o Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const r = await extrairFatura("t", []);
    expect(r).toEqual({ ok: false, erro: { codigo: "fatura.leitura_indisponivel", detalhe: "sem_chave" } });
    expect(falso.generateContent).not.toHaveBeenCalled();
  });

  it("resposta fora do schema, JSON inválido ou vazia: leitura falhou", async () => {
    falso.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ...valida, cartoes: [{ final: "9012" }] }) });
    expect((await extrairFatura("t", [])).ok).toBe(false);
    falso.generateContent.mockResolvedValueOnce({ text: "{nao é json" });
    expect(await extrairFatura("t", [])).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "json_invalido" },
    });
    falso.generateContent.mockResolvedValueOnce({ text: undefined });
    expect(await extrairFatura("t", [])).toMatchObject({ ok: false, erro: { codigo: "fatura.leitura_falhou" } });
  });

  it("erro da API vira leitura falhou com o status", async () => {
    falso.generateContent.mockRejectedValue(Object.assign(new Error("quota"), { status: 429 }));
    expect(await extrairFatura("t", [])).toEqual({
      ok: false,
      erro: { codigo: "fatura.leitura_falhou", detalhe: "http_429" },
    });
  });

  it("passa do tempo limite: tempo esgotado", async () => {
    falso.generateContent.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_, rejeitar) => {
          config.abortSignal.addEventListener("abort", () => rejeitar(new DOMException("parou", "AbortError")));
        }),
    );
    const r = await extrairFatura("t", [], { tempoLimiteMs: 10 });
    expect(r).toEqual({ ok: false, erro: { codigo: "fatura.tempo_esgotado" } });
  });
});
