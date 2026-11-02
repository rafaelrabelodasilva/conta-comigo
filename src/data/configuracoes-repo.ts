// Repositório de Configurações (AD-3). Uma linha por dono em
// `configuracoes`; a primeira gravação a cria (upsert em `owner_id`). Manda
// só as colunas alteradas e aplica a resposta no gerenciador de Realtime.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { FALHOU, OK, gravarComOtimismo, type ResultadoGravacao } from "./gravacao";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaConfiguracoes = LinhaDe<"configuracoes">;

export type { ResultadoGravacao };

/** A linha do dono (o RLS só deixa ver a própria), ou `undefined` se ainda não existe. */
export function configuracoesDoDono(
  linhas: readonly LinhaConfiguracoes[],
): LinhaConfiguracoes | undefined {
  return linhas[0];
}

export function criarRepoConfiguracoes(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaConfiguracoes>;
}) {
  const { obterCliente, memoria } = deps;

  async function upsertStatusPadrao(
    cliente: SupabaseClient<Database>,
    statusId: string | null,
  ): Promise<LinhaConfiguracoes[] | null> {
    const { data, error } = await cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: statusId }, { onConflict: "owner_id" })
      .select()
      .single();
    return error || !data ? null : [data];
  }

  return {
    /**
     * Status padrão das linhas novas (`null` = "Nenhum (não pago)"). Cria a
     * linha de Configurações se faltar; senão grava só a coluna, com otimismo.
     */
    async definirStatusPadrao(statusId: string | null): Promise<ResultadoGravacao> {
      const atual = configuracoesDoDono(memoria.linhas());
      if (atual) {
        if (atual.status_padrao_id === statusId) return OK;
        return gravarComOtimismo(
          obterCliente,
          memoria,
          [{ id: atual.id, status_padrao_id: statusId }],
          (cliente) => upsertStatusPadrao(cliente, statusId),
        );
      }
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const linhas = await upsertStatusPadrao(cliente, statusId);
        if (!linhas) return FALHOU;
        memoria.aplicarLote(linhas);
        return OK;
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoConfiguracoes = ReturnType<typeof criarRepoConfiguracoes>;

let repo: RepoConfiguracoes | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoConfiguracoes(): RepoConfiguracoes {
  repo ??= criarRepoConfiguracoes({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("configuracoes"),
  });
  return repo;
}
