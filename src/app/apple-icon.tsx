import { ImageResponse } from "next/og";
import { DesenhoIcone, coresMarca } from "./marca";

// Ícone da tela inicial do iPad ("Adicionar à Tela de Início"): 180 px,
// gerado no build.

export const dynamic = "force-static";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<DesenhoIcone lado={size.width} cores={coresMarca()} />, size);
}
