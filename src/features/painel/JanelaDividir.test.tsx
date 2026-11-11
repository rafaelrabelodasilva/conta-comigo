// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Divisao } from "@/domain/divisao";
import { TEXTOS_DIVISAO as T } from "@/domain/mensagens";
import type { LinhaLancamento } from "@/data/lancamentos-repo";
import { JanelaDividir, type PropsJanelaDividir } from "./JanelaDividir";

// Janela "Dividir" (História 3.8, UX-DR15): modos, partes, rodapé da soma e
// "Dividir" só quando a soma bate; modo edição com "Desfazer divisão".

const sem = (t: string | null | undefined) => (t ?? "").replaceAll("\u00a0", " ");

const linha = (extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id: "m1",
    nome: "JIM COM 57653822 BAR",
    apelido: null,
    valor_centavos: 46600,
    tipo_id: "t1",
    status_id: "s-nao",
    ajuste_de_id: null,
    dividido_de_id: null,
    divisao: null,
    ...extra,
  }) as LinhaLancamento;

const cadastros: PropsJanelaDividir["cadastros"] = {
  responsaveis: [
    { id: "r-mae", nome: "Mãe", cor: 3, ordem: 1, arquivado: false },
    { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 2, arquivado: false },
  ] as never,
  status: [
    { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
    { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
  ] as never,
};

function montar(extra: Partial<PropsJanelaDividir> = {}) {
  const aoDividir = vi.fn(async () => true);
  const aoDesfazer = vi.fn(async () => true);
  const aoMudar = vi.fn();
  render(
    <JanelaDividir
      aberta
      aoMudar={aoMudar}
      linha={linha()}
      filhas={[]}
      temAjuste={false}
      cadastros={cadastros}
      statusPadraoId="s-nao"
      aoDividir={aoDividir}
      aoDesfazer={aoDesfazer}
      {...extra}
    />,
  );
  return { aoDividir, aoDesfazer, aoMudar };
}

const dividir = () => screen.getByRole("button", { name: T.botao }) as HTMLButtonElement;
const responsavel = (i: number) => screen.getByRole("combobox", { name: `${T.responsavel} ${i}` });
const campo = (rotulo: string, i: number) => screen.getByRole("textbox", { name: `${rotulo} ${i}` });

describe("JanelaDividir", () => {
  it("abre em 'Por proporção' com duas partes de 1/2 e o rodapé da soma; 'Dividir' só com Responsável em cada parte", () => {
    montar();
    expect(screen.getByRole("button", { name: T.por_proporcao }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: T.por_valor }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(sem(screen.getByRole("status").textContent)).toContain("Soma das partes: R$ 466,00 de R$ 466,00 ✓");
    // Sem Responsável nas partes: não libera.
    expect(dividir().disabled).toBe(true);
  });

  it("2/3 + 1/3 de R$ 466,00 = R$ 310,67 + R$ 155,33 (+1 centavo na última) e grava a Divisão e o Status de cada parte", async () => {
    const { aoDividir, aoMudar } = montar();
    fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
    fireEvent.change(responsavel(2), { target: { value: "r-rafael" } });
    fireEvent.change(campo(T.fracao, 1), { target: { value: "2/3" } });
    fireEvent.change(campo(T.fracao, 2), { target: { value: "1/3" } });
    fireEvent.change(screen.getByRole("combobox", { name: `${T.status} 2` }), { target: { value: "s-pago" } });
    const texto = sem(document.body.textContent);
    expect(texto).toContain("R$ 310,67");
    expect(texto).toContain("R$ 155,33");
    // A última parte tem a sua fração exata (155,33): nada sobrou para ela.
    expect(texto).not.toContain("centavo)");
    expect(dividir().disabled).toBe(false);
    fireEvent.click(dividir());
    await waitFor(() => expect(aoDividir).toHaveBeenCalledOnce());
    const [divisao, status] = aoDividir.mock.calls[0] as unknown as [Divisao, (string | null)[]];
    expect(divisao.modo).toBe("proporcao");
    expect(divisao.partes.map((p) => [p.responsavel_id, p.numerador, p.denominador])).toEqual([
      ["r-mae", 2, 3],
      ["r-rafael", 1, 3],
    ]);
    expect(status).toEqual(["s-nao", "s-pago"]);
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("em três partes iguais de R$ 1,00 a última leva o centavo que sobra e a janela mostra '(+1 centavo)'", () => {
    montar({ linha: linha({ valor_centavos: 100 }) });
    fireEvent.click(screen.getByRole("button", { name: T.parte }));
    for (const [i, r] of [[1, "r-mae"], [2, "r-rafael"], [3, "r-mae"]] as const) {
      fireEvent.change(responsavel(i), { target: { value: r } });
      fireEvent.change(campo(T.fracao, i), { target: { value: "1/3" } });
    }
    const texto = sem(document.body.textContent);
    expect(texto).toContain("R$ 0,33");
    expect(texto).toContain("R$ 0,34");
    expect(texto).toContain("(+1 centavo)");
    expect(dividir().disabled).toBe(false);
  });

  it("frações que não somam 1 não liberam e o rodapé diz o que falta", () => {
    montar();
    fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
    fireEvent.change(responsavel(2), { target: { value: "r-rafael" } });
    fireEvent.change(campo(T.fracao, 1), { target: { value: "1/2" } });
    fireEvent.change(campo(T.fracao, 2), { target: { value: "1/3" } });
    expect(dividir().disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(T.fracoes_nao_fecham);
  });

  it("Por valor: a soma tem de bater com o Valor, e o rodapé mostra o que foi digitado", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: T.por_valor }));
    fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
    fireEvent.change(responsavel(2), { target: { value: "r-rafael" } });
    // A troca de modo converte 1/2 + 1/2 em valores.
    expect((campo(T.valor, 1) as HTMLInputElement).value).toBe("233,00");
    fireEvent.change(campo(T.valor, 1), { target: { value: "310,67" } });
    fireEvent.change(campo(T.valor, 2), { target: { value: "150,00" } });
    expect(dividir().disabled).toBe(true);
    expect(sem(screen.getByRole("status").textContent)).toContain("Soma das partes: R$ 460,67 de R$ 466,00");
    expect(sem(screen.getByRole("status").textContent)).not.toContain("✓");
    fireEvent.change(campo(T.valor, 2), { target: { value: "155,33" } });
    expect(dividir().disabled).toBe(false);
    expect(sem(screen.getByRole("status").textContent)).toContain("✓");
  });

  it("＋ Parte vai até 10; remover só com mais de 2", () => {
    montar();
    expect(screen.queryByRole("button", { name: new RegExp(T.remover_parte) })).toBeNull();
    const mais = screen.getByRole("button", { name: T.parte });
    for (let i = 0; i < 8; i++) fireEvent.click(mais);
    expect(screen.getAllByRole("textbox")).toHaveLength(10);
    expect((mais as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: `${T.remover_parte} 10` }));
    expect(screen.getAllByRole("textbox")).toHaveLength(9);
  });

  it("sem Tipo, com Ajuste ou com Valor zero a janela explica e não libera", () => {
    const { unmount } = render(<span />);
    unmount();
    montar({ linha: linha({ tipo_id: null }) });
    expect(screen.getByText(T.indisponivel_tipo)).toBeTruthy();
    expect(dividir().disabled).toBe(true);
  });

  it("com Ajuste de centavos: avisa para desvincular", () => {
    montar({ temAjuste: true });
    expect(screen.getByText(T.indisponivel_ajuste)).toBeTruthy();
  });

  describe("modo edição", () => {
    const divisao: Divisao = {
      modo: "proporcao",
      regra_chave: "JIM COM",
      partes: [
        { responsavel_id: "r-mae", numerador: 2, denominador: 3, filha_id: "f1" },
        { responsavel_id: "r-rafael", numerador: 1, denominador: 3, filha_id: "f2" },
      ],
    };

    it("abre com a Divisão, o Status de cada filha, o aviso da Regra e 'Desfazer divisão'", async () => {
      const { aoDesfazer, aoMudar } = montar({
        linha: linha({ divisao: divisao as never, responsavel_id: null }),
        filhas: [linha({ id: "f1", status_id: "s-pago" }), linha({ id: "f2", status_id: "s-nao" })],
      });
      expect(screen.getByText("Divisão aplicada pela Regra de JIM COM")).toBeTruthy();
      expect((campo(T.fracao, 1) as HTMLInputElement).value).toBe("2/3");
      expect((responsavel(2) as HTMLSelectElement).value).toBe("r-rafael");
      expect((screen.getByRole("combobox", { name: `${T.status} 1` }) as HTMLSelectElement).value).toBe("s-pago");
      expect(dividir().disabled).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: T.desfazer }));
      await waitFor(() => expect(aoDesfazer).toHaveBeenCalledOnce());
      await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    });

    it("uma Divisão por valor reabre com os mesmos valores", () => {
      montar({
        linha: linha({
          divisao: {
            modo: "valor",
            partes: [
              { responsavel_id: "r-mae", numerador: 31067, denominador: 46600 },
              { responsavel_id: "r-rafael", numerador: 15533, denominador: 46600 },
            ],
          } as never,
        }),
      });
      expect(screen.getByRole("button", { name: T.por_valor }).getAttribute("aria-pressed")).toBe("true");
      expect((campo(T.valor, 1) as HTMLInputElement).value).toBe("310,67");
      expect((campo(T.valor, 2) as HTMLInputElement).value).toBe("155,33");
    });

    it("não mostra 'Desfazer divisão' quando a linha ainda não está dividida", () => {
      montar();
      expect(screen.queryByRole("button", { name: T.desfazer })).toBeNull();
    });
  });

  it("fica dentro do diálogo (título e Valor da linha)", () => {
    montar();
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(T.titulo)).toBeTruthy();
    expect(sem(dialogo.textContent)).toContain("JIM COM 57653822 BAR · R$ 466,00");
  });
});
