import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROTULOS } from "@/domain/mensagens";
import { passoEscolhido } from "@/domain/primeiro-uso";
import { temSessao } from "@/data/supabase/servidor";
import { PassoAPasso } from "@/features/primeiro-uso/PassoAPasso";

export const metadata: Metadata = { title: `${ROTULOS.primeiro_uso} · Conta Comigo` };

// Primeiro uso em tela cheia. Visitado diretamente, sempre abre (é assim que
// se retoma por Configurações); quem decide abrir sozinho é o Painel. O passo
// vem de `?passo=` (inválido → passo 1).
export default async function PaginaPrimeiroUso({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  const passo = passoEscolhido((await searchParams).passo);
  return <PassoAPasso key={passo} passoInicial={passo} />;
}
