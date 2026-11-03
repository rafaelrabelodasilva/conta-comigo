import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { criarRepoCadastros } from "./cadastros-repo";
import type { LinhaConfiguracoes } from "./configuracoes-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";
import type { LinhaBase } from "./realtime-estado";

// Cliente falso: `rpc` registra a chamada e responde o que o teste mandar;
// cada tabela começa com as linhas dadas.

type Chamada = { funcao: string; args: unknown };
type L = LinhaBase & { nome?: string; status_padrao_id?: string | null };

const T1 = "2026-11-02T12:00:00+00:00";

function montar(
  tabelas: Record<string, L[]>,
  responder: (c: Chamada) => { data: unknown; error: unknown },
) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: tabelas[tabela] ?? [], error: null }),
    }),
    rpc: async (funcao: string, args: unknown) => {
      const c = { funcao, args };
      chamadas.push(c);
      return responder(c);
    },
    channel: () => ({
      on() {
        return this;
      },
      subscribe(cb: (s: string) => void) {
        cb("SUBSCRIBED");
        return this;
      },
    }),
  } as unknown as SupabaseClient<Database>;
  const g = (tabela: string) => criarGerenciador<L>({ tabela, obterCliente: () => cliente });
  const memorias = { responsavel: g("responsaveis"), tipo: g("tipos"), status: g("status") };
  const configuracoes = criarGerenciador<LinhaConfiguracoes>({
    tabela: "configuracoes",
    obterCliente: () => cliente,
  });
  const repo = criarRepoCadastros({ obterCliente: () => cliente, memorias, configuracoes });
  return { chamadas, memorias, configuracoes, repo, cliente };
}

async function pronto(m: ReturnType<typeof montar>) {
  for (const g of [...Object.values(m.memorias), m.configuracoes]) g.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

const item = (id: string): L => ({ id, updated_at: T1, nome: id });

describe("repositório de exclusão de cadastros", () => {
  it("contarUsos chama a RPC do cadastro e devolve o mapa id → usos", async () => {
    const m = montar({}, () => ({
      data: [
        { id: "p", usos: 3 },
        { id: "n", usos: 0 },
      ],
      error: null,
    }));
    const r = await m.repo.contarUsos("status");
    expect(m.chamadas).toEqual([{ funcao: "contar_usos_cadastro", args: { cadastro: "status" } }]);
    expect(r.ok && [...r.valor]).toEqual([
      ["p", 3],
      ["n", 0],
    ]);
  });

  it("contarUsos falha com erro, exceção ou sem cliente", async () => {
    const erro = montar({}, () => ({ data: null, error: { message: "x" } }));
    expect(await erro.repo.contarUsos("tipo")).toEqual({ ok: false, codigo: "carregar.falhou" });
    const excecao = montar({}, () => {
      throw new Error("rede caiu");
    });
    expect(await excecao.repo.contarUsos("tipo")).toEqual({ ok: false, codigo: "carregar.falhou" });
    const semCliente = criarRepoCadastros({
      obterCliente: () => null,
      memorias: erro.memorias,
      configuracoes: erro.configuracoes,
    });
    expect(await semCliente.contarUsos("tipo")).toEqual({ ok: false, codigo: "carregar.falhou" });
  });

  it("excluir sem substituto chama a RPC sem para_id e tira da memória", async () => {
    const m = montar({ tipos: [item("a"), item("b")] }, () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.excluir("tipo", "a", null)).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      { funcao: "substituir_cadastro", args: { cadastro: "tipo", de_id: "a" } },
    ]);
    expect(m.memorias.tipo.linhas().map((l) => l.id)).toEqual(["b"]);
  });

  it("excluir com substituto manda para_id", async () => {
    const m = montar({ responsaveis: [item("a"), item("b")] }, () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.excluir("responsavel", "a", "b")).toEqual({ ok: true });
    expect(m.chamadas[0].args).toEqual({ cadastro: "responsavel", de_id: "a", para_id: "b" });
    expect(m.memorias.responsavel.linha("a")).toBeUndefined();
  });

  it("excluir o Status padrão mostra já o substituto (ou Nenhum) nas Configurações", async () => {
    const cfg = { id: "cfg", updated_at: T1, status_padrao_id: "p" } as unknown as LinhaConfiguracoes;
    const m = montar(
      { status: [item("p"), item("q")], configuracoes: [cfg as unknown as L] },
      () => ({ data: null, error: null }),
    );
    await pronto(m);
    await m.repo.excluir("status", "p", "q");
    expect(m.configuracoes.linha("cfg")?.status_padrao_id).toBe("q");
    await m.repo.excluir("status", "q", null);
    expect(m.configuracoes.linha("cfg")?.status_padrao_id).toBeNull();
  });

  it("recusa da RPC devolve o código cadastro.* e não mexe na memória", async () => {
    for (const [mensagemBanco, codigo] of [
      ["cadastro.em_uso", "cadastro.em_uso"],
      ["cadastro.substituto_invalido", "cadastro.substituto_invalido"],
      ["cadastro.nao_encontrado", "cadastro.nao_encontrado"],
      ["permission denied for function substituir_cadastro", "salvar.falhou"],
      ["cadastro.inventado", "salvar.falhou"],
    ]) {
      const m = montar({ status: [item("p")] }, () => ({
        data: null,
        error: { code: "P0001", message: mensagemBanco },
      }));
      await pronto(m);
      expect(await m.repo.excluir("status", "p", null)).toEqual({ ok: false, codigo });
      expect(m.memorias.status.linha("p")).toBeDefined();
    }
  });

  it("exceção ou falta de cliente falham com salvar.falhou", async () => {
    const m = montar({ tipos: [item("a")] }, () => {
      throw new Error("rede caiu");
    });
    await pronto(m);
    expect(await m.repo.excluir("tipo", "a", null)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memorias.tipo.linha("a")).toBeDefined();
    const semCliente = criarRepoCadastros({
      obterCliente: () => null,
      memorias: m.memorias,
      configuracoes: m.configuracoes,
    });
    expect(await semCliente.excluir("tipo", "a", null)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});

describe("exclusão sem conexão", () => {
  it("contarUsos e excluir avisam sem chamar o cliente", async () => {
    const m = montar({ tipos: [item("a")] }, () => ({ data: null, error: null }));
    await pronto(m);
    const obterCliente = vi.fn();
    const offline = criarRepoCadastros({
      obterCliente,
      memorias: m.memorias,
      configuracoes: m.configuracoes,
      online: () => false,
    });
    expect(await offline.contarUsos("tipo")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(await offline.excluir("tipo", "a", null)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(obterCliente).not.toHaveBeenCalled();
    expect(m.chamadas).toEqual([]);
    expect(m.memorias.tipo.linha("a")).toBeDefined();
  });
});
