// Gerenciador único de Realtime (AD-4). Guarda em memória as linhas de cada
// tabela assinada e é a única fonte de estado de dados das telas, que leem
// pelo hook `useLinhas(tabela)`. Telas nunca chamam `supabase.from()`.
//
// - Os ouvintes são registrados antes do `subscribe()`.
// - A cada `SUBSCRIBED` (primeira conexão e toda reconexão), relê a tabela.
// - Evento só aplica se o `updated_at` for mais novo (`realtime-estado.ts`).
// - Repositórios aplicam a resposta das gravações com `aplicarLote` e podem
//   mostrar a mudança antes com `aplicarOtimista`, que devolve o "desfazer".
//
// O canal abre quando a primeira tela assina e fica aberto (um por tabela).
// Quando a conexão volta (detector `conexao.ts`), todos os gerenciadores
// já criados releem (`recarregarTodos`).

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import type { Database } from "./database.types";
import {
  aplicarEvento,
  aplicarLote,
  aplicarOtimista,
  aplicarReleitura,
  desfazerOtimista,
  estadoInicial,
  marcarStatus,
  type EstadoTabela,
  type EventoRealtime,
  type LinhaBase,
  type StatusTabela,
} from "./realtime-estado";
import { aoVoltar } from "./conexao";
import { criarClienteNavegador } from "./supabase/navegador";

export type TabelaRealtime = keyof Database["public"]["Tables"];
export type LinhaDe<T extends TabelaRealtime> = Database["public"]["Tables"][T]["Row"];

/** O que as telas recebem: o status da carga e as linhas (sem ordem definida). */
export type Retrato<L> = { status: StatusTabela; linhas: readonly L[] };

export type Gerenciador<L extends LinhaBase> = {
  retrato(): Retrato<L>;
  /** Assina mudanças; a primeira assinatura abre o canal. Devolve o cancelamento. */
  assinar(ouvinte: () => void): () => void;
  linha(id: string): L | undefined;
  linhas(): readonly L[];
  aplicarLote(linhas: readonly L[]): void;
  /** Mostra a mudança já; a função devolvida desfaz (se o banco recusar). */
  aplicarOtimista(mudancas: readonly (Partial<L> & { id: string })[]): () => void;
  /**
   * Tira da memória linhas que o banco já apagou (ex.: depois da RPC de
   * exclusão), sem esperar o DELETE do Realtime.
   */
  remover(ids: readonly string[]): void;
  /** Relê a tabela inteira; reabre o canal se ele caiu. Usado em "Tentar de novo". */
  recarregar(): Promise<void>;
};

const RETRATO_SERVIDOR: Retrato<never> = { status: "carregando", linhas: [] };

export function criarGerenciador<L extends LinhaBase>(opcoes: {
  tabela: string;
  obterCliente: () => SupabaseClient | null;
}): Gerenciador<L> {
  const { tabela, obterCliente } = opcoes;
  let estado: EstadoTabela<L> = estadoInicial<L>();
  let retrato: Retrato<L> = { status: estado.status, linhas: [] };
  const ouvintes = new Set<() => void>();
  let canal: RealtimeChannel | null = null;
  let conectado = false;
  // Só a releitura mais recente vale (duas reconexões seguidas).
  let leitura = 0;
  // Ids aplicados (gravação ou evento) desde que a releitura atual começou.
  const aplicadasDurante = new Set<string>();

  function mudar(novo: EstadoTabela<L>) {
    if (novo === estado) return;
    const linhasMudaram = novo.porId !== estado.porId;
    estado = novo;
    retrato = {
      status: novo.status,
      linhas: linhasMudaram ? [...novo.porId.values()] : retrato.linhas,
    };
    for (const ouvinte of ouvintes) ouvinte();
  }

  async function reler(): Promise<void> {
    const cliente = obterCliente();
    if (!cliente) {
      mudar(marcarStatus(estado, "erro"));
      return;
    }
    const minha = ++leitura;
    aplicadasDurante.clear();
    // Falha depois de já ter carregado mantém a lista (pronto); só sem nada
    // carregado vira a tela de erro.
    const falhou = () => {
      if (estado.status !== "pronto") mudar(marcarStatus(estado, "erro"));
    };
    try {
      const { data, error } = await cliente.from(tabela).select("*");
      if (minha !== leitura) return;
      if (error || !data) {
        falhou();
        return;
      }
      mudar(aplicarReleitura(estado, data as L[], aplicadasDurante));
      aplicadasDurante.clear();
    } catch {
      if (minha === leitura) falhou();
    }
  }

  function abrirCanal() {
    const cliente = obterCliente();
    if (!cliente) {
      mudar(marcarStatus(estado, "erro"));
      return;
    }
    conectado = false;
    const novo = cliente.channel(`tabela:${tabela}`);
    canal = novo;
    // Ouvintes antes do subscribe(): nenhum evento se perde entre os dois.
    novo.on(
      "postgres_changes",
      { event: "*", schema: "public", table: tabela },
      (payload) => {
        const evento: EventoRealtime<L> | null =
          payload.eventType === "DELETE"
            ? { tipo: "DELETE", antiga: payload.old as Partial<L> & { id: string } }
            : payload.eventType === "INSERT" || payload.eventType === "UPDATE"
              ? { tipo: payload.eventType, nova: payload.new as L }
              : null;
        if (!evento) return;
        if (evento.tipo !== "DELETE") aplicadasDurante.add(evento.nova.id);
        mudar(aplicarEvento(estado, evento));
      },
    );
    novo.subscribe((status) => {
      if (canal !== novo) return;
      if (status === "SUBSCRIBED") {
        conectado = true;
        void reler();
      } else {
        conectado = false;
        // Sem nada carregado, mostra o erro em vez de esqueleto para sempre.
        // O cliente do Realtime tenta reconectar sozinho.
        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") &&
          estado.status === "carregando"
        ) {
          mudar(marcarStatus(estado, "erro"));
        }
      }
    });
  }

  return {
    retrato: () => retrato,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      if (!canal) abrirCanal();
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    linha: (id) => estado.porId.get(id),
    linhas: () => retrato.linhas,
    aplicarLote(linhas) {
      for (const l of linhas) aplicadasDurante.add(l.id);
      mudar(aplicarLote(estado, linhas));
    },
    aplicarOtimista(mudancas) {
      const r = aplicarOtimista(estado, mudancas);
      mudar(r.estado);
      return () => mudar(desfazerOtimista(estado, r.anteriores));
    },
    remover(ids) {
      let novo = estado;
      for (const id of ids) {
        aplicadasDurante.delete(id);
        novo = aplicarEvento(novo, { tipo: "DELETE", antiga: { id } as Partial<L> & { id: string } });
      }
      mudar(novo);
    },
    async recarregar() {
      if (estado.status === "erro") mudar(marcarStatus(estado, "carregando"));
      if (canal && !conectado) {
        const cliente = obterCliente();
        const antigo = canal;
        canal = null;
        try {
          if (cliente) await cliente.removeChannel(antigo);
        } catch {
          // Canal antigo já morto: segue e abre outro.
        } finally {
          abrirCanal(); // o SUBSCRIBED relê
        }
        return;
      }
      if (!canal) {
        abrirCanal();
        return;
      }
      await reler();
    },
  };
}

const gerenciadores = new Map<string, Gerenciador<LinhaBase>>();
let ligadoAoDetector = false;

/** Relê todos os gerenciadores já criados (a conexão voltou). */
export async function recarregarTodos(): Promise<void> {
  await Promise.all([...gerenciadores.values()].map((g) => g.recarregar()));
}

/** O gerenciador único da tabela (criado na primeira chamada). */
export function gerenciador<T extends TabelaRealtime>(tabela: T): Gerenciador<LinhaDe<T>> {
  let g = gerenciadores.get(tabela);
  if (!g) {
    if (!ligadoAoDetector) {
      ligadoAoDetector = true;
      aoVoltar(() => void recarregarTodos());
    }
    g = criarGerenciador<LinhaBase>({ tabela, obterCliente: criarClienteNavegador });
    gerenciadores.set(tabela, g);
  }
  return g as unknown as Gerenciador<LinhaDe<T>>;
}

/** Linhas da tabela em memória, atualizadas em tempo real. */
export function useLinhas<T extends TabelaRealtime>(tabela: T): Retrato<LinhaDe<T>> {
  const g = gerenciador(tabela);
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}
