// Detector puro de toque longo: dedo parado por 500 ms dispara a ação.
// Soltar, mover mais de 10 px ou cancelar antes disso não faz nada.
// Os temporizadores são injetados, para o teste controlar o tempo.

export const DURACAO_TOQUE_LONGO_MS = 500;
export const TOLERANCIA_TOQUE_LONGO_PX = 10;

export type Temporizadores<H = unknown> = {
  agendar: (fn: () => void, ms: number) => H;
  cancelar: (handle: H) => void;
};

export type DetectorToqueLongo = {
  /** Dedo encostou em (x, y). Recomeça a contagem. */
  iniciar: (x: number, y: number) => void;
  /** Dedo se moveu; mais de 10 px do início cancela. */
  mover: (x: number, y: number) => void;
  /** Dedo saiu da tela. Devolve `true` se o toque longo já tinha disparado. */
  soltar: () => boolean;
  /** Gesto interrompido (pointercancel, rolagem). */
  cancelar: () => void;
};

export function criarDetectorToqueLongo<H>(opcoes: {
  aoToqueLongo: () => void;
  temporizadores: Temporizadores<H>;
  duracaoMs?: number;
  toleranciaPx?: number;
}): DetectorToqueLongo {
  const {
    aoToqueLongo,
    temporizadores,
    duracaoMs = DURACAO_TOQUE_LONGO_MS,
    toleranciaPx = TOLERANCIA_TOQUE_LONGO_PX,
  } = opcoes;

  let handle: { valor: H } | null = null;
  let origem: { x: number; y: number } | null = null;
  let disparou = false;

  const parar = () => {
    if (handle) temporizadores.cancelar(handle.valor);
    handle = null;
    origem = null;
  };

  return {
    iniciar(x, y) {
      parar();
      disparou = false;
      origem = { x, y };
      handle = {
        valor: temporizadores.agendar(() => {
          handle = null;
          origem = null;
          disparou = true;
          aoToqueLongo();
        }, duracaoMs),
      };
    },
    mover(x, y) {
      if (!origem) return;
      if (Math.hypot(x - origem.x, y - origem.y) > toleranciaPx) parar();
    },
    soltar() {
      parar();
      const ja = disparou;
      disparou = false;
      return ja;
    },
    cancelar() {
      parar();
      disparou = false;
    },
  };
}
