// Notificações do sistema neste aparelho (História 7.5, FR-55, AD-13). Puro: o que o aparelho oferece e em
// que pé está entram como parâmetro (a tela lê o navegador e chama esta função); o núcleo não toca em
// `navigator`, `Notification` nem no service worker.
//
// O pedido de permissão só acontece num toque do usuário, e no iPad só com o app instalado na tela inicial
// (iPadOS 18+); no PC vale o navegador. Cada aparelho tem a sua inscrição (iPad e PC convivem).

/** A permissão do navegador (`Notification.permission`). */
export type PermissaoDeNotificacao = "default" | "granted" | "denied";

/** O que a tela leu do aparelho. */
export type AmbienteDeNotificacao = {
  /** A chave pública VAPID existe neste ambiente (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`)? */
  chaveConfigurada: boolean;
  temServiceWorker: boolean;
  temPushManager: boolean;
  temNotification: boolean;
  /** iPad ou iPhone (o iPadOS novo se diz Mac, então a tela também olha os toques). */
  ehIOS: boolean;
  /** Aberto como app da tela inicial (`display-mode: standalone` ou `navigator.standalone`). */
  instalado: boolean;
  permissao: PermissaoDeNotificacao;
  /** Este aparelho já tem uma inscrição Web Push (`pushManager.getSubscription()`)? */
  inscrito: boolean;
};

/**
 * Em que pé estão as notificações neste aparelho. Sempre uma destas, para a tela dizer em TEXTO:
 *
 * - `instalar_primeiro`: iPad/iPhone fora do app instalado (o Safari não oferece Web Push numa aba): a tela
 *   explica como instalar na tela inicial. Vem antes de `sem_suporte` porque lá o `PushManager` só existe
 *   depois da instalação.
 * - `sem_suporte`: o navegador não tem service worker, `PushManager` ou `Notification`.
 * - `sem_chave`: o ambiente não tem a chave pública VAPID (Previews, antes de o Rafael cadastrar).
 * - `negada`: o usuário bloqueou; só o aparelho libera de novo (a tela diz o caminho).
 * - `ativo`: permissão dada e inscrição deste aparelho existente.
 * - `pode_ativar`: o resto (inclusive permissão dada mas sem inscrição, que um toque refaz).
 */
export type EstadoDasNotificacoes =
  | "instalar_primeiro"
  | "sem_suporte"
  | "sem_chave"
  | "negada"
  | "ativo"
  | "pode_ativar";

export function estadoDasNotificacoes(a: AmbienteDeNotificacao): EstadoDasNotificacoes {
  if (a.ehIOS && !a.instalado) return "instalar_primeiro";
  if (!a.temServiceWorker || !a.temPushManager || !a.temNotification) return "sem_suporte";
  if (!a.chaveConfigurada) return "sem_chave";
  if (a.permissao === "denied") return "negada";
  if (a.permissao === "granted" && a.inscrito) return "ativo";
  return "pode_ativar";
}

/**
 * O que este aparelho guardou sobre as notificações: `ativa` (Rafael tocou em "Ativar notificações" ou o app já a viu
 * ativa) ou `desativada` (Rafael tocou em "Desativar neste aparelho"). `null`: nunca ativou aqui.
 */
export type MarcaDeNotificacao = "ativa" | "desativada";

/**
 * O app deve refazer sozinho a inscrição deste aparelho (Defeito 8)? Quando o navegador troca ou perde a inscrição
 * (`pushsubscriptionchange`: a antiga dá 404 ou 410 no Cron e é apagada), o aparelho fica mudo até Rafael tocar em
 * "Ativar" de novo. O service worker não tem a sessão para gravar a nova (AD-3, AD-12), então quem refaz é o app,
 * ao abrir: só se a permissão JÁ está dada (nunca pede a permissão: isso é do toque do Rafael), o aparelho já esteve
 * ativado (`marca` = `ativa`: quem tocou em "Desativar neste aparelho" nunca é reativado à força) e não há inscrição.
 */
export function deveReativarNotificacoes(a: AmbienteDeNotificacao, marca: MarcaDeNotificacao | null): boolean {
  return marca === "ativa" && a.permissao === "granted" && !a.inscrito && estadoDasNotificacoes(a) === "pode_ativar";
}

/** A inscrição Web Push de um aparelho, como o `PushSubscription.toJSON()` a entrega e o Cron a usa. */
export type InscricaoDePush = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Confere o formato de uma inscrição (`PushSubscription.toJSON()`): `endpoint` https e as duas chaves em
 * texto. O `endpoint` é tratado como segredo (nunca vai para log nem mensagem de erro).
 */
export function lerInscricaoDePush(bruto: unknown): InscricaoDePush | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const { endpoint, keys } = bruto as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  if (typeof endpoint !== "string" || !/^https:\/\/\S+$/.test(endpoint)) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || p256dh === "" || typeof auth !== "string" || auth === "") return null;
  return { endpoint, p256dh, auth };
}

/**
 * A chave pública VAPID (base64url, 65 bytes) em bytes, para o `applicationServerKey` do `subscribe()`.
 * Devolve `null` se não for base64url válido de 65 bytes começando por 0x04 (ponto P-256 sem compressão).
 */
export function chaveVapidEmBytes(chave: string): Uint8Array<ArrayBuffer> | null {
  const limpa = chave.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(limpa)) return null;
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const caractere of limpa) {
    acumulado = (acumulado << 6) | alfabeto.indexOf(caractere);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >> bits) & 0xff);
      acumulado &= (1 << bits) - 1;
    }
  }
  return bytes.length === 65 && bytes[0] === 0x04 ? Uint8Array.from(bytes) : null;
}
