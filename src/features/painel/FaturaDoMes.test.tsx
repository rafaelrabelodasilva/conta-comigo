// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEXTOS_IMPORTAR, TEXTOS_PAINEL } from "@/domain/mensagens";
import { distribuicaoPorResponsavel, type FiltroResponsavel } from "@/domain/painel";
import { FaturaDoMes, type FaturaHero } from "./FaturaDoMes";

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const outubro: FaturaHero = {
  mes: "2026-10",
  vencimento: "2026-10-06",
  saldo_anterior_centavos: 748311,
  pagamentos_centavos: 745721,
  total_a_pagar_centavos: 771367,
};

const responsaveis = new Map([
  ["r-rafael", { nome: "Rafael", cor: 1 }],
  ["r-casal", { nome: "Casal", cor: 2 }],
]);

function montar(opcoes: {
  fatura?: FaturaHero | null;
  valores?: number[];
  linhas?: { responsavel_id: string | null; valor_centavos: number }[];
  filtro?: FiltroResponsavel;
}) {
  const aoFiltrar = vi.fn();
  const aoImportar = vi.fn();
  render(
    <FaturaDoMes
      mes="2026-10"
      fatura={opcoes.fatura === undefined ? outubro : opcoes.fatura}
      valoresDaFaturaCentavos={opcoes.valores ?? [768777]}
      distribuicao={distribuicaoPorResponsavel(opcoes.linhas ?? [], ["r-rafael", "r-casal"])}
      responsaveis={responsaveis}
      filtro={opcoes.filtro}
      aoFiltrar={aoFiltrar}
      aoImportar={aoImportar}
    />,
  );
  return { aoFiltrar, aoImportar, u: userEvent.setup() };
}

describe("FaturaDoMes (invoice-hero)", () => {
  it("sobrelinha, total a pagar em hero-value e a conta da 2.3 que bate", () => {
    montar({});
    const sobrelinha = screen.getByText("Fatura de outubro · vence 06/10/26");
    expect(sobrelinha.className).toContain("texto-eyebrow");
    const valor = document.querySelector(".texto-hero-value");
    expect(sem(valor?.textContent)).toBe("Total a pagar R$ 7.713,67");
    expect(
      screen.getByText(
        (_, e) =>
          e?.tagName === "P" &&
          sem(e.textContent) === "Lançamentos R$ 7.687,77 + saldo anterior R$ 7.483,11 − pagamentos R$ 7.457,21 = R$ 7.713,67",
      ),
    ).toBeTruthy();
    expect(screen.getByText("✓ Bate com o total a pagar").className).toContain("text-accent");
  });

  it("mostra quantos Lançamentos a Fatura tem", () => {
    montar({ valores: [100, 200, -8] });
    expect(screen.getByText("3 lançamentos")).toBeTruthy();
  });

  it("sem o total a pagar lido: 'Total a pagar não lido', nunca o calculado como total", () => {
    montar({ fatura: { ...outubro, total_a_pagar_centavos: null } });
    expect(screen.getByText("Total a pagar não lido")).toBeTruthy();
    expect(document.querySelector(".texto-hero-value")).toBeNull();
    expect(screen.queryByText(/Bate com o total/)).toBeNull();
  });

  it("com diferença, mostra quanto falta para o total a pagar", () => {
    montar({ valores: [768777, -8] });
    expect(sem(screen.getByText(/Diferença/).textContent)).toBe("⚠ Diferença de R$ 0,08 para o total a pagar");
  });

  it("barra: segmentos person-N proporcionais, legenda com bolinha e nome; toque filtra", async () => {
    const { aoFiltrar, u } = montar({
      linhas: [
        { responsavel_id: "r-casal", valor_centavos: 3000 },
        { responsavel_id: "r-rafael", valor_centavos: 1000 },
        { responsavel_id: null, valor_centavos: 500 },
      ],
    });
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    const segmentos = within(barra).getAllByRole("button");
    expect(segmentos.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Filtrar por Rafael",
      "Filtrar por Casal",
      "Filtrar por Sem responsável",
    ]);
    expect(segmentos.map((s) => s.style.flexGrow)).toEqual(["1000", "3000", "500"]);
    expect(segmentos[0].className).toContain("bg-person-1");
    expect(segmentos[1].className).toContain("bg-person-2");
    expect(segmentos[2].className).toContain("bg-text-muted");
    expect(barra.className).toContain("h-2");

    await u.click(segmentos[1]);
    expect(aoFiltrar).toHaveBeenLastCalledWith("r-casal");
    await u.click(screen.getByRole("button", { name: TEXTOS_PAINEL.sem_responsavel }));
    expect(aoFiltrar).toHaveBeenLastCalledWith(null);
  });

  it("filtro ativo: o segmento e a legenda ficam marcados", () => {
    montar({ linhas: [{ responsavel_id: "r-rafael", valor_centavos: 1000 }], filtro: "r-rafael" });
    expect(screen.getByRole("button", { name: "Filtrar por Rafael" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Rafael" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sem Fatura: 'Fatura ainda não importada' e Importar fatura", async () => {
    const { aoImportar, u } = montar({ fatura: null, valores: [] });
    expect(screen.getByText("Fatura de outubro")).toBeTruthy();
    expect(screen.getByText(TEXTOS_PAINEL.sem_fatura)).toBeTruthy();
    expect(document.querySelector(".texto-hero-value")).toBeNull();
    expect(screen.queryByRole("group", { name: TEXTOS_PAINEL.distribuicao })).toBeNull();
    await u.click(screen.getByRole("button", { name: TEXTOS_IMPORTAR.botao }));
    expect(aoImportar).toHaveBeenCalledOnce();
  });
});
