// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Bloco, BlocoParaGravar } from "@/domain/blocos";
import { mensagem, TEXTOS_BLOCO as T } from "@/domain/mensagens";
import { MontadorBloco, type PropsMontadorBloco } from "./MontadorBloco";

// Montador de Bloco (História 4.1, UX-DR16): fichas, resultado e passo a passo
// ao vivo, "Salvar" desativado com a razão e as duas opções.

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

const responsaveis: PropsMontadorBloco["responsaveis"] = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
  { id: "r-rangel", nome: "Rangel", cor: 5, ordem: 2, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 3, arquivado: false },
];
const tipos: PropsMontadorBloco["tipos"] = [
  { id: "t-casa", nome: "Casa", arquivado: false },
  { id: "t-bobicas", nome: "Bobiças", arquivado: false },
];
const linhas: PropsMontadorBloco["linhas"] = [
  { id: "l1", mes: "2026-10", excluido_em: null, valor_centavos: 563935, responsavel_id: "r-casal", tipo_id: "t-casa" },
  { id: "l2", mes: "2026-10", excluido_em: null, valor_centavos: 10000, responsavel_id: "r-rafael", tipo_id: "t-bobicas" },
  { id: "l3", mes: "2026-11", excluido_em: null, valor_centavos: 99999, responsavel_id: "r-casal", tipo_id: "t-casa" },
];

function abrir(extra: Partial<PropsMontadorBloco> = {}) {
  const aoSalvar = vi.fn<PropsMontadorBloco["aoSalvar"]>(async () => true);
  const aoMudar = vi.fn();
  render(
    <MontadorBloco
      aberta
      aoMudar={aoMudar}
      linhas={linhas}
      mes="2026-10"
      responsaveis={responsaveis}
      tipos={tipos}
      blocos={[]}
      aoSalvar={aoSalvar}
      {...extra}
    />,
  );
  return { aoSalvar, aoMudar };
}

const desativado = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const ficha = (nome: string) => screen.getByRole("button", { name: nome });
const salvar = () => screen.getByRole("button", { name: T.salvar });
const area = () => screen.getByRole("group", { name: T.formula });
const fichasDaArea = () =>
  within(area())
    .getAllByRole("button")
    .map((b) => b.textContent);

async function tocar(...nomes: string[]) {
  const user = userEvent.setup();
  for (const n of nomes) await user.click(ficha(n));
  return user;
}

async function numero(user: ReturnType<typeof userEvent.setup>, valor: string) {
  await user.click(ficha(T.numero));
  await user.type(screen.getByLabelText(T.campo_numero), valor);
  await user.click(ficha(T.usar_numero));
}

describe("Montador de Bloco", () => {
  it("monta Rangel + (Casal ÷ 2) e mostra o resultado e o passo a passo ao vivo", async () => {
    const { aoSalvar, aoMudar } = abrir();
    const user = userEvent.setup();
    await user.click(ficha("Rangel"));
    await user.click(ficha("Somar"));
    await user.click(ficha(T.abrir_parentese));
    await user.click(ficha("Casal"));
    await user.click(ficha("Dividir"));
    await numero(user, "2");
    await user.click(ficha(T.fechar_parentese));

    expect(fichasDaArea()).toEqual(["Rangel", "+", "(", "Casal", "÷", "2", ")"]);
    expect(sem(screen.getByText(T.resultado).parentElement?.textContent)).toContain("R$ 2.819,68");
    expect(sem(screen.getByLabelText(T.passo_a_passo).textContent)).toContain(
      "Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68",
    );

    await user.type(screen.getByLabelText(T.nome), "Rangel");
    expect(desativado(salvar())).toBe(false);
    await user.click(salvar());
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    const pedido: BlocoParaGravar = aoSalvar.mock.calls[0][0];
    expect(pedido).toMatchObject({ p_id: null, p_nome: "Rangel", p_ordem: 1, p_de_cobranca: false, p_meu_bloco: false });
    expect(pedido.p_formula).toEqual({
      tipo: "operacao",
      operacao: "soma",
      esquerda: { tipo: "responsavel", id: "r-rangel" },
      direita: {
        tipo: "grupo",
        interno: {
          tipo: "operacao",
          operacao: "divisao",
          esquerda: { tipo: "responsavel", id: "r-casal" },
          direita: { tipo: "numero", valor: "2" },
        },
      },
    });
  });

  it("só olha o Mês aberto: o Casal de novembro não entra", async () => {
    abrir();
    await tocar("Casal");
    expect(sem(screen.getByText(T.resultado).parentElement?.textContent)).toContain("R$ 5.639,35");
  });

  it("tocar numa ficha da Fórmula a remove", async () => {
    abrir();
    const user = await tocar("Rangel", "Somar", "Casal");
    expect(sem(area().textContent)).toContain("Rangel+Casal");
    await user.click(within(area()).getByRole("button", { name: "Remover +" }));
    expect(sem(area().textContent)).toContain("RangelCasal");
    expect(screen.getByRole("status").textContent).toBe(mensagem("formula.falta_operacao"));
  });

  it("sem fichas: dica e Salvar desativado com a razão", () => {
    abrir();
    expect(screen.getByText(T.dica_vazia)).toBeTruthy();
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Monte a fórmula tocando nas fichas");
  });

  it("Falta fechar um parêntese", async () => {
    abrir();
    await tocar(T.abrir_parentese, "Casal");
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Falta fechar um parêntese");
  });

  it("A fórmula termina com uma operação", async () => {
    abrir();
    await tocar("Casal", "Somar");
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("A fórmula termina com uma operação");
  });

  it("Divisão por zero", async () => {
    abrir();
    const user = await tocar("Casal", "Dividir");
    await numero(user, "0");
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Divisão por zero");
  });

  it("com a Fórmula certa e sem nome, a razão é o nome", async () => {
    abrir();
    await tocar("Casal");
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(mensagem("bloco.nome_vazio"));
  });

  it("nome repetido de outro Bloco não salva", async () => {
    const existente: Bloco = {
      id: "b1",
      nome: "Casal",
      formula: { tipo: "responsavel", id: "r-casal" },
      ordem: 1,
      de_cobranca: false,
      meu_bloco: false,
    };
    abrir({ blocos: [existente] });
    const user = await tocar("Casal");
    await user.type(screen.getByLabelText(T.nome), "casal");
    expect(desativado(salvar())).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(mensagem("bloco.nome_repetido"));
  });

  it('"Responsável em Tipo…" abre dois seletores (Rafael + Bobiças)', async () => {
    abrir();
    const user = userEvent.setup();
    await user.click(ficha(T.responsavel_em_tipo));
    expect(desativado(ficha(T.usar))).toBe(true);
    await user.selectOptions(screen.getByLabelText(T.responsavel), "r-rafael");
    await user.selectOptions(screen.getByLabelText(T.tipo), "t-bobicas");
    await user.click(ficha(T.usar));
    expect(fichasDaArea()).toEqual(["Rafael em Bobiças"]);
    expect(sem(screen.getByText(T.resultado).parentElement?.textContent)).toContain("R$ 100,00");
    // Os seletores se fecham.
    expect(screen.queryByLabelText(T.tipo)).toBeNull();
  });

  it("não existe campo de texto livre para a Fórmula", async () => {
    abrir();
    // Só o nome é texto; o campo de número só aparece ao pedir "Número…" e só aceita número.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: T.nome })).toBeTruthy();
    const user = userEvent.setup();
    await user.click(ficha(T.numero));
    const campo = screen.getByLabelText(T.campo_numero);
    expect(campo.getAttribute("inputmode")).toBe("decimal");
    await user.type(campo, "Casal + 2");
    expect(desativado(ficha(T.usar_numero))).toBe(true);
  });

  it('"Número…" aceita vírgula e Enter, e guarda o número como está ("0,5")', async () => {
    abrir();
    const user = await tocar("Casal", "Multiplicar");
    await user.click(ficha(T.numero));
    await user.type(screen.getByLabelText(T.campo_numero), "0,50{Enter}");
    expect(fichasDaArea()).toEqual(["Casal", "×", "0,5"]);
    expect(sem(screen.getByText(T.resultado).parentElement?.textContent)).toContain("R$ 2.819,68");
  });

  it('"Usar em Recebimentos" e "É o meu Bloco" vão no pedido', async () => {
    const { aoSalvar } = abrir();
    const user = await tocar("Casal");
    await user.type(screen.getByLabelText(T.nome), "Casal");
    const recebimentos = screen.getByRole("switch", { name: T.usar_em_recebimentos });
    const meu = screen.getByRole("switch", { name: T.meu_bloco });
    expect(recebimentos.getAttribute("aria-checked")).toBe("false");
    await user.click(recebimentos);
    await user.click(meu);
    expect(recebimentos.getAttribute("aria-checked")).toBe("true");
    await user.click(salvar());
    expect(aoSalvar.mock.calls[0][0]).toMatchObject({ p_de_cobranca: true, p_meu_bloco: true });
  });

  it("se a gravação falhar, a janela continua aberta", async () => {
    const aoSalvar = vi.fn(async () => false);
    const { aoMudar } = abrir({ aoSalvar });
    const user = await tocar("Casal");
    await user.type(screen.getByLabelText(T.nome), "Casal");
    await user.click(salvar());
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(aoMudar).not.toHaveBeenCalled();
    expect(desativado(salvar())).toBe(false);
  });

  it("editar um Bloco: abre com a Fórmula, mantém a ordem e o id", async () => {
    const inicial: Bloco = {
      id: "b9",
      nome: "Rangel",
      formula: {
        tipo: "operacao",
        operacao: "soma",
        esquerda: { tipo: "responsavel", id: "r-rangel" },
        direita: { tipo: "grupo", interno: { tipo: "responsavel", id: "r-casal" } },
      },
      ordem: 4,
      de_cobranca: true,
      meu_bloco: false,
    };
    const { aoSalvar } = abrir({ inicial, blocos: [inicial] });
    expect(screen.getByRole("heading", { name: T.titulo_editar })).toBeTruthy();
    expect((screen.getByLabelText(T.nome) as HTMLInputElement).value).toBe("Rangel");
    expect(sem(area().textContent)).toContain("Rangel+(Casal)");
    expect(screen.getByRole("switch", { name: T.usar_em_recebimentos }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(salvar());
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(aoSalvar.mock.calls[0][0]).toMatchObject({ p_id: "b9", p_ordem: 4, p_de_cobranca: true });
  });

  it("sem Responsáveis nem Tipos, avisa (e ainda dá para usar Todos e números)", () => {
    abrir({ responsaveis: [], tipos: [] });
    expect(screen.getByText(T.sem_fichas)).toBeTruthy();
    expect(desativado(ficha(T.todos))).toBe(false);
    expect(desativado(ficha(T.responsavel_em_tipo))).toBe(true);
  });

  it("cancelar fecha sem salvar", async () => {
    const { aoSalvar, aoMudar } = abrir();
    await tocar("Casal");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoSalvar).not.toHaveBeenCalled();
  });
});
