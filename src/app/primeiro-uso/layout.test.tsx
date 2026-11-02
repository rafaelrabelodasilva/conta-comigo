import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mensagem } from "@/domain/mensagens";

// O tema usa o gerenciador de Realtime; aqui só importa que é montado.
vi.mock("@/features/configuracoes/AplicarTema", () => ({ AplicarTema: () => <i data-teste="tema" /> }));
// Se o layout montasse o menu, o marcador apareceria.
vi.mock("@/ui/NavRail", () => ({ NavRail: () => <nav data-teste="menu" /> }));

const { default: LayoutPrimeiroUso } = await import("./layout");

describe("layout do Primeiro uso", () => {
  const html = renderToStaticMarkup(
    <LayoutPrimeiroUso>
      <p>passo</p>
    </LayoutPrimeiroUso>,
  );

  it("tela cheia, sem o menu lateral, com a Aparência e a região do toast", () => {
    expect(html).not.toContain('data-teste="menu"');
    expect(html).toContain('<i data-teste="tema"></i>');
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toMatch(/<div class="hidden h-dvh app:flex"><main[^>]*><p>passo<\/p><\/main><\/div>/);
  });

  it("abaixo de 700 px mostra o aviso de tela pequena", () => {
    expect(html).toContain(
      `<div class="flex min-h-dvh items-center justify-center p-6 text-center app:hidden"><p role="status" class="max-w-xs texto-title">${mensagem("app.tela_pequena")}</p></div>`,
    );
  });
});
