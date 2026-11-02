// Gravação com otimismo, comum aos repositórios (AD-3/AD-4): mostra a
// mudança já no gerenciador, grava no banco e aplica a resposta; se o banco
// recusar ou não responder, desfaz.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Gerenciador } from "./realtime";
import type { LinhaBase } from "./realtime-estado";

/** `ok: false` = o banco recusou ou não respondeu; a tela mostra "salvar.falhou". */
export type ResultadoGravacao = { ok: true } | { ok: false };

export const FALHOU: ResultadoGravacao = { ok: false };
export const OK: ResultadoGravacao = { ok: true };

/**
 * Aplica `mudancas` na memória, chama `gravar` e aplica as linhas devolvidas.
 * `gravar` devolve `null` quando o banco recusa; aí (ou se lançar) desfaz.
 */
export async function gravarComOtimismo<L extends LinhaBase>(
  obterCliente: () => SupabaseClient<Database> | null,
  memoria: Gerenciador<L>,
  mudancas: readonly (Partial<L> & { id: string })[],
  gravar: (cliente: SupabaseClient<Database>) => Promise<readonly L[] | null>,
): Promise<ResultadoGravacao> {
  const cliente = obterCliente();
  if (!cliente) return FALHOU;
  const desfazer = memoria.aplicarOtimista(mudancas);
  try {
    const linhas = await gravar(cliente);
    if (!linhas) {
      desfazer();
      return FALHOU;
    }
    memoria.aplicarLote(linhas);
    return OK;
  } catch {
    desfazer();
    return FALHOU;
  }
}
