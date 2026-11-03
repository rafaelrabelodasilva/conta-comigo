import type { NextConfig } from "next";

// Cache Components fica desligado (padrão): não ativar `cacheComponents`.
const nextConfig: NextConfig = {
  env: {
    // Versão do deploy, fixada no build: nomeia o cache do service worker
    // (`/sw.js`), que apaga os caches de versões antigas. Não é segredo.
    VERSAO_DEPLOY: process.env.VERCEL_DEPLOYMENT_ID ?? `build-${Date.now()}`,
  },
};

export default nextConfig;
