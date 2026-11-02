"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { entrar } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

// Visual provisório: os tokens e componentes chegam na História 1.3.
export function FormularioEntrar({ next }: { next?: string }) {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      {/* O React 19 limpa o formulário após a action; o e-mail volta pelo estado. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1">
        <span>E-mail</span>
        <input
          key={estado.email ?? ""}
          defaultValue={estado.email}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="min-h-11 rounded border px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Senha</span>
        <input
          type="password"
          name="senha"
          autoComplete="current-password"
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
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
