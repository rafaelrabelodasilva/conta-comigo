import { describe, expect, it, vi } from "vitest";
import { CANCELADO, ROTA_EXTRAIR, extrairTexto } from "./extrair";

// A rota é falsa: o teste confere o pedido e o código de cada resposta.
const extracao = { lancamentos: [], cartoes: [], fatura: { vencimento: "06/10/2026" } };
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("extrairTexto", () => {
  it("manda só o texto e devolve a extração", async () => {
    const buscar = vi.fn(async () => json({ extracao, resumo: {} }));
    const r = await extrairTexto("texto limpo", undefined, buscar as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, valor: extracao });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ROTA_EXTRAIR);
    expect(JSON.parse(String(init.body))).toEqual({ texto: "texto limpo" });
  });

  it("cada falha vira o seu código", async () => {
    const redirecionada = new Response("<html>", { status: 200 });
    Object.defineProperty(redirecionada, "redirected", { value: true });
    for (const [resposta, codigo] of [
      [new Response("", { status: 401 }), "auth.sessao_expirou"],
      [new Response("Gateway Timeout", { status: 504 }), "fatura.tempo_esgotado"],
      [json({ erro: "fatura.leitura_ocupada" }, 503), "fatura.leitura_ocupada"],
      [new Response("x", { status: 500 }), "fatura.leitura_falhou"],
      [redirecionada, "auth.sessao_expirou"],
      [json({ resumo: {} }), "fatura.leitura_falhou"],
    ] as const) {
      const r = await extrairTexto("t", undefined, (async () => resposta) as unknown as typeof fetch);
      expect(r).toEqual({ ok: false, erro: { codigo } });
    }
  });

  it("rede caída vira conexão caída; cancelada, CANCELADO", async () => {
    const falha = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await extrairTexto("t", undefined, falha)).toEqual({ ok: false, erro: { codigo: "fatura.conexao_caiu" } });
    const c = new AbortController();
    c.abort();
    expect(await extrairTexto("t", c.signal, falha)).toEqual({ ok: false, erro: { codigo: CANCELADO } });
  });
});
