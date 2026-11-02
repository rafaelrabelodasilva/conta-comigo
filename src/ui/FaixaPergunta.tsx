"use client";

import { RESPOSTAS_PERGUNTA, type RespostaPergunta } from "@/domain/mensagens";
import { Botao } from "./Botao";
import { cn } from "./cn";

// Faixa de pergunta (`inline-question`): faixa âmbar dentro do painel ou da
// janela, com a pergunta e sempre as mesmas duas respostas.

export type PropsFaixaPergunta = {
  pergunta: string;
  aoResponder: (resposta: RespostaPergunta) => void;
  className?: string;
};

export function FaixaPergunta({ pergunta, aoResponder, className }: PropsFaixaPergunta) {
  return (
    <div
      role="group"
      aria-label={pergunta}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border border-alert-warning-border bg-alert-warning-bg px-3 py-2 text-text",
        className,
      )}
    >
      <p className="min-w-0 flex-1 texto-body">{pergunta}</p>
      <div className="flex gap-2">
        <Botao tamanho="compacto" variante="secundario" onClick={() => aoResponder("so_este")}>
          {RESPOSTAS_PERGUNTA.so_este}
        </Botao>
        <Botao
          tamanho="compacto"
          variante="primario"
          onClick={() => aoResponder("aplicar_a_todos")}
        >
          {RESPOSTAS_PERGUNTA.aplicar_a_todos}
        </Botao>
      </div>
    </div>
  );
}
