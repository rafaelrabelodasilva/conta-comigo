import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerTokens } from "@/ui/contraste";
import { generateImageMetadata } from "./icon";
import manifest from "./manifest";
import { NOME_APP, TOKENS_MARCA, coresMarca } from "./marca";

// As cores do manifest e do ícone são os tokens do `globals.css` (modo claro),
// que o `tokens.test.ts` confere contra o DESIGN.md.
const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const { claro } = lerTokens(css);

describe("marca do app instalado", () => {
  it.each(TOKENS_MARCA)("%s vem do globals.css", (token) => {
    expect(claro[token]).toBeDefined();
    expect(coresMarca()[token]).toBe(claro[token]);
  });
});

describe("manifest", () => {
  const m = manifest();

  it("nome, início em / e tela cheia", () => {
    expect(m.name).toBe(NOME_APP);
    expect(m.name).toBe("Conta Comigo");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("cores do tema e do fundo são os tokens nav e background", () => {
    expect(m.theme_color).toBe(claro.nav);
    expect(m.background_color).toBe(claro.background);
  });

  it("ícones de 192 e 512 (e o da Apple, 180)", () => {
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512", "180x180"]);
    expect(m.icons?.every((i) => i.type === "image/png")).toBe(true);
  });

  it("os src dos ícones são as rotas reais: /icon/<id> de cada tamanho e /apple-icon", () => {
    const rotas = generateImageMetadata().map((i) => `/icon/${i.id}`);
    expect(rotas.length).toBeGreaterThan(0);
    expect(m.icons?.map((i) => i.src)).toEqual([...rotas, "/apple-icon"]);
    for (const i of generateImageMetadata()) {
      const doManifest = m.icons?.find((x) => x.src === `/icon/${i.id}`);
      expect(doManifest?.sizes).toBe(`${i.size.width}x${i.size.height}`);
    }
  });
});
