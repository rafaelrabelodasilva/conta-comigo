import { describe, expect, it } from "vitest";
import { aparenciaDoCookie, aplicarAparencia, atributoTema, cookieTema, esquemaDeCor } from "./tema";

describe("tema da Aparência", () => {
  it("Sistema não fixa data-tema; Claro e Escuro fixam", () => {
    expect(atributoTema("sistema")).toBeUndefined();
    expect(atributoTema("claro")).toBe("claro");
    expect(atributoTema("escuro")).toBe("escuro");
  });

  it("o viewport segue a Aparência", () => {
    expect(esquemaDeCor("sistema")).toBe("light dark");
    expect(esquemaDeCor("claro")).toBe("light");
    expect(esquemaDeCor("escuro")).toBe("dark");
  });

  it("cookie ausente ou adulterado vale Sistema", () => {
    expect(aparenciaDoCookie(undefined)).toBe("sistema");
    expect(aparenciaDoCookie("escuro")).toBe("escuro");
    expect(aparenciaDoCookie('"><script>')).toBe("sistema");
  });

  it("o cookie vale para o site inteiro", () => {
    expect(cookieTema("escuro")).toBe("tema=escuro; path=/; max-age=31536000; samesite=lax");
  });
});

describe("aplicarAparencia", () => {
  it("Escuro e Claro fixam data-tema; Sistema o remove; sempre devolve o cookie", () => {
    const raiz = { dataset: {} as Record<string, string | undefined> };
    expect(aplicarAparencia(raiz, "escuro")).toBe(cookieTema("escuro"));
    expect(raiz.dataset.tema).toBe("escuro");
    expect(aplicarAparencia(raiz, "claro")).toBe(cookieTema("claro"));
    expect(raiz.dataset.tema).toBe("claro");
    expect(aplicarAparencia(raiz, "sistema")).toBe(cookieTema("sistema"));
    expect("tema" in raiz.dataset).toBe(false);
  });
});
