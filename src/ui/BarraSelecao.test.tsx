// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarraSelecao, VARIAVEL_ALTURA_BARRA } from "./BarraSelecao";
import { MenuAcoes } from "./MenuAcoes";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(VARIAVEL_ALTURA_BARRA);
});

describe("BarraSelecao (base da selection-bar)", () => {
  it("por padrão a contagem é o role=status; com regiaoPropria=false, não (a tela mantém a região dela)", () => {
    const { rerender } = render(
      <BarraSelecao rotulo="Ações" contagem="2 selecionados" total="R$ 10,00">
        <button type="button">x</button>
      </BarraSelecao>,
    );
    expect(screen.getByRole("status").textContent).toBe("2 selecionados · R$ 10,00");
    rerender(
      <BarraSelecao rotulo="Ações" contagem="2 selecionados" total="R$ 10,00" regiaoPropria={false}>
        <button type="button">x</button>
      </BarraSelecao>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("region", { name: "Ações" })).toBeTruthy();
  });

  it("com o painel lateral aberto: deixa a coluna dele livre de lg para cima e some abaixo de lg", () => {
    render(
      <BarraSelecao rotulo="Ações" contagem="1 selecionado" total="R$ 1,00" comPainelLateral>
        <button type="button">x</button>
      </BarraSelecao>,
    );
    const fixa = screen.getByRole("region", { name: "Ações" }).parentElement!;
    expect(fixa.className).toContain("lg:right-painel-lateral");
    expect(fixa.className).toContain("max-lg:hidden");
  });

  it("publica a altura em --altura-barra-inferior e a retira ao sair", () => {
    const { unmount } = render(
      <BarraSelecao rotulo="Ações" contagem="1 selecionado" total="R$ 1,00">
        <span />
      </BarraSelecao>,
    );
    expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toMatch(/px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue(VARIAVEL_ALTURA_BARRA)).toBe("");
  });
});

describe("MenuAcoes com gatilho de texto (⋯ Mais)", () => {
  it("o botão tem o texto como nome e abre o menu com os itens", async () => {
    const aoEscolher = vi.fn();
    render(
      <MenuAcoes rotulo="Mais" gatilhoComTexto={{ texto: "Mais" }} itens={[{ rotulo: "Excluir", aoEscolher, destrutivo: true }]} />,
    );
    const gatilho = screen.getByRole("button", { name: "Mais" });
    expect(gatilho.textContent).toBe("⋯Mais");
    await userEvent.setup().click(gatilho);
    await userEvent.setup().click(await screen.findByRole("menuitem", { name: "Excluir" }));
    expect(aoEscolher).toHaveBeenCalledOnce();
  });

  it("desativado não abre", () => {
    render(<MenuAcoes rotulo="Mais" gatilhoComTexto={{ texto: "Mais", desativado: true }} itens={[]} />);
    expect((screen.getByRole("button", { name: "Mais" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
