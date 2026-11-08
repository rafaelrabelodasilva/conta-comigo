// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEXTOS_PAINEL } from "@/domain/mensagens";
import { mesesDaLista } from "@/domain/painel";
import { SeletorMes } from "./SeletorMes";

function montar(mes: string, comFatura: string[] = ["2026-10", "2026-11"]) {
  const aoMudar = vi.fn();
  render(
    <SeletorMes
      mes={mes}
      meses={mesesDaLista(comFatura, "2026-11", mes)}
      mesesComFatura={new Set(comFatura)}
      aoMudar={aoMudar}
    />,
  );
  return { aoMudar, u: userEvent.setup() };
}

describe("SeletorMes", () => {
  it("mostra 'Out/26' e as setas andam um Mês, sem limite", async () => {
    const { aoMudar, u } = montar("2026-10");
    expect(screen.getByRole("button", { name: "outubro/26, escolher o Mês" }).textContent).toBe("Out/26");
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect(aoMudar).toHaveBeenLastCalledWith("2026-11");
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(aoMudar).toHaveBeenLastCalledWith("2026-09");
  });

  it("selo 'Fechado' ao lado do seletor só no Mês com Fatura", () => {
    montar("2026-10");
    expect(screen.getByText(TEXTOS_PAINEL.fechado)).toBeTruthy();
  });

  it("Mês sem Fatura: sem selo", () => {
    montar("2026-12");
    expect(screen.queryByText(TEXTOS_PAINEL.fechado)).toBeNull();
  });

  it("popover: do Mês mais antigo com Fatura ao atual + 1, com 'Fechado'; escolher troca e fecha", async () => {
    const { aoMudar, u } = montar("2026-11");
    await u.click(screen.getByRole("button", { name: "novembro/26, escolher o Mês" }));
    const lista = await screen.findByRole("list", { name: TEXTOS_PAINEL.meses });
    const itens = within(lista).getAllByRole("button");
    expect(itens.map((b) => b.getAttribute("aria-label"))).toEqual([
      "outubro/26, Fechado",
      "novembro/26, Fechado",
      "dezembro/26",
    ]);
    expect(itens[1].getAttribute("aria-current")).toBe("true");
    await u.click(itens[2]);
    expect(aoMudar).toHaveBeenCalledWith("2026-12");
    expect(screen.queryByRole("list", { name: TEXTOS_PAINEL.meses })).toBeNull();
  });

  it("o Mês aberto fora do intervalo entra na lista", async () => {
    const { u } = montar("2027-04");
    await u.click(screen.getByRole("button", { name: "abril/27, escolher o Mês" }));
    const lista = await screen.findByRole("list", { name: TEXTOS_PAINEL.meses });
    expect(within(lista).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "outubro/26, Fechado",
      "novembro/26, Fechado",
      "dezembro/26",
      "abril/27",
    ]);
  });
});
