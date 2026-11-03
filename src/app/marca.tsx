import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerTokens } from "@/ui/contraste";

// Marca do app instalado: nome, cores e o desenho do ícone (fundo `nav`,
// "CC" em `on-dark` e um traço `accent-line`). Usado pelo manifest e pelos
// ícones gerados por código (`next/og`), que rodam no build.
//
// As cores são os tokens do modo claro lidos do próprio `globals.css` (a
// única fonte de cor do projeto; veja `test/sem-cor-literal.test.ts`).

export const NOME_APP = "Conta Comigo";

/** Tokens usados pela marca. */
export const TOKENS_MARCA = ["nav", "background", "accent-line", "on-dark"] as const;

export type CoresMarca = Record<(typeof TOKENS_MARCA)[number], string>;

/** As cores da marca, lidas do `globals.css` (modo claro). Só no servidor/build. */
export function coresMarca(): CoresMarca {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const { claro } = lerTokens(css);
  const cores = {} as CoresMarca;
  for (const token of TOKENS_MARCA) {
    const valor = claro[token];
    if (!valor) throw new Error(`globals.css sem --${token}`);
    cores[token] = valor;
  }
  return cores;
}

/** O desenho do ícone num quadrado de `lado` px (JSX do `ImageResponse`). */
export function DesenhoIcone({ lado, cores }: { lado: number; cores: CoresMarca }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: cores.nav,
        color: cores["on-dark"],
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: Math.round(lado * 0.42),
          fontWeight: 700,
          letterSpacing: -Math.round(lado * 0.01),
          lineHeight: 1,
        }}
      >
        CC
      </div>
      <div
        style={{
          display: "flex",
          marginTop: Math.round(lado * 0.06),
          width: Math.round(lado * 0.36),
          height: Math.max(2, Math.round(lado * 0.045)),
          borderRadius: lado,
          background: cores["accent-line"],
        }}
      />
    </div>
  );
}
