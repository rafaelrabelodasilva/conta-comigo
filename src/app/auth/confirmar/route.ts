import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { criarClienteServidor } from "@/data/supabase/servidor";
import { log } from "@/server/log";

// Destino do link de "Esqueci a senha". Troca o `code` (PKCE) por uma sessão
// de recuperação e leva para a página de nova senha. Código ruim, vencido ou
// aberto em outro navegador volta para Entrar com "link expirou".
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await criarClienteServidor();

  let trocou = false;
  if (code && supabase) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        log("auth.link_recusado", { nivel: "warn", codigo: error.code ?? "sem_codigo" });
      } else {
        trocou = true;
      }
    } catch {
      log("auth.link_falhou", { nivel: "error", codigo: "excecao" });
    }
  } else {
    log("auth.link_recusado", {
      nivel: "warn",
      codigo: supabase
        ? (request.nextUrl.searchParams.get("error_code") ?? "sem_code")
        : "indisponivel",
    });
  }

  // Fora do try: redirect() funciona lançando uma exceção.
  redirect(trocou ? "/redefinir-senha" : "/entrar?motivo=link_expirou");
}
