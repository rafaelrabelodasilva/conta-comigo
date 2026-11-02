// Repositório de Responsáveis (AD-3). Única porta de gravação da tabela
// `responsaveis`: manda só as colunas alteradas, nunca `updated_at` nem
// `owner_id` (o banco define), e aplica a resposta no gerenciador de
// Realtime. As regras (nome, cor, ordem) vêm do núcleo, chamadas pela tela.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { FALHOU, OK, gravarComOtimismo as gravarOtimista, type ResultadoGravacao } from "./gravacao";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaResponsavel = LinhaDe<"responsaveis">;

/** Colunas que a tela pode mudar. */
export type MudancaResponsavel = Partial<Pick<LinhaResponsavel, "nome" | "cor" | "ordem" | "arquivado">>;

export type NovoResponsavel = Pick<LinhaResponsavel, "nome" | "cor" | "ordem">;

export type { ResultadoGravacao };

export function criarRepoResponsaveis(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaResponsavel>;
}) {
  const { obterCliente, memoria } = deps;

  function gravarComOtimismo(
    mudancas: readonly (MudancaResponsavel & { id: string })[],
    gravar: (cliente: SupabaseClient<Database>) => Promise<LinhaResponsavel[] | null>,
  ): Promise<ResultadoGravacao> {
    return gravarOtimista(obterCliente, memoria, mudancas, gravar);
  }

  /** Grava só as colunas que mudaram em relação à memória. */
  async function atualizar(id: string, mudanca: MudancaResponsavel): Promise<ResultadoGravacao> {
    const atual = memoria.linha(id);
    if (!atual) return FALHOU;
    const corpo = colunasAlteradas<MudancaResponsavel>(atual, mudanca);
    if (Object.keys(corpo).length === 0) return OK;
    return gravarComOtimismo([{ id, ...corpo }], async (cliente) => {
      const { data, error } = await cliente
        .from("responsaveis")
        .update(corpo)
        .eq("id", id)
        .select()
        .single();
      return error || !data ? null : [data];
    });
  }

  return {
    /** Cria e aplica a linha devolvida (sem otimismo: o id vem do banco). */
    async criar(novo: NovoResponsavel): Promise<ResultadoGravacao> {
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("responsaveis")
          .insert({ nome: novo.nome, cor: novo.cor, ordem: novo.ordem })
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

    /** Volta para a lista com a ordem nova (a maior + 1, calculada pelo núcleo). */
    desarquivar(id: string, ordem: number): Promise<ResultadoGravacao> {
      return atualizar(id, { arquivado: false, ordem });
    },

    /** Ids na ordem nova; a RPC grava numa transação e devolve as linhas mudadas. */
    async reordenar(ids: readonly string[]): Promise<ResultadoGravacao> {
      const mudancas = ids
        .map((id, i) => ({ id, ordem: i + 1 }))
        .filter((m) => memoria.linha(m.id)?.ordem !== m.ordem);
      if (mudancas.length === 0) return OK;
      return gravarComOtimismo(mudancas, async (cliente) => {
        const { data, error } = await cliente.rpc("reordenar_responsaveis", { ids: [...ids] });
        return error || !data ? null : data;
      });
    },
  };
}

export type RepoResponsaveis = ReturnType<typeof criarRepoResponsaveis>;

let repo: RepoResponsaveis | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoResponsaveis(): RepoResponsaveis {
  repo ??= criarRepoResponsaveis({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("responsaveis"),
  });
  return repo;
}
