import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Autorização das rotas `/api/cron/*` (AD-12, AD-13): só passa quem manda
// exatamente `Authorization: Bearer <CRON_SECRET>`. O Vercel Cron manda esse
// cabeçalho sozinho quando a variável `CRON_SECRET` existe no projeto.
// `CRON_SECRET` só é lido no servidor e nunca usa o prefixo `NEXT_PUBLIC_`.

function resumo(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}

/**
 * O cabeçalho é `Bearer <segredo>`? Comparação em tempo constante (os dois
 * lados passam por SHA-256, então têm o mesmo tamanho e `timingSafeEqual` não
 * lança nem revela o tamanho do segredo). Sem segredo configurado (ou vazio),
 * ninguém passa: a rota nunca fica aberta por falta de configuração.
 */
export function autorizadoPeloCron(cabecalho: string | null, segredo: string | undefined): boolean {
  if (typeof segredo !== "string" || segredo === "") return false;
  if (typeof cabecalho !== "string") return false;
  return timingSafeEqual(resumo(cabecalho), resumo(`Bearer ${segredo}`));
}

/** O segredo configurado no servidor (`undefined` quando falta ou está vazio). */
export function segredoDoCron(): string | undefined {
  const valor = process.env.CRON_SECRET;
  return valor === undefined || valor.trim() === "" ? undefined : valor;
}
