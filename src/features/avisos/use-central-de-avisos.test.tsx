// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recarregarCentralDeAvisos, useCentralDeAvisos } from "./use-central-de-avisos";

// O hook da Central de Avisos (História 8.1 e 8.2): o estado que o menu (contador) e a tela `/avisos` leem. Os gerenciadores de
// Realtime são falsos; o relógio é o de verdade, congelado (o `useHoje` real).

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregados: [] as string[],
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (tabela: string) => {
    const guardado = cache.get(tabela);
    if (guardado && guardado.versao === falso.versao) return guardado.retrato;
    const novo = { status: falso.status[tabela] ?? "pronto", linhas: falso.banco[tabela] ?? [] };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  const useTabela = (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela), () => retrato(tabela));
  const recarregavel = (nome: string) => ({ recarregar: async () => void falso.recarregados.push(nome) });
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    useItensDoHistorico: () => useTabela("pagamento_itens"),
    useFilaRevisar: () => useTabela("fila"),
    gerenciador: (tabela: string) => recarregavel(tabela),
    gerenciadorTodosOsLancamentos: () => recarregavel("lancamentos:todos"),
    gerenciadorItensDoHistorico: () => recarregavel("pagamento_itens:historico"),
    gerenciadorFila: () => recarregavel("fila"),
  };
});

const bloco = { id: "b-lucas", nome: "Lucas", formula: { tipo: "responsavel", id: "lucas" }, ordem: 1, de_cobranca: true, meu_bloco: false };
const lancamento = {
  id: "l1",
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: 11_516,
  responsavel_id: "lucas",
  tipo_id: "casa",
  status_id: "s-nao",
  lancado_por: "fatura",
};

/** Uma linha de `faturas` completa (a Conferência lê os totais): sem Lançamentos nem cartões ela bate, sem aviso. */
const fatura = (mes: string, vencimento: string, extra: Record<string, unknown> = {}) => ({
  id: `f-${mes}`,
  mes,
  vencimento,
  fechamento: mes === "2026-11" ? "2026-10-28" : "2026-09-28",
  total_despesas_centavos: 0,
  total_creditos_centavos: 0,
  alerta_dispensado_em: null,
  updated_at: "2026-11-18T12:00:00Z",
  ...extra,
});
const naFila = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i}`, excluido_em: null, ajuste_de_id: null, revisao_motivo: "sem_classificacao" }));

function mudou() {
  act(() => {
    falso.versao += 1;
    for (const o of [...falso.ouvintes]) o();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-19T15:00:00Z"));
  falso.banco = {
    config_ciclo: [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }],
    status: [
      { id: "s-pago", conta_como_pago: true },
      { id: "s-nao", conta_como_pago: false },
    ],
    faturas: [fatura("2026-10", "2026-10-06"), fatura("2026-11", "2026-11-06")],
    fatura_cartoes: [],
    fila: [],
    blocos: [bloco],
    lancamentos: [lancamento],
    pagamento_itens: [],
    configuracoes: [],
    avisos_lidos: [],
  };
  falso.status = {};
  falso.recarregados = [];
  falso.versao += 1;
});
afterEach(() => vi.useRealTimers());

describe("useCentralDeAvisos", () => {
  it("pronto: os avisos e os não lidos vêm do núcleo", () => {
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status).toBe("pronto");
    if (result.current.status !== "pronto") return;
    expect(result.current.central.naoLidos).toBe(1);
    expect(result.current.central.avisos[0].origem).toMatchObject({ tipo: "atraso", blocoNome: "Lucas", valorCentavos: 11_516 });
  });

  it("carregando: qualquer das dez leituras ainda sem dados, nunca um número parcial", () => {
    for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "fatura_cartoes", "fila", "config_ciclo", "configuracoes", "avisos_lidos"]) {
      falso.status = { [tabela]: "carregando" };
      falso.versao += 1;
      const { result, unmount } = renderHook(() => useCentralDeAvisos());
      expect(result.current).toEqual({ status: "carregando" });
      unmount();
    }
  });

  it("erro numa das nove leituras dos avisos é erro (a dos lidos que falha não é)", () => {
    for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "fatura_cartoes", "fila", "config_ciclo", "configuracoes"]) {
      falso.status = { [tabela]: "erro" };
      falso.versao += 1;
      const { result, unmount } = renderHook(() => useCentralDeAvisos());
      expect(result.current).toEqual({ status: "erro" });
      unmount();
    }
  });

  it("a leitura dos lidos que falha (sem a tabela) vale como 'nada lido': tudo não lido, o contador conta", () => {
    falso.banco.avisos_lidos = [{ id: "x", tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" }];
    falso.status = { avisos_lidos: "erro" };
    falso.versao += 1;
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status).toBe("pronto");
    if (result.current.status === "pronto") expect(result.current.central.naoLidos).toBe(1);
  });

  it("os lidos (Realtime, de outro aparelho) baixam o contador sem recarregar", () => {
    const { result } = renderHook(() => useCentralDeAvisos());
    falso.banco.avisos_lidos = [{ id: "x", tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" }];
    mudou();
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(0);
  });

  it("virada do dia: o contador acompanha (relógio congelado, `useHoje` verdadeiro)", () => {
    falso.banco.lancamentos = [{ ...lancamento, mes: "2026-11" }];
    vi.setSystemTime(new Date("2026-11-16T23:50:00-03:00"));
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(0);
    act(() => {
      vi.setSystemTime(new Date("2026-11-17T00:05:00-03:00"));
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(1);
  });

  it("recarregarCentralDeAvisos relê as dez leituras", () => {
    recarregarCentralDeAvisos();
    expect([...falso.recarregados].sort()).toEqual(
      [
        "avisos_lidos",
        "blocos",
        "config_ciclo",
        "configuracoes",
        "fatura_cartoes",
        "faturas",
        "fila",
        "lancamentos:todos",
        "pagamento_itens:historico",
        "status",
      ].sort(),
    );
  });

  it("a Conferência e o Revisar entram na conta: o contador soma os três tipos, na ordem dos tipos", () => {
    falso.banco.faturas = [fatura("2026-10", "2026-10-06"), fatura("2026-11", "2026-11-06", { total_despesas_centavos: 100_000 })];
    falso.banco.fatura_cartoes = [{ fatura_id: "f-2026-11", final: "8673", total_centavos: 100_000 }];
    falso.banco.lancamentos = [
      lancamento,
      { ...lancamento, id: "lf", mes: "2026-11", status_id: "s-pago", responsavel_id: "ninguem", valor_centavos: 28_000, fatura_id: "f-2026-11", final_cartao: "8673" },
    ];
    falso.banco.fila = naFila(17);
    falso.versao += 1;
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status).toBe("pronto");
    if (result.current.status !== "pronto") return;
    expect(result.current.central.naoLidos).toBe(3);
    expect(result.current.central.avisos.map((a) => a.chave)).toEqual([
      { tipo: "conferencia", referencia: "2026-11:-72000:0:8673", dia: "2026-10-28" },
      { tipo: "revisar", referencia: "fila", dia: "2026-11-18" },
      { tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" },
    ]);
    expect(result.current.central.avisos[1].origem).toMatchObject({ quantidade: 17 });
  });

  it("a fila e a diferença mudam pelo Realtime sem recarregar: o contador acompanha", () => {
    falso.banco.fila = naFila(2);
    falso.versao += 1;
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(2);
    falso.banco.fila = [];
    mudou();
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(1);
  });

  it("virada do dia: a Conferência e o Revisar não dependem de 'hoje', então o contador não pisca", () => {
    falso.banco.fila = naFila(2);
    falso.banco.lancamentos = [];
    falso.versao += 1;
    vi.setSystemTime(new Date("2026-11-19T23:50:00-03:00"));
    const { result } = renderHook(() => useCentralDeAvisos());
    const antes = result.current.status === "pronto" ? result.current.central.avisos.map((a) => a.chave) : null;
    expect(antes).toEqual([{ tipo: "revisar", referencia: "fila", dia: "2026-11-18" }]);
    act(() => {
      vi.setSystemTime(new Date("2026-11-20T00:05:00-03:00"));
      vi.advanceTimersByTime(60_000);
    });
    const depois = result.current.status === "pronto" ? result.current.central.avisos.map((a) => a.chave) : null;
    expect(depois).toEqual(antes);
  });

  it("a leitura dos lidos vale para os três tipos: o lido de um aparelho baixa o contador no outro", () => {
    falso.banco.fila = naFila(2);
    falso.versao += 1;
    const { result } = renderHook(() => useCentralDeAvisos());
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(2);
    falso.banco.avisos_lidos = [{ id: "y", tipo: "revisar", referencia: "fila", dia: "2026-11-18" }];
    mudou();
    expect(result.current.status === "pronto" && result.current.central.naoLidos).toBe(1);
  });
});
