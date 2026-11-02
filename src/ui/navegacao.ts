// Regras puras do menu lateral (`nav-rail`): os seis itens na ordem do
// EXPERIENCE.md, qual está ativo para um caminho e qual o destino de um
// atalho ⌘/Ctrl + 1…6.

export type IconeNav = "painel" | "revisar" | "receber" | "previsao" | "contas" | "config";

export type ItemNav = {
  /** Rótulo curto sob o ícone. */
  rotulo: string;
  /** Nome completo da tela (título e nome acessível). */
  titulo: string;
  rota: string;
  icone: IconeNav;
};

export const ITENS_NAV = [
  { rotulo: "Painel", titulo: "Painel", rota: "/", icone: "painel" },
  { rotulo: "Revisar", titulo: "Revisar", rota: "/revisar", icone: "revisar" },
  { rotulo: "Receber", titulo: "Recebimentos", rota: "/recebimentos", icone: "receber" },
  { rotulo: "Previsão", titulo: "Previsão", rota: "/previsao", icone: "previsao" },
  { rotulo: "Contas", titulo: "Contas manuais", rota: "/contas", icone: "contas" },
  { rotulo: "Config.", titulo: "Configurações", rota: "/configuracoes", icone: "config" },
] as const satisfies readonly ItemNav[];

export type RotaNav = (typeof ITENS_NAV)[number]["rota"];

/** Item da rota exata (para título da tela). */
export function itemDaRota(rota: RotaNav): ItemNav {
  return ITENS_NAV.find((item) => item.rota === rota)!;
}

/**
 * Item ativo para o caminho atual. `/` só ativa o Painel no caminho exato;
 * os demais ativam também nas subrotas (`/configuracoes/x`).
 */
export function itemAtivo(caminho: string | null | undefined): ItemNav | undefined {
  if (!caminho) return undefined;
  const limpo = caminho.length > 1 ? caminho.replace(/\/+$/, "") || "/" : caminho;
  return ITENS_NAV.find((item) =>
    item.rota === "/"
      ? limpo === "/"
      : limpo === item.rota || limpo.startsWith(`${item.rota}/`),
  );
}

/** O que o atalho precisa saber do alvo do evento. */
export type AlvoTecla = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
} | null;

export type EventoTecla = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  alvo?: AlvoTecla;
};

const INPUTS_SEM_TEXTO = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** O alvo recebe texto digitado (campo, área de texto, seletor, editável). */
export function ehCampoDeTexto(alvo: AlvoTecla | undefined): boolean {
  if (!alvo) return false;
  if (alvo.isContentEditable) return true;
  const tag = alvo.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !INPUTS_SEM_TEXTO.has((alvo.type ?? "text").toLowerCase());
  return false;
}

/**
 * Destino do atalho ⌘/Ctrl + 1…6, ou `null`. Sem modificador, com Alt ou
 * Shift, ou dentro de um campo de texto, o atalho é ignorado.
 */
export function destinoDoAtalho(evento: EventoTecla): RotaNav | null {
  if (!(evento.metaKey || evento.ctrlKey)) return null;
  if (evento.altKey || evento.shiftKey || evento.isComposing) return null;
  if (ehCampoDeTexto(evento.alvo)) return null;

  const digito = /^Digit([1-6])$/.exec(evento.code ?? "")?.[1] ?? evento.key;
  if (!/^[1-6]$/.test(digito)) return null;
  return ITENS_NAV[Number(digito) - 1].rota;
}
