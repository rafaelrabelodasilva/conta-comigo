// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeloStatus, varianteDoStatus } from "./SeloStatus";

describe("SeloStatus", () => {
  it.each([
    ["pago", "bg-status-paid-bg", "text-status-paid-fg"],
    ["nao_pago", "bg-status-unpaid-bg", "text-status-unpaid-fg"],
    ["parcial", "bg-status-partial-bg", "text-status-partial-fg"],
    ["atrasado", "bg-status-late-bg", "text-status-late-fg"],
  ] as const)("%s usa só os tokens %s e %s", (variante, fundo, texto) => {
    render(<SeloStatus variante={variante}>Texto</SeloStatus>);
    const selo = screen.getByText("Texto");
    expect(selo.className).toContain(fundo);
    expect(selo.className).toContain(texto);
    expect(selo.getAttribute("data-selo")).toBe(variante);
  });

  it("a palavra é sempre texto: a cor nunca é a única pista (NFR8)", () => {
    render(<SeloStatus variante="atrasado">Atrasado</SeloStatus>);
    expect(screen.getByText("Atrasado").textContent).toBe("Atrasado");
  });

  it("repassa title e className", () => {
    render(
      <SeloStatus variante="atrasado" title="atrasado desde 17/11/26" className="ml-1">
        Atrasado
      </SeloStatus>,
    );
    const selo = screen.getByText("Atrasado");
    expect(selo.getAttribute("title")).toBe("atrasado desde 17/11/26");
    expect(selo.className).toContain("ml-1");
  });

  it("varianteDoStatus: pelo 'conta como pago' do Status cadastrado", () => {
    expect(varianteDoStatus(true)).toBe("pago");
    expect(varianteDoStatus(false)).toBe("nao_pago");
  });
});
