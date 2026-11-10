import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { Revisar } from "@/features/revisar/Revisar";
import { itemDaRota } from "@/ui/navegacao";

const item = itemDaRota("/revisar");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Revisar: a fila do que a importação não classificou. O conteúdo é o
// componente cliente, que lê do gerenciador da fila (tempo real).
export default async function PaginaRevisar() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return <Revisar titulo={item.titulo} />;
}
