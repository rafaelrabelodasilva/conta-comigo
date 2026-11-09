import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { criarRepoLancamentos, mudancaDaColuna, type LinhaLancamento } from "./lancamentos-repo";
import { criarGerenciador } from "./realtime";

// Cliente falso: registra o corpo de cada chamada e responde o que o teste
// mandar; a memória é um gerenciador por Mês de verdade, com outubro aberto.

type Chamada = { tipo: "insert" | "update"; corpo: Record<string, unknown>; id?: string; ids?: string[] };

const T1 = "2026-11-08T00:00:00.000001+00:00";
const T2 = "2026-11-08T00:14:00.000002+00:00";
const AGORA = new Date("2026-11-08T00:14:00Z");

const linha = (id: string, extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id,
    owner_id: "dono",
    nome: "BELLA PIETRA",
    nome_normalizado: "BELLA PIETRA",
    apelido: null,
    valor_centavos: 80000,
    data: "2026-09-12",
    parcela_n: null,
    parcela_total: null,
    final_cartao: "8673",
    mes: "2026-10",
    fatura_id: "f10",
    ordem_fatura: 1,
    duvida_extracao: false,
    lancado_por: "fatura",
    responsavel_id: null,
    tipo_id: null,
    status_id: null,
    observacao: null,
    editado_em: null,
    excluido_em: null,
    created_at: T1,
    updated_at: T1,
    ...extra,
  }) as LinhaLancamento;

function montar(iniciais: LinhaLancamento[], responder: (c: Chamada) => { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = [];
  const consulta = (c: Chamada) => {
    const encadeada = {
      eq(_coluna: string, valor: string) {
        c.id = valor;
        return encadeada;
      },
      // Várias linhas numa requisição (Ajustes): `update … in (ids)`, sem `single`.
      in(_coluna: string, valores: string[]) {
        c.ids = valores;
        return { select: async () => responder(c) };
      },
      select: () => encadeada,
      single: async () => responder(c),
    };
    chamadas.push(c);
    return encadeada;
  };
  const cliente = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: iniciais, error: null }) }),
      insert: (corpo: Record<string, unknown>) => consulta({ tipo: "insert", corpo }),
      update: (corpo: Record<string, unknown>) => consulta({ tipo: "update", corpo }),
    }),
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

  const memoria = criarGerenciador<LinhaLancamento>({ tabela: "lancamentos", obterCliente: () => cliente, porMes: true });
  const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  m.memoria.abrirMes("2026-10");
  await new Promise((r) => setTimeout(r, 0));
  expect(m.memoria.retrato().status).toBe("pronto");
}

describe("repositório de Lançamentos", () => {
  it("Classificar: grava só responsavel_id e editado_em, e devolve a linha gravada", async () => {
    const m = montar([linha("a")], (c) => ({ data: linha("a", { ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.atualizar("a", mudancaDaColuna({ coluna: "responsavel_id", valor: "r-casal" }), { agora: AGORA });
    expect(m.chamadas).toEqual([
      { tipo: "update", corpo: { responsavel_id: "r-casal", editado_em: "2026-11-08T00:14:00.000Z" }, id: "a" },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "a", responsavel_id: "r-casal", updated_at: T2 } });
    expect(m.memoria.linha("a")?.updated_at).toBe(T2);
  });

  it("só as colunas que mudaram; sem mudança, não chama o banco e devolve a da memória", async () => {
    const m = montar([linha("a", { apelido: "Pedras" })], (c) => ({ data: linha("a", { ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.atualizar("a", { apelido: "Pedras" });
    expect(r).toMatchObject({ ok: true, linha: { updated_at: T1 } });
    expect(m.chamadas).toEqual([]);
    await m.repo.atualizar("a", { apelido: "Pedras", valor_centavos: 8000 }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({ valor_centavos: 8000, editado_em: "2026-11-08T00:14:00.000Z" });
  });

  it("otimismo: a memória muda já; recusa do banco desfaz", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: { code: "23514" } }));
    await pronto(m);
    const gravacao = m.repo.atualizar("a", { valor_centavos: 8000 });
    expect(m.memoria.linha("a")?.valor_centavos).toBe(8000);
    expect(await gravacao).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("a")?.valor_centavos).toBe(80000);
  });

  it("incluir: sem otimismo, manda a linha do núcleo e aplica a devolvida", async () => {
    const novo = {
      nome: "AJUSTE",
      nome_normalizado: "AJUSTE",
      valor_centavos: 1000,
      data: null,
      apelido: null,
      observacao: null,
      responsavel_id: null,
      tipo_id: null,
      status_id: null,
      lancado_por: "manual" as const,
      mes: "2026-10",
      fatura_id: "f10",
      final_cartao: "8673",
    };
    const m = montar([], (c) => ({ data: linha("novo", { ...c.corpo, ordem_fatura: null, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.incluir(novo);
    expect(m.chamadas).toEqual([{ tipo: "insert", corpo: novo }]);
    expect(r).toMatchObject({ ok: true, linha: { id: "novo", lancado_por: "manual" } });
    expect(m.memoria.linha("novo")?.valor_centavos).toBe(1000);
  });

  it("incluir em outro Mês: devolve a linha, mas a memória (só o Mês aberto) não guarda", async () => {
    const m = montar([], (c) => ({ data: linha("dez", { ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.incluir({
      nome: "X",
      nome_normalizado: "X",
      valor_centavos: 1,
      data: "2026-11-20",
      apelido: null,
      observacao: null,
      responsavel_id: null,
      tipo_id: null,
      status_id: null,
      lancado_por: "manual",
      mes: "2026-12",
      fatura_id: null,
      final_cartao: null,
    });
    expect(r).toMatchObject({ ok: true, linha: { mes: "2026-12" } });
    expect(m.memoria.linha("dez")).toBeUndefined();
  });

  it("excluir grava só excluido_em; restaurar limpa no mesmo id", async () => {
    const m = montar([linha("a")], (c) => ({ data: linha("a", { ...c.corpo, updated_at: c.corpo.excluido_em ? T2 : "2026-11-08T00:15:00+00:00" }), error: null }));
    await pronto(m);
    expect(await m.repo.excluir("a", { agora: AGORA })).toMatchObject({ ok: true });
    expect(m.chamadas[0]).toEqual({ tipo: "update", corpo: { excluido_em: "2026-11-08T00:14:00.000Z" }, id: "a" });
    expect(m.memoria.linha("a")?.excluido_em).toBe("2026-11-08T00:14:00.000Z");
    expect(await m.repo.restaurar("a")).toMatchObject({ ok: true, linha: { id: "a", excluido_em: null } });
    expect(m.chamadas[1]).toEqual({ tipo: "update", corpo: { excluido_em: null }, id: "a" });
    expect(m.memoria.linha("a")?.excluido_em).toBeNull();
  });

  it("restaurar fora da memória (o Mês mudou): grava por id sem otimismo e devolve a linha", async () => {
    const m = montar([], (c) => ({ data: linha("x", { ...c.corpo, mes: "2026-10", updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.restaurar("x");
    expect(m.chamadas).toEqual([{ tipo: "update", corpo: { excluido_em: null }, id: "x" }]);
    expect(r).toMatchObject({ ok: true, linha: { id: "x", excluido_em: null } });
    expect(m.memoria.linha("x")?.excluido_em).toBeNull();
  });

  it("excluir que falha: a linha volta", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: { code: "42501" } }));
    await pronto(m);
    expect(await m.repo.excluir("a")).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("a")?.excluido_em).toBeNull();
  });
});

describe("Lançamentos sem conexão", () => {
  it("nada começa: sem otimismo, sem chamar o cliente", async () => {
    const m = montar([linha("a")], () => ({ data: null, error: null }));
    await pronto(m);
    const obterCliente = vi.fn();
    const offline = criarRepoLancamentos({ obterCliente, memoria: m.memoria, online: () => false });
    const antes = m.memoria.retrato().linhas;
    const sem = { ok: false, codigo: "conexao.gravar_sem_conexao" };
    expect(await offline.atualizar("a", { valor_centavos: 1 })).toEqual(sem);
    expect(await offline.excluir("a")).toEqual(sem);
    expect(await offline.restaurar("a")).toEqual(sem);
    expect(
      await offline.incluir({
        nome: "X",
        nome_normalizado: "X",
        valor_centavos: 1,
        data: null,
        apelido: null,
        observacao: null,
        responsavel_id: null,
        tipo_id: null,
        status_id: null,
        lancado_por: "manual",
        mes: "2026-10",
        fatura_id: null,
        final_cartao: null,
      }),
    ).toEqual(sem);
    expect(obterCliente).not.toHaveBeenCalled();
    expect(m.memoria.retrato().linhas).toBe(antes);
  });
});

describe("Ajustes de centavos (História 2.8)", () => {
  const mae = linha("msc", { nome: "MSC CRUZEIROS", parcela_n: 2, parcela_total: 12, valor_centavos: 114074 });
  const ajuste = linha("aj", { nome: "MSC CRUZEIROS", valor_centavos: -8, ordem_fatura: 2, ajuste_de_id: "msc" });
  /** Responde a gravação de várias linhas com cada uma já gravada. */
  const gravarTodas = (c: Chamada) => ({
    data: (c.ids ?? [c.id!]).map((id) => linha(id, { ...c.corpo, updated_at: T2 })),
    error: null,
  });

  it("Tipo da mãe: mãe e Ajuste numa requisição (in), com otimismo", async () => {
    const m = montar([mae, ajuste], gravarTodas);
    await pronto(m);
    const gravacao = m.repo.atualizar("msc", { tipo_id: "t-viagem" }, { agora: AGORA, junto: ["aj"] });
    expect(m.memoria.linha("aj")?.tipo_id).toBe("t-viagem");
    const r = await gravacao;
    expect(m.chamadas).toEqual([
      { tipo: "update", corpo: { tipo_id: "t-viagem", editado_em: "2026-11-08T00:14:00.000Z" }, ids: ["msc", "aj"] },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "msc", tipo_id: "t-viagem" } });
    expect(m.memoria.linha("aj")?.updated_at).toBe(T2);
  });

  it("falha: a mãe e o Ajuste voltam", async () => {
    const m = montar([mae, ajuste], () => ({ data: null, error: { code: "42501" } }));
    await pronto(m);
    expect(await m.repo.atualizar("msc", { responsavel_id: "r-casal" }, { junto: ["aj"] })).toEqual({
      ok: false,
      codigo: "salvar.falhou",
    });
    expect(m.memoria.linha("msc")?.responsavel_id).toBeNull();
    expect(m.memoria.linha("aj")?.responsavel_id).toBeNull();
  });

  it("excluir a mãe exclui o Ajuste na mesma gravação; restaurar volta os dois", async () => {
    const m = montar([mae, ajuste], gravarTodas);
    await pronto(m);
    expect(await m.repo.excluir("msc", { agora: AGORA, junto: ["aj"] })).toMatchObject({ ok: true });
    expect(m.chamadas[0]).toEqual({ tipo: "update", corpo: { excluido_em: "2026-11-08T00:14:00.000Z" }, ids: ["msc", "aj"] });
    expect(m.memoria.linha("aj")?.excluido_em).toBe("2026-11-08T00:14:00.000Z");
    expect(await m.repo.restaurar("msc", { junto: ["aj"] })).toMatchObject({ ok: true, linha: { id: "msc" } });
    expect(m.chamadas[1]).toEqual({ tipo: "update", corpo: { excluido_em: null }, ids: ["msc", "aj"] });
    expect(m.memoria.linha("aj")?.excluido_em).toBeNull();
  });

  it("desvincular grava ajuste_de_id = null e mantém Tipo e Responsável; religar copia os da mãe", async () => {
    const classificado = { ...ajuste, tipo_id: "t-viagem", responsavel_id: "r-casal" };
    const m = montar([mae, classificado], (c) => ({ data: linha("aj", { ...classificado, ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.desvincular("aj", AGORA);
    expect(m.chamadas[0]).toEqual({
      tipo: "update",
      corpo: { ajuste_de_id: null, editado_em: "2026-11-08T00:14:00.000Z" },
      id: "aj",
    });
    expect(r).toMatchObject({ ok: true, linha: { ajuste_de_id: null, tipo_id: "t-viagem", responsavel_id: "r-casal" } });
    await m.repo.religar("aj", { id: "msc", tipo_id: "t-casa", responsavel_id: null }, AGORA);
    expect(m.chamadas[1]).toEqual({
      tipo: "update",
      corpo: { ajuste_de_id: "msc", tipo_id: "t-casa", responsavel_id: null, editado_em: "2026-11-08T00:14:00.000Z" },
      id: "aj",
    });
    expect(m.memoria.linha("aj")).toMatchObject({ ajuste_de_id: "msc", tipo_id: "t-casa", responsavel_id: null });
  });

  it("resposta parcial do in (ids): falha e o otimismo é desfeito nas linhas todas", async () => {
    const m = montar([mae, ajuste], (c) => ({ data: [linha("msc", { ...c.corpo, updated_at: T2 })], error: null }));
    await pronto(m);
    expect(await m.repo.atualizar("msc", { tipo_id: "t-viagem" }, { junto: ["aj"] })).toEqual({
      ok: false,
      codigo: "salvar.falhou",
    });
    expect(m.memoria.linha("msc")?.tipo_id).toBeNull();
    expect(m.memoria.linha("aj")?.tipo_id).toBeNull();
  });

  it("restaurar com junto fora da memória: um in (ids) só, sem otimismo, devolve a mãe", async () => {
    const m = montar([], gravarTodas);
    await pronto(m);
    const r = await m.repo.restaurar("msc", { junto: ["aj"] });
    expect(m.chamadas).toEqual([{ tipo: "update", corpo: { excluido_em: null }, ids: ["msc", "aj"] }]);
    expect(r).toMatchObject({ ok: true, linha: { id: "msc", excluido_em: null } });
  });

  it("restaurar fora da memória com resposta parcial: falha", async () => {
    const m = montar([], (c) => ({ data: [linha("msc", { ...c.corpo, updated_at: T2 })], error: null }));
    await pronto(m);
    expect(await m.repo.restaurar("msc", { junto: ["aj"] })).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("religar fora da memória (o Mês mudou depois de desvincular): grava sem otimismo e devolve a linha", async () => {
    const m = montar([], (c) => ({ data: linha("aj", { ...c.corpo, valor_centavos: -8, updated_at: T2 }), error: null }));
    await pronto(m);
    const r = await m.repo.religar("aj", { id: "msc", tipo_id: "t-casa", responsavel_id: "r-casal" }, AGORA);
    expect(m.chamadas).toEqual([
      {
        tipo: "update",
        corpo: { ajuste_de_id: "msc", tipo_id: "t-casa", responsavel_id: "r-casal", editado_em: "2026-11-08T00:14:00.000Z" },
        id: "aj",
      },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "aj", ajuste_de_id: "msc" } });
  });

  it("desvincular que falha: nada muda", async () => {
    const m = montar([mae, ajuste], () => ({ data: null, error: { code: "42501" } }));
    await pronto(m);
    expect(await m.repo.desvincular("aj")).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("aj")?.ajuste_de_id).toBe("msc");
  });
});
