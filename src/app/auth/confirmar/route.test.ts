import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirecionou extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}

const mocks = vi.hoisted(() => ({ criarClienteServidor: vi.fn() }));

vi.mock("@/data/supabase/servidor", () => ({
  criarClienteServidor: mocks.criarClienteServidor,
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
}));
vi.mock("@/server/log", () => ({ log: vi.fn() }));

import { GET } from "./route";

const exchangeCodeForSession = vi.fn();

async function destino(url: string): Promise<string> {
  try {
    await GET(new NextRequest(url));
  } catch (e) {
    if (e instanceof Redirecionou) return e.destino;
    throw e;
  }
  throw new Error("não redirecionou");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.criarClienteServidor.mockResolvedValue({ auth: { exchangeCodeForSession } });
});

describe("GET /auth/confirmar", () => {
  it("code válido leva para /redefinir-senha", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    expect(await destino("http://localhost/auth/confirmar?code=bom")).toBe(
      "/redefinir-senha",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("bom");
  });

  it("code recusado volta para Entrar com link expirado", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { code: "flow_state_expired", status: 403 },
    });
    expect(await destino("http://localhost/auth/confirmar?code=ruim")).toBe(
      "/entrar?motivo=link_expirou",
    );
  });

  it("sem code não chama o Supabase", async () => {
    expect(await destino("http://localhost/auth/confirmar")).toBe(
      "/entrar?motivo=link_expirou",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("sem Supabase no ambiente", async () => {
    mocks.criarClienteServidor.mockResolvedValue(null);
    expect(await destino("http://localhost/auth/confirmar?code=bom")).toBe(
      "/entrar?motivo=link_expirou",
    );
  });
});
