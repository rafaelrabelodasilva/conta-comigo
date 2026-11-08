"use client";

import { Popover } from "radix-ui";
import { useState } from "react";
import { somarMeses } from "@/domain/ciclo";
import { formatarMes, formatarMesExtenso } from "@/domain/datas";
import { TEXTOS_PAINEL as T, rotuloEscolherMes, rotuloItemMes } from "@/domain/mensagens";
import { cn } from "@/ui/cn";

// Seletor de Mês (`month-switcher`, DESIGN.md): "◀ Out/26 ▶" num botão
// contornado, com setas de 44 pt que andam sem limite. Tocar no nome abre
// o popover com a lista de Meses (`mesesDaLista` do núcleo). Mês com
// Fatura leva o selo "Fechado", aqui e ao lado do seletor.

export function SeloFechado({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2 texto-caption text-text-muted",
        className,
      )}
    >
      {T.fechado}
    </span>
  );
}

export type PropsSeletorMes = {
  /** Mês aberto (`AAAA-MM`). */
  mes: string;
  /** Meses da lista, do mais antigo para o mais novo. */
  meses: readonly string[];
  /** Meses que têm Fatura (selo "Fechado"). */
  mesesComFatura: ReadonlySet<string>;
  aoMudar: (mes: string) => void;
};

const SETA = "inline-flex min-h-toque min-w-toque cursor-pointer items-center justify-center text-text";

export function SeletorMes({ mes, meses, mesesComFatura, aoMudar }: PropsSeletorMes) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-sm border border-border bg-surface texto-label">
        <button type="button" aria-label={T.mes_anterior} className={SETA} onClick={() => aoMudar(somarMeses(mes, -1))}>
          <span aria-hidden>◀</span>
        </button>
        <Popover.Root open={aberto} onOpenChange={setAberto}>
          <Popover.Trigger
            aria-label={rotuloEscolherMes(mes)}
            className="inline-flex min-h-toque min-w-16 cursor-pointer items-center justify-center px-1 texto-label text-text"
          >
            {formatarMes(mes)}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="center"
              sideOffset={6}
              className="z-50 max-h-96 min-w-48 overflow-y-auto rounded-lg border border-border bg-surface p-1 text-text shadow-popover"
            >
              <ul aria-label={T.meses} className="flex flex-col">
                {meses.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      aria-label={rotuloItemMes(m, mesesComFatura.has(m))}
                      aria-current={m === mes ? "true" : undefined}
                      className={cn(
                        "flex min-h-toque w-full cursor-pointer items-center gap-2 rounded-sm px-3 text-left texto-body",
                        m === mes && "bg-selection texto-body-strong",
                      )}
                      onClick={() => {
                        setAberto(false);
                        aoMudar(m);
                      }}
                    >
                      <span className="flex-1">{formatarMesExtenso(m)}</span>
                      {mesesComFatura.has(m) ? <SeloFechado className="shrink-0" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button type="button" aria-label={T.proximo_mes} className={SETA} onClick={() => aoMudar(somarMeses(mes, 1))}>
          <span aria-hidden>▶</span>
        </button>
      </div>
      {mesesComFatura.has(mes) ? <SeloFechado /> : null}
    </div>
  );
}
