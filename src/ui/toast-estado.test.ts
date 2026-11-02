import { describe, expect, it, vi } from "vitest";
import {
  DURACAO_TOAST_MS,
  ESTADO_TOAST_INICIAL,
  desfazerToast,
  fecharToast,
  mostrarToast,
} from "./toast-estado";

describe("toast", () => {
  it("dura 6 segundos", () => {
    expect(DURACAO_TOAST_MS).toBe(6000);
  });

  it("mostrar abre um aviso com id novo", () => {
    const e = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "Status aplicado." });
    expect(e.atual?.texto).toBe("Status aplicado.");
    expect(e.atual?.id).toBe(1);
  });

  it("um aviso novo substitui o anterior com outro id (o tempo recomeça)", () => {
    const a = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "A" });
    const b = mostrarToast(a, { texto: "B" });
    expect(b.atual?.texto).toBe("B");
    expect(b.atual?.id).not.toBe(a.atual?.id);
  });

  it("fechar o aviso antigo não fecha o novo", () => {
    const a = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "A" });
    const b = mostrarToast(a, { texto: "B" });
    expect(fecharToast(b, a.atual!.id)).toBe(b);
    expect(fecharToast(b, b.atual!.id).atual).toBeNull();
  });

  it("desfazer fecha o aviso e chama a ação uma vez só", () => {
    const aoDesfazer = vi.fn();
    let estado = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "Excluído.", aoDesfazer });
    const id = estado.atual!.id;

    const primeiro = desfazerToast(estado, id);
    estado = primeiro.estado;
    primeiro.acao?.();
    const segundo = desfazerToast(estado, id);
    segundo.acao?.();

    expect(estado.atual).toBeNull();
    expect(segundo.acao).toBeNull();
    expect(aoDesfazer).toHaveBeenCalledTimes(1);
  });

  it("desfazer de um aviso já substituído não faz nada", () => {
    const aoDesfazer = vi.fn();
    const a = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "A", aoDesfazer });
    const b = mostrarToast(a, { texto: "B" });
    const r = desfazerToast(b, a.atual!.id);
    expect(r.acao).toBeNull();
    expect(r.estado).toBe(b);
  });

  it("aviso sem Desfazer fecha e não devolve ação", () => {
    const a = mostrarToast(ESTADO_TOAST_INICIAL, { texto: "A" });
    const r = desfazerToast(a, a.atual!.id);
    expect(r.acao).toBeNull();
    expect(r.estado.atual).toBeNull();
  });
});
