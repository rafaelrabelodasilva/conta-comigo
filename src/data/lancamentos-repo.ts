// Repositório de Lançamentos (História 2.7, AD-3/AD-4/AD-16). Única porta
// de gravação de `lancamentos` fora da importação (que segue em
// `faturas-repo.ts`, pela RPC).
//
// - `atualizar`: só as colunas que mudaram em relação à memória e
//   `editado_em` (o relógio do aparelho), com otimismo.
// - `incluir`: sem otimismo (o id vem do banco); aplica a linha devolvida.
// - `excluir` / `restaurar`: só `excluido_em`, com otimismo; "Desfazer"
//   limpa o campo no mesmo `id`.
// - Ajustes de centavos (História 2.8): `atualizar`, `excluir` e
//   `restaurar` aceitam os ids que vão `junto` (os Ajustes da mãe), numa
//   requisição só (`update … in (ids)`); `desvincular` e `religar` gravam o
//   `ajuste_de_id`.
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

/** Opções de uma gravação: `agora` (padrão, o relógio do aparelho) e os ids gravados `junto`. */
export type OpcoesGravacao = {
  agora?: Date;
  /**
   * Ajustes de centavos que acompanham a linha (História 2.8): recebem o
   * mesmo corpo, na mesma requisição (`update … in (ids)`), com otimismo.
   */
  junto?: readonly string[];
};

/** A mãe a que um Ajuste volta no "Desfazer" do "Desvincular": o id e a classificação atual. */
export type MaeDoAjuste = Pick<LinhaLancamento, "id" | "tipo_id" | "responsavel_id">;

export function criarRepoLancamentos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoria, online = estaOnline } = deps;

  /** Os ids da gravação: a linha e as que vão junto, sem repetir. */
  const todos = (id: string, junto: readonly string[] = []) => [id, ...junto.filter((j) => j !== id)];

  /**
   * Grava `corpo` em `ids` com otimismo e devolve a linha `ids[0]` que o
   * banco devolveu. Uma linha só: `eq(id)`; várias: `in(ids)`, numa
   * requisição.
   */
  async function gravar(ids: readonly string[], corpo: Partial<LinhaLancamento>): Promise<ResultadoLancamento> {
    const [id] = ids;
    // Numa caixa: o TS não acompanha a atribuição feita dentro do callback.
    const gravada: { linha: LinhaLancamento | null } = { linha: null };
    const r = await gravarComOtimismo(
      obterCliente,
      memoria,
      ids.map((i) => ({ id: i, ...corpo })),
      async (cliente) => {
        if (ids.length === 1) {
          const { data, error } = await cliente.from("lancamentos").update(corpo).eq("id", id).select().single();
          if (error || !data) return null;
          gravada.linha = data;
          return [data];
        }
        const { data, error } = await cliente.from("lancamentos").update(corpo).in("id", ids).select();
        // Resposta parcial (alguma linha não voltou): falha, e o otimismo é desfeito.
        if (error || !data || data.length !== ids.length) return null;
        gravada.linha = data.find((l) => l.id === id) ?? null;
        return gravada.linha ? data : null;
      },
      online,
    );
    if (!r.ok) return r;
    return gravada.linha ? { ok: true, linha: gravada.linha } : FALHOU;
  }

  /** Sem otimismo (linhas fora da memória): grava e aplica a resposta. */
  async function gravarSemMemoria(ids: readonly string[], corpo: Partial<LinhaLancamento>): Promise<ResultadoLancamento> {
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      let data: LinhaLancamento[] | null;
      if (ids.length === 1) {
        const r = await cliente.from("lancamentos").update(corpo).eq("id", ids[0]).select().single();
        data = r.error || !r.data ? null : [r.data];
      } else {
        const r = await cliente.from("lancamentos").update(corpo).in("id", ids).select();
        data = r.error ? null : r.data;
      }
      const linha = data?.find((l) => l.id === ids[0]);
      if (!data || data.length !== ids.length || !linha) return FALHOU;
      // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
      memoria.aplicarLote(data);
      return { ok: true, linha };
    } catch {
      return FALHOU;
    }
  }

  return {
    /**
     * Só as colunas que mudaram (em relação à linha `id`) e `editado_em`.
     * Com `junto` (os Ajustes da mãe, ao mudar Tipo ou Responsável), as
     * mesmas colunas vão para eles na mesma requisição.
     */
    async atualizar(id: string, mudanca: MudancaLancamento, opcoes: OpcoesGravacao = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const atual = memoria.linha(id);
      if (!atual) return FALHOU;
      const corpo = colunasAlteradas<MudancaLancamento>(atual, mudanca);
      if (Object.keys(corpo).length === 0) return { ok: true, linha: atual };
      const ids = todos(id, (opcoes.junto ?? []).filter((j) => memoria.linha(j)));
      return gravar(ids, { ...corpo, editado_em: (opcoes.agora ?? new Date()).toISOString() });
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

    /**
     * Exclusão lógica (AD-16): grava só `excluido_em`. Com `junto` (os
     * Ajustes da mãe), eles saem na mesma gravação.
     */
    excluir(id: string, opcoes: OpcoesGravacao = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      if (!memoria.linha(id)) return Promise.resolve(FALHOU);
      const ids = todos(id, (opcoes.junto ?? []).filter((j) => memoria.linha(j)));
      return gravar(ids, { excluido_em: (opcoes.agora ?? new Date()).toISOString() });
    },

    /**
     * "Desfazer" da exclusão: limpa `excluido_em` no mesmo `id` (e nos
     * `junto`, os Ajustes que saíram com ele). Linha fora da memória (o Mês
     * mudou depois de excluir): grava sem otimismo e aplica a resposta (o
     * gerenciador só guarda se for do Mês aberto).
     */
    async restaurar(id: string, opcoes: Pick<OpcoesGravacao, "junto"> = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const ids = todos(id, opcoes.junto);
      if (ids.every((i) => memoria.linha(i))) return gravar(ids, { excluido_em: null });
      return gravarSemMemoria(ids, { excluido_em: null });
    },

    /** "Desvincular" do Ajuste: `ajuste_de_id = null`; Tipo e Responsável ficam como estão. */
    desvincular(id: string, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      if (!memoria.linha(id)) return Promise.resolve(FALHOU);
      return gravar([id], { ajuste_de_id: null, editado_em: agora.toISOString() });
    },

    /**
     * "Desfazer" do "Desvincular": religa o Ajuste à mãe e copia o Tipo e o
     * Responsável atuais dela, numa gravação só.
     */
    religar(id: string, mae: MaeDoAjuste, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      const corpo = {
        ajuste_de_id: mae.id,
        tipo_id: mae.tipo_id,
        responsavel_id: mae.responsavel_id,
        editado_em: agora.toISOString(),
      };
      // Fora da memória (o Mês mudou depois de desvincular): sem otimismo, como `restaurar`.
      return memoria.linha(id) ? gravar([id], corpo) : gravarSemMemoria([id], corpo);
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
