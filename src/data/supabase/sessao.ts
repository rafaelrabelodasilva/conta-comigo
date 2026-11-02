import type { CodigoMensagem } from "@/domain/mensagens";

// Regras puras de acesso usadas pelo proxy (AD-5). Sem rede nem cookies:
// recebem o que o proxy já sabe e devolvem a decisão.

export const PAGINA_ENTRAR = "/entrar";
export const PAGINA_INICIAL = "/";
export const PAGINA_NOVA_SENHA = "/redefinir-senha";

// `?motivo=` que o proxy, as páginas e /auth/confirmar mandam para Entrar.
export const MOTIVO_EXPIROU = "expirou";
export const MOTIVO_LINK_EXPIROU = "link_expirou";

const MOTIVOS: Readonly<Record<string, CodigoMensagem>> = {
  [MOTIVO_EXPIROU]: "auth.sessao_expirou",
  [MOTIVO_LINK_EXPIROU]: "auth.link_expirou",
};

/** Código da mensagem para o `?motivo=` de Entrar; desconhecido → undefined. */
export function codigoDoMotivo(motivo: unknown): CodigoMensagem | undefined {
  return typeof motivo === "string" &&
    Object.prototype.hasOwnProperty.call(MOTIVOS, motivo)
    ? MOTIVOS[motivo]
    : undefined;
}

// Rotas que abrem sem sessão. Todas as outras exigem sessão.
const ROTAS_PUBLICAS: readonly string[] = [PAGINA_ENTRAR, "/auth/confirmar"];

export type EntradaAcesso = {
  caminho: string;
  autenticado: boolean;
  /** A requisição trazia cookie de sessão `sb-*-auth-token` (talvez vencido). */
  tinhaCookieAuth: boolean;
};

export type Decisao =
  | { tipo: "seguir" }
  | { tipo: "redirecionar"; destino: string };

function ehPublica(caminho: string): boolean {
  return ROTAS_PUBLICAS.some(
    (rota) => caminho === rota || caminho.startsWith(`${rota}/`),
  );
}

export function decidirAcesso({
  caminho,
  autenticado,
  tinhaCookieAuth,
}: EntradaAcesso): Decisao {
  if (caminho === PAGINA_ENTRAR || caminho.startsWith(`${PAGINA_ENTRAR}/`)) {
    return autenticado
      ? { tipo: "redirecionar", destino: PAGINA_INICIAL }
      : { tipo: "seguir" };
  }
  if (ehPublica(caminho) || autenticado) return { tipo: "seguir" };

  // Sem sessão de recuperação, o link do e-mail não serve mais. Sem `next`:
  // um login normal não deve cair no formulário de nova senha.
  if (caminho === PAGINA_NOVA_SENHA) {
    return {
      tipo: "redirecionar",
      destino: `${PAGINA_ENTRAR}?motivo=${MOTIVO_LINK_EXPIROU}`,
    };
  }

  const params = new URLSearchParams();
  if (tinhaCookieAuth) params.set("motivo", MOTIVO_EXPIROU);
  if (caminho !== PAGINA_INICIAL && destinoSeguro(caminho) === caminho) {
    params.set("next", caminho);
  }
  const query = params.toString();
  return {
    tipo: "redirecionar",
    destino: query ? `${PAGINA_ENTRAR}?${query}` : PAGINA_ENTRAR,
  };
}

/**
 * Caminho interno seguro para voltar depois de entrar. Recusa URLs absolutas,
 * `//host`, barras invertidas e caracteres de controle (open redirect), e
 * nunca volta para a própria página Entrar. Na dúvida, `/`.
 */
export function destinoSeguro(next: unknown): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) {
    return PAGINA_INICIAL;
  }
  if (!next.startsWith("/") || next.startsWith("//")) return PAGINA_INICIAL;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return PAGINA_INICIAL;
  let caminho: string;
  try {
    const url = new URL(next, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid") return PAGINA_INICIAL;
    caminho = url.pathname;
    if (caminho === PAGINA_ENTRAR || caminho.startsWith(`${PAGINA_ENTRAR}/`)) {
      return PAGINA_INICIAL;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return PAGINA_INICIAL;
  }
}

/** Há cookie de sessão do Supabase (`sb-<ref>-auth-token`, inteiro ou em partes)? */
export function temCookieDeSessao(nomes: readonly string[]): boolean {
  return nomes.some((nome) => /^sb-.+-auth-token(\.\d+)?$/.test(nome));
}
