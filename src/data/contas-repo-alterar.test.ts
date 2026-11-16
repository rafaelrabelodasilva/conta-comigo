import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { lerContaSalva, type ContaSalva } from "@/domain/alterar-conta";
import { avaliarFormularioConta, type NovaConta, type RascunhoDaConta } from "@/domain/contas-manuais";
import { criarRepoContas, type LinhaConta } from "./contas-repo";
import type { Database } from "./database.types";
import { ESCOPO_DAS_CONTAS, criarGerenciador, type LinhaDe } from "./realtime";

// Editar, Encerrar, Excluir e o "Desfazer" no repositório (História 5.4): um
// Supabase de mentira com tabelas em memória (`.eq/.is/.gte/.order/.range`) e a
// RPC que o teste mandar. Quem decide o que sai, entra e fica é o núcleo
// (`alterar-conta.test.ts`); aqui se prova a fiação: o que é lido, o pedido que
// vai para a RPC, o que entra nos gerenciadores e o que acontece sem internet.

type Lancamento = LinhaDe<"lancamentos">;
const T = "2026-11-10T12:00:00+00:00";
const MES_ATUAL = "2026-11";
const PAGO = "s-pago";

type Linha = Record<string, unknown>;

function consulta(linhas: Linha[], contagem: { paginas: number }, pedidosIn: number[]) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const ordem: string[] = [];
  let faixa: [number, number] | null = null;
  const c = {
    eq(coluna: string, valor: unknown) {
      filtros.push((l) => l[coluna] === valor);
      return c;
    },
    is(coluna: string, valor: unknown) {
      filtros.push((l) => (l[coluna] ?? null) === valor);
      return c;
    },
    gte(coluna: string, valor: string) {
      filtros.push((l) => (l[coluna] as string) >= valor);
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
    order(coluna: string) {
      ordem.push(coluna);
      return c;
    },
    range(de: number, ate: number) {
      faixa = [de, ate];
      return c;
    },
    then(ok: (r: { data: unknown; error: unknown }) => unknown, falha?: (e: unknown) => unknown) {
      let r = linhas.filter((l) => filtros.every((f) => f(l)));
      r = r.sort((a, b) => {
        for (const col of ordem) {
          const x = a[col] as string;
          const y = b[col] as string;
          if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
      });
      if (faixa) {
        contagem.paginas++;
        r = r.slice(faixa[0], faixa[1] + 1);
      }
      return Promise.resolve({ data: r, error: null }).then(ok, falha);
    },
  };
  return c;
}

type RespostaRpc = { data: unknown; error: unknown };

function montar(opcoes: {
  lancamentos?: Linha[];
  status?: Linha[];
  series?: Linha[];
  /** Itens de Pagamento (`lancamento_id`, `excluido_em`). */
  itens?: Linha[];
  rpc?: (n: number, nome: string) => RespostaRpc;
  online?: boolean;
  contas?: LinhaConta[];
}) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  const lidas: string[] = [];
  const contagem = { paginas: 0 };
  const pedidosIn: number[] = [];
  const tabelas: Record<string, Linha[]> = {
    lancamentos: opcoes.lancamentos ?? [],
    status: opcoes.status ?? [{ id: PAGO, conta_como_pago: true }],
    series: opcoes.series ?? [serieDe("c1")],
    pagamento_itens: opcoes.itens ?? [],
  };
  const cliente = {
    from: (tabela: string) => ({
      select: () => {
        lidas.push(tabela);
        return consulta(tabelas[tabela] ?? [], contagem, pedidosIn);
      },
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
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
  memoriaLancamentos.abrirMes(MES_ATUAL);
  const memoriaContas = criarGerenciador<LinhaConta>({ tabela: "contas_manuais", obterCliente: () => cliente, ...(ESCOPO_DAS_CONTAS as object) });
  if (opcoes.contas) memoriaContas.aplicarLote(opcoes.contas);
  const repo = criarRepoContas({ obterCliente: () => cliente, memoriaLancamentos, memoriaContas, online: () => opcoes.online ?? true });
  return { repo, chamadas, lidas, contagem, pedidosIn, memoriaLancamentos, memoriaContas };
}

const linhaConta = (extra: Partial<LinhaConta> = {}): LinhaConta => ({
  id: "c1",
  owner_id: "dono",
  nome: "Silvia",
  valor_centavos: 40_000,
  tipo_id: "t-saude",
  responsavel_id: "r-rafael",
  observacao: null,
  mes_inicial: "2026-09",
  repeticao: "mensal",
  parcela_total: null,
  divisao: null,
  encerrada_em_mes: null,
  excluido_em: null,
  created_at: T,
  updated_at: T,
  ...extra,
});

const salva = (extra: Partial<LinhaConta> = {}): ContaSalva => lerContaSalva(linhaConta(extra))!;

function serieDe(contaId: string, extra: Linha = {}): Linha {
  return {
    conta_manual_id: contaId,
    nome_normalizado: "SILVIA",
    parcela_total: null,
    valor_parcela_centavos: 40_000,
    mes_primeira_parcela: "2026-09",
    ocorrencia: 1,
    ...extra,
  };
}

/** Uma parcela da Silvia (mãe) de `mes` (`parcela_n` desde Set/26). */
function parcela(mes: string, extra: Linha = {}): Linha {
  const n = (Number(mes.slice(0, 4)) - 2026) * 12 + Number(mes.slice(5)) - 8;
  return {
    id: `m-${mes}`,
    conta_manual_id: "c1",
    dividido_de_id: null,
    mes,
    parcela_n: n,
    status_id: null,
    editado_em: null,
    excluido_em: null,
    updated_at: T,
    ...extra,
  };
}

const parcelasDeSetAJan = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"].map((m) => parcela(m));

function nova(extra: Partial<RascunhoDaConta> = {}): NovaConta {
  const original = linhaConta();
  const a = avaliarFormularioConta(
    "c1",
    {
      nome: "Silvia",
      valor: "450,00",
      repeticao: "mensal",
      parcelas: "",
      comecaEm: "2026-09",
      tipo_id: "t-saude",
      observacao: "",
      partes: [{ responsavel_id: "r-rafael", texto: "" }],
      ...extra,
    },
    {
      mesAtual: MES_ATUAL,
      tiposAtivos: new Set(["t-saude"]),
      responsaveisAtivos: new Set(["r-rafael"]),
      original: { mes_inicial: original.mes_inicial, tipo_id: original.tipo_id, responsavel_id: original.responsavel_id, divisao: null },
    },
  );
  expect(a.erros).toEqual({});
  return a.conta as NovaConta;
}

const respostaAlterar = (extra: Partial<LinhaConta> = {}, lancamentos: unknown[] = []): RespostaRpc => ({
  data: { conta: linhaConta({ updated_at: "2026-11-15T12:00:00+00:00", ...extra }), lancamentos },
  error: null,
});

describe("ler a Conta para o aviso", () => {
  it("lê os Lançamentos vivos do Mês atual em diante, os Status que contam como pago e a Série; não grava nada", async () => {
    const { repo, chamadas, lidas } = montar({
      lancamentos: [...parcelasDeSetAJan, parcela("2026-12", { id: "morta", excluido_em: T }), parcela("2026-12", { id: "outra", conta_manual_id: "c2" })],
      status: [{ id: PAGO, conta_como_pago: true }, { id: "s-nao", conta_como_pago: false }],
    });
    const r = await repo.ler(salva(), MES_ATUAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.existentes.map((l) => l.id)).toEqual(["m-2026-11", "m-2026-12", "m-2027-01"]);
    expect([...r.statusQueContam]).toEqual([PAGO]);
    expect(r.serie.atual).toMatchObject({ nome_normalizado: "SILVIA", ocorrencia: 1, parcela_total: null });
    expect(new Set(lidas)).toEqual(new Set(["lancamentos", "status", "series", "pagamento_itens"]));
    expect([...r.comPagamento]).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });

  it("pagina a leitura (o PostgREST corta em 1000 linhas): 1500 Lançamentos vêm em duas páginas", async () => {
    const muitas: Linha[] = Array.from({ length: 1500 }, (_, i) =>
      parcela("2026-12", { id: `f${String(i).padStart(4, "0")}`, dividido_de_id: "m-2026-12", parcela_n: 4 }),
    );
    const { repo, contagem } = montar({ lancamentos: muitas });
    const r = await repo.ler(salva(), MES_ATUAL);
    expect(r.ok && r.existentes.length).toBe(1500);
    expect(contagem.paginas).toBe(2);
  });

  it("lê os ids com item de Pagamento não excluído (AD-15): o de um Pagamento desfeito não conta", async () => {
    const { repo } = montar({
      lancamentos: parcelasDeSetAJan,
      itens: [
        { lancamento_id: "m-2026-12", excluido_em: null },
        { lancamento_id: "m-2027-01", excluido_em: T },
        { lancamento_id: "fora-da-conta", excluido_em: null },
      ],
    });
    const r = await repo.ler(salva(), MES_ATUAL);
    expect(r.ok && [...r.comPagamento]).toEqual(["m-2026-12"]);
  });

  it("os ids vão ao banco em blocos de 100 (o endereço da requisição tem limite)", async () => {
    const muitas: Linha[] = Array.from({ length: 250 }, (_, i) =>
      parcela("2026-12", { id: `f${String(i).padStart(4, "0")}`, dividido_de_id: "m-2026-12", parcela_n: 4 }),
    );
    const { repo, pedidosIn } = montar({ lancamentos: muitas, itens: [{ lancamento_id: "f0249", excluido_em: null }] });
    const r = await repo.ler(salva(), MES_ATUAL);
    expect(pedidosIn).toEqual([100, 100, 50]);
    expect(r.ok && [...r.comPagamento]).toEqual(["f0249"]);
  });

  it("sem internet não lê nada (AD-3)", async () => {
    const { repo, lidas } = montar({ online: false });
    expect(await repo.ler(salva(), MES_ATUAL)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(lidas).toEqual([]);
  });

  it("Série que não é uma só: falha (nada é gravado em cima de um dado torto)", async () => {
    const { repo } = montar({ series: [] });
    expect(await repo.ler(salva(), MES_ATUAL)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });
});

describe("alterar, encerrar e excluir com Pagamento (AD-15)", () => {
  const lancamentos = [...parcelasDeSetAJan.slice(0, 3), parcela("2026-12"), parcela("2027-01")];
  const itens = [{ lancamento_id: "m-2026-12", excluido_em: null }];

  it("Editar: a parcela com Pagamento não é excluída nem recriada e vai para o aviso (`com_pagamento`)", async () => {
    const { repo, chamadas } = montar({ lancamentos, itens, rpc: () => respostaAlterar() });
    const r = await repo.alterar(salva(), nova(), MES_ATUAL);
    const pedido = chamadas[0].args.p_pedido as { excluir: { id: string }[] };
    expect(pedido.excluir.map((e) => e.id)).toEqual(["m-2026-11", "m-2027-01"]);
    expect(r.ok && r.resumo.mantidas).toEqual([{ mes: "2026-12", parcela_n: 4, motivo: "com_pagamento" }]);
  });

  it("Encerrar: a parcela com Pagamento fica", async () => {
    const { repo, chamadas } = montar({ lancamentos, itens, rpc: () => respostaAlterar({ encerrada_em_mes: "2026-12" }) });
    await repo.encerrar(salva(), "2026-12", MES_ATUAL);
    const pedido = chamadas[0].args.p_pedido as { excluir: { id: string }[] };
    expect(pedido.excluir.map((e) => e.id)).toEqual(["m-2027-01"]);
  });

  it("Excluir com os Lançamentos: a parcela com Pagamento fica", async () => {
    const { repo, chamadas } = montar({
      lancamentos,
      itens,
      rpc: () => ({ data: { conta: linhaConta({ excluido_em: T }), lancamentos: [] }, error: null }),
    });
    await repo.excluir(salva(), true, MES_ATUAL);
    const pedido = chamadas[0].args.p_pedido as { excluir: { id: string }[] };
    expect(pedido.excluir.map((e) => e.id)).toEqual(["m-2026-11", "m-2027-01"]);
  });
});

describe("alterar (Editar)", () => {
  const lancamentos = [...parcelasDeSetAJan.slice(0, 3), parcela("2026-12", { status_id: PAGO }), parcela("2027-01")];

  it("manda ao banco só o que o núcleo planejou: exclui o que ainda pode ser recriado, cria o resto, mantém a paga", async () => {
    const { repo, chamadas } = montar({ lancamentos, rpc: () => respostaAlterar({ valor_centavos: 45_000 }) });
    const r = await repo.alterar(salva(), nova(), MES_ATUAL);
    expect(r).toMatchObject({ ok: true, conta: { valor_centavos: 45_000 } });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].nome).toBe("alterar_conta_manual");
    const pedido = chamadas[0].args.p_pedido as {
      conta: { valor_centavos: number; nome_normalizado: string; atualizada_em: string; serie: { valor_parcela_centavos: number; ocorrencia: number } };
      excluir: { id: string; atualizado_em: string }[];
      parcelas: { parcela_n: number; mes: string }[];
      mes_atual: string;
      ate_mes: string;
    };
    expect(pedido.mes_atual).toBe(MES_ATUAL);
    expect(pedido.ate_mes).toBe("2027-11");
    expect(pedido.conta).toMatchObject({ valor_centavos: 45_000, atualizada_em: T, serie: { valor_parcela_centavos: 45_000, ocorrencia: 1 } });
    // Nov/26 e Jan/27 saem (Dez/26 está paga e fica; Set e Out são de antes do Mês atual e nem foram lidos).
    expect(pedido.excluir).toEqual([
      { id: "m-2026-11", atualizado_em: T },
      { id: "m-2027-01", atualizado_em: T },
    ]);
    expect(pedido.parcelas.map((p) => p.mes)).toEqual(["2026-11", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11"]);
    expect(r.ok && r.resumo.mantidas).toEqual([{ mes: "2026-12", parcela_n: 4, motivo: "paga" }]);
  });

  it("aplica as linhas devolvidas (as do Mês aberto) e a Conta nova nos gerenciadores", async () => {
    const devolvida = { ...parcela("2026-11", { id: "novo" }), valor_centavos: 45_000 } as unknown as Lancamento;
    const { repo, memoriaLancamentos, memoriaContas } = montar({
      lancamentos,
      contas: [linhaConta()],
      rpc: () => respostaAlterar({ valor_centavos: 45_000 }, [devolvida, { ...devolvida, id: "outro-mes", mes: "2027-02" }]),
    });
    await repo.alterar(salva(), nova(), MES_ATUAL);
    expect(memoriaLancamentos.linhas().map((l) => l.id)).toEqual(["novo"]);
    expect(memoriaContas.linha("c1")?.valor_centavos).toBe(45_000);
  });

  it("mudar o Nome muda a chave da Série; outra Série com a chave nova dá a próxima ocorrencia", async () => {
    const { repo, chamadas } = montar({
      lancamentos,
      series: [
        serieDe("c1"),
        serieDe("outra", { nome_normalizado: "SILVIA NOVA", valor_parcela_centavos: 45_000, ocorrencia: 1 }),
      ],
      rpc: () => respostaAlterar(),
    });
    await repo.alterar(salva(), nova({ nome: "Silvia Nova" }), MES_ATUAL);
    const serie = (chamadas[0].args.p_pedido as { conta: { serie: Record<string, unknown> } }).conta.serie;
    expect(serie).toMatchObject({ nome_normalizado: "SILVIA NOVA", valor_parcela_centavos: 45_000, ocorrencia: 2 });
  });

  it("outra Conta ocupou a chave no meio (conta.serie_ocupada): lê tudo de novo e tenta uma vez mais", async () => {
    const { repo, chamadas } = montar({
      lancamentos,
      rpc: (n) => (n === 1 ? { data: null, error: { message: "conta.serie_ocupada" } } : respostaAlterar()),
    });
    expect(await repo.alterar(salva(), nova(), MES_ATUAL)).toMatchObject({ ok: true });
    expect(chamadas.map((c) => c.nome)).toEqual(["alterar_conta_manual", "alterar_conta_manual"]);
    const duas = montar({ lancamentos, rpc: () => ({ data: null, error: { message: "conta.serie_ocupada" } }) });
    expect(await duas.repo.alterar(salva(), nova(), MES_ATUAL)).toEqual({ ok: false, codigo: "conta.serie_ocupada" });
    expect(duas.chamadas).toHaveLength(2);
  });

  it("os códigos da RPC chegam à tela (a Conta mudou em outro aparelho, já não existe, sessão)", async () => {
    for (const codigo of ["conta.mudou", "conta.nao_encontrada", "auth.sessao_expirou"] as const) {
      const { repo } = montar({ lancamentos, rpc: () => ({ data: null, error: { message: codigo } }) });
      expect(await repo.alterar(salva(), nova(), MES_ATUAL)).toEqual({ ok: false, codigo });
    }
    const torta = montar({ lancamentos, rpc: () => ({ data: { conta: null }, error: null }) });
    expect(await torta.repo.alterar(salva(), nova(), MES_ATUAL)).toEqual({ ok: false, codigo: "salvar.falhou" });
    const cai = montar({
      lancamentos,
      rpc: () => {
        throw new Error("rede");
      },
    });
    expect(await cai.repo.alterar(salva(), nova(), MES_ATUAL)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("sem internet nada é tentado: nem leitura, nem RPC (AD-3)", async () => {
    const { repo, chamadas, lidas } = montar({ online: false, lancamentos });
    expect(await repo.alterar(salva(), nova(), MES_ATUAL)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(chamadas).toHaveLength(0);
    expect(lidas).toEqual([]);
  });

  it("recusa, resposta torta e sem internet não mexem nas memórias", async () => {
    const { repo, memoriaContas, memoriaLancamentos } = montar({
      lancamentos,
      contas: [linhaConta()],
      rpc: () => ({ data: null, error: { message: "qualquer" } }),
    });
    await repo.alterar(salva(), nova(), MES_ATUAL);
    expect(memoriaContas.linha("c1")).toEqual(linhaConta());
    expect(memoriaLancamentos.linhas()).toEqual([]);
  });
});

describe("encerrar", () => {
  const lancamentos = [...parcelasDeSetAJan.slice(0, 3), parcela("2026-12", { status_id: PAGO }), parcela("2027-01"), parcela("2027-02")];

  it("grava a Conta com `encerrada_em_mes` e exclui só as parcelas recriáveis do Mês escolhido em diante", async () => {
    const { repo, chamadas } = montar({ lancamentos, rpc: () => respostaAlterar({ encerrada_em_mes: "2027-01" }) });
    const r = await repo.encerrar(salva(), "2027-01", MES_ATUAL);
    expect(r).toMatchObject({ ok: true, resumo: { excluidas: 2, criadas: 0, mantidas: [] } });
    const pedido = chamadas[0].args.p_pedido as { conta: Record<string, unknown>; excluir: { id: string }[]; parcelas: unknown[] };
    expect(chamadas[0].nome).toBe("alterar_conta_manual");
    expect(pedido.conta).toMatchObject({ encerrada_em_mes: "2027-01", nome: "Silvia", valor_centavos: 40_000 });
    expect(pedido.excluir.map((e) => e.id)).toEqual(["m-2027-01", "m-2027-02"]);
    expect(pedido.parcelas).toEqual([]);
  });

  it("um Mês que o núcleo recusa nunca chega ao banco (antes do Mês atual, Conta já encerrada)", async () => {
    const a = montar({ lancamentos, rpc: () => respostaAlterar() });
    expect(await a.repo.encerrar(salva(), "2026-10", MES_ATUAL)).toEqual({ ok: false, codigo: "conta.encerrar_no_passado" });
    const b = montar({ lancamentos, rpc: () => respostaAlterar() });
    expect(await b.repo.encerrar(salva({ encerrada_em_mes: "2026-10" }), "2027-01", MES_ATUAL)).toEqual({ ok: false, codigo: "conta.ja_encerrada" });
    expect(a.chamadas).toHaveLength(0);
    expect(b.chamadas).toHaveLength(0);
  });

  it("sem internet nada é tentado", async () => {
    const { repo, chamadas } = montar({ online: false, lancamentos });
    expect(await repo.encerrar(salva(), "2027-01", MES_ATUAL)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(chamadas).toHaveLength(0);
  });
});

describe("excluir e o Desfazer", () => {
  const lancamentos = [...parcelasDeSetAJan.slice(0, 3), parcela("2026-12", { status_id: PAGO }), parcela("2027-01")];
  const filhaDe = (mae: string): Linha => ({ ...parcela("2027-01", { id: `f-${mae}`, dividido_de_id: mae }) });

  const respostaExcluir = (ids: string[]): RespostaRpc => ({
    data: {
      conta: linhaConta({ excluido_em: "2026-11-15T12:00:00+00:00", updated_at: "2026-11-15T12:00:00+00:00" }),
      lancamentos: ids.map((id) => ({ ...parcela("2026-11", { id }), excluido_em: "2026-11-15T12:00:00+00:00" })),
    },
    error: null,
  });

  it("com os Lançamentos: manda os recriáveis (mãe e filhas juntas), devolve o pedido do Desfazer com os mesmos ids e tira a Conta da lista", async () => {
    const { repo, chamadas, memoriaContas } = montar({
      lancamentos: [...lancamentos, filhaDe("m-2027-01")],
      contas: [linhaConta()],
      rpc: () => respostaExcluir(["m-2026-11", "m-2027-01", "f-m-2027-01"]),
    });
    expect(memoriaContas.linhas()).toHaveLength(1);
    const r = await repo.excluir(salva(), true, MES_ATUAL);
    expect(chamadas[0].nome).toBe("excluir_conta_manual");
    const pedido = chamadas[0].args.p_pedido as { conta_id: string; excluir: { id: string }[]; mes_atual: string };
    expect(pedido.conta_id).toBe("c1");
    expect(pedido.excluir.map((e) => e.id)).toEqual(["m-2026-11", "m-2027-01", "f-m-2027-01"]);
    expect(r).toMatchObject({
      ok: true,
      resumo: { excluidas: 2, mantidas: [{ mes: "2026-12", motivo: "paga" }] },
      desfazer: { conta_id: "c1", ids: ["m-2026-11", "m-2027-01", "f-m-2027-01"] },
    });
    // A Conta excluída sai da memória da lista (o gerenciador guarda só as vivas).
    expect(memoriaContas.linhas()).toEqual([]);
  });

  it("só a conta: não lê os Lançamentos e não manda nenhum para excluir (as parcelas ficam)", async () => {
    const { repo, chamadas, lidas } = montar({ lancamentos, contas: [linhaConta()], rpc: () => respostaExcluir([]) });
    const r = await repo.excluir(salva(), false, MES_ATUAL);
    expect(lidas).toEqual([]);
    expect((chamadas[0].args.p_pedido as { excluir: unknown[] }).excluir).toEqual([]);
    expect(r).toMatchObject({ ok: true, resumo: { excluidas: 0 }, desfazer: { conta_id: "c1", ids: [] } });
  });

  it("o Desfazer manda `restaurar_conta_manual` com os mesmos ids e a Conta volta para a lista", async () => {
    const { repo, chamadas, memoriaContas } = montar({
      contas: [linhaConta()],
      rpc: (_n, nome) =>
        nome === "excluir_conta_manual"
          ? respostaExcluir(["m-2026-11"])
          : { data: { conta: linhaConta({ updated_at: "2026-11-15T12:01:00+00:00" }), lancamentos: [parcela("2026-11", { id: "m-2026-11" })] }, error: null },
      lancamentos,
    });
    const r = await repo.excluir(salva(), true, MES_ATUAL);
    expect(memoriaContas.linhas()).toEqual([]);
    if (!r.ok) throw new Error("excluir falhou");
    const volta = await repo.restaurar(r.desfazer);
    expect(chamadas.at(-1)).toEqual({ nome: "restaurar_conta_manual", args: { p_pedido: { conta_id: "c1", ids: ["m-2026-11"] } } });
    expect(volta).toMatchObject({ ok: true, restauradas: 1 });
    expect(memoriaContas.linhas().map((c) => c.id)).toEqual(["c1"]);
  });

  it("restaurar sem internet não tenta nada; recusa do banco devolve o código", async () => {
    const off = montar({ online: false });
    expect(await off.repo.restaurar({ conta_id: "c1", ids: [] })).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(off.chamadas).toHaveLength(0);
    const recusa = montar({ rpc: () => ({ data: null, error: { message: "conta.nao_encontrada" } }) });
    expect(await recusa.repo.restaurar({ conta_id: "c1", ids: [] })).toEqual({ ok: false, codigo: "conta.nao_encontrada" });
  });

  it("sem internet, excluir não lê nem grava; um lançamento alterado no meio (conta.mudou) volta como código", async () => {
    const off = montar({ online: false, lancamentos });
    expect(await off.repo.excluir(salva(), true, MES_ATUAL)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(off.chamadas).toHaveLength(0);
    expect(off.lidas).toEqual([]);
    const mudou = montar({ lancamentos, rpc: () => ({ data: null, error: { message: "conta.mudou" } }) });
    expect(await mudou.repo.excluir(salva(), true, MES_ATUAL)).toEqual({ ok: false, codigo: "conta.mudou" });
  });
});

describe("o gerenciador de Contas guarda só as vivas (AD-16)", () => {
  it("a Conta excluída (aqui ou em outro aparelho) sai; o Desfazer a traz de volta; uma excluída nunca entra", () => {
    const { memoriaContas } = montar({ contas: [linhaConta(), linhaConta({ id: "c9", excluido_em: T })] });
    expect(memoriaContas.linhas().map((c) => c.id)).toEqual(["c1"]);
    memoriaContas.aplicarLote([linhaConta({ excluido_em: "2026-11-15T12:00:00+00:00", updated_at: "2026-11-15T12:00:00+00:00" })]);
    expect(memoriaContas.linhas()).toEqual([]);
    memoriaContas.aplicarLote([linhaConta({ excluido_em: null, updated_at: "2026-11-15T12:01:00+00:00" })]);
    expect(memoriaContas.linhas().map((c) => c.id)).toEqual(["c1"]);
  });
});
