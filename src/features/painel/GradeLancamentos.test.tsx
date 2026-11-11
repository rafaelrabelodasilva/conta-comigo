// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { conferir } from "@/domain/conferencia";
import { TEXTOS_FILTROS, COLUNAS_GRADE, TEXTOS_CONFERENCIA, TEXTOS_LANCAMENTO, TEXTOS_PAINEL } from "@/domain/mensagens";
import { ORDEM_PADRAO, alternarOrdem, type LancamentoGrade, type Ordem } from "@/domain/painel";
import { alternarSelecao, alternarTodos } from "@/domain/lancamento";
import type { Conferencia } from "@/domain/conferencia";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const cadastros: CadastrosGrade = {
  tipos: new Map([["t-viagem", "Viagem"]]),
  responsaveis: new Map([
    ["r-casal", { nome: "Casal", cor: 2 }],
    ["r-rafael", { nome: "Rafael", cor: 1 }],
  ]),
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
  escolhidos = [],
  aoLimparFiltros,
  vazio = TEXTOS_PAINEL.sem_lancamentos,
}: {
  linhas?: LancamentoGrade[];
  aoFiltrar?: (id: string | null) => void;
  escolhidos?: (string | null)[];
  aoLimparFiltros?: () => void;
  vazio?: string;
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
      escolhidos={escolhidos}
      aoLimparFiltros={aoLimparFiltros}
      aoFiltrar={aoFiltrar}
      vazio={vazio}
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
    expect(celulas(a)).toEqual(["", "MSC CRUZEIROS", "02/12", "R$ 1.140,74", "Viagem", "Casal", "Fatura", "Não pago", "⋯"]);
    expect(celulas(b)).toEqual(["", "MSC CRUZEIROS", "", "- R$ 0,08", "—", "—", "Manual", "Pago", "⋯"]);
    // Apelido em negrito e o Nome em cinza; R$ 0,00 aparece normalmente.
    expect(celulas(z)).toEqual(["", "Lava e seca · MAGALU MAGALU", "", "R$ 0,00", "—", "—", "Fatura", "—", "⋯"]);
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
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
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

  it("person-tag com aria-pressed quando o Responsável está entre os escolhidos", () => {
    render(<Montar linhas={[...LINHAS, lanc("rafa", { responsavel_id: "r-rafael" })]} escolhidos={["r-casal"]} />);
    const casal = screen.getAllByRole("button", { name: "Filtrar por Casal" });
    expect(casal.length).toBeGreaterThan(0);
    for (const tag of casal) expect(tag.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Filtrar por Rafael" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("vazio pelos filtros: o texto e o botão Limpar filtros", async () => {
    const aoLimparFiltros = vi.fn();
    render(<Montar linhas={[]} aoLimparFiltros={aoLimparFiltros} vazio={TEXTOS_FILTROS.sem_resultado} />);
    expect(screen.getByText(TEXTOS_FILTROS.sem_resultado)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros }));
    expect(aoLimparFiltros).toHaveBeenCalled();
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

describe("painel do Lançamento e seleção (História 2.7)", () => {
  function MontarSelecao({
    aoAbrir = () => {},
    aoExcluir = () => {},
    aoFiltrar = () => {},
    abertoId = null,
    linhaFixa = null,
    linhas = LINHAS,
  }: {
    aoAbrir?: (id: string) => void;
    aoExcluir?: (id: string) => void;
    aoFiltrar?: (id: string | null) => void;
    abertoId?: string | null;
    linhaFixa?: LancamentoGrade | null;
    linhas?: LancamentoGrade[];
  }) {
    const [selecao, setSelecao] = useState<ReadonlySet<string>>(new Set());
    return (
      <GradeLancamentos
        linhas={linhas}
        cadastros={cadastros}
        ordem={ORDEM_PADRAO}
        aoOrdenar={() => {}}
        escolhidos={[]}
        aoFiltrar={aoFiltrar}
        vazio=""
        selecao={selecao}
        aoSelecionar={(id) => setSelecao((s) => alternarSelecao(s, id))}
        aoSelecionarTodos={() => setSelecao((s) => alternarTodos(s, linhas.map((l) => l.id)))}
        abertoId={abertoId}
        aoAbrir={aoAbrir}
        aoExcluir={aoExcluir}
        linhaFixa={linhaFixa}
      />
    );
  }

  it("tocar no corpo da linha abre o painel; a caixa só seleciona; a person-tag só filtra", async () => {
    const aoAbrir = vi.fn();
    const aoFiltrar = vi.fn();
    render(<MontarSelecao aoAbrir={aoAbrir} aoFiltrar={aoFiltrar} />);
    const u = userEvent.setup();
    const [a] = corpo();
    await u.click(within(a).getAllByRole("cell")[3]);
    expect(aoAbrir).toHaveBeenLastCalledWith("a");

    aoAbrir.mockClear();
    const caixa = within(a).getByRole("checkbox", { name: "Selecionar MSC CRUZEIROS" });
    await u.click(caixa);
    expect((caixa as HTMLInputElement).checked).toBe(true);
    expect(aoAbrir).not.toHaveBeenCalled();
    expect(a.className).toContain("bg-selection");
    // O nome acessível da linha fica como na 2.5 (a caixa diz se está marcada).
    expect(a.getAttribute("aria-selected")).toBeNull();

    await u.click(within(a).getByRole("button", { name: "Filtrar por Casal" }));
    expect(aoFiltrar).toHaveBeenCalledWith("r-casal");
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it("o corpo é um botão com o nome da linha (VoiceOver); Enter abre", async () => {
    const aoAbrir = vi.fn();
    render(<MontarSelecao aoAbrir={aoAbrir} />);
    const [a] = corpo();
    const botao = within(a).getByRole("button", { name: a.getAttribute("aria-label")! });
    expect(botao.hasAttribute("data-corpo")).toBe(true);
    botao.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(aoAbrir).toHaveBeenCalledWith("a");
  });

  it("⋯ abre o menu Abrir / Excluir", async () => {
    const aoAbrir = vi.fn();
    const aoExcluir = vi.fn();
    render(<MontarSelecao aoAbrir={aoAbrir} aoExcluir={aoExcluir} />);
    const u = userEvent.setup();
    await u.click(within(corpo()[0]).getByRole("button", { name: "Ações de MSC CRUZEIROS" }));
    await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
    expect(aoExcluir).toHaveBeenCalledWith("a");
    expect(aoAbrir).not.toHaveBeenCalled();
    await u.click(within(corpo()[0]).getByRole("button", { name: "Ações de MSC CRUZEIROS" }));
    await u.click(screen.getByRole("menuitem", { name: "Abrir" }));
    expect(aoAbrir).toHaveBeenCalledWith("a");
  });

  it("clique direito (ou toque longo) no corpo abre o menu Abrir / Excluir sem abrir o painel", () => {
    const aoAbrir = vi.fn();
    render(<MontarSelecao aoAbrir={aoAbrir} />);
    fireEvent.contextMenu(within(corpo()[0]).getAllByRole("cell")[3]);
    expect(screen.getByRole("menuitem", { name: "Abrir" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Excluir" })).toBeTruthy();
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it("caixa do cabeçalho: Selecionar todos, parcial e desmarcar", async () => {
    render(<MontarSelecao />);
    const u = userEvent.setup();
    const todos = screen.getByRole("checkbox", { name: "Selecionar todos" }) as HTMLInputElement;
    await u.click(within(corpo()[0]).getByRole("checkbox"));
    expect(todos.indeterminate).toBe(true);
    expect(todos.checked).toBe(false);
    await u.click(todos);
    expect(todos.checked).toBe(true);
    expect(todos.indeterminate).toBe(false);
    expect(corpo().every((l) => (within(l).getByRole("checkbox") as HTMLInputElement).checked)).toBe(true);
    await u.click(todos);
    expect(corpo().some((l) => (within(l).getByRole("checkbox") as HTMLInputElement).checked)).toBe(false);
  });

  it("linha aberta: borda accent-line à esquerda, sem o fundo de seleção", () => {
    render(<MontarSelecao abertoId="a" />);
    const [a, b] = corpo();
    expect(a.getAttribute("data-aberta")).toBe("true");
    expect(within(a).getAllByRole("cell")[0].className).toContain("--color-accent-line");
    expect(a.className).not.toContain("bg-selection");
    expect(b.getAttribute("data-aberta")).toBeNull();
  });

  it("linha fixa (aberta, fora do filtro) aparece, mas fica fora do total", () => {
    const fixa = lanc("x", { ordem_fatura: 9, nome: "FORA DO FILTRO", valor_centavos: 99900 });
    render(<MontarSelecao linhas={LINHAS} linhaFixa={fixa} abertoId="x" />);
    expect(corpo().map((l) => celulas(l)[1])).toContain("FORA DO FILTRO");
    const [, , pe] = screen.getAllByRole("rowgroup");
    expect(sem(within(pe).getAllByRole("cell")[2].textContent)).toBe("R$ 1.140,66");
  });
});

describe("Ajustes de centavos (História 2.8)", () => {
  const mae = lanc("msc", {
    ordem_fatura: 1,
    nome: "MSC CRUZEIROS",
    parcela_n: 2,
    parcela_total: 12,
    valor_centavos: 114074,
    responsavel_id: "r-casal",
    status_id: "s-nao",
  });
  const ajuste = lanc("aj", {
    ordem_fatura: 3,
    nome: "MSC CRUZEIROS",
    valor_centavos: -8,
    responsavel_id: "r-casal",
    status_id: "s-nao",
    ajuste_de_id: "msc",
  });
  const padaria = lanc("pad", { ordem_fatura: 2, nome: "PADARIA", valor_centavos: 50 });

  function MontarComAjuste({ selecao = new Set<string>() }: { selecao?: ReadonlySet<string> }) {
    const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
    return (
      <GradeLancamentos
        linhas={[mae, padaria]}
        ajustesPorMae={new Map([["msc", [ajuste]]])}
        cadastros={cadastros}
        ordem={ordem}
        aoOrdenar={(c) => setOrdem((o) => alternarOrdem(o, c))}
        escolhidos={[]}
        aoFiltrar={() => {}}
        vazio=""
        selecao={selecao}
      />
    );
  }

  const linhasDaGrade = () => {
    const [, corpo] = screen.getAllByRole("rowgroup");
    return within(corpo).getAllByRole("row");
  };

  it("logo abaixo da mãe, em qualquer ordenação; recuo, ↳, líquido em text-muted e '- R$ 0,08' no Valor", () => {
    render(<MontarComAjuste />);
    const ids = () => linhasDaGrade().map((r) => (r.dataset.ajuste ? "aj" : r.getAttribute("aria-label")!.split(",")[0]));
    expect(ids()).toEqual(["MSC CRUZEIROS", "aj", "PADARIA"]);
    // Valor crescente: a padaria vem antes da mãe, e o Ajuste continua sob ela.
    fireEvent.click(screen.getByRole("button", { name: COLUNAS_GRADE.valor }));
    expect(ids()).toEqual(["PADARIA", "MSC CRUZEIROS", "aj"]);
    fireEvent.click(screen.getByRole("button", { name: COLUNAS_GRADE.valor }));
    expect(ids()).toEqual(["MSC CRUZEIROS", "aj", "PADARIA"]);

    const linha = linhasDaGrade().find((r) => r.dataset.ajuste)!;
    const celulas = within(linha).getAllByRole("cell");
    expect(celulas[0].querySelector("input")).toBeNull();
    const nome = celulas[1].querySelector("[data-nome]")!;
    expect(sem(nome.textContent)).toBe("↳MSC CRUZEIROS");
    expect(nome.parentElement!.className).toContain("pl-4");
    const liquido = celulas[1].querySelector("[data-liquido]")!;
    expect(sem(liquido.textContent)).toBe("R$ 1.140,74 - R$ 0,08 = R$ 1.140,66");
    expect(liquido.className).toContain("text-text-muted");
    expect(sem(celulas[3].textContent)).toBe("- R$ 0,08");
    // O ⋯ do Ajuste tem nome próprio (não o da mãe).
    expect(within(linha).getByRole("button", { name: "Ações de Ajuste de MSC CRUZEIROS" })).toBeTruthy();
    expect(sem(linha.getAttribute("aria-label"))).toBe("Ajuste de MSC CRUZEIROS, - R$ 0,08, líquido R$ 1.140,66, Casal, Não pago");
  });

  it("sem caixa própria: fundo selection quando a mãe está selecionada; Selecionar todos conta só as mães", () => {
    render(<MontarComAjuste selecao={new Set(["msc"])} />);
    const linha = linhasDaGrade().find((r) => r.dataset.ajuste)!;
    expect(linha.className).toContain("bg-selection");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    const todos = screen.getByRole("checkbox", { name: TEXTOS_LANCAMENTO.selecionar_todos }) as HTMLInputElement;
    expect(todos.indeterminate).toBe(true);
  });

  it("rodapé: soma as linhas visíveis, o Ajuste incluído (fecha no líquido)", () => {
    render(<MontarComAjuste />);
    const [, , pe] = screen.getAllByRole("rowgroup");
    expect(within(pe).getAllByRole("cell").map((c) => sem(c.textContent))).toContain("R$ 1.141,16");
  });
});

describe("previstos (História 3.5)", () => {
  const PREVISTO = lanc("p", {
    nome: "MAGALU",
    parcela_n: 6,
    parcela_total: 10,
    valor_centavos: 44589,
    lancado_por: "sistema",
    fatura_id: null,
    final_cartao: null,
    ordem_fatura: null,
  });

  it("o previsto leva o selo 'Previsto' junto do Nome, com o texto mais claro; a linha da fatura não", () => {
    render(<Montar linhas={[...LINHAS, PREVISTO]} />);
    const linhas = corpo();
    const previsto = linhas.find((l) => within(l).queryByText("MAGALU"))!;
    expect(previsto.querySelector("[data-previsto]")?.textContent).toBe("Previsto");
    expect(within(previsto).getByText("MAGALU").className).toContain("text-text-muted");
    expect(celulas(previsto)).toContain("MAGALUPrevisto");
    const daFatura = linhas.find((l) => within(l).queryAllByText("MSC CRUZEIROS").length > 0)!;
    expect(daFatura.querySelector("[data-previsto]")).toBeNull();
  });

  it("o nome acessível diz 'previsto' depois do Nome", () => {
    render(<Montar linhas={[PREVISTO]} />);
    const [linha] = corpo();
    expect(sem(linha.getAttribute("aria-label"))).toBe("MAGALU, previsto, R$ 445,89, parcela 6 de 10, Sem responsável");
  });

  it("os previstos ficam no fim na ordem da fatura (sem ordem_fatura)", () => {
    render(<Montar linhas={[PREVISTO, ...LINHAS]} />);
    expect(corpo().map((l) => celulas(l)[1])).toEqual(["MSC CRUZEIROS", "MSC CRUZEIROS", "Lava e seca · MAGALU MAGALU", "MAGALUPrevisto"]);
  });
});

describe("Divisão (História 3.8)", () => {
  const divisao = {
    modo: "proporcao",
    partes: [
      { responsavel_id: "r-casal", numerador: 2, denominador: 3, filha_id: "f1" },
      { responsavel_id: "r-rafael", numerador: 1, denominador: 3, filha_id: "f2" },
    ],
  };
  const mae = lanc("jim", { ordem_fatura: 1, nome: "JIM COM", valor_centavos: 46600, tipo_id: "t-viagem", divisao, status_id: "s-nao" });
  const f1 = lanc("f1", { ordem_fatura: 1, nome: "JIM COM", valor_centavos: 31067, tipo_id: "t-viagem", responsavel_id: "r-casal", status_id: "s-pago", dividido_de_id: "jim" });
  const f2 = lanc("f2", { ordem_fatura: 1, nome: "JIM COM", valor_centavos: 15533, tipo_id: "t-viagem", responsavel_id: "r-rafael", status_id: "s-nao", dividido_de_id: "jim" });
  const padaria = lanc("pad", { ordem_fatura: 2, nome: "PADARIA", valor_centavos: 500 });

  function MontarComDivisao({
    linhas = [f2, padaria, f1],
    aoDividir,
    selecao = new Set<string>(),
  }: {
    linhas?: LancamentoGrade[];
    aoDividir?: (id: string) => void;
    selecao?: ReadonlySet<string>;
  }) {
    const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
    return (
      <GradeLancamentos
        linhas={linhas}
        maesDivididas={new Map([["jim", mae]])}
        aoDividir={aoDividir}
        cadastros={cadastros}
        ordem={ordem}
        aoOrdenar={(c) => setOrdem((o) => alternarOrdem(o, c))}
        escolhidos={[]}
        aoFiltrar={() => {}}
        vazio=""
        selecao={selecao}
      />
    );
  }

  const linhasDaGrade = () => {
    const [, corpo] = screen.getAllByRole("rowgroup");
    return within(corpo).getAllByRole("row");
  };
  const papeis = () => linhasDaGrade().map((r) => r.dataset.papel ?? "linha");

  it("a mãe vira cabeçalho antes das partes (na ordem das partes), sem caixa, com 'Dividido' e o Valor apagado", () => {
    render(<MontarComDivisao />);
    expect(papeis()).toEqual(["cabecalho", "parte", "parte", "linha"]);
    const [cab, p1, p2] = linhasDaGrade();
    const celulasCab = within(cab).getAllByRole("cell");
    expect(celulasCab[0].querySelector("input")).toBeNull();
    expect(sem(celulasCab[3].textContent)).toBe("R$ 466,00");
    expect(celulasCab[3].className).toContain("text-text-muted");
    expect(sem(celulasCab[5].textContent)).toBe("Dividido");
    expect(sem(cab.getAttribute("aria-label"))).toBe("JIM COM, dividido, R$ 466,00");
    // As partes: caixa própria, "↳" e recuo, Responsável e Status delas.
    expect(within(p1).getAllByRole("cell")[0].querySelector("input")).not.toBeNull();
    const nome = within(p1).getAllByRole("cell")[1].querySelector("[data-nome]")!;
    expect(sem(nome.textContent)).toBe("↳JIM COM");
    expect(nome.className).toContain("pl-4");
    expect(sem(within(p1).getAllByRole("cell")[3].textContent)).toBe("R$ 310,67");
    expect(sem(within(p1).getAllByRole("cell")[5].textContent)).toBe("Casal");
    expect(sem(within(p2).getAllByRole("cell")[5].textContent)).toBe("Rafael");
    expect(sem(p1.getAttribute("aria-label"))).toBe("Parte de JIM COM, R$ 310,67, Casal, Pago");
  });

  it("o rodapé soma as partes e não a mãe: R$ 310,67 + R$ 155,33 + R$ 5,00 = R$ 471,00", () => {
    render(<MontarComDivisao />);
    const [, , pe] = screen.getAllByRole("rowgroup");
    expect(within(pe).getAllByRole("cell").map((c) => sem(c.textContent))).toContain("R$ 471,00");
  });

  it("filtrada por Responsável, só a parte que passou vem, sob a mãe", () => {
    render(<MontarComDivisao linhas={[f2]} />);
    expect(papeis()).toEqual(["cabecalho", "parte"]);
    expect(sem(within(linhasDaGrade()[1]).getAllByRole("cell")[3].textContent)).toBe("R$ 155,33");
  });

  it("sem nenhuma parte nos filtros, a mãe não aparece", () => {
    render(<MontarComDivisao linhas={[padaria]} />);
    expect(papeis()).toEqual(["linha"]);
  });

  it("ordenada por Valor, as partes continuam juntas sob a mãe", () => {
    render(<MontarComDivisao />);
    fireEvent.click(screen.getByRole("button", { name: COLUNAS_GRADE.valor }));
    expect(linhasDaGrade().map((r) => r.getAttribute("aria-label")!.split(",")[0])).toEqual(["PADARIA", "JIM COM", "Parte de JIM COM", "Parte de JIM COM"]);
  });

  it("o cabeçalho conta fora do 'Selecionar todos': só as partes e as linhas têm caixa", () => {
    render(<MontarComDivisao />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("menu ⋯: a mãe tem 'Editar divisão'; a parte não tem Excluir; a linha comum tem 'Dividir'", async () => {
    const u = userEvent.setup();
    const aoDividir = vi.fn();
    render(<MontarComDivisao aoDividir={aoDividir} />);
    const [cab, p1, , pad] = linhasDaGrade();
    await u.click(within(cab).getByRole("button", { name: /Ações de/ }));
    await u.click(screen.getByRole("menuitem", { name: "Editar divisão" }));
    expect(aoDividir).toHaveBeenCalledWith("jim");
    await u.click(within(p1).getByRole("button", { name: /Ações de/ }));
    expect(screen.queryByRole("menuitem", { name: TEXTOS_LANCAMENTO.excluir })).toBeNull();
    expect(screen.getByRole("menuitem", { name: TEXTOS_LANCAMENTO.abrir })).toBeTruthy();
    await u.keyboard("{Escape}");
    await u.click(within(pad).getByRole("button", { name: /Ações de/ }));
    await u.click(screen.getByRole("menuitem", { name: "Dividir" }));
    expect(aoDividir).toHaveBeenCalledWith("pad");
  });
});
