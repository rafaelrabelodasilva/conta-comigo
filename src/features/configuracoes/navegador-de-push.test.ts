// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarNavegadorDePush } from "./navegador-de-push";

// O navegador de verdade por trás de "Ativar notificações" (História 7.5), com `serviceWorker`, `PushManager` e
// `Notification` trocados por falsos: o que é lido do aparelho, a inscrição e o cancelamento. Nenhuma permissão real.

// Uma chave pública de teste: 0x04 e mais 64 bytes (não é uma chave VAPID de verdade), em base64url.
const BYTES = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 5 + 1) & 0xff)]);
const CHAVE = Buffer.from(BYTES).toString("base64url");
const JSON_DA_INSCRICAO = { endpoint: "https://push.exemplo/segredo", keys: { p256dh: "chave-p", auth: "chave-a" } };

type Globais = Record<string, unknown>;
const guardados: [object, string, PropertyDescriptor | undefined][] = [];

/** Troca uma propriedade global (e desfaz depois). */
function definir(alvo: object, nome: string, valor: unknown) {
  guardados.push([alvo, nome, Object.getOwnPropertyDescriptor(alvo, nome)]);
  Object.defineProperty(alvo, nome, { configurable: true, writable: true, value: valor });
}

function remover(alvo: object, nome: string) {
  guardados.push([alvo, nome, Object.getOwnPropertyDescriptor(alvo, nome)]);
  Reflect.deleteProperty(alvo, nome);
}

function registroFalso(inicial: object | null = null) {
  let atual: { toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null = inicial as never;
  const sub = () => ({ toJSON: () => JSON_DA_INSCRICAO, unsubscribe: vi.fn(async () => ((atual = null), true)) });
  const pushManager = {
    getSubscription: vi.fn(async () => atual),
    subscribe: vi.fn(async (opcoes: unknown) => ((void opcoes), (atual = sub()))),
  };
  return { pushManager, registro: { pushManager }, sub };
}

function aparelho(opcoes: { registro?: ReturnType<typeof registroFalso> | null; permissao?: string; push?: boolean } = {}) {
  const r = opcoes.registro === undefined ? registroFalso() : opcoes.registro;
  definir(navigator, "serviceWorker", { getRegistration: vi.fn(async () => r?.registro) });
  if (opcoes.push !== false) definir(window, "PushManager", class {});
  else remover(window, "PushManager");
  definir(globalThis, "Notification", {
    permission: opcoes.permissao ?? "default",
    requestPermission: vi.fn(async () => "granted"),
  } as Globais);
  definir(navigator, "userAgent", "Mozilla/5.0 (Windows NT 10.0) Chrome/130");
  definir(navigator, "platform", "Win32");
  definir(navigator, "maxTouchPoints", 0);
  definir(window, "matchMedia", (consulta: string) => ({ matches: false, media: consulta }));
  return r;
}

beforeEach(() => {
  guardados.length = 0;
});

afterEach(() => {
  for (const [alvo, nome, descritor] of guardados.reverse()) {
    if (descritor) Object.defineProperty(alvo, nome, descritor);
    else Reflect.deleteProperty(alvo, nome);
  }
});

describe("criarNavegadorDePush: ler", () => {
  it("PC com tudo: oferece, sem inscrição, permissão 'default'", async () => {
    aparelho();
    expect(await criarNavegadorDePush(CHAVE).ler()).toEqual({
      chaveConfigurada: true,
      temServiceWorker: true,
      temPushManager: true,
      temNotification: true,
      ehIOS: false,
      instalado: false,
      permissao: "default",
      inscrito: false,
    });
  });

  it("lê a permissão e a inscrição deste aparelho", async () => {
    const r = registroFalso();
    aparelho({ registro: r, permissao: "granted" });
    await r.pushManager.subscribe({});
    const lido = await criarNavegadorDePush(CHAVE).ler();
    expect(lido).toMatchObject({ permissao: "granted", inscrito: true });
  });

  it("chave pública ausente ou inválida: chaveConfigurada falso", async () => {
    aparelho();
    expect((await criarNavegadorDePush("").ler()).chaveConfigurada).toBe(false);
    expect((await criarNavegadorDePush("não é base64url!").ler()).chaveConfigurada).toBe(false);
  });

  it("iPad: pelo user agent, e pelo iPadOS que se diz Mac com toque; 'instalado' pelo modo standalone", async () => {
    aparelho();
    definir(navigator, "userAgent", "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X)");
    expect((await criarNavegadorDePush(CHAVE).ler()).ehIOS).toBe(true);

    definir(navigator, "userAgent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    definir(navigator, "platform", "MacIntel");
    definir(navigator, "maxTouchPoints", 5);
    expect((await criarNavegadorDePush(CHAVE).ler()).ehIOS).toBe(true);

    definir(navigator, "maxTouchPoints", 0); // um Mac de verdade
    expect((await criarNavegadorDePush(CHAVE).ler()).ehIOS).toBe(false);

    expect((await criarNavegadorDePush(CHAVE).ler()).instalado).toBe(false);
    definir(window, "matchMedia", (consulta: string) => ({ matches: consulta === "(display-mode: standalone)" }));
    expect((await criarNavegadorDePush(CHAVE).ler()).instalado).toBe(true);
    definir(window, "matchMedia", () => ({ matches: false }));
    definir(navigator, "standalone", true);
    expect((await criarNavegadorDePush(CHAVE).ler()).instalado).toBe(true);
  });

  it("sem service worker, sem PushManager ou sem Notification: diz o que falta, sem lançar", async () => {
    aparelho({ push: false });
    expect(await criarNavegadorDePush(CHAVE).ler()).toMatchObject({ temPushManager: false, inscrito: false });
    remover(navigator, "serviceWorker");
    expect(await criarNavegadorDePush(CHAVE).ler()).toMatchObject({ temServiceWorker: false, inscrito: false });
    remover(globalThis, "Notification");
    expect(await criarNavegadorDePush(CHAVE).ler()).toMatchObject({ temNotification: false, permissao: "default" });
  });

  it("registro do service worker que falha ao ler: não lança, vale 'sem inscrição'", async () => {
    aparelho();
    definir(navigator, "serviceWorker", { getRegistration: vi.fn(async () => Promise.reject(new Error("x"))) });
    expect((await criarNavegadorDePush(CHAVE).ler()).inscrito).toBe(false);
  });
});

describe("criarNavegadorDePush: pedirPermissao", () => {
  it("chama Notification.requestPermission e devolve a resposta", async () => {
    aparelho();
    expect(await criarNavegadorDePush(CHAVE).pedirPermissao()).toBe("granted");
    expect((Notification as unknown as { requestPermission: () => void }).requestPermission).toHaveBeenCalledTimes(1);
  });

  it("se o navegador lança, devolve a permissão atual", async () => {
    aparelho({ permissao: "denied" });
    definir(Notification, "requestPermission", vi.fn(async () => Promise.reject(new Error("x"))));
    expect(await criarNavegadorDePush(CHAVE).pedirPermissao()).toBe("denied");
  });
});

describe("criarNavegadorDePush: inscrever e cancelar", () => {
  it("inscreve com userVisibleOnly e a chave pública em bytes, e devolve endereço e chaves", async () => {
    const r = aparelho()!;
    const inscricao = await criarNavegadorDePush(CHAVE).inscrever();
    expect(inscricao).toEqual({ endpoint: "https://push.exemplo/segredo", p256dh: "chave-p", auth: "chave-a" });
    expect(r.pushManager.subscribe).toHaveBeenCalledTimes(1);
    const opcoes = r.pushManager.subscribe.mock.calls[0][0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(opcoes.userVisibleOnly).toBe(true);
    expect(Array.from(opcoes.applicationServerKey)).toEqual(Array.from(BYTES));
  });

  it("sem chave pública válida: nem tenta", async () => {
    const r = aparelho()!;
    expect(await criarNavegadorDePush("").inscrever()).toBeNull();
    expect(r.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("sem service worker registrado (o app ainda está se preparando): nulo", async () => {
    aparelho({ registro: null });
    expect(await criarNavegadorDePush(CHAVE).inscrever()).toBeNull();
  });

  it("a chave VAPID foi trocada (a inscrição velha impede a nova): cancela a velha e tenta de novo", async () => {
    const velha = { toJSON: () => JSON_DA_INSCRICAO, unsubscribe: vi.fn(async () => true) };
    const r = registroFalso(velha);
    aparelho({ registro: r });
    r.pushManager.subscribe.mockRejectedValueOnce(new DOMException("chave diferente", "InvalidStateError"));
    expect(await criarNavegadorDePush(CHAVE).inscrever()).toMatchObject({ endpoint: "https://push.exemplo/segredo" });
    expect(velha.unsubscribe).toHaveBeenCalledTimes(1);
    expect(r.pushManager.subscribe).toHaveBeenCalledTimes(2);
  });

  it("falha de novo na segunda tentativa: nulo, sem lançar", async () => {
    const r = registroFalso();
    aparelho({ registro: r });
    r.pushManager.subscribe.mockRejectedValue(new Error("negado"));
    expect(await criarNavegadorDePush(CHAVE).inscrever()).toBeNull();
  });

  it("devolve nulo se o que o navegador entrega não tem a forma esperada (endereço que não é https)", async () => {
    const r = registroFalso();
    aparelho({ registro: r });
    r.pushManager.subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "http://x", keys: {} }) } as never);
    expect(await criarNavegadorDePush(CHAVE).inscrever()).toBeNull();
  });

  it("cancelar tira a inscrição deste aparelho; sem inscrição, já está cancelado", async () => {
    const r = registroFalso();
    aparelho({ registro: r });
    await r.pushManager.subscribe({});
    const navegador = criarNavegadorDePush(CHAVE);
    expect(await navegador.cancelar()).toBe(true);
    expect(await navegador.inscricaoAtual()).toBeNull();
    expect(await navegador.cancelar()).toBe(true);
  });

  it("cancelar que lança: falso, sem lançar", async () => {
    const r = registroFalso();
    aparelho({ registro: r });
    r.pushManager.getSubscription.mockRejectedValue(new Error("x"));
    expect(await criarNavegadorDePush(CHAVE).cancelar()).toBe(false);
  });
});
