// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_IMPORTAR, TEXTOS_PAINEL, mensagem } from "@/domain/mensagens";
import type { LinhaFatura, LinhaLancamento } from "@/data/faturas-repo";
import { Painel } from "./Painel";

// O gerenciador de Realtime é falso: um "banco" por tabela e, para
// `lancamentos`, só o Mês aberto (como o de verdade). `abrirMes` avisa as
// telas, então trocar de Mês redesenha. A janela de importação vira um
// marcador que pode "importar" um Mês.
const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: "pronto" as string,
  /** Status só de `lancamentos` (os outros seguem `status`). */
  statusLancamentos: null as string | null,
  mes: null as string | null,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
  abrirMes: vi.fn(),
  importarMes: null as ((mes: string) => void) | null,
  /** O gerenciador ainda não trocou de Mês (a memória é do Mês anterior). */
  congelarMes: false,
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const avisar = () => {
    falso.versao++;
    for (const o of falso.ouvintes) o();
  };
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (tabela: string) => {
    const guardado = cache.get(tabela);
    if (guardado && guardado.versao === falso.versao) return guardado.retrato;
    const linhas = falso.banco[tabela] ?? [];
    const novo =
      tabela === "lancamentos"
        ? {
            status: falso.mes === null ? "carregando" : (falso.statusLancamentos ?? falso.status),
            linhas: linhas.filter((l) => (l as { mes: string }).mes === falso.mes),
            mes: falso.mes,
          }
        : { status: falso.status, linhas };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  return {
    useLinhas: (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela)),
    gerenciador: () => ({
      recarregar: falso.recarregar,
      abrirMes: (mes: string) => {
        falso.abrirMes(mes);
        if (mes === falso.mes || falso.congelarMes) return;
        falso.mes = mes;
        avisar();
      },
    }),
    avisar,
  };
});
vi.mock("@/features/importar/ImportarFatura", () => ({
  ImportarFatura: ({ aberta, aoImportar }: { aberta: boolean; aoImportar: (mes: string) => void }) => {
    falso.importarMes = aoImportar;
    return aberta ? <div data-testid="janela-importar" /> : null;
  },
}));

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const outubro = {
  id: "f10",
  mes: "2026-10",
  vencimento: "2026-10-06",
  total_despesas_centavos: 832739,
  total_creditos_centavos: 63962,
  saldo_anterior_centavos: 748311,
  pagamentos_centavos: 745721,
  total_a_pagar_centavos: 771367,
  updated_at: "2026-11-03T12:00:00+00:00",
} as LinhaFatura;

const novembro = {
  ...outubro,
  id: "f11",
  mes: "2026-11",
  vencimento: "2026-11-06",
  saldo_anterior_centavos: 0,
  pagamentos_centavos: 0,
  total_a_pagar_centavos: 735142,
} as LinhaFatura;

let seq = 0;
const lanc = (mes: string, extra: Partial<LinhaLancamento> = {}) => {
  seq++;
  return {
    id: `l${seq}`,
    mes,
    fatura_id: mes === "2026-10" ? "f10" : mes === "2026-11" ? "f11" : null,
    ordem_fatura: seq,
    nome: `LOJA ${seq}`,
    apelido: null,
    data: "2026-09-04",
    parcela_n: null,
    parcela_total: null,
    valor_centavos: 1000,
    final_cartao: "5061",
    tipo_id: null,
    responsavel_id: null,
    status_id: "s-nao",
    lancado_por: "fatura",
    excluido_em: null,
    updated_at: "2026-11-03T12:00:00+00:00",
    ...extra,
  } as LinhaLancamento;
};

/** `n` Lançamentos do Mês que somam `total` centavos. */
function lancamentosQueSomam(mes: string, n: number, total: number) {
  const linhas = Array.from({ length: n - 1 }, () => lanc(mes, { valor_centavos: 100 }));
  linhas.push(lanc(mes, { valor_centavos: total - 100 * (n - 1) }));
  return linhas;
}

const responsaveis = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1 },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2 },
];
const status = [
  { id: "s-nao", nome: "Não pago", conta_como_pago: false },
  { id: "s-pago", nome: "Pago", conta_como_pago: true },
];

function definir(dados: { faturas?: unknown[]; lancamentos?: unknown[] }, st = "pronto") {
  falso.banco = { faturas: [], lancamentos: [], responsaveis, tipos: [], status, ...dados };
  falso.status = st;
  falso.versao++;
}

/** Linhas do corpo da grade (sem a de "vazio"). */
function linhasDaGrade() {
  const [, corpo] = screen.getAllByRole("rowgroup");
  return within(corpo)
    .queryAllByRole("row")
    .filter((r) => r.getAttribute("aria-label"));
}

function rodape() {
  const [, , pe] = screen.getAllByRole("rowgroup");
  return within(pe).getAllByRole("cell").map((c) => sem(c.textContent));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
  vi.clearAllMocks();
  seq = 0;
  falso.mes = null;
  falso.statusLancamentos = null;
  falso.congelarMes = false;
  falso.ouvintes.clear();
  definir({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Painel do Mês", () => {
  it("abre no Mês atual (08/11/26 → novembro/26)", () => {
    render(<Painel titulo="Painel" />);
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
    expect(screen.getByRole("button", { name: "novembro/26, escolher o Mês" }).textContent).toBe("Nov/26");
  });

  it("outubro: hero, conta do total, 49 linhas e selo Fechado; ▶ mostra novembro separado", async () => {
    const out = lancamentosQueSomam("2026-10", 49, 768777);
    const nov = lancamentosQueSomam("2026-11", 46, 735142);
    definir({ faturas: [outubro, novembro], lancamentos: [...out, ...nov] });
    render(<Painel titulo="Painel" />);
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(falso.abrirMes).toHaveBeenLastCalledWith("2026-10");
    const hero = screen.getByRole("region", { name: "Fatura de outubro · vence 06/10/26" });
    expect(within(hero).getByText("Fatura de outubro · vence 06/10/26").className).toContain("texto-eyebrow");
    expect(sem(hero.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 7.713,67");
    expect(within(hero).getByText("✓ Bate com o total a pagar")).toBeTruthy();
    expect(linhasDaGrade()).toHaveLength(49);
    expect(rodape()).toContain("R$ 7.687,77");
    expect(screen.getAllByText(TEXTOS_PAINEL.fechado).length).toBeGreaterThan(0);

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    const heroNov = screen.getByRole("region", { name: "Fatura de novembro · vence 06/11/26" });
    expect(sem(heroNov.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 7.351,42");
    expect(within(heroNov).getByText("✓ Bate com o total a pagar")).toBeTruthy();
    const linhas = linhasDaGrade();
    expect(linhas).toHaveLength(46);
    const idsOutubro = new Set(out.map((l) => l.nome));
    expect(linhas.some((r) => idsOutubro.has(within(r).getAllByRole("cell")[1].textContent ?? ""))).toBe(false);
  });

  it("Mês sem Fatura: 'Fatura ainda não importada' com Importar fatura, grade vazia e sem selo", async () => {
    definir({ faturas: [outubro], lancamentos: [lanc("2026-10")] });
    render(<Painel titulo="Painel" />);
    expect(screen.getByText(TEXTOS_PAINEL.sem_fatura)).toBeTruthy();
    expect(screen.queryByText(TEXTOS_PAINEL.fechado)).toBeNull();
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText(TEXTOS_PAINEL.sem_lancamentos)).toBeTruthy();
    // Um no topo e um no cartão; o do cartão abre a janela.
    const botoes = screen.getAllByRole("button", { name: TEXTOS_IMPORTAR.botao });
    expect(botoes).toHaveLength(2);
    expect(screen.queryByTestId("janela-importar")).toBeNull();
    await userEvent.setup().click(botoes[1]);
    expect(screen.getByTestId("janela-importar")).toBeTruthy();
  });

  it("sem nenhuma Fatura, a grade vazia chama para importar a primeira", () => {
    render(<Painel titulo="Painel" />);
    expect(screen.getByText(mensagem("painel.vazio"))).toBeTruthy();
  });

  it("carregando: esqueleto, nunca tela branca; erro: Tentar de novo relê as tabelas", async () => {
    definir({}, "carregando");
    const { unmount } = render(<Painel titulo="Painel" />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    unmount();

    definir({}, "erro");
    render(<Painel titulo="Painel" />);
    expect(screen.getByText(mensagem("carregar.falhou"))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(5);
  });

  it("trocar de Mês mostra o esqueleto enquanto o Mês novo carrega", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    render(<Painel titulo="Painel" />);
    expect(linhasDaGrade()).toHaveLength(1);
    falso.statusLancamentos = "carregando";
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("memória pronta mas ainda do Mês anterior: esqueleto, não a grade", () => {
    definir({ faturas: [outubro], lancamentos: [lanc("2026-10")] });
    falso.mes = "2026-10";
    falso.congelarMes = true;
    render(<Painel titulo="Painel" />);
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("excluídos ficam fora da grade, do rodapé, da barra, da contagem e da conta do hero", async () => {
    // Outubro: 49 que somam 7.687,77 e um excluído de R$ 50,00.
    const out = lancamentosQueSomam("2026-10", 49, 768777);
    const excluido = lanc("2026-10", { valor_centavos: 5000, responsavel_id: "r-casal", excluido_em: "2026-11-05T12:00:00+00:00" });
    definir({ faturas: [outubro], lancamentos: [...out, excluido] });
    render(<Painel titulo="Painel" />);
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(linhasDaGrade()).toHaveLength(49);
    expect(screen.queryByText(excluido.nome)).toBeNull();
    expect(rodape()).toContain("R$ 7.687,77");
    expect(screen.getByText("49 lançamentos")).toBeTruthy();
    expect(screen.getByText("✓ Bate com o total a pagar")).toBeTruthy();
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    expect(within(barra).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Filtrar por Sem responsável",
    ]);
  });

  it("filtro que esconde todas as linhas do Mês: texto próprio, não 'nenhum lançamento neste Mês'", async () => {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [lanc("2026-11", { responsavel_id: "r-rafael" }), lanc("2026-10", { responsavel_id: "r-casal" })],
    });
    render(<Painel titulo="Painel" />);
    const u = userEvent.setup();
    const [segmento] = within(screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao })).getAllByRole("button");
    await u.click(segmento);
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText("Nenhum lançamento de Rafael neste Mês")).toBeTruthy();
    expect(screen.queryByText(TEXTOS_PAINEL.sem_lancamentos)).toBeNull();
  });

  it("Lançamentos sem Responsável: segmento e legenda 'Sem responsável'; a tag mostra —", () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11", { valor_centavos: 5000 })] });
    render(<Painel titulo="Painel" />);
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    const [segmento] = within(barra).getAllByRole("button");
    expect(segmento.getAttribute("aria-label")).toBe("Filtrar por Sem responsável");
    expect(segmento.className).toContain("bg-text-muted");
    expect(screen.getByRole("button", { name: TEXTOS_PAINEL.sem_responsavel })).toBeTruthy();
    const [linha] = linhasDaGrade();
    expect(within(linha).getAllByRole("cell")[5].textContent).toBe("—");
  });

  it("filtro: segmento filtra a grade e o rodapé; vale ao trocar de Mês; ✕ limpa", async () => {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [
        lanc("2026-11", { responsavel_id: "r-rafael", valor_centavos: 1000 }),
        lanc("2026-11", { responsavel_id: "r-casal", valor_centavos: 3000 }),
        lanc("2026-11", { responsavel_id: "r-rafael", valor_centavos: 500 }),
        lanc("2026-10", { responsavel_id: "r-rafael", valor_centavos: 700 }),
        lanc("2026-10", { responsavel_id: "r-casal", valor_centavos: 900 }),
      ],
    });
    render(<Painel titulo="Painel" />);
    const u = userEvent.setup();
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    // Ordem dos Responsáveis; largura proporcional à soma.
    const segmentos = within(barra).getAllByRole("button");
    expect(segmentos.map((s) => s.getAttribute("aria-label"))).toEqual(["Filtrar por Rafael", "Filtrar por Casal"]);
    expect(segmentos.map((s) => s.style.flexGrow)).toEqual(["1500", "3000"]);

    await u.click(segmentos[0]);
    expect(linhasDaGrade()).toHaveLength(2);
    expect(rodape()).toContain(sem(formatarDinheiro(1500)));
    expect(segmentos[0].getAttribute("aria-pressed")).toBe("true");

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(linhasDaGrade()).toHaveLength(1);
    expect(rodape()).toContain(sem(formatarDinheiro(700)));

    await u.click(screen.getByRole("button", { name: `Responsável: Rafael, ${TEXTOS_PAINEL.limpar_filtro}` }));
    expect(linhasDaGrade()).toHaveLength(2);

    // A person-tag também filtra; tocar de novo limpa.
    const tagCasal = () => within(linhasDaGrade()[1]).getByRole("button", { name: "Filtrar por Casal" });
    expect(tagCasal().textContent).toBe("Casal");
    await u.click(tagCasal());
    expect(linhasDaGrade()).toHaveLength(1);
    await u.click(within(linhasDaGrade()[0]).getByRole("button", { name: "Filtrar por Casal" }));
    expect(linhasDaGrade()).toHaveLength(2);
  });

  it("importar outro Mês: o Painel abre o Mês importado", () => {
    definir({ faturas: [novembro], lancamentos: [] });
    render(<Painel titulo="Painel" />);
    act(() => falso.importarMes?.("2026-12"));
    expect(falso.abrirMes).toHaveBeenLastCalledWith("2026-12");
    expect(screen.getByRole("button", { name: "dezembro/26, escolher o Mês" })).toBeTruthy();
  });
});
