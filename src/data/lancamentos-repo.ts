// Repositório de Lançamentos (História 2.7, AD-3/AD-4/AD-16). Única porta
// de gravação de `lancamentos` fora da importação (que segue em
// `faturas-repo.ts`, pela RPC).
//
// - `atualizar`: só as colunas que mudaram em relação à memória e
//   `editado_em` (o relógio do aparelho), com otimismo.
// - `incluir`: sem otimismo (o id vem do banco); aplica a linha devolvida.
// - `excluir` / `restaurar`: só `excluido_em`, com otimismo; "Desfazer"
//   limpa o campo no mesmo `id`.
// - Ajustes de centavos (História 2.8): `atualizar`, `excluir` e
//   `restaurar` aceitam os ids que vão `junto` (os Ajustes da mãe), numa
//   requisição só (`update … in (ids)`); `desvincular` e `religar` gravam o
//   `ajuste_de_id`.
//
// Toda gravação que deu certo devolve a linha gravada: o painel guarda o
// `updated_at` dela para reconhecer as próprias gravações quando o Realtime
// as trouxer de volta.
//
// Regras (História 3.1): quando `atualizar` ou `incluir` escolhem um
// Responsável ou um Tipo (valor não nulo), a linha principal ensina a Regra
// do Nome (`regrasRepo.aprender`, sem esperar). Só escolher ensina (7-A): a
// gravação que só limpa não chama `aprender`. Nunca os ids que vão `junto`
// (os Ajustes), nem `desvincular`/`religar`, nem uma linha que é Ajuste
// (`ajuste_de_id`). A falha de `aprender` não desfaz nem avisa a gravação.
//
// Fila do Revisar: a gravação que deixa a linha com Responsável e Tipo tira
// a linha da fila no mesmo corpo (`revisao_motivo` e `revisao_dados` = null).
// A linha da Fatura (não Ajuste) fora da fila em que a gravação limpa o
// Responsável ou o Tipo volta como `sem_classificacao`; com Ajustes `junto`,
// isso vai numa segunda requisição só para a mãe (o Ajuste nunca tem motivo).
//
// Fila do Revisar (História 3.2): `revisado_em` (o relógio do aparelho, o
// mesmo de `editado_em`) é gravado junto com a saída da fila e volta a nulo
// quando a linha volta a ela. `devolverAFila` é o "Desfazer" do Confirmar e do
// "Mudar". A tela Revisar usa uma segunda instância (`repoLancamentosRevisar`)
// ligada ao gerenciador da fila.
//
// Lote (História 3.3): `classificarEmLote` grava todas as linhas (mães e
// Ajustes) numa chamada só à RPC `classificar_em_lote`, em transação: tudo ou
// nada. O que cada linha grava sai do núcleo (`planejarLote`, a mesma regra de
// `atualizar` via `planejarGravacao`). Com otimismo; falha desfaz e nada muda.
// Depois da RPC, um evento de Regra por mãe (`aprender` em lista), sem esperar
// e sem desfazer o lote se falhar. `desfazerLote` é a mesma RPC com os valores
// de antes; a Regra aprendida não é desfeita.
//
// Previstos (História 3.5): `propagarAosPrevistos` lê do banco os previstos
// (`sistema`, não excluídos) da Série de cada parcela reclassificada, deixa o
// núcleo (`planejarPropagacao`) separar os vazios (gravados na hora, sem
// perguntar) dos que têm outro valor (devolvidos para a tela perguntar) e grava
// pela mesma RPC do lote, sem `editado_em` e sem ensinar Regra. Os previstos
// são de outros Meses: a memória (só o Mês aberto) guarda apenas os do Mês
// aberto. `aplicarAosPrevistos` grava a resposta "Aplicar a todos".
// `lerOrigem` lê a linha que gerou um previsto e o vencimento da Fatura dela.
//
// Divisão (História 3.8): `dividir` e `desfazerDivisao` gravam pela RPC
// `dividir_lancamento` o que o núcleo (`divisao.ts`) planejou, aplicam mãe e
// filhas devolvidas no gerenciador (sem otimismo: as filhas só existem depois
// da RPC) e ensinam a Regra do Nome (sem esperar). Depois propagam aos
// previstos da Série como a 3.5: os vazios recebem na hora e os com outra
// Divisão voltam em `aPerguntar` ("Aplicar a todos" → `aplicarDivisaoAosPrevistos`).
// `desfazer` leva os itens que devolvem tudo ao que era (`restaurarDivisao`).
//
// Casamento (História 3.6): `manterPrevisto` é o "Manter" da variante "Não
// veio na fatura": o previsto sai da fila (`revisao_motivo` e `revisao_dados`
// nulos, `revisado_em`) e continua previsto, sem ensinar Regra. O "Desfazer" é
// `devolverAFila`. "Remover previsto" é o `excluir` de sempre e o "Desfazer"
// dele, o `restaurar`.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  itemParaRestaurar,
  juntarItensDividir,
  lerDivisao,
  planejarDesfazerDivisao,
  planejarDivisao,
  planejarDivisaoNosPrevistos,
  type Divisao,
  type DivisaoDaParcela,
  type ItemDividir,
} from "@/domain/divisao";
import type { MudancaCampo, NovoLancamento } from "@/domain/lancamento";
import {
  planejarGravacao,
  planejarLote,
  type CamposDoLote,
  type EntradaDoLote,
  type ItemDoLote,
} from "@/domain/lote";
import {
  juntarMudancas,
  planejarPropagacao,
  type ClassificacaoDaParcela,
  type MudancaDoPrevisto,
} from "@/domain/previstos";
import type { EventoAprender } from "@/domain/regras";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, gravarComOtimismo, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, gerenciadorFila, type Gerenciador, type LinhaDe } from "./realtime";
import { repoRegras } from "./regras-repo";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaLancamento = LinhaDe<"lancamentos">;

/** Colunas que o painel pode mudar num Lançamento existente. */
export type MudancaLancamento = Partial<
  Pick<LinhaLancamento, "valor_centavos" | "data" | "apelido" | "observacao" | "responsavel_id" | "tipo_id" | "status_id">
>;

/**
 * `ok: true` leva a linha gravada (sem nada a gravar, a da memória).
 * `ok: false` leva o código: `salvar.falhou` ou `conexao.gravar_sem_conexao`.
 */
export type ResultadoLancamento =
  | { ok: true; linha: LinhaLancamento }
  | { ok: false; codigo: CodigoFalhaGravacao };

/** A mudança de um campo do núcleo (`mudancaDoCampo`) como corpo do repositório. */
export function mudancaDaColuna(m: MudancaCampo): MudancaLancamento {
  return { [m.coluna]: m.valor } as MudancaLancamento;
}

/** Opções de uma gravação: `agora` (padrão, o relógio do aparelho) e os ids gravados `junto`. */
export type OpcoesGravacao = {
  agora?: Date;
  /**
   * Ajustes de centavos que acompanham a linha (História 2.8): recebem o
   * mesmo corpo, na mesma requisição (`update … in (ids)`), com otimismo.
   */
  junto?: readonly string[];
};

/**
 * Opções do lote: `agora` (padrão, o relógio do aparelho) e `ensinar`
 * (padrão `true`; `false` não ensina as Regras: a reaplicação de uma Regra
 * editada, História 3.4, não soma contagem nem muda `ultimo_uso`).
 */
export type OpcoesLote = { agora?: Date; ensinar?: boolean };

/** A mãe a que um Ajuste volta no "Desfazer" do "Desvincular": o id e a classificação atual. */
export type MaeDoAjuste = Pick<LinhaLancamento, "id" | "tipo_id" | "responsavel_id">;

/**
 * Como a linha estava antes de Confirmar ou "Mudar" (o "Desfazer" da fila):
 * a classificação, o motivo, a sugestão e o `revisado_em`.
 */
export type AnteriorDaFila = Pick<
  LinhaLancamento,
  "responsavel_id" | "tipo_id" | "revisao_motivo" | "revisao_dados" | "revisado_em"
>;

/** Quem aprende a Regra de uma classificação (`regrasRepo.aprender`): um evento ou a lista do lote. */
export type Aprender = (evento: EventoAprender | readonly EventoAprender[]) => Promise<unknown>;

/**
 * O resultado do lote (e do "Desfazer"): as linhas gravadas e, para o
 * "Desfazer", o retrato de antes. `gravadas` conta as linhas das entradas
 * (sem os Ajustes que vão junto); 0 = nada mudou e nada foi gravado.
 */
export type ResultadoLote =
  | { ok: true; linhas: LinhaLancamento[]; gravadas: number; antes: ItemDoLote[] }
  | { ok: false; codigo: CodigoFalhaGravacao };

/** Uma parcela real que mudou de classificação (as colunas que a propagação olha). */
export type ParcelaReclassificada = {
  serie_id: string | null;
  parcela_n: number | null;
  lancado_por: LinhaLancamento["lancado_por"];
  antes: ClassificacaoDaParcela;
  depois: ClassificacaoDaParcela;
};

/** O que a propagação fez: quantos previstos vazios foram preenchidos e o que fica para perguntar. */
export type ResultadoPropagacao =
  | { ok: true; preenchidos: number; aPerguntar: MudancaDoPrevisto[] }
  | { ok: false; codigo: CodigoFalhaGravacao };

/** A linha que gerou um previsto (null no `origem`: ela foi apagada na reimportação). */
export type OrigemDoPrevisto = {
  nome: string;
  parcela_n: number | null;
  parcela_total: number | null;
  /** Vencimento da Fatura dela (`AAAA-MM-DD`), se a Fatura existe. */
  vencimento: string | null;
};

export type ResultadoOrigem = { ok: true; origem: OrigemDoPrevisto | null } | { ok: false; codigo: CodigoFalhaGravacao };

/** Os códigos que `dividir_lancamento` levanta e a tela mostra como estão. */
const CODIGOS_DA_DIVISAO = new Set([
  "divisao.com_ajuste",
  "divisao.soma_diferente",
  "divisao.mae_invalida",
  "divisao.filha_invalida",
]);

export type FalhaDaDivisao = CodigoFalhaGravacao | "divisao.com_ajuste" | "divisao.soma_diferente" | "divisao.mae_invalida" | "divisao.filha_invalida" | string;

/**
 * Resultado de dividir (ou desfazer): as linhas gravadas (mãe e filhas), quantos
 * previstos foram preenchidos sozinhos, os itens que dependem de "Aplicar a
 * todos" e os que devolvem tudo ao que era (o "Desfazer" do toast).
 */
export type ResultadoDivisao =
  | { ok: true; linhas: LinhaLancamento[]; preenchidos: number; aPerguntar: ItemDividir[]; desfazer: ItemDividir[] }
  | { ok: false; codigo: FalhaDaDivisao };

export function criarRepoLancamentos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
  /** Aprende a Regra da classificação; sem ele, nenhuma Regra é aprendida. */
  aprender?: Aprender;
}) {
  const { obterCliente, memoria, online = estaOnline, aprender } = deps;

  /** Ensina a Regra pela linha principal, sem esperar; a falha não chega à gravação. */
  function ensinar(nome: string, responsavelAntes: string | null, gravada: LinhaLancamento) {
    if (!aprender || gravada.ajuste_de_id != null) return;
    try {
      void aprender({
        nome,
        responsavelAntes,
        responsavelDepois: gravada.responsavel_id,
        tipoDepois: gravada.tipo_id,
      }).catch(() => {});
    } catch {
      // A gravação do Lançamento já valeu.
    }
  }

  /** Ensina as Regras do lote, sem esperar; a falha não chega à gravação. */
  function ensinarLote(eventos: readonly EventoAprender[]) {
    if (!aprender || eventos.length === 0) return;
    try {
      void aprender(eventos).catch(() => {});
    } catch {
      // O lote já valeu.
    }
  }

  /** Chama `dividir_lancamento`; as linhas (mães e filhas) ou o código da recusa. */
  async function chamarDividir(
    cliente: SupabaseClient<Database>,
    itens: readonly ItemDividir[],
  ): Promise<{ ok: true; linhas: LinhaLancamento[] } | { ok: false; codigo: FalhaDaDivisao }> {
    const { data, error } = await cliente.rpc("dividir_lancamento", { p_itens: itens as unknown as Json });
    if (error) {
      const codigo = [...CODIGOS_DA_DIVISAO].find((c) => error.message?.includes(c));
      return { ok: false, codigo: codigo ?? "salvar.falhou" };
    }
    if (!Array.isArray(data)) return { ok: false, codigo: "salvar.falhou" };
    return { ok: true, linhas: data as unknown as LinhaLancamento[] };
  }

  /** Ensina (ou limpa) a Divisão da Regra do Nome, sem esperar; a falha não chega à gravação. */
  function ensinarDivisao(nome: string, tipoId: string | null, divisao: Divisao | null) {
    if (!aprender) return;
    try {
      void aprender({ nome, responsavelAntes: null, responsavelDepois: null, tipoDepois: tipoId, divisao }).catch(() => {});
    } catch {
      // A divisão já valeu.
    }
  }

  /** As filhas não excluídas de cada mãe, lidas do banco (para restaurar previstos). */
  async function lerFilhasDoBanco(cliente: SupabaseClient<Database>, ids: readonly string[]): Promise<LinhaLancamento[] | null> {
    if (ids.length === 0) return [];
    const { data, error } = await cliente.from("lancamentos").select("*").in("dividido_de_id", ids).is("excluido_em", null);
    return error || !data ? null : data;
  }

  /** Chama a RPC do lote; as linhas gravadas, ou `null` se o banco recusou ou respondeu pela metade. */
  async function chamarLote(cliente: SupabaseClient<Database>, itens: readonly ItemDoLote[]): Promise<LinhaLancamento[] | null> {
    const { data, error } = await cliente.rpc("classificar_em_lote", { p_itens: itens as unknown as Json });
    if (error || !Array.isArray(data)) return null;
    const linhas = data as unknown as LinhaLancamento[];
    return linhas.length === itens.length ? linhas : null;
  }

  /** Os ids da gravação: a linha e as que vão junto, sem repetir. */
  const todos = (id: string, junto: readonly string[] = []) => [id, ...junto.filter((j) => j !== id)];

  /**
   * Grava `corpo` em `ids` com otimismo e devolve a linha `ids[0]` que o
   * banco devolveu. Uma linha só: `eq(id)`; várias: `in(ids)`, numa
   * requisição.
   */
  async function gravar(ids: readonly string[], corpo: Partial<LinhaLancamento>): Promise<ResultadoLancamento> {
    const [id] = ids;
    // Numa caixa: o TS não acompanha a atribuição feita dentro do callback.
    const gravada: { linha: LinhaLancamento | null } = { linha: null };
    const r = await gravarComOtimismo(
      obterCliente,
      memoria,
      ids.map((i) => ({ id: i, ...corpo })),
      async (cliente) => {
        if (ids.length === 1) {
          const { data, error } = await cliente.from("lancamentos").update(corpo).eq("id", id).select().single();
          if (error || !data) return null;
          gravada.linha = data;
          return [data];
        }
        const { data, error } = await cliente.from("lancamentos").update(corpo).in("id", ids).select();
        // Resposta parcial (alguma linha não voltou): falha, e o otimismo é desfeito.
        if (error || !data || data.length !== ids.length) return null;
        gravada.linha = data.find((l) => l.id === id) ?? null;
        return gravada.linha ? data : null;
      },
      online,
    );
    if (!r.ok) return r;
    return gravada.linha ? { ok: true, linha: gravada.linha } : FALHOU;
  }

  /** Sem otimismo (linhas fora da memória): grava e aplica a resposta. */
  async function gravarSemMemoria(ids: readonly string[], corpo: Partial<LinhaLancamento>): Promise<ResultadoLancamento> {
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      let data: LinhaLancamento[] | null;
      if (ids.length === 1) {
        const r = await cliente.from("lancamentos").update(corpo).eq("id", ids[0]).select().single();
        data = r.error || !r.data ? null : [r.data];
      } else {
        const r = await cliente.from("lancamentos").update(corpo).in("id", ids).select();
        data = r.error ? null : r.data;
      }
      const linha = data?.find((l) => l.id === ids[0]);
      if (!data || data.length !== ids.length || !linha) return FALHOU;
      // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
      memoria.aplicarLote(data);
      return { ok: true, linha };
    } catch {
      return FALHOU;
    }
  }

  /** Grava as mudanças dos previstos pela RPC do lote (sem `editado_em`) e aplica o que voltar na memória. */
  async function gravarPrevistos(mudancas: readonly MudancaDoPrevisto[]): Promise<{ ok: true } | { ok: false; codigo: CodigoFalhaGravacao }> {
    if (mudancas.length === 0) return { ok: true };
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      const linhas = await chamarLote(cliente, mudancas.map((m) => ({ id: m.id, corpo: m.corpo })) as unknown as ItemDoLote[]);
      if (!linhas) return FALHOU;
      // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
      memoria.aplicarLote(linhas);
      return { ok: true };
    } catch {
      return FALHOU;
    }
  }

  /** Os previstos da Série depois de `mae`, a Divisão deles planejada e o que já foi gravado sozinho. */
  async function propagarDivisao(
    cliente: SupabaseClient<Database>,
    mae: LinhaLancamento,
    antes: DivisaoDaParcela,
    depois: DivisaoDaParcela,
  ): Promise<{ preenchidos: number; aPerguntar: ItemDividir[]; desfazer: ItemDividir[] } | null> {
    if (mae.serie_id === null || mae.parcela_n === null || mae.lancado_por === "sistema") {
      return { preenchidos: 0, aPerguntar: [], desfazer: [] };
    }
    const lidos = await cliente
      .from("lancamentos")
      .select("*")
      .eq("serie_id", mae.serie_id)
      .eq("lancado_por", "sistema")
      .is("excluido_em", null)
      .is("dividido_de_id", null)
      .gt("parcela_n", mae.parcela_n);
    if (lidos.error || !lidos.data) return null;
    const plano = planejarDivisaoNosPrevistos(antes, depois, lidos.data);
    if (plano.silenciosos.length === 0) return { preenchidos: 0, aPerguntar: plano.aPerguntar, desfazer: [] };
    const ids = plano.silenciosos.map((i) => i.id);
    const filhas = await lerFilhasDoBanco(cliente, ids);
    if (!filhas) return null;
    const desfazer = ids.flatMap((id) => {
      const p = lidos.data.find((x) => x.id === id);
      return p ? [itemParaRestaurar(p, filhas.filter((f) => f.dividido_de_id === id))] : [];
    });
    const gravou = await chamarDividir(cliente, plano.silenciosos);
    if (!gravou.ok) return null;
    // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
    memoria.aplicarLote(gravou.linhas);
    return { preenchidos: plano.silenciosos.length, aPerguntar: plano.aPerguntar, desfazer };
  }

  /** Grava os itens pela RPC (sem otimismo) e aplica as linhas devolvidas na memória. */
  async function gravarItensDaDivisao(itens: readonly ItemDividir[]): Promise<{ ok: true } | { ok: false; codigo: FalhaDaDivisao }> {
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      const r = await chamarDividir(cliente, itens);
      if (!r.ok) return r;
      memoria.aplicarLote(r.linhas);
      return { ok: true };
    } catch {
      return FALHOU;
    }
  }

  /** Grava o item da mãe, ensina a Regra e propaga aos previstos. */
  async function executarDivisao(
    mae: LinhaLancamento,
    item: ItemDividir,
    depois: DivisaoDaParcela,
    regra: { tipoId: string | null; divisao: Divisao | null },
  ): Promise<ResultadoDivisao> {
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      const filhasAntes = memoria.linhas().filter((f) => f.dividido_de_id === mae.id && f.excluido_em === null);
      const gravou = await chamarDividir(cliente, [item]);
      if (!gravou.ok) return gravou;
      memoria.aplicarLote(gravou.linhas);
      ensinarDivisao(mae.nome, regra.tipoId, regra.divisao);
      const restaurarMae = itemParaRestaurar(mae, filhasAntes);
      let propagou: Awaited<ReturnType<typeof propagarDivisao>> = null;
      try {
        propagou = await propagarDivisao(cliente, mae, { responsavel_id: mae.responsavel_id, divisao: lerDivisao(mae.divisao) }, depois);
      } catch {
        propagou = null;
      }
      // A mãe já foi gravada; se os previstos falharem, a tela só avisa.
      if (!propagou) return { ok: true, linhas: gravou.linhas, preenchidos: 0, aPerguntar: [], desfazer: [restaurarMae] };
      return {
        ok: true,
        linhas: gravou.linhas,
        preenchidos: propagou.preenchidos,
        aPerguntar: propagou.aPerguntar,
        desfazer: juntarItensDividir([restaurarMae], propagou.desfazer),
      };
    } catch {
      return FALHOU;
    }
  }

  function classificarEmLote(ids: readonly string[], campos: CamposDoLote, opcoes?: OpcoesLote): Promise<ResultadoLote>;
  function classificarEmLote(entradas: readonly EntradaDoLote[], opcoes?: OpcoesLote): Promise<ResultadoLote>;
  async function classificarEmLote(
    primeiro: readonly string[] | readonly EntradaDoLote[],
    segundo?: CamposDoLote | OpcoesLote,
    terceiro?: OpcoesLote,
  ): Promise<ResultadoLote> {
    const porIds = primeiro.length > 0 && typeof primeiro[0] === "string";
    const entradas: EntradaDoLote[] = porIds
      ? (primeiro as readonly string[]).map((id) => ({ id, campos: (segundo ?? {}) as CamposDoLote }))
      : (primeiro as readonly EntradaDoLote[]).slice();
    const opcoes = (porIds ? terceiro : segundo) as OpcoesLote | undefined;
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const agora = (opcoes?.agora ?? new Date()).toISOString();
    const plano = planejarLote(entradas, memoria.linhas(), agora);
    // Nada muda (já estava assim, ou as linhas saíram da memória): nada é gravado.
    if (plano.itens.length === 0) return { ok: true, linhas: [], gravadas: 0, antes: [] };
    // Numa caixa: o TS não acompanha a atribuição feita dentro do callback.
    const gravadas: { linhas: LinhaLancamento[] } = { linhas: [] };
    const r = await gravarComOtimismo(
      obterCliente,
      memoria,
      plano.itens.map((i) => ({ id: i.id, ...i.corpo }) as Partial<LinhaLancamento> & { id: string }),
      async (cliente) => {
        const linhas = await chamarLote(cliente, plano.itens);
        if (linhas) gravadas.linhas = linhas;
        return linhas;
      },
      online,
    );
    if (!r.ok) return r;
    if (opcoes?.ensinar !== false) ensinarLote(plano.eventos);
    return { ok: true, linhas: gravadas.linhas, gravadas: plano.gravadas, antes: plano.antes };
  }

  return {
    /**
     * Classifica várias linhas numa gravação só (História 3.3): `(ids, campos)`
     * dá os mesmos campos a todas; `(entradas)` dá campos a cada uma
     * ("Aplicar sugestões"). Tudo ou nada: falhou, nada mudou. Devolve as
     * linhas gravadas e o retrato de antes para o `desfazerLote`.
     */
    classificarEmLote,

    /**
     * "Desfazer" do lote: a mesma RPC com os valores de antes de cada linha
     * (mães e Ajustes). As linhas já saíram da fila: grava sem otimismo e a
     * resposta as devolve. A Regra aprendida não é desfeita (a contagem só soma).
     */
    async desfazerLote(antes: readonly ItemDoLote[]): Promise<ResultadoLote> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      if (antes.length === 0) return { ok: true, linhas: [], gravadas: 0, antes: [] };
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const linhas = await chamarLote(cliente, antes);
        if (!linhas) return FALHOU;
        memoria.aplicarLote(linhas);
        return { ok: true, linhas, gravadas: antes.length, antes: [] };
      } catch {
        return FALHOU;
      }
    },

    /**
     * Só as colunas que mudaram (em relação à linha `id`) e `editado_em`.
     * Com `junto` (os Ajustes da mãe, ao mudar Tipo ou Responsável), as
     * mesmas colunas vão para eles na mesma requisição.
     */
    async atualizar(id: string, mudanca: MudancaLancamento, opcoes: OpcoesGravacao = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const atual = memoria.linha(id);
      if (!atual) return FALHOU;
      const agora = (opcoes.agora ?? new Date()).toISOString();
      // O que gravar sai do núcleo (a mesma regra do lote): só as colunas que
      // mudam, a saída da fila e `editado_em`.
      const plano = planejarGravacao<LinhaLancamento>(atual, mudanca, agora);
      if (plano.vazio) return { ok: true, linha: atual };
      const { corpo, soDaPrincipal } = plano;
      const ids = todos(id, (opcoes.junto ?? []).filter((j) => memoria.linha(j)));
      let r: ResultadoLancamento;
      if (soDaPrincipal && ids.length === 1) {
        r = await gravar(ids, { ...corpo, ...soDaPrincipal });
      } else {
        r = await gravar(ids, corpo);
        if (r.ok && soDaPrincipal) {
          // A classificação já valeu (mãe e Ajustes juntos); a fila é só da mãe.
          const fila = await gravar([id], { ...soDaPrincipal, editado_em: agora });
          if (fila.ok) r = fila;
        }
      }
      if (r.ok && plano.ensina) ensinar(atual.nome, atual.responsavel_id, r.linha);
      return r;
    },

    /**
     * Previstos de uma parcela reclassificada (História 3.5, decisão 4-A):
     * preenche já os previstos vazios e devolve em `aPerguntar` os que têm
     * outro valor (para "Só este" / "Aplicar a todos"). Linha sem Série, ou
     * que é ela mesma um previsto, não propaga. Não ensina Regra.
     */
    async propagarAosPrevistos(parcelas: readonly ParcelaReclassificada[]): Promise<ResultadoPropagacao> {
      const alvos = parcelas.filter(
        (p) => p.serie_id !== null && p.parcela_n !== null && p.lancado_por !== "sistema",
      );
      if (alvos.length === 0) return { ok: true, preenchidos: 0, aPerguntar: [] };
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("lancamentos")
          .select("id, serie_id, parcela_n, responsavel_id, tipo_id")
          .in("serie_id", [...new Set(alvos.map((p) => p.serie_id as string))])
          .eq("lancado_por", "sistema")
          .is("dividido_de_id", null)
          .is("excluido_em", null);
        if (error || !data) return FALHOU;
        const silenciosos: MudancaDoPrevisto[][] = [];
        const aPerguntar: MudancaDoPrevisto[][] = [];
        for (const p of alvos) {
          const seguintes = data.filter(
            (l) => l.serie_id === p.serie_id && l.parcela_n !== null && l.parcela_n > (p.parcela_n as number),
          );
          const plano = planejarPropagacao(p.antes, p.depois, seguintes);
          silenciosos.push(plano.silenciosos);
          aPerguntar.push(plano.aPerguntar);
        }
        const preencher = juntarMudancas(...silenciosos);
        const gravou = await gravarPrevistos(preencher);
        if (!gravou.ok) return gravou;
        return { ok: true, preenchidos: preencher.length, aPerguntar: juntarMudancas(...aPerguntar) };
      } catch {
        return FALHOU;
      }
    },

    /** "Aplicar a todos": grava as mudanças que `propagarAosPrevistos` deixou para perguntar. */
    async aplicarAosPrevistos(mudancas: readonly MudancaDoPrevisto[]): Promise<{ ok: true; gravados: number } | { ok: false; codigo: CodigoFalhaGravacao }> {
      if (mudancas.length === 0) return { ok: true, gravados: 0 };
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const r = await gravarPrevistos(mudancas);
      return r.ok ? { ok: true, gravados: mudancas.length } : r;
    },

    /**
     * "Dividir" (e editar a Divisão): grava a mãe e as filhas, ensina a Regra e
     * preenche os previstos vazios da Série. `status` é o Status de cada parte
     * (`undefined` mantém o da filha, ou usa o da mãe numa filha nova).
     */
    async dividir(
      maeId: string,
      divisao: Divisao,
      status: readonly (string | null | undefined)[] = [],
      agora: Date = new Date(),
    ): Promise<ResultadoDivisao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const mae = memoria.linha(maeId);
      if (!mae) return FALHOU;
      const item = planejarDivisao(mae, divisao, { agora: agora.toISOString(), status });
      if (!item.ok) return { ok: false, codigo: item.erro.codigo };
      const gravada = item.valor.corpo.divisao as Divisao;
      return executarDivisao(mae, item.valor, { responsavel_id: null, divisao: gravada }, { tipoId: mae.tipo_id, divisao: gravada });
    },

    /**
     * "Desfazer divisão": a mãe volta a ser linha comum (o Responsável de antes
     * volta, ou a linha vai para a fila) e as filhas saem. A Regra passa a não
     * ter Divisão; os previstos com a mesma Divisão voltam sozinhos.
     */
    async desfazerDivisao(maeId: string, agora: Date = new Date()): Promise<ResultadoDivisao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const mae = memoria.linha(maeId);
      if (!mae) return FALHOU;
      const item = planejarDesfazerDivisao(mae, agora.toISOString());
      if (!item.ok) return { ok: false, codigo: item.erro.codigo };
      return executarDivisao(
        mae,
        item.valor,
        { responsavel_id: item.valor.corpo.responsavel_id ?? null, divisao: null },
        { tipoId: null, divisao: null },
      );
    },

    /** O "Desfazer" do toast: devolve a mãe (e os previstos que a ação preencheu) ao que eram. A Regra não é desfeita. */
    restaurarDivisao(itens: readonly ItemDividir[]): Promise<{ ok: true } | { ok: false; codigo: FalhaDaDivisao }> {
      return gravarItensDaDivisao(itens);
    },

    /** "Aplicar a todos": grava a Divisão nos previstos que `dividir` deixou para perguntar. */
    async aplicarDivisaoAosPrevistos(itens: readonly ItemDividir[]): Promise<{ ok: true; gravados: number } | { ok: false; codigo: FalhaDaDivisao }> {
      if (itens.length === 0) return { ok: true, gravados: 0 };
      const r = await gravarItensDaDivisao(itens);
      return r.ok ? { ok: true, gravados: itens.length } : r;
    },

    /** A linha que gerou o previsto e o vencimento da Fatura dela, lidos do banco. */
    async lerOrigem(origemId: string): Promise<ResultadoOrigem> {
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("lancamentos")
          .select("nome, parcela_n, parcela_total, fatura_id")
          .eq("id", origemId)
          .maybeSingle();
        if (error) return FALHOU;
        if (!data) return { ok: true, origem: null };
        let vencimento: string | null = null;
        if (data.fatura_id !== null) {
          const f = await cliente.from("faturas").select("vencimento").eq("id", data.fatura_id).maybeSingle();
          if (f.error) return FALHOU;
          vencimento = f.data?.vencimento ?? null;
        }
        return {
          ok: true,
          origem: { nome: data.nome, parcela_n: data.parcela_n, parcela_total: data.parcela_total, vencimento },
        };
      } catch {
        return FALHOU;
      }
    },

    /** Insere (sem otimismo: o id vem do banco) e aplica a linha devolvida. */
    async incluir(novo: NovoLancamento): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente.from("lancamentos").insert({ ...novo }).select().single();
        if (error || !data) return FALHOU;
        // De outro Mês, o gerenciador (só o Mês aberto) não guarda.
        memoria.aplicarLote([data]);
        if (data.responsavel_id !== null || data.tipo_id !== null) ensinar(data.nome, null, data);
        return { ok: true, linha: data };
      } catch {
        return FALHOU;
      }
    },

    /**
     * Exclusão lógica (AD-16): grava só `excluido_em`. Com `junto` (os
     * Ajustes da mãe), eles saem na mesma gravação.
     */
    excluir(id: string, opcoes: OpcoesGravacao = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      if (!memoria.linha(id)) return Promise.resolve(FALHOU);
      const ids = todos(id, (opcoes.junto ?? []).filter((j) => memoria.linha(j)));
      return gravar(ids, { excluido_em: (opcoes.agora ?? new Date()).toISOString() });
    },

    /**
     * "Desfazer" da exclusão: limpa `excluido_em` no mesmo `id` (e nos
     * `junto`, os Ajustes que saíram com ele). Linha fora da memória (o Mês
     * mudou depois de excluir): grava sem otimismo e aplica a resposta (o
     * gerenciador só guarda se for do Mês aberto).
     */
    async restaurar(id: string, opcoes: Pick<OpcoesGravacao, "junto"> = {}): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const ids = todos(id, opcoes.junto);
      if (ids.every((i) => memoria.linha(i))) return gravar(ids, { excluido_em: null });
      return gravarSemMemoria(ids, { excluido_em: null });
    },

    /**
     * "Manter" de um previsto que a Fatura não trouxe: só limpa o motivo da
     * fila e marca `revisado_em`. A classificação e o resto da linha não mudam.
     */
    manterPrevisto(id: string, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      if (!memoria.linha(id)) return Promise.resolve(FALHOU);
      return gravar([id], { revisao_motivo: null, revisao_dados: null, revisado_em: agora.toISOString() });
    },

    /**
     * "Desvincular" do Ajuste: `ajuste_de_id = null`; Tipo e Responsável ficam
     * como estão. Linha da Fatura sem Responsável ou sem Tipo entra na fila
     * (`sem_classificacao`) na mesma gravação.
     */
    desvincular(id: string, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      const atual = memoria.linha(id);
      if (!atual) return Promise.resolve(FALHOU);
      // Vira linha comum da Fatura: sem Responsável ou sem Tipo, entra na fila do Revisar.
      const semClassificacao = atual.fatura_id != null && (atual.responsavel_id === null || atual.tipo_id === null);
      return gravar([id], {
        ajuste_de_id: null,
        ...(semClassificacao ? { revisao_motivo: "sem_classificacao" as const, revisao_dados: null, revisado_em: null } : {}),
        editado_em: agora.toISOString(),
      });
    },

    /**
     * "Desfazer" do "Desvincular": religa o Ajuste à mãe e copia o Tipo e o
     * Responsável atuais dela, numa gravação só. Ajuste de novo: sai da fila
     * do Revisar (o `desvincular` pode ter posto a linha lá).
     */
    religar(id: string, mae: MaeDoAjuste, agora: Date = new Date()): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return Promise.resolve(bloqueio);
      const corpo = {
        ajuste_de_id: mae.id,
        tipo_id: mae.tipo_id,
        responsavel_id: mae.responsavel_id,
        revisao_motivo: null,
        revisao_dados: null,
        editado_em: agora.toISOString(),
      };
      // Fora da memória (o Mês mudou depois de desvincular): sem otimismo, como `restaurar`.
      return memoria.linha(id) ? gravar([id], corpo) : gravarSemMemoria([id], corpo);
    },

    /**
     * "Desfazer" do Confirmar e do "Mudar" da fila (História 3.2): devolve a
     * classificação, o motivo, a sugestão e o `revisado_em` anteriores à mãe
     * e a classificação e o `revisado_em` aos Ajustes `junto` (eles nunca têm
     * motivo). A linha já saiu da memória da fila: grava sem otimismo e a
     * resposta a devolve à fila. A Regra aprendida não é desfeita (a contagem
     * só soma).
     */
    async devolverAFila(
      id: string,
      anterior: AnteriorDaFila,
      opcoes: Pick<OpcoesGravacao, "junto"> = {},
    ): Promise<ResultadoLancamento> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const classificacao = {
        responsavel_id: anterior.responsavel_id,
        tipo_id: anterior.tipo_id,
        revisado_em: anterior.revisado_em,
      };
      const gravarAlvos = (alvos: readonly string[], corpo: Partial<LinhaLancamento>) =>
        alvos.every((i) => memoria.linha(i)) ? gravar(alvos, corpo) : gravarSemMemoria(alvos, corpo);
      const ajustes = todos(id, opcoes.junto).filter((i) => i !== id);
      if (ajustes.length > 0) {
        // Os Ajustes primeiro: a mãe volta à fila já com eles no lugar.
        const r = await gravarAlvos(ajustes, classificacao);
        if (!r.ok) return r;
      }
      return gravarAlvos([id], {
        ...classificacao,
        revisao_motivo: anterior.revisao_motivo,
        revisao_dados: anterior.revisao_dados,
      });
    },
  };
}

export type RepoLancamentos = ReturnType<typeof criarRepoLancamentos>;

let repo: RepoLancamentos | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoLancamentos(): RepoLancamentos {
  repo ??= criarRepoLancamentos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("lancamentos"),
    aprender: (evento) => repoRegras().aprender(evento),
  });
  return repo;
}

let repoRevisar: RepoLancamentos | null = null;

/**
 * O repositório da tela Revisar (História 3.2): a segunda instância, ligada
 * ao gerenciador da fila (que guarda os itens de todos os Meses, não só o Mês
 * aberto). Grava as mesmas colunas e ensina a Regra do mesmo jeito.
 */
export function repoLancamentosRevisar(): RepoLancamentos {
  repoRevisar ??= criarRepoLancamentos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciadorFila(),
    aprender: (evento) => repoRegras().aprender(evento),
  });
  return repoRevisar;
}
