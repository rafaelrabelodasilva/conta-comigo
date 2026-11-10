// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuLateral } from "./MenuLateral";

// O roteador do Next e o gerenciador da fila são falsos; o menu de verdade
// (`NavRail`) desenha o contador.
const falso = vi.hoisted(() => ({
  linhas: [] as Record<string, unknown>[],
  status: "pronto" as string,
  ouvintes: new Set<() => void>(),
  versao: 0,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/revisar", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  let guardado: { versao: number; retrato: unknown } | null = null;
  const retrato = () => {
    if (guardado?.versao !== falso.versao) guardado = { versao: falso.versao, retrato: { status: falso.status, linhas: falso.linhas } };
    return guardado.retrato;
  };
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  return { useFilaRevisar: () => useSyncExternalStore(assinar, retrato) };
});

const mudar = (linhas: Record<string, unknown>[], status = "pronto") =>
  act(() => {
    falso.linhas = linhas;
    falso.status = status;
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  excluido_em: null,
  ajuste_de_id: null,
  revisao_motivo: "sem_classificacao",
  ...extra,
});

const contador = () => screen.getByRole("link", { name: /Revisar/ }).textContent;

beforeEach(() => {
  falso.linhas = [];
  falso.status = "pronto";
  falso.versao++;
});

describe("MenuLateral", () => {
  it("o contador do Revisar conta só a fila (mesma regra: sem excluídas, Ajustes nem já revisadas)", () => {
    falso.linhas = [
      item("a"),
      item("b", { revisao_motivo: "sugestao" }),
      item("c", { revisao_motivo: null }),
      item("d", { excluido_em: "x" }),
      item("e", { ajuste_de_id: "a", revisao_motivo: null }),
    ];
    render(<MenuLateral />);
    expect(contador()).toBe("Revisar, 2 para revisar");
  });

  it("baixa e some ao zerar, sem recarregar; sobe quando uma linha volta à fila", () => {
    falso.linhas = [item("a"), item("b")];
    render(<MenuLateral />);
    expect(contador()).toBe("Revisar, 2 para revisar");
    mudar([item("a")]);
    expect(contador()).toBe("Revisar, 1 para revisar");
    mudar([]);
    expect(contador()).toBe("Revisar");
    mudar([item("a"), item("z")]);
    expect(contador()).toBe("Revisar, 2 para revisar");
  });

  it("enquanto carrega ou com erro, sem número", () => {
    falso.linhas = [item("a")];
    falso.status = "carregando";
    render(<MenuLateral />);
    expect(contador()).toBe("Revisar");
    mudar([item("a")], "erro");
    expect(contador()).toBe("Revisar");
  });
});
