import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configSupabase } from "@/data/supabase/config";
import { decidirAcesso, temCookieDeSessao } from "@/data/supabase/sessao";
import { log } from "@/server/log";

// Proxy (AD-5): renova a sessão do Supabase com `getClaims()` em toda
// requisição de página e leva para Entrar quem não tem sessão. As páginas,
// Server Actions e Route Handlers conferem a sessão de novo por conta
// própria; o proxy é a primeira barreira, não a única.
export async function proxy(request: NextRequest) {
  // Antes do getClaims, que pode apagar os cookies vencidos da requisição.
  const tinhaCookieAuth = temCookieDeSessao(
    request.cookies.getAll().map((c) => c.name),
  );

  let resposta = NextResponse.next({ request });
  const cabecalhos: Record<string, string> = {};
  let autenticado = false;

  // Sem as variáveis (Previews, CI), não há sessão possível: as páginas
  // protegidas levam para Entrar, que mostra "login indisponível".
  const config = configSupabase();
  if (config) {
    // Cliente criado por requisição, nunca no escopo do módulo.
    const supabase = createServerClient(config.url, config.chave, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista, headers) {
          for (const { name, value } of lista) request.cookies.set(name, value);
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) {
            resposta.cookies.set(name, value, options);
          }
          Object.assign(cabecalhos, headers);
          for (const [chave, valor] of Object.entries(headers)) {
            resposta.headers.set(chave, valor);
          }
        },
      },
    });

    // Nada entre a criação do cliente e o getClaims (recomendação do @supabase/ssr).
    try {
      const { data, error } = await supabase.auth.getClaims();
      autenticado = !error && Boolean(data?.claims);
      if (error && tinhaCookieAuth) {
        log("auth.sessao_invalida", {
          nivel: "info",
          codigo: error.code ?? "sem_codigo",
        });
      }
    } catch {
      log("auth.proxy_falhou", { nivel: "error", codigo: "excecao" });
      autenticado = false;
    }
  }

  const decisao = decidirAcesso({
    caminho: request.nextUrl.pathname,
    autenticado,
    tinhaCookieAuth,
  });
  if (decisao.tipo === "seguir") return resposta;

  // No redirect, levar junto os cookies renovados (ou apagados) e os
  // cabeçalhos de cache, senão a sessão fica dessincronizada.
  const redirecionamento = NextResponse.redirect(
    new URL(decisao.destino, request.url),
  );
  for (const cookie of resposta.cookies.getAll()) {
    redirecionamento.cookies.set(cookie);
  }
  for (const [chave, valor] of Object.entries(cabecalhos)) {
    redirecionamento.headers.set(chave, valor);
  }
  return redirecionamento;
}

export const config = {
  matcher: [
    // Tudo, menos estáticos do Next, otimização de imagem, favicon e arquivos
    // de imagem/fonte/manifesto.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|webmanifest)$).*)",
  ],
};
