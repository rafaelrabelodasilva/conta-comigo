// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_AVISOS as T, TEXTOS_LEMBRETES as L, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { Avisos } from "./Avisos";

// A Central de Avisos (História 8.1, FR-55): a tela `/avisos`. As contas são do núcleo (`avisos.test.ts`); aqui se prova a
// fiação com o hook de verdade: o texto, a ordem, o estado em texto, "Marcar como lido" e "Marcar tudo", o foco, os `role`,
// carregando, erro, vazio e a tabela `avisos_lidos` ausente. Os gerenciadores de Realtime e o repositório são falsos e o
// relógio é o de verdade, congelado com `vi.setSystemTime` (o `useHoje` real).

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn(),
  marcar: vi.fn(),
  marcarUm: vi.fn(),
}));

vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const assinar = (o: () => void) => {
    falso.ouvintes.add(o);
    return () => falso.ouvintes.delete(o);
  };
  const cache = new Map<string, { versao: number; retrato: unknown }>();
  const retrato = (tabela: string) => {
    const guardado = cache.get(tabela);
    if (guardado && guardado.versao === falso.versao) return guardado.retrato;
    const novo = { status: falso.status[tabela] ?? "pronto", linhas: falso.banco[tabela] ?? [] };
    cache.set(tabela, { versao: falso.versao, retrato: novo });
    return novo;
  };
  const useTabela = (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela), () => retrato(tabela));
  return {
    useLinhas: (tabela: string) => useTabela(tabela),
    useTodosOsLancamentos: () => useTabela("lancamentos"),
    useItensDoHistorico: () => useTabela("pagamento_itens"),
    gerenciador: () => ({ recarregar: falso.recarregar }),
    gerenciadorTodosOsLancamentos: () => ({ recarregar: falso.recarregar }),
    gerenciadorItensDoHistorico: () => ({ recarregar: falso.recarregar }),
  };
});
vi.mock("@/data/avisos-repo", () => ({ repoAvisos: () => ({ marcar: falso.marcar, marcarUm: falso.marcarUm }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, onClick, ...resto }: { href: string; children: React.ReactNode; onClick?: () => void }) =>
      React.createElement(
        "a",
        {
          href,
          ...resto,
          // O roteador do Next navega no cliente; aqui o toque só precisa chegar ao `onClick`.
          onClick: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            onClick?.();
          },
        },
        children,
      ),
  };
});

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const bloco = (id: string, nome: string, responsavel: string, ordem: number) => ({
  id,
  nome,
  formula: { tipo: "responsavel", id: responsavel },
  ordem,
  de_cobranca: true,
  meu_bloco: false,
});

const lancamento = (id: string, responsavel: string, valor: number, extra: Record<string, unknown> = {}) => ({
  id,
  mes: "2026-10",
  excluido_em: null,
  valor_centavos: valor,
  responsavel_id: responsavel,
  tipo_id: "casa",
  status_id: NAO_PAGO,
  lancado_por: "fatura",
  ...extra,
});

const CICLO = [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }];
const STATUS = [
  { id: PAGO, nome: "Pago", conta_como_pago: true },
  { id: NAO_PAGO, nome: "Não pago", conta_como_pago: false },
];

/** Os quatro Blocos da tela do Rafael, todos atrasados desde 17/10/26. */
const QUATRO_BLOCOS = [
  bloco("b-rangel", "Rangel", "rangel", 1),
  bloco("b-mae", "Mãe", "mae", 2),
  bloco("b-lucas", "Lucas", "lucas", 3),
  bloco("b-casal", "Casal", "casal", 4),
];
const LANCAMENTOS_DOS_QUATRO = [
  lancamento("l1", "rangel", 526_347),
  lancamento("l2", "mae", 178_373),
  lancamento("l3", "lucas", 11_516),
  lancamento("l4", "casal", 5_000),
];

function hoje(dia: string) {
  // 15:00 UTC (12:00 em São Paulo): o dia não depende do fuso do computador.
  vi.setSystemTime(new Date(`${dia}T15:00:00Z`));
}

function guardar(tabela: string, linhas: unknown[]) {
  falso.banco[tabela] = linhas;
}

function mudou() {
  act(() => {
    falso.versao += 1;
    for (const o of [...falso.ouvintes]) o();
  });
}

const lidaDe = (tipo: string, referencia: string, dia: string, id = `${tipo}-${referencia}`) => ({
  id,
  owner_id: "dono",
  tipo,
  referencia,
  dia,
  created_at: "2026-11-19T12:00:00Z",
  updated_at: "2026-11-19T12:00:00Z",
});

function montar() {
  const usuario = userEvent.setup();
  render(
    <ToastProvider>
      <Avisos />
    </ToastProvider>,
  );
  return usuario;
}

const linhas = () => screen.queryAllByRole("listitem");
const textoDeLinha = (i: number) => sem(linhas()[i].textContent);
const botoesDeMarcar = () => screen.queryAllByRole("button", { name: /^Marcar como lido: / });
const marcarTudo = () => screen.getByRole("button", { name: new RegExp(`^(${T.marcar_tudo}|${T.marcando_tudo})$`) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  hoje("2026-11-19");
  falso.banco = {};
  falso.status = {};
  falso.versao += 1; // nunca volta a 0: o cache do mock é por versão e vive entre os testes
  falso.recarregar.mockReset();
  // O repositório falso grava na "tabela" e avisa (como o Realtime); as chaves vêm de `AvisoDaCentral["chave"]`.
  falso.marcarUm.mockReset().mockImplementation(async (c: { tipo: string; referencia: string; dia: string }) => {
    guardar("avisos_lidos", [...(falso.banco.avisos_lidos ?? []), lidaDe(c.tipo, c.referencia, c.dia)]);
    mudou();
    return { ok: true };
  });
  falso.marcar.mockReset().mockImplementation(async (cs: { tipo: string; referencia: string; dia: string }[]) => {
    guardar("avisos_lidos", [...(falso.banco.avisos_lidos ?? []), ...cs.map((c) => lidaDe(c.tipo, c.referencia, c.dia))]);
    mudou();
    return { ok: true };
  });
  guardar("config_ciclo", CICLO);
  guardar("status", STATUS);
  guardar("faturas", [
    { mes: "2026-10", vencimento: "2026-10-06" },
    { mes: "2026-11", vencimento: "2026-11-06" },
  ]);
  guardar("blocos", QUATRO_BLOCOS);
  guardar("lancamentos", LANCAMENTOS_DOS_QUATRO);
  guardar("pagamento_itens", []);
  guardar("configuracoes", []);
  guardar("avisos_lidos", []);
});
afterEach(() => vi.useRealTimers());

describe("Central de Avisos: a lista", () => {
  it("mostra TODOS os Blocos atrasados (sem o limite de 3), com nome, valor e a data, sem artigo", () => {
    montar();
    expect(linhas()).toHaveLength(4);
    expect(linhas().map((_, i) => textoDeLinha(i))).toEqual([
      expect.stringContaining("Rangel: R$ 5.263,47 em atraso desde 17/10/26"),
      expect.stringContaining("Mãe: R$ 1.783,73 em atraso desde 17/10/26"),
      expect.stringContaining("Lucas: R$ 115,16 em atraso desde 17/10/26"),
      expect.stringContaining("Casal: R$ 50,00 em atraso desde 17/10/26"),
    ]);
    expect(screen.queryByText(/E mais/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bO (Mãe|Rangel|Lucas|Casal)\b/);
  });

  it("cada linha diz o estado em texto ('Novo'), o destino em palavras e tem 'Marcar como lido'", () => {
    montar();
    for (const li of linhas()) {
      expect(within(li).getByText(T.estado_novo)).toBeTruthy();
      expect(within(li).getByText(L.abrir_recebimentos)).toBeTruthy();
      expect(within(li).getByRole("button", { name: /^Marcar como lido: / })).toBeTruthy();
      expect(within(li).getByRole("link").getAttribute("href")).toBe("/recebimentos");
    }
    // Alvos de 44 pt.
    expect(linhas().map((li) => within(li).getByRole("link").className)).toEqual(Array(4).fill(expect.stringContaining("min-h-toque")));
    expect(botoesDeMarcar().map((b) => b.className)).toEqual(Array(4).fill(expect.stringContaining("min-h-toque")));
  });

  it("o fechamento abre o Painel do Mês, em palavras, e vem antes dos Blocos", () => {
    hoje("2026-10-28");
    guardar("faturas", [{ mes: "2026-10", vencimento: "2026-10-06" }]);
    montar();
    expect(textoDeLinha(0)).toContain("A fatura de novembro fechou. Importe o PDF quando chegar");
    expect(within(linhas()[0]).getByText(L.abrir_painel)).toBeTruthy();
    expect(within(linhas()[0]).getByRole("link").getAttribute("href")).toBe("/?mes=2026-11");
    expect(textoDeLinha(1)).toContain("Rangel:");
  });

  it("não lidos primeiro, os lidos por último, marcados como 'Lido' e sem botão", () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-rangel", "2026-10-17"), lidaDe("atraso", "b-lucas", "2026-10-17")]);
    montar();
    expect(linhas().map((_, i) => textoDeLinha(i).split(":")[0].replace(/^(Novo|Lido)/, ""))).toEqual(["Mãe", "Casal", "Rangel", "Lucas"]);
    expect(within(linhas()[0]).getByText(T.estado_novo)).toBeTruthy();
    expect(within(linhas()[2]).getByText(T.estado_lido)).toBeTruthy();
    expect(within(linhas()[2]).queryByRole("button")).toBeNull();
    expect(botoesDeMarcar()).toHaveLength(2);
  });

  it("o atraso que continua e já foi lido fica lido; um 'desde' novo volta como Novo", () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-lucas", "2026-10-17")]);
    montar();
    expect(within(linhas()[3]).getByText(T.estado_lido)).toBeTruthy();
    // O Lucas quitou outubro e atrasou de novo em novembro (vence 06/11 + 10 + 1 = 17/11).
    guardar("lancamentos", [
      lancamento("l1", "rangel", 526_347),
      lancamento("l2", "mae", 178_373),
      lancamento("l3", "lucas", 11_516, { status_id: PAGO }),
      lancamento("l5", "lucas", 3_000, { mes: "2026-11" }),
      lancamento("l4", "casal", 5_000),
    ]);
    mudou();
    const dolucas = linhas().find((li) => textoDeLinha(linhas().indexOf(li)).includes("Lucas:"))!;
    expect(sem(dolucas.textContent)).toContain("Lucas: R$ 30,00 em atraso desde 17/11/26");
    expect(within(dolucas).getByText(T.estado_novo)).toBeTruthy();
  });

  it("o resumo do topo: '4 avisos novos' e '4 Blocos com itens atrasados' (só a contagem, sem soma)", () => {
    montar();
    expect(screen.getByText("4 avisos novos")).toBeTruthy();
    expect(screen.getByText("4 Blocos com itens atrasados")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/soma dos Blocos/);
  });

  it("o resumo acompanha: lido não conta como novo, mas o Bloco continua atrasado", () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-rangel", "2026-10-17")]);
    montar();
    expect(screen.getByText("3 avisos novos")).toBeTruthy();
    expect(screen.getByText("4 Blocos com itens atrasados")).toBeTruthy();
  });

  it("tipo desligado em Configurações: não aparece na Central", () => {
    guardar("configuracoes", [{ id: "c", lembrete_atraso: false, lembrete_fechamento: true }]);
    montar();
    expect(linhas()).toHaveLength(0);
    expect(screen.getByText(T.vazio)).toBeTruthy();
  });

  it("virada do dia: o app aberto às 23:50 de 16/11 sem aviso mostra o atraso às 00:05 de 17/11", () => {
    guardar("lancamentos", [lancamento("l3", "lucas", 11_516, { mes: "2026-11" })]);
    guardar("blocos", [bloco("b-lucas", "Lucas", "lucas", 1)]);
    vi.setSystemTime(new Date("2026-11-16T23:50:00-03:00"));
    montar();
    expect(linhas()).toHaveLength(0);
    act(() => {
      vi.setSystemTime(new Date("2026-11-17T00:05:00-03:00"));
      vi.advanceTimersByTime(60_000);
    });
    expect(linhas()).toHaveLength(1);
    expect(textoDeLinha(0)).toContain("Lucas: R$ 115,16 em atraso desde 17/11/26");
  });
});

describe("Central de Avisos: marcar como lido", () => {
  it("'Marcar como lido' marca só aquele aviso, sem sair da tela", async () => {
    const usuario = montar();
    await usuario.click(botoesDeMarcar()[1]);
    expect(falso.marcarUm).toHaveBeenCalledTimes(1);
    expect(falso.marcarUm).toHaveBeenCalledWith({ tipo: "atraso", referencia: "b-mae", dia: "2026-10-17" });
    expect(falso.marcar).not.toHaveBeenCalled();
    // O aviso foi para o fim, como Lido, e o resumo acompanhou.
    expect(textoDeLinha(3)).toContain("Mãe:");
    expect(within(linhas()[3]).getByText(T.estado_lido)).toBeTruthy();
    expect(screen.getByText("3 avisos novos")).toBeTruthy();
  });

  it("tocar na linha abre o destino (o link) e marca como lido", async () => {
    const usuario = montar();
    await usuario.click(within(linhas()[2]).getByRole("link"));
    expect(falso.marcarUm).toHaveBeenCalledWith({ tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" });
  });

  it("tocar numa linha já lida não marca de novo", async () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-rangel", "2026-10-17")]);
    const usuario = montar();
    await usuario.click(within(linhas()[3]).getByRole("link"));
    expect(falso.marcarUm).not.toHaveBeenCalled();
  });

  it("se o banco recusar, avisa 'Não foi possível salvar' e o aviso segue Novo", async () => {
    falso.marcarUm.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const usuario = montar();
    await usuario.click(botoesDeMarcar()[0]);
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(botoesDeMarcar()).toHaveLength(4);
  });

  it("sem conexão: o aviso próprio", async () => {
    falso.marcarUm.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    const usuario = montar();
    await usuario.click(botoesDeMarcar()[0]);
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
  });

  it("tocar na linha e falhar não mostra erro (a pessoa pediu para abrir)", async () => {
    falso.marcarUm.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const usuario = montar();
    await usuario.click(within(linhas()[0]).getByRole("link"));
    expect(screen.queryByText(mensagem("salvar.falhou"))).toBeNull();
  });

  it("o foco passa ao 'Marcar como lido' do próximo não lido (não pula nem se perde)", async () => {
    const usuario = montar();
    botoesDeMarcar()[1].focus();
    await usuario.click(botoesDeMarcar()[1]);
    // Era o 2º; o próximo não lido é o 3º da lista de antes (Lucas), agora o 2º botão.
    expect(document.activeElement).toBe(botoesDeMarcar()[1]);
    expect(document.activeElement?.getAttribute("aria-label")).toContain("Lucas:");
  });

  it("marcando o último da lista, o foco vai para o primeiro que sobrou; sem nenhum, para a lista", async () => {
    guardar("blocos", [bloco("b-lucas", "Lucas", "lucas", 1)]);
    guardar("lancamentos", [lancamento("l3", "lucas", 11_516)]);
    const usuario = montar();
    await usuario.click(botoesDeMarcar()[0]);
    expect(botoesDeMarcar()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("list", { name: T.lista }));
  });

  it("marcando o último não lido de vários, o foco volta ao primeiro não lido que sobrou", async () => {
    const usuario = montar();
    await usuario.click(botoesDeMarcar()[3]);
    expect(document.activeElement).toBe(botoesDeMarcar()[0]);
    expect(document.activeElement?.getAttribute("aria-label")).toContain("Rangel:");
  });
});

describe("Central de Avisos: marcar tudo como lido", () => {
  it("é UM pedido com as chaves de todos os não lidos, na ordem da lista", async () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-mae", "2026-10-17")]);
    const usuario = montar();
    await usuario.click(marcarTudo());
    expect(falso.marcar).toHaveBeenCalledTimes(1);
    expect(falso.marcar).toHaveBeenCalledWith([
      { tipo: "atraso", referencia: "b-rangel", dia: "2026-10-17" },
      { tipo: "atraso", referencia: "b-lucas", dia: "2026-10-17" },
      { tipo: "atraso", referencia: "b-casal", dia: "2026-10-17" },
    ]);
    expect(falso.marcarUm).not.toHaveBeenCalled();
  });

  it("anuncia o resultado numa região `status` e zera o resumo, mantendo os avisos como Lidos", async () => {
    const usuario = montar();
    await usuario.click(marcarTudo());
    const anuncio = screen.getAllByRole("status").find((r) => r.textContent === T.todos_lidos);
    expect(anuncio).toBeTruthy();
    expect(screen.getByText("Nenhum aviso novo")).toBeTruthy();
    expect(linhas()).toHaveLength(4);
    expect(linhas().every((li) => within(li).queryByText(T.estado_lido) !== null)).toBe(true);
    expect(botoesDeMarcar()).toHaveLength(0);
  });

  it("depois de marcar tudo o botão fica desativado e o foco vai para a lista", async () => {
    const usuario = montar();
    await usuario.click(marcarTudo());
    expect((marcarTudo() as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("list", { name: T.lista }));
  });

  it("desativado quando não há não lidos (tudo lido) e quando não há avisos", () => {
    guardar("avisos_lidos", QUATRO_BLOCOS.map((b) => lidaDe("atraso", b.id, "2026-10-17")));
    montar();
    expect((marcarTudo() as HTMLButtonElement).disabled).toBe(true);
  });

  it("ativo (44 pt) quando há não lidos", () => {
    montar();
    const b = marcarTudo() as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    expect(b.className).toContain("min-h-toque");
  });

  it("enquanto grava mostra 'Marcando…' e fica ocupado; falhou: toast e nada anunciado", async () => {
    let liberar: (r: unknown) => void = () => {};
    falso.marcar.mockImplementation(() => new Promise((r) => (liberar = r)));
    const usuario = montar();
    await usuario.click(marcarTudo());
    expect(marcarTudo().textContent).toBe(T.marcando_tudo);
    expect(marcarTudo().getAttribute("aria-busy")).toBe("true");
    await act(async () => liberar({ ok: false, codigo: "salvar.falhou" }));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(screen.queryByText(T.todos_lidos)).toBeNull();
    expect(marcarTudo().textContent).toBe(T.marcar_tudo);
    expect((marcarTudo() as HTMLButtonElement).disabled).toBe(false);
  });

  it("um aviso novo depois de marcar tudo volta a contar e tira o anúncio", async () => {
    const usuario = montar();
    await usuario.click(marcarTudo());
    expect(screen.getAllByRole("status").some((r) => r.textContent === T.todos_lidos)).toBe(true);
    // O Casal quita o item de outubro e atrasa de novo com um de novembro (outro "desde"): é um aviso novo.
    guardar("lancamentos", [
      ...LANCAMENTOS_DOS_QUATRO.filter((l) => l.id !== "l4"),
      lancamento("l4", "casal", 5_000, { status_id: PAGO }),
      lancamento("l8", "casal", 2_000, { mes: "2026-11" }),
    ]);
    mudou();
    expect(screen.getByText("1 aviso novo")).toBeTruthy();
    expect(screen.getAllByRole("status").some((r) => r.textContent === T.todos_lidos)).toBe(false);
  });
});

describe("Central de Avisos: vazio, carregando, erro e a tabela ausente", () => {
  it("sem avisos: 'Nenhum aviso' e 'Marcar tudo' desativado", () => {
    guardar("lancamentos", []);
    montar();
    expect(screen.getByText(T.vazio)).toBeTruthy();
    expect(linhas()).toHaveLength(0);
    expect((marcarTudo() as HTMLButtonElement).disabled).toBe(true);
  });

  it("carregando (qualquer das leituras): esqueleto em `status` ocupado, sem lista e sem erro", () => {
    for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "config_ciclo", "configuracoes", "avisos_lidos"]) {
      falso.status = { [tabela]: "carregando" };
      falso.versao += 1;
      const { unmount } = render(
        <ToastProvider>
          <Avisos />
        </ToastProvider>,
      );
      expect(screen.getByText(T.carregando)).toBeTruthy();
      expect(document.querySelector('[aria-busy="true"][role="status"]')).not.toBeNull();
      expect(linhas()).toHaveLength(0);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(T.vazio)).toBeNull();
      expect((marcarTudo() as HTMLButtonElement).disabled).toBe(true);
      unmount();
    }
  });

  it("erro numa das sete leituras dos lembretes: 'Não foi possível carregar' e 'Tentar de novo' relê tudo", async () => {
    falso.status = { blocos: "erro" };
    const usuario = montar();
    expect(screen.getByRole("alert").textContent).toContain(mensagem("carregar.falhou"));
    expect(linhas()).toHaveLength(0);
    await usuario.click(screen.getByRole("button", { name: "Tentar de novo" }));
    // As 8 leituras (Lançamentos, itens, Blocos, Status, Faturas, Ciclo, Configurações e os lidos).
    expect(falso.recarregar).toHaveBeenCalledTimes(8);
  });

  it("sem a tabela avisos_lidos (merge antes do `db push`): a lista aparece, tudo Novo, e só marcar responde erro", async () => {
    falso.status = { avisos_lidos: "erro" };
    falso.marcarUm.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    falso.marcar.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const usuario = montar();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(linhas()).toHaveLength(4);
    expect(screen.getByText("4 avisos novos")).toBeTruthy();
    expect(linhas().every((li) => within(li).queryByText(T.estado_novo) !== null)).toBe(true);
    await usuario.click(botoesDeMarcar()[0]);
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    await usuario.click(marcarTudo());
    expect(screen.queryByText(T.todos_lidos)).toBeNull();
    expect(botoesDeMarcar()).toHaveLength(4);
  });
});

describe("Central de Avisos: acessibilidade", () => {
  it("o resumo do topo é uma região `status` (o contador muda sem roubar o foco) e há uma segunda para o anúncio", () => {
    montar();
    const status = screen.getAllByRole("status");
    expect(status.some((r) => r.textContent?.includes("4 avisos novos"))).toBe(true);
    expect(status.some((r) => r.className.includes("sr-only"))).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it("a lista tem nome e cada botão diz de qual aviso é (rótulo visível dentro do nome)", () => {
    montar();
    expect(screen.getByRole("list", { name: T.lista })).toBeTruthy();
    for (const b of botoesDeMarcar()) {
      expect(b.textContent).toBe(T.marcar_um);
      expect(b.getAttribute("aria-label")).toMatch(/^Marcar como lido: .+ em atraso desde /);
    }
  });

  it("o estado nunca é só cor: 'Novo' e 'Lido' são texto, e o aviso novo também é negrito + texto", () => {
    guardar("avisos_lidos", [lidaDe("atraso", "b-rangel", "2026-10-17")]);
    montar();
    expect(screen.getAllByText(T.estado_novo)).toHaveLength(3);
    expect(screen.getAllByText(T.estado_lido)).toHaveLength(1);
  });

  it("não usa cor literal nas classes", () => {
    const { container } = render(
      <ToastProvider>
        <Avisos />
      </ToastProvider>,
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|bg-\[|text-\[#/);
  });
});
