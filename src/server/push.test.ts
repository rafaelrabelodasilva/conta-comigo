import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O envio de Web Push (História 7.5): a configuração VAPID só do ambiente do servidor e o envio com o pacote
// `web-push` trocado por um falso (nenhum teste fala com a rede nem usa chave VAPID de verdade).

const mocks = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.sendNotification } }));

import { configuracaoVapid, criarEnviadorWebPush } from "./push";

const CONFIG = { subject: "https://app.exemplo", chavePublica: "publica-de-teste", chavePrivada: "privada-de-teste" };
const INSCRICAO = {
  endpoint: "https://push.exemplo/segredo-do-endpoint",
  chave_p256dh: "p256dh-de-teste",
  chave_auth: "auth-de-teste",
};

beforeEach(() => {
  mocks.sendNotification.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuracaoVapid", () => {
  it("lê as três variáveis (a pública, a privada e o subject)", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", " publica ");
    vi.stubEnv("VAPID_PRIVATE_KEY", " privada ");
    vi.stubEnv("VAPID_SUBJECT", " https://app.exemplo ");
    expect(configuracaoVapid()).toEqual({ subject: "https://app.exemplo", chavePublica: "publica", chavePrivada: "privada" });
  });

  it.each(["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])("sem %s: nulo (o Cron só pula)", (faltando) => {
    for (const nome of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
      vi.stubEnv(nome, nome === faltando ? "" : "valor");
    }
    expect(configuracaoVapid()).toBeNull();
  });

  it("espaços não contam como valor", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "   ");
    vi.stubEnv("VAPID_SUBJECT", "https://app.exemplo");
    expect(configuracaoVapid()).toBeNull();
  });
});

describe("criarEnviadorWebPush", () => {
  it("envia com a inscrição, o corpo e os detalhes VAPID (validade de 1 dia, urgência normal)", async () => {
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    const r = await criarEnviadorWebPush(CONFIG)(INSCRICAO, '{"titulo":"x"}');
    expect(r).toEqual({ ok: true });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    const [alvo, corpo, opcoes] = mocks.sendNotification.mock.calls[0];
    expect(alvo).toEqual({ endpoint: INSCRICAO.endpoint, keys: { p256dh: "p256dh-de-teste", auth: "auth-de-teste" } });
    expect(corpo).toBe('{"titulo":"x"}');
    expect(opcoes).toMatchObject({
      vapidDetails: { subject: "https://app.exemplo", publicKey: "publica-de-teste", privateKey: "privada-de-teste" },
      TTL: 86_400,
      urgency: "normal",
    });
    expect(opcoes.timeout).toBeGreaterThan(0);
  });

  it.each([404, 410, 500, 401, 413])("recusa %i: devolve só o código", async (statusCode) => {
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error(`falhou em ${INSCRICAO.endpoint}`), { statusCode }));
    expect(await criarEnviadorWebPush(CONFIG)(INSCRICAO, "{}")).toEqual({ ok: false, status: statusCode });
  });

  it("erro sem código (rede, chave inválida, tempo): status nulo, sem lançar e sem o texto do erro", async () => {
    mocks.sendNotification.mockRejectedValue(new Error(`Vapid key inválida ${CONFIG.chavePrivada} ${INSCRICAO.endpoint}`));
    const r = await criarEnviadorWebPush(CONFIG)(INSCRICAO, "{}");
    expect(r).toEqual({ ok: false, status: null });
    expect(JSON.stringify(r)).not.toMatch(/privada|segredo-do-endpoint/);
  });

  it("rejeição que nem é um Error: também vira status nulo", async () => {
    mocks.sendNotification.mockRejectedValue(undefined);
    expect(await criarEnviadorWebPush(CONFIG)(INSCRICAO, "{}")).toEqual({ ok: false, status: null });
  });
});

describe("as variáveis VAPID no .env.example (AD-12)", () => {
  const exemplo = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

  it("a pública é NEXT_PUBLIC_; a privada e o subject nunca são, e nada tem valor", () => {
    expect(exemplo).toMatch(/^NEXT_PUBLIC_VAPID_PUBLIC_KEY=$/m);
    expect(exemplo).toMatch(/^VAPID_PRIVATE_KEY=$/m);
    expect(exemplo).toMatch(/^VAPID_SUBJECT=$/m);
    expect(exemplo).not.toMatch(/NEXT_PUBLIC_VAPID_PRIVATE|NEXT_PUBLIC_[A-Z_]*VAPID_SUBJECT/);
  });
});
