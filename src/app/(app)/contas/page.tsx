import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { ContasManuais } from "@/features/contas-manuais/ContasManuais";
import { itemDaRota } from "@/ui/navegacao";

const item = itemDaRota("/contas");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Contas manuais (História 5.1): o cadastro "＋ Nova conta" é o componente
// cliente, que lê Responsáveis e Tipos dos gerenciadores de Realtime.
export default async function PaginaContas() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return <ContasManuais titulo={item.titulo} />;
}
