import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { PAGINA_SEM_CONEXAO, PREFIXO_CACHE, scriptServiceWorker } from "./service-worker";

// Roda o texto do `/sw.js` (o mesmo que o navegador recebe) num ambiente
// falso: `self` guarda os ouvintes, `caches` é um mapa em memória e `fetch`
// responde o que o teste mandar.

const ORIGEM = "https://conta.exemplo";

type Req = { method: string; url: string; mode: string; headers: Headers };

function req(caminho: string, extra: Partial<{ method: string; mode: string; headers: Record<string, string> }> = {}): Req {
  return {
    method: extra.method ?? "GET",
    url: caminho.startsWith("http") ? caminho : ORIGEM + caminho,
    mode: extra.mode ?? "cors",
    headers: new Headers(extra.headers ?? {}),
  };
}

function resposta(corpo: string, ok = true) {
  const r = { ok, corpo, clone: () => r, text: async () => corpo };
  return r;
}

function montar(versao = "v2", cachesIniciais: string[] = []) {
  const ouvintes: Record<string, (evento: unknown) => void> = {};
  const lojas = new Map<string, Map<string, unknown>>();
  for (const nome of cachesIniciais) lojas.set(nome, new Map());
  const chave = (r: unknown) => (typeof r === "string" ? r : (r as Req).url.replace(ORIGEM, ""));
  let quebrado = false;
  const caches = {
    open: async (nome: string) => {
      if (quebrado) throw new Error("cache indisponível");
      if (!lojas.has(nome)) lojas.set(nome, new Map());
      const loja = lojas.get(nome)!;
      return {
        match: async (r: unknown) => loja.get(chave(r)),
        put: async (r: unknown, res: unknown) => void loja.set(chave(r), res),
        add: async (u: string) => {
          const res = await fetch(u);
          if (!res?.ok) throw new Error("falhou");
          loja.set(u, res);
        },
      };
    },
    keys: async () => [...lojas.keys()],
    delete: async (nome: string) => lojas.delete(nome),
  };
  const fetch = vi.fn<(r: unknown, init?: unknown) => Promise<ReturnType<typeof resposta>>>();
  const self = {
    location: { origin: ORIGEM },
    addEventListener: (tipo: string, ouvinte: (e: unknown) => void) => (ouvintes[tipo] = ouvinte),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const Response = { error: () => "erro-de-rede" };
  new Function("self", "caches", "fetch", "Response", scriptServiceWorker(versao))(self, caches, fetch, Response);

  /** Dispara um `fetch`; devolve a resposta dada ao navegador (ou `undefined` se não respondeu). */
  async function pedir(r: Req): Promise<unknown> {
    let respondida: Promise<unknown> | undefined;
    const esperas: Promise<unknown>[] = [];
    ouvintes.fetch({
      request: r,
      respondWith: (p: Promise<unknown>) => (respondida = p),
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    const valor = respondida ? await respondida : undefined;
    await Promise.all(esperas);
    return respondida ? valor : undefined;
  }

  async function ciclo(tipo: "install" | "activate") {
    let espera: Promise<unknown> = Promise.resolve();
    ouvintes[tipo]({ waitUntil: (p: Promise<unknown>) => (espera = p) });
    await espera;
  }

  const quebrarCache = () => (quebrado = true);
  return { pedir, ciclo, fetch, lojas, self, quebrarCache, nomeCache: PREFIXO_CACHE + versao };
}

describe("service worker: o que nunca passa por ele", () => {
  it.each([
    ["POST", req("/configuracoes", { method: "POST" })],
    ["PATCH", req("/x", { method: "PATCH" })],
    ["DELETE", req("/x", { method: "DELETE" })],
    ["Supabase (outra origem)", req("https://abc.supabase.co/rest/v1/tipos")],
    ["/api", req("/api/fatura/extrair")],
    ["/auth", req("/auth/confirmar?code=1")],
    ["RSC por cabeçalho", req("/configuracoes", { headers: { RSC: "1" } })],
    ["RSC por ?_rsc", req("/configuracoes?_rsc=abc")],
    ["prefetch do roteador", req("/contas", { headers: { "Next-Router-Prefetch": "1" } })],
    ["outros GET da origem", req("/qualquer-coisa.json")],
  ])("%s: não responde nem guarda", async (_nome, r) => {
    const m = montar();
    expect(await m.pedir(r)).toBeUndefined();
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.lojas.size).toBe(0);
  });

  it("navegação com cabeçalho RSC também não passa", async () => {
    const m = montar();
    expect(await m.pedir(req("/", { mode: "navigate", headers: { RSC: "1" } }))).toBeUndefined();
  });
});

describe("service worker: casco", () => {
  it.each(["/_next/static/chunks/app.js", "/manifest.webmanifest", "/icon/192", "/apple-icon", "/favicon.ico"])(
    "%s: cache primeiro; a segunda vez não vai à rede",
    async (caminho) => {
      const m = montar();
      m.fetch.mockResolvedValue(resposta("conteúdo"));
      expect(await m.pedir(req(caminho))).toMatchObject({ corpo: "conteúdo" });
      expect(await m.pedir(req(caminho))).toMatchObject({ corpo: "conteúdo" });
      expect(m.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("cache que rejeita: o estático vem da rede", async () => {
    const m = montar();
    m.quebrarCache();
    m.fetch.mockResolvedValue(resposta("da rede"));
    expect(await m.pedir(req("/_next/static/chunks/app.js"))).toMatchObject({ corpo: "da rede" });
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });

  it("estático com erro não é guardado", async () => {
    const m = montar();
    m.fetch.mockResolvedValue(resposta("404", false));
    await m.pedir(req("/_next/static/x.js"));
    await m.pedir(req("/_next/static/x.js"));
    expect(m.fetch).toHaveBeenCalledTimes(2);
  });

  it("navegação vai sempre à rede, sem guardar", async () => {
    const m = montar();
    m.fetch.mockResolvedValue(resposta("<html>painel</html>"));
    expect(await m.pedir(req("/", { mode: "navigate" }))).toMatchObject({ corpo: "<html>painel</html>" });
    expect(await m.pedir(req("/", { mode: "navigate" }))).toMatchObject({ corpo: "<html>painel</html>" });
    expect(m.fetch).toHaveBeenCalledTimes(2);
    expect(m.lojas.get(m.nomeCache)?.has("/")).toBeFalsy();
  });

  it("install guarda /sem-conexao e os estáticos dela; navegação sem rede cai nela", async () => {
    const m = montar();
    const html = `<html><script src="/_next/static/chunks/a.js"></script><link href="/_next/static/css/b.css"/><script>self.__next_f.push([1,"\\"/_next/static/chunks/a.js\\""])</script></html>`;
    m.fetch.mockImplementation(async (r) => (r === PAGINA_SEM_CONEXAO ? resposta(html) : resposta(`arquivo ${String(r)}`)));
    await m.ciclo("install");
    const loja = m.lojas.get(m.nomeCache)!;
    expect([...loja.keys()].sort()).toEqual(
      [PAGINA_SEM_CONEXAO, "/_next/static/chunks/a.js", "/_next/static/css/b.css", "/manifest.webmanifest"].sort(),
    );
    expect(m.self.skipWaiting).toHaveBeenCalled();

    m.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await m.pedir(req("/configuracoes", { mode: "navigate" }))).toMatchObject({ corpo: html });
    // Os estáticos da página saem do cache, sem rede.
    expect(await m.pedir(req("/_next/static/chunks/a.js"))).toMatchObject({ corpo: "arquivo /_next/static/chunks/a.js" });
  });

  it("sem rede e sem a página guardada, devolve erro de rede", async () => {
    const m = montar();
    m.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await m.pedir(req("/", { mode: "navigate" }))).toBe("erro-de-rede");
  });

  it("activate apaga os caches de outras versões e mantém o atual e os de terceiros", async () => {
    const m = montar("v2", [`${PREFIXO_CACHE}v1`, `${PREFIXO_CACHE}v2`, "outro-cache"]);
    await m.ciclo("activate");
    expect([...m.lojas.keys()].sort()).toEqual([`${PREFIXO_CACHE}v2`, "outro-cache"]);
    expect(m.self.clients.claim).toHaveBeenCalled();
  });
});

describe("rota /sw.js", () => {
  it("responde JS com Cache-Control no-cache e o nome do cache com a versão", async () => {
    const r = GET();
    expect(r.headers.get("Content-Type")).toMatch(/^application\/javascript/);
    expect(r.headers.get("Cache-Control")).toBe("no-cache");
    const texto = await r.text();
    expect(texto).toContain(PREFIXO_CACHE);
    expect(() => new Function(texto)).not.toThrow();
  });
});
