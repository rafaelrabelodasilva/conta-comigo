import { describe, expect, it } from "vitest";
import { codigoDoErroAuth } from "./erros";

describe("codigoDoErroAuth", () => {
  it("credenciais erradas viram a mensagem que não diz o campo", () => {
    expect(codigoDoErroAuth({ code: "invalid_credentials", status: 400 })).toBe(
      "auth.credenciais_invalidas",
    );
    expect(codigoDoErroAuth({ code: "email_not_confirmed", status: 400 })).toBe(
      "auth.credenciais_invalidas",
    );
  });

  it("muitas tentativas, pelo código ou pelo status 429", () => {
    expect(codigoDoErroAuth({ code: "over_request_rate_limit" })).toBe(
      "auth.muitas_tentativas",
    );
    expect(codigoDoErroAuth({ code: null, status: 429 })).toBe(
      "auth.muitas_tentativas",
    );
  });

  it("senha fraca ou igual à atual", () => {
    expect(codigoDoErroAuth({ code: "weak_password" })).toBe("auth.senha_fraca");
    expect(codigoDoErroAuth({ code: "same_password" })).toBe("auth.senha_igual");
  });

  it("link de redefinição ruim", () => {
    expect(codigoDoErroAuth({ code: "flow_state_expired" })).toBe(
      "auth.link_expirou",
    );
    expect(codigoDoErroAuth({ code: "bad_code_verifier" })).toBe(
      "auth.link_expirou",
    );
  });

  it("qualquer outro erro é inesperado", () => {
    expect(codigoDoErroAuth({ code: "unexpected_failure", status: 500 })).toBe(
      "auth.erro_inesperado",
    );
    expect(codigoDoErroAuth({ status: 0 })).toBe("auth.erro_inesperado");
    expect(codigoDoErroAuth({})).toBe("auth.erro_inesperado");
  });
});
