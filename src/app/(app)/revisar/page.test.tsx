import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sessão e `redirect` são falsos (`redirect` lança, como o do Next); o
// conteúdo é o componente cliente, testado à parte.
const falso = vi.hoisted(() => ({
  temSessao: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`redirect:${destino}`);
  }),
}));
vi.mock("@/data/supabase/servidor", () => ({ temSessao: falso.temSessao }));
vi.mock("next/navigation", () => ({ redirect: falso.redirect }));
vi.mock("@/features/revisar/Revisar", () => ({
  Revisar: ({ titulo }: { titulo: string }) => <div data-revisar={titulo} />,
}));

const { default: PaginaRevisar, metadata } = await import("./page");

describe("página Revisar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem sessão vai para Entrar", async () => {
    falso.temSessao.mockResolvedValue(false);
    await expect(PaginaRevisar()).rejects.toThrow("redirect:/entrar");
  });

  it("com sessão mostra a tela Revisar (não mais a provisória)", async () => {
    falso.temSessao.mockResolvedValue(true);
    expect(renderToStaticMarkup(await PaginaRevisar())).toBe('<div data-revisar="Revisar"></div>');
    expect(metadata.title).toBe("Revisar · Conta Comigo");
  });
});
