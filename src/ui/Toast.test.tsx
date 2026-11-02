import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "./Toast";

describe("ToastProvider", () => {
  it("renderiza a região aria-live polite mesmo sem aviso aberto", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <p>conteúdo</p>
      </ToastProvider>,
    );
    expect(html).toContain("<p>conteúdo</p>");
    const regiao = /<div[^>]*aria-live="polite"[^>]*>(.*?)<\/div>/.exec(html);
    expect(regiao).not.toBeNull();
    expect(regiao![1]).toBe("");
  });
});
