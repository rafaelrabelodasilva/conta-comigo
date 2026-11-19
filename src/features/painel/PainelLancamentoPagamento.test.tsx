// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Formula } from "@/domain/formula";
import type { LinhaLancamento, MudancaLancamento, RepoLancamentos } from "@/data/lancamentos-repo";
import { ToastProvider } from "@/ui/Toast";
import { PainelLancamento, type CadastrosPainel } from "./PainelLancamento";

// Aviso ao mexer num Lançamento com Pagamento (História 6.9, FR-46): o painel do Lançamento confirma antes de gravar
// o Valor (ou o Responsável, o Tipo e o Status) de uma linha com Pagamento, com o "de R$ X para R$ Y" do núcleo.

const sem = (t: string | null | undefined) => (t ?? "").replaceAll(" ", " ");
const T1 = "2026-11-08T00:00:00.000001+00:00";

// Os gerenciadores de TODOS os Meses são falsos: o teste manda o que cada um devolve.
const mem = vi.hoisted(() => ({
  todos: { status: "pronto", linhas: [] as unknown[] },
  itens: { status: "pronto", linhas: [] as unknown[] },
  pagamentos: { status: "pronto", linhas: [] as unknown[] },
  faturas: { status: "pronto", linhas: [] as unknown[] },
}));
vi.mock("@/data/realtime", () => ({
  useTodosOsLancamentos: () => mem.todos,
  useItensDoHistorico: () => mem.itens,
  useLinhas: (t: string) => (t === "pagamentos" ? mem.pagamentos : t === "faturas" ? mem.faturas : { status: "pronto", linhas: [] }),
}));

const linha = (extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id: "a",
    owner_id: "dono",
    nome: "NETFLIX",
    nome_normalizado: "NETFLIX",
    apelido: null,
    valor_centavos: 20000,
    data: "2026-10-03",
    parcela_n: null,
    parcela_total: null,
    final_cartao: "8673",
    mes: "2026-10",
    fatura_id: "f10",
    ordem_fatura: 1,
    duvida_extracao: false,
    lancado_por: "fatura",
    responsavel_id: "r-mae",
    tipo_id: "t-casa",
    status_id: "s-nao",
    observacao: null,
    editado_em: null,
    excluido_em: null,
    ajuste_de_id: null,
    dividido_de_id: null,
    divisao: null,
    revisao_motivo: null,
    revisao_dados: null,
    vencimento_combinado: null,
    created_at: T1,
    updated_at: T1,
    ...extra,
  }) as LinhaLancamento;

const cadastros = {
  responsaveis: [
    { id: "r-mae", nome: "Mãe", cor: 1, ordem: 1, arquivado: false },
    { id: "r-lucas", nome: "Lucas", cor: 2, ordem: 2, arquivado: false },
  ],
  tipos: [
    { id: "t-casa", nome: "Casa", arquivado: false },
    { id: "t-lazer", nome: "Lazer", arquivado: false },
  ],
  status: [
    { id: "s-nao", nome: "Não pago", conta_como_pago: false, arquivado: false },
    { id: "s-pago", nome: "Pago", conta_como_pago: true, arquivado: false },
  ],
} as unknown as CadastrosPainel;

const resp = (id: string): Formula => ({ tipo: "responsavel", id });
const contexto = {
  blocos: [
    { id: "b-mae", nome: "Mãe", formula: resp("r-mae"), ordem: 1, de_cobranca: true, meu_bloco: false },
    { id: "b-lucas", nome: "Lucas", formula: resp("r-lucas"), ordem: 2, de_cobranca: true, meu_bloco: false },
  ],
  statusPagos: new Set(["s-pago"]),
  hoje: "2026-11-15",
};

/** A linha `a` com um pagamento parcial de R$ 50,00 em 08/10/26 (Saldo da Mãe: R$ 150,00). */
function comPagamentoParcial(extra: Partial<LinhaLancamento> = {}) {
  const a = linha(extra);
  mem.todos = { status: "pronto", linhas: [a] };
  mem.itens = {
    status: "pronto",
    linhas: [{ id: "i1", pagamento_id: "p1", lancamento_id: "a", mes: "2026-10", valor_centavos: 5000, status_aplicado_id: null, excluido_em: null }],
  };
  mem.pagamentos = { status: "pronto", linhas: [{ id: "p1", data: "2026-10-08", modo: "parcial", valor_recebido_centavos: 5000, excluido_em: null }] };
  return a;
}

function montar(a: LinhaLancamento, extra: { semAviso?: boolean } = {}) {
  const atualizar = vi.fn(async (id: string, m: MudancaLancamento) => ({
    ok: true as const,
    linha: { ...a, ...m, id, updated_at: "2026-11-08T00:14:00.000002+00:00" } as LinhaLancamento,
  }));
  const repo = {
    atualizar,
    propagarAosPrevistos: vi.fn(async () => ({ ok: true as const, preenchidos: 0, aPerguntar: [] })),
  } as unknown as RepoLancamentos;
  render(
    <PainelLancamento
      modo="editar"
      linha={a}
      conferencia={null}
      cadastros={cadastros}
      statusPagos={contexto.statusPagos}
      comPagamento={extra.semAviso ? new Set() : new Set(["a"])}
      contextoDoAviso={extra.semAviso ? undefined : contexto}
      aoFechar={() => {}}
      aoExcluir={() => {}}
      repo={repo}
    />,
    { wrapper: ToastProvider },
  );
  return { atualizar };
}

async function digitarValor(texto: string) {
  const u = userEvent.setup();
  const campo = screen.getByLabelText("Valor") as HTMLInputElement;
  await u.clear(campo);
  await u.type(campo, texto);
  await u.tab();
  return u;
}

beforeEach(() => {
  mem.todos = { status: "pronto", linhas: [] };
  mem.itens = { status: "pronto", linhas: [] };
  mem.pagamentos = { status: "pronto", linhas: [] };
  mem.faturas = { status: "pronto", linhas: [] };
});

describe("painel do Lançamento: aviso ao mexer no que já tem Pagamento (6.9)", () => {
  it("o Valor de uma linha com Pagamento pede confirmação, com o Saldo de antes e de depois, e só grava ao confirmar", async () => {
    const { atualizar } = montar(comPagamentoParcial());
    const u = await digitarValor("300,00");
    const janela = await screen.findByRole("alertdialog");
    expect(sem(janela.textContent)).toContain(
      "Este lançamento tem pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 150,00 para R$ 250,00.",
    );
    expect(atualizar).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Mudar mesmo assim" }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar).toHaveBeenCalledWith("a", { valor_centavos: 30000 });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Cancelar não grava e o campo volta ao Valor gravado", async () => {
    const { atualizar } = montar(comPagamentoParcial());
    const u = await digitarValor("300,00");
    await screen.findByRole("alertdialog");
    await u.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(atualizar).not.toHaveBeenCalled();
    expect(sem((screen.getByLabelText("Valor") as HTMLInputElement).value)).toBe("R$ 200,00");
  });

  it("uma linha paga por inteiro: o Valor muda mas nenhum Saldo, e o aviso diz isso (o Pagamento deixa de bater)", async () => {
    const a = comPagamentoParcial({ status_id: "s-pago" });
    mem.itens = {
      status: "pronto",
      linhas: [{ id: "i1", pagamento_id: "p1", lancamento_id: "a", mes: "2026-10", valor_centavos: 20000, status_aplicado_id: "s-pago", excluido_em: null }],
    };
    const { atualizar } = montar(a);
    await digitarValor("250,00");
    const janela = await screen.findByRole("alertdialog");
    expect(sem(janela.textContent)).toContain("Este lançamento tem pagamento registrado em 08/10/26. Nenhum Saldo pendente muda.");
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("mudar o Responsável de uma linha parcialmente paga move o Saldo de dois Blocos: o aviso traz os dois", async () => {
    const { atualizar } = montar(comPagamentoParcial());
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Responsável"), "r-lucas");
    const janela = await screen.findByRole("alertdialog");
    expect(sem(janela.textContent)).toContain(
      "O Saldo pendente do Bloco Mãe muda de R$ 150,00 para R$ 0,00; o do Bloco Lucas muda de R$ 0,00 para R$ 150,00.",
    );
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("uma mudança que não mexe no Valor nem em Saldo nenhum (o Tipo) segue direto, sem janela", async () => {
    const { atualizar } = montar(comPagamentoParcial());
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Tipo"), "t-lazer");
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("a", { tipo_id: "t-lazer" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("uma linha sem Pagamento grava direto, mesmo mudando o Valor", async () => {
    const { atualizar } = montar(linha(), { semAviso: true });
    await digitarValor("300,00");
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("a", { valor_centavos: 30000 }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("enquanto os pagamentos de todos os Meses leem, a janela diz 'Conferindo…' e não deixa confirmar", async () => {
    const a = comPagamentoParcial();
    mem.todos = { status: "carregando", linhas: [] };
    const { atualizar } = montar(a);
    await digitarValor("300,00");
    const janela = await screen.findByRole("alertdialog");
    expect(janela.textContent).toContain("Conferindo os pagamentos já registrados…");
    expect((screen.getByRole("button", { name: "Mudar mesmo assim" }) as HTMLButtonElement).disabled).toBe(true);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("se a leitura falha, a janela avisa que não conferiu e deixa confirmar", async () => {
    const a = comPagamentoParcial();
    mem.pagamentos = { status: "erro", linhas: [] };
    const { atualizar } = montar(a);
    const u = await digitarValor("300,00");
    const janela = await screen.findByRole("alertdialog");
    expect(janela.textContent).toContain("não foi possível conferir o efeito nos Saldos pendentes");
    await u.click(screen.getByRole("button", { name: "Mudar mesmo assim" }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("a", { valor_centavos: 30000 }));
  });
});
