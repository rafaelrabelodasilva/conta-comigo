// Repositório da importação da Fatura (História 2.3, AD-3/4/7). Única porta
// de gravação de `faturas`, `fatura_cartoes` e `lancamentos` nesta
// história: chama a RPC atômica `importar_fatura` com o que o núcleo
// preparou (`prepararImportacao`) e o `updated_at` mais novo dos
// Lançamentos do Mês que estão na memória, e aplica as linhas devolvidas
// nos três gerenciadores de Realtime, sem esperar os eventos.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Importacao } from "@/domain/importacao-fatura";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, SEM_CONEXAO, type Online } from "./gravacao";
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

/** O `updated_at` mais novo dos Lançamentos do Mês na memória (null se nenhum). */
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

  return {
    /** Grava tudo ou nada pela RPC e aplica as linhas devolvidas na memória. */
    async importar(importacao: Importacao): Promise<ResultadoImportacao> {
      if (!online()) return SEM_CONEXAO;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      // Sem os Lançamentos carregados, o `updated_at` lido daria "Mês mudou" falso.
      if (lancamentos.retrato().status !== "pronto") return FALHOU;
      const lidoEm = ultimaAlteracaoDoMes(lancamentos.linhas(), importacao.fatura.mes);
      try {
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
