import "server-only";
import webpush from "web-push";

// Envio de Web Push (História 7.5, AD-12, AD-13): a única porta do app para o pacote `web-push` e para as
// chaves VAPID. `VAPID_PRIVATE_KEY` só é lida aqui, no servidor, e nunca usa o prefixo `NEXT_PUBLIC_`. A
// chave pública (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) é a mesma que o navegador usa no `subscribe()`. O
// `VAPID_SUBJECT` (uma URL `https:` ou um `mailto:`) vai para os serviços de push: use a URL do app, não um
// e-mail pessoal.
//
// O envio é uma função injetável (`EnviarPush`): quem decide quando, para quem e o quê é
// `notificar-lembretes.ts`, e os testes passam um envio falso (nenhum teste fala com a rede nem usa chave real).
// O resultado nunca carrega o texto do erro: o `endpoint` e as chaves são segredos e o erro da biblioteca os cita.

export type ConfiguracaoVapid = {
  subject: string;
  chavePublica: string;
  chavePrivada: string;
};

/** A configuração VAPID do ambiente, ou `null` se falta qualquer das três variáveis (Previews, CI, antes de cadastrar). */
export function configuracaoVapid(): ConfiguracaoVapid | null {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const chavePrivada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !chavePublica || !chavePrivada) return null;
  return { subject, chavePublica, chavePrivada };
}

/** A inscrição de um aparelho como o servidor a guarda (`push_inscricoes`). */
export type InscricaoParaEnviar = { endpoint: string; chave_p256dh: string; chave_auth: string };

/**
 * `ok: true` = o serviço de push aceitou. `status` é o código HTTP da recusa (404 e 410 = a inscrição acabou e
 * deve ser apagada) ou `null` quando não houve resposta (rede, chave inválida, tempo esgotado).
 */
export type ResultadoDoEnvio = { ok: true } | { ok: false; status: number | null };

export type EnviarPush = (inscricao: InscricaoParaEnviar, corpo: string) => Promise<ResultadoDoEnvio>;

/** Um dia: um lembrete que o aparelho não recebeu hoje (desligado, sem rede) ainda chega se ele voltar logo. */
const VALIDADE_EM_SEGUNDOS = 24 * 60 * 60;
const TEMPO_LIMITE_MS = 10_000;

/** O envio real, com as chaves dadas. Nunca lança: devolve só o código HTTP da falha. */
export function criarEnviadorWebPush(config: ConfiguracaoVapid): EnviarPush {
  return async (inscricao, corpo) => {
    try {
      await webpush.sendNotification(
        { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.chave_p256dh, auth: inscricao.chave_auth } },
        corpo,
        {
          vapidDetails: { subject: config.subject, publicKey: config.chavePublica, privateKey: config.chavePrivada },
          TTL: VALIDADE_EM_SEGUNDOS,
          urgency: "normal",
          timeout: TEMPO_LIMITE_MS,
        },
      );
      return { ok: true };
    } catch (erro) {
      const status = (erro as { statusCode?: unknown } | null)?.statusCode;
      return { ok: false, status: typeof status === "number" ? status : null };
    }
  };
}
