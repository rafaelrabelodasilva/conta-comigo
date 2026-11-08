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
// - "Dispensar" o alerta da Conferência (e o "Desfazer"): grava só
//   `faturas.alerta_dispensado_em`, com otimismo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Importacao } from "@/domain/importacao-fatura";
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
const CODIGOS_DA_RPC = new Set(["fatura.mes_ja_importado", "fatura.mes_mudou", "auth.sessao_expirou"]);

/**
 * `codigo`: `fatura.mes_ja_importado`, `fatura.mes_mudou`,
 * `auth.sessao_expirou` (da RPC), `fatura.conexao_caiu` (a chamada não
 * chegou ao banco ou não voltou; nada foi gravado), `conexao.gravar_sem_conexao`
 * (sem internet, nada tentado) ou `salvar.falhou` (o banco recusou).
 */
export type ResultadoImportacao =
  | { ok: true; quantidade: number }
  | { ok: false; codigo: string };

type Gravados = {
  fatura: LinhaFatura;
  cartoes: LinhaFaturaCartao[];
  lancamentos: LinhaLancamento[];
};

function ehGravados(dados: unknown): dados is Gravados {
  const d = dados as Partial<Record<keyof Gravados, unknown>> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.fatura === "object" &&
    d.fatura !== null &&
    typeof (d.fatura as { id?: unknown }).id === "string" &&
    Array.isArray(d.cartoes) &&
    Array.isArray(d.lancamentos)
  );
}

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
    /** "Dispensar" a faixa de diferença da Fatura: grava o momento (`agora`, padrão o relógio). */
    dispensarAlerta(faturaId: string, agora: Date = new Date()): Promise<ResultadoGravacao> {
      return gravarAlerta(faturaId, agora.toISOString());
    },

    /** "Desfazer" do toast: a faixa volta (`alerta_dispensado_em = null`). */
    desfazerDispensa(faturaId: string): Promise<ResultadoGravacao> {
      return gravarAlerta(faturaId, null);
    },

    /** Grava tudo ou nada pela RPC e aplica as linhas devolvidas na memória. */
    async importar(importacao: Importacao): Promise<ResultadoImportacao> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const lida = await lerUltimaAlteracao(cliente, importacao.fatura.mes);
        if (!lida.ok) return { ok: false, codigo: lida.codigo };
        const lidoEm = lida.valor;
        const { data, error } = await cliente.rpc("importar_fatura", {
          dados_fatura: importacao.fatura as unknown as Json,
          dados_cartoes: importacao.cartoes as unknown as Json,
          dados_lancamentos: importacao.lancamentos as unknown as Json,
          ...(lidoEm === null ? {} : { lancamentos_atualizados_em: lidoEm }),
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
        faturas.aplicarLote([data.fatura]);
        cartoes.aplicarLote(data.cartoes);
        lancamentos.aplicarLote(data.lancamentos);
        return { ok: true, quantidade: data.lancamentos.length };
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
