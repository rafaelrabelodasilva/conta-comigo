"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { redefinirSenha } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

export function FormularioNovaSenha() {
  const [estado, acao, pendente] = useActionState(redefinirSenha, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>Nova senha</span>
        <input
          type="password"
          name="senha"
          autoComplete="new-password"
          required
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Confirme a nova senha</span>
        <input
          type="password"
          name="confirmacao"
          autoComplete="new-password"
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
        {pendente ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
