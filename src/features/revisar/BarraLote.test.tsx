// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_REVISAR as T } from "@/domain/mensagens";
import { BarraLote, VARIAVEL_ALTURA_BARRA } from "./BarraLote";

function desenhar(extras: { quantidade?: number; total?: number; ocupado?: boolean } = {}) {
  const acoes = {
    aoLimpar: vi.fn(),
    aoEscolherResponsavel: vi.fn(),
    aoEscolherTipo: vi.fn(),
    aoAplicarSugestoes: vi.fn(),
  };
  const r = render(<BarraLote quantidade={extras.quantidade ?? 3} totalCentavos={extras.total ?? 20910} ocupado={extras.ocupado} {...acoes} />);
  return { ...acoes, ...r };
}

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(VARIAVEL_ALTURA_BARRA);
});

describe("BarraLote (selection-bar)", () => {
  it("'N selecionados · R$ total' com o total em negrito, num status para o leitor de tela", () => {
    desenhar();
    const status = screen.getByRole("status");
    expect(status.textContent?.replaceAll(" ", " ")).toBe("3 selecionados · R$ 209,10");
    const total = status.querySelector("strong")!;
    expect(total.textContent?.replaceAll(" ", " ")).toBe("R$ 209,10");
    expect(total.className).toContain("texto-body-strong");
  });

  it("singular e total negativo (soma líquida de créditos)", () => {
    desenhar({ quantidade: 1, total: -8 });
    expect(screen.getByRole("status").textContent?.replaceAll(" ", " ")).toBe("1 selecionado · - R$ 0,08");
  });

  it("visual: fundo nav, branco, raio md, sombra flutuante, presa embaixo", () => {
    desenhar();
    const barra = screen.getByRole("region", { name: T.barra_lote });
    for (const c of ["bg-nav", "text-on-dark", "rounded-md", "shadow-flutuante"]) expect(barra.className).toContain(c);
    expect(barra.parentElement!.className).toContain("fixed");
    expect(barra.parentElement!.className).toContain("bottom-6");
  });

  it("Limpar, Responsável…, Tipo… e Aplicar sugestões (principal) chamam suas ações", async () => {
    const a = desenhar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: T.limpar }));
    await u.click(screen.getByRole("button", { name: T.responsavel_lote }));
    await u.click(screen.getByRole("button", { name: T.tipo_lote }));
    const aplicar = screen.getByRole("button", { name: T.aplicar_sugestoes });
    expect(aplicar.className).toContain("bg-accent");
    await u.click(aplicar);
    expect(a.aoLimpar).toHaveBeenCalledOnce();
    expect(a.aoEscolherResponsavel).toHaveBeenCalledOnce();
    expect(a.aoEscolherTipo).toHaveBeenCalledOnce();
    expect(a.aoAplicarSugestoes).toHaveBeenCalledOnce();
  });

  it("gravando: as quatro ações ficam desligadas", () => {
    desenhar({ ocupado: true });
    for (const b of screen.getAllByRole("button")) expect(b.hasAttribute("disabled")).toBe(true);
  });

  it("publica a altura em --altura-barra-inferior enquanto existe e a retira ao sair", () => {
    const { unmount } = desenhar();
    expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toMatch(/^\d+px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toBe("");
  });

  it("a altura publicada é a da barra mais a folga, e o ResizeObserver a atualiza", () => {
    let altura = 56;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => altura });
    let avisar: () => void = () => {};
    class ObservadorFalso {
      constructor(aoMudar: () => void) {
        avisar = aoMudar;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ObservadorFalso);
    try {
      desenhar();
      expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toBe("64px");
      altura = 96;
      avisar();
      expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toBe("104px");
    } finally {
      vi.unstubAllGlobals();
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      else delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});
