"use client";

import { contarFila } from "@/domain/revisar";
import { useFilaRevisar } from "@/data/realtime";
import { NavRail } from "@/ui/NavRail";

// Menu lateral com o contador do Revisar (`verify`, História 3.2): o mesmo
// número do "Faltam N" da tela, da mesma regra do núcleo (`ehDaFila`) sobre
// o gerenciador da fila. Some ao zerar e enquanto a fila carrega ou falha
// (sem número velho ou inventado).
export function MenuLateral() {
  const fila = useFilaRevisar();
  const contador = fila.status === "pronto" ? contarFila(fila.linhas) : 0;
  return <NavRail contadorRevisar={contador} />;
}
