// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { conferir, type Conferencia } from "@/domain/conferencia";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_CONFERENCIA, TEXTOS_IMPORTAR, TEXTOS_PAINEL } from "@/domain/mensagens";
import type { ValorFiltro } from "@/domain/filtros-grade";
import { distribuicaoPorResponsavel } from "@/domain/painel";
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
  escolhidos?: ValorFiltro[];
  conferencia?: Conferencia | null;
  historico?: { totalCentavos: number; quantidade: number } | null;
}) {
  const aoFiltrar = vi.fn();
  const aoImportar = vi.fn();
  const aoVerificar = vi.fn();
  render(
    <FaturaDoMes
      mes="2026-10"
      fatura={opcoes.fatura === undefined ? outubro : opcoes.fatura}
      valoresDaFaturaCentavos={opcoes.valores ?? [768777]}
      distribuicao={distribuicaoPorResponsavel(opcoes.linhas ?? [], ["r-rafael", "r-casal"])}
      responsaveis={responsaveis}
      escolhidos={opcoes.escolhidos ?? []}
      aoFiltrar={aoFiltrar}
      aoImportar={aoImportar}
      conferencia={opcoes.conferencia}
      aoVerificar={aoVerificar}
      historico={opcoes.historico}
    />,
  );
  return { aoFiltrar, aoImportar, aoVerificar, u: userEvent.setup() };
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
    montar({ linhas: [{ responsavel_id: "r-rafael", valor_centavos: 1000 }], escolhidos: ["r-rafael"] });
    expect(screen.getByRole("button", { name: "Filtrar por Rafael" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Rafael" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("vários escolhidos na coluna: todos marcados; os segmentos fora da escolha se apagam", () => {
    montar({
      linhas: [
        { responsavel_id: "r-rafael", valor_centavos: 1000 },
        { responsavel_id: "r-casal", valor_centavos: 2000 },
        { responsavel_id: null, valor_centavos: 500 },
      ],
      escolhidos: ["r-rafael", null],
    });
    const barra = screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao });
    const [rafael, casal, semResp] = within(barra).getAllByRole("button");
    expect([rafael, casal, semResp].map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
    expect(rafael.className).not.toContain("opacity-40");
    expect(casal.className).toContain("opacity-40");
    expect(semResp.className).not.toContain("opacity-40");
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

  describe("selo da Conferência (História 2.5)", () => {
    const fatura = { id: "f10", total_despesas_centavos: 90_000, total_creditos_centavos: 0 };
    const cartoes = [{ fatura_id: "f10", final: "8673", total_centavos: 90_000 }];
    const linha = (valor: number) => ({ fatura_id: "f10", valor_centavos: valor, final_cartao: "8673", excluido_em: null });

    it("'✓ Conferido · N lançamentos' em text-accent; a conta e o Bate ficam embaixo, menores", () => {
      montar({ conferencia: conferir(fatura, cartoes, [linha(90_000)]) });
      const selo = screen.getByText(TEXTOS_CONFERENCIA.conferido);
      expect(selo.className).toContain("text-accent");
      expect(selo.tagName).toBe("SPAN");
      expect(sem(selo.parentElement?.textContent)).toBe("✓ Conferido·1 lançamento");
      const bate = screen.getByText("✓ Bate com o total a pagar");
      expect(bate.className).toContain("texto-caption");
      expect(screen.getByText(/^Lançamentos /).className).toContain("texto-caption");
    });

    it("'⚠ Diferença de R$ X' é um botão âmbar que liga o filtro Verificar", async () => {
      const { aoVerificar, u } = montar({ conferencia: conferir(fatura, cartoes, [linha(18_000)]) });
      const selo = screen.getByRole("button", {
        name: `Diferença de ${formatarDinheiro(72_000)}, ver lançamentos para verificar`,
      });
      expect(selo.className).toContain("bg-alert-warning-bg");
      expect(selo.className).toContain("rounded-full");
      await u.click(selo);
      expect(aoVerificar).toHaveBeenCalledOnce();
    });

    it("sem Conferência, sem selo", () => {
      montar({});
      expect(screen.queryByText(/Conferido/)).toBeNull();
    });
  });
});

describe("FaturaDoMes: Mês só com histórico da planilha (História 3.10)", () => {
  it("sem Fatura e com histórico: sobrelinha 'Histórico de …', total em hero-value, contagem, barra e sem selo nem 'Importar fatura'", () => {
    montar({
      fatura: null,
      historico: { totalCentavos: 928023, quantidade: 52 },
      linhas: [{ responsavel_id: "r-rafael", valor_centavos: 229074 }, { responsavel_id: "r-casal", valor_centavos: 563935 }],
    });
    expect(screen.getByText("Histórico de outubro").className).toContain("texto-eyebrow");
    expect(sem(document.querySelector(".texto-hero-value")?.textContent)).toBe("Total do histórico R$ 9.280,23");
    expect(screen.getByText(/52 lançamentos · Importado da planilha/)).toBeTruthy();
    expect(screen.getByRole("group", { name: TEXTOS_PAINEL.distribuicao })).toBeTruthy();
    expect(screen.queryByText(TEXTOS_PAINEL.sem_fatura)).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(TEXTOS_IMPORTAR.botao) })).toBeNull();
    expect(screen.queryByText(/Conferido|Diferença/)).toBeNull();
  });

  it("sem Fatura e sem histórico continua 'Fatura ainda não importada'", () => {
    montar({ fatura: null, historico: null });
    expect(screen.getByText(TEXTOS_PAINEL.sem_fatura)).toBeTruthy();
  });
});

describe("FaturaDoMes: 'Recebido no mês' e 'Falta receber' (História 6.5, FR-26)", () => {
  function hero(opcoes: {
    fatura?: FaturaHero | null;
    historico?: { totalCentavos: number; quantidade: number } | null;
    recebimentos?: { recebidoCentavos: number | null; faltaCentavos: number | null } | null;
  }) {
    const aoAbrirRecebimentos = vi.fn();
    render(
      <FaturaDoMes
        mes="2026-10"
        fatura={opcoes.fatura === undefined ? outubro : opcoes.fatura}
        valoresDaFaturaCentavos={[768777]}
        distribuicao={distribuicaoPorResponsavel([], [])}
        responsaveis={responsaveis}
        escolhidos={[]}
        aoFiltrar={vi.fn()}
        aoImportar={vi.fn()}
        historico={opcoes.historico}
        recebimentos={opcoes.recebimentos}
        aoAbrirRecebimentos={aoAbrirRecebimentos}
      />,
    );
    return { aoAbrirRecebimentos, u: userEvent.setup() };
  }
  const falta = (valor: string) =>
    screen.getByRole("button", { name: (n) => sem(n) === `Falta receber ${valor}, abrir Recebimentos` });

  it("dois mini-cartões embaixo: 'Recebido no mês' em text-accent e 'Falta receber'", () => {
    hero({ recebimentos: { recebidoCentavos: 281968, faltaCentavos: 63600 } });
    const recebido = screen.getByText("Recebido no mês");
    expect(sem(recebido.parentElement?.textContent)).toBe("Recebido no mêsR$ 2.819,68");
    expect(recebido.nextElementSibling?.className).toContain("text-accent");
    expect(sem(falta("R$ 636,00").textContent)).toBe("Falta receberR$ 636,00");
  });

  it("tocar em 'Falta receber' abre Recebimentos; 'Recebido no mês' não é botão", async () => {
    const { aoAbrirRecebimentos, u } = hero({ recebimentos: { recebidoCentavos: 0, faltaCentavos: 100 } });
    await u.click(screen.getByRole("button", { name: /^Falta receber/ }));
    expect(aoAbrirRecebimentos).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Recebido no mês/ })).toBeNull();
  });

  it("valor ainda não lido (ou sem Blocos de cobrança): '—'", () => {
    hero({ recebimentos: { recebidoCentavos: null, faltaCentavos: null } });
    expect(sem(screen.getByText("Recebido no mês").parentElement?.textContent)).toBe("Recebido no mês—");
    expect(falta("—")).toBeTruthy();
  });

  it("alvo de toque de 44 pt", () => {
    hero({ recebimentos: { recebidoCentavos: 0, faltaCentavos: 0 } });
    expect(screen.getByRole("button", { name: /^Falta receber/ }).className).toContain("min-h-toque");
  });

  it("sem a prop, os mini-cartões não existem (o passo do Primeiro uso e os outros usos não mudam)", () => {
    hero({});
    expect(screen.queryByText("Recebido no mês")).toBeNull();
    expect(screen.queryByText("Falta receber")).toBeNull();
  });

  it("Mês só com histórico da planilha: os mini-cartões aparecem (é onde está a dívida antiga)", () => {
    hero({ fatura: null, historico: { totalCentavos: 928023, quantidade: 52 }, recebimentos: { recebidoCentavos: 0, faltaCentavos: 5000 } });
    expect(screen.getByText("Recebido no mês")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Falta receber/ })).toBeTruthy();
  });

  it("Mês sem Fatura e sem histórico: sem mini-cartões", () => {
    hero({ fatura: null, historico: null, recebimentos: { recebidoCentavos: 0, faltaCentavos: 0 } });
    expect(screen.queryByText("Recebido no mês")).toBeNull();
  });
});
