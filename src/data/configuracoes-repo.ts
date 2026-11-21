// Repositório de Configurações (AD-3). Uma linha por dono em
// `configuracoes`; a primeira gravação a cria (upsert em `owner_id`, com os
// padrões do banco nas outras colunas). Manda só as colunas alteradas e
// aplica a resposta no gerenciador de Realtime.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Aparencia } from "@/domain/configuracoes";
import type { TipoDeAvisoComInterruptor } from "@/domain/avisos-preferencias";
import type { TipoDeLembrete } from "@/domain/lembretes";
import { lerModelo, modelosIguais, validarModelo, type ModeloMensagem } from "@/domain/modelo-mensagem";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { estaOnline } from "./conexao";
import {
  FALHOU,
  OK,
  gravarComOtimismo,
  semConexao,
  type Online,
  type ResultadoGravacao,
} from "./gravacao";
import { colunasAlteradas } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaConfiguracoes = LinhaDe<"configuracoes">;

export type { ResultadoGravacao };

/** A linha do dono (o RLS só deixa ver a própria), ou `undefined` se ainda não existe. */
export function configuracoesDoDono(
  linhas: readonly LinhaConfiguracoes[],
): LinhaConfiguracoes | undefined {
  return linhas[0];
}

/** Colunas que a tela pode mudar. */
export type MudancaConfiguracoes = Partial<
  Pick<
    LinhaConfiguracoes,
    | "status_padrao_id"
    | "aparencia"
    | "limite_ajuste_centavos"
    | "tolerancia_atraso_dias"
    | "modelo_mensagem"
    | "primeiro_uso_em"
    | "lembrete_fechamento"
    | "lembrete_atraso"
    | "aviso_conferencia"
    | "aviso_revisar"
  >
>;

export function criarRepoConfiguracoes(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaConfiguracoes>;
  /** Relógio de quem grava a marca do Primeiro uso; nos testes, fixo. */
  agora?: () => Date;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, memoria, agora = () => new Date(), online = estaOnline } = deps;

  /** Upsert em `owner_id` só com as colunas dadas (cria a linha se faltar). */
  async function upsertParcial(
    cliente: SupabaseClient<Database>,
    corpo: MudancaConfiguracoes,
  ): Promise<LinhaConfiguracoes[] | null> {
    const { data, error } = await cliente
      .from("configuracoes")
      .upsert(corpo, { onConflict: "owner_id" })
      .select()
      .single();
    return error || !data ? null : [data];
  }

  /**
   * Grava só as colunas que mudaram. Com a linha em memória, com otimismo
   * (desfeito se o banco recusar); sem ela, cria por upsert e aplica a resposta.
   */
  async function definir(mudanca: MudancaConfiguracoes): Promise<ResultadoGravacao> {
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const atual = configuracoesDoDono(memoria.linhas());
    if (atual) {
      const corpo = colunasAlteradas<MudancaConfiguracoes>(atual, mudanca);
      if (Object.keys(corpo).length === 0) return OK;
      return gravarComOtimismo(
        obterCliente,
        memoria,
        [{ id: atual.id, ...corpo }],
        (cliente) => upsertParcial(cliente, corpo),
        online,
      );
    }
    const corpo = colunasAlteradas<MudancaConfiguracoes>({}, mudanca);
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    try {
      const linhas = await upsertParcial(cliente, corpo);
      if (!linhas) return FALHOU;
      memoria.aplicarLote(linhas);
      return OK;
    } catch {
      return FALHOU;
    }
  }

  return {
    /** Status padrão das linhas novas (`null` = "Nenhum (não pago)"). */
    definirStatusPadrao(statusId: string | null): Promise<ResultadoGravacao> {
      return definir({ status_padrao_id: statusId });
    },

    /** A tela já validou com o núcleo (`APARENCIAS`). */
    definirAparencia(aparencia: Aparencia): Promise<ResultadoGravacao> {
      return definir({ aparencia });
    },

    /**
     * Liga ou desliga um tipo de lembrete (FR-55, 7.4): uma coluna só, otimista como a Aparência (o
     * aviso some ou volta na hora, da Central de Avisos, e o banco desfaz se recusar). Antes de a migração da 7.4 entrar no
     * banco, o upsert responde erro (a coluna não existe) e a tela avisa "Não foi possível salvar".
     */
    definirLembrete(tipo: TipoDeLembrete, ligado: boolean): Promise<ResultadoGravacao> {
      return definir(tipo === "fechamento" ? { lembrete_fechamento: ligado } : { lembrete_atraso: ligado });
    },

    /**
     * Liga ou desliga o aviso da Conferência ou o do Revisar na Central de Avisos (FR-55, 8.3): uma coluna só, otimista como
     * `definirLembrete`. Não são lembretes (não viram notificação do sistema), então têm o método e as colunas deles. Antes de a
     * migração da 8.3 entrar no banco, o upsert responde erro (a coluna não existe) e a tela avisa "Não foi possível salvar".
     */
    definirAviso(tipo: TipoDeAvisoComInterruptor, ligado: boolean): Promise<ResultadoGravacao> {
      return definir(tipo === "conferencia" ? { aviso_conferencia: ligado } : { aviso_revisar: ligado });
    },

    /**
     * Conferência e atraso numa só gravação (um upsert, um desfazer): só as
     * colunas que mudaram. A tela já validou com `validarLimiteAjuste` e
     * `validarToleranciaAtraso` do núcleo.
     */
    definirConferencia(
      valores: Pick<LinhaConfiguracoes, "limite_ajuste_centavos" | "tolerancia_atraso_dias">,
    ): Promise<ResultadoGravacao> {
      return definir({
        limite_ajuste_centavos: valores.limite_ajuste_centavos,
        tolerancia_atraso_dias: valores.tolerancia_atraso_dias,
      });
    },

    /**
     * Grava o modelo da mensagem (FR-23) inteiro, numa coluna jsonb. Valida de
     * novo com o núcleo (nunca grava texto com marcador errado nem modelo sem
     * campos) e guarda o texto normalizado. Modelo igual ao que já está
     * guardado não grava.
     */
    definirModeloMensagem(modelo: ModeloMensagem): Promise<ResultadoGravacao> {
      const validado = validarModelo(modelo);
      if (!validado.ok) return Promise.resolve(FALHOU);
      const atual = configuracoesDoDono(memoria.linhas());
      if (atual && modelosIguais(lerModelo(atual.modelo_mensagem), validado.valor)) {
        return Promise.resolve(OK);
      }
      const { saudacao, frase_total, chave_pix, rodape, campos } = validado.valor;
      return definir({
        modelo_mensagem: { saudacao, frase_total, chave_pix, rodape, campos: { ...campos } },
      });
    },

    /**
     * Marca o Primeiro uso como terminado (concluído ou pulado até o fim):
     * `primeiro_uso_em` = agora, por upsert em `owner_id`. Vale em todos os
     * aparelhos: o Painel deixa de abrir o Primeiro uso sozinho.
     */
    concluirPrimeiroUso(): Promise<ResultadoGravacao> {
      return definir({ primeiro_uso_em: agora().toISOString() });
    },
  };
}

export type RepoConfiguracoes = ReturnType<typeof criarRepoConfiguracoes>;

let repo: RepoConfiguracoes | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoConfiguracoes(): RepoConfiguracoes {
  repo ??= criarRepoConfiguracoes({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("configuracoes"),
  });
  return repo;
}
