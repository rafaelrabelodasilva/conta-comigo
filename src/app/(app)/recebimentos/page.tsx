import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { Recebimentos } from "@/features/recebimentos/Recebimentos";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/recebimentos");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Recebimentos (Épico 6): os cartões por Bloco de cobrança (História 6.5) e o Histórico de Pagamentos
// (6.3). "A receber" (6.6) e "Meses anteriores da Fatura" (6.8) entram depois.
export default async function PaginaRecebimentos() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <Recebimentos />
    </Tela>
  );
}
