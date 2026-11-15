import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { criarClienteAdmin } from "./supabase-admin";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({}));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("criarClienteAdmin (AD-12)", () => {
  it("sem a chave secreta ou sem a URL devolve null e não cria cliente", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(criarClienteAdmin()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_de_teste");
    expect(criarClienteAdmin()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("cria um cliente novo a cada chamada, sem sessão guardada", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " http://127.0.0.1:54321 ");
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_de_teste ");
    criarClienteAdmin();
    criarClienteAdmin();
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "sb_secret_de_teste", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});
