// Repositório de Regras (História 3.1, AD-6). Única porta de gravação de
// `regras`: só `aprender` grava, chamada pelo repositório de Lançamentos
// quando uma classificação (Responsável ou Tipo) muda em qualquer tela.
//
// - `aprender(evento)`: lê a Regra da chave (`chaveDeRegra`), calcula a nova
//   no núcleo (`aprenderRegra`) e grava por upsert (`owner_id, chave`). As
//   chamadas da mesma chave vão em fila (uma de cada vez, na ordem), para
//   duas classificações seguidas não perderem um incremento da contagem.
// - `aprender(eventos)` (lote, História 3.3): agrupa por chave
//   (`agruparEventosPorChave`), dobra os eventos de cada chave no núcleo
//   (`aprenderEmLote`, a mesma `aprenderRegra` evento a evento) e faz uma
//   leitura e um upsert por chave, cada chave na sua fila.
// - `listar()`: as Regras do dono, para a importação classificar.
//
// Tela Regras aprendidas (História 3.4): `editar` (Responsável e/ou Tipo, a
// contagem sai do núcleo `editarRegra`) e `excluir` entram na mesma fila por
// chave do `aprender`; `marcarUso` só muda `ultimo_uso` (a importação usou a
// Regra). A tela lê o gerenciador de Realtime de `regras` (`memoria`).
//
// `aprender` e `listar` não guardam nada em memória. Falha não lança:
// devolve `{ ok: false }`, e quem chama decide (a gravação do Lançamento não
// é desfeita nem avisada).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agruparEventosPorChave,
  aprenderEmLote,
  chaveDeRegra,
  editarRegra,
  type EdicaoRegra,
  type EventoAprender,
  type RegraGravada,
  type RegraParaGravar,
} from "@/domain/regras";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, gravarComOtimismo, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaRegra = LinhaDe<"regras">;

export type ResultadoAprender = { ok: true; regra: LinhaRegra } | { ok: false };
/** O lote: `ok` só se todas as chaves gravaram (as que gravaram valem mesmo assim). */
export type ResultadoAprenderLote = { ok: true; regras: LinhaRegra[] } | { ok: false };
export type ResultadoListar = { ok: true; regras: LinhaRegra[] } | { ok: false };
/** `regra: null` = a edição não mudava nada (nada foi gravado). */
export type ResultadoEditar =
  | { ok: true; regra: LinhaRegra | null }
  | { ok: false; codigo: CodigoFalhaGravacao | "regra.vazia" };
export type ResultadoExcluir = { ok: true } | { ok: false; codigo: CodigoFalhaGravacao };
export type ResultadoMarcarUso = { ok: true } | { ok: false };
/** `criadas`: as Regras que não existiam (a chave que já tinha Regra é ignorada). */
export type ResultadoCriarIniciais = { ok: true; criadas: LinhaRegra[] } | { ok: false };

/** Linhas por página na leitura (o PostgREST devolve até 1000). */
const PAGINA = 1000;

export function criarRepoRegras(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  /** O relógio (`ultimo_uso`); nos testes, fixo. */
  agora?: () => Date;
  /** O gerenciador de Realtime de `regras` (a tela de Regras); sem ele, `editar` e `excluir` recusam. */
  memoria?: Gerenciador<LinhaRegra>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, agora = () => new Date(), memoria, online = estaOnline } = deps;
  /** A última gravação de cada chave: a próxima espera por ela. */
  const filas = new Map<string, Promise<unknown>>();

  /** Lê a Regra da chave, dobra os eventos dela no núcleo e grava (um upsert). */
  async function gravar(chave: string, eventos: readonly EventoAprender[]): Promise<ResultadoAprender> {
    const cliente = obterCliente();
    if (!cliente) return { ok: false };
    try {
      const lida = await cliente.from("regras").select("*").eq("chave", chave).maybeSingle();
      if (lida.error) return { ok: false };
      // Só limpar a Divisão de um Nome sem Regra não cria Regra.
      const soLimpa = eventos.every((e) => e.divisao === null && e.responsavelDepois === null && e.tipoDepois === null);
      if (lida.data === null && soLimpa) return { ok: false };
      const nova = aprenderEmLote(lida.data as RegraGravada | null, eventos, agora().toISOString());
      if (!nova) return { ok: false };
      const { data, error } = await cliente
        .from("regras")
        .upsert(
          {
            ...nova,
            contagem: nova.contagem as unknown as NonNullable<Json>,
            divisao: nova.divisao as unknown as Json,
          },
          { onConflict: "owner_id,chave" },
        )
        .select()
        .single();
      return error || !data ? { ok: false } : { ok: true, regra: data };
    } catch {
      return { ok: false };
    }
  }

  /** Põe a tarefa da chave na fila dela (uma de cada vez, na ordem). */
  function naFilaDe<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
    const anterior = filas.get(chave) ?? Promise.resolve();
    const esta = anterior.then(tarefa);
    filas.set(chave, esta);
    void esta.finally(() => {
      if (filas.get(chave) === esta) filas.delete(chave);
    });
    return esta;
  }

  /** Põe a gravação da chave na fila dela. */
  function naFila(chave: string, eventos: readonly EventoAprender[]): Promise<ResultadoAprender> {
    return naFilaDe(chave, () => gravar(chave, eventos));
  }

  /** Lê a Regra pelo id, calcula a edição no núcleo e grava (dentro da fila da chave). */
  async function gravarEdicao(id: string, edicao: EdicaoRegra): Promise<ResultadoEditar> {
    const cliente = obterCliente();
    if (!cliente || !memoria) return FALHOU;
    try {
      const lida = await cliente.from("regras").select("*").eq("id", id).maybeSingle();
      if (lida.error || !lida.data) return FALHOU;
      const plano = editarRegra(lida.data as RegraGravada, edicao);
      if (!plano.ok) return { ok: false, codigo: "regra.vazia" };
      if (plano.valor === null) return { ok: true, regra: null };
      const corpo = { ...plano.valor, contagem: plano.valor.contagem as unknown as NonNullable<Json> };
      const gravada: { linha: LinhaRegra | null } = { linha: null };
      const r = await gravarComOtimismo(
        obterCliente,
        memoria,
        [{ id, ...corpo }],
        async (c) => {
          const { data, error } = await c.from("regras").update(corpo).eq("id", id).select().single();
          if (error || !data) return null;
          gravada.linha = data;
          return [data];
        },
        online,
      );
      return r.ok ? { ok: true, regra: gravada.linha } : r;
    } catch {
      return FALHOU;
    }
  }

  /** Apaga a Regra pelo id (dentro da fila da chave) e a tira da memória. */
  async function gravarExclusao(id: string): Promise<ResultadoExcluir> {
    const cliente = obterCliente();
    if (!cliente || !memoria) return FALHOU;
    try {
      const { error } = await cliente.from("regras").delete().eq("id", id);
      if (error) return FALHOU;
      memoria.remover([id]);
      return { ok: true };
    } catch {
      return FALHOU;
    }
  }

  function aprender(evento: EventoAprender): Promise<ResultadoAprender>;
  function aprender(eventos: readonly EventoAprender[]): Promise<ResultadoAprenderLote>;
  function aprender(entrada: EventoAprender | readonly EventoAprender[]): Promise<ResultadoAprender | ResultadoAprenderLote>;
  function aprender(
    entrada: EventoAprender | readonly EventoAprender[],
  ): Promise<ResultadoAprender | ResultadoAprenderLote> {
    if (!Array.isArray(entrada)) {
      const evento = entrada as EventoAprender;
      return naFila(chaveDeRegra(evento.nome), [evento]);
    }
    const grupos = agruparEventosPorChave(entrada as readonly EventoAprender[]);
    return Promise.all([...grupos].map(([chave, eventos]) => naFila(chave, eventos))).then((resultados) => {
      const regras: LinhaRegra[] = [];
      for (const r of resultados) {
        if (!r.ok) return { ok: false } as const;
        regras.push(r.regra);
      }
      return { ok: true, regras } as const;
    });
  }

  return {
    /** Aprende uma classificação ou uma lista delas (em fila por chave). */
    aprender,

    /**
     * Edita o Responsável e/ou o Tipo da Regra (História 3.4). A contagem e o
     * resto saem do núcleo (`editarRegra`); `ultimo_uso` não muda. Com
     * otimismo; sem mudança, não grava. Ao menos um dos dois fica preenchido.
     */
    editar(id: string, edicao: EdicaoRegra): Promise<ResultadoEditar> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      const atual = memoria?.linha(id);
      if (!atual) return Promise.resolve(FALHOU);
      return naFilaDe(atual.chave, () => gravarEdicao(id, edicao));
    },

    /** Exclui a Regra (a tela já pediu confirmação). Os lançamentos não mudam. */
    excluir(id: string): Promise<ResultadoExcluir> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      const atual = memoria?.linha(id);
      if (!atual) return Promise.resolve(FALHOU);
      return naFilaDe(atual.chave, () => gravarExclusao(id));
    },

    /**
     * A importação usou estas Regras (chaves): muda só o `ultimo_uso`, sem
     * contagem. Em páginas de 50 chaves; falha devolve `{ ok: false }`.
     */
    async marcarUso(chaves: readonly string[]): Promise<ResultadoMarcarUso> {
      if (chaves.length === 0) return { ok: true };
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const quando = agora().toISOString();
        for (let i = 0; i < chaves.length; i += 50) {
          const { error } = await cliente
            .from("regras")
            .update({ ultimo_uso: quando })
            .in("chave", chaves.slice(i, i + 50));
          if (error) return { ok: false };
        }
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },

    /**
     * As Regras iniciais da planilha (História 3.10, calculadas pelo núcleo):
     * grava só as chaves que ainda não têm Regra (nunca sobrescreve o que
     * Rafael ensinou) e devolve as criadas, em páginas de 100.
     */
    async criarIniciais(regras: readonly RegraParaGravar[]): Promise<ResultadoCriarIniciais> {
      if (regras.length === 0) return { ok: true, criadas: [] };
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const criadas: LinhaRegra[] = [];
        for (let i = 0; i < regras.length; i += 100) {
          const pagina = regras.slice(i, i + 100).map((r) => ({
            ...r,
            contagem: r.contagem as unknown as NonNullable<Json>,
            divisao: r.divisao as unknown as Json,
          }));
          const { data, error } = await cliente
            .from("regras")
            .upsert(pagina, { onConflict: "owner_id,chave", ignoreDuplicates: true })
            .select();
          if (error || !data) return { ok: false };
          criadas.push(...data);
        }
        memoria?.aplicarLote(criadas);
        return { ok: true, criadas };
      } catch {
        return { ok: false };
      }
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
    memoria: gerenciador("regras"),
  });
  return repo;
}
