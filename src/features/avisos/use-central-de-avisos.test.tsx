// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recarregarCentralDeAvisos, useCentralDeAvisos } from "./use-central-de-avisos";

// O hook da Central de Avisos (História 8.1): o estado que o menu (contador) e a tela `/avisos` leem. Os gerenciadores de
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
    gerenciador: (tabela: string) => recarregavel(tabela),
    gerenciadorTodosOsLancamentos: () => recarregavel("lancamentos:todos"),
    gerenciadorItensDoHistorico: () => recarregavel("pagamento_itens:historico"),
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
    faturas: [
      { mes: "2026-10", vencimento: "2026-10-06" },
      { mes: "2026-11", vencimento: "2026-11-06" },
    ],
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
    expect(result.current.central.avisos[0].lembrete).toMatchObject({ tipo: "atraso", blocoNome: "Lucas", valorCentavos: 11_516 });
  });

  it("carregando: qualquer das oito leituras ainda sem dados, nunca um número parcial", () => {
    for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "config_ciclo", "configuracoes", "avisos_lidos"]) {
      falso.status = { [tabela]: "carregando" };
      falso.versao += 1;
      const { result, unmount } = renderHook(() => useCentralDeAvisos());
      expect(result.current).toEqual({ status: "carregando" });
      unmount();
    }
  });

  it("erro numa das sete leituras dos lembretes é erro", () => {
    for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "config_ciclo", "configuracoes"]) {
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

  it("recarregarCentralDeAvisos relê as oito leituras", () => {
    recarregarCentralDeAvisos();
    expect([...falso.recarregados].sort()).toEqual(
      ["avisos_lidos", "blocos", "config_ciclo", "configuracoes", "faturas", "lancamentos:todos", "pagamento_itens:historico", "status"].sort(),
    );
  });
});
