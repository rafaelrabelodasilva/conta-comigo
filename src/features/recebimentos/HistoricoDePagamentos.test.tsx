// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_HISTORICO as T, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { HistoricoDePagamentos } from "./HistoricoDePagamentos";

// Os gerenciadores de Realtime são falsos: um "banco" por tabela que o teste muda e avisa as telas (um
// evento do Realtime). O repositório também é falso: as leituras e o desfazer respondem o que o teste manda.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  /** Status de uma tabela (as outras seguem "pronto"). */
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
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useItensDoHistorico: () => useTabela("pagamento_itens"),
    gerenciador: () => ({ recarregar: falso.recarregar }),
    gerenciadorItensDoHistorico: () => ({ recarregar: falso.recarregar }),
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

type Previa = { ok: true; itens: { lancamento_id: string; destino: string }[] } | { ok: false; codigo: string };
const repo = vi.hoisted(() => ({
  responsaveisDasLinhas: vi.fn<(ids: readonly string[]) => Promise<unknown>>(),
  linhasDoPagamento: vi.fn<(ids: readonly string[]) => Promise<unknown>>(),
  previaDoDesfazer: vi.fn<(id: string) => Promise<Previa>>(),
  desfazer: vi.fn<(id: string, esperado?: unknown) => Promise<{ ok: boolean; codigo?: string }>>(),
}));
vi.mock("@/data/pagamentos-repo", () => ({ repoPagamentos: () => repo }));

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const T0 = "2026-11-10T12:00:00.000000+00:00";
const responsaveis = [
  { id: "r-mae", nome: "Mãe", cor: 4, ordem: 1 },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2 },
  { id: "r-rangel", nome: "Rangel", cor: 3, ordem: 3 },
  { id: "r-lucas", nome: "Lucas", cor: 5, ordem: 4 },
];
const status = [
  { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
  { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
];

/** O que o repositório devolve das linhas (nome, Mês, Responsável), por id. */
let linhasDb: Record<string, Record<string, unknown>> = {};

type ItemDoTeste = { lanc: string; resp: string; valor: number; aplicado?: string | null; nome?: string; ajuste?: string };
let sequencia = 0;

/** Põe um Pagamento, os itens e as linhas dele no "banco". */
function pagamento(id: string, data: string, modo: string, recebido: number, itens: ItemDoTeste[], extra: Record<string, unknown> = {}) {
  sequencia += 1;
  const linhaDoPagamento = {
    id,
    owner_id: "dono",
    data,
    modo,
    valor_recebido_centavos: recebido,
    excluido_em: null,
    created_at: `${data}T1${sequencia % 10}:00:00.000000+00:00`,
    updated_at: T0,
    ...extra,
  };
  const linhasDoItem = itens.map((i, n) => ({
    id: `${id}-i${n}`,
    owner_id: "dono",
    pagamento_id: id,
    lancamento_id: i.lanc,
    mes: "2026-10",
    valor_centavos: i.valor,
    status_anterior_id: "s-nao",
    status_aplicado_id: i.aplicado === undefined ? "s-pago" : i.aplicado,
    excluido_em: null,
    created_at: T0,
    updated_at: T0,
  }));
  for (const i of itens) {
    linhasDb[i.lanc] = {
      id: i.lanc,
      mes: "2026-10",
      nome: i.nome ?? `COMPRA ${i.lanc}`,
      apelido: null,
      responsavel_id: i.resp,
      ajuste_de_id: i.ajuste ?? null,
      excluido_em: null,
      data: null,
      ordem_fatura: null,
      created_at: null,
    };
  }
  falso.banco = {
    ...falso.banco,
    pagamentos: [...(falso.banco.pagamentos ?? []), linhaDoPagamento],
    pagamento_itens: [...(falso.banco.pagamento_itens ?? []), ...linhasDoItem],
  };
  falso.versao++;
}

function mudarBanco(mudar: () => void) {
  act(() => {
    mudar();
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

/** O Pagamento desfeito sai da memória (como o gerenciador dos vivos faz). */
function removerPagamento(id: string) {
  mudarBanco(() => {
    falso.banco = {
      ...falso.banco,
      pagamentos: (falso.banco.pagamentos ?? []).filter((p) => (p as { id: string }).id !== id),
      pagamento_itens: (falso.banco.pagamento_itens ?? []).filter((i) => (i as { pagamento_id: string }).pagamento_id !== id),
    };
  });
}

function renderizar() {
  // O repositório falso responde só o que a tela usa.
  return render(<HistoricoDePagamentos repo={repo as never} />, { wrapper: ToastProvider });
}

beforeEach(() => {
  sequencia = 0;
  linhasDb = {};
  falso.banco = { responsaveis, status, pagamentos: [], pagamento_itens: [] };
  falso.status = {};
  falso.online = true;
  falso.versao++;
  falso.recarregar.mockReset();
  repo.responsaveisDasLinhas.mockReset().mockImplementation(async (ids) => ids.map((id) => linhasDb[id]).filter(Boolean));
  repo.linhasDoPagamento.mockReset().mockImplementation(async (ids) => ids.map((id) => linhasDb[id]).filter(Boolean));
  repo.previaDoDesfazer.mockReset().mockImplementation(async (id) => ({
    ok: true,
    itens: (falso.banco.pagamento_itens as { pagamento_id: string; lancamento_id: string }[])
      .filter((i) => i.pagamento_id === id)
      .map((i) => ({ lancamento_id: i.lancamento_id, destino: "devolver" })),
  }));
  repo.desfazer.mockReset().mockImplementation(async (id) => {
    removerPagamento(id);
    return { ok: true };
  });
});

/** O cenário do mockup: a Mãe (total), o Lucas (parcial) e o Rangel pagando o Casal (minha parte). */
function cenarioDoMockup() {
  pagamento("p-mae", "2026-10-08", "total", 135014, [
    { lanc: "m1", resp: "r-mae", valor: 100000 },
    { lanc: "m2", resp: "r-mae", valor: 35014 },
  ]);
  pagamento("p-lucas", "2026-10-09", "parcial", 10000, [{ lanc: "l1", resp: "r-lucas", valor: 10000, aplicado: null, nome: "MONJARO" }]);
  pagamento("p-rangel", "2026-10-12", "minha_parte", 281968, [
    { lanc: "c1", resp: "r-casal", valor: 400000, nome: "SUPERMERCADO" },
    { lanc: "c2", resp: "r-casal", valor: 163935 },
    { lanc: "r1", resp: "r-rangel", valor: 50 },
  ]);
}

// `hidden`: com uma janela aberta o Radix esconde o resto da página dos leitores de tela.
const linhasDaLista = () => within(screen.getByRole("list", { name: T.lista, hidden: true })).getAllByRole("button", { hidden: true });

describe("Histórico de Pagamentos: a lista", () => {
  it("lista do mais novo ao mais antigo com data, Responsáveis, quantidade, valor recebido e o modo", async () => {
    cenarioDoMockup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    const nomes = linhasDaLista().map((b) => sem(b.getAttribute("aria-label")));
    expect(nomes).toEqual([
      // O Casal tem mais valor nos itens: vem antes do Rangel; o valor é o RECEBIDO, não Σ itens.
      "12/10/26, Casal e Rangel, minha parte · 3 lançamentos, R$ 2.819,68 recebidos",
      "09/10/26, Lucas, parcial · 1 lançamento, R$ 100,00 recebidos",
      "08/10/26, Mãe, 2 lançamentos, R$ 1.350,14 recebidos",
    ]);
    // O visual mostra o valor e o modo (o total não leva etiqueta).
    const mae = linhasDaLista()[2];
    expect(sem(mae.textContent)).toContain("R$ 1.350,14");
    expect(sem(mae.textContent)).not.toMatch(/parcial|minha parte/);
    expect(sem(linhasDaLista()[0].textContent)).toContain("minha parte · 3 lançamentos");
  });

  it("cada linha da lista tem 44 pt de altura mínima e é um botão", async () => {
    cenarioDoMockup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    for (const b of linhasDaLista()) expect(b.className).toContain("min-h-toque");
  });

  it("filtra por Responsável (na ordem do cadastro); um Pagamento misto aparece no filtro dos dois", async () => {
    cenarioDoMockup();
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    const grupo = screen.getByRole("group", { name: T.filtrar });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual(["Todos", "Mãe", "Casal", "Rangel", "Lucas"]);
    expect(within(grupo).getByRole("button", { name: "Todos" }).getAttribute("aria-pressed")).toBe("true");

    await u.click(within(grupo).getByRole("button", { name: "Rangel" }));
    expect(linhasDaLista()).toHaveLength(1);
    expect(sem(linhasDaLista()[0].getAttribute("aria-label"))).toContain("Casal e Rangel");
    expect(within(grupo).getByRole("button", { name: "Rangel" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status", { name: "" }).textContent).toBe("1 pagamento");

    await u.click(within(grupo).getByRole("button", { name: "Casal" }));
    expect(linhasDaLista()).toHaveLength(1);
    await u.click(within(grupo).getByRole("button", { name: "Mãe" }));
    expect(sem(linhasDaLista()[0].getAttribute("aria-label"))).toContain("Mãe");
    await u.click(within(grupo).getByRole("button", { name: "Todos" }));
    expect(linhasDaLista()).toHaveLength(3);
  });

  it("o Responsável filtrado que perdeu o último Pagamento volta a 'Todos'", async () => {
    cenarioDoMockup();
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    await u.click(screen.getByRole("button", { name: "Lucas" }));
    expect(linhasDaLista()).toHaveLength(1);
    // Outro aparelho desfaz o do Lucas.
    removerPagamento("p-lucas");
    expect(linhasDaLista()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Lucas" })).toBeNull();
    expect(screen.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sem Pagamentos: o estado vazio com o texto do mapa", async () => {
    renderizar();
    expect(await screen.findByText(T.vazio)).toBeTruthy();
    expect(screen.getByText(T.vazio_ajuda)).toBeTruthy();
    expect(screen.queryByRole("group", { name: T.filtrar })).toBeNull();
  });

  it("enquanto carrega mostra o esqueleto; se falha mostra o erro e 'Tentar de novo' relê tudo", async () => {
    falso.status = { pagamentos: "carregando" };
    falso.versao++;
    const u = userEvent.setup();
    renderizar();
    expect(screen.getByRole("status", { busy: true }).textContent).toBe(T.carregando);
    mudarBanco(() => {
      falso.status = { pagamentos: "erro" };
    });
    expect(screen.getByRole("alert").textContent).toContain(mensagem("carregar.falhou"));
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    // pagamentos, itens, responsáveis e status.
    expect(falso.recarregar).toHaveBeenCalledTimes(4);
  });

  it("a leitura das linhas que falha vira o erro, e 'Tentar de novo' lê de novo", async () => {
    cenarioDoMockup();
    repo.responsaveisDasLinhas.mockResolvedValueOnce(null);
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("alert");
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await screen.findByRole("list", { name: T.lista });
    expect(linhasDaLista()).toHaveLength(3);
  });

  it("um Pagamento novo chega pelo Realtime (com os itens) e entra na ordem; o desfeito some", async () => {
    pagamento("p-mae", "2026-10-08", "total", 1000, [{ lanc: "m1", resp: "r-mae", valor: 1000 }]);
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    mudarBanco(() => pagamento("p-novo", "2026-11-01", "total", 2000, [{ lanc: "n1", resp: "r-lucas", valor: 2000 }]));
    await waitFor(() => expect(linhasDaLista()).toHaveLength(2));
    expect(sem(linhasDaLista()[0].getAttribute("aria-label"))).toContain("01/11/26, Lucas");
    removerPagamento("p-novo");
    expect(linhasDaLista()).toHaveLength(1);
  });

  it("lê as linhas só uma vez por linha: um Pagamento novo pede só as linhas novas", async () => {
    pagamento("p-mae", "2026-10-08", "total", 1000, [{ lanc: "m1", resp: "r-mae", valor: 1000 }]);
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    expect(repo.responsaveisDasLinhas).toHaveBeenCalledTimes(1);
    mudarBanco(() => pagamento("p-novo", "2026-11-01", "total", 2000, [{ lanc: "n1", resp: "r-lucas", valor: 2000 }]));
    await waitFor(() => expect(linhasDaLista()).toHaveLength(2));
    expect(repo.responsaveisDasLinhas).toHaveBeenCalledTimes(2);
    expect(repo.responsaveisDasLinhas.mock.calls[1][0]).toEqual(["n1"]);
  });

  it("o Ajuste de centavos não entra na contagem de lançamentos", async () => {
    pagamento("p1", "2026-10-08", "total", 1001, [
      { lanc: "a", resp: "r-mae", valor: 1000 },
      { lanc: "aj", resp: "r-mae", valor: 1, ajuste: "a" },
    ]);
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    expect(sem(linhasDaLista()[0].getAttribute("aria-label"))).toContain("1 lançamento,");
  });
});

describe("Histórico de Pagamentos: o detalhe", () => {
  async function abrir(nome: RegExp | string) {
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    await u.click(screen.getByRole("button", { name: nome }));
    return { u, janela: await screen.findByRole("dialog") };
  }

  it("mostra os Lançamentos que o Pagamento quitou, com o valor do item e o Status de antes e o aplicado", async () => {
    cenarioDoMockup();
    const { janela } = await abrir(/^08\/10\/26/);
    expect(within(janela).getByText("Pagamento de 08/10/26")).toBeTruthy();
    expect(sem(janela.textContent)).toContain("Recebido: R$ 1.350,14");
    expect(sem(janela.textContent)).toContain("Quitou: R$ 1.350,14");
    const lista = await within(janela).findByRole("list", { name: T.detalhe_lancamentos });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(sem(itens[0].textContent)).toContain("COMPRA m1");
    expect(sem(itens[0].textContent)).toContain("Out/26");
    expect(sem(itens[0].textContent)).toContain("Mãe");
    expect(sem(itens[0].textContent)).toContain("R$ 1.000,00");
    expect(sem(itens[0].textContent)).toContain("Não pago → Pago");
    expect(repo.linhasDoPagamento).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("minha parte: o valor recebido, o que quitou e 'a minha parte' (a diferença); o item parcial não mudou o Status", async () => {
    cenarioDoMockup();
    const { janela, u } = await abrir(/^12\/10\/26/);
    expect(sem(janela.textContent)).toContain("Recebido: R$ 2.819,68");
    expect(sem(janela.textContent)).toContain("Quitou: R$ 5.639,85");
    expect(sem(janela.textContent)).toContain("A minha parte: R$ 2.820,17");
    await u.click(within(janela).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await u.click(screen.getByRole("button", { name: /^09\/10\/26/ }));
    const parcial = await screen.findByRole("dialog");
    expect(sem(parcial.textContent)).toContain("Recebido: R$ 100,00");
    expect(await within(parcial).findByText(T.parcial_sem_mudar)).toBeTruthy();
    expect(within(parcial).queryByText(/A minha parte/)).toBeNull();
  });

  it("a leitura das linhas que falha mostra o erro com 'Tentar de novo'", async () => {
    cenarioDoMockup();
    repo.linhasDoPagamento.mockResolvedValueOnce(null);
    const { u, janela } = await abrir(/^08\/10\/26/);
    const alerta = await within(janela).findByRole("alert");
    expect(alerta.textContent).toContain(mensagem("carregar.falhou"));
    await u.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(janela).findByRole("list", { name: T.detalhe_lancamentos })).toBeTruthy();
  });

  it("sem internet a lista e o detalhe seguem; 'Desfazer pagamento' fica desativado com o aviso", async () => {
    cenarioDoMockup();
    falso.online = false;
    const { janela } = await abrir(/^08\/10\/26/);
    expect((within(janela).getByRole("button", { name: T.desfazer }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(janela).getByText(T.sem_internet)).toBeTruthy();
  });

  it("o Pagamento que outro aparelho desfaz com o detalhe aberto: a janela fecha e a tela avisa", async () => {
    cenarioDoMockup();
    await abrir(/^08\/10\/26/);
    removerPagamento("p-mae");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(mensagem("pagamento.ja_desfeito"))).toBeTruthy();
  });
});

describe("Histórico de Pagamentos: desfazer pagamento", () => {
  async function abrirConfirmacao() {
    cenarioDoMockup();
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    await u.click(screen.getByRole("button", { name: /^08\/10\/26/ }));
    const detalhe = await screen.findByRole("dialog");
    await u.click(within(detalhe).getByRole("button", { name: T.desfazer }));
    const dialogos = await screen.findAllByRole("dialog");
    return { u, confirmacao: dialogos[dialogos.length - 1] };
  }

  it("a confirmação diz o que muda: o valor sai do histórico e quantas linhas voltam; o foco abre em Cancelar", async () => {
    const { confirmacao } = await abrirConfirmacao();
    expect(within(confirmacao).getByText(T.confirmar_titulo)).toBeTruthy();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("O valor recebido, R$ 1.350,14 de 08/10/26, sai do histórico."));
    expect(sem(confirmacao.textContent)).toContain("2 lançamentos voltam ao status anterior.");
    expect(document.activeElement?.textContent).toBe("Cancelar");
    expect(repo.desfazer).not.toHaveBeenCalled();
  });

  it("diz quantas linhas ficam como estão e por quê (Status mudado, outro Pagamento depois, item parcial)", async () => {
    repo.previaDoDesfazer.mockResolvedValue({
      ok: true,
      itens: [
        { lancamento_id: "m1", destino: "devolver" },
        { lancamento_id: "m2", destino: "status_mudou" },
        { lancamento_id: "x1", destino: "pagamento_posterior" },
        { lancamento_id: "x2", destino: "pagamento_posterior" },
        { lancamento_id: "x3", destino: "parcial" },
      ],
    });
    const { confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("1 lançamento volta ao status anterior."));
    expect(sem(confirmacao.textContent)).toContain("1 lançamento fica como está: o status foi mudado depois do pagamento.");
    expect(sem(confirmacao.textContent)).toContain("2 lançamentos ficam como estão: outro pagamento mexeu neles depois.");
    expect(sem(confirmacao.textContent)).toContain("1 lançamento só recebeu parte do valor");
  });

  it("nenhuma linha volta: diz que nenhuma muda de status e o Pagamento sai mesmo assim", async () => {
    repo.previaDoDesfazer.mockResolvedValue({ ok: true, itens: [{ lancamento_id: "m1", destino: "parcial" }] });
    const { confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain(T.confirmar_nada_muda));
  });

  it("Cancelar fecha a confirmação sem desfazer nada e o detalhe continua aberto", async () => {
    const { u, confirmacao } = await abrirConfirmacao();
    await u.click(within(confirmacao).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(repo.desfazer).not.toHaveBeenCalled();
    expect(screen.getByText("Pagamento de 08/10/26")).toBeTruthy();
  });

  it("confirmar desfaz com o que a janela viu, fecha tudo, avisa e leva o foco ao título da seção", async () => {
    const { u, confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("voltam ao status anterior"));
    await u.click(within(confirmacao).getByRole("button", { name: T.confirmar_botao }));
    expect(repo.desfazer).toHaveBeenCalledTimes(1);
    expect(repo.desfazer.mock.calls[0][0]).toBe("p-mae");
    // O que a janela mostrou vai junto: o repositório só grava se o plano de agora for o mesmo.
    expect(repo.desfazer.mock.calls[0][1]).toEqual([
      { lancamento_id: "m1", destino: "devolver" },
      { lancamento_id: "m2", destino: "devolver" },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(sem("Pagamento de R$ 1.350,14 desfeito"))).toBeTruthy();
    expect(linhasDaLista()).toHaveLength(2);
    await waitFor(() => expect(document.activeElement?.id).toBe("titulo-historico"));
  });

  it("outro aparelho mexeu numa linha (pagamento.mudou): a janela relê, avisa e pede a confirmação de novo", async () => {
    const { u, confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("voltam ao status anterior"));
    repo.desfazer.mockResolvedValueOnce({ ok: false, codigo: "pagamento.mudou" });
    repo.previaDoDesfazer.mockResolvedValueOnce({
      ok: true,
      itens: [
        { lancamento_id: "m1", destino: "devolver" },
        { lancamento_id: "m2", destino: "status_mudou" },
      ],
    });
    await u.click(within(confirmacao).getByRole("button", { name: T.confirmar_botao }));
    const alerta = await within(confirmacao).findByRole("alert");
    expect(alerta.textContent).toBe(mensagem("pagamento.mudou_desfazer"));
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("1 lançamento fica como está"));
    expect(repo.previaDoDesfazer).toHaveBeenCalledTimes(2);
    // O Pagamento segue na lista; confirmar de novo desfaz.
    expect(linhasDaLista()).toHaveLength(3);
    await u.click(within(confirmacao).getByRole("button", { name: T.confirmar_botao }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(repo.desfazer).toHaveBeenCalledTimes(2);
  });

  it("já desfeito em outro aparelho na hora de confirmar: fecha e avisa", async () => {
    const { u, confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("voltam ao status anterior"));
    repo.desfazer.mockResolvedValueOnce({ ok: false, codigo: "pagamento.ja_desfeito" });
    await u.click(within(confirmacao).getByRole("button", { name: T.confirmar_botao }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(mensagem("pagamento.ja_desfeito"))).toBeTruthy();
  });

  it("já desfeito quando a prévia chega: a janela fecha e avisa", async () => {
    repo.previaDoDesfazer.mockResolvedValue({ ok: false, codigo: "pagamento.ja_desfeito" });
    cenarioDoMockup();
    const u = userEvent.setup();
    renderizar();
    await screen.findByRole("list", { name: T.lista });
    await u.click(screen.getByRole("button", { name: /^08\/10\/26/ }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: T.desfazer }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(mensagem("pagamento.ja_desfeito"))).toBeTruthy();
  });

  it("outra falha do desfazer aparece na janela, que continua aberta", async () => {
    const { u, confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("voltam ao status anterior"));
    repo.desfazer.mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" });
    await u.click(within(confirmacao).getByRole("button", { name: T.confirmar_botao }));
    expect((await within(confirmacao).findByRole("alert")).textContent).toBe(mensagem("salvar.falhou"));
    expect((within(confirmacao).getByRole("button", { name: T.confirmar_botao }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sem conexão na hora de confirmar: o botão fica desativado e nada é gravado", async () => {
    const { confirmacao } = await abrirConfirmacao();
    await waitFor(() => expect(sem(confirmacao.textContent)).toContain("voltam ao status anterior"));
    mudarBanco(() => {
      falso.online = false;
    });
    expect((within(confirmacao).getByRole("button", { name: T.confirmar_botao }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(confirmacao).getByText(T.sem_internet)).toBeTruthy();
    expect(repo.desfazer).not.toHaveBeenCalled();
  });
});
