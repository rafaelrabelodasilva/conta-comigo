import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { criarRepoPush } from "./push-repo";
import type { Database } from "./database.types";

// O repositório das inscrições Web Push deste aparelho (História 7.5): upsert pelo endereço, delete só do endereço
// deste aparelho, sem conexão nada é tentado, e o endereço (segredo) nunca volta em erro.

const INSCRICAO = { endpoint: "https://push.exemplo/segredo-do-endpoint", p256dh: "chave-p", auth: "chave-a" };

function clienteFalso(resposta: { error: unknown } | "lanca" = { error: null }) {
  const upsert = vi.fn(async () => {
    if (resposta === "lanca") throw new Error(`rede caiu em ${INSCRICAO.endpoint}`);
    return resposta;
  });
  const eq = vi.fn(async () => {
    if (resposta === "lanca") throw new Error(`rede caiu em ${INSCRICAO.endpoint}`);
    return resposta;
  });
  const apagar = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ upsert, delete: apagar }));
  return { cliente: { from } as unknown as SupabaseClient<Database>, from, upsert, apagar, eq };
}

describe("criarRepoPush: salvar", () => {
  it("faz upsert de push_inscricoes pelo endereço, só com o endereço e as duas chaves (o dono vem do banco)", async () => {
    const c = clienteFalso();
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => true }).salvar(INSCRICAO);
    expect(r).toEqual({ ok: true });
    expect(c.from).toHaveBeenCalledWith("push_inscricoes");
    expect(c.upsert).toHaveBeenCalledWith(
      { endpoint: INSCRICAO.endpoint, chave_p256dh: "chave-p", chave_auth: "chave-a" },
      { onConflict: "endpoint" },
    );
  });

  it("sem conexão: nada é tentado", async () => {
    const c = clienteFalso();
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => false }).salvar(INSCRICAO);
    expect(r).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(c.from).not.toHaveBeenCalled();
  });

  it.each([
    ["o banco recusa (a tabela ainda não existe, por exemplo)", { error: { code: "PGRST205", message: "sem tabela" } }],
    ["a chamada lança", "lanca" as const],
  ])("%s: salvar.falhou, sem o texto do erro", async (_nome, resposta) => {
    const c = clienteFalso(resposta);
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => true }).salvar(INSCRICAO);
    expect(r).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(JSON.stringify(r)).not.toContain("segredo-do-endpoint");
  });

  it("sem cliente do Supabase (ambiente sem as variáveis): salvar.falhou", async () => {
    const r = await criarRepoPush({ obterCliente: () => null, online: () => true }).salvar(INSCRICAO);
    expect(r).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});

describe("criarRepoPush: remover", () => {
  it("apaga só a inscrição com o endereço deste aparelho", async () => {
    const c = clienteFalso();
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => true }).remover(INSCRICAO.endpoint);
    expect(r).toEqual({ ok: true });
    expect(c.from).toHaveBeenCalledWith("push_inscricoes");
    expect(c.eq).toHaveBeenCalledWith("endpoint", INSCRICAO.endpoint);
    expect(c.eq).toHaveBeenCalledTimes(1);
  });

  it("sem conexão: nada é tentado", async () => {
    const c = clienteFalso();
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => false }).remover(INSCRICAO.endpoint);
    expect(r).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(c.apagar).not.toHaveBeenCalled();
  });

  it.each([
    ["o banco recusa", { error: { message: "falhou" } }],
    ["a chamada lança", "lanca" as const],
  ])("%s: salvar.falhou, sem o texto do erro", async (_nome, resposta) => {
    const c = clienteFalso(resposta);
    const r = await criarRepoPush({ obterCliente: () => c.cliente, online: () => true }).remover(INSCRICAO.endpoint);
    expect(r).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(JSON.stringify(r)).not.toContain("segredo-do-endpoint");
  });
});
