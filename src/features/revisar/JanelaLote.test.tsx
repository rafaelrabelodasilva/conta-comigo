// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, TEXTOS_REVISAR as T } from "@/domain/mensagens";
import { JanelaLote } from "./JanelaLote";

const falso = vi.hoisted(() => ({ contarUsos: vi.fn() }));
vi.mock("@/data/cadastros-repo", () => ({ repoCadastros: () => ({ contarUsos: falso.contarUsos }) }));

const responsaveis = [
  { id: "casal", nome: "Casal", arquivado: false },
  { id: "rafael", nome: "Rafael", arquivado: false },
  { id: "antigo", nome: "Antigo", arquivado: true },
];

function desenhar(campo: "responsavel" | "tipo" = "responsavel", aoAplicar = vi.fn(async () => true)) {
  const aoMudar = vi.fn();
  render(<JanelaLote campo={campo} quantidade={3} cadastros={responsaveis} aberta aoMudar={aoMudar} aoAplicar={aoAplicar} />);
  return { aoMudar, aoAplicar };
}

const opcoes = () => within(screen.getByLabelText(T.responsavel)).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  falso.contarUsos.mockResolvedValue({ ok: false, codigo: "carregar.falhou" });
});

describe("JanelaLote", () => {
  it("um Seletor só com os ativos (ordem do cadastro se a contagem falha) e 'Aplicar a 3' desligado até escolher", async () => {
    desenhar();
    expect(screen.getByRole("dialog", { name: T.titulo_lote_responsavel })).toBeTruthy();
    expect(screen.getByText("3 selecionados")).toBeTruthy();
    await waitFor(() => expect(falso.contarUsos).toHaveBeenCalledWith("responsavel"));
    expect(opcoes()).toEqual([T.escolha, "Casal", "Rafael"]);
    expect(screen.getByRole("button", { name: "Aplicar a 3" }).hasAttribute("disabled")).toBe(true);
  });

  it("os mais usados primeiro", async () => {
    falso.contarUsos.mockResolvedValue({ ok: true, valor: new Map([["rafael", 9], ["casal", 2]]) });
    desenhar();
    await waitFor(() => expect(opcoes()).toEqual([T.escolha, "Rafael", "Casal"]));
  });

  it("o de Tipo conta os usos de tipo e usa o título de Tipo", async () => {
    desenhar("tipo");
    expect(screen.getByRole("dialog", { name: T.titulo_lote_tipo })).toBeTruthy();
    await waitFor(() => expect(falso.contarUsos).toHaveBeenCalledWith("tipo"));
    expect(screen.getByLabelText(T.tipo)).toBeTruthy();
  });

  it("Aplicar grava o escolhido e fecha quando dá certo", async () => {
    const { aoMudar, aoAplicar } = desenhar();
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText(T.responsavel), "casal");
    await u.click(screen.getByRole("button", { name: "Aplicar a 3" }));
    expect(aoAplicar).toHaveBeenCalledExactlyOnceWith("casal");
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("falhou: a janela fica aberta com a escolha", async () => {
    const { aoMudar } = desenhar("responsavel", vi.fn(async () => false));
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText(T.responsavel), "rafael");
    await u.click(screen.getByRole("button", { name: "Aplicar a 3" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar a 3" }).hasAttribute("disabled")).toBe(false));
    expect(aoMudar).not.toHaveBeenCalled();
    expect((screen.getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("rafael");
  });

  it("Cancelar fecha sem gravar", async () => {
    const { aoMudar, aoAplicar } = desenhar();
    await userEvent.setup().click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoAplicar).not.toHaveBeenCalled();
  });
});
