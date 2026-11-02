"use client";

import { useActionState } from "react";
import { mensagem } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { redefinirSenha } from "./acoes";
import { ESTADO_INICIAL } from "./estado";

export function FormularioNovaSenha() {
  const [estado, acao, pendente] = useActionState(redefinirSenha, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <Campo
        rotulo="Nova senha"
        type="password"
        name="senha"
        autoComplete="new-password"
        required
      />
      <Campo
        rotulo="Confirme a nova senha"
        type="password"
        name="confirmacao"
        autoComplete="new-password"
        required
      />
      {estado.codigo ? (
        <p role="alert" className="texto-label font-normal text-danger-fg">
          {mensagem(estado.codigo)}
        </p>
      ) : null}
      <Botao type="submit" variante="primario" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar nova senha"}
      </Botao>
    </form>
  );
}
