"use client";

import { rotuloCor, rotuloCorDe } from "@/domain/mensagens";
import { CORES_PESSOA } from "@/domain/responsaveis";
import { cn } from "@/ui/cn";
import { CLASSE_MARCA_PESSOA, classesPessoa } from "@/ui/cores-pessoa";

// Seletor das 8 cores de pessoa (UX-DR25): círculos de 24 px com área de
// toque de 44 px; a escolhida tem ✓ e anel; cores em uso por outro
// Responsável ficam desativadas. O VoiceOver lê o nome da cor.
// Botões comuns (sem papel de rádio): a escolhida tem `aria-pressed`; as em
// uso têm `aria-disabled` (continuam no foco, para o VoiceOver anunciá-las)
// e ignoram o toque.

export type PropsSeletorCor = {
  /** Cor atual (1..8). */
  cor: number;
  /** Cores que este Responsável pode escolher (vêm de `coresLivres`). */
  livres: readonly number[];
  /** Nome do Responsável, para o rótulo do grupo. */
  nomeResponsavel: string;
  aoEscolher: (cor: number) => void;
  desativado?: boolean;
};

export function SeletorCor({ cor, livres, nomeResponsavel, aoEscolher, desativado }: PropsSeletorCor) {
  return (
    <div role="group" aria-label={rotuloCorDe(nomeResponsavel)} className="flex flex-wrap">
      {CORES_PESSOA.map(({ cor: n, nome }) => {
        const escolhida = n === cor;
        const emUso = !escolhida && !livres.includes(n);
        const classes = classesPessoa(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={escolhida}
            aria-label={rotuloCor(nome, emUso)}
            aria-disabled={desativado || emUso ? true : undefined}
            onClick={() => {
              if (!escolhida && !emUso && !desativado) aoEscolher(n);
            }}
            className="inline-flex size-toque shrink-0 cursor-pointer items-center justify-center rounded-full aria-disabled:cursor-not-allowed"
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full texto-label font-extrabold",
                classes.fundo,
                CLASSE_MARCA_PESSOA,
                escolhida && cn("ring-2 ring-offset-2 ring-offset-surface", classes.anel),
                emUso && "opacity-30",
              )}
            >
              {escolhida ? "✓" : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
