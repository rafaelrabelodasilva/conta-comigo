"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
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
      <p role="status" className="max-w-sm texto-body text-text">
        {mensagem(estado.codigo)}
      </p>
    );
  }

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <Campo
        rotulo="E-mail"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      {estado.codigo ? (
        <p role="alert" className="texto-label font-normal text-danger-fg">
          {mensagem(estado.codigo)}
        </p>
      ) : null}
      <Botao type="submit" variante="primario" disabled={pendente}>
        {pendente ? "Enviando…" : "Enviar link"}
      </Botao>
    </form>
  );
}
