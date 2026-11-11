// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Divisao, ItemDividir } from "@/domain/divisao";
import { TEXTOS_DIVISAO as T } from "@/domain/mensagens";
import type { LinhaLancamento, MudancaLancamento, OpcoesGravacao, RepoLancamentos } from "@/data/lancamentos-repo";
import { ToastProvider } from "@/ui/Toast";
import { DividirLancamento } from "./DividirLancamento";
import { PainelLancamento, type CadastrosPainel } from "./PainelLancamento";

// Divisão (História 3.8) no painel do Lançamento e no controlador da janela.

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");
const T1 = "2026-11-08T00:00:00.000001+00:00";

const divisao: Divisao = {
  modo: "proporcao",
  partes: [
    { responsavel_id: "r-casal", numerador: 2, denominador: 3, filha_id: "f1" },
    { responsavel_id: "r-rafael", numerador: 1, denominador: 3, filha_id: "f2" },
  ],
};

const linha = (extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id: "jim",
    owner_id: "dono",
    nome: "JIM COM 57653822 BAR",
    nome_normalizado: "JIM COM 57653822 BAR",
    apelido: null,
    valor_centavos: 46600,
    data: "2026-10-03",
    parcela_n: null,
    parcela_total: null,
    final_cartao: "8673",
    mes: "2026-10",
    fatura_id: "f10",
    ordem_fatura: 1,
    duvida_extracao: false,
    lancado_por: "fatura",
    responsavel_id: null,
    tipo_id: "t-casa",
    status_id: "s-nao",
    observacao: null,
    editado_em: null,
    excluido_em: null,
    ajuste_de_id: null,
    dividido_de_id: null,
    divisao: null,
    revisao_motivo: null,
    revisao_dados: null,
    created_at: T1,
    updated_at: T1,
    ...extra,
  }) as LinhaLancamento;

const mae = linha({ divisao: divisao as never });
const filha1 = linha({ id: "f1", dividido_de_id: "jim", valor_centavos: 31067, responsavel_id: "r-casal", status_id: "s-pago" });
const filha2 = linha({ id: "f2", dividido_de_id: "jim", valor_centavos: 15533, responsavel_id: "r-rafael" });

const cadastros = {
  responsaveis: [
    { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
    { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  ],
  tipos: [{ id: "t-casa", nome: "Casa", arquivado: false }],
  status: [
    { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
    { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
  ],
} as unknown as CadastrosPainel;

const renderizar = (ui: React.ReactElement) => render(ui, { wrapper: ToastProvider });

function repoFalso() {
  const atualizar = vi.fn(async (id: string, m: MudancaLancamento, ...resto: [OpcoesGravacao?]) => (void resto, {
    ok: true as const,
    linha: { ...linha({ id }), ...m, updated_at: "2026-11-08T00:14:00.000002+00:00" } as LinhaLancamento,
  }));
  return { atualizar, propagarAosPrevistos: vi.fn(async () => ({ ok: true as const, preenchidos: 0, aPerguntar: [] })) } as unknown as RepoLancamentos & {
    atualizar: typeof atualizar;
  };
}

describe("painel da mãe dividida", () => {
  function montar(aoDividir = vi.fn()) {
    const repo = repoFalso();
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={mae}
        filhas={[filha1, filha2]}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        aoDividir={aoDividir}
        repo={repo}
      />,
    );
    return { repo, aoDividir };
  }

  it("Valor travado, Responsável 'Dividido entre as partes' com o resumo, e 'Editar divisão' no rodapé", async () => {
    const { aoDividir } = montar();
    expect((screen.getByLabelText("Valor") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(T.dividido_somente_leitura)).toBeTruthy();
    expect(screen.getByText(T.responsavel_dividido)).toBeTruthy();
    expect(sem(screen.getByText(/Casal 2\/3/).textContent)).toBe("Casal 2/3 · Rafael 1/3");
    expect(screen.queryByLabelText("Responsável")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: T.botao_editar }));
    expect(aoDividir).toHaveBeenCalledWith("jim");
  });

  it("Tipo e Apelido vão junto para as filhas, na mesma gravação", async () => {
    const { repo } = montar();
    const apelido = screen.getByLabelText("Apelido");
    fireEvent.focus(apelido);
    fireEvent.change(apelido, { target: { value: "Jantar" } });
    fireEvent.blur(apelido);
    await waitFor(() => expect(repo.atualizar).toHaveBeenCalled());
    expect(repo.atualizar).toHaveBeenCalledWith("jim", { apelido: "Jantar" }, { junto: ["f1", "f2"] });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "" } });
    await waitFor(() => expect(repo.atualizar).toHaveBeenCalledTimes(2));
    expect(repo.atualizar).toHaveBeenLastCalledWith("jim", { tipo_id: null }, { junto: ["f1", "f2"] });
  });

  it("o Status da mãe e o Valor não vão para as filhas", async () => {
    const { repo } = montar();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "s-pago" } });
    await waitFor(() => expect(repo.atualizar).toHaveBeenCalled());
    expect(repo.atualizar).toHaveBeenCalledWith("jim", { status_id: "s-pago" });
  });

  it("uma linha comum tem 'Dividir' no rodapé", () => {
    const repo = repoFalso();
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={linha()}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        aoDividir={() => {}}
        repo={repo}
      />,
    );
    expect(screen.getByRole("button", { name: T.botao })).toBeTruthy();
  });
});

describe("painel da parte (filha)", () => {
  it("só o Status se edita; Valor e Responsável são da divisão; sem Excluir; 'Abrir divisão' abre a mãe", async () => {
    const repo = repoFalso();
    const aoDividir = vi.fn();
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={filha1}
        maeDaParte={mae}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        aoDividir={aoDividir}
        repo={repo}
      />,
    );
    const painel = screen.getByRole("complementary");
    expect(within(painel).getByText("Parte de JIM COM 57653822 BAR")).toBeTruthy();
    expect(sem(painel.textContent)).toContain("R$ 310,67");
    expect(within(painel).queryByLabelText("Valor")).toBeNull();
    expect(within(painel).queryByLabelText("Apelido")).toBeNull();
    expect(within(painel).queryByRole("button", { name: "Excluir" })).toBeNull();
    fireEvent.change(within(painel).getByLabelText("Status"), { target: { value: "s-nao" } });
    await waitFor(() => expect(repo.atualizar).toHaveBeenCalledWith("f1", { status_id: "s-nao" }));
    await userEvent.setup().click(within(painel).getByRole("button", { name: T.abrir_divisao }));
    expect(aoDividir).toHaveBeenCalledWith("jim");
  });
});

describe("DividirLancamento (controlador)", () => {
  const itemRestaurar: ItemDividir = { id: "jim", corpo: { divisao: null }, partes: [] };

  function montar(r: Partial<RepoLancamentos>, alvoId: string | null = "jim", linhas: LinhaLancamento[] = [linha()]) {
    const aoFechar = vi.fn();
    const repo = r as RepoLancamentos;
    renderizar(
      <DividirLancamento alvoId={alvoId} aoFechar={aoFechar} linhas={linhas} cadastros={cadastros} statusPadraoId="s-nao" repo={repo} />,
    );
    return { aoFechar };
  }

  async function dividirNaJanela() {
    const u = userEvent.setup();
    fireEvent.change(screen.getByRole("combobox", { name: `${T.responsavel} 1` }), { target: { value: "r-casal" } });
    fireEvent.change(screen.getByRole("combobox", { name: `${T.responsavel} 2` }), { target: { value: "r-rafael" } });
    fireEvent.change(screen.getByRole("textbox", { name: `${T.fracao} 1` }), { target: { value: "2/3" } });
    fireEvent.change(screen.getByRole("textbox", { name: `${T.fracao} 2` }), { target: { value: "1/3" } });
    await u.click(screen.getByRole("button", { name: T.botao }));
    return u;
  }

  it("divide, fecha a janela, avisa com 'Desfazer' e o Desfazer manda restaurar o que a ação fez", async () => {
    const dividir = vi.fn(async (...args: [string, ...unknown[]]) => (void args, { ok: true as const, linhas: [], preenchidos: 2, aPerguntar: [], desfazer: [itemRestaurar] }));
    const restaurarDivisao = vi.fn(async () => ({ ok: true as const }));
    const { aoFechar } = montar({ dividir, restaurarDivisao });
    await dividirNaJanela();
    await waitFor(() => expect(dividir).toHaveBeenCalledOnce());
    expect(dividir.mock.calls[0][0]).toBe("jim");
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(await screen.findByText("Dividido em 2 partes · 2 previstos também")).toBeTruthy();
    // A janela fica no DOM neste teste (aoFechar é um espião): o clique direto ignora o véu dela.
    fireEvent.click(screen.getByRole("button", { name: "Desfazer", hidden: true }));
    expect(restaurarDivisao).toHaveBeenCalledWith([itemRestaurar]);
  });

  it("previstos com outro Responsável: a pergunta 'Só este / Aplicar a todos'", async () => {
    const pendente: ItemDividir = { id: "p6", corpo: { divisao }, partes: [] };
    const dividir = vi.fn(async () => ({ ok: true as const, linhas: [], preenchidos: 0, aPerguntar: [pendente], desfazer: [] }));
    const aplicarDivisaoAosPrevistos = vi.fn(async () => ({ ok: true as const, gravados: 1 }));
    montar({ dividir, aplicarDivisaoAosPrevistos });
    const u = await dividirNaJanela();
    expect(await screen.findByText(/Dividir também o previsto/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Aplicar a todos" }));
    expect(aplicarDivisaoAosPrevistos).toHaveBeenCalledWith([pendente]);
    expect(await screen.findByText("1 previsto atualizado")).toBeTruthy();
  });

  it("'Só este' não grava nos previstos", async () => {
    const pendente: ItemDividir = { id: "p6", corpo: { divisao }, partes: [] };
    const dividir = vi.fn(async () => ({ ok: true as const, linhas: [], preenchidos: 0, aPerguntar: [pendente], desfazer: [] }));
    const aplicarDivisaoAosPrevistos = vi.fn();
    montar({ dividir, aplicarDivisaoAosPrevistos });
    const u = await dividirNaJanela();
    await u.click(await screen.findByRole("button", { name: "Só este" }));
    expect(aplicarDivisaoAosPrevistos).not.toHaveBeenCalled();
  });

  it("recusa da RPC: toast com o texto do código e a janela continua aberta", async () => {
    const dividir = vi.fn(async () => ({ ok: false as const, codigo: "divisao.com_ajuste" }));
    const { aoFechar } = montar({ dividir });
    await dividirNaJanela();
    expect(await screen.findByText(/tem um Ajuste de centavos/)).toBeTruthy();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("'Desfazer divisão' chama o repositório e avisa com 'Desfazer'", async () => {
    const desfazerDivisao = vi.fn(async () => ({ ok: true as const, linhas: [], preenchidos: 0, aPerguntar: [], desfazer: [itemRestaurar] }));
    const { aoFechar } = montar({ desfazerDivisao }, "jim", [mae, filha1, filha2]);
    await userEvent.setup().click(screen.getByRole("button", { name: T.desfazer }));
    await waitFor(() => expect(desfazerDivisao).toHaveBeenCalledWith("jim"));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(await screen.findByText(T.desfeita)).toBeTruthy();
  });

  it("sem alvo ou com a linha excluída, nada abre", () => {
    montar({}, null);
    expect(screen.queryByRole("dialog")).toBeNull();
    montar({}, "jim", [linha({ excluido_em: "2026-11-09T00:00:00Z" })]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
