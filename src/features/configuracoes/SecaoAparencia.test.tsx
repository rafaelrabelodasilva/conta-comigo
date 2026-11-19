// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, TEXTOS_LEMBRETES as L, TEXTOS_NOTIFICACOES as N, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoAparencia } from "./SecaoAparencia";

const falso = vi.hoisted(() => ({
  linhas: [] as unknown[],
  definirAparencia: vi.fn(),
  definirLembrete: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.linhas }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({ definirAparencia: falso.definirAparencia, definirLembrete: falso.definirLembrete }),
}));

function montar() {
  render(
    <ToastProvider>
      <SecaoAparencia />
    </ToastProvider>,
  );
  // A seção e o seletor se chamam "Aparência"; o seletor é o combobox.
  return screen.getByRole<HTMLSelectElement>("combobox", { name: ROTULOS.aparencia });
}

describe("SecaoAparencia", () => {
  beforeEach(() => {
    falso.linhas = [];
    falso.definirAparencia.mockReset();
    falso.definirLembrete.mockReset();
  });

  it("mostra a Aparência guardada; sem linha, Sistema", () => {
    expect(montar().value).toBe("sistema");
  });

  it("chama definirAparencia com a escolha", async () => {
    falso.definirAparencia.mockResolvedValue({ ok: true });
    const seletor = montar();
    await userEvent.setup().selectOptions(seletor, ROTULOS.aparencia_escuro);
    expect(falso.definirAparencia).toHaveBeenCalledTimes(1);
    expect(falso.definirAparencia).toHaveBeenCalledWith("escuro");
  });

  it("recusa do banco mostra o toast", async () => {
    falso.definirAparencia.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const seletor = montar();
    await userEvent.setup().selectOptions(seletor, ROTULOS.aparencia_claro);
    expect(falso.definirAparencia).toHaveBeenCalledWith("claro");
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
  });

  it("sem conexão mostra o aviso próprio", async () => {
    falso.definirAparencia.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    const seletor = montar();
    await userEvent.setup().selectOptions(seletor, ROTULOS.aparencia_claro);
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
  });

  describe("Lembretes (História 7.4)", () => {
    const interruptor = (nome: string) => screen.getByRole("switch", { name: nome });

    it("um interruptor por tipo, dentro do grupo \"Lembretes\", ligados quando não há linha", () => {
      montar();
      const grupo = screen.getByRole("group", { name: L.titulo_preferencias });
      expect(grupo.contains(interruptor(L.fechamento))).toBe(true);
      expect(grupo.contains(interruptor(L.atraso))).toBe(true);
      expect(interruptor(L.fechamento).getAttribute("aria-checked")).toBe("true");
      expect(interruptor(L.atraso).getAttribute("aria-checked")).toBe("true");
    });

    it("mostra o que está guardado em configuracoes", () => {
      falso.linhas = [{ aparencia: "sistema", lembrete_fechamento: false, lembrete_atraso: true }];
      montar();
      expect(interruptor(L.fechamento).getAttribute("aria-checked")).toBe("false");
      expect(interruptor(L.atraso).getAttribute("aria-checked")).toBe("true");
    });

    it("linha sem as colunas (banco antes da migração): ligados", () => {
      falso.linhas = [{ aparencia: "escuro" }];
      montar();
      expect(interruptor(L.fechamento).getAttribute("aria-checked")).toBe("true");
    });

    it("desligar o do fechamento grava só ele; o do atraso grava o seu", async () => {
      falso.definirLembrete.mockResolvedValue({ ok: true });
      montar();
      const usuario = userEvent.setup();
      await usuario.click(interruptor(L.fechamento));
      expect(falso.definirLembrete).toHaveBeenLastCalledWith("fechamento", false);
      await usuario.click(interruptor(L.atraso));
      expect(falso.definirLembrete).toHaveBeenLastCalledWith("atraso", false);
      expect(falso.definirLembrete).toHaveBeenCalledTimes(2);
      expect(falso.definirAparencia).not.toHaveBeenCalled();
    });

    it("ligar de novo grava true", async () => {
      falso.definirLembrete.mockResolvedValue({ ok: true });
      falso.linhas = [{ aparencia: "sistema", lembrete_fechamento: true, lembrete_atraso: false }];
      montar();
      await userEvent.setup().click(interruptor(L.atraso));
      expect(falso.definirLembrete).toHaveBeenCalledWith("atraso", true);
    });

    it("recusa do banco (ou do banco sem a coluna) mostra o toast", async () => {
      falso.definirLembrete.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
      montar();
      await userEvent.setup().click(interruptor(L.atraso));
      expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    });

    it("sem conexão mostra o aviso próprio", async () => {
      falso.definirLembrete.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      montar();
      await userEvent.setup().click(interruptor(L.fechamento));
      expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    });
  });

  describe("Notificações neste aparelho (História 7.5)", () => {
    it("o grupo fica dentro da seção Aparência, abaixo dos interruptores de Lembretes", async () => {
      montar();
      const secao = screen.getByRole("region", { name: ROTULOS.aparencia });
      const grupo = screen.getByRole("group", { name: N.titulo });
      expect(secao.contains(grupo)).toBe(true);
      const lembretes = screen.getByRole("group", { name: L.titulo_preferencias });
      // O de Lembretes vem antes na ordem do documento.
      expect(lembretes.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("no jsdom (sem service worker nem Push) diz que o navegador não permite, e nada é pedido ao abrir", async () => {
      montar();
      expect(await screen.findByText(N.estado_sem_suporte)).toBeTruthy();
      expect(screen.queryByRole("button", { name: N.ativar })).toBeNull();
    });
  });
});

describe("SecaoAparencia: texto de ajuda dos Lembretes (História 8.1)", () => {
  it("diz que o aviso mora na Central de Avisos e que, desligado, não aparece, não conta e não chega", () => {
    falso.linhas = [];
    montar();
    const ajuda = screen.getByText(L.ajuda_preferencias);
    expect(ajuda.textContent).toContain("Central de Avisos");
    expect(ajuda.textContent).toContain("não aparece, não conta e não chega");
    // A faixa no topo das telas acabou.
    expect(ajuda.textContent).not.toContain("faixa");
  });
});
