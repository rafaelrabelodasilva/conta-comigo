"use client";

import { useEffect, useRef } from "react";
import { ehSelecionarTodos } from "@/domain/selecao";

// ⌘/Ctrl+A no PC (História 4.4, UX-DR11): seleciona todos os Lançamentos do
// filtro, como a caixa do cabeçalho. A regra da tecla é do núcleo
// (`ehSelecionarTodos`); aqui só se lê o foco no DOM. Com o foco num campo de
// texto, numa janela ou num menu, a tecla fica com o navegador.

const TIPOS_SEM_TEXTO = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "file", "range", "color"]);

/** O foco está onde ⌘/Ctrl+A significa "selecionar o texto". */
function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  if (alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement) return true;
  return alvo instanceof HTMLInputElement && !TIPOS_SEM_TEXTO.has(alvo.type);
}

/** Uma janela, um menu ou um popover aberto (o painel lateral não é um deles). */
function sobreposicaoAberta(): boolean {
  return document.querySelector('[role="alertdialog"], [role="dialog"], [role="menu"]') !== null;
}

export function AtalhoSelecionarTodos({ aoAtalho }: { aoAtalho: () => void }) {
  // Sempre a função da última renderização, sem reassinar o evento a cada uma.
  const ultimo = useRef(aoAtalho);
  useEffect(() => {
    ultimo.current = aoAtalho;
  }, [aoAtalho]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const contexto = { emCampoDeTexto: emCampoDeTexto(e.target), sobreposicaoAberta: sobreposicaoAberta() };
      if (!ehSelecionarTodos(e, contexto)) return;
      e.preventDefault();
      ultimo.current();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  return null;
}
