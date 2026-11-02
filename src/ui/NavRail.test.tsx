import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Sem DOM nos testes: o roteador do Next é trocado por um caminho fixo e o
// menu é renderizado como HTML estático.
vi.mock("next/navigation", () => ({
  usePathname: () => "/contas/123",
  useRouter: () => ({ push: vi.fn() }),
}));

const { NavRail } = await import("./NavRail");

describe("NavRail", () => {
  const html = renderToStaticMarkup(<NavRail />);
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

  it("mostra os seis itens", () => {
    expect(links).toHaveLength(6);
  });

  it("na subrota, só Contas fica ativo", () => {
    const ativos = links.filter((a) => a.includes('aria-current="page"'));
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toContain('href="/contas"');
    expect(ativos[0]).toMatch(/\bbg-nav-active\b/);
    expect(links.filter((a) => /\bbg-nav-active\b/.test(a))).toHaveLength(1);
  });
});
