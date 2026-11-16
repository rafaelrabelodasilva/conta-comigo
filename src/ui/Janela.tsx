"use client";

import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { ROTULOS } from "@/domain/mensagens";
import { cn } from "./cn";

// Janela (`modal`): véu `scrim`, superfície com raio lg e até 640 px,
// título em `texto-title`, ✕ no topo e ações no rodapé. Esc fecha.

export type PropsJanela = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  titulo: string;
  /** Texto de apoio lido junto com o título. */
  descricao?: string;
  children?: ReactNode;
  /** Botões de ação, alinhados à direita no rodapé. */
  rodape?: ReactNode;
  className?: string;
  /** Quem recebe o foco ao abrir (padrão do Radix: o primeiro foco da janela, o ✕). Chame `preventDefault` e foque o que quiser. */
  aoAbrirFoco?: (evento: Event) => void;
  /** Quem recebe o foco ao fechar (padrão do Radix: quem tinha o foco antes). Chame `preventDefault` e foque o que quiser. */
  aoFecharFoco?: (evento: Event) => void;
};

export function Janela({
  aberta,
  aoMudar,
  titulo,
  descricao,
  children,
  rodape,
  className,
  aoAbrirFoco,
  aoFecharFoco,
}: PropsJanela) {
  return (
    <Dialog.Root open={aberta} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          onOpenAutoFocus={aoAbrirFoco}
          onCloseAutoFocus={aoFecharFoco}
          // Sem descrição, avisa o Radix que não há (evita o alerta no console).
          {...(descricao ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-160 -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-lg bg-surface p-6 text-text shadow-popover",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="texto-title">{titulo}</Dialog.Title>
            <Dialog.Close
              aria-label={ROTULOS.fechar}
              className="area-toque inline-flex size-icone shrink-0 cursor-pointer items-center justify-center rounded-sm text-text-muted"
            >
              <span aria-hidden>✕</span>
            </Dialog.Close>
          </div>
          {descricao ? (
            <Dialog.Description className="texto-body text-text-muted">
              {descricao}
            </Dialog.Description>
          ) : null}
          {children}
          {rodape ? <div className="flex flex-wrap justify-end gap-2">{rodape}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
