// O service worker único do app (AD-3), servido em `/sw.js` por `route.ts`.
// Guarda só o "casco": nunca dados, nunca gravações.
//
// - Só `GET` da mesma origem. `POST`/`PATCH`/`DELETE`, Supabase (outra
//   origem), `/api`, `/auth` e requisições RSC (dados das telas) passam
//   direto, sem resposta nem cópia do service worker.
// - `/_next/static/*`, ícones e manifest: cache primeiro (os nomes dos
//   estáticos mudam a cada build).
// - Navegação: sempre a rede; se a rede falhar, a página `/sem-conexao`
//   (guardada no `install`, com os estáticos dela).
// - O nome do cache leva a versão do deploy; o `activate` apaga os antigos.
//
// `servicoDoCasco` vira texto (`toString()`) dentro do `/sw.js`: tudo o que
// ela usa está dentro dela ou chega por `ambiente`. Sem `async`/`await` nem
// imports, para o texto não depender de nada de fora.

import { PAGINA_SEM_CONEXAO } from "@/data/supabase/sessao";

/** Página mostrada quando a navegação falha sem rede. */
export { PAGINA_SEM_CONEXAO };

/** Prefixo dos caches do app; o `activate` apaga os de outras versões. */
export const PREFIXO_CACHE = "conta-comigo-casco-";

/* eslint-disable @typescript-eslint/no-explicit-any -- tipos do service worker não estão no lib do tsconfig */
export type AmbienteServiceWorker = {
  self: {
    location: { origin: string };
    addEventListener(tipo: string, ouvinte: (evento: any) => void): void;
    skipWaiting(): Promise<void>;
    clients: { claim(): Promise<void> };
  };
  caches: {
    open(nome: string): Promise<{
      match(req: any): Promise<any>;
      put(req: any, res: any): Promise<void>;
      add(url: string): Promise<void>;
    }>;
    keys(): Promise<string[]>;
    delete(nome: string): Promise<boolean>;
  };
  fetch(req: any, init?: any): Promise<any>;
  Response: { error(): any };
};

export function servicoDoCasco(
  ambiente: AmbienteServiceWorker,
  config: { versao: string; paginaSemConexao: string; prefixoCache: string },
): void {
  const { self, caches, fetch, Response } = ambiente;
  const nomeCache = config.prefixoCache + config.versao;
  const origem = self.location.origin;

  // "estatico" (cache primeiro), "navegacao" (rede, com a página de reserva)
  // ou "ignorar" (nem responde nem guarda).
  function classificar(req: any): "estatico" | "navegacao" | "ignorar" {
    if (req.method !== "GET") return "ignorar";
    const url = new URL(req.url);
    if (url.origin !== origem) return "ignorar";
    const caminho = url.pathname;
    if (/^\/(api|auth)(\/|$)/.test(caminho)) return "ignorar";
    // Dados das telas (RSC): cabeçalho `RSC` ou `?_rsc=`.
    if (req.headers.get("RSC") || req.headers.get("Next-Router-Prefetch") || url.searchParams.has("_rsc")) {
      return "ignorar";
    }
    if (req.mode === "navigate") return "navegacao";
    if (
      caminho.indexOf("/_next/static/") === 0 ||
      caminho === "/manifest.webmanifest" ||
      caminho === "/favicon.ico" ||
      /^\/(icon|apple-icon)([^/]*)(\/[^/]+)?$/.test(caminho)
    ) {
      return "estatico";
    }
    return "ignorar";
  }

  // Guarda a página de reserva e os estáticos que ela usa.
  function guardarCasco(): Promise<void> {
    return caches.open(nomeCache).then((cache) =>
      fetch(config.paginaSemConexao, { cache: "reload", credentials: "same-origin" }).then((res) => {
        if (!res || !res.ok) throw new Error("sem-conexao indisponível");
        return res
          .clone()
          .text()
          .then((html: string) => {
            const estaticos: string[] = [];
            const achados = html.match(/\/_next\/static\/[^"'\s)<>]+/g) || [];
            for (const a of achados) {
              const limpo = a.replace(/&amp;/g, "&").replace(/\\+$/, "");
              if (estaticos.indexOf(limpo) === -1) estaticos.push(limpo);
            }
            // Um estático que falhe não impede a instalação (ele entra no
            // cache na primeira vez que for pedido com rede).
            return cache.put(config.paginaSemConexao, res).then(() =>
              Promise.all(
                estaticos.concat(["/manifest.webmanifest"]).map((u) => cache.add(u).catch(() => undefined)),
              ).then(() => undefined),
            );
          });
      }),
    );
  }

  self.addEventListener("install", (evento) => {
    evento.waitUntil(guardarCasco().then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (evento) => {
    evento.waitUntil(
      caches
        .keys()
        .then((nomes) =>
          Promise.all(
            nomes
              .filter((n) => n.indexOf(config.prefixoCache) === 0 && n !== nomeCache)
              .map((n) => caches.delete(n)),
          ),
        )
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (evento) => {
    const req = evento.request;
    const tipo = classificar(req);
    if (tipo === "ignorar") return;

    if (tipo === "navegacao") {
      evento.respondWith(
        fetch(req).catch(() =>
          caches
            .open(nomeCache)
            .then((cache) => cache.match(config.paginaSemConexao))
            .then((guardada) => guardada || Response.error()),
        ),
      );
      return;
    }

    // Cache indisponível (`open`/`match` rejeitou): vai à rede, sem guardar.
    evento.respondWith(
      caches
        .open(nomeCache)
        .then((cache) =>
          cache.match(req).then(
            (guardada) =>
              guardada ||
              fetch(req).then((res) => {
                if (res && res.ok) {
                  const copia = res.clone();
                  evento.waitUntil(cache.put(req, copia).catch(() => undefined));
                }
                return res;
              }),
          ),
        )
        .catch(() => fetch(req)),
    );
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O texto do `/sw.js` para a versão (deploy) dada. */
export function scriptServiceWorker(versao: string): string {
  const config = { versao, paginaSemConexao: PAGINA_SEM_CONEXAO, prefixoCache: PREFIXO_CACHE };
  return `"use strict";
(${servicoDoCasco.toString()})(
  { self: self, caches: caches, fetch: fetch.bind(self), Response: Response },
  ${JSON.stringify(config)}
);
`;
}
