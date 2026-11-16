import { useSyncExternalStore } from "react";
import { hojeEmSaoPaulo } from "@/domain/datas";

// "Hoje" (`AAAA-MM-DD`, America/Sao_Paulo) para as telas que dependem do dia (Atrasado, 6.4).
// É o ÚNICO ponto da interface que lê o relógio para isso: o núcleo recebe `hoje` como
// parâmetro e nenhuma tela chama `Date.now()` por conta própria. Com o app aberto, o dia pode
// virar (o iPad fica aberto de um dia para o outro): o hook relê o relógio a cada minuto e
// quando a aba volta a ficar visível ou ganha o foco, e só redesenha quando o DIA muda (o
// valor é um texto, então o React compara o texto). Sem ele, o selo "Atrasado" só mudaria ao
// recarregar a página.

/** De quanto em quanto tempo o relógio é relido (ms): a virada do dia aparece em até 1 minuto. */
export const RELER_HOJE_A_CADA_MS = 60_000;

function assinar(avisar: () => void): () => void {
  const intervalo = setInterval(avisar, RELER_HOJE_A_CADA_MS);
  document.addEventListener("visibilitychange", avisar);
  window.addEventListener("focus", avisar);
  return () => {
    clearInterval(intervalo);
    document.removeEventListener("visibilitychange", avisar);
    window.removeEventListener("focus", avisar);
  };
}

const lerHoje = () => hojeEmSaoPaulo(new Date());

/** O dia de hoje em São Paulo, atualizado quando o dia vira com a tela aberta. */
export function useHoje(): string {
  return useSyncExternalStore(assinar, lerHoje, lerHoje);
}
