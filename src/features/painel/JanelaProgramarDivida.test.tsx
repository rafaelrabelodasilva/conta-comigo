// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JanelaProgramarDivida, type PropsJanelaProgramarDivida } from "./JanelaProgramarDivida";

// "Programar dívida" (História 6.6, UX-DR19): a data combinada obrigatória e a observação opcional. A regra de
// quais linhas valem é do núcleo (`planejarProgramacao`); a gravação é de quem abre.

function montar(extra: Partial<PropsJanelaProgramarDivida> = {}) {
  const aoMudar = vi.fn();
  const aoProgramar = vi.fn<PropsJanelaProgramarDivida["aoProgramar"]>(async () => ({ ok: true }));
  render(
    <JanelaProgramarDivida
      aberta
      aoMudar={aoMudar}
      quantidade={3}
      dataInicial=""
      observacaoInicial=""
      hoje="2026-11-16"
      online
      aoProgramar={aoProgramar}
      {...extra}
    />,
  );
  return { aoMudar, aoProgramar };
}

const data = () => screen.getByLabelText("Data combinada") as HTMLInputElement;
const observacao = () => screen.getByLabelText("Observação (opcional)") as HTMLTextAreaElement;

describe("JanelaProgramarDivida", () => {
  it("abre com o título, a descrição e quantos lançamentos programa; sem data, 'Programar' avisa e não grava", async () => {
    const { aoProgramar, aoMudar } = montar();
    expect(screen.getByRole("dialog", { name: "Programar dívida" })).toBeTruthy();
    expect(screen.getByText(/3 lançamentos · Combine uma data/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Programar" }));
    expect(screen.getByText("Escolha a data combinada.")).toBeTruthy();
    expect(aoProgramar).not.toHaveBeenCalled();
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("grava a data e a observação digitadas e fecha quando dá certo", async () => {
    const { aoProgramar, aoMudar } = montar();
    await userEvent.type(data(), "2027-04-06");
    await userEvent.type(observacao(), "Lucas paga tudo no final");
    await userEvent.click(screen.getByRole("button", { name: "Programar" }));
    expect(aoProgramar).toHaveBeenCalledWith("2027-04-06", "Lucas paga tudo no final");
    await vi.waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("o erro da gravação aparece na janela, que fica aberta com o que foi digitado", async () => {
    const { aoMudar } = montar({ aoProgramar: vi.fn(async () => ({ ok: false as const, texto: "Não foi possível salvar. Tente de novo." })) });
    await userEvent.type(data(), "2027-04-06");
    await userEvent.click(screen.getByRole("button", { name: "Programar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível salvar. Tente de novo.");
    expect(aoMudar).not.toHaveBeenCalled();
    expect(data().value).toBe("2027-04-06");
  });

  it("Editar: abre com a data e a observação que a Dívida já tem", () => {
    montar({ dataInicial: "2027-04-06", observacaoInicial: "tudo no final", quantidade: 1 });
    expect(data().value).toBe("2027-04-06");
    expect(observacao().value).toBe("tudo no final");
    expect(screen.getByText(/1 lançamento · /)).toBeTruthy();
  });

  it("uma data que já chegou (o mês dela ou antes) avisa que entra na cobrança agora", async () => {
    montar();
    expect(screen.queryByText(/já chegou/)).toBeNull();
    await userEvent.type(data(), "2026-11-02");
    expect(screen.getByText("Essa data já chegou: o lançamento entra na cobrança agora.")).toBeTruthy();
  });

  it("sem conexão, 'Programar' fica desativado (AD-3) e a janela diz por quê", () => {
    montar({ online: false });
    expect((screen.getByRole("button", { name: "Programar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Sem conexão/)).toBeTruthy();
  });

  it("Cancelar fecha sem gravar", async () => {
    const { aoMudar, aoProgramar } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoProgramar).not.toHaveBeenCalled();
  });
});
