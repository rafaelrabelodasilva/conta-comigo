import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mensagem } from "@/domain/mensagens";

// O Painel decide no servidor se abre o Primeiro uso. Sessão, cliente,
// leitura do estado, log e `redirect` são falsos; `redirect` lança, como o
// do Next, para o teste ver que a página parou ali.
const falso = vi.hoisted(() => ({
  temSessao: vi.fn(),
  criarClienteServidor: vi.fn(),
  lerEstadoPrimeiroUso: vi.fn(),
  log: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`redirect:${destino}`);
  }),
}));

vi.mock("@/data/supabase/servidor", () => ({
  temSessao: falso.temSessao,
  criarClienteServidor: falso.criarClienteServidor,
}));
vi.mock("@/data/estado-primeiro-uso", () => ({ lerEstadoPrimeiroUso: falso.lerEstadoPrimeiroUso }));
vi.mock("@/server/log", () => ({ log: falso.log }));
vi.mock("next/navigation", () => ({ redirect: falso.redirect }));

const { default: PaginaPainel } = await import("./page");

const estado = (concluidoEm: string | null, temCadastro: boolean) => ({
  ok: true,
  estado: { concluidoEm, temCadastro },
});

async function desenhar() {
  return renderToStaticMarkup(await PaginaPainel());
}

describe("Painel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    falso.temSessao.mockResolvedValue(true);
    falso.criarClienteServidor.mockResolvedValue({});
  });

  it("sem sessão vai para Entrar", async () => {
    falso.temSessao.mockResolvedValue(false);
    await expect(desenhar()).rejects.toThrow("redirect:/entrar");
  });

  it("primeira entrada (sem marca nem cadastros) vai para o Primeiro uso", async () => {
    falso.lerEstadoPrimeiroUso.mockResolvedValue(estado(null, false));
    await expect(desenhar()).rejects.toThrow("redirect:/primeiro-uso");
    expect(falso.redirect).toHaveBeenCalledWith("/primeiro-uso");
  });

  it("com a marca ou com cadastro, mostra o Painel vazio", async () => {
    for (const e of [estado("2026-11-02T12:00:00+00:00", false), estado(null, true)]) {
      falso.lerEstadoPrimeiroUso.mockResolvedValue(e);
      expect(await desenhar()).toContain(mensagem("painel.vazio"));
    }
    expect(falso.redirect).not.toHaveBeenCalled();
  });

  it("leitura com falha: registra só o código e mostra o Painel", async () => {
    falso.lerEstadoPrimeiroUso.mockResolvedValue({ ok: false, codigo: "42501" });
    expect(await desenhar()).toContain(mensagem("painel.vazio"));
    expect(falso.redirect).not.toHaveBeenCalled();
    expect(falso.log).toHaveBeenCalledWith("painel.primeiro_uso_falhou", {
      nivel: "warn",
      codigo: "42501",
      campos: { rota: "/" },
    });
  });

  it("sem cliente (ambiente sem Supabase): mostra o Painel sem ler", async () => {
    falso.criarClienteServidor.mockResolvedValue(null);
    expect(await desenhar()).toContain(mensagem("painel.vazio"));
    expect(falso.lerEstadoPrimeiroUso).not.toHaveBeenCalled();
    expect(falso.redirect).not.toHaveBeenCalled();
  });
});
