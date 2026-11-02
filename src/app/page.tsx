import { redirect } from "next/navigation";
import { temSessao } from "@/data/supabase/servidor";
import { sair } from "@/features/entrar/acoes";

// Página protegida: confere a sessão aqui também, sem depender só do proxy.
export default async function Home() {
  if (!(await temSessao())) redirect("/entrar");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Conta Comigo</h1>
      <p>Divida a fatura do cartão entre quem comprou.</p>
      <form action={sair}>
        <button type="submit" className="min-h-11 rounded border px-4 font-semibold">
          Sair
        </button>
      </form>
    </main>
  );
}
