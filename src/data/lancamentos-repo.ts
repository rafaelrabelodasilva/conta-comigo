// Repositório de Lançamentos (História 2.7, AD-3/AD-4/AD-16). Única porta
// de gravação de `lancamentos` fora da importação (que segue em
// `faturas-repo.ts`, pela RPC).
//
// - `atualizar`: só as colunas que mudaram em relação à memória e
//   `editado_em` (o relógio do aparelho), com otimismo.
// - `incluir`: sem otimismo (o id vem do banco); aplica a linha devolvida.
// - `excluir` / `restaurar`: só `excluido_em`, com otimismo; "Desfazer"
//   limpa o campo no mesmo `id`.
//
// Toda gravação que deu certo devolve a linha gravada: o painel guarda o
// `updated_at` dela para reconhecer as próprias gravações quando o Realtime
// as trouxer de volta.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MudancaCampo, NovoLancamento } from "@/domain/lancamento";
import { estaOnline } from "./conexao";
import type { Database } from "./database.types";
import { FALHOU, gravarComOtimismo, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaLancamento = LinhaDe<"lancamentos">;

/** Colunas que o painel pode mudar num Lançamento existente. */
export type MudancaLancamento = Partial<
  Pick<LinhaLancamento, "valor_centavos" | "data" | "apelido" | "observacao" | "responsavel_id" | "tipo_id" | "status_id">
>;

/**
 * `ok: true` leva a linha gravada (sem nada a gravar, a da memória).
 * `ok: false` leva o código: `salvar.falhou` ou `conexao.gravar_sem_conexao`.
 */
export type ResultadoLancamento =
  | { ok: true; linha: LinhaLancamento }
  | { ok: false; codigo: CodigoFalhaGravacao };

/** A mudança de um campo do núcleo (`mudancaDoCampo`) como corpo do repositório. */
export function mudancaDaColuna(m: MudancaCampo): MudancaLancamento {
  return { [m.coluna]: m.valor } as MudancaLancamento;
}

export function criarRepoLancamentos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoria, online = estaOnline } = deps;

  /** Grava `corpo` com otimismo e devolve a linha que o banco devolveu. */
  async function gravar(id: string, corpo: Partial<LinhaLancamento>): Promise<ResultadoLancamento> {
    // Numa caixa: o TS não acompanha a atribuição feita dentro do callback.
    const gravada: { linha: LinhaLancamento | null } = { linha: null };
    const r = await gravarComOtimismo(
      obterCliente,
      memoria,
      [{ id, ...corpo }],
      async (cliente) => {
        const { data, error } = await cliente.from("lancamentos").update(corpo).eq("id", id).select().single();
        if (error || !data) return null;
        gravada.linha = data;
        return [data];
      },
      online,
    );
    if (!r.ok) return r;
    return gravada.linha ? { ok: true, linha: gravada.linha } : FALHOU;
  }

  return {
    /** Só as colunas que mudaram e `editado_em` (`agora`, padrão o relógio do aparelho). */
    async atualizar(id: string, mudanca: MudancaLancamento, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const atual = memoria.linha(id);
      if (!atual) return FALHOU;
      const corpo = colunasAlteradas<MudancaLancamento>(atual, mudanca);
      if (Object.keys(corpo).length === 0) return { ok: true, linha: atual };
      return gravar(id, { ...corpo, editado_em: agora.toISOString() });
    },

    /** Insere (sem otimismo: o id vem do banco) e aplica a linha devolvida. */
    async incluir(novo: NovoLancamento): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente.from("lancamentos").insert({ ...novo }).select().single();
        if (error || !data) return FALHOU;
        // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
        memoria.aplicarLote([data]);
        return { ok: true, linha: data };
      } catch {
        return FALHOU;
      }
    },

    /** Exclusão lógica (AD-16): grava só `excluido_em`. */
    excluir(id: string, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      if (!memoria.linha(id)) return Promise.resolve(FALHOU);
      return gravar(id, { excluido_em: agora.toISOString() });
    },

    /**
     * "Desfazer" da exclusão: limpa `excluido_em` no mesmo `id`. Linha fora
     * da memória (o Mês mudou depois de excluir): grava sem otimismo e
     * aplica a resposta (o gerenciador só guarda se for do Mês aberto).
     */
    async restaurar(id: string): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      if (memoria.linha(id)) return gravar(id, { excluido_em: null });
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("lancamentos")
          .update({ excluido_em: null })
          .eq("id", id)
          .select()
          .single();
        if (error || !data) return FALHOU;
        memoria.aplicarLote([data]);
        return { ok: true, linha: data };
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoLancamentos = ReturnType<typeof criarRepoLancamentos>;

let repo: RepoLancamentos | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoLancamentos(): RepoLancamentos {
  repo ??= criarRepoLancamentos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("lancamentos"),
  });
  return repo;
}
