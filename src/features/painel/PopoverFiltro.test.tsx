// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { FILTROS_VAZIOS, valoresDaColuna, type CadastrosFiltro, type FiltrosGrade, type ValorFiltro } from "@/domain/filtros-grade";
import type { LancamentoGrade } from "@/domain/painel";
import { PopoverFiltro } from "./PopoverFiltro";

// Popover aberto enquanto chega uma mudança em tempo real (História 2.7): o
// rascunho não se perde, as contagens se atualizam e um valor marcado que
// sumiu do Mês continua na lista, com contagem 0.

const lanc = (id: string, final: string | null): LancamentoGrade => ({
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
  final_cartao: final,
  fatura_id: "f10",
  duvida_extracao: false,
});

const cadastros: CadastrosFiltro = { responsaveis: [], tipos: [], status: [] };

const tempoReal: { mudar: (l: LancamentoGrade[]) => void } = { mudar: () => {} };

function Montar() {
  const [linhas, setLinhas] = useState([lanc("a", "3967"), lanc("b", "5061"), lanc("c", "5061")]);
  const [filtros, setFiltros] = useState<FiltrosGrade>(FILTROS_VAZIOS);
  useEffect(() => {
    tempoReal.mudar = setLinhas;
  }, []);
  const listar = (extras: readonly ValorFiltro[]) => valoresDaColuna("cartao", linhas, filtros, null, cadastros, extras);
  return (
    <>
      <PopoverFiltro
        coluna="cartao"
        filtros={filtros}
        opcoes={listar([])}
        listar={listar}
        aoAplicar={(valores) => setFiltros((f) => ({ ...f, colunas: { ...f.colunas, cartao: valores } }))}
      />
      <output data-testid="estado">{JSON.stringify(filtros.colunas.cartao)}</output>
    </>
  );
}

describe("PopoverFiltro com tempo real", () => {
  it("o valor marcado que sumiu fica com 0; as contagens se atualizam; Aplicar leva o rascunho", async () => {
    render(<Montar />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Cartão" }));
    const dialogo = screen.getByRole("dialog");
    await u.click(within(dialogo).getByRole("checkbox", { name: "Cartão final 3967, 1 lançamento" }));
    // Em outro aparelho, o único do 3967 passa para o 5061.
    act(() => tempoReal.mudar([lanc("a", "5061"), lanc("b", "5061"), lanc("c", "5061")]));
    const caixas = within(screen.getByRole("dialog")).getAllByRole("checkbox") as HTMLInputElement[];
    expect(caixas.map((c) => [c.getAttribute("aria-label"), c.checked])).toEqual([
      ["Cartão final 3967, 0 lançamentos", true],
      ["Cartão final 5061, 3 lançamentos", false],
    ]);
    await u.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Cartão final 5061, 3 lançamentos" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aplicar" }));
    expect(JSON.parse(screen.getByTestId("estado").textContent ?? "[]")).toEqual(["3967", "5061"]);
  });
});
