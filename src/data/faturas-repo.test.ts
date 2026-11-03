import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Importacao } from "@/domain/importacao-fatura";
import type { Database } from "./database.types";
import {
  criarRepoFaturas,
  ultimaAlteracaoDoMes,
  type LinhaFatura,
  type LinhaFaturaCartao,
  type LinhaLancamento,
} from "./faturas-repo";
import { criarGerenciador } from "./realtime";

// Cliente falso: `rpc` registra a chamada e responde o que o teste mandar;
// cada tabela começa com as linhas dadas.

type Chamada = { funcao: string; args: Record<string, unknown> };

const T1 = "2026-11-03T12:00:00.000001+00:00";
const T2 = "2026-11-03T12:00:00.000002+00:00";

const importacao: Importacao = {
  fatura: {
    mes: "2026-10",
    vencimento: "2026-10-06",
    fechamento: "2026-09-29",
    total_despesas_centavos: 114074,
    total_creditos_centavos: 8,
    saldo_anterior_centavos: null,
    pagamentos_centavos: null,
    total_a_pagar_centavos: null,
  },
  cartoes: [{ final: "5061", total_centavos: 114074 }],
  lancamentos: [
    {
      nome: "MSC CRUZEIROS",
      nome_normalizado: "MSC CRUZEIROS",
      valor_centavos: 114074,
      data: "2026-09-04",
      parcela_n: 2,
      parcela_total: 12,
      final_cartao: "5061",
      ordem_fatura: 1,
      duvida_extracao: false,
    },
    {
      nome: "MSC CRUZEIROS",
      nome_normalizado: "MSC CRUZEIROS",
      valor_centavos: -8,
      data: "2026-09-04",
      parcela_n: null,
      parcela_total: null,
      final_cartao: "5061",
      ordem_fatura: 2,
      duvida_extracao: false,
    },
  ],
};

const lancamento = (id: string, mes: string, updated_at: string) =>
  ({ id, mes, updated_at, ordem_fatura: 1 }) as unknown as LinhaLancamento;

const gravados = {
  fatura: { id: "f1", mes: "2026-10", updated_at: T2 },
  cartoes: [{ id: "c1", fatura_id: "f1", final: "5061", updated_at: T2 }],
  lancamentos: [
    { id: "l1", mes: "2026-10", fatura_id: "f1", ordem_fatura: 1, valor_centavos: 114074, updated_at: T2 },
    { id: "l2", mes: "2026-10", fatura_id: "f1", ordem_fatura: 2, valor_centavos: -8, updated_at: T2 },
  ],
};

function montar(
  tabelas: Record<string, unknown[]>,
  responder: (c: Chamada) => { data: unknown; error: unknown },
  online = () => true,
) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: tabelas[tabela] ?? [], error: null }),
    }),
    rpc: async (funcao: string, args: Record<string, unknown>) => {
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
  const faturas = criarGerenciador<LinhaFatura>({ tabela: "faturas", obterCliente: () => cliente });
  const cartoes = criarGerenciador<LinhaFaturaCartao>({ tabela: "fatura_cartoes", obterCliente: () => cliente });
  const lancamentos = criarGerenciador<LinhaLancamento>({ tabela: "lancamentos", obterCliente: () => cliente });
  const repo = criarRepoFaturas({ obterCliente: () => cliente, faturas, cartoes, lancamentos, online });
  return { chamadas, faturas, cartoes, lancamentos, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  for (const g of [m.faturas, m.cartoes, m.lancamentos]) g.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

describe("ultimaAlteracaoDoMes", () => {
  it("o updated_at mais novo do Mês, com microssegundos; nenhum → null", () => {
    const linhas = [lancamento("a", "2026-10", T1), lancamento("b", "2026-10", T2), lancamento("c", "2026-11", "2026-12-01T00:00:00+00:00")];
    expect(ultimaAlteracaoDoMes(linhas, "2026-10")).toBe(T2);
    expect(ultimaAlteracaoDoMes(linhas, "2026-09")).toBeNull();
  });
});

describe("repositório da importação da Fatura", () => {
  it("chama a RPC com o que o núcleo preparou e aplica a Fatura, os cartões e as linhas", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    await pronto(m);
    expect(await m.repo.importar(importacao)).toEqual({ ok: true, quantidade: 2 });
    expect(m.chamadas).toEqual([
      {
        funcao: "importar_fatura",
        args: {
          dados_fatura: importacao.fatura,
          dados_cartoes: importacao.cartoes,
          dados_lancamentos: importacao.lancamentos,
        },
      },
    ]);
    expect(m.faturas.linha("f1")?.mes).toBe("2026-10");
    expect(m.cartoes.linha("c1")?.final).toBe("5061");
    expect(m.lancamentos.linhas().map((l) => l.valor_centavos).sort()).toEqual([-8, 114074]);
  });

  it("manda o updated_at mais novo dos Lançamentos do Mês já lidos", async () => {
    const m = montar(
      { lancamentos: [lancamento("x", "2026-10", T1), lancamento("y", "2026-10", T2), lancamento("z", "2026-09", "2026-12-01T00:00:00+00:00")] },
      () => ({ data: gravados, error: null }),
    );
    await pronto(m);
    await m.repo.importar(importacao);
    expect(m.chamadas[0].args.lancamentos_atualizados_em).toBe(T2);
  });

  it("códigos da RPC passam; o resto vira salvar.falhou; sem código do banco, a conexão caiu", async () => {
    for (const [erro, codigo] of [
      [{ code: "P0001", message: "fatura.mes_ja_importado" }, "fatura.mes_ja_importado"],
      [{ code: "P0001", message: "fatura.mes_mudou" }, "fatura.mes_mudou"],
      [{ code: "23514", message: 'new row for relation "lancamentos" violates check constraint' }, "salvar.falhou"],
      [{ code: "P0001", message: "fatura.inventado" }, "salvar.falhou"],
      [{ code: "", message: "TypeError: Failed to fetch" }, "fatura.conexao_caiu"],
      [{ code: "PGRST301", message: "JWT expired" }, "auth.sessao_expirou"],
      [{ code: "PGRST303", message: "JWT expired" }, "auth.sessao_expirou"],
    ] as const) {
      const m = montar({}, () => ({ data: null, error: erro }));
      await pronto(m);
      expect(await m.repo.importar(importacao)).toEqual({ ok: false, codigo });
      expect(m.faturas.linhas()).toHaveLength(0);
      expect(m.lancamentos.linhas()).toHaveLength(0);
    }
  });

  it("Mês já importado pela RPC relê as três tabelas antes de devolver o código", async () => {
    const lidas: string[] = [];
    let respondeu = false;
    const m = montar({}, () => {
      respondeu = true;
      return { data: null, error: { code: "P0001", message: "fatura.mes_ja_importado" } };
    });
    await pronto(m);
    for (const g of [m.faturas, m.cartoes, m.lancamentos]) {
      const original = g.recarregar;
      g.recarregar = async () => {
        if (respondeu) lidas.push("x");
        await original();
      };
    }
    expect(await m.repo.importar(importacao)).toEqual({ ok: false, codigo: "fatura.mes_ja_importado" });
    expect(lidas).toHaveLength(3);
  });

  it("Lançamentos ainda carregando ou com erro: não chama a RPC", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    expect(m.lancamentos.retrato().status).toBe("carregando");
    expect(await m.repo.importar(importacao)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.chamadas).toEqual([]);
  });

  it("exceção vira conexão caída; resposta sem a forma esperada, salvar.falhou", async () => {
    const excecao = montar({}, () => {
      throw new TypeError("Failed to fetch");
    });
    await pronto(excecao);
    expect(await excecao.repo.importar(importacao)).toEqual({ ok: false, codigo: "fatura.conexao_caiu" });
    const torta = montar({}, () => ({ data: { fatura: null }, error: null }));
    await pronto(torta);
    expect(await torta.repo.importar(importacao)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("sem conexão não chama o banco; sem cliente falha", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }), () => false);
    expect(await m.repo.importar(importacao)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.chamadas).toEqual([]);
    const semCliente = criarRepoFaturas({
      obterCliente: () => null,
      faturas: m.faturas,
      cartoes: m.cartoes,
      lancamentos: m.lancamentos,
      online: () => true,
    });
    expect(await semCliente.importar(importacao)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});
