// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoAparencia } from "./SecaoAparencia";

const falso = vi.hoisted(() => ({
  linhas: [] as unknown[],
  definirAparencia: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.linhas }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({ definirAparencia: falso.definirAparencia }),
}));

function montar() {
  render(
    <ToastProvider>
      <SecaoAparencia />
    </ToastProvider>,
  );
  // A seção e o seletor se chamam "Aparência"; o seletor é o combobox.
  return screen.getByRole<HTMLSelectElement>("combobox", { name: ROTULOS.aparencia });
}

describe("SecaoAparencia", () => {
  beforeEach(() => {
    falso.linhas = [];
    falso.definirAparencia.mockReset();
  });

  it("mostra a Aparência guardada; sem linha, Sistema", () => {
    expect(montar().value).toBe("sistema");
  });

  it("chama definirAparencia com a escolha", async () => {
    falso.definirAparencia.mockResolvedValue({ ok: true });
    const seletor = montar();
    await userEvent.setup().selectOptions(seletor, ROTULOS.aparencia_escuro);
    expect(falso.definirAparencia).toHaveBeenCalledTimes(1);
    expect(falso.definirAparencia).toHaveBeenCalledWith("escuro");
  });

  it("recusa do banco mostra o toast", async () => {
    falso.definirAparencia.mockResolvedValue({ ok: false });
    const seletor = montar();
    await userEvent.setup().selectOptions(seletor, ROTULOS.aparencia_claro);
    expect(falso.definirAparencia).toHaveBeenCalledWith("claro");
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
  });
});
