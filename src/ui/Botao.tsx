import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "./cn";

// Botões do DESIGN.md: primário (accent), secundário (contornado) e
// destrutivo (contornado em danger-fg). Padrão com 44 px; compacto com 30 px
// desenhados e área de toque de 44 px (pseudo-elemento `area-toque`).
export const variantesBotao = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm border texto-body-strong select-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variante: {
        primario: "border-accent bg-accent text-accent-foreground",
        secundario: "border-border bg-transparent text-text",
        destrutivo: "border-danger-fg bg-transparent text-danger-fg",
      },
      tamanho: {
        padrao: "min-h-toque px-4",
        compacto: "area-toque h-7.5 px-3",
      },
    },
    defaultVariants: { variante: "secundario", tamanho: "padrao" },
  },
);

export type PropsBotao = ComponentProps<"button"> &
  VariantProps<typeof variantesBotao> & {
    /** Renderiza o filho (ex.: `Link`) com o visual de botão. */
    asChild?: boolean;
  };

export function Botao({
  className,
  variante,
  tamanho,
  asChild = false,
  type,
  ...props
}: PropsBotao) {
  const classes = cn(variantesBotao({ variante, tamanho }), className);
  if (asChild) return <Slot.Root className={classes} {...props} />;
  return <button type={type ?? "button"} className={classes} {...props} />;
}
