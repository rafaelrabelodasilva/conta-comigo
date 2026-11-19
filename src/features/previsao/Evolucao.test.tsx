// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlocosDoMes } from "@/features/painel/BlocosDoMes";
import { TEXTOS_PREVISAO as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Previsao, CHAVE_DA_ABA_DA_PREVISAO } from "./Previsao";

// Evolução (História 7.2): a aba, o seletor, os Meses mostrados, o texto de "menos de 2 Meses", os estados, o toque no Mês,
// o texto equivalente ao gráfico e o total de um Mês igual ao Bloco "Todos" do Painel. Os gerenciadores de Realtime são
// falsos, como em `Previsao.test.tsx`. As contas são do núcleo (`evolucao.test.ts`); aqui se prova a fiação e o que
// Rafael vê. Hoje é 19/11/26: o Mês atual é 2026-11.

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
    lancado_por: "fatura",
    conta_manual_id: null,
    vencimento_combinado: null,
    nome: "COMPRA",
    apelido: null,
    serie_id: null,
    parcela_n: null,
    parcela_total: null,
    ...extra,
  }) as never;

const fatura = (mes: string) => ({ id: `f-${mes}`, mes });

function definir(lancamentos: unknown[], mesesComFatura: string[], extra: Record<string, unknown[]> = {}) {
  falso.banco = {
    lancamentos,
    faturas: mesesComFatura.map(fatura),
    responsaveis: RESPONSAVEIS,
    tipos: TIPOS,
    blocos: [],
    ...extra,
  };
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

/** Set, Out e Nov/26 com Fatura: Rafael em todos, Casal em Out e Nov. */
const TRES = () => [
  lanc("2026-09", 100000),
  lanc("2026-10", 120000),
  lanc("2026-10", 30000, { responsavel_id: "r-casal", tipo_id: "t-bobicas" }),
  lanc("2026-11", 150000),
  lanc("2026-11", 45000, { responsavel_id: "r-casal", tipo_id: "t-bobicas" }),
];
const MESES_TRES = ["2026-09", "2026-10", "2026-11"];

const tabela = () => screen.getByRole("table", { name: T.tabela });
const linhaDa = (nome: string) => within(tabela()).getByRole("row", { name: new RegExp(nome) });
const celulas = (linha: HTMLElement) => within(linha).getAllByRole("cell").map((c) => sem(c.textContent));
const grafico = () => screen.getByRole("list", { name: T.grafico });

async function abrirEvolucao() {
  const u = userEvent.setup();
  render(<Previsao />);
  await u.click(screen.getByRole("tab", { name: "Evolução" }));
  return u;
}

beforeEach(() => {
  n = 0;
  falso.recarregar.mockReset();
  window.localStorage.clear();
  definir(TRES(), MESES_TRES);
});

describe("a aba Evolução", () => {
  it("mostra as barras dos Meses com Fatura importada, em ordem, com o total e o Mês", async () => {
    await abrirEvolucao();
    expect((screen.getByRole("tab", { name: "Evolução" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Em breve")).toBeNull();
    const barras = within(grafico()).getAllByRole("listitem");
    expect(barras.map((b) => sem(within(b).getByRole("link").getAttribute("aria-label")))).toEqual([
      "Set/26: R$ 1.000,00. Abrir o Painel de Set/26",
      "Out/26: R$ 1.500,00. Abrir o Painel de Out/26",
      "Nov/26: R$ 1.950,00. Abrir o Painel de Nov/26",
    ]);
  });

  it("com menos de 6 Meses mostra os que existem, e diz quantos no título", async () => {
    await abrirEvolucao();
    expect(screen.getByRole("heading", { name: "Os 3 meses com Fatura importada" })).toBeTruthy();
    expect(within(grafico()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("com 7 Meses importados mostra os 6 mais novos", async () => {
    const meses = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
    definir(meses.map((m) => lanc(m, 10000)), meses);
    await abrirEvolucao();
    expect(screen.getByRole("heading", { name: "Últimos 6 meses com Fatura importada" })).toBeTruthy();
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual([
      "Responsável", "Jun/26", "Jul/26", "Ago/26", "Set/26", "Out/26", "Nov/26",
    ]);
    expect(screen.queryByText("Mai/26")).toBeNull();
  });

  it("a tabela Responsável × Mês traz os mesmos números do gráfico, em texto", async () => {
    await abrirEvolucao();
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual(["Responsável", "Set/26", "Out/26", "Nov/26"]);
    expect(celulas(linhaDa("Rafael"))).toEqual(["R$ 1.000,00", "R$ 1.200,00", "R$ 1.500,00"]);
    expect(celulas(linhaDa("Casal"))).toEqual(["R$ 0,00", "R$ 300,00", "R$ 450,00"]);
    expect(celulas(linhaDa("Total"))).toEqual(["R$ 1.000,00", "R$ 1.500,00", "R$ 1.950,00"]);
    // O nome de cada barra repete o total da tabela: o gráfico tem o texto equivalente.
    const nomes = within(grafico()).getAllByRole("link").map((l) => sem(l.getAttribute("aria-label")));
    for (const total of celulas(linhaDa("Total"))) expect(nomes.some((nome) => nome.includes(total))).toBe(true);
  });

  it("a legenda diz o nome de cada grupo (a cor nunca é a única informação)", async () => {
    await abrirEvolucao();
    const legenda = screen.getByRole("list", { name: T.legenda });
    expect(within(legenda).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Rafael", "Casal"]);
  });

  it("não repete 'Fatura importada' em todo Mês (todos têm)", async () => {
    await abrirEvolucao();
    expect(screen.queryByText(T.fatura_importada)).toBeNull();
  });

  it("o Mês atual entra quando já tem Fatura; um Mês futuro com Fatura fica de fora", async () => {
    definir([...TRES(), lanc("2026-12", 99900)], [...MESES_TRES, "2026-12"]);
    await abrirEvolucao();
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual(["Responsável", "Set/26", "Out/26", "Nov/26"]);
    expect(screen.queryByText("Dez/26")).toBeNull();
  });

  it("o Mês atual sem Fatura não entra", async () => {
    definir(TRES(), ["2026-09", "2026-10"]);
    await abrirEvolucao();
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual(["Responsável", "Set/26", "Out/26"]);
  });

  it("buraco entre Meses: mostra só os importados e avisa", async () => {
    definir([lanc("2026-07", 1000), lanc("2026-09", 2000), lanc("2026-10", 3000)], ["2026-07", "2026-09", "2026-10"]);
    await abrirEvolucao();
    expect(within(tabela()).getAllByRole("columnheader").map((c) => sem(c.textContent))).toEqual(["Responsável", "Jul/26", "Set/26", "Out/26"]);
    expect(screen.getByText(T.evolucao_buraco)).toBeTruthy();
  });

  it("Meses seguidos: sem o aviso de buraco", async () => {
    await abrirEvolucao();
    expect(screen.queryByText(T.evolucao_buraco)).toBeNull();
  });

  it("não escreve nada: não há botão de salvar, editar ou excluir", async () => {
    await abrirEvolucao();
    expect(screen.queryByRole("button", { name: /salvar|editar|excluir|apagar/i })).toBeNull();
  });
});

describe("o seletor da Evolução", () => {
  it("Por Tipo muda o gráfico, a legenda e a tabela", async () => {
    const u = await abrirEvolucao();
    const por = (nome: string) => screen.getByRole("button", { name: nome });
    expect((por("Por Responsável")).getAttribute("aria-pressed")).toBe("true");
    await u.click(por("Por Tipo"));
    expect((por("Por Tipo")).getAttribute("aria-pressed")).toBe("true");
    expect((por("Por Responsável")).getAttribute("aria-pressed")).toBe("false");
    expect((within(tabela()).getAllByRole("columnheader")[0]).textContent).toContain("Tipo");
    expect(celulas(linhaDa("Casa"))).toEqual(["R$ 1.000,00", "R$ 1.200,00", "R$ 1.500,00"]);
    expect(celulas(linhaDa("Bobiças"))).toEqual(["R$ 0,00", "R$ 300,00", "R$ 450,00"]);
    expect(within(screen.getByRole("list", { name: T.legenda })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Bobiças", "Casa"]);
    expect(celulas(linhaDa("Total"))).toEqual(["R$ 1.000,00", "R$ 1.500,00", "R$ 1.950,00"]);
  });

  it("o seletor é da aba: Próximos meses abre em Por Responsável mesmo depois de Por Tipo na Evolução", async () => {
    definir([...TRES(), lanc("2026-12", 5000, { lancado_por: "sistema" })], MESES_TRES);
    const u = await abrirEvolucao();
    await u.click(screen.getByRole("button", { name: "Por Tipo" }));
    await u.click(screen.getByRole("tab", { name: "Próximos meses" }));
    expect((screen.getByRole("button", { name: "Por Responsável" })).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("tocar num Mês", () => {
  it("a barra e o cabeçalho da tabela abrem o Painel daquele Mês (44 pt)", async () => {
    await abrirEvolucao();
    const barra = within(grafico()).getAllByRole("link")[1];
    expect((barra).getAttribute("href")).toBe("/?mes=2026-10");
    expect(barra.className).toContain("min-h-toque");
    const cabecalho = within(tabela()).getByRole("link", { name: "Abrir o Painel de Set/26" });
    expect((cabecalho).getAttribute("href")).toBe("/?mes=2026-09");
    expect(cabecalho.className).toContain("min-h-toque");
  });
});

describe("menos de 2 Meses importados", () => {
  it.each([
    ["nenhum", []],
    ["um", ["2026-10"]],
  ])("com %s Mês importado: só o texto, sem gráfico, tabela nem seletor", async (_nome, meses) => {
    definir(TRES(), meses);
    await abrirEvolucao();
    expect(screen.getByText("Evolução disponível a partir de 2 meses importados")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("list", { name: T.grafico })).toBeNull();
    expect(screen.queryByRole("button", { name: "Por Tipo" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("um Mês importado e outro só com Lançamentos de planilha (sem Fatura): continua sem Evolução", async () => {
    definir([lanc("2026-09", 1000, { lancado_por: "historico" }), lanc("2026-10", 2000)], ["2026-10"]);
    await abrirEvolucao();
    expect(screen.getByText(T.evolucao_minimo)).toBeTruthy();
  });

  it("o segundo Mês importado em outro aparelho liga o gráfico na hora (Realtime)", async () => {
    definir(TRES(), ["2026-10"]);
    await abrirEvolucao();
    expect(screen.getByText(T.evolucao_minimo)).toBeTruthy();
    mudarBanco("faturas", (fs) => [...fs, fatura("2026-11")]);
    expect(screen.queryByText(T.evolucao_minimo)).toBeNull();
    expect(celulas(linhaDa("Total"))).toEqual(["R$ 1.500,00", "R$ 1.950,00"]);
  });
});

describe("os estados da Evolução", () => {
  it("carregando: esqueleto, nunca o texto de menos de 2 Meses", async () => {
    window.localStorage.setItem(CHAVE_DA_ABA_DA_PREVISAO, "evolucao");
    definir([], []);
    falso.status = { faturas: "carregando" };
    falso.versao++;
    render(<Previsao />);
    expect((screen.getByRole("status")).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(T.carregando_evolucao)).toBeTruthy();
    expect(screen.queryByText(T.evolucao_minimo)).toBeNull();
  });

  it("qualquer das quatro leituras ainda lendo mantém o esqueleto", async () => {
    window.localStorage.setItem(CHAVE_DA_ABA_DA_PREVISAO, "evolucao");
    falso.status = { tipos: "carregando" };
    falso.versao++;
    render(<Previsao />);
    expect(screen.getByText(T.carregando_evolucao)).toBeTruthy();
  });

  it("erro de leitura: 'Tentar de novo' relê Lançamentos, Faturas e cadastros, e as abas continuam", async () => {
    window.localStorage.setItem(CHAVE_DA_ABA_DA_PREVISAO, "evolucao");
    const u = userEvent.setup();
    falso.status = { lancamentos: "erro" };
    falso.versao++;
    render(<Previsao />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(4);
  });

  it("um Lançamento novo em outro aparelho muda os números na hora (Realtime)", async () => {
    await abrirEvolucao();
    expect(celulas(linhaDa("Total"))[2]).toBe("R$ 1.950,00");
    mudarBanco("lancamentos", (ls) => [...ls, lanc("2026-11", 5000)]);
    expect(celulas(linhaDa("Total"))[2]).toBe("R$ 2.000,00");
  });

  it("o Mês importado sem nenhum Lançamento entra com R$ 0,00", async () => {
    definir([lanc("2026-10", 5000)], ["2026-09", "2026-10"]);
    await abrirEvolucao();
    expect(celulas(linhaDa("Total"))).toEqual(["R$ 0,00", "R$ 50,00"]);
  });
});

describe("a Evolução e o Painel mostram o mesmo número (AD-11)", () => {
  it("o total de Out/26 é o valor do Bloco 'Todos' do Painel desse Mês", async () => {
    const mae = lanc("2026-10", 10000, { responsavel_id: null, divisao: { partes: [] } });
    const linhas = [
      ...TRES(),
      mae,
      lanc("2026-10", 6000, { dividido_de_id: (mae as { id: string }).id }),
      lanc("2026-10", 4000, { dividido_de_id: (mae as { id: string }).id, responsavel_id: "r-casal" }),
      lanc("2026-10", -2500, { responsavel_id: null, tipo_id: null }),
      lanc("2026-10", 0),
      lanc("2026-10", 77700, { excluido_em: "2026-11-01T00:00:00Z" }),
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
    definir(linhas, MESES_TRES, { blocos: [bloco] });
    const u = userEvent.setup();
    render(
      <>
        <Previsao />
        <BlocosDoMes linhas={linhas as never} mes="2026-10" temFatura />
      </>,
      { wrapper: ToastProvider },
    );
    await u.click(screen.getByRole("tab", { name: "Evolução" }));
    const cartao = within(screen.getByRole("region", { name: "Blocos" })).getAllByRole("listitem")[0];
    const doPainel = sem(cartao.querySelector("b")!.textContent);
    expect(doPainel).toBe("R$ 1.575,00");
    expect(celulas(linhaDa("Total"))[1]).toBe(doPainel);
  });
});
