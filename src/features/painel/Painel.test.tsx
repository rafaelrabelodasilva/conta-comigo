// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_IMPORTAR, mensagem, rotuloDespesasCreditos } from "@/domain/mensagens";
import type { LinhaFatura, LinhaLancamento } from "@/data/faturas-repo";
import { Painel } from "./Painel";

// O gerenciador de Realtime é falso (um retrato por tabela) e a janela de
// importação vira um marcador: o teste confere o que o Painel desenha.
const falso = vi.hoisted(() => ({
  retratos: {} as Record<string, { status: string; linhas: unknown[] }>,
  recarregar: vi.fn(),
}));
vi.mock("@/data/realtime", () => ({
  useLinhas: (tabela: string) => falso.retratos[tabela] ?? { status: "pronto", linhas: [] },
  gerenciador: () => ({ recarregar: falso.recarregar }),
}));
vi.mock("@/features/importar/ImportarFatura", () => ({
  ImportarFatura: ({ aberta }: { aberta: boolean }) => (aberta ? <div data-testid="janela-importar" /> : null),
}));

const fatura = {
  id: "f1",
  mes: "2026-10",
  vencimento: "2026-10-06",
  total_despesas_centavos: 832739,
  total_creditos_centavos: 63962,
  updated_at: "2026-11-03T12:00:00+00:00",
} as LinhaFatura;

const lanc = (id: string, ordem: number, extra: Partial<LinhaLancamento> = {}) =>
  ({
    id,
    mes: "2026-10",
    fatura_id: "f1",
    ordem_fatura: ordem,
    nome: `LOJA ${id}`,
    data: "2026-09-04",
    parcela_n: null,
    parcela_total: null,
    valor_centavos: 1000,
    final_cartao: "5061",
    excluido_em: null,
    updated_at: "2026-11-03T12:00:00+00:00",
    ...extra,
  }) as LinhaLancamento;

function definir(faturas: unknown[], lancamentos: unknown[], status = "pronto") {
  falso.retratos = {
    faturas: { status, linhas: faturas },
    lancamentos: { status, linhas: lancamentos },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  definir([], []);
});

describe("Painel provisório", () => {
  it("sem Fatura: o estado vazio chama para importar; o botão do topo abre a janela", async () => {
    render(<Painel titulo="Painel" />);
    expect(screen.getByText(mensagem("painel.vazio"))).toBeTruthy();
    // Um botão só, no topo.
    const botoes = screen.getAllByRole("button", { name: TEXTOS_IMPORTAR.botao });
    expect(botoes).toHaveLength(1);
    expect(screen.queryByTestId("janela-importar")).toBeNull();
    await userEvent.setup().click(botoes[0]);
    expect(screen.getByTestId("janela-importar")).toBeTruthy();
  });

  it("carregando mostra o esqueleto, não o vazio", () => {
    definir([], [], "carregando");
    render(<Painel titulo="Painel" />);
    expect(screen.queryByText(mensagem("painel.vazio"))).toBeNull();
    expect(screen.getByRole("button", { name: TEXTOS_IMPORTAR.botao })).toBeTruthy();
  });

  it("erro ao carregar: Tentar de novo relê as duas tabelas", async () => {
    definir([], [], "erro");
    render(<Painel titulo="Painel" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falso.recarregar).toHaveBeenCalledTimes(2);
  });

  it("um cartão por Fatura e a lista na ordem da fatura, sem as excluídas", () => {
    definir(
      [fatura],
      [
        lanc("b", 2, { nome: "MSC CRUZEIROS", valor_centavos: -8 }),
        lanc("a", 1, { nome: "MSC CRUZEIROS", parcela_n: 2, parcela_total: 12, valor_centavos: 114074 }),
        lanc("c", 3, { excluido_em: "2026-11-03T13:00:00+00:00" }),
      ],
    );
    render(<Painel titulo="Painel" />);
    expect(screen.getByRole("heading", { name: "Fatura de outubro/26 · vence 06/10/26 · 2 lançamentos" })).toBeTruthy();
    expect(screen.getByText(rotuloDespesasCreditos(832739, 63962), { normalizer: (t) => t })).toBeTruthy();

    const linhas = screen.getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);
    const [primeira, segunda] = linhas.map((l) => within(l).getAllByRole("cell").map((c) => c.textContent));
    expect(primeira).toEqual(["04/09/26", "MSC CRUZEIROS", "02/12", formatarDinheiro(114074), "5061"]);
    expect(segunda).toEqual(["04/09/26", "MSC CRUZEIROS", "", formatarDinheiro(-8), "5061"]);
    expect(screen.queryByText("LOJA c")).toBeNull();
  });
});
