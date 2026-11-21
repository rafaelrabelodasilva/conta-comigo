// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuLateral } from "@/features/revisar/MenuLateral";

// O menu lateral com o hook da Central DE VERDADE (História 8.2): os dois contadores convivem. "Avisos" soma os três
// tipos de aviso (diferença da Conferência, fila do Revisar e lembretes) e "Revisar" continua sendo a fila de trabalho
// ("para revisar"). Os gerenciadores de Realtime são falsos; o relógio é o de verdade, congelado.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
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
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    useItensDoHistorico: () => useTabela("pagamento_itens"),
    useFilaRevisar: () => useTabela("fila"),
    gerenciador: () => ({ recarregar: vi.fn() }),
    gerenciadorTodosOsLancamentos: () => ({ recarregar: vi.fn() }),
    gerenciadorItensDoHistorico: () => ({ recarregar: vi.fn() }),
    gerenciadorFila: () => ({ recarregar: vi.fn() }),
  };
});

const fatura = (mes: string, extra: Record<string, unknown> = {}) => ({
  id: `f-${mes}`,
  mes,
  vencimento: `${mes}-06`,
  fechamento: "2026-10-28",
  total_despesas_centavos: 0,
  total_creditos_centavos: 0,
  alerta_dispensado_em: null,
  created_at: "2026-11-18T12:00:00Z",
  updated_at: "2026-11-18T12:00:00Z",
  ...extra,
});
const naFila = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i}`, excluido_em: null, ajuste_de_id: null, revisao_motivo: "sem_classificacao" }));

const nomeDeAvisos = () => screen.getByRole("link", { name: /^Avisos/ }).getAttribute("aria-label") ?? screen.getByRole("link", { name: /^Avisos/ }).textContent;
const avisos = (nome: string) => screen.getByRole("link", { name: nome });
const revisar = () => screen.getByRole("link", { name: /^Revisar/ });

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
    status: [{ id: "s-pago", conta_como_pago: true }],
    faturas: [fatura("2026-10"), fatura("2026-11", { total_despesas_centavos: 100_000 })],
    fatura_cartoes: [{ fatura_id: "f-2026-11", final: "8673", total_centavos: 100_000, created_at: "2026-11-18T12:00:00Z" }],
    lancamentos: [
      { id: "lf", mes: "2026-11", excluido_em: null, valor_centavos: 28_000, responsavel_id: "x", tipo_id: "casa", status_id: "s-pago", lancado_por: "fatura", fatura_id: "f-2026-11", final_cartao: "8673" },
    ],
    pagamento_itens: [],
    blocos: [],
    configuracoes: [],
    avisos_lidos: [],
    fila: naFila(17),
  };
  falso.status = {};
  falso.versao += 1;
});
afterEach(() => vi.useRealTimers());

describe("o menu com os avisos da Conferência e do Revisar", () => {
  it("'Avisos' soma a diferença da Conferência e a fila; 'Revisar' continua contando a fila de trabalho", () => {
    render(<MenuLateral />);
    expect(avisos("Avisos, 2 não lidos")).toBeTruthy();
    expect(revisar().textContent).toBe("Revisar, 17 para revisar");
  });

  it("classificar itens baixa o 'Revisar' mas não mexe nos 'Avisos' (o aviso é um só e o número não entra na chave)", () => {
    render(<MenuLateral />);
    falso.banco.fila = naFila(16);
    mudou();
    expect(revisar().textContent).toBe("Revisar, 16 para revisar");
    expect(avisos("Avisos, 2 não lidos")).toBeTruthy();
  });

  it("a fila zerada tira o aviso do Revisar e o contador do item Revisar; a Conferência segue", () => {
    render(<MenuLateral />);
    falso.banco.fila = [];
    mudou();
    expect(avisos("Avisos, 1 não lido")).toBeTruthy();
    expect(revisar().textContent).toBe("Revisar");
  });

  it("acima de 99 avisos o contador mostra '99+' e o nome diz 'mais de 99 não lidos'", () => {
    falso.banco.faturas = Array.from({ length: 100 }, (_, i) =>
      fatura(`${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, { total_despesas_centavos: 1_000 }),
    );
    falso.banco.fatura_cartoes = [];
    falso.banco.lancamentos = [];
    falso.banco.fila = [];
    falso.versao += 1;
    render(<MenuLateral />);
    expect(avisos("Avisos, mais de 99 não lidos").textContent).toBe("Avisos99+, mais de 99 não lidos");
  });

  it("enquanto carrega (qualquer das leituras) ou dá erro, sem número nos Avisos", () => {
    for (const estado of ["carregando", "erro"]) {
      for (const tabela of ["fatura_cartoes", "fila"]) {
        falso.status = { [tabela]: estado };
        falso.versao += 1;
        const { unmount } = render(<MenuLateral />);
        expect(nomeDeAvisos()).toBe("Avisos");
        unmount();
      }
    }
  });
});

describe("o menu com os interruptores da Conferência e do Revisar (História 8.3)", () => {
  it("o Revisar desligado: 'Avisos' não conta o aviso, mas o item 'Revisar' segue com a fila de trabalho (17 para revisar)", () => {
    falso.banco.configuracoes = [{ id: "c", aviso_revisar: false }];
    falso.versao += 1;
    render(<MenuLateral />);
    expect(avisos("Avisos, 1 não lido")).toBeTruthy();
    expect(revisar().textContent).toBe("Revisar, 17 para revisar");
  });

  it("a Conferência desligada: 'Avisos' conta só a fila; 'Revisar' não muda", () => {
    falso.banco.configuracoes = [{ id: "c", aviso_conferencia: false }];
    falso.versao += 1;
    render(<MenuLateral />);
    expect(avisos("Avisos, 1 não lido")).toBeTruthy();
    expect(revisar().textContent).toBe("Revisar, 17 para revisar");
  });

  it("os dois desligados: 'Avisos' sem número e 'Revisar' com a fila; religar traz o contador de volta sem recarregar", () => {
    falso.banco.configuracoes = [{ id: "c", aviso_conferencia: false, aviso_revisar: false }];
    falso.versao += 1;
    render(<MenuLateral />);
    expect(nomeDeAvisos()).toBe("Avisos");
    expect(revisar().textContent).toBe("Revisar, 17 para revisar");
    falso.banco.configuracoes = [{ id: "c", aviso_conferencia: true, aviso_revisar: true }];
    mudou();
    expect(avisos("Avisos, 2 não lidos")).toBeTruthy();
  });

  it("religar não faz um aviso já lido voltar como novo (a linha de avisos_lidos fica)", () => {
    falso.banco.avisos_lidos = [
      { tipo: "revisar", referencia: "fila", dia: "2026-11-18" },
      { tipo: "conferencia", referencia: "2026-11:-72000:0:8673", dia: "2026-10-28" },
    ];
    falso.banco.configuracoes = [{ id: "c", aviso_revisar: false }];
    falso.versao += 1;
    render(<MenuLateral />);
    expect(nomeDeAvisos()).toBe("Avisos");
    falso.banco.configuracoes = [{ id: "c", aviso_revisar: true }];
    mudou();
    expect(nomeDeAvisos()).toBe("Avisos");
  });
});
