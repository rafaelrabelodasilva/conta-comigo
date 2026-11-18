// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ORDEM_PADRAO, type LancamentoGrade } from "@/domain/painel";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";

// O selo "Programada · 06/04/27" e o "Programar dívida" do ⋯ na grade (História 6.6, FR-27, UX-DR19). Quem decide o
// que é Dívida programada é o núcleo (`divida.ts`); aqui se prova o que a grade mostra.

const cadastros: CadastrosGrade = {
  tipos: new Map(),
  responsaveis: new Map([["r-lucas", { nome: "Lucas", cor: 5 }]]),
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
  valor_centavos: 10_600,
  tipo_id: null,
  responsavel_id: "r-lucas",
  status_id: "s-nao",
  lancado_por: "manual",
  ordem_fatura: Number(id.replace(/\D/g, "")) || 1,
  final_cartao: null,
  fatura_id: null,
  duvida_extracao: false,
  vencimento_combinado: null,
  ...extra,
});

function montar(props: {
  linhas: LancamentoGrade[];
  atraso?: ReadonlyMap<string, string>;
  ajustes?: ReadonlyMap<string, readonly LancamentoGrade[]>;
  maes?: ReadonlyMap<string, LancamentoGrade>;
  aoProgramar?: (id: string) => void;
}) {
  return render(
    <GradeLancamentos
      linhas={props.linhas}
      ajustesPorMae={props.ajustes}
      maesDivididas={props.maes}
      atrasoPorLinha={props.atraso}
      aoProgramar={props.aoProgramar}
      cadastros={cadastros}
      ordem={ORDEM_PADRAO}
      aoOrdenar={() => {}}
      escolhidos={[]}
      aoFiltrar={() => {}}
      vazio="vazio"
    />,
  );
}

const linha = (nome: string) => screen.getByRole("row", { name: new RegExp(`^${nome},`) });

describe("selo Programada na grade", () => {
  it("a Dívida programada leva 'Programada · 06/04/27', ao lado do Status, e o nome acessível da linha diz a data", () => {
    montar({ linhas: [lanc("1", { vencimento_combinado: "2027-04-06" })] });
    const l = linha("LOJA 1");
    const selo = within(l).getByText("Programada · 06/04/27");
    expect(selo.getAttribute("data-selo")).toBe("programada");
    expect(within(l).getByText("Não pago")).toBeTruthy();
    expect(l.getAttribute("aria-label")).toMatch(/Lucas, Não pago, Programada · 06\/04\/27$/);
  });

  it("sem data combinada, nada muda", () => {
    montar({ linhas: [lanc("1")] });
    expect(screen.queryByText(/Programada/)).toBeNull();
  });

  it("paga: o selo some (não há o que cobrar)", () => {
    montar({ linhas: [lanc("1", { vencimento_combinado: "2027-04-06", status_id: "s-pago" })] });
    expect(screen.queryByText(/Programada/)).toBeNull();
  });

  it("vencida e atrasada: 'Atrasado' (pelo vencimento combinado) e 'Programada' juntos", () => {
    montar({
      linhas: [lanc("1", { vencimento_combinado: "2026-11-01" })],
      atraso: new Map([["1", "2026-11-12"]]),
    });
    const l = linha("LOJA 1");
    expect(within(l).getByText("Atrasado")).toBeTruthy();
    expect(within(l).getByText("Programada · 01/11/26")).toBeTruthy();
    expect(within(l).queryByText("Não pago")).toBeNull();
  });

  it("a mãe dividida (cabeçalho) e o Ajuste não têm o selo; a parte programada, sim", () => {
    const mae = lanc("1", { divisao: { modo: "valor", partes: [] }, responsavel_id: null, valor_centavos: 31_800, vencimento_combinado: "2027-04-06" });
    const parte = lanc("2", { dividido_de_id: "1", vencimento_combinado: "2027-04-06" });
    const outra = lanc("3", { dividido_de_id: "1" });
    montar({ linhas: [parte, outra], maes: new Map([["1", mae]]) });
    expect(screen.getAllByText("Programada · 06/04/27")).toHaveLength(1);
    expect(within(screen.getByRole("row", { name: /^Parte de LOJA 2,/ })).getByText("Programada · 06/04/27")).toBeTruthy();
  });

  it("o selo não leva cor literal (borda e texto neutros dos tokens)", () => {
    montar({ linhas: [lanc("1", { vencimento_combinado: "2027-04-06" })] });
    const selo = screen.getByText("Programada · 06/04/27");
    expect(selo.className).not.toMatch(/#|rgb|\[/);
  });
});

describe("'Programar dívida' no ⋯ da linha", () => {
  it("o menu da linha tem 'Programar dívida' e leva o id da linha", async () => {
    const aoProgramar = vi.fn();
    montar({ linhas: [lanc("1")], aoProgramar });
    await userEvent.click(within(linha("LOJA 1")).getByRole("button", { name: /ações/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Programar dívida" }));
    expect(aoProgramar).toHaveBeenCalledWith("1");
  });

  it("sem a ação, o item não existe", async () => {
    montar({ linhas: [lanc("1")] });
    await userEvent.click(within(linha("LOJA 1")).getByRole("button", { name: /ações/i }));
    expect(screen.queryByRole("menuitem", { name: "Programar dívida" })).toBeNull();
  });

  it("a mãe dividida (cabeçalho) também oferece: programa as partes", async () => {
    const aoProgramar = vi.fn();
    const mae = lanc("1", { divisao: { modo: "valor", partes: [] }, responsavel_id: null, valor_centavos: 31_800 });
    const parte = lanc("2", { dividido_de_id: "1" });
    montar({ linhas: [parte], maes: new Map([["1", mae]]), aoProgramar });
    await userEvent.click(within(screen.getByRole("row", { name: /^LOJA 1,/ })).getByRole("button", { name: /ações/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Programar dívida" }));
    expect(aoProgramar).toHaveBeenCalledWith("1");
  });
});
