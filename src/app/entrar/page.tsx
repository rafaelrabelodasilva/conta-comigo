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

// Link de texto: verde `accent` (≥ 4,5:1) e área de toque de 44 px.
const CLASSE_LINK =
  "inline-flex min-h-toque items-center texto-body text-accent underline underline-offset-2";

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
    <main className="flex flex-1 flex-col items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="texto-title">Conta Comigo</h1>

        {!disponivel ? (
          <p role="alert" className="texto-body text-danger-fg">
            {mensagem("auth.indisponivel")}
          </p>
        ) : esqueci ? (
          <>
            <h2 className="texto-body-strong">Esqueci a senha</h2>
            <FormularioEsqueci />
            <Link href="/entrar" className={CLASSE_LINK}>
              Voltar para Entrar
            </Link>
          </>
        ) : (
          <>
            {codigoMotivo ? (
              <p role="alert" className="texto-body text-text">
                {mensagem(codigoMotivo)}
              </p>
            ) : null}
            <FormularioEntrar next={next && next !== "/" ? next : undefined} />
            <Link href="/entrar?modo=esqueci" className={CLASSE_LINK}>
              Esqueci a senha
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
