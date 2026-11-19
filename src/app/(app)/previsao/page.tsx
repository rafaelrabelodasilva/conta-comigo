import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { Previsao } from "@/features/previsao/Previsao";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/previsao");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Previsão (Épico 7): "Próximos meses" (História 7.1). "Evolução" (7.2) e "Meu gasto por Tipo" (7.3) entram depois.
export default async function PaginaPrevisao() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <Previsao />
    </Tela>
  );
}
