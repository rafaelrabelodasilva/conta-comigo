// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlocosDoMes } from "@/features/painel/BlocosDoMes";
import { TEXTOS_PREVISAO as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Previsao, CHAVE_DA_ABA_DA_PREVISAO } from "./Previsao";

// Previsão (História 7.1): as abas, "Próximos meses" (as barras, a tabela, o seletor, as Séries, os estados) e o total de
// um Mês futuro igual ao Bloco "Todos" do Painel. Os gerenciadores de Realtime são falsos (um "banco" por tabela que o
// teste muda e avisa, como um evento do Realtime). As contas são do núcleo (`previsao.test.ts`); aqui se prova a fiação e
// o que Rafael vê. Hoje é 19/11/26: o Mês atual é 2026-11 e a janela vai de Dez/26 a Mai/27.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
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
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    gerenciador: g,
    gerenciadorTodosOsLancamentos: g,
  };
});

vi.mock("@/ui/use-hoje", () => ({ useHoje: () => "2026-11-19" }));

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const RESPONSAVEIS = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  { id: "r-antiga", nome: "Antiga", cor: 4, ordem: 4, arquivado: true },
];
const TIPOS = [
  { id: "t-casa", nome: "Casa", arquivado: false },
  { id: "t-bobicas", nome: "Bobiças", arquivado: false },
];

let n = 0;
const lanc = (mes: string, valor: number, extra: Record<string, unknown> = {}) =>
  ({
    id: `l${++n}`,
    mes,
    excluido_em: null,
    valor_centavos: valor,
    responsavel_id: "r-rafael",
    tipo_id: "t-casa",
    dividido_de_id: null,
    divisao: null,
    ajuste_de_id: null,
    lancado_por: "sistema",
    conta_manual_id: null,
    vencimento_combinado: null,
    nome: "MSC CRUZEIROS",
    apelido: null,
    serie_id: null,
    parcela_n: null,
    parcela_total: null,
    ...extra,
  }) as never;

function definir(lancamentos: unknown[], extra: Record<string, unknown[]> = {}) {
  falso.banco = { lancamentos, faturas: [], responsaveis: RESPONSAVEIS, tipos: TIPOS, blocos: [], ...extra };
  falso.status = {};
  falso.versao++;
}

function mudarBanco(tabela: string, mudar: (linhas: unknown[]) => unknown[]) {
  act(() => {
    falso.banco = { ...falso.banco, [tabela]: mudar(falso.banco[tabela] ?? []) };
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

/** Dez/26: um previsto da Série (Rafael) e uma Conta manual (Casal). Jan/27: só o previsto. */
const BASICO = () => [
  lanc("2026-12", 114074, { serie_id: "s-msc", parcela_n: 2, parcela_total: 12 }),
  lanc("2026-12", 20000, { lancado_por: "manual", conta_manual_id: "c1", responsavel_id: "r-casal", tipo_id: "t-bobicas", nome: "Academia" }),
  lanc("2027-01", 114074, { serie_id: "s-msc", parcela_n: 3, parcela_total: 12 }),
];

const tabela = () => screen.getByRole("table", { name: T.tabela });
const linhaDa = (nome: string) => within(tabela()).getByRole("row", { name: new RegExp(nome) });
const celulas = (linha: HTMLElement) => within(linha).getAllByRole("cell").map((c) => sem(c.textContent));
const grafico = () => screen.getByRole("list", { name: T.grafico });

beforeEach(() => {
  n = 0;
  falso.recarregar.mockReset();
  window.localStorage.clear();
  definir(BASICO());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("as abas", () => {
  it("abre em Próximos meses, com as três abas", () => {
    render(<Previsao />);
    const abas = screen.getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Próximos meses", "Evolução", "Meu gasto por Tipo"]);
    expect((screen.getByRole("tab", { name: "Próximos meses" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    for (const a of abas) expect(a.className).toContain("min-h-toque");
  });

  it("Meu gasto por Tipo funciona desde a 7.3: sem 'meu Bloco' pede para escolher um (sem 'Em breve')", async () => {
    const u = userEvent.setup();
    render(<Previsao />);
    await u.click(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
    expect(screen.queryByText("Em breve")).toBeNull();
    expect(screen.getByText(T.meu_gasto_sem_bloco)).toBeTruthy();
    expect((screen.getByRole("tab", { name: "Meu gasto por Tipo" })).getAttribute("aria-selected")).toBe("true");
  });

  it("a aba escolhida fica guardada no aparelho e volta quando a tela abre de novo", async () => {
    const u = userEvent.setup();
    const primeira = render(<Previsao />);
    await u.click(screen.getByRole("tab", { name: "Evolução" }));
    expect(window.localStorage.getItem(CHAVE_DA_ABA_DA_PREVISAO)).toBe("evolucao");
    primeira.unmount();
    render(<Previsao />);
    expect((screen.getByRole("tab", { name: "Evolução" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(T.evolucao_minimo)).toBeTruthy();
  });

  it("um valor estranho guardado abre a primeira aba", () => {
    window.localStorage.setItem(CHAVE_DA_ABA_DA_PREVISAO, "qualquer-coisa");
    render(<Previsao />);
    expect((screen.getByRole("tab", { name: "Próximos meses" })).getAttribute("aria-selected")).toBe("true");
  });

  it("as setas e End/Home andam entre as abas", async () => {
    const u = userEvent.setup();
    render(<Previsao />);
    screen.getByRole("tab", { name: "Próximos meses" }).focus();
    await u.keyboard("{ArrowRight}");
    expect((screen.getByRole("tab", { name: "Evolução" })).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Evolução" }));
    await u.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
    await u.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Próximos meses" }));
    await u.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
  });
});

describe("Próximos meses", () => {
  it("mostra as barras dos 6 Meses seguintes, sem o Mês atual, com o total e o mês", () => {
    render(<Previsao />);
    const barras = within(grafico()).getAllByRole("listitem");
    expect(barras).toHaveLength(6);
    const nomes = barras.map((b) => sem(within(b).getByRole("link").getAttribute("aria-label")));
    expect(nomes).toEqual([
      "Dez/26: R$ 1.340,74. Abrir o Painel de Dez/26",
      "Jan/27: R$ 1.140,74. Abrir o Painel de Jan/27",
      "Fev/27: R$ 0,00. Abrir o Painel de Fev/27",
      "Mar/27: R$ 0,00. Abrir o Painel de Mar/27",
      "Abr/27: R$ 0,00. Abrir o Painel de Abr/27",
      "Mai/27: R$ 0,00. Abrir o Painel de Mai/27",
    ]);
    expect(screen.queryByText("Nov/26")).toBeNull();
    expect(screen.queryByText("Jun/27")).toBeNull();
  });

  it("a tabela Responsável × Mês traz os mesmos números do gráfico, em texto", () => {
    render(<Previsao />);
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual([
      "Responsável", "Dez/26", "Jan/27", "Fev/27", "Mar/27", "Abr/27", "Mai/27",
    ]);
    expect(celulas(linhaDa("Rafael"))).toEqual(["R$ 1.140,74", "R$ 1.140,74", "R$ 0,00", "R$ 0,00", "R$ 0,00", "R$ 0,00"]);
    expect(celulas(linhaDa("Casal"))).toEqual(["R$ 200,00", "R$ 0,00", "R$ 0,00", "R$ 0,00", "R$ 0,00", "R$ 0,00"]);
    expect(celulas(linhaDa("Total"))).toEqual(["R$ 1.340,74", "R$ 1.140,74", "R$ 0,00", "R$ 0,00", "R$ 0,00", "R$ 0,00"]);
  });

  it("a legenda diz o nome de cada grupo (a cor nunca é a única informação)", () => {
    render(<Previsao />);
    const legenda = screen.getByRole("list", { name: T.legenda });
    expect(within(legenda).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Rafael", "Casal"]);
  });

  it("tocar num Mês (na barra ou no cabeçalho) abre o Painel daquele Mês", () => {
    render(<Previsao />);
    const barra = within(grafico()).getAllByRole("link")[0];
    expect((barra).getAttribute("href")).toBe("/?mes=2026-12");
    const cabecalho = within(tabela()).getByRole("link", { name: "Abrir o Painel de Jan/27" });
    expect((cabecalho).getAttribute("href")).toBe("/?mes=2027-01");
    expect(cabecalho.className).toContain("min-h-toque");
    expect(barra.className).toContain("min-h-toque");
  });

  it("o seletor muda o agrupamento do gráfico e da tabela: Por Tipo", async () => {
    const u = userEvent.setup();
    render(<Previsao />);
    const por = (nome: string) => screen.getByRole("button", { name: nome });
    expect((por("Por Responsável")).getAttribute("aria-pressed")).toBe("true");
    await u.click(por("Por Tipo"));
    expect((por("Por Tipo")).getAttribute("aria-pressed")).toBe("true");
    expect((por("Por Responsável")).getAttribute("aria-pressed")).toBe("false");
    expect((within(tabela()).getAllByRole("columnheader")[0]).textContent).toContain("Tipo");
    expect(celulas(linhaDa("Casa"))[0]).toBe("R$ 1.140,74");
    expect(celulas(linhaDa("Bobiças"))[0]).toBe("R$ 200,00");
    expect(within(screen.getByRole("list", { name: T.legenda })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Bobiças", "Casa"]);
    expect(celulas(linhaDa("Total"))[0]).toBe("R$ 1.340,74");
    await u.click(por("Por Responsável"));
    expect((within(tabela()).getAllByRole("columnheader")[0]).textContent).toContain("Responsável");
  });

  it("linhas sem Responsável viram 'Sem responsável' e entram no total; o arquivado continua aparecendo", () => {
    definir([
      lanc("2026-12", 1000, { responsavel_id: null }),
      lanc("2026-12", 3000, { responsavel_id: "r-antiga" }),
    ]);
    render(<Previsao />);
    expect(celulas(linhaDa("Sem responsável"))[0]).toBe("R$ 10,00");
    expect(celulas(linhaDa("Antiga"))[0]).toBe("R$ 30,00");
    expect(within(tabela()).getByText(`(${T.arquivado})`)).toBeTruthy();
    expect(celulas(linhaDa("Total"))[0]).toBe("R$ 40,00");
  });

  it("o Mês que já tem Fatura importada leva o texto 'Fatura importada'", () => {
    definir([lanc("2026-12", 5000, { lancado_por: "fatura" })], { faturas: [{ id: "f1", mes: "2026-12" }] });
    render(<Previsao />);
    expect(within(tabela()).getByText(T.fatura_importada)).toBeTruthy();
    expect(within(grafico()).getByText(T.fatura_importada)).toBeTruthy();
  });

  it("a mãe dividida não soma e uma linha excluída não entra", () => {
    const mae = lanc("2026-12", 10000, { responsavel_id: null, divisao: { partes: [] } });
    definir([
      mae,
      lanc("2026-12", 6000, { dividido_de_id: (mae as { id: string }).id }),
      lanc("2026-12", 4000, { dividido_de_id: (mae as { id: string }).id, responsavel_id: "r-casal" }),
      lanc("2026-12", 99900, { excluido_em: "2026-11-02T10:00:00Z" }),
    ]);
    render(<Previsao />);
    expect(celulas(linhaDa("Total"))[0]).toBe("R$ 100,00");
  });

  it("um Lançamento novo em outro aparelho muda os números na hora (Realtime)", () => {
    render(<Previsao />);
    expect(celulas(linhaDa("Total"))[0]).toBe("R$ 1.340,74");
    mudarBanco("lancamentos", (ls) => [...ls, lanc("2026-12", 5000)]);
    expect(celulas(linhaDa("Total"))[0]).toBe("R$ 1.390,74");
  });
});

describe("as Séries em andamento", () => {
  it("mostra 'MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses' e a Conta mensal sem fim", () => {
    const msc = (mes: string, p: number) => lanc(mes, 114074, { serie_id: "s-msc", parcela_n: p, parcela_total: 12 });
    definir([
      msc("2026-11", 1),
      msc("2026-12", 2),
      msc("2027-01", 3),
      lanc("2026-12", 25000, { lancado_por: "manual", conta_manual_id: "c1", serie_id: "s-aluguel", parcela_n: 2, parcela_total: null, nome: "Aluguel" }),
      lanc("2026-11", 25000, { lancado_por: "manual", conta_manual_id: "c1", serie_id: "s-aluguel", parcela_n: 1, parcela_total: null, nome: "Aluguel" }),
    ]);
    render(<Previsao />);
    const secao = screen.getByRole("region", { name: T.series });
    const itens = within(secao).getAllByRole("listitem").map((l) => sem(l.textContent));
    expect(itens).toEqual([
      "MSC CRUZEIROS 01/12 → R$ 1.140,74 por mais 11 meses",
      "Aluguel → R$ 250,00 por mês, sem data para acabar",
    ]);
  });

  it("limita a lista e mostra o resto atrás de 'Ver as outras N séries'", async () => {
    const u = userEvent.setup();
    definir(
      Array.from({ length: 10 }, (_, i) =>
        lanc("2026-12", 1000 + i, { serie_id: `s${i}`, parcela_n: 2, parcela_total: 6, nome: `Compra ${i}` }),
      ),
    );
    render(<Previsao />);
    const secao = screen.getByRole("region", { name: T.series });
    expect(within(secao).getAllByRole("listitem")).toHaveLength(8);
    const botao = within(secao).getByRole("button", { name: "Ver as outras 2 séries" });
    expect((botao).getAttribute("aria-expanded")).toBe("false");
    await u.click(botao);
    expect(within(secao).getAllByRole("listitem")).toHaveLength(10);
    expect((within(secao).getByRole("button", { name: T.ver_todas_as_series })).getAttribute("aria-expanded")).toBe("true");
  });

  it("sem Séries, a seção não aparece", () => {
    definir([lanc("2026-12", 5000)]);
    render(<Previsao />);
    expect(screen.queryByRole("region", { name: T.series })).toBeNull();
  });
});

describe("os estados", () => {
  it("sem nada previsto: 'Nenhum lançamento previsto para os próximos meses'", () => {
    definir([lanc("2026-11", 5000), lanc("2026-10", 5000)]);
    render(<Previsao />);
    expect(screen.getByText("Nenhum lançamento previsto para os próximos meses")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Por Tipo" })).toBeNull();
  });

  it("carregando: esqueleto, nunca o estado vazio", () => {
    definir([]);
    falso.status = { lancamentos: "carregando" };
    falso.versao++;
    render(<Previsao />);
    expect((screen.getByRole("status")).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(T.carregando)).toBeTruthy();
    expect(screen.queryByText(T.vazio)).toBeNull();
  });

  it("qualquer tabela ainda lendo mantém o esqueleto", () => {
    falso.status = { responsaveis: "carregando" };
    falso.versao++;
    render(<Previsao />);
    expect(screen.getByText(T.carregando)).toBeTruthy();
  });

  it("erro de leitura: 'Tentar de novo' relê Lançamentos, Faturas e cadastros", async () => {
    const u = userEvent.setup();
    falso.status = { faturas: "erro" };
    falso.versao++;
    render(<Previsao />);
    expect(screen.getByRole("alert")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(4);
  });

  it("o erro em Próximos meses não derruba as abas", () => {
    falso.status = { lancamentos: "erro" };
    falso.versao++;
    render(<Previsao />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});

describe("a Previsão e o Painel mostram o mesmo número (AD-11)", () => {
  it("o total de Dez/26 é o valor do Bloco 'Todos' do Painel desse Mês, com 'inclui previstos'", () => {
    const linhas = [
      ...BASICO(),
      lanc("2026-12", -2500, { responsavel_id: null, tipo_id: null }),
      lanc("2026-12", 0),
      lanc("2026-12", 77700, { excluido_em: "2026-11-01T00:00:00Z" }),
    ];
    const bloco = {
      id: "b-todos",
      owner_id: "dono",
      nome: "Todos",
      formula: { tipo: "todos" },
      ordem: 1,
      de_cobranca: false,
      meu_bloco: false,
      created_at: "2026-11-15T12:00:00+00:00",
      updated_at: "2026-11-15T12:00:00+00:00",
    };
    definir(linhas, { blocos: [bloco] });
    render(
      <>
        <Previsao />
        <BlocosDoMes linhas={linhas as never} mes="2026-12" temFatura={false} />
      </>,
      { wrapper: ToastProvider },
    );
    const cartao = within(screen.getByRole("region", { name: "Blocos" })).getAllByRole("listitem")[0];
    const doPainel = sem(cartao.querySelector("b")!.textContent);
    expect(doPainel).toBe("R$ 1.315,74");
    expect(celulas(linhaDa("Total"))[0]).toBe(doPainel);
    expect(sem(cartao.textContent)).toContain("inclui previstos");
  });
});

describe("sem armazenamento no aparelho", () => {
  // Deixa a escolha na memória da página (módulo): por isso é o último teste do arquivo.
  it("a tela abre na primeira aba e as abas funcionam, sem guardar", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const u = userEvent.setup();
    render(<Previsao />);
    expect((screen.getByRole("tab", { name: "Próximos meses" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table", { name: T.tabela })).toBeTruthy();
    await u.click(screen.getByRole("tab", { name: "Evolução" }));
    expect(screen.getByText(T.evolucao_minimo)).toBeTruthy();
    await u.click(screen.getByRole("tab", { name: "Próximos meses" }));
    expect(screen.getByRole("table", { name: T.tabela })).toBeTruthy();
  });
});
