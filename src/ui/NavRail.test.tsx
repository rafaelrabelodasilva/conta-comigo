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

  it("mostra os sete itens", () => {
    expect(links).toHaveLength(7);
  });

  it("o item Avisos leva a /avisos, entre Contas e Config.", () => {
    expect(links.map((a) => /href="([^"]+)"/.exec(a)?.[1])).toEqual([
      "/",
      "/revisar",
      "/recebimentos",
      "/previsao",
      "/contas",
      "/avisos",
      "/configuracoes",
    ]);
  });

  it("sem contador de avisos por padrão; com contador, o número é texto e o nome diz 'não lidos'", () => {
    expect(html).not.toContain("não lido");
    const com = renderToStaticMarkup(<NavRail contadorAvisos={3} />);
    expect(com).toContain("3");
    expect(com).toContain(", 3 não lidos");
    expect(renderToStaticMarkup(<NavRail contadorAvisos={1} />)).toContain(", 1 não lido<");
  });

  it("acima de 99 mostra '99+' e o leitor de tela ouve 'mais de 99 não lidos'", () => {
    const com = renderToStaticMarkup(<NavRail contadorAvisos={150} />);
    expect(com).toContain("99+");
    expect(com).toContain(", mais de 99 não lidos");
    expect(com).not.toContain("150");
  });

  it("na subrota, só Contas fica ativo", () => {
    const ativos = links.filter((a) => a.includes('aria-current="page"'));
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toContain('href="/contas"');
    expect(ativos[0]).toMatch(/\bbg-nav-active\b/);
    expect(links.filter((a) => /\bbg-nav-active\b/.test(a))).toHaveLength(1);
  });
});
