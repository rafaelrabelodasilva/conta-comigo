// Repositório das inscrições Web Push deste aparelho (História 7.5, FR-55, AD-3). Grava com a sessão do dono
// (o RLS de `push_inscricoes` é por dono) só a inscrição DESTE aparelho: o "Ativar notificações" é um upsert pelo
// `endpoint` (único por aparelho) e o "Desativar neste aparelho" apaga só essa linha. A tabela não está no Realtime
// e nenhuma tela a lista: o estado deste aparelho vem do `PushManager`. O `endpoint` é segredo (quem o tem empurra
// avisos para o aparelho): nunca vai para log, mensagem de erro nem toast.
//
// Sem conexão nada é tentado (`conexao.gravar_sem_conexao`). Antes do `db push` da migração
// `20261202120000_notificacoes_push.sql` a tabela não existe e a gravação responde `salvar.falhou`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InscricaoDePush } from "@/domain/notificacoes";
import { estaOnline } from "./conexao";
import type { Database } from "./database.types";
import { FALHOU, OK, semConexao, type Online, type ResultadoGravacao } from "./gravacao";
import { criarClienteNavegador } from "./supabase/navegador";

export function criarRepoPush(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  /** Há conexão? Padrão: o detector único (`conexao.ts`). */
  online?: Online;
}) {
  const { obterCliente, online = estaOnline } = deps;

  return {
    /** Guarda (ou atualiza) a inscrição deste aparelho, do dono logado. */
    async salvar(inscricao: InscricaoDePush): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { error } = await cliente
          .from("push_inscricoes")
          .upsert(
            { endpoint: inscricao.endpoint, chave_p256dh: inscricao.p256dh, chave_auth: inscricao.auth },
            { onConflict: "endpoint" },
          );
        return error ? FALHOU : OK;
      } catch {
        return FALHOU;
      }
    },

    /** Apaga só a inscrição deste aparelho. Apagar o que já não existe também dá certo. */
    async remover(endpoint: string): Promise<ResultadoGravacao> {
      const bloqueio = semConexao(online);
      if (bloqueio) return bloqueio;
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { error } = await cliente.from("push_inscricoes").delete().eq("endpoint", endpoint);
        return error ? FALHOU : OK;
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoPush = ReturnType<typeof criarRepoPush>;

let repo: RepoPush | null = null;

/** O repositório do navegador. */
export function repoPush(): RepoPush {
  repo ??= criarRepoPush({ obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null });
  return repo;
}
