"use client";

import { useEffect } from "react";
import { zerarGerenciadores } from "@/data/realtime";

// Zera a memória dos dados (AD-4) quando a página de entrar abre (Defeito 10, spec 1.4). Chega-se aqui depois de
// "Sair" (uma Server Action com `redirect`, que na documentação do Next é uma navegação no cliente: a página NÃO
// recarrega, então os gerenciadores de Realtime sobrevivem) ou quando a sessão expira. Sem isto, quem entra em seguida
// (outro usuário, na mesma aba) veria, até a releitura, os dados de quem saiu, e os canais seguiriam com o token velho.
// Não desenha nada.
export function ZerarAoEntrar() {
  useEffect(() => {
    void zerarGerenciadores();
  }, []);
  return null;
}
