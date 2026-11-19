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
// Notificações (História 7.5, AD-13): `avisosDoSistema` acrescenta só dois ouvintes, `push` (mostra o aviso que o
// Cron mandou) e `notificationclick` (foca uma janela do app e vai ao destino do aviso, ou abre uma). Não mexe no
// cache, não responde nenhuma requisição e não grava nada (AD-3). O texto do aviso vem pronto do servidor (o mesmo
// da Central de Avisos); o service worker só mostra. Cada `push` PRECISA mostrar um aviso (o Safari revoga a inscrição de
// quem recebe push sem mostrar), então um corpo ilegível mostra o texto padrão. `pushsubscriptionchange` NÃO é
// tratado: o service worker não tem a sessão do Supabase para gravar a inscrição nova (veja deferred-work.md).
//
// `servicoDoCasco` e `avisosDoSistema` viram texto (`toString()`) dentro do `/sw.js`: tudo o que
// elas usam está dentro delas ou chega por `ambiente`/`config`. Sem `async`/`await` nem
// imports, para o texto não depender de nada de fora.

import { TEXTOS_NOTIFICACOES } from "@/domain/mensagens";
import { PAGINA_SEM_CONEXAO } from "@/data/supabase/sessao";

/** Página mostrada quando a navegação falha sem rede. */
export { PAGINA_SEM_CONEXAO };

/** O ícone do aviso do sistema: o mesmo da tela inicial do iPad (180 px, `app/apple-icon.tsx`). */
export const ICONE_DO_AVISO = "/apple-icon";

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

export type AmbienteDeAvisos = {
  location: { origin: string };
  addEventListener(tipo: string, ouvinte: (evento: any) => void): void;
  registration: { showNotification(titulo: string, opcoes: any): Promise<void> };
  clients: {
    matchAll(opcoes: any): Promise<any[]>;
    openWindow(url: string): Promise<any>;
  };
};

/** Os avisos do sistema: `push` mostra, `notificationclick` abre o destino. */
export function avisosDoSistema(
  self: AmbienteDeAvisos,
  config: { tituloPadrao: string; corpoPadrao: string; icone: string },
): void {
  // Só um caminho do próprio app (`/recebimentos`, `/?mes=2026-11`); qualquer outra coisa vira o Painel.
  function destinoSeguro(destino: any): string {
    if (typeof destino !== "string" || destino.charAt(0) !== "/") return "/";
    const segundo = destino.charAt(1);
    return segundo === "/" || segundo === "\\" ? "/" : destino;
  }

  self.addEventListener("push", (evento) => {
    let titulo = config.tituloPadrao;
    let corpo = config.corpoPadrao;
    let destino = "/";
    let tag: string | undefined;
    try {
      const dados = evento.data ? evento.data.json() : null;
      if (dados && typeof dados === "object") {
        if (typeof dados.titulo === "string" && dados.titulo !== "") titulo = dados.titulo;
        if (typeof dados.corpo === "string" && dados.corpo !== "") corpo = dados.corpo;
        destino = destinoSeguro(dados.destino);
        if (typeof dados.tag === "string" && dados.tag !== "") tag = dados.tag;
      }
    } catch {
      // Corpo ilegível: mostra o aviso padrão (todo push precisa mostrar algo).
    }
    const opcoes: any = { body: corpo, icon: config.icone, data: { destino: destino } };
    if (tag !== undefined) opcoes.tag = tag;
    evento.waitUntil(self.registration.showNotification(titulo, opcoes));
  });

  self.addEventListener("notificationclick", (evento) => {
    evento.notification.close();
    const origem = self.location.origin;
    const url = origem + destinoSeguro(evento.notification.data && evento.notification.data.destino);
    evento.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
        const aberta = janelas.find((j) => typeof j.url === "string" && j.url.indexOf(origem) === 0);
        if (!aberta) return self.clients.openWindow(url);
        // Foca a janela do app e leva ao destino; se o navegador não deixar navegar, abre uma nova.
        return aberta
          .focus()
          .then(() => aberta.navigate(url))
          .catch(() => self.clients.openWindow(url));
      }),
    );
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O texto do `/sw.js` para a versão (deploy) dada. */
export function scriptServiceWorker(versao: string): string {
  const config = { versao, paginaSemConexao: PAGINA_SEM_CONEXAO, prefixoCache: PREFIXO_CACHE };
  const avisos = {
    tituloPadrao: TEXTOS_NOTIFICACOES.titulo_aviso,
    corpoPadrao: TEXTOS_NOTIFICACOES.corpo_padrao,
    icone: ICONE_DO_AVISO,
  };
  return `"use strict";
(${servicoDoCasco.toString()})(
  { self: self, caches: caches, fetch: fetch.bind(self), Response: Response },
  ${JSON.stringify(config)}
);
(${avisosDoSistema.toString()})(self, ${JSON.stringify(avisos)});
`;
}
