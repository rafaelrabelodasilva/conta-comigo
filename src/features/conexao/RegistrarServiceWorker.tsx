"use client";

import { useEffect } from "react";

// Registra o service worker único (`/sw.js`, só o casco) no layout raiz.
// Só em produção. Fora dela, desregistra um que tenha ficado de um
// `npm start` anterior no mesmo endereço: o casco servindo `/_next/static`
// do cache atrapalharia o `next dev`.
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (process.env.NODE_ENV !== "production") {
      void sw
        .getRegistrations()
        .then((registros) => Promise.all(registros.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }
    sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sem service worker o app funciona igual (só não abre sem internet).
    });
  }, []);
  return null;
}
