import { describe, expect, it, vi } from "vitest";
import { criarDetectorConexao, estaOnline, type AlvoConexao } from "./conexao";

// Janela falsa: guarda os ouvintes de `online`/`offline` para disparar no teste.
function janela(onLine: boolean | undefined) {
  const ouvintes: Record<string, (() => void)[]> = { online: [], offline: [] };
  const alvo: AlvoConexao = {
    navigator: onLine === undefined ? {} : { onLine },
    addEventListener: (tipo, ouvinte) => ouvintes[tipo].push(ouvinte),
  };
  const disparar = (tipo: "online" | "offline") => ouvintes[tipo].forEach((o) => o());
  return { alvo, disparar };
}

describe("detector de conexão", () => {
  it("começa pelo navigator.onLine", () => {
    expect(criarDetectorConexao(janela(true).alvo).online()).toBe(true);
    expect(criarDetectorConexao(janela(false).alvo).online()).toBe(false);
  });

  it("sem navigator.onLine ou sem janela, considera online", () => {
    expect(criarDetectorConexao(janela(undefined).alvo).online()).toBe(true);
    expect(criarDetectorConexao(null).online()).toBe(true);
  });

  it("segue os eventos e avisa quem assinou", () => {
    const j = janela(true);
    const d = criarDetectorConexao(j.alvo);
    const ouvinte = vi.fn();
    const cancelar = d.assinar(ouvinte);
    j.disparar("offline");
    expect(d.online()).toBe(false);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    j.disparar("offline"); // repetido: nada muda
    expect(ouvinte).toHaveBeenCalledTimes(1);
    j.disparar("online");
    expect(d.online()).toBe(true);
    expect(ouvinte).toHaveBeenCalledTimes(2);
    cancelar();
    j.disparar("offline");
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it("aoVoltar roda só quando a conexão volta", () => {
    const j = janela(true);
    const d = criarDetectorConexao(j.alvo);
    const acao = vi.fn();
    d.aoVoltar(acao);
    j.disparar("online"); // já estava online
    expect(acao).not.toHaveBeenCalled();
    j.disparar("offline");
    expect(acao).not.toHaveBeenCalled();
    j.disparar("online");
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("no servidor (sem janela), estaOnline() é true", () => {
    expect(estaOnline()).toBe(true);
  });
});
