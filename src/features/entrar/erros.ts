import type { CodigoMensagem } from "@/domain/mensagens";

// Traduz o erro do Supabase Auth (`error.code` e `error.status`) em código do
// mapa de mensagens. Credenciais erradas, e-mail não confirmado e e-mail
// inválido dão a mesma mensagem: o login nunca diz qual campo errou.

export type ErroAuth = { code?: string | null; status?: number | null };

export function codigoDoErroAuth(erro: ErroAuth): CodigoMensagem {
  switch (erro.code) {
    case "invalid_credentials":
    case "email_not_confirmed":
    case "user_not_found":
    case "validation_failed":
    case "email_address_invalid":
      return "auth.credenciais_invalidas";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "auth.muitas_tentativas";
    case "weak_password":
      return "auth.senha_fraca";
    case "same_password":
      return "auth.senha_igual";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "auth.sessao_expirou";
    case "flow_state_not_found":
    case "flow_state_expired":
    case "otp_expired":
    case "bad_code_verifier":
      return "auth.link_expirou";
  }
  if (erro.status === 429) return "auth.muitas_tentativas";
  return "auth.erro_inesperado";
}
