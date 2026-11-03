import type { MetadataRoute } from "next";
import { NOME_APP, coresMarca } from "./marca";

// Manifest do app instalável (`/manifest.webmanifest`). Abre em tela cheia
// a partir do Painel; as cores são os tokens `nav` e `background` do
// DESIGN.md (lidos do `globals.css` no build).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const cores = coresMarca();
  return {
    name: NOME_APP,
    short_name: NOME_APP,
    description: "Divida a fatura do cartão de crédito entre quem comprou.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: cores.background,
    theme_color: cores.nav,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
