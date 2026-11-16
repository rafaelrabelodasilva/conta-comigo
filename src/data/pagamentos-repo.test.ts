import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PedidoDePagamento } from "@/domain/pagamento";
import type { Database } from "./database.types";
import { criarRepoPagamentos, type LinhaItemDePagamento, type LinhaPagamento } from "./pagamentos-repo";
import { criarGerenciador, ESCOPO_DO_HISTORICO, type LinhaDe } from "./realtime";

// Aplicar e desfazer no repositório (História 6.1): um Supabase de mentira com
// tabelas em memória (`.eq/.neq/.in/.is/.limit`) e a RPC que o teste mandar. Quem
// decide os itens e o que volta é o núcleo (`pagamento.test.ts`); aqui se prova a
// fiação: o que é lido, o pedido que vai para a RPC, o que entra nos gerenciadores
// e o que acontece sem internet ou com recusa.

type Lancamento = LinhaDe<"lancamentos">;
type Linha = Record<string, unknown>;
const T = "2026-11-10T12:00:00.000001+00:00";
const T2 = "2026-11-15T12:00:00.000001+00:00";
const MES = "2026-10";
const PAGO = "s-pago";
const NAO_PAGO = "s-nao-pago";

function consulta(linhas: Linha[], pedidosIn: number[], falha = false) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const c = {
    eq(coluna: string, valor: unknown) {
      filtros.push((l) => l[coluna] === valor);
      return c;
    },
    neq(coluna: string, valor: unknown) {
      filtros.push((l) => l[coluna] !== valor);
      return c;
    },
    is(coluna: string, valor: unknown) {
      filtros.push((l) => (l[coluna] ?? null) === valor);
      return c;
    },
    in(coluna: string, valores: unknown[]) {
      pedidosIn.push(valores.length);
      filtros.push((l) => valores.includes(l[coluna]));
      return c;
    },
    limit() {
      return c;
    },
    then(ok: (r: { data: unknown; error: unknown }) => unknown, rejeita?: (e: unknown) => unknown) {
      return Promise.resolve(
        falha ? { data: null, error: { message: "falhou" } } : { data: linhas.filter((l) => filtros.every((f) => f(l))), error: null },
      ).then(ok, rejeita);
    },
  };
  return c;
}

type RespostaRpc = { data: unknown; error: unknown };

function montar(opcoes: {
  lancamentos?: Linha[];
  itens?: Linha[];
  rpc?: (n: number, nome: string) => RespostaRpc;
  online?: boolean;
  lanca?: boolean;
  /** Toda leitura volta com erro. */
  leituraFalha?: boolean;
}) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  const lidas: string[] = [];
  const pedidosIn: number[] = [];
  const tabelas: Record<string, Linha[]> = { lancamentos: opcoes.lancamentos ?? [], pagamento_itens: opcoes.itens ?? [] };
  const cliente = {
    from: (tabela: string) => ({
      select: () => {
        lidas.push(tabela);
        if (opcoes.leituraFalha) return consulta([], pedidosIn, true);
        return consulta(tabelas[tabela] ?? [], pedidosIn);
      },
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      if (opcoes.lanca) throw new Error("rede caiu");
      return (opcoes.rpc ?? (() => ({ data: null, error: null })))(chamadas.length, nome);
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
  const memoriaLancamentos = criarGerenciador<Lancamento>({ tabela: "lancamentos", obterCliente: () => cliente, porMes: true });
  memoriaLancamentos.abrirMes(MES);
  const memoriaItens = criarGerenciador<LinhaItemDePagamento>({ tabela: "pagamento_itens", obterCliente: () => cliente, porMes: true });
  memoriaItens.abrirMes(MES);
  // O Histórico (6.3): os Pagamentos vivos e os itens vivos de todos os Meses.
  const memoriaPagamentos = criarGerenciador<LinhaPagamento>({ tabela: "pagamentos", obterCliente: () => cliente, ...ESCOPO_DO_HISTORICO });
  const memoriaItensDoHistorico = criarGerenciador<LinhaItemDePagamento>({
    tabela: "pagamento_itens",
    obterCliente: () => cliente,
    canal: "tabela:pagamento_itens:historico",
    ...ESCOPO_DO_HISTORICO,
  });
  // Recebimentos (6.5): os Lançamentos de TODOS os Meses (sem escopo por Mês).
  const memoriaTodos = criarGerenciador<Lancamento>({ tabela: "lancamentos", obterCliente: () => cliente, canal: "tabela:lancamentos:todos", paginar: true });
  const repo = criarRepoPagamentos({
    obterCliente: () => cliente,
    memoriaLancamentos,
    memoriaItens,
    memoriaPagamentos,
    memoriaItensDoHistorico,
    memoriaTodosOsLancamentos: memoriaTodos,
    online: () => opcoes.online ?? true,
  });
  return { repo, chamadas, lidas, pedidosIn, memoriaLancamentos, memoriaItens, memoriaPagamentos, memoriaItensDoHistorico, memoriaTodos };
}

const pedido: PedidoDePagamento = {
  id: "pg1",
  status_id: PAGO,
  data: "2026-11-15",
  valor_recebido_centavos: 31516,
  modo: "total",
  itens: [
    { lancamento_id: "l1", valor_centavos: 10000, atualizado_em: T, quita: true },
    { lancamento_id: "l2", valor_centavos: 21516, atualizado_em: T, quita: true },
  ],
};

// "Fica pendente" (6.2): R$ 100,00 de uma linha de R$ 215,16: um item parcial, sem Status aplicado.
const pedidoParcial: PedidoDePagamento = {
  id: "pg1",
  status_id: PAGO,
  data: "2026-11-15",
  valor_recebido_centavos: 10000,
  modo: "parcial",
  itens: [{ lancamento_id: "l1", valor_centavos: 10000, atualizado_em: T, quita: false }],
};

const pagamento = (extra: Partial<LinhaPagamento> = {}): LinhaPagamento => ({
  id: "pg1",
  owner_id: "dono",
  valor_recebido_centavos: 31516,
  data: "2026-11-15",
  modo: "total",
  excluido_em: null,
  created_at: T2,
  updated_at: T2,
  ...extra,
});

const itemDb = (id: string, lancamento: string, extra: Partial<LinhaItemDePagamento> = {}): LinhaItemDePagamento => ({
  id,
  owner_id: "dono",
  pagamento_id: "pg1",
  lancamento_id: lancamento,
  mes: MES,
  valor_centavos: 100,
  status_anterior_id: NAO_PAGO,
  status_aplicado_id: PAGO,
  excluido_em: null,
  created_at: T,
  updated_at: T,
  ...extra,
});

const lancamentoDb = (id: string, extra: Partial<Lancamento> = {}) =>
  ({ id, owner_id: "dono", mes: MES, valor_centavos: 100, status_id: PAGO, excluido_em: null, updated_at: T2, ordem_fatura: 1, ...extra }) as unknown as Lancamento & Linha;

const resposta = (itens: LinhaItemDePagamento[], lancamentos: Lancamento[], p = pagamento()): RespostaRpc => ({
  data: { pagamento: p, itens, lancamentos },
  error: null,
});

describe("aplicar", () => {
  it("as linhas pagas de QUALQUER Mês vão também para os Lançamentos de todos os Meses (Recebimentos, 6.5), sem esperar o Realtime", async () => {
    const linhas = [lancamentoDb("l1"), lancamentoDb("l3", { mes: "2026-09" })];
    const { repo, memoriaLancamentos, memoriaTodos } = montar({ rpc: () => resposta([itemDb("i1", "l1"), itemDb("i3", "l3", { mes: "2026-09" })], linhas) });
    expect((await repo.aplicar(pedido)).ok).toBe(true);
    expect(memoriaTodos.linhas().map((l) => l.id).sort()).toEqual(["l1", "l3"]);
    // O gerenciador do Mês aberto segue guardando só o Mês aberto (AD-4).
    expect(memoriaLancamentos.linhas().map((l) => l.id)).toEqual(["l1"]);
  });

  it("manda o pedido do núcleo à RPC e aplica o Pagamento, os itens e as linhas nos gerenciadores", async () => {
    const itens = [itemDb("i1", "l1"), itemDb("i2", "l2"), itemDb("i3", "l3", { mes: "2026-09" })];
    const linhas = [lancamentoDb("l1"), lancamentoDb("l2"), lancamentoDb("l3", { mes: "2026-09" })];
    const m = montar({ rpc: () => resposta(itens, linhas) });
    const r = await m.repo.aplicar(pedido);
    expect(r).toMatchObject({ ok: true, pagamento: { id: "pg1" } });
    expect(m.chamadas).toEqual([{ nome: "aplicar_pagamento", args: { p_pedido: pedido } }]);
    // Só o Mês aberto fica na memória.
    expect(m.memoriaLancamentos.linhas().map((l) => l.id).sort()).toEqual(["l1", "l2"]);
    expect(m.memoriaItens.linhas().map((i) => i.id).sort()).toEqual(["i1", "i2"]);
    expect(m.lidas).toEqual([]);
  });

  it("Fica pendente: o pedido parcial vai como está e o item parcial (sem Status aplicado) entra na memória", async () => {
    const itens = [itemDb("i1", "l1", { valor_centavos: 10000, status_aplicado_id: null })];
    const m = montar({ rpc: () => resposta(itens, [lancamentoDb("l1", { status_id: NAO_PAGO })], pagamento({ modo: "parcial", valor_recebido_centavos: 10000 })) });
    const r = await m.repo.aplicar(pedidoParcial);
    expect(r).toMatchObject({ ok: true, pagamento: { id: "pg1", modo: "parcial" } });
    expect(m.chamadas).toEqual([{ nome: "aplicar_pagamento", args: { p_pedido: pedidoParcial } }]);
    expect(m.memoriaItens.linha("i1")?.status_aplicado_id).toBeNull();
    expect(m.memoriaLancamentos.linha("l1")?.status_id).toBe(NAO_PAGO);
  });

  it("Não é dívida, é a minha parte: o pedido leva o valor recebido e os itens inteiros", async () => {
    const minhaParte: PedidoDePagamento = { ...pedido, valor_recebido_centavos: 5000, modo: "minha_parte" };
    const m = montar({ rpc: () => resposta([itemDb("i1", "l1")], [lancamentoDb("l1")], pagamento({ modo: "minha_parte", valor_recebido_centavos: 5000 })) });
    expect(await m.repo.aplicar(minhaParte)).toMatchObject({ ok: true, pagamento: { modo: "minha_parte" } });
    expect(m.chamadas[0].args.p_pedido).toEqual(minhaParte);
  });

  it("os códigos da RPC chegam à tela; o resto vira salvar.falhou", async () => {
    for (const codigo of ["pagamento.mudou", "pagamento.status_invalido", "pagamento.ja_desfeito", "pagamento.desfazer_antes", "auth.sessao_expirou"]) {
      const m = montar({ rpc: () => ({ data: null, error: { message: `ERROR: ${codigo}` } }) });
      expect(await m.repo.aplicar(pedido)).toEqual({ ok: false, codigo });
    }
    const outro = montar({ rpc: () => ({ data: null, error: { message: "deadlock detected" } }) });
    expect(await outro.repo.aplicar(pedido)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("resposta torta ou rede caída: salvar.falhou e nada entra nas memórias", async () => {
    const torta = montar({ rpc: () => ({ data: { pagamento: null, itens: [], lancamentos: [] }, error: null }) });
    expect(await torta.repo.aplicar(pedido)).toEqual({ ok: false, codigo: "salvar.falhou" });
    const cai = montar({ lanca: true });
    expect(await cai.repo.aplicar(pedido)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(cai.memoriaLancamentos.linhas()).toEqual([]);
  });

  it("sem internet nada é tentado (AD-3)", async () => {
    const m = montar({ online: false });
    expect(await m.repo.aplicar(pedido)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.chamadas).toHaveLength(0);
  });
});

describe("desfazer", () => {
  const itens = [
    { lancamento_id: "l1", status_anterior_id: NAO_PAGO, status_aplicado_id: PAGO, created_at: T, pagamento_id: "pg1", excluido_em: null },
    { lancamento_id: "l2", status_anterior_id: null, status_aplicado_id: PAGO, created_at: T, pagamento_id: "pg1", excluido_em: null },
    // Um item já desfeito do mesmo Pagamento e um de outro Pagamento (posterior) em l2.
    { lancamento_id: "l3", status_anterior_id: NAO_PAGO, status_aplicado_id: PAGO, created_at: T, pagamento_id: "pg1", excluido_em: T2 },
    { lancamento_id: "l2", status_anterior_id: PAGO, status_aplicado_id: PAGO, created_at: T2, pagamento_id: "pg2", excluido_em: null },
  ];
  const lancamentos = [
    { id: "l1", status_id: PAGO, updated_at: T },
    { id: "l2", status_id: PAGO, updated_at: T2 },
  ];

  it("lê o Pagamento, as linhas e os itens de outros Pagamentos, e manda à RPC só o que o núcleo devolve (AD-10)", async () => {
    const m = montar({ lancamentos, itens, rpc: () => resposta([itemDb("i1", "l1", { excluido_em: T2 })], [lancamentoDb("l1", { status_id: NAO_PAGO })], pagamento({ excluido_em: T2 })) });
    const r = await m.repo.desfazer("pg1");
    expect(r.ok).toBe(true);
    expect(m.chamadas).toHaveLength(1);
    expect(m.chamadas[0].nome).toBe("desfazer_pagamento");
    // l2 tem um Pagamento posterior: fica como está. Só l1 volta.
    expect(m.chamadas[0].args.p_pedido).toEqual({
      pagamento_id: "pg1",
      devolver: [{ lancamento_id: "l1", status_id: NAO_PAGO, atualizado_em: T }],
    });
    expect(new Set(m.lidas)).toEqual(new Set(["pagamento_itens", "lancamentos"]));
    expect(m.memoriaLancamentos.linha("l1")?.status_id).toBe(NAO_PAGO);
  });

  it("o item parcial não mudou o Status: não há o que devolver, e a RPC recebe `devolver` vazio", async () => {
    const parciais = [{ lancamento_id: "l1", status_anterior_id: NAO_PAGO, status_aplicado_id: null, created_at: T, pagamento_id: "pg1", excluido_em: null }];
    const m = montar({ lancamentos: [{ id: "l1", status_id: NAO_PAGO, updated_at: T }], itens: parciais, rpc: () => resposta([], [], pagamento({ excluido_em: T2 })) });
    expect((await m.repo.desfazer("pg1")).ok).toBe(true);
    expect(m.chamadas[0].args.p_pedido).toEqual({ pagamento_id: "pg1", devolver: [] });
  });

  it("lê as linhas em blocos de 100 (o endereço da requisição tem limite)", async () => {
    const muitos = Array.from({ length: 250 }, (_, i) => ({
      lancamento_id: `x${i}`,
      status_anterior_id: NAO_PAGO,
      status_aplicado_id: PAGO,
      created_at: T,
      pagamento_id: "pg1",
      excluido_em: null,
    }));
    const m = montar({ itens: muitos, rpc: () => resposta([], []) });
    await m.repo.desfazer("pg1");
    // Duas leituras (as linhas e os outros itens), cada uma em 100 + 100 + 50.
    expect([...m.pedidosIn].sort((a, b) => a - b)).toEqual([50, 50, 100, 100, 100, 100]);
  });

  it("um Pagamento já desfeito (sem itens vivos): pagamento.ja_desfeito, e o estado que a RPC devolve vai para a memória", async () => {
    const m = montar({ itens: [], rpc: () => resposta([], [], pagamento({ excluido_em: T2 })) });
    // Outro aparelho o desfez: aqui ele ainda aparece no Histórico.
    m.memoriaPagamentos.aplicarLote([pagamento({ updated_at: T })]);
    expect(m.memoriaPagamentos.linhas()).toHaveLength(1);
    expect(await m.repo.desfazer("pg1")).toEqual({ ok: false, codigo: "pagamento.ja_desfeito" });
    expect(m.chamadas[0].args.p_pedido).toEqual({ pagamento_id: "pg1", devolver: [] });
    expect(m.memoriaPagamentos.linhas()).toEqual([]);
  });

  it("os códigos da RPC chegam à tela (a linha mudou desde a leitura, o Pagamento não existe)", async () => {
    for (const codigo of ["pagamento.mudou", "pagamento.nao_encontrado"]) {
      const m = montar({ lancamentos, itens, rpc: () => ({ data: null, error: { message: codigo } }) });
      expect(await m.repo.desfazer("pg1")).toEqual({ ok: false, codigo });
    }
  });

  it("sem internet nada é lido nem gravado", async () => {
    const m = montar({ online: false, lancamentos, itens });
    expect(await m.repo.desfazer("pg1")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.lidas).toEqual([]);
    expect(m.chamadas).toHaveLength(0);
  });
});

describe("desfazer com o que a janela viu (História 6.3)", () => {
  const itens = [
    { lancamento_id: "l1", status_anterior_id: NAO_PAGO, status_aplicado_id: PAGO, created_at: T, pagamento_id: "pg1", excluido_em: null },
    { lancamento_id: "l2", status_anterior_id: NAO_PAGO, status_aplicado_id: PAGO, created_at: T, pagamento_id: "pg1", excluido_em: null },
  ];
  const lancamentos = [
    { id: "l1", status_id: PAGO, updated_at: T },
    { id: "l2", status_id: PAGO, updated_at: T },
  ];
  const visto = [
    { lancamento_id: "l1", destino: "devolver" as const },
    { lancamento_id: "l2", destino: "devolver" as const },
  ];
  const desfeito = () => resposta([itemDb("i1", "l1", { excluido_em: T2, updated_at: T2 })], [lancamentoDb("l1", { status_id: NAO_PAGO })], pagamento({ excluido_em: T2, updated_at: T2 }));

  it("a prévia classifica cada item sem gravar nada (nem chamar a RPC)", async () => {
    const m = montar({
      lancamentos: [lancamentos[0], { id: "l2", status_id: "s-outro", updated_at: T }],
      itens: [...itens, { lancamento_id: "l1", status_anterior_id: null, status_aplicado_id: null, created_at: T2, pagamento_id: "pg2", excluido_em: null }],
    });
    const r = await m.repo.previaDoDesfazer("pg1");
    // l1 tem um Pagamento posterior; l2 teve o Status mudado.
    expect(r).toMatchObject({
      ok: true,
      itens: [
        { lancamento_id: "l1", destino: "pagamento_posterior" },
        { lancamento_id: "l2", destino: "status_mudou" },
      ],
    });
    expect(m.chamadas).toEqual([]);
  });

  it("a prévia de um Pagamento sem item vivo diz que já foi desfeito; sem internet nada é lido", async () => {
    expect(await montar({ itens: [] }).repo.previaDoDesfazer("pg1")).toEqual({ ok: false, codigo: "pagamento.ja_desfeito" });
    const off = montar({ online: false, lancamentos, itens });
    expect(await off.repo.previaDoDesfazer("pg1")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(off.lidas).toEqual([]);
  });

  it("desfaz quando o plano de agora é o que a janela viu", async () => {
    const m = montar({ lancamentos, itens, rpc: desfeito });
    expect((await m.repo.desfazer("pg1", visto)).ok).toBe(true);
    expect(m.chamadas).toHaveLength(1);
  });

  it("outro aparelho mudou uma linha entre a janela e a confirmação: pagamento.mudou e nada é gravado", async () => {
    // A janela viu l2 voltando; agora o Status de l2 já é outro.
    const m = montar({ lancamentos: [lancamentos[0], { id: "l2", status_id: "s-outro", updated_at: T2 }], itens, rpc: desfeito });
    expect(await m.repo.desfazer("pg1", visto)).toEqual({ ok: false, codigo: "pagamento.mudou" });
    expect(m.chamadas).toEqual([]);
  });

  it("o Pagamento sai do Histórico e os itens saem da memória dos itens vivos", async () => {
    const m = montar({ lancamentos, itens, rpc: desfeito });
    m.memoriaPagamentos.aplicarLote([pagamento({ updated_at: T })]);
    m.memoriaItensDoHistorico.aplicarLote([itemDb("i1", "l1"), itemDb("i2", "l2")]);
    expect(m.memoriaItensDoHistorico.linhas()).toHaveLength(2);
    await m.repo.desfazer("pg1");
    expect(m.memoriaPagamentos.linhas()).toEqual([]);
    // O item desfeito (i1) sai; i2 não veio na resposta e fica até o Realtime trazer o UPDATE dele.
    expect(m.memoriaItensDoHistorico.linhas().map((i) => i.id)).toEqual(["i2"]);
  });

  it("aplicar põe o Pagamento e os itens no Histórico (todos os Meses)", async () => {
    const itensDb = [itemDb("i1", "l1"), itemDb("i3", "l3", { mes: "2026-09" })];
    const m = montar({ rpc: () => resposta(itensDb, [lancamentoDb("l1")]) });
    await m.repo.aplicar(pedido);
    expect(m.memoriaPagamentos.linhas().map((p) => p.id)).toEqual(["pg1"]);
    expect(m.memoriaItensDoHistorico.linhas().map((i) => i.id).sort()).toEqual(["i1", "i3"]);
  });
});

describe("as leituras do Histórico (História 6.3)", () => {
  const muitas = Array.from({ length: 250 }, (_, i) => ({ id: `x${i}`, responsavel_id: "r1", ajuste_de_id: null }));

  it("de quem são as linhas: em blocos de 100 ids", async () => {
    const m = montar({ lancamentos: muitas });
    const r = await m.repo.responsaveisDasLinhas(muitas.map((l) => l.id));
    expect(r).toHaveLength(250);
    expect(m.pedidosIn).toEqual([100, 100, 50]);
  });

  it("as linhas inteiras do detalhe também vão em blocos de 100", async () => {
    const m = montar({ lancamentos: muitas });
    expect(await m.repo.linhasDoPagamento(muitas.map((l) => l.id))).toHaveLength(250);
    expect(m.pedidosIn).toEqual([100, 100, 50]);
  });

  it("sem ids não lê nada; leitura que falha ou rede caída devolve null", async () => {
    const m = montar({ lancamentos: muitas });
    expect(await m.repo.responsaveisDasLinhas([])).toEqual([]);
    expect(m.lidas).toEqual([]);
    const falha = montar({ lancamentos: muitas, leituraFalha: true });
    expect(await falha.repo.responsaveisDasLinhas(["x1"])).toBeNull();
    expect(await falha.repo.linhasDoPagamento(["x1"])).toBeNull();
  });
});
