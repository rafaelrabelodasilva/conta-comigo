// Repositório do Ciclo do cartão (AD-3, AD-9). `config_ciclo` é só de
// inserção: mudar o Ciclo insere uma linha nova (o banco recusa update e
// delete). O `vigente_desde` vem do núcleo (`planejarMudancaCiclo`), chamado
// pela tela; aqui só se insere e se aplica a linha devolvida no gerenciador.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

export type LinhaConfigCiclo = LinhaDe<"config_ciclo">;

export type NovaConfigCiclo = Pick<LinhaConfigCiclo, "dia_fechamento" | "dia_vencimento" | "vigente_desde">;

/** `codigo` vem do mapa de mensagens: `ciclo.vigente_no_passado` do gatilho ou `salvar.falhou`. */
export type ResultadoInsercaoCiclo = { ok: true } | { ok: false; codigo: string };

const FALHOU: ResultadoInsercaoCiclo = { ok: false, codigo: "salvar.falhou" };

function codigoDoErro(erro: { message?: string }): string {
  return erro.message === "ciclo.vigente_no_passado" ? erro.message : "salvar.falhou";
}

export function criarRepoCiclo(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memoria: Gerenciador<LinhaConfigCiclo>;
}) {
  const { obterCliente, memoria } = deps;

  return {
    /** Insere (sem otimismo: id e `created_at` vêm do banco) e aplica a linha devolvida. */
    async inserir(nova: NovaConfigCiclo): Promise<ResultadoInsercaoCiclo> {
      const cliente = obterCliente();
      if (!cliente) return FALHOU;
      try {
        const { data, error } = await cliente
          .from("config_ciclo")
          .insert({
            dia_fechamento: nova.dia_fechamento,
            dia_vencimento: nova.dia_vencimento,
            vigente_desde: nova.vigente_desde,
          })
          .select()
          .single();
        if (error) return { ok: false, codigo: codigoDoErro(error) };
        if (!data) return FALHOU;
        memoria.aplicarLote([data]);
        return { ok: true };
      } catch {
        return FALHOU;
      }
    },
  };
}

export type RepoCiclo = ReturnType<typeof criarRepoCiclo>;

let repo: RepoCiclo | null = null;

/** O repositório do navegador, ligado ao gerenciador único da tabela. */
export function repoCiclo(): RepoCiclo {
  repo ??= criarRepoCiclo({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memoria: gerenciador("config_ciclo"),
  });
  return repo;
}
