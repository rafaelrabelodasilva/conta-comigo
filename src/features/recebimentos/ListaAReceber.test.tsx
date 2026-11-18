// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { LinhaAReceber } from "@/domain/divida";
import { ListaAReceber, enderecoDoLancamento } from "./ListaAReceber";

// "A receber" (História 6.6, FR-27, UX-DR19): o que a seção mostra do que o núcleo calculou (`aReceber`, testado à parte).

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");
const cadastros = {
  responsaveis: new Map([
    ["lucas", { nome: "Lucas", cor: 5 }],
    ["mae", { nome: "Mãe", cor: 4 }],
  ]),
};

const bombinhas: LinhaAReceber = {
  chave: "s|lucas|2027-04-06",
  nome: "Bombinhas",
  responsavelId: "lucas",
  vencimento: "2027-04-06",
  valorCentavos: 63_600,
  itens: ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].map((mes, i) => ({
    id: `b${i}`,
    mes,
    parcela_n: i + 1,
    restanteCentavos: 10_600,
    atrasadoDesde: null,
  })),
  atrasadoDesde: null,
  observacao: "Lucas paga tudo no final",
};

const oculos: LinhaAReceber = {
  chave: "o",
  nome: "Óculos (resto)",
  responsavelId: "mae",
  vencimento: "2026-12-06",
  valorCentavos: 27_000,
  itens: [{ id: "o1", mes: "2026-10", parcela_n: null, restanteCentavos: 27_000, atrasadoDesde: null }],
  atrasadoDesde: null,
  observacao: null,
};

describe("ListaAReceber", () => {
  it("mostra Nome, Responsável, vencimento e valor; a Bombinhas do Lucas soma R$ 636,00", () => {
    render(<ListaAReceber linhas={[oculos, bombinhas]} cadastros={cadastros} carregando={false} />);
    expect(screen.getByRole("heading", { name: "A receber" })).toBeTruthy();
    const lista = screen.getByRole("list", { name: "A receber" });
    const b = within(lista).getByRole("button", { name: /Bombinhas/ });
    expect(sem(b.textContent)).toContain("Bombinhas");
    expect(sem(b.textContent)).toContain("Lucas");
    expect(sem(b.textContent)).toContain("vence 06/04/27");
    expect(sem(b.textContent)).toContain("R$ 636,00");
    expect(sem(b.textContent)).toContain("6 lançamentos · Jul/26 a Dez/26");
    expect(sem(b.textContent)).toContain("Lucas paga tudo no final");
    const o = within(lista).getByRole("link", { name: /Óculos/ });
    expect(sem(o.textContent)).toContain("Mãe");
    expect(sem(o.textContent)).toContain("vence 06/12/26");
    expect(sem(o.textContent)).toContain("R$ 270,00");
  });

  it("tocar numa linha de um lançamento abre o painel dele no Painel do Mês dele", () => {
    render(<ListaAReceber linhas={[oculos]} cadastros={cadastros} carregando={false} />);
    const o = screen.getByRole("link", { name: /Abrir Óculos/ });
    expect(o.getAttribute("href")).toBe("/?mes=2026-10&lancamento=o1");
    expect(enderecoDoLancamento("2026-10", "o1")).toBe("/?mes=2026-10&lancamento=o1");
  });

  it("uma linha de vários lançamentos é um interruptor: mostra cada lançamento, com o toque dele", async () => {
    render(<ListaAReceber linhas={[bombinhas]} cadastros={cadastros} carregando={false} />);
    const botao = screen.getByRole("button", { name: /Ver os lançamentos de Bombinhas/ });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    await userEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[0].getAttribute("href")).toBe("/?mes=2026-07&lancamento=b0");
    expect(links[5].getAttribute("href")).toBe("/?mes=2026-12&lancamento=b5");
    expect(sem(links[0].textContent)).toContain("Jul/26");
    expect(sem(links[0].textContent)).toContain("R$ 106,00");
    await userEvent.click(botao);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("a vencida leva o selo 'Atrasado' com a data de quando passou a atrasar", () => {
    const vencida = { ...oculos, atrasadoDesde: "2026-12-17", itens: [{ ...oculos.itens[0], atrasadoDesde: "2026-12-17" }] };
    render(<ListaAReceber linhas={[vencida]} cadastros={cadastros} carregando={false} />);
    const selo = screen.getByText("Atrasado");
    expect(selo.getAttribute("data-selo")).toBe("atrasado");
    expect(selo.getAttribute("title")).toBe("atrasado desde 17/12/26");
  });

  it("sem nenhuma: 'Nenhuma dívida programada'", () => {
    render(<ListaAReceber linhas={[]} cadastros={cadastros} carregando={false} />);
    expect(screen.getByText("Nenhuma dívida programada")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "A receber" })).toBeNull();
  });

  it("carregando: o esqueleto, nunca 'Nenhuma dívida programada'", () => {
    render(<ListaAReceber linhas={[]} cadastros={cadastros} carregando />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Nenhuma dívida programada")).toBeNull();
  });

  it("Responsável desconhecido: 'Sem responsável'", () => {
    render(<ListaAReceber linhas={[{ ...oculos, responsavelId: null }]} cadastros={cadastros} carregando={false} />);
    expect(screen.getByText("Sem responsável")).toBeTruthy();
  });

  it("cada linha tem pelo menos 44 pt de altura de toque (classe min-h-toque)", () => {
    render(<ListaAReceber linhas={[oculos, bombinhas]} cadastros={cadastros} carregando={false} />);
    expect(screen.getByRole("link", { name: /Óculos/ }).className).toContain("min-h-toque");
    expect(screen.getByRole("button", { name: /Bombinhas/ }).className).toContain("min-h-toque");
  });
});
