// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conferir, type Conferencia } from "@/domain/conferencia";
import { mensagem } from "@/domain/mensagens";
import type { LinhaLancamento, MudancaLancamento, RepoLancamentos, ResultadoLancamento } from "@/data/lancamentos-repo";
import { ToastProvider } from "@/ui/Toast";
import { ATRASOS_NOVA_TENTATIVA, PainelLancamento, type CadastrosPainel } from "./PainelLancamento";

// O painel recebe a linha da memória por prop. O "gerenciador" aqui é um
// estado do teste: o repositório falso aplica nele a linha gravada (como o
// de verdade faz com `aplicarLote`) antes de responder.

const sem = (t: string | null | undefined) => (t ?? "").replaceAll("\u00a0", " ");

const T1 = "2026-11-08T00:00:00.000001+00:00";
const T2 = "2026-11-08T00:14:00.000002+00:00";

const linha = (extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id: "a",
    owner_id: "dono",
    nome: "BELLA PIETRA",
    nome_normalizado: "BELLA PIETRA",
    apelido: null,
    valor_centavos: 80000,
    data: "2026-09-12",
    parcela_n: 5,
    parcela_total: 10,
    final_cartao: "8673",
    mes: "2026-10",
    fatura_id: "f10",
    ordem_fatura: 1,
    duvida_extracao: false,
    lancado_por: "fatura",
    responsavel_id: null,
    tipo_id: null,
    status_id: "s-nao",
    observacao: null,
    editado_em: null,
    excluido_em: null,
    created_at: T1,
    updated_at: T1,
    ...extra,
  }) as LinhaLancamento;

const cadastros = {
  responsaveis: [
    { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
    { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
    { id: "r-antigo", nome: "Antigo", cor: 3, ordem: 3, arquivado: true },
  ],
  tipos: [{ id: "t-casa", nome: "Casa", arquivado: false }],
  status: [
    { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
    { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
  ],
} as unknown as CadastrosPainel;

/** Conferência de out/26 com BELLA PIETRA (cartão 8673) e uma padaria (5061). */
function conferenciaCom(valorBella: number): Conferencia {
  return conferir(
    { id: "f10", total_despesas_centavos: 81000, total_creditos_centavos: 0 },
    [
      { fatura_id: "f10", final: "5061", total_centavos: 1000 },
      { fatura_id: "f10", final: "8673", total_centavos: 80000 },
    ],
    [
      { fatura_id: "f10", valor_centavos: 1000, final_cartao: "5061", excluido_em: null },
      { fatura_id: "f10", valor_centavos: valorBella, final_cartao: "8673", excluido_em: null },
    ],
  );
}

/** O que a tela mostra da memória (o harness liga ao estado dele). */
const tela: { mostrar: (l: LinhaLancamento) => void } = { mostrar: () => {} };

type Respondedor = (id: string, m: MudancaLancamento) => ResultadoLancamento | "ok";

function montarRepo(responder: Respondedor = () => "ok") {
  const memoria = {
    atual: linha(),
    aplicar(l: LinhaLancamento) {
      memoria.atual = l;
      tela.mostrar(l);
    },
  };
  let n = 0;
  const atualizar = vi.fn(async (id: string, m: MudancaLancamento) => {
    const r = responder(id, m);
    if (r !== "ok") return r;
    n++;
    const gravada = { ...memoria.atual, ...m, updated_at: `2026-11-08T00:14:00.00000${n}+00:00` };
    memoria.aplicar(gravada);
    return { ok: true as const, linha: gravada };
  });
  const incluir = vi.fn(async (novo: object) => ({ ok: true as const, linha: linha({ ...novo, id: "novo", updated_at: T2 }) }));
  const repo = { atualizar, incluir, excluir: vi.fn(), restaurar: vi.fn() } as unknown as RepoLancamentos;
  return { repo, memoria, atualizar, incluir };
}

function Editar({
  m,
  conferencia = null,
  aoExcluir = () => {},
}: {
  m: ReturnType<typeof montarRepo>;
  conferencia?: Conferencia | null;
  aoExcluir?: (id: string) => void;
}) {
  const [atual, setAtual] = useState(m.memoria.atual);
  useEffect(() => {
    tela.mostrar = setAtual;
  }, []);
  return (
    <PainelLancamento
      modo="editar"
      linha={atual}
      conferencia={conferencia ?? (atual.fatura_id ? conferenciaCom(atual.valor_centavos) : null)}
      cadastros={cadastros}
      aoFechar={() => {}}
      aoExcluir={aoExcluir}
      repo={m.repo}
    />
  );
}

const renderizar = (ui: React.ReactElement) => render(ui, { wrapper: ToastProvider });
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement;
const indicador = () => sem(within(screen.getByRole("complementary")).getAllByRole("status")[0].textContent);

afterEach(() => {
  vi.useRealTimers();
});

describe("painel do Lançamento: conteúdo", () => {
  it("na ordem do mockup: título, ✕, Nome na fatura, Valor e data, Apelido, Responsável e Tipo, Status, Observação, detalhes e Excluir", () => {
    const m = montarRepo();
    m.memoria.atual = linha({ apelido: "Pedras" });
    const aoExcluir = vi.fn();
    renderizar(<Editar m={m} aoExcluir={aoExcluir} />);
    const painel = screen.getByRole("complementary", { name: "Pedras" });
    expect(painel.className).toContain("lg:w-painel-lateral");
    expect(painel.className).toContain("w-[70vw]");
    expect(screen.getByRole("heading", { name: "Pedras" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeTruthy();
    expect(sem(screen.getByText("BELLA PIETRA").parentElement?.textContent)).toBe("Nome na fatura: BELLA PIETRA · não editável");
    const rotulos = [...painel.querySelectorAll("label")].map((l) => l.textContent);
    expect(rotulos).toEqual(["Valor", "Data da compra", "Apelido", "Responsável", "Tipo", "Status", "Observação"]);
    expect(sem(campo("Valor").value)).toBe("R$ 800,00");
    expect(campo("Valor").inputMode).toBe("decimal");
    expect(campo("Data da compra").type).toBe("date");
    expect(screen.getByText("Parcela 05/10 · cartão final 8673 · Lançado por Fatura")).toBeTruthy();
    const excluir = screen.getByRole("button", { name: "Excluir" });
    expect(excluir.className).toContain("border-danger-fg");
    fireEvent.click(excluir);
    expect(aoExcluir).toHaveBeenCalledWith("a");
  });

  it("seletores: não arquivados, o arquivado em uso e 'Sem …'; Status vazio é 'não pago'", () => {
    const m = montarRepo();
    m.memoria.atual = linha({ responsavel_id: "r-antigo" });
    renderizar(<Editar m={m} />);
    const opcoes = (nome: string) => [...(screen.getByLabelText(nome) as HTMLSelectElement).options].map((o) => o.text);
    expect(opcoes("Responsável")).toEqual(["Rafael", "Casal", "Antigo", "Sem responsável"]);
    expect(opcoes("Tipo")).toEqual(["Casa", "Sem tipo"]);
    expect(opcoes("Status")).toEqual(["Não pago", "Pago", "Sem status (não pago)"]);
  });
});

describe("salvar ao sair do campo", () => {
  it("Classificar: Responsável Casal grava só responsavel_id; 'Salvo às 21:14'", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Responsável"), "r-casal");
    expect(m.atualizar).toHaveBeenCalledTimes(1);
    expect(m.atualizar).toHaveBeenCalledWith("a", { responsavel_id: "r-casal" });
    expect(indicador()).toBe("Salvo às 21:14");
    expect((screen.getByLabelText("Responsável") as HTMLSelectElement).value).toBe("r-casal");
  });

  it("Corrigir Valor: 800 → 80 recalcula a Conferência no painel", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    expect(screen.getByText("Conferência: ✓")).toBeTruthy();
    const u = userEvent.setup();
    await u.clear(campo("Valor"));
    await u.type(campo("Valor"), "80,00");
    await u.tab();
    expect(m.atualizar).toHaveBeenCalledWith("a", { valor_centavos: 8000 });
    expect(sem(screen.getByText(/^Conferência:/).textContent)).toBe("Conferência: diferença de R$ 720,00");
    expect(sem(campo("Valor").value)).toBe("R$ 80,00");
  });

  it("sair sem mudar não grava", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.click(campo("Valor"));
    await u.tab();
    await u.click(campo("Apelido"));
    await u.type(campo("Apelido"), "   ");
    await u.tab();
    expect(m.atualizar).not.toHaveBeenCalled();
  });

  it("Valor 'abc' ou '0': erro no campo (aria-describedby), o texto fica e nada grava", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.clear(campo("Valor"));
    await u.type(campo("Valor"), "abc");
    await u.tab();
    expect(m.atualizar).not.toHaveBeenCalled();
    expect(campo("Valor").value).toBe("abc");
    expect(campo("Valor").getAttribute("aria-invalid")).toBe("true");
    const erro = document.getElementById(campo("Valor").getAttribute("aria-describedby")!);
    expect(erro?.textContent).toBe(mensagem("lancamento.valor_invalido"));
    expect(erro?.className).toContain("text-danger-fg");
    await u.clear(campo("Valor"));
    await u.type(campo("Valor"), "0");
    await u.tab();
    expect(m.atualizar).not.toHaveBeenCalled();
    expect(screen.getByText(mensagem("lancamento.valor_zero"))).toBeTruthy();
  });

  it("Apelido recortado e Observação", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.type(campo("Apelido"), "  Pedras  ");
    await u.tab();
    expect(m.atualizar).toHaveBeenLastCalledWith("a", { apelido: "Pedras" });
    expect(screen.getByRole("heading", { name: "Pedras" })).toBeTruthy();
    await u.type(screen.getByLabelText("Observação"), "comprada na loja");
    await u.tab();
    expect(m.atualizar).toHaveBeenLastCalledWith("a", { observacao: "comprada na loja" });
  });

  it("falha: tenta de novo em 2 s, 5 s e 10 s; depois volta ao gravado com a mensagem", async () => {
    vi.useFakeTimers();
    const m = montarRepo(() => ({ ok: false, codigo: "salvar.falhou" }));
    renderizar(<Editar m={m} />);
    fireEvent.change(screen.getByLabelText("Responsável"), { target: { value: "r-casal" } });
    await act(async () => {});
    expect(m.atualizar).toHaveBeenCalledTimes(1);
    expect(indicador()).toBe("Não salvo, tentando de novo");
    // Enquanto tenta, o campo mostra o valor escolhido.
    expect((screen.getByLabelText("Responsável") as HTMLSelectElement).value).toBe("r-casal");
    for (const [i, atraso] of ATRASOS_NOVA_TENTATIVA.entries()) {
      await act(async () => {
        vi.advanceTimersByTime(atraso - 1);
      });
      expect(m.atualizar).toHaveBeenCalledTimes(i + 1);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(m.atualizar).toHaveBeenCalledTimes(i + 2);
    }
    expect((screen.getByLabelText("Responsável") as HTMLSelectElement).value).toBe("");
    expect(indicador()).toBe(mensagem("salvar.falhou"));
  });

  it("falha e depois dá certo: Salvo", async () => {
    vi.useFakeTimers();
    let vez = 0;
    const m = montarRepo(() => (++vez === 1 ? { ok: false, codigo: "salvar.falhou" } : "ok"));
    renderizar(<Editar m={m} />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t-casa" } });
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(m.atualizar).toHaveBeenCalledTimes(2);
    expect(indicador()).toBe("Salvo às 21:14");
  });

  it("mudar o campo durante as tentativas cancela a tentativa do valor antigo", async () => {
    vi.useFakeTimers();
    const m = montarRepo((_, mud) => (mud.tipo_id === "t-casa" ? { ok: false, codigo: "salvar.falhou" } : "ok"));
    renderizar(<Editar m={m} />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "t-casa" } });
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "" } });
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    // A primeira de t-casa; a de "" não grava (igual à memória). Nenhuma nova tentativa.
    expect(m.atualizar).toHaveBeenCalledTimes(1);
  });

  it("sem conexão: nada fica guardado, o campo volta ao gravado e o toast avisa", async () => {
    const m = montarRepo(() => ({ ok: false, codigo: "conexao.gravar_sem_conexao" }));
    renderizar(<Editar m={m} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Responsável"), "r-casal");
    expect((screen.getByLabelText("Responsável") as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
  });
});

describe("fechar e data", () => {
  it("fechar sem sair do campo salva o que foi digitado", async () => {
    const m = montarRepo();
    const { unmount } = renderizar(<Editar m={m} />);
    await userEvent.setup().type(campo("Apelido"), "Pedras");
    unmount();
    expect(m.atualizar).toHaveBeenCalledWith("a", { apelido: "Pedras" });
  });

  it("falha depois de fechar: sem novas tentativas, o toast avisa", async () => {
    vi.useFakeTimers();
    const m = montarRepo(() => ({ ok: false, codigo: "salvar.falhou" }));
    function Alternar() {
      const [aberto, setAberto] = useState(true);
      return (
        <>
          <button onClick={() => setAberto(false)}>fechar</button>
          {aberto ? <Editar m={m} /> : null}
        </>
      );
    }
    renderizar(<Alternar />);
    fireEvent.focus(campo("Apelido"));
    fireEvent.change(campo("Apelido"), { target: { value: "Pedras" } });
    fireEvent.click(screen.getByRole("button", { name: "fechar" }));
    await act(async () => {});
    expect(screen.getByText(mensagem("salvar.falhou"))).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(m.atualizar).toHaveBeenCalledTimes(1);
  });

  it("data incompleta (badInput): erro no campo e nada grava", () => {
    const m = montarRepo();
    m.memoria.atual = linha({ lancado_por: "manual" });
    renderizar(<Editar m={m} />);
    const data = campo("Data da compra");
    fireEvent.focus(data);
    fireEvent.change(data, { target: { value: "" } });
    Object.defineProperty(data, "validity", { value: { badInput: true } });
    fireEvent.blur(data);
    expect(screen.getByText(mensagem("lancamento.data_invalida"))).toBeTruthy();
    expect(m.atualizar).not.toHaveBeenCalled();
  });

  it("limpar a data de uma linha da Fatura: erro no campo", () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    const data = campo("Data da compra");
    fireEvent.focus(data);
    fireEvent.change(data, { target: { value: "" } });
    fireEvent.blur(data);
    expect(screen.getByText(mensagem("lancamento.data_da_fatura"))).toBeTruthy();
    expect(m.atualizar).not.toHaveBeenCalled();
  });
});

describe("alterado em outro aparelho", () => {
  it("versão nova de fora: faixa com a hora; campos fora de edição se atualizam, o em edição guarda o digitado", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.click(campo("Apelido"));
    await u.type(campo("Apelido"), "Meu");
    act(() => m.memoria.aplicar(linha({ tipo_id: "t-casa", apelido: "Deles", updated_at: "2026-11-08 00:30:00.5+00" })));
    expect(screen.getByText("Este lançamento foi alterado em outro aparelho às 21:30")).toBeTruthy();
    expect((screen.getByLabelText("Tipo") as HTMLSelectElement).value).toBe("t-casa");
    expect(campo("Apelido").value).toBe("Meu");
  });

  it("a própria gravação de volta pelo Realtime (mesmo updated_at): sem faixa", async () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Tipo"), "t-casa");
    // O Realtime traz o mesmo instante no formato dele.
    act(() => m.memoria.aplicar({ ...m.memoria.atual, updated_at: "2026-11-08 00:14:00.000001+00" }));
    expect(screen.queryByText(/alterado em outro aparelho/)).toBeNull();
  });
});

describe("＋ Lançamento", () => {
  function Novo({
    repo,
    aoIncluido = () => {},
    comFatura = true,
    statusPadraoId = "s-nao",
    status = cadastros.status,
  }: {
    repo: RepoLancamentos;
    aoIncluido?: (l: LinhaLancamento) => void;
    comFatura?: boolean;
    statusPadraoId?: string;
    status?: CadastrosPainel["status"];
  }) {
    return (
      <PainelLancamento
        modo="novo"
        mesAberto="2026-10"
        fatura={comFatura ? { id: "f10", mes: "2026-10" } : null}
        cartoes={["5061", "8673"]}
        configsCiclo={[]}
        statusPadraoId={statusPadraoId}
        cadastros={{ ...cadastros, status }}
        aoFechar={() => {}}
        aoIncluido={aoIncluido}
        repo={repo}
      />
    );
  }

  it("painel vazio com Nome editável, Status padrão, Cancelar / Incluir; nada salva antes de Incluir", async () => {
    const m = montarRepo();
    renderizar(<Novo repo={m.repo} />);
    expect(screen.getByRole("heading", { name: "Novo lançamento" })).toBeTruthy();
    expect(campo("Nome").value).toBe("");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("s-nao");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    const u = userEvent.setup();
    await u.type(campo("Nome"), "X");
    await u.tab();
    expect(m.incluir).not.toHaveBeenCalled();
    expect(m.atualizar).not.toHaveBeenCalled();
  });

  it("Status padrão arquivado: começa em 'Sem status'", () => {
    const m = montarRepo();
    const arquivado = cadastros.status.map((s) => (s.id === "s-nao" ? { ...s, arquivado: true } : s));
    renderizar(<Novo repo={m.repo} status={arquivado} />);
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("");
  });

  it.each(["salvar.falhou", "conexao.gravar_sem_conexao"] as const)(
    "Incluir que falha (%s): toast, painel fica com o digitado, sem aoIncluido",
    async (codigo) => {
      const m = montarRepo();
      m.incluir.mockImplementation(async () => ({ ok: false, codigo }) as never);
      const aoIncluido = vi.fn();
      renderizar(<Novo repo={m.repo} aoIncluido={aoIncluido} />);
      const u = userEvent.setup();
      await u.type(campo("Nome"), "PADARIA");
      await u.type(campo("Valor"), "12,50");
      await u.click(screen.getByRole("button", { name: "Incluir" }));
      expect(screen.getByText(mensagem(codigo))).toBeTruthy();
      expect(aoIncluido).not.toHaveBeenCalled();
      expect(campo("Nome").value).toBe("PADARIA");
      expect(campo("Valor").value).toBe("12,50");
    },
  );

  it("Incluir que termina depois de fechar: não chama aoIncluido, toast com o Mês", async () => {
    const m = montarRepo();
    let responder: (v: unknown) => void = () => {};
    m.incluir.mockImplementation(() => new Promise((r) => (responder = r)) as never);
    const aoIncluido = vi.fn();
    function Alternar() {
      const [aberto, setAberto] = useState(true);
      return (
        <>
          <button onClick={() => setAberto(false)}>fechar</button>
          {aberto ? <Novo repo={m.repo} aoIncluido={aoIncluido} /> : null}
        </>
      );
    }
    renderizar(<Alternar />);
    const u = userEvent.setup();
    await u.type(campo("Nome"), "X");
    await u.type(campo("Valor"), "1");
    await u.click(screen.getByRole("button", { name: "Incluir" }));
    await u.click(screen.getByRole("button", { name: "fechar" }));
    await act(async () => responder({ ok: true, linha: linha({ id: "novo", mes: "2026-12" }) }));
    expect(aoIncluido).not.toHaveBeenCalled();
    expect(screen.getByText("Lançamento incluído em dezembro/26")).toBeTruthy();
  });

  it("Nome e Valor obrigatórios", async () => {
    const m = montarRepo();
    renderizar(<Novo repo={m.repo} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Incluir" }));
    expect(screen.getByText(mensagem("lancamento.nome_vazio"))).toBeTruthy();
    expect(screen.getByText(mensagem("lancamento.valor_vazio"))).toBeTruthy();
    expect(m.incluir).not.toHaveBeenCalled();
  });

  it("Corrige a leitura da fatura: só com Fatura; marcada, o Cartão é obrigatório", async () => {
    const m = montarRepo();
    const aoIncluido = vi.fn();
    const { unmount } = renderizar(<Novo repo={m.repo} aoIncluido={aoIncluido} />);
    const u = userEvent.setup();
    const caixa = screen.getByRole("checkbox", { name: "Corrige a leitura da fatura" }) as HTMLInputElement;
    expect(caixa.checked).toBe(false);
    expect(screen.queryByLabelText("Cartão")).toBeNull();
    await u.click(caixa);
    await u.type(campo("Nome"), "AJUSTE");
    await u.type(campo("Valor"), "10,00");
    await u.click(screen.getByRole("button", { name: "Incluir" }));
    expect(screen.getByText("Escolha o cartão")).toBeTruthy();
    expect(m.incluir).not.toHaveBeenCalled();
    await u.selectOptions(screen.getByLabelText("Cartão"), "8673");
    await u.click(screen.getByRole("button", { name: "Incluir" }));
    expect(m.incluir).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "AJUSTE",
        valor_centavos: 1000,
        fatura_id: "f10",
        mes: "2026-10",
        final_cartao: "8673",
        lancado_por: "manual",
        status_id: "s-nao",
      }),
    );
    expect(aoIncluido).toHaveBeenCalledWith(expect.objectContaining({ id: "novo" }));
    unmount();
    renderizar(<Novo repo={m.repo} comFatura={false} />);
    expect(screen.queryByRole("checkbox", { name: "Corrige a leitura da fatura" })).toBeNull();
  });
});
