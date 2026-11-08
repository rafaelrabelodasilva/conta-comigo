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
//
// Escopo por Mês (`porMes`, só `lancamentos`, História 2.4): a memória
// guarda só o Mês aberto (`abrirMes`). A releitura filtra `.eq("mes", …)`
// (nunca a tabela inteira, que passaria do limite de 1000 linhas do
// PostgREST); evento de outro Mês é ignorado, e linha que sai do Mês aberto
// num UPDATE sai da memória. Sem Mês aberto, nada é lido.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import type { Database } from "./database.types";
import {
  aplicarEvento,
  aplicarLote,
  aplicarOtimista,
  aplicarReleitura,
  desfazerOtimista,
  ehMaisNovo,
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

/**
 * O que as telas recebem: o status da carga e as linhas (sem ordem
 * definida). Num gerenciador por Mês, `mes` é o Mês aberto das linhas.
 */
export type Retrato<L> = { status: StatusTabela; linhas: readonly L[]; mes?: string | null };

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
  /** Relê a tabela (ou o Mês aberto); reabre o canal se ele caiu. Usado em "Tentar de novo". */
  recarregar(): Promise<void>;
  /**
   * Gerenciador por Mês: troca o Mês aberto. A memória esvazia (as telas
   * mostram o esqueleto) e o Mês novo é relido. Mesmo Mês: nada muda.
   * Nos outros gerenciadores, não faz nada.
   */
  abrirMes(mes: string): void;
  /** O Mês aberto (null sem Mês aberto ou fora do escopo por Mês). */
  mesAberto(): string | null;
};

const RETRATO_SERVIDOR: Retrato<never> = { status: "carregando", linhas: [] };

/** O `mes` de uma linha de tabela com escopo por Mês. */
function mesDaLinha(linha: unknown): string | undefined {
  return (linha as { mes?: string } | null)?.mes;
}

export function criarGerenciador<L extends LinhaBase>(opcoes: {
  tabela: string;
  obterCliente: () => SupabaseClient | null;
  /** Guarda e relê só o Mês aberto (coluna `mes`). */
  porMes?: boolean;
}): Gerenciador<L> {
  const { tabela, obterCliente, porMes = false } = opcoes;
  let estado: EstadoTabela<L> = estadoInicial<L>();
  let mes: string | null = null;
  const comMes = (r: Omit<Retrato<L>, "mes">): Retrato<L> => (porMes ? { ...r, mes } : r);
  let retrato: Retrato<L> = comMes({ status: estado.status, linhas: [] });
  const ouvintes = new Set<() => void>();
  let canal: RealtimeChannel | null = null;
  let conectado = false;
  // O canal avisou falha (CHANNEL_ERROR/TIMED_OUT/CLOSED) depois de aberto.
  let caiu = false;
  // Só a releitura mais recente vale (duas reconexões seguidas).
  let leitura = 0;
  // Ids aplicados (gravação ou evento) desde que a releitura atual começou.
  const aplicadasDurante = new Set<string>();

  function mudar(novo: EstadoTabela<L>) {
    if (novo === estado) return;
    const linhasMudaram = novo.porId !== estado.porId;
    estado = novo;
    retrato = comMes({
      status: novo.status,
      linhas: linhasMudaram ? [...novo.porId.values()] : retrato.linhas,
    });
    for (const ouvinte of ouvintes) ouvinte();
  }

  /** A linha é do escopo da memória (sempre, fora do escopo por Mês). */
  const doEscopo = (linha: L) => !porMes || (mes !== null && mesDaLinha(linha) === mes);

  async function reler(): Promise<void> {
    const cliente = obterCliente();
    if (!cliente) {
      mudar(marcarStatus(estado, "erro"));
      return;
    }
    const minha = ++leitura;
    aplicadasDurante.clear();
    // Sem Mês aberto, não há o que ler: espera o `abrirMes`.
    if (porMes && mes === null) return;
    const lido = mes;
    // Falha depois de já ter carregado mantém a lista (pronto); só sem nada
    // carregado vira a tela de erro.
    const falhou = () => {
      if (estado.status !== "pronto") mudar(marcarStatus(estado, "erro"));
    };
    try {
      const consulta = cliente.from(tabela).select("*");
      const { data, error } = await (porMes && lido !== null ? consulta.eq("mes", lido) : consulta);
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
    caiu = false;
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
        if (evento.tipo !== "DELETE" && !doEscopo(evento.nova)) {
          // Outro Mês: ignorado. Linha do Mês aberto que mudou de Mês sai.
          // Só se o UPDATE for mais novo que a versão em memória (fora de ordem não tira).
          const atual = estado.porId.get(evento.nova.id);
          if (evento.tipo === "UPDATE" && atual && ehMaisNovo(evento.nova.updated_at, atual.updated_at)) {
            aplicadasDurante.delete(evento.nova.id);
            mudar(aplicarEvento(estado, { tipo: "DELETE", antiga: { id: evento.nova.id } as Partial<L> & { id: string } }));
          }
          return;
        }
        if (evento.tipo !== "DELETE") aplicadasDurante.add(evento.nova.id);
        mudar(aplicarEvento(estado, evento));
      },
    );
    novo.subscribe((status) => {
      if (canal !== novo) return;
      if (status === "SUBSCRIBED") {
        conectado = true;
        caiu = false;
        void reler();
      } else {
        conectado = false;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") caiu = true;
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

  /** Troca o canal que não está conectado por um novo (o SUBSCRIBED relê). */
  async function reabrirCanal(): Promise<void> {
    const cliente = obterCliente();
    const antigo = canal;
    canal = null;
    try {
      if (cliente && antigo) await cliente.removeChannel(antigo);
    } catch {
      // Canal antigo já morto: segue e abre outro.
    } finally {
      abrirCanal();
    }
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
      // Linhas de outro Mês (ex.: importação de outro Mês) não entram.
      const doMes = linhas.filter(doEscopo);
      for (const l of doMes) aplicadasDurante.add(l.id);
      mudar(aplicarLote(estado, doMes));
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
        await reabrirCanal();
        return;
      }
      if (!canal) {
        abrirCanal();
        return;
      }
      await reler();
    },
    abrirMes(novo) {
      if (!porMes || novo === mes) return;
      mes = novo;
      // A leitura em curso (do Mês anterior) deixa de valer.
      leitura++;
      aplicadasDurante.clear();
      estado = estadoInicial<L>();
      retrato = comMes({ status: estado.status, linhas: [] });
      for (const ouvinte of ouvintes) ouvinte();
      if (canal && conectado) void reler();
      // Canal caído: reabre, como "Tentar de novo"; o SUBSCRIBED relê o Mês
      // novo. Ainda sem o primeiro SUBSCRIBED, ele mesmo lê o Mês novo.
      else if (canal && caiu) void reabrirCanal();
    },
    mesAberto: () => (porMes ? mes : null),
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
    // Só `lancamentos` tem escopo por Mês; as outras tabelas são lidas inteiras.
    g = criarGerenciador<LinhaBase>({
      tabela,
      obterCliente: criarClienteNavegador,
      porMes: tabela === "lancamentos",
    });
    gerenciadores.set(tabela, g);
  }
  return g as unknown as Gerenciador<LinhaDe<T>>;
}

/** Linhas da tabela em memória, atualizadas em tempo real. */
export function useLinhas<T extends TabelaRealtime>(tabela: T): Retrato<LinhaDe<T>> {
  const g = gerenciador(tabela);
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}
