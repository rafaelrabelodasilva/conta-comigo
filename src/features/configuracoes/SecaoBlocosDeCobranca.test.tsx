// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_COBRANCA as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoBlocosDeCobranca } from "./SecaoBlocosDeCobranca";

// Configurações → Blocos de cobrança (História 6.5, UX-DR25): duas chaves por Bloco. O gerenciador e o repositório
// são falsos; o pedido que vai para a RPC `salvar_bloco` vem do núcleo (`planejarMarcasDoBloco`, com teste próprio).

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (tabela: string) => {
    const guardado = cache.get(tabela);
    if (guardado && guardado.versao === falso.versao) return guardado.retrato;
    const novo = { status: falso.status[tabela] ?? "pronto", linhas: falso.banco[tabela] ?? [] };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  return {
    useLinhas: (tabela: string) =>
      useSyncExternalStore(
        (o) => {
          falso.ouvintes.add(o);
          return () => falso.ouvintes.delete(o);
        },
        () => retrato(tabela),
        () => retrato(tabela),
      ),
    gerenciador: () => ({ recarregar: falso.recarregar }),
  };
});

const repo = vi.hoisted(() => ({
  salvar: vi.fn<(pedido: Record<string, unknown>) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
}));
vi.mock("@/data/blocos-repo", () => ({ repoBlocos: () => repo }));

const T0 = "2026-11-03T12:00:00+00:00";
const resp = (id: string) => ({ tipo: "responsavel", id });
const bloco = (id: string, nome: string, ordem: number, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  formula: resp("r-" + id),
  ordem,
  de_cobranca: false,
  meu_bloco: false,
  created_at: T0,
  updated_at: T0,
  ...extra,
});

function mudar(f: () => void) {
  act(() => {
    f();
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

const renderizar = () =>
  render(
    <ToastProvider>
      <SecaoBlocosDeCobranca />
    </ToastProvider>,
  );

const chave = (nome: string, rotulo: "Usar em Recebimentos" | "É o meu Bloco") =>
  screen.getByRole("switch", { name: `${rotulo}: ${nome}` });

beforeEach(() => {
  vi.clearAllMocks();
  falso.status = {};
  falso.ouvintes.clear();
  falso.versao++;
  falso.banco = {
    responsaveis: [
      { id: "r-mae", nome: "Mãe", cor: 4, ordem: 1, arquivado: false },
      { id: "r-lucas", nome: "Lucas", cor: 5, ordem: 2, arquivado: false },
      { id: "r-rangel", nome: "Rangel", cor: 3, ordem: 3, arquivado: false },
    ],
    tipos: [],
    blocos: [
      bloco("mae", "Mãe", 1, { de_cobranca: true }),
      bloco("lucas", "Lucas", 2),
      bloco("rangel", "Rangel", 3, { meu_bloco: true }),
    ],
  };
});

describe("Configurações → Blocos de cobrança (História 6.5, UX-DR25)", () => {
  it("lista todos os Blocos, na ordem do Painel, com as duas chaves no estado gravado", () => {
    renderizar();
    const itens = within(screen.getByRole("list", { name: T.lista })).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens.map((i) => i.querySelector(".texto-body-strong")?.textContent)).toEqual(["Mãe", "Lucas", "Rangel"]);
    expect(chave("Mãe", "Usar em Recebimentos").getAttribute("aria-checked")).toBe("true");
    expect(chave("Lucas", "Usar em Recebimentos").getAttribute("aria-checked")).toBe("false");
    expect(chave("Rangel", "É o meu Bloco").getAttribute("aria-checked")).toBe("true");
    expect(chave("Mãe", "É o meu Bloco").getAttribute("aria-checked")).toBe("false");
  });

  it("o rótulo visível é o do Montador; o nome falado diz de qual Bloco é a chave", () => {
    renderizar();
    expect(screen.getAllByText("Usar em Recebimentos")).toHaveLength(3);
    expect(screen.getAllByText("É o meu Bloco")).toHaveLength(3);
  });

  it("ligar 'Usar em Recebimentos' grava só essa marca (o nome, a Fórmula e a ordem seguem como estão)", async () => {
    renderizar();
    await userEvent.setup().click(chave("Lucas", "Usar em Recebimentos"));
    expect(repo.salvar).toHaveBeenCalledWith({
      p_id: "lucas",
      p_nome: "Lucas",
      p_formula: resp("r-lucas"),
      p_ordem: 2,
      p_de_cobranca: true,
      p_meu_bloco: false,
    });
  });

  it("desligar 'Usar em Recebimentos' tira o Bloco de Recebimentos", async () => {
    renderizar();
    await userEvent.setup().click(chave("Mãe", "Usar em Recebimentos"));
    expect(repo.salvar).toHaveBeenCalledWith(expect.objectContaining({ p_id: "mae", p_de_cobranca: false, p_meu_bloco: false }));
  });

  it("escolher 'o meu Bloco' manda a marca; a RPC tira a do outro e o gerenciador mostra só um", async () => {
    repo.salvar.mockImplementationOnce(async (pedido) => {
      mudar(() => {
        falso.banco.blocos = (falso.banco.blocos as { id: string }[]).map((b) => ({ ...b, meu_bloco: b.id === pedido.p_id }));
      });
      return { ok: true };
    });
    renderizar();
    await userEvent.setup().click(chave("Mãe", "É o meu Bloco"));
    expect(repo.salvar).toHaveBeenCalledWith(expect.objectContaining({ p_id: "mae", p_meu_bloco: true, p_de_cobranca: true }));
    expect(chave("Mãe", "É o meu Bloco").getAttribute("aria-checked")).toBe("true");
    expect(chave("Rangel", "É o meu Bloco").getAttribute("aria-checked")).toBe("false");
  });

  it("desmarcar 'o meu Bloco' não escolhe outro", async () => {
    renderizar();
    await userEvent.setup().click(chave("Rangel", "É o meu Bloco"));
    expect(repo.salvar).toHaveBeenCalledWith(expect.objectContaining({ p_id: "rangel", p_meu_bloco: false }));
  });

  it("falha ao gravar (sem internet ou o banco recusa): avisa com o texto do mapa e a chave segue como estava", async () => {
    repo.salvar.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    renderizar();
    await userEvent.setup().click(chave("Lucas", "Usar em Recebimentos"));
    expect(await screen.findByText("Sem conexão. Tente de novo quando a internet voltar.")).toBeTruthy();
    expect(chave("Lucas", "Usar em Recebimentos").getAttribute("aria-checked")).toBe("false");
  });

  it("um Bloco 'meu' que não é de cobrança fica só como 'meu': a chave de cobrança segue desligada", () => {
    renderizar();
    expect(chave("Rangel", "Usar em Recebimentos").getAttribute("aria-checked")).toBe("false");
  });

  it("sem Blocos: explica e leva ao Painel", () => {
    mudar(() => {
      falso.banco.blocos = [];
    });
    renderizar();
    expect(screen.getByText(T.sem_blocos)).toBeTruthy();
    expect(screen.getByRole("link", { name: T.criar_no_painel }).getAttribute("href")).toBe("/");
  });

  it("carregando: esqueleto; erro: 'Tentar de novo' relê os Blocos", async () => {
    mudar(() => {
      falso.status = { blocos: "carregando" };
    });
    const { unmount } = renderizar();
    expect(screen.getByText(T.carregando)).toBeTruthy();
    unmount();
    mudar(() => {
      falso.status = { blocos: "erro" };
    });
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(1);
  });

  it("um Bloco que cita um Responsável arquivado mostra o aviso, como no Painel", () => {
    mudar(() => {
      falso.banco.responsaveis = (falso.banco.responsaveis as { id: string }[]).map((r) => (r.id === "r-lucas" ? { ...r, arquivado: true } : r));
    });
    renderizar();
    expect(screen.getByText("Cita Lucas (arquivado)")).toBeTruthy();
  });
});
