// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { conferir } from "@/domain/conferencia";
import { TEXTOS_CONFERENCIA } from "@/domain/mensagens";
import { FaixaConferencia } from "./FaixaConferencia";

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const fatura = { id: "f10", total_despesas_centavos: 100_000, total_creditos_centavos: 1_000 };
const cartoes = [
  { fatura_id: "f10", final: "8673", total_centavos: 90_000 },
  { fatura_id: "f10", final: "9277", total_centavos: 10_000 },
];
const linha = (final: string, valor: number) => ({
  fatura_id: "f10",
  valor_centavos: valor,
  final_cartao: final,
  excluido_em: null,
});

function montar(linhas: ReturnType<typeof linha>[]) {
  const aoVerLancamentos = vi.fn();
  const aoDispensar = vi.fn();
  const r = render(
    <FaixaConferencia
      conferencia={conferir(fatura, cartoes, linhas)}
      aoVerLancamentos={aoVerLancamentos}
      aoDispensar={aoDispensar}
    />,
  );
  return { ...r, aoVerLancamentos, aoDispensar, u: userEvent.setup() };
}

describe("FaixaConferencia", () => {
  it("valor lido errado: faixa âmbar com as despesas abaixo e o cartão; os botões chamam o Painel", async () => {
    const { aoVerLancamentos, aoDispensar, u } = montar([
      linha("8673", 18_000),
      linha("9277", 10_000),
      linha("9277", -1_000),
    ]);
    const faixa = screen.getByRole("region", { name: TEXTOS_CONFERENCIA.faixa });
    expect(faixa.className).toContain("bg-alert-warning-bg");
    expect(faixa.className).toContain("border-alert-warning-border");
    const frases = [...faixa.querySelectorAll("p")].map((p) => sem(p.textContent));
    expect(frases).toEqual([
      "⚠ A soma dos lançamentos ficou R$ 720,00 abaixo do total da fatura.",
      "A diferença está no cartão final 8673.",
    ]);
    expect(faixa.querySelector("p")?.className).toContain("texto-body-strong");

    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.ver_lancamentos }));
    expect(aoVerLancamentos).toHaveBeenCalledOnce();
    await u.click(screen.getByRole("button", { name: TEXTOS_CONFERENCIA.dispensar }));
    expect(aoDispensar).toHaveBeenCalledOnce();
  });

  it("cartão trocado: despesas batem e a diferença está nos dois cartões", () => {
    montar([linha("8673", 10_000), linha("9277", 90_000), linha("9277", -1_000)]);
    const faixa = screen.getByRole("region", { name: TEXTOS_CONFERENCIA.faixa });
    expect(sem(faixa.textContent)).toContain("⚠ A diferença está nos cartões finais 8673 e 9277.");
  });

  it("conferido: nada aparece", () => {
    const { container } = montar([linha("8673", 90_000), linha("9277", 10_000), linha("9277", -1_000)]);
    expect(container.innerHTML).toBe("");
  });
});
