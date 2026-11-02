// Prova, contra o Supabase local (CI), que o login por e-mail e senha funciona
// e que o cadastro público está desligado (`enable_signup = false`).
//
// Só roda com INTEGRACAO_SUPABASE=1 e as chaves de `supabase status -o env`
// (API_URL, PUBLISHABLE_KEY/ANON_KEY, SECRET_KEY/SERVICE_ROLE_KEY) no ambiente.
// No `npm test` local, sem banco, fica de fora.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ligado = process.env.INTEGRACAO_SUPABASE === "1";

function variavel(...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor) return valor;
  }
  throw new Error(`Faltam as variáveis ${nomes.join(" ou ")} (supabase status -o env).`);
}

const semSessao = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

describe.skipIf(!ligado)("Supabase Auth local", () => {
  let url: string;
  let chavePublica: string;
  let admin: SupabaseClient;
  let usuarioId: string | undefined;
  const email = `rafael.teste+${Date.now()}@example.com`;
  const senha = `Senha-de-teste-${Date.now()}`;

  const cliente = () => createClient(url, chavePublica, semSessao);

  beforeAll(async () => {
    url = variavel("API_URL", "SUPABASE_URL");
    chavePublica = variavel("PUBLISHABLE_KEY", "ANON_KEY");
    const chaveSecreta = variavel("SECRET_KEY", "SERVICE_ROLE_KEY");
    admin = createClient(url, chaveSecreta, semSessao);

    // Como o Rafael em produção (Add user, Auto Confirm): pela admin API.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(error).toBeNull();
    usuarioId = data.user?.id;
  });

  afterAll(async () => {
    if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
  });

  it("entra com as credenciais certas", async () => {
    const { data, error } = await cliente().auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();

    const supabase = createClient(url, chavePublica, semSessao);
    const { error: erroSessao } = await supabase.auth.setSession({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
    });
    expect(erroSessao).toBeNull();
    const { data: claims, error: erroClaims } = await supabase.auth.getClaims();
    expect(erroClaims).toBeNull();
    expect(claims?.claims.sub).toBe(usuarioId);
  });

  it("recusa senha errada com invalid_credentials", async () => {
    const { error } = await cliente().auth.signInWithPassword({
      email,
      password: "senha-errada",
    });
    expect(error?.code).toBe("invalid_credentials");
  });

  it("recusa cadastro público com signup_disabled", async () => {
    const { data, error } = await cliente().auth.signUp({
      email: `intruso+${Date.now()}@example.com`,
      password: "Senha-qualquer-123",
    });
    expect(error?.code).toBe("signup_disabled");
    expect(data.user).toBeNull();
  });
});
