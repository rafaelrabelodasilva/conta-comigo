// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NovaConta } from "@/domain/contas-manuais";
import { TEXTOS_CONTAS as T } from "@/domain/mensagens";
import type { ResultadoSalvarConta } from "@/data/contas-repo";
import { ToastProvider } from "@/ui/Toast";
import { ContasManuais } from "./ContasManuais";

// A tela Contas (História 5.1): o botão "＋ Nova conta", o formulário e o que
// mostra que salvou. Realtime, conexão e repositório são falsos.

const falso = vi.hoisted(() => ({
  statusCadastros: "pronto" as string,
  online: true,
}));

const responsaveis = [
  { id: "r-mae", nome: "Mãe", cor: 3, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  { id: "r-lucas", nome: "Lucas", cor: 4, ordem: 3, arquivado: false },
];
const tipos = [{ id: "t-viagem", nome: "Viagem", arquivado: false }];

vi.mock("@/data/realtime", () => ({
  useLinhas: (tabela: string) => ({ status: falso.statusCadastros, linhas: tabela === "tipos" ? tipos : responsaveis }),
}));
vi.mock("@/data/conexao", () => ({ useConexao: () => falso.online }));

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");

function montar(salvar: (c: NovaConta, mes: string) => Promise<ResultadoSalvarConta>) {
  return render(
    <ToastProvider>
      <ContasManuais titulo="Contas manuais" repo={{ salvar }} />
    </ToastProvider>,
  );
}

const nova = () => screen.getByRole("button", { name: T.rotulo_nova }) as HTMLButtonElement;

async function cadastrarBombinhas() {
  fireEvent.click(nova());
  fireEvent.change(screen.getByRole("textbox", { name: T.nome }), { target: { value: "Bombinhas" } });
  fireEvent.change(screen.getByRole("combobox", { name: T.repeticao }), { target: { value: "parcelas" } });
  fireEvent.change(screen.getByRole("textbox", { name: T.valor_parcela }), { target: { value: "318,00" } });
  fireEvent.change(screen.getByRole("textbox", { name: T.parcelas }), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText(T.comeca_em), { target: { value: "2026-07" } });
  fireEvent.change(screen.getByRole("combobox", { name: T.tipo }), { target: { value: "t-viagem" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Responsável da parte 1" }), { target: { value: "r-mae" } });
  fireEvent.click(screen.getByRole("button", { name: T.rotulo_mais_parte }));
  fireEvent.change(screen.getByRole("textbox", { name: "Valor da parte 1" }), { target: { value: "106,00" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Responsável da parte 2" }), { target: { value: "r-casal" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Valor da parte 2" }), { target: { value: "106,00" } });
  fireEvent.click(screen.getByRole("button", { name: T.rotulo_mais_parte }));
  fireEvent.change(screen.getByRole("combobox", { name: "Responsável da parte 3" }), { target: { value: "r-lucas" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Valor da parte 3" }), { target: { value: "106,00" } });
  fireEvent.click(screen.getByRole("button", { name: T.salvar }));
}

describe("ContasManuais", () => {
  beforeEach(() => {
    falso.statusCadastros = "pronto";
    falso.online = true;
    // Só o relógio: "hoje" é 15/11/2026.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("sem contas ainda: o texto de apoio e o botão ＋ Nova conta", () => {
    montar(vi.fn());
    expect(screen.getByRole("heading", { name: "Contas manuais" })).toBeTruthy();
    expect(screen.getByText(T.explicacao_vazio)).toBeTruthy();
    expect(nova().textContent).toContain(T.botao_nova);
    expect(nova().disabled).toBe(false);
  });

  it("o botão espera Responsáveis e Tipos carregarem", () => {
    falso.statusCadastros = "carregando";
    montar(vi.fn());
    expect(nova().disabled).toBe(true);
  });

  it("a Bombinhas: salva com o Mês atual de hoje, avisa quantas parcelas e mostra a Conta salva", async () => {
    const salvar = vi.fn<(c: NovaConta, mes: string) => Promise<ResultadoSalvarConta>>(
      async (c) => ({
        ok: true,
        criados: 6,
        conta: {
          id: c.id,
          owner_id: "dono",
          nome: c.nome,
          valor_centavos: c.valor_centavos,
          tipo_id: c.tipo_id,
          responsavel_id: null,
          observacao: null,
          mes_inicial: c.mes_inicial,
          repeticao: c.repeticao,
          parcela_total: c.parcela_total,
          divisao: null,
          encerrada_em_mes: null,
          created_at: "2026-11-15T15:00:00Z",
          updated_at: "2026-11-15T15:00:00Z",
        },
      }),
    );
    montar(salvar);
    await cadastrarBombinhas();
    await waitFor(() => expect(salvar).toHaveBeenCalledOnce());
    expect(salvar.mock.calls[0][1]).toBe("2026-11");
    expect(salvar.mock.calls[0][0]).toMatchObject({ nome: "Bombinhas", valor_centavos: 31_800, parcela_total: 6 });
    // O formulário fecha; a lista da visita e o toast mostram que salvou.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(T.salvas_agora)).toBeTruthy();
    expect(screen.getByText("6 parcelas · Jul/26 a Dez/26")).toBeTruthy();
    expect(sem(document.body.textContent)).toContain("R$ 318,00");
    expect(screen.getByText("Conta salva: 6 lançamentos criados")).toBeTruthy();
  });

  it("o banco recusa: o formulário continua aberto com o erro e nada aparece como salvo", async () => {
    const salvar = vi.fn(async (): Promise<ResultadoSalvarConta> => ({ ok: false, codigo: "salvar.falhou" }));
    montar(salvar);
    await cadastrarBombinhas();
    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(T.salvas_agora)).toBeNull();
  });

  it("sem internet: o formulário abre para olhar, mas Salvar fica desativado", () => {
    falso.online = false;
    const salvar = vi.fn();
    montar(salvar);
    fireEvent.click(nova());
    expect((screen.getByRole("button", { name: T.salvar }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(T.sem_internet)).toBeTruthy();
    expect(salvar).not.toHaveBeenCalled();
  });
});
