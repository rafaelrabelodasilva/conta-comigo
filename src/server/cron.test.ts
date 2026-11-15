import { afterEach, describe, expect, it, vi } from "vitest";
import { autorizadoPeloCron, segredoDoCron } from "./cron";

const SEGREDO = "segredo-do-cron-de-teste-0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("autorizadoPeloCron", () => {
  it("só o cabeçalho exato `Bearer <segredo>` passa", () => {
    expect(autorizadoPeloCron(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true);
  });

  it.each([
    null,
    "",
    "Bearer",
    "Bearer ",
    SEGREDO,
    `bearer ${SEGREDO}`,
    `Bearer  ${SEGREDO}`,
    `Bearer ${SEGREDO} `,
    ` Bearer ${SEGREDO}`,
    `Bearer ${SEGREDO}x`,
    `Bearer ${SEGREDO.slice(0, -1)}`,
    `Bearer ${SEGREDO.toUpperCase()}`,
    `Basic ${SEGREDO}`,
    "Bearer outro-segredo-do-mesmo-tamanho-012345",
  ])("recusa %j", (cabecalho) => {
    expect(autorizadoPeloCron(cabecalho, SEGREDO)).toBe(false);
  });

  it("sem segredo configurado ninguém passa, nem `Bearer undefined` ou `Bearer `", () => {
    for (const segredo of [undefined, ""]) {
      for (const cabecalho of [null, "", "Bearer ", "Bearer undefined", "Bearer null", `Bearer ${segredo}`]) {
        expect(autorizadoPeloCron(cabecalho, segredo)).toBe(false);
      }
    }
  });

  it("cabeçalhos de tamanhos e caracteres diferentes não lançam (a comparação é por resumo)", () => {
    expect(() => autorizadoPeloCron("Bearer " + "é".repeat(5000), SEGREDO)).not.toThrow();
    expect(autorizadoPeloCron("Bearer " + "é".repeat(5000), SEGREDO)).toBe(false);
  });
});

describe("segredoDoCron", () => {
  it("lê CRON_SECRET; vazio ou ausente vira undefined", () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    expect(segredoDoCron()).toBe(SEGREDO);
    vi.stubEnv("CRON_SECRET", "");
    expect(segredoDoCron()).toBeUndefined();
    vi.stubEnv("CRON_SECRET", "   ");
    expect(segredoDoCron()).toBeUndefined();
  });
});
