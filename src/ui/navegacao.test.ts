import { describe, expect, it } from "vitest";
import {
  ITENS_NAV,
  destinoDoAtalho,
  ehCampoDeTexto,
  itemAtivo,
  type EventoTecla,
} from "./navegacao";

describe("itens do menu", () => {
  it("sete itens na ordem do EXPERIENCE.md (Avisos antes de Config.), com as rotas da spec", () => {
    expect(ITENS_NAV.map((i) => [i.rotulo, i.rota])).toEqual([
      ["Painel", "/"],
      ["Revisar", "/revisar"],
      ["Receber", "/recebimentos"],
      ["Previsão", "/previsao"],
      ["Contas", "/contas"],
      ["Avisos", "/avisos"],
      ["Config.", "/configuracoes"],
    ]);
  });
});

describe("itemAtivo", () => {
  it("ativa o item da rota", () => {
    expect(itemAtivo("/recebimentos")?.rotulo).toBe("Receber");
    expect(itemAtivo("/configuracoes")?.rotulo).toBe("Config.");
  });

  it("Avisos ativa em /avisos e o atalho 6 abre; Config. vira o 7", () => {
    expect(itemAtivo("/avisos")?.rotulo).toBe("Avisos");
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "6", code: "Digit6" }))).toBe("/avisos");
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "7", code: "Digit7" }))).toBe("/configuracoes");
  });

  it("subrota ativa o item pai", () => {
    expect(itemAtivo("/configuracoes/x")?.rotulo).toBe("Config.");
    expect(itemAtivo("/contas/123/editar")?.rotulo).toBe("Contas");
  });

  it("/ só ativa o Painel no caminho exato", () => {
    expect(itemAtivo("/")?.rotulo).toBe("Painel");
    expect(itemAtivo("/qualquer")).toBeUndefined();
    expect(itemAtivo("/entrar")).toBeUndefined();
  });

  it("prefixo parecido não ativa", () => {
    expect(itemAtivo("/contas-velhas")).toBeUndefined();
    expect(itemAtivo("/revisarx")).toBeUndefined();
  });

  it("barra no fim é tolerada", () => {
    expect(itemAtivo("/previsao/")?.rotulo).toBe("Previsão");
  });

  it("sem caminho, nenhum item", () => {
    expect(itemAtivo(null)).toBeUndefined();
    expect(itemAtivo("")).toBeUndefined();
  });
});

const tecla = (parcial: Partial<EventoTecla>): EventoTecla => ({
  key: "3",
  code: "Digit3",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  alvo: { tagName: "BODY" },
  ...parcial,
});

describe("destinoDoAtalho", () => {
  it("⌘ + 3 e Ctrl + 3 vão para Receber", () => {
    expect(destinoDoAtalho(tecla({ metaKey: true }))).toBe("/recebimentos");
    expect(destinoDoAtalho(tecla({ ctrlKey: true }))).toBe("/recebimentos");
  });

  it("1 a 7 seguem a ordem do menu", () => {
    const destinos = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      destinoDoAtalho(tecla({ ctrlKey: true, key: String(n), code: `Digit${n}` })),
    );
    expect(destinos).toEqual(ITENS_NAV.map((i) => i.rota));
  });

  it("sem modificador, ou com Alt ou Shift, ignora", () => {
    expect(destinoDoAtalho(tecla({}))).toBeNull();
    expect(destinoDoAtalho(tecla({ ctrlKey: true, altKey: true }))).toBeNull();
    expect(destinoDoAtalho(tecla({ metaKey: true, shiftKey: true, key: "#" }))).toBeNull();
  });

  it("outras teclas ignoram", () => {
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "8", code: "Digit8" }))).toBeNull();
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "0", code: "Digit0" }))).toBeNull();
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "a", code: "KeyA" }))).toBeNull();
  });

  it("teclado numérico também vale", () => {
    expect(destinoDoAtalho(tecla({ ctrlKey: true, key: "2", code: "Numpad2" }))).toBe(
      "/revisar",
    );
  });

  it("dentro de campo de texto, ignora", () => {
    for (const alvo of [
      { tagName: "INPUT", type: "text" },
      { tagName: "input", type: "email" },
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(destinoDoAtalho(tecla({ metaKey: true, alvo }))).toBeNull();
    }
  });

  it("caixa de seleção e botão não são campo de texto", () => {
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(ehCampoDeTexto({ tagName: "BUTTON" })).toBe(false);
    expect(destinoDoAtalho(tecla({ ctrlKey: true, alvo: { tagName: "BUTTON" } }))).toBe(
      "/recebimentos",
    );
  });

  it("tecla mantida apertada não repete o atalho", () => {
    expect(destinoDoAtalho(tecla({ ctrlKey: true, repeat: true }))).toBeNull();
    expect(destinoDoAtalho(tecla({ ctrlKey: true, repeat: false }))).toBe("/recebimentos");
  });

  it("com janela, confirmação ou menu aberto, ignora", () => {
    expect(destinoDoAtalho(tecla({ metaKey: true, dentroDeSobreposicao: true }))).toBeNull();
  });

  it("durante composição de texto (IME), ignora", () => {
    expect(destinoDoAtalho(tecla({ ctrlKey: true, isComposing: true }))).toBeNull();
  });
});
