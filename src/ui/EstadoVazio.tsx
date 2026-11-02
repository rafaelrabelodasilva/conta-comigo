import type { ReactNode } from "react";
import { cn } from "./cn";

// Estado vazio de uma tela ou cartão: texto curto e, quando houver, a ação
// que resolve ("＋ Nova conta", "Limpar filtros"…).

export function EstadoVazio({
  texto,
  acao,
  className,
}: {
  texto: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface p-8 text-center",
        className,
      )}
    >
      <p className="texto-body text-text-muted">{texto}</p>
      {acao}
    </div>
  );
}
