// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { conferir } from "@/domain/conferencia";
import { COLUNAS_GRADE, TEXTOS_CONFERENCIA, TEXTOS_PAINEL } from "@/domain/mensagens";
import { ORDEM_PADRAO, alternarOrdem, type LancamentoGrade, type Ordem } from "@/domain/painel";
import type { Conferencia } from "@/domain/conferencia";
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
  final_cartao: "5061",
  fatura_id: "f10",
  duvida_extracao: false,
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

function Montar({
  linhas = LINHAS,
  aoFiltrar = () => {},
  conferencia = null,
  verificando = false,
}: {
  linhas?: LancamentoGrade[];
  aoFiltrar?: (id: string | null) => void;
  conferencia?: Conferencia | null;
  verificando?: boolean;
}) {
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
      conferencia={conferencia}
      verificando={verificando}
    />
  );
}

function corpo() {
  const [, tbody] = screen.getAllByRole("rowgroup");
  return within(tbody).getAllByRole("row");
}

/** O texto visível de cada célula (na do Nome, sem o resumo oculto). */
const celulas = (linha: HTMLElement) =>
  within(linha)
    .getAllByRole("cell")
    .map((c) => sem((c.querySelector("[data-nome]") ?? c).textContent));

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

  it("VoiceOver: a célula do Nome leva o resumo oculto da linha; o Nome visível fica aria-hidden", () => {
    render(<Montar />);
    const [a] = corpo();
    const nome = within(a).getAllByRole("cell")[1];
    const resumo = nome.querySelector(".sr-only");
    expect(sem(resumo?.textContent)).toBe(sem(a.getAttribute("aria-label")));
    expect(nome.querySelector("[data-nome]")?.getAttribute("aria-hidden")).toBe("true");
  });

  describe("marca verificar", () => {
    // Cartão 8673 com R$ 720,00 a menos; 5061 bate.
    const linhas = [
      lanc("p", { ordem_fatura: 1, nome: "PADARIA", final_cartao: "5061", valor_centavos: 1000 }),
      lanc("b", { ordem_fatura: 2, nome: "BELLA PIETRA", final_cartao: "8673", valor_centavos: 8000 }),
      lanc("d", { ordem_fatura: 3, nome: "DUVIDA", final_cartao: "8673", valor_centavos: 500, duvida_extracao: true }),
    ];
    const conferencia = conferir(
      { id: "f10", total_despesas_centavos: 81500, total_creditos_centavos: 0 },
      [
        { fatura_id: "f10", final: "5061", total_centavos: 1000 },
        { fatura_id: "f10", final: "8673", total_centavos: 80500 },
      ],
      linhas.map((l) => ({ ...l, excluido_em: null })),
    );

    it("bolinha verify antes do Nome e 'verificar este lançamento' no fim do nome acessível", () => {
      render(<Montar linhas={linhas} conferencia={conferencia} />);
      const [p, b, d] = corpo();
      expect(p.querySelector(".bg-verify")).toBeNull();
      expect(sem(p.getAttribute("aria-label"))).toBe("PADARIA, R$ 10,00, Sem responsável");
      for (const linha of [b, d]) {
        const bolinha = within(linha).getAllByRole("cell")[1].querySelector(".bg-verify");
        expect(bolinha?.className).toContain("size-2");
        expect(bolinha?.closest("[data-nome]")).toBeTruthy();
        expect(linha.getAttribute("aria-label")?.endsWith(`, ${TEXTOS_CONFERENCIA.verificar_lancamento}`)).toBe(true);
      }
      expect(sem(within(b).getAllByRole("cell")[1].querySelector(".sr-only")?.textContent)).toBe(
        `BELLA PIETRA, R$ 80,00, Sem responsável, ${TEXTOS_CONFERENCIA.verificar_lancamento}`,
      );
    });

    it("duvida_extracao sozinho não marca", () => {
      const conferido = conferir(
        { id: "f10", total_despesas_centavos: 9500, total_creditos_centavos: 0 },
        [
          { fatura_id: "f10", final: "5061", total_centavos: 1000 },
          { fatura_id: "f10", final: "8673", total_centavos: 8500 },
        ],
        linhas.map((l) => ({ ...l, excluido_em: null })),
      );
      render(<Montar linhas={linhas} conferencia={conferido} />);
      expect(document.querySelector(".bg-verify")).toBeNull();
    });

    it("verificando na ordem padrão: dúvidas primeiro; ordenar por coluna vale a coluna", async () => {
      render(<Montar linhas={linhas.slice(1)} conferencia={conferencia} verificando />);
      expect(corpo().map((l) => celulas(l)[1])).toEqual(["DUVIDA", "BELLA PIETRA"]);
      await userEvent.setup().click(screen.getByRole("button", { name: "Nome" }));
      expect(corpo().map((l) => celulas(l)[1])).toEqual(["BELLA PIETRA", "DUVIDA"]);
    });
  });
});
