import { beforeEach, describe, expect, it, vi } from "vitest";

// redirect() do Next lança; o mock também lança, guardando o destino.
class Redirecionou extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}

const mocks = vi.hoisted(() => ({
  criarClienteServidor: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/data/supabase/servidor", () => ({
  criarClienteServidor: mocks.criarClienteServidor,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
}));
vi.mock("@/server/log", () => ({ log: vi.fn() }));

import { entrar, pedirRedefinicao, redefinirSenha, sair } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function destinoDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof Redirecionou) return e.destino;
    throw e;
  }
  throw new Error("não redirecionou");
}

const auth = {
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.criarClienteServidor.mockResolvedValue({ auth });
  mocks.headers.mockResolvedValue(
    new Headers({ origin: "https://conta-comigo-liart.vercel.app" }),
  );
});

describe("entrar", () => {
  it("campos vazios não chamam o Supabase", async () => {
    for (const campos of [
      { email: "", senha: "x" },
      { email: "a@b.com", senha: "" },
      { email: "   ", senha: "x" },
      { email: "a@b.com", senha: "   " },
    ]) {
      const estado = await entrar(ESTADO_INICIAL, form(campos));
      expect(estado.codigo).toBe("auth.campos_vazios");
      expect(JSON.stringify(estado)).not.toContain('"senha"');
    }
    expect(mocks.criarClienteServidor).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("credenciais erradas → auth.credenciais_invalidas", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", status: 400 },
    });
    const estado = await entrar(
      ESTADO_INICIAL,
      form({ email: " a@b.com ", senha: "errada-123" }),
    );
    // Devolve o e-mail para o formulário, nunca a senha.
    expect(estado).toEqual({ codigo: "auth.credenciais_invalidas", email: "a@b.com" });
    expect(JSON.stringify(estado)).not.toContain("errada-123");
  });

  it("senha com espaços nas pontas vai sem trim", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await destinoDoRedirect(
      entrar(ESTADO_INICIAL, form({ email: "a@b.com", senha: " com espaco " })),
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: " com espaco ",
    });
  });

  it("sucesso redireciona para o next seguro", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    expect(
      await destinoDoRedirect(
        entrar(
          ESTADO_INICIAL,
          form({ email: "a@b.com", senha: "certa", next: "/configuracoes" }),
        ),
      ),
    ).toBe("/configuracoes");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "certa",
    });
  });

  it("next externo ou ausente vira /", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    for (const next of ["https://mal.example", "//mal.example"]) {
      expect(
        await destinoDoRedirect(
          entrar(ESTADO_INICIAL, form({ email: "a@b.com", senha: "certa", next })),
        ),
      ).toBe("/");
    }
    expect(
      await destinoDoRedirect(
        entrar(ESTADO_INICIAL, form({ email: "a@b.com", senha: "certa" })),
      ),
    ).toBe("/");
  });
});

describe("pedirRedefinicao", () => {
  const CONFIRMACAO = { codigo: "auth.redefinicao_enviada", ok: true };

  it("mesma confirmação com e sem erro do Supabase", async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const comConta = await pedirRedefinicao(
      ESTADO_INICIAL,
      form({ email: "rafael@exemplo.com" }),
    );
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const comErro = await pedirRedefinicao(
      ESTADO_INICIAL,
      form({ email: "ninguem@exemplo.com" }),
    );
    auth.resetPasswordForEmail.mockRejectedValueOnce(new Error("rede"));
    const comExcecao = await pedirRedefinicao(
      ESTADO_INICIAL,
      form({ email: "x@exemplo.com" }),
    );
    expect(comConta).toEqual(CONFIRMACAO);
    expect(comErro).toEqual(CONFIRMACAO);
    expect(comExcecao).toEqual(CONFIRMACAO);
  });

  it("o link do e-mail aponta para /auth/confirmar", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await pedirRedefinicao(ESTADO_INICIAL, form({ email: "rafael@exemplo.com" }));
    const [email, opcoes] = auth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("rafael@exemplo.com");
    expect(opcoes.redirectTo).toMatch(/\/auth\/confirmar$/);
    expect(opcoes.redirectTo).toBe(
      "https://conta-comigo-liart.vercel.app/auth/confirmar",
    );
  });
});

describe("sair", () => {
  it("encerra só a sessão local e vai para /entrar", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await destinoDoRedirect(sair())).toBe("/entrar");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("redefinirSenha", () => {
  const comSessao = () =>
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });

  it("campos vazios → auth.senha_vazia", async () => {
    expect(
      await redefinirSenha(ESTADO_INICIAL, form({ senha: "", confirmacao: "x" })),
    ).toEqual({ codigo: "auth.senha_vazia" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("senhas diferentes → auth.senhas_diferentes, sem updateUser", async () => {
    comSessao();
    expect(
      await redefinirSenha(
        ESTADO_INICIAL,
        form({ senha: "nova-senha-1", confirmacao: "nova-senha-2" }),
      ),
    ).toEqual({ codigo: "auth.senhas_diferentes" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("sem sessão redireciona com link expirado, sem updateUser", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { code: "session_not_found" } });
    expect(
      await destinoDoRedirect(
        redefinirSenha(ESTADO_INICIAL, form({ senha: "abc12345", confirmacao: "abc12345" })),
      ),
    ).toBe("/entrar?motivo=link_expirou");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("senha fraca → auth.senha_fraca", async () => {
    comSessao();
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: "weak_password", status: 422 } });
    expect(
      await redefinirSenha(ESTADO_INICIAL, form({ senha: "123", confirmacao: "123" })),
    ).toEqual({ codigo: "auth.senha_fraca" });
  });

  it("validation_failed não fala de e-mail: vira auth.senha_fraca", async () => {
    comSessao();
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { code: "validation_failed", status: 400 },
    });
    expect(
      await redefinirSenha(ESTADO_INICIAL, form({ senha: "x", confirmacao: "x" })),
    ).toEqual({ codigo: "auth.senha_fraca" });
  });

  it("sucesso troca a senha e vai para /", async () => {
    comSessao();
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    expect(
      await destinoDoRedirect(
        redefinirSenha(
          ESTADO_INICIAL,
          form({ senha: "Nova-senha-forte-1", confirmacao: "Nova-senha-forte-1" }),
        ),
      ),
    ).toBe("/");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Nova-senha-forte-1" });
  });
});
