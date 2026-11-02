import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { configSupabase } from "./config";

// Cliente Supabase do servidor (Server Components, Server Actions e Route
// Handlers). Criado dentro de cada requisição, nunca no escopo do módulo
// (Fluid compute reaproveita a instância entre requisições).
//
// Devolve `null` quando o ambiente não tem as variáveis do Supabase.
export async function criarClienteServidor(): Promise<SupabaseClient | null> {
  // `cookies()` antes de tudo: torna a rota dinâmica mesmo sem as variáveis,
  // para nenhuma página protegida virar estática no build.
  const loja = await cookies();
  const config = configSupabase();
  if (!config) return null;

  return createServerClient(config.url, config.chave, {
    cookies: {
      getAll() {
        return loja.getAll();
      },
      // Os cabeçalhos de cache (2º argumento) só podem ir para a resposta no
      // proxy, que os aplica. Aqui as respostas que gravam cookies são
      // dinâmicas (Server Action ou Route Handler) e não ficam em cache.
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) {
            loja.set(name, value, options);
          }
        } catch {
          // Server Component não grava cookies. O proxy já renovou a sessão
          // nesta requisição, então pode ignorar.
        }
      },
    },
  });
}

/**
 * Diz se a requisição atual tem sessão válida, conferida com `getClaims()`
 * (nunca `getSession()`). Sem Supabase no ambiente, não há sessão.
 */
export async function temSessao(): Promise<boolean> {
  const supabase = await criarClienteServidor();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    return !error && Boolean(data?.claims);
  } catch {
    return false;
  }
}
