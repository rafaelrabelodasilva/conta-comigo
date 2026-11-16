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
  statusPagos,
  quitadasPorPagamento,
  faltaCentavos,
}: {
  m: ReturnType<typeof montarRepo>;
  conferencia?: Conferencia | null;
  aoExcluir?: (id: string) => void;
  statusPagos?: ReadonlySet<string>;
  quitadasPorPagamento?: ReadonlySet<string>;
  faltaCentavos?: number | null;
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
      statusPagos={statusPagos}
      quitadasPorPagamento={quitadasPorPagamento}
      faltaCentavos={faltaCentavos}
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

  it("Valor 'abc': erro no campo (aria-describedby), o texto fica e nada grava; '0,00' grava zero", async () => {
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
    // Zero vale (História 2.8): o erro some e grava R$ 0,00.
    await u.clear(campo("Valor"));
    await u.type(campo("Valor"), "0,00");
    await u.tab();
    expect(m.atualizar).toHaveBeenLastCalledWith("a", { valor_centavos: 0 });
    expect(campo("Valor").getAttribute("aria-invalid")).toBeNull();
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

describe("Ajustes de centavos (História 2.8)", () => {
  const mae = linha({
    id: "msc",
    nome: "MSC CRUZEIROS",
    nome_normalizado: "MSC CRUZEIROS",
    valor_centavos: 114074,
    parcela_n: 2,
    parcela_total: 12,
    final_cartao: "5061",
    tipo_id: "t-casa",
    responsavel_id: "r-casal",
  });
  const ajuste = linha({
    id: "aj",
    nome: "MSC CRUZEIROS",
    nome_normalizado: "MSC CRUZEIROS",
    valor_centavos: -8,
    parcela_n: null,
    parcela_total: null,
    final_cartao: "5061",
    ordem_fatura: 2,
    tipo_id: "t-casa",
    responsavel_id: "r-casal",
    ajuste_de_id: "msc",
  });

  function repoFalso() {
    const gravada = (id: string, extra: Partial<LinhaLancamento>) =>
      ({ ok: true as const, linha: { ...(id === "msc" ? mae : ajuste), ...extra, updated_at: T2 } });
    return {
      atualizar: vi.fn(async (id: string, m: MudancaLancamento) => gravada(id, m)),
      desvincular: vi.fn(async (id: string) => gravada(id, { ajuste_de_id: null }) as ResultadoLancamento),
      religar: vi.fn(async (id: string, m: { id: string }) => gravada(id, { ajuste_de_id: m.id })),
      incluir: vi.fn(),
      excluir: vi.fn(),
      restaurar: vi.fn(),
    };
  }

  it("painel do Ajuste: Tipo e Responsável só para leitura ('Segue a parcela'), o resto editável, e Desvincular ao lado de Excluir", () => {
    const repo = repoFalso();
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={ajuste}
        mae={{ ...mae, apelido: "Cruzeiro" }}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        repo={repo as unknown as RepoLancamentos}
      />,
    );
    const painel = screen.getByRole("complementary");
    const rotulos = [...painel.querySelectorAll("label")].map((l) => l.textContent);
    expect(rotulos).toEqual(["Valor", "Data da compra", "Apelido", "Status", "Observação"]);
    expect(screen.queryByRole("combobox", { name: "Tipo" })).toBeNull();
    expect(screen.getByText("Segue a parcela Cruzeiro")).toBeTruthy();
    expect(screen.getByText("Casal")).toBeTruthy();
    expect(screen.getByText("Casa")).toBeTruthy();
    const botoes = within(painel).getAllByRole("button").map((b) => b.textContent);
    expect(botoes.slice(-2)).toEqual(["Desvincular", "Excluir"]);
  });

  it("Desvincular: grava, toast 'Desvinculado · Desfazer'; Desfazer religa com a classificação atual da mãe", async () => {
    const repo = repoFalso();
    const maeAtual = { ...mae, tipo_id: null, responsavel_id: "r-rafael" };
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={ajuste}
        mae={mae}
        lerLinha={(id) => (id === "msc" ? maeAtual : undefined)}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        repo={repo as unknown as RepoLancamentos}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    await screen.findByText("Desvinculado");
    expect(repo.desvincular).toHaveBeenCalledWith("aj");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await vi.waitFor(() => expect(repo.religar).toHaveBeenCalledWith("aj", maeAtual));
  });

  it("Desvincular que falha: toast salvar.falhou", async () => {
    const repo = repoFalso();
    repo.desvincular.mockResolvedValueOnce({ ok: false, codigo: "salvar.falhou" });
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={ajuste}
        mae={mae}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        repo={repo as unknown as RepoLancamentos}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(screen.queryByText("Desvinculado")).toBeNull();
  });

  it("painel da mãe: a linha do Ajuste com o líquido; Tipo e Responsável gravam a mãe e os Ajustes juntos", async () => {
    const repo = repoFalso();
    renderizar(
      <PainelLancamento
        modo="editar"
        linha={mae}
        ajustes={[ajuste]}
        conferencia={null}
        cadastros={cadastros}
        aoFechar={() => {}}
        aoExcluir={() => {}}
        repo={repo as unknown as RepoLancamentos}
      />,
    );
    expect(screen.getByText((_, el) => el?.tagName === "P" && sem(el.textContent) === "Ajuste - R$ 0,08 · líquido R$ 1.140,66")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Desvincular" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Responsável"), { target: { value: "r-rafael" } });
    await vi.waitFor(() =>
      expect(repo.atualizar).toHaveBeenCalledWith("msc", { responsavel_id: "r-rafael" }, { junto: ["aj"] }),
    );
    // Status não acompanha: só a mãe.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "s-pago" } });
    await vi.waitFor(() => expect(repo.atualizar).toHaveBeenLastCalledWith("msc", { status_id: "s-pago" }));
  });
});

describe("sugestão da fila (História 3.1)", () => {
  const dados = (extra: object) => ({ responsavel_id: null, tipo_id: null, outros_responsaveis: [], ...extra });

  it("sugestão com dúvida: 'Sugestão: Casal · Casa (às vezes Rafael)' sob os seletores, que seguem vazios", () => {
    const m = montarRepo();
    m.memoria.atual = linha({
      revisao_motivo: "sugestao_duvida",
      revisao_dados: dados({ responsavel_id: "r-casal", tipo_id: "t-casa", outros_responsaveis: ["r-rafael", "r-sumiu"] }),
    });
    renderizar(<Editar m={m} />);
    const texto = screen.getByText("Sugestão: Casal · Casa (às vezes Rafael)");
    expect(texto.id).not.toBe("");
    for (const rotulo of ["Responsável", "Tipo"]) {
      expect(screen.getByLabelText(rotulo).getAttribute("aria-describedby")).toBe(texto.id);
    }
    expect((screen.getByLabelText("Responsável") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Tipo") as HTMLSelectElement).value).toBe("");
  });

  it("só o Tipo sugerido: 'Sugestão: Casa'", () => {
    const m = montarRepo();
    m.memoria.atual = linha({ revisao_motivo: "sugestao", revisao_dados: dados({ tipo_id: "t-casa" }) });
    renderizar(<Editar m={m} />);
    expect(screen.getByText("Sugestão: Casa")).toBeTruthy();
  });

  it("sem sugestão (sem_classificacao, fora da fila ou cadastro que não existe mais): nada", () => {
    for (const extra of [
      { revisao_motivo: "sem_classificacao", revisao_dados: null },
      { revisao_motivo: null, revisao_dados: dados({ tipo_id: "t-casa" }) },
      { revisao_motivo: "sugestao", revisao_dados: dados({ tipo_id: "t-sumiu" }) },
    ] as const) {
      const m = montarRepo();
      m.memoria.atual = linha(extra as Partial<LinhaLancamento>);
      const { unmount } = renderizar(<Editar m={m} />);
      expect(screen.queryByText(/^Sugestão:/)).toBeNull();
      expect(screen.getByLabelText("Tipo").hasAttribute("aria-describedby")).toBe(false);
      unmount();
    }
  });

  it("cadastro arquivado não aparece na sugestão", () => {
    const m = montarRepo();
    m.memoria.atual = linha({
      revisao_motivo: "sugestao_duvida",
      revisao_dados: dados({ responsavel_id: "r-antigo", tipo_id: "t-casa", outros_responsaveis: ["r-casal", "r-antigo"] }),
    });
    renderizar(<Editar m={m} />);
    expect(screen.getByText("Sugestão: Casa (às vezes Casal)")).toBeTruthy();
    expect(screen.queryByText(/Antigo/)).toBeNull();
  });
});

describe("previstos (História 3.5)", () => {
  const previsto = (extra: Partial<LinhaLancamento> = {}) =>
    linha({
      lancado_por: "sistema",
      fatura_id: null,
      final_cartao: null,
      nome: "MAGALU",
      parcela_n: 6,
      parcela_total: 10,
      mes: "2026-11",
      origem_lancamento_id: "origem",
      ...extra,
    } as Partial<LinhaLancamento>);

  it("o previsto mostra o selo e a origem lida do banco", async () => {
    const m = montarRepo();
    m.memoria.atual = previsto();
    const lerOrigem = vi.fn(async () => ({
      ok: true as const,
      origem: { nome: "MAGALU", parcela_n: 5, parcela_total: 10, vencimento: "2026-10-06" },
    }));
    (m.repo as unknown as { lerOrigem: typeof lerOrigem }).lerOrigem = lerOrigem;
    renderizar(<Editar m={m} />);
    expect(await screen.findByText("criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26")).toBeTruthy();
    expect(lerOrigem).toHaveBeenCalledWith("origem");
    expect(document.querySelector("[data-previsto]")?.textContent).toBe("Previsto");
  });

  it("origem apagada na reimportação: frase genérica, sem consultar o banco", () => {
    const m = montarRepo();
    m.memoria.atual = previsto({ origem_lancamento_id: null } as Partial<LinhaLancamento>);
    const lerOrigem = vi.fn();
    (m.repo as unknown as { lerOrigem: typeof lerOrigem }).lerOrigem = lerOrigem;
    renderizar(<Editar m={m} />);
    expect(screen.getByText("criado a partir de uma parcela anterior desta compra")).toBeTruthy();
    expect(lerOrigem).not.toHaveBeenCalled();
  });

  it("linha da fatura não tem selo nem origem", () => {
    const m = montarRepo();
    renderizar(<Editar m={m} />);
    expect(document.querySelector("[data-previsto]")).toBeNull();
  });

  function comSerie(m: ReturnType<typeof montarRepo>, respostas: { aPerguntar: { id: string; corpo: object }[] }) {
    m.memoria.atual = linha({ serie_id: "s1", responsavel_id: "r-rafael" } as Partial<LinhaLancamento>);
    const propagar = vi.fn(async () => ({ ok: true as const, preenchidos: 0, aPerguntar: respostas.aPerguntar }));
    const aplicar = vi.fn(async (itens: unknown[]) => ({ ok: true as const, gravados: itens.length }));
    Object.assign(m.repo, { propagarAosPrevistos: propagar, aplicarAosPrevistos: aplicar });
    return { propagar, aplicar };
  }

  it("mudar o Responsável de uma parcela com Série propaga; sem previstos com outro valor, não pergunta", async () => {
    const m = montarRepo();
    const { propagar } = comSerie(m, { aPerguntar: [] });
    renderizar(<Editar m={m} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Responsável"), "r-casal");
    expect(propagar).toHaveBeenCalledWith([
      {
        serie_id: "s1",
        parcela_n: 5,
        lancado_por: "fatura",
        antes: { responsavel_id: "r-rafael", tipo_id: null },
        depois: { responsavel_id: "r-casal", tipo_id: null },
      },
    ]);
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("previstos com outro valor: a faixa pergunta; 'Aplicar a todos' grava e avisa; 'Só este' não grava", async () => {
    const pend = [
      { id: "p6", corpo: { responsavel_id: "r-casal" } },
      { id: "p7", corpo: { responsavel_id: "r-casal" } },
    ];
    const m = montarRepo();
    const { aplicar } = comSerie(m, { aPerguntar: pend });
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Responsável"), "r-casal");
    const faixa = await screen.findByRole("group", { name: "Aplicar também aos 2 previstos desta compra?" });
    await u.click(within(faixa).getByRole("button", { name: "Aplicar a todos" }));
    expect(aplicar).toHaveBeenCalledWith(pend);
    expect(await screen.findByText("2 previstos atualizados")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("'Só este' fecha a faixa sem gravar nada", async () => {
    const m = montarRepo();
    const { aplicar } = comSerie(m, { aPerguntar: [{ id: "p6", corpo: { responsavel_id: "r-casal" } }] });
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Responsável"), "r-casal");
    const faixa = await screen.findByRole("group", { name: "Aplicar também ao 1 previsto desta compra?" });
    await u.click(within(faixa).getByRole("button", { name: "Só este" }));
    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /previstos/ })).toBeNull();
  });

  it("mudar o Status ou o Valor não propaga", async () => {
    const m = montarRepo();
    const { propagar } = comSerie(m, { aPerguntar: [] });
    renderizar(<Editar m={m} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Status"), "s-pago");
    expect(propagar).not.toHaveBeenCalled();
  });
});

describe("painel do Lançamento: Status numa linha com Pagamento (História 6.1, AD-10)", () => {
  const pagos = new Set(["s-pago"]);
  const quitadasPorPagamento = new Set(["a"]);
  const paga = () => linha({ status_id: "s-pago" });

  it("aplicar à mão um Status 'não pago' (ou 'Sem status') numa linha com Pagamento é recusado: desfaça o pagamento antes", async () => {
    const m = montarRepo();
    m.memoria.atual = paga();
    renderizar(<Editar m={m} statusPagos={pagos} quitadasPorPagamento={quitadasPorPagamento} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Status"), "s-nao");
    expect(m.atualizar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(mensagem("pagamento.desfazer_antes"));
    // O seletor volta ao Status gravado.
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("s-pago");
    await u.selectOptions(screen.getByLabelText("Status"), "");
    expect(m.atualizar).not.toHaveBeenCalled();
  });

  it("outro Status que conta como pago passa, e o aviso some", async () => {
    const m = montarRepo();
    m.memoria.atual = paga();
    renderizar(<Editar m={m} statusPagos={new Set(["s-pago", "s-nao"])} quitadasPorPagamento={quitadasPorPagamento} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Status"), "");
    expect(screen.getByRole("alert")).toBeTruthy();
    await u.selectOptions(screen.getByLabelText("Status"), "s-nao");
    expect(m.atualizar).toHaveBeenCalledWith("a", { status_id: "s-nao" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uma linha parcialmente paga (não paga, item parcial) troca de 'não pago' para 'Em análise' sem recusa", async () => {
    const m = montarRepo();
    m.memoria.atual = linha({ status_id: "s-nao" });
    // O item parcial não aplicou Status: a linha não está em `quitadasPorPagamento`.
    renderizar(<Editar m={m} statusPagos={pagos} quitadasPorPagamento={new Set()} faltaCentavos={11516} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Status"), "");
    expect(m.atualizar).toHaveBeenCalledWith("a", { status_id: null });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Pago parcialmente: o painel mostra o selo e 'falta R$ X' (derivado), e some quando não falta mais", () => {
    const m = montarRepo();
    m.memoria.atual = linha({ status_id: "s-nao" });
    const { rerender } = renderizar(<Editar m={m} statusPagos={pagos} faltaCentavos={11516} />);
    expect(screen.getByText("Pago parcialmente")).toBeTruthy();
    expect(sem(document.body.textContent)).toContain("falta R$ 115,16");
    rerender(<Editar m={m} statusPagos={pagos} faltaCentavos={null} />);
    expect(screen.queryByText("Pago parcialmente")).toBeNull();
  });

  it("sem Pagamento, o Status não pago se aplica normalmente", async () => {
    const m = montarRepo();
    m.memoria.atual = paga();
    renderizar(<Editar m={m} statusPagos={pagos} quitadasPorPagamento={new Set()} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Status"), "s-nao");
    expect(m.atualizar).toHaveBeenCalledWith("a", { status_id: "s-nao" });
  });
});

describe("painel do Lançamento: Apelido em massa (História 3.9)", () => {
  const plano = (mudam: number, comOutro = 0) => ({
    itens: [{ id: "x", corpo: { apelido: "Pedras" } }],
    antes: [{ id: "x", corpo: { apelido: null, editado_em: null } }],
    mudam,
    comOutro,
  });
  function comPlano(m: ReturnType<typeof montarRepo>, p: ReturnType<typeof plano>) {
    const planejar = vi.fn(async () => ({ ok: true as const, plano: p }));
    const aplicar = vi.fn(async () => ({ ok: true as const, gravadas: 1 }));
    Object.assign(m.repo, { planejarApelido: planejar, aplicarApelido: aplicar });
    return { planejar, aplicar };
  }
  async function digitar(u: ReturnType<typeof userEvent.setup>, texto: string) {
    await u.click(campo("Apelido"));
    await u.type(campo("Apelido"), texto);
    await u.tab();
  }

  it("dar Apelido: lê as outras linhas do Nome e pergunta com a contagem", async () => {
    const m = montarRepo();
    const { planejar } = comPlano(m, plano(12, 2));
    renderizar(<Editar m={m} />);
    await digitar(userEvent.setup(), "Pedras");
    await screen.findByRole("group", {
      name: "Aplicar a 12 lançamentos de BELLA PIETRA? 2 já têm outro Apelido e serão trocados.",
    });
    expect(planejar).toHaveBeenCalledWith({ id: "a", nome_normalizado: "BELLA PIETRA" }, "Pedras");
  });

  it("'Aplicar a todos' grava os itens do plano e o toast 'Desfazer' devolve o retrato de antes", async () => {
    const m = montarRepo();
    const p = plano(3);
    const { aplicar } = comPlano(m, p);
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await digitar(u, "Pedras");
    const faixa = await screen.findByRole("group", { name: "Aplicar a 3 lançamentos de BELLA PIETRA?" });
    await u.click(within(faixa).getByRole("button", { name: "Aplicar a todos" }));
    expect(aplicar).toHaveBeenCalledWith(p.itens);
    expect(await screen.findByText("Apelido aplicado a 3 lançamentos")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /lançamentos de/ })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(aplicar).toHaveBeenLastCalledWith(p.antes);
  });

  it("'Só este' fecha a pergunta sem gravar nas outras", async () => {
    const m = montarRepo();
    const { aplicar } = comPlano(m, plano(1));
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await digitar(u, "Pedras");
    const faixa = await screen.findByRole("group", { name: "Aplicar a 1 lançamento de BELLA PIETRA?" });
    await u.click(within(faixa).getByRole("button", { name: "Só este" }));
    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /lançamento de/ })).toBeNull();
  });

  it("remover o Apelido: a pergunta fala em remover", async () => {
    const m = montarRepo();
    m.memoria.atual = linha({ apelido: "Pedras" });
    comPlano(m, plano(4));
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.clear(campo("Apelido"));
    await u.tab();
    await screen.findByRole("group", { name: "Remover o Apelido de 4 lançamentos de BELLA PIETRA?" });
  });

  it("sem outras linhas que mudem: não pergunta; o Apelido da linha já foi gravado", async () => {
    const m = montarRepo();
    comPlano(m, plano(0));
    renderizar(<Editar m={m} />);
    await digitar(userEvent.setup(), "Pedras");
    await vi.waitFor(() => expect(m.atualizar).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: /lançamento/ })).toBeNull();
  });

  it("falha ao ler as outras linhas: sem pergunta e sem erro", async () => {
    const m = montarRepo();
    Object.assign(m.repo, { planejarApelido: vi.fn(async () => ({ ok: false as const, codigo: "salvar.falhou" })) });
    renderizar(<Editar m={m} />);
    await digitar(userEvent.setup(), "Pedras");
    await vi.waitFor(() => expect(m.atualizar).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: /lançamento/ })).toBeNull();
  });

  it("mudar outro campo (Observação) não pergunta nada de Apelido", async () => {
    const m = montarRepo();
    const { planejar } = comPlano(m, plano(5));
    renderizar(<Editar m={m} />);
    const u = userEvent.setup();
    await u.click(campo("Observação"));
    await u.type(campo("Observação"), "x");
    await u.tab();
    await vi.waitFor(() => expect(m.atualizar).toHaveBeenCalled());
    expect(planejar).not.toHaveBeenCalled();
  });
});
