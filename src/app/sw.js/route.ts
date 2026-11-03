import { scriptServiceWorker } from "./service-worker";

// `/sw.js`: o service worker único (só o casco; veja `service-worker.ts`).
// `no-cache` faz o navegador conferir a versão a cada visita; a versão muda
// a cada deploy (`VERSAO_DEPLOY`, definida no build em `next.config.ts`).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(scriptServiceWorker(process.env.VERSAO_DEPLOY ?? "dev"), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
