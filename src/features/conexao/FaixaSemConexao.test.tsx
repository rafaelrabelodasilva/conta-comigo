// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mensagem } from "@/domain/mensagens";
import { FaixaSemConexao } from "./FaixaSemConexao";

// O detector real, com o `navigator.onLine` do jsdom e os eventos da janela.
// O módulo é reimportado em cada teste para o estado inicial ser lido de novo.

function definirOnLine(valor: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => valor });
}

async function montar() {
  vi.resetModules();
  const { FaixaSemConexao: Faixa } = await import("./FaixaSemConexao");
  render(<Faixa />);
}

const texto = () => screen.queryByText(mensagem("conexao.sem_conexao"));

describe("FaixaSemConexao", () => {
  afterEach(() => definirOnLine(true));

  it("online: nada aparece, mas o contêiner de status está montado", async () => {
    definirOnLine(true);
    await montar();
    expect(texto()).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("começa offline: a faixa aparece dentro do status", async () => {
    definirOnLine(false);
    await montar();
    expect(screen.getByRole("status").textContent).toBe(mensagem("conexao.sem_conexao"));
  });

  it("segue os eventos offline e online", async () => {
    definirOnLine(true);
    await montar();
    act(() => {
      definirOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(texto()).not.toBeNull();
    expect(texto()?.className).toContain("bg-nav");
    expect(texto()?.className).toContain("text-nav-label");
    act(() => {
      definirOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(texto()).toBeNull();
  });

  it("fixa: aparece mesmo online (página /sem-conexao)", () => {
    definirOnLine(true);
    render(<FaixaSemConexao fixa />);
    expect(texto()).not.toBeNull();
  });
});
