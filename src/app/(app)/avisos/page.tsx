import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { Avisos } from "@/features/avisos/Avisos";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/avisos");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// A Central de Avisos (História 8.1): os lembretes do dia, com "lido" que vale em todos os aparelhos.
export default async function PaginaAvisos() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <Avisos />
    </Tela>
  );
}
