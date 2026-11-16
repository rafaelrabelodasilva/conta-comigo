// Repositório de Pagamentos (História 6.1, FR-25, AD-3, AD-4, AD-10, AD-16). Única
// porta de gravação de `pagamentos` e `pagamento_itens`: as RPCs gravam numa
// transação só o que o núcleo calculou (`src/domain/pagamento.ts`).
//
// - `aplicar`: manda o pedido que `planejarPagamento` montou a `aplicar_pagamento`.
//   Sem otimismo (a RPC grava três tabelas e o Status das linhas): as linhas e os
//   itens devolvidos vão para os gerenciadores (AD-4); o Realtime que chega depois
//   não duplica nada (mesmo `id`, `updated_at` não mais novo). Repetir o pedido
//   (mesmo `id`) devolve o mesmo Pagamento, sem gravar de novo.
// - `desfazer`: lê do banco o que o núcleo precisa (os itens vivos do Pagamento, as
//   linhas como estão agora e os itens de outros Pagamentos que as tocam), pede o
//   plano a `planejarDesfazerPagamento` (AD-10: o Status anterior volta só onde o
//   atual ainda é o aplicado e nenhum Pagamento posterior tocou) e grava por
//   `desfazer_pagamento`. Se uma linha mudou entre a leitura e a gravação, a RPC
//   recusa (`pagamento.mudou`) e nada muda.
// - Sem conexão, nada começa (AD-3): `conexao.gravar_sem_conexao`.
// - As leituras por `in (…)` vão em blocos (o endereço da requisição tem limite) e
//   nenhuma passa de 1000 linhas (o corte do PostgREST).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planejarDesfazerPagamento,
  type ItemParaDesfazer,
  type OutroItemDoLancamento,
  type PedidoDePagamento,
} from "@/domain/pagamento";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaPagamento = LinhaDe<"pagamentos">;
export type LinhaItemDePagamento = LinhaDe<"pagamento_itens">;
type LinhaLancamento = LinhaDe<"lancamentos">;

/** Códigos que as RPCs devolvem (do mapa de mensagens), além dos de gravação. */
export type CodigoFalhaPagamento =
  | CodigoFalhaGravacao
  | "pagamento.mudou"
  | "pagamento.status_invalido"
  | "pagamento.ja_desfeito"
  | "pagamento.nao_encontrado"
  | "pagamento.desfazer_antes"
  | "auth.sessao_expirou";

const CODIGOS_DA_RPC = [
  "pagamento.mudou",
  "pagamento.status_invalido",
  "pagamento.ja_desfeito",
  "pagamento.nao_encontrado",
  "pagamento.desfazer_antes",
  "auth.sessao_expirou",
] as const;

function codigoDoErro(erro: { message?: string } | null | undefined): CodigoFalhaPagamento {
  const texto = erro?.message ?? "";
  return CODIGOS_DA_RPC.find((c) => texto.includes(c)) ?? "salvar.falhou";
}

/** O que as RPCs devolvem: o Pagamento, os itens e as linhas que eles tocam. */
type RespostaDoPagamento = {
  pagamento?: LinhaPagamento | null;
  itens?: LinhaItemDePagamento[];
  lancamentos?: LinhaLancamento[];
};

export type ResultadoPagamento =
  | { ok: true; pagamento: LinhaPagamento; itens: LinhaItemDePagamento[]; linhas: LinhaLancamento[] }
  | { ok: false; codigo: CodigoFalhaPagamento };

/** Quantos ids vão numa requisição `in (…)`. */
const POR_BLOCO = 100;

function blocos<T>(lista: readonly T[]): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_BLOCO) saida.push(lista.slice(i, i + POR_BLOCO));
  return saida;
}

export function criarRepoPagamentos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoriaLancamentos: Gerenciador<LinhaLancamento>;
  memoriaItens: Gerenciador<LinhaItemDePagamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoriaLancamentos, memoriaItens, online = estaOnline } = deps;

  /** Chama a RPC e aplica a resposta nos gerenciadores (só o Mês aberto fica na memória). */
  async function chamar(
    cliente: SupabaseClient<Database>,
    nome: "aplicar_pagamento" | "desfazer_pagamento",
    pedido: unknown,
  ): Promise<ResultadoPagamento> {
    const { data, error } = await cliente.rpc(nome, { p_pedido: pedido as Json });
    if (error) return { ok: false, codigo: codigoDoErro(error) };
    const r = data as RespostaDoPagamento | null;
    if (!r || !r.pagamento || !Array.isArray(r.itens) || !Array.isArray(r.lancamentos)) return FALHOU;
    memoriaLancamentos.aplicarLote(r.lancamentos);
    memoriaItens.aplicarLote(r.itens);
    return { ok: true, pagamento: r.pagamento, itens: r.itens, linhas: r.lancamentos };
  }

  /** Os itens vivos do Pagamento, como o núcleo os lê. */
  async function lerItensDoPagamento(
    cliente: SupabaseClient<Database>,
    pagamentoId: string,
  ): Promise<ItemParaDesfazer[] | null> {
    const { data, error } = await cliente
      .from("pagamento_itens")
      .select("lancamento_id, status_anterior_id, status_aplicado_id, created_at")
      .eq("pagamento_id", pagamentoId)
      .is("excluido_em", null)
      .limit(1000);
    return error || !data ? null : data;
  }

  /** As linhas como estão agora (Status e versão). */
  async function lerLinhas(
    cliente: SupabaseClient<Database>,
    ids: readonly string[],
  ): Promise<{ id: string; status_id: string | null; updated_at: string }[] | null> {
    const saida: { id: string; status_id: string | null; updated_at: string }[] = [];
    for (const bloco of blocos(ids)) {
      const { data, error } = await cliente.from("lancamentos").select("id, status_id, updated_at").in("id", bloco);
      if (error || !data) return null;
      saida.push(...data);
    }
    return saida;
  }

  /** Os itens vivos de OUTROS Pagamentos nessas linhas. */
  async function lerOutrosItens(
    cliente: SupabaseClient<Database>,
    ids: readonly string[],
    pagamentoId: string,
  ): Promise<OutroItemDoLancamento[] | null> {
    const saida: OutroItemDoLancamento[] = [];
    for (const bloco of blocos(ids)) {
      const { data, error } = await cliente
        .from("pagamento_itens")
        .select("lancamento_id, created_at")
        .in("lancamento_id", bloco)
        .neq("pagamento_id", pagamentoId)
        .is("excluido_em", null)
        .limit(1000);
      if (error || !data) return null;
      saida.push(...data);
    }
    return saida;
  }

  return {
    /**
     * Grava o Pagamento (o pedido de `planejarPagamento`): um Pagamento `total`, um
     * item por linha e o Status das linhas, numa transação. `pagamento.mudou`: uma
     * linha mudou desde que a tela a leu (a tela relê e Rafael confere).
     */
    async aplicar(pedido: PedidoDePagamento): Promise<ResultadoPagamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        return await chamar(cliente, "aplicar_pagamento", pedido);
      } catch {
        return FALHOU;
      }
    },

    /**
     * Desfaz o Pagamento: exclui em lógico e devolve o Status anterior só onde o
     * núcleo manda (AD-10). Desfazer de novo um Pagamento já desfeito não faz nada.
     */
    async desfazer(pagamentoId: string): Promise<ResultadoPagamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const itens = await lerItensDoPagamento(cliente, pagamentoId);
        if (!itens) return FALHOU;
        const ids = itens.map((i) => i.lancamento_id);
        const [linhas, outros] = await Promise.all([lerLinhas(cliente, ids), lerOutrosItens(cliente, ids, pagamentoId)]);
        if (!linhas || !outros) return FALHOU;
        const plano = planejarDesfazerPagamento(itens, linhas, outros);
        return await chamar(cliente, "desfazer_pagamento", { pagamento_id: pagamentoId, devolver: plano.devolver });
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoPagamentos = ReturnType<typeof criarRepoPagamentos>;

let repo: RepoPagamentos | null = null;

/** O repositório do navegador, ligado aos gerenciadores de Lançamentos e de itens de Pagamento. */
export function repoPagamentos(): RepoPagamentos {
  repo ??= criarRepoPagamentos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoriaLancamentos: gerenciador("lancamentos"),
    memoriaItens: gerenciador("pagamento_itens"),
  });
  return repo;
}
