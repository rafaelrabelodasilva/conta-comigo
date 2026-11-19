import type { NextConfig } from "next";

// Cache Components fica desligado (padrão): não ativar `cacheComponents`.
const nextConfig: NextConfig = {
  // Pacote só de Node (`crypto`, `https`), usado pelo Cron diário (`src/server/push.ts`, História 7.5): fica fora do
  // pacote do Next e roda com o `require` do Node.
  serverExternalPackages: ["web-push"],
  env: {
    // Versão do deploy, fixada no build: nomeia o cache do service worker
    // (`/sw.js`), que apaga os caches de versões antigas. Não é segredo.
    VERSAO_DEPLOY: process.env.VERCEL_DEPLOYMENT_ID ?? `build-${Date.now()}`,
  },
};

export default nextConfig;
