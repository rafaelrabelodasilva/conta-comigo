import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { criarRepoLancamentos, mudancaDaColuna, type Aprender, type LinhaLancamento } from "./lancamentos-repo";
import { guardadaPelaFila } from "@/domain/revisar";
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
    ajuste_de_id: null,
    revisao_motivo: null,
    revisao_dados: null,
    revisado_em: null,
    created_at: T1,
    updated_at: T1,
    ...extra,
  }) as LinhaLancamento;

function montar(
  iniciais: LinhaLancamento[],
  responder: (c: Chamada) => { data: unknown; error: unknown },
  opcoes: { aprender?: Aprender; fila?: boolean } = {},
) {
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
      select: () => ({
        eq: async () => ({ data: iniciais, error: null }),
        // A fila (sem escopo por Mês) lê a tabela inteira, sem `eq`.
        then: (resolver: (r: unknown) => unknown) => Promise.resolve({ data: iniciais, error: null }).then(resolver),
      }),
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

  const memoria = opcoes.fila
    ? criarGerenciador<LinhaLancamento>({ tabela: "lancamentos", obterCliente: () => cliente, pertence: guardadaPelaFila })
    : criarGerenciador<LinhaLancamento>({ tabela: "lancamentos", obterCliente: () => cliente, porMes: true });
  const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria, aprender: opcoes.aprender });
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
      corpo: {
        ajuste_de_id: "msc",
        tipo_id: "t-casa",
        responsavel_id: null,
        revisao_motivo: null,
        revisao_dados: null,
        editado_em: "2026-11-08T00:14:00.000Z",
      },
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
        corpo: {
          ajuste_de_id: "msc",
          tipo_id: "t-casa",
          responsavel_id: "r-casal",
          revisao_motivo: null,
          revisao_dados: null,
          editado_em: "2026-11-08T00:14:00.000Z",
        },
        id: "aj",
      },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "aj", ajuste_de_id: "msc" } });
  });

  it("desvincular sem Responsável ou sem Tipo põe a linha da Fatura na fila (sem_classificacao); Desfazer tira", async () => {
    const soTipo = { ...ajuste, tipo_id: "t-viagem", responsavel_id: null };
    const m = montar([mae, soTipo], (c) => ({ data: linha("aj", { ...soTipo, ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    await m.repo.desvincular("aj", AGORA);
    expect(m.chamadas[0]).toEqual({
      tipo: "update",
      corpo: {
        ajuste_de_id: null,
        revisao_motivo: "sem_classificacao",
        revisao_dados: null,
        revisado_em: null,
        editado_em: "2026-11-08T00:14:00.000Z",
      },
      id: "aj",
    });
    expect(m.memoria.linha("aj")).toMatchObject({ ajuste_de_id: null, revisao_motivo: "sem_classificacao" });
    await m.repo.religar("aj", { id: "msc", tipo_id: "t-viagem", responsavel_id: null }, AGORA);
    expect(m.memoria.linha("aj")).toMatchObject({ ajuste_de_id: "msc", revisao_motivo: null });

    // Fora da Fatura (sem fatura_id): não entra na fila.
    const manual = { ...ajuste, fatura_id: null };
    const n = montar([mae, manual], (c) => ({ data: linha("aj", { ...manual, ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(n);
    await n.repo.desvincular("aj", AGORA);
    expect(n.chamadas[0].corpo).toEqual({ ajuste_de_id: null, editado_em: "2026-11-08T00:14:00.000Z" });
  });

  it("desvincular que falha: nada muda", async () => {
    const m = montar([mae, ajuste], () => ({ data: null, error: { code: "42501" } }));
    await pronto(m);
    expect(await m.repo.desvincular("aj")).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("aj")?.ajuste_de_id).toBe("msc");
  });
});

describe("Regras que aprendem com a classificação (História 3.1)", () => {
  const novo = {
    nome: "COBASI CRICIUMA",
    nome_normalizado: "COBASI CRICIUMA",
    valor_centavos: 14557,
    data: null,
    apelido: null,
    observacao: null,
    responsavel_id: "r-rafael",
    tipo_id: "t-gatos",
    status_id: null,
    lancado_por: "manual" as const,
    mes: "2026-10",
    fatura_id: null,
    final_cartao: null,
  };
  const gravarTodas = (c: Chamada) => ({
    data: (c.ids ?? [c.id!]).map((id) =>
      linha(id, { nome: "MSC CRUZEIROS", ...(id === "msc" ? {} : { ajuste_de_id: "msc" }), ...c.corpo, updated_at: T2 }),
    ),
    error: null,
  });

  it("classificar no painel ensina a Regra com o Responsável antes e depois e o Tipo depois", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const m = montar(
      [linha("a", { nome: "COBASI CRICIUMA", responsavel_id: "r-rafael", tipo_id: "t-gatos" })],
      (c) => ({ data: linha("a", { nome: "COBASI CRICIUMA", responsavel_id: "r-rafael", tipo_id: "t-gatos", ...c.corpo, updated_at: T2 }), error: null }),
      { aprender },
    );
    await pronto(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal" });
    expect(aprender).toHaveBeenCalledTimes(1);
    expect(aprender).toHaveBeenCalledWith({
      nome: "COBASI CRICIUMA",
      responsavelAntes: "r-rafael",
      responsavelDepois: "r-casal",
      tipoDepois: "t-gatos",
    });
  });

  it("mudar outra coluna (Valor, Status, Apelido) não ensina", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const m = montar([linha("a")], (c) => ({ data: linha("a", { ...c.corpo, updated_at: T2 }), error: null }), { aprender });
    await pronto(m);
    await m.repo.atualizar("a", { valor_centavos: 1 });
    await m.repo.atualizar("a", { status_id: "s-pago", apelido: "Pedras" });
    expect(aprender).not.toHaveBeenCalled();
  });

  it("Mãe salva com 2 Ajustes: um aprender só (da mãe)", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const mae = linha("msc", { nome: "MSC CRUZEIROS", parcela_n: 3, parcela_total: 12 });
    const aj1 = linha("aj1", { nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: "msc" });
    const aj2 = linha("aj2", { nome: "MSC CRUZEIROS", valor_centavos: -3, ajuste_de_id: "msc" });
    const m = montar([mae, aj1, aj2], gravarTodas, { aprender });
    await pronto(m);
    await m.repo.atualizar("msc", { tipo_id: "t-viagem" }, { junto: ["aj1", "aj2"] });
    expect(aprender).toHaveBeenCalledTimes(1);
    expect(aprender).toHaveBeenCalledWith({
      nome: "MSC CRUZEIROS",
      responsavelAntes: null,
      responsavelDepois: null,
      tipoDepois: "t-viagem",
    });
  });

  it("uma linha que é Ajuste, desvincular e religar nunca ensinam", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const aj = linha("aj", { nome: "MSC CRUZEIROS", ajuste_de_id: "msc" });
    const m = montar([aj], (c) => ({ data: linha("aj", { ...aj, ...c.corpo, updated_at: T2 }), error: null }), { aprender });
    await pronto(m);
    await m.repo.atualizar("aj", { tipo_id: "t-casa" });
    await m.repo.desvincular("aj");
    await m.repo.religar("aj", { id: "msc", tipo_id: "t-viagem", responsavel_id: "r-casal" });
    expect(aprender).not.toHaveBeenCalled();
  });

  it("a falha de aprender não desfaz nem avisa a gravação", async () => {
    const aprender = vi.fn(async () => {
      throw new Error("rede");
    });
    const m = montar([linha("a")], (c) => ({ data: linha("a", { ...c.corpo, updated_at: T2 }), error: null }), { aprender });
    await pronto(m);
    const r = await m.repo.atualizar("a", { responsavel_id: "r-casal" });
    expect(r).toMatchObject({ ok: true, linha: { responsavel_id: "r-casal" } });
    expect(m.memoria.linha("a")?.responsavel_id).toBe("r-casal");
    // Nem quando `aprender` lança na hora.
    const lancaJa = montar([linha("b")], (c) => ({ data: linha("b", { ...c.corpo, updated_at: T2 }), error: null }), {
      aprender: () => {
        throw new Error("x");
      },
    });
    await pronto(lancaJa);
    expect(await lancaJa.repo.atualizar("b", { tipo_id: "t" })).toMatchObject({ ok: true });
  });

  it("a gravação que falha não ensina", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const m = montar([linha("a")], () => ({ data: null, error: { code: "42501" } }), { aprender });
    await pronto(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal" });
    expect(aprender).not.toHaveBeenCalled();
  });

  it("incluir com Responsável ou Tipo ensina (Responsável antes nulo); sem nenhum, não", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const m = montar([], (c) => ({ data: linha("novo", { ...c.corpo, updated_at: T2 }), error: null }), { aprender });
    await pronto(m);
    await m.repo.incluir(novo);
    expect(aprender).toHaveBeenCalledWith({
      nome: "COBASI CRICIUMA",
      responsavelAntes: null,
      responsavelDepois: "r-rafael",
      tipoDepois: "t-gatos",
    });
    await m.repo.incluir({ ...novo, responsavel_id: null, tipo_id: null });
    expect(aprender).toHaveBeenCalledTimes(1);
  });

  it("deixar a linha com Responsável e Tipo limpa revisao_motivo e revisao_dados no mesmo corpo", async () => {
    const naFila = linha("a", {
      tipo_id: "t-saude",
      revisao_motivo: "sugestao_duvida",
      revisao_dados: { responsavel_id: "r-casal", tipo_id: "t-saude", outros_responsaveis: ["r-rafael"] },
    });
    const m = montar([naFila], (c) => ({ data: linha("a", { ...naFila, ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal" }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({
      responsavel_id: "r-casal",
      revisao_motivo: null,
      revisao_dados: null,
      revisado_em: "2026-11-08T00:14:00.000Z",
      editado_em: "2026-11-08T00:14:00.000Z",
    });
    expect(m.memoria.linha("a")).toMatchObject({ revisao_motivo: null, revisao_dados: null });
  });

  it("com só um dos dois, a linha segue na fila; fora da fila, o corpo não leva as colunas de revisão", async () => {
    const naFila = linha("a", { revisao_motivo: "sem_classificacao" });
    const m = montar([naFila, linha("b", { tipo_id: "t" })], (c) => ({
      data: linha(c.id!, { ...c.corpo, updated_at: T2 }),
      error: null,
    }));
    await pronto(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal" }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({ responsavel_id: "r-casal", editado_em: "2026-11-08T00:14:00.000Z" });
    await m.repo.atualizar("b", { responsavel_id: "r-casal" }, { agora: AGORA });
    expect(m.chamadas[1].corpo).toEqual({ responsavel_id: "r-casal", editado_em: "2026-11-08T00:14:00.000Z" });
  });

  it("Limpar: só limpar não ensina e a linha da Fatura volta à fila como sem_classificacao", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const classificada = linha("a", { responsavel_id: "r-casal", tipo_id: "t-casa" });
    const m = montar([classificada], (c) => ({ data: linha("a", { ...classificada, ...c.corpo, updated_at: T2 }), error: null }), {
      aprender,
    });
    await pronto(m);
    await m.repo.atualizar("a", { tipo_id: null }, { agora: AGORA });
    expect(aprender).not.toHaveBeenCalled();
    expect(m.chamadas).toEqual([
      {
        tipo: "update",
        corpo: {
          tipo_id: null,
          revisao_motivo: "sem_classificacao",
          revisao_dados: null,
          revisado_em: null,
          editado_em: "2026-11-08T00:14:00.000Z",
        },
        id: "a",
      },
    ]);
    expect(m.memoria.linha("a")).toMatchObject({ tipo_id: null, revisao_motivo: "sem_classificacao" });
  });

  it("escolher um e limpar o outro ensina (o nulo não muda a Regra) e devolve à fila", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const classificada = linha("a", { responsavel_id: "r-casal", tipo_id: "t-casa" });
    const m = montar([classificada], (c) => ({ data: linha("a", { ...classificada, ...c.corpo, updated_at: T2 }), error: null }), {
      aprender,
    });
    await pronto(m);
    await m.repo.atualizar("a", { responsavel_id: "r-rafael", tipo_id: null }, { agora: AGORA });
    expect(aprender).toHaveBeenCalledWith({
      nome: "BELLA PIETRA",
      responsavelAntes: "r-casal",
      responsavelDepois: "r-rafael",
      tipoDepois: null,
    });
    expect(m.chamadas[0].corpo).toMatchObject({ revisao_motivo: "sem_classificacao" });
  });

  it("limpar uma linha já na fila, uma linha manual ou um Ajuste não mexe no motivo", async () => {
    const naFila = linha("a", { tipo_id: "t-casa", revisao_motivo: "sugestao", revisao_dados: { responsavel_id: null, tipo_id: "t-casa", outros_responsaveis: [] } });
    const manual = linha("b", { fatura_id: null, lancado_por: "manual", tipo_id: "t-casa" });
    const ajuste = linha("c", { ajuste_de_id: "msc", tipo_id: "t-casa" });
    const m = montar([naFila, manual, ajuste], (c) => ({ data: linha(c.id!, { ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    for (const id of ["a", "b", "c"]) await m.repo.atualizar(id, { tipo_id: null }, { agora: AGORA });
    for (const c of m.chamadas) expect(c.corpo).toEqual({ tipo_id: null, editado_em: "2026-11-08T00:14:00.000Z" });
  });

  it("limpar a mãe com Ajustes junto: a classificação vai junto; o motivo, só para a mãe", async () => {
    const mae = linha("msc", { nome: "MSC CRUZEIROS", responsavel_id: "r-casal", tipo_id: "t-viagem" });
    const aj = linha("aj1", { nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: "msc", responsavel_id: "r-casal", tipo_id: "t-viagem" });
    const m = montar([mae, aj], (c) => {
      const r = gravarTodas(c);
      return c.ids ? r : { data: { ...mae, ...r.data[0] }, error: null };
    });
    await pronto(m);
    const r = await m.repo.atualizar("msc", { tipo_id: null }, { agora: AGORA, junto: ["aj1"] });
    expect(m.chamadas).toEqual([
      { tipo: "update", corpo: { tipo_id: null, editado_em: "2026-11-08T00:14:00.000Z" }, ids: ["msc", "aj1"] },
      {
        tipo: "update",
        corpo: {
          revisao_motivo: "sem_classificacao",
          revisao_dados: null,
          revisado_em: null,
          editado_em: "2026-11-08T00:14:00.000Z",
        },
        id: "msc",
      },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "msc", revisao_motivo: "sem_classificacao" } });
    expect(m.memoria.linha("aj1")).toMatchObject({ tipo_id: null, revisao_motivo: null });
  });

  it("limpar a mãe com Ajustes junto: a segunda requisição (motivo da mãe) falha e a classificação fica", async () => {
    const mae = linha("msc", { nome: "MSC CRUZEIROS", responsavel_id: "r-casal", tipo_id: "t-viagem" });
    const aj = linha("aj1", { nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: "msc", responsavel_id: "r-casal", tipo_id: "t-viagem" });
    const m = montar([mae, aj], (c) => (c.ids ? gravarTodas(c) : { data: null, error: { code: "08006" } }));
    await pronto(m);
    const r = await m.repo.atualizar("msc", { tipo_id: null }, { agora: AGORA, junto: ["aj1"] });
    expect(m.chamadas).toHaveLength(2);
    expect(r).toMatchObject({ ok: true, linha: { id: "msc", tipo_id: null } });
    expect(m.memoria.linha("msc")).toMatchObject({ tipo_id: null, revisao_motivo: null });
    expect(m.memoria.linha("aj1")).toMatchObject({ tipo_id: null, revisao_motivo: null });
  });
});

// Fila do Revisar (História 3.2): a segunda instância do repositório, ligada
// ao gerenciador da fila (todos os Meses; a linha que sai da fila sai da
// memória), `revisado_em` e o "Desfazer" (`devolverAFila`).
describe("fila do Revisar (História 3.2)", () => {
  const DADOS = { responsavel_id: "r-casal", tipo_id: "t-casa", outros_responsaveis: [] };
  const sugerida = (id: string, extra: Partial<LinhaLancamento> = {}) =>
    linha(id, { mes: "2026-11", revisao_motivo: "sugestao", revisao_dados: DADOS, ...extra });
  const AGORA_ISO = "2026-11-08T00:14:00.000Z";

  async function aguardar(m: ReturnType<typeof montar>) {
    m.memoria.assinar(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(m.memoria.retrato().status).toBe("pronto");
  }

  it("Confirmar: grava Responsável, Tipo, limpa motivo e dados, marca revisado_em e ensina a Regra; o item sai da memória da fila", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const a = sugerida("a");
    const b = sugerida("b");
    const m = montar([a, b], (c) => ({ data: linha("a", { ...a, ...c.corpo, updated_at: T2 }), error: null }), {
      aprender,
      fila: true,
    });
    await aguardar(m);
    expect(m.memoria.linhas().map((l) => l.id)).toEqual(["a", "b"]);

    const r = await m.repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA });
    expect(m.chamadas).toEqual([
      {
        tipo: "update",
        corpo: {
          responsavel_id: "r-casal",
          tipo_id: "t-casa",
          revisao_motivo: null,
          revisao_dados: null,
          revisado_em: AGORA_ISO,
          editado_em: AGORA_ISO,
        },
        id: "a",
      },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "a", revisao_motivo: null, revisado_em: AGORA_ISO } });
    expect(m.memoria.linhas().map((l) => l.id)).toEqual(["b"]);
    expect(aprender).toHaveBeenCalledWith({
      nome: "BELLA PIETRA",
      responsavelAntes: null,
      responsavelDepois: "r-casal",
      tipoDepois: "t-casa",
    });
  });

  it("a Regra aplicou o Responsável: o ✓ grava só o Tipo e fecha o item", async () => {
    const a = sugerida("a", { responsavel_id: "r-casal", revisao_dados: { ...DADOS, responsavel_id: null } });
    const m = montar([a], (c) => ({ data: linha("a", { ...a, ...c.corpo, updated_at: T2 }), error: null }), { fila: true });
    await aguardar(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({
      tipo_id: "t-casa",
      revisao_motivo: null,
      revisao_dados: null,
      revisado_em: AGORA_ISO,
      editado_em: AGORA_ISO,
    });
    expect(m.memoria.linhas()).toEqual([]);
  });

  it("linha da fila que já tem os dois: confirmar ainda a tira da fila", async () => {
    const a = sugerida("a", { responsavel_id: "r-casal", tipo_id: "t-casa" });
    const m = montar([a], (c) => ({ data: linha("a", { ...a, ...c.corpo, updated_at: T2 }), error: null }), { fila: true });
    await aguardar(m);
    await m.repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({
      revisao_motivo: null,
      revisao_dados: null,
      revisado_em: AGORA_ISO,
      editado_em: AGORA_ISO,
    });
    expect(m.memoria.linhas()).toEqual([]);
  });

  it("mãe com Ajuste: mãe e Ajuste classificados na mesma requisição; só a mãe ensina", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const mae = sugerida("msc", { nome: "MSC CRUZEIROS" });
    const aj = linha("aj", { nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: "msc", mes: "2026-11" });
    const m = montar([mae, aj], (c) => ({ data: (c.ids ?? []).map((id) => (id === "aj" ? { ...aj, ...c.corpo, updated_at: T2 } : { ...mae, ...c.corpo, updated_at: T2 })), error: null }), {
      aprender,
      fila: true,
    });
    await aguardar(m);
    const r = await m.repo.atualizar("msc", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA, junto: ["aj"] });
    expect(m.chamadas).toHaveLength(1);
    expect(m.chamadas[0].ids).toEqual(["msc", "aj"]);
    expect(m.chamadas[0].corpo).toMatchObject({ responsavel_id: "r-casal", tipo_id: "t-casa", revisado_em: AGORA_ISO });
    expect(r.ok).toBe(true);
    // A mãe saiu; o Ajuste (que acompanha a mãe) continua na memória, classificado.
    expect(m.memoria.linha("msc")).toBeUndefined();
    expect(m.memoria.linha("aj")).toMatchObject({ responsavel_id: "r-casal", tipo_id: "t-casa" });
    expect(aprender).toHaveBeenCalledTimes(1);
  });

  it("falha ao gravar: o item fica na fila e nada é ensinado", async () => {
    const aprender = vi.fn(async () => ({ ok: true }));
    const a = sugerida("a");
    const m = montar([a], () => ({ data: null, error: { code: "08006" } }), { aprender, fila: true });
    await aguardar(m);
    const r = await m.repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA });
    expect(r).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.memoria.linha("a")).toMatchObject({ revisao_motivo: "sugestao", revisado_em: null });
    expect(aprender).not.toHaveBeenCalled();
  });

  it("sem conexão: nada é tentado", async () => {
    const a = sugerida("a");
    const chamadas: unknown[] = [];
    const cliente = {
      from: () => ({
        select: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [a], error: null }).then(r) }),
        update: () => chamadas.push("update"),
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
    const memoria = criarGerenciador<LinhaLancamento>({ tabela: "lancamentos", obterCliente: () => cliente, pertence: guardadaPelaFila });
    const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria, online: () => false });
    memoria.assinar(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(await repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" })).toEqual({
      ok: false,
      codigo: "conexao.gravar_sem_conexao",
    });
    expect(await repo.devolverAFila("a", a)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(chamadas).toEqual([]);
    expect(memoria.linha("a")).toMatchObject({ revisao_motivo: "sugestao" });
  });

  it("devolverAFila (Desfazer): devolve classificação, motivo, dados e revisado_em e o item volta à fila", async () => {
    const a = sugerida("a");
    let versao = 1;
    const m = montar([a], (c) => ({ data: linha("a", { ...a, ...c.corpo, updated_at: `2026-11-08T00:14:0${++versao}.000000+00:00` }), error: null }), {
      fila: true,
    });
    await aguardar(m);
    const anterior = { responsavel_id: null, tipo_id: null, revisao_motivo: a.revisao_motivo, revisao_dados: a.revisao_dados, revisado_em: null };
    await m.repo.atualizar("a", { responsavel_id: "r-casal", tipo_id: "t-casa" }, { agora: AGORA });
    expect(m.memoria.linha("a")).toBeUndefined();

    const r = await m.repo.devolverAFila("a", anterior);
    expect(m.chamadas[1]).toEqual({
      tipo: "update",
      corpo: {
        responsavel_id: null,
        tipo_id: null,
        revisado_em: null,
        revisao_motivo: "sugestao",
        revisao_dados: DADOS,
      },
      id: "a",
    });
    expect(r).toMatchObject({ ok: true, linha: { id: "a", responsavel_id: null, revisao_motivo: "sugestao" } });
    expect(m.memoria.linha("a")).toMatchObject({ revisao_motivo: "sugestao", responsavel_id: null });
  });

  it("devolverAFila com Ajustes: eles voltam primeiro (só a classificação), depois a mãe com o motivo", async () => {
    const mae = sugerida("msc");
    const aj = linha("aj", { ajuste_de_id: "msc", mes: "2026-11", responsavel_id: "r-casal", tipo_id: "t-casa", revisado_em: AGORA_ISO });
    const m = montar([aj], (c) => ({
      data: c.ids ? c.ids.map((id) => linha(id, { ...aj, ...c.corpo, updated_at: T2 })) : linha("msc", { ...mae, ...c.corpo, updated_at: T2 }),
      error: null,
    }), { fila: true });
    await aguardar(m);
    const anterior = { responsavel_id: null, tipo_id: null, revisao_motivo: mae.revisao_motivo, revisao_dados: mae.revisao_dados, revisado_em: null };
    const r = await m.repo.devolverAFila("msc", anterior, { junto: ["aj"] });
    // Ajuste em memória: um `in (ids)` só com ele? Um id só vai por `eq`.
    expect(m.chamadas.map((c) => c.corpo)).toEqual([
      { responsavel_id: null, tipo_id: null, revisado_em: null },
      { responsavel_id: null, tipo_id: null, revisado_em: null, revisao_motivo: "sugestao", revisao_dados: DADOS },
    ]);
    expect(r).toMatchObject({ ok: true, linha: { id: "msc", revisao_motivo: "sugestao" } });
    expect(m.memoria.linha("aj")).toMatchObject({ responsavel_id: null, tipo_id: null, revisado_em: null });
  });

  it("devolverAFila: se os Ajustes falham, a mãe nem é tocada", async () => {
    const aj = linha("aj", { ajuste_de_id: "msc", mes: "2026-11" });
    const m = montar([aj], () => ({ data: null, error: { code: "08006" } }), { fila: true });
    await aguardar(m);
    const anterior = { responsavel_id: null, tipo_id: null, revisao_motivo: "sugestao" as const, revisao_dados: DADOS, revisado_em: null };
    expect(await m.repo.devolverAFila("msc", anterior, { junto: ["aj"] })).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.chamadas).toHaveLength(1);
  });

  it("limpar o Tipo de uma linha revisada (Painel): volta à fila com revisado_em nulo", async () => {
    const revisada = linha("a", { responsavel_id: "r-casal", tipo_id: "t-casa", revisado_em: AGORA_ISO });
    const m = montar([revisada], (c) => ({ data: linha("a", { ...revisada, ...c.corpo, updated_at: T2 }), error: null }));
    await pronto(m);
    await m.repo.atualizar("a", { tipo_id: null }, { agora: AGORA });
    expect(m.chamadas[0].corpo).toEqual({
      tipo_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
      revisado_em: null,
      editado_em: AGORA_ISO,
    });
    expect(m.memoria.linha("a")).toMatchObject({ revisao_motivo: "sem_classificacao", revisado_em: null });
  });
});
