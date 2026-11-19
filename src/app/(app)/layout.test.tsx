import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mensagem } from "@/domain/mensagens";

// O menu usa o roteador do Next e o gerenciador da fila, que não existem no
// teste; aqui só importa o que o layout mostra em cada largura.
vi.mock("@/features/revisar/MenuLateral", () => ({ MenuLateral: () => <nav data-teste="menu" /> }));
// O tema usa o gerenciador de Realtime; aqui só importa que é montado.
vi.mock("@/features/configuracoes/AplicarTema", () => ({ AplicarTema: () => <i data-teste="tema" /> }));
// A faixa lê o detector de conexão; aqui só importa onde ela fica.
vi.mock("@/features/conexao/FaixaSemConexao", () => ({ FaixaSemConexao: () => <b data-teste="faixa" /> }));

const { default: LayoutApp } = await import("./layout");

describe("layout das telas autenticadas", () => {
  const html = renderToStaticMarkup(
    <LayoutApp>
      <p>conteúdo</p>
    </LayoutApp>,
  );

  it("monta AplicarTema (a Aparência vale em todas as telas)", () => {
    expect(html).toContain('<i data-teste="tema"></i>');
  });

  it("não tem mais a faixa de Lembretes: os avisos moram na Central (menu Avisos)", () => {
    expect(html).not.toContain("lembretes");
    expect(html).not.toContain('role="status" aria-label="Lembretes"');
  });

  it("abaixo de 700 px mostra só o aviso de tela pequena", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../globals.css", import.meta.url)),
      "utf8",
    );
    expect(css).toMatch(/--breakpoint-app:\s*700px/);
    // O app (menu + conteúdo) fica escondido até o ponto `app`…
    expect(html).toMatch(/<div class="hidden h-dvh app:flex"><nav data-teste="menu"><\/nav><div[^>]*><b data-teste="faixa"><\/b><main[^>]*><p>conteúdo<\/p><\/main><\/div><\/div>/);
    // …e o aviso some a partir dele.
    expect(html).toContain(
      `<div class="flex min-h-dvh items-center justify-center p-6 text-center app:hidden"><p role="status" class="max-w-xs texto-title">${mensagem("app.tela_pequena")}</p></div>`,
    );
  });
});
