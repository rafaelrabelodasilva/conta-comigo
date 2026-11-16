// Repositório de Pagamentos (Histórias 6.1 e 6.2, FR-25, AD-3, AD-4, AD-10, AD-16). Única
// porta de gravação de `pagamentos` e `pagamento_itens`: as RPCs gravam numa
// transação só o que o núcleo calculou (`src/domain/pagamento.ts`).
//
// - `aplicar`: manda o pedido que `planejarPagamento` montou a `aplicar_pagamento`. O modo
//   (`total`, `parcial`, `minha_parte`) e os itens (com `quita`) vêm prontos do núcleo (6.2).
//   Sem otimismo (a RPC grava três tabelas e o Status das linhas): as linhas e os
//   itens devolvidos vão para os gerenciadores (AD-4); o Realtime que chega depois
//   não duplica nada (mesmo `id`, `updated_at` não mais novo). Repetir o pedido
//   (mesmo `id`) devolve o mesmo Pagamento, sem gravar de novo.
// - `desfazer`: lê do banco o que o núcleo precisa (os itens vivos do Pagamento, as
//   linhas como estão agora e os itens de outros Pagamentos que as tocam), pede o
//   plano a `planejarDesfazerPagamento` (AD-10: o Status anterior volta só onde o
//   atual ainda é o aplicado e nenhum Pagamento posterior tocou; o item parcial não mudou
//   o Status e não tem o que devolver) e grava por
//   `desfazer_pagamento`. Se uma linha mudou entre a leitura e a gravação, a RPC
//   recusa (`pagamento.mudou`) e nada muda.
// - `previaDoDesfazer` (6.3): a mesma leitura e a mesma classificação do `desfazer`, sem gravar: a janela
//   de confirmação mostra quantas linhas voltam e quantas ficam. `desfazer` aceita o que a janela viu
//   (`esperado`): se o plano de agora é outro, devolve `pagamento.mudou` sem gravar (a janela se refaz).
//   Um Pagamento sem item vivo já foi desfeito: `pagamento.ja_desfeito` (o estado vai para a memória).
// - `responsaveisDasLinhas` e `linhasDoPagamento` (6.3): as leituras do Histórico, em blocos de 100 ids.
// - Sem conexão, nada começa (AD-3): `conexao.gravar_sem_conexao`.
// - As leituras por `in (…)` vão em blocos (o endereço da requisição tem limite) e
//   nenhuma passa de 1000 linhas (o corte do PostgREST).

import type { SupabaseClient } from "@supabase/supabase-js";
import { mesmoPlanoDeDesfazer } from "@/domain/historico-pagamentos";
import {
  classificarDesfazerPagamento,
  type ItemAoDesfazer,
  type ItemParaDesfazer,
  type OutroItemDoLancamento,
  type PedidoDePagamento,
} from "@/domain/pagamento";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, gerenciadorItensDoHistorico, gerenciadorTodosOsLancamentos, type Gerenciador, type LinhaDe } from "./realtime";
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
  /** Os Pagamentos vivos de todos os Meses (o Histórico, 6.3): o desfeito sai da memória. */
  memoriaPagamentos?: Gerenciador<LinhaPagamento>;
  /** Os itens vivos de todos os Meses (o Histórico, 6.3). */
  memoriaItensDoHistorico?: Gerenciador<LinhaItemDePagamento>;
  /** Os Lançamentos de todos os Meses (Recebimentos, 6.5): a linha paga ou desfeita aparece lá sem esperar o Realtime. */
  memoriaTodosOsLancamentos?: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const {
    obterCliente,
    memoriaLancamentos,
    memoriaItens,
    memoriaPagamentos,
    memoriaItensDoHistorico,
    memoriaTodosOsLancamentos,
    online = estaOnline,
  } = deps;

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
    memoriaPagamentos?.aplicarLote([r.pagamento]);
    memoriaItensDoHistorico?.aplicarLote(r.itens);
    memoriaTodosOsLancamentos?.aplicarLote(r.lancamentos);
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

  /** O que o desfazer e a prévia leem: os itens vivos, as linhas como estão e os itens de outros Pagamentos. */
  async function lerParaDesfazer(
    cliente: SupabaseClient<Database>,
    pagamentoId: string,
  ): Promise<{ itens: ItemParaDesfazer[]; classificados: ItemAoDesfazer[] } | null> {
    const itens = await lerItensDoPagamento(cliente, pagamentoId);
    if (!itens) return null;
    const ids = itens.map((i) => i.lancamento_id);
    const [linhas, outros] = await Promise.all([lerLinhas(cliente, ids), lerOutrosItens(cliente, ids, pagamentoId)]);
    if (!linhas || !outros) return null;
    return { itens, classificados: classificarDesfazerPagamento(itens, linhas, outros) };
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
    async desfazer(pagamentoId: string, esperado?: readonly ItemAoDesfazer[]): Promise<ResultadoPagamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const lido = await lerParaDesfazer(cliente, pagamentoId);
        if (!lido) return FALHOU;
        // O que a janela mostrou já não vale (outro aparelho mexeu): nada é gravado.
        if (esperado && lido.itens.length > 0 && !mesmoPlanoDeDesfazer(esperado, lido.classificados)) {
          return { ok: false, codigo: "pagamento.mudou" };
        }
        const resposta = await chamar(cliente, "desfazer_pagamento", {
          pagamento_id: pagamentoId,
          devolver: lido.classificados.flatMap((c) => (c.devolver ? [c.devolver] : [])),
        });
        // Sem item vivo não havia o que desfazer: já tinha sido desfeito (a memória recebeu o estado).
        if (resposta.ok && lido.itens.length === 0) return { ok: false, codigo: "pagamento.ja_desfeito" };
        return resposta;
      } catch {
        return FALHOU;
      }
    },

    /**
     * O que desfazer o Pagamento faria agora, sem gravar: o destino de cada item (volta ao Status
     * anterior, o Status mudou, outro Pagamento tocou depois ou é item parcial). `pagamento.ja_desfeito`
     * se não há item vivo.
     */
    async previaDoDesfazer(
      pagamentoId: string,
    ): Promise<{ ok: true; itens: ItemAoDesfazer[] } | { ok: false; codigo: CodigoFalhaPagamento }> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const lido = await lerParaDesfazer(cliente, pagamentoId);
        if (!lido) return FALHOU;
        if (lido.itens.length === 0) return { ok: false, codigo: "pagamento.ja_desfeito" };
        return { ok: true, itens: lido.classificados };
      } catch {
        return FALHOU;
      }
    },

    /**
     * De quem são as linhas e se são Ajuste de centavos (a lista do Histórico). Em blocos de 100 ids;
     * `null` se alguma leitura falhou.
     */
    async responsaveisDasLinhas(
      ids: readonly string[],
    ): Promise<{ id: string; responsavel_id: string | null; ajuste_de_id: string | null }[] | null> {
      const cliente = obterCliente();
      if (!cliente) return null;
      try {
        const saida: { id: string; responsavel_id: string | null; ajuste_de_id: string | null }[] = [];
        for (const bloco of blocos(ids)) {
          const { data, error } = await cliente.from("lancamentos").select("id, responsavel_id, ajuste_de_id").in("id", bloco);
          if (error || !data) return null;
          saida.push(...data);
        }
        return saida;
      } catch {
        return null;
      }
    },

    /** As linhas inteiras de um Pagamento (o detalhe), vivas ou excluídas depois. `null` se a leitura falhou. */
    async linhasDoPagamento(ids: readonly string[]): Promise<LinhaLancamento[] | null> {
      const cliente = obterCliente();
      if (!cliente) return null;
      try {
        const saida: LinhaLancamento[] = [];
        for (const bloco of blocos(ids)) {
          const { data, error } = await cliente.from("lancamentos").select("*").in("id", bloco);
          if (error || !data) return null;
          saida.push(...data);
        }
        return saida;
      } catch {
        return null;
      }
    },
  };
}

export type RepoPagamentos = ReturnType<typeof criarRepoPagamentos>;

let repo: RepoPagamentos | null = null;

/** O repositório do navegador, ligado aos gerenciadores de Lançamentos (do Mês e de todos os Meses) e de itens de Pagamento. */
export function repoPagamentos(): RepoPagamentos {
  repo ??= criarRepoPagamentos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoriaLancamentos: gerenciador("lancamentos"),
    memoriaItens: gerenciador("pagamento_itens"),
    memoriaPagamentos: gerenciador("pagamentos"),
    memoriaItensDoHistorico: gerenciadorItensDoHistorico(),
    memoriaTodosOsLancamentos: gerenciadorTodosOsLancamentos(),
  });
  return repo;
}
