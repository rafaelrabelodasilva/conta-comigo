// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlocosDoMes } from "@/features/painel/BlocosDoMes";
import { TEXTOS_PREVISAO as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Previsao, CHAVE_DA_ABA_DA_PREVISAO } from "./Previsao";

// Meu gasto por Tipo (História 7.3): a aba, o seletor de Mês próprio, as barras com valor e %, o estado sem "meu Bloco" com o
// atalho para Configurações, os estados vazio/carregando/erro, o toque no Tipo e o endereço gerado, o texto equivalente ao
// gráfico e o total igual ao do cartão do Bloco no Painel. Os gerenciadores de Realtime são falsos, como em
// `Evolucao.test.tsx`. As contas (arredondamento, ordem, %) são do núcleo (`meu-gasto.test.ts`); aqui se prova a fiação e o que
// Rafael vê. Hoje é 19/11/26: o Mês atual é 2026-11.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
  tabelasRecarregadas: [] as string[],
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
  const g = (tabela = "lancamentos") => ({
    recarregar: () => {
      falso.tabelasRecarregadas.push(tabela);
      return falso.recarregar();
    },
  });
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    gerenciador: (tabela: string) => g(tabela),
    gerenciadorTodosOsLancamentos: () => g("lancamentos"),
  };
});

vi.mock("@/ui/use-hoje", () => ({ useHoje: () => "2026-11-19" }));

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const RESPONSAVEIS = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
];
const TIPOS = [
  { id: "t-casa", nome: "Casa", arquivado: false },
  { id: "t-bobicas", nome: "Bobiças", arquivado: false },
  { id: "t-velho", nome: "Antigo", arquivado: true },
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

const RAFAEL_MAIS_METADE_DO_CASAL = {
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

const bloco = (extra: Record<string, unknown> = {}) => ({
  id: "b-meu",
  owner_id: "dono",
  nome: "Meu",
  formula: RAFAEL_MAIS_METADE_DO_CASAL,
  ordem: 1,
  de_cobranca: false,
  meu_bloco: true,
  created_at: "2026-11-15T12:00:00+00:00",
  updated_at: "2026-11-15T12:00:00+00:00",
  ...extra,
});

function definir(lancamentos: unknown[], blocos: unknown[] = [bloco()], mesesComFatura = ["2026-09", "2026-10", "2026-11"]) {
  falso.banco = { lancamentos, faturas: mesesComFatura.map(fatura), responsaveis: RESPONSAVEIS, tipos: TIPOS, blocos };
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

/**
 * Novembro: Rafael R$ 100,00 e Casal R$ 51,01 em Casa; Casal R$ 51,01 em Bobiças; Rafael R$ 20,00 sem Tipo. Com
 * "Rafael + (Casal ÷ 2)": Casa 125,505, Bobiças 25,505 e Sem tipo 20,00; o Bloco vale R$ 171,01 (e não 171,02).
 */
const NOVEMBRO = () => [
  lanc("2026-11", 10000),
  lanc("2026-11", 5101, { responsavel_id: "r-casal" }),
  lanc("2026-11", 5101, { responsavel_id: "r-casal", tipo_id: "t-bobicas" }),
  lanc("2026-11", 2000, { tipo_id: null }),
  lanc("2026-10", 30000),
  lanc("2026-10", 6000, { tipo_id: "t-bobicas" }),
  lanc("2026-09", 1000, { excluido_em: "2026-10-01T00:00:00Z" }),
];

const linhasDaAba = () => within(screen.getByRole("list", { name: T.meu_gasto_grafico })).getAllByRole("listitem");
// Nome, valor e %, as três células de texto da linha (a segunda coluna é a barra, decorativa).
const textoDaLinha = (i: number) => {
  const c = Array.from((linhasDaAba()[i].firstElementChild as HTMLElement).children).map((x) => sem(x.textContent));
  return [c[0], c[2], c[3]].join(" | ");
};
const rotulos = () =>
  within(screen.getByRole("list", { name: T.meu_gasto_grafico }))
    .queryAllByRole("link")
    .map((l) => sem(l.getAttribute("aria-label")));

async function abrirMeuGasto() {
  const u = userEvent.setup();
  render(<Previsao />);
  await u.click(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
  return u;
}

beforeEach(() => {
  n = 0;
  falso.recarregar.mockReset();
  falso.tabelasRecarregadas = [];
  window.localStorage.clear();
  definir(NOVEMBRO());
});

describe("a aba Meu gasto por Tipo", () => {
  it("abre no Mês atual, com o título, o Bloco e a Fórmula, o total e as barras do maior para o menor", async () => {
    await abrirMeuGasto();
    expect(screen.getByRole("tab", { name: "Meu gasto por Tipo" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Meu gasto em novembro/26 por Tipo" })).toBeTruthy();
    expect(sem(screen.getByText(/pelo meu Bloco/).textContent)).toBe("pelo meu Bloco “Meu”: Rafael + (Casal ÷ 2) · total R$ 171,01");
    expect(screen.queryByText("Em breve")).toBeNull();
    expect(linhasDaAba()).toHaveLength(3);
    expect([0, 1, 2].map(textoDaLinha)).toEqual([
      "Casa | R$ 125,51 | 73%",
      "Bobiças | R$ 25,50 | 15%",
      "Sem tipo | R$ 20,00 | 12%",
    ]);
  });

  it("os números das barras estão em texto (valor e %) e a soma das barras é o total do Bloco", async () => {
    await abrirMeuGasto();
    const valores = [0, 1, 2].map((i) => Number(/R\$ ([\d.]+),(\d{2})/.exec(textoDaLinha(i))!.slice(1).join("").replace(".", "")));
    expect(valores.reduce((a, b) => a + b, 0)).toBe(17101);
    const percentuais = [0, 1, 2].map((i) => Number(/(\d+)%$/.exec(textoDaLinha(i))![1]));
    expect(percentuais.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("a barra é decorativa (aria-hidden), o comprimento é da maior barra e o nome acessível repete o valor e a %", async () => {
    await abrirMeuGasto();
    const primeira = linhasDaAba()[0];
    const barra = primeira.querySelector('[aria-hidden="true"] > span') as HTMLElement;
    expect(barra.style.width).toBe("100%");
    const segunda = linhasDaAba()[1].querySelector('[aria-hidden="true"] > span') as HTMLElement;
    expect(Number.parseFloat(segunda.style.width)).toBeCloseTo((2550 / 12551) * 100, 3);
    expect(rotulos()[0]).toBe("Casa: R$ 125,51, 73% do total. Abrir o Painel de Nov/26 só com Casa");
  });

  it("cada linha é um link de 44 pt para o Painel do Mês só com aquele Tipo (e 'Sem tipo' usa tipo=sem)", async () => {
    await abrirMeuGasto();
    const links = within(screen.getByRole("list", { name: T.meu_gasto_grafico })).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/?mes=2026-11&tipo=t-casa",
      "/?mes=2026-11&tipo=t-bobicas",
      "/?mes=2026-11&tipo=sem",
    ]);
    for (const l of links) expect(l.className).toContain("min-h-toque");
  });

  it("a escolha da aba fica guardada como as outras (volta em Meu gasto por Tipo)", async () => {
    await abrirMeuGasto();
    expect(window.localStorage.getItem(CHAVE_DA_ABA_DA_PREVISAO)).toBe("meu_gasto");
  });
});

describe("o seletor de Mês é da aba", () => {
  it("mostra 'Nov/26' e anda para o Mês anterior e o seguinte", async () => {
    const u = await abrirMeuGasto();
    expect(screen.getByRole("button", { name: "novembro/26, escolher o Mês" }).textContent).toBe("Nov/26");
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em outubro/26 por Tipo" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em novembro/26 por Tipo" })).toBeTruthy();
  });

  it("recalcula para o Mês escolhido: outubro tem Casa R$ 300,00 e Bobiças R$ 60,00 (ambos do Rafael)", async () => {
    const u = await abrirMeuGasto();
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect([0, 1].map(textoDaLinha)).toEqual(["Casa | R$ 300,00 | 83%", "Bobiças | R$ 60,00 | 17%"]);
    expect(rotulos()[0]).toBe("Casa: R$ 300,00, 83% do total. Abrir o Painel de Out/26 só com Casa");
    expect(within(screen.getByRole("list", { name: T.meu_gasto_grafico })).getAllByRole("link")[0].getAttribute("href")).toBe(
      "/?mes=2026-10&tipo=t-casa",
    );
  });

  it("escolhe um Mês pela lista (tem os Meses com Fatura ou Lançamento até o seguinte ao atual)", async () => {
    const u = await abrirMeuGasto();
    await u.click(screen.getByRole("button", { name: "novembro/26, escolher o Mês" }));
    const lista = screen.getByRole("list", { name: "Meses" });
    expect(within(lista).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "setembro/26, Fechado",
      "outubro/26, Fechado",
      "novembro/26, Fechado",
      "dezembro/26",
    ]);
    await u.click(within(lista).getByRole("button", { name: "outubro/26, Fechado" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em outubro/26 por Tipo" })).toBeTruthy();
    expect(screen.getAllByText("Fechado").length).toBeGreaterThan(0);
  });

  it("Mês sem Lançamento: 'Nenhum lançamento neste mês', com o seletor ainda na tela", async () => {
    const u = await abrirMeuGasto();
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em setembro/26 por Tipo" })).toBeTruthy();
    expect(screen.getByText(T.meu_gasto_vazio)).toBeTruthy();
    expect(screen.queryByRole("list", { name: T.meu_gasto_grafico })).toBeNull();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeTruthy();
  });

  it("Mês futuro (as setas andam sem limite): previstos entram e o texto diz 'inclui previstos'", async () => {
    definir([...NOVEMBRO(), lanc("2026-12", 4000, { lancado_por: "sistema", tipo_id: "t-bobicas" })]);
    const u = await abrirMeuGasto();
    await u.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em dezembro/26 por Tipo" })).toBeTruthy();
    expect(textoDaLinha(0)).toBe("Bobiças | R$ 40,00 | 100%");
    expect(screen.getByText(/inclui previstos/)).toBeTruthy();
  });

  it("não divide o Mês com as outras abas: sair e voltar abre de novo no Mês atual, e a Evolução segue como estava", async () => {
    const u = await abrirMeuGasto();
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    await u.click(screen.getByRole("tab", { name: "Evolução" }));
    expect(screen.getByRole("heading", { name: "Os 3 meses com Fatura importada" })).toBeTruthy();
    await u.click(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
    expect(screen.getByRole("heading", { name: "Meu gasto em novembro/26 por Tipo" })).toBeTruthy();
  });
});

describe("sem 'meu Bloco'", () => {
  it("diz 'Escolha qual Bloco representa o seu gasto', com o atalho para Configurações (Blocos de cobrança)", async () => {
    definir(NOVEMBRO(), [bloco({ meu_bloco: false })]);
    await abrirMeuGasto();
    expect(screen.getByText("Escolha qual Bloco representa o seu gasto")).toBeTruthy();
    const atalho = screen.getByRole("link", { name: T.meu_gasto_ir_para_configuracoes });
    expect(atalho.getAttribute("href")).toBe("/configuracoes?secao=cobranca");
    expect(screen.queryByRole("list", { name: T.meu_gasto_grafico })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mês anterior" })).toBeNull();
  });

  it("nenhum Bloco no cadastro: o mesmo texto", async () => {
    definir(NOVEMBRO(), []);
    await abrirMeuGasto();
    expect(screen.getByText(T.meu_gasto_sem_bloco)).toBeTruthy();
  });

  it("marcar o Bloco em outro aparelho (Realtime) liga as barras no lugar", async () => {
    definir(NOVEMBRO(), [bloco({ meu_bloco: false })]);
    await abrirMeuGasto();
    expect(screen.getByText(T.meu_gasto_sem_bloco)).toBeTruthy();
    mudarBanco("blocos", (l) => l.map((b) => ({ ...(b as object), meu_bloco: true })));
    expect(linhasDaAba()).toHaveLength(3);
    expect(screen.queryByText(T.meu_gasto_sem_bloco)).toBeNull();
  });
});

describe("outros casos do Mês", () => {
  it("o 'meu Bloco' não soma nada no Mês: 'O seu Bloco não soma nada neste mês'", async () => {
    definir([lanc("2026-11", 9000, { responsavel_id: "r-casal" })], [bloco({ formula: { tipo: "responsavel", id: "r-rafael" } })]);
    await abrirMeuGasto();
    expect(screen.getByText(T.meu_gasto_sem_gasto)).toBeTruthy();
  });

  it("Tipo arquivado aparece com '(arquivado)'", async () => {
    definir([lanc("2026-11", 9000, { tipo_id: "t-velho" })], [bloco({ formula: { tipo: "responsavel", id: "r-rafael" } })]);
    await abrirMeuGasto();
    expect(textoDaLinha(0)).toBe("Antigo(arquivado) | R$ 90,00 | 100%");
  });

  it("crédito: o Tipo líquido negativo aparece com o sinal, sem barra, e a % negativa", async () => {
    definir(
      [lanc("2026-11", 10000), lanc("2026-11", -3000, { tipo_id: "t-bobicas" })],
      [bloco({ formula: { tipo: "responsavel", id: "r-rafael" } })],
    );
    await abrirMeuGasto();
    expect([0, 1].map(textoDaLinha)).toEqual(["Casa | R$ 100,00 | 143%", "Bobiças | - R$ 30,00 | -43%"]);
    const semBarra = linhasDaAba()[1].querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(semBarra.children).toHaveLength(0);
  });

  it("total zero: sem porcentagem ('—') em vez de uma conta sem sentido", async () => {
    definir([lanc("2026-11", 10000), lanc("2026-11", -10000, { tipo_id: "t-bobicas" })], [bloco({ formula: { tipo: "responsavel", id: "r-rafael" } })]);
    await abrirMeuGasto();
    expect([0, 1].map(textoDaLinha)).toEqual(["Casa | R$ 100,00 | —", "Bobiças | - R$ 100,00 | —"]);
    expect(rotulos()[0]).toBe("Casa: R$ 100,00. Abrir o Painel de Nov/26 só com Casa");
  });

  it("Fórmula com parte fixa ('Rafael + 100'): a barra 'Valor fixo do Bloco' vem por último e não é link", async () => {
    definir(
      [lanc("2026-11", 2000)],
      [
        bloco({
          formula: { tipo: "operacao", operacao: "soma", esquerda: { tipo: "responsavel", id: "r-rafael" }, direita: { tipo: "numero", valor: "100" } },
        }),
      ],
    );
    await abrirMeuGasto();
    expect([0, 1].map((i) => textoDaLinha(i).replace(T.meu_gasto_fixo_ajuda, ""))).toEqual([
      "Casa | R$ 20,00 | 17%",
      `${T.meu_gasto_fixo} | R$ 100,00 | 83%`,
    ]);
    expect(within(linhasDaAba()[1]).queryByRole("link")).toBeNull();
    expect(within(linhasDaAba()[0]).getByRole("link")).toBeTruthy();
  });

  it("Fórmula que não calcula: o texto da razão, sem barras", async () => {
    definir(
      [lanc("2026-11", 2000)],
      [
        bloco({
          formula: { tipo: "operacao", operacao: "multiplicacao", esquerda: { tipo: "responsavel", id: "r-rafael" }, direita: { tipo: "responsavel", id: "r-casal" } },
        }),
      ],
    );
    await abrirMeuGasto();
    expect(screen.getByText("O seu Bloco “Meu” não calcula neste mês. Confira a Fórmula.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: T.meu_gasto_grafico })).toBeNull();
  });

  it("um Lançamento novo em outro aparelho (Realtime) muda as barras no lugar", async () => {
    await abrirMeuGasto();
    mudarBanco("lancamentos", (l) => [...l, lanc("2026-11", 50000, { tipo_id: "t-bobicas" })]);
    expect(textoDaLinha(0).startsWith("Bobiças")).toBe(true);
    expect(textoDaLinha(0)).toBe("Bobiças | R$ 525,51 | 78%");
  });
});

describe("carregando e erro", () => {
  it("lendo os Blocos: esqueleto 'Carregando o seu gasto…', nunca 'Escolha qual Bloco…'", async () => {
    await abrirMeuGasto();
    act(() => {
      falso.status = { blocos: "carregando" };
      falso.versao++;
      for (const o of falso.ouvintes) o();
    });
    const aviso = screen.getByRole("status");
    expect(aviso.getAttribute("aria-busy")).toBe("true");
    expect(aviso.textContent).toBe(T.carregando_meu_gasto);
    expect(screen.queryByText(T.meu_gasto_sem_bloco)).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("lendo os Lançamentos: o mesmo esqueleto", async () => {
    falso.status = { lancamentos: "carregando" };
    await abrirMeuGasto();
    expect(screen.getByRole("status").textContent).toBe(T.carregando_meu_gasto);
    expect(screen.queryByText(T.meu_gasto_vazio)).toBeNull();
  });

  it("erro numa leitura (os Blocos ou os da Previsão): 'Tentar de novo' relê as cinco, com os Blocos", async () => {
    for (const tabela of ["blocos", "lancamentos", "faturas", "responsaveis", "tipos"]) {
      falso.recarregar.mockReset();
      falso.tabelasRecarregadas = [];
      definir(NOVEMBRO());
      falso.status = { [tabela]: "erro" };
      const u = userEvent.setup();
      const { unmount } = render(<Previsao />);
      await u.click(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getAllByRole("tab")).toHaveLength(3);
      await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
      expect([...falso.tabelasRecarregadas].sort()).toEqual(["blocos", "faturas", "lancamentos", "responsaveis", "tipos"]);
      unmount();
    }
  });
});

describe("o valor é o do cartão do Bloco no Painel (AD-11)", () => {
  it("a soma das barras é o valor do Bloco que o Painel mostra para o mesmo Mês", async () => {
    const linhas = [...NOVEMBRO(), lanc("2026-11", -2500, { responsavel_id: null, tipo_id: null }), lanc("2026-11", 0), lanc("2026-11", 7777, { excluido_em: "2026-11-01T00:00:00Z" })];
    definir(linhas);
    render(
      <>
        <Previsao />
        <BlocosDoMes linhas={linhas as never} mes="2026-11" temFatura />
      </>,
      { wrapper: ToastProvider },
    );
    await userEvent.setup().click(screen.getByRole("tab", { name: "Meu gasto por Tipo" }));
    const cartao = within(screen.getByRole("region", { name: "Blocos" })).getAllByRole("listitem")[0];
    const doPainel = sem(cartao.querySelector("b")!.textContent);
    expect(doPainel).toBe("R$ 171,01");
    expect(sem(screen.getByText(/pelo meu Bloco/).textContent)).toContain(`total ${doPainel}`);
  });
});
