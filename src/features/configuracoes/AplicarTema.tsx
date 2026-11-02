"use client";

import { useEffect } from "react";
import { APARENCIA_PADRAO, aparenciaDe } from "@/domain/configuracoes";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import { useLinhas } from "@/data/realtime";
import { aplicarAparencia } from "./tema";

// Aplica a Aparência de `configuracoes` (lida do gerenciador de Realtime) no
// `<html>`: muda o tema em todos os aparelhos abertos sem recarregar. Grava
// o cookie `tema` para o servidor já pintar certo no próximo carregamento.
// Enquanto carrega, mantém o que o servidor pintou (pelo cookie).
export function AplicarTema() {
  const { status, linhas } = useLinhas("configuracoes");
  const aparencia =
    status === "pronto" ? aparenciaDe(configuracoesDoDono(linhas)?.aparencia ?? APARENCIA_PADRAO) : null;

  useEffect(() => {
    if (aparencia === null) return;
    document.cookie = aplicarAparencia(document.documentElement, aparencia);
  }, [aparencia]);

  return null;
}
