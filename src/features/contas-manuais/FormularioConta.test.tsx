// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NovaConta } from "@/domain/contas-manuais";
import { TEXTOS_CONTAS as T, mensagem } from "@/domain/mensagens";
import type { ResultadoSalvarConta } from "@/data/contas-repo";
import { FormularioConta, type PropsFormularioConta } from "./FormularioConta";

// O formulário "Nova conta manual" (História 5.1, UX-DR24): campos, "＋ Parte",
// validações do núcleo com as mensagens do mapa, salvar sem duplicar e sem
// internet. A gravação é falsa (`aoSalvar`).

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const responsaveis = [
  { id: "r-mae", nome: "Mãe", cor: 3, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  { id: "r-lucas", nome: "Lucas", cor: 4, ordem: 3, arquivado: false },
  { id: "r-velho", nome: "Antigo", cor: 5, ordem: 4, arquivado: true },
] as unknown as PropsFormularioConta["responsaveis"];

const tipos = [
  { id: "t-viagem", nome: "Viagem", arquivado: false },
  { id: "t-saude", nome: "Saúde", arquivado: false },
  { id: "t-velho", nome: "Antigo", arquivado: true },
] as unknown as PropsFormularioConta["tipos"];

const CONTA_OK: ResultadoSalvarConta = {
  ok: true,
  conta: {} as never,
  criados: 6,
};

function montar(extra: Partial<PropsFormularioConta> = {}) {
  const aoSalvar = vi.fn<(c: NovaConta) => Promise<ResultadoSalvarConta>>(async () => CONTA_OK);
  const aoMudar = vi.fn();
  render(
    <FormularioConta
      aberta
      aoMudar={aoMudar}
      mesAtual="2026-11"
      responsaveis={responsaveis}
      tipos={tipos}
      online
      aoSalvar={aoSalvar}
      gerarId={() => "id-fixo"}
      {...extra}
    />,
  );
  return { aoSalvar, aoMudar };
}

const salvar = () => screen.getByRole("button", { name: T.salvar }) as HTMLButtonElement;
const nome = () => screen.getByRole("textbox", { name: T.nome }) as HTMLInputElement;
const valor = () => screen.getByRole("textbox", { name: /^Valor por (mês|parcela)$/ }) as HTMLInputElement;
const responsavel = (i: number) => screen.getByRole("combobox", { name: `Responsável da parte ${i}` }) as HTMLSelectElement;
const valorDaParte = (i: number) => screen.getByRole("textbox", { name: `Valor da parte ${i}` }) as HTMLInputElement;
const maisParte = () => screen.getByRole("button", { name: T.rotulo_mais_parte }) as HTMLButtonElement;

function preencherBombinhas() {
  fireEvent.change(nome(), { target: { value: "Bombinhas" } });
  fireEvent.change(screen.getByRole("combobox", { name: T.repeticao }), { target: { value: "parcelas" } });
  fireEvent.change(valor(), { target: { value: "318,00" } });
  fireEvent.change(screen.getByRole("textbox", { name: T.parcelas }), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText(T.comeca_em), { target: { value: "2026-07" } });
  fireEvent.change(screen.getByRole("combobox", { name: T.tipo }), { target: { value: "t-viagem" } });
  fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
  fireEvent.click(maisParte());
  fireEvent.change(valorDaParte(1), { target: { value: "106,00" } });
  fireEvent.change(responsavel(2), { target: { value: "r-casal" } });
  fireEvent.change(valorDaParte(2), { target: { value: "106,00" } });
  fireEvent.click(maisParte());
  fireEvent.change(responsavel(3), { target: { value: "r-lucas" } });
  fireEvent.change(valorDaParte(3), { target: { value: "106,00" } });
}

describe("FormularioConta", () => {
  it("abre mensal, no Mês atual, com um Responsável e sem erro", () => {
    montar();
    expect(screen.getByRole("dialog", { name: T.titulo_nova })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: T.repeticao }) as HTMLSelectElement).value).toBe("mensal");
    expect((screen.getByLabelText(T.comeca_em) as HTMLInputElement).value).toBe("2026-11");
    // Mensal não tem o campo Parcelas; o rótulo do Valor é "por mês".
    expect(screen.queryByRole("textbox", { name: T.parcelas })).toBeNull();
    expect(valor()).toBeTruthy();
    expect(screen.getByText(T.responsavel)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Tipos e Responsáveis arquivados não aparecem nas escolhas", () => {
    montar();
    const tiposDisponiveis = [...(screen.getByRole("combobox", { name: T.tipo }) as HTMLSelectElement).options].map((o) => o.text);
    expect(tiposDisponiveis).toEqual(["Saúde", "Viagem", T.escolha_tipo]);
    const responsaveisDisponiveis = [...responsavel(1).options].map((o) => o.text);
    expect(responsaveisDisponiveis).toEqual(["Mãe", "Casal", "Lucas", T.escolha_responsavel]);
  });

  it("a Bombinhas: 6 parcelas de Jul/26, Viagem, três partes de R$ 106,00, e salva a Conta do núcleo", async () => {
    const { aoSalvar, aoMudar } = montar();
    preencherBombinhas();
    // Os totais ao vivo: R$ 318,00 por parcela e R$ 1.908,00 no total; a soma das partes fecha.
    expect(sem(document.body.textContent)).toContain("Por mês: R$ 318,00 · Total da conta: R$ 1.908,00");
    expect(sem(document.body.textContent)).toContain("Soma das partes: R$ 318,00 de R$ 318,00 ✓");
    fireEvent.click(salvar());
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce());
    const conta = aoSalvar.mock.calls[0][0];
    expect(conta).toMatchObject({
      id: "id-fixo",
      nome: "Bombinhas",
      valor_centavos: 31_800,
      tipo_id: "t-viagem",
      mes_inicial: "2026-07",
      repeticao: "parcelas",
      parcela_total: 6,
      responsavel_id: null,
    });
    expect(conta.divisao?.partes.map((p) => p.responsavel_id)).toEqual(["r-mae", "r-casal", "r-lucas"]);
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("um Responsável só: sem Divisão", async () => {
    const { aoSalvar } = montar();
    fireEvent.change(nome(), { target: { value: "Silvia" } });
    fireEvent.change(valor(), { target: { value: "400,00" } });
    fireEvent.change(screen.getByRole("combobox", { name: T.tipo }), { target: { value: "t-saude" } });
    fireEvent.change(responsavel(1), { target: { value: "r-casal" } });
    fireEvent.click(salvar());
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce());
    expect(aoSalvar.mock.calls[0][0]).toMatchObject({ nome: "Silvia", responsavel_id: "r-casal", divisao: null, repeticao: "mensal", parcela_total: null });
  });

  it('"＋ Parte": a segunda parte nasce com o Valor ao meio; "Remover" volta a um Responsável só', () => {
    montar();
    fireEvent.change(valor(), { target: { value: "318,00" } });
    fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
    expect(screen.queryByRole("textbox", { name: "Valor da parte 1" })).toBeNull();
    fireEvent.click(maisParte());
    expect(valorDaParte(1).value).toBe("159,00");
    expect(valorDaParte(2).value).toBe("159,00");
    expect(responsavel(1).value).toBe("r-mae");
    expect(screen.getByRole("button", { name: "Remover parte 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover parte 2" }));
    expect(screen.queryByRole("textbox", { name: "Valor da parte 1" })).toBeNull();
    expect(responsavel(1).value).toBe("r-mae");
  });

  it("os alvos de toque têm 44 pt: ＋ Parte, Remover (compacto com área de toque) e os campos", () => {
    montar();
    fireEvent.click(maisParte());
    expect(maisParte().className).toContain("min-h-toque");
    expect(screen.getByRole("button", { name: "Remover parte 1" }).className).toContain("area-toque");
    expect(valorDaParte(1).className).toContain("min-h-toque");
    expect(responsavel(1).className).toContain("min-h-toque");
    expect(salvar().className).toContain("min-h-toque");
  });

  it("os campos de cada parte têm nome acessível, mesmo sem rótulo visível", () => {
    montar();
    fireEvent.click(maisParte());
    for (const i of [1, 2]) {
      expect(responsavel(i)).toBeTruthy();
      expect(valorDaParte(i)).toBeTruthy();
    }
    // O rótulo fica só para o leitor de tela.
    expect(document.querySelector("label.sr-only")).not.toBeNull();
  });

  it("Salvar vazio: as mensagens do mapa, o foco no primeiro campo inválido e nada é gravado", async () => {
    const { aoSalvar } = montar();
    fireEvent.click(salvar());
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(screen.getByText(mensagem("conta.nome_vazio"))).toBeTruthy();
    expect(screen.getByText(mensagem("conta.valor_invalido"))).toBeTruthy();
    expect(screen.getByText(mensagem("conta.sem_tipo"))).toBeTruthy();
    expect(screen.getByText(mensagem("conta.sem_responsavel"))).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(nome()));
  });

  it("os erros só aparecem depois do primeiro Salvar", () => {
    montar();
    fireEvent.change(nome(), { target: { value: "   " } });
    expect(screen.queryByText(mensagem("conta.nome_vazio"))).toBeNull();
    fireEvent.click(salvar());
    expect(screen.getByText(mensagem("conta.nome_vazio"))).toBeTruthy();
    fireEvent.change(nome(), { target: { value: "Silvia" } });
    expect(screen.queryByText(mensagem("conta.nome_vazio"))).toBeNull();
  });

  it("Valor R$ 0,00 e negativo: o mesmo aviso", () => {
    montar();
    fireEvent.click(salvar());
    for (const v of ["0,00", "-5,00"]) {
      fireEvent.change(valor(), { target: { value: v } });
      expect(screen.getByText(mensagem("conta.valor_zero"))).toBeTruthy();
    }
  });

  it("N parcelas: pede de 2 a 120", () => {
    montar();
    fireEvent.change(screen.getByRole("combobox", { name: T.repeticao }), { target: { value: "parcelas" } });
    fireEvent.click(salvar());
    expect(screen.getByText(mensagem("conta.parcelas_invalidas"))).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: T.parcelas }), { target: { value: "1" } });
    expect(screen.getByText(mensagem("conta.parcelas_invalidas"))).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: T.parcelas }), { target: { value: "2" } });
    expect(screen.queryByText(mensagem("conta.parcelas_invalidas"))).toBeNull();
  });

  it("Divisão que não fecha: mostra a soma e a mensagem, sem o ✓", () => {
    montar();
    fireEvent.change(valor(), { target: { value: "318,00" } });
    fireEvent.change(responsavel(1), { target: { value: "r-mae" } });
    fireEvent.click(maisParte());
    fireEvent.change(valorDaParte(2), { target: { value: "100,00" } });
    fireEvent.change(responsavel(2), { target: { value: "r-casal" } });
    expect(sem(document.body.textContent)).toContain("Soma das partes: R$ 259,00 de R$ 318,00");
    expect(sem(document.body.textContent)).not.toContain("de R$ 318,00 ✓");
    fireEvent.click(salvar());
    expect(screen.getByText(mensagem("divisao.soma_diferente"))).toBeTruthy();
  });

  it("começar num Mês passado avisa que os meses anteriores também recebem a conta", () => {
    montar();
    expect(screen.queryByText(T.nota_passado)).toBeNull();
    fireEvent.change(screen.getByLabelText(T.comeca_em), { target: { value: "2026-01" } });
    expect(screen.getByText(T.nota_passado)).toBeTruthy();
  });

  it("o banco recusa: mostra o erro, não fecha, e tentar de novo manda a mesma Conta (mesmo id)", async () => {
    const aoSalvar = vi
      .fn<(c: NovaConta) => Promise<ResultadoSalvarConta>>()
      .mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" })
      .mockResolvedValueOnce(CONTA_OK);
    const { aoMudar } = montar({ aoSalvar });
    preencherBombinhas();
    fireEvent.click(salvar());
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(aoMudar).not.toHaveBeenCalled();
    expect(salvar().disabled).toBe(false);
    fireEvent.click(salvar());
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(aoSalvar.mock.calls[0][0].id).toBe("id-fixo");
    expect(aoSalvar.mock.calls[1][0]).toEqual(aoSalvar.mock.calls[0][0]);
  });

  it("dois toques seguidos em Salvar gravam uma vez só", async () => {
    let terminar: (r: ResultadoSalvarConta) => void = () => {};
    const aoSalvar = vi.fn(() => new Promise<ResultadoSalvarConta>((ok) => (terminar = ok)));
    montar({ aoSalvar });
    preencherBombinhas();
    const botao = salvar();
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(aoSalvar).toHaveBeenCalledOnce();
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toBe(T.salvando);
    terminar(CONTA_OK);
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce());
  });

  it("sem internet: Salvar desativado e o aviso (só consulta, AD-3)", () => {
    const { aoSalvar } = montar({ online: false });
    preencherBombinhas();
    expect(salvar().disabled).toBe(true);
    expect(screen.getByText(T.sem_internet)).toBeTruthy();
    fireEvent.click(salvar());
    expect(aoSalvar).not.toHaveBeenCalled();
  });

  it("Cancelar fecha sem gravar", () => {
    const { aoSalvar, aoMudar } = montar();
    fireEvent.click(screen.getByRole("button", { name: T.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoSalvar).not.toHaveBeenCalled();
  });
});
