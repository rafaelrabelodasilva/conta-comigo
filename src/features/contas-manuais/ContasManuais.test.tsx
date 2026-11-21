// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LancamentoDaConta } from "@/domain/alterar-conta";
import type { NovaConta } from "@/domain/contas-manuais";
import { TEXTOS_CONTAS as T } from "@/domain/mensagens";
import type {
  LinhaConta,
  RepoContas,
  ResultadoAlterarConta,
  ResultadoExcluirConta,
  ResultadoLerConta,
  ResultadoSalvarConta,
} from "@/data/contas-repo";
import { ToastProvider } from "@/ui/Toast";
import { ContasManuais } from "./ContasManuais";

// A tela Contas (Histórias 5.1 e 5.2): a lista das Contas manuais com filtros
// e ⋯, o botão "＋ Nova conta" e o formulário. Realtime, conexão e repositório
// são falsos: um "banco" por tabela que avisa a tela (como o evento do
// Realtime), como no teste dos Blocos.

const falso = vi.hoisted(() => ({
  banco: {} as Record<string, unknown[]>,
  status: {} as Record<string, string>,
  ouvintes: new Set<() => void>(),
  versao: 0,
  recarregar: vi.fn<(tabela: string) => void>(),
  online: true,
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
  return {
    useLinhas: (tabela: string) => useSyncExternalStore(assinar, () => retrato(tabela)),
    gerenciador: (tabela: string) => ({ recarregar: () => falso.recarregar(tabela) }),
  };
});
vi.mock("@/data/conexao", () => ({ useConexao: () => falso.online }));

const sem = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");

const responsaveis = [
  { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
  { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
  { id: "r-mae", nome: "Mãe", cor: 3, ordem: 3, arquivado: false },
  { id: "r-lucas", nome: "Lucas", cor: 4, ordem: 4, arquivado: false },
];
const tipos = [
  { id: "t-saude", nome: "Saúde", arquivado: false },
  { id: "t-bobicas", nome: "Bobiças", arquivado: false },
  { id: "t-steams", nome: "Steams", arquivado: false },
  { id: "t-viagem", nome: "Viagem", arquivado: false },
];

let seq = 0;
function contaDb(extra: Partial<LinhaConta> = {}): LinhaConta {
  seq++;
  return {
    id: `c${seq}`,
    owner_id: "dono",
    nome: `Conta ${seq}`,
    valor_centavos: 10_000,
    tipo_id: "t-saude",
    responsavel_id: "r-rafael",
    observacao: null,
    mes_inicial: "2026-01",
    repeticao: "mensal",
    parcela_total: null,
    divisao: null,
    encerrada_em_mes: null,
    excluido_em: null,
    created_at: `2026-11-${String(seq).padStart(2, "0")}T12:00:00+00:00`,
    updated_at: `2026-11-${String(seq).padStart(2, "0")}T12:00:00+00:00`,
    ...extra,
  };
}

const umTerco = { modo: "valor", partes: ["r-mae", "r-casal", "r-lucas"].map((id) => ({ responsavel_id: id, numerador: 1, denominador: 3 })) };

const silvia = () => contaDb({ id: "silvia", nome: "Silvia", valor_centavos: 40_000 });
const william = () =>
  contaDb({ id: "william", nome: "William", valor_centavos: 42_000, tipo_id: "t-bobicas", responsavel_id: "r-casal", mes_inicial: "2026-03" });
const tvbox = () => contaDb({ id: "tvbox", nome: "TVbox", valor_centavos: 3_000, tipo_id: "t-steams" });
const bombinhas = () =>
  contaDb({
    id: "bombinhas",
    nome: "Bombinhas",
    valor_centavos: 31_800,
    tipo_id: "t-viagem",
    responsavel_id: null,
    mes_inicial: "2026-07",
    repeticao: "parcelas",
    parcela_total: 6,
    divisao: umTerco,
  });
const mockup = () => [silvia(), william(), tvbox(), bombinhas()];

function definir(contas: unknown[], status: Record<string, string> = {}) {
  falso.banco = { contas_manuais: contas, responsaveis, tipos };
  falso.status = status;
  falso.versao++;
}

function mudarBanco(tabela: string, mudar: (linhas: unknown[]) => unknown[]) {
  act(() => {
    falso.banco = { ...falso.banco, [tabela]: mudar(falso.banco[tabela] ?? []) };
    falso.versao++;
    for (const o of falso.ouvintes) o();
  });
}

type Salvar = (c: NovaConta, mes: string) => Promise<ResultadoSalvarConta>;

const T0 = "2026-11-10T12:00:00+00:00";
/** Um Lançamento vivo da Conta (mãe), como a leitura da 5.4 o devolve. */
const lan = (id: string, mes: string, n: number, extra: Partial<LancamentoDaConta> = {}): LancamentoDaConta => ({
  id,
  dividido_de_id: null,
  mes,
  parcela_n: n,
  status_id: null,
  editado_em: null,
  excluido_em: null,
  updated_at: T0,
  ...extra,
});
/** A leitura que o repositório devolve ao abrir Editar, Encerrar ou Excluir (a Silvia, desde Jan/26: Nov/26 é a parcela 11). */
const leitura = (existentes: LancamentoDaConta[] = [], pagos: string[] = []): ResultadoLerConta => ({
  ok: true,
  existentes,
  statusQueContam: new Set(pagos),
  comPagamento: new Set(),
  puladas: new Set(),
  serie: {
    atual: { nome_normalizado: "SILVIA", parcela_total: null, valor_parcela_centavos: 40_000, mes_primeira_parcela: "2026-01", ocorrencia: 1 },
    ocorrenciasDeOutras: [],
  },
});
const SILVIA_VIVAS = [lan("s11", "2026-11", 11), lan("s12", "2026-12", 12), lan("s13", "2027-01", 13)];

type FakeRepo = { [K in keyof RepoContas]: ReturnType<typeof vi.fn> };

function montar(salvar: Salvar = vi.fn(), extra: Partial<FakeRepo> = {}) {
  const repo = {
    salvar,
    ler: vi.fn(async () => leitura(SILVIA_VIVAS)),
    alterar: vi.fn(),
    encerrar: vi.fn(),
    excluir: vi.fn(),
    restaurar: vi.fn(),
    ...extra,
  } as unknown as Pick<RepoContas, "salvar" | "ler" | "alterar" | "encerrar" | "excluir" | "restaurar">;
  render(
    <ToastProvider>
      <ContasManuais titulo="Contas manuais" repo={repo} />
    </ToastProvider>,
  );
  return repo as unknown as FakeRepo;
}

const nova = () => screen.getByRole("button", { name: T.rotulo_nova }) as HTMLButtonElement;
const tabela = () => screen.getByRole("table", { name: T.lista });
const linhas = () => within(tabela()).getAllByRole("row").slice(1);
const nomes = () => linhas().map((l) => within(l).getAllByRole("cell")[0].querySelector("p")?.textContent);
const linhaDe = (nome: string) => {
  const l = linhas().find((x) => within(x).getAllByRole("cell")[0].querySelector("p")?.textContent === nome);
  if (!l) throw new Error(`sem linha ${nome}`);
  return l;
};
const celulas = (nome: string) => within(linhaDe(nome)).getAllByRole("cell");
const filtro = (nomeDoFiltro: string) => screen.getByRole("button", { name: new RegExp(`^${nomeDoFiltro},`) });

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
    seq = 0;
    falso.online = true;
    falso.recarregar.mockReset();
    definir([]);
    // Só o relógio: "hoje" é 15/11/2026.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  describe("a lista", () => {
    it("mostra as quatro Contas do mockup: Conta com a repetição, Valor, etiquetas, Tipo e situação", () => {
      definir(mockup());
      montar();
      expect(screen.getByRole("heading", { name: "Contas manuais" })).toBeTruthy();
      // Ativas por Nome (as quatro são Ativas em nov/26).
      expect(nomes()).toEqual(["Bombinhas", "Silvia", "TVbox", "William"]);

      const s = celulas("Silvia");
      expect(sem(s[0].textContent)).toBe("SilviaMensal · desde Jan/26");
      expect(sem(s[1].textContent)).toBe("R$ 400,00");
      expect(s[2].textContent).toBe("Rafael");
      expect(s[3].textContent).toBe("Saúde");
      expect(s[4].textContent).toBe("Ativa");

      const w = celulas("William");
      expect(sem(w[0].textContent)).toBe("WilliamMensal · desde Mar/26");
      expect(sem(w[1].textContent)).toBe("R$ 420,00");
      expect(w[2].textContent).toBe("Casal");
      expect(w[3].textContent).toBe("Bobiças");

      expect(sem(celulas("TVbox")[1].textContent)).toBe("R$ 30,00");
      expect(celulas("TVbox")[3].textContent).toBe("Steams");

      const b = celulas("Bombinhas");
      expect(sem(b[0].textContent)).toBe("Bombinhas6 parcelas · Jul/26 a Dez/26 · 3 partes de R$ 106,00");
      expect(sem(b[1].textContent)).toBe("R$ 318,00por parcela");
      expect(Array.from(b[2].querySelectorAll("span")).map((e) => e.textContent)).toEqual(["Mãe", "Casal", "Lucas"]);
      expect(b[3].textContent).toBe("Viagem");
      expect(b[4].textContent).toBe("Ativa");
    });

    it("é uma tabela: cabeçalhos das colunas e um ⋯ com nome por Conta", () => {
      definir(mockup());
      montar();
      const cabecalhos = within(tabela())
        .getAllByRole("columnheader")
        .map((c) => c.textContent);
      expect(cabecalhos).toEqual(["Conta", "Valor por mês", "Responsável ou Divisão", "Tipo", "Situação", "Ações"]);
      expect(screen.getByRole("button", { name: "Ações de Bombinhas" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Ações de Silvia" })).toBeTruthy();
    });

    it("a situação aparece em texto (não só em cor) e a Divisão usa a cor de cada Responsável", () => {
      definir([...mockup(), contaDb({ id: "velha", nome: "Antiga", encerrada_em_mes: "2026-06" })]);
      montar();
      fireEvent.click(filtro("Todas"));
      expect(celulas("Antiga")[4].textContent).toBe("Encerrada");
      expect(celulas("Silvia")[4].textContent).toBe("Ativa");
      const etiquetas = Array.from(celulas("Bombinhas")[2].querySelectorAll("span"));
      expect(etiquetas.map((e) => e.className.match(/text-person-\d-fg/)?.[0])).toEqual([
        "text-person-3-fg",
        "text-person-2-fg",
        "text-person-4-fg",
      ]);
    });

    it("alvos de toque de 44 pt: linhas, filtros e ⋯", () => {
      definir(mockup());
      montar();
      for (const l of linhas()) expect(l.className).toContain("min-h-toque");
      for (const f of ["Ativas", "Encerradas", "Todas"]) expect(filtro(f).className).toContain("min-h-toque");
      expect(screen.getByRole("button", { name: "Ações de Silvia" }).className).toContain("area-toque");
      expect(nova().className).toContain("min-h-toque");
    });

    it("a linha não é um botão: tocar nela não abre nada", () => {
      definir(mockup());
      montar();
      fireEvent.click(linhaDe("Silvia"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("filtros", () => {
    const encerrada = () => contaDb({ id: "velha", nome: "Antiga", encerrada_em_mes: "2026-06" });
    const parceladaQueAcabou = () =>
      contaDb({ id: "curso", nome: "Curso", repeticao: "parcelas", parcela_total: 4, mes_inicial: "2026-07" });

    it("abre em Ativas, com os botões em grupo, a contagem anunciada e o aviso para o leitor de tela", () => {
      definir([...mockup(), encerrada()]);
      montar();
      expect(screen.getByRole("group", { name: T.filtrar })).toBeTruthy();
      expect(filtro("Ativas").getAttribute("aria-pressed")).toBe("true");
      expect(filtro("Encerradas").getAttribute("aria-pressed")).toBe("false");
      expect(filtro("Todas").getAttribute("aria-pressed")).toBe("false");
      expect(filtro("Ativas").getAttribute("aria-label")).toBe("Ativas, 4 contas");
      expect(filtro("Encerradas").getAttribute("aria-label")).toBe("Encerradas, 1 conta");
      expect(filtro("Todas").getAttribute("aria-label")).toBe("Todas, 5 contas");
      expect(nomes()).toEqual(["Bombinhas", "Silvia", "TVbox", "William"]);
      expect(screen.getByRole("status").textContent).toBe("4 contas ativas");
    });

    it("Encerradas mostra só as encerradas; Todas mostra tudo, com as Ativas primeiro", () => {
      definir([...mockup(), encerrada(), parceladaQueAcabou()]);
      montar();
      fireEvent.click(filtro("Encerradas"));
      expect(nomes()).toEqual(["Antiga", "Curso"]);
      expect(filtro("Encerradas").getAttribute("aria-pressed")).toBe("true");
      expect(filtro("Ativas").getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("status").textContent).toBe("2 contas encerradas");
      fireEvent.click(filtro("Todas"));
      expect(nomes()).toEqual(["Bombinhas", "Silvia", "TVbox", "William", "Antiga", "Curso"]);
      expect(screen.getByRole("status").textContent).toBe("6 contas");
      fireEvent.click(filtro("Ativas"));
      expect(nomes()).toEqual(["Bombinhas", "Silvia", "TVbox", "William"]);
    });

    it("a parcelada cuja última parcela já passou é Encerrada; a que termina neste Mês ainda é Ativa", () => {
      definir([
        parceladaQueAcabou(), // última parcela: out/26
        contaDb({ id: "hoje", nome: "Termina hoje", repeticao: "parcelas", parcela_total: 5, mes_inicial: "2026-07" }), // nov/26
      ]);
      montar();
      expect(nomes()).toEqual(["Termina hoje"]);
      fireEvent.click(filtro("Encerradas"));
      expect(nomes()).toEqual(["Curso"]);
      expect(celulas("Curso")[0].textContent).toContain("4 parcelas · Jul/26 a Out/26");
    });

    it("encerrada_em_mes: no Mês de hoje já é Encerrada; no Mês seguinte ainda é Ativa", () => {
      definir([
        contaDb({ id: "a", nome: "Acaba hoje", encerrada_em_mes: "2026-11" }),
        contaDb({ id: "b", nome: "Acaba mês que vem", encerrada_em_mes: "2026-12" }),
      ]);
      montar();
      expect(nomes()).toEqual(["Acaba mês que vem"]);
      expect(celulas("Acaba mês que vem")[0].textContent).toContain("Mensal · Jan/26 a Nov/26");
      fireEvent.click(filtro("Encerradas"));
      expect(nomes()).toEqual(["Acaba hoje"]);
    });

    it("filtro sem resultado: o texto do filtro, sem tabela", () => {
      definir([silvia()]);
      montar();
      fireEvent.click(filtro("Encerradas"));
      // O texto na tela e o aviso para o leitor de tela (sr-only).
      expect(screen.getAllByText(T.vazio_encerradas)).toHaveLength(2);
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(T.vazio_encerradas);
      expect(filtro("Encerradas").getAttribute("aria-label")).toBe("Encerradas, 0 contas");

      definir([encerrada()]);
      act(() => {
        for (const o of falso.ouvintes) o();
      });
      fireEvent.click(filtro("Ativas"));
      expect(screen.getAllByText(T.vazio_ativas)).toHaveLength(2);
    });
  });

  describe("sem Contas, carregando e erro", () => {
    it("sem Contas: 'Nenhuma conta manual' e '＋ Nova conta' abre o formulário da 5.1", () => {
      montar();
      expect(screen.getByText("Nenhuma conta manual")).toBeTruthy();
      expect(screen.getByText(T.explicacao_vazio)).toBeTruthy();
      // Sem Contas não há o que filtrar.
      expect(screen.queryByRole("group", { name: T.filtrar })).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
      const noVazio = screen.getByRole("button", { name: "Nova conta" });
      expect(noVazio.textContent).toContain(T.botao_nova);
      fireEvent.click(noVazio);
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByRole("textbox", { name: T.nome })).toBeTruthy();
    });

    it("o botão do topo espera Responsáveis e Tipos carregarem", () => {
      definir([], { tipos: "carregando" });
      montar();
      expect(nova().disabled).toBe(true);
      // Carregando, só o botão do topo existe (o do estado vazio vem depois).
      expect(screen.queryByRole("button", { name: "Nova conta" })).toBeNull();
    });

    it("carregando: esqueleto com aviso para o leitor de tela, nunca tela branca nem 'Nenhuma conta'", () => {
      definir([], { contas_manuais: "carregando" });
      montar();
      const aviso = screen.getByRole("status");
      expect(aviso.textContent).toContain(T.carregando);
      expect(aviso.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByText(T.vazio)).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("carregando os Responsáveis também espera: sem 'Removido' falso na primeira pintura", () => {
      definir(mockup(), { responsaveis: "carregando" });
      montar();
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain(T.carregando);
    });

    it("erro ao carregar: mensagem e 'Tentar de novo' relê as três tabelas", () => {
      definir([], { contas_manuais: "erro" });
      montar();
      expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar");
      fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
      expect(falso.recarregar.mock.calls.map((c) => c[0]).sort()).toEqual(["contas_manuais", "responsaveis", "tipos"]);
    });
  });

  describe("Realtime (outro aparelho)", () => {
    it("uma Conta nova aparece, uma alterada muda e uma apagada some, sem recarregar", () => {
      definir([silvia()]);
      montar();
      expect(nomes()).toEqual(["Silvia"]);
      expect(filtro("Ativas").getAttribute("aria-label")).toBe("Ativas, 1 conta");

      mudarBanco("contas_manuais", (l) => [...l, tvbox()]);
      expect(nomes()).toEqual(["Silvia", "TVbox"]);
      expect(filtro("Ativas").getAttribute("aria-label")).toBe("Ativas, 2 contas");

      mudarBanco("contas_manuais", (l) =>
        l.map((c) => ((c as LinhaConta).id === "silvia" ? { ...(c as LinhaConta), nome: "Silvia (fono)", valor_centavos: 45_000 } : c)),
      );
      expect(nomes()).toEqual(["Silvia (fono)", "TVbox"]);
      expect(sem(celulas("Silvia (fono)")[1].textContent)).toBe("R$ 450,00");

      mudarBanco("contas_manuais", (l) => l.filter((c) => (c as LinhaConta).id !== "silvia"));
      expect(nomes()).toEqual(["TVbox"]);
    });

    it("a última Conta apagada leva ao 'Nenhuma conta manual'; uma Conta nova tira da tela vazia", () => {
      definir([silvia()]);
      montar();
      mudarBanco("contas_manuais", () => []);
      expect(screen.getByText(T.vazio)).toBeTruthy();
      mudarBanco("contas_manuais", () => [tvbox()]);
      expect(nomes()).toEqual(["TVbox"]);
    });

    it("uma Conta que passa a ser Encerrada em outro aparelho sai de Ativas", () => {
      definir([silvia(), tvbox()]);
      montar();
      mudarBanco("contas_manuais", (l) =>
        l.map((c) => ((c as LinhaConta).id === "tvbox" ? { ...(c as LinhaConta), encerrada_em_mes: "2026-11" } : c)),
      );
      expect(nomes()).toEqual(["Silvia"]);
      fireEvent.click(filtro("Encerradas"));
      expect(nomes()).toEqual(["TVbox"]);
    });

    it("renomear um Responsável em outro aparelho muda a etiqueta na hora", () => {
      definir([silvia()]);
      montar();
      mudarBanco("responsaveis", (l) =>
        l.map((r) => ((r as { id: string }).id === "r-rafael" ? { ...(r as object), nome: "Rafa" } : r)),
      );
      expect(celulas("Silvia")[2].textContent).toBe("Rafa");
    });
  });

  describe("cadastros arquivados ou apagados", () => {
    it("Responsável e Tipo arquivados continuam com o nome e '(arquivado)'", () => {
      definir([silvia()]);
      falso.banco = {
        ...falso.banco,
        responsaveis: responsaveis.map((r) => (r.id === "r-rafael" ? { ...r, arquivado: true } : r)),
        tipos: tipos.map((t) => (t.id === "t-saude" ? { ...t, arquivado: true } : t)),
      };
      falso.versao++;
      montar();
      expect(celulas("Silvia")[2].textContent).toBe("Rafael (arquivado)");
      expect(celulas("Silvia")[3].textContent).toBe("Saúde (arquivado)");
    });

    it("Responsável ou Tipo que não existe mais: 'Removido'; a Divisão só marca a parte afetada", () => {
      definir([silvia(), bombinhas()]);
      falso.banco = {
        ...falso.banco,
        responsaveis: responsaveis.filter((r) => r.id !== "r-rafael" && r.id !== "r-lucas"),
        tipos: tipos.filter((t) => t.id !== "t-viagem"),
      };
      falso.versao++;
      montar();
      expect(celulas("Silvia")[2].textContent).toBe("Removido");
      expect(Array.from(celulas("Bombinhas")[2].querySelectorAll("span")).map((e) => e.textContent)).toEqual(["Mãe", "Casal", "Removido"]);
      expect(celulas("Bombinhas")[3].textContent).toBe("Removido");
    });
  });

  describe("⋯ de cada linha", () => {
    it("tem Editar, Encerrar e Excluir, todos valendo numa Conta ativa (a 5.4 ligou o que estava 'Em breve')", async () => {
      definir(mockup());
      montar();
      await userEvent.setup().click(screen.getByRole("button", { name: "Ações de Bombinhas" }));
      const itens = await screen.findAllByRole("menuitem");
      expect(itens.map((i) => i.textContent)).toEqual(["Editar", "Encerrar", "Excluir"]);
      for (const i of itens) expect(i.getAttribute("aria-disabled")).toBeNull();
    });

    it("uma Conta já Encerrada não pode ser editada nem encerrada ('Já encerrada'); Excluir continua valendo", async () => {
      definir([contaDb({ id: "velha", nome: "Antiga", encerrada_em_mes: "2026-06" })]);
      montar();
      fireEvent.click(filtro("Todas"));
      await userEvent.setup().click(screen.getByRole("button", { name: "Ações de Antiga" }));
      expect((await screen.findByRole("menuitem", { name: /^Editar/ })).textContent).toBe("EditarJá encerrada");
      expect(screen.getByRole("menuitem", { name: /^Encerrar/ }).textContent).toBe("EncerrarJá encerrada");
      expect(screen.getByRole("menuitem", { name: /^Editar/ }).getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByRole("menuitem", { name: /^Encerrar/ }).getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByRole("menuitem", { name: "Excluir" }).getAttribute("aria-disabled")).toBeNull();
    });

    it("sem internet, os três itens ficam visíveis e desativados ('Sem conexão') e nada abre nem lê", async () => {
      falso.online = false;
      definir(mockup());
      const repo = montar();
      const u = userEvent.setup();
      await u.click(screen.getByRole("button", { name: "Ações de Silvia" }));
      for (const nome of ["Editar", "Encerrar", "Excluir"]) {
        const item = screen.getByRole("menuitem", { name: new RegExp(`^${nome}`) });
        expect(item.textContent).toBe(`${nome}Sem conexão`);
        expect(item.getAttribute("aria-disabled")).toBe("true");
      }
      await u.click(screen.getByRole("menuitem", { name: /^Editar/ }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(repo.ler).not.toHaveBeenCalled();
    });

    it("o toque na linha não faz nada (o ⋯ é o único caminho)", async () => {
      definir(mockup());
      const repo = montar();
      await userEvent.setup().click(linhaDe("Silvia"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(repo.ler).not.toHaveBeenCalled();
    });
  });

  async function abrir(nome: string, acao: "Editar" | "Encerrar" | "Excluir") {
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: `Ações de ${nome}` }));
    await u.click(await screen.findByRole("menuitem", { name: acao }));
    return u;
  }

  describe("Editar", () => {
    it("abre o formulário preenchido, com 'Vale a partir de Nov/26…', o 'Começa em' travado e a leitura dos Lançamentos", async () => {
      definir(mockup());
      const repo = montar();
      await abrir("Silvia", "Editar");
      expect(await screen.findByRole("dialog", { name: T.titulo_editar })).toBeTruthy();
      expect((screen.getByRole("textbox", { name: T.nome }) as HTMLInputElement).value).toBe("Silvia");
      expect((screen.getByRole("textbox", { name: T.valor }) as HTMLInputElement).value).toBe("400,00");
      expect((screen.getByRole("combobox", { name: T.tipo }) as HTMLSelectElement).value).toBe("t-saude");
      const comeca = screen.getByLabelText(T.comeca_em) as HTMLInputElement;
      expect(comeca.value).toBe("2026-01");
      expect(comeca.disabled).toBe(true);
      expect(screen.getByText(T.comeca_em_fixo)).toBeTruthy();
      expect(screen.getByText("Vale a partir de Nov/26. Os meses anteriores não mudam.")).toBeTruthy();
      expect(screen.queryByText(T.nota_passado)).toBeNull();
      await waitFor(() => expect(repo.ler).toHaveBeenCalledOnce());
      expect(repo.ler.mock.calls[0][0]).toMatchObject({ id: "silvia", updated_at: expect.any(String) });
      expect(repo.ler.mock.calls[0][1]).toBe("2026-11");
    });

    it("lista no aviso os Lançamentos que ficam como estão (paga, editada à mão)", async () => {
      definir(mockup());
      montar(vi.fn(), {
        ler: vi.fn(async () =>
          leitura([lan("s11", "2026-11", 11), lan("s12", "2026-12", 12, { status_id: "s-pago" }), lan("s13", "2027-01", 13, { editado_em: T0 })], ["s-pago"]),
        ),
      });
      await abrir("Silvia", "Editar");
      expect(await screen.findByText("Ficam como estão: Dez/26 (já paga), Jan/27 (editada à mão).")).toBeTruthy();
    });

    it("enquanto a leitura não chega mostra 'Conferindo…' e, se ela falhar, o formulário segue sem a lista", async () => {
      definir(mockup());
      let responde!: (r: ResultadoLerConta) => void;
      const repo = montar(vi.fn(), { ler: vi.fn(() => new Promise<ResultadoLerConta>((r) => (responde = r))) });
      await abrir("Silvia", "Editar");
      expect(await screen.findByText(T.conferindo)).toBeTruthy();
      act(() => responde({ ok: false, codigo: "salvar.falhou" }));
      await waitFor(() => expect(screen.queryByText(T.conferindo)).toBeNull());
      expect(screen.getByRole("dialog", { name: T.titulo_editar })).toBeTruthy();
      expect(repo.alterar).not.toHaveBeenCalled();
    });

    it("muda o Valor e salva: chama alterar com a Conta salva e a nova, mostra o aviso e fecha", async () => {
      definir(mockup());
      const alterar = vi.fn<(c: { id: string }, n: NovaConta, mes: string) => Promise<ResultadoAlterarConta>>(
        async (c, n) => ({
          ok: true,
          conta: contaDb({ id: c.id, nome: n.nome, valor_centavos: n.valor_centavos }),
          resumo: { excluidas: 3, criadas: 3, mantidas: [{ mes: "2026-12", parcela_n: 12, motivo: "paga" }] },
        }),
      );
      montar(vi.fn(), { alterar });
      await abrir("Silvia", "Editar");
      await screen.findByText("Vale a partir de Nov/26. Os meses anteriores não mudam.");
      fireEvent.change(screen.getByRole("textbox", { name: T.valor }), { target: { value: "450,00" } });
      fireEvent.click(screen.getByRole("button", { name: T.salvar }));
      await waitFor(() => expect(alterar).toHaveBeenCalledOnce());
      expect(alterar.mock.calls[0][0]).toMatchObject({ id: "silvia", nome: "Silvia", valor_centavos: 40_000 });
      expect(alterar.mock.calls[0][1]).toMatchObject({ id: "silvia", nome: "Silvia", valor_centavos: 45_000, mes_inicial: "2026-01" });
      expect(alterar.mock.calls[0][2]).toBe("2026-11");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByText("Conta alterada: 3 lançamentos recriados · 1 ficou como estava")).toBeTruthy();
    });

    it("salvar sem mudar nada só fecha: nada é lido para gravar nem recriado", async () => {
      definir(mockup());
      const repo = montar();
      await abrir("Silvia", "Editar");
      fireEvent.click(await screen.findByRole("button", { name: T.salvar }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(repo.alterar).not.toHaveBeenCalled();
    });

    it("o banco recusa (a Conta mudou em outro aparelho): o formulário fica aberto com a mensagem", async () => {
      definir(mockup());
      const alterar = vi.fn(async (): Promise<ResultadoAlterarConta> => ({ ok: false, codigo: "conta.mudou" }));
      montar(vi.fn(), { alterar });
      await abrir("Silvia", "Editar");
      fireEvent.change(await screen.findByRole("textbox", { name: T.nome }), { target: { value: "Silvia 2" } });
      fireEvent.click(screen.getByRole("button", { name: T.salvar }));
      expect(await screen.findByText("Esta conta mudou em outro aparelho. Feche e abra de novo para ver como ficou.")).toBeTruthy();
      expect(screen.getByRole("dialog", { name: T.titulo_editar })).toBeTruthy();
    });

    it("uma parcelada que passa a terminar antes de hoje vira Encerrada e o filtro passa a mostrá-la", async () => {
      definir([bombinhas()]);
      const alterar = vi.fn(
        async (c: { id: string }): Promise<ResultadoAlterarConta> => ({
          ok: true,
          conta: contaDb({ id: c.id, nome: "Bombinhas", mes_inicial: "2026-07", repeticao: "parcelas", parcela_total: 2, responsavel_id: null, divisao: umTerco }),
          resumo: { excluidas: 0, criadas: 0, mantidas: [] },
        }),
      );
      montar(vi.fn(), { alterar });
      await abrir("Bombinhas", "Editar");
      fireEvent.change(await screen.findByRole("textbox", { name: T.parcelas }), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("button", { name: T.salvar }));
      await waitFor(() => expect(alterar).toHaveBeenCalledOnce());
      mudarBanco("contas_manuais", () => [
        contaDb({ id: "bombinhas", nome: "Bombinhas", mes_inicial: "2026-07", repeticao: "parcelas", parcela_total: 2, responsavel_id: null, divisao: umTerco }),
      ]);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(filtro("Encerradas").getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("Encerrar", () => {
    it("pergunta 'A partir de qual mês?' (padrão: o mês seguinte) e mostra o que sai e o que fica", async () => {
      definir(mockup());
      montar(vi.fn(), {
        ler: vi.fn(async () => leitura([lan("s11", "2026-11", 11), lan("s12", "2026-12", 12), lan("s13", "2027-01", 13, { editado_em: T0 })])),
      });
      await abrir("Silvia", "Encerrar");
      expect(await screen.findByRole("dialog", { name: T.titulo_encerrar })).toBeTruthy();
      expect((screen.getByLabelText(T.encerrar_a_partir) as HTMLInputElement).value).toBe("2026-12");
      expect(await screen.findByText("1 lançamento de Dez/26 em diante será excluído.")).toBeTruthy();
      expect(screen.getByText("Ficam como estão: Jan/27 (editada à mão).")).toBeTruthy();
      fireEvent.change(screen.getByLabelText(T.encerrar_a_partir), { target: { value: "2026-11" } });
      expect(await screen.findByText("2 lançamentos de Nov/26 em diante serão excluídos.")).toBeTruthy();
    });

    it("confirmar chama encerrar com a Conta, o Mês escolhido e o Mês atual; mostra o aviso e a lista passa a Encerrada", async () => {
      definir(mockup());
      const encerrar = vi.fn(
        async (c: { id: string }, mes: string): Promise<ResultadoAlterarConta> => ({
          ok: true,
          conta: contaDb({ id: c.id, nome: "Silvia", encerrada_em_mes: mes }),
          resumo: { excluidas: 2, criadas: 0, mantidas: [] },
        }),
      );
      montar(vi.fn(), { encerrar });
      await abrir("Silvia", "Encerrar");
      await screen.findByText("2 lançamentos de Dez/26 em diante serão excluídos.".replace("2 lançamentos", "2 lançamentos"));
      fireEvent.click(screen.getByRole("button", { name: T.encerrar }));
      await waitFor(() => expect(encerrar).toHaveBeenCalledOnce());
      expect(encerrar.mock.calls[0]).toEqual([expect.objectContaining({ id: "silvia" }), "2026-12", "2026-11"]);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByText("Conta encerrada: 2 lançamentos excluídos")).toBeTruthy();
    });

    it("um Mês que o núcleo recusa mostra a mensagem e desativa 'Encerrar' (antes do Mês atual, no Mês inicial)", async () => {
      definir(mockup());
      const repo = montar();
      await abrir("Silvia", "Encerrar");
      await screen.findByText(/serão excluídos/);
      fireEvent.change(screen.getByLabelText(T.encerrar_a_partir), { target: { value: "2026-10" } });
      expect(await screen.findByText("Escolha o mês atual ou um mês seguinte: os meses anteriores não mudam.")).toBeTruthy();
      expect((screen.getByRole("button", { name: T.encerrar }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText(T.encerrar_a_partir), { target: { value: "" } });
      expect(await screen.findByText("Escolha o mês em que a conta começa.")).toBeTruthy();
      expect((screen.getByRole("button", { name: T.encerrar }) as HTMLButtonElement).disabled).toBe(true);
      expect(repo.encerrar).not.toHaveBeenCalled();
    });

    it("antes da leitura chegar, 'Encerrar' fica desativado; se a leitura falhar, mostra o erro", async () => {
      definir(mockup());
      let responde!: (r: ResultadoLerConta) => void;
      montar(vi.fn(), { ler: vi.fn(() => new Promise<ResultadoLerConta>((r) => (responde = r))) });
      await abrir("Silvia", "Encerrar");
      expect((await screen.findByRole("button", { name: T.encerrar })).hasAttribute("disabled")).toBe(true);
      expect(screen.getByText(T.conferindo)).toBeTruthy();
      act(() => responde({ ok: false, codigo: "salvar.falhou" }));
      expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
      expect((screen.getByRole("button", { name: T.encerrar }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("o banco recusa: a janela fica aberta com a mensagem e Cancelar fecha sem gravar", async () => {
      definir(mockup());
      const encerrar = vi.fn(async (): Promise<ResultadoAlterarConta> => ({ ok: false, codigo: "conta.mudou" }));
      montar(vi.fn(), { encerrar });
      const u = await abrir("Silvia", "Encerrar");
      await screen.findByText(/serão excluídos/);
      await u.click(screen.getByRole("button", { name: T.encerrar }));
      expect(await screen.findByText(/mudou em outro aparelho/)).toBeTruthy();
      await u.click(screen.getByRole("button", { name: T.cancelar }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(encerrar).toHaveBeenCalledOnce();
    });
  });

  describe("Excluir e o Desfazer", () => {
    const excluida = (excluidas: number): ResultadoExcluirConta => ({
      ok: true,
      conta: contaDb({ id: "silvia", nome: "Silvia", excluido_em: "2026-11-15T12:00:00+00:00" }),
      resumo: { excluidas, criadas: 0, mantidas: [] },
      desfazer: { conta_id: "silvia", ids: ["s11", "s12"] },
    });

    it("pergunta se leva os lançamentos dos meses seguintes (com a contagem), abre em Cancelar e mostra o que fica", async () => {
      definir(mockup());
      montar(vi.fn(), {
        ler: vi.fn(async () => leitura([lan("s11", "2026-11", 11), lan("s12", "2026-12", 12, { status_id: "s-pago" })], ["s-pago"])),
      });
      await abrir("Silvia", "Excluir");
      expect(await screen.findByRole("dialog", { name: "Excluir a conta Silvia?" })).toBeTruthy();
      expect(await screen.findByText("Há 1 lançamento previsto de Nov/26 em diante que pode sair junto.")).toBeTruthy();
      expect(screen.getByText("Ficam como estão: Dez/26 (já paga).")).toBeTruthy();
      expect(screen.getByRole("button", { name: T.excluir_so_a_conta })).toBeTruthy();
      expect(screen.getByRole("button", { name: T.excluir_com_lancamentos })).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: T.cancelar })));
    });

    it("'Excluir também os lançamentos' chama excluir(conta, true), a Conta sai da lista e o aviso traz o Desfazer", async () => {
      definir(mockup());
      const excluir = vi.fn(async (): Promise<ResultadoExcluirConta> => {
        mudarBanco("contas_manuais", (l) => (l as LinhaConta[]).filter((c) => c.id !== "silvia"));
        return excluida(2);
      });
      const restaurar = vi.fn(async () => ({ ok: true as const, conta: contaDb(), restauradas: 2 }));
      montar(vi.fn(), { excluir, restaurar });
      const u = await abrir("Silvia", "Excluir");
      await screen.findByText(/pode sair junto|podem sair junto/);
      await u.click(screen.getByRole("button", { name: T.excluir_com_lancamentos }));
      await waitFor(() => expect(excluir).toHaveBeenCalledOnce());
      expect(excluir.mock.calls[0]).toEqual([expect.objectContaining({ id: "silvia" }), true, "2026-11"]);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(nomes()).not.toContain("Silvia");
      expect(screen.getByText("Conta Silvia excluída, com 2 lançamentos")).toBeTruthy();

      // O Desfazer manda o pedido de restaurar com os MESMOS ids (AD-16), uma vez só.
      await u.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(restaurar).toHaveBeenCalledOnce();
      expect(restaurar).toHaveBeenCalledWith({ conta_id: "silvia", ids: ["s11", "s12"] });
    });

    it("'Excluir só a conta' chama excluir(conta, false)", async () => {
      definir(mockup());
      const excluir = vi.fn(async (): Promise<ResultadoExcluirConta> => excluida(0));
      montar(vi.fn(), { excluir });
      const u = await abrir("TVbox", "Excluir");
      await screen.findByText(/lançamentos? previstos? de Nov.26/);
      await u.click(screen.getByRole("button", { name: T.excluir_so_a_conta }));
      await waitFor(() => expect(excluir).toHaveBeenCalledOnce());
      expect(excluir.mock.calls[0]).toEqual([expect.objectContaining({ id: "tvbox" }), false, "2026-11"]);
      expect(await screen.findByText("Conta TVbox excluída")).toBeTruthy();
    });

    it("se o Desfazer falhar, o aviso diz o que aconteceu", async () => {
      definir(mockup());
      const excluir = vi.fn(async (): Promise<ResultadoExcluirConta> => excluida(1));
      const restaurar = vi.fn(async () => ({ ok: false as const, codigo: "conexao.gravar_sem_conexao" as const }));
      montar(vi.fn(), { excluir, restaurar });
      const u = await abrir("Silvia", "Excluir");
      await screen.findByText(/pode sair junto|podem sair junto/);
      await u.click(screen.getByRole("button", { name: T.excluir_so_a_conta }));
      await u.click(await screen.findByRole("button", { name: "Desfazer" }));
      expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    });

    it("Cancelar fecha sem excluir; antes da leitura os dois botões de excluir ficam desativados", async () => {
      definir(mockup());
      let responde!: (r: ResultadoLerConta) => void;
      const repo = montar(vi.fn(), { ler: vi.fn(() => new Promise<ResultadoLerConta>((r) => (responde = r))) });
      const u = await abrir("Silvia", "Excluir");
      expect((await screen.findByRole("button", { name: T.excluir_com_lancamentos }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: T.excluir_so_a_conta }) as HTMLButtonElement).disabled).toBe(true);
      act(() => responde(leitura([])));
      await waitFor(() => expect((screen.getByRole("button", { name: T.excluir_so_a_conta }) as HTMLButtonElement).disabled).toBe(false));
      expect(screen.getByText("Não há lançamentos previstos dos meses seguintes para excluir junto.")).toBeTruthy();
      await u.click(screen.getByRole("button", { name: T.cancelar }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(repo.excluir).not.toHaveBeenCalled();
    });

    it("o banco recusa: a janela fica aberta com a mensagem", async () => {
      definir(mockup());
      const excluir = vi.fn(async (): Promise<ResultadoExcluirConta> => ({ ok: false, codigo: "conta.mudou" }));
      montar(vi.fn(), { excluir });
      const u = await abrir("Silvia", "Excluir");
      await screen.findByText(/pode sair junto|podem sair junto/);
      await u.click(screen.getByRole("button", { name: T.excluir_com_lancamentos }));
      expect(await screen.findByText(/mudou em outro aparelho/)).toBeTruthy();
      expect(screen.getByRole("dialog", { name: "Excluir a conta Silvia?" })).toBeTruthy();
    });
  });

  describe("salvar uma Conta", () => {
    const salvarNoBanco =
      (extra: Partial<LinhaConta> = {}, criados = 6) =>
      async (c: NovaConta): Promise<ResultadoSalvarConta> => {
        const conta = contaDb({
          id: c.id,
          nome: c.nome,
          valor_centavos: c.valor_centavos,
          tipo_id: c.tipo_id,
          mes_inicial: c.mes_inicial,
          repeticao: c.repeticao,
          parcela_total: c.parcela_total,
          responsavel_id: null,
          divisao: umTerco,
          ...extra,
        });
        // O repositório de verdade aplica a Conta no gerenciador; o falso faz o mesmo.
        mudarBanco("contas_manuais", (l) => [...l, conta]);
        return { ok: true, criados, conta };
      };

    it("a Bombinhas: salva com o Mês atual de hoje e a Conta entra na lista (no lugar do 'Salvas agora')", async () => {
      definir([silvia()]);
      const salvar = vi.fn<Salvar>(salvarNoBanco());
      montar(salvar);
      await cadastrarBombinhas();
      await waitFor(() => expect(salvar).toHaveBeenCalledOnce());
      expect(salvar.mock.calls[0][1]).toBe("2026-11");
      expect(salvar.mock.calls[0][0]).toMatchObject({ nome: "Bombinhas", valor_centavos: 31_800, parcela_total: 6 });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(nomes()).toEqual(["Bombinhas", "Silvia"]);
      expect(celulas("Bombinhas")[0].textContent).toContain("6 parcelas · Jul/26 a Dez/26");
      expect(sem(celulas("Bombinhas")[1].textContent)).toBe("R$ 318,00por parcela");
      expect(screen.getByText("Conta salva: 6 lançamentos criados")).toBeTruthy();
      expect(screen.queryByText("Salvas agora")).toBeNull();
    });

    it("a primeira Conta tira a tela do estado vazio", async () => {
      montar(vi.fn<Salvar>(salvarNoBanco()));
      expect(screen.getByText(T.vazio)).toBeTruthy();
      await cadastrarBombinhas();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(nomes()).toEqual(["Bombinhas"]);
      expect(screen.queryByText(T.vazio)).toBeNull();
    });

    it("uma Conta salva que já nasce Encerrada não some: o filtro passa a mostrá-la", async () => {
      definir([silvia()]);
      montar(vi.fn<Salvar>(salvarNoBanco({ parcela_total: 2, mes_inicial: "2026-05" }, 0)));
      await cadastrarBombinhas();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(filtro("Encerradas").getAttribute("aria-pressed")).toBe("true");
      expect(nomes()).toEqual(["Bombinhas"]);
      expect(celulas("Bombinhas")[4].textContent).toBe("Encerrada");
    });

    it("em Todas, o filtro fica em Todas depois de salvar", async () => {
      definir([silvia()]);
      montar(vi.fn<Salvar>(salvarNoBanco()));
      fireEvent.click(filtro("Todas"));
      await cadastrarBombinhas();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(filtro("Todas").getAttribute("aria-pressed")).toBe("true");
    });

    it("o banco recusa: o formulário continua aberto com o erro e nada entra na lista", async () => {
      definir([silvia()]);
      const salvar = vi.fn(async (): Promise<ResultadoSalvarConta> => ({ ok: false, codigo: "salvar.falhou" }));
      montar(salvar);
      await cadastrarBombinhas();
      expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
      expect(screen.getByRole("dialog")).toBeTruthy();
      // Com a janela aberta, a lista fica escondida do leitor de tela (hidden).
      const lista = within(screen.getByRole("table", { name: T.lista, hidden: true }));
      expect(lista.getByText("Silvia")).toBeTruthy();
      expect(lista.queryByText("Bombinhas")).toBeNull();
    });
  });

  describe("sem internet", () => {
    it("a lista continua visível (só consulta) e o botão ＋ Nova conta abre o formulário com Salvar desativado", () => {
      falso.online = false;
      definir(mockup());
      const salvar = vi.fn();
      montar(salvar);
      expect(nomes()).toEqual(["Bombinhas", "Silvia", "TVbox", "William"]);
      expect(nova().disabled).toBe(false);
      fireEvent.click(nova());
      expect((screen.getByRole("button", { name: T.salvar }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(T.sem_internet)).toBeTruthy();
      expect(salvar).not.toHaveBeenCalled();
    });

    it("os filtros funcionam sem internet (é só leitura da memória)", () => {
      falso.online = false;
      definir([...mockup(), contaDb({ id: "velha", nome: "Antiga", encerrada_em_mes: "2026-06" })]);
      montar();
      fireEvent.click(filtro("Encerradas"));
      expect(nomes()).toEqual(["Antiga"]);
    });
  });
});
