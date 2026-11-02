// Repositório de Configurações (AD-3). Uma linha por dono em
// `configuracoes`; a primeira gravação a cria (upsert em `owner_id`, com os
// padrões do banco nas outras colunas). Manda só as colunas alteradas e
// aplica a resposta no gerenciador de Realtime.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Aparencia } from "@/domain/configuracoes";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { FALHOU, OK, gravarComOtimismo, type ResultadoGravacao } from "./gravacao";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaConfiguracoes = LinhaDe<"configuracoes">;

export type { ResultadoGravacao };

/** A linha do dono (o RLS só deixa ver a própria), ou `undefined` se ainda não existe. */
export function configuracoesDoDono(
  linhas: readonly LinhaConfiguracoes[],
): LinhaConfiguracoes | undefined {
  return linhas[0];
}

/** Colunas que a tela pode mudar. */
export type MudancaConfiguracoes = Partial<
  Pick<
    LinhaConfiguracoes,
    | "status_padrao_id"
    | "aparencia"
    | "limite_ajuste_centavos"
    | "tolerancia_atraso_dias"
    | "primeiro_uso_em"
  >
>;

export function criarRepoConfiguracoes(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaConfiguracoes>;
  /** Relógio de quem grava a marca do Primeiro uso; nos testes, fixo. */
  agora?: () => Date;
}) {
  const { obterCliente, memoria, agora = () => new Date() } = deps;

  /** Upsert em `owner_id` só com as colunas dadas (cria a linha se faltar). */
  async function upsertParcial(
    cliente: SupabaseClient<Database>,
    corpo: MudancaConfiguracoes,
  ): Promise<LinhaConfiguracoes[] | null> {
    const { data, error } = await cliente
      .from("configuracoes")
      .upsert(corpo, { onConflict: "owner_id" })
      .select()
      .single();
    return error || !data ? null : [data];
  }

  /**
   * Grava só as colunas que mudaram. Com a linha em memória, com otimismo
   * (desfeito se o banco recusar); sem ela, cria por upsert e aplica a resposta.
   */
  async function definir(mudanca: MudancaConfiguracoes): Promise<ResultadoGravacao> {
    const atual = configuracoesDoDono(memoria.linhas());
    if (atual) {
      const corpo = colunasAlteradas<MudancaConfiguracoes>(atual, mudanca);
      if (Object.keys(corpo).length === 0) return OK;
      return gravarComOtimismo(obterCliente, memoria, [{ id: atual.id, ...corpo }], (cliente) =>
        upsertParcial(cliente, corpo),
      );
    }
    const corpo = colunasAlteradas<MudancaConfiguracoes>({}, mudanca);
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      const linhas = await upsertParcial(cliente, corpo);
      if (!linhas) return FALHOU;
      memoria.aplicarLote(linhas);
      return OK;
    } catch {
      return FALHOU;
    }
  }

  return {
    /** Status padrão das linhas novas (`null` = "Nenhum (não pago)"). */
    definirStatusPadrao(statusId: string | null): Promise<ResultadoGravacao> {
      return definir({ status_padrao_id: statusId });
    },

    /** A tela já validou com o núcleo (`APARENCIAS`). */
    definirAparencia(aparencia: Aparencia): Promise<ResultadoGravacao> {
      return definir({ aparencia });
    },

    /**
     * Conferência e atraso numa só gravação (um upsert, um desfazer): só as
     * colunas que mudaram. A tela já validou com `validarLimiteAjuste` e
     * `validarToleranciaAtraso` do núcleo.
     */
    definirConferencia(
      valores: Pick<LinhaConfiguracoes, "limite_ajuste_centavos" | "tolerancia_atraso_dias">,
    ): Promise<ResultadoGravacao> {
      return definir({
        limite_ajuste_centavos: valores.limite_ajuste_centavos,
        tolerancia_atraso_dias: valores.tolerancia_atraso_dias,
      });
    },

    /**
     * Marca o Primeiro uso como terminado (concluído ou pulado até o fim):
     * `primeiro_uso_em` = agora, por upsert em `owner_id`. Vale em todos os
     * aparelhos: o Painel deixa de abrir o Primeiro uso sozinho.
     */
    concluirPrimeiroUso(): Promise<ResultadoGravacao> {
      return definir({ primeiro_uso_em: agora().toISOString() });
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
