// Repositório de Contas manuais (História 5.1, AD-3, AD-15). Única porta de
// gravação de `contas_manuais`: a RPC `salvar_conta_manual` cria a Conta, a
// Série e as parcelas numa transação, só com o que o núcleo calculou
// (`pedidoSalvarConta`). As linhas devolvidas vão para o gerenciador de
// Lançamentos (que só guarda as do Mês aberto; os outros Meses chegam quando
// são abertos, e o Realtime avisa os outros aparelhos).
//
// - Sem conexão, nada começa (AD-3): `conexao.gravar_sem_conexao`.
// - A `ocorrencia` da Série (duas Contas idênticas) é lida aqui e escolhida
//   pelo núcleo (`proximaOcorrencia`); se outra Conta igual for salva no meio,
//   a RPC devolve `conta.serie_ocupada` e a leitura roda de novo, uma vez.
// - Reenviar a mesma Conta (mesmo `id`) é seguro: a RPC não duplica nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  horizonteDasContas,
  pedidoSalvarConta,
  proximaOcorrencia,
  type NovaConta,
} from "@/domain/contas-manuais";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { FALHOU, semConexao, type CodigoFalhaGravacao, type Online } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaConta = LinhaDe<"contas_manuais">;
type LinhaLancamento = LinhaDe<"lancamentos">;

/** Códigos que a RPC devolve (do mapa de mensagens), além dos de gravação. */
export type CodigoFalhaConta = CodigoFalhaGravacao | "conta.serie_ocupada" | "conta.nao_encontrada" | "auth.sessao_expirou";

export type ResultadoSalvarConta =
  | { ok: true; conta: LinhaConta; criados: number }
  | { ok: false; codigo: CodigoFalhaConta };

const CODIGOS_DA_RPC = ["conta.serie_ocupada", "conta.nao_encontrada", "auth.sessao_expirou"] as const;

function codigoDoErro(erro: { message?: string } | null | undefined): CodigoFalhaConta {
  const texto = erro?.message ?? "";
  return CODIGOS_DA_RPC.find((c) => texto.includes(c)) ?? "salvar.falhou";
}

export function criarRepoContas(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoriaLancamentos: Gerenciador<LinhaLancamento>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoriaLancamentos, online = estaOnline } = deps;

  /** As `ocorrencia` já usadas pela mesma chave (de qualquer Série) e a da própria Conta, se ela já tem Série. */
  async function lerOcorrencias(
    cliente: SupabaseClient<Database>,
    conta: NovaConta,
  ): Promise<{ usadas: number[]; propria: number | null } | null> {
    let consulta = cliente
      .from("series")
      .select("ocorrencia, conta_manual_id")
      .eq("nome_normalizado", conta.nome_normalizado)
      .eq("valor_parcela_centavos", conta.valor_centavos)
      .eq("mes_primeira_parcela", conta.mes_inicial);
    consulta = conta.parcela_total === null ? consulta.is("parcela_total", null) : consulta.eq("parcela_total", conta.parcela_total);
    const { data, error } = await consulta;
    if (error || !data) return null;
    const propria = data.find((s) => s.conta_manual_id === conta.id);
    return { usadas: data.map((s) => s.ocorrencia), propria: propria ? propria.ocorrencia : null };
  }

  async function tentar(
    cliente: SupabaseClient<Database>,
    conta: NovaConta,
    ateMes: string,
  ): Promise<ResultadoSalvarConta> {
    const ocorrencias = await lerOcorrencias(cliente, conta);
    if (!ocorrencias) return FALHOU;
    const ocorrencia = ocorrencias.propria ?? proximaOcorrencia(ocorrencias.usadas);
    const pedido = pedidoSalvarConta(conta, ocorrencia, ateMes);
    const { data, error } = await cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: pedido.p_ate_mes,
    });
    if (error) return { ok: false, codigo: codigoDoErro(error) };
    const resposta = data as { conta?: LinhaConta; lancamentos?: LinhaLancamento[] } | null;
    if (!resposta || !resposta.conta || !Array.isArray(resposta.lancamentos)) return FALHOU;
    memoriaLancamentos.aplicarLote(resposta.lancamentos);
    return {
      ok: true,
      conta: resposta.conta,
      // As filhas de uma Divisão não são "lançamentos" a mais para quem lê: só as mães contam.
      criados: resposta.lancamentos.filter((l) => l.dividido_de_id === null).length,
    };
  }

  return {
    /**
     * Salva a Conta e materializa até o Mês atual + 12. `mesAtual` é o Mês de
     * hoje (a tela lê o relógio).
     */
    async salvar(conta: NovaConta, mesAtual: string): Promise<ResultadoSalvarConta> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      const ateMes = horizonteDasContas(mesAtual);
      try {
        const primeira = await tentar(cliente, conta, ateMes);
        if (primeira.ok || primeira.codigo !== "conta.serie_ocupada") return primeira;
        // Outra Conta igual foi salva no meio: lê as `ocorrencia` de novo e tenta mais uma vez.
        return await tentar(cliente, conta, ateMes);
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoContas = ReturnType<typeof criarRepoContas>;

let repo: RepoContas | null = null;

/** O repositório do navegador, ligado ao gerenciador único de Lançamentos. */
export function repoContas(): RepoContas {
  repo ??= criarRepoContas({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoriaLancamentos: gerenciador("lancamentos"),
  });
  return repo;
}
