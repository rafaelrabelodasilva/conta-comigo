import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  criarClienteServidor: vi.fn(),
  extrairFatura: vi.fn(),
  log: vi.fn(),
  getClaims: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/data/supabase/servidor", () => ({ criarClienteServidor: mocks.criarClienteServidor }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/server/gemini", () => ({ extrairFatura: mocks.extrairFatura, TEMPO_LIMITE_MS: 55_000 }));
vi.mock("@/server/log", () => ({ log: mocks.log }));

import { maxDuration, POST, runtime } from "./route";

const TEXTO = "06/09 MSC CRUZEIROS 02/12 1.140,74";

const bruta = {
  lancamentos: [
    { nome: "MSC CRUZEIROS", data: "06/09", parcela: "02/12", valor: "1.140,74", final_cartao: "9012", tipo_sugerido: "Viagem", duvida: false },
    { nome: "MSC CRUZEIROS", data: "06/09", parcela: null, valor: "-0,08", final_cartao: "9012", tipo_sugerido: "Arquivado", duvida: false },
  ],
  fatura: {
    vencimento: "06/10/2026",
    fechamento: null,
    total_despesas: "1.140,74",
    total_creditos: "0,08",
    saldo_anterior: null,
    pagamentos: null,
    total_a_pagar: null,
  },
  cartoes: [{ final: "9012", valor_total: "1.140,74" }],
};

function pedido(corpo: unknown, cru = false) {
  return new Request("http://localhost/api/fatura/extrair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: cru ? (corpo as string) : JSON.stringify(corpo),
  });
}

/** Tudo o que foi para o log, numa string só: não pode ter texto da Fatura. */
function tudoNoLog(): string {
  return JSON.stringify(mocks.log.mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "dono" } }, error: null });
  mocks.select.mockResolvedValue({
    data: [
      { id: "1", nome: "Viagem", arquivado: false },
      { id: "2", nome: "Arquivado", arquivado: true },
    ],
    error: null,
  });
  mocks.criarClienteServidor.mockResolvedValue({
    auth: { getClaims: mocks.getClaims },
    from: (tabela: string) => {
      expect(tabela).toBe("tipos");
      return { select: mocks.select };
    },
  });
  mocks.extrairFatura.mockResolvedValue({ ok: true, valor: bruta });
});

describe("POST /api/fatura/extrair", () => {
  it("roda em Node com até 60 s", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });

  it("caminho feliz: extração em centavos, resumo e tempo; Tipos ativos vão para o Gemini", async () => {
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(mocks.extrairFatura).toHaveBeenCalledTimes(1);
    expect(mocks.extrairFatura).toHaveBeenCalledWith(TEXTO, ["Viagem"], { tempoLimiteMs: expect.any(Number) });
    const { tempoLimiteMs } = mocks.extrairFatura.mock.calls[0][2];
    expect(tempoLimiteMs).toBeGreaterThanOrEqual(1_000);
    expect(tempoLimiteMs).toBeLessThanOrEqual(55_000);
    expect(mocks.select).toHaveBeenCalledWith("id,nome,arquivado");
    expect(corpo.extracao.lancamentos[0]).toMatchObject({ valorCentavos: 114074, parcelaN: 2, tipoSugerido: "Viagem" });
    expect(corpo.extracao.lancamentos[1]).toMatchObject({ valorCentavos: -8, tipoSugerido: null });
    expect(corpo.resumo).toMatchObject({ quantidade: 2, despesasCentavos: 114074, creditosCentavos: 8, diferencaCartoesCentavos: 0 });
    expect(typeof corpo.servidor_ms).toBe("number");
    expect(typeof corpo.gemini_ms).toBe("number");
    expect(tudoNoLog()).not.toContain("MSC");
    expect(tudoNoLog()).not.toContain("1.140");
    expect(mocks.log).toHaveBeenCalledWith(
      "fatura.extrair",
      expect.objectContaining({ campos: expect.objectContaining({ status_http: 200, quantidade: 2 }) }),
    );
  });

  it("sem sessão: 401 e não chama o Gemini", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: { code: "x" } });
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "auth.sessao_expirou" });
    expect(mocks.extrairFatura).not.toHaveBeenCalled();
  });

  it("sem Supabase no ambiente: 401", async () => {
    mocks.criarClienteServidor.mockResolvedValue(null);
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(401);
    expect(mocks.extrairFatura).not.toHaveBeenCalled();
  });

  it("corpo inválido: 400", async () => {
    for (const corpo of [{}, { texto: "" }, { texto: 3 }]) {
      const r = await POST(pedido(corpo));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro: "fatura.requisicao_invalida" });
    }
    const r = await POST(pedido("{nao json", true));
    expect(r.status).toBe(400);
    expect(mocks.extrairFatura).not.toHaveBeenCalled();
  });

  it.each([
    ["fatura.leitura_indisponivel", 503],
    ["fatura.leitura_falhou", 502],
    ["fatura.tempo_esgotado", 504],
    ["fatura.leitura_ocupada", 503],
  ])("%s → %i, log sem texto", async (codigo, status) => {
    mocks.extrairFatura.mockResolvedValue({ ok: false, erro: { codigo, detalhe: "sem_chave" } });
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ erro: codigo });
    expect(mocks.log).toHaveBeenCalledWith(
      "fatura.extrair",
      expect.objectContaining({ codigo, campos: expect.objectContaining({ status_http: status }) }),
    );
    expect(tudoNoLog()).not.toContain("MSC");
  });

  it("limpa o texto de novo antes do Gemini", async () => {
    await POST(pedido({ texto: `CPF 123.456.789-09\nRUA DAS FLORES 1\nCartão 4220 1234 5678 9012\n${TEXTO}` }));
    const enviado = mocks.extrairFatura.mock.calls[0][0] as string;
    expect(enviado).not.toContain("123.456.789-09");
    expect(enviado).not.toContain("RUA DAS FLORES");
    expect(enviado).toContain("Cartão final 9012");
    expect(enviado).toContain(TEXTO);
  });

  it("conversão falhou: 502 e log com o detalhe", async () => {
    mocks.extrairFatura.mockResolvedValue({ ok: true, valor: { ...bruta, cartoes: [{ final: "9012", valor_total: "x" }] } });
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(502);
    expect(mocks.log).toHaveBeenCalledWith(
      "fatura.gemini_falhou",
      expect.objectContaining({ codigo: "cartoes.0.valor_total" }),
    );
  });

  it("Tipos não carregaram: segue sem sugestão", async () => {
    mocks.select.mockResolvedValue({ data: null, error: { code: "42501" } });
    const r = await POST(pedido({ texto: TEXTO }));
    expect(r.status).toBe(200);
    expect(mocks.extrairFatura).toHaveBeenCalledWith(TEXTO, [], expect.anything());
    const corpo = await r.json();
    expect(corpo.extracao.lancamentos[0].tipoSugerido).toBeNull();
  });
});
