// Repositório de Blocos (AD-3, História 4.1). Única porta de gravação da
// tabela `blocos`: a RPC `salvar_bloco` cria ou altera o Bloco e, ao marcar
// "É o meu Bloco", tira a marca do outro, numa transação; devolve as linhas
// afetadas, que vão para o gerenciador de Realtime. As regras (Fórmula, nome,
// ordem) vêm do núcleo (`planejarSalvarBloco`), chamado pela tela.
//
// Blocos no Painel (História 4.2): `reordenar` grava a ordem nova pela RPC
// `reordenar_blocos` (numa transação, com otimismo) e `excluir` apaga o Bloco
// (a política de delete do dono basta) e o tira da memória, sem esperar o
// DELETE do Realtime.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlocoParaGravar } from "@/domain/blocos";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, OK, gravarComOtimismo, semConexao, type Online, type ResultadoGravacao } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaBlocoBanco = LinhaDe<"blocos">;

export type { ResultadoGravacao };

export function criarRepoBlocos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaBlocoBanco>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoria, online = estaOnline } = deps;

  return {
    /** Cria ou altera o Bloco e aplica as linhas devolvidas (sem otimismo: o id vem do banco). */
    async salvar(pedido: BlocoParaGravar): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente.rpc("salvar_bloco", {
          p_nome: pedido.p_nome,
          p_formula: pedido.p_formula as unknown as Json,
          p_ordem: pedido.p_ordem,
          p_de_cobranca: pedido.p_de_cobranca,
          p_meu_bloco: pedido.p_meu_bloco,
          ...(pedido.p_id === null ? {} : { p_id: pedido.p_id }),
        });
        if (error || !data) return FALHOU;
        memoria.aplicarLote(data);
        return OK;
      } catch {
        return FALHOU;
      }
    },

    /**
     * Grava a ordem do Painel: `ids` são os Blocos na ordem nova. Mostra a
     * ordem já (otimismo) e desfaz se o banco recusar; sem mudança, não grava.
     */
    async reordenar(ids: readonly string[]): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const mudancas = ids
        .map((id, i) => ({ id, ordem: i + 1 }))
        .filter((m) => memoria.linha(m.id)?.ordem !== m.ordem);
      if (mudancas.length === 0) return OK;
      return gravarComOtimismo(
        obterCliente,
        memoria,
        mudancas,
        async (cliente) => {
          const { data, error } = await cliente.rpc("reordenar_blocos", { p_ids: [...ids] });
          return error || !data ? null : data;
        },
        online,
      );
    },

    /** Exclui o Bloco (a tela já pediu confirmação). Os Lançamentos não mudam. */
    async excluir(id: string): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { error } = await cliente.from("blocos").delete().eq("id", id);
        if (error) return FALHOU;
        memoria.remover([id]);
        return OK;
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoBlocos = ReturnType<typeof criarRepoBlocos>;

let repo: RepoBlocos | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoBlocos(): RepoBlocos {
  repo ??= criarRepoBlocos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("blocos"),
  });
  return repo;
}
