import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type OpcoesCookies = {
  cookies: {
    getAll: () => { name: string; value: string }[];
    setAll: (
      lista: { name: string; value: string; options: Record<string, unknown> }[],
      headers: Record<string, string>,
    ) => void;
  };
};

const mocks = vi.hoisted(() => ({
  configSupabase: vi.fn(),
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/data/supabase/config", () => ({ configSupabase: mocks.configSupabase }));
vi.mock("@/server/log", () => ({ log: vi.fn() }));

import { proxy } from "./proxy";

const CACHE = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" };

/** getClaims que chama o setAll do cliente, como o @supabase/ssr faz ao renovar. */
function getClaimsQueGrava(
  cookies: { name: string; value: string; options?: Record<string, unknown> }[],
  resultado: unknown,
) {
  mocks.getClaims.mockImplementation(async () => {
    const opcoes = mocks.createServerClient.mock.calls.at(-1)![2] as OpcoesCookies;
    opcoes.cookies.setAll(
      cookies.map((c) => ({ ...c, options: c.options ?? { path: "/" } })),
      CACHE,
    );
    return resultado;
  });
}

function requisicao(caminho: string, cookie?: string) {
  return new NextRequest(`http://localhost${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configSupabase.mockReturnValue({ url: "http://sb.local", chave: "sb_publishable_x" });
  mocks.createServerClient.mockImplementation(() => ({
    auth: { getClaims: mocks.getClaims },
  }));
});

describe("proxy", () => {
  it("sessão válida em / segue com o cookie renovado e os cabeçalhos de cache", async () => {
    getClaimsQueGrava([{ name: "sb-ref-auth-token", value: "novo" }], {
      data: { claims: { sub: "u1" } },
      error: null,
    });
    const resposta = await proxy(requisicao("/", "sb-ref-auth-token=velho"));
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(resposta.headers.get("location")).toBeNull();
    expect(resposta.headers.get("x-middleware-next")).toBe("1");
    expect(resposta.cookies.get("sb-ref-auth-token")?.value).toBe("novo");
    expect(resposta.headers.get("cache-control")).toBe(CACHE["Cache-Control"]);
  });

  it("sessão vencida: cookies apagados e cabeçalhos vão no redirect", async () => {
    getClaimsQueGrava(
      [{ name: "sb-ref-auth-token", value: "", options: { path: "/", maxAge: 0 } }],
      { data: null, error: { code: "session_expired" } },
    );
    const resposta = await proxy(requisicao("/", "sb-ref-auth-token=vencido"));
    expect(resposta.status).toBe(307);
    const destino = new URL(resposta.headers.get("location")!);
    expect(`${destino.pathname}${destino.search}`).toBe("/entrar?motivo=expirou");
    const apagado = resposta.cookies.get("sb-ref-auth-token");
    expect(apagado?.value).toBe("");
    expect(apagado?.maxAge).toBe(0);
    expect(resposta.headers.get("cache-control")).toBe(CACHE["Cache-Control"]);
  });

  it("sem config do Supabase, / vai para /entrar sem criar cliente", async () => {
    mocks.configSupabase.mockReturnValue(null);
    const resposta = await proxy(requisicao("/"));
    expect(resposta.status).toBe(307);
    expect(new URL(resposta.headers.get("location")!).pathname).toBe("/entrar");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("getClaims lançando erro leva para Entrar", async () => {
    mocks.getClaims.mockRejectedValue(new Error("rede"));
    const resposta = await proxy(requisicao("/"));
    expect(resposta.status).toBe(307);
    expect(new URL(resposta.headers.get("location")!).pathname).toBe("/entrar");
  });
});
