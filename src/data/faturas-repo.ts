// Repositório da Fatura (Histórias 2.3 e 2.5, AD-3/4/7). Única porta de
// gravação de `faturas` e `fatura_cartoes`, e da importação dos
// `lancamentos` (a edição, a inclusão e a exclusão de um Lançamento são do
// `lancamentos-repo.ts`, História 2.7).
//
// - Importação: chama a RPC atômica `importar_fatura` com o que o núcleo
//   preparou (`prepararImportacao`) e o `updated_at` mais novo dos
//   Lançamentos do Mês importado, e aplica as linhas devolvidas nos três
//   gerenciadores de Realtime, sem esperar os eventos. O `updated_at` vem
//   da memória quando o Mês importado é o Mês aberto e já carregou; senão,
//   de uma leitura do banco só daquele Mês (a memória guarda só o Mês
//   aberto).
// - Reimportação (História 3.12): `lerReimportacao` lê do banco a Fatura do
//   Mês, as linhas dela (mães e Ajustes, inclusive excluídas) com a Série, as
//   outras linhas do Mês que ocupam uma parcela de Série, a contagem do
//   histórico da planilha e o `updated_at` mais novo do Mês; o núcleo
//   (`reimportacao.ts`) casa as linhas novas com essas antigas e decide o
//   destino das sem par. `importar(…, substituir)` manda o id da Fatura
//   confirmada, esse `updated_at` (o lido com o aviso, não o da hora do toque)
//   e o plano (`dados_reimportacao`); a RPC mantém a Fatura no mesmo lugar e
//   devolve os ids apagados, que saem da memória antes de as linhas novas
//   entrarem. As linhas que saíram da Fatura voltam em `previstos`.
// - Séries e previstos (História 3.5): `importar` manda também os previstos
//   que o núcleo calculou (`dados_previstos`). A RPC devolve os previstos
//   criados ou religados e os ids dos previstos apagados na reimportação; só
//   os do Mês aberto entram na memória (as outras linhas chegam quando o Mês
//   for aberto). `lerReimportacao` conta no banco os previstos que a
//   reimportação apagaria (`sistema`, sem edição, não excluídos).
// - Casamento (História 3.6): `lerPrevistosDoMes` lê do banco, de uma vez, os
//   previstos do Mês importado (`sistema`, não excluídos, sem Fatura) com a
//   `ocorrencia` da Série e o `updated_at` mais novo do Mês; o núcleo
//   (`casarPrevistos`) calcula o casamento com eles e `importar` manda esse
//   mesmo `updated_at` como trava (se um previsto mudou em outro aparelho, a
//   RPC recusa com `fatura.mes_mudou`). A RPC devolve os casados em
//   `lancamentos` e os previstos sem par em `previstos`; só os do Mês aberto
//   entram na memória.
// - Herança (História 3.7): `lerParcelasDoMesAnterior` lê do banco as parcelas
//   do Mês anterior ao importado (a memória guarda só o Mês aberto) e, para as
//   que têm Série, se a Série já tem a parcela seguinte fora da Fatura do Mês.
//   Não entra na trava da RPC: a herança copia o que havia na leitura.
// - "Dispensar" o alerta da Conferência (e o "Desfazer"): grava só
//   `faturas.alerta_dispensado_em`, com otimismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { somarMeses } from "@/domain/ciclo";
import { lerDivisao } from "@/domain/divisao";
import type { CandidataParaHerdar } from "@/domain/heranca";
import type { Importacao } from "@/domain/importacao-fatura";
import type { ChaveDaSerie, PrevistoParaCasar } from "@/domain/previstos";
import type { AntigaParaReimportar } from "@/domain/reimportacao";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, SEM_CONEXAO, gravarComOtimismo, type Online, type ResultadoGravacao } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { ehMaisNovo } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaFatura = LinhaDe<"faturas">;
export type LinhaFaturaCartao = LinhaDe<"fatura_cartoes">;
export type LinhaLancamento = LinhaDe<"lancamentos">;

/** Códigos que a RPC levanta e a tela mostra como estão. */
const CODIGOS_DA_RPC = new Set([
  "fatura.mes_ja_importado",
  "fatura.mes_mudou",
  "fatura.previstos_sem_casamento",
  "auth.sessao_expirou",
]);

/**
 * `codigo`: `fatura.mes_ja_importado`, `fatura.mes_mudou`,
 * `auth.sessao_expirou` (da RPC), `fatura.conexao_caiu` (a chamada não
 * chegou ao banco ou não voltou; nada foi gravado), `conexao.gravar_sem_conexao`
 * (sem internet, nada tentado) ou `salvar.falhou` (o banco recusou).
 */
export type ResultadoImportacao =
  | { ok: true; quantidade: number }
  | { ok: false; codigo: string };

/** A Fatura que Rafael confirmou substituir e o `updated_at` lido com o aviso. */
export type Substituir = { faturaId: string; atualizadoEm: string | null };

/** O que o plano e o aviso "Importar de novo" precisam, lido do banco. */
export type LeituraReimportacao = Substituir & {
  /** As linhas da Fatura do Mês (mães e Ajustes, inclusive excluídas); manuais e filhas ficam de fora. */
  antigas: AntigaParaReimportar[];
  /** O Status padrão de `configuracoes`, lido junto (null: sem padrão). */
  statusPadraoId: string | null;
  /** Linhas com referência que impede apagar (Pagamento, Épico 6); vazio até lá. */
  referenciadas: string[];
  /** Linhas do Mês que ocupam uma parcela de Série fora da Fatura e não são previstos (ex.: as que saíram numa reimportação antes). */
  outrasDaSerie: PrevistoParaCasar[];
  /** Linhas `historico` (planilha) do Mês, que a reimportação não toca. */
  historico: number;
};

/**
 * `valor` null: o Mês não tem Fatura no banco. `codigo`:
 * `auth.sessao_expirou`, `conexao.gravar_sem_conexao` ou `carregar.falhou`.
 */
export type ResultadoLeituraReimportacao =
  | { ok: true; valor: LeituraReimportacao | null }
  | { ok: false; codigo: string };

/** Os previstos do Mês importado e o `updated_at` mais novo do Mês, lidos juntos. */
export type LeituraDePrevistos = { previstos: PrevistoParaCasar[]; atualizadoEm: string | null };

export type ResultadoLeituraDePrevistos =
  | ({ ok: true } & LeituraDePrevistos)
  | { ok: false; codigo: string };

/** As parcelas n−1 do Mês anterior que podem emprestar a classificação à parcela sem previsto. */
export type LeituraDeCandidatas = { candidatas: CandidataParaHerdar[] };

export type ResultadoLeituraDeCandidatas =
  | ({ ok: true } & LeituraDeCandidatas)
  | { ok: false; codigo: string };

/** `fatura_id` nulo: reimportação (a Fatura fica no mesmo lugar, só as linhas e os cartões saem). */
type Removidos = { fatura_id: string | null; cartoes: string[]; lancamentos: string[]; previstos?: string[] };

type Gravados = {
  fatura: LinhaFatura;
  cartoes: LinhaFaturaCartao[];
  lancamentos: LinhaLancamento[];
  /** Previstos criados ou religados (História 3.5). */
  previstos?: LinhaLancamento[];
  removidos?: Removidos | null;
};

const ehListaDeIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((id) => typeof id === "string");

function ehRemovidos(dados: unknown): boolean {
  if (dados === null || dados === undefined) return true;
  const r = dados as Partial<Record<keyof Removidos, unknown>>;
  return (
    typeof r === "object" &&
    (r.fatura_id === null || typeof r.fatura_id === "string") &&
    ehListaDeIds(r.cartoes) &&
    ehListaDeIds(r.lancamentos) &&
    (r.previstos === undefined || ehListaDeIds(r.previstos))
  );
}

function ehGravados(dados: unknown): dados is Gravados {
  const d = dados as Partial<Record<keyof Gravados, unknown>> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.fatura === "object" &&
    d.fatura !== null &&
    typeof (d.fatura as { id?: unknown }).id === "string" &&
    Array.isArray(d.cartoes) &&
    Array.isArray(d.lancamentos) &&
    (d.previstos === undefined || Array.isArray(d.previstos)) &&
    ehRemovidos(d.removidos)
  );
}

/** Quantos ids vão numa requisição `in (…)` (o endereço da requisição tem limite). */
const POR_BLOCO_DE_IDS = 100;
const COLUNAS_REIMPORTACAO =
  "id, fatura_id, lancado_por, nome_normalizado, valor_centavos, parcela_n, parcela_total, ordem_fatura, ajuste_de_id, excluido_em, responsavel_id, tipo_id, observacao, apelido, status_id, casado_em, editado_em, vencimento_combinado, revisao_motivo, revisao_dados, serie_id, dividido_de_id, divisao, updated_at";

const COLUNAS_CANDIDATAS =
  "id, nome_normalizado, parcela_n, parcela_total, valor_centavos, ordem_fatura, responsavel_id, tipo_id, apelido, observacao, divisao, serie_id, excluido_em, dividido_de_id, ajuste_de_id";

const COLUNAS_DO_MES =
  "id, fatura_id, excluido_em, lancado_por, nome_normalizado, parcela_n, parcela_total, valor_centavos, responsavel_id, tipo_id, serie_id, divisao, dividido_de_id, updated_at";

/** O `updated_at` mais novo dos Lançamentos do Mês entre as linhas dadas (null se nenhum). */
export function ultimaAlteracaoDoMes(linhas: readonly LinhaLancamento[], mes: string): string | null {
  let ultima: string | null = null;
  for (const l of linhas) {
    if (l.mes !== mes) continue;
    if (ultima === null || ehMaisNovo(l.updated_at, ultima)) ultima = l.updated_at;
  }
  return ultima;
}

/** Erro que é do banco (veio com código do PostgREST/Postgres) e não da rede. */
function codigoDoErro(erro: { message?: string; code?: string } | null | undefined): string {
  const texto = erro?.message ?? "";
  if (CODIGOS_DA_RPC.has(texto)) return texto;
  // JWT expirado recusado pelo PostgREST.
  if (erro?.code === "PGRST301" || /JWT expired/i.test(texto)) return "auth.sessao_expirou";
  // Sem código, o supabase-js não chegou ao banco (fetch falhou).
  if (!erro?.code) return "fatura.conexao_caiu";
  return FALHOU.codigo;
}

export function criarRepoFaturas(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  faturas: Gerenciador<LinhaFatura>;
  cartoes: Gerenciador<LinhaFaturaCartao>;
  lancamentos: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, faturas, cartoes, lancamentos, online = estaOnline } = deps;

  /**
   * O `updated_at` mais novo dos Lançamentos do Mês (inclusive excluídos,
   * como a RPC compara): da memória, se o Mês está aberto e carregado;
   * senão, do banco.
   */
  async function lerUltimaAlteracao(
    cliente: SupabaseClient<Database>,
    mes: string,
  ): Promise<{ ok: true; valor: string | null } | { ok: false; codigo: string }> {
    if (lancamentos.mesAberto() === mes && lancamentos.retrato().status === "pronto") {
      return { ok: true, valor: ultimaAlteracaoDoMes(lancamentos.linhas(), mes) };
    }
    const { data, error } = await cliente
      .from("lancamentos")
      .select("updated_at")
      .eq("mes", mes)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error || !data) return { ok: false, codigo: codigoDoErro(error) };
    return { ok: true, valor: data[0]?.updated_at ?? null };
  }

  /**
   * Grava só `alerta_dispensado_em` da Fatura, com otimismo (AD-3/AD-4):
   * a faixa some já; se o banco recusar, volta. Sem conexão, nada muda.
   */
  function gravarAlerta(faturaId: string, valor: string | null): Promise<ResultadoGravacao> {
    if (!online()) return Promise.resolve(SEM_CONEXAO);
    if (!faturas.linha(faturaId)) return Promise.resolve(FALHOU);
    const corpo = { alerta_dispensado_em: valor };
    return gravarComOtimismo(
      obterCliente,
      faturas,
      [{ id: faturaId, ...corpo }],
      async (cliente) => {
        const { data, error } = await cliente.from("faturas").update(corpo).eq("id", faturaId).select().single();
        return error || !data ? null : [data];
      },
      online,
    );
  }

  return {
    /**
     * Para o aviso "Importar de novo": a Fatura do Mês, as linhas dela, o
     * `updated_at` mais novo de todos os Lançamentos do Mês (inclusive
     * manuais e excluídos, como a RPC compara) e o Status padrão, tudo do banco.
     */
    async lerReimportacao(mes: string): Promise<ResultadoLeituraReimportacao> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "carregar.falhou" };
      const falhou = (erro: { message?: string; code?: string } | null | undefined) => {
        const codigo = codigoDoErro(erro);
        return { ok: false as const, codigo: codigo === "auth.sessao_expirou" ? codigo : "carregar.falhou" };
      };
      try {
        const [lidaFatura, lidasLinhas, lidaConfig] = await Promise.all([
          cliente.from("faturas").select("id").eq("mes", mes),
          cliente.from("lancamentos").select(COLUNAS_REIMPORTACAO).eq("mes", mes),
          cliente.from("configuracoes").select("status_padrao_id"),
        ]);
        if (lidaFatura.error || !lidaFatura.data) return falhou(lidaFatura.error);
        if (lidasLinhas.error || !lidasLinhas.data) return falhou(lidasLinhas.error);
        if (lidaConfig.error || !lidaConfig.data) return falhou(lidaConfig.error);
        const statusPadraoId = lidaConfig.data[0]?.status_padrao_id ?? null;
        const faturaId = lidaFatura.data[0]?.id;
        if (faturaId === undefined) return { ok: true, valor: null };
        let atualizadoEm: string | null = null;
        for (const l of lidasLinhas.data) {
          if (atualizadoEm === null || ehMaisNovo(l.updated_at, atualizadoEm)) atualizadoEm = l.updated_at;
        }
        const daFatura = lidasLinhas.data.filter((l) => l.fatura_id === faturaId && (l.dividido_de_id ?? null) === null);
        const outras = lidasLinhas.data.filter(
          (l) =>
            l.fatura_id !== faturaId &&
            l.excluido_em === null &&
            (l.dividido_de_id ?? null) === null &&
            l.lancado_por !== "sistema" &&
            l.serie_id !== null &&
            l.parcela_n !== null &&
            l.parcela_total !== null,
        );
        // As antigas com Pagamento (ela ou uma parte dela): não são apagadas, saem da Fatura (AD-7, História 6.1).
        const comItem = new Set<string>();
        const idsDoMes = lidasLinhas.data.map((l) => l.id);
        for (let de = 0; de < idsDoMes.length; de += POR_BLOCO_DE_IDS) {
          const itens = await cliente
            .from("pagamento_itens")
            .select("lancamento_id")
            .in("lancamento_id", idsDoMes.slice(de, de + POR_BLOCO_DE_IDS))
            .is("excluido_em", null)
            .limit(POR_BLOCO_DE_IDS * 10);
          if (itens.error || !itens.data) return falhou(itens.error);
          for (const i of itens.data) comItem.add(i.lancamento_id);
        }
        const referenciadas = daFatura
          .filter((l) => comItem.has(l.id) || lidasLinhas.data.some((f) => f.dividido_de_id === l.id && comItem.has(f.id)))
          .map((l) => l.id);
        // As Séries das linhas da Fatura e das outras que ocupam parcela (uma leitura só).
        const idsDasSeries = [...new Set([...daFatura, ...outras].flatMap((l) => (l.serie_id === null ? [] : [l.serie_id])))];
        const dasSeries = new Map<string, ChaveDaSerie>();
        if (idsDasSeries.length > 0) {
          const series = await cliente
            .from("series")
            .select("id, ocorrencia, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela")
            .in("id", idsDasSeries);
          if (series.error || !series.data) return falhou(series.error);
          for (const sr of series.data) {
            // A Série de uma Conta recorrente não tem total e nunca é de parcela de cartão.
            if (sr.parcela_total === null) continue;
            dasSeries.set(sr.id, {
              nome_normalizado: sr.nome_normalizado,
              parcela_total: sr.parcela_total,
              valor_parcela_centavos: sr.valor_parcela_centavos,
              mes_primeira_parcela: sr.mes_primeira_parcela,
              ocorrencia: sr.ocorrencia,
            });
          }
        }
        const antigas: AntigaParaReimportar[] = daFatura.map((l) => ({
          id: l.id,
          nome_normalizado: l.nome_normalizado,
          valor_centavos: l.valor_centavos,
          parcela_n: l.parcela_n,
          parcela_total: l.parcela_total,
          ordem_fatura: l.ordem_fatura ?? 0,
          ajuste_de_id: l.ajuste_de_id,
          casado_em: l.casado_em,
          excluido_em: l.excluido_em,
          responsavel_id: l.responsavel_id,
          tipo_id: l.tipo_id,
          status_id: l.status_id,
          observacao: l.observacao,
          apelido: l.apelido,
          editado_em: l.editado_em,
          vencimento_combinado: l.vencimento_combinado,
          divisao: lerDivisao(l.divisao),
          revisao_motivo: l.revisao_motivo,
          revisao_dados: l.revisao_dados,
          serie: l.serie_id === null ? null : (dasSeries.get(l.serie_id) ?? null),
        }));
        const outrasDaSerie: PrevistoParaCasar[] = outras.flatMap((l) => {
          const serie = dasSeries.get(l.serie_id as string);
          return serie === undefined
            ? []
            : [
                {
                  id: l.id,
                  nome_normalizado: l.nome_normalizado,
                  parcela_n: l.parcela_n,
                  parcela_total: l.parcela_total,
                  valor_centavos: l.valor_centavos,
                  ocorrencia: serie.ocorrencia,
                  responsavel_id: l.responsavel_id,
                  tipo_id: l.tipo_id,
                  serie,
                },
              ];
        });
        const historico = lidasLinhas.data.filter((l) => l.lancado_por === "historico" && l.excluido_em === null).length;
        return {
          ok: true,
          valor: { faturaId, atualizadoEm, antigas, statusPadraoId, referenciadas, outrasDaSerie, historico },
        };
      } catch {
        return { ok: false, codigo: "carregar.falhou" };
      }
    },

    /**
     * Para o casamento (História 3.6): os previstos do Mês (`sistema`, não
     * excluídos, sem Fatura, com parcela e Série) e o `updated_at` mais novo
     * de todos os Lançamentos do Mês (inclusive excluídos, como a RPC
     * compara), tudo do banco e numa leitura só do Mês.
     */
    async lerPrevistosDoMes(mes: string): Promise<ResultadoLeituraDePrevistos> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "carregar.falhou" };
      try {
        const lidas = await cliente.from("lancamentos").select(COLUNAS_DO_MES).eq("mes", mes);
        if (lidas.error || !lidas.data) return { ok: false, codigo: "carregar.falhou" };
        let atualizadoEm: string | null = null;
        for (const l of lidas.data) {
          if (atualizadoEm === null || ehMaisNovo(l.updated_at, atualizadoEm)) atualizadoEm = l.updated_at;
        }
        const candidatos = lidas.data.filter(
          (l) =>
            l.lancado_por === "sistema" &&
            l.excluido_em === null &&
            l.fatura_id === null &&
            (l.dividido_de_id ?? null) === null &&
            l.serie_id !== null &&
            l.parcela_n !== null &&
            l.parcela_total !== null,
        );
        if (candidatos.length === 0) return { ok: true, previstos: [], atualizadoEm };
        const idsDasSeries = [...new Set(candidatos.map((l) => l.serie_id as string))];
        const series = await cliente
          .from("series")
          .select("id, ocorrencia, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela")
          .in("id", idsDasSeries);
        if (series.error || !series.data) return { ok: false, codigo: "carregar.falhou" };
        const dasSeries = new Map(series.data.map((s) => [s.id, s]));
        const previstos: PrevistoParaCasar[] = candidatos.flatMap((l) => {
          const serie = dasSeries.get(l.serie_id as string);
          if (serie === undefined || serie.parcela_total === null) return [];
          const ocorrencia = serie.ocorrencia;
          return [
            {
              id: l.id,
              nome_normalizado: l.nome_normalizado,
              parcela_n: l.parcela_n as number,
              parcela_total: l.parcela_total as number,
              valor_centavos: l.valor_centavos,
              ocorrencia,
              responsavel_id: l.responsavel_id,
              tipo_id: l.tipo_id,
              divisao: lerDivisao(l.divisao),
              serie: {
                nome_normalizado: serie.nome_normalizado,
                parcela_total: serie.parcela_total,
                valor_parcela_centavos: serie.valor_parcela_centavos,
                mes_primeira_parcela: serie.mes_primeira_parcela,
                ocorrencia,
              },
            },
          ];
        });
        return { ok: true, previstos, atualizadoEm };
      } catch {
        return { ok: false, codigo: "carregar.falhou" };
      }
    },

    /**
     * Para a herança (História 3.7): as linhas-mãe do Mês anterior a `mes`
     * (não excluídas, sem Ajuste, com parcela e Valor positivo), com a chave da
     * Série e se a Série já tem a parcela seguinte numa linha que não é da
     * Fatura do próprio `mes` (a da Fatura substituída cai na reimportação).
     * Do banco, numa leitura só do Mês anterior mais a das Séries.
     */
    async lerParcelasDoMesAnterior(mes: string): Promise<ResultadoLeituraDeCandidatas> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "carregar.falhou" };
      try {
        const lidas = await cliente.from("lancamentos").select(COLUNAS_CANDIDATAS).eq("mes", somarMeses(mes, -1));
        if (lidas.error || !lidas.data) return { ok: false, codigo: "carregar.falhou" };
        const maes = lidas.data.filter(
          (l) =>
            l.excluido_em === null &&
            (l.dividido_de_id ?? null) === null &&
            l.ajuste_de_id === null &&
            l.parcela_n !== null &&
            l.parcela_total !== null &&
            l.valor_centavos > 0,
        );
        if (maes.length === 0) return { ok: true, candidatas: [] };
        const idsDasSeries = [...new Set(maes.flatMap((l) => (l.serie_id === null ? [] : [l.serie_id])))];
        const dasSeries = new Map<string, NonNullable<CandidataParaHerdar["serie"]>>();
        const ocupadas = new Set<string>();
        if (idsDasSeries.length > 0) {
          const [series, daSerie] = await Promise.all([
            cliente
              .from("series")
              .select("id, ocorrencia, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela")
              .in("id", idsDasSeries),
            cliente
              .from("lancamentos")
              .select("serie_id, parcela_n, mes, fatura_id, excluido_em, dividido_de_id")
              .in("serie_id", idsDasSeries),
          ]);
          if (series.error || !series.data || daSerie.error || !daSerie.data) return { ok: false, codigo: "carregar.falhou" };
          for (const sr of series.data) {
            // A Série de uma Conta recorrente não tem total e nunca é de parcela de cartão.
            if (sr.parcela_total === null) continue;
            dasSeries.set(sr.id, {
              nome_normalizado: sr.nome_normalizado,
              parcela_total: sr.parcela_total,
              valor_parcela_centavos: sr.valor_parcela_centavos,
              mes_primeira_parcela: sr.mes_primeira_parcela,
              ocorrencia: sr.ocorrencia,
            });
          }
          for (const x of daSerie.data) {
            if (x.excluido_em !== null || x.dividido_de_id !== null || x.parcela_n === null) continue;
            if (x.mes === mes && x.fatura_id !== null) continue;
            ocupadas.add(JSON.stringify([x.serie_id, x.parcela_n]));
          }
        }
        const candidatas: CandidataParaHerdar[] = maes.map((l) => {
          const serie = l.serie_id === null ? null : (dasSeries.get(l.serie_id) ?? null);
          return {
            id: l.id,
            nome_normalizado: l.nome_normalizado,
            parcela_n: l.parcela_n as number,
            parcela_total: l.parcela_total as number,
            valor_centavos: l.valor_centavos,
            ordem_fatura: l.ordem_fatura,
            responsavel_id: l.responsavel_id,
            tipo_id: l.tipo_id,
            apelido: l.apelido,
            observacao: l.observacao,
            divisao: lerDivisao(l.divisao),
            serie,
            proxima_ocupada: l.serie_id !== null && ocupadas.has(JSON.stringify([l.serie_id, (l.parcela_n as number) + 1])),
          };
        });
        return { ok: true, candidatas };
      } catch {
        return { ok: false, codigo: "carregar.falhou" };
      }
    },

    /** "Dispensar" a faixa de diferença da Fatura: grava o momento (`agora`, padrão o relógio). */
    dispensarAlerta(faturaId: string, agora: Date = new Date()): Promise<ResultadoGravacao> {
      return gravarAlerta(faturaId, agora.toISOString());
    },

    /** "Desfazer" do toast: a faixa volta (`alerta_dispensado_em = null`). */
    desfazerDispensa(faturaId: string): Promise<ResultadoGravacao> {
      return gravarAlerta(faturaId, null);
    },

    /**
     * Grava tudo ou nada pela RPC e aplica as linhas devolvidas na memória.
     * Com `substituir` (reimportação), a RPC apaga a Fatura confirmada e as
     * linhas dela; os ids apagados saem da memória antes.
     */
    async importar(
      importacao: Importacao,
      substituir?: Substituir,
      /** O `updated_at` do Mês lido junto dos previstos do casamento (`lerPrevistosDoMes`); sem ele, lê agora. */
      lidoJuntoDosPrevistos?: string | null,
    ): Promise<ResultadoImportacao> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        let lidoEm: string | null;
        if (substituir) {
          lidoEm = substituir.atualizadoEm;
        } else if (lidoJuntoDosPrevistos !== undefined) {
          lidoEm = lidoJuntoDosPrevistos;
        } else {
          const lida = await lerUltimaAlteracao(cliente, importacao.fatura.mes);
          if (!lida.ok) return { ok: false, codigo: lida.codigo };
          lidoEm = lida.valor;
        }
        const { data, error } = await cliente.rpc("importar_fatura", {
          dados_fatura: importacao.fatura as unknown as Json,
          dados_cartoes: importacao.cartoes as unknown as Json,
          dados_lancamentos: importacao.lancamentos as unknown as Json,
          dados_previstos: importacao.previstos as unknown as Json,
          previstos_sem_par: (importacao.previstos_sem_par ?? []) as unknown as Json,
          ...(substituir && importacao.reimportacao
            ? {
                dados_reimportacao: {
                  apagar: importacao.reimportacao.apagar,
                  sumiram: importacao.reimportacao.sumiram,
                  voltar_a_previsto: importacao.reimportacao.voltar_a_previsto,
                } as unknown as Json,
              }
            : {}),
          ...(lidoEm === null ? {} : { lancamentos_atualizados_em: lidoEm }),
          ...(substituir ? { substituir_fatura_id: substituir.faturaId } : {}),
        });
        if (error) {
          const codigo = codigoDoErro(error);
          // A Fatura já está no banco (ex.: a resposta anterior se perdeu
          // depois do commit): relê para a memória mostrá-la já.
          if (codigo === "fatura.mes_ja_importado") {
            await Promise.all([faturas.recarregar(), cartoes.recarregar(), lancamentos.recarregar()]);
          }
          return { ok: false, codigo };
        }
        if (!ehGravados(data)) return FALHOU;
        if (data.removidos) {
          lancamentos.remover([...data.removidos.lancamentos, ...(data.removidos.previstos ?? [])]);
          cartoes.remover(data.removidos.cartoes);
          if (data.removidos.fatura_id !== null) faturas.remover([data.removidos.fatura_id]);
        }
        faturas.aplicarLote([data.fatura]);
        cartoes.aplicarLote(data.cartoes);
        lancamentos.aplicarLote([...data.lancamentos, ...(data.previstos ?? [])]);
        // As filhas de uma Divisão não são lançamentos a mais: a mãe é que conta.
        return { ok: true, quantidade: data.lancamentos.filter((l) => (l.dividido_de_id ?? null) === null).length };
      } catch {
        return { ok: false, codigo: "fatura.conexao_caiu" };
      }
    },
  };
}

export type RepoFaturas = ReturnType<typeof criarRepoFaturas>;

let repo: RepoFaturas | null = null;

/** O repositório do navegador, ligado aos gerenciadores únicos das tabelas. */
export function repoFaturas(): RepoFaturas {
  repo ??= criarRepoFaturas({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    faturas: gerenciador("faturas"),
    cartoes: gerenciador("fatura_cartoes"),
    lancamentos: gerenciador("lancamentos"),
  });
  return repo;
}
