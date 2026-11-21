// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Defeito 10: a página de entrar zera os gerenciadores de Realtime (o redirect do "Sair" não recarrega a página).
const falso = vi.hoisted(() => ({ zerarGerenciadores: vi.fn(async () => {}) }));
vi.mock("@/data/realtime", () => ({ zerarGerenciadores: falso.zerarGerenciadores }));

import { ZerarAoEntrar } from "./ZerarAoEntrar";

beforeEach(() => {
  falso.zerarGerenciadores.mockClear();
});

describe("ZerarAoEntrar", () => {
  it("ao abrir a página de entrar, zera os gerenciadores uma vez e não desenha nada", () => {
    const { container } = render(<ZerarAoEntrar />);
    expect(falso.zerarGerenciadores).toHaveBeenCalledOnce();
    expect(container.innerHTML).toBe("");
  });
});
