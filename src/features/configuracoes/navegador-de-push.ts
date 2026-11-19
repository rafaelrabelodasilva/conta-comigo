import {
  chaveVapidEmBytes,
  lerInscricaoDePush,
  type AmbienteDeNotificacao,
  type InscricaoDePush,
  type PermissaoDeNotificacao,
} from "@/domain/notificacoes";

// O que "Ativar notificações" pede ao navegador (História 7.5, FR-55): a única porta para `Notification`,
// `PushManager` e o service worker. A tela recebe isto por injeção (nos testes, um navegador falso); a regra de
// "em que pé estão as notificações" é do núcleo (`estadoDasNotificacoes`).
//
// A permissão só é pedida por `pedirPermissao`, e a tela a chama dentro do manipulador do toque, antes de
// qualquer `await`. Nunca lança: o que falha vira `null` ou `false`, sem texto do erro (o `endpoint` é segredo).

export type NavegadorDePush = {
  /** O que o aparelho oferece e em que pé está (lê a inscrição atual). */
  ler(): Promise<AmbienteDeNotificacao>;
  /** `Notification.requestPermission()`. SÓ dentro do toque do usuário. */
  pedirPermissao(): Promise<PermissaoDeNotificacao>;
  /** Cria (ou devolve a que já existe) a inscrição Web Push deste aparelho; `null` se não deu. */
  inscrever(): Promise<InscricaoDePush | null>;
  /** A inscrição deste aparelho, se houver. */
  inscricaoAtual(): Promise<InscricaoDePush | null>;
  /** Cancela a inscrição deste aparelho no navegador; `true` se não há mais nenhuma. */
  cancelar(): Promise<boolean>;
};

const permissaoDe = (): PermissaoDeNotificacao =>
  typeof Notification === "undefined" ? "default" : (Notification.permission as PermissaoDeNotificacao);

async function registro(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

/** O navegador de verdade. `chavePublica` é a VAPID pública (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`). */
export function criarNavegadorDePush(chavePublica: string): NavegadorDePush {
  const bytes = chavePublica.trim() === "" ? null : chaveVapidEmBytes(chavePublica);

  async function inscricaoAtual(): Promise<InscricaoDePush | null> {
    try {
      const sub = await (await registro())?.pushManager.getSubscription();
      return sub ? lerInscricaoDePush(sub.toJSON()) : null;
    } catch {
      return null;
    }
  }

  return {
    inscricaoAtual,

    async ler() {
      const temServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
      const temPushManager = typeof window !== "undefined" && "PushManager" in window;
      const temNotification = typeof Notification !== "undefined";
      // O iPadOS novo se diz Mac: dois ou mais toques o entregam.
      const ehIOS =
        typeof navigator !== "undefined" &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
      const instalado =
        typeof window !== "undefined" &&
        (window.matchMedia?.("(display-mode: standalone)").matches === true ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true);
      return {
        chaveConfigurada: bytes !== null,
        temServiceWorker,
        temPushManager,
        temNotification,
        ehIOS,
        instalado,
        permissao: permissaoDe(),
        inscrito: temServiceWorker && temPushManager ? (await inscricaoAtual()) !== null : false,
      };
    },

    async pedirPermissao() {
      try {
        return (await Notification.requestPermission()) as PermissaoDeNotificacao;
      } catch {
        return permissaoDe();
      }
    },

    async inscrever() {
      if (bytes === null) return null;
      const reg = await registro().catch(() => undefined);
      if (!reg) return null;
      const opcoes = { userVisibleOnly: true, applicationServerKey: bytes };
      try {
        return lerInscricaoDePush((await reg.pushManager.subscribe(opcoes)).toJSON());
      } catch {
        // Uma inscrição de outra chave VAPID (a chave foi trocada) impede esta: cancela a velha e tenta de novo.
        try {
          await (await reg.pushManager.getSubscription())?.unsubscribe();
          return lerInscricaoDePush((await reg.pushManager.subscribe(opcoes)).toJSON());
        } catch {
          return null;
        }
      }
    },

    async cancelar() {
      try {
        const sub = await (await registro())?.pushManager.getSubscription();
        return sub ? await sub.unsubscribe() : true;
      } catch {
        return false;
      }
    },
  };
}
