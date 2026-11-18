import type { ComponentProps } from "react";
import { cn } from "./cn";

// Selo de Status (`status-pill`, UX-DR10): um par fundo + texto dos tokens `status-*`
// (nenhuma cor literal). A palavra do selo é sempre texto ("Pago", "Não pago", "Pago
// parcialmente", "Atrasado", "Programada · 06/04/27"), então a cor nunca é a única pista (NFR8). É o selo da grade, do
// painel do Lançamento e, na 6.5, dos cartões de Recebimentos: quem precisa de um selo usa
// este componente, em vez de repetir as classes.

export type VarianteDoSelo = "pago" | "nao_pago" | "parcial" | "atrasado" | "programada";

const CLASSES: Record<VarianteDoSelo, string> = {
  pago: "bg-status-paid-bg text-status-paid-fg",
  nao_pago: "bg-status-unpaid-bg text-status-unpaid-fg",
  parcial: "bg-status-partial-bg text-status-partial-fg",
  atrasado: "bg-status-late-bg text-status-late-fg",
  // Dívida programada (6.6): um selo neutro, de borda (como o "Previsto"), sem token novo: não é um estado de
  // dinheiro nem de urgência, é uma data combinada. O texto (`text-text`) tem o contraste do corpo da tela.
  programada: "border border-border bg-surface text-text",
};

/** A variante de um Status cadastrado: pago ou não pago, pela marca "conta como pago". */
export function varianteDoStatus(contaComoPago: boolean): VarianteDoSelo {
  return contaComoPago ? "pago" : "nao_pago";
}

export function SeloStatus({
  variante,
  className,
  ...resto
}: { variante: VarianteDoSelo } & ComponentProps<"span">) {
  return (
    <span
      data-selo={variante}
      className={cn("rounded-full px-2 texto-caption whitespace-nowrap", CLASSES[variante], className)}
      {...resto}
    />
  );
}
