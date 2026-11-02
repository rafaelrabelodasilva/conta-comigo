"use client";

import { ROTULOS, mensagem } from "@/domain/mensagens";
import { Botao } from "./Botao";
import { cn } from "./cn";

// Estado "Não foi possível carregar." com "Tentar de novo", igual em todas as telas.

export function ErroAoCarregar({
  aoTentarDeNovo,
  className,
}: {
  aoTentarDeNovo: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 p-6 text-center", className)}
    >
      <p className="texto-body text-text">{mensagem("carregar.falhou")}</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        {ROTULOS.tentar_de_novo}
      </Botao>
    </div>
  );
}
