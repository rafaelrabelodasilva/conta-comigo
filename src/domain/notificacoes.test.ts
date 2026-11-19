import { describe, expect, it } from "vitest";
import { TEXTOS_NOTIFICACOES, textoDoEstadoDasNotificacoes } from "./mensagens";
import {
  chaveVapidEmBytes,
  estadoDasNotificacoes,
  lerInscricaoDePush,
  type AmbienteDeNotificacao,
} from "./notificacoes";

// Em que pé estão as notificações neste aparelho (História 7.5): iPad com o app instalado, iPad sem ele, PC,
// navegador sem suporte, ambiente sem chave VAPID, permissão bloqueada.

const PC: AmbienteDeNotificacao = {
  chaveConfigurada: true,
  temServiceWorker: true,
  temPushManager: true,
  temNotification: true,
  ehIOS: false,
  instalado: false,
  permissao: "default",
  inscrito: false,
};
const comAmbiente = (extra: Partial<AmbienteDeNotificacao>) => estadoDasNotificacoes({ ...PC, ...extra });

describe("estadoDasNotificacoes", () => {
  it("PC no navegador: pode ativar; permissão dada sem inscrição também (um toque refaz)", () => {
    expect(comAmbiente({})).toBe("pode_ativar");
    expect(comAmbiente({ permissao: "granted", inscrito: false })).toBe("pode_ativar");
  });

  it("permissão dada e inscrição neste aparelho: ativo", () => {
    expect(comAmbiente({ permissao: "granted", inscrito: true })).toBe("ativo");
  });

  it("permissão bloqueada: negada, mesmo com inscrição velha", () => {
    expect(comAmbiente({ permissao: "denied" })).toBe("negada");
    expect(comAmbiente({ permissao: "denied", inscrito: true })).toBe("negada");
  });

  it("iPad fora do app instalado: instalar primeiro (o Safari numa aba nem tem PushManager)", () => {
    expect(comAmbiente({ ehIOS: true, instalado: false, temPushManager: false })).toBe("instalar_primeiro");
    expect(comAmbiente({ ehIOS: true, instalado: false })).toBe("instalar_primeiro");
  });

  it("iPad com o app instalado na tela inicial: pode ativar", () => {
    expect(comAmbiente({ ehIOS: true, instalado: true })).toBe("pode_ativar");
    expect(comAmbiente({ ehIOS: true, instalado: true, permissao: "granted", inscrito: true })).toBe("ativo");
  });

  it.each([
    ["sem service worker", { temServiceWorker: false }],
    ["sem PushManager", { temPushManager: false }],
    ["sem Notification", { temNotification: false }],
  ])("navegador %s: sem suporte", (_nome, extra) => {
    expect(comAmbiente(extra)).toBe("sem_suporte");
  });

  it("sem a chave pública VAPID neste ambiente: sem chave (depois do suporte)", () => {
    expect(comAmbiente({ chaveConfigurada: false })).toBe("sem_chave");
    expect(comAmbiente({ chaveConfigurada: false, temPushManager: false })).toBe("sem_suporte");
  });

  it("cada estado tem um texto (nunca só cor ou ícone) e todos são diferentes", () => {
    const textos = (["instalar_primeiro", "sem_suporte", "sem_chave", "negada", "ativo", "pode_ativar"] as const).map(
      textoDoEstadoDasNotificacoes,
    );
    expect(new Set(textos).size).toBe(6);
    for (const t of textos) expect(t.length).toBeGreaterThan(10);
    expect(textoDoEstadoDasNotificacoes("instalar_primeiro")).toBe(TEXTOS_NOTIFICACOES.estado_instalar_primeiro);
    expect(TEXTOS_NOTIFICACOES.estado_instalar_primeiro).toMatch(/Tela de Início/);
    expect(TEXTOS_NOTIFICACOES.estado_negada).toMatch(/Ajustes/);
  });
});

describe("lerInscricaoDePush", () => {
  const boa = { endpoint: "https://push.exemplo/abc", keys: { p256dh: "chave-p", auth: "chave-a" } };

  it("lê o que o PushSubscription.toJSON() entrega", () => {
    expect(lerInscricaoDePush(boa)).toEqual({ endpoint: "https://push.exemplo/abc", p256dh: "chave-p", auth: "chave-a" });
  });

  it.each([
    ["nulo", null],
    ["texto", "https://x"],
    ["sem endpoint", { keys: boa.keys }],
    ["endpoint http", { ...boa, endpoint: "http://push.exemplo/abc" }],
    ["endpoint com espaço", { ...boa, endpoint: "https://push.exemplo/a b" }],
    ["sem keys", { endpoint: boa.endpoint }],
    ["p256dh vazia", { ...boa, keys: { p256dh: "", auth: "a" } }],
    ["auth ausente", { ...boa, keys: { p256dh: "p" } }],
  ])("recusa: %s", (_nome, bruto) => {
    expect(lerInscricaoDePush(bruto)).toBeNull();
  });
});

describe("chaveVapidEmBytes", () => {
  // Uma chave pública P-256 de teste: 0x04 seguido de 64 bytes (não é uma chave VAPID de verdade).
  const bytes = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 7 + 3) & 0xff)]);
  const base64url = Buffer.from(bytes).toString("base64url");

  it("decodifica base64url em 65 bytes que começam por 0x04", () => {
    expect(base64url).not.toMatch(/[+/=]/);
    expect(chaveVapidEmBytes(base64url)).toEqual(bytes);
    expect(chaveVapidEmBytes(`  ${base64url}\n`)).toEqual(bytes);
  });

  it.each([
    ["vazia", ""],
    ["curta", "BAAA"],
    ["com + / =", "ab+/=="],
    ["outro tamanho", Buffer.from(Uint8Array.from({ length: 33 }, () => 4)).toString("base64url")],
    ["não começa por 0x04", Buffer.from(Uint8Array.from({ length: 65 }, () => 5)).toString("base64url")],
  ])("recusa: %s", (_nome, chave) => {
    expect(chaveVapidEmBytes(chave)).toBeNull();
  });
});
