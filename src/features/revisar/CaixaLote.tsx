"use client";

import type { EstadoCaixa } from "@/domain/lancamento";

// Caixa de marcação do lote (História 3.3): três estados (nenhum, parcial,
// todos). Desenhada com 18 px, mas o toque tem 44 pt: a coluna de 30 do item
// mais os 14 de recuo dele (`-ml-3.5 w-11`). Com `texto`, o texto visível
// também marca (é o nome da caixa); sem ele, `rotulo` é o nome acessível.

export type PropsCaixaLote = {
  /** Nome acessível (sem `texto`). */
  rotulo: string;
  estado: EstadoCaixa;
  aoMudar: () => void;
  /** Texto visível ao lado da caixa ("Selecionar todos"). */
  texto?: string;
};

export function CaixaLote({ rotulo, estado, aoMudar, texto }: PropsCaixaLote) {
  return (
    <label className="-ml-3.5 flex min-h-toque cursor-pointer items-center">
      <span className="flex w-11 shrink-0 justify-center">
        <input
          type="checkbox"
          {...(texto ? {} : { "aria-label": rotulo })}
          checked={estado === "todos"}
          ref={(el) => {
            if (el) el.indeterminate = estado === "parcial";
          }}
          onChange={aoMudar}
          className="size-4.5 shrink-0 cursor-pointer accent-accent"
        />
      </span>
      {texto ? <span className="pl-3 texto-label text-text-muted">{texto}</span> : null}
    </label>
  );
}
