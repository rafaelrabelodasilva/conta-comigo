import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { mensagem } from "@/domain/mensagens";
import { deveAbrirPrimeiroUso } from "@/domain/primeiro-uso";
import type { Database } from "@/data/database.types";
import { lerEstadoPrimeiroUso } from "@/data/estado-primeiro-uso";
import { criarClienteServidor, temSessao } from "@/data/supabase/servidor";
import { log } from "@/server/log";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Painel provisório: o conteúdo chega nas próximas histórias. Enquanto isso,
// o estado vazio chama para importar a primeira fatura.
export default async function PaginaPainel() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  // Decide no servidor, antes de desenhar, para o Primeiro uso não piscar
  // depois do Painel. Se a leitura falhar, registra só o código e mostra o Painel.
  const cliente = (await criarClienteServidor()) as SupabaseClient<Database> | null;
  const leitura = cliente ? await lerEstadoPrimeiroUso(cliente) : null;
  if (leitura && !leitura.ok) {
    log("painel.primeiro_uso_falhou", { nivel: "warn", codigo: leitura.codigo, campos: { rota: "/" } });
  }
  if (leitura?.ok && deveAbrirPrimeiroUso(leitura.estado)) redirect("/primeiro-uso");

  return (
    <Tela titulo={item.titulo}>
      <EstadoVazio texto={mensagem("painel.vazio")} />
    </Tela>
  );
}
