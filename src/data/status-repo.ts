// Repositório de Status (AD-3). Única porta de gravação da tabela `status`
// (exceto a exclusão, que é só pela RPC em `cadastros-repo.ts`): manda só as
// colunas alteradas, nunca `updated_at` nem `owner_id` (o banco define), e
// aplica a resposta no gerenciador de Realtime. As regras (nome, arquivar o
// padrão, desarquivar) vêm do núcleo, chamadas pela tela.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { FALHOU, OK, gravarComOtimismo, type ResultadoGravacao } from "./gravacao";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaStatus = LinhaDe<"status">;

/** Colunas que a tela pode mudar. */
export type MudancaStatus = Partial<Pick<LinhaStatus, "nome" | "conta_como_pago" | "arquivado">>;

export type NovoStatus = Pick<LinhaStatus, "nome">;

export type { ResultadoGravacao };

export function criarRepoStatus(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaStatus>;
}) {
  const { obterCliente, memoria } = deps;

  /** Grava só as colunas que mudaram em relação à memória, com otimismo. */
  async function atualizar(id: string, mudanca: MudancaStatus): Promise<ResultadoGravacao> {
    const atual = memoria.linha(id);
    if (!atual) return FALHOU;
    const corpo = colunasAlteradas<MudancaStatus>(atual, mudanca);
    if (Object.keys(corpo).length === 0) return OK;
    return gravarComOtimismo(obterCliente, memoria, [{ id, ...corpo }], async (cliente) => {
      const { data, error } = await cliente
        .from("status")
        .update(corpo)
        .eq("id", id)
        .select()
        .single();
      return error || !data ? null : [data];
    });
  }

  return {
    /** Cria (com "conta como pago" desligado) e aplica a linha devolvida. */
    async criar(novo: NovoStatus): Promise<ResultadoGravacao> {
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("status")
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

    definirContaComoPago(id: string, contaComoPago: boolean): Promise<ResultadoGravacao> {
      return atualizar(id, { conta_como_pago: contaComoPago });
    },

    /** A tela confere antes com `validarArquivarStatus` do núcleo. */
    arquivar(id: string): Promise<ResultadoGravacao> {
      return atualizar(id, { arquivado: true });
    },

    /** A tela confere antes com `validarDesarquivarStatus` do núcleo. */
    desarquivar(id: string): Promise<ResultadoGravacao> {
      return atualizar(id, { arquivado: false });
    },
  };
}

export type RepoStatus = ReturnType<typeof criarRepoStatus>;

let repo: RepoStatus | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoStatus(): RepoStatus {
  repo ??= criarRepoStatus({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("status"),
  });
  return repo;
}
