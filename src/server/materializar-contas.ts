import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/data/database.types";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { planoDoCron } from "@/domain/materializacao-diaria";
import { mesAtual } from "@/domain/painel";

// Materialização diária das Contas manuais (História 5.3, AD-13, AD-15).
//
// 1. Lê `contas_manuais` com a chave secreta (todas as linhas, de 1000 em 1000: o PostgREST corta
//    a resposta em 1000, e sem a paginação as Contas além da milésima nunca seriam materializadas; é também
//    a leitura simples que mantém o projeto Supabase Free ativo).
// 2. O núcleo (`planoDoCron`) decide o pedido de cada Conta, até o Mês atual
//    + 12 (America/Sao_Paulo). Nada de regra de negócio aqui.
// 3. Chama `materializar_contas_manuais_do_dono` uma vez por Conta (cada chamada
//    é uma transação; uma Conta com defeito não desfaz as outras). A RPC é
//    idempotente: `on conflict (serie_id, parcela_n) ... do nothing`.
//
// Nunca devolve nem registra Nome, Valor ou id: só contagens e códigos.

export type ClienteDoCron = Pick<SupabaseClient<Database>, "from" | "rpc">;

export type ResultadoDoCron =
  | {
      ok: true;
      /** Linhas novas criadas hoje (mães e filhas); 0 quando nada faltava. */
      quantidade: number;
      contas: number;
      ilegiveis: number;
    }
  | {
      ok: false;
      codigo: "cron.leitura_falhou" | "cron.materializacao_falhou";
      /** Linhas criadas antes da falha (as Contas que deram certo ficam gravadas). */
      quantidade: number;
      contas: number;
      ilegiveis: number;
      /** Quantas Contas a RPC recusou. */
      falhas: number;
    };

// `excluido_em` e `updated_at` (História 5.4): a leitura já tira as Contas excluídas
// e o núcleo as confere de novo; `updated_at` é a versão da Conta de que as
// parcelas saem (o banco ignora o pedido de uma Conta que mudou no meio).
const COLUNAS = "id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes, excluido_em, updated_at";

/** O PostgREST corta uma resposta em 1000 linhas: a leitura segue de 1000 em 1000 até vir uma página incompleta. */
export const POR_PAGINA = 1000;

/** Todas as Contas vivas, por páginas (`order("id")` para a paginação ser estável). `null` se alguma página falhou. */
async function lerContas(admin: ClienteDoCron): Promise<unknown[] | null> {
  const todas: unknown[] = [];
  for (let de = 0; ; de += POR_PAGINA) {
    const { data, error } = await admin
      .from("contas_manuais")
      .select(COLUNAS)
      .is("excluido_em", null)
      .order("id")
      .range(de, de + POR_PAGINA - 1);
    if (error || !Array.isArray(data)) return null;
    todas.push(...data);
    if (data.length < POR_PAGINA) return todas;
  }
}

/** Quantas linhas novas a RPC devolveu (`jsonb` array); qualquer outra forma conta 0. */
function contarLinhas(resposta: unknown): number {
  return Array.isArray(resposta) ? resposta.length : 0;
}

export async function materializarContasDoDia(admin: ClienteDoCron, agora: Date): Promise<ResultadoDoCron> {
  const lidas = await lerContas(admin);
  if (lidas === null) {
    return { ok: false, codigo: "cron.leitura_falhou", quantidade: 0, contas: 0, ilegiveis: 0, falhas: 0 };
  }

  const plano = planoDoCron(lidas, mesAtual(hojeEmSaoPaulo(agora)));

  let quantidade = 0;
  let falhas = 0;
  for (const { pedido } of plano.pedidos) {
    try {
      const { data, error } = await admin.rpc("materializar_contas_manuais_do_dono", {
        p_owner_id: pedido.p_owner_id,
        p_ate_mes: pedido.p_ate_mes,
        p_parcelas: pedido.p_parcelas as unknown as Json,
      });
      if (error) falhas++;
      else quantidade += contarLinhas(data);
    } catch {
      falhas++;
    }
  }

  const base = { quantidade, contas: plano.contas, ilegiveis: plano.ilegiveis };
  return falhas === 0
    ? { ok: true, ...base }
    : { ok: false, codigo: "cron.materializacao_falhou", ...base, falhas };
}
