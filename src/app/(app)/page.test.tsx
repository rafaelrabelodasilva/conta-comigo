import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
// O conteúdo do Painel é o componente cliente (testado à parte).
vi.mock("@/features/painel/Painel", () => ({
  Painel: ({ titulo, mesInicial, lancamentoInicial }: { titulo: string; mesInicial?: string; lancamentoInicial?: string }) => (
    <div data-painel={titulo} data-mes={mesInicial} data-lancamento={lancamentoInicial} />
  ),
}));

const PAINEL = 'data-painel="Painel"';

const { default: PaginaPainel } = await import("./page");

const estado = (concluidoEm: string | null, temCadastro: boolean) => ({
  ok: true,
  estado: { concluidoEm, temCadastro },
});

async function desenhar(parametros: Record<string, string | string[] | undefined> = {}) {
  return renderToStaticMarkup(await PaginaPainel({ searchParams: Promise.resolve(parametros) }));
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

  it("com a marca ou com cadastro, mostra o Painel", async () => {
    for (const e of [estado("2026-11-02T12:00:00+00:00", false), estado(null, true)]) {
      falso.lerEstadoPrimeiroUso.mockResolvedValue(e);
      expect(await desenhar()).toContain(PAINEL);
    }
    expect(falso.redirect).not.toHaveBeenCalled();
  });

  it("leitura com falha: registra só o código e mostra o Painel", async () => {
    falso.lerEstadoPrimeiroUso.mockResolvedValue({ ok: false, codigo: "42501" });
    expect(await desenhar()).toContain(PAINEL);
    expect(falso.redirect).not.toHaveBeenCalled();
    expect(falso.log).toHaveBeenCalledWith("painel.primeiro_uso_falhou", {
      nivel: "warn",
      codigo: "42501",
      campos: { rota: "/" },
    });
  });

  it("sem cliente (ambiente sem Supabase): mostra o Painel sem ler", async () => {
    falso.criarClienteServidor.mockResolvedValue(null);
    expect(await desenhar()).toContain(PAINEL);
    expect(falso.lerEstadoPrimeiroUso).not.toHaveBeenCalled();
    expect(falso.redirect).not.toHaveBeenCalled();
  });
});

describe("Painel aberto por 'A receber' (História 6.6): ?mes=…&lancamento=…", () => {
  const ID = "0a1b2c3d-0000-4000-8000-00000000abcd";
  beforeEach(() => {
    vi.clearAllMocks();
    falso.temSessao.mockResolvedValue(true);
    falso.criarClienteServidor.mockResolvedValue({});
    falso.lerEstadoPrimeiroUso.mockResolvedValue(estado("2026-11-01T00:00:00Z", true));
  });

  it("o Mês e o Lançamento válidos chegam ao Painel", async () => {
    const html = await desenhar({ mes: "2026-07", lancamento: ID });
    expect(html).toContain('data-mes="2026-07"');
    expect(html).toContain(`data-lancamento="${ID}"`);
  });

  it("sem parâmetros, o Painel abre como sempre", async () => {
    const html = await desenhar();
    expect(html).not.toContain("data-mes");
    expect(html).not.toContain("data-lancamento");
  });

  it("valor fora do formato é ignorado; o Lançamento sem Mês válido também", async () => {
    expect(await desenhar({ mes: "julho", lancamento: ID })).not.toContain("data-mes");
    expect(await desenhar({ mes: "julho", lancamento: ID })).not.toContain("data-lancamento");
    const soMes = await desenhar({ mes: "2026-07", lancamento: "<script>" });
    expect(soMes).toContain('data-mes="2026-07"');
    expect(soMes).not.toContain("data-lancamento");
  });

  it("parâmetro repetido vale o primeiro", async () => {
    expect(await desenhar({ mes: ["2026-08", "2026-09"] })).toContain('data-mes="2026-08"');
  });
});
