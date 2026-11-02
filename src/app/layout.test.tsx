import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O cookie `tema` deixa a primeira pintura certa: `data-tema` no `<html>` e
// o `color-scheme` do viewport. `next/headers` é simulado.
let cookieTema: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (nome === "tema" && cookieTema !== undefined ? { name: nome, value: cookieTema } : undefined),
  }),
}));
vi.mock("./globals.css", () => ({}));

const { default: RootLayout, generateViewport } = await import("./layout");

async function html() {
  return renderToStaticMarkup(await RootLayout({ children: <p>conteúdo</p> }));
}

describe("layout raiz e o cookie tema", () => {
  beforeEach(() => {
    cookieTema = undefined;
  });

  it("tema=escuro: data-tema escuro e color-scheme dark", async () => {
    cookieTema = "escuro";
    expect(await html()).toMatch(/<html[^>]*data-tema="escuro"/);
    expect(await generateViewport()).toEqual({ colorScheme: "dark" });
  });

  it("tema=claro: data-tema claro e color-scheme light", async () => {
    cookieTema = "claro";
    expect(await html()).toMatch(/<html[^>]*data-tema="claro"/);
    expect(await generateViewport()).toEqual({ colorScheme: "light" });
  });

  it("sem cookie: sem data-tema e color-scheme light dark", async () => {
    const texto = await html();
    expect(texto).toMatch(/<html lang="pt-BR"/);
    expect(texto).not.toContain("data-tema");
    expect(await generateViewport()).toEqual({ colorScheme: "light dark" });
  });
});
