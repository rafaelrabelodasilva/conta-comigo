import { describe, expect, it } from "vitest";
import {
  codigoDoMotivo,
  decidirAcesso,
  destinoSeguro,
  temCookieDeSessao,
} from "./sessao";

describe("decidirAcesso", () => {
  it("sem sessão, GET / vai para /entrar", () => {
    expect(
      decidirAcesso({ caminho: "/", autenticado: false, tinhaCookieAuth: false }),
    ).toEqual({ tipo: "redirecionar", destino: "/entrar" });
  });

  it("sessão expirada (cookie presente, sem claims) mostra o motivo", () => {
    expect(
      decidirAcesso({ caminho: "/", autenticado: false, tinhaCookieAuth: true }),
    ).toEqual({ tipo: "redirecionar", destino: "/entrar?motivo=expirou" });
  });

  it("guarda a página pedida em next", () => {
    expect(
      decidirAcesso({
        caminho: "/configuracoes",
        autenticado: false,
        tinhaCookieAuth: true,
      }),
    ).toEqual({
      tipo: "redirecionar",
      destino: "/entrar?motivo=expirou&next=%2Fconfiguracoes",
    });
  });

  it("com sessão, páginas protegidas seguem", () => {
    expect(
      decidirAcesso({ caminho: "/", autenticado: true, tinhaCookieAuth: true }),
    ).toEqual({ tipo: "seguir" });
    expect(
      decidirAcesso({
        caminho: "/redefinir-senha",
        autenticado: true,
        tinhaCookieAuth: true,
      }),
    ).toEqual({ tipo: "seguir" });
  });

  it("já logado, GET /entrar vai para /", () => {
    expect(
      decidirAcesso({ caminho: "/entrar", autenticado: true, tinhaCookieAuth: true }),
    ).toEqual({ tipo: "redirecionar", destino: "/" });
  });

  it("sem sessão, /entrar e /auth/confirmar abrem", () => {
    for (const caminho of ["/entrar", "/auth/confirmar"]) {
      expect(
        decidirAcesso({ caminho, autenticado: false, tinhaCookieAuth: false }),
      ).toEqual({ tipo: "seguir" });
    }
  });

  it("/redefinir-senha exige sessão (de recuperação)", () => {
    expect(
      decidirAcesso({
        caminho: "/redefinir-senha",
        autenticado: false,
        tinhaCookieAuth: false,
      }),
    ).toEqual({ tipo: "redirecionar", destino: "/entrar?motivo=link_expirou" });
    expect(
      decidirAcesso({
        caminho: "/redefinir-senha",
        autenticado: false,
        tinhaCookieAuth: true,
      }),
    ).toEqual({ tipo: "redirecionar", destino: "/entrar?motivo=link_expirou" });
  });

  it("não confunde prefixo parecido com rota pública", () => {
    expect(
      decidirAcesso({
        caminho: "/entrar-agora",
        autenticado: false,
        tinhaCookieAuth: false,
      }).tipo,
    ).toBe("redirecionar");
  });
});

describe("destinoSeguro", () => {
  it("aceita caminhos internos", () => {
    expect(destinoSeguro("/")).toBe("/");
    expect(destinoSeguro("/configuracoes")).toBe("/configuracoes");
    expect(destinoSeguro("/contas?mes=2026-10")).toBe("/contas?mes=2026-10");
  });

  it("recusa destinos externos ou estranhos", () => {
    for (const ruim of [
      undefined,
      null,
      "",
      "https://mal.example",
      "//mal.example",
      "/\\mal.example",
      "\\\\mal.example",
      "javascript:alert(1)",
      "/a\nb",
      "mal.example",
      "/entrar",
      "/entrar?motivo=expirou",
      "/x".repeat(300),
    ]) {
      expect(destinoSeguro(ruim)).toBe("/");
    }
  });
});

describe("temCookieDeSessao", () => {
  it("reconhece o cookie de sessão inteiro ou em partes", () => {
    expect(temCookieDeSessao(["sb-abc-auth-token"])).toBe(true);
    expect(temCookieDeSessao(["outro", "sb-abc-auth-token.0"])).toBe(true);
  });

  it("ignora o verificador do PKCE e outros cookies", () => {
    expect(temCookieDeSessao(["sb-abc-auth-token-code-verifier"])).toBe(false);
    expect(temCookieDeSessao(["tema", "sb-x"])).toBe(false);
    expect(temCookieDeSessao([])).toBe(false);
  });
});

describe("codigoDoMotivo", () => {
  it("mapeia os motivos que proxy e rotas mandam para Entrar", () => {
    expect(codigoDoMotivo("expirou")).toBe("auth.sessao_expirou");
    expect(codigoDoMotivo("link_expirou")).toBe("auth.link_expirou");
  });

  it("motivo desconhecido não mostra nada", () => {
    expect(codigoDoMotivo("outro")).toBeUndefined();
    expect(codigoDoMotivo("toString")).toBeUndefined();
    expect(codigoDoMotivo(undefined)).toBeUndefined();
  });
});
