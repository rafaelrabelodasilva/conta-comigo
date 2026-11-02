// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, TEXTOS_PASSO, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { PassoAPasso } from "./PassoAPasso";

// As seções de Configurações têm testes próprios; aqui cada uma vira um
// marcador, para conferir qual passo está na tela. O roteador do Next e o
// repositório também são falsos.
const falso = vi.hoisted(() => ({
  replace: vi.fn(),
  concluirPrimeiroUso: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: falso.replace, push: vi.fn() }) }));
vi.mock("@/data/configuracoes-repo", () => ({
  repoConfiguracoes: () => ({ concluirPrimeiroUso: falso.concluirPrimeiroUso }),
}));
vi.mock("@/features/configuracoes/SecaoResponsaveis", () => ({
  SecaoResponsaveis: () => <section data-secao="responsaveis" />,
}));
// Tipos e Ciclo simulam um rascunho não salvo com um botão.
function SecaoComRascunho({ nome, aoMudarRascunho }: { nome: string; aoMudarRascunho?: (tem: boolean) => void }) {
  return (
    <section data-secao={nome}>
      <button type="button" onClick={() => aoMudarRascunho?.(true)}>
        digitar sem salvar
      </button>
    </section>
  );
}
vi.mock("@/features/configuracoes/SecaoTipos", () => ({
  SecaoTipos: (p: { aoMudarRascunho?: (tem: boolean) => void }) => <SecaoComRascunho nome="tipos" {...p} />,
}));
vi.mock("@/features/configuracoes/SecaoStatus", () => ({ SecaoStatus: () => <section data-secao="status" /> }));
vi.mock("@/features/configuracoes/SecaoCiclo", () => ({
  SecaoCiclo: (p: { aoMudarRascunho?: (tem: boolean) => void }) => <SecaoComRascunho nome="ciclo" {...p} />,
}));

function montar(passoInicial: Parameters<typeof PassoAPasso>[0]["passoInicial"] = "responsaveis") {
  render(
    <ToastProvider>
      <PassoAPasso passoInicial={passoInicial} />
    </ToastProvider>,
  );
}

/** O passo na tela: o marcador da seção e o cabeçalho. */
function passoNaTela() {
  const secoes = [...document.querySelectorAll("[data-secao]")].map((s) => s.getAttribute("data-secao"));
  expect(secoes).toHaveLength(1);
  return { secao: secoes[0], cabecalho: screen.getByText(/^Passo \d de 4 · /).textContent };
}

const botao = (nome: string) => screen.getByRole("button", { name: nome });

describe("PassoAPasso", () => {
  beforeEach(() => {
    falso.replace.mockReset();
    falso.concluirPrimeiroUso.mockReset();
    window.history.replaceState(null, "", "/primeiro-uso");
  });

  it("passo 1: Responsáveis, com pergunta, ajuda e próximos passos", () => {
    montar();
    expect(passoNaTela()).toEqual({ secao: "responsaveis", cabecalho: "Passo 1 de 4 · Responsáveis" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(TEXTOS_PASSO.responsaveis.pergunta);
    expect(screen.getByText(TEXTOS_PASSO.responsaveis.ajuda)).toBeTruthy();
    expect(screen.getByText("Próximos passos: Tipos → Status → Ciclo do cartão")).toBeTruthy();
    expect(botao(ROTULOS.pular)).toBeTruthy();
    expect(botao(ROTULOS.continuar)).toBeTruthy();
  });

  it("segue a ordem Responsáveis → Tipos → Status → Ciclo; no último, Continuar vira Concluir", async () => {
    const usuario = userEvent.setup();
    montar();
    const vistos = [passoNaTela()];
    for (let i = 0; i < 3; i++) {
      await usuario.click(botao(ROTULOS.continuar));
      vistos.push(passoNaTela());
    }
    expect(vistos).toEqual([
      { secao: "responsaveis", cabecalho: "Passo 1 de 4 · Responsáveis" },
      { secao: "tipos", cabecalho: "Passo 2 de 4 · Tipos" },
      { secao: "status", cabecalho: "Passo 3 de 4 · Status" },
      { secao: "ciclo", cabecalho: "Passo 4 de 4 · Ciclo do cartão" },
    ]);
    expect(screen.queryByRole("button", { name: ROTULOS.continuar })).toBeNull();
    expect(botao(ROTULOS.concluir)).toBeTruthy();
    expect(screen.queryByText(/^Próximos passos/)).toBeNull();
    expect(window.location.search).toBe("?passo=ciclo");
    // A pergunta do passo novo recebe o foco.
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(falso.concluirPrimeiroUso).not.toHaveBeenCalled();
  });

  it("Pular avança sem gravar", async () => {
    montar("tipos");
    await userEvent.setup().click(botao(ROTULOS.pular));
    expect(passoNaTela().secao).toBe("status");
    expect(falso.concluirPrimeiroUso).not.toHaveBeenCalled();
    expect(falso.replace).not.toHaveBeenCalled();
  });

  it("Concluir grava a marca e vai para o Painel", async () => {
    falso.concluirPrimeiroUso.mockResolvedValue({ ok: true });
    montar("ciclo");
    await userEvent.setup().click(botao(ROTULOS.concluir));
    expect(falso.concluirPrimeiroUso).toHaveBeenCalledTimes(1);
    expect(falso.replace).toHaveBeenCalledWith("/");
  });

  it("Pular no último passo também conclui", async () => {
    falso.concluirPrimeiroUso.mockResolvedValue({ ok: true });
    montar("ciclo");
    await userEvent.setup().click(botao(ROTULOS.pular));
    expect(falso.concluirPrimeiroUso).toHaveBeenCalledTimes(1);
    expect(falso.replace).toHaveBeenCalledWith("/");
  });

  it("recusa: toast e continua no passo", async () => {
    falso.concluirPrimeiroUso.mockResolvedValue({ ok: false });
    montar("ciclo");
    await userEvent.setup().click(botao(ROTULOS.concluir));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(falso.replace).not.toHaveBeenCalled();
    expect(passoNaTela().secao).toBe("ciclo");
    // Os botões voltam a funcionar para tentar de novo.
    expect((botao(ROTULOS.concluir) as HTMLButtonElement).disabled).toBe(false);
  });

  describe("rascunho não salvo", () => {
    const janela = () => screen.queryByRole("dialog", { name: mensagem("rascunho.nao_salvo") });

    it("Continuar com rascunho abre a janela; Voltar para salvar fecha e fica no passo", async () => {
      const usuario = userEvent.setup();
      montar("tipos");
      await usuario.click(botao("digitar sem salvar"));
      await usuario.click(botao(ROTULOS.continuar));
      expect(janela()).not.toBeNull();
      await usuario.click(botao(ROTULOS.voltar_para_salvar));
      expect(janela()).toBeNull();
      expect(passoNaTela().secao).toBe("tipos");
    });

    it("Descartar avança sem gravar", async () => {
      const usuario = userEvent.setup();
      montar("tipos");
      await usuario.click(botao("digitar sem salvar"));
      await usuario.click(botao(ROTULOS.pular));
      await usuario.click(botao(ROTULOS.descartar));
      expect(janela()).toBeNull();
      expect(passoNaTela().secao).toBe("status");
      expect(falso.concluirPrimeiroUso).not.toHaveBeenCalled();
    });

    it("Concluir com rascunho pergunta; Descartar conclui", async () => {
      falso.concluirPrimeiroUso.mockResolvedValue({ ok: true });
      const usuario = userEvent.setup();
      montar("ciclo");
      await usuario.click(botao("digitar sem salvar"));
      await usuario.click(botao(ROTULOS.concluir));
      expect(janela()).not.toBeNull();
      expect(falso.concluirPrimeiroUso).not.toHaveBeenCalled();
      await usuario.click(botao(ROTULOS.descartar));
      expect(falso.concluirPrimeiroUso).toHaveBeenCalledTimes(1);
      expect(falso.replace).toHaveBeenCalledWith("/");
    });
  });
});
