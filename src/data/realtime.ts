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
// Escopo por Mês (`porMes`, `lancamentos` e, desde a 6.1, `pagamento_itens`, que
// guarda o `mes` do Lançamento, História 2.4): a memória
// guarda só o Mês aberto (`abrirMes`). A releitura filtra `.eq("mes", …)`
// (nunca a tabela inteira, que passaria do limite de 1000 linhas do
// PostgREST); evento de outro Mês é ignorado, e linha que sai do Mês aberto
// num UPDATE sai da memória. Sem Mês aberto, nada é lido.
//
// Escopo por predicado (`pertence`, História 3.2): a memória guarda só as
// linhas que o predicado aceita (a fila do Revisar, `lancamentos` inteiro,
// de todos os Meses). `filtrarLeitura` aplica o mesmo critério na consulta
// SQL e `canal` dá um nome próprio ao canal (a mesma tabela, outro
// gerenciador). Evento ou gravação que tira uma linha do predicado a remove
// da memória (se for mais novo que a versão guardada); linha de fora nunca
// entra.
//
// Lançamentos de todos os Meses (`gerenciadorTodosOsLancamentos`, História 6.5): Recebimentos soma o que
// está em aberto em todos os Meses, então tem um gerenciador próprio (canal próprio, leitura paginada, sem
// predicado: o "não pago" depende dos Status do usuário e o crédito de uma linha excluída precisa dela). O de
// `lancamentos` segue guardando só o Mês aberto (AD-4).
//
// Leitura paginada (`paginar`, História 6.3): o PostgREST corta a resposta em 1000 linhas, então
// uma tabela que pode passar disso (o histórico de Pagamentos e os itens deles, de todos os
// Meses) é lida por páginas (`order id` + `range`) até uma página vir incompleta.

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
import { guardadaPelaFila } from "@/domain/revisar";
import { aoVoltar } from "./conexao";
import { criarClienteNavegador } from "./supabase/navegador";

// `lembretes_enviados` (História 7.5) é só do Cron (chave de serviço; o navegador nem tem acesso) e não tem
// `updated_at`: nunca é uma tabela de Realtime.
export type TabelaRealtime = Exclude<keyof Database["public"]["Tables"], "lembretes_enviados">;
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
  /**
   * Esquece tudo da sessão que acabou (Defeito 10): esvazia a memória (volta a "carregando"), solta a leitura em curso
   * e fecha o canal, que levava o token de quem saiu. O gerenciador continua o MESMO objeto (os repositórios guardam a
   * referência). Se ainda há quem o assine (troca de sessão com a tela aberta), abre um canal novo, com a sessão de agora.
   */
  zerar(): Promise<void>;
};

/** O corte do PostgREST: uma página lida por vez. */
const TAMANHO_DA_PAGINA = 1000;

const RETRATO_SERVIDOR: Retrato<never> = { status: "carregando", linhas: [] };

/** O `mes` de uma linha de tabela com escopo por Mês. */
function mesDaLinha(linha: unknown): string | undefined {
  return (linha as { mes?: string } | null)?.mes;
}

/** A consulta de leitura de uma tabela (`from(tabela).select("*")`), para `filtrarLeitura`. */
export type ConsultaLeitura = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

export function criarGerenciador<L extends LinhaBase>(opcoes: {
  tabela: string;
  obterCliente: () => SupabaseClient | null;
  /** Guarda e relê só o Mês aberto (coluna `mes`). */
  porMes?: boolean;
  /** Guarda só as linhas que o predicado aceita (memória, eventos e gravações). */
  pertence?: (linha: L) => boolean;
  /** O mesmo critério de `pertence` na consulta SQL da releitura. */
  filtrarLeitura?: (consulta: ConsultaLeitura) => ConsultaLeitura;
  /** Nome do canal (padrão: `tabela:<tabela>`); dois gerenciadores da mesma tabela precisam de nomes diferentes. */
  canal?: string;
  /** Lê a tabela por páginas de 1000 linhas (para o que pode passar do corte do PostgREST). */
  paginar?: boolean;
}): Gerenciador<L> {
  const {
    tabela,
    obterCliente,
    porMes = false,
    pertence,
    filtrarLeitura,
    canal: nomeDoCanal = `tabela:${tabela}`,
    paginar = false,
  } = opcoes;
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

  /** A linha é do escopo da memória (sempre, fora do escopo por Mês e por predicado). */
  const doEscopo = (linha: L) =>
    (!porMes || (mes !== null && mesDaLinha(linha) === mes)) && (pertence === undefined || pertence(linha));

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
      const novaConsulta = (): ConsultaLeitura => {
        let consulta: ConsultaLeitura = cliente.from(tabela).select("*");
        if (filtrarLeitura) consulta = filtrarLeitura(consulta);
        return porMes && lido !== null ? consulta.eq("mes", lido) : consulta;
      };
      let data: unknown[] | null;
      let error: unknown;
      if (paginar) {
        // Uma consulta nova por página (o construtor do PostgREST não se reaproveita) e uma ordem
        // estável (`id`) para as páginas não repetirem nem pularem linhas.
        data = [];
        for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
          const pagina = await novaConsulta()
            .order("id")
            .range(de, de + TAMANHO_DA_PAGINA - 1);
          if (minha !== leitura) return;
          if (pagina.error || !pagina.data) {
            data = null;
            error = pagina.error ?? true;
            break;
          }
          data.push(...pagina.data);
          if (pagina.data.length < TAMANHO_DA_PAGINA) break;
        }
      } else {
        const resposta = await novaConsulta();
        data = resposta.data as unknown[] | null;
        error = resposta.error;
      }
      if (minha !== leitura) return;
      if (error || !data) {
        falhou();
        return;
      }
      // O critério da consulta e o predicado são o mesmo; conferir aqui fecha qualquer folga.
      const lidas = pertence ? (data as L[]).filter(pertence) : (data as L[]);
      mudar(aplicarReleitura(estado, lidas, aplicadasDurante));
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
    const novo = cliente.channel(nomeDoCanal);
    canal = novo;
    // Ouvintes antes do subscribe(): nenhum evento se perde entre os dois.
    novo.on(
      "postgres_changes",
      { event: "*", schema: "public", table: tabela },
      (payload) => {
        // Evento atrasado de um canal que já foi trocado ou zerado (outra sessão): ignora.
        if (canal !== novo) return;
        const evento: EventoRealtime<L> | null =
          payload.eventType === "DELETE"
            ? { tipo: "DELETE", antiga: payload.old as Partial<L> & { id: string } }
            : payload.eventType === "INSERT" || payload.eventType === "UPDATE"
              ? { tipo: payload.eventType, nova: payload.new as L }
              : null;
        if (!evento) return;
        if (evento.tipo !== "DELETE" && !doEscopo(evento.nova)) {
          // Outro Mês (ou fora do predicado): ignorado. Linha da memória que saiu do escopo sai.
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
      // Linhas de outro Mês (ex.: importação de outro Mês) ou fora do
      // predicado não entram.
      const doMes = linhas.filter(doEscopo);
      for (const l of doMes) aplicadasDurante.add(l.id);
      let novo = aplicarLote(estado, doMes);
      // Sob predicado, a gravação que tira a linha do escopo (ex.: sai da
      // fila) a tira da memória, se for mais nova que a guardada.
      if (pertence) {
        for (const fora of linhas) {
          if (doEscopo(fora)) continue;
          const atual = novo.porId.get(fora.id);
          if (atual && ehMaisNovo(fora.updated_at, atual.updated_at)) {
            aplicadasDurante.delete(fora.id);
            novo = aplicarEvento(novo, { tipo: "DELETE", antiga: { id: fora.id } as Partial<L> & { id: string } });
          }
        }
      }
      mudar(novo);
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
    async zerar() {
      // A leitura em curso (da sessão anterior) deixa de valer e nada aplicado durante ela sobrevive.
      leitura++;
      aplicadasDurante.clear();
      const cliente = obterCliente();
      const antigo = canal;
      canal = null;
      conectado = false;
      caiu = false;
      estado = estadoInicial<L>();
      retrato = comMes({ status: estado.status, linhas: [] });
      for (const ouvinte of ouvintes) ouvinte();
      try {
        if (cliente && antigo) await cliente.removeChannel(antigo);
      } catch {
        // Canal antigo já morto: segue.
      }
      if (ouvintes.size > 0 && canal === null) abrirCanal();
    },
  };
}

const gerenciadores = new Map<string, Gerenciador<LinhaBase>>();
let ligadoAoDetector = false;

/** Relê todos os gerenciadores já criados (a conexão voltou). */
export async function recarregarTodos(): Promise<void> {
  await Promise.all([...gerenciadores.values()].map((g) => g.recarregar()));
}

/**
 * Zera todos os gerenciadores (Defeito 10): quem entra depois de "Sair" (uma Server Action com `redirect`, que NÃO
 * recarrega a página) não vê dado da sessão anterior e não ouve canal com o token dela. Chamada pela página de entrar
 * (`ZerarAoEntrar`), onde se chega depois de sair ou de a sessão expirar. Os objetos continuam os mesmos.
 */
export async function zerarGerenciadores(): Promise<void> {
  await Promise.all([...gerenciadores.values()].map((g) => g.zerar()));
}

/** Liga, uma vez, a releitura de todos os gerenciadores à volta da conexão. */
function ligarAoDetector() {
  if (ligadoAoDetector) return;
  ligadoAoDetector = true;
  aoVoltar(() => void recarregarTodos());
}

/**
 * A Conta manual excluída (`excluido_em`, História 5.4, AD-16) não é da lista:
 * o gerenciador de `contas_manuais` guarda só as vivas. A releitura filtra no
 * banco; um evento ou uma gravação que exclui uma Conta (aqui ou em outro
 * aparelho) a tira da memória, e o "Desfazer" (que limpa o campo) a traz de volta.
 */
const contaViva = (linha: LinhaBase) => ((linha as { excluido_em?: string | null }).excluido_em ?? null) === null;
export const ESCOPO_DAS_CONTAS = {
  pertence: contaViva,
  filtrarLeitura: (consulta: ConsultaLeitura) => consulta.is("excluido_em", null),
} as const;

/**
 * O Histórico de Pagamentos (História 6.3, AD-16) lê só os Pagamentos vivos: o desfeito sai da
 * memória (por evento ou por gravação) e continua no banco. Os itens do histórico são os itens
 * vivos de TODOS os Meses. As duas leituras são paginadas (passam de 1000 linhas com o tempo).
 */
const vivo = (linha: LinhaBase) => ((linha as { excluido_em?: string | null }).excluido_em ?? null) === null;
export const ESCOPO_DO_HISTORICO = {
  pertence: vivo,
  filtrarLeitura: (consulta: ConsultaLeitura) => consulta.is("excluido_em", null),
  paginar: true,
} as const;

/** O gerenciador único da tabela (criado na primeira chamada). */
export function gerenciador<T extends TabelaRealtime>(tabela: T): Gerenciador<LinhaDe<T>> {
  let g = gerenciadores.get(tabela);
  if (!g) {
    ligarAoDetector();
    // Só `lancamentos` e `pagamento_itens` (que copia o `mes` do Lançamento) têm escopo por Mês; as outras tabelas são lidas inteiras.
    g = criarGerenciador<LinhaBase>({
      tabela,
      obterCliente: criarClienteNavegador,
      porMes: tabela === "lancamentos" || tabela === "pagamento_itens",
      ...(tabela === "contas_manuais" ? ESCOPO_DAS_CONTAS : {}),
      ...(tabela === "pagamentos" ? ESCOPO_DO_HISTORICO : {}),
    });
    gerenciadores.set(tabela, g);
  }
  return g as unknown as Gerenciador<LinhaDe<T>>;
}

/**
 * `guardadaPelaFila` (a fila e os Ajustes) como filtro do PostgREST, junto de
 * `.is("excluido_em", null)`: a leitura do gerenciador da fila. Detalhe de
 * transporte, por isso mora aqui e não no núcleo.
 */
export const FILTRO_OR_DA_FILA = "revisao_motivo.not.is.null,ajuste_de_id.not.is.null";

/** A chave do gerenciador da fila no mapa (a mesma tabela `lancamentos`, outro escopo). */
const CHAVE_FILA = "lancamentos:fila";

/**
 * O gerenciador da fila do Revisar (História 3.2): as linhas de
 * `lancamentos` que `ehDaFila` aceita, de todos os Meses, mais os Ajustes
 * não excluídos (para acompanharem a mãe). Tem canal próprio e entra em
 * `recarregarTodos`. O de `lancamentos` guarda só o Mês aberto (AD-4); a
 * fila e o contador do menu valem para todos os Meses.
 */
export function gerenciadorFila(): Gerenciador<LinhaDe<"lancamentos">> {
  let g = gerenciadores.get(CHAVE_FILA);
  if (!g) {
    ligarAoDetector();
    g = criarGerenciador<LinhaDe<"lancamentos">>({
      tabela: "lancamentos",
      obterCliente: criarClienteNavegador,
      pertence: guardadaPelaFila,
      filtrarLeitura: (consulta) => consulta.is("excluido_em", null).or(FILTRO_OR_DA_FILA),
      canal: "tabela:lancamentos:fila",
    }) as unknown as Gerenciador<LinhaBase>;
    gerenciadores.set(CHAVE_FILA, g);
  }
  return g as unknown as Gerenciador<LinhaDe<"lancamentos">>;
}

/** A chave do gerenciador dos itens vivos de Pagamento de todos os Meses. */
const CHAVE_ITENS_DO_HISTORICO = "pagamento_itens:historico";

/**
 * Os itens vivos de Pagamento de TODOS os Meses (História 6.3): a lista do Histórico precisa de
 * quantos Lançamentos cada Pagamento tocou e de quais. O gerenciador de `pagamento_itens` guarda só
 * o Mês aberto (AD-4); este tem canal próprio, lê por páginas e entra em `recarregarTodos`. O item
 * de um Pagamento desfeito (UPDATE com `excluido_em`) sai da memória.
 */
export function gerenciadorItensDoHistorico(): Gerenciador<LinhaDe<"pagamento_itens">> {
  let g = gerenciadores.get(CHAVE_ITENS_DO_HISTORICO);
  if (!g) {
    ligarAoDetector();
    g = criarGerenciador<LinhaDe<"pagamento_itens">>({
      tabela: "pagamento_itens",
      obterCliente: criarClienteNavegador,
      canal: "tabela:pagamento_itens:historico",
      ...ESCOPO_DO_HISTORICO,
    }) as unknown as Gerenciador<LinhaBase>;
    gerenciadores.set(CHAVE_ITENS_DO_HISTORICO, g);
  }
  return g as unknown as Gerenciador<LinhaDe<"pagamento_itens">>;
}

/** Itens vivos de Pagamento de todos os Meses em memória, em tempo real (o Histórico). */
export function useItensDoHistorico(): Retrato<LinhaDe<"pagamento_itens">> {
  const g = gerenciadorItensDoHistorico();
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}

/** A chave do gerenciador dos Lançamentos de todos os Meses (Recebimentos, 6.5). */
const CHAVE_TODOS_OS_LANCAMENTOS = "lancamentos:todos";

/**
 * Os Lançamentos de TODOS os Meses, vivos e excluídos (História 6.5): Recebimentos calcula o que falta
 * receber em todos os Meses (`projetarPendente`). Tem canal próprio, lê por páginas de 1000 e entra em
 * `recarregarTodos`. Sem predicado de propósito: "não pago" depende dos Status (cadastro do usuário) e a
 * linha excluída depois de paga vira crédito. Custo: ~1 KB por linha, uns 100 a 150 Lançamentos por Mês
 * (1,5 MB por ano de uso), na memória só enquanto a aba vive e só depois que Recebimentos é aberto.
 */
export function gerenciadorTodosOsLancamentos(): Gerenciador<LinhaDe<"lancamentos">> {
  let g = gerenciadores.get(CHAVE_TODOS_OS_LANCAMENTOS);
  if (!g) {
    ligarAoDetector();
    g = criarGerenciador<LinhaDe<"lancamentos">>({
      tabela: "lancamentos",
      obterCliente: criarClienteNavegador,
      canal: "tabela:lancamentos:todos",
      paginar: true,
    }) as unknown as Gerenciador<LinhaBase>;
    gerenciadores.set(CHAVE_TODOS_OS_LANCAMENTOS, g);
  }
  return g as unknown as Gerenciador<LinhaDe<"lancamentos">>;
}

/** Lançamentos de todos os Meses em memória, em tempo real (Recebimentos). */
export function useTodosOsLancamentos(): Retrato<LinhaDe<"lancamentos">> {
  const g = gerenciadorTodosOsLancamentos();
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}

/** Linhas da fila do Revisar em memória (todos os Meses), em tempo real. */
export function useFilaRevisar(): Retrato<LinhaDe<"lancamentos">> {
  const g = gerenciadorFila();
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}

/** Linhas da tabela em memória, atualizadas em tempo real. */
export function useLinhas<T extends TabelaRealtime>(tabela: T): Retrato<LinhaDe<T>> {
  const g = gerenciador(tabela);
  return useSyncExternalStore(g.assinar, g.retrato, () => RETRATO_SERVIDOR);
}
