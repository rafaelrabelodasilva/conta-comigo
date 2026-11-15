// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NovaConta } from "@/domain/contas-manuais";
import { TEXTOS_CONTAS as T } from "@/domain/mensagens";
import type { LinhaConta, ResultadoSalvarConta } from "@/data/contas-repo";
import { ToastProvider } from "@/ui/Toast";
import { ContasManuais, type AcoesDaConta } from "./ContasManuais";

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

function montar(salvar: Salvar = vi.fn(), acoes?: AcoesDaConta) {
  return render(
    <ToastProvider>
      <ContasManuais titulo="Contas manuais" repo={{ salvar }} {...(acoes ? { acoes } : {})} />
    </ToastProvider>,
  );
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
    it("tem Editar, Encerrar e Excluir, visíveis e desativados 'Em breve' enquanto a 5.4 não chega", async () => {
      definir(mockup());
      montar();
      await userEvent.setup().click(screen.getByRole("button", { name: "Ações de Bombinhas" }));
      const itens = await screen.findAllByRole("menuitem");
      expect(itens.map((i) => i.textContent)).toEqual(["EditarEm breve", "EncerrarEm breve", "ExcluirEm breve"]);
      for (const i of itens) expect(i.getAttribute("aria-disabled")).toBe("true");
    });

    it("com o callback da 5.4, o item vale e recebe a Conta da linha, sem lógica na lista", async () => {
      definir(mockup());
      const aoEditar = vi.fn();
      const aoEncerrar = vi.fn();
      const aoExcluir = vi.fn();
      montar(vi.fn(), { aoEditar, aoEncerrar, aoExcluir });
      const u = userEvent.setup();

      await u.click(screen.getByRole("button", { name: "Ações de Bombinhas" }));
      expect(screen.getByRole("menuitem", { name: "Editar" }).getAttribute("aria-disabled")).toBeNull();
      await u.click(screen.getByRole("menuitem", { name: "Editar" }));
      expect(aoEditar).toHaveBeenCalledOnce();
      expect(aoEditar.mock.calls[0][0]).toMatchObject({ id: "bombinhas", nome: "Bombinhas", valor_centavos: 31_800 });

      await u.click(screen.getByRole("button", { name: "Ações de Silvia" }));
      await u.click(screen.getByRole("menuitem", { name: "Encerrar" }));
      expect(aoEncerrar.mock.calls[0][0]).toMatchObject({ id: "silvia" });

      await u.click(screen.getByRole("button", { name: "Ações de TVbox" }));
      await u.click(screen.getByRole("menuitem", { name: "Excluir" }));
      expect(aoExcluir.mock.calls[0][0]).toMatchObject({ id: "tvbox" });
    });

    it("sem internet, as ações que gravam ficam visíveis e desativadas ('Sem conexão')", async () => {
      falso.online = false;
      definir(mockup());
      const aoEditar = vi.fn();
      montar(vi.fn(), { aoEditar });
      await userEvent.setup().click(screen.getByRole("button", { name: "Ações de Silvia" }));
      const editar = screen.getByRole("menuitem", { name: /^Editar/ });
      expect(editar.textContent).toBe("EditarSem conexão");
      expect(editar.getAttribute("aria-disabled")).toBe("true");
      await userEvent.setup().click(editar);
      expect(aoEditar).not.toHaveBeenCalled();
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
