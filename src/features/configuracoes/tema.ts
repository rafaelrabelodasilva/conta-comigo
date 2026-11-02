// Tema da Aparência (História 1.7). A verdade é `configuracoes.aparencia`,
// que vale em todos os aparelhos; o cookie `tema` só guarda a última
// Aparência vista neste aparelho para que o servidor já pinte o `<html>`
// com o tema certo no próximo carregamento (sem piscar).

import { aparenciaDe, type Aparencia } from "@/domain/configuracoes";

export const COOKIE_TEMA = "tema";

/** Um ano: o cookie é renovado a cada carregamento com sessão. */
const UM_ANO_SEGUNDOS = 60 * 60 * 24 * 365;

/** Valor de `data-tema` no `<html>`: fixo em Claro/Escuro; Sistema não fixa. */
export function atributoTema(aparencia: Aparencia): "claro" | "escuro" | undefined {
  return aparencia === "sistema" ? undefined : aparencia;
}

/** `colorScheme` do viewport (meta) para a primeira pintura. */
export function esquemaDeCor(aparencia: Aparencia): "light" | "dark" | "light dark" {
  return aparencia === "claro" ? "light" : aparencia === "escuro" ? "dark" : "light dark";
}

/** A Aparência guardada no cookie (desconhecida ou ausente → Sistema). */
export function aparenciaDoCookie(valor: string | undefined): Aparencia {
  return aparenciaDe(valor);
}

/** Texto para `document.cookie`. */
export function cookieTema(aparencia: Aparencia): string {
  return `${COOKIE_TEMA}=${aparencia}; path=/; max-age=${UM_ANO_SEGUNDOS}; samesite=lax`;
}

/**
 * Aplica a Aparência na raiz (`<html>`): fixa `data-tema` em Claro/Escuro e
 * o remove em Sistema. Devolve o texto do cookie `tema` a gravar.
 */
export function aplicarAparencia(
  raiz: { dataset: Record<string, string | undefined> },
  aparencia: Aparencia,
): string {
  const tema = atributoTema(aparencia);
  if (tema) raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  return cookieTema(aparencia);
}
