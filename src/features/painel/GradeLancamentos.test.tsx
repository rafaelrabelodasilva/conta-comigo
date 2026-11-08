// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { COLUNAS_GRADE, TEXTOS_PAINEL } from "@/domain/mensagens";
import { ORDEM_PADRAO, alternarOrdem, type LancamentoGrade, type Ordem } from "@/domain/painel";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const cadastros: CadastrosGrade = {
  tipos: new Map([["t-viagem", "Viagem"]]),
  responsaveis: new Map([["r-casal", { nome: "Casal", cor: 2 }]]),
  status: new Map([
    ["s-nao", { nome: "Não pago", conta_como_pago: false }],
    ["s-pago", { nome: "Pago", conta_como_pago: true }],
  ]),
};

const lanc = (id: string, extra: Partial<LancamentoGrade> = {}): LancamentoGrade => ({
  id,
  nome: `LOJA ${id}`,
  apelido: null,
  parcela_n: null,
  parcela_total: null,
  valor_centavos: 1000,
  tipo_id: null,
  responsavel_id: null,
  status_id: null,
  lancado_por: "fatura",
  ordem_fatura: null,
  ...extra,
});

const LINHAS = [
  lanc("b", { ordem_fatura: 2, nome: "MSC CRUZEIROS", valor_centavos: -8, status_id: "s-pago", lancado_por: "manual" }),
  lanc("a", {
    ordem_fatura: 1,
    nome: "MSC CRUZEIROS",
    parcela_n: 2,
    parcela_total: 12,
    valor_centavos: 114074,
    tipo_id: "t-viagem",
    responsavel_id: "r-casal",
    status_id: "s-nao",
  }),
  lanc("z", { ordem_fatura: 3, nome: "MAGALU MAGALU", apelido: "Lava e seca", valor_centavos: 0 }),
];

function Montar({ linhas = LINHAS, aoFiltrar = () => {} }: { linhas?: LancamentoGrade[]; aoFiltrar?: (id: string | null) => void }) {
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  return (
    <GradeLancamentos
      linhas={linhas}
      cadastros={cadastros}
      ordem={ordem}
      aoOrdenar={(c) => setOrdem((o) => alternarOrdem(o, c))}
      filtro={undefined}
      aoFiltrar={aoFiltrar}
      vazio={TEXTOS_PAINEL.sem_lancamentos}
    />
  );
}

function corpo() {
  const [, tbody] = screen.getAllByRole("rowgroup");
  return within(tbody).getAllByRole("row");
}

const celulas = (linha: HTMLElement) => within(linha).getAllByRole("cell").map((c) => sem(c.textContent));

describe("GradeLancamentos", () => {
  it("colunas na ordem da UX-DR10 e linhas na ordem da fatura", () => {
    render(<Montar />);
    const cabecalhos = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabecalhos).toEqual(Object.values(COLUNAS_GRADE));
    const [a, b, z] = corpo();
    expect(celulas(a)).toEqual(["", "MSC CRUZEIROS", "02/12", "R$ 1.140,74", "Viagem", "Casal", "Fatura", "Não pago"]);
    expect(celulas(b)).toEqual(["", "MSC CRUZEIROS", "", "- R$ 0,08", "—", "—", "Manual", "Pago"]);
    // Apelido em negrito e o Nome em cinza; R$ 0,00 aparece normalmente.
    expect(celulas(z)).toEqual(["", "Lava e seca · MAGALU MAGALU", "", "R$ 0,00", "—", "—", "Fatura", "—"]);
    expect(within(z).getByText("Lava e seca").className).toContain("texto-body-strong");
    expect(within(z).getByText("· MAGALU MAGALU").className).toContain("text-text-muted");
  });

  it("nome acessível da linha: Nome, Valor, Parcela, Responsável, Status", () => {
    render(<Montar />);
    const [a, b] = corpo();
    expect(sem(a.getAttribute("aria-label"))).toBe("MSC CRUZEIROS, R$ 1.140,74, parcela 2 de 12, Casal, Não pago");
    expect(sem(b.getAttribute("aria-label"))).toBe("MSC CRUZEIROS, - R$ 0,08, Sem responsável, Pago");
  });

  it("a linha nunca leva cor de pessoa ou de Status; Valor à direita em tnum", () => {
    render(<Montar />);
    for (const linha of corpo()) {
      expect(linha.className).not.toMatch(/person|status/);
      for (const celula of within(linha).getAllByRole("cell")) expect(celula.className).not.toMatch(/person|status/);
    }
    const valor = within(corpo()[0]).getAllByRole("cell")[3];
    expect(valor.className).toContain("text-right");
    expect(valor.className).toContain("texto-number");
    expect(within(corpo()[0]).getByText("Casal").className).toContain("bg-person-2-bg");
    expect(within(corpo()[0]).getByText("Não pago").className).toContain("bg-status-unpaid-bg");
    expect(within(corpo()[1]).getByText("Pago").className).toContain("bg-status-paid-bg");
  });

  it("tocar em Valor ordena crescente; de novo, decrescente", async () => {
    render(<Montar />);
    const u = userEvent.setup();
    const valor = screen.getByRole("button", { name: "Valor" });
    await u.click(valor);
    expect(corpo().map((l) => celulas(l)[3])).toEqual(["- R$ 0,08", "R$ 0,00", "R$ 1.140,74"]);
    expect(screen.getAllByRole("columnheader")[3].getAttribute("aria-sort")).toBe("ascending");
    await u.click(valor);
    expect(corpo().map((l) => celulas(l)[3])).toEqual(["R$ 1.140,74", "R$ 0,00", "- R$ 0,08"]);
    expect(screen.getAllByRole("columnheader")[3].getAttribute("aria-sort")).toBe("descending");
  });

  it("cabeçalho fixo; caixa e Nome fixos na rolagem lateral sem esconder colunas", () => {
    render(<Montar />);
    const tabela = screen.getByRole("table");
    expect(tabela.parentElement?.className).toContain("overflow-auto");
    expect(tabela.className).toContain("min-w-240");
    for (const th of screen.getAllByRole("columnheader")) expect(th.className).toContain("top-0");
    const [caixa, nome] = within(corpo()[0]).getAllByRole("cell");
    expect(caixa.className).toMatch(/sticky.*left-0|left-0.*sticky/);
    expect(nome.className).toMatch(/sticky.*left-11|left-11.*sticky/);
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });

  it("rodapé soma o que está na grade; vazia mostra o texto", () => {
    const { unmount } = render(<Montar />);
    const [, , pe] = screen.getAllByRole("rowgroup");
    expect(within(pe).getAllByRole("cell").map((c) => sem(c.textContent))).toEqual([
      TEXTOS_PAINEL.total,
      "",
      "R$ 1.140,66",
      "",
    ]);
    unmount();
    render(<Montar linhas={[]} />);
    expect(screen.getByText(TEXTOS_PAINEL.sem_lancamentos)).toBeTruthy();
  });

  it("tocar na person-tag filtra por aquele Responsável", async () => {
    const aoFiltrar = vi.fn();
    render(<Montar aoFiltrar={aoFiltrar} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Filtrar por Casal" }));
    expect(aoFiltrar).toHaveBeenCalledWith("r-casal");
  });
});
