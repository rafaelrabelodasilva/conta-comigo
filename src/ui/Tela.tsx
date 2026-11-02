import type { ReactNode } from "react";

// Estrutura comum das telas autenticadas: título (`texto-title`) e conteúdo.
export function Tela({
  titulo,
  acoes,
  children,
}: {
  titulo: string;
  /** Botões do topo, à direita do título. */
  acoes?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex min-h-toque items-center gap-3">
        <h1 className="flex-1 texto-title">{titulo}</h1>
        {acoes}
      </header>
      {children}
    </div>
  );
}
