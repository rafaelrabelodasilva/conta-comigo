import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mensagem } from "@/domain/mensagens";

// O menu usa o roteador do Next, que não existe no teste; aqui só importa
// o que o layout mostra em cada largura.
vi.mock("@/ui/NavRail", () => ({ NavRail: () => <nav data-teste="menu" /> }));

const { default: LayoutApp } = await import("./layout");

describe("layout das telas autenticadas", () => {
  const html = renderToStaticMarkup(
    <LayoutApp>
      <p>conteúdo</p>
    </LayoutApp>,
  );

  it("abaixo de 700 px mostra só o aviso de tela pequena", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../globals.css", import.meta.url)),
      "utf8",
    );
    expect(css).toMatch(/--breakpoint-app:\s*700px/);
    // O app (menu + conteúdo) fica escondido até o ponto `app`…
    expect(html).toMatch(/<div class="hidden h-dvh app:flex"><nav data-teste="menu"><\/nav><main[^>]*><p>conteúdo<\/p><\/main><\/div>/);
    // …e o aviso some a partir dele.
    expect(html).toContain(
      `<div class="flex min-h-dvh items-center justify-center p-6 text-center app:hidden"><p role="status" class="max-w-xs texto-title">${mensagem("app.tela_pequena")}</p></div>`,
    );
  });
});
