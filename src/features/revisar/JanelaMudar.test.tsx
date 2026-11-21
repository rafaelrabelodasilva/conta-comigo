// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, TEXTOS_REVISAR as T } from "@/domain/mensagens";
import { montarFila, type ItemDaFila } from "@/domain/revisar";
import { JanelaMudar } from "./JanelaMudar";

// A contagem de uso do repositório de cadastros é falsa.
const falso = vi.hoisted(() => ({ contarUsos: vi.fn() }));
vi.mock("@/data/cadastros-repo", () => ({ repoCadastros: () => ({ contarUsos: falso.contarUsos }) }));

const responsaveis = [
  { id: "casal", nome: "Casal", arquivado: false },
  { id: "rafael", nome: "Rafael", arquivado: false },
  { id: "lucas", nome: "Lucas", arquivado: false },
  { id: "antigo", nome: "Antigo", arquivado: true },
];
const tipos = [
  { id: "casa", nome: "Casa", arquivado: false },
  { id: "gatos", nome: "Gatos", arquivado: false },
  { id: "saude", nome: "Saúde", arquivado: false },
];

function itemDe(
  extra: { responsavel_id?: string | null; tipo_id?: string | null; dados?: unknown; motivo?: "sugestao" | "sem_classificacao"; divisao?: unknown } = {},
): ItemDaFila {
  return montarFila(
    [
      {
        id: "a",
        nome: "COBASI",
        apelido: null,
        mes: "2026-11",
        valor_centavos: 1000,
        parcela_n: null,
        parcela_total: null,
        responsavel_id: extra.responsavel_id ?? null,
        tipo_id: extra.tipo_id ?? null,
        ajuste_de_id: null,
        excluido_em: null,
        revisao_motivo: extra.motivo ?? "sem_classificacao",
        revisao_dados: extra.dados ?? null,
        ordem_fatura: 1,
        ...(extra.divisao === undefined ? {} : { divisao: extra.divisao }),
      },
    ],
    { responsaveis, tipos },
  )[0].itens[0];
}

function desenhar(item: ItemDaFila, aoSalvar = vi.fn(async () => true)) {
  const aoMudar = vi.fn();
  render(<JanelaMudar item={item} responsaveis={responsaveis} tipos={tipos} aberta aoMudar={aoMudar} aoSalvar={aoSalvar} />);
  return { aoMudar, aoSalvar };
}

const opcoesDe = (rotulo: string) =>
  within(screen.getByLabelText(rotulo)).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  falso.contarUsos.mockResolvedValue({ ok: false, codigo: "carregar.falhou" });
});

describe("JanelaMudar", () => {
  it("dois seletores só com ativos, na ordem do cadastro quando a contagem falha; Salvar desligado", async () => {
    desenhar(itemDe());
    expect(screen.getByRole("dialog", { name: T.titulo_mudar })).toBeTruthy();
    await waitFor(() => expect(falso.contarUsos).toHaveBeenCalledTimes(2));
    expect(falso.contarUsos).toHaveBeenCalledWith("responsavel");
    expect(falso.contarUsos).toHaveBeenCalledWith("tipo");
    expect(opcoesDe(T.responsavel)).toEqual([T.escolha, "Casal", "Rafael", "Lucas"]);
    expect(opcoesDe(T.tipo)).toEqual([T.escolha, "Casa", "Gatos", "Saúde"]);
    expect(screen.getByRole("button", { name: ROTULOS.salvar }).hasAttribute("disabled")).toBe(true);
  });

  it("os mais usados primeiro", async () => {
    falso.contarUsos.mockImplementation(async (cadastro: string) => ({
      ok: true,
      valor: new Map(cadastro === "tipo" ? [["saude", 9], ["casa", 2]] : [["lucas", 5]]),
    }));
    desenhar(itemDe());
    await waitFor(() => expect(opcoesDe(T.tipo)).toEqual([T.escolha, "Saúde", "Casa", "Gatos"]));
    expect(opcoesDe(T.responsavel)).toEqual([T.escolha, "Lucas", "Casal", "Rafael"]);
  });

  it("pré-preenchida com o que a linha tem ou a sugestão; só ativos valem", () => {
    desenhar(
      itemDe({
        responsavel_id: "rafael",
        motivo: "sugestao",
        dados: { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] },
      }),
    );
    expect((screen.getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("rafael");
    expect((screen.getByLabelText(T.tipo) as HTMLSelectElement).value).toBe("gatos");
    expect(screen.getByRole("button", { name: ROTULOS.salvar }).hasAttribute("disabled")).toBe(false);
  });

  it("Responsável arquivado na linha começa vazio (não dá para salvar com ele)", () => {
    desenhar(itemDe({ responsavel_id: "antigo", tipo_id: "casa" }));
    expect((screen.getByLabelText(T.responsavel) as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: ROTULOS.salvar }).hasAttribute("disabled")).toBe(true);
  });

  it("Salvar só com os dois escolhidos; grava e fecha quando dá certo", async () => {
    const { aoSalvar, aoMudar } = desenhar(itemDe());
    const u = userEvent.setup();
    const salvar = screen.getByRole("button", { name: ROTULOS.salvar });
    await u.selectOptions(screen.getByLabelText(T.responsavel), "casal");
    expect(salvar.hasAttribute("disabled")).toBe(true);
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    expect(salvar.hasAttribute("disabled")).toBe(false);
    await u.click(salvar);
    expect(aoSalvar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "a" }), {
      responsavel_id: "casal",
      tipo_id: "saude",
    });
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("gravação que falha mantém a janela aberta", async () => {
    const { aoMudar } = desenhar(itemDe({ responsavel_id: "casal", tipo_id: "casa" }), vi.fn(async () => false));
    await userEvent.setup().click(screen.getByRole("button", { name: ROTULOS.salvar }));
    await waitFor(() => expect(screen.getByRole("button", { name: ROTULOS.salvar }).hasAttribute("disabled")).toBe(false));
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("Cancelar fecha sem gravar", async () => {
    const { aoSalvar, aoMudar } = desenhar(itemDe());
    await userEvent.setup().click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoSalvar).not.toHaveBeenCalled();
  });

  it("a contagem que lança também não quebra: ordem do cadastro", async () => {
    falso.contarUsos.mockRejectedValue(new Error("rede"));
    desenhar(itemDe());
    await waitFor(() => expect(falso.contarUsos).toHaveBeenCalled());
    expect(opcoesDe(T.responsavel)).toEqual([T.escolha, "Casal", "Rafael", "Lucas"]);
  });
});

describe("JanelaMudar numa mãe dividida que voltou à fila (Defeito 9)", () => {
  // O Tipo foi limpo e a mãe voltou à fila. O Responsável está nas partes: o seletor dele não gravaria nada.
  const divisao = { modo: "valor", partes: [{ responsavel_id: "casal", numerador: 1, denominador: 2 }, { responsavel_id: "rafael", numerador: 1, denominador: 2 }] };

  it("não mostra o seletor de Responsável (que não grava) e diz o que fazer: editar a divisão no Painel", () => {
    desenhar(itemDe({ divisao }));
    expect(screen.queryByLabelText(T.responsavel)).toBeNull();
    expect(screen.getByLabelText(T.tipo)).toBeTruthy();
    const dica = screen.getByRole("note");
    expect(dica.textContent).toBe(T.divisao_nas_partes);
    expect(dica.textContent).toContain("Editar divisão");
  });

  it("Salvar só exige o Tipo e grava só o Tipo (nenhum Responsável que a gravação ignoraria)", async () => {
    const { aoSalvar, aoMudar } = desenhar(itemDe({ divisao }));
    const salvar = screen.getByRole("button", { name: ROTULOS.salvar });
    expect(salvar.hasAttribute("disabled")).toBe(true);
    await userEvent.setup().selectOptions(screen.getByLabelText(T.tipo), "saude");
    expect(salvar.hasAttribute("disabled")).toBe(false);
    await userEvent.setup().click(salvar);
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1));
    expect((aoSalvar.mock.calls[0] as unknown[])[1]).toEqual({ tipo_id: "saude" });
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("a linha comum não muda: os dois seletores, sem a dica, e grava Responsável e Tipo", async () => {
    const { aoSalvar } = desenhar(itemDe());
    expect(screen.getByLabelText(T.responsavel)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText(T.responsavel), "casal");
    await u.selectOptions(screen.getByLabelText(T.tipo), "casa");
    await u.click(screen.getByRole("button", { name: ROTULOS.salvar }));
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith(expect.anything(), { responsavel_id: "casal", tipo_id: "casa" }));
  });
});
