"use client";

import { AlertDialog } from "radix-ui";
import { useRef } from "react";
import { ROTULOS } from "@/domain/mensagens";
import { Botao } from "./Botao";

// Confirmação de ação destrutiva (Excluir, Importar de novo…). O botão
// destrutivo recebe o foco ao abrir: Enter confirma, Esc cancela.

export type PropsConfirmarAcao = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  titulo: string;
  descricao: string;
  /** Diz o que o botão faz, ex.: "Excluir bloco". */
  rotuloConfirmar: string;
  aoConfirmar: () => void;
  /** O botão fica desativado (ex.: ainda se confere o efeito da ação, História 6.9). */
  desativarConfirmar?: boolean;
};

export function ConfirmarAcao({
  aberta,
  aoMudar,
  titulo,
  descricao,
  rotuloConfirmar,
  aoConfirmar,
  desativarConfirmar = false,
}: PropsConfirmarAcao) {
  const confirmar = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={aberta} onOpenChange={aoMudar}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <AlertDialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            confirmar.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-112 -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg bg-surface p-6 text-text shadow-popover"
        >
          <AlertDialog.Title className="texto-title">{titulo}</AlertDialog.Title>
          <AlertDialog.Description className="texto-body text-text-muted">
            {descricao}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Botao variante="secundario">{ROTULOS.cancelar}</Botao>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Botao ref={confirmar} variante="destrutivo" onClick={aoConfirmar} disabled={desativarConfirmar}>
                {rotuloConfirmar}
              </Botao>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
