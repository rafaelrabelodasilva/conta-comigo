// Repositório de Contas manuais (Histórias 5.1 e 5.4, AD-3, AD-15, AD-16). Única
// porta de gravação de `contas_manuais`: as RPCs gravam numa transação, só com o
// que o núcleo calculou.
//
// - 5.1 `salvar`: `salvar_conta_manual` cria a Conta, a Série e as parcelas
//   (`pedidoSalvarConta`).
// - 5.4 `alterar` e `encerrar`: leem os Lançamentos da Conta do Mês atual em
//   diante (e os Status que contam como pago), pedem ao núcleo o plano
//   (`planoDeAlterarConta` / `planoDeEncerrarConta`: o que excluir, o que criar e
//   o que fica como está) e gravam pela RPC `alterar_conta_manual`, que chama o
//   mesmo materializador (AD-15). `excluir` e `restaurar` (o "Desfazer") usam
//   `excluir_conta_manual` e `restaurar_conta_manual` (exclusão lógica, AD-16: o
//   Desfazer devolve os MESMOS ids). Nenhuma regra mora aqui: sem `editado_em`,
//   Status ou Mês nas contas deste arquivo.
// - As linhas devolvidas vão para o gerenciador de Lançamentos (que só guarda as
//   do Mês aberto; os outros Meses chegam quando são abertos, e o Realtime avisa
//   os outros aparelhos) e a Conta para o de `contas_manuais` (que guarda só as
//   vivas: a excluída sai da lista, e o Desfazer a traz de volta). O evento do
//   Realtime que chega depois não duplica nada (mesmo `id`, `updated_at` não mais
//   novo).
// - Sem conexão, nada começa (AD-3): `conexao.gravar_sem_conexao`, sem ler nem gravar.
// - A leitura dos Lançamentos da Conta é paginada (o PostgREST corta em 1000
//   linhas): uma Conta parcelada com Divisão pode passar disso.
// - A `ocorrencia` da Série (duas Contas idênticas) é lida aqui e escolhida pelo
//   núcleo (`proximaOcorrencia`); se outra Conta igual for salva ou alterada no
//   meio, a RPC devolve `conta.serie_ocupada` e a leitura roda de novo, uma vez.
// - Reenviar a mesma Conta (mesmo `id`) é seguro: a RPC não duplica nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parcelasPuladas,
  planoDeAlterarConta,
  planoDeEncerrarConta,
  planoDeExcluirConta,
  pedidoRestaurarConta,
  type CodigoDoPlano,
  type ContaSalva,
  type LancamentoDaConta,
  type LinhaExcluidaDaConta,
  type PedidoRestaurarConta,
  type ResumoDoPlano,
  type SerieParaAlterar,
} from "@/domain/alterar-conta";
import {
  horizonteDasContas,
  pedidoSalvarConta,
  proximaOcorrencia,
  type ChaveDaSerieDaConta,
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
export type CodigoFalhaConta =
  | CodigoFalhaGravacao
  | CodigoDoPlano
  | "conta.serie_ocupada"
  | "conta.nao_encontrada"
  | "conta.mudou"
  | "auth.sessao_expirou";

export type ResultadoSalvarConta =
  | { ok: true; conta: LinhaConta; criados: number }
  | { ok: false; codigo: CodigoFalhaConta };

/** Editar ou Encerrar: a Conta como ficou e o resumo do plano (o que saiu, o que entrou, o que ficou). */
export type ResultadoAlterarConta =
  | { ok: true; conta: LinhaConta; resumo: ResumoDoPlano }
  | { ok: false; codigo: CodigoFalhaConta };

/** Excluir: a Conta excluída e o pedido que o "Desfazer" manda (os mesmos ids). */
export type ResultadoExcluirConta =
  | { ok: true; conta: LinhaConta; resumo: ResumoDoPlano; desfazer: PedidoRestaurarConta }
  | { ok: false; codigo: CodigoFalhaConta };

export type ResultadoRestaurarConta =
  | { ok: true; conta: LinhaConta; restauradas: number }
  | { ok: false; codigo: CodigoFalhaConta };

/** O que a tela precisa para mostrar o aviso antes de gravar. */
export type LeituraDaConta = {
  existentes: LancamentoDaConta[];
  statusQueContam: ReadonlySet<string>;
  /** Os ids dos Lançamentos lidos que têm item de Pagamento não excluído (AD-15, História 6.1): nunca são recriados. */
  comPagamento: ReadonlySet<string>;
  /** Os `parcela_n` que Rafael pulou (excluiu à mão): o plano não os recria (Defeito 1). */
  puladas: ReadonlySet<number>;
  serie: SerieParaAlterar;
};

export type ResultadoLerConta = ({ ok: true } & LeituraDaConta) | { ok: false; codigo: CodigoFalhaConta };

const CODIGOS_DA_RPC = ["conta.serie_ocupada", "conta.nao_encontrada", "conta.mudou", "auth.sessao_expirou"] as const;

function codigoDoErro(erro: { message?: string } | null | undefined): CodigoFalhaConta {
  const texto = erro?.message ?? "";
  return CODIGOS_DA_RPC.find((c) => texto.includes(c)) ?? "salvar.falhou";
}

const POR_PAGINA = 1000;
/** Quantos ids vão numa requisição `in (…)`. */
const POR_BLOCO_DE_IDS = 100;
const COLUNAS_DO_LANCAMENTO = "id, dividido_de_id, mes, parcela_n, status_id, editado_em, excluido_em, updated_at";
const COLUNAS_DA_SERIE = "nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia";

/** O que a RPC devolve: a Conta e as linhas que mudaram (mães e filhas). */
type RespostaDaConta = { conta?: LinhaConta; lancamentos?: LinhaLancamento[] };

export function criarRepoContas(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoriaLancamentos: Gerenciador<LinhaLancamento>;
  /** A memória das Contas (a lista da tela Contas lê dela). */
  memoriaContas: Gerenciador<LinhaConta>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoriaLancamentos, memoriaContas, online = estaOnline } = deps;

  /** As Séries com a chave do AD-8 (as `ocorrencia` já usadas e a de cada Conta). */
  async function lerSeriesDaChave(
    cliente: SupabaseClient<Database>,
    chave: Pick<ChaveDaSerieDaConta, "nome_normalizado" | "parcela_total" | "valor_parcela_centavos" | "mes_primeira_parcela">,
  ): Promise<{ ocorrencia: number; conta_manual_id: string | null }[] | null> {
    let consulta = cliente
      .from("series")
      .select("ocorrencia, conta_manual_id")
      .eq("nome_normalizado", chave.nome_normalizado)
      .eq("valor_parcela_centavos", chave.valor_parcela_centavos)
      .eq("mes_primeira_parcela", chave.mes_primeira_parcela);
    consulta = chave.parcela_total === null ? consulta.is("parcela_total", null) : consulta.eq("parcela_total", chave.parcela_total);
    const { data, error } = await consulta;
    return error || !data ? null : data;
  }

  /** As `ocorrencia` já usadas pela mesma chave (de qualquer Série) e a da própria Conta, se ela já tem Série. */
  async function lerOcorrencias(
    cliente: SupabaseClient<Database>,
    conta: NovaConta,
  ): Promise<{ usadas: number[]; propria: number | null } | null> {
    const series = await lerSeriesDaChave(cliente, {
      nome_normalizado: conta.nome_normalizado,
      parcela_total: conta.parcela_total,
      valor_parcela_centavos: conta.valor_centavos,
      mes_primeira_parcela: conta.mes_inicial,
    });
    if (!series) return null;
    const propria = series.find((s) => s.conta_manual_id === conta.id);
    return { usadas: series.map((s) => s.ocorrencia), propria: propria ? propria.ocorrencia : null };
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
    const resposta = data as RespostaDaConta | null;
    if (!resposta || !resposta.conta || !Array.isArray(resposta.lancamentos)) return FALHOU;
    memoriaLancamentos.aplicarLote(resposta.lancamentos);
    memoriaContas.aplicarLote([resposta.conta]);
    return {
      ok: true,
      conta: resposta.conta,
      // As filhas de uma Divisão não são "lançamentos" a mais para quem lê: só as mães contam.
      criados: resposta.lancamentos.filter((l) => l.dividido_de_id === null).length,
    };
  }

  // -------------------------------------------------- leitura para o plano (5.4)

  /** Os Lançamentos vivos da Conta do Mês atual em diante (mães e filhas), página por página. */
  async function lerLancamentosDaConta(
    cliente: SupabaseClient<Database>,
    contaId: string,
    mesAtual: string,
  ): Promise<LancamentoDaConta[] | null> {
    const todos: LancamentoDaConta[] = [];
    for (let de = 0; ; de += POR_PAGINA) {
      const { data, error } = await cliente
        .from("lancamentos")
        .select(COLUNAS_DO_LANCAMENTO)
        .eq("conta_manual_id", contaId)
        .gte("mes", mesAtual)
        .is("excluido_em", null)
        .order("mes")
        .order("id")
        .range(de, de + POR_PAGINA - 1);
      if (error || !data) return null;
      todos.push(...data);
      if (data.length < POR_PAGINA) return todos;
    }
  }

  /**
   * Os `parcela_n` pulados da Conta (excluídos à mão do Mês atual em diante, Defeito 1).
   * Leitura tolerante: se ela falha (por exemplo, o banco ainda sem a coluna
   * `excluido_pela_conta`, entre o merge e o `db push`), a prévia só não os desconta; quem
   * decide ao gravar é `materializar_contas_manuais`, que já os pula.
   */
  async function lerPuladas(
    cliente: SupabaseClient<Database>,
    contaId: string,
    mesAtual: string,
    vivas: readonly LancamentoDaConta[],
  ): Promise<Set<number>> {
    const excluidas: LinhaExcluidaDaConta[] = [];
    for (let de = 0; ; de += POR_PAGINA) {
      const { data, error } = await cliente
        .from("lancamentos")
        .select("parcela_n, dividido_de_id, excluido_pela_conta")
        .eq("conta_manual_id", contaId)
        .gte("mes", mesAtual)
        .not("excluido_em", "is", null)
        .is("dividido_de_id", null)
        .order("mes")
        .order("id")
        .range(de, de + POR_PAGINA - 1);
      if (error || !data) return new Set();
      excluidas.push(...data);
      if (data.length < POR_PAGINA) break;
    }
    return parcelasPuladas(excluidas, vivas);
  }

  /** Dos ids dados, os que têm item de Pagamento não excluído (em blocos: o endereço da requisição tem limite). */
  async function lerIdsComPagamento(cliente: SupabaseClient<Database>, ids: readonly string[]): Promise<Set<string> | null> {
    const com = new Set<string>();
    for (let de = 0; de < ids.length; de += POR_BLOCO_DE_IDS) {
      const { data, error } = await cliente
        .from("pagamento_itens")
        .select("lancamento_id")
        .in("lancamento_id", ids.slice(de, de + POR_BLOCO_DE_IDS))
        .is("excluido_em", null)
        .limit(POR_PAGINA);
      if (error || !data) return null;
      for (const i of data) com.add(i.lancamento_id);
    }
    return com;
  }

  /** Os ids dos Status que contam como pago (arquivados também: arquivar não apaga das somas, AD-16). */
  async function lerStatusQueContam(cliente: SupabaseClient<Database>): Promise<Set<string> | null> {
    const { data, error } = await cliente.from("status").select("id").eq("conta_como_pago", true);
    return error || !data ? null : new Set(data.map((s) => s.id));
  }

  /** A Série da Conta e as `ocorrencia` das OUTRAS Séries que têm a chave `nova` (ou a atual, se `nova` é nula). */
  async function lerSerie(
    cliente: SupabaseClient<Database>,
    contaId: string,
    nova: Pick<NovaConta, "nome_normalizado" | "parcela_total" | "valor_centavos" | "mes_inicial"> | null,
  ): Promise<SerieParaAlterar | null> {
    const { data, error } = await cliente.from("series").select(COLUNAS_DA_SERIE).eq("conta_manual_id", contaId);
    if (error || !data || data.length !== 1) return null;
    const atual: ChaveDaSerieDaConta = data[0];
    if (nova === null) return { atual, ocorrenciasDeOutras: [] };
    const doNovo = await lerSeriesDaChave(cliente, {
      nome_normalizado: nova.nome_normalizado,
      parcela_total: nova.parcela_total,
      valor_parcela_centavos: nova.valor_centavos,
      mes_primeira_parcela: nova.mes_inicial,
    });
    if (!doNovo) return null;
    return { atual, ocorrenciasDeOutras: doNovo.filter((s) => s.conta_manual_id !== contaId).map((s) => s.ocorrencia) };
  }

  async function ler(
    cliente: SupabaseClient<Database>,
    conta: ContaSalva,
    mesAtual: string,
    nova: NovaConta | null,
  ): Promise<ResultadoLerConta> {
    const [existentes, statusQueContam, serie] = await Promise.all([
      lerLancamentosDaConta(cliente, conta.id, mesAtual),
      lerStatusQueContam(cliente),
      lerSerie(cliente, conta.id, nova),
    ]);
    if (!existentes || !statusQueContam || !serie) return FALHOU;
    const comPagamento = await lerIdsComPagamento(cliente, existentes.map((l) => l.id));
    if (!comPagamento) return FALHOU;
    const puladas = await lerPuladas(cliente, conta.id, mesAtual, existentes);
    return { ok: true, existentes, statusQueContam, comPagamento, puladas, serie };
  }

  /** Chama a RPC de uma alteração e aplica a resposta nos gerenciadores. */
  async function gravar(
    cliente: SupabaseClient<Database>,
    nome: "alterar_conta_manual" | "excluir_conta_manual" | "restaurar_conta_manual",
    pedido: unknown,
  ): Promise<{ ok: true; conta: LinhaConta; linhas: LinhaLancamento[] } | { ok: false; codigo: CodigoFalhaConta }> {
    const { data, error } = await cliente.rpc(nome, { p_pedido: pedido as Json });
    if (error) return { ok: false, codigo: codigoDoErro(error) };
    const resposta = data as RespostaDaConta | null;
    if (!resposta || !resposta.conta || !Array.isArray(resposta.lancamentos)) return FALHOU;
    memoriaLancamentos.aplicarLote(resposta.lancamentos);
    memoriaContas.aplicarLote([resposta.conta]);
    return { ok: true, conta: resposta.conta, linhas: resposta.lancamentos };
  }

  /** Lê, planeja e grava Editar ou Encerrar; se outra Conta ocupou a chave da Série no meio, lê de novo uma vez. */
  async function alterarOuEncerrar(
    conta: ContaSalva,
    mesAtual: string,
    planejar: (leitura: LeituraDaConta) => ReturnType<typeof planoDeAlterarConta>,
    nova: NovaConta | null,
  ): Promise<ResultadoAlterarConta> {
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    const uma = async (): Promise<ResultadoAlterarConta> => {
      const lido = await ler(cliente, conta, mesAtual, nova);
      if (!lido.ok) return lido;
      const plano = planejar(lido);
      if (!plano.ok) return { ok: false, codigo: plano.codigo };
      const r = await gravar(cliente, "alterar_conta_manual", plano.pedido);
      return r.ok ? { ok: true, conta: r.conta, resumo: plano.resumo } : r;
    };
    try {
      const primeira = await uma();
      if (primeira.ok || primeira.codigo !== "conta.serie_ocupada") return primeira;
      return await uma();
    } catch {
      return FALHOU;
    }
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

    /**
     * O que a tela mostra antes de gravar ("Ficam como estão", a prévia do
     * Encerrar e do Excluir): os Lançamentos da Conta do Mês atual em diante, os
     * Status que contam como pago e a Série. Não grava nada.
     */
    async ler(conta: ContaSalva, mesAtual: string): Promise<ResultadoLerConta> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        return await ler(cliente, conta, mesAtual, null);
      } catch {
        return FALHOU;
      }
    },

    /**
     * Editar (FR-18): `nova` é a Conta do formulário (mesmo `id` e mesmo "Começa
     * em"). Recria só os Lançamentos do Mês atual em diante que ainda podem ser
     * recriados; os outros ficam e vêm em `resumo.mantidas`.
     */
    alterar(conta: ContaSalva, nova: NovaConta, mesAtual: string): Promise<ResultadoAlterarConta> {
      return alterarOuEncerrar(
        conta,
        mesAtual,
        (l) =>
          planoDeAlterarConta(conta, nova, l.serie, {
            mesAtual,
            statusQueContam: l.statusQueContam,
            existentes: l.existentes,
            comPagamento: l.comPagamento,
            puladas: l.puladas,
          }),
        nova,
      );
    },

    /**
     * Encerrar (FR-18): a Conta vale até o Mês anterior a `mes`; os Lançamentos
     * de `mes` em diante que ainda podem ser recriados saem (exclusão lógica).
     */
    encerrar(conta: ContaSalva, mes: string, mesAtual: string): Promise<ResultadoAlterarConta> {
      return alterarOuEncerrar(
        conta,
        mesAtual,
        (l) =>
          planoDeEncerrarConta(conta, l.serie, mes, {
            mesAtual,
            statusQueContam: l.statusQueContam,
            existentes: l.existentes,
            comPagamento: l.comPagamento,
            puladas: l.puladas,
          }),
        null,
      );
    },

    /**
     * Excluir (FR-18, AD-16): a Conta sai em lógico e, com `comLancamentos`, os
     * Lançamentos dos Meses seguintes que ainda podem sair. `desfazer` é o pedido
     * de `restaurar`: os mesmos ids voltam.
     */
    async excluir(conta: ContaSalva, comLancamentos: boolean, mesAtual: string): Promise<ResultadoExcluirConta> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        let existentes: LancamentoDaConta[] = [];
        let statusQueContam: ReadonlySet<string> = new Set();
        let comPagamento: ReadonlySet<string> = new Set();
        if (comLancamentos) {
          const lido = await ler(cliente, conta, mesAtual, null);
          if (!lido.ok) return lido;
          existentes = lido.existentes;
          statusQueContam = lido.statusQueContam;
          comPagamento = lido.comPagamento;
        }
        const plano = planoDeExcluirConta(conta, comLancamentos, { mesAtual, statusQueContam, existentes, comPagamento });
        const r = await gravar(cliente, "excluir_conta_manual", plano.pedido);
        if (!r.ok) return r;
        return {
          ok: true,
          conta: r.conta,
          resumo: plano.resumo,
          desfazer: pedidoRestaurarConta(conta.id, r.linhas.map((l) => l.id)),
        };
      } catch {
        return FALHOU;
      }
    },

    /** O "Desfazer" do Excluir: `excluido_em` volta a nulo na Conta e nas linhas do pedido (os mesmos ids). */
    async restaurar(pedido: PedidoRestaurarConta): Promise<ResultadoRestaurarConta> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const r = await gravar(cliente, "restaurar_conta_manual", pedido);
        return r.ok ? { ok: true, conta: r.conta, restauradas: r.linhas.length } : r;
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
    memoriaContas: gerenciador("contas_manuais"),
  });
  return repo;
}
