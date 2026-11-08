// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_CONFERENCIA, TEXTOS_FILTROS, TEXTOS_IMPORTAR, TEXTOS_PAINEL, mensagem } from "@/domain/mensagens";
import type { LinhaFatura, LinhaLancamento } from "@/data/faturas-repo";
import { ToastProvider } from "@/ui/Toast";
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
// O repositório de Faturas é falso: "Dispensar" e "Desfazer" só registram a
// chamada e respondem o que o teste mandar.
const repo = vi.hoisted(() => {
  type Gravar = (faturaId: string) => Promise<{ ok: boolean; codigo?: string }>;
  return {
    dispensarAlerta: vi.fn<Gravar>(async () => ({ ok: true })),
    desfazerDispensa: vi.fn<Gravar>(async () => ({ ok: true })),
  };
});
vi.mock("@/data/faturas-repo", () => ({ repoFaturas: () => repo }));
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
  alerta_dispensado_em: null,
  updated_at: "2026-11-03T12:00:00+00:00",
} as LinhaFatura;

const novembro = {
  ...outubro,
  id: "f11",
  mes: "2026-11",
  vencimento: "2026-11-06",
  total_despesas_centavos: 739454,
  total_creditos_centavos: 4322,
  saldo_anterior_centavos: 10,
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
    duvida_extracao: false,
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

/**
 * `n` Lançamentos da Fatura que batem com os totais dela: um crédito, uma
 * despesa grande e o resto de R$ 1,00, todos no cartão 5061.
 */
function faturaQueBate(f: LinhaFatura, n: number) {
  const linhas = Array.from({ length: n - 2 }, () => lanc(f.mes, { valor_centavos: 100 }));
  linhas.push(lanc(f.mes, { valor_centavos: -f.total_creditos_centavos }));
  linhas.push(lanc(f.mes, { valor_centavos: f.total_despesas_centavos - 100 * (n - 2) }));
  return linhas;
}

const cartao = (f: LinhaFatura, final = "5061", total = f.total_despesas_centavos) => ({
  id: `c-${f.id}-${final}`,
  fatura_id: f.id,
  final,
  total_centavos: total,
  updated_at: "2026-11-03T12:00:00+00:00",
});

const responsaveis = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1 },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2 },
];
const status = [
  { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
  { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
];

function definir(
  dados: { faturas?: unknown[]; lancamentos?: unknown[]; fatura_cartoes?: unknown[] },
  st = "pronto",
) {
  falso.banco = { faturas: [], fatura_cartoes: [], lancamentos: [], responsaveis, tipos: [], status, ...dados };
  falso.status = st;
  falso.versao++;
}

/** O Nome que a grade mostra na linha (sem o resumo oculto do VoiceOver). */
const nomeVisivel = (linha: HTMLElement) =>
  sem(within(linha).getAllByRole("cell")[1].querySelector("[data-nome]")?.textContent);

/** Linhas do corpo da grade (sem a de "vazio"). */
function linhasDaGrade() {
  const [, corpo] = screen.getAllByRole("rowgroup");
  return within(corpo)
    .queryAllByRole("row")
    .filter((r) => r.getAttribute("aria-label"));
}

function renderizar() {
  return render(<Painel titulo="Painel" />, { wrapper: ToastProvider });
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
    renderizar();
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
    expect(screen.getByRole("button", { name: "novembro/26, escolher o Mês" }).textContent).toBe("Nov/26");
  });

  it("outubro: hero, conta do total, 49 linhas e selo Fechado; ▶ mostra novembro separado", async () => {
    const out = faturaQueBate(outubro, 49);
    const nov = faturaQueBate(novembro, 46);
    definir({
      faturas: [outubro, novembro],
      fatura_cartoes: [cartao(outubro), cartao(novembro)],
      lancamentos: [...out, ...nov],
    });
    renderizar();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(falso.abrirMes).toHaveBeenLastCalledWith("2026-10");
    const hero = screen.getByRole("region", { name: "Fatura de outubro · vence 06/10/26" });
    expect(within(hero).getByText("Fatura de outubro · vence 06/10/26").className).toContain("texto-eyebrow");
    expect(sem(hero.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 7.713,67");
    expect(within(hero).getByText("✓ Bate com o total a pagar")).toBeTruthy();
    // Conferência: "✓ Conferido · 49 lançamentos", sem faixa nem bolinha.
    const conferido = within(hero).getByText(TEXTOS_CONFERENCIA.conferido);
    expect(conferido.className).toContain("text-accent");
    expect(sem(conferido.parentElement?.textContent)).toBe("✓ Conferido·49 lançamentos");
    expect(screen.queryByRole("region", { name: TEXTOS_CONFERENCIA.faixa })).toBeNull();
    expect(document.querySelector(".bg-verify")).toBeNull();
    expect(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.verificar }).getAttribute("aria-pressed")).toBe("false");
    expect(linhasDaGrade()).toHaveLength(49);
    expect(rodape()).toContain("R$ 7.687,77");
    expect(screen.getAllByText(TEXTOS_PAINEL.fechado).length).toBeGreaterThan(0);

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    const heroNov = screen.getByRole("region", { name: "Fatura de novembro · vence 06/11/26" });
    expect(sem(heroNov.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 7.351,42");
    expect(within(heroNov).getByText("✓ Bate com o total a pagar")).toBeTruthy();
    expect(within(heroNov).getByText(TEXTOS_CONFERENCIA.conferido)).toBeTruthy();
    const linhas = linhasDaGrade();
    expect(linhas).toHaveLength(46);
    const idsOutubro = new Set(out.map((l) => l.nome));
    expect(linhas.some((r) => idsOutubro.has(nomeVisivel(r)))).toBe(false);
  });

  it("Mês sem Fatura: 'Fatura ainda não importada' com Importar fatura, grade vazia e sem selo", async () => {
    definir({ faturas: [outubro], lancamentos: [lanc("2026-10")] });
    renderizar();
    expect(screen.getByText(TEXTOS_PAINEL.sem_fatura)).toBeTruthy();
    // Sem selo da Conferência, sem faixa e sem a pílula "Verificar".
    expect(screen.queryByText(/Conferido|Diferença/)).toBeNull();
    expect(screen.queryByRole("region", { name: TEXTOS_CONFERENCIA.faixa })).toBeNull();
    expect(screen.queryByRole("button", { name: TEXTOS_CONFERENCIA.verificar })).toBeNull();
    expect(screen.queryByText(TEXTOS_PAINEL.fechado)).toBeNull();
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText(TEXTOS_PAINEL.sem_lancamentos)).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
    // Um no topo e um no cartão; o do cartão abre a janela.
    const botoes = screen.getAllByRole("button", { name: TEXTOS_IMPORTAR.botao });
    expect(botoes).toHaveLength(2);
    expect(screen.queryByTestId("janela-importar")).toBeNull();
    await userEvent.setup().click(botoes[1]);
    expect(screen.getByTestId("janela-importar")).toBeTruthy();
  });

  it("sem nenhuma Fatura, a grade vazia chama para importar a primeira", () => {
    renderizar();
    expect(screen.getByText(mensagem("painel.vazio"))).toBeTruthy();
  });

  it("carregando: esqueleto, nunca tela branca; erro: Tentar de novo relê as tabelas", async () => {
    definir({}, "carregando");
    const { unmount } = renderizar();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    unmount();

    definir({}, "erro");
    renderizar();
    expect(screen.getByText(mensagem("carregar.falhou"))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(6);
  });

  it("trocar de Mês mostra o esqueleto enquanto o Mês novo carrega", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    renderizar();
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
    renderizar();
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("excluídos ficam fora da grade, do rodapé, da barra, da contagem e da conta do hero", async () => {
    // Outubro: 49 que somam 7.687,77 e um excluído de R$ 50,00.
    const out = lancamentosQueSomam("2026-10", 49, 768777);
    const excluido = lanc("2026-10", { valor_centavos: 5000, responsavel_id: "r-casal", excluido_em: "2026-11-05T12:00:00+00:00" });
    definir({ faturas: [outubro], lancamentos: [...out, excluido] });
    renderizar();
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
    renderizar();
    const u = userEvent.setup();
    const [segmento] = within(screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao })).getAllByRole("button");
    await u.click(segmento);
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText(TEXTOS_FILTROS.sem_resultado)).toBeTruthy();
    expect(screen.queryByText(TEXTOS_PAINEL.sem_lancamentos)).toBeNull();
    // "Limpar filtros" na barra e na grade vazia; o da grade limpa tudo.
    const limpar = screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros });
    expect(limpar).toHaveLength(2);
    await u.click(limpar[1]);
    expect(linhasDaGrade()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
  });

  it("Lançamentos sem Responsável: segmento e legenda 'Sem responsável'; a tag mostra —", () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11", { valor_centavos: 5000 })] });
    renderizar();
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    const [segmento] = within(barra).getAllByRole("button");
    expect(segmento.getAttribute("aria-label")).toBe("Filtrar por Sem responsável");
    expect(segmento.className).toContain("bg-text-muted");
    expect(screen.getByRole("button", { name: TEXTOS_PAINEL.sem_responsavel })).toBeTruthy();
    const [linha] = linhasDaGrade();
    expect(within(linha).getAllByRole("cell")[5].textContent).toBe("—");
  });

  it("filtro: segmento filtra a grade e o rodapé; vale ao trocar de Mês; Limpar filtros limpa", async () => {
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
    renderizar();
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

    // A coluna Responsável da barra mostra a escolha.
    const pilulaResp = screen.getByRole("button", { name: "Responsável: Rafael" });
    expect(pilulaResp.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pilulaResp.className).toContain("bg-selection");
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros }));
    expect(linhasDaGrade()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Responsável", expanded: false })).toBeTruthy();

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
    renderizar();
    act(() => falso.importarMes?.("2026-12"));
    expect(falso.abrirMes).toHaveBeenLastCalledWith("2026-12");
    expect(screen.getByRole("button", { name: "dezembro/26, escolher o Mês" })).toBeTruthy();
  });
});

describe("Conferência e marca verificar (História 2.5)", () => {
  /**
   * Novembro com BELLA PIETRA lida R$ 80,00 em vez de R$ 800,00 no cartão
   * 8673 (diferença de R$ 720,00); o 5061 bate.
   */
  function comDiferenca(extraFatura: Partial<LinhaFatura> = {}) {
    const f = { ...novembro, total_despesas_centavos: 100_000, total_creditos_centavos: 0, saldo_anterior_centavos: 0, total_a_pagar_centavos: 28_000, ...extraFatura } as LinhaFatura;
    const linhas = [
      lanc("2026-11", { nome: "PADARIA", final_cartao: "5061", valor_centavos: 10_000, responsavel_id: "r-rafael" }),
      lanc("2026-11", { nome: "BELLA PIETRA", final_cartao: "8673", valor_centavos: 8_000, responsavel_id: "r-casal" }),
      lanc("2026-11", { nome: "MERCADO", final_cartao: "8673", valor_centavos: 10_000, responsavel_id: "r-rafael", duvida_extracao: true }),
    ];
    definir({
      faturas: [f, outubro],
      fatura_cartoes: [cartao(f, "5061", 10_000), cartao(f, "8673", 90_000)],
      lancamentos: linhas,
    });
    return linhas;
  }
  // O nome acessível leva o espaço inseparável do formatador.
  const DIFERENCA_720 = `Diferença de ${formatarDinheiro(72_000)}, ver lançamentos para verificar`;
  const pilula = () => screen.getByRole("button", { name: TEXTOS_CONFERENCIA.verificar });
  const faixa = () => screen.queryByRole("region", { name: TEXTOS_CONFERENCIA.faixa });

  it("selo, faixa e bolinhas nas linhas do cartão com diferença", () => {
    comDiferenca();
    renderizar();
    const hero = screen.getByRole("region", { name: "Fatura de novembro · vence 06/11/26" });
    const selo = within(hero).getByRole("button", { name: DIFERENCA_720 });
    expect(selo.className).toContain("bg-alert-warning-bg");
    expect(sem(selo.parentElement?.textContent)).toBe("⚠ Diferença de R$ 720,00·3 lançamentos");
    // A conta do total continua igual, embaixo.
    expect(within(hero).getByText("✓ Bate com o total a pagar")).toBeTruthy();

    expect(faixa()?.className).toContain("bg-alert-warning-bg");
    expect(sem(faixa()?.textContent)).toContain("A soma dos lançamentos ficou R$ 720,00 abaixo do total da fatura.");
    expect(sem(faixa()?.textContent)).toContain("A diferença está no cartão final 8673.");

    const [padaria, bella, mercado] = linhasDaGrade();
    expect(padaria.querySelector(".bg-verify")).toBeNull();
    expect(bella.querySelector(".bg-verify")).toBeTruthy();
    expect(mercado.querySelector(".bg-verify")).toBeTruthy();
    expect(bella.getAttribute("aria-label")?.endsWith("verificar este lançamento")).toBe(true);
  });

  it("tocar no selo liga Verificar: só as marcadas, dúvidas primeiro; rodapé soma a grade; a pílula desliga", async () => {
    comDiferenca();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: DIFERENCA_720 }));
    expect(pilula().getAttribute("aria-pressed")).toBe("true");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MERCADO", "BELLA PIETRA"]);
    expect(rodape()).toContain("R$ 180,00");
    // Com coluna ordenada, vale a coluna.
    await u.click(screen.getByRole("button", { name: "Nome" }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["BELLA PIETRA", "MERCADO"]);
    await u.click(pilula());
    expect(pilula().getAttribute("aria-pressed")).toBe("false");
    expect(linhasDaGrade()).toHaveLength(3);
  });

  it("Ver lançamentos liga o filtro; combina com Responsável por E; vazio; vale ao trocar de Mês", async () => {
    comDiferenca();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.ver_lancamentos }));
    expect(pilula().getAttribute("aria-pressed")).toBe("true");
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    await u.click(within(barra).getByRole("button", { name: "Filtrar por Rafael" }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MERCADO"]);
    await u.click(within(barra).getByRole("button", { name: "Filtrar por Casal" }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["BELLA PIETRA"]);

    // Outubro (sem Lançamentos aqui) mantém o filtro ligado.
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(pilula().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(TEXTOS_CONFERENCIA.sem_para_verificar)).toBeTruthy();
  });

  it("Dispensar: grava pelo repositório e mostra 'Alerta dispensado · Desfazer'; Desfazer grava null", async () => {
    comDiferenca();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.dispensar }));
    expect(repo.dispensarAlerta).toHaveBeenCalledWith("f11");
    expect(screen.getByText(TEXTOS_CONFERENCIA.alerta_dispensado)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repo.desfazerDispensa).toHaveBeenCalledWith("f11");
  });

  it("Desfazer que falha (sem conexão): mostra a mensagem do código", async () => {
    comDiferenca();
    repo.desfazerDispensa.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.dispensar }));
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repo.desfazerDispensa).toHaveBeenCalledWith("f11");
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
  });

  it("Verificar fica guardado num Mês sem Fatura (sem pílula, grade sem filtro) e volta ligado", async () => {
    comDiferenca();
    falso.banco.lancamentos.push(lanc("2026-12", { nome: "DEZEMBRO" }));
    renderizar();
    const u = userEvent.setup();
    await u.click(pilula());
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MERCADO", "BELLA PIETRA"]);

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect(screen.queryByRole("button", { name: TEXTOS_CONFERENCIA.verificar })).toBeNull();
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["DEZEMBRO"]);
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(pilula().getAttribute("aria-pressed")).toBe("true");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MERCADO", "BELLA PIETRA"]);
    for (const linha of linhasDaGrade()) expect(linha.querySelector(".bg-verify")).toBeTruthy();
  });

  it("dispensada: sem faixa; selo e bolinhas continuam", () => {
    comDiferenca({ alerta_dispensado_em: "2026-11-08T15:00:00+00:00" });
    renderizar();
    expect(faixa()).toBeNull();
    expect(screen.getByRole("button", { name: DIFERENCA_720 })).toBeTruthy();
    expect(document.querySelectorAll(".bg-verify")).toHaveLength(2);
  });

  it("Dispensar sem conexão: mensagem de conexao.gravar_sem_conexao e a faixa fica", async () => {
    comDiferenca();
    repo.dispensarAlerta.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.dispensar }));
    expect(screen.getByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(screen.queryByText(TEXTOS_CONFERENCIA.alerta_dispensado)).toBeNull();
    expect(faixa()).toBeTruthy();
  });

  it("só créditos: faixa dos créditos e bolinha nos créditos", () => {
    const f = { ...novembro, total_despesas_centavos: 10_000, total_creditos_centavos: 1_000 } as LinhaFatura;
    definir({
      faturas: [f],
      fatura_cartoes: [cartao(f, "5061", 10_000)],
      lancamentos: [
        lanc("2026-11", { nome: "PADARIA", valor_centavos: 10_000 }),
        lanc("2026-11", { nome: "ESTORNO", valor_centavos: -500 }),
      ],
    });
    renderizar();
    expect(screen.getByRole("button", { name: `Diferença de ${formatarDinheiro(500)}, ver lançamentos para verificar` })).toBeTruthy();
    expect(sem(faixa()?.textContent)).toContain("A soma dos créditos ficou R$ 5,00 abaixo do total de créditos da fatura.");
    const [padaria, estorno] = linhasDaGrade();
    expect(padaria.querySelector(".bg-verify")).toBeNull();
    expect(estorno.querySelector(".bg-verify")).toBeTruthy();
  });
});

describe("Barra de filtros e busca (História 2.6)", () => {
  const pilula = (nome: string) => screen.getByRole("button", { name: nome, expanded: false });
  const busca = () => screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar });
  const anuncio = () =>
    screen.getAllByRole("status").find((s) => s.className.includes("sr-only") && !s.getAttribute("aria-busy"));

  it("busca: Nome ou Apelido, sem acento; rodapé soma a grade; anuncia; vale ao trocar de Mês", async () => {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [
        lanc("2026-11", { nome: "MAGALU MAGALU", apelido: "Lava e seca", valor_centavos: 44_589 }),
        lanc("2026-11", { nome: "PADARIA", valor_centavos: 1000 }),
        lanc("2026-10", { nome: "MAGALU OUTUBRO", valor_centavos: 500 }),
        lanc("2026-10", { nome: "MERCADO", valor_centavos: 700 }),
      ],
    });
    renderizar();
    const u = userEvent.setup();
    expect(anuncio()?.textContent).toBe("");
    await u.type(busca(), "lava");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["Lava e seca · MAGALU MAGALU"]);
    expect(rodape()).toContain("R$ 445,89");
    expect(anuncio()?.textContent).toBe("1 lançamento");
    await u.clear(busca());
    await u.type(busca(), "magalu");
    expect(linhasDaGrade()).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect((busca() as HTMLInputElement).value).toBe("magalu");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MAGALU OUTUBRO"]);
    // Trocar de Mês não é mudança de filtro: o anúncio volta a ficar vazio.
    expect(anuncio()?.textContent).toBe("");
  });

  it("cartão: outubro escolhe 3967, novembro fica vazio com Limpar filtros e 3967 com 0", async () => {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [
        lanc("2026-10", { final_cartao: "3967" }),
        lanc("2026-10", { final_cartao: "8673" }),
        lanc("2026-11", { final_cartao: "8673" }),
        lanc("2026-11", { final_cartao: "5061" }),
      ],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    await u.click(pilula("Cartão"));
    const dialogo = screen.getByRole("dialog", { name: "Cartão (pode marcar vários)" });
    expect(within(dialogo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Cartão final 3967, 1 lançamento",
      "Cartão final 8673, 1 lançamento",
    ]);
    await u.click(within(dialogo).getByRole("checkbox", { name: "Cartão final 3967, 1 lançamento" }));
    await u.click(within(dialogo).getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(linhasDaGrade()).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect(pilula("Cartão: 3967")).toBeTruthy();
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText(TEXTOS_FILTROS.sem_resultado)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toHaveLength(2);
    await u.click(pilula("Cartão: 3967"));
    expect(
      within(screen.getByRole("dialog")).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label")),
    ).toEqual(["Cartão final 3967, 0 lançamentos", "Cartão final 5061, 1 lançamento", "Cartão final 8673, 1 lançamento"]);
  });

  it("popover com caixas marcadas: tocar fora não muda a grade", async () => {
    definir({
      faturas: [novembro],
      lancamentos: [lanc("2026-11", { responsavel_id: "r-casal" }), lanc("2026-11"), lanc("2026-11")],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(pilula("Responsável"));
    await u.click(screen.getByRole("checkbox", { name: "Casal, 1 lançamento" }));
    await u.click(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linhasDaGrade()).toHaveLength(3);
    expect(pilula("Responsável")).toBeTruthy();
  });

  it("produção hoje: sem Responsável, Tipo e Status, cada valor 0 e o 'Sem …' com todos; grade sem filtro", async () => {
    definir({ faturas: [novembro], lancamentos: Array.from({ length: 49 }, () => lanc("2026-11", { status_id: null })) });
    renderizar();
    const u = userEvent.setup();
    expect(linhasDaGrade()).toHaveLength(49);
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
    await u.click(pilula("Responsável"));
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Rafael, 0 lançamentos",
      "Casal, 0 lançamentos",
      "Sem responsável, 49 lançamentos",
    ]);
    await u.keyboard("{Escape}");
    await u.click(pilula("Status"));
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Não pago, 0 lançamentos",
      "Pago, 0 lançamentos",
      "Sem status, 49 lançamentos",
    ]);
  });

  it("hero: com {Casal, Rafael}, tocar em Casal deixa só Casal; de novo limpa a coluna", async () => {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { responsavel_id: "r-rafael" }),
        lanc("2026-11", { responsavel_id: "r-casal" }),
        lanc("2026-11"),
      ],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(pilula("Responsável"));
    await u.click(screen.getByRole("checkbox", { name: "Rafael, 1 lançamento" }));
    await u.click(screen.getByRole("checkbox", { name: "Casal, 1 lançamento" }));
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(pilula("Responsável: Rafael, Casal")).toBeTruthy();
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    const casal = within(barra).getByRole("button", { name: "Filtrar por Casal" });
    expect(casal.getAttribute("aria-pressed")).toBe("true");
    expect(within(barra).getByRole("button", { name: "Filtrar por Sem responsável" }).className).toContain("opacity-40");

    await u.click(casal);
    expect(pilula("Responsável: Casal")).toBeTruthy();
    expect(linhasDaGrade()).toHaveLength(1);
    await u.click(casal);
    expect(pilula("Responsável")).toBeTruthy();
    expect(linhasDaGrade()).toHaveLength(3);
  });

  it("Ver lançamentos com busca ativa: liga Verificar e a busca continua", async () => {
    const f = { ...novembro, total_despesas_centavos: 100_000, total_creditos_centavos: 0 } as LinhaFatura;
    definir({
      faturas: [f],
      fatura_cartoes: [cartao(f, "5061", 10_000), cartao(f, "8673", 90_000)],
      lancamentos: [
        lanc("2026-11", { nome: "PADARIA X", final_cartao: "5061", valor_centavos: 10_000 }),
        lanc("2026-11", { nome: "BELLA X", final_cartao: "8673", valor_centavos: 8_000 }),
        lanc("2026-11", { nome: "MERCADO", final_cartao: "8673", valor_centavos: 10_000 }),
      ],
    });
    renderizar();
    const u = userEvent.setup();
    await u.type(busca(), "x");
    expect(linhasDaGrade()).toHaveLength(2);
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.ver_lancamentos }));
    expect(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.verificar }).getAttribute("aria-pressed")).toBe("true");
    expect((busca() as HTMLInputElement).value).toBe("x");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["BELLA X"]);
  });

  it("só Verificar sem linhas marcadas: 'Nenhum lançamento para verificar' com Limpar filtros", async () => {
    definir({ faturas: [novembro], fatura_cartoes: [cartao(novembro)], lancamentos: faturaQueBate(novembro, 3) });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.verificar }));
    expect(screen.getByText(TEXTOS_CONFERENCIA.sem_para_verificar)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toHaveLength(2);
    expect(anuncio()?.textContent).toBe("0 lançamentos");
  });

  it("Limpar filtros aparece com a ordem fora da padrão e volta à ordem da fatura", async () => {
    definir({
      faturas: [novembro],
      lancamentos: [lanc("2026-11", { nome: "B" }), lanc("2026-11", { nome: "A" })],
    });
    renderizar();
    const u = userEvent.setup();
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Nome" }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["A", "B"]);
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["B", "A"]);
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
  });
});
