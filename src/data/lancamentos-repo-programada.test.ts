import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ItemProgramar } from "@/domain/divida";
import type { Database } from "./database.types";
import { criarRepoLancamentos, type LinhaLancamento } from "./lancamentos-repo";
import type { Gerenciador } from "./realtime";

// Dívida programada (História 6.6): `programarDivida` chama a RPC `programar_divida` com os itens do núcleo,
// aplica as linhas devolvidas nos dois gerenciadores (Mês aberto e todos os Meses) e traduz as recusas.

const itens: ItemProgramar[] = [
  { id: "a", vencimento_combinado: "2027-04-06", vencimento_observacao: "no final", editado_em: "2026-11-16T15:00:00.000Z" },
  { id: "b", vencimento_combinado: "2027-04-06", vencimento_observacao: null, editado_em: "2026-11-16T15:00:00.000Z" },
];
const gravadas = [{ id: "a", vencimento_combinado: "2027-04-06" }, { id: "b", vencimento_combinado: "2027-04-06" }] as unknown as LinhaLancamento[];

function montar(resposta: { data?: unknown; error?: { message: string } | null }, online = true) {
  const rpc = vi.fn(async () => ({ data: resposta.data ?? null, error: resposta.error ?? null }));
  const memoria = { aplicarLote: vi.fn() } as unknown as Gerenciador<LinhaLancamento>;
  const todos = { aplicarLote: vi.fn() } as unknown as Gerenciador<LinhaLancamento>;
  const repo = criarRepoLancamentos({
    obterCliente: () => ({ rpc }) as unknown as SupabaseClient<Database>,
    memoria,
    memoriaTodosOsLancamentos: todos,
    online: () => online,
  });
  return { repo, rpc, memoria, todos };
}

describe("repoLancamentos().programarDivida", () => {
  it("chama a RPC com os itens, aplica as linhas devolvidas no Mês aberto e em todos os Meses", async () => {
    const { repo, rpc, memoria, todos } = montar({ data: gravadas });
    const r = await repo.programarDivida(itens);
    expect(rpc).toHaveBeenCalledWith("programar_divida", { p_itens: itens });
    expect(r).toEqual({ ok: true, linhas: gravadas });
    expect(memoria.aplicarLote).toHaveBeenCalledWith(gravadas);
    expect(todos.aplicarLote).toHaveBeenCalledWith(gravadas);
  });

  it("sem itens não chama o banco", async () => {
    const { repo, rpc } = montar({ data: [] });
    expect(await repo.programarDivida([])).toEqual({ ok: true, linhas: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem conexão: recusa antes de chamar (AD-3)", async () => {
    const { repo, rpc } = montar({ data: gravadas }, false);
    expect(await repo.programarDivida(itens)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["programada.nao_encontrada", "programada.mae_dividida"])("a recusa %s chega como está", async (codigo) => {
    const { repo, memoria, todos } = montar({ error: { message: `${codigo}` } });
    expect(await repo.programarDivida(itens)).toEqual({ ok: false, codigo });
    expect(memoria.aplicarLote).not.toHaveBeenCalled();
    expect(todos.aplicarLote).not.toHaveBeenCalled();
  });

  it("outro erro do banco e resposta que não é lista: 'salvar.falhou', sem mexer na memória", async () => {
    const a = montar({ error: { message: "boom" } });
    expect(await a.repo.programarDivida(itens)).toEqual({ ok: false, codigo: "salvar.falhou" });
    const b = montar({ data: { nao: "lista" } });
    expect(await b.repo.programarDivida(itens)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(a.memoria.aplicarLote).not.toHaveBeenCalled();
    expect(b.memoria.aplicarLote).not.toHaveBeenCalled();
  });

  it("a exceção do cliente vira 'salvar.falhou'", async () => {
    const memoria = { aplicarLote: vi.fn() } as unknown as Gerenciador<LinhaLancamento>;
    const repo = criarRepoLancamentos({
      obterCliente: () => ({ rpc: async () => { throw new Error("rede"); } }) as unknown as SupabaseClient<Database>,
      memoria,
      online: () => true,
    });
    expect(await repo.programarDivida(itens)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});
