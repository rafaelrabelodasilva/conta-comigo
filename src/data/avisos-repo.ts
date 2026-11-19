// Repositório dos avisos lidos (História 8.1, FR-55, AD-3, AD-4). `avisos_lidos` guarda a chave do aviso
// (`tipo`, `referencia`, `dia`, a mesma do aviso do sistema) já lida pelo dono, e vale em todos os aparelhos:
// o gerenciador de Realtime (`gerenciador("avisos_lidos")`) a leva ao outro aparelho sozinho.
//
// "Marcar como lido" é um upsert em lote que IGNORA o que já está lido (`onConflict` na chave única, `ignoreDuplicates`):
// marcar um, marcar vários e "Marcar tudo como lido" são o mesmo pedido, de uma linha ou de várias. É otimista (o
// contador e a lista mudam na hora) e desfaz se o banco recusar. Como a linha ainda não existe, o otimismo a
// insere na memória com um `id` que o cliente sorteia e manda no insert; se o banco recusar, tira essas linhas.
//
// Sem conexão nada é tentado (`conexao.gravar_sem_conexao`). Antes do `db push` da migração
// `20261203120000_avisos_lidos.sql` a tabela não existe: a leitura do gerenciador dá erro (a Central trata como
// "nada lido") e marcar responde `salvar.falhou` (o otimismo desfaz).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChaveLida } from "@/domain/avisos";
import { textoDaChaveDeNotificacao } from "@/domain/lembretes";
import { estaOnline } from "./conexao";
import type { Database } from "./database.types";
import { FALHOU, OK, semConexao, type Online, type ResultadoGravacao } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaAvisoLido = LinhaDe<"avisos_lidos">;

/** O que a linha otimista leva de data: a mais antiga possível, para a linha do banco (sempre mais nova) a substituir. */
const INSTANTE_OTIMISTA = "1970-01-01T00:00:00.000Z";

/** As colunas da chave única (`avisos_lidos_chave_key`). */
const CONFLITO = "owner_id,tipo,referencia,dia";

export function criarRepoAvisos(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaAvisoLido>;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
  /** O `id` das linhas novas (o cliente o sorteia para o otimismo e o manda no insert). */
  novoId?: () => string;
}) {
  const { obterCliente, memoria, online = estaOnline, novoId = () => crypto.randomUUID() } = deps;

  /**
   * Marca as chaves como lidas, de uma vez. As que já estão lidas (na memória) ou repetidas na lista são ignoradas;
   * se não sobra nenhuma, não chama o banco.
   */
  async function marcar(chaves: readonly ChaveLida[]): Promise<ResultadoGravacao> {
    const bloqueio = semConexao(online);
    if (bloqueio) return bloqueio;
    const jaLidas = new Set(memoria.linhas().map(textoDaChaveDeNotificacao));
    const novas: LinhaAvisoLido[] = [];
    for (const c of chaves) {
      const texto = textoDaChaveDeNotificacao(c);
      if (jaLidas.has(texto)) continue;
      jaLidas.add(texto);
      novas.push({
        id: novoId(),
        owner_id: "",
        tipo: c.tipo,
        referencia: c.referencia,
        dia: c.dia,
        created_at: INSTANTE_OTIMISTA,
        updated_at: INSTANTE_OTIMISTA,
      });
    }
    if (novas.length === 0) return OK;
    const cliente = obterCliente();
    if (!cliente) return FALHOU;
    const ids = novas.map((l) => l.id);
    memoria.aplicarLote(novas);
    try {
      const { data, error } = await cliente
        .from("avisos_lidos")
        .upsert(
          novas.map(({ id, tipo, referencia, dia }) => ({ id, tipo, referencia, dia })),
          { onConflict: CONFLITO, ignoreDuplicates: true },
        )
        .select();
      if (error || !data) {
        memoria.remover(ids);
        return FALHOU;
      }
      memoria.aplicarLote(data);
      return OK;
    } catch {
      memoria.remover(ids);
      return FALHOU;
    }
  }

  return {
    marcar,
    /** Marca um aviso como lido. */
    marcarUm(chave: ChaveLida): Promise<ResultadoGravacao> {
      return marcar([chave]);
    },
  };
}

export type RepoAvisos = ReturnType<typeof criarRepoAvisos>;

let repo: RepoAvisos | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoAvisos(): RepoAvisos {
  repo ??= criarRepoAvisos({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("avisos_lidos"),
  });
  return repo;
}
