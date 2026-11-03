import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TEXTOS_PROVA_FATURA } from "@/domain/mensagens";
import { temSessao } from "@/data/supabase/servidor";
import { ProvaFatura } from "@/features/prova-fatura/ProvaFatura";
import { Tela } from "@/ui/Tela";

export const metadata: Metadata = {
  title: `${TEXTOS_PROVA_FATURA.titulo} · Conta Comigo`,
  robots: { index: false, follow: false },
};

// Página de teste da História 2.1, fora do menu. A 2.3 a substitui pela
// janela de importação.
export default async function PaginaProvaFatura() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={TEXTOS_PROVA_FATURA.titulo}>
      <ProvaFatura />
    </Tela>
  );
}
