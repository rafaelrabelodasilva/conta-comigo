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
      serie: null,
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
      serie: null,
    },
  ],
  previstos: [],
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
    /** Erro de qualquer leitura da tabela (reimportação). */
    errosDeTabela?: Record<string, unknown>;
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
          in(coluna: string, valores: unknown[]) {
            leitura.filtros.push(`${coluna} in ${valores.join(",")}`);
            linhas = linhas.filter((l) => valores.includes(l[coluna]));
            return consulta;
          },
          is(coluna: string, valor: unknown) {
            leitura.filtros.push(`${coluna} is ${String(valor)}`);
            linhas = linhas.filter((l) => (l[coluna] ?? null) === valor);
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
            const erro =
              opcoes.errosDeTabela?.[tabela] ?? (colunas === "updated_at" ? (opcoes.erroDaLeitura ?? null) : null);
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
          dados_previstos: importacao.previstos,
          previstos_sem_par: [],
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

describe("reimportar um Mês (História 3.12)", () => {
  const PADRAO = "nao-pago";
  const linhaDb = (id: string, extra: Record<string, unknown>) => ({
    id,
    mes: "2026-10",
    fatura_id: "f0",
    lancado_por: "fatura",
    nome_normalizado: id.toUpperCase(),
    valor_centavos: 1000,
    parcela_n: null,
    parcela_total: null,
    ordem_fatura: 1,
    ajuste_de_id: null,
    excluido_em: null,
    responsavel_id: null,
    tipo_id: null,
    observacao: null,
    apelido: null,
    status_id: PADRAO,
    casado_em: null,
    editado_em: null,
    revisao_motivo: null,
    revisao_dados: null,
    serie_id: null,
    dividido_de_id: null,
    divisao: null,
    updated_at: T1,
    ...extra,
  });
  const banco = {
    configuracoes: [{ id: "cfg", status_padrao_id: PADRAO }],
    faturas: [
      { id: "f0", mes: "2026-10", updated_at: T1 },
      { id: "f9", mes: "2026-09", updated_at: T1 },
    ],
    lancamentos: [
      linhaDb("a", { responsavel_id: "casal", ordem_fatura: 1 }),
      linhaDb("b", { excluido_em: T1, ordem_fatura: 2 }),
      linhaDb("c", { ordem_fatura: 3 }),
      // Filha de Divisão: sai junto com a mãe e não é uma linha da Fatura para parear.
      linhaDb("filha", { dividido_de_id: "a", ordem_fatura: 1 }),
      // Manual do Mês: fica de fora das linhas, mas o updated_at dele conta.
      linhaDb("m", { fatura_id: null, lancado_por: "manual", updated_at: T2, tipo_id: "casa" }),
      linhaDb("s", { mes: "2026-09", fatura_id: "f9", updated_at: "2026-12-01T00:00:00+00:00" }),
    ],
  };

  it("lerReimportacao: a Fatura do Mês, só as mães e os Ajustes dela (com excluídas), o updated_at mais novo do Mês e o Status padrão", async () => {
    const m = montar(banco, () => ({ data: null, error: null }));
    const r = await m.repo.lerReimportacao("2026-10");
    expect(r).toMatchObject({
      ok: true,
      valor: { faturaId: "f0", atualizadoEm: T2, statusPadraoId: PADRAO, referenciadas: [], outrasDaSerie: [], historico: 0 },
    });
    const antigas = r.ok && r.valor ? r.valor.antigas : [];
    expect(antigas.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(antigas[0]).toMatchObject({ nome_normalizado: "A", valor_centavos: 1000, responsavel_id: "casal", ordem_fatura: 1, serie: null });
    expect(antigas[1].excluido_em).toBe(T1);
    expect(m.leituras.map((l) => [l.tabela, l.colunas, l.filtros])).toEqual([
      ["faturas", "id", ["mes=2026-10"]],
      ["lancamentos", expect.any(String), ["mes=2026-10"]],
      ["configuracoes", "status_padrao_id", []],
      ["pagamento_itens", "lancamento_id", ["lancamento_id in a,b,c,filha,m", "excluido_em is null", "limit 1000"]],
    ]);
  });

  it("lerReimportacao: as antigas com Pagamento (ela ou uma parte da Divisão) vão em `referenciadas`; item de Pagamento desfeito não conta", async () => {
    const m = montar(
      {
        ...banco,
        pagamento_itens: [
          { lancamento_id: "a", excluido_em: null },
          { lancamento_id: "filha-de-c", excluido_em: null },
          { lancamento_id: "d", excluido_em: T1 },
        ],
        lancamentos: [
          linhaDb("a", { ordem_fatura: 1 }),
          linhaDb("c", { ordem_fatura: 3 }),
          linhaDb("filha-de-c", { dividido_de_id: "c", ordem_fatura: 3 }),
          linhaDb("d", { ordem_fatura: 4 }),
        ],
      },
      () => ({ data: null, error: null }),
    );
    const r = await m.repo.lerReimportacao("2026-10");
    expect(r.ok && r.valor?.referenciadas).toEqual(["a", "c"]);
  });

  it("lerReimportacao: falha ao ler os itens de Pagamento é carregar.falhou (nunca reimporta sem saber)", async () => {
    const m = montar({ ...banco }, () => ({ data: null, error: null }), () => true, { errosDeTabela: { pagamento_itens: { code: "", message: "Failed to fetch" } } });
    expect(await m.repo.lerReimportacao("2026-10")).toEqual({ ok: false, codigo: "carregar.falhou" });
  });

  it("lerReimportacao devolve o casado_em, o Ajuste, o Apelido, a edição e a Divisão de cada linha", async () => {
    const divisao = {
      modo: "proporcao",
      partes: [
        { responsavel_id: "r1", numerador: 1, denominador: 2, filha_id: "f1" },
        { responsavel_id: "r2", numerador: 1, denominador: 2, filha_id: "f2" },
      ],
    };
    const m = montar(
      {
        ...banco,
        lancamentos: [
          linhaDb("a", { casado_em: "2026-12-05T10:00:00Z", apelido: "Celular", editado_em: T1, divisao, revisao_motivo: "valor_mudou" }),
          linhaDb("b", { ajuste_de_id: "a", ordem_fatura: 2 }),
        ],
      },
      () => ({ data: null, error: null }),
    );
    const r = await m.repo.lerReimportacao("2026-10");
    const [a, b] = r.ok && r.valor ? r.valor.antigas : [];
    expect(a).toMatchObject({ casado_em: "2026-12-05T10:00:00Z", apelido: "Celular", editado_em: T1, revisao_motivo: "valor_mudou" });
    expect(a.divisao?.partes.map((p) => p.filha_id)).toEqual(["f1", "f2"]);
    expect(b.ajuste_de_id).toBe("a");
  });

  it("lerReimportacao lê a Série das linhas e das outras do Mês que ocupam parcela (não previstos), e conta o histórico", async () => {
    const serie = {
      id: "s1",
      ocorrencia: 2,
      nome_normalizado: "A",
      parcela_total: 5,
      valor_parcela_centavos: 1000,
      mes_primeira_parcela: "2026-09",
    };
    const m = montar(
      {
        ...banco,
        series: [serie, { ...serie, id: "s2" }],
        lancamentos: [
          linhaDb("a", { serie_id: "s1", parcela_n: 2, parcela_total: 5 }),
          // Saiu da Fatura numa reimportação anterior: ocupa a parcela e não é previsto.
          linhaDb("x", { fatura_id: null, lancado_por: "manual", serie_id: "s2", parcela_n: 3, parcela_total: 5, ordem_fatura: null }),
          // Previsto: o casamento já o conhece.
          linhaDb("p", { fatura_id: null, lancado_por: "sistema", serie_id: "s2", parcela_n: 4, parcela_total: 5, ordem_fatura: null }),
          linhaDb("h1", { fatura_id: null, lancado_por: "historico", ordem_fatura: null }),
          linhaDb("h2", { fatura_id: null, lancado_por: "historico", ordem_fatura: null }),
          linhaDb("h3", { fatura_id: null, lancado_por: "historico", ordem_fatura: null, excluido_em: T1 }),
        ],
      },
      () => ({ data: null, error: null }),
    );
    const r = await m.repo.lerReimportacao("2026-10");
    expect(r.ok && r.valor?.antigas[0].serie).toEqual({
      nome_normalizado: "A",
      parcela_total: 5,
      valor_parcela_centavos: 1000,
      mes_primeira_parcela: "2026-09",
      ocorrencia: 2,
    });
    expect(r.ok && r.valor?.outrasDaSerie.map((p) => [p.id, p.parcela_n, p.ocorrencia])).toEqual([["x", 3, 2]]);
    expect(r.ok && r.valor?.historico).toBe(2);
  });

  it("lerReimportacao: sem configuracoes no banco, o Status padrão é null", async () => {
    const m = montar({ ...banco, configuracoes: [] }, () => ({ data: null, error: null }));
    const r = await m.repo.lerReimportacao("2026-10");
    expect(r.ok && r.valor?.statusPadraoId).toBeNull();
  });

  it("lerReimportacao: Mês sem Fatura → null; falhas viram carregar.falhou (sessão expirada passa); sem conexão nada lido", async () => {
    const sem = montar(banco, () => ({ data: null, error: null }));
    expect(await sem.repo.lerReimportacao("2026-11")).toEqual({ ok: true, valor: null });
    for (const [tabela, erro, codigo] of [
      ["faturas", { code: "", message: "Failed to fetch" }, "carregar.falhou"],
      ["lancamentos", { code: "42501", message: "permission denied" }, "carregar.falhou"],
      ["lancamentos", { code: "PGRST301", message: "JWT expired" }, "auth.sessao_expirou"],
      ["configuracoes", { code: "42501", message: "permission denied" }, "carregar.falhou"],
    ] as const) {
      const m = montar(banco, () => ({ data: null, error: null }), () => true, { errosDeTabela: { [tabela]: erro } });
      expect(await m.repo.lerReimportacao("2026-10")).toEqual({ ok: false, codigo });
    }
    const offline = montar(banco, () => ({ data: null, error: null }), () => false);
    expect(await offline.repo.lerReimportacao("2026-10")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(offline.leituras).toEqual([]);
  });

  it("importar com o plano: manda dados_reimportacao; a Fatura fica no lugar e as linhas que saíram voltam em previstos", async () => {
    const plano = {
      apagar: ["a"],
      sumiram: ["b"],
      voltar_a_previsto: ["c"],
      resumo: { quantidade: 3, mantidas: 0, valorMudou: 0, novas: 2, apagadas: 1, sumiram: 1, voltaramAPrevisto: 1, excluidos: 0 },
    };
    const m = montar(
      {
        faturas: [{ id: "f1", mes: "2026-10", updated_at: T1 }],
        fatura_cartoes: [{ id: "c0", fatura_id: "f1", final: "5061", updated_at: T1 }],
        lancamentos: [lancamento("a", "2026-10", T1), lancamento("b", "2026-10", T1), lancamento("c", "2026-10", T1)],
      },
      () => ({
        data: {
          ...gravados,
          // O `b` saiu da Fatura (manual) e o `c` voltou a previsto: voltam atualizados em `previstos`.
          previstos: [
            { id: "b", mes: "2026-10", fatura_id: null, ordem_fatura: null, updated_at: T2 },
            { id: "c", mes: "2026-10", fatura_id: null, ordem_fatura: null, updated_at: T2 },
          ],
          removidos: { fatura_id: null, cartoes: ["c0"], lancamentos: ["a"], previstos: [] },
        },
        error: null,
      }),
    );
    await pronto(m);
    expect(await m.repo.importar({ ...importacao, reimportacao: plano }, { faturaId: "f1", atualizadoEm: T1 })).toEqual({
      ok: true,
      quantidade: 2,
    });
    expect(m.chamadas[0].args.dados_reimportacao).toEqual({ apagar: ["a"], sumiram: ["b"], voltar_a_previsto: ["c"] });
    expect(m.chamadas[0].args.substituir_fatura_id).toBe("f1");
    expect(m.cartoes.linhas().map((c) => c.id)).toEqual(["c1"]);
    expect(m.lancamentos.linhas().map((l) => l.id).sort()).toEqual(["b", "c", "l1", "l2"]);
  });

  it("importar sem substituir não manda dados_reimportacao", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    await pronto(m);
    await m.repo.importar(importacao);
    expect("dados_reimportacao" in m.chamadas[0].args).toBe(false);
  });

  it("importar com substituir: manda o id e o updated_at do aviso, sem reler; tira os apagados da memória", async () => {
    const m = montar(
      {
        faturas: [{ id: "f0", mes: "2026-10", updated_at: T1 }],
        fatura_cartoes: [{ id: "c0", fatura_id: "f0", final: "5061", updated_at: T1 }],
        lancamentos: [
          lancamento("a", "2026-10", T1),
          lancamento("b", "2026-10", T1),
          lancamento("m", "2026-10", "2026-12-01T00:00:00+00:00"),
        ],
      },
      () => ({
        data: { ...gravados, removidos: { fatura_id: "f0", cartoes: ["c0"], lancamentos: ["a", "b"] } },
        error: null,
      }),
    );
    await pronto(m);
    expect(await m.repo.importar(importacao, { faturaId: "f0", atualizadoEm: T1 })).toEqual({ ok: true, quantidade: 2 });
    expect(m.chamadas[0].args).toEqual({
      dados_fatura: importacao.fatura,
      dados_cartoes: importacao.cartoes,
      dados_lancamentos: importacao.lancamentos,
      dados_previstos: importacao.previstos,
      previstos_sem_par: [],
      // O do aviso, não o mais novo da memória (o do "m").
      lancamentos_atualizados_em: T1,
      substituir_fatura_id: "f0",
    });
    expect(leiturasDoMes(m)).toEqual([]);
    expect(m.faturas.linhas().map((f) => f.id)).toEqual(["f1"]);
    expect(m.cartoes.linhas().map((c) => c.id)).toEqual(["c1"]);
    expect(m.lancamentos.linhas().map((l) => l.id).sort()).toEqual(["l1", "l2", "m"]);
  });

  it("importar com substituir e Mês sem updated_at: não manda o updated_at; mes_mudou passa", async () => {
    const m = montar({}, () => ({ data: null, error: { code: "P0001", message: "fatura.mes_mudou" } }));
    await pronto(m);
    expect(await m.repo.importar(importacao, { faturaId: "f0", atualizadoEm: null })).toEqual({
      ok: false,
      codigo: "fatura.mes_mudou",
    });
    expect(m.chamadas[0].args).not.toHaveProperty("lancamentos_atualizados_em");
    expect(m.chamadas[0].args.substituir_fatura_id).toBe("f0");
  });

  it("previstos (História 3.5): vão na RPC; só os do Mês aberto entram na memória; os apagados saem", async () => {
    const previstos = [
      { id: "p10", mes: "2026-10", updated_at: T2, ordem_fatura: null },
      { id: "p11", mes: "2026-11", updated_at: T2, ordem_fatura: null },
    ];
    const comPrevistos: Importacao = {
      ...importacao,
      previstos: [
        {
          ordem_origem: 1,
          nome: "MSC CRUZEIROS",
          nome_normalizado: "MSC CRUZEIROS",
          apelido: null,
          valor_centavos: 114074,
          parcela_n: 3,
          parcela_total: 12,
          mes: "2026-11",
          responsavel_id: null,
          tipo_id: null,
          observacao: null,
        },
      ],
    };
    const m = montar(
      { lancamentos: [{ id: "velho", mes: "2026-10", updated_at: T1, ordem_fatura: 9 }] },
      () => ({
        data: { ...gravados, previstos, removidos: { fatura_id: "f0", cartoes: [], lancamentos: [], previstos: ["velho"] } },
        error: null,
      }),
    );
    await pronto(m);
    expect(await m.repo.importar(comPrevistos, { faturaId: "f0", atualizadoEm: T1 })).toEqual({ ok: true, quantidade: 2 });
    expect(m.chamadas[0].args.dados_previstos).toEqual(comPrevistos.previstos);
    expect(m.lancamentos.linhas().map((l) => l.id).sort()).toEqual(["l1", "l2", "p10"]);
  });

  it("removidos.previstos com forma errada: salvar.falhou sem mexer na memória", async () => {
    const m = montar({}, () => ({
      data: { ...gravados, removidos: { fatura_id: "f0", cartoes: [], lancamentos: [], previstos: "x" } },
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.importar(importacao, { faturaId: "f0", atualizadoEm: null })).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("removidos com forma errada: salvar.falhou sem mexer na memória", async () => {
    const m = montar({ faturas: [{ id: "f0", mes: "2026-10", updated_at: T1 }] }, () => ({
      data: { ...gravados, removidos: { fatura_id: "f0", cartoes: "c0" } },
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.importar(importacao, { faturaId: "f0", atualizadoEm: T1 })).toEqual({
      ok: false,
      codigo: "salvar.falhou",
    });
    expect(m.faturas.linhas().map((f) => f.id)).toEqual(["f0"]);
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

describe("casamento dos previstos (História 3.6)", () => {
  const previsto = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    mes: "2026-11",
    fatura_id: null,
    excluido_em: null,
    lancado_por: "sistema",
    nome_normalizado: "MAGALU",
    parcela_n: 7,
    parcela_total: 10,
    valor_centavos: 44589,
    responsavel_id: null,
    tipo_id: null,
    serie_id: "s1",
    updated_at: T1,
    ...extra,
  });
  const serieDe = (id: string, ocorrencia: number) => ({
    id,
    ocorrencia,
    nome_normalizado: "MAGALU",
    parcela_total: 10,
    valor_parcela_centavos: 44589,
    mes_primeira_parcela: "2026-05",
  });
  const series = [serieDe("s1", 1), serieDe("s2", 2)];
  const chave = (ocorrencia: number) => ({
    nome_normalizado: "MAGALU",
    parcela_total: 10,
    valor_parcela_centavos: 44589,
    mes_primeira_parcela: "2026-05",
    ocorrencia,
  });

  it("lerPrevistosDoMes: só os previstos do Mês, com a ocorrencia da Série, e o updated_at mais novo", async () => {
    const m = montar(
      {
        lancamentos: [
          previsto("p1"),
          previsto("p2", { serie_id: "s2", updated_at: T2 }),
          previsto("excluido", { excluido_em: "2026-11-01T00:00:00Z" }),
          previsto("real", { lancado_por: "fatura", fatura_id: "f1" }),
          previsto("outro-mes", { mes: "2026-12" }),
          previsto("sem-serie", { serie_id: null }),
        ],
        series,
      },
      () => ({ data: null, error: null }),
    );
    const r = await m.repo.lerPrevistosDoMes("2026-11");
    expect(r).toEqual({
      ok: true,
      atualizadoEm: T2,
      previstos: [
        { id: "p1", nome_normalizado: "MAGALU", parcela_n: 7, parcela_total: 10, valor_centavos: 44589, ocorrencia: 1, responsavel_id: null, tipo_id: null, divisao: null, serie: chave(1) },
        { id: "p2", nome_normalizado: "MAGALU", parcela_n: 7, parcela_total: 10, valor_centavos: 44589, ocorrencia: 2, responsavel_id: null, tipo_id: null, divisao: null, serie: chave(2) },
      ],
    });
  });

  it("lerPrevistosDoMes: Mês sem previstos devolve lista vazia, sem ler as Séries", async () => {
    const m = montar({ lancamentos: [previsto("real", { lancado_por: "fatura", fatura_id: "f1" })], series }, () => ({ data: null, error: null }));
    expect(await m.repo.lerPrevistosDoMes("2026-11")).toEqual({ ok: true, previstos: [], atualizadoEm: T1 });
    expect(m.leituras.some((l) => l.tabela === "series")).toBe(false);
  });

  it("lerPrevistosDoMes: sem conexão e erro de leitura viram falha", async () => {
    const semRede = montar({}, () => ({ data: null, error: null }), () => false);
    expect((await semRede.repo.lerPrevistosDoMes("2026-11")).ok).toBe(false);
    const erro = montar({}, () => ({ data: null, error: null }), () => true, { errosDeTabela: { lancamentos: { code: "XX" } } });
    expect(await erro.repo.lerPrevistosDoMes("2026-11")).toEqual({ ok: false, codigo: "carregar.falhou" });
  });

  describe("lerParcelasDoMesAnterior (História 3.7)", () => {
    const parcela = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      mes: "2026-10",
      nome_normalizado: "MAGALU",
      parcela_n: 4,
      parcela_total: 10,
      valor_centavos: 44589,
      ordem_fatura: 3,
      responsavel_id: "r1",
      tipo_id: "t1",
      apelido: null,
      observacao: null,
      serie_id: "s1",
      excluido_em: null,
      dividido_de_id: null,
      ajuste_de_id: null,
      fatura_id: "f0",
      ...extra,
    });
    const serieDeOut = [{ ...serieDe("s1", 1), mes_primeira_parcela: "2026-07" }, { ...serieDe("s2", 2), mes_primeira_parcela: "2026-07" }];

    it("lê as mães do Mês anterior, com a Série e sem excluídas, Ajustes, filhas, outros Meses nem Valor negativo", async () => {
      const m = montar(
        {
          lancamentos: [
            parcela("c1"),
            parcela("c2", { serie_id: "s2", ordem_fatura: 4 }),
            parcela("excluida", { excluido_em: "2026-11-01T00:00:00Z" }),
            parcela("ajuste", { ajuste_de_id: "c1" }),
            parcela("filha", { dividido_de_id: "c1" }),
            parcela("credito", { valor_centavos: -100 }),
            parcela("a-vista", { parcela_n: null, parcela_total: null }),
            parcela("outro-mes", { mes: "2026-09" }),
          ],
          series: serieDeOut,
        },
        () => ({ data: null, error: null }),
      );
      const r = await m.repo.lerParcelasDoMesAnterior("2026-11");
      expect(r.ok && r.candidatas.map((c) => [c.id, c.serie?.ocorrencia, c.serie?.mes_primeira_parcela, c.proxima_ocupada])).toEqual([
        ["c1", 1, "2026-07", false],
        ["c2", 2, "2026-07", false],
      ]);
      expect(m.leituras[0].filtros).toContain("mes=2026-10");
    });

    it("sem Série (gravada antes da 3.5) vem com serie nula e não lê as Séries", async () => {
      const m = montar({ lancamentos: [parcela("c1", { serie_id: null })], series: serieDeOut }, () => ({ data: null, error: null }));
      const r = await m.repo.lerParcelasDoMesAnterior("2026-11");
      expect(r.ok && r.candidatas[0]).toMatchObject({ id: "c1", serie: null, proxima_ocupada: false });
      expect(m.leituras.some((l) => l.tabela === "series")).toBe(false);
    });

    it("marca a candidata cuja Série já tem a parcela seguinte, menos a da Fatura do próprio Mês e as excluídas", async () => {
      const seguinte = (id: string, serie_id: string, extra: Record<string, unknown> = {}) =>
        parcela(id, { mes: "2026-11", parcela_n: 5, serie_id, fatura_id: null, ...extra });
      const m = montar(
        {
          lancamentos: [
            parcela("c1"),
            parcela("c2", { serie_id: "s2" }),
            seguinte("prev1", "s1", { lancado_por: "sistema" }),
            // a de s2 é da Fatura que está sendo substituída (mes 2026-11 com fatura): não conta
            seguinte("fatura-velha", "s2", { fatura_id: "f1" }),
          ],
          series: serieDeOut,
        },
        () => ({ data: null, error: null }),
      );
      const r = await m.repo.lerParcelasDoMesAnterior("2026-11");
      expect(r.ok && r.candidatas.map((c) => [c.id, c.proxima_ocupada])).toEqual([
        ["c1", true],
        ["c2", false],
      ]);
      const m2 = montar(
        { lancamentos: [parcela("c1"), seguinte("excl", "s1", { excluido_em: "2026-11-01T00:00:00Z" })], series: serieDeOut },
        () => ({ data: null, error: null }),
      );
      const r2 = await m2.repo.lerParcelasDoMesAnterior("2026-11");
      expect(r2.ok && r2.candidatas[0].proxima_ocupada).toBe(false);
    });

    it("Mês anterior sem parcelas devolve lista vazia; sem conexão e erro de leitura viram falha", async () => {
      const vazio = montar({ lancamentos: [] }, () => ({ data: null, error: null }));
      expect(await vazio.repo.lerParcelasDoMesAnterior("2026-11")).toEqual({ ok: true, candidatas: [] });
      const semRede = montar({}, () => ({ data: null, error: null }), () => false);
      expect((await semRede.repo.lerParcelasDoMesAnterior("2026-11")).ok).toBe(false);
      const erro = montar({}, () => ({ data: null, error: null }), () => true, { errosDeTabela: { lancamentos: { code: "XX" } } });
      expect(await erro.repo.lerParcelasDoMesAnterior("2026-11")).toEqual({ ok: false, codigo: "carregar.falhou" });
    });
  });

  it("importar manda os previstos sem par e usa o updated_at lido junto dos previstos, sem reler", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    await pronto(m);
    const comSemPar: Importacao = { ...importacao, previstos_sem_par: ["p9"] };
    expect(await m.repo.importar(comSemPar, undefined, T1)).toEqual({ ok: true, quantidade: 2 });
    expect(m.chamadas[0].args.previstos_sem_par).toEqual(["p9"]);
    expect(m.chamadas[0].args.lancamentos_atualizados_em).toBe(T1);
    expect(leiturasDoMes(m)).toEqual([]);
  });

  it("importar com updated_at lido junto nulo (Mês sem linhas) não manda a trava", async () => {
    const m = montar({}, () => ({ data: gravados, error: null }));
    await pronto(m);
    await m.repo.importar(importacao, undefined, null);
    expect("lancamentos_atualizados_em" in m.chamadas[0].args).toBe(false);
  });

  it("a recusa de um plano velho chega à tela com o código da RPC", async () => {
    const m = montar({}, () => ({ data: null, error: { message: "fatura.mes_mudou", code: "P0001" } }));
    await pronto(m);
    expect(await m.repo.importar(importacao, { faturaId: "f0", atualizadoEm: T1 })).toEqual({
      ok: false,
      codigo: "fatura.mes_mudou",
    });
  });

  it("os casados e os previstos sem par devolvidos entram na memória do Mês aberto", async () => {
    const m = montar({}, () => ({
      data: { ...gravados, previstos: [{ id: "sem-par", mes: "2026-10", ordem_fatura: null, updated_at: T2 }] },
      error: null,
    }));
    await pronto(m);
    await m.repo.importar(importacao);
    expect(m.lancamentos.linhas().map((l) => l.id).sort()).toEqual(["l1", "l2", "sem-par"]);
  });
});
