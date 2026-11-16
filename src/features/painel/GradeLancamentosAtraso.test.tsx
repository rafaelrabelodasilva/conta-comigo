// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ORDEM_PADRAO, type LancamentoGrade } from "@/domain/painel";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";

// O selo "Atrasado" na grade (História 6.4, FR-49): o que a tela faz com o mapa de atrasos que o
// núcleo calcula (`atraso.ts`, testado à parte). A regra do dia do limite não é daqui.

const cadastros: CadastrosGrade = {
  tipos: new Map(),
  responsaveis: new Map([["r-casal", { nome: "Casal", cor: 2 }]]),
  status: new Map([
    ["s-nao", { nome: "Não pago", conta_como_pago: false }],
    ["s-pago", { nome: "Pago", conta_como_pago: true }],
    ["s-pix", { nome: "Pix", conta_como_pago: true }],
  ]),
};

const lanc = (id: string, extra: Partial<LancamentoGrade> = {}): LancamentoGrade => ({
  id,
  nome: `LOJA ${id}`,
  apelido: null,
  parcela_n: null,
  parcela_total: null,
  valor_centavos: 10_000,
  tipo_id: null,
  responsavel_id: "r-casal",
  status_id: "s-nao",
  lancado_por: "fatura",
  ordem_fatura: Number(id.replace(/\D/g, "")) || 1,
  final_cartao: "5061",
  fatura_id: "f11",
  duvida_extracao: false,
  ...extra,
});

function montar(props: {
  linhas: LancamentoGrade[];
  atraso?: ReadonlyMap<string, string>;
  falta?: ReadonlyMap<string, number>;
  ajustes?: ReadonlyMap<string, readonly LancamentoGrade[]>;
}) {
  return render(
    <GradeLancamentos
      linhas={props.linhas}
      ajustesPorMae={props.ajustes}
      atrasoPorLinha={props.atraso}
      faltaPorLinha={props.falta}
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

describe("selo Atrasado na grade", () => {
  it("sem mapa de atrasos nada muda: o selo é o Status cadastrado", () => {
    montar({ linhas: [lanc("1")] });
    expect(within(linha("LOJA 1")).getByText("Não pago").getAttribute("data-selo")).toBe("nao_pago");
    expect(screen.queryByText("Atrasado")).toBeNull();
  });

  it("substitui o Não pago, com os tokens status-late (nenhuma cor literal) e a data no nome da linha", () => {
    montar({ linhas: [lanc("1")], atraso: new Map([["1", "2026-11-17"]]) });
    const l = linha("LOJA 1");
    const selo = within(l).getByText("Atrasado");
    expect(selo.getAttribute("data-selo")).toBe("atrasado");
    expect(selo.className).toContain("bg-status-late-bg");
    expect(selo.className).toContain("text-status-late-fg");
    expect(selo.className).not.toMatch(/#|rgb|\[/);
    expect(selo.getAttribute("title")).toBe("atrasado desde 17/11/26");
    expect(within(l).queryByText("Não pago")).toBeNull();
    expect(l.getAttribute("aria-label")).toMatch(/Casal, atrasado desde 17\/11\/26$/);
  });

  it("uma linha sem Status, atrasada, mostra o selo (antes mostrava o travessão)", () => {
    montar({ linhas: [lanc("1", { status_id: null })], atraso: new Map([["1", "2026-11-17"]]) });
    expect(within(linha("LOJA 1")).getByText("Atrasado")).toBeTruthy();
  });

  it("quem não está no mapa de atrasos (os pagos, que o núcleo já exclui) fica com o Status dele", () => {
    montar({ linhas: [lanc("1", { status_id: "s-pago" }), lanc("2", { status_id: "s-pix" })] });
    expect(within(linha("LOJA 1")).getByText("Pago").getAttribute("data-selo")).toBe("pago");
    expect(within(linha("LOJA 2")).getByText("Pix").getAttribute("data-selo")).toBe("pago");
  });

  it("Pago parcialmente mantém o selo dele e ganha o Atrasado ao lado", () => {
    montar({ linhas: [lanc("1")], atraso: new Map([["1", "2026-11-17"]]), falta: new Map([["1", 6000]]) });
    const l = linha("LOJA 1");
    expect(within(l).getByText("Pago parcialmente").getAttribute("data-selo")).toBe("parcial");
    expect(within(l).getByText("Atrasado").getAttribute("data-selo")).toBe("atrasado");
    expect(within(l).queryByText("Não pago")).toBeNull();
    expect(l.getAttribute("aria-label")).toMatch(/Pago parcialmente, falta R\$.60,00, atrasado desde 17\/11\/26$/);
  });

  it("Pago parcialmente em dia continua só com o selo parcial", () => {
    montar({ linhas: [lanc("1")], falta: new Map([["1", 6000]]) });
    expect(within(linha("LOJA 1")).queryByText("Atrasado")).toBeNull();
  });

  it("o Ajuste de centavos mostra o selo da mãe dele (acompanha a parcela)", () => {
    const mae = lanc("1");
    const ajuste = lanc("2", { ajuste_de_id: "1", valor_centavos: -8, status_id: "s-nao" });
    montar({ linhas: [mae], ajustes: new Map([["1", [ajuste]]]), atraso: new Map([["1", "2026-11-17"]]) });
    const linhas = screen.getAllByRole("row").filter((r) => r.getAttribute("data-ajuste") !== null);
    expect(linhas).toHaveLength(1);
    expect(within(linhas[0]).getByText("Atrasado")).toBeTruthy();
  });
});
