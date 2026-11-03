// Repositório de Tipos (AD-3). Única porta de gravação da tabela `tipos`:
// manda só as colunas alteradas, nunca `updated_at` nem `owner_id` (o banco
// define), e aplica a resposta no gerenciador de Realtime. As regras (nome,
// desarquivar) vêm do núcleo, chamadas pela tela.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { estaOnline } from "./conexao";
import {
  FALHOU,
  OK,
  gravarComOtimismo,
  semConexao,
  type Online,
  type ResultadoGravacao,
} from "./gravacao";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaTipo = LinhaDe<"tipos">;

/** Colunas que a tela pode mudar. */
export type MudancaTipo = Partial<Pick<LinhaTipo, "nome" | "arquivado">>;

export type NovoTipo = Pick<LinhaTipo, "nome">;

export type { ResultadoGravacao };

export function criarRepoTipos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaTipo>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoria, online = estaOnline } = deps;

  /** Grava só as colunas que mudaram em relação à memória, com otimismo. */
  async function atualizar(id: string, mudanca: MudancaTipo): Promise<ResultadoGravacao> {
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const atual = memoria.linha(id);
    if (!atual) return FALHOU;
    const corpo = colunasAlteradas<MudancaTipo>(atual, mudanca);
    if (Object.keys(corpo).length === 0) return OK;
    return gravarComOtimismo(obterCliente, memoria, [{ id, ...corpo }], async (cliente) => {
      const { data, error } = await cliente
        .from("tipos")
        .update(corpo)
        .eq("id", id)
        .select()
        .single();
      return error || !data ? null : [data];
    }, online);
  }

  return {
    /** Cria e aplica a linha devolvida (sem otimismo: o id vem do banco). */
    async criar(novo: NovoTipo): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("tipos")
          .insert({ nome: novo.nome })
          .select()
          .single();
        if (error || !data) return FALHOU;
        memoria.aplicarLote([data]);
        return OK;
      } catch {
        return FALHOU;
      }
    },

    atualizar,

    arquivar(id: string): Promise<ResultadoGravacao> {
      return atualizar(id, { arquivado: true });
    },

    /** A tela confere antes com `validarDesarquivarTipo` do núcleo. */
    desarquivar(id: string): Promise<ResultadoGravacao> {
      return atualizar(id, { arquivado: false });
    },
  };
}

export type RepoTipos = ReturnType<typeof criarRepoTipos>;

let repo: RepoTipos | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoTipos(): RepoTipos {
  repo ??= criarRepoTipos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("tipos"),
  });
  return repo;
}
