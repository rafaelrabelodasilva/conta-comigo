// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui/Toast";
import { BlocosDoMes } from "./BlocosDoMes";

// Realtime e repositório são falsos: um "banco" por tabela que avisa as telas
// (como o evento do Realtime), e o repositório de Blocos só registra o pedido.
const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  statusBlocos: "pronto" as string,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (tabela: string) => {
    const guardado = cache.get(tabela);
    if (guardado && guardado.versao === falso.versao) return guardado.retrato;
    const novo = {
      status: tabela === "blocos" ? falso.statusBlocos : "pronto",
      linhas: falso.banco[tabela] ?? [],
    };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  return {
    useLinhas: (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela)),
    gerenciador: () => ({ recarregar: falso.recarregar }),
  };
});

const repo = vi.hoisted(() => ({
  salvar: vi.fn<(pedido: Record<string, unknown>) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
  excluir: vi.fn<(id: string) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
  reordenar: vi.fn<(ids: string[]) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
}));
vi.mock("@/data/blocos-repo", () => ({ repoBlocos: () => repo }));

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const MES = "2026-11";
const responsaveis = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  { id: "r-velho", nome: "Antigo", cor: 3, ordem: 3, arquivado: true },
];
const tipos = [{ id: "t-casa", nome: "Casa", arquivado: false }];

let seq = 0;
const lanc = (extra: Record<string, unknown> = {}) => {
  seq++;
  return {
    id: `l${seq}`,
    mes: MES,
    excluido_em: null,
    valor_centavos: 10_000,
    responsavel_id: "r-casal",
    tipo_id: "t-casa",
    lancado_por: "fatura",
    ...extra,
  } as never;
};

const formulaCasal = { tipo: "responsavel", id: "r-casal" };
const formulaRangel = {
  tipo: "operacao",
  operacao: "soma",
  esquerda: { tipo: "responsavel", id: "r-rafael" },
  direita: {
    tipo: "grupo",
    interno: {
      tipo: "operacao",
      operacao: "divisao",
      esquerda: { tipo: "responsavel", id: "r-casal" },
      direita: { tipo: "numero", valor: "2" },
    },
  },
};
const bloco = (id: string, nome: string, ordem: number, formula: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  owner_id: "dono",
  nome,
  formula,
  ordem,
  de_cobranca: false,
  meu_bloco: false,
  created_at: "2026-11-15T12:00:00+00:00",
  updated_at: "2026-11-15T12:00:00+00:00",
  ...extra,
});

function definir(blocos: unknown[], status = "pronto") {
  falso.banco = { blocos, responsaveis, tipos };
  falso.statusBlocos = status;
  falso.versao++;
}

function mudarBanco(tabela: string, mudar: (linhas: unknown[]) => unknown[]) {
  act(() => {
    falso.banco = { ...falso.banco, [tabela]: mudar(falso.banco[tabela] ?? []) };
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

function renderizar(linhas: unknown[] = [lanc()], mes = MES) {
  return render(<BlocosDoMes linhas={linhas as never} mes={mes} />, { wrapper: ToastProvider });
}

const cartao = () => screen.getByRole("region", { name: "Blocos" });
const cartaoDoBloco = (nome: string) => {
  const li = within(cartao())
    .getAllByRole("listitem")
    .find((l) => l.querySelector(".truncate")?.textContent === nome);
  if (!li) throw new Error(`sem cartão ${nome}`);
  return li;
};
const nomesNaOrdem = () => within(cartao()).getAllByRole("listitem").map((l) => l.getAttribute("data-bloco-id"));

beforeEach(() => {
  seq = 0;
  falso.recarregar.mockReset();
  repo.salvar.mockClear().mockResolvedValue({ ok: true });
  repo.excluir.mockClear().mockResolvedValue({ ok: true });
  repo.reordenar.mockClear().mockResolvedValue({ ok: true });
  definir([]);
});

describe("block-card (UX-DR8)", () => {
  it("mostra bolinha da pessoa, valor, Fórmula legível e os botões ⋯ e 💬", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar([lanc({ valor_centavos: 563_935 })]);
    const card = cartaoDoBloco("Casal");
    expect(sem(card.textContent)).toContain("R$ 5.639,35");
    // Um Responsável só: a bolinha na cor dele.
    expect(card.querySelector("[aria-hidden].bg-person-2")).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Ações do Bloco Casal" })).toBeTruthy();
  });

  it("Fórmula de duas pessoas: sem bolinha, com os parênteses como montados", () => {
    definir([bloco("b1", "Rangel", 1, formulaRangel)]);
    renderizar([lanc({ valor_centavos: 563_935 })]);
    const card = cartaoDoBloco("Rangel");
    expect(within(card).getByText("Rafael + (Casal ÷ 2)")).toBeTruthy();
    expect(card.querySelector("[class*='bg-person-']")).toBeNull();
    // Rafael R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68
    expect(sem(card.textContent)).toContain("R$ 2.819,68");
  });

  it("o 💬 só existe, desativado, e o VoiceOver lê 'Gerar mensagem do Bloco {nome}'", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    const botao = within(cartaoDoBloco("Casal")).getByRole("button", { name: "Gerar mensagem do Bloco Casal" });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(botao);
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("sem Blocos: convida a criar o primeiro", () => {
    renderizar();
    expect(within(cartao()).getByText("Crie seu primeiro Bloco para ver os totais por pessoa")).toBeTruthy();
    expect((within(cartao()).getByRole("button", { name: /Novo bloco/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("'inclui previstos' só no Bloco em que um previsto entra", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal), bloco("b2", "Rafael", 2, { tipo: "responsavel", id: "r-rafael" })]);
    renderizar([
      lanc({ responsavel_id: "r-casal", lancado_por: "sistema" }),
      lanc({ responsavel_id: "r-rafael", lancado_por: "fatura" }),
    ]);
    expect(within(cartaoDoBloco("Casal")).getByText("inclui previstos")).toBeTruthy();
    expect(within(cartaoDoBloco("Rafael")).queryByText("inclui previstos")).toBeNull();
  });

  it("Fórmula que cita cadastro arquivado: o cartão avisa e o valor segue", () => {
    definir([bloco("b1", "Antigo", 1, { tipo: "responsavel", id: "r-velho" })]);
    renderizar([lanc({ responsavel_id: "r-velho", valor_centavos: 2_000 })]);
    const card = cartaoDoBloco("Antigo");
    expect(within(card).getByText("Cita Antigo (arquivado)")).toBeTruthy();
    expect(sem(card.textContent)).toContain("R$ 20,00");
  });

  it("valor que não cabe nos números: '—', sem lançar", () => {
    definir([
      bloco("b1", "Enorme", 1, {
        tipo: "operacao",
        operacao: "multiplicacao",
        esquerda: formulaCasal,
        direita: { tipo: "numero", valor: "999999999" },
      }),
    ]);
    renderizar([lanc({ valor_centavos: Number.MAX_SAFE_INTEGER })]);
    expect(within(cartaoDoBloco("Enorme")).getByText("—")).toBeTruthy();
  });
});

describe("tempo real (NFR5)", () => {
  it("o valor muda no lugar quando os Lançamentos mudam, sem esqueleto nem recarregar", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    const l = lanc({ id: "x", valor_centavos: 10_000 });
    const { rerender } = renderizar([l]);
    expect(sem(cartaoDoBloco("Casal").textContent)).toContain("R$ 100,00");
    rerender(<BlocosDoMes linhas={[{ ...(l as object), valor_centavos: 25_050 }] as never} mes={MES} />);
    expect(sem(cartaoDoBloco("Casal").textContent)).toContain("R$ 250,50");
    expect(screen.queryByRole("status", { busy: true })).toBeNull();
    expect(falso.recarregar).not.toHaveBeenCalled();
  });

  it("um Bloco novo (ou apagado) em outro aparelho entra (ou sai) da lista sem recarregar", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    mudarBanco("blocos", (ls) => [...ls, bloco("b2", "Rafael", 2, { tipo: "responsavel", id: "r-rafael" })]);
    expect(nomesNaOrdem()).toEqual(["b1", "b2"]);
    mudarBanco("blocos", (ls) => ls.filter((b) => (b as { id: string }).id !== "b1"));
    expect(nomesNaOrdem()).toEqual(["b2"]);
  });

  it("a ordem muda em outro aparelho e o cartão reordena", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal), bloco("b2", "Rafael", 2, { tipo: "responsavel", id: "r-rafael" })]);
    renderizar();
    mudarBanco("blocos", (ls) =>
      ls.map((b) => ({ ...(b as { id: string }), ordem: (b as { id: string }).id === "b1" ? 2 : 1 })),
    );
    expect(nomesNaOrdem()).toEqual(["b2", "b1"]);
  });
});

describe("carregando e erro", () => {
  it("primeira leitura: esqueleto no cartão e o botão espera", () => {
    definir([], "carregando");
    renderizar();
    expect(within(cartao()).getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(within(cartao()).queryByText("Crie seu primeiro Bloco para ver os totais por pessoa")).toBeNull();
    expect((within(cartao()).getByRole("button", { name: /Novo bloco/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("falha de leitura: o cartão avisa e 'Tentar de novo' relê os Blocos", async () => {
    definir([], "erro");
    renderizar();
    expect(within(cartao()).getByText("Não foi possível carregar os Blocos.")).toBeTruthy();
    await userEvent.setup().click(within(cartao()).getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(1);
  });
});

describe("menu ⋯", () => {
  async function abrirMenu(nome: string) {
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco(nome)).getByRole("button", { name: `Ações do Bloco ${nome}` }));
    return u;
  }

  it("oferece Editar fórmula, Ver cálculo, Reordenar e Excluir bloco", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal), bloco("b2", "Rafael", 2, formulaCasal)]);
    renderizar();
    await abrirMenu("Casal");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Editar fórmula",
      "Ver cálculo",
      "Reordenar",
      "Excluir bloco",
    ]);
  });

  it("toque longo no cartão abre o mesmo menu (clique direito no teste)", () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    fireEvent.contextMenu(cartaoDoBloco("Casal").querySelector("b") as HTMLElement);
    expect(screen.getByRole("menuitem", { name: "Editar fórmula" })).toBeTruthy();
  });

  it("Editar fórmula abre o Montador com o Bloco; salvar manda o p_id e mantém a ordem", async () => {
    definir([bloco("b1", "Primeiro", 1, formulaCasal), bloco("b2", "Rangel", 2, formulaRangel, { de_cobranca: true })]);
    renderizar([lanc({ valor_centavos: 563_935 })]);
    const u = await abrirMenu("Rangel");
    await u.click(screen.getByRole("menuitem", { name: "Editar fórmula" }));
    const janela = await screen.findByRole("dialog", { name: "Editar bloco" });
    expect((within(janela).getByLabelText("Nome") as HTMLInputElement).value).toBe("Rangel");
    expect(within(janela).getByRole("button", { name: "Remover Rafael" })).toBeTruthy();
    // Renomear entra em Editar.
    const nome = within(janela).getByLabelText("Nome");
    await u.clear(nome);
    await u.type(nome, "Rangel 2");
    await u.click(within(janela).getByRole("button", { name: "Salvar" }));
    expect(repo.salvar).toHaveBeenCalledOnce();
    expect(repo.salvar.mock.calls[0][0]).toMatchObject({
      p_id: "b2",
      p_nome: "Rangel 2",
      p_formula: formulaRangel,
      p_ordem: 2,
      p_de_cobranca: true,
    });
    expect(await screen.findByText("Bloco salvo")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Editar bloco" })).toBeNull();
  });

  it("Ver cálculo: Montador só leitura, com o passo a passo e o mesmo número do cartão", async () => {
    definir([bloco("b1", "Rangel", 1, formulaRangel)]);
    renderizar([lanc({ valor_centavos: 563_935 })]);
    const doCartao = sem(within(cartaoDoBloco("Rangel")).getByText(/^R\$ /, { selector: "b" }).textContent);
    const u = await abrirMenu("Rangel");
    await u.click(screen.getByRole("menuitem", { name: "Ver cálculo" }));
    const janela = await screen.findByRole("dialog", { name: "Cálculo do bloco" });
    expect(sem(janela.textContent)).toContain("Rafael R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68");
    expect(sem(within(janela).getByText(/^R\$ /, { selector: "b" }).textContent)).toBe(doCartao);
    // Só leitura: nada de paleta, de campo nem de Salvar.
    expect(within(janela).queryByLabelText("Nome")).toBeNull();
    expect(within(janela).queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(within(janela).queryByRole("button", { name: "Casal" })).toBeNull();
    // O ✕ da janela e o "Fechar" do rodapé têm o mesmo nome: o do rodapé é o último.
    await u.click(within(janela).getAllByRole("button", { name: "Fechar" }).at(-1) as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Cálculo do bloco" })).toBeNull();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o Bloco apagado em outro aparelho fecha a janela que o abria", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    const u = await abrirMenu("Casal");
    await u.click(screen.getByRole("menuitem", { name: "Ver cálculo" }));
    await screen.findByRole("dialog", { name: "Cálculo do bloco" });
    mudarBanco("blocos", () => []);
    expect(screen.queryByRole("dialog", { name: "Cálculo do bloco" })).toBeNull();
  });
});

describe("Excluir bloco", () => {
  it("pede confirmação e, ao confirmar, exclui e avisa", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco("Casal")).getByRole("button", { name: "Ações do Bloco Casal" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir bloco" }));
    const aviso = await screen.findByRole("alertdialog");
    expect(within(aviso).getByText("Excluir bloco?")).toBeTruthy();
    expect(within(aviso).queryByText(/Recebimentos/)).toBeNull();
    expect(repo.excluir).not.toHaveBeenCalled();
    await u.click(within(aviso).getByRole("button", { name: "Excluir bloco" }));
    expect(repo.excluir).toHaveBeenCalledWith("b1");
    expect(await screen.findByText("Bloco excluído")).toBeTruthy();
  });

  it("Bloco de cobrança avisa 'Este Bloco aparece em Recebimentos'", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal, { de_cobranca: true })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco("Casal")).getByRole("button", { name: "Ações do Bloco Casal" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir bloco" }));
    const aviso = await screen.findByRole("alertdialog");
    expect(within(aviso).getByText(/Este Bloco aparece em Recebimentos/)).toBeTruthy();
  });

  it("Cancelar não exclui", async () => {
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco("Casal")).getByRole("button", { name: "Ações do Bloco Casal" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir bloco" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(repo.excluir).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("falha na exclusão: avisa com o texto do mapa único", async () => {
    repo.excluir.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    definir([bloco("b1", "Casal", 1, formulaCasal)]);
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco("Casal")).getByRole("button", { name: "Ações do Bloco Casal" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir bloco" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir bloco" }));
    expect(await screen.findByText(/conexão/i)).toBeTruthy();
  });
});

describe("Reordenar", () => {
  const tres = () =>
    definir([
      bloco("b1", "Um", 1, formulaCasal),
      bloco("b2", "Dois", 2, { tipo: "responsavel", id: "r-rafael" }),
      bloco("b3", "Três", 3, { tipo: "todos" }),
    ]);

  it("o botão 'Reordenar' vira 'Concluir', os cartões ganham alça e mover, e o resto some", async () => {
    tres();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    expect(within(cartao()).getByRole("button", { name: "Concluir" })).toBeTruthy();
    for (const li of within(cartao()).getAllByRole("listitem")) {
      expect(li.className).toContain("bloco-tremendo");
      expect(within(li).queryByRole("button", { name: /^Ações do Bloco/ })).toBeNull();
    }
    expect(within(cartaoDoBloco("Um")).getByRole("button", { name: "Arrastar o Bloco Um" })).toBeTruthy();
    expect((within(cartao()).getByRole("button", { name: /Novo bloco/ }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(within(cartao()).getByRole("button", { name: "Concluir" }));
    expect(within(cartao()).getByRole("button", { name: "Reordenar" })).toBeTruthy();
    expect(within(cartaoDoBloco("Um")).getByRole("button", { name: "Ações do Bloco Um" })).toBeTruthy();
  });

  it("o item 'Reordenar' do menu ⋯ liga o modo", async () => {
    tres();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartaoDoBloco("Dois")).getByRole("button", { name: "Ações do Bloco Dois" }));
    await u.click(screen.getByRole("menuitem", { name: "Reordenar" }));
    expect(within(cartao()).getByRole("button", { name: "Concluir" })).toBeTruthy();
  });

  it("mover para depois grava a ordem nova; o primeiro não anda para antes", async () => {
    tres();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    expect((within(cartaoDoBloco("Um")).getByRole("button", { name: "Mover o Bloco Um para antes" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cartaoDoBloco("Três")).getByRole("button", { name: "Mover o Bloco Três para depois" }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(within(cartaoDoBloco("Um")).getByRole("button", { name: "Mover o Bloco Um para depois" }));
    expect(repo.reordenar).toHaveBeenCalledWith(["b2", "b1", "b3"]);
  });

  it("arrastar pela alça sobre outro cartão grava a ordem solta", async () => {
    tres();
    renderizar();
    await userEvent.setup().click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    // O jsdom não tem layout: cada cartão ocupa uma faixa de 100 px na vertical.
    within(cartao())
      .getAllByRole("listitem")
      .forEach((li, i) => {
        li.getBoundingClientRect = () => ({ left: 0, right: 100, top: i * 100, bottom: i * 100 + 100, width: 100, height: 100, x: 0, y: i * 100, toJSON: () => ({}) });
      });
    const alca = within(cartaoDoBloco("Um")).getByRole("button", { name: "Arrastar o Bloco Um" });
    fireEvent.pointerDown(alca, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(alca, { pointerId: 1, clientX: 50, clientY: 250 });
    // Durante o arrasto o cartão já aparece na posição nova, e nada foi gravado.
    expect(nomesNaOrdem()).toEqual(["b2", "b3", "b1"]);
    expect(repo.reordenar).not.toHaveBeenCalled();
    fireEvent.pointerUp(alca, { pointerId: 1, clientX: 50, clientY: 250 });
    expect(repo.reordenar).toHaveBeenCalledWith(["b2", "b3", "b1"]);
  });

  it("o sistema cancelar o arrasto (pointercancel) volta à ordem de antes sem gravar", async () => {
    tres();
    renderizar();
    await userEvent.setup().click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    within(cartao())
      .getAllByRole("listitem")
      .forEach((li, i) => {
        li.getBoundingClientRect = () => ({ left: 0, right: 100, top: i * 100, bottom: i * 100 + 100, width: 100, height: 100, x: 0, y: i * 100, toJSON: () => ({}) });
      });
    const alca = within(cartaoDoBloco("Um")).getByRole("button", { name: "Arrastar o Bloco Um" });
    fireEvent.pointerDown(alca, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(alca, { pointerId: 1, clientX: 50, clientY: 150 });
    expect(nomesNaOrdem()).toEqual(["b2", "b1", "b3"]);
    fireEvent.pointerCancel(alca, { pointerId: 1 });
    expect(nomesNaOrdem()).toEqual(["b1", "b2", "b3"]);
    expect(repo.reordenar).not.toHaveBeenCalled();
  });

  it("soltar no mesmo lugar não grava", async () => {
    tres();
    renderizar();
    await userEvent.setup().click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    const alca = within(cartaoDoBloco("Um")).getByRole("button", { name: "Arrastar o Bloco Um" });
    fireEvent.pointerDown(alca, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(alca, { pointerId: 1, clientX: 5, clientY: 5 });
    expect(repo.reordenar).not.toHaveBeenCalled();
  });

  it("falha ao gravar a ordem: avisa", async () => {
    repo.reordenar.mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" });
    tres();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartao()).getByRole("button", { name: "Reordenar" }));
    await u.click(within(cartaoDoBloco("Um")).getByRole("button", { name: "Mover o Bloco Um para depois" }));
    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
  });

  it("com um Bloco só, não há Reordenar", () => {
    definir([bloco("b1", "Um", 1, formulaCasal)]);
    renderizar();
    expect(within(cartao()).queryByRole("button", { name: "Reordenar" })).toBeNull();
  });
});

describe("Novo bloco", () => {
  it("abre o Montador sobre o Mês aberto", async () => {
    renderizar([lanc({ valor_centavos: 563_935 })]);
    const u = userEvent.setup();
    await u.click(within(cartao()).getByRole("button", { name: /Novo bloco/ }));
    const janela = await screen.findByRole("dialog", { name: "Novo bloco" });
    await u.click(within(janela).getByRole("button", { name: "Casal" }));
    expect(sem(janela.textContent)).toContain("R$ 5.639,35");
  });
});
