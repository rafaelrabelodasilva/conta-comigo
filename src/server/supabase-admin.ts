import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/data/database.types";

// Cliente Supabase com a chave secreta (AD-12), só para o que roda sem usuário:
// o cron diário (`/api/cron/diario`, AD-13). A chave `SUPABASE_SECRET_KEY` só é
// lida aqui, no servidor, e nunca usa o prefixo `NEXT_PUBLIC_`. Esse cliente
// ignora o RLS: quem o usa filtra por dono sozinho e nunca o entrega a uma tela.
//
// Criado dentro de cada requisição, nunca no escopo do módulo, e sem guardar
// sessão. Devolve `null` quando o ambiente não tem a URL ou a chave (Previews e
// CI não recebem as variáveis).
export function criarClienteAdmin(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const chave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !chave) return null;
  return createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
