// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELER_HOJE_A_CADA_MS, useHoje } from "./use-hoje";

function Dia() {
  return <p data-testid="hoje">{useHoje()}</p>;
}

describe("useHoje", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T02:50:00Z")); // 23:50 de 16/11 em São Paulo
  });
  afterEach(() => vi.useRealTimers());

  it("é o dia de São Paulo, não o do UTC", () => {
    render(<Dia />);
    expect(screen.getByTestId("hoje").textContent).toBe("2026-11-16");
  });

  it("o dia vira com a tela aberta: o relógio é relido a cada minuto", () => {
    render(<Dia />);
    vi.setSystemTime(new Date("2026-11-17T03:05:00Z")); // 00:05 de 17/11
    act(() => {
      vi.advanceTimersByTime(RELER_HOJE_A_CADA_MS);
    });
    expect(screen.getByTestId("hoje").textContent).toBe("2026-11-17");
  });

  it("e também quando a janela ganha o foco ou a aba volta a ficar visível", () => {
    render(<Dia />);
    vi.setSystemTime(new Date("2026-11-17T03:05:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("hoje").textContent).toBe("2026-11-17");
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("hoje").textContent).toBe("2026-11-18");
  });

  it("não redesenha enquanto o dia é o mesmo", () => {
    const aoDesenhar = vi.fn();
    render(
      <Profiler id="dia" onRender={aoDesenhar}>
        <Dia />
      </Profiler>,
    );
    const antes = aoDesenhar.mock.calls.length;
    vi.setSystemTime(new Date("2026-11-17T02:55:00Z"));
    act(() => {
      vi.advanceTimersByTime(RELER_HOJE_A_CADA_MS);
    });
    expect(aoDesenhar.mock.calls.length).toBe(antes);
  });

  it("ao desmontar, solta o intervalo e os ouvintes", () => {
    const { unmount } = render(<Dia />);
    const fechar = vi.spyOn(document, "removeEventListener");
    unmount();
    expect(fechar).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
