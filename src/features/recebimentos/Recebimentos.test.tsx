// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_RECEBIMENTOS as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Recebimentos } from "./Recebimentos";

// Recebimentos (História 6.5): os cartões por Bloco de cobrança, a lista "Ver" com a Seleção e o "Aplicar status". Os
// gerenciadores de Realtime são falsos (um "banco" por tabela que o teste muda e avisa, como um evento do Realtime) e o
// repositório de Pagamentos responde o que o teste manda. As contas (restante, Saldo, atraso) são do núcleo e têm os
// próprios testes: aqui se prova a fiação e o que Rafael vê.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  online: true,
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
    const novo = { status: falso.status[tabela] ?? "pronto", linhas: falso.banco[tabela] ?? [] };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  const useTabela = (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela), () => retrato(tabela));
  const g = () => ({ recarregar: falso.recarregar });
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useItensDoHistorico: () => useTabela("pagamento_itens"),
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    gerenciador: g,
    gerenciadorItensDoHistorico: g,
    gerenciadorTodosOsLancamentos: g,
  };
});

vi.mock("@/data/conexao", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useConexao: () =>
      useSyncExternalStore(
        (o) => {
          falso.ouvintes.add(o);
          return () => falso.ouvintes.delete(o);
        },
        () => falso.online,
        () => true,
      ),
  };
});

const repo = vi.hoisted(() => ({
  aplicar: vi.fn<(pedido: Record<string, unknown>) => Promise<unknown>>(),
  desfazer: vi.fn<(id: string) => Promise<unknown>>(),
  responsaveisDasLinhas: vi.fn<(ids: readonly string[]) => Promise<unknown>>(async () => []),
  linhasDoPagamento: vi.fn<(ids: readonly string[]) => Promise<unknown>>(async () => []),
  previaDoDesfazer: vi.fn<(id: string) => Promise<unknown>>(),
}));
vi.mock("@/data/pagamentos-repo", () => ({ repoPagamentos: () => repo }));

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const T0 = "2026-10-03T12:00:00.000000+00:00";
const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const resp = (id: string) => ({ tipo: "responsavel", id });
const rangelMaisMetadeDoCasal = {
  tipo: "operacao",
  operacao: "soma",
  esquerda: resp("rangel"),
  direita: {
    tipo: "grupo",
    interno: { tipo: "operacao", operacao: "divisao", esquerda: resp("casal"), direita: { tipo: "numero", valor: "2" } },
  },
};

let n = 0;
const lanc = (id: string, nome: string, responsavel: string, mes: string, valor: number, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  apelido: null,
  mes,
  valor_centavos: valor,
  responsavel_id: responsavel,
  tipo_id: "t-casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  fatura_id: "f1",
  ordem_fatura: ++n,
  created_at: T0,
  updated_at: T0,
  excluido_em: null,
  dividido_de_id: null,
  divisao: null,
  ajuste_de_id: null,
  conta_manual_id: null,
  parcela_n: null,
  parcela_total: null,
  ...extra,
});

function bloco(id: string, nome: string, formula: unknown, ordem: number, extra: Record<string, unknown> = {}) {
  return { id, nome, formula, ordem, de_cobranca: true, meu_bloco: false, created_at: T0, updated_at: T0, ...extra };
}

function dadosBase() {
  falso.banco = {
    responsaveis: [
      { id: "mae", nome: "Mãe", cor: 4, ordem: 1 },
      { id: "casal", nome: "Casal", cor: 2, ordem: 2 },
      { id: "rangel", nome: "Rangel", cor: 3, ordem: 3 },
      { id: "lucas", nome: "Lucas", cor: 5, ordem: 4 },
    ],
    status: [
      { id: NAO_PAGO, nome: "Não pago", conta_como_pago: false, arquivado: false },
      { id: PAGO, nome: "Pago", conta_como_pago: true, arquivado: false },
    ],
    faturas: [
      { id: "f0", mes: "2026-09", vencimento: "2026-09-06" },
      { id: "f1", mes: "2026-10", vencimento: "2026-10-06" },
    ],
    config_ciclo: [{ vigente_desde: "2026-01", created_at: T0, dia_fechamento: 1, dia_vencimento: 6 }],
    configuracoes: [{ tolerancia_atraso_dias: 10, status_padrao_id: NAO_PAGO }],
    blocos: [
      bloco("b-mae", "Mãe", resp("mae"), 1),
      bloco("b-lucas", "Lucas", resp("lucas"), 2),
      bloco("b-rangel", "Rangel", rangelMaisMetadeDoCasal, 3),
      bloco("b-meu", "Meu gasto", resp("rafael"), 4, { de_cobranca: false, meu_bloco: true }),
    ],
    lancamentos: [
      lanc("l1", "NETFLIX", "lucas", "2026-09", 10_000),
      lanc("l2", "SPOTIFY", "lucas", "2026-10", 5_000),
      lanc("l3", "FARMACIA", "mae", "2026-10", 3_000),
      lanc("l4", "MERCADO", "casal", "2026-10", 20_000),
      lanc("l5", "ACADEMIA", "rangel", "2026-10", 1_000),
      lanc("l6", "PAGO JA", "lucas", "2026-10", 7_000, { status_id: PAGO }),
    ],
    pagamento_itens: [],
    pagamentos: [],
  };
}

function mudar(f: () => void) {
  act(() => {
    f();
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

function renderizar() {
  return render(
    <ToastProvider>
      <Recebimentos />
    </ToastProvider>,
  );
}

const cartao = (nome: string) => screen.getByRole("heading", { level: 3, name: nome }).closest("li") as HTMLElement;
const textoDe = (el: HTMLElement) => sem(el.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 15/10/26: setembro (vence 06/09) já está atrasado desde 17/09; outubro (vence 06/10) só atrasa em 17/10.
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  vi.clearAllMocks();
  n = 0;
  falso.status = {};
  falso.online = true;
  falso.versao++;
  falso.ouvintes.clear();
  dadosBase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("os cartões por Bloco de cobrança (História 6.5, UX-DR22)", () => {
  it("um cartão por Bloco de cobrança, na ordem do Painel; o Bloco 'meu' sem cobrança não aparece", () => {
    renderizar();
    const nomes = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(nomes).toEqual(["Mãe", "Lucas", "Rangel"]);
    expect(screen.queryByRole("heading", { name: "Meu gasto" })).toBeNull();
  });

  it("o Saldo pendente é a Fórmula sobre o que falta, de todos os Meses: o Rangel aparece com a metade do Casal", () => {
    renderizar();
    expect(textoDe(cartao("Lucas"))).toContain("R$ 150,00");
    expect(textoDe(cartao("Mãe"))).toContain("R$ 30,00");
    // Rangel R$ 10,00 + Casal R$ 200,00 ÷ 2.
    expect(textoDe(cartao("Rangel"))).toContain("R$ 110,00");
  });

  it("o selo diz 'Atrasado' (com o dia), 'Não pago' ou 'Em dia', sempre em texto", () => {
    renderizar();
    const lucas = cartao("Lucas");
    expect(within(lucas).getByText("Atrasado")).toBeTruthy();
    expect(textoDe(lucas)).toContain("atrasado desde 17/09/26");
    expect(within(cartao("Mãe")).getByText("Não pago")).toBeTruthy();
    expect(within(cartao("Rangel")).getByText("Não pago")).toBeTruthy();
  });

  it("a linha de detalhe diz os Meses em aberto", () => {
    renderizar();
    expect(textoDe(cartao("Lucas"))).toContain("Em aberto: Set/26 e Out/26");
    expect(textoDe(cartao("Mãe"))).toContain("Em aberto: Out/26");
  });

  it("depois de 17/10, o Mês de outubro também atrasa (o 'hoje' é o do relógio de São Paulo)", () => {
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    renderizar();
    expect(within(cartao("Mãe")).getByText("Atrasado")).toBeTruthy();
    expect(textoDe(cartao("Mãe"))).toContain("atrasado desde 17/10/26");
  });

  it("no dia 16/10 (vencimento + tolerância) ainda está em dia: 'Não pago', não 'Atrasado'", () => {
    vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
    renderizar();
    expect(within(cartao("Mãe")).getByText("Não pago")).toBeTruthy();
  });

  it("'Cobrar pendências' é só a casca: desativado, com a dica (a mensagem é a História 6.7)", () => {
    renderizar();
    const botao = within(cartao("Lucas")).getByRole("button", { name: "Cobrar pendências de Lucas" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe(T.cobrar_em_breve);
  });

  it("um Pago parcialmente soma só o que falta (a pendência da 6.2)", () => {
    mudar(() => {
      falso.banco.pagamento_itens = [
        { id: "i1", pagamento_id: "p1", lancamento_id: "l2", mes: "2026-10", valor_centavos: 2_000, status_aplicado_id: null, excluido_em: null, created_at: T0, updated_at: T0 },
      ];
    });
    renderizar();
    expect(textoDe(cartao("Lucas"))).toContain("R$ 130,00");
  });

  it("o crédito de algo pago e depois excluído reduz o Saldo (AD-11)", () => {
    mudar(() => {
      falso.banco.lancamentos = [
        ...(falso.banco.lancamentos as Record<string, unknown>[]),
        lanc("l7", "ESTORNADO", "mae", "2026-08", 1_000, { status_id: PAGO, excluido_em: T0 }),
      ];
      falso.banco.pagamento_itens = [
        { id: "i1", pagamento_id: "p1", lancamento_id: "l7", mes: "2026-08", valor_centavos: 1_000, status_aplicado_id: PAGO, excluido_em: null, created_at: T0, updated_at: T0 },
      ];
    });
    renderizar();
    expect(textoDe(cartao("Mãe"))).toContain("R$ 20,00");
  });

  it("um Pagamento novo (outro aparelho) muda os cartões sozinho", () => {
    renderizar();
    expect(textoDe(cartao("Mãe"))).toContain("R$ 30,00");
    mudar(() => {
      falso.banco.lancamentos = (falso.banco.lancamentos as { id: string }[]).map((l) => (l.id === "l3" ? { ...l, status_id: PAGO } : l));
    });
    expect(within(cartao("Mãe")).getByText("Em dia")).toBeTruthy();
    expect(textoDe(cartao("Mãe"))).toContain("R$ 0,00");
    expect(textoDe(cartao("Mãe"))).toContain(T.nada_em_aberto);
  });
});

describe("estados", () => {
  it("sem Blocos de cobrança: 'Marque em Configurações quais Blocos aparecem aqui', com o atalho", () => {
    mudar(() => {
      falso.banco.blocos = [bloco("b-meu", "Meu gasto", resp("rafael"), 1, { de_cobranca: false, meu_bloco: true })];
    });
    renderizar();
    expect(screen.getByText("Marque em Configurações quais Blocos aparecem aqui")).toBeTruthy();
    const atalho = screen.getByRole("link", { name: "Abrir Configurações" });
    expect(atalho.getAttribute("href")).toBe("/configuracoes?secao=cobranca");
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("sem nenhum Bloco também", () => {
    mudar(() => {
      falso.banco.blocos = [];
    });
    renderizar();
    expect(screen.getByText("Marque em Configurações quais Blocos aparecem aqui")).toBeTruthy();
  });

  it("carregando: esqueleto, nunca tela branca nem um Saldo com a regra errada", () => {
    mudar(() => {
      falso.status = { lancamentos: "carregando" };
    });
    renderizar();
    expect(screen.getByText(T.carregando)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("os itens de Pagamento ainda lendo: espera (sem eles um parcial apareceria com o valor cheio)", () => {
    mudar(() => {
      falso.status = { pagamento_itens: "carregando" };
    });
    renderizar();
    expect(screen.getByText(T.carregando)).toBeTruthy();
  });

  it("erro: 'Tentar de novo' relê as tabelas", async () => {
    mudar(() => {
      falso.status = { lancamentos: "erro" };
    });
    renderizar();
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Tentar de novo" })[0]!);
    expect(falso.recarregar).toHaveBeenCalled();
  });

  it("o Histórico de Pagamentos continua abaixo, independente dos cartões", () => {
    renderizar();
    expect(screen.getByRole("heading", { name: "Histórico de Pagamentos" })).toBeTruthy();
  });
});

describe("'Ver': a lista dos Lançamentos em aberto", () => {
  const ver = async (u: ReturnType<typeof userEvent.setup>, nome: string) => {
    await u.click(within(cartao(nome)).getByRole("button", { name: `Ver os lançamentos em aberto de ${nome}` }));
    return screen.getByRole("region", { name: `Em aberto · ${nome}` });
  };

  it("agrupa por Mês (o mais novo primeiro) com o que falta de cada linha", async () => {
    renderizar();
    const lista = await ver(userEvent.setup(), "Lucas");
    const meses = within(lista).getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(meses).toEqual(["Outubro/26 · 1 lançamento", "Setembro/26 · 1 lançamento"]);
    expect(within(lista).getByRole("checkbox", { name: /^Marcar SPOTIFY/ })).toBeTruthy();
    expect(within(lista).getByRole("checkbox", { name: /^Marcar NETFLIX/ })).toBeTruthy();
    // Só o que está em aberto: o pago não aparece.
    expect(within(lista).queryByText("PAGO JA")).toBeNull();
    expect(within(lista).getAllByText("Atrasado")).toHaveLength(1);
  });

  it("um Pago parcialmente mostra o selo e 'falta R$ X'", async () => {
    mudar(() => {
      falso.banco.pagamento_itens = [
        { id: "i1", pagamento_id: "p1", lancamento_id: "l2", mes: "2026-10", valor_centavos: 2_000, status_aplicado_id: null, excluido_em: null, created_at: T0, updated_at: T0 },
      ];
    });
    renderizar();
    const lista = await ver(userEvent.setup(), "Lucas");
    expect(within(lista).getByText("Pago parcialmente")).toBeTruthy();
    expect(sem(lista.textContent)).toContain("falta R$ 30,00");
  });

  it("o cartão do Bloco aberto fica marcado e o mesmo botão fecha a lista", async () => {
    renderizar();
    const u = userEvent.setup();
    await ver(u, "Lucas");
    const botao = within(cartao("Lucas")).getByRole("button", { name: "Ver os lançamentos em aberto de Lucas" });
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    await u.click(botao);
    expect(screen.queryByRole("region", { name: "Em aberto · Lucas" })).toBeNull();
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("abrir a lista de outro Bloco limpa a Seleção (ela é de uma lista só)", async () => {
    renderizar();
    const u = userEvent.setup();
    const lista = await ver(u, "Lucas");
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar SPOTIFY/ }));
    expect(screen.getByRole("region", { name: "Ações da seleção" })).toBeTruthy();
    const outra = await ver(u, "Mãe");
    expect((within(outra).getByRole("checkbox", { name: /^Marcar FARMACIA/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("region", { name: "Ações da seleção" })).toBeNull();
  });

  it("tudo pago: 'Nada em aberto'", async () => {
    mudar(() => {
      falso.banco.lancamentos = (falso.banco.lancamentos as { id: string }[]).map((l) => ({ ...l, status_id: PAGO }));
    });
    renderizar();
    const lista = await ver(userEvent.setup(), "Mãe");
    expect(within(lista).getByText("Nada em aberto")).toBeTruthy();
    expect(within(lista).queryByRole("checkbox")).toBeNull();
  });

  it("a Seleção junta Meses: a barra diz 'N selecionados · R$ total' (o restante) e só tem 'Limpar' e 'Aplicar status'", async () => {
    renderizar();
    const u = userEvent.setup();
    const lista = await ver(u, "Lucas");
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar SPOTIFY/ }));
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar NETFLIX/ }));
    const barra = screen.getByRole("region", { name: "Ações da seleção" });
    expect(sem(barra.textContent)).toContain("2 selecionados · R$ 150,00");
    expect(within(barra).getAllByRole("button").map((b) => b.textContent)).toEqual(["Limpar", "Aplicar status"]);
    await u.click(within(barra).getByRole("button", { name: "Limpar" }));
    expect(screen.queryByRole("region", { name: "Ações da seleção" })).toBeNull();
  });

  it("'Selecionar todos' marca todas as linhas da lista, e de novo desmarca", async () => {
    renderizar();
    const u = userEvent.setup();
    const lista = await ver(u, "Lucas");
    await u.click(within(lista).getByRole("checkbox", { name: "Selecionar todos" }));
    expect(sem(screen.getByRole("region", { name: "Ações da seleção" }).textContent)).toContain("2 selecionados · R$ 150,00");
    await u.click(within(lista).getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.queryByRole("region", { name: "Ações da seleção" })).toBeNull();
  });

  it("o Ajuste de centavos fica sob a parcela, sem caixa, e entra no total junto com ela", async () => {
    mudar(() => {
      falso.banco.lancamentos = [
        ...(falso.banco.lancamentos as Record<string, unknown>[]),
        lanc("l8", "AJUSTE", "lucas", "2026-10", -8, { ajuste_de_id: "l2" }),
      ];
    });
    renderizar();
    const u = userEvent.setup();
    const lista = await ver(u, "Lucas");
    expect(within(lista).queryByRole("checkbox", { name: /Marcar AJUSTE/ })).toBeNull();
    expect(sem(lista.textContent)).toContain("↳ Ajuste: AJUSTE");
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar SPOTIFY/ }));
    expect(sem(screen.getByRole("region", { name: "Ações da seleção" }).textContent)).toContain("1 selecionado · R$ 49,92");
  });
});

describe("'Aplicar status' em Recebimentos (a janela e o Pagamento são os da 6.1 e 6.2)", () => {
  const abrirComDuas = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(within(cartao("Lucas")).getByRole("button", { name: "Ver os lançamentos em aberto de Lucas" }));
    const lista = screen.getByRole("region", { name: "Em aberto · Lucas" });
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar SPOTIFY/ }));
    await u.click(within(lista).getByRole("checkbox", { name: /^Marcar NETFLIX/ }));
    await u.click(within(screen.getByRole("region", { name: "Ações da seleção" })).getByRole("button", { name: "Aplicar status" }));
    return screen.findByRole("dialog", { name: "Aplicar status" });
  };

  it("só oferece os Status que contam como pago", async () => {
    renderizar();
    const janela = await abrirComDuas(userEvent.setup());
    const lista = within(janela).getByRole("radiogroup", { name: "Status a aplicar" });
    expect(within(lista).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Pago"]);
    expect(sem(janela.textContent)).toContain("2 selecionados · R$ 150,00");
  });

  it("manda o pedido do núcleo (os mais antigos primeiro, o restante de cada linha, a data de hoje em São Paulo)", async () => {
    repo.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirComDuas(u);
    await u.click(within(janela).getByRole("radio", { name: "Pago" }));
    expect((within(janela).getByLabelText("Data do pagamento") as HTMLInputElement).value).toBe("2026-10-15");
    expect((within(janela).getByLabelText("Valor recebido") as HTMLInputElement).value).toBe("150,00");
    await u.click(within(janela).getByRole("button", { name: "Aplicar" }));
    expect(repo.aplicar).toHaveBeenCalledTimes(1);
    const pedido = repo.aplicar.mock.calls[0]![0] as { modo: string; valor_recebido_centavos: number; status_id: string; itens: { lancamento_id: string; valor_centavos: number }[] };
    expect(pedido).toMatchObject({ modo: "total", valor_recebido_centavos: 15_000, status_id: PAGO });
    expect(pedido.itens.map((i) => [i.lancamento_id, i.valor_centavos])).toEqual([
      ["l1", 10_000],
      ["l2", 5_000],
    ]);
  });

  it("o Pagamento sai dos cartões na hora, avisa e o 'Desfazer' desfaz", async () => {
    repo.aplicar.mockImplementationOnce(async () => {
      mudar(() => {
        falso.banco.lancamentos = (falso.banco.lancamentos as { id: string }[]).map((l) => (l.id === "l1" || l.id === "l2" ? { ...l, status_id: PAGO } : l));
      });
      return { ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] };
    });
    repo.desfazer.mockResolvedValueOnce({ ok: true });
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirComDuas(u);
    await u.click(within(janela).getByRole("radio", { name: "Pago" }));
    await u.click(within(janela).getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByText("2 lançamentos marcados como pagos")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Aplicar status" })).toBeNull();
    // Os cartões e a lista seguem o dado: Lucas fica em dia, a Seleção esvazia sozinha.
    expect(within(cartao("Lucas")).getByText("Em dia")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Em aberto · Lucas" })).getByText("Nada em aberto")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Ações da seleção" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repo.desfazer).toHaveBeenCalledWith("pg-novo");
  });

  it("valor menor que o total pede a escolha e 'Fica pendente' manda um Pagamento parcial", async () => {
    repo.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirComDuas(u);
    await u.click(within(janela).getByRole("radio", { name: "Pago" }));
    const valor = within(janela).getByLabelText("Valor recebido");
    await u.clear(valor);
    await u.type(valor, "100,00");
    expect(sem(janela.textContent)).toContain("O que fazer com a diferença de R$ 50,00?");
    await u.click(within(janela).getByRole("radio", { name: /Fica pendente/ }));
    await u.click(within(janela).getByRole("button", { name: "Aplicar" }));
    const pedido = repo.aplicar.mock.calls[0]![0] as { modo: string; itens: { lancamento_id: string; valor_centavos: number; quita: boolean }[] };
    expect(pedido.modo).toBe("parcial");
    // Os R$ 100,00 quitam o mais antigo (Set/26); o outro fica sem sobra e não entra no Pagamento.
    expect(pedido.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([["l1", 10_000, true]]);
    expect(await screen.findByText(/Pagamento parcial registrado: R\$\s100,00/)).toBeTruthy();
  });

  it("erro do banco: a janela fica aberta com o texto e a Seleção também", async () => {
    repo.aplicar.mockResolvedValueOnce({ ok: false, codigo: "pagamento.mudou" });
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirComDuas(u);
    await u.click(within(janela).getByRole("radio", { name: "Pago" }));
    await u.click(within(janela).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Aplicar status" })).getByRole("alert")).toBeTruthy());
    // A janela é modal (o resto fica oculto ao leitor de tela), mas a Seleção segue no DOM.
    expect(screen.getByRole("region", { name: "Ações da seleção", hidden: true })).toBeTruthy();
  });

  it("sem conexão 'Aplicar status' fica desativado (AD-3)", async () => {
    renderizar();
    const u = userEvent.setup();
    await u.click(within(cartao("Lucas")).getByRole("button", { name: "Ver os lançamentos em aberto de Lucas" }));
    await u.click(within(screen.getByRole("region", { name: "Em aberto · Lucas" })).getByRole("checkbox", { name: /^Marcar SPOTIFY/ }));
    mudar(() => {
      falso.online = false;
    });
    expect((within(screen.getByRole("region", { name: "Ações da seleção" })).getByRole("button", { name: "Aplicar status" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sem nenhum Status que conte como pago, a lista avisa o que fazer", async () => {
    mudar(() => {
      falso.banco.status = [{ id: NAO_PAGO, nome: "Não pago", conta_como_pago: false, arquivado: false }];
    });
    renderizar();
    await userEvent.setup().click(within(cartao("Lucas")).getByRole("button", { name: "Ver os lançamentos em aberto de Lucas" }));
    expect(screen.getByText(T.sem_status_pago)).toBeTruthy();
  });
});
