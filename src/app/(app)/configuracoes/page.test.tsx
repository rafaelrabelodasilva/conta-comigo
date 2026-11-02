import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ROTULOS } from "@/domain/mensagens";

// Só a lista de seções importa aqui: sessão, seções (que usam o Realtime),
// a ação de sair e o Link do Next são falsos.
vi.mock("@/data/supabase/servidor", () => ({ temSessao: async () => true }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/entrar/acoes", () => ({ sair: async () => {} }));
for (const nome of ["Responsaveis", "Tipos", "Status", "Ciclo", "Conferencia", "Aparencia"]) {
  vi.doMock(`@/features/configuracoes/Secao${nome}`, () => ({ [`Secao${nome}`]: () => <section /> }));
}

const { default: PaginaConfiguracoes } = await import("./page");

describe("Configurações", () => {
  it("“Retomar o Primeiro uso” leva a /primeiro-uso e fica antes de Sair", async () => {
    const html = renderToStaticMarkup(await PaginaConfiguracoes({ searchParams: Promise.resolve({}) }));
    const link = new RegExp(`<a href="/primeiro-uso"[^>]*>${ROTULOS.retomar_primeiro_uso}</a>`);
    expect(html).toMatch(link);
    const posLink = html.search(link);
    const posSair = html.indexOf(`>${ROTULOS.sair}</button>`);
    expect(posSair).toBeGreaterThan(-1);
    expect(posLink).toBeLessThan(posSair);
  });
});
