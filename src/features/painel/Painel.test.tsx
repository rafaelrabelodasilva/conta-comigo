// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  TEXTOS_CONFERENCIA,
  TEXTOS_FILTROS,
  TEXTOS_IMPORTAR,
  TEXTOS_LANCAMENTO,
  TEXTOS_PAINEL,
  mensagem,
} from "@/domain/mensagens";
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
  /** Status de uma tabela (os outros seguem `status`). */
  statusTabelas: {} as Record<string, string>,
  mes: null as string | null,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
  abrirMes: vi.fn(),
  importarMes: null as ((mes: string) => void) | null,
  /** O gerenciador ainda não trocou de Mês (a memória é do Mês anterior). */
  congelarMes: false,
  /** Há conexão? (`useConexao`). */
  online: true,
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
        : tabela === "pagamento_itens"
          ? {
              // Como `lancamentos`, só o Mês aberto (os itens guardam o `mes`).
              status: falso.mes === null ? "carregando" : (falso.statusTabelas[tabela] ?? falso.status),
              linhas: linhas.filter((l) => (l as { mes: string }).mes === falso.mes),
              mes: falso.mes,
            }
          : { status: falso.statusTabelas[tabela] ?? falso.status, linhas };
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
// O repositório de Lançamentos é falso: grava no "banco" do gerenciador
// falso e avisa as telas, como o de verdade faz com o otimismo e a resposta.
const repoL = vi.hoisted(() => {
  type Linha = Record<string, unknown> & { id: string };
  type Res = Promise<{ ok: true; linha: Linha } | { ok: false; codigo: string }>;
  return {
    gravar: null as ((id: string, corpo: Record<string, unknown>) => Linha) | null,
    atualizar: vi.fn<(id: string, m: Record<string, unknown>, o?: { junto?: string[] }) => Res>(),
    incluir: vi.fn<(novo: Record<string, unknown>) => Res>(),
    excluir: vi.fn<(id: string, o?: { junto?: string[] }) => Res>(),
    restaurar: vi.fn<(id: string, o?: { junto?: string[] }) => Res>(),
    desvincular: vi.fn<(id: string) => Res>(),
    religar: vi.fn<(id: string, mae: Record<string, unknown>) => Res>(),
    classificarEmLote: vi.fn<(entradas: { id: string; campos: Record<string, unknown> }[]) => Promise<unknown>>(),
    desfazerLote: vi.fn<(antes: unknown[]) => Promise<unknown>>(),
    propagarAosPrevistos: vi.fn<(parcelas: unknown[]) => Promise<unknown>>(async () => ({ ok: true, preenchidos: 0, aPerguntar: [] })),
    programarDivida: vi.fn<(itens: Record<string, unknown>[]) => Promise<unknown>>(),
  };
});
// O repositório de Blocos é falso: "Salvar" só registra o pedido e responde o que o teste mandar.
const repoB = vi.hoisted(() => ({
  salvar: vi.fn<(pedido: Record<string, unknown>) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
  excluir: vi.fn<(id: string) => Promise<{ ok: boolean; codigo?: string }>>(async () => ({ ok: true })),
}));
vi.mock("@/data/blocos-repo", () => ({ repoBlocos: () => repoB }));
// O repositório de Pagamentos é falso: "Aplicar" e o "Desfazer" do aviso só registram o pedido.
const repoP = vi.hoisted(() => ({
  aplicar: vi.fn<(pedido: Record<string, unknown>) => Promise<unknown>>(),
  desfazer: vi.fn<(id: string) => Promise<unknown>>(),
}));
vi.mock("@/data/pagamentos-repo", () => ({ repoPagamentos: () => repoP }));
// A conexão é do teste: `useConexao` lê `falso.online` e o Painel redesenha quando ele muda.
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
    estaOnline: () => falso.online,
    aoVoltar: () => () => {},
  };
});
vi.mock("@/data/lancamentos-repo", () => ({
  repoLancamentos: () => repoL,
  mudancaDaColuna: (m: { coluna: string; valor: unknown }) => ({ [m.coluna]: m.valor }),
}));
// O roteador do Next não existe no teste: "Ir para revisão" só registra o destino.
const roteador = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => roteador }));
vi.mock("@/features/importar/ImportarFatura", () => ({
  ImportarFatura: ({
    aberta,
    aoImportar,
    aoIrParaRevisao,
  }: {
    aberta: boolean;
    aoImportar: (mes: string) => void;
    aoIrParaRevisao: () => void;
  }) => {
    falso.importarMes = aoImportar;
    return aberta ? (
      <div data-testid="janela-importar">
        <button type="button" onClick={aoIrParaRevisao}>
          ir-para-revisao-teste
        </button>
      </div>
    ) : null;
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
  dados: { faturas?: unknown[]; lancamentos?: unknown[]; fatura_cartoes?: unknown[]; blocos?: unknown[]; tipos?: unknown[] },
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

/** Muda o "banco" do gerenciador falso e avisa as telas (um evento do Realtime). */
function mudarBanco(tabela: string, mudar: (linhas: unknown[]) => unknown[]) {
  act(() => {
    falso.banco = { ...falso.banco, [tabela]: mudar(falso.banco[tabela] ?? []) };
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

let versaoGravada = 0;
function gravarNoBanco(id: string, corpo: Record<string, unknown>) {
  versaoGravada++;
  let gravada: Record<string, unknown> & { id: string } = { id };
  mudarBanco("lancamentos", (ls) =>
    ls.map((l) => {
      const linha = l as { id: string };
      if (linha.id !== id) return l;
      gravada = { ...linha, ...corpo, updated_at: `2026-11-08T00:14:00.00000${versaoGravada}+00:00` };
      return gravada;
    }),
  );
  return gravada;
}

beforeEach(() => {
  versaoGravada = 0;
  // Com `junto` (os Ajustes da mãe), grava as linhas todas, como o `in (ids)` do repositório.
  const comJunto = (id: string, o: { junto?: string[] } | undefined, corpo: Record<string, unknown>) => {
    for (const j of o?.junto ?? []) gravarNoBanco(j, corpo);
    return { ok: true as const, linha: gravarNoBanco(id, corpo) };
  };
  repoL.atualizar.mockImplementation(async (id, m, o) => comJunto(id, o, m));
  repoL.excluir.mockImplementation(async (id, o) => comJunto(id, o, { excluido_em: "2026-11-08T00:14:00Z" }));
  repoL.restaurar.mockImplementation(async (id, o) => comJunto(id, o, { excluido_em: null }));
  repoL.desvincular.mockImplementation(async (id) => ({ ok: true, linha: gravarNoBanco(id, { ajuste_de_id: null }) }));
  repoL.religar.mockImplementation(async (id, mae) => ({
    ok: true,
    linha: gravarNoBanco(id, { ajuste_de_id: mae.id, tipo_id: mae.tipo_id, responsavel_id: mae.responsavel_id }),
  }));
  // "Programar dívida" (6.6): grava as colunas nos itens e devolve as linhas, como a RPC.
  repoL.programarDivida.mockImplementation(async (itens) => ({
    ok: true as const,
    linhas: itens.map((i) =>
      gravarNoBanco(i.id as string, {
        vencimento_combinado: i.vencimento_combinado,
        vencimento_observacao: i.vencimento_observacao,
        ...("editado_em" in i ? { editado_em: i.editado_em } : {}),
      }),
    ),
  }));
  repoL.incluir.mockImplementation(async (novo) => {
    const linha = { ...lanc(novo.mes as string), ...novo, id: "novo" };
    if (novo.mes === falso.mes) mudarBanco("lancamentos", (ls) => [...ls, linha]);
    return { ok: true, linha };
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
  vi.clearAllMocks();
  seq = 0;
  falso.mes = null;
  falso.statusLancamentos = null;
  falso.statusTabelas = {};
  falso.congelarMes = false;
  falso.online = true;
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

  const previsto = (mes: string, extra: Partial<LinhaLancamento> = {}) =>
    lanc(mes, {
      nome: "MAGALU",
      lancado_por: "sistema",
      fatura_id: null,
      final_cartao: null,
      ordem_fatura: null,
      parcela_n: 6,
      parcela_total: 10,
      valor_centavos: 44589,
      ...extra,
    } as Partial<LinhaLancamento>);

  it("História 3.5: Mês futuro sem Fatura mostra os previstos na grade, com o selo, sem Conferência", () => {
    definir({ faturas: [outubro], lancamentos: [lanc("2026-10"), previsto("2026-11")] });
    renderizar();
    expect(screen.getByText(TEXTOS_PAINEL.sem_fatura)).toBeTruthy();
    const linhas = linhasDaGrade();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].querySelector("[data-previsto]")?.textContent).toBe("Previsto");
    expect(screen.queryByText(/Conferido|Diferença/)).toBeNull();
    expect(screen.queryByRole("button", { name: TEXTOS_CONFERENCIA.verificar })).toBeNull();
    expect(rodape()).toContain("R$ 445,89");
  });

  it("História 3.5: num Mês com Fatura, o previsto aparece na grade mas não muda a Conferência nem o Total a pagar", () => {
    const nov = faturaQueBate(novembro, 46);
    definir({
      faturas: [outubro, novembro],
      fatura_cartoes: [cartao(outubro), cartao(novembro)],
      lancamentos: [...nov, previsto("2026-11", { nome: "RENNER" })],
    });
    renderizar();
    const hero = screen.getByRole("region", { name: "Fatura de novembro · vence 06/11/26" });
    expect(sem(hero.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 7.351,42");
    expect(within(hero).getByText("✓ Bate com o total a pagar")).toBeTruthy();
    expect(sem(within(hero).getByText(TEXTOS_CONFERENCIA.conferido).parentElement?.textContent)).toBe("✓ Conferido·46 lançamentos");
    expect(document.querySelector(".bg-verify")).toBeNull();
    // A grade tem as 46 da Fatura e o previsto.
    expect(linhasDaGrade()).toHaveLength(47);
  });

  it("'Ir para revisão' da janela de importação leva à tela Revisar", async () => {
    renderizar();
    roteador.push.mockClear();
    await userEvent.setup().click(screen.getAllByRole("button", { name: TEXTOS_IMPORTAR.botao })[0]);
    await userEvent.setup().click(screen.getByRole("button", { name: "ir-para-revisao-teste" }));
    expect(roteador.push).toHaveBeenCalledExactlyOnceWith("/revisar");
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
    expect(falso.recarregar).toHaveBeenCalledTimes(9);
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
    // As caixas do popover (a grade também tem as suas, de seleção).
    expect(within(screen.getByRole("dialog")).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Rafael, 0 lançamentos",
      "Casal, 0 lançamentos",
      "Sem responsável, 49 lançamentos",
    ]);
    await u.keyboard("{Escape}");
    await u.click(pilula("Status"));
    expect(within(screen.getByRole("dialog")).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Não pago, 0 lançamentos",
      "Pago, 0 lançamentos",
      "Atrasado, 0 lançamentos",
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

describe("Painel do Lançamento (História 2.7)", () => {
  const painelLateral = () => screen.queryByRole("complementary");
  const linhaPorNome = (nome: string) => linhasDaGrade().find((r) => nomeVisivel(r) === nome)!;
  const corpoDa = (linha: HTMLElement) => within(linha).getAllByRole("cell")[3];

  it("tocar no corpo abre o painel; outra linha troca; ✕ e Esc fecham; o conteúdo reserva 400 px", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11"), lanc("2026-11")] });
    const { container } = renderizar();
    const u = userEvent.setup();
    expect(painelLateral()).toBeNull();
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    expect(within(painelLateral()!).getByRole("heading", { name: "LOJA 1" })).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).className).toContain("lg:pr-painel-lateral");
    expect(linhaPorNome("LOJA 1").getAttribute("data-aberta")).toBe("true");
    await u.click(corpoDa(linhaPorNome("LOJA 2")));
    expect(within(painelLateral()!).getByRole("heading", { name: "LOJA 2" })).toBeTruthy();
    await u.click(within(painelLateral()!).getByRole("button", { name: "Fechar" }));
    expect(painelLateral()).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).not.toContain("lg:pr-painel-lateral");
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.keyboard("{Escape}");
    expect(painelLateral()).toBeNull();
  });

  it("com o painel aberto, tocar na caixa de outra linha seleciona e o painel não muda", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11"), lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.click(within(linhaPorNome("LOJA 2")).getByRole("checkbox", { name: "Selecionar LOJA 2" }));
    expect(within(painelLateral()!).getByRole("heading", { name: "LOJA 1" })).toBeTruthy();
    expect(linhaPorNome("LOJA 2").className).toContain("bg-selection");
    expect(linhaPorNome("LOJA 1").className).not.toContain("bg-selection");
  });

  it("classificar no painel: grava, a barra do hero muda e a linha aberta fica na grade fora do filtro (opção A)", async () => {
    definir({
      faturas: [novembro],
      lancamentos: [lanc("2026-11", { valor_centavos: 1000 }), lanc("2026-11", { valor_centavos: 2000 })],
    });
    renderizar();
    const u = userEvent.setup();
    // Filtra "Sem responsável" pela barra do hero.
    await u.click(within(screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao })).getAllByRole("button")[0]);
    expect(linhasDaGrade()).toHaveLength(2);
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.selectOptions(within(painelLateral()!).getByLabelText("Responsável"), "r-casal");
    expect(repoL.atualizar).toHaveBeenCalledWith("l1", { responsavel_id: "r-casal" });
    // A barra do hero já mostra Casal.
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    expect(within(barra).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toContain("Filtrar por Casal");
    // A linha aberta continua na grade; o total e o anúncio seguem o filtro.
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["LOJA 1", "LOJA 2"]);
    expect(rodape()).toContain(sem(formatarDinheiro(2000)));
    expect(screen.getByText("1 lançamento")).toBeTruthy();
    // Fechar o painel tira a linha.
    await u.click(within(painelLateral()!).getByRole("button", { name: "Fechar" }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["LOJA 2"]);
  });

  it("Excluir pelo ⋯: confirma, grava, o painel fecha e 'Excluído · Desfazer' restaura o mesmo id", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11"), lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.click(within(linhaPorNome("LOJA 1")).getByRole("checkbox"));
    await u.click(within(linhaPorNome("LOJA 1")).getByRole("button", { name: "Ações de LOJA 1" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    const confirmar = screen.getByRole("alertdialog", { name: "Excluir lançamento?" });
    await u.click(within(confirmar).getByRole("button", { name: "Excluir lançamento" }));
    expect(repoL.excluir).toHaveBeenCalledWith("l1");
    expect(painelLateral()).toBeNull();
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["LOJA 2"]);
    expect(screen.getByText("Excluído")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repoL.restaurar).toHaveBeenCalledWith("l1");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["LOJA 1", "LOJA 2"]);
    // Saiu da seleção.
    expect((within(linhaPorNome("LOJA 1")).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("Excluir pelo rodapé do painel; falha mostra salvar.falhou", async () => {
    repoL.excluir.mockImplementation(async () => ({ ok: false, codigo: "salvar.falhou" }));
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.click(within(painelLateral()!).getByRole("button", { name: "Excluir" }));
    await u.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    expect(screen.getByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(linhasDaGrade()).toHaveLength(1);
  });

  it("excluído em outro aparelho: o painel fecha com o aviso", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    renderizar();
    await userEvent.setup().click(corpoDa(linhaPorNome("LOJA 1")));
    mudarBanco("lancamentos", (ls) =>
      ls.map((l) => ({ ...(l as object), excluido_em: "2026-11-08T00:30:00+00:00", updated_at: "2026-11-08T00:30:00+00:00" })),
    );
    expect(painelLateral()).toBeNull();
    expect(screen.getByText(TEXTOS_LANCAMENTO.excluido_em_outro_aparelho)).toBeTruthy();
  });

  it("＋ Lançamento ao lado de Importar fatura: incluído no Mês aberto abre o painel dele", async () => {
    definir({ faturas: [novembro], fatura_cartoes: [cartao(novembro)], lancamentos: [lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    const novo = screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo });
    expect(novo.nextElementSibling?.textContent).toContain(TEXTOS_IMPORTAR.botao);
    await u.click(novo);
    const painel = painelLateral()!;
    expect(within(painel).getByRole("heading", { name: "Novo lançamento" })).toBeTruthy();
    await u.type(within(painel).getByLabelText("Nome"), "PADARIA");
    await u.type(within(painel).getByLabelText("Valor"), "12,50");
    await u.click(within(painel).getByRole("checkbox", { name: "Corrige a leitura da fatura" }));
    await u.selectOptions(within(painel).getByLabelText("Cartão"), "5061");
    await u.click(within(painel).getByRole("button", { name: "Incluir" }));
    expect(repoL.incluir).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "PADARIA", mes: "2026-11", fatura_id: "f11", final_cartao: "5061", lancado_por: "manual" }),
    );
    expect(within(painelLateral()!).getByRole("heading", { name: "PADARIA" })).toBeTruthy();
    expect(linhasDaGrade().map(nomeVisivel)).toContain("PADARIA");
  });

  it("＋ Lançamento com data de outro Mês: toast 'Lançamento incluído em dezembro/26'", async () => {
    definir({ faturas: [novembro], lancamentos: [] });
    falso.banco.config_ciclo = [
      { id: "c1", dia_fechamento: 29, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" },
    ];
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo }));
    const painel = painelLateral()!;
    await u.type(within(painel).getByLabelText("Nome"), "MERCADO");
    await u.type(within(painel).getByLabelText("Valor"), "50");
    fireEvent.change(within(painel).getByLabelText("Data da compra"), { target: { value: "2026-11-20" } });
    await u.click(within(painel).getByRole("button", { name: "Incluir" }));
    expect(repoL.incluir).toHaveBeenCalledWith(expect.objectContaining({ mes: "2026-12", fatura_id: null, final_cartao: null }));
    expect(painelLateral()).toBeNull();
    expect(screen.getByText("Lançamento incluído em dezembro/26")).toBeTruthy();
  });

  it("trocar de Mês limpa a seleção e fecha o painel", async () => {
    definir({ faturas: [outubro, novembro], lancamentos: [lanc("2026-11"), lanc("2026-10")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaPorNome("LOJA 1")).getByRole("checkbox"));
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(painelLateral()).toBeNull();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect((within(linhaPorNome("LOJA 1")).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("＋ Lançamento desligado até config_ciclo e configuracoes carregarem", () => {
    definir({ faturas: [novembro], lancamentos: [] });
    falso.statusTabelas = { config_ciclo: "carregando" };
    const { unmount } = renderizar();
    expect((screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    falso.statusTabelas = { configuracoes: "carregando" };
    falso.versao++;
    const { unmount: fechar } = renderizar();
    expect((screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo }) as HTMLButtonElement).disabled).toBe(true);
    fechar();
    falso.statusTabelas = {};
    falso.versao++;
    renderizar();
    expect((screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("＋ Lançamento: o Status começa no status_padrao_id de configuracoes", async () => {
    definir({ faturas: [novembro], lancamentos: [] });
    falso.banco.configuracoes = [{ id: "cfg", status_padrao_id: "s-pago" }];
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_LANCAMENTO.rotulo_novo }));
    expect((within(painelLateral()!).getByLabelText("Status") as HTMLSelectElement).value).toBe("s-pago");
  });

  it("com filtro, Selecionar todos marca só a grade: ao limpar o filtro, as de fora ficam desmarcadas", async () => {
    definir({
      faturas: [novembro],
      lancamentos: [lanc("2026-11", { responsavel_id: "r-casal" }), lanc("2026-11"), lanc("2026-11", { responsavel_id: "r-casal" })],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaPorNome("LOJA 1")).getByRole("button", { name: "Filtrar por Casal" }));
    expect(linhasDaGrade()).toHaveLength(2);
    await u.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros }));
    const marcada = (nome: string) => (within(linhaPorNome(nome)).getByRole("checkbox") as HTMLInputElement).checked;
    expect([marcada("LOJA 1"), marcada("LOJA 2"), marcada("LOJA 3")]).toEqual([true, false, true]);
    expect((screen.getByRole("checkbox", { name: "Selecionar todos" }) as HTMLInputElement).indeterminate).toBe(true);
  });

  it("Esc na confirmação de exclusão fecha só a confirmação; o painel fica", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(corpoDa(linhaPorNome("LOJA 1")));
    await u.click(within(painelLateral()!).getByRole("button", { name: "Excluir" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(painelLateral()).toBeTruthy();
    expect(repoL.excluir).not.toHaveBeenCalled();
  });

  it("Desfazer que falha mostra a mensagem do código", async () => {
    repoL.restaurar.mockImplementation(async () => ({ ok: false, codigo: "conexao.gravar_sem_conexao" }));
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11"), lanc("2026-11")] });
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaPorNome("LOJA 1")).getByRole("button", { name: "Ações de LOJA 1" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    await u.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repoL.restaurar).toHaveBeenCalledWith("l1");
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["LOJA 2"]);
  });

  it("sem nenhuma edição: hero, Conferência, faixa e grade como na 2.6", async () => {
    const out = faturaQueBate(outubro, 49);
    definir({ faturas: [outubro], fatura_cartoes: [cartao(outubro)], lancamentos: out });
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(linhasDaGrade()).toHaveLength(49);
    expect(screen.getByText(TEXTOS_CONFERENCIA.conferido)).toBeTruthy();
    expect(screen.queryByRole("region", { name: TEXTOS_CONFERENCIA.faixa })).toBeNull();
    expect(rodape()).toContain("R$ 7.687,77");
    expect(painelLateral()).toBeNull();
    expect(repoL.atualizar).not.toHaveBeenCalled();
  });
});

describe("Ajustes de centavos (História 2.8)", () => {
  const painelLateral = () => screen.queryByRole("complementary");
  const pilula = (nome: string) => screen.getByRole("button", { name: nome, expanded: false });
  const linhaDoAjuste = () => linhasDaGrade().find((r) => r.dataset.ajuste);
  const tipos = [{ id: "t-viagem", nome: "Viagem", arquivado: false, ordem: 1 }];

  /** Novembro com a parcela do MSC, uma padaria e o Ajuste de 8 centavos do MSC (na ordem da Fatura). */
  function comAjuste(extraAjuste: Partial<LinhaLancamento> = {}) {
    const mae = lanc("2026-11", {
      id: "msc",
      nome: "MSC CRUZEIROS",
      parcela_n: 2,
      parcela_total: 12,
      valor_centavos: 114074,
      ordem_fatura: 1,
    });
    const padaria = lanc("2026-11", { id: "pad", nome: "PADARIA", valor_centavos: 2000, ordem_fatura: 2 });
    const ajuste = lanc("2026-11", {
      id: "aj",
      nome: "MSC CRUZEIROS",
      valor_centavos: -8,
      ordem_fatura: 3,
      ajuste_de_id: "msc",
      ...extraAjuste,
    });
    definir({ faturas: [novembro], lancamentos: [mae, padaria, ajuste] });
    falso.banco.tipos = tipos;
  }

  it("o Ajuste logo abaixo da mãe; a grade e o rodapé fecham no líquido; o hero não muda", () => {
    comAjuste();
    renderizar();
    expect(linhasDaGrade().map((r) => (r.dataset.ajuste ? "↳" : nomeVisivel(r)))).toEqual(["MSC CRUZEIROS", "↳", "PADARIA"]);
    expect(rodape()).toContain(sem(formatarDinheiro(114074 - 8 + 2000)));
    expect(within(linhaDoAjuste()!).getAllByRole("cell")[0].querySelector("input")).toBeNull();
  });

  it("filtrar por um Tipo que só o Ajuste teria: nenhuma linha do MSC aparece; contagens só das mães", async () => {
    comAjuste({ tipo_id: "t-viagem" });
    renderizar();
    const u = userEvent.setup();
    await u.click(pilula("Tipo"));
    const dialogo = screen.getByRole("dialog", { name: "Tipo (pode marcar vários)" });
    expect(within(dialogo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Viagem, 0 lançamentos",
      "Sem tipo, 2 lançamentos",
    ]);
    await u.click(within(dialogo).getByRole("checkbox", { name: "Viagem, 0 lançamentos" }));
    await u.click(within(dialogo).getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText("0 lançamentos")).toBeTruthy();
  });

  it("busca pela padaria: o Ajuste some com a mãe; pelo MSC, aparecem os dois e o anúncio conta 1", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    const busca = screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar });
    await u.type(busca, "padaria");
    expect(linhaDoAjuste()).toBeUndefined();
    await u.clear(busca);
    await u.type(busca, "msc");
    expect(linhasDaGrade()).toHaveLength(2);
    expect(screen.getByText("1 lançamento")).toBeTruthy();
  });

  it("selecionar a mãe pinta o Ajuste; Selecionar todos marca só as mães", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" }));
    expect(linhaDoAjuste()!.className).toContain("bg-selection");
    await u.click(screen.getByRole("checkbox", { name: TEXTOS_LANCAMENTO.selecionar_todos }));
    expect((screen.getByRole("checkbox", { name: TEXTOS_LANCAMENTO.selecionar_todos }) as HTMLInputElement).checked).toBe(true);
  });

  it("Tipo da mãe no painel: mãe e Ajuste na mesma gravação", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhasDaGrade()[0]).getAllByRole("cell")[3]);
    expect(screen.getByText((_, el) => el?.tagName === "P" && sem(el.textContent) === "Ajuste - R$ 0,08 · líquido R$ 1.140,66")).toBeTruthy();
    await u.selectOptions(within(painelLateral()!).getByLabelText("Tipo"), "t-viagem");
    expect(repoL.atualizar).toHaveBeenCalledWith("msc", { tipo_id: "t-viagem" }, { junto: ["aj"] });
    expect((falso.banco.lancamentos as LinhaLancamento[]).map((l) => l.tipo_id)).toEqual(["t-viagem", null, "t-viagem"]);
  });

  it("painel do Ajuste: Desvincular vira linha comum; Desfazer religa com a classificação da mãe", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaDoAjuste()!).getAllByRole("cell")[3]);
    expect(within(painelLateral()!).getByText("Segue a parcela MSC CRUZEIROS")).toBeTruthy();
    await u.click(within(painelLateral()!).getByRole("button", { name: "Desvincular" }));
    expect(repoL.desvincular).toHaveBeenCalledWith("aj");
    expect(linhaDoAjuste()).toBeUndefined();
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MSC CRUZEIROS", "PADARIA", "MSC CRUZEIROS"]);
    expect(screen.getByText("Desvinculado")).toBeTruthy();
    // A mãe muda de Tipo em outro aparelho antes do Desfazer.
    mudarBanco("lancamentos", (ls) => ls.map((l) => ((l as LinhaLancamento).id === "msc" ? { ...(l as object), tipo_id: "t-viagem" } : l)));
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repoL.religar).toHaveBeenCalledWith("aj", expect.objectContaining({ id: "msc", tipo_id: "t-viagem" }));
    expect(linhaDoAjuste()).toBeTruthy();
  });

  it("excluir a mãe: a confirmação avisa, o Ajuste sai junto; Desfazer volta os dois", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhasDaGrade()[0]).getByRole("button", { name: "Ações de MSC CRUZEIROS" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    const confirmar = screen.getByRole("alertdialog", { name: "Excluir lançamento?" });
    expect(within(confirmar).getByText(/junto com o Ajuste dele/)).toBeTruthy();
    await u.click(within(confirmar).getByRole("button", { name: "Excluir lançamento" }));
    expect(repoL.excluir).toHaveBeenCalledWith("msc", { junto: ["aj"] });
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["PADARIA"]);
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(repoL.restaurar).toHaveBeenCalledWith("msc", { junto: ["aj"] });
    expect(linhasDaGrade()).toHaveLength(3);
  });

  it("excluir o próprio Ajuste exclui só ele", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaDoAjuste()!).getByRole("button", { name: "Ações de Ajuste de MSC CRUZEIROS" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    await u.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    expect(repoL.excluir).toHaveBeenCalledWith("aj");
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MSC CRUZEIROS", "PADARIA"]);
  });

  it("com o Ajuste aberto: a mãe fica presa na grade, sem linha repetida, mesmo fora da busca", async () => {
    comAjuste();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaDoAjuste()!).getAllByRole("cell")[3]);
    const grade = () => linhasDaGrade().map((r) => (r.dataset.ajuste ? "↳" : nomeVisivel(r)));
    expect(grade()).toEqual(["MSC CRUZEIROS", "↳", "PADARIA"]);
    expect(linhaDoAjuste()!.getAttribute("data-aberta")).toBe("true");
    await u.type(screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar }), "padaria");
    expect(grade()).toEqual(["MSC CRUZEIROS", "↳", "PADARIA"]);
    expect(within(painelLateral()!).getByText("Segue a parcela MSC CRUZEIROS")).toBeTruthy();
  });

  it("Ajuste cuja mãe não está no Mês: linha comum, com caixa", () => {
    comAjuste({ ajuste_de_id: "de-outro-mes" });
    renderizar();
    expect(linhaDoAjuste()).toBeUndefined();
    expect(linhasDaGrade()).toHaveLength(3);
    expect(screen.getAllByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" })).toHaveLength(2);
  });
});

describe("Divisão no Painel (História 3.8)", () => {
  const divisao = {
    modo: "proporcao",
    partes: [
      { responsavel_id: "r-casal", numerador: 2, denominador: 3, filha_id: "fa" },
      { responsavel_id: "r-rafael", numerador: 1, denominador: 3, filha_id: "fb" },
    ],
  };

  /** Novembro: o JIM COM (R$ 466,00) dividido em duas filhas e uma padaria; a Fatura bate com as mães. */
  function comDivisao() {
    const jim = lanc("2026-11", { id: "jim", nome: "JIM COM", valor_centavos: 46600, tipo_id: "t-casa", divisao: divisao as never, ordem_fatura: 1 });
    const fa = lanc("2026-11", { id: "fa", nome: "JIM COM", valor_centavos: 31067, tipo_id: "t-casa", responsavel_id: "r-casal", dividido_de_id: "jim", ordem_fatura: 1, status_id: "s-pago" });
    const fb = lanc("2026-11", { id: "fb", nome: "JIM COM", valor_centavos: 15533, tipo_id: "t-casa", responsavel_id: "r-rafael", dividido_de_id: "jim", ordem_fatura: 1 });
    const padaria = lanc("2026-11", { id: "pad", nome: "PADARIA", valor_centavos: 1000, ordem_fatura: 2 });
    const fatura = { ...novembro, total_despesas_centavos: 47600, total_creditos_centavos: 0, total_a_pagar_centavos: 47600, saldo_anterior_centavos: 0, pagamentos_centavos: 0 } as LinhaFatura;
    definir({ faturas: [fatura], fatura_cartoes: [cartao(fatura, "5061", 47600)], lancamentos: [padaria, fb, jim, fa] });
    return { jim, fa, fb, padaria };
  }

  it("a mãe vira cabeçalho sobre as partes; a Conferência e o hero usam a mãe, o rodapé e a barra usam as partes", () => {
    comDivisao();
    renderizar();
    const linhas = linhasDaGrade();
    expect(linhas.map((r) => r.dataset.papel ?? "linha")).toEqual(["cabecalho", "parte", "parte", "linha"]);
    // Conferência: a mãe conta uma vez ("2 lançamentos"), sem diferença nem bolinhas.
    const hero = screen.getByRole("region", { name: /^Fatura de novembro/ });
    expect(sem(hero.querySelector(".texto-hero-value")?.textContent)).toBe("Total a pagar R$ 476,00");
    expect(sem(within(hero).getByText(TEXTOS_CONFERENCIA.conferido).parentElement?.textContent)).toBe("✓ Conferido·2 lançamentos");
    expect(document.querySelector(".bg-verify")).toBeNull();
    // Rodapé: as partes (R$ 310,67 + R$ 155,33) e a padaria; a mãe fora.
    expect(rodape()).toContain("R$ 476,00");
    // Barra por Responsável: cada um com a sua parte (e a padaria sem Responsável).
    expect(sem(document.body.textContent)).toContain("R$ 310,67");
    expect(sem(document.body.textContent)).toContain("R$ 155,33");
  });

  it("filtrar por Responsável mostra só a parte dele, sob o cabeçalho da mãe, e o rodapé soma só ela", async () => {
    comDivisao();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole("button", { name: "Filtrar por Rafael" })[0]);
    expect(linhasDaGrade().map((r) => r.dataset.papel ?? "linha")).toEqual(["cabecalho", "parte"]);
    expect(rodape()).toContain("R$ 155,33");
  });

  it("selecionar todos marca as partes e a padaria, não a mãe", async () => {
    comDivisao();
    renderizar();
    await userEvent.setup().click(screen.getByRole("checkbox", { name: TEXTOS_LANCAMENTO.selecionar_todos }));
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(4);
  });

  it("excluir a mãe leva as filhas na mesma gravação", async () => {
    comDivisao();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhasDaGrade()[0]).getByRole("button", { name: /Ações de/ }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    await u.click(screen.getByRole("button", { name: "Excluir lançamento" }));
    expect(repoL.excluir).toHaveBeenCalledOnce();
    const [id, opcoes] = repoL.excluir.mock.calls[0];
    expect(id).toBe("jim");
    expect([...(opcoes?.junto ?? [])].sort()).toEqual(["fa", "fb"]);
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["PADARIA"]);
  });

  it("abrir uma parte mostra o painel reduzido da parte, com 'Abrir divisão'", async () => {
    comDivisao();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhasDaGrade()[1]).getAllByRole("cell")[3]);
    const painel = screen.getByRole("complementary");
    expect(within(painel).getByText("Parte de JIM COM")).toBeTruthy();
    await u.click(within(painel).getByRole("button", { name: "Abrir divisão" }));
    expect(await screen.findByRole("dialog", { name: "Dividir lançamento" })).toBeTruthy();
  });

  it("a mãe aberta no painel não vira linha repetida na grade", async () => {
    comDivisao();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhasDaGrade()[0]).getAllByRole("cell")[3]);
    expect(linhasDaGrade().map((r) => r.dataset.papel ?? "linha")).toEqual(["cabecalho", "parte", "parte", "linha"]);
    expect(within(screen.getByRole("complementary")).getByRole("button", { name: "Editar divisão" })).toBeTruthy();
  });
});

describe("Blocos (História 4.1)", () => {
  const rangel = {
    id: "b1",
    owner_id: "dono",
    nome: "Rangel",
    formula: {
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
    },
    ordem: 1,
    de_cobranca: false,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
  };

  it("sem Blocos: convida a criar o primeiro, com 'Novo bloco'", () => {
    renderizar();
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect(within(cartao).getByText("Crie seu primeiro Bloco para ver os totais por pessoa")).toBeTruthy();
    expect((within(cartao).getByRole("button", { name: /Novo bloco/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("lista cada Bloco com a Fórmula legível, com os parênteses como montados", () => {
    definir({ blocos: [rangel] });
    renderizar();
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect(within(cartao).getByText("Rangel")).toBeTruthy();
    expect(within(cartao).getByText("Rafael + (Casal ÷ 2)")).toBeTruthy();
    expect(within(cartao).queryByText("Crie seu primeiro Bloco para ver os totais por pessoa")).toBeNull();
  });

  it("enquanto os Blocos carregam, o botão espera e a frase de vazio não aparece", () => {
    falso.statusTabelas = { blocos: "carregando" };
    falso.versao++;
    renderizar();
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect((within(cartao).getByRole("button", { name: /Novo bloco/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(cartao).queryByText("Crie seu primeiro Bloco para ver os totais por pessoa")).toBeNull();
  });

  it("'Novo bloco' abre o Montador sobre o Mês aberto e 'Salvar' grava o pedido", async () => {
    definir({
      lancamentos: [lanc("2026-11", { valor_centavos: 563935, responsavel_id: "r-casal", tipo_id: "t-casa" })],
      tipos: [{ id: "t-casa", nome: "Casa", arquivado: false }],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: /Novo bloco/ }));
    const janela = await screen.findByRole("dialog", { name: "Novo bloco" });
    await u.click(within(janela).getByRole("button", { name: "Casal" }));
    expect(sem(janela.textContent)).toContain("R$ 5.639,35");
    await u.type(within(janela).getByLabelText("Nome"), "Casal");
    await u.click(within(janela).getByRole("button", { name: "Salvar" }));
    expect(repoB.salvar).toHaveBeenCalledOnce();
    expect(repoB.salvar.mock.calls[0][0]).toMatchObject({
      p_id: null,
      p_nome: "Casal",
      p_formula: { tipo: "responsavel", id: "r-casal" },
      p_ordem: 1,
    });
    expect(await screen.findByText("Bloco salvo")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Novo bloco" })).toBeNull();
  });

  it("se a gravação falhar, avisa e o Montador continua aberto", async () => {
    repoB.salvar.mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: /Novo bloco/ }));
    const janela = await screen.findByRole("dialog", { name: "Novo bloco" });
    await u.click(within(janela).getByRole("button", { name: "Todos" }));
    await u.type(within(janela).getByLabelText("Nome"), "Total");
    await u.click(within(janela).getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Novo bloco" })).toBeTruthy();
  });

  it("um Bloco novo gravado em outro aparelho aparece na lista sem recarregar", () => {
    renderizar();
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect(within(cartao).queryByText("Rangel")).toBeNull();
    mudarBanco("blocos", (ls) => [...ls, rangel]);
    expect(within(cartao).getByText("Rangel")).toBeTruthy();
  });
});

describe("Blocos no Painel (História 4.2)", () => {
  const casalBloco = {
    id: "b-casal",
    owner_id: "dono",
    nome: "Casal",
    formula: { tipo: "responsavel", id: "r-casal" },
    ordem: 1,
    de_cobranca: false,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
  };
  const valorDoBloco = () => sem(within(screen.getByRole("region", { name: "Blocos" })).getByText(/^R\$/, { selector: "b" }).textContent);

  it("o block-card mostra o valor da Fórmula sobre os Lançamentos do Mês aberto", () => {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { valor_centavos: 563935, responsavel_id: "r-casal" }),
        lanc("2026-11", { valor_centavos: 1000, responsavel_id: "r-rafael" }),
      ],
      blocos: [casalBloco],
    });
    renderizar();
    expect(valorDoBloco()).toBe("R$ 5.639,35");
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect(within(cartao).getByRole("button", { name: "Ações do Bloco Casal" })).toBeTruthy();
    expect((within(cartao).getByRole("button", { name: "Gerar mensagem do Bloco Casal" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("o valor muda no lugar quando um Lançamento muda em outro aparelho, sem esqueleto", () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11", { valor_centavos: 10000, responsavel_id: "r-casal" })], blocos: [casalBloco] });
    renderizar();
    expect(valorDoBloco()).toBe("R$ 100,00");
    mudarBanco("lancamentos", (ls) => [...ls, lanc("2026-11", { valor_centavos: 2550, responsavel_id: "r-casal" })]);
    expect(valorDoBloco()).toBe("R$ 125,50");
    // Excluir um Lançamento (em outro aparelho) também muda o valor.
    mudarBanco("lancamentos", (ls) =>
      ls.map((l, i) => (i === 0 ? { ...(l as object), excluido_em: "2026-11-08T00:14:00Z" } : l)),
    );
    expect(valorDoBloco()).toBe("R$ 25,50");
    expect(screen.queryByRole("status", { busy: true })).toBeNull();
    expect(falso.recarregar).not.toHaveBeenCalled();
  });

  it("Mês sem Fatura: o Bloco soma os previstos e diz 'inclui previstos'", () => {
    definir({
      lancamentos: [lanc("2026-11", { valor_centavos: 7000, responsavel_id: "r-casal", lancado_por: "sistema" })],
      blocos: [casalBloco],
    });
    renderizar();
    expect(valorDoBloco()).toBe("R$ 70,00");
    expect(within(screen.getByRole("region", { name: "Blocos" })).getByText("inclui previstos")).toBeTruthy();
  });

  it("trocar de Mês recalcula os Blocos para o Mês novo", async () => {
    definir({
      faturas: [novembro, outubro],
      lancamentos: [
        lanc("2026-11", { valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-10", { valor_centavos: 3000, responsavel_id: "r-casal" }),
      ],
      blocos: [casalBloco],
    });
    renderizar();
    expect(valorDoBloco()).toBe("R$ 100,00");
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(valorDoBloco()).toBe("R$ 30,00");
  });

  it("falha de leitura só dos Blocos: o Painel segue de pé e o cartão avisa, com 'Tentar de novo'", async () => {
    definir({ faturas: [novembro], lancamentos: [lanc("2026-11")] });
    falso.statusTabelas = { blocos: "erro" };
    falso.versao++;
    renderizar();
    expect(linhasDaGrade()).toHaveLength(1);
    const cartao = screen.getByRole("region", { name: "Blocos" });
    expect(within(cartao).getByText("Não foi possível carregar os Blocos.")).toBeTruthy();
    await userEvent.setup().click(within(cartao).getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(1);
  });

  it("o 'Tentar de novo' do Painel também relê os Blocos", async () => {
    definir({}, "erro");
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(9);
  });
});

describe("Filtrar a grade pelo Bloco (História 4.3, FR-20)", () => {
  const bloco = (id: string, nome: string, ordem: number, formula: unknown) => ({
    id,
    owner_id: "dono",
    nome,
    formula,
    ordem,
    de_cobranca: false,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
  });
  const casalBloco = bloco("b-casal", "Casal", 1, { tipo: "responsavel", id: "r-casal" });
  const rafaelBloco = bloco("b-rafael", "Rafael", 2, { tipo: "responsavel", id: "r-rafael" });
  const ninguemBloco = bloco("b-ninguem", "Ninguém", 3, { tipo: "responsavel", id: "r-ninguem" });

  const regiaoBlocos = () => screen.getByRole("region", { name: "Blocos" });
  const cartaoFiltra = (nome: string) =>
    within(regiaoBlocos()).getByRole("button", { name: new RegExp("^Filtrar a grade pelo Bloco " + nome + ",") });
  const pilulaBloco = (nome: string) => screen.queryByRole("button", { name: "Desfazer o filtro Bloco: " + nome });
  const nomes = () => linhasDaGrade().map((r) => nomeVisivel(r));
  /** O que os `role=status` anunciam (o anúncio de "N lançamentos" é um deles). */
  const anuncios = () => screen.getAllByRole("status").map((e) => e.textContent);
  const valorDoPrimeiroBloco = () => sem(within(regiaoBlocos()).getAllByText(/^R\$/, { selector: "b" })[0].textContent);
  const linhaDoAjuste = () => linhasDaGrade().find((r) => r.dataset.ajuste);

  /** Novembro: 3 do Casal (R$ 100 + R$ 50 + R$ 20), 2 do Rafael e 1 sem Responsável. */
  function novembroComBlocos(blocos: unknown[] = [casalBloco, rafaelBloco], extras: LinhaLancamento[] = []) {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { id: "c1", nome: "MERCADO", valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c2", nome: "FARMACIA", valor_centavos: 5000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c3", nome: "PADARIA", valor_centavos: 2000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "r1", nome: "LIVRARIA", valor_centavos: 7000, responsavel_id: "r-rafael" }),
        lanc("2026-11", { id: "r2", nome: "CINEMA", valor_centavos: 3000, responsavel_id: "r-rafael" }),
        lanc("2026-11", { id: "s1", nome: "SEM DONO", valor_centavos: 900, responsavel_id: null }),
        ...extras,
      ],
      blocos,
    });
  }

  it("tocar no cartão filtra a grade, mostra a pílula e destaca o cartão; o total do rodapé é o valor do Bloco; tocar de novo desfaz", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    expect(nomes()).toHaveLength(6);
    await u.click(cartaoFiltra("Casal"));
    expect(nomes().sort()).toEqual(["FARMACIA", "MERCADO", "PADARIA"]);
    expect(pilulaBloco("Casal")).toBeTruthy();
    expect(cartaoFiltra("Casal").getAttribute("aria-pressed")).toBe("true");
    expect(cartaoFiltra("Casal").closest("li")!.className).toContain("ring-accent-line");
    // O valor do cartão é o total da grade filtrada.
    expect(valorDoPrimeiroBloco()).toBe("R$ 170,00");
    expect(rodape()).toContain("R$ 170,00");
    // O anúncio conta as linhas da grade.
    expect(anuncios()).toContain("3 lançamentos");
    await u.click(cartaoFiltra("Casal"));
    expect(nomes()).toHaveLength(6);
    expect(pilulaBloco("Casal")).toBeNull();
    expect(cartaoFiltra("Casal").getAttribute("aria-pressed")).toBe("false");
    expect(anuncios()).toContain("6 lançamentos");
  });

  it("o ✕ da pílula desfaz o filtro", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Rafael"));
    expect(nomes().sort()).toEqual(["CINEMA", "LIVRARIA"]);
    await u.click(pilulaBloco("Rafael")!);
    expect(nomes()).toHaveLength(6);
    expect(pilulaBloco("Rafael")).toBeNull();
  });

  it("só um Bloco por vez: tocar noutro troca o filtro", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    await u.click(cartaoFiltra("Rafael"));
    expect(nomes().sort()).toEqual(["CINEMA", "LIVRARIA"]);
    expect(pilulaBloco("Casal")).toBeNull();
    expect(pilulaBloco("Rafael")).toBeTruthy();
    expect(cartaoFiltra("Casal").getAttribute("aria-pressed")).toBe("false");
    expect(cartaoFiltra("Rafael").getAttribute("aria-pressed")).toBe("true");
  });

  it("soma-se à busca e aos filtros de coluna (E)", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    await u.type(screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar }), "farm");
    expect(nomes()).toEqual(["FARMACIA"]);
    // A contagem do popover de Responsável já vem do Bloco.
    await u.click(screen.getByRole("button", { name: "Responsável", expanded: false }));
    const dialogo = screen.getByRole("dialog", { name: "Responsável (pode marcar vários)" });
    expect(within(dialogo).getByRole("checkbox", { name: "Casal, 1 lançamento" })).toBeTruthy();
    expect(within(dialogo).getByRole("checkbox", { name: "Rafael, 0 lançamentos" })).toBeTruthy();
  });

  it("Limpar filtros aparece com só o Bloco ativo e o desfaz", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
    await u.click(cartaoFiltra("Casal"));
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros }));
    expect(pilulaBloco("Casal")).toBeNull();
    expect(nomes()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
  });

  it("Bloco que não pega nenhum Lançamento: grade vazia com a mensagem de filtros e Limpar filtros", async () => {
    novembroComBlocos([casalBloco, ninguemBloco]);
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Ninguém"));
    expect(linhasDaGrade()).toHaveLength(0);
    expect(screen.getByText(TEXTOS_FILTROS.sem_resultado)).toBeTruthy();
    expect(anuncios()).toContain("0 lançamentos");
    // Um na barra e outro na própria grade vazia.
    expect(screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toHaveLength(2);
    await u.click(screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })[1]);
    expect(nomes()).toHaveLength(6);
  });

  it("o Ajuste segue a mãe: aparece sob ela e o rodapé fecha no valor do Bloco", async () => {
    novembroComBlocos(
      [casalBloco],
      [lanc("2026-11", { id: "aj", nome: "MERCADO", valor_centavos: -8, responsavel_id: "r-casal", ajuste_de_id: "c1", ordem_fatura: 99 })],
    );
    renderizar();
    await userEvent.setup().click(cartaoFiltra("Casal"));
    expect(linhasDaGrade().map((r) => (r.dataset.ajuste ? "↳" : nomeVisivel(r)))).toEqual(["MERCADO", "↳", "FARMACIA", "PADARIA"]);
    expect(rodape()).toContain("R$ 169,92");
    expect(valorDoPrimeiroBloco()).toBe("R$ 169,92");
  });

  it("Ajuste de outro Responsável que a mãe: só aparece no Bloco em que entra (vira linha comum)", async () => {
    novembroComBlocos(
      [casalBloco, rafaelBloco],
      [lanc("2026-11", { id: "aj", nome: "MERCADO", valor_centavos: -8, responsavel_id: "r-rafael", ajuste_de_id: "c1", ordem_fatura: 99 })],
    );
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    expect(linhaDoAjuste()).toBeUndefined();
    expect(rodape()).toContain("R$ 170,00");
    await u.click(cartaoFiltra("Rafael"));
    expect(linhaDoAjuste()).toBeUndefined();
    // O Ajuste entra sozinho, como linha comum, e o total é o valor do Bloco.
    expect(nomes()).toHaveLength(3);
    expect(rodape()).toContain("R$ 99,92");
    expect(valorDoPrimeiroBloco()).toBe("R$ 170,00");
  });

  it("mãe dividida: só as filhas que entram no Bloco somam, e a mãe nunca soma", async () => {
    const divisao = {
      modo: "proporcao",
      partes: [
        { responsavel_id: "r-casal", numerador: 1, denominador: 2 },
        { responsavel_id: "r-rafael", numerador: 1, denominador: 2 },
      ],
    };
    novembroComBlocos(
      [casalBloco],
      [
        lanc("2026-11", { id: "mae", nome: "VIAGEM", valor_centavos: 4000, responsavel_id: null, divisao: divisao as never }),
        lanc("2026-11", { id: "f1", nome: "VIAGEM", valor_centavos: 2000, responsavel_id: "r-casal", dividido_de_id: "mae" }),
        lanc("2026-11", { id: "f2", nome: "VIAGEM", valor_centavos: 2000, responsavel_id: "r-rafael", dividido_de_id: "mae" }),
      ],
    );
    renderizar();
    await userEvent.setup().click(cartaoFiltra("Casal"));
    // R$ 170,00 das três do Casal e a filha R$ 20,00.
    expect(rodape()).toContain("R$ 190,00");
    expect(valorDoPrimeiroBloco()).toBe("R$ 190,00");
    expect(anuncios()).toContain("4 lançamentos");
  });

  it("trocar de Mês mantém o Bloco e recalcula quem entra no Mês novo", async () => {
    definir({
      faturas: [novembro, outubro],
      lancamentos: [
        lanc("2026-11", { id: "n1", nome: "NOV CASAL", valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "n2", nome: "NOV RAFAEL", valor_centavos: 500, responsavel_id: "r-rafael" }),
        lanc("2026-10", { id: "o1", nome: "OUT CASAL", valor_centavos: 3000, responsavel_id: "r-casal" }),
        lanc("2026-10", { id: "o2", nome: "OUT RAFAEL", valor_centavos: 800, responsavel_id: "r-rafael" }),
      ],
      blocos: [casalBloco],
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    expect(nomes()).toEqual(["NOV CASAL"]);
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(nomes()).toEqual(["OUT CASAL"]);
    expect(pilulaBloco("Casal")).toBeTruthy();
    expect(rodape()).toContain("R$ 30,00");
  });

  it("Bloco editado em outro aparelho (Fórmula e nome) recalcula o filtro e a pílula; reordenar não mexe nele", async () => {
    novembroComBlocos();
    renderizar();
    await userEvent.setup().click(cartaoFiltra("Casal"));
    expect(nomes()).toHaveLength(3);
    mudarBanco("blocos", (ls) =>
      ls.map((b) =>
        (b as { id: string }).id === "b-casal"
          ? { ...(b as object), nome: "Casal 2", formula: { tipo: "responsavel", id: "r-rafael" } }
          : b,
      ),
    );
    expect(nomes().sort()).toEqual(["CINEMA", "LIVRARIA"]);
    expect(pilulaBloco("Casal 2")).toBeTruthy();
    mudarBanco("blocos", (ls) => ls.map((b) => ({ ...(b as object), ordem: 3 - (b as { ordem: number }).ordem })));
    expect(nomes().sort()).toEqual(["CINEMA", "LIVRARIA"]);
    expect(pilulaBloco("Casal 2")).toBeTruthy();
  });

  it("Bloco excluído em outro aparelho: o filtro se desfaz e um aviso conta por quê", async () => {
    novembroComBlocos();
    renderizar();
    await userEvent.setup().click(cartaoFiltra("Casal"));
    expect(nomes()).toHaveLength(3);
    mudarBanco("blocos", (ls) => ls.filter((b) => (b as { id: string }).id !== "b-casal"));
    expect(nomes()).toHaveLength(6);
    expect(pilulaBloco("Casal")).toBeNull();
    expect(await screen.findByText("O Bloco foi excluído e o filtro foi desfeito")).toBeTruthy();
  });

  it("excluir o Bloco ativo aqui desfaz o filtro, com o aviso de sempre e sem o de outro aparelho", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    await u.click(within(regiaoBlocos()).getByRole("button", { name: "Ações do Bloco Casal" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir bloco" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir bloco" }));
    expect(repoB.excluir).toHaveBeenCalledWith("b-casal");
    expect(pilulaBloco("Casal")).toBeNull();
    expect(nomes()).toHaveLength(6);
    expect(await screen.findByText("Bloco excluído")).toBeTruthy();
    expect(screen.queryByText("O Bloco foi excluído e o filtro foi desfeito")).toBeNull();
  });

  it("a linha aberta no painel lateral que sai do filtro continua na grade, fora do total (opção A)", async () => {
    novembroComBlocos();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    await u.click(within(linhasDaGrade().find((r) => nomeVisivel(r) === "MERCADO")!).getAllByRole("cell")[1]);
    expect(screen.getByRole("complementary")).toBeTruthy();
    await u.click(cartaoFiltra("Rafael"));
    expect(nomes().sort()).toEqual(["CINEMA", "LIVRARIA", "MERCADO"]);
    expect(rodape()).toContain("R$ 100,00");
    expect(rodape()).not.toContain("R$ 200,00");
  });

  it("o cartão que filtra, o ⋯ e o 💬 têm os nomes acessíveis esperados", () => {
    novembroComBlocos();
    renderizar();
    const regiao = regiaoBlocos();
    expect(within(regiao).getByRole("button", { name: "Ações do Bloco Casal" })).toBeTruthy();
    expect((within(regiao).getByRole("button", { name: "Gerar mensagem do Bloco Casal" }) as HTMLButtonElement).disabled).toBe(false);
    expect(sem(cartaoFiltra("Casal").getAttribute("aria-label"))).toBe("Filtrar a grade pelo Bloco Casal, R$ 170,00");
  });
});

describe("Gerar mensagem do Bloco (História 4.7, FR-53)", () => {
  const bloco = (id: string, nome: string, ordem: number, formula: unknown) => ({
    id,
    owner_id: "dono",
    nome,
    formula,
    ordem,
    de_cobranca: false,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
  });
  // Rangel = Rafael + (Casal ÷ 2): Rafael R$ 100,00 e Casal R$ 170,00, então R$ 185,00.
  const rangel = bloco("b-rangel", "Rangel", 1, {
    tipo: "operacao",
    operacao: "soma",
    esquerda: { tipo: "responsavel", id: "r-rafael" },
    direita: {
      tipo: "grupo",
      interno: { tipo: "operacao", operacao: "divisao", esquerda: { tipo: "responsavel", id: "r-casal" }, direita: { tipo: "numero", valor: "2" } },
    },
  });
  const modelo = { saudacao: "Oi", frase_total: "Esse mês deu {total}", chave_pix: "pix@exemplo.com", rodape: "", campos: { nome: true, parcela: true, valor: true } };
  const comModelo = (m: unknown = modelo) => {
    falso.banco.configuracoes = [{ id: "cfg", status_padrao_id: null, modelo_mensagem: m, updated_at: "2026-11-03T12:00:00+00:00" }];
    falso.versao++;
  };
  function novembroDoRangel(extras: LinhaLancamento[] = []) {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { id: "c1", nome: "MERCADO", valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c2", nome: "FARMACIA", valor_centavos: 5000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c3", nome: "PADARIA", valor_centavos: 2000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "r1", nome: "LIVRARIA", valor_centavos: 10000, responsavel_id: "r-rafael" }),
        ...extras,
      ],
      blocos: [rangel],
    });
    comModelo();
  }
  const regiao = () => screen.getByRole("region", { name: "Blocos" });
  const abrirPeloEmoji = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(within(regiao()).getByRole("button", { name: "Gerar mensagem do Bloco Rangel" }));
    return screen.findByRole("dialog", { name: "Gerar mensagem" });
  };
  const quadroDe = (janela: HTMLElement) => within(janela).getByRole("textbox", { name: "Mensagem" }) as HTMLTextAreaElement;
  const valorDoCartao = () => sem(within(regiao()).getByText(/^R\$/, { selector: "b" }).textContent);

  it("o 💬 abre a janela com a forma 2, e o total é o valor do Bloco no cartão", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    expect(valorDoCartao()).toBe("R$ 185,00");
    const janela = await abrirPeloEmoji(u);
    expect(sem(quadroDe(janela).value)).toBe(
      [
        "Oi",
        "Esse mês deu R$ 185,00",
        "Pix pix@exemplo.com",
        "",
        "Detalhes:",
        "Rafael: R$ 100,00",
        "  LIVRARIA | R$ 100,00",
        "Casal: R$ 170,00 ÷ 2 = R$ 85,00",
        "  MERCADO | R$ 100,00",
        "  FARMACIA | R$ 50,00",
        "  PADARIA | R$ 20,00",
        "Total: R$ 185,00",
      ].join("\n"),
    );
    // A mesma janela da Seleção: foco no quadro, sem “Incluir previstos” num Mês com Fatura.
    expect(document.activeElement).toBe(quadroDe(janela));
    expect(within(janela).queryByRole("switch")).toBeNull();
  });

  it("o item “Gerar mensagem” do ⋯ abre a mesma janela", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(regiao()).getByRole("button", { name: "Ações do Bloco Rangel" }));
    await u.click(screen.getByRole("menuitem", { name: "Gerar mensagem" }));
    expect(await screen.findByRole("dialog", { name: "Gerar mensagem" })).toBeTruthy();
  });

  it("parte já paga: o total cai e a janela avisa quanto já foi pago", async () => {
    novembroDoRangel([lanc("2026-11", { id: "c4", nome: "IPTU", valor_centavos: 10000, responsavel_id: "r-casal", status_id: "s-pago" })]);
    renderizar();
    const u = userEvent.setup();
    // O cartão ainda soma o IPTU: 100 + (270 ÷ 2) = R$ 235,00.
    expect(valorDoCartao()).toBe("R$ 235,00");
    const janela = await abrirPeloEmoji(u);
    expect(sem(quadroDe(janela).value)).toContain("Total: R$ 185,00");
    expect(sem(janela.textContent)).toContain("1 item não entra: 1 já pago. R$ 50,00 já foram pagos e não entram");
  });

  it("modelo vazio: explica e “Editar modelo” leva a Configurações", async () => {
    novembroDoRangel();
    comModelo({});
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirPeloEmoji(u);
    expect(within(janela).getByText(/O modelo da mensagem está vazio/)).toBeTruthy();
    expect((within(janela).getByRole("button", { name: "Copiar" }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(within(janela).getByRole("button", { name: "Editar modelo" }));
    expect(roteador.push).toHaveBeenCalledWith("/configuracoes?secao=mensagem");
  });

  it("outro aparelho muda um Lançamento: o texto se refaz e a janela avisa", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirPeloEmoji(u);
    mudarBanco("lancamentos", (ls) => ls.map((l) => ((l as { id: string }).id === "r1" ? { ...(l as object), valor_centavos: 20000 } : l)));
    expect(sem(quadroDe(janela).value)).toContain("Total: R$ 285,00");
    expect(within(janela).getByRole("status").textContent).toContain("A mensagem mudou");
  });

  it("outro aparelho muda o Bloco para uma conta que não calcula: a janela diz que está sem valor", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    const janela = await abrirPeloEmoji(u);
    mudarBanco("blocos", () => [
      bloco("b-rangel", "Rangel", 1, { tipo: "operacao", operacao: "divisao", esquerda: { tipo: "responsavel", id: "r-casal" }, direita: { tipo: "numero", valor: "0" } }),
    ]);
    expect(within(janela).getByText("Este bloco está sem valor. Edite a fórmula para gerar a mensagem.")).toBeTruthy();
    expect((within(janela).getByRole("button", { name: "Copiar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(janela).getByRole("status").textContent).toContain("A mensagem mudou");
  });

  it("outro aparelho exclui o Bloco: a janela fecha e um aviso explica", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    await abrirPeloEmoji(u);
    mudarBanco("blocos", () => []);
    expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
    expect(await screen.findByText("O Bloco foi excluído e a janela foi fechada")).toBeTruthy();
  });

  it("a janela fechada não reabre ao trocar de Mês e voltar", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    await abrirPeloEmoji(u);
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
  });

  it("a barra de Seleção e o 💬 usam a mesma janela, sem misturar as mensagens", async () => {
    novembroDoRangel();
    renderizar();
    const u = userEvent.setup();
    const janelaDoBloco = await abrirPeloEmoji(u);
    expect(sem(quadroDe(janelaDoBloco).value)).toContain("Rafael: R$ 100,00");
    await u.click(within(janelaDoBloco).getAllByRole("button", { name: "Fechar" }).at(-1)!);
    const linha = linhasDaGrade().find((r) => nomeVisivel(r) === "MERCADO")!;
    await u.click(within(linha).getByRole("checkbox"));
    await u.click(within(screen.getByRole("region", { name: "Ações da seleção", hidden: true })).getByRole("button", { name: "Gerar mensagem" }));
    const janelaDaSelecao = await screen.findByRole("dialog", { name: "Gerar mensagem" });
    expect(sem(quadroDe(janelaDaSelecao).value)).toBe(
      ["Oi", "Esse mês deu R$ 100,00", "Pix pix@exemplo.com", "", "Detalhes:", "MERCADO | R$ 100,00", "Total: R$ 100,00"].join("\n"),
    );
  });
});

describe("Selecionar e ver o total (História 4.4, FR-48)", () => {
  const bloco = (id: string, nome: string, ordem: number, formula: unknown) => ({
    id,
    owner_id: "dono",
    nome,
    formula,
    ordem,
    de_cobranca: false,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
  });
  const casalBloco = bloco("b-casal", "Casal", 1, { tipo: "responsavel", id: "r-casal" });
  const tiposDoTeste = [{ id: "t-casa", nome: "Casa", arquivado: false, ordem: 1 }];

  const linhaPorNome = (nome: string) => linhasDaGrade().find((r) => nomeVisivel(r) === nome)!;
  const caixaDe = (nome: string) => within(linhaPorNome(nome)).getByRole("checkbox") as HTMLInputElement;
  const cabecalho = () => screen.getByRole("checkbox", { name: TEXTOS_LANCAMENTO.selecionar_todos }) as HTMLInputElement;
  const barra = () => screen.queryByRole("region", { name: "Ações da seleção", hidden: true });
  /** O texto que a barra mostra ("3 selecionados · R$ 170,00"). */
  const textoDaBarra = () => sem(barra()?.querySelector("p")?.textContent);
  /** A região de anúncio que fica no DOM (vazia sem Seleção). */
  const regiaoDoAnuncio = () =>
    screen.getAllByRole("status").filter((e) => e.className.includes("sr-only")).at(-1)!;
  const cartaoFiltra = (nome: string) =>
    within(screen.getByRole("region", { name: "Blocos" })).getByRole("button", {
      name: new RegExp("^Filtrar a grade pelo Bloco " + nome + ","),
    });
  /** Os Nomes que a grade mostra. */
  const nomesDaGrade = () => linhasDaGrade().map((r) => nomeVisivel(r));

  /** Novembro: 3 do Casal (R$ 100 + R$ 50 + R$ 20), 2 do Rafael e 1 sem Responsável. */
  function novembroComSelecao(extras: LinhaLancamento[] = [], blocos: unknown[] = [casalBloco]) {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { id: "c1", nome: "MERCADO", valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c2", nome: "FARMACIA", valor_centavos: 5000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c3", nome: "PADARIA", valor_centavos: 2000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "r1", nome: "LIVRARIA", valor_centavos: 7000, responsavel_id: "r-rafael" }),
        lanc("2026-11", { id: "r2", nome: "CINEMA", valor_centavos: 3000, responsavel_id: "r-rafael" }),
        lanc("2026-11", { id: "s1", nome: "SEM DONO", valor_centavos: 900, responsavel_id: null }),
        ...extras,
      ],
      blocos,
      tipos: tiposDoTeste,
    });
  }

  const divisao = () => [
    lanc("2026-11", { id: "mae", nome: "MONJARO", valor_centavos: 46600, divisao: { modo: "proporcao", partes: [] } as never }),
    lanc("2026-11", { id: "p1", nome: "MONJARO", valor_centavos: 31067, dividido_de_id: "mae", responsavel_id: "r-casal" }),
    lanc("2026-11", { id: "p2", nome: "MONJARO", valor_centavos: 15533, dividido_de_id: "mae", responsavel_id: "r-rafael" }),
  ];
  const comAjuste = () => [
    lanc("2026-11", { id: "msc", nome: "MSC CRUZEIROS", valor_centavos: 114074, ordem_fatura: 1 }),
    lanc("2026-11", { id: "aj", nome: "MSC CRUZEIROS", valor_centavos: -8, ordem_fatura: 2, ajuste_de_id: "msc" }),
  ];

  it("sem Seleção não há barra, e a região de anúncio já está no DOM, vazia", () => {
    novembroComSelecao();
    renderizar();
    expect(barra()).toBeNull();
    expect(regiaoDoAnuncio().textContent).toBe("");
  });

  it("a caixa da linha seleciona (fundo selection) sem abrir o painel; a barra e o anúncio mostram o total a cada toque", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(caixaDe("MERCADO"));
    expect(linhaPorNome("MERCADO").className).toContain("bg-selection");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(textoDaBarra()).toBe("1 selecionado · R$ 100,00");
    expect(sem(regiaoDoAnuncio().textContent)).toBe("1 selecionado · R$ 100,00");
    await u.click(caixaDe("FARMACIA"));
    expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
    expect(sem(regiaoDoAnuncio().textContent)).toBe("2 selecionados · R$ 150,00");
    expect(barra()!.querySelector("strong")!.className).toContain("texto-body-strong");
    // Desmarcar tudo: a barra some e o anúncio esvazia.
    await u.click(caixaDe("MERCADO"));
    await u.click(caixaDe("FARMACIA"));
    expect(barra()).toBeNull();
    expect(regiaoDoAnuncio().textContent).toBe("");
  });

  it("a caixa do cabeçalho marca todos do filtro (parcial com parte marcada) e, de novo, desmarca todos", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(caixaDe("MERCADO"));
    expect(cabecalho().indeterminate).toBe(true);
    await u.click(cabecalho());
    expect(cabecalho().checked).toBe(true);
    expect(textoDaBarra()).toBe("6 selecionados · R$ 279,00");
    await u.click(cabecalho());
    expect(barra()).toBeNull();
    expect(cabecalho().checked).toBe(false);
  });

  it("com o Bloco filtrado, 'selecionar todos' soma o que o Bloco soma (o total do rodapé e do cartão)", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(cartaoFiltra("Casal"));
    await u.click(cabecalho());
    expect(textoDaBarra()).toBe("3 selecionados · R$ 170,00");
    expect(rodape()).toContain("R$ 170,00");
  });

  it("aceite: o Bloco Mãe de outubro/2026 filtrado e 'selecionar todos' mostram '7 selecionados · R$ 1.350,14'", async () => {
    const mae = [50000, 30000, 25014, 20000, 15000, -2590, -2410].map((v, i) =>
      lanc("2026-10", { id: `m${i + 1}`, nome: `MAE ${i + 1}`, valor_centavos: v, responsavel_id: "r-mae" }),
    );
    definir({
      faturas: [outubro],
      lancamentos: [...mae, lanc("2026-10", { id: "x", nome: "OUTRO", valor_centavos: 99900, responsavel_id: "r-casal" })],
      blocos: [bloco("b-mae", "Mãe", 1, { tipo: "responsavel", id: "r-mae" })],
    });
    falso.banco.responsaveis = [...responsaveis, { id: "r-mae", nome: "Mãe", cor: 3, ordem: 3 }];
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    await u.click(cartaoFiltra("Mãe"));
    await u.click(cabecalho());
    expect(textoDaBarra()).toBe("7 selecionados · R$ 1.350,14");
  });

  it("o Ajuste segue a mãe: conta uma vez e o total é o líquido", async () => {
    novembroComSelecao(comAjuste());
    renderizar();
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" }));
    expect(textoDaBarra()).toBe("1 selecionado · R$ 1.140,66");
  });

  it("a mãe dividida não conta: valem as partes", async () => {
    novembroComSelecao(divisao());
    renderizar();
    await userEvent.setup().click(cabecalho());
    expect(textoDaBarra()).toBe("8 selecionados · R$ 745,00");
  });

  it("o filtro muda e quem sai da grade sai da Seleção (e não volta ao limpar o filtro)", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(cabecalho());
    expect(textoDaBarra()).toBe("6 selecionados · R$ 279,00");
    await u.click(within(linhaPorNome("MERCADO")).getByRole("button", { name: "Filtrar por Casal" }));
    expect(textoDaBarra()).toBe("3 selecionados · R$ 170,00");
    await u.click(screen.getAllByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })[0]);
    expect(textoDaBarra()).toBe("3 selecionados · R$ 170,00");
    expect(caixaDe("LIVRARIA").checked).toBe(false);
  });

  it("Lançamento excluído em outro aparelho sai da Seleção e o total recalcula", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(caixaDe("MERCADO"));
    await u.click(caixaDe("FARMACIA"));
    expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
    mudarBanco("lancamentos", (ls) =>
      ls.map((l) => ((l as { id: string }).id === "c1" ? { ...(l as object), excluido_em: "2026-11-08T00:00:00Z" } : l)),
    );
    expect(textoDaBarra()).toBe("1 selecionado · R$ 50,00");
  });

  it("⌘/Ctrl+A marca todos do filtro; num campo de texto fica com o navegador; só marca, nunca desmarca", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar }));
    await u.keyboard("{Control>}a{/Control}");
    expect(barra()).toBeNull();
    await u.click(document.body);
    await u.keyboard("{Control>}a{/Control}");
    expect(textoDaBarra()).toBe("6 selecionados · R$ 279,00");
    await u.keyboard("{Meta>}a{/Meta}");
    expect(textoDaBarra()).toBe("6 selecionados · R$ 279,00");
  });

  it("⌘/Ctrl+A com o filtro marca só o filtro; com uma janela aberta, não faz nada", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaPorNome("MERCADO")).getByRole("button", { name: "Filtrar por Casal" }));
    await u.click(document.body);
    await u.keyboard("{Control>}a{/Control}");
    expect(textoDaBarra()).toBe("3 selecionados · R$ 170,00");
    await u.click(cabecalho());
    expect(barra()).toBeNull();
    await u.click(within(linhaPorNome("MERCADO")).getByRole("button", { name: "Ações de MERCADO" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await u.keyboard("{Control>}a{/Control}");
    expect(barra()).toBeNull();
  });

  it("trocar de Mês com Seleção a limpa e avisa 'Seleção limpa ao trocar de mês'; sem Seleção, nada a dizer", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(screen.queryByText("Seleção limpa ao trocar de mês")).toBeNull();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    await u.click(caixaDe("MERCADO"));
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.mes_anterior }));
    expect(await screen.findByText("Seleção limpa ao trocar de mês")).toBeTruthy();
    expect(barra()).toBeNull();
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.proximo_mes }));
    expect(caixaDe("MERCADO").checked).toBe(false);
  });

  it("'Limpar' desmarca tudo; 'Gerar mensagem' está ligado (4.6)", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(caixaDe("MERCADO"));
    expect((within(barra()!).getByRole("button", { name: "Gerar mensagem" }) as HTMLButtonElement).disabled).toBe(false);
    await u.click(within(barra()!).getByRole("button", { name: "Limpar" }));
    expect(barra()).toBeNull();
    expect(caixaDe("MERCADO").checked).toBe(false);
  });

  describe("Gerar mensagem (História 4.6, FR-24)", () => {
    const modelo = { saudacao: "Oi", frase_total: "Esse mês deu {total}", chave_pix: "pix@exemplo.com", rodape: "", campos: { nome: true, parcela: true, valor: true } };
    const comModelo = (m: unknown = modelo) => {
      falso.banco.configuracoes = [{ id: "cfg", status_padrao_id: null, modelo_mensagem: m, updated_at: "2026-11-03T12:00:00+00:00" }];
      falso.versao++;
    };
    const abrirMensagem = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(within(barra()!).getByRole("button", { name: "Gerar mensagem" }));
      return screen.findByRole("dialog", { name: "Gerar mensagem" });
    };

    it("abre a janela com a mensagem da Seleção, na ordem da fatura, e o total é o da barra", async () => {
      novembroComSelecao();
      comModelo();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("FARMACIA"));
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirMensagem(u);
      const quadro = within(janela).getByRole("textbox", { name: "Mensagem" }) as HTMLTextAreaElement;
      expect(sem(quadro.value)).toBe(
        ["Oi", "Esse mês deu R$ 150,00", "Pix pix@exemplo.com", "", "Detalhes:", "MERCADO | R$ 100,00", "FARMACIA | R$ 50,00", "Total: R$ 150,00"].join("\n"),
      );
      expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
      // O foco abre no quadro: o leitor de tela lê a mensagem.
      expect(document.activeElement).toBe(quadro);
      expect(within(janela).queryByRole("switch")).toBeNull();
    });

    it("modelo vazio: explica e manda para Editar modelo, que leva a Configurações → Modelo da mensagem", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirMensagem(u);
      expect(within(janela).getByText(/O modelo da mensagem está vazio/)).toBeTruthy();
      expect((within(janela).getByRole("button", { name: "Copiar" }) as HTMLButtonElement).disabled).toBe(true);
      await u.click(within(janela).getByRole("button", { name: "Editar modelo" }));
      expect(roteador.push).toHaveBeenCalledWith("/configuracoes?secao=mensagem");
    });

    it("a Seleção esvaziada em outro aparelho fecha a janela, e ela não reabre na próxima marcação", async () => {
      novembroComSelecao();
      comModelo();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirMensagem(u);
      mudarBanco("lancamentos", (ls) =>
        ls.map((l) => ((l as { id: string }).id === "c1" ? { ...(l as object), excluido_em: "2026-11-08T00:00:00Z" } : l)),
      );
      expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
      await u.click(caixaDe("FARMACIA"));
      expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
    });

    it("Fechar fecha a janela e a Seleção continua", async () => {
      novembroComSelecao();
      comModelo();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirMensagem(u);
      await u.click(within(janela).getAllByRole("button", { name: "Fechar" }).at(-1)!);
      expect(screen.queryByRole("dialog", { name: "Gerar mensagem" })).toBeNull();
      expect(textoDaBarra()).toBe("1 selecionado · R$ 100,00");
    });
  });

  it("com o painel lateral aberto, a barra deixa a coluna dele livre", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(caixaDe("MERCADO"));
    expect(barra()!.parentElement!.hasAttribute("data-com-painel-lateral")).toBe(false);
    await u.click(within(linhaPorNome("FARMACIA")).getAllByRole("cell")[1]);
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(barra()!.parentElement!.hasAttribute("data-com-painel-lateral")).toBe(true);
    expect(barra()!.parentElement!.className).toContain("lg:right-painel-lateral");
  });

  it("a linha aberta que o filtro tirou da grade fica com a caixa desativada e fora da Seleção", async () => {
    novembroComSelecao();
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaPorNome("MERCADO")).getAllByRole("cell")[1]);
    await u.click(within(linhaPorNome("LIVRARIA")).getByRole("button", { name: "Filtrar por Rafael" }));
    expect(caixaDe("MERCADO").disabled).toBe(true);
    await u.click(cabecalho());
    expect(textoDaBarra()).toBe("2 selecionados · R$ 100,00");
  });

  describe("Programar dívida (História 6.6, FR-27, UX-DR19)", () => {
    const abrirMais = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(within(barra()!).getByRole("button", { name: "Mais" }));
    };
    const janela = () => screen.findByRole("dialog", { name: "Programar dívida" });
    const programar = async (u: ReturnType<typeof userEvent.setup>, data: string, observacao = "") => {
      const j = await janela();
      // A janela de uma Dívida que já existe abre com a data dela: troca o valor em vez de digitar por cima.
      fireEvent.change(within(j).getByLabelText("Data combinada"), { target: { value: data } });
      if (observacao !== "") await u.type(within(j).getByLabelText("Observação (opcional)"), observacao);
      await u.click(within(j).getByRole("button", { name: "Programar" }));
    };
    const AGORA = "2026-11-08T15:00:00.000Z";
    const modeloMsg = { saudacao: "Oi", frase_total: "Esse mês deu {total}", chave_pix: "pix@exemplo.com", rodape: "", campos: { nome: true, parcela: true, valor: true } };

    it("Seleção → ⋯ Mais → Programar dívida: a janela pede a data (obrigatória) e a observação; grava as marcadas numa chamada só", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      const j = await janela();
      expect(sem(j.textContent)).toContain("2 lançamentos");
      // Sem data, nada é gravado.
      await u.click(within(j).getByRole("button", { name: "Programar" }));
      expect(within(j).getByText("Escolha a data combinada.")).toBeTruthy();
      expect(repoL.programarDivida).not.toHaveBeenCalled();
      await programar(u, "2027-04-06", " Lucas paga no final ");
      expect(repoL.programarDivida).toHaveBeenCalledTimes(1);
      expect(repoL.programarDivida).toHaveBeenCalledWith([
        { id: "c1", vencimento_combinado: "2027-04-06", vencimento_observacao: "Lucas paga no final", editado_em: AGORA },
        { id: "c2", vencimento_combinado: "2027-04-06", vencimento_observacao: "Lucas paga no final", editado_em: AGORA },
      ]);
      expect(screen.queryByRole("dialog", { name: "Programar dívida" })).toBeNull();
      expect(await screen.findByText("2 lançamentos programados para 06/04/27")).toBeTruthy();
      // A Seleção continua; a grade mostra o selo nas duas linhas.
      expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
      expect(within(linhaPorNome("MERCADO")).getByText("Programada · 06/04/27")).toBeTruthy();
      expect(within(linhaPorNome("FARMACIA")).getByText("Programada · 06/04/27")).toBeTruthy();
    });

    it("o 'Desfazer' do aviso devolve a data e a observação de antes", async () => {
      novembroComSelecao([lanc("2026-11", { id: "p9", nome: "ÓCULOS", valor_centavos: 27000, responsavel_id: "r-rafael", vencimento_combinado: "2026-12-06", vencimento_observacao: "antes" } as Partial<LinhaLancamento>)]);
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("ÓCULOS"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-04-06");
      expect(await screen.findByText("2 lançamentos programados para 06/04/27")).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoL.programarDivida).toHaveBeenLastCalledWith([
        { id: "c1", vencimento_combinado: null, vencimento_observacao: null, editado_em: null },
        { id: "p9", vencimento_combinado: "2026-12-06", vencimento_observacao: "antes", editado_em: null },
      ]);
    });

    it("a janela de uma Dívida que já existe abre com a data e a observação dela", async () => {
      novembroComSelecao([lanc("2026-11", { id: "p9", nome: "ÓCULOS", valor_centavos: 27000, responsavel_id: "r-rafael", vencimento_combinado: "2026-12-06", vencimento_observacao: "no 13º" } as Partial<LinhaLancamento>)]);
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("ÓCULOS"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      const j = await janela();
      expect((within(j).getByLabelText("Data combinada") as HTMLInputElement).value).toBe("2026-12-06");
      expect((within(j).getByLabelText("Observação (opcional)") as HTMLTextAreaElement).value).toBe("no 13º");
    });

    it("o que já está pago fica de fora e o aviso diz quantos", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JÁ PAGO", valor_centavos: 3000, responsavel_id: "r-rafael", status_id: "s-pago" })]);
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("JÁ PAGO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-04-06");
      expect(repoL.programarDivida).toHaveBeenCalledWith([expect.objectContaining({ id: "c1" })]);
      expect(await screen.findByText("1 lançamento programado para 06/04/27 · 1 já pago ficou de fora")).toBeTruthy();
    });

    it("só lançamentos pagos: a janela fica aberta com o motivo e nada é gravado", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JÁ PAGO", valor_centavos: 3000, responsavel_id: "r-rafael", status_id: "s-pago" })]);
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("JÁ PAGO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-04-06");
      expect(await screen.findByText(mensagem("divida.so_pagos"))).toBeTruthy();
      expect(repoL.programarDivida).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Programar dívida" })).toBeTruthy();
    });

    it("falhou ao gravar: a janela fica aberta com o aviso e a Seleção continua", async () => {
      novembroComSelecao();
      repoL.programarDivida.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-04-06");
      expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
      expect(screen.getByRole("dialog", { name: "Programar dívida" })).toBeTruthy();
      expect(screen.queryByText("1 lançamento programado para 06/04/27")).toBeNull();
    });

    it("sem conexão, 'Programar' fica desativado", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      const j = await janela();
      act(() => {
        falso.online = false;
        for (const o of falso.ouvintes) o();
      });
      expect((within(j).getByRole("button", { name: "Programar" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("o ⋯ da linha também programa (uma linha só, sem Seleção)", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(within(linhaPorNome("PADARIA")).getByRole("button", { name: /ações/i }));
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-01-10");
      expect(repoL.programarDivida).toHaveBeenCalledWith([
        { id: "c3", vencimento_combinado: "2027-01-10", vencimento_observacao: null, editado_em: AGORA },
      ]);
      expect(within(linhaPorNome("PADARIA")).getByText("Programada · 10/01/27")).toBeTruthy();
    });

    it("a mãe dividida, pelo ⋯ do cabeçalho, programa as partes (nunca a mãe)", async () => {
      novembroComSelecao(divisao());
      renderizar();
      const u = userEvent.setup();
      const cabecalho = linhasDaGrade().find((r) => r.getAttribute("data-papel") === "cabecalho")!;
      await u.click(within(cabecalho).getByRole("button", { name: /ações/i }));
      await u.click(screen.getByRole("menuitem", { name: "Programar dívida" }));
      await programar(u, "2027-04-06");
      expect(repoL.programarDivida).toHaveBeenCalledWith([
        expect.objectContaining({ id: "p1" }),
        expect.objectContaining({ id: "p2" }),
      ]);
    });

    it("painel do Lançamento: o interruptor liga (abre a janela) e desliga (grava na hora, com 'Desfazer')", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(within(linhaPorNome("MERCADO")).getAllByRole("cell")[1]);
      const painel = screen.getByRole("complementary");
      const chave = within(painel).getByRole("switch", { name: "Dívida programada" });
      expect(chave.getAttribute("aria-checked")).toBe("false");
      await u.click(chave);
      await programar(u, "2027-04-06", "combinado");
      expect(repoL.programarDivida).toHaveBeenCalledWith([
        { id: "c1", vencimento_combinado: "2027-04-06", vencimento_observacao: "combinado", editado_em: AGORA },
      ]);
      const ligada = within(screen.getByRole("complementary")).getByRole("switch", { name: "Dívida programada" });
      expect(ligada.getAttribute("aria-checked")).toBe("true");
      expect(within(screen.getByRole("complementary")).getByText("Programada · 06/04/27")).toBeTruthy();
      expect(within(screen.getByRole("complementary")).getByText("combinado")).toBeTruthy();
      // Editar reabre a janela com os valores.
      await u.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Editar" }));
      expect((within(await janela()).getByLabelText("Data combinada") as HTMLInputElement).value).toBe("2027-04-06");
      await u.click(within(await janela()).getByRole("button", { name: "Cancelar" }));
      // Desligar grava sem janela.
      await u.click(within(screen.getByRole("complementary")).getByRole("switch", { name: "Dívida programada" }));
      expect(repoL.programarDivida).toHaveBeenLastCalledWith([
        { id: "c1", vencimento_combinado: null, vencimento_observacao: null, editado_em: AGORA },
      ]);
      expect(await screen.findByText("Dívida programada desligada em 1 lançamento")).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoL.programarDivida).toHaveBeenLastCalledWith([
        { id: "c1", vencimento_combinado: "2027-04-06", vencimento_observacao: "combinado", editado_em: AGORA },
      ]);
    });

    it("o painel de um lançamento pago não oferece o interruptor (só o aviso)", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JÁ PAGO", valor_centavos: 3000, responsavel_id: "r-rafael", status_id: "s-pago" })]);
      renderizar();
      const u = userEvent.setup();
      await u.click(within(linhaPorNome("JÁ PAGO")).getAllByRole("cell")[1]);
      const painel = screen.getByRole("complementary");
      expect(within(painel).queryByRole("switch", { name: "Dívida programada" })).toBeNull();
      expect(within(painel).getByText("Já está pago: não há o que programar.")).toBeTruthy();
    });

    it("a mensagem da Seleção deixa a Dívida ainda não vencida de fora (hoje = 08/11/26), e no mês do vencimento ela entra", async () => {
      novembroComSelecao([lanc("2026-11", { id: "dv", nome: "BOMBINHAS", valor_centavos: 10600, responsavel_id: "r-rafael", vencimento_combinado: "2027-04-06" } as Partial<LinhaLancamento>)]);
      falso.banco.configuracoes = [{ id: "cfg", status_padrao_id: null, modelo_mensagem: modeloMsg, updated_at: "2026-11-03T12:00:00+00:00" }];
      falso.versao++;
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("BOMBINHAS"));
      await u.click(within(barra()!).getByRole("button", { name: "Gerar mensagem" }));
      const j = await screen.findByRole("dialog", { name: "Gerar mensagem" });
      expect(sem(j.textContent)).toContain("1 item não entra: 1 dívida programada ainda não vencida");
      expect((within(j).getByRole("textbox", { name: "Mensagem" }) as HTMLTextAreaElement).value).toContain("MERCADO");
      expect((within(j).getByRole("textbox", { name: "Mensagem" }) as HTMLTextAreaElement).value).not.toContain("BOMBINHAS");
    });
  });

  describe("⋯ Mais", () => {
    const abrirMais = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(within(barra()!).getByRole("button", { name: "Mais" }));
    };

    it("Excluir: confirma, leva os Ajustes junto numa gravação só, avisa e o 'Desfazer' restaura", async () => {
      novembroComSelecao(comAjuste());
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(screen.getByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" }));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
      const dialogo = await screen.findByRole("alertdialog");
      expect(sem(dialogo.textContent)).toContain("2 lançamentos saem da grade junto com 1 Ajuste");
      await u.click(within(dialogo).getByRole("button", { name: "Excluir lançamentos" }));
      expect(repoL.excluir).toHaveBeenCalledWith("c1", { junto: ["msc", "aj"] });
      expect(await screen.findByText("2 lançamentos excluídos")).toBeTruthy();
      expect(barra()).toBeNull();
      expect(nomesDaGrade()).not.toContain("MERCADO");
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoL.restaurar).toHaveBeenCalledWith("c1", { junto: ["msc", "aj"] });
      expect(nomesDaGrade()).toContain("MERCADO");
    });

    it("Excluir falhando: a mensagem do código", async () => {
      novembroComSelecao();
      repoL.excluir.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
      await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir lançamentos" }));
      expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    });

    it("a parte de uma Divisão não se exclui: só ela marcada, 'Excluir' nem aparece; com outra, a confirmação avisa", async () => {
      novembroComSelecao(divisao().slice(0, 2));
      renderizar();
      const u = userEvent.setup();
      await u.click(screen.getByRole("checkbox", { name: "Selecionar MONJARO" }));
      await abrirMais(u);
      expect(screen.queryByRole("menuitem", { name: "Excluir" })).toBeNull();
      await u.keyboard("{Escape}");
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
      const dialogo = await screen.findByRole("alertdialog");
      expect(sem(dialogo.textContent)).toContain("1 parte de uma Divisão fica");
      await u.click(within(dialogo).getByRole("button", { name: "Excluir lançamentos" }));
      expect(repoL.excluir).toHaveBeenCalledWith("c1");
    });

    it("Classificar em lote: atribui Responsável, Tipo, Status e Observação pela função da 3.3, com 'Desfazer'", async () => {
      novembroComSelecao();
      repoL.classificarEmLote.mockResolvedValueOnce({
        ok: true,
        linhas: [],
        gravadas: 2,
        antes: [{ id: "c1", corpo: { tipo_id: null } }],
      });
      repoL.desfazerLote.mockResolvedValueOnce({ ok: true, linhas: [], gravadas: 1, antes: [] });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Classificar em lote" }));
      const janela = await screen.findByRole("dialog", { name: "Classificar em lote" });
      const aplicar = within(janela).getByRole("button", { name: "Aplicar a 2" }) as HTMLButtonElement;
      expect(aplicar.disabled).toBe(true);
      await u.selectOptions(within(janela).getByLabelText("Responsável"), "r-rafael");
      await u.selectOptions(within(janela).getByLabelText("Tipo"), "t-casa");
      await u.selectOptions(within(janela).getByLabelText("Status"), "s-pago");
      await u.type(within(janela).getByLabelText("Observação"), "  conferido ");
      expect(aplicar.disabled).toBe(false);
      await u.click(aplicar);
      const campos = { responsavel_id: "r-rafael", tipo_id: "t-casa", status_id: "s-pago", observacao: "conferido" };
      expect(repoL.classificarEmLote).toHaveBeenCalledWith([
        { id: "c1", campos },
        { id: "c2", campos },
      ]);
      expect(screen.queryByRole("dialog", { name: "Classificar em lote" })).toBeNull();
      expect(await screen.findByText("2 lançamentos classificados")).toBeTruthy();
      // A Seleção continua para a próxima ação.
      expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoL.desfazerLote).toHaveBeenCalledWith([{ id: "c1", corpo: { tipo_id: null } }]);
    });

    it("Classificar em lote falhando: tudo ou nada, a janela e a Seleção ficam e o aviso diz o motivo", async () => {
      novembroComSelecao();
      repoL.classificarEmLote.mockResolvedValueOnce({ ok: false, codigo: "conexao.gravar_sem_conexao" });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Classificar em lote" }));
      const janela = await screen.findByRole("dialog", { name: "Classificar em lote" });
      await u.selectOptions(within(janela).getByLabelText("Status"), "__sem_status__");
      await u.click(within(janela).getByRole("button", { name: "Aplicar a 1" }));
      expect(repoL.classificarEmLote).toHaveBeenCalledWith([{ id: "c1", campos: { status_id: null } }]);
      expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
      expect(screen.getByRole("dialog", { name: "Classificar em lote" })).toBeTruthy();
      expect(textoDaBarra()).toBe("1 selecionado · R$ 100,00");
    });

    it("a parte de uma Divisão só recebe o Status: a janela avisa e as entradas levam só o Status", async () => {
      novembroComSelecao(divisao().slice(0, 2));
      repoL.classificarEmLote.mockResolvedValueOnce({ ok: true, linhas: [], gravadas: 2, antes: [] });
      renderizar();
      const u = userEvent.setup();
      await u.click(screen.getByRole("checkbox", { name: "Selecionar MONJARO" }));
      await u.click(caixaDe("MERCADO"));
      await abrirMais(u);
      await u.click(screen.getByRole("menuitem", { name: "Classificar em lote" }));
      const janela = await screen.findByRole("dialog", { name: "Classificar em lote" });
      expect(within(janela).getByText(/1 parte de uma Divisão só recebe o Status/)).toBeTruthy();
      await u.selectOptions(within(janela).getByLabelText("Tipo"), "t-casa");
      await u.selectOptions(within(janela).getByLabelText("Status"), "s-pago");
      await u.click(within(janela).getByRole("button", { name: "Aplicar a 2" }));
      expect(repoL.classificarEmLote).toHaveBeenCalledWith([
        { id: "c1", campos: { tipo_id: "t-casa", status_id: "s-pago" } },
        { id: "p1", campos: { status_id: "s-pago" } },
      ]);
    });
  });

  describe("Aplicar status (História 6.1, FR-25, UX-DR18)", () => {
    const abrirAplicarStatus = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(within(barra()!).getByRole("button", { name: "Aplicar status" }));
      return screen.findByRole("dialog", { name: "Aplicar status" });
    };
    const botaoAplicar = (janela: HTMLElement) => within(janela).getByRole("button", { name: "Aplicar" }) as HTMLButtonElement;
    const item = (id: string, lancamento: string, extra: Record<string, unknown> = {}) => ({
      id,
      pagamento_id: "pg-antigo",
      lancamento_id: lancamento,
      mes: "2026-11",
      valor_centavos: 100,
      status_anterior_id: "s-nao",
      status_aplicado_id: "s-pago",
      excluido_em: null,
      updated_at: "2026-11-05T12:00:00+00:00",
      ...extra,
    });

    it("a barra tem 'Aplicar status' entre 'Limpar' e 'Mais'; a janela lista os Status e nada vem escolhido", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      expect(within(barra()!).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Limpar",
        "Aplicar status",
        "⋯Mais",
        "Gerar mensagem",
      ]);
      const janela = await abrirAplicarStatus(u);
      expect(sem(janela.textContent)).toContain("2 selecionados · R$ 150,00");
      const lista = within(janela).getByRole("radiogroup", { name: "Status a aplicar" });
      expect(within(lista).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Não pago", "Pago"]);
      expect(within(lista).getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
      expect(botaoAplicar(janela).disabled).toBe(true);
      expect(within(janela).queryByLabelText("Valor recebido")).toBeNull();
    });

    it("Status que conta como pago: aparecem a Data (hoje, em São Paulo) e o Valor recebido (o total); que não conta: somem", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      const data = within(janela).getByLabelText("Data do pagamento") as HTMLInputElement;
      expect(data.value).toBe("2026-11-08");
      expect(data.max).toBe("2026-11-08");
      expect((within(janela).getByLabelText("Valor recebido") as HTMLInputElement).value).toBe("150,00");
      expect(sem(janela.textContent)).toContain("Total a receber: R$ 150,00");
      expect(botaoAplicar(janela).disabled).toBe(false);
      await u.click(within(janela).getByRole("radio", { name: "Não pago" }));
      expect(within(janela).queryByLabelText("Valor recebido")).toBeNull();
      expect(within(janela).queryByLabelText("Data do pagamento")).toBeNull();
      expect(within(janela).getByText("Só o status muda. Nenhum pagamento é registrado.")).toBeTruthy();
    });

    it("valor igual ao total: manda o pedido do núcleo (modo total, um item por linha), avisa 'N lançamentos marcados como pagos' e o 'Desfazer' desfaz o Pagamento", async () => {
      novembroComSelecao();
      repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
      repoP.desfazer.mockResolvedValueOnce({ ok: true });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      await u.click(botaoAplicar(janela));
      expect(repoP.aplicar).toHaveBeenCalledTimes(1);
      const pedido = repoP.aplicar.mock.calls[0][0] as Record<string, unknown> & { itens: { lancamento_id: string; valor_centavos: number; atualizado_em: string }[] };
      expect(pedido).toMatchObject({ status_id: "s-pago", data: "2026-11-08", valor_recebido_centavos: 15000, modo: "total" });
      expect(pedido.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(pedido.itens).toEqual([
        { lancamento_id: "c1", valor_centavos: 10000, atualizado_em: "2026-11-03T12:00:00+00:00", quita: true },
        { lancamento_id: "c2", valor_centavos: 5000, atualizado_em: "2026-11-03T12:00:00+00:00", quita: true },
      ]);
      expect(screen.queryByRole("dialog", { name: "Aplicar status" })).toBeNull();
      expect(await screen.findByText("2 lançamentos marcados como pagos")).toBeTruthy();
      // A Seleção continua (como nas outras ações da barra).
      expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoP.desfazer).toHaveBeenCalledWith("pg-novo");
    });

    it("o Valor recebido não passa do total, é maior que zero e menor pede a escolha: o erro aparece no campo e 'Aplicar' fica desativado", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      const valor = within(janela).getByLabelText("Valor recebido");
      const tentar = async (texto: string) => {
        await u.clear(valor);
        if (texto !== "") await u.type(valor, texto);
        return sem(janela.textContent);
      };
      expect(await tentar("150,01")).toContain("O valor recebido não pode passar de R$ 150,00");
      expect(botaoAplicar(janela).disabled).toBe(true);
      // Menor que o total não é erro: aparece a pergunta da diferença, e Aplicar espera a escolha.
      const menor = await tentar("100,00");
      expect(menor).toContain("O que fazer com a diferença de R$ 50,00?");
      expect(menor).not.toContain("precisa ser o total");
      expect(botaoAplicar(janela).disabled).toBe(true);
      expect(await tentar("0")).toContain("Digite um valor maior que zero");
      expect(await tentar("-5")).toContain("Digite um valor maior que zero");
      expect(await tentar("")).toContain("Digite o valor recebido");
      expect(await tentar("150,00")).not.toContain("O valor recebido");
      expect(botaoAplicar(janela).disabled).toBe(false);
      expect(repoP.aplicar).not.toHaveBeenCalled();
    });

    describe("valor menor que o total (História 6.2, FR-25, UX-DR18)", () => {
      const abrirComDuas = async (u: ReturnType<typeof userEvent.setup>) => {
        await u.click(caixaDe("MERCADO"));
        await u.click(caixaDe("FARMACIA"));
        const janela = await abrirAplicarStatus(u);
        await u.click(within(janela).getByRole("radio", { name: "Pago" }));
        return janela;
      };
      const digitar = async (u: ReturnType<typeof userEvent.setup>, janela: HTMLElement, texto: string) => {
        const valor = within(janela).getByLabelText("Valor recebido");
        await u.clear(valor);
        await u.type(valor, texto);
      };
      const pergunta = (janela: HTMLElement) => within(janela).queryByRole("radiogroup", { name: /O que fazer com a diferença de/ });
      type Pedido = { modo: string; valor_recebido_centavos: number; itens: { lancamento_id: string; valor_centavos: number; quita: boolean }[] };

      it("a pergunta traz os dois cartões, de mesma altura, rádio de 18 px, valor sem quebra de linha, e nenhum vem marcado", async () => {
        novembroComSelecao();
        renderizar();
        const u = userEvent.setup();
        const janela = await abrirComDuas(u);
        expect(pergunta(janela)).toBeNull();
        await digitar(u, janela, "100,00");
        const grupo = pergunta(janela)!;
        expect(sem(grupo.textContent)).toContain("Fica pendente");
        expect(sem(grupo.textContent)).toContain("Quita dos mais antigos para os mais novos. O que faltar continua em aberto.");
        expect(sem(grupo.textContent)).toContain("Não é dívida, é a minha parte");
        expect(sem(grupo.textContent)).toContain("Todos os lançamentos ficam pagos. O pagamento registra R$ 100,00.");
        const radios = within(grupo).getAllByRole("radio") as HTMLInputElement[];
        expect(radios).toHaveLength(2);
        expect(radios.every((r) => !r.checked)).toBe(true);
        // Mesma altura (a grade estica os cartões) e rádio de 18 px (size-4.5).
        expect(grupo.className).toContain("items-stretch");
        expect(radios.map((r) => r.closest("label")!.className.includes("min-h-toque"))).toEqual([true, true]);
        expect(radios.every((r) => r.className.includes("size-4.5"))).toBe(true);
        // O valor em R$ não quebra de linha: o da pergunta e o do cartão "minha parte".
        const semQuebra = [...janela.querySelectorAll("span.whitespace-nowrap")].map((e) => sem(e.textContent));
        expect(semQuebra).toContain("R$ 50,00");
        expect(semQuebra).toContain("R$ 100,00");
        expect(botaoAplicar(janela).disabled).toBe(true);
      });

      it("Fica pendente: o núcleo quita dos mais antigos aos mais novos e o último fica com item parcial (modo parcial)", async () => {
        novembroComSelecao();
        repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
        repoP.desfazer.mockResolvedValueOnce({ ok: true });
        renderizar();
        const u = userEvent.setup();
        const janela = await abrirComDuas(u);
        await digitar(u, janela, "120,00");
        expect(botaoAplicar(janela).disabled).toBe(true);
        await u.click(within(janela).getByRole("radio", { name: /Fica pendente/ }));
        expect(botaoAplicar(janela).disabled).toBe(false);
        await u.click(botaoAplicar(janela));
        const pedido = repoP.aplicar.mock.calls[0][0] as Pedido;
        expect(pedido).toMatchObject({ modo: "parcial", valor_recebido_centavos: 12000 });
        expect(pedido.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
          ["c1", 10000, true],
          ["c2", 2000, false],
        ]);
        const aviso = await screen.findByText(/Pagamento parcial registrado/);
        expect(sem(aviso.textContent)).toContain("Pagamento parcial registrado: R$ 120,00 · 1 lançamento marcado como pago");
        expect(textoDaBarra()).toBe("2 selecionados · R$ 150,00");
        await u.click(screen.getByRole("button", { name: "Desfazer" }));
        expect(repoP.desfazer).toHaveBeenCalledWith("pg-novo");
      });

      it("Não é dívida, é a minha parte: todas ficam quitadas e o Pagamento registra o valor recebido (modo minha_parte)", async () => {
        novembroComSelecao();
        repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
        renderizar();
        const u = userEvent.setup();
        const janela = await abrirComDuas(u);
        await digitar(u, janela, "75,00");
        await u.click(within(janela).getByRole("radio", { name: /Não é dívida, é a minha parte/ }));
        await u.click(botaoAplicar(janela));
        const pedido = repoP.aplicar.mock.calls[0][0] as Pedido;
        expect(pedido).toMatchObject({ modo: "minha_parte", valor_recebido_centavos: 7500 });
        expect(pedido.itens.map((i) => [i.lancamento_id, i.valor_centavos, i.quita])).toEqual([
          ["c1", 10000, true],
          ["c2", 5000, true],
        ]);
        expect(await screen.findByText("2 lançamentos marcados como pagos")).toBeTruthy();
      });

      it("mudar o valor muda a diferença e a escolha volta a vazia; o valor igual ao total tira a pergunta e vira total", async () => {
        novembroComSelecao();
        repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
        renderizar();
        const u = userEvent.setup();
        const janela = await abrirComDuas(u);
        await digitar(u, janela, "100,00");
        await u.click(within(janela).getByRole("radio", { name: /Fica pendente/ }));
        expect(botaoAplicar(janela).disabled).toBe(false);
        await digitar(u, janela, "90,00");
        expect(sem(janela.textContent)).toContain("O que fazer com a diferença de R$ 60,00?");
        expect((within(janela).getAllByRole("radio", { name: /Fica pendente|Não é dívida/ }) as HTMLInputElement[]).every((r) => !r.checked)).toBe(true);
        expect(botaoAplicar(janela).disabled).toBe(true);
        await u.click(within(janela).getByRole("radio", { name: /Não é dívida/ }));
        await digitar(u, janela, "150,00");
        expect(pergunta(janela)).toBeNull();
        expect(botaoAplicar(janela).disabled).toBe(false);
        await u.click(botaoAplicar(janela));
        expect((repoP.aplicar.mock.calls[0][0] as Pedido).modo).toBe("total");
      });

      it("valor maior que o total ou inválido não pergunta nada", async () => {
        novembroComSelecao();
        renderizar();
        const u = userEvent.setup();
        const janela = await abrirComDuas(u);
        for (const texto of ["150,01", "0", "abc"]) {
          await digitar(u, janela, texto);
          expect(pergunta(janela)).toBeNull();
        }
      });
    });

    describe("Pago parcialmente (História 6.2)", () => {
      const parcial = () => item("ip1", "c1", { valor_centavos: 4000, status_aplicado_id: null });

      it("a grade mostra o selo 'Pago parcialmente' e o painel do Lançamento mostra 'falta R$ 60,00'", async () => {
        novembroComSelecao();
        falso.banco = { ...falso.banco, pagamento_itens: [parcial()] };
        renderizar();
        const u = userEvent.setup();
        const linhaMercado = screen.getByRole("checkbox", { name: "Selecionar MERCADO" }).closest("tr")!;
        expect(within(linhaMercado).getByText("Pago parcialmente")).toBeTruthy();
        // As outras linhas seguem com o Status delas.
        const linhaFarmacia = screen.getByRole("checkbox", { name: "Selecionar FARMACIA" }).closest("tr")!;
        expect(within(linhaFarmacia).queryByText("Pago parcialmente")).toBeNull();
        await u.click(within(linhaMercado).getByText("MERCADO"));
        const painel = await screen.findByRole("complementary");
        expect(sem(painel.textContent)).toContain("Pago parcialmente");
        expect(sem(painel.textContent)).toContain("falta R$ 60,00");
      });

      it("o outro aparelho vê: um item novo chega pelo Realtime e o selo aparece; o item desfeito tira o selo", async () => {
        novembroComSelecao();
        renderizar();
        const linhaMercado = () => screen.getByRole("checkbox", { name: "Selecionar MERCADO" }).closest("tr")!;
        expect(within(linhaMercado()).queryByText("Pago parcialmente")).toBeNull();
        mudarBanco("pagamento_itens", () => [parcial()]);
        expect(await within(linhaMercado()).findByText("Pago parcialmente")).toBeTruthy();
        mudarBanco("pagamento_itens", () => [{ ...parcial(), excluido_em: "2026-11-08T12:00:00+00:00" }]);
        await waitFor(() => expect(within(linhaMercado()).queryByText("Pago parcialmente")).toBeNull());
      });

      it("uma segunda cobrança da linha parcial: o total a receber e o valor padrão são só o que falta", async () => {
        novembroComSelecao();
        falso.banco = { ...falso.banco, pagamento_itens: [parcial()] };
        repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
        renderizar();
        const u = userEvent.setup();
        await u.click(caixaDe("MERCADO"));
        const janela = await abrirAplicarStatus(u);
        await u.click(within(janela).getByRole("radio", { name: "Pago" }));
        expect((within(janela).getByLabelText("Valor recebido") as HTMLInputElement).value).toBe("60,00");
        expect(sem(janela.textContent)).toContain("Total a receber: R$ 60,00");
        await u.click(botaoAplicar(janela));
        const pedido = repoP.aplicar.mock.calls[0][0] as { modo: string; itens: { valor_centavos: number; quita: boolean }[] };
        expect(pedido.modo).toBe("total");
        expect(pedido.itens).toMatchObject([{ valor_centavos: 6000, quita: true }]);
      });

      it("a mensagem de cobrança inclui só o que falta (a da Seleção)", async () => {
        novembroComSelecao();
        falso.banco = {
          ...falso.banco,
          pagamento_itens: [parcial()],
          configuracoes: [
            { id: "cfg", status_padrao_id: null, updated_at: "2026-11-03T12:00:00+00:00", modelo_mensagem: { saudacao: "Oi", frase_total: "Esse mês deu {total}", chave_pix: "pix@exemplo.com", rodape: "", campos: { nome: true, parcela: true, valor: true } } },
          ],
        };
        renderizar();
        const u = userEvent.setup();
        await u.click(caixaDe("MERCADO"));
        await u.click(within(barra()!).getByRole("button", { name: "Gerar mensagem" }));
        const janela = await screen.findByRole("dialog", { name: "Gerar mensagem" });
        const quadro = (await within(janela).findByRole("textbox", { name: "Mensagem" })) as HTMLTextAreaElement;
        expect(sem(quadro.value)).toContain("MERCADO | R$ 60,00");
        expect(sem(quadro.value)).toContain("Esse mês deu R$ 60,00");
        expect(sem(quadro.value)).not.toContain("R$ 100,00");
      });

      it("trocar à mão 'não pago' por outro 'não pago' numa linha parcial passa no lote; tirar o 'pago' de uma quitada não", async () => {
        novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JA PAGO", valor_centavos: 4000, status_id: "s-pago" })]);
        falso.banco = { ...falso.banco, pagamento_itens: [parcial(), item("i9", "pg")] };
        repoL.classificarEmLote.mockResolvedValue({ ok: true, linhas: [], gravadas: 1, antes: [] });
        renderizar();
        const u = userEvent.setup();
        await u.click(caixaDe("MERCADO"));
        let janela = await abrirAplicarStatus(u);
        await u.click(within(janela).getByRole("radio", { name: "Não pago" }));
        await u.click(botaoAplicar(janela));
        expect(repoL.classificarEmLote).toHaveBeenCalledTimes(1);
        await u.click(caixaDe("MERCADO"));
        await u.click(caixaDe("JA PAGO"));
        janela = await abrirAplicarStatus(u);
        await u.click(within(janela).getByRole("radio", { name: "Não pago" }));
        await u.click(botaoAplicar(janela));
        expect((await within(janela).findByRole("alert")).textContent).toBe(mensagem("pagamento.desfazer_antes"));
        expect(repoL.classificarEmLote).toHaveBeenCalledTimes(1);
      });
    });

    it("a Data não pode ser depois de hoje; no passado vale", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      const data = within(janela).getByLabelText("Data do pagamento");
      fireEvent.change(data, { target: { value: "2026-11-09" } });
      expect(sem(janela.textContent)).toContain("A data não pode ser depois de hoje.");
      expect(botaoAplicar(janela).disabled).toBe(true);
      fireEvent.change(data, { target: { value: "2026-11-02" } });
      expect(botaoAplicar(janela).disabled).toBe(false);
    });

    it("o que já está pago, é R$ 0,00 ou é previsto fica de fora: o total é só do que entra", async () => {
      novembroComSelecao([
        lanc("2026-11", { id: "pg", nome: "JA PAGO", valor_centavos: 4000, status_id: "s-pago" }),
        lanc("2026-11", { id: "zr", nome: "ANUIDADE", valor_centavos: 0 }),
        lanc("2026-11", { id: "pv", nome: "PREVISTA", valor_centavos: 2500, lancado_por: "sistema", fatura_id: null }),
      ]);
      renderizar();
      const u = userEvent.setup();
      for (const n of ["MERCADO", "JA PAGO", "ANUIDADE"]) await u.click(caixaDe(n));
      await u.click(screen.getByRole("checkbox", { name: "Selecionar PREVISTA" }));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      expect(sem(janela.textContent)).toContain("3 itens ficam de fora: 1 já pago, 1 de R$ 0,00, 1 previsto");
      expect((within(janela).getByLabelText("Valor recebido") as HTMLInputElement).value).toBe("100,00");
    });

    it("sem nada a receber (só pagos), 'Aplicar' fica desativado e a janela diz por quê", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JA PAGO", valor_centavos: 4000, status_id: "s-pago" })]);
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("JA PAGO"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      expect(sem(janela.textContent)).toContain("Nenhum dos selecionados pode receber pagamento");
      expect(botaoAplicar(janela).disabled).toBe(true);
    });

    it("Pagamento sobre um Ajuste: entra junto com a parcela e o total é o líquido", async () => {
      novembroComSelecao(comAjuste());
      repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
      renderizar();
      const u = userEvent.setup();
      await u.click(screen.getByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" }));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      expect((within(janela).getByLabelText("Valor recebido") as HTMLInputElement).value).toBe("1.140,66");
      await u.click(botaoAplicar(janela));
      const pedido = repoP.aplicar.mock.calls[0][0] as { itens: { lancamento_id: string; valor_centavos: number }[] };
      expect(pedido.itens.map((i) => [i.lancamento_id, i.valor_centavos]).sort()).toEqual([
        ["aj", -8],
        ["msc", 114074],
      ]);
      expect(await screen.findByText("1 lançamento marcado como pago")).toBeTruthy();
    });

    it("um Pagamento sobre partes de uma Divisão (a mãe nunca entra)", async () => {
      novembroComSelecao(divisao());
      repoP.aplicar.mockResolvedValueOnce({ ok: true, pagamento: { id: "pg-novo" }, itens: [], linhas: [] });
      renderizar();
      const u = userEvent.setup();
      const partes = screen.getAllByRole("checkbox", { name: "Selecionar MONJARO" });
      await u.click(partes[0]);
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      await u.click(botaoAplicar(janela));
      const pedido = repoP.aplicar.mock.calls[0][0] as { itens: { lancamento_id: string }[] };
      expect(pedido.itens).toHaveLength(1);
      expect(["p1", "p2"]).toContain(pedido.itens[0].lancamento_id);
    });

    it("Pagamento recusado (uma linha mudou em outro aparelho): a janela e a Seleção ficam, com o motivo", async () => {
      novembroComSelecao();
      repoP.aplicar.mockResolvedValueOnce({ ok: false, codigo: "pagamento.mudou" });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      await u.click(botaoAplicar(janela));
      expect((await within(janela).findByRole("alert")).textContent).toBe(mensagem("pagamento.mudou"));
      expect(screen.getByRole("dialog", { name: "Aplicar status" })).toBeTruthy();
      expect(textoDaBarra()).toBe("1 selecionado · R$ 100,00");
    });

    it("Status que não conta como pago: só o Status muda, pela gravação em lote, sem Pagamento", async () => {
      novembroComSelecao();
      repoL.classificarEmLote.mockResolvedValueOnce({ ok: true, linhas: [], gravadas: 2, antes: [{ id: "c1", corpo: { status_id: "s-pago" } }] });
      repoL.desfazerLote.mockResolvedValueOnce({ ok: true, linhas: [], gravadas: 1, antes: [] });
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("FARMACIA"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Não pago" }));
      await u.click(botaoAplicar(janela));
      expect(repoL.classificarEmLote).toHaveBeenCalledWith([
        { id: "c1", campos: { status_id: "s-nao" } },
        { id: "c2", campos: { status_id: "s-nao" } },
      ]);
      expect(repoP.aplicar).not.toHaveBeenCalled();
      expect(await screen.findByText("Status aplicado a 2 lançamentos")).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(repoL.desfazerLote).toHaveBeenCalledWith([{ id: "c1", corpo: { status_id: "s-pago" } }]);
    });

    it("aplicar à mão um Status 'não pago' numa linha com Pagamento é recusado: desfaça o pagamento antes", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JA PAGO", valor_centavos: 4000, status_id: "s-pago" })]);
      falso.banco = { ...falso.banco, pagamento_itens: [item("i1", "pg")] };
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await u.click(caixaDe("JA PAGO"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Não pago" }));
      await u.click(botaoAplicar(janela));
      expect((await within(janela).findByRole("alert")).textContent).toBe(mensagem("pagamento.desfazer_antes"));
      expect(repoL.classificarEmLote).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Aplicar status" })).toBeTruthy();
    });

    it("o mesmo vale para 'Classificar em lote' com Status 'Sem status'", async () => {
      novembroComSelecao([lanc("2026-11", { id: "pg", nome: "JA PAGO", valor_centavos: 4000, status_id: "s-pago" })]);
      falso.banco = { ...falso.banco, pagamento_itens: [item("i1", "pg")] };
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("JA PAGO"));
      await u.click(within(barra()!).getByRole("button", { name: "Mais" }));
      await u.click(screen.getByRole("menuitem", { name: "Classificar em lote" }));
      const janela = await screen.findByRole("dialog", { name: "Classificar em lote" });
      await u.selectOptions(within(janela).getByLabelText("Status"), "__sem_status__");
      await u.click(within(janela).getByRole("button", { name: "Aplicar a 1" }));
      expect(await screen.findByText(mensagem("pagamento.desfazer_antes"))).toBeTruthy();
      expect(repoL.classificarEmLote).not.toHaveBeenCalled();
    });

    it("sem conexão 'Aplicar status' fica desativado e nada é tentado (AD-3)", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      act(() => {
        falso.online = false;
        falso.versao++;
        for (const o of falso.ouvintes) o();
      });
      const botao = within(barra()!).getByRole("button", { name: "Aplicar status" }) as HTMLButtonElement;
      expect(botao.disabled).toBe(true);
      expect(botao.title).toBe(mensagem("conexao.sem_conexao"));
      await u.click(botao);
      expect(screen.queryByRole("dialog", { name: "Aplicar status" })).toBeNull();
      expect(repoP.aplicar).not.toHaveBeenCalled();
    });

    it("sem Seleção a janela fecha (as linhas foram excluídas em outro aparelho)", async () => {
      novembroComSelecao();
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      await abrirAplicarStatus(u);
      mudarBanco("lancamentos", (ls) => ls.map((l) => ((l as { id: string }).id === "c1" ? { ...(l as object), excluido_em: "2026-11-08T00:00:00Z" } : l)));
      expect(screen.queryByRole("dialog", { name: "Aplicar status" })).toBeNull();
    });

    it("os itens de Pagamento ainda carregando: a janela espera e 'Aplicar' fica desativado", async () => {
      novembroComSelecao();
      falso.statusTabelas = { pagamento_itens: "carregando" };
      renderizar();
      const u = userEvent.setup();
      await u.click(caixaDe("MERCADO"));
      const janela = await abrirAplicarStatus(u);
      await u.click(within(janela).getByRole("radio", { name: "Pago" }));
      expect(sem(janela.textContent)).toContain("Conferindo os pagamentos já registrados");
      expect(botaoAplicar(janela).disabled).toBe(true);
    });
  });
});

describe("Atrasado (História 6.4, FR-49, UX-DR22)", () => {
  /** Novembro/26 (vence 06/11/26): dois não pagos, um sem Status, um pago e um previsto. */
  function novembroComPendencias() {
    definir({
      faturas: [novembro],
      lancamentos: [
        lanc("2026-11", { id: "a1", nome: "MERCADO", valor_centavos: 10_000 }),
        lanc("2026-11", { id: "a2", nome: "FARMACIA", valor_centavos: 5000, status_id: "s-pago" }),
        lanc("2026-11", { id: "a3", nome: "PADARIA", valor_centavos: 3000, status_id: null }),
        lanc("2026-11", { id: "a4", nome: "NETFLIX", valor_centavos: 5000, lancado_por: "sistema" }),
      ],
    });
  }
  const linhaDe = (nome: string) => screen.getByRole("checkbox", { name: `Selecionar ${nome}` }).closest("tr")!;
  const selo = (nome: string, texto: string) => within(linhaDe(nome)).queryByText(texto);
  const em = (instante: string) => vi.setSystemTime(new Date(instante));
  /** Acrescenta tabelas ao "banco" falso e avisa as telas (o gerenciador falso guarda o retrato por versão). */
  const noBanco = (extra: Record<string, unknown[]>) => {
    falso.banco = { ...falso.banco, ...extra };
    falso.versao++;
  };
  const ciclo = [
    { id: "c1", dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00+00:00" },
  ];

  it("no último dia da tolerância (16/11/26) ninguém está atrasado; só os Status de sempre", () => {
    novembroComPendencias();
    em("2026-11-16T15:00:00Z");
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
    expect(selo("MERCADO", "Não pago")).toBeTruthy();
    expect(linhaDe("MERCADO").getAttribute("aria-label")).not.toContain("atrasado");
  });

  it("no dia seguinte (17/11/26) o selo Atrasado substitui Não pago; Pago e o previsto não mudam", () => {
    novembroComPendencias();
    em("2026-11-17T15:00:00Z");
    renderizar();
    const mercado = selo("MERCADO", "Atrasado")!;
    expect(mercado).toBeTruthy();
    expect(mercado.getAttribute("data-selo")).toBe("atrasado");
    expect(mercado.className).toContain("bg-status-late-bg");
    expect(mercado.className).toContain("text-status-late-fg");
    expect(mercado.getAttribute("title")).toBe("atrasado desde 17/11/26");
    expect(selo("MERCADO", "Não pago")).toBeNull();
    // Sem Status também vale não pago: atrasa.
    expect(selo("PADARIA", "Atrasado")).toBeTruthy();
    // O pago e o previsto ficam como estavam.
    expect(selo("FARMACIA", "Pago")).toBeTruthy();
    expect(selo("FARMACIA", "Atrasado")).toBeNull();
    expect(selo("NETFLIX", "Atrasado")).toBeNull();
    // O nome acessível da linha diz a data (a cor não é a única pista).
    expect(linhaDe("MERCADO").getAttribute("aria-label")).toContain("atrasado desde 17/11/26");
    expect(linhaDe("FARMACIA").getAttribute("aria-label")).not.toContain("atrasado");
  });

  it("o dia de São Paulo manda: 02:59 UTC do dia 17 ainda é dia 16", () => {
    novembroComPendencias();
    em("2026-11-17T02:59:00Z");
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
  });

  it("o dia vira com a tela aberta: ao voltar o foco, o selo aparece sem recarregar", () => {
    novembroComPendencias();
    em("2026-11-17T02:50:00Z"); // 23:50 de 16/11 em São Paulo
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
    em("2026-11-17T03:05:00Z"); // 00:05 de 17/11
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(selo("MERCADO", "Atrasado")).toBeTruthy();
  });

  it("a tolerância vem de Configurações: com 0 dias, 08/11/26 já é atraso; sem a linha vale o padrão (10)", () => {
    novembroComPendencias();
    em("2026-11-08T15:00:00Z");
    const { unmount } = renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
    unmount();
    noBanco({
      configuracoes: [{ id: "cfg", tolerancia_atraso_dias: 0, status_padrao_id: null, updated_at: "2026-11-03T12:00:00+00:00" }],
    });
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeTruthy();
  });

  it("o vencimento da Fatura importada manda (07/11) sobre o Ciclo (06/11)", () => {
    novembroComPendencias();
    noBanco({ faturas: [{ ...novembro, vencimento: "2026-11-07" }], config_ciclo: ciclo });
    em("2026-11-17T15:00:00Z");
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
  });

  it("um Mês sem Fatura usa o vencimento do Ciclo; sem Ciclo, ninguém atrasa e nada quebra", () => {
    const historico = [lanc("2026-11", { id: "h1", nome: "ALUGUEL", valor_centavos: 90_000, lancado_por: "historico", fatura_id: null })];
    definir({ faturas: [], lancamentos: historico });
    em("2026-11-17T15:00:00Z");
    const { unmount } = renderizar();
    expect(selo("ALUGUEL", "Atrasado")).toBeNull();
    expect(selo("ALUGUEL", "Não pago")).toBeTruthy();
    unmount();
    noBanco({ config_ciclo: ciclo });
    renderizar();
    expect(selo("ALUGUEL", "Atrasado")).toBeTruthy();
  });

  it("'Pago parcialmente' mantém o selo e ganha o Atrasado ao lado (o que falta é o que venceu)", () => {
    novembroComPendencias();
    noBanco({
      pagamento_itens: [
        { id: "i1", pagamento_id: "pg", lancamento_id: "a1", mes: "2026-11", valor_centavos: 4000, status_aplicado_id: null, excluido_em: null },
      ],
    });
    em("2026-11-17T15:00:00Z");
    renderizar();
    expect(selo("MERCADO", "Pago parcialmente")).toBeTruthy();
    expect(selo("MERCADO", "Atrasado")).toBeTruthy();
    expect(sem(linhaDe("MERCADO").getAttribute("aria-label"))).toContain("Pago parcialmente, falta R$ 60,00, atrasado desde 17/11/26");
  });

  it("os itens de Pagamento ainda carregando: ninguém aparece atrasado até eles chegarem", () => {
    novembroComPendencias();
    falso.statusTabelas = { pagamento_itens: "carregando" };
    em("2026-11-17T15:00:00Z");
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeNull();
  });

  it("filtro de Status: 'Atrasado' mostra só os atrasados e soma-se aos Status cadastrados", async () => {
    novembroComPendencias();
    em("2026-11-17T15:00:00Z");
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Status", expanded: false }));
    const dialogo = screen.getByRole("dialog", { name: "Status (pode marcar vários)" });
    expect(within(dialogo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Não pago, 2 lançamentos",
      "Pago, 1 lançamento",
      "Atrasado, 2 lançamentos",
      "Sem status, 1 lançamento",
    ]);
    await u.click(within(dialogo).getByRole("checkbox", { name: "Atrasado, 2 lançamentos" }));
    await u.click(within(dialogo).getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(linhasDaGrade().map(nomeVisivel)).toEqual(["MERCADO", "PADARIA"]);
    expect(screen.getByRole("button", { name: "Status: Atrasado", expanded: false })).toBeTruthy();
    expect(rodape()).toContain("R$ 130,00");
  });

  it("o painel do Lançamento mostra 'Atrasado' e 'desde 17/11/26'", async () => {
    novembroComPendencias();
    em("2026-11-17T15:00:00Z");
    renderizar();
    const u = userEvent.setup();
    await u.click(within(linhaDe("MERCADO")).getByText("MERCADO"));
    const painel = await screen.findByRole("complementary");
    expect(within(painel).getByText("Atrasado").getAttribute("data-selo")).toBe("atrasado");
    expect(sem(painel.textContent)).toContain("desde 17/11/26");
  });

  it("pagar tira o atraso: o Status que conta como pago desfaz o selo na hora (Realtime)", () => {
    novembroComPendencias();
    em("2026-11-17T15:00:00Z");
    renderizar();
    expect(selo("MERCADO", "Atrasado")).toBeTruthy();
    gravarNoBanco("a1", { status_id: "s-pago" });
    expect(selo("MERCADO", "Atrasado")).toBeNull();
    expect(selo("MERCADO", "Pago")).toBeTruthy();
  });
});

describe("Recebimentos no hero (História 6.5, FR-26)", () => {
  const deCobranca = (id: string, nome: string, formula: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    owner_id: "dono",
    nome,
    formula,
    ordem: 1,
    de_cobranca: true,
    meu_bloco: false,
    updated_at: "2026-11-03T12:00:00+00:00",
    ...extra,
  });
  const casal = deCobranca("b-casal", "Casal", { tipo: "responsavel", id: "r-casal" });
  const rafael = deCobranca("b-rafael", "Rafael", { tipo: "responsavel", id: "r-rafael" }, { ordem: 2 });
  const pagamento = (id: string, data: string, recebido: number) => ({
    id,
    data,
    valor_recebido_centavos: recebido,
    modo: "total",
    excluido_em: null,
    updated_at: "2026-11-03T12:00:00+00:00",
  });
  const item = (lancamento: string, valor: number) => ({
    id: `i-${lancamento}`,
    pagamento_id: "p-x",
    lancamento_id: lancamento,
    mes: "2026-11",
    valor_centavos: valor,
    status_anterior_id: "s-nao",
    status_aplicado_id: null,
    excluido_em: null,
    updated_at: "2026-11-03T12:00:00+00:00",
  });

  function novembroDeCobranca(extras: LinhaLancamento[] = [], blocos: unknown[] = [casal, rafael]) {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [
        lanc("2026-11", { id: "c1", nome: "MERCADO", valor_centavos: 10000, responsavel_id: "r-casal" }),
        lanc("2026-11", { id: "c2", nome: "FARMACIA", valor_centavos: 5000, responsavel_id: "r-casal", status_id: "s-pago" }),
        lanc("2026-11", { id: "r1", nome: "LIVRARIA", valor_centavos: 7000, responsavel_id: "r-rafael" }),
        lanc("2026-11", { id: "s1", nome: "SEM DONO", valor_centavos: 900, responsavel_id: null }),
        lanc("2026-10", { id: "o1", nome: "DE OUTUBRO", valor_centavos: 3000, responsavel_id: "r-casal" }),
        ...extras,
      ],
      blocos,
    });
    falso.banco = { ...falso.banco, pagamentos: [], pagamento_itens: [] };
    falso.versao++;
  }

  const hero = () => screen.getByRole("region", { name: /^FATURA DE NOVEMBRO/i });
  const faltaReceber = (valor: string) =>
    screen.getByRole("button", { name: (nome) => sem(nome) === `Falta receber ${valor}, abrir Recebimentos` });

  it("'Falta receber' soma os Blocos de cobrança sobre o que está em aberto NO Mês (o pago e os outros Meses ficam de fora)", () => {
    novembroDeCobranca();
    renderizar();
    // Casal R$ 100,00 + Rafael R$ 70,00; o pago, o 'sem dono' e o Lançamento de outubro não entram.
    expect(sem(faltaReceber("R$ 170,00").textContent)).toBe("Falta receberR$ 170,00");
  });

  it("tocar em 'Falta receber' abre Recebimentos", async () => {
    novembroDeCobranca();
    renderizar();
    await userEvent.setup().click(faltaReceber("R$ 170,00"));
    expect(roteador.push).toHaveBeenCalledWith("/recebimentos");
  });

  it("'Recebido no mês' soma o valor RECEBIDO dos Pagamentos com data no Mês", () => {
    novembroDeCobranca();
    mudarBanco("pagamentos", () => [
      pagamento("p1", "2026-11-03", 5000),
      pagamento("p2", "2026-11-20", 1000),
      pagamento("p3", "2026-10-30", 3000),
    ]);
    renderizar();
    expect(sem(within(hero()).getByText("Recebido no mês").parentElement?.textContent)).toBe("Recebido no mêsR$ 60,00");
  });

  it("sem Pagamentos o 'Recebido no mês' é R$ 0,00", () => {
    novembroDeCobranca();
    renderizar();
    expect(sem(within(hero()).getByText("Recebido no mês").parentElement?.textContent)).toBe("Recebido no mêsR$ 0,00");
  });

  it("um Pago parcialmente entra só com o que falta; um previsto não entra", () => {
    novembroDeCobranca([lanc("2026-11", { id: "p1", nome: "PREVISTO", valor_centavos: 9000, responsavel_id: "r-casal", lancado_por: "sistema" })]);
    mudarBanco("pagamento_itens", () => [item("c1", 4000)]);
    renderizar();
    expect(sem(faltaReceber("R$ 130,00").textContent)).toBe("Falta receberR$ 130,00");
  });

  it("sem Blocos de cobrança, 'Falta receber' mostra '—' (e Recebimentos explica o que fazer)", () => {
    novembroDeCobranca([], [deCobranca("b-meu", "Meu", { tipo: "responsavel", id: "r-rafael" }, { de_cobranca: false, meu_bloco: true })]);
    renderizar();
    expect(sem(faltaReceber("—").textContent)).toBe("Falta receber—");
  });

  it("os itens de Pagamento ainda lendo: '—', nunca o valor cheio de um parcial", () => {
    novembroDeCobranca();
    falso.statusTabelas = { pagamento_itens: "carregando" };
    renderizar();
    expect(faltaReceber("—")).toBeTruthy();
  });

  it("trocar de Mês muda os dois cartões: outubro tem o Casal em aberto e nenhum recebimento de novembro", async () => {
    novembroDeCobranca();
    mudarBanco("pagamentos", () => [pagamento("p1", "2026-11-03", 5000), pagamento("p3", "2026-10-30", 3000)]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(faltaReceber("R$ 30,00")).toBeTruthy());
    expect(sem(screen.getByText("Recebido no mês").parentElement?.textContent)).toBe("Recebido no mêsR$ 30,00");
  });

  it("pagar muda o 'Falta receber' na hora (o Status vira pago por Realtime)", () => {
    novembroDeCobranca();
    renderizar();
    expect(faltaReceber("R$ 170,00")).toBeTruthy();
    gravarNoBanco("c1", { status_id: "s-pago" });
    expect(faltaReceber("R$ 70,00")).toBeTruthy();
  });
});

describe("Aberto por 'A receber' (História 6.6): Mês e Lançamento de outro Mês", () => {
  it("abre o Mês pedido (não o atual) com o painel do Lançamento já aberto", () => {
    definir({
      faturas: [outubro, novembro],
      lancamentos: [lanc("2026-10", { id: "ox", nome: "ÓCULOS", valor_centavos: 27000 }), lanc("2026-11", { id: "nx", nome: "OUTRA" })],
    });
    render(<Painel titulo="Painel" mesInicial="2026-10" lancamentoInicial="ox" />, { wrapper: ToastProvider });
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-10");
    expect(falso.abrirMes).not.toHaveBeenCalledWith("2026-11");
    expect(screen.getByRole("button", { name: "outubro/26, escolher o Mês" })).toBeTruthy();
    const painel = screen.getByRole("complementary");
    expect(within(painel).getByRole("heading", { name: "ÓCULOS" })).toBeTruthy();
  });

  it("só o Mês: abre o Mês sem painel; sem nada, o Mês atual", () => {
    definir({ faturas: [outubro, novembro], lancamentos: [lanc("2026-10", { id: "ox", nome: "ÓCULOS" })] });
    const { unmount } = render(<Painel titulo="Painel" mesInicial="2026-10" />, { wrapper: ToastProvider });
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-10");
    expect(screen.queryByRole("complementary")).toBeNull();
    unmount();
    falso.abrirMes.mockClear();
    falso.mes = null;
    render(<Painel titulo="Painel" />, { wrapper: ToastProvider });
    expect(falso.abrirMes).toHaveBeenCalledWith("2026-11");
  });
});
