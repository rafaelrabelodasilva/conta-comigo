import { describe, expect, it, vi } from "vitest";
import { TEXTOS_NOTIFICACOES } from "@/domain/mensagens";
import { GET } from "./route";
import { ICONE_DO_AVISO, scriptServiceWorker } from "./service-worker";

// Notificações no service worker (História 7.5, AD-13): `push` só mostra o aviso que o servidor mandou e
// `notificationclick` leva ao destino. Roda o texto do `/sw.js` (o mesmo que o navegador recebe) num ambiente falso,
// como o `service-worker.test.ts` do casco. O service worker não responde requisição, não mexe no cache e não grava (AD-3).

const ORIGEM = "https://conta.exemplo";

type Ouvinte = (evento: unknown) => void;
type Janela = { url: string; focus: () => Promise<Janela>; navigate: (url: string) => Promise<unknown> };

function montar() {
  const ouvintes: Record<string, Ouvinte> = {};
  const caches = {
    open: vi.fn(async () => {
      throw new Error("o aviso não deve tocar no cache");
    }),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn();
  const self = {
    location: { origin: ORIGEM },
    addEventListener: (tipo: string, ouvinte: Ouvinte) => (ouvintes[tipo] = ouvinte),
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn<(opcoes: unknown) => Promise<unknown[]>>(async () => []),
      openWindow: vi.fn<(url: string) => Promise<unknown>>(async () => null),
    },
    registration: { showNotification: vi.fn<(titulo: string, opcoes: unknown) => Promise<void>>(async () => {}) },
  };
  new Function("self", "caches", "fetch", "Response", scriptServiceWorker("v-teste"))(self, caches, fetch, {
    error: () => "erro-de-rede",
  });
  return { ouvintes, self, caches, fetch };
}

type Montado = ReturnType<typeof montar>;

async function receberPush(
  m: Montado,
  dados: unknown,
  opcoes: { semCorpo?: boolean; corpoQuebrado?: boolean } = {},
): Promise<void> {
  let espera: Promise<unknown> = Promise.resolve();
  m.ouvintes.push({
    data: opcoes.semCorpo
      ? null
      : {
          json: () => {
            if (opcoes.corpoQuebrado) throw new SyntaxError("Unexpected token");
            return dados;
          },
        },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
}

async function tocar(m: Montado, data: unknown) {
  const fechar = vi.fn();
  let espera: Promise<unknown> = Promise.resolve();
  m.ouvintes.notificationclick({ notification: { close: fechar, data }, waitUntil: (p: Promise<unknown>) => (espera = p) });
  await espera;
  return fechar;
}

const AVISO = {
  titulo: "Conta Comigo",
  corpo: "Lucas: R$ 115,16 em atraso desde 17/11/26",
  destino: "/recebimentos",
  tag: "atraso:b-lucas",
};

describe("service worker: push (aviso do sistema)", () => {
  it("mostra o aviso que o servidor mandou: título, corpo, tag, ícone e o destino para o toque", async () => {
    const m = montar();
    await receberPush(m, AVISO);
    expect(m.self.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(m.self.registration.showNotification).toHaveBeenCalledWith("Conta Comigo", {
      body: AVISO.corpo,
      icon: ICONE_DO_AVISO,
      tag: "atraso:b-lucas",
      data: { destino: "/recebimentos" },
    });
  });

  it("o fechamento leva ao Painel do Mês", async () => {
    const m = montar();
    await receberPush(m, {
      ...AVISO,
      corpo: "A fatura de novembro fechou. Importe o PDF quando chegar",
      destino: "/?mes=2026-11",
      tag: "fechamento:2026-11",
    });
    expect(m.self.registration.showNotification).toHaveBeenCalledWith(
      "Conta Comigo",
      expect.objectContaining({ data: { destino: "/?mes=2026-11" }, tag: "fechamento:2026-11" }),
    );
  });

  it.each([
    ["sem corpo", {}, { semCorpo: true }],
    ["JSON quebrado", {}, { corpoQuebrado: true }],
    ["texto solto", "oi", {}],
    ["nulo", null, {}],
  ])("push ilegível (%s): ainda mostra um aviso (todo push precisa mostrar algo), com o texto padrão", async (_nome, dados, opcoes) => {
    const m = montar();
    await receberPush(m, dados, opcoes);
    expect(m.self.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(m.self.registration.showNotification).toHaveBeenCalledWith(TEXTOS_NOTIFICACOES.titulo_aviso, {
      body: TEXTOS_NOTIFICACOES.corpo_padrao,
      icon: ICONE_DO_AVISO,
      data: { destino: "/" },
    });
  });

  it("campos de tipo errado caem no padrão, um a um", async () => {
    const m = montar();
    await receberPush(m, { titulo: 3, corpo: "", destino: 7, tag: {} });
    expect(m.self.registration.showNotification).toHaveBeenCalledWith(TEXTOS_NOTIFICACOES.titulo_aviso, {
      body: TEXTOS_NOTIFICACOES.corpo_padrao,
      icon: ICONE_DO_AVISO,
      data: { destino: "/" },
    });
  });

  it.each(["https://outro.site/x", "//outro.site/x", "/\\outro.site", "recebimentos", "javascript:alert(1)", ""])(
    "destino que não é um caminho do app (%s): vira o Painel",
    async (destino) => {
      const m = montar();
      await receberPush(m, { ...AVISO, destino });
      expect(m.self.registration.showNotification).toHaveBeenCalledWith(
        "Conta Comigo",
        expect.objectContaining({ data: { destino: "/" } }),
      );
    },
  );

  it("o aviso não passa pelo cache nem pela rede", async () => {
    const m = montar();
    await receberPush(m, AVISO);
    await tocar(m, { destino: "/recebimentos" });
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.caches.open).not.toHaveBeenCalled();
  });
});

describe("service worker: notificationclick (tocar abre o Painel ou Recebimentos)", () => {
  it("fecha o aviso e abre uma janela nova no destino quando o app não está aberto", async () => {
    const m = montar();
    const fechar = await tocar(m, { destino: "/recebimentos" });
    expect(fechar).toHaveBeenCalled();
    expect(m.self.clients.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(m.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGEM}/recebimentos`);
  });

  it("com o app aberto: foca a janela e navega até o destino, sem abrir outra", async () => {
    const m = montar();
    const aberta: Janela = { url: `${ORIGEM}/previsao`, focus: vi.fn(async () => aberta), navigate: vi.fn(async () => aberta) };
    m.self.clients.matchAll.mockResolvedValue([{ url: "https://outra.origem/x", focus: vi.fn() }, aberta]);
    await tocar(m, { destino: "/?mes=2026-11" });
    expect(aberta.focus).toHaveBeenCalled();
    expect(aberta.navigate).toHaveBeenCalledWith(`${ORIGEM}/?mes=2026-11`);
    expect(m.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("o navegador não deixa navegar a janela aberta: abre uma nova no destino", async () => {
    const m = montar();
    const aberta: Janela = {
      url: `${ORIGEM}/`,
      focus: vi.fn(async () => aberta),
      navigate: vi.fn(async () => Promise.reject(new TypeError("sem navigate"))),
    };
    m.self.clients.matchAll.mockResolvedValue([aberta]);
    await tocar(m, { destino: "/recebimentos" });
    expect(m.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGEM}/recebimentos`);
  });

  it.each([undefined, null, {}, { destino: "https://outro.site/x" }, { destino: "//outro.site" }, { destino: 5 }])(
    "dados do aviso inválidos (%j): vai ao Painel do próprio app, nunca a outro endereço",
    async (dados) => {
      const m = montar();
      await tocar(m, dados);
      expect(m.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGEM}/`);
    },
  );
});

describe("rota /sw.js com os avisos", () => {
  it("o script continua válido, leva os dois ouvintes novos e o texto padrão vem de mensagens.ts", async () => {
    const texto = await GET().text();
    expect(() => new Function(texto)).not.toThrow();
    expect(texto).toContain("notificationclick");
    expect(texto).toContain(TEXTOS_NOTIFICACOES.corpo_padrao);
  });

  it("não trata pushsubscriptionchange (o service worker não tem a sessão para gravar a inscrição nova)", async () => {
    expect(await GET().text()).not.toContain("pushsubscriptionchange");
  });

  it("o casco continua igual: os ouvintes de install, activate e fetch seguem lá e não há ouvinte de gravação", () => {
    const m = montar();
    expect(Object.keys(m.ouvintes).sort()).toEqual(["activate", "fetch", "install", "notificationclick", "push"]);
  });
});
