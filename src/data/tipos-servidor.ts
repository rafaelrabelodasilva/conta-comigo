// Leitura dos Tipos no servidor (rota de extração da Fatura). O RLS limita
// ao dono da sessão. Só lê: a gravação de Tipos é do `tipos-repo.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ativos } from "@/domain/tipos";
import type { Database } from "./database.types";

export type LeituraTipos = { ok: true; nomes: string[] } | { ok: false; codigo: string };

/** Nomes dos Tipos ativos, em ordem alfabética (`ativos` do núcleo). */
export async function lerNomesTiposAtivos(cliente: SupabaseClient<Database>): Promise<LeituraTipos> {
  try {
    const { data, error } = await cliente.from("tipos").select("id,nome,arquivado");
    if (error || !data) return { ok: false, codigo: error?.code || "sem_codigo" };
    return { ok: true, nomes: ativos(data).map((t) => t.nome) };
  } catch {
    return { ok: false, codigo: "excecao" };
  }
}
