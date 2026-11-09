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
      ajuste_de_ordem: null,
      tipo_sugerido: null,
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
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
      // Ajuste de centavos da parcela (História 2.8).
      ajuste_de_ordem: 1,
      tipo_sugerido: null,
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: null,
      revisao_dados: null,
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

type Linha = Record<string, unknown>;

type Atualizacao = { tabela: string; corpo: Record<string, unknown>; id: string | null };

function montar(
  tabelas: Record<string, unknown[]>,
  responder: (c: Chamada) => { data: unknown; error: unknown },
  online = () => true,
  opcoes: {
    erroDaLeitura?: unknown;
    /** Resposta de `update(...).eq(...).select().single()`; padrão: a linha com o corpo e `updated_at` T2. */
    responderUpdate?: (u: Atualizacao) => Promise<{ data: unknown; error: unknown }>;
  } = {},
) {
  const chamadas: Chamada[] = [];
  const atualizacoes: Atualizacao[] = [];
  // Leituras do banco: a tabela, as colunas e os filtros de cada uma.
  const leituras: { tabela: string; colunas: string; filtros: string[] }[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: (colunas: string) => {
        const leitura = { tabela, colunas, filtros: [] as string[] };
        leituras.push(leitura);
        let linhas = (tabelas[tabela] ?? []) as Linha[];
        const consulta = {
          eq(coluna: string, valor: unknown) {
            leitura.filtros.push(`${coluna}=${String(valor)}`);
            linhas = linhas.filter((l) => l[coluna] === valor);
            return consulta;
          },
          order(coluna: string, o: { ascending: boolean }) {
            leitura.filtros.push(`order ${coluna} ${o.ascending ? "asc" : "desc"}`);
            linhas = [...linhas].sort((a, b) => (String(a[coluna]) < String(b[coluna]) ? -1 : 1));
            if (!o.ascending) linhas.reverse();
            return consulta;
          },
          limit(n: number) {
            leitura.filtros.push(`limit ${n}`);
            linhas = linhas.slice(0, n);
            return consulta;
          },
          then<T>(resolver: (r: { data: unknown; error: unknown }) => T) {
            const erro = colunas === "updated_at" ? (opcoes.erroDaLeitura ?? null) : null;
            return Promise.resolve(erro ? { data: null, error: erro } : { data: linhas, error: null }).then(resolver);
          },
        };
        return consulta;
      },
      update: (corpo: Record<string, unknown>) => {
        const u: Atualizacao = { tabela, corpo, id: null };
        atualizacoes.push(u);
        const encadeada = {
          eq(_coluna: string, valor: string) {
            u.id = valor;
            return encadeada;
          },
          select: () => encadeada,
          single: () => {
            if (opcoes.responderUpdate) return opcoes.responderUpdate(u);
            const atual = ((tabelas[tabela] ?? []) as Linha[]).find((l) => l.id === u.id);
            return Promise.resolve({ data: { ...atual, ...corpo, updated_at: T2 }, error: null });
          },
        };
        return encadeada;
      },
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
  const lancamentos = criarGerenciador<LinhaLancamento>({
    tabela: "lancamentos",
    obterCliente: () => cliente,
    porMes: true,
  });
  const repo = criarRepoFaturas({ obterCliente: () => cliente, faturas, cartoes, lancamentos, online });
  return { chamadas, leituras, atualizacoes, faturas, cartoes, lancamentos, repo };
}

/** Assina as três tabelas com o Mês aberto (padrão: o Mês importado). */
async function pronto(m: ReturnType<typeof montar>, mesAberto = "2026-10") {
  m.lancamentos.abrirMes(mesAberto);
  for (const g of [m.faturas, m.cartoes, m.lancamentos]) g.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

/** Leituras de `updated_at` no banco (fora a releitura dos gerenciadores). */
const leiturasDoMes = (m: ReturnType<typeof montar>) => m.leituras.filter((l) => l.colunas === "updated_at");

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
    // O jsonb leva a ordem da mãe no Ajuste (a RPC grava o ajuste_de_id).
    expect((m.chamadas[0].args.dados_lancamentos as { ajuste_de_ordem: number | null }[]).map((l) => l.ajuste_de_ordem)).toEqual([
      null,
      1,
    ]);
    expect(m.faturas.linha("f1")?.mes).toBe("2026-10");
    expect(m.cartoes.linha("c1")?.final).toBe("5061");
    expect(m.lancamentos.linhas().map((l) => l.valor_centavos).sort()).toEqual([-8, 114074]);
  });

  it("Mês importado aberto e carregado: o updated_at mais novo vem da memória", async () => {
    const m = montar(
      { lancamentos: [lancamento("x", "2026-10", T1), lancamento("y", "2026-10", T2), lancamento("z", "2026-09", "2026-12-01T00:00:00+00:00")] },
      () => ({ data: gravados, error: null }),
    );
    await pronto(m);
    await m.repo.importar(importacao);
    expect(m.chamadas[0].args.lancamentos_atualizados_em).toBe(T2);
    expect(leiturasDoMes(m)).toEqual([]);
  });

  it("outro Mês aberto: o updated_at do Mês importado é lido do banco, só daquele Mês", async () => {
    const m = montar(
      {
        lancamentos: [
          lancamento("x", "2026-10", T1),
          lancamento("y", "2026-10", T2),
          lancamento("n", "2026-11", "2026-12-01T00:00:00+00:00"),
        ],
      },
      () => ({ data: gravados, error: null }),
    );
    await pronto(m, "2026-11");
    expect(await m.repo.importar(importacao)).toEqual({ ok: true, quantidade: 2 });
    expect(leiturasDoMes(m)).toEqual([
      { tabela: "lancamentos", colunas: "updated_at", filtros: ["mes=2026-10", "order updated_at desc", "limit 1"] },
    ]);
    expect(m.chamadas[0].args.lancamentos_atualizados_em).toBe(T2);
    // As linhas gravadas são de outubro: a memória (novembro) não muda.
    expect(m.lancamentos.linhas().map((l) => l.id)).toEqual(["n"]);
  });

  it("Mês sem Lançamentos no banco: não manda o updated_at", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    await pronto(m, "2026-11");
    await m.repo.importar(importacao);
    expect(m.chamadas[0].args).not.toHaveProperty("lancamentos_atualizados_em");
  });

  it("falha ao ler o updated_at do banco: não chama a RPC e devolve o código da 2.3", async () => {
    for (const [erro, codigo] of [
      [{ code: "", message: "TypeError: Failed to fetch" }, "fatura.conexao_caiu"],
      [{ code: "PGRST301", message: "JWT expired" }, "auth.sessao_expirou"],
      [{ code: "42501", message: "permission denied" }, "salvar.falhou"],
    ] as const) {
      const m = montar({}, () => ({ data: gravados, error: null }), () => true, { erroDaLeitura: erro });
      await pronto(m, "2026-11");
      expect(await m.repo.importar(importacao)).toEqual({ ok: false, codigo });
      expect(m.chamadas).toEqual([]);
    }
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

  it("Lançamentos do Mês ainda carregando: lê o updated_at do banco em vez da memória", async () => {
    const m = montar({ lancamentos: [lancamento("x", "2026-10", T1)] }, () => ({ data: gravados, error: null }));
    m.lancamentos.abrirMes("2026-10");
    expect(m.lancamentos.retrato().status).toBe("carregando");
    expect(await m.repo.importar(importacao)).toEqual({ ok: true, quantidade: 2 });
    expect(leiturasDoMes(m)).toHaveLength(1);
    expect(m.chamadas[0].args.lancamentos_atualizados_em).toBe(T1);
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

describe("dispensar o alerta da Conferência (História 2.5)", () => {
  const fatura = { id: "f10", mes: "2026-10", alerta_dispensado_em: null, total_despesas_centavos: 1, updated_at: T1 };
  const AGORA = new Date("2026-11-08T15:00:00.000Z");

  it("grava só alerta_dispensado_em e aplica a resposta; Desfazer grava null", async () => {
    const m = montar({ faturas: [fatura] }, () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.dispensarAlerta("f10", AGORA)).toEqual({ ok: true });
    expect(m.atualizacoes).toEqual([
      { tabela: "faturas", corpo: { alerta_dispensado_em: "2026-11-08T15:00:00.000Z" }, id: "f10" },
    ]);
    expect(m.faturas.linha("f10")?.alerta_dispensado_em).toBe("2026-11-08T15:00:00.000Z");
    expect(m.faturas.linha("f10")?.updated_at).toBe(T2);

    expect(await m.repo.desfazerDispensa("f10")).toEqual({ ok: true });
    expect(m.atualizacoes[1]).toEqual({ tabela: "faturas", corpo: { alerta_dispensado_em: null }, id: "f10" });
    expect(m.faturas.linha("f10")?.alerta_dispensado_em).toBeNull();
  });

  it("otimista: a memória muda antes da resposta; recusa do banco desfaz", async () => {
    let responder: (r: { data: unknown; error: unknown }) => void = () => {};
    const m = montar({ faturas: [fatura] }, () => ({ data: null, error: null }), () => true, {
      responderUpdate: () => new Promise((r) => (responder = r)),
    });
    await pronto(m);
    const gravacao = m.repo.dispensarAlerta("f10", AGORA);
    expect(m.faturas.linha("f10")?.alerta_dispensado_em).toBe("2026-11-08T15:00:00.000Z");
    responder({ data: null, error: { code: "42501" } });
    expect(await gravacao).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.faturas.linha("f10")?.alerta_dispensado_em).toBeNull();
  });

  it("sem conexão: nada gravado, nada muda na memória", async () => {
    let online = true;
    const m = montar({ faturas: [fatura] }, () => ({ data: null, error: null }), () => online);
    await pronto(m);
    online = false;
    expect(await m.repo.dispensarAlerta("f10", AGORA)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.atualizacoes).toEqual([]);
    expect(m.faturas.linha("f10")?.alerta_dispensado_em).toBeNull();
  });

  it("Fatura que não está na memória: salvar.falhou sem chamar o banco", async () => {
    const m = montar({}, () => ({ data: null, error: null }));
    await pronto(m);
    expect(await m.repo.dispensarAlerta("f99", AGORA)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.atualizacoes).toEqual([]);
  });
});
