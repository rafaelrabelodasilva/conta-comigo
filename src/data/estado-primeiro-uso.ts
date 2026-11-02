// O que o Painel precisa saber, no servidor e antes de desenhar, para decidir
// se abre o Primeiro uso (`deveAbrirPrimeiroUso` do núcleo): a marca
// `configuracoes.primeiro_uso_em` e se há algum Responsável, Tipo ou Status
// (arquivados contam). Lê a marca primeiro; só se ela estiver vazia faz as
// três contagens `head` (nenhuma linha vem pela rede). O RLS limita ao dono.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoPrimeiroUso } from "@/domain/primeiro-uso";
import type { Database } from "./database.types";

const TABELAS_CADASTRO = ["responsaveis", "tipos", "status"] as const;

/** Falha traz só o código do erro (para o log, AD-17); quem chama não redireciona. */
export type LeituraPrimeiroUso =
  | { ok: true; estado: EstadoPrimeiroUso }
  | { ok: false; codigo: string };

function falha(erro: { code?: string } | null | undefined): LeituraPrimeiroUso {
  return { ok: false, codigo: erro?.code || "sem_codigo" };
}

export async function lerEstadoPrimeiroUso(cliente: SupabaseClient<Database>): Promise<LeituraPrimeiroUso> {
  try {
    const config = await cliente.from("configuracoes").select("primeiro_uso_em").maybeSingle();
    if (config.error) return falha(config.error);
    const concluidoEm = config.data?.primeiro_uso_em ?? null;
    // Já terminou: o Primeiro uso não abre sozinho, os cadastros não importam.
    if (concluidoEm !== null) return { ok: true, estado: { concluidoEm, temCadastro: false } };

    const contagens = await Promise.all(
      TABELAS_CADASTRO.map((tabela) => cliente.from(tabela).select("id", { count: "exact", head: true })),
    );
    let total = 0;
    for (const { error, count } of contagens) {
      if (error || count === null) return falha(error);
      total += count;
    }
    return { ok: true, estado: { concluidoEm: null, temCadastro: total > 0 } };
  } catch {
    return { ok: false, codigo: "excecao" };
  }
}
