"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { pedirRedefinicao } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

// "Esqueci a senha": sempre a mesma confirmação, exista ou não o e-mail.
export function FormularioEsqueci() {
  const [estado, acao, pendente] = useActionState(
    pedirRedefinicao,
    ESTADO_INICIAL,
  );

  if (estado.ok && estado.codigo) {
    return (
      <p role="status" className="max-w-sm">
        {mensagem(estado.codigo)}
      </p>
    );
  }

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>E-mail</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="min-h-11 rounded border px-3"
        />
      </label>
      {estado.codigo ? (
        <p role="alert">{mensagem(estado.codigo)}</p>
      ) : null}
      <button
        type="submit"
        disabled={pendente}
        className="min-h-11 rounded border px-4 font-semibold"
      >
        {pendente ? "Enviando…" : "Enviar link"}
      </button>
    </form>
  );
}
