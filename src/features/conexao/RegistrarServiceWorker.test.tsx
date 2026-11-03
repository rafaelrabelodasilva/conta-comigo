// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrarServiceWorker } from "./RegistrarServiceWorker";

// `navigator.serviceWorker` falso (o jsdom não tem).
const falso = {
  register: vi.fn(),
  getRegistrations: vi.fn(),
  unregister: vi.fn(),
};

describe("RegistrarServiceWorker", () => {
  beforeEach(() => {
    falso.register.mockReset().mockResolvedValue({});
    falso.unregister.mockReset().mockResolvedValue(true);
    falso.getRegistrations
      .mockReset()
      .mockResolvedValue([{ unregister: falso.unregister }, { unregister: falso.unregister }]);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: falso.register, getRegistrations: falso.getRegistrations },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("em produção registra /sw.js na raiz, sem cache HTTP do script", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<RegistrarServiceWorker />);
    expect(falso.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(falso.getRegistrations).not.toHaveBeenCalled();
  });

  it("fora de produção não registra e desregistra os que existem", async () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<RegistrarServiceWorker />);
    expect(falso.register).not.toHaveBeenCalled();
    await waitFor(() => expect(falso.unregister).toHaveBeenCalledTimes(2));
  });

  it("sem suporte a service worker, não faz nada", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => render(<RegistrarServiceWorker />)).not.toThrow();
  });
});
