import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { mensagem } from "@/domain/mensagens";
import { configSupabase } from "@/data/supabase/config";
import { codigoDoMotivo, destinoSeguro } from "@/data/supabase/sessao";
import { temSessao } from "@/data/supabase/servidor";
import { FormularioEntrar } from "@/features/entrar/FormularioEntrar";
import { FormularioEsqueci } from "@/features/entrar/FormularioEsqueci";

export const metadata: Metadata = { title: "Entrar · Conta Comigo" };

type Busca = Promise<{ [chave: string]: string | string[] | undefined }>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaEntrar({ searchParams }: { searchParams: Busca }) {
  const busca = await searchParams;
  const disponivel = configSupabase() !== null;

  // Confere a sessão aqui também, sem depender só do proxy.
  if (disponivel && (await temSessao())) redirect("/");

  const codigoMotivo = codigoDoMotivo(primeiro(busca.motivo));
  const esqueci = primeiro(busca.modo) === "esqueci";
  const nextBruto = primeiro(busca.next);
  const next = nextBruto ? destinoSeguro(nextBruto) : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Conta Comigo</h1>

      {!disponivel ? (
        <p role="alert">{mensagem("auth.indisponivel")}</p>
      ) : esqueci ? (
        <>
          <h2 className="text-xl font-semibold">Esqueci a senha</h2>
          <FormularioEsqueci />
          <Link href="/entrar" className="underline">
            Voltar para Entrar
          </Link>
        </>
      ) : (
        <>
          {codigoMotivo ? <p role="alert">{mensagem(codigoMotivo)}</p> : null}
          <FormularioEntrar next={next && next !== "/" ? next : undefined} />
          <Link href="/entrar?modo=esqueci" className="underline">
            Esqueci a senha
          </Link>
        </>
      )}
    </main>
  );
}
