"use client";

import { contarFila } from "@/domain/revisar";
import { useFilaRevisar } from "@/data/realtime";
import { useCentralDeAvisos } from "@/features/avisos/use-central-de-avisos";
import { NavRail } from "@/ui/NavRail";

// Menu lateral com os contadores (`verify`, História 3.2; Avisos, História 8.1).
//
// Revisar: o mesmo número do "Faltam N" da tela, da mesma regra do núcleo (`ehDaFila`) sobre o gerenciador da
// fila. Some ao zerar e enquanto a fila carrega ou falha (sem número velho ou inventado).
//
// Avisos: os não lidos da Central de Avisos, da regra do núcleo (`avisosDaCentral`), pelo hook que a tela `/avisos`
// também usa. Mora aqui porque o menu está no layout: abre, na abertura do app, os gerenciadores que a Central lê.
// Some em 0 e enquanto carrega ou dá erro (nunca um número parcial); acima de 99 mostra "99+".
export function MenuLateral() {
  const fila = useFilaRevisar();
  const avisos = useCentralDeAvisos();
  const contador = fila.status === "pronto" ? contarFila(fila.linhas) : 0;
  const naoLidos = avisos.status === "pronto" ? avisos.central.naoLidos : 0;
  return <NavRail contadorRevisar={contador} contadorAvisos={naoLidos} />;
}
