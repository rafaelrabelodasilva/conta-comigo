"use client";

import { DropdownMenu } from "radix-ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { criarDetectorToqueLongo } from "./toque-longo";

// Menu ⋯ de ações. O botão está sempre visível (26 px desenhados, área de
// toque de 44 px) e o toque longo na área em volta abre o mesmo menu.

export type ItemMenuAcoes = {
  rotulo: string;
  aoEscolher: () => void;
  /** Ações que apagam dados ficam em `danger-fg`. */
  destrutivo?: boolean;
};

export type PropsMenuAcoes = {
  /** Nome acessível do ⋯, ex.: "Ações do Bloco Casal". */
  rotulo: string;
  itens: readonly ItemMenuAcoes[];
  /** Conteúdo que também abre o menu com toque longo (linha, Bloco). */
  children?: ReactNode;
  className?: string;
};

const temporizadoresDoNavegador = {
  agendar: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  cancelar: (handle: number) => window.clearTimeout(handle),
};

export function MenuAcoes({ rotulo, itens, children, className }: PropsMenuAcoes) {
  const [aberto, setAberto] = useState(false);
  // O clique que vem depois de um toque longo não pode acionar o conteúdo.
  const engolirClique = useRef(false);

  const detector = useMemo(
    () =>
      criarDetectorToqueLongo({
        aoToqueLongo: () => setAberto(true),
        temporizadores: temporizadoresDoNavegador,
      }),
    [],
  );
  useEffect(() => () => detector.cancelar(), [detector]);

  const botao = (
    <DropdownMenu.Root open={aberto} onOpenChange={setAberto}>
      <DropdownMenu.Trigger
        aria-label={rotulo}
        className="area-toque inline-flex size-icone shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface text-text texto-body-strong"
      >
        <span aria-hidden>⋯</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-lg border border-border bg-surface p-1 text-text shadow-popover"
        >
          {itens.map((item) => (
            <DropdownMenu.Item
              key={item.rotulo}
              onSelect={item.aoEscolher}
              className={cn(
                "flex min-h-toque cursor-pointer items-center rounded-sm px-3 texto-body outline-none select-none data-highlighted:bg-selection",
                item.destrutivo && "text-danger-fg",
              )}
            >
              {item.rotulo}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  if (children === undefined) return botao;

  return (
    <div
      className={cn("flex items-center gap-2 select-none [-webkit-touch-callout:none]", className)}
      onPointerDown={(e) => {
        // Toque longo é do dedo e da caneta; no mouse há o ⋯ e o clique direito.
        if (e.pointerType === "mouse") return;
        engolirClique.current = false;
        detector.iniciar(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => detector.mover(e.clientX, e.clientY)}
      onPointerUp={() => {
        if (detector.soltar()) engolirClique.current = true;
      }}
      onPointerCancel={() => detector.cancelar()}
      onPointerLeave={() => detector.cancelar()}
      onContextMenu={(e) => {
        // Clique direito (ou o menu do sistema após toque longo) abre o ⋯.
        e.preventDefault();
        setAberto(true);
      }}
      onClickCapture={(e) => {
        if (engolirClique.current) {
          engolirClique.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {botao}
    </div>
  );
}
