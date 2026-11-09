// Repositório de Regras (História 3.1, AD-6). Única porta de gravação de
// `regras`: só `aprender` grava, chamada pelo repositório de Lançamentos
// quando uma classificação (Responsável ou Tipo) muda em qualquer tela.
//
// - `aprender(evento)`: lê a Regra da chave (`chaveDeRegra`), calcula a nova
//   no núcleo (`aprenderRegra`) e grava por upsert (`owner_id, chave`). As
//   chamadas da mesma chave vão em fila (uma de cada vez, na ordem), para
//   duas classificações seguidas não perderem um incremento da contagem.
// - `listar()`: as Regras do dono, para a importação classificar.
//
// Não guarda nada em memória (a tela de Regras chega na 3.4). Falha não
// lança: devolve `{ ok: false }`, e quem chama decide (a gravação do
// Lançamento não é desfeita nem avisada).

import type { SupabaseClient } from "@supabase/supabase-js";
import { aprenderRegra, chaveDeRegra, type EventoAprender, type RegraGravada } from "@/domain/regras";
import type { Database, Json } from "./database.types";
import type { LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaRegra = LinhaDe<"regras">;

export type ResultadoAprender = { ok: true; regra: LinhaRegra } | { ok: false };
export type ResultadoListar = { ok: true; regras: LinhaRegra[] } | { ok: false };

/** Linhas por página na leitura (o PostgREST devolve até 1000). */
const PAGINA = 1000;

export function criarRepoRegras(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  /** O relógio (`ultimo_uso`); nos testes, fixo. */
  agora?: () => Date;
}) {
  const { obterCliente, agora = () => new Date() } = deps;
  /** A última gravação de cada chave: a próxima espera por ela. */
  const filas = new Map<string, Promise<unknown>>();

  async function gravar(evento: EventoAprender): Promise<ResultadoAprender> {
    const cliente = obterCliente();
    if (!cliente) return { ok: false };
    try {
      const chave = chaveDeRegra(evento.nome);
      const lida = await cliente.from("regras").select("*").eq("chave", chave).maybeSingle();
      if (lida.error) return { ok: false };
      const nova = aprenderRegra(lida.data as RegraGravada | null, evento, agora().toISOString());
      const { data, error } = await cliente
        .from("regras")
        .upsert({ ...nova, contagem: nova.contagem as unknown as Json }, { onConflict: "owner_id,chave" })
        .select()
        .single();
      return error || !data ? { ok: false } : { ok: true, regra: data };
    } catch {
      return { ok: false };
    }
  }

  return {
    /** Aprende uma classificação (em fila por chave). */
    aprender(evento: EventoAprender): Promise<ResultadoAprender> {
      const chave = chaveDeRegra(evento.nome);
      const anterior = filas.get(chave) ?? Promise.resolve();
      const esta = anterior.then(() => gravar(evento));
      filas.set(chave, esta);
      void esta.finally(() => {
        if (filas.get(chave) === esta) filas.delete(chave);
      });
      return esta;
    },

    /** Todas as Regras do dono (RLS), em páginas de 1000. */
    async listar(): Promise<ResultadoListar> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const regras: LinhaRegra[] = [];
        for (let de = 0; ; de += PAGINA) {
          const { data, error } = await cliente
            .from("regras")
            .select("*")
            .order("chave")
            .range(de, de + PAGINA - 1);
          if (error || !data) return { ok: false };
          regras.push(...data);
          if (data.length < PAGINA) return { ok: true, regras };
        }
      } catch {
        return { ok: false };
      }
    },
  };
}

export type RepoRegras = ReturnType<typeof criarRepoRegras>;

let repo: RepoRegras | null = null;

/** O repositório do navegador. */
export function repoRegras(): RepoRegras {
  repo ??= criarRepoRegras({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
  });
  return repo;
}
