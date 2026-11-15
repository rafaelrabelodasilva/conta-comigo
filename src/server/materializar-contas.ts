import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/data/database.types";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { planoDoCron } from "@/domain/materializacao-diaria";
import { mesAtual } from "@/domain/painel";

// Materialização diária das Contas manuais (História 5.3, AD-13, AD-15).
//
// 1. Lê `contas_manuais` com a chave secreta (todas as linhas; é também a
//    leitura simples que mantém o projeto Supabase Free ativo).
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

const COLUNAS = "id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes";

/** Quantas linhas novas a RPC devolveu (`jsonb` array); qualquer outra forma conta 0. */
function contarLinhas(resposta: unknown): number {
  return Array.isArray(resposta) ? resposta.length : 0;
}

export async function materializarContasDoDia(admin: ClienteDoCron, agora: Date): Promise<ResultadoDoCron> {
  const lidas = await admin.from("contas_manuais").select(COLUNAS).order("id");
  if (lidas.error || !Array.isArray(lidas.data)) {
    return { ok: false, codigo: "cron.leitura_falhou", quantidade: 0, contas: 0, ilegiveis: 0, falhas: 0 };
  }

  const plano = planoDoCron(lidas.data, mesAtual(hojeEmSaoPaulo(agora)));

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
