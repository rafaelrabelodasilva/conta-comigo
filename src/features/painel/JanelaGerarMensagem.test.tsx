// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ESPACO } from "@/domain/dinheiro";
import { mensagemDaSelecao, type MensagemDaJanela } from "@/domain/mensagem-janela";
import type { ModeloMensagem } from "@/domain/modelo-mensagem";
import type { LancamentoParaMensagem } from "@/domain/projecoes";
import { ToastProvider } from "@/ui/Toast";
import { JanelaGerarMensagem, type PropsJanelaGerarMensagem } from "./JanelaGerarMensagem";

// A janela "Gerar mensagem" (Histórias 4.6 e 4.7, UX-DR17), sozinha: o texto, os avisos,
// Copiar (e a falha), "Incluir previstos", o modelo que não serve e a mensagem que muda
// com a janela aberta. Ela recebe a mensagem pronta (`montar`); aqui a da Seleção
// (forma 1). A regra de inclusão e o formato têm os testes de aceite em
// `src/domain/gerar-mensagem.test.ts` e `gerar-mensagem-bloco.test.ts`.

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$", `-${ESPACO}R$`);

const MODELO: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "pix@exemplo.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

function l(id: string, nome: string, valor: number, extra: Partial<LancamentoParaMensagem> = {}): LancamentoParaMensagem {
  return {
    id,
    mes: "2026-11",
    excluido_em: null,
    nome,
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    valor_centavos: valor,
    status_id: null,
    lancado_por: "fatura",
    ordem_fatura: Number(id.replace(/\D/g, "")),
    responsavel_id: "mae",
    tipo_id: null,
    ...extra,
  };
}

const LANCAMENTOS = [l("a1", "MERCADO", 15990), l("a2", "FARMACIA", 32797), l("a3", "PAGO", 5000, { status_id: "pago" }), l("a4", "ZERO", 0)];

type Entrada = {
  selecao: ReadonlySet<string>;
  lancamentos: readonly LancamentoParaMensagem[];
  modelo: ModeloMensagem;
  temFatura: boolean;
  aoMudar: PropsJanelaGerarMensagem["aoMudar"];
  aoEditarModelo: PropsJanelaGerarMensagem["aoEditarModelo"];
};

function props(extra: Partial<Entrada> = {}): PropsJanelaGerarMensagem {
  const x: Entrada = {
    selecao: new Set(["a1", "a2"]),
    lancamentos: LANCAMENTOS,
    modelo: MODELO,
    temFatura: true,
    aoMudar: vi.fn(),
    aoEditarModelo: vi.fn(),
    ...extra,
  };
  return {
    aberta: true,
    aoMudar: x.aoMudar,
    aoEditarModelo: x.aoEditarModelo,
    temFatura: x.temFatura,
    montar: (incluirPrevistos) =>
      mensagemDaSelecao(x.modelo, x.selecao, x.lancamentos, {
        mes: "2026-11",
        statusPagos: new Set(["pago"]),
        temFatura: x.temFatura,
        incluirPrevistos,
        hoje: "2026-11-10",
      }),
  };
}

const renderizar = (p: PropsJanelaGerarMensagem) => render(<JanelaGerarMensagem {...p} />, { wrapper: ToastProvider });
const quadro = () => screen.getByRole("textbox", { name: "Mensagem" }) as HTMLTextAreaElement;
const botao = (nome: string) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;

afterEach(cleanup);

describe("JanelaGerarMensagem", () => {
  it("mostra a mensagem no quadro, só de leitura e com o foco nele", () => {
    renderizar(props());
    expect(screen.getByRole("dialog", { name: "Gerar mensagem" })).toBeTruthy();
    expect(quadro().value).toBe(
      e(["Oi", "Esse mês deu R$ 487,87", "Pix pix@exemplo.com", "", "Detalhes:", "MERCADO | R$ 159,90", "FARMACIA | R$ 327,97", "Total: R$ 487,87"].join("\n")),
    );
    expect(quadro().readOnly).toBe(true);
    expect(document.activeElement).toBe(quadro());
    expect(screen.getByText("Confira o texto e copie para colar no WhatsApp.")).toBeTruthy();
  });

  it("o aviso dos itens de fora é a descrição da janela, não está na mensagem", () => {
    renderizar(props({ selecao: new Set(["a1", "a3", "a4"]) }));
    const aviso = e("2 itens não entram: 1 já pago, 1 de R$ 0,00");
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText((t) => t.replaceAll(ESPACO, " ") === aviso.replaceAll(ESPACO, " "))).toBeTruthy();
    expect(quadro().value).not.toContain("não entram");
  });

  it("Copiar põe o texto na área de transferência, fecha a janela e mostra “Copiado”", async () => {
    const p = props();
    renderizar(p);
    const u = userEvent.setup();
    await u.click(botao("Copiar"));
    expect(await navigator.clipboard.readText()).toBe(quadro().value);
    expect(p.aoMudar).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Copiado")).toBeTruthy();
  });

  it("se a cópia falhar: avisa, não fecha e deixa o texto selecionado para copiar na mão", async () => {
    const p = props();
    renderizar(p);
    const u = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("negado"));
    await u.click(botao("Copiar"));
    expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível copiar. Selecione o texto e copie manualmente");
    expect(p.aoMudar).not.toHaveBeenCalled();
    expect(screen.queryByText("Copiado")).toBeNull();
    expect(document.activeElement).toBe(quadro());
    expect(quadro().selectionStart).toBe(0);
    expect(quadro().selectionEnd).toBe(quadro().value.length);
  });

  it("sem a API da área de transferência (sem HTTPS) também cai no texto selecionável", async () => {
    renderizar(props());
    const u = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await u.click(botao("Copiar"));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("nada a entrar: “Nada a cobrar nesta seleção”, Copiar desativado e o aviso do que ficou de fora", () => {
    renderizar(props({ selecao: new Set(["a3"]) }));
    expect(screen.getByText("Nada a cobrar nesta seleção")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
    expect(botao("Copiar").disabled).toBe(true);
    expect(screen.getByText("1 item não entra: 1 já pago")).toBeTruthy();
    // Sem mensagem, o foco abre em “Editar modelo”.
    expect(document.activeElement).toBe(botao("Editar modelo"));
  });

  it("modelo vazio: explica, Copiar desativado e “Editar modelo” é o botão principal", async () => {
    const p = props({ modelo: { saudacao: "", frase_total: "", chave_pix: "", rodape: "", campos: { nome: false, parcela: false, valor: false } } });
    renderizar(p);
    expect(screen.getByText("O modelo da mensagem está vazio. Preencha em Configurações para gerar a mensagem.")).toBeTruthy();
    expect(botao("Copiar").disabled).toBe(true);
    expect(botao("Editar modelo").className).toContain("bg-accent");
    await userEvent.setup().click(botao("Editar modelo"));
    expect(p.aoEditarModelo).toHaveBeenCalledTimes(1);
  });

  it("modelo com texto e sem nenhuma caixa: pede para marcar um campo", () => {
    renderizar(props({ modelo: { ...MODELO, campos: { nome: false, parcela: false, valor: false } } }));
    expect(screen.getByText("O modelo não tem campos na linha de detalhe. Marque ao menos um em Configurações.")).toBeTruthy();
    expect(botao("Copiar").disabled).toBe(true);
  });

  it("“Incluir previstos” só aparece num Mês sem Fatura e inclui os previstos da Seleção", async () => {
    const previsto = l("a5", "PREVISTO", 7000, { lancado_por: "sistema" });
    const lancamentos = [...LANCAMENTOS, previsto];
    const comFatura = renderizar(props({ lancamentos, selecao: new Set(["a1", "a5"]) }));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("1 item não entra: 1 previsto")).toBeTruthy();
    comFatura.unmount();

    renderizar(props({ lancamentos, selecao: new Set(["a1", "a5"]), temFatura: false }));
    const interruptor = screen.getByRole("switch", { name: "Incluir previstos" });
    expect(interruptor.getAttribute("aria-checked")).toBe("false");
    expect(quadro().value).not.toContain("PREVISTO");
    await userEvent.setup().click(interruptor);
    expect(interruptor.getAttribute("aria-checked")).toBe("true");
    expect(quadro().value).toContain(e("PREVISTO | R$ 70,00"));
    expect(quadro().value).toContain(e("Total: R$ 229,90"));
    // Mexer na chave é escolha dele: não é “a mensagem mudou”.
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("com a janela aberta, a mensagem acompanha o Realtime e avisa que mudou", () => {
    const p = props();
    const { rerender } = renderizar(p);
    expect(screen.getByRole("status").textContent).toBe("");
    // Outro aparelho muda o valor do Mercado.
    act(() => {
      rerender(<JanelaGerarMensagem {...p} montar={props({ lancamentos: [l("a1", "MERCADO", 20000), ...LANCAMENTOS.slice(1)] }).montar} />);
    });
    expect(quadro().value).toContain(e("MERCADO | R$ 200,00"));
    expect(screen.getByRole("status").textContent).toBe("A mensagem mudou desde que você abriu a janela. Confira o texto antes de copiar.");
  });

  it("o modelo salvo em outro aparelho também refaz o texto e avisa", () => {
    const p = props();
    const { rerender } = renderizar(p);
    act(() => {
      rerender(<JanelaGerarMensagem {...p} montar={props({ modelo: { ...MODELO, saudacao: "Olá" } }).montar} />);
    });
    expect(quadro().value.startsWith("Olá\n")).toBe(true);
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain("A mensagem mudou");
  });

  it("vários avisos (de fora, pagos) ficam juntos na descrição, nunca no texto", () => {
    const m: MensagemDaJanela = {
      gerada: { estado: "pronta", texto: "Oi\nTotal", totalCentavos: 100 },
      semTexto: "",
      avisos: ["1 item não entra: 1 já pago", e("R$ 500,00 já foram pagos e não entram")],
    };
    renderizar({ ...props(), montar: () => m });
    const descricao = screen.getByText((t) => t.includes("já foram pagos"));
    expect(descricao.textContent).toBe(e("1 item não entra: 1 já pago. R$ 500,00 já foram pagos e não entram"));
    expect(quadro().value).toBe("Oi\nTotal");
  });

  it("não sabe de onde veio: sem mensagem, mostra o texto que o núcleo mandou e desativa Copiar", () => {
    const m: MensagemDaJanela = {
      gerada: { estado: "sem_valor" },
      semTexto: "Este bloco está sem valor. Edite a fórmula para gerar a mensagem.",
      avisos: [],
    };
    renderizar({ ...props(), montar: () => m });
    expect(screen.getByText(m.semTexto)).toBeTruthy();
    expect(botao("Copiar").disabled).toBe(true);
    expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
    // “Editar modelo” não é o principal: o modelo está bem.
    expect(botao("Editar modelo").className).not.toContain("bg-accent");
  });

  it("o Bloco que fica sem valor com a janela aberta avisa que a mensagem mudou", () => {
    const pronta: MensagemDaJanela = { gerada: { estado: "pronta", texto: "Oi", totalCentavos: 100 }, semTexto: "", avisos: [] };
    const semValor: MensagemDaJanela = { gerada: { estado: "sem_valor" }, semTexto: "Este bloco está sem valor. Edite a fórmula para gerar a mensagem.", avisos: [] };
    const base = props();
    const { rerender } = renderizar({ ...base, montar: () => pronta });
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => {
      rerender(<JanelaGerarMensagem {...base} montar={() => semValor} />);
    });
    expect(screen.getByRole("status").textContent).toContain("A mensagem mudou");
    expect(botao("Copiar").disabled).toBe(true);
  });

  it("Fechar fecha a janela", async () => {
    const p = props();
    renderizar(p);
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Fechar" }).at(-1)!);
    expect(p.aoMudar).toHaveBeenCalledWith(false);
  });
});
