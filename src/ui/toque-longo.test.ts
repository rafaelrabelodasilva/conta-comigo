import { describe, expect, it, vi } from "vitest";
import { criarDetectorToqueLongo, type Temporizadores } from "./toque-longo";

/** Relógio de mentira: `avancar(ms)` roda o que venceu. */
function relogio() {
  let agora = 0;
  let proximo = 1;
  const fila = new Map<number, { quando: number; fn: () => void }>();
  const temporizadores: Temporizadores<number> = {
    agendar(fn, ms) {
      const id = proximo++;
      fila.set(id, { quando: agora + ms, fn });
      return id;
    },
    cancelar(id) {
      fila.delete(id);
    },
  };
  const avancar = (ms: number) => {
    agora += ms;
    for (const [id, t] of [...fila]) {
      if (t.quando <= agora) {
        fila.delete(id);
        t.fn();
      }
    }
  };
  return { temporizadores, avancar, pendentes: () => fila.size };
}

function montar() {
  const r = relogio();
  const aoToqueLongo = vi.fn();
  const d = criarDetectorToqueLongo({ aoToqueLongo, temporizadores: r.temporizadores });
  return { ...r, aoToqueLongo, d };
}

describe("toque longo", () => {
  it("dedo parado 500 ms abre o menu", () => {
    const { d, avancar, aoToqueLongo } = montar();
    d.iniciar(100, 100);
    avancar(499);
    expect(aoToqueLongo).not.toHaveBeenCalled();
    avancar(1);
    expect(aoToqueLongo).toHaveBeenCalledTimes(1);
    expect(d.soltar()).toBe(true);
  });

  it("soltar antes de 500 ms não faz nada", () => {
    const { d, avancar, aoToqueLongo, pendentes } = montar();
    d.iniciar(0, 0);
    avancar(300);
    expect(d.soltar()).toBe(false);
    avancar(1000);
    expect(aoToqueLongo).not.toHaveBeenCalled();
    expect(pendentes()).toBe(0);
  });

  it("mover até 10 px ainda conta; mais de 10 px cancela", () => {
    const a = montar();
    a.d.iniciar(0, 0);
    a.d.mover(6, 8); // exatamente 10 px
    a.avancar(500);
    expect(a.aoToqueLongo).toHaveBeenCalledTimes(1);

    const b = montar();
    b.d.iniciar(0, 0);
    b.d.mover(11, 0);
    b.avancar(1000);
    expect(b.aoToqueLongo).not.toHaveBeenCalled();
  });

  it("cancelar antes de 500 ms não faz nada", () => {
    const { d, avancar, aoToqueLongo } = montar();
    d.iniciar(0, 0);
    avancar(200);
    d.cancelar();
    avancar(1000);
    expect(aoToqueLongo).not.toHaveBeenCalled();
  });

  it("um toque novo recomeça a contagem", () => {
    const { d, avancar, aoToqueLongo } = montar();
    d.iniciar(0, 0);
    avancar(400);
    d.soltar();
    d.iniciar(0, 0);
    avancar(400);
    expect(aoToqueLongo).not.toHaveBeenCalled();
    avancar(100);
    expect(aoToqueLongo).toHaveBeenCalledTimes(1);
  });

  it("mover depois de disparar não dispara de novo", () => {
    const { d, avancar, aoToqueLongo } = montar();
    d.iniciar(0, 0);
    avancar(500);
    d.mover(50, 50);
    avancar(1000);
    expect(aoToqueLongo).toHaveBeenCalledTimes(1);
  });
});
