import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { FormularioNovaSenha } from "@/features/entrar/FormularioNovaSenha";

export const metadata: Metadata = { title: "Nova senha · Conta Comigo" };

// Chega aqui pelo link do e-mail, já com a sessão de recuperação criada em
// /auth/confirmar. Sem sessão, volta para Entrar.
export default async function PaginaRedefinirSenha() {
  if (!(await temSessao())) redirect("/entrar?motivo=link_expirou");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Criar nova senha</h1>
      <FormularioNovaSenha />
    </main>
  );
}
