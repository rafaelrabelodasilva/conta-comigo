// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, TEXTOS_AVISOS as A, TEXTOS_LEMBRETES as L, TEXTOS_NOTIFICACOES as N, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoAparencia } from "./SecaoAparencia";

const falso = vi.hoisted(() => ({
  linhas: [] as unknown[],
  definirAparencia: vi.fn(),
  definirLembrete: vi.fn(),
  definirAviso: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.linhas }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({
    definirAparencia: falso.definirAparencia,
    definirLembrete: falso.definirLembrete,
    definirAviso: falso.definirAviso,
  }),
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
    falso.definirAviso.mockReset();
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
    // Desde a 8.3 o grupo se chama "Avisos" e tem mais dois interruptores (a Conferência e o Revisar).
    const interruptor = (nome: string) => screen.getByRole("switch", { name: nome });

    it("um interruptor por lembrete, dentro do grupo \"Avisos\", ligados quando não há linha", () => {
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

  describe("Avisos da Conferência e do Revisar (História 8.3)", () => {
    const interruptor = (nome: string) => screen.getByRole("switch", { name: nome });

    it("o grupo tem os quatro interruptores, os dois novos depois dos lembretes, todos ligados sem linha", () => {
      montar();
      const grupo = screen.getByRole("group", { name: L.titulo_preferencias });
      expect(grupo.contains(interruptor(A.preferencia_conferencia))).toBe(true);
      expect(grupo.contains(interruptor(A.preferencia_revisar))).toBe(true);
      expect(within(grupo).getAllByRole("switch")).toHaveLength(4);
      for (const nome of [L.fechamento, L.atraso, A.preferencia_conferencia, A.preferencia_revisar]) {
        expect(interruptor(nome).getAttribute("aria-checked"), nome).toBe("true");
      }
    });

    it("mostra o que está guardado; os lembretes e os avisos são colunas independentes", () => {
      falso.linhas = [
        { aparencia: "sistema", lembrete_fechamento: false, lembrete_atraso: true, aviso_conferencia: true, aviso_revisar: false },
      ];
      montar();
      expect(interruptor(L.fechamento).getAttribute("aria-checked")).toBe("false");
      expect(interruptor(L.atraso).getAttribute("aria-checked")).toBe("true");
      expect(interruptor(A.preferencia_conferencia).getAttribute("aria-checked")).toBe("true");
      expect(interruptor(A.preferencia_revisar).getAttribute("aria-checked")).toBe("false");
    });

    it("linha sem as colunas novas (banco antes do db push): os dois ligados", () => {
      falso.linhas = [{ aparencia: "escuro", lembrete_fechamento: true, lembrete_atraso: true }];
      montar();
      expect(interruptor(A.preferencia_conferencia).getAttribute("aria-checked")).toBe("true");
      expect(interruptor(A.preferencia_revisar).getAttribute("aria-checked")).toBe("true");
    });

    it("desligar grava só o aviso do tipo, por definirAviso (nunca por definirLembrete)", async () => {
      falso.definirAviso.mockResolvedValue({ ok: true });
      montar();
      const usuario = userEvent.setup();
      await usuario.click(interruptor(A.preferencia_conferencia));
      expect(falso.definirAviso).toHaveBeenLastCalledWith("conferencia", false);
      await usuario.click(interruptor(A.preferencia_revisar));
      expect(falso.definirAviso).toHaveBeenLastCalledWith("revisar", false);
      expect(falso.definirAviso).toHaveBeenCalledTimes(2);
      expect(falso.definirLembrete).not.toHaveBeenCalled();
      expect(falso.definirAparencia).not.toHaveBeenCalled();
    });

    it("ligar de novo grava true", async () => {
      falso.definirAviso.mockResolvedValue({ ok: true });
      falso.linhas = [{ aparencia: "sistema", aviso_conferencia: true, aviso_revisar: false }];
      montar();
      await userEvent.setup().click(interruptor(A.preferencia_revisar));
      expect(falso.definirAviso).toHaveBeenCalledWith("revisar", true);
    });

    it("recusa do banco (ou do banco sem a coluna) mostra o toast; sem conexão, o aviso próprio", async () => {
      falso.definirAviso.mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" });
      montar();
      const usuario = userEvent.setup();
      await usuario.click(interruptor(A.preferencia_conferencia));
      expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
      falso.definirAviso.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      await usuario.click(interruptor(A.preferencia_revisar));
      expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    });

    it("o texto da ajuda e o de Notificações neste aparelho não prometem notificação da Conferência nem do Revisar", () => {
      montar();
      expect(L.ajuda_preferencias).not.toMatch(/Conferência|Revisar/);
      expect(L.ajuda_preferencias).toContain("Só o fechamento da fatura e o atraso também chegam como notificação");
      expect(N.ajuda).toContain("A Conferência e o Revisar só aparecem dentro do app");
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

describe("SecaoAparencia: texto de ajuda dos avisos (História 8.1 e 8.3)", () => {
  it("diz que o aviso mora na Central de Avisos e que, desligado, não aparece, não conta e não entra em Marcar tudo", () => {
    falso.linhas = [];
    montar();
    const ajuda = screen.getByText(L.ajuda_preferencias);
    expect(ajuda.textContent).toContain("Central de Avisos");
    expect(ajuda.textContent).toContain("não aparece, não conta no menu e não entra em");
    // Só o fechamento e o atraso chegam como notificação: o texto não promete notificação da Conferência nem do Revisar.
    expect(ajuda.textContent).toContain("Só o fechamento da fatura e o atraso também chegam como notificação");
    // A faixa no topo das telas acabou.
    expect(ajuda.textContent).not.toContain("faixa");
  });
});
