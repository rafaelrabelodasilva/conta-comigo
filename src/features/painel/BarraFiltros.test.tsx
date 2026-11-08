// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  COLUNAS_DA_BARRA,
  FILTROS_VAZIOS,
  valoresDaColuna,
  type CadastrosFiltro,
  type ColunaFiltro,
  type FiltrosGrade,
  type OpcaoFiltro,
} from "@/domain/filtros-grade";
import { TEXTOS_CONFERENCIA, TEXTOS_FILTROS } from "@/domain/mensagens";
import type { LancamentoGrade } from "@/domain/painel";
import { BarraFiltros } from "./BarraFiltros";

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

const cadastros: CadastrosFiltro = {
  responsaveis: [
    { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
    { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
    { id: "r-rangel", nome: "Rangel", cor: 3, ordem: 3, arquivado: false },
  ],
  tipos: [],
  status: [],
};

const linhas = [
  lanc("a", { responsavel_id: "r-casal" }),
  lanc("b", { responsavel_id: "r-casal" }),
  lanc("c", { responsavel_id: "r-rangel", final_cartao: "8673" }),
  lanc("d"),
];

function Montar({ inicial = FILTROS_VAZIOS, comVerificar = true }: { inicial?: FiltrosGrade; comVerificar?: boolean }) {
  const [filtros, setFiltros] = useState(inicial);
  const opcoes = Object.fromEntries(
    COLUNAS_DA_BARRA.map((c) => [c, valoresDaColuna(c, linhas, filtros, null, cadastros)]),
  ) as Record<ColunaFiltro, OpcaoFiltro[]>;
  return (
    <>
      <BarraFiltros
        filtros={filtros}
        aoMudar={setFiltros}
        opcoes={opcoes}
        comVerificar={comVerificar}
        mostrarLimpar={filtros !== FILTROS_VAZIOS}
        aoLimparTudo={() => setFiltros(FILTROS_VAZIOS)}
      />
      <output data-testid="estado">{JSON.stringify(filtros)}</output>
    </>
  );
}

const estado = () => JSON.parse(screen.getByTestId("estado").textContent ?? "{}") as FiltrosGrade;
const pilula = (nome: string) => screen.getByRole("button", { name: nome, expanded: false });

describe("BarraFiltros", () => {
  it("busca filtra enquanto digita", async () => {
    render(<Montar />);
    const u = userEvent.setup();
    const busca = screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar });
    expect(busca.getAttribute("placeholder")).toBe(TEXTOS_FILTROS.buscar);
    await u.type(busca, "lav");
    expect(estado().busca).toBe("lav");
  });

  it("pílulas inativas com ▾ fora do nome acessível; popover de diálogo", () => {
    render(<Montar />);
    for (const nome of ["Responsável", "Tipo", "Status", "Lançado por", "Parcela", "Cartão"]) {
      const p = pilula(nome);
      expect(p.getAttribute("aria-haspopup")).toBe("dialog");
      expect(p.getAttribute("aria-expanded")).toBe("false");
      expect(p.textContent).toBe(`${nome}▾`);
      expect(p.className).toContain("bg-surface");
    }
    expect(screen.getByRole("button", { name: "Mais", expanded: false })).toBeTruthy();
  });

  it("popover: título, uma linha por valor com contagem, Aplicar aplica o rascunho na ordem da lista", async () => {
    render(<Montar />);
    const u = userEvent.setup();
    await u.click(pilula("Responsável"));
    const dialogo = screen.getByRole("dialog", { name: "Responsável (pode marcar vários)" });
    const caixas = within(dialogo).getAllByRole("checkbox");
    expect(caixas.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Rafael, 0 lançamentos",
      "Casal, 2 lançamentos",
      "Rangel, 1 lançamento",
      "Sem responsável, 1 lançamento",
    ]);
    expect(caixas[0].closest("label")?.className).toContain("min-h-toque");
    await u.click(caixas[2]);
    await u.click(caixas[1]);
    // Rascunho: nada aplicado ainda.
    expect(estado().colunas.responsavel).toEqual([]);
    await u.click(within(dialogo).getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(estado().colunas.responsavel).toEqual(["r-casal", "r-rangel"]);
    const ativa = screen.getByRole("button", { name: "Responsável: Casal, Rangel", expanded: false });
    expect(ativa.className).toContain("bg-selection");
    expect(ativa.className).toContain("border-accent-line");
  });

  it("fechar sem Aplicar (Esc) descarta o rascunho; Limpar zera a coluna e fecha", async () => {
    render(<Montar inicial={{ ...FILTROS_VAZIOS, colunas: { ...FILTROS_VAZIOS.colunas, responsavel: ["r-casal"] } }} />);
    const u = userEvent.setup();
    await u.click(pilula("Responsável: Casal"));
    const dialogo = screen.getByRole("dialog");
    expect((within(dialogo).getByRole("checkbox", { name: "Casal, 2 lançamentos" }) as HTMLInputElement).checked).toBe(true);
    await u.click(within(dialogo).getByRole("checkbox", { name: "Rafael, 0 lançamentos" }));
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(estado().colunas.responsavel).toEqual(["r-casal"]);

    // Reabre com o aplicado, não com o rascunho descartado.
    await u.click(pilula("Responsável: Casal"));
    expect((screen.getByRole("checkbox", { name: "Rafael, 0 lançamentos" }) as HTMLInputElement).checked).toBe(false);
    await u.click(screen.getByRole("button", { name: TEXTOS_FILTROS.limpar }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(estado().colunas.responsavel).toEqual([]);
  });

  it("coluna sem nenhum valor: uma linha em cinza no lugar da lista", async () => {
    const opcoes = Object.fromEntries(COLUNAS_DA_BARRA.map((c) => [c, []])) as unknown as Record<ColunaFiltro, OpcaoFiltro[]>;
    render(
      <BarraFiltros filtros={FILTROS_VAZIOS} aoMudar={vi.fn()} opcoes={opcoes} comVerificar mostrarLimpar={false} aoLimparTudo={vi.fn()} />,
    );
    await userEvent.setup().click(pilula("Cartão"));
    const dialogo = screen.getByRole("dialog", { name: "Cartão (pode marcar vários)" });
    expect(within(dialogo).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialogo).getByText(TEXTOS_FILTROS.sem_opcoes).className).toContain("text-text-muted");
  });

  it("busca: teclado do iPad sem correção nem maiúscula", () => {
    render(<Montar />);
    const b = screen.getByRole("searchbox", { name: TEXTOS_FILTROS.buscar });
    expect(b.getAttribute("autocorrect")).toBe("off");
    expect(b.getAttribute("autocapitalize")).toBe("none");
    expect(b.getAttribute("spellcheck")).toBe("false");
    expect(b.getAttribute("enterkeyhint")).toBe("search");
  });

  it("pílula ativa longa: texto cortado na tela, nome acessível inteiro", () => {
    render(<Montar inicial={{ ...FILTROS_VAZIOS, colunas: { ...FILTROS_VAZIOS.colunas, responsavel: ["r-rafael", "r-casal", "r-rangel"] } }} />);
    const p = pilula("Responsável: Rafael, Casal, Rangel");
    expect(p.querySelector(".truncate")?.className).toContain("max-w-56");
  });

  it("tocar fora fecha sem aplicar", async () => {
    render(<Montar />);
    const u = userEvent.setup();
    await u.click(pilula("Cartão"));
    await u.click(screen.getByRole("checkbox", { name: "Cartão final 8673, 1 lançamento" }));
    await u.click(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(estado().colunas.cartao).toEqual([]);
  });

  it("Verificar: pílula com aria-pressed e ✕ ligada; sem Fatura, sem pílula", async () => {
    const { unmount } = render(<Montar />);
    const u = userEvent.setup();
    const v = screen.getByRole("button", { name: TEXTOS_CONFERENCIA.verificar });
    expect(v.getAttribute("aria-pressed")).toBe("false");
    await u.click(v);
    expect(v.getAttribute("aria-pressed")).toBe("true");
    expect(v.textContent).toBe("Verificar✕");
    expect(estado().verificar).toBe(true);
    unmount();
    render(<Montar comVerificar={false} />);
    expect(screen.queryByRole("button", { name: TEXTOS_CONFERENCIA.verificar })).toBeNull();
  });

  it("Mais: guarda Lançado por, Parcela, cartão e Verificar e diz quantos filtros ativos guarda", async () => {
    render(
      <Montar
        inicial={{ ...FILTROS_VAZIOS, verificar: true, colunas: { ...FILTROS_VAZIOS.colunas, cartao: ["8673"] } }}
      />,
    );
    const u = userEvent.setup();
    const mais = screen.getByRole("button", { name: "Mais (2)", expanded: false });
    expect(mais.className).toContain("lg:hidden");
    expect(mais.getAttribute("aria-haspopup")).toBe("dialog");
    await u.click(mais);
    const dialogo = screen.getByRole("dialog", { name: TEXTOS_FILTROS.mais });
    expect(within(dialogo).getByRole("button", { name: "Lançado por" })).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Parcela" })).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Cartão: 8673" })).toBeTruthy();
    // Pílula dentro do Mais abre o próprio popover.
    // A contagem já leva o cartão 8673 escolhido (só "c").
    await u.click(within(dialogo).getByRole("button", { name: "Parcela" }));
    const parcela = screen.getByRole("dialog", { name: "Parcela (pode marcar vários)" });
    await u.click(within(parcela).getByRole("checkbox", { name: "À vista, 1 lançamento" }));
    await u.click(within(parcela).getByRole("button", { name: TEXTOS_FILTROS.aplicar }));
    expect(estado().colunas.parcela).toEqual(["a_vista"]);
    expect(screen.getByRole("button", { name: "Mais (3)" })).toBeTruthy();
  });

  it("Limpar filtros só quando pedido, e zera tudo", async () => {
    const aoLimpar = vi.fn();
    const opcoes = Object.fromEntries(COLUNAS_DA_BARRA.map((c) => [c, []])) as unknown as Record<ColunaFiltro, OpcaoFiltro[]>;
    const { rerender } = render(
      <BarraFiltros
        filtros={FILTROS_VAZIOS}
        aoMudar={vi.fn()}
        opcoes={opcoes}
        comVerificar
        mostrarLimpar={false}
        aoLimparTudo={aoLimpar}
      />,
    );
    expect(screen.queryByRole("button", { name: TEXTOS_FILTROS.limpar_filtros })).toBeNull();
    rerender(
      <BarraFiltros filtros={FILTROS_VAZIOS} aoMudar={vi.fn()} opcoes={opcoes} comVerificar mostrarLimpar aoLimparTudo={aoLimpar} />,
    );
    const limpar = screen.getByRole("button", { name: TEXTOS_FILTROS.limpar_filtros });
    expect(limpar.className).toContain("ml-auto");
    await userEvent.setup().click(limpar);
    expect(aoLimpar).toHaveBeenCalled();
  });
});
