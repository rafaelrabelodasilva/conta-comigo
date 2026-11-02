import type { ComponentProps } from "react";
import { cn } from "./cn";

// Retângulo de carregamento (`skeleton`) no lugar de números e linhas.
// Nunca uma tela branca. A pulsação respeita "reduzir movimento".
export function Esqueleto({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("rounded-sm bg-border-subtle motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
