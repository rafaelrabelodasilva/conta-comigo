// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_LEMBRETES as T } from "@/domain/mensagens";
import { RELER_HOJE_A_CADA_MS } from "@/ui/use-hoje";
import { FaixaDeLembretes } from "./FaixaDeLembretes";

// A faixa de Lembretes (História 7.4, FR-55): o aviso do dia do fechamento e o do Bloco de cobrança com itens atrasados,
// no topo das telas. As contas são do núcleo (`lembretes.test.ts`); aqui se prova a fiação: o texto, o toque que leva ao
// Painel ou a Recebimentos, os interruptores, a virada do dia, o Realtime e os estados de carregando e erro. Os
// gerenciadores de Realtime são falsos e o relógio é o de verdade, congelado com `vi.setSystemTime` (o `useHoje` real).

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
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
  };
});

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

function bloco(id: string, nome: string, responsavel: string, ordem = 1, extra: Record<string, unknown> = {}) {
  return { id, nome, formula: { tipo: "responsavel", id: responsavel }, ordem, de_cobranca: true, meu_bloco: false, ...extra };
}

function lancamento(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    mes: "2026-11",
    excluido_em: null,
    valor_centavos: 11_516,
    responsavel_id: "lucas",
    tipo_id: "casa",
    status_id: NAO_PAGO,
    lancado_por: "fatura",
    ...extra,
  };
}

const CICLO = [{ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }];
const STATUS = [
  { id: PAGO, nome: "Pago", conta_como_pago: true },
  { id: NAO_PAGO, nome: "Não pago", conta_como_pago: false },
];

/** Hoje, às 15:00 UTC (12:00 em São Paulo): o dia não depende do fuso do computador. */
function hoje(dia: string) {
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

const faixas = () => screen.queryAllByRole("link");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  hoje("2026-11-19");
  falso.banco = {};
  falso.status = {};
  falso.versao += 1; // nunca volta a 0: o cache do mock é por versão e vive entre os testes
  guardar("config_ciclo", CICLO);
  guardar("status", STATUS);
  guardar("faturas", [
    { mes: "2026-10", vencimento: "2026-10-06" },
    { mes: "2026-11", vencimento: "2026-11-06" },
  ]);
  guardar("blocos", [bloco("b-lucas", "Lucas", "lucas")]);
  guardar("lancamentos", [lancamento("l1")]);
  guardar("pagamento_itens", []);
  guardar("configuracoes", []);
});
afterEach(() => vi.useRealTimers());

describe("FaixaDeLembretes: atraso", () => {
  it("mostra 'O Lucas tem R$ 115,16 em atraso desde 17/11/26' e o toque abre Recebimentos", () => {
    render(<FaixaDeLembretes />);
    const [link] = faixas();
    expect(sem(link.textContent)).toContain(`O Lucas tem ${sem(formatarDinheiro(11_516))} em atraso desde 17/11/26`);
    expect(sem(link.textContent)).toContain("O Lucas tem R$ 115,16 em atraso desde 17/11/26");
    expect(link.getAttribute("href")).toBe("/recebimentos");
    // O destino também em texto, não só pelo toque.
    expect(link.textContent).toContain(T.abrir_recebimentos);
    expect(link.className).toContain("min-h-toque");
  });

  it("o contêiner é um status nomeado, sempre montado, e a faixa não rouba o foco", () => {
    const { container } = render(<FaixaDeLembretes />);
    const regiao = screen.getByRole("status", { name: T.regiao });
    expect(regiao.contains(faixas()[0])).toBe(true);
    expect(document.activeElement).toBe(document.body);
    // Sem lembrete algum, o contêiner continua lá.
    guardar("lancamentos", []);
    mudou();
    expect(faixas()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it("no último dia da tolerância ainda não aparece", () => {
    hoje("2026-11-16");
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(0);
  });

  it("o Pagamento que entra (Realtime) tira a faixa; desfazer a traz de volta", () => {
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(1);
    guardar("pagamento_itens", [{ lancamento_id: "l1", valor_centavos: 11_516, excluido_em: null }]);
    mudou();
    expect(faixas()).toHaveLength(0);
    guardar("pagamento_itens", [{ lancamento_id: "l1", valor_centavos: 4_000, excluido_em: null }]);
    mudou();
    expect(sem(faixas()[0].textContent)).toContain("R$ 75,16");
  });

  it("a tolerância de Configurações vale (zero: atrasa no dia seguinte ao vencimento)", () => {
    hoje("2026-11-07");
    guardar("configuracoes", [{ tolerancia_atraso_dias: 0 }]);
    render(<FaixaDeLembretes />);
    expect(sem(faixas()[0].textContent)).toContain("desde 07/11/26");
  });

  it("um Bloco que não é de cobrança não vira faixa", () => {
    guardar("blocos", [bloco("b-meu", "Meu", "lucas", 1, { de_cobranca: false, meu_bloco: true })]);
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(0);
  });

  it("vários Blocos atrasados: uma faixa por Bloco até 3 e 'E mais 2 Blocos com itens atrasados' para Recebimentos", () => {
    guardar(
      "blocos",
      [1, 2, 3, 4, 5].map((n) => bloco(`b-${n}`, `Pessoa ${n}`, `p${n}`, n)),
    );
    guardar(
      "lancamentos",
      [1, 2, 3, 4, 5].map((n) => lancamento(`l${n}`, { responsavel_id: `p${n}`, valor_centavos: n * 1_000 })),
    );
    render(<FaixaDeLembretes />);
    const links = faixas();
    expect(links).toHaveLength(4);
    expect(sem(links[0].textContent)).toContain("O Pessoa 1 tem R$ 10,00");
    expect(sem(links[2].textContent)).toContain("O Pessoa 3 tem R$ 30,00");
    expect(sem(links[3].textContent)).toContain("E mais 2 Blocos com itens atrasados");
    expect(links[3].getAttribute("href")).toBe("/recebimentos");
  });
});

describe("FaixaDeLembretes: fechamento", () => {
  beforeEach(() => {
    hoje("2026-10-28");
    guardar("lancamentos", []);
    guardar("faturas", [{ mes: "2026-10", vencimento: "2026-10-06" }]);
  });

  it("no dia do fechamento mostra 'A fatura de novembro fechou…' e o toque abre o Painel do Mês", () => {
    render(<FaixaDeLembretes />);
    const [link] = faixas();
    expect(link.textContent).toContain("A fatura de novembro fechou. Importe o PDF quando chegar");
    expect(link.getAttribute("href")).toBe("/?mes=2026-11");
    expect(link.textContent).toContain(T.abrir_painel);
  });

  it("some quando a Fatura do Mês é importada (Realtime)", () => {
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(1);
    guardar("faturas", [
      { mes: "2026-10", vencimento: "2026-10-06" },
      { mes: "2026-11", vencimento: "2026-11-06" },
    ]);
    mudou();
    expect(faixas()).toHaveLength(0);
  });

  it("fechamento e atraso juntos: o do fechamento vem primeiro, o de atraso em seguida", () => {
    guardar("lancamentos", [lancamento("l1", { mes: "2026-10" })]);
    render(<FaixaDeLembretes />);
    const links = faixas();
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/?mes=2026-11");
    expect(links[1].getAttribute("href")).toBe("/recebimentos");
  });
});

describe("FaixaDeLembretes: preferências", () => {
  it("fechamento desligado: só ele some", () => {
    hoje("2026-10-28");
    guardar("faturas", [{ mes: "2026-10", vencimento: "2026-10-06" }]);
    guardar("lancamentos", [lancamento("l1", { mes: "2026-10" })]);
    guardar("configuracoes", [{ tolerancia_atraso_dias: 10, lembrete_fechamento: false, lembrete_atraso: true }]);
    render(<FaixaDeLembretes />);
    expect(faixas().map((l) => l.getAttribute("href"))).toEqual(["/recebimentos"]);
  });

  it("atraso desligado: só ele some; ligar de novo (Realtime) o traz de volta", () => {
    guardar("configuracoes", [{ tolerancia_atraso_dias: 10, lembrete_fechamento: true, lembrete_atraso: false }]);
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(0);
    guardar("configuracoes", [{ tolerancia_atraso_dias: 10, lembrete_fechamento: true, lembrete_atraso: true }]);
    mudou();
    expect(faixas()).toHaveLength(1);
  });

  it("sem linha de configurações, ou antes das colunas existirem: os dois ligados", () => {
    guardar("configuracoes", [{ tolerancia_atraso_dias: 10 }]);
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(1);
  });
});

describe("FaixaDeLembretes: o dia", () => {
  it("a faixa aparece sozinha na virada do dia, com a tela aberta", () => {
    vi.setSystemTime(new Date("2026-11-17T02:50:00Z")); // 23:50 de 16/11 em São Paulo
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(0);
    vi.setSystemTime(new Date("2026-11-17T03:05:00Z")); // 00:05 de 17/11
    act(() => {
      vi.advanceTimersByTime(RELER_HOJE_A_CADA_MS);
    });
    expect(sem(faixas()[0].textContent)).toContain("desde 17/11/26");
  });
});

describe("FaixaDeLembretes: carregando e erro", () => {
  for (const tabela of ["lancamentos", "pagamento_itens", "blocos", "status", "faturas", "config_ciclo", "configuracoes"]) {
    it(`${tabela} carregando: nada aparece (nem esqueleto, nem faixa pela metade)`, () => {
      falso.status[tabela] = "carregando";
      const { container } = render(<FaixaDeLembretes />);
      expect(faixas()).toHaveLength(0);
      expect(container.textContent).toBe("");
      expect(screen.getByRole("status", { name: T.regiao })).toBeTruthy();
    });

    it(`${tabela} com erro: nada aparece e nenhum texto de erro (a tela do dado avisa)`, () => {
      falso.status[tabela] = "erro";
      const { container } = render(<FaixaDeLembretes />);
      expect(faixas()).toHaveLength(0);
      expect(container.textContent).toBe("");
    });
  }

  it("a faixa aparece quando o último dado chega", () => {
    falso.status.lancamentos = "carregando";
    render(<FaixaDeLembretes />);
    expect(faixas()).toHaveLength(0);
    falso.status.lancamentos = "pronto";
    mudou();
    expect(faixas()).toHaveLength(1);
  });
});
