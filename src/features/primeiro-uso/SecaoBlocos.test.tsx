// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecaoBlocos } from "./SecaoBlocos";

// O cartão dos Blocos tem testes próprios (`BlocosDoMes.test.tsx`); aqui ele
// vira um marcador com o que a seção lhe entrega: o Mês e as linhas.
const falso = vi.hoisted(() => ({
  retrato: { status: "carregando", linhas: [] as unknown[], mes: null as string | null },
  ouvintes: new Set<() => void>(),
  abrirMes: vi.fn(),
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useLinhas: () =>
      useSyncExternalStore(
        (o) => {
          falso.ouvintes.add(o);
          return () => falso.ouvintes.delete(o);
        },
        () => falso.retrato,
      ),
    gerenciador: () => ({ abrirMes: falso.abrirMes }),
  };
});
vi.mock("@/features/painel/BlocosDoMes", () => ({
  BlocosDoMes: ({ linhas, mes }: { linhas: unknown[]; mes: string }) => (
    <section data-testid="blocos" data-mes={mes} data-linhas={linhas.length} />
  ),
}));

function mudar(retrato: typeof falso.retrato) {
  act(() => {
    falso.retrato = retrato;
    for (const o of falso.ouvintes) o();
  });
}

describe("SecaoBlocos (passo Blocos do Primeiro uso)", () => {
  beforeEach(() => {
    falso.retrato = { status: "carregando", linhas: [], mes: null };
    falso.ouvintes.clear();
    falso.abrirMes.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
  });

  it("abre o Mês atual (calendário de São Paulo) e mostra o cartão, sem linhas enquanto carrega", () => {
    render(<SecaoBlocos />);
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
    const cartao = screen.getByTestId("blocos");
    expect(cartao.getAttribute("data-mes")).toBe("2026-11");
    expect(cartao.getAttribute("data-linhas")).toBe("0");
  });

  it("com o Mês atual lido, entrega os Lançamentos dele", () => {
    render(<SecaoBlocos />);
    mudar({ status: "pronto", linhas: [{ id: "a" }, { id: "b" }], mes: "2026-11" });
    expect(screen.getByTestId("blocos").getAttribute("data-linhas")).toBe("2");
  });

  it("memória ainda de outro Mês: não entrega linhas de lá", () => {
    render(<SecaoBlocos />);
    mudar({ status: "pronto", linhas: [{ id: "a" }], mes: "2026-10" });
    expect(screen.getByTestId("blocos").getAttribute("data-linhas")).toBe("0");
  });
});
