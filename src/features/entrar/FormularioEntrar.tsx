"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { entrar } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

export function FormularioEntrar({ next }: { next?: string }) {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      {/* O React 19 limpa o formulário após a action; o e-mail volta pelo estado. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Campo
        rotulo="E-mail"
        key={estado.email ?? ""}
        defaultValue={estado.email}
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Campo
        rotulo="Senha"
        type="password"
        name="senha"
        autoComplete="current-password"
        required
      />
      {estado.codigo ? (
        <p role="alert" className="texto-label font-normal text-danger-fg">
          {mensagem(estado.codigo)}
        </p>
      ) : null}
      <Botao type="submit" variante="primario" disabled={pendente}>
        {pendente ? "Entrando…" : "Entrar"}
      </Botao>
    </form>
  );
}
