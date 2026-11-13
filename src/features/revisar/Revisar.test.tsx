// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contarFila } from "@/domain/revisar";
import {
  ROTULOS,
  TEXTOS_REVISAR as T,
  mensagem,
  rotuloConfirmarItem,
  rotuloFaltam,
  rotuloManterClassificacao,
  rotuloExcluirSumiu,
  rotuloManterPrevisto,
  rotuloManterSumiu,
  rotuloMudarItem,
  rotuloRemoverPrevisto,
  rotuloSelecionar,
  rotuloSelecionarGrupo,
} from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Revisar } from "./Revisar";

// O gerenciador de Realtime e o repositório são falsos, mas se comportam
// como os de verdade: a gravação que limpa o motivo tira a linha da fila, o
// "Desfazer" a devolve, e as telas são avisadas.
type Linha = Record<string, unknown> & { id: string };

const falso = vi.hoisted(() => ({
  fila: [] as Linha[],
  tabelas: {} as Record<string, Linha[]>,
  status: {} as Record<string, string>,
  mesLancamentos: null as string | null,
  ouvintes: new Set<() => void>(),
  versao: 0,
  abrirMes: vi.fn(),
  recarregar: vi.fn(),
  atualizar: vi.fn(),
  devolverAFila: vi.fn(),
  classificarEmLote: vi.fn(),
  desfazerLote: vi.fn(),
  contarUsos: vi.fn(),
  propagarAosPrevistos: vi.fn(),
  aplicarAosPrevistos: vi.fn(),
  excluir: vi.fn(),
  restaurar: vi.fn(),
  manterPrevisto: vi.fn(),
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (chave: string) => {
    const g = cache.get(chave);
    if (g && g.versao === falso.versao) return g.retrato;
    const linhas = chave === "fila" ? falso.fila : (falso.tabelas[chave] ?? []);
    const novo =
      chave === "lancamentos"
        ? { status: falso.status[chave] ?? "pronto", linhas, mes: falso.mesLancamentos }
        : { status: falso.status[chave] ?? "pronto", linhas };
    cache.set(chave, { versao: falso.versao, retrato: novo });
    return novo;
  };
  return {
    useFilaRevisar: () => useSyncExternalStore(assinar, () => retrato("fila")),
    useLinhas: (t: string) => useSyncExternalStore(assinar, () => retrato(t)),
    gerenciador: (t: string) => ({
      recarregar: () => falso.recarregar(t),
      abrirMes: (mes: string) => {
        falso.abrirMes(mes);
        falso.mesLancamentos = mes;
        avisar();
      },
    }),
    gerenciadorFila: () => ({ recarregar: () => falso.recarregar("fila") }),
  };
});
function avisar() {
  falso.versao++;
  for (const o of falso.ouvintes) o();
}
vi.mock("@/data/lancamentos-repo", () => ({
  repoLancamentosRevisar: () => ({
    atualizar: falso.atualizar,
    devolverAFila: falso.devolverAFila,
    classificarEmLote: falso.classificarEmLote,
    desfazerLote: falso.desfazerLote,
    propagarAosPrevistos: falso.propagarAosPrevistos,
    aplicarAosPrevistos: falso.aplicarAosPrevistos,
    excluir: falso.excluir,
    restaurar: falso.restaurar,
    manterPrevisto: falso.manterPrevisto,
  }),
}));
vi.mock("@/data/cadastros-repo", () => ({ repoCadastros: () => ({ contarUsos: falso.contarUsos }) }));

const T1 = "2026-11-08T00:00:00.000001+00:00";

const linha = (id: string, extra: Record<string, unknown> = {}): Linha => ({
  id,
  nome: `LOJA ${id.toUpperCase()}`,
  apelido: null,
  mes: "2026-11",
  valor_centavos: 1000,
  parcela_n: null,
  parcela_total: null,
  responsavel_id: null,
  tipo_id: null,
  ajuste_de_id: null,
  excluido_em: null,
  revisao_motivo: "sem_classificacao",
  revisao_dados: null,
  revisado_em: null,
  final_cartao: "1111",
  ordem_fatura: Number(id.replace(/\D/g, "")) || 1,
  fatura_id: "f11",
  updated_at: T1,
  ...extra,
});

const SUGESTAO = { responsavel_id: "casal", tipo_id: "casa", outros_responsaveis: [] };
const sugerida = (id: string, extra: Record<string, unknown> = {}) =>
  linha(id, { revisao_motivo: "sugestao", revisao_dados: SUGESTAO, ...extra });

const novembro = {
  id: "f11",
  mes: "2026-11",
  total_despesas_centavos: 5000,
  total_creditos_centavos: 0,
};

function preparar(fila: Linha[], extras: { lancamentos?: Linha[]; faturas?: Linha[] } = {}) {
  // Versão nova: os retratos guardados do teste anterior não valem.
  falso.versao++;
  falso.fila = fila;
  falso.tabelas = {
    responsaveis: [
      { id: "casal", nome: "Casal", cor: 1, ordem: 1, arquivado: false },
      { id: "rafael", nome: "Rafael", cor: 2, ordem: 2, arquivado: false },
    ] as unknown as Linha[],
    tipos: [
      { id: "casa", nome: "Casa", arquivado: false },
      { id: "saude", nome: "Saúde", arquivado: false },
    ] as unknown as Linha[],
    faturas: extras.faturas ?? [],
    fatura_cartoes: (extras.faturas?.length ? [{ id: "c1", fatura_id: "f11", final: "1111", total_centavos: 5000 }] : []) as unknown as Linha[],
    lancamentos: extras.lancamentos ?? [],
  };
}

function renderizar() {
  return render(
    <ToastProvider>
      <Revisar titulo="Revisar" />
    </ToastProvider>,
  );
}

const itens = () => screen.queryAllByRole("listitem", { hidden: true });

beforeEach(() => {
  vi.clearAllMocks();
  falso.status = {};
  falso.versao++;
  falso.mesLancamentos = null;
  falso.contarUsos.mockResolvedValue({ ok: false, codigo: "carregar.falhou" });
  // O banco: limpa o motivo ao classificar (a linha sai da fila) e a devolve no Desfazer.
  falso.atualizar.mockImplementation(async (id: string, mudanca: Record<string, unknown>, o?: { junto?: string[] }) => {
    const l = falso.fila.find((x) => x.id === id)!;
    const gravada = { ...l, ...mudanca, revisao_motivo: null, revisao_dados: null, revisado_em: "agora", updated_at: "depois" };
    falso.fila = falso.fila.filter((x) => x.id !== id);
    avisar();
    void o;
    return { ok: true, linha: gravada };
  });
  falso.devolverAFila.mockImplementation(async (id: string, anterior: Record<string, unknown>) => {
    falso.fila = [...falso.fila, linha(id, anterior)];
    avisar();
    return { ok: true, linha: linha(id, anterior) };
  });
  // O banco do lote: aplica os campos; a linha que fica com os dois sai da fila.
  falso.classificarEmLote.mockImplementation(async (entradas: { id: string; campos: Record<string, unknown> }[]) => {
    const antes = entradas.map((e) => ({ id: e.id, corpo: { responsavel_id: null } }));
    falso.fila = falso.fila.flatMap((l) => {
      const e = entradas.find((x) => x.id === l.id);
      if (!e) return [l];
      const nova = { ...l, ...e.campos };
      return nova.responsavel_id && nova.tipo_id ? [] : [nova];
    });
    avisar();
    return { ok: true, linhas: [], gravadas: entradas.length, antes };
  });
  falso.desfazerLote.mockResolvedValue({ ok: true, linhas: [], gravadas: 0, antes: [] });
  falso.propagarAosPrevistos.mockResolvedValue({ ok: true, preenchidos: 0, aPerguntar: [] });
  falso.aplicarAosPrevistos.mockImplementation(async (itens: unknown[]) => ({ ok: true, gravados: itens.length }));
  // "Remover previsto" e "Manter" tiram o previsto da fila; o "Desfazer" o devolve.
  falso.excluir.mockImplementation(async (id: string) => {
    falso.fila = falso.fila.filter((x) => x.id !== id);
    avisar();
    return { ok: true, linha: linha(id) };
  });
  falso.restaurar.mockResolvedValue({ ok: true, linha: linha("x") });
  falso.manterPrevisto.mockImplementation(async (id: string) => {
    falso.fila = falso.fila.filter((x) => x.id !== id);
    avisar();
    return { ok: true, linha: linha(id) };
  });
});

describe("Revisar: a fila", () => {
  it("'Faltam N' é o número de itens e o mesmo do contador do menu (mesma regra)", () => {
    const l = [linha("a1"), sugerida("a2"), linha("a3", { revisao_motivo: null }), linha("a4", { excluido_em: "x" })];
    preparar(l);
    renderizar();
    expect(itens()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe(rotuloFaltam(2));
    expect(contarFila(falso.fila as never)).toBe(2);
  });

  it("agrupa por Nome: 2+ itens ganham o título 'NOME · N lançamentos'", () => {
    preparar([linha("a1", { nome: "SHOPEE" }), linha("a2", { nome: "Shopee" }), linha("a3", { nome: "COBASI" })]);
    renderizar();
    expect(screen.getByRole("heading", { name: "SHOPEE · 2 lançamentos" })).toBeTruthy();
    expect(screen.getAllByRole("heading")).toHaveLength(2); // o título da tela e o do grupo
    expect(itens()).toHaveLength(3);
  });

  it("cada item leva o Mês quando há mais de um; com um só, não", () => {
    preparar([linha("a1", { mes: "2026-10" }), linha("a2", { mes: "2026-11" })]);
    const { unmount } = renderizar();
    expect(screen.getByText("Out/26 · R$ 10,00", { normalizer: (t) => t.replaceAll(" ", " ") })).toBeTruthy();
    expect(screen.getByText("Nov/26 · R$ 10,00", { normalizer: (t) => t.replaceAll(" ", " ") })).toBeTruthy();
    unmount();
    preparar([linha("a1", { mes: "2026-11" })]);
    renderizar();
    expect(screen.getByText("R$ 10,00", { normalizer: (t) => t.replaceAll(" ", " ") })).toBeTruthy();
  });

  it("carregando: esqueleto; erro: 'Tentar de novo' relê a fila e os cadastros", async () => {
    preparar([linha("a1")]);
    falso.status = { fila: "carregando" };
    falso.versao++;
    const { unmount } = renderizar();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(itens()).toHaveLength(0);
    unmount();

    falso.status = { tipos: "erro" };
    falso.versao++;
    renderizar();
    expect(screen.getByRole("alert").textContent).toContain(mensagem("carregar.falhou"));
    await userEvent.setup().click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    expect(falso.recarregar.mock.calls.map((c) => c[0]).sort()).toEqual(["fila", "responsaveis", "tipos"]);
  });

  it("fila vazia: 'Tudo revisado. Nada novo neste mês' e sem contador", () => {
    preparar([]);
    renderizar();
    expect(screen.getByText(T.tudo_revisado)).toBeTruthy();
    expect(screen.queryByText(/Falt/)).toBeNull();
  });
});

describe("Revisar: faixa de resumo da importação", () => {
  it("do Mês da Fatura mais recente: Conferência, lançamentos, classificados e para revisar", async () => {
    const classificada = (id: string) => linha(id, { revisao_motivo: null, responsavel_id: "casal", tipo_id: "casa", valor_centavos: 1000 });
    const lancs = [classificada("c1"), classificada("c2"), classificada("c3"), linha("a1"), linha("a2")];
    preparar([linha("a1"), linha("a2")], {
      lancamentos: lancs,
      faturas: [{ ...novembro, id: "f10", mes: "2026-10" }, novembro] as Linha[],
    });
    falso.mesLancamentos = "2026-11";
    renderizar();
    await waitFor(() => expect(falso.abrirMes).toHaveBeenCalledWith("2026-11"));
    // 5 lançamentos de R$ 10,00 e totais da Fatura de R$ 50,00: bate.
    expect(
      screen.getByText("Importação de novembro · ✓ Conferido · 5 lançamentos · 3 classificados · 2 para revisar"),
    ).toBeTruthy();
  });

  it("diferença na Conferência aparece na faixa", async () => {
    preparar([linha("a1")], { lancamentos: [linha("a1")], faturas: [novembro] as Linha[] });
    falso.mesLancamentos = "2026-11";
    renderizar();
    expect(await screen.findByText(/Importação de novembro · ⚠ Diferença de .* · 1 lançamento · 0 classificados · 1 para revisar/)).toBeTruthy();
  });

  it("sem Fatura ou com o Mês ainda carregando: sem faixa", () => {
    preparar([linha("a1")]);
    renderizar();
    expect(screen.queryByText(/Importação de/)).toBeNull();
    expect(falso.abrirMes).not.toHaveBeenCalled();
  });
});

describe("Revisar: Confirmar (✓)", () => {
  it("grava a sugestão pelo repositório da fila, tira o item, baixa o 'Faltam' e mostra 'Classificado · Desfazer'", async () => {
    preparar([sugerida("a1"), sugerida("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    expect(falso.atualizar).toHaveBeenCalledExactlyOnceWith("a1", { responsavel_id: "casal", tipo_id: "casa" }, {});
    await waitFor(() => expect(itens()).toHaveLength(1));
    expect(screen.getByText(rotuloFaltam(1))).toBeTruthy();
    expect(screen.getByText(T.classificado)).toBeTruthy();
    expect(screen.getByRole("button", { name: ROTULOS.desfazer })).toBeTruthy();
  });

  it("o Ajuste da mãe vai junto na mesma gravação", async () => {
    const ajuste = linha("aj", { nome: "LOJA A1", ajuste_de_id: "a1", revisao_motivo: null, valor_centavos: -8 });
    preparar([sugerida("a1"), ajuste]);
    renderizar();
    expect(itens()).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    expect(falso.atualizar).toHaveBeenCalledWith("a1", { responsavel_id: "casal", tipo_id: "casa" }, { junto: ["aj"] });
  });

  it("falha ao gravar: o item fica e o toast traz a mensagem do código", async () => {
    preparar([sugerida("a1")]);
    falso.atualizar.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(itens()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: ROTULOS.desfazer })).toBeNull();
  });

  it("Desfazer devolve a classificação, o motivo, os dados e o revisado_em anteriores (mãe e Ajustes)", async () => {
    const ajuste = linha("aj", { nome: "LOJA A1", ajuste_de_id: "a1", revisao_motivo: null, valor_centavos: -8 });
    preparar([sugerida("a1", { revisado_em: null }), ajuste]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    await waitFor(() => expect(itens()).toHaveLength(0));
    expect(screen.getByText(T.tudo_revisado)).toBeTruthy();

    await u.click(screen.getByRole("button", { name: ROTULOS.desfazer }));
    expect(falso.devolverAFila).toHaveBeenCalledExactlyOnceWith(
      "a1",
      { responsavel_id: null, tipo_id: null, revisao_motivo: "sugestao", revisao_dados: SUGESTAO, revisado_em: null },
      { junto: ["aj"] },
    );
    await waitFor(() => expect(itens()).toHaveLength(1));
    expect(screen.getByText(rotuloFaltam(1))).toBeTruthy();
  });

  it("Desfazer que falha mostra a mensagem do código", async () => {
    preparar([sugerida("a1")]);
    falso.devolverAFila.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    await u.click(await screen.findByRole("button", { name: ROTULOS.desfazer }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
  });

  it("a Regra aplicou o Responsável: o ✓ manda os dois (o repositório grava só o que falta)", async () => {
    preparar([
      linha("a1", {
        responsavel_id: "rafael",
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: "casa", outros_responsaveis: [] },
      }),
    ]);
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    expect(falso.atualizar).toHaveBeenCalledWith("a1", { responsavel_id: "rafael", tipo_id: "casa" }, {});
  });

  it("dois toques rápidos no ✓ gravam uma vez só", async () => {
    preparar([sugerida("a1")]);
    let terminar: (v: unknown) => void = () => {};
    falso.atualizar.mockImplementation(() => new Promise((r) => (terminar = r)));
    renderizar();
    const botao = screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") });
    act(() => {
      botao.click();
      botao.click();
    });
    expect(falso.atualizar).toHaveBeenCalledTimes(1);
    expect(botao.hasAttribute("disabled")).toBe(true);
    await act(async () => terminar({ ok: false, codigo: "salvar.falhou" }));
  });
});

describe("Revisar: Mudar", () => {
  it("abre a janela pré-preenchida; Salvar grava os dois pelo repositório e mostra 'Classificado · Desfazer'", async () => {
    preparar([linha("a1", { responsavel_id: "rafael" }), sugerida("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A1") }));
    const janela = screen.getByRole("dialog", { name: T.titulo_mudar });
    expect((within(janela).getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("rafael");
    expect(within(janela).getByRole("button", { name: ROTULOS.salvar }).hasAttribute("disabled")).toBe(true);

    await u.selectOptions(within(janela).getByLabelText(T.tipo), "saude");
    await u.click(within(janela).getByRole("button", { name: ROTULOS.salvar }));
    expect(falso.atualizar).toHaveBeenCalledExactlyOnceWith("a1", { responsavel_id: "rafael", tipo_id: "saude" }, {});
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(itens()).toHaveLength(1);
    expect(screen.getByText(T.classificado)).toBeTruthy();
  });

  it("Mudar numa sugestão abre com ela; só Tipo sugerido abre com o Tipo", async () => {
    preparar([
      linha("a1", {
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: "saude", outros_responsaveis: [] },
      }),
    ]);
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A1") }));
    expect((screen.getByLabelText(T.tipo) as HTMLSelectElement).value).toBe("saude");
    expect((screen.getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("");
  });

  it("Cancelar não grava; o item que sai da fila (outro aparelho) fecha a janela", async () => {
    preparar([linha("a1"), linha("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A1") }));
    await u.click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(falso.atualizar).not.toHaveBeenCalled();

    await u.click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A2") }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => {
      falso.fila = falso.fila.filter((l) => l.id !== "a2");
      avisar();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falha ao salvar: a gravação otimista tira o item e volta atrás, mas a janela continua aberta com a escolha e o toast diz o motivo", async () => {
    preparar([linha("a1", { responsavel_id: "rafael" })]);
    falso.atualizar.mockImplementation(async (id: string) => {
      const original = falso.fila.find((x) => x.id === id)!;
      // O otimismo tira o item da fila; o banco recusa e o item volta.
      falso.fila = falso.fila.filter((x) => x.id !== id);
      avisar();
      await new Promise((r) => setTimeout(r, 0));
      falso.fila = [...falso.fila, original];
      avisar();
      return { ok: false, codigo: "salvar.falhou" };
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A1") }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: ROTULOS.salvar }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText(T.tipo) as HTMLSelectElement).value).toBe("saude");
    expect((screen.getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("rafael");
    expect(itens()).toHaveLength(1);
  });

  it("salvar que dá certo com o item saindo da fila fecha a janela", async () => {
    preparar([linha("a1", { responsavel_id: "rafael" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloMudarItem("LOJA A1") }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: ROTULOS.salvar }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(T.classificado)).toBeTruthy();
  });
});

describe("Revisar: tempo real", () => {
  it("um item que volta à fila (limpar o Tipo no Painel) reaparece e o 'Faltam' sobe, sem recarregar", async () => {
    preparar([linha("a1")]);
    renderizar();
    expect(screen.getByText(rotuloFaltam(1))).toBeTruthy();
    act(() => {
      falso.fila = [...falso.fila, linha("a9", { tipo_id: null, responsavel_id: "casal" })];
      avisar();
    });
    expect(screen.getByText(rotuloFaltam(2))).toBeTruthy();
    expect(itens()).toHaveLength(2);
    expect(falso.recarregar).not.toHaveBeenCalled();
  });

  it("o último item classificado em outro aparelho esvazia a fila", () => {
    preparar([linha("a1")]);
    renderizar();
    act(() => {
      falso.fila = [];
      avisar();
    });
    expect(screen.getByText(T.tudo_revisado)).toBeTruthy();
    expect(screen.queryByText(/Falt/)).toBeNull();
  });
});

// Lote (História 3.3): caixas, "Selecionar todos", barra, janelas, Desfazer.
describe("Revisar: lote", () => {
  const MIL = (t: string) => t.replaceAll("\u00a0", " ");
  const caixa = (nome: string) => screen.getByRole("checkbox", { name: rotuloSelecionar(nome) }) as HTMLInputElement;
  const barra = () => screen.queryByRole("region", { name: T.barra_lote });
  const contagem = () => MIL(within(barra()!).getByRole("status").textContent ?? "");

  it("sem marcação não há barra; marcar um item mostra 'N selecionados · R$ total' e o fundo selection", async () => {
    preparar([linha("a1", { valor_centavos: 6970 }), linha("a2", { valor_centavos: 3000 })]);
    renderizar();
    expect(barra()).toBeNull();
    const u = userEvent.setup();
    await u.click(caixa("LOJA A1"));
    expect(contagem()).toBe("1 selecionado · R$ 69,70");
    expect(screen.getAllByRole("listitem")[0].className).toContain("bg-selection");
    expect(screen.getAllByRole("listitem")[1].className).not.toContain("bg-selection");
    await u.click(caixa("LOJA A2"));
    expect(contagem()).toBe("2 selecionados · R$ 99,70");
  });

  it("o total é líquido: a mãe mais os Ajustes", async () => {
    const ajuste = linha("aj", { nome: "LOJA A1", ajuste_de_id: "a1", revisao_motivo: null, valor_centavos: -8 });
    preparar([linha("a1", { valor_centavos: 114074 }), ajuste]);
    renderizar();
    await userEvent.setup().click(caixa("LOJA A1"));
    expect(contagem()).toBe("1 selecionado · R$ 1.140,66");
  });

  it("'Selecionar todos' marca e desmarca todos os Meses da fila; a caixa fica parcial no meio", async () => {
    preparar([linha("a1", { mes: "2026-10" }), linha("a2", { mes: "2026-11" }), linha("a3", { mes: "2026-11" })]);
    renderizar();
    const u = userEvent.setup();
    const todos = screen.getByRole("checkbox", { name: T.selecionar_todos }) as HTMLInputElement;
    expect(todos.checked).toBe(false);
    await u.click(caixa("LOJA A1"));
    expect(todos.indeterminate).toBe(true);
    await u.click(todos);
    expect(todos.checked).toBe(true);
    expect(contagem()).toMatch(/^3 selecionados/);
    await u.click(todos);
    expect(barra()).toBeNull();
  });

  it("a caixa do grupo (NOME · N lançamentos) tem três estados e marca ou desmarca o grupo", async () => {
    preparar([linha("a1", { nome: "SHOPEE" }), linha("a2", { nome: "SHOPEE" }), linha("a3", { nome: "COBASI" })]);
    renderizar();
    const u = userEvent.setup();
    const grupo = screen.getByRole("checkbox", { name: rotuloSelecionarGrupo("SHOPEE") }) as HTMLInputElement;
    expect(screen.queryByRole("checkbox", { name: rotuloSelecionarGrupo("COBASI") })).toBeNull(); // grupo de 1: sem título
    await u.click(screen.getAllByRole("checkbox", { name: rotuloSelecionar("SHOPEE") })[0]);
    expect(grupo.indeterminate).toBe(true);
    await u.click(grupo);
    expect(grupo.checked).toBe(true);
    expect(contagem()).toMatch(/^2 selecionados/);
    expect(caixa("COBASI").checked).toBe(false);
    await u.click(grupo);
    expect(barra()).toBeNull();
  });

  it("Limpar tira a marcação e a barra", async () => {
    preparar([linha("a1"), linha("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(screen.getByRole("button", { name: T.limpar }));
    expect(barra()).toBeNull();
    expect(caixa("LOJA A1").checked).toBe(false);
  });

  it("'Responsável…': escolhe na janela e grava os marcados numa chamada só; 'N classificados · Desfazer'", async () => {
    preparar([
      linha("a1", { nome: "SHOPEE", tipo_id: "casa" }),
      linha("a2", { nome: "SHOPEE", tipo_id: "casa" }),
      linha("a3", { nome: "SHOPEE", tipo_id: "casa" }),
      linha("a4", { nome: "COBASI" }),
    ]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: rotuloSelecionarGrupo("SHOPEE") }));
    await u.click(screen.getByRole("button", { name: T.responsavel_lote }));
    const janela = screen.getByRole("dialog", { name: T.titulo_lote_responsavel });
    expect(within(janela).getByText("3 selecionados")).toBeTruthy();
    await u.selectOptions(within(janela).getByLabelText(T.responsavel), "casal");
    await u.click(within(janela).getByRole("button", { name: "Aplicar a 3" }));
    expect(falso.classificarEmLote).toHaveBeenCalledExactlyOnceWith([
      { id: "a1", campos: { responsavel_id: "casal" } },
      { id: "a2", campos: { responsavel_id: "casal" } },
      { id: "a3", campos: { responsavel_id: "casal" } },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // As 3 saíram da fila e da marcação; "Faltam" e a barra acompanham.
    expect(itens()).toHaveLength(1);
    expect(screen.getByText(rotuloFaltam(1))).toBeTruthy();
    await waitFor(() => expect(barra()).toBeNull());
    expect(screen.getByText("3 classificados")).toBeTruthy();
    expect(screen.getByRole("button", { name: ROTULOS.desfazer })).toBeTruthy();
  });

  it("'Tipo…' grava só o Tipo; o item sem Responsável continua na fila e marcado", async () => {
    preparar([linha("a1"), linha("a2", { responsavel_id: "casal" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(screen.getByRole("button", { name: T.tipo_lote }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: "Aplicar a 2" }));
    expect(falso.classificarEmLote).toHaveBeenCalledWith([
      { id: "a1", campos: { tipo_id: "saude" } },
      { id: "a2", campos: { tipo_id: "saude" } },
    ]);
    await waitFor(() => expect(itens()).toHaveLength(1));
    expect(caixa("LOJA A1").checked).toBe(true);
    expect(contagem()).toMatch(/^1 selecionado/);
  });

  it("'Aplicar sugestões' grava os de sugestão completa (também com dúvida); os outros ficam marcados e o aviso conta", async () => {
    const duvida = linha("a2", {
      revisao_motivo: "sugestao_duvida",
      revisao_dados: { ...SUGESTAO, outros_responsaveis: ["rafael"] },
    });
    preparar([sugerida("a1"), duvida, linha("a3"), linha("a4"), sugerida("a5"), linha("a6")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(caixa("LOJA A6")); // desmarca um
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    expect(falso.classificarEmLote).toHaveBeenCalledExactlyOnceWith([
      { id: "a1", campos: { responsavel_id: "casal", tipo_id: "casa" } },
      { id: "a2", campos: { responsavel_id: "casal", tipo_id: "casa" } },
      { id: "a5", campos: { responsavel_id: "casal", tipo_id: "casa" } },
    ]);
    expect(await screen.findByText("3 classificados · 2 sem sugestão completa")).toBeTruthy();
    await waitFor(() => expect(itens()).toHaveLength(3));
    expect(contagem()).toMatch(/^2 selecionados/);
    expect(caixa("LOJA A3").checked).toBe(true);
    expect(caixa("LOJA A4").checked).toBe(true);
  });

  it("'Aplicar sugestões' sem nenhuma sugestão completa: nada é gravado e o aviso diz isso", async () => {
    preparar([linha("a1"), linha("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    expect(falso.classificarEmLote).not.toHaveBeenCalled();
    expect(screen.getByText(T.nenhuma_sugestao_completa)).toBeTruthy();
    expect(contagem()).toMatch(/^2 selecionados/);
  });

  it("falha: nada muda, a marcação fica (mesmo com o otimismo tirando os itens) e o toast diz o motivo", async () => {
    preparar([sugerida("a1"), sugerida("a2")]);
    falso.classificarEmLote.mockImplementation(async () => {
      const original = falso.fila;
      falso.fila = []; // otimismo
      avisar();
      await new Promise((r) => setTimeout(r, 0));
      falso.fila = original; // desfeito
      avisar();
      return { ok: false, codigo: "conexao.gravar_sem_conexao" };
    });
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(itens()).toHaveLength(2);
    expect(contagem()).toMatch(/^2 selecionados/);
    expect(caixa("LOJA A1").checked).toBe(true);
    expect(screen.queryByRole("button", { name: ROTULOS.desfazer })).toBeNull();
    // As ações voltam a funcionar.
    expect(screen.getByRole("button", { name: T.aplicar_sugestoes }).hasAttribute("disabled")).toBe(false);
  });

  it("durante a gravação a barra fica desligada e um segundo toque não grava de novo", async () => {
    preparar([sugerida("a1")]);
    let terminar: (v: unknown) => void = () => {};
    falso.classificarEmLote.mockImplementation(() => new Promise((r) => (terminar = r)));
    renderizar();
    const u = userEvent.setup();
    await u.click(caixa("LOJA A1"));
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    expect(screen.getByRole("button", { name: T.aplicar_sugestoes }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }).hasAttribute("disabled")).toBe(true);
    expect(falso.classificarEmLote).toHaveBeenCalledTimes(1);
    await act(async () => terminar({ ok: true, linhas: [], gravadas: 0, antes: [] }));
    expect(screen.queryByText(/classificado/)).toBeNull(); // nada mudou: nada a avisar
  });

  it("item que sai da fila em outro aparelho sai da marcação sem aviso e sem gravar; a barra recalcula", async () => {
    preparar([linha("a1", { valor_centavos: 1000 }), linha("a2", { valor_centavos: 2500 })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    expect(contagem()).toBe("2 selecionados · R$ 35,00");
    act(() => {
      falso.fila = falso.fila.filter((l) => l.id !== "a1");
      avisar();
    });
    expect(contagem()).toBe("1 selecionado · R$ 25,00");
    expect(falso.classificarEmLote).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: ROTULOS.desfazer })).toBeNull();
    // O último a sair leva a barra.
    act(() => {
      falso.fila = [];
      avisar();
    });
    expect(barra()).toBeNull();
    // E se voltar à fila, não volta marcado.
    act(() => {
      falso.fila = [linha("a1")];
      avisar();
    });
    expect(caixa("LOJA A1").checked).toBe(false);
  });

  it("Desfazer chama desfazerLote com o retrato de antes; falhou, mostra o motivo", async () => {
    preparar([sugerida("a1"), sugerida("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    await u.click(await screen.findByRole("button", { name: ROTULOS.desfazer }));
    expect(falso.desfazerLote).toHaveBeenCalledExactlyOnceWith([
      { id: "a1", corpo: { responsavel_id: null } },
      { id: "a2", corpo: { responsavel_id: null } },
    ]);

    falso.desfazerLote.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    act(() => {
      preparar([sugerida("b1")]);
      avisar();
    });
    await u.click(caixa("LOJA B1"));
    await u.click(screen.getByRole("button", { name: T.aplicar_sugestoes }));
    await u.click(await screen.findByRole("button", { name: ROTULOS.desfazer }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
  });

  it("o toast sobe acima da barra: a barra publica a altura enquanto existe", async () => {
    preparar([linha("a1")]);
    renderizar();
    await userEvent.setup().click(caixa("LOJA A1"));
    expect(document.documentElement.style.getPropertyValue("--altura-barra-inferior")).toMatch(/px$/);
    await userEvent.setup().click(screen.getByRole("button", { name: T.limpar }));
    expect(document.documentElement.style.getPropertyValue("--altura-barra-inferior")).toBe("");
  });
});

describe("Revisar: previstos da Série (História 3.5)", () => {
  it("✓ numa parcela com Série preenche os previstos vazios (sem perguntar nem avisar)", async () => {
    preparar([sugerida("a1", { serie_id: "s1", parcela_n: 5, parcela_total: 10, lancado_por: "fatura" })]);
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    await waitFor(() => expect(falso.propagarAosPrevistos).toHaveBeenCalledTimes(1));
    expect(falso.propagarAosPrevistos).toHaveBeenCalledWith([
      {
        serie_id: "s1",
        parcela_n: 5,
        lancado_por: "fatura",
        antes: { responsavel_id: null, tipo_id: null },
        depois: { responsavel_id: "casal", tipo_id: "casa" },
      },
    ]);
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("linha sem Série não chama a propagação", async () => {
    preparar([sugerida("a1")]);
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    await waitFor(() => expect(itens()).toHaveLength(0));
    expect(falso.propagarAosPrevistos).not.toHaveBeenCalled();
  });

  it("previstos com outro valor: a faixa pergunta; 'Aplicar a todos' grava e avisa", async () => {
    const pend = [{ id: "p6", corpo: { responsavel_id: "casal" } }];
    falso.propagarAosPrevistos.mockResolvedValue({ ok: true, preenchidos: 0, aPerguntar: pend });
    preparar([sugerida("a1", { serie_id: "s1", parcela_n: 5, parcela_total: 10, lancado_por: "fatura" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    const faixa = await screen.findByRole("group", { name: "Aplicar também ao 1 previsto desta compra?" });
    await u.click(within(faixa).getByRole("button", { name: "Aplicar a todos" }));
    expect(falso.aplicarAosPrevistos).toHaveBeenCalledWith(pend);
    expect(await screen.findByText("1 previsto atualizado")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("'Só este' fecha a faixa sem gravar", async () => {
    falso.propagarAosPrevistos.mockResolvedValue({
      ok: true,
      preenchidos: 0,
      aPerguntar: [{ id: "p6", corpo: { tipo_id: "casa" } }],
    });
    preparar([sugerida("a1", { serie_id: "s1", parcela_n: 5, parcela_total: 10, lancado_por: "fatura" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    const faixa = await screen.findByRole("group", { name: "Aplicar também ao 1 previsto desta compra?" });
    await u.click(within(faixa).getByRole("button", { name: "Só este" }));
    expect(falso.aplicarAosPrevistos).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("falha na propagação: a classificação já valeu e o 'Desfazer' continua", async () => {
    falso.propagarAosPrevistos.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    preparar([sugerida("a1", { serie_id: "s1", parcela_n: 5, parcela_total: 10, lancado_por: "fatura" })]);
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloConfirmarItem("LOJA A1") }));
    await waitFor(() => expect(falso.propagarAosPrevistos).toHaveBeenCalledTimes(1));
    expect(screen.getByText(T.classificado)).toBeTruthy();
    expect(screen.queryByText(mensagem("salvar.falhou"))).toBeNull();
    expect(screen.getByRole("button", { name: ROTULOS.desfazer })).toBeTruthy();
  });
});

// Casamento (História 3.6): "Valor mudou" e "Não veio na fatura".
describe("Revisar: variantes do casamento", () => {
  const valorMudou = (id: string, extra: Record<string, unknown> = {}) =>
    linha(id, {
      revisao_motivo: "valor_mudou",
      revisao_dados: { antes_centavos: 44589 },
      valor_centavos: 44910,
      responsavel_id: "casal",
      tipo_id: "casa",
      ...extra,
    });
  const naoVeio = (id: string, extra: Record<string, unknown> = {}) =>
    linha(id, { revisao_motivo: "nao_veio_na_fatura", fatura_id: null, lancado_por: "sistema", responsavel_id: "casal", tipo_id: "casa", ...extra });

  it("'Valor mudou' mostra Antes → agora e ✓ 'Manter classificação' grava a mesma classificação (com Desfazer)", async () => {
    preparar([valorMudou("a1")]);
    renderizar();
    expect(screen.getByText(T.valor_mudou)).toBeTruthy();
    expect(screen.getByText(/Antes R\$\s445,89 → agora R\$\s449,10/)).toBeTruthy();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloManterClassificacao("LOJA A1") }));
    expect(falso.atualizar).toHaveBeenCalledExactlyOnceWith("a1", { responsavel_id: "casal", tipo_id: "casa" }, {});
    await waitFor(() => expect(itens()).toHaveLength(0));
    expect(screen.getByRole("button", { name: ROTULOS.desfazer })).toBeTruthy();
  });

  it("'Não veio na fatura' tem 'Remover previsto' e 'Manter', sem ✓, sem 'Mudar' e sem caixa de lote", () => {
    preparar([naoVeio("a1")]);
    renderizar();
    expect(screen.getByText(T.nao_veio)).toBeTruthy();
    expect(screen.getByRole("button", { name: rotuloRemoverPrevisto("LOJA A1") }).textContent).toBe(T.remover_previsto);
    expect(screen.getByRole("button", { name: rotuloManterPrevisto("LOJA A1") }).textContent).toBe(T.manter);
    expect(screen.queryByRole("button", { name: rotuloConfirmarItem("LOJA A1") })).toBeNull();
    expect(screen.queryByRole("button", { name: rotuloMudarItem("LOJA A1") })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: rotuloSelecionar("LOJA A1") })).toBeNull();
  });

  it("'Remover previsto' exclui o previsto, baixa o 'Faltam' e o Desfazer o restaura", async () => {
    preparar([naoVeio("a1"), sugerida("a2")]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloRemoverPrevisto("LOJA A1") }));
    expect(falso.excluir).toHaveBeenCalledExactlyOnceWith("a1");
    await waitFor(() => expect(itens()).toHaveLength(1));
    expect(screen.getByText(rotuloFaltam(1))).toBeTruthy();
    expect(screen.getByText(T.previsto_removido)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: ROTULOS.desfazer }));
    expect(falso.restaurar).toHaveBeenCalledExactlyOnceWith("a1");
  });

  it("'Manter' só tira da fila (sem Regra) e o Desfazer devolve o motivo anterior", async () => {
    preparar([naoVeio("a1", { revisado_em: null })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloManterPrevisto("LOJA A1") }));
    expect(falso.manterPrevisto).toHaveBeenCalledExactlyOnceWith("a1");
    expect(falso.atualizar).not.toHaveBeenCalled();
    await waitFor(() => expect(itens()).toHaveLength(0));
    expect(screen.getByText(T.previsto_mantido)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: ROTULOS.desfazer }));
    expect(falso.devolverAFila).toHaveBeenCalledExactlyOnceWith("a1", {
      responsavel_id: "casal",
      tipo_id: "casa",
      revisao_motivo: "nao_veio_na_fatura",
      revisao_dados: null,
      revisado_em: null,
    });
  });

  it("'Sumiu na reimportação' tem 'Excluir' e 'Manter', sem ✓, sem 'Mudar' e sem caixa de lote", () => {
    preparar([naoVeio("a1", { revisao_motivo: "sumiu_na_reimportacao", lancado_por: "manual" })]);
    renderizar();
    expect(screen.getByText(T.sumiu)).toBeTruthy();
    expect(screen.getByRole("button", { name: rotuloExcluirSumiu("LOJA A1") }).textContent).toBe(T.excluir);
    expect(screen.getByRole("button", { name: rotuloManterSumiu("LOJA A1") }).textContent).toBe(T.manter);
    expect(screen.queryByRole("button", { name: rotuloConfirmarItem("LOJA A1") })).toBeNull();
    expect(screen.queryByRole("button", { name: rotuloMudarItem("LOJA A1") })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: rotuloSelecionar("LOJA A1") })).toBeNull();
  });

  it("'Excluir' do que sumiu exclui a linha e o Desfazer a restaura; 'Manter' só tira da fila", async () => {
    preparar([naoVeio("a1", { revisao_motivo: "sumiu_na_reimportacao", lancado_por: "manual" }), naoVeio("a2", { revisao_motivo: "sumiu_na_reimportacao", lancado_por: "manual" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: rotuloExcluirSumiu("LOJA A1") }));
    expect(falso.excluir).toHaveBeenCalledExactlyOnceWith("a1");
    expect(await screen.findByText(T.linha_excluida)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: ROTULOS.desfazer }));
    expect(falso.restaurar).toHaveBeenCalledExactlyOnceWith("a1");
    await u.click(screen.getByRole("button", { name: rotuloManterSumiu("LOJA A2") }));
    expect(falso.manterPrevisto).toHaveBeenCalledExactlyOnceWith("a2");
    expect(await screen.findByText(T.linha_mantida)).toBeTruthy();
  });

  it("falha ao remover ou manter: o item fica e o toast traz a mensagem do código", async () => {
    preparar([naoVeio("a1")]);
    falso.excluir.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    renderizar();
    await userEvent.setup().click(screen.getByRole("button", { name: rotuloRemoverPrevisto("LOJA A1") }));
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(itens()).toHaveLength(1);
  });

  it("'Selecionar todos' e a caixa do grupo ignoram o 'Não veio na fatura'", async () => {
    preparar([sugerida("a1", { nome: "MAGALU" }), naoVeio("a2", { nome: "Magalu" })]);
    renderizar();
    const u = userEvent.setup();
    await u.click(screen.getByRole("checkbox", { name: T.selecionar_todos }));
    expect(screen.getByText(/^1 selecionado ·/)).toBeTruthy();
  });

  it("a faixa da importação conta só as linhas da Fatura; o previsto que não veio fica fora", async () => {
    const classificada = (id: string) => linha(id, { revisao_motivo: null, responsavel_id: "casal", tipo_id: "casa" });
    const lancs = [classificada("c1"), classificada("c2"), classificada("c3"), linha("a1"), linha("a2")];
    preparar([linha("a1"), linha("a2"), naoVeio("p1")], {
      lancamentos: lancs,
      faturas: [novembro] as Linha[],
    });
    falso.mesLancamentos = "2026-11";
    renderizar();
    await waitFor(() => expect(falso.abrirMes).toHaveBeenCalledWith("2026-11"));
    expect(
      screen.getByText("Importação de novembro · ✓ Conferido · 5 lançamentos · 3 classificados · 2 para revisar"),
    ).toBeTruthy();
    expect(screen.getByText(rotuloFaltam(3))).toBeTruthy();
  });
});
