import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ehMes } from "@/domain/ciclo";
import { deveAbrirPrimeiroUso } from "@/domain/primeiro-uso";
import type { Database } from "@/data/database.types";
import { lerEstadoPrimeiroUso } from "@/data/estado-primeiro-uso";
import { criarClienteServidor, temSessao } from "@/data/supabase/servidor";
import { Painel } from "@/features/painel/Painel";
import { log } from "@/server/log";
import { itemDaRota } from "@/ui/navegacao";

const item = itemDaRota("/");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

/** Um `uuid` (o id de um Lançamento): qualquer outro texto do endereço é ignorado. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Painel: o servidor decide o Primeiro uso; o conteúdo (o Painel do Mês com
// o seletor, o cartão da fatura, a grade e a janela "Importar fatura") é o
// componente cliente, que lê dos gerenciadores de Realtime. `?mes=AAAA-MM&lancamento=<id>` abre o Mês
// e o painel do Lançamento (Recebimentos → "A receber", História 6.6); valor que não tem esse formato é ignorado.
export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
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

  const parametros = await searchParams;
  const mes = primeiro(parametros.mes);
  const lancamento = primeiro(parametros.lancamento);
  const mesInicial = mes !== undefined && ehMes(mes) ? mes : undefined;
  const lancamentoInicial = mesInicial !== undefined && lancamento !== undefined && UUID.test(lancamento) ? lancamento : undefined;
  return <Painel titulo={item.titulo} mesInicial={mesInicial} lancamentoInicial={lancamentoInicial} />;
}
