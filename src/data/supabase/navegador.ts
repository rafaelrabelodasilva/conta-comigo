import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configSupabase } from "./config";

// Cliente Supabase do navegador. Usa só a URL e a chave publicável (AD-12).
// Criar dentro do componente ou hook que usa; `createBrowserClient` já
// devolve a mesma instância no navegador. Sem as variáveis, devolve `null`.
export function criarClienteNavegador(): SupabaseClient | null {
  const config = configSupabase();
  if (!config) return null;
  return createBrowserClient(config.url, config.chave);
}
