// Regras puras do aviso inferior (`toast`): um aviso por vez, o novo
// substitui o anterior e o tempo de 6 s recomeça; "Desfazer" fecha o aviso
// e devolve a ação para ser chamada uma única vez.

export const DURACAO_TOAST_MS = 6000;

export type Toast = {
  /** Muda a cada aviso: o temporizador e o "Desfazer" valem só para este. */
  id: number;
  texto: string;
  aoDesfazer?: () => void;
};

export type EstadoToast = {
  atual: Toast | null;
  proximoId: number;
};

export const ESTADO_TOAST_INICIAL: EstadoToast = { atual: null, proximoId: 1 };

export type NovoToast = { texto: string; aoDesfazer?: () => void };

/** Mostra um aviso novo no lugar do atual (se houver). */
export function mostrarToast(estado: EstadoToast, novo: NovoToast): EstadoToast {
  return {
    atual: { id: estado.proximoId, texto: novo.texto, aoDesfazer: novo.aoDesfazer },
    proximoId: estado.proximoId + 1,
  };
}

/** Fecha o aviso `id`. Se outro já o substituiu, nada muda. */
export function fecharToast(estado: EstadoToast, id: number): EstadoToast {
  return estado.atual?.id === id ? { ...estado, atual: null } : estado;
}

/**
 * "Desfazer" no aviso `id`: fecha o aviso e devolve a ação a chamar. Um
 * segundo toque (ou um aviso já fechado ou substituído) devolve `null`.
 */
export function desfazerToast(
  estado: EstadoToast,
  id: number,
): { estado: EstadoToast; acao: (() => void) | null } {
  if (estado.atual?.id !== id) return { estado, acao: null };
  return { estado: { ...estado, atual: null }, acao: estado.atual.aoDesfazer ?? null };
}
