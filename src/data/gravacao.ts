// Gravação com otimismo, comum aos repositórios (AD-3/AD-4): mostra a
// mudança já no gerenciador, grava no banco e aplica a resposta; se o banco
// recusar ou não responder, desfaz. Sem conexão (detector `conexao.ts`),
// nada começa: nem otimismo, nem chamada ao cliente, nem fila.

import type { SupabaseClient } from "@supabase/supabase-js";
import { estaOnline } from "./conexao";
import type { Database } from "./database.types";
import type { Gerenciador } from "./realtime";
import type { LinhaBase } from "./realtime-estado";

/** Códigos de falha de gravação (do mapa de mensagens). */
export type CodigoFalhaGravacao = "salvar.falhou" | "conexao.gravar_sem_conexao";

/**
 * `ok: false` leva o código que a tela mostra com `mensagem(r.codigo)`:
 * `salvar.falhou` (o banco recusou ou não respondeu) ou
 * `conexao.gravar_sem_conexao` (sem internet, nada foi tentado).
 */
export type ResultadoGravacao = { ok: true } | { ok: false; codigo: CodigoFalhaGravacao };

export const FALHOU = { ok: false, codigo: "salvar.falhou" } as const satisfies ResultadoGravacao;
export const SEM_CONEXAO = {
  ok: false,
  codigo: "conexao.gravar_sem_conexao",
} as const satisfies ResultadoGravacao;
export const OK = { ok: true } as const satisfies ResultadoGravacao;

/** Quem diz se há conexão; nos testes, um falso. */
export type Online = () => boolean;

/** `SEM_CONEXAO` quando não há internet; `null` quando pode seguir. */
export function semConexao(online: Online = estaOnline): typeof SEM_CONEXAO | null {
  return online() ? null : SEM_CONEXAO;
}

/**
 * Aplica `mudancas` na memória, chama `gravar` e aplica as linhas devolvidas.
 * `gravar` devolve `null` quando o banco recusa; aí (ou se lançar) desfaz.
 * Sem conexão, devolve `SEM_CONEXAO` antes de tocar na memória ou no cliente.
 */
export async function gravarComOtimismo<L extends LinhaBase>(
  obterCliente: () => SupabaseClient<Database> | null,
  memoria: Gerenciador<L>,
  mudancas: readonly (Partial<L> & { id: string })[],
  gravar: (cliente: SupabaseClient<Database>) => Promise<readonly L[] | null>,
  online: Online = estaOnline,
): Promise<ResultadoGravacao> {
  const bloqueio = semConexao(online);
  if (bloqueio) return bloqueio;
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
