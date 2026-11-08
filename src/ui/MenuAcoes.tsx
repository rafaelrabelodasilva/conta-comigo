"use client";

import { DropdownMenu } from "radix-ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
  /**
   * Menu controlado de fora (ex.: a linha da grade, que abre o menu com o
   * toque longo no `<tr>` por `useToqueLongo`). Sem ele, o estado é interno.
   */
  aberto?: boolean;
  aoMudarAberto?: (aberto: boolean) => void;
};

const temporizadoresDoNavegador = {
  agendar: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  cancelar: (handle: number) => window.clearTimeout(handle),
};

/**
 * O evento nasceu dentro da área no DOM. Os itens do menu ficam num portal:
 * seus eventos sobem pela árvore do React até aqui, mas não são do conteúdo.
 */
function doConteudo(e: { target: EventTarget; currentTarget: EventTarget }): boolean {
  return e.target instanceof Node && (e.currentTarget as Node).contains(e.target);
}

/**
 * Toque longo (dedo ou caneta) e clique direito numa área abrem o menu
 * (`aoToqueLongo`, de preferência estável: trocá-lo recria o detector). Os manipuladores vão no elemento da área (uma `<div>`, um
 * `<tr>`); o clique que vem logo depois do toque longo é engolido, para não
 * acionar o conteúdo.
 */
export function useToqueLongo(aoToqueLongo: () => void) {
  const engolirClique = useRef(false);
  const detector = useMemo(
    () => criarDetectorToqueLongo({ aoToqueLongo, temporizadores: temporizadoresDoNavegador }),
    [aoToqueLongo],
  );
  useEffect(() => () => detector.cancelar(), [detector]);

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      engolirClique.current = false;
      if (!doConteudo(e)) return;
      // Toque longo é do dedo e da caneta; no mouse há o ⋯ e o clique direito.
      if (e.pointerType === "mouse") return;
      detector.iniciar(e.clientX, e.clientY);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (doConteudo(e)) detector.mover(e.clientX, e.clientY);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      if (doConteudo(e) && detector.soltar()) engolirClique.current = true;
    },
    onPointerCancel: (e: ReactPointerEvent) => {
      if (doConteudo(e)) detector.cancelar();
    },
    onPointerLeave: () => detector.cancelar(),
    onKeyDown: () => {
      engolirClique.current = false;
    },
    onContextMenu: (e: ReactMouseEvent) => {
      // Clique direito (ou o menu do sistema após toque longo) abre o ⋯.
      e.preventDefault();
      if (!doConteudo(e)) return;
      aoToqueLongo();
    },
    onClickCapture: (e: ReactMouseEvent) => {
      if (!doConteudo(e)) return;
      if (engolirClique.current) {
        engolirClique.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}

export function MenuAcoes({ rotulo, itens, children, className, aberto: abertoFora, aoMudarAberto }: PropsMenuAcoes) {
  const [abertoDentro, setAbertoDentro] = useState(false);
  const aberto = abertoFora ?? abertoDentro;
  const setAberto = (v: boolean) => {
    if (abertoFora === undefined) setAbertoDentro(v);
    aoMudarAberto?.(v);
  };
  const abrirPorToque = useCallback(() => {
    setAbertoDentro(true);
    aoMudarAberto?.(true);
  }, [aoMudarAberto]);
  const toqueLongo = useToqueLongo(abrirPorToque);

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
          {itens.map((item, i) => (
            <DropdownMenu.Item
              key={`${i}-${item.rotulo}`}
              onSelect={item.aoEscolher}
              className={cn(
                "flex min-h-toque cursor-pointer items-center rounded-sm px-3 texto-body select-none data-highlighted:bg-selection",
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
      {...toqueLongo}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {botao}
    </div>
  );
}
