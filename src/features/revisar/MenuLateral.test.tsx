// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuLateral } from "./MenuLateral";

// O roteador do Next, o gerenciador da fila e o hook da Central de Avisos são falsos; o menu de verdade
// (`NavRail`) desenha os contadores.
const falso = vi.hoisted(() => ({
  avisos: { status: "carregando" } as
    | { status: "carregando" }
    | { status: "erro" }
    | { status: "pronto"; central: { naoLidos: number } },
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
vi.mock("@/features/avisos/use-central-de-avisos", () => ({ useCentralDeAvisos: () => falso.avisos }));

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

const avisos = () => screen.getByRole("link", { name: /Avisos/ });

beforeEach(() => {
  falso.avisos = { status: "carregando" };
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

  describe("contador de Avisos (a Central de Avisos, 8.1)", () => {
    it("com não lidos, mostra o número em texto e o nome acessível 'Avisos, 3 não lidos'", () => {
      falso.avisos = { status: "pronto", central: { naoLidos: 3 } };
      render(<MenuLateral />);
      expect(avisos().textContent).toBe("Avisos3, 3 não lidos");
      expect(screen.getByRole("link", { name: "Avisos, 3 não lidos" })).toBeTruthy();
    });

    it("1 não lido: 'Avisos, 1 não lido'", () => {
      falso.avisos = { status: "pronto", central: { naoLidos: 1 } };
      render(<MenuLateral />);
      expect(screen.getByRole("link", { name: "Avisos, 1 não lido" })).toBeTruthy();
    });

    it("zero não lidos: o contador some", () => {
      falso.avisos = { status: "pronto", central: { naoLidos: 0 } };
      render(<MenuLateral />);
      expect(avisos().textContent).toBe("Avisos");
    });

    it("acima de 99: '99+' (e 'mais de 99 não lidos' para o leitor de tela); 99 ainda é 99", () => {
      falso.avisos = { status: "pronto", central: { naoLidos: 99 } };
      const { unmount } = render(<MenuLateral />);
      expect(screen.getByRole("link", { name: "Avisos, 99 não lidos" }).textContent).toContain("99");
      unmount();
      falso.avisos = { status: "pronto", central: { naoLidos: 100 } };
      render(<MenuLateral />);
      expect(screen.getByRole("link", { name: "Avisos, mais de 99 não lidos" }).textContent).toBe("Avisos99+, mais de 99 não lidos");
    });

    it("enquanto carrega ou com erro, nada (nunca um número parcial)", () => {
      falso.avisos = { status: "carregando" };
      const { unmount } = render(<MenuLateral />);
      expect(avisos().textContent).toBe("Avisos");
      unmount();
      falso.avisos = { status: "erro" };
      render(<MenuLateral />);
      expect(avisos().textContent).toBe("Avisos");
    });

    it("o contador do Revisar e o dos Avisos são independentes", () => {
      falso.linhas = [item("a")];
      falso.avisos = { status: "pronto", central: { naoLidos: 4 } };
      render(<MenuLateral />);
      expect(contador()).toBe("Revisar, 1 para revisar");
      expect(screen.getByRole("link", { name: "Avisos, 4 não lidos" })).toBeTruthy();
    });

    it("o alvo de toque do item é o de 44 pt (min-h-toque), com contador ou sem", () => {
      falso.avisos = { status: "pronto", central: { naoLidos: 2 } };
      render(<MenuLateral />);
      expect(avisos().className).toContain("min-h-toque");
    });
  });
});
