// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROTULOS } from "@/domain/mensagens";
import { TentarDeNovo } from "./TentarDeNovo";

// `window.location` do jsdom não deixa trocar `reload`: troca o objeto todo.
const original = window.location;

function definirLocal(caminho: string) {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, pathname: caminho, reload },
  });
  return reload;
}

function clicar() {
  render(<TentarDeNovo />);
  const link = screen.getByRole("link", { name: ROTULOS.tentar_de_novo });
  expect(link.getAttribute("href")).toBe("/");
  // `fireEvent` devolve false quando o padrão (seguir o link) foi impedido.
  return fireEvent.click(link);
}

describe("TentarDeNovo", () => {
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("fora de /sem-conexao (página de reserva do service worker): recarrega e impede o link", () => {
    const reload = definirLocal("/configuracoes");
    expect(clicar()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("em /sem-conexao: segue o link para / sem recarregar", () => {
    const reload = definirLocal("/sem-conexao");
    expect(clicar()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
