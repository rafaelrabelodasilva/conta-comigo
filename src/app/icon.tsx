import { ImageResponse } from "next/og";
import { DesenhoIcone, coresMarca } from "./marca";

// Ícones do app instalado (manifest): 192 e 512 px, gerados por código no
// build (sem binários no repositório). Servidos em `/icon/192` e `/icon/512`.

export const dynamic = "force-static";

export const TAMANHOS_ICONE = [192, 512] as const;

export function generateImageMetadata() {
  return TAMANHOS_ICONE.map((lado) => ({
    id: String(lado),
    size: { width: lado, height: lado },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const pedido = Number(await id);
  const lado = TAMANHOS_ICONE.find((t) => t === pedido) ?? TAMANHOS_ICONE[0];
  return new ImageResponse(<DesenhoIcone lado={lado} cores={coresMarca()} />, { width: lado, height: lado });
}
