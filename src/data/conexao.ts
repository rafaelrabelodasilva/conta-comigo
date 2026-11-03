// Detector de conexão único (AD-3). Informa todas as telas se há internet:
// a faixa "Sem conexão" lê `useConexao()`, os repositórios checam
// `estaOnline()` antes de gravar e o gerenciador de Realtime pede a
// releitura de tudo por `aoVoltar` quando a conexão volta.
//
// Estado inicial por `navigator.onLine`; depois, os eventos `online` e
// `offline` da janela. No servidor (sem janela) vale sempre "online".

import { useSyncExternalStore } from "react";

/** O que o detector usa da janela (no teste, um alvo falso). */
export type AlvoConexao = {
  navigator?: { onLine?: boolean };
  addEventListener(tipo: "online" | "offline", ouvinte: () => void): void;
};

export type DetectorConexao = {
  online(): boolean;
  /** Avisa a cada mudança (online ↔ offline). Devolve o cancelamento. */
  assinar(ouvinte: () => void): () => void;
  /** Chama `acao` sempre que a conexão volta (offline → online). */
  aoVoltar(acao: () => void): () => void;
};

export function criarDetectorConexao(alvo: AlvoConexao | null): DetectorConexao {
  // `navigator.onLine` ausente (ou sem janela): considera online.
  let online = alvo?.navigator?.onLine !== false;
  const ouvintes = new Set<() => void>();
  const acoesAoVoltar = new Set<() => void>();

  function mudar(novo: boolean) {
    if (novo === online) return;
    online = novo;
    for (const ouvinte of ouvintes) ouvinte();
    if (novo) for (const acao of acoesAoVoltar) acao();
  }

  if (alvo) {
    alvo.addEventListener("online", () => mudar(true));
    alvo.addEventListener("offline", () => mudar(false));
  }

  return {
    online: () => online,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    aoVoltar(acao) {
      acoesAoVoltar.add(acao);
      return () => {
        acoesAoVoltar.delete(acao);
      };
    },
  };
}

let unico: DetectorConexao | null = null;

/** O detector único do navegador (criado na primeira chamada). */
function detector(): DetectorConexao {
  unico ??= criarDetectorConexao(typeof window === "undefined" ? null : window);
  return unico;
}

/** Há conexão agora? Repositórios checam antes de qualquer gravação. */
export function estaOnline(): boolean {
  return detector().online();
}

/** Registra uma ação para quando a conexão voltar. */
export function aoVoltar(acao: () => void): () => void {
  return detector().aoVoltar(acao);
}

const assinarUnico = (ouvinte: () => void) => detector().assinar(ouvinte);
const onlineUnico = () => detector().online();
const ONLINE_NO_SERVIDOR = () => true;

/** Há conexão? Atualiza a tela quando muda. No servidor, `true`. */
export function useConexao(): boolean {
  return useSyncExternalStore(assinarUnico, onlineUnico, ONLINE_NO_SERVIDOR);
}
