import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { HistoricoDePagamentos } from "@/features/recebimentos/HistoricoDePagamentos";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/recebimentos");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Recebimentos (Épico 6). Por enquanto só o Histórico de Pagamentos (História 6.3); os cartões por
// Bloco de cobrança (6.5) entram acima dele, e "A receber" e "Meses anteriores da Fatura" vêm depois.
export default async function PaginaRecebimentos() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <HistoricoDePagamentos />
    </Tela>
  );
}
