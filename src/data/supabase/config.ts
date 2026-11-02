// Configuração pública do Supabase. Só as duas variáveis que podem ir para o
// navegador (AD-12). A chave secreta nunca é lida aqui.
//
// Sem alguma delas (Previews e CI não recebem as variáveis), devolve `null`:
// quem chama trata como "login indisponível neste ambiente" em vez de quebrar.
// As variáveis são lidas por nome literal para o Next.js inlinear no cliente.

export type ConfigSupabase = { url: string; chave: string };

export function configSupabase(): ConfigSupabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !chave) return null;
  return { url, chave };
}
