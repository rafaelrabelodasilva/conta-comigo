// Exclusão de Responsáveis, Tipos e Status (História 1.6). A única forma de
// apagar um desses cadastros é a RPC `substituir_cadastro`, que troca o id
// pelo substituto em todas as referências e apaga o item numa transação.
// Depois do "ok" do banco, o item sai da memória já (sem esperar o DELETE
// do Realtime). A contagem de uso vem da RPC `contar_usos_cadastro`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cadastro } from "@/domain/cadastros";
import { ehCodigoConhecido } from "@/domain/mensagens";
import type { Database } from "./database.types";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import type { LinhaBase } from "./realtime-estado";
import { criarClienteNavegador } from "./supabase/navegador";

/** `codigo` vem do mapa de mensagens: `cadastro.*` da RPC ou `salvar.falhou`. */
export type ResultadoExclusao = { ok: true } | { ok: false; codigo: string };

export type ResultadoContagem = { ok: true; valor: ReadonlyMap<string, number> } | { ok: false };

/** Código da RPC (`raise exception 'cadastro.em_uso'`) ou o genérico. */
function codigoDoErro(erro: { message?: string } | null | undefined): string {
  const texto = erro?.message ?? "";
  return texto.startsWith("cadastro.") && ehCodigoConhecido(texto) ? texto : "salvar.falhou";
}

export function criarRepoCadastros(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  memorias: Record<Cadastro, Gerenciador<LinhaBase>>;
  configuracoes: Gerenciador<LinhaDe<"configuracoes">>;
}) {
  const { obterCliente, memorias, configuracoes } = deps;

  return {
    /** Quantos registros usam cada item do cadastro (itens sem uso: 0 ou ausentes). */
    async contarUsos(cadastro: Cadastro): Promise<ResultadoContagem> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const { data, error } = await cliente.rpc("contar_usos_cadastro", { cadastro });
        if (error || !data) return { ok: false };
        return { ok: true, valor: new Map(data.map((l) => [l.id, Number(l.usos)])) };
      } catch {
        return { ok: false };
      }
    },

    /**
     * Exclui `deId`, trocando as referências por `paraId` (sem substituto,
     * só se não estiver em uso). A tela confere antes com `validarExclusao`.
     */
    async excluir(cadastro: Cadastro, deId: string, paraId: string | null): Promise<ResultadoExclusao> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "salvar.falhou" };
      try {
        const { error } = await cliente.rpc(
          "substituir_cadastro",
          paraId ? { cadastro, de_id: deId, para_id: paraId } : { cadastro, de_id: deId },
        );
        if (error) return { ok: false, codigo: codigoDoErro(error) };
      } catch {
        return { ok: false, codigo: "salvar.falhou" };
      }
      memorias[cadastro].remover([deId]);
      if (cadastro === "status") {
        // O banco já trocou o Status padrão; mostra já, sem esperar o evento
        // (que traz o `updated_at` novo e substitui esta versão).
        const padrao = configuracoes.linhas().filter((c) => c.status_padrao_id === deId);
        if (padrao.length > 0) {
          configuracoes.aplicarOtimista(padrao.map((c) => ({ id: c.id, status_padrao_id: paraId })));
        }
      }
      return { ok: true };
    },
  };
}

export type RepoCadastros = ReturnType<typeof criarRepoCadastros>;

let repo: RepoCadastros | null = null;

/** O repositório do navegador, ligado aos gerenciadores únicos das tabelas. */
export function repoCadastros(): RepoCadastros {
  repo ??= criarRepoCadastros({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    memorias: {
      responsavel: gerenciador("responsaveis"),
      tipo: gerenciador("tipos"),
      status: gerenciador("status"),
    },
    configuracoes: gerenciador("configuracoes"),
  });
  return repo;
}
