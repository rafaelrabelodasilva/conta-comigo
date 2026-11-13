// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { abasDaPlanilha, type Celula } from "@/domain/importacao-planilha";
import { TEXTOS_PLANILHA as T } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoImportarPlanilha } from "./SecaoImportarPlanilha";

const CABECALHO: Celula[] = ["Despesa", "Valor", "Parcela", "Observação ", "Tipo", "Resposabilidade", "Lançado por", "Status dívida"];

const falso = vi.hoisted(() => ({
  lerXlsx: vi.fn(),
  lerEstado: vi.fn(),
  lerCadastros: vi.fn(),
  importarAba: vi.fn(),
  apagarHistorico: vi.fn(),
  mesesComHistorico: vi.fn(),
  criarIniciais: vi.fn(),
  listarRegras: vi.fn(),
  criarResp: vi.fn(),
  criarTipo: vi.fn(),
  criarStatus: vi.fn(),
}));

vi.mock("./ler-xlsx", () => ({ lerXlsx: falso.lerXlsx }));
vi.mock("@/data/planilha-repo", () => ({
  repoPlanilha: () => ({
    lerEstado: falso.lerEstado,
    lerCadastros: falso.lerCadastros,
    importarAba: falso.importarAba,
    apagarHistorico: falso.apagarHistorico,
    mesesComHistorico: falso.mesesComHistorico,
  }),
}));
vi.mock("@/data/regras-repo", () => ({ repoRegras: () => ({ criarIniciais: falso.criarIniciais, listar: falso.listarRegras }) }));
vi.mock("@/data/responsaveis-repo", () => ({ repoResponsaveis: () => ({ criar: falso.criarResp, desarquivar: vi.fn() }) }));
vi.mock("@/data/tipos-repo", () => ({ repoTipos: () => ({ criar: falso.criarTipo, desarquivar: vi.fn() }) }));
vi.mock("@/data/status-repo", () => ({ repoStatus: () => ({ criar: falso.criarStatus, desarquivar: vi.fn(), definirContaComoPago: vi.fn() }) }));

const CELULAS = new Map<string, readonly (readonly Celula[])[]>([
  ["01/2026", [CABECALHO, ["SHOPEE CELLSOLUTIONS", "523,66", "03/12", "Ipad", "Presente", "Rafael", "Rafael"]]],
  ["02/2026", [CABECALHO, ["OUTRA", "dez", "", "", "", "", ""]]],
  ["11/2026", [CABECALHO, ["QUALQUER", "1,00", "", "", "Casa", "Rafael", ""]]],
]);

function abrir() {
  render(
    <ToastProvider>
      <SecaoImportarPlanilha />
    </ToastProvider>,
  );
  return userEvent.setup();
}

async function escolherArquivo(usuario: ReturnType<typeof userEvent.setup>) {
  const arquivo = new File(["x"], "cartao.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await usuario.upload(screen.getByLabelText(T.escolher), arquivo);
}

describe("SecaoImportarPlanilha (História 3.10)", () => {
  beforeEach(() => {
    for (const f of Object.values(falso)) f.mockReset();
    falso.lerXlsx.mockResolvedValue({ ok: true, valor: { abas: abasDaPlanilha([...CELULAS.keys()]), celulas: CELULAS } });
    falso.lerEstado.mockResolvedValue({ ok: true, estado: { mesesComFatura: ["2026-11"], mesesComHistorico: [], linhas: [] } });
    falso.lerCadastros.mockResolvedValue({
      ok: true,
      cadastros: { responsaveis: [{ id: "r1", nome: "Rafael", arquivado: false }], tipos: [{ id: "t1", nome: "Presente", arquivado: false }], status: [] },
      responsaveis: [{ id: "r1", nome: "Rafael", cor: 1, ordem: 1, arquivado: false }],
    });
    falso.importarAba.mockImplementation(async (p: { linhas: unknown[] }) => ({ ok: true, lancamentos: p.linhas.length }));
    falso.criarIniciais.mockResolvedValue({ ok: true, criadas: [{ created_at: "2026-11-13T12:00:00.000000+00:00" }] });
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [] });
    falso.mesesComHistorico.mockResolvedValue({ ok: true, meses: [] });
    falso.apagarHistorico.mockResolvedValue({ ok: true, quantidade: 3 });
  });

  it("começa pedindo o arquivo e explica que nada vai ao Google", () => {
    abrir();
    expect(screen.getByRole("heading", { name: "Importar planilha" })).toBeTruthy();
    expect(screen.getByText(/nada é enviado ao Google/)).toBeTruthy();
    expect(screen.getByRole("button", { name: T.escolher })).toBeTruthy();
  });

  it("lista as abas de Mês com 01/2026 a 10/2026 marcadas e avisa a que já tem Fatura", async () => {
    const usuario = abrir();
    await escolherArquivo(usuario);
    const caixas = await screen.findAllByRole("checkbox");
    expect(caixas).toHaveLength(3);
    const marcada = (nome: string) => (screen.getByRole("checkbox", { name: new RegExp(nome) }) as HTMLInputElement).checked;
    expect(marcada("01/2026")).toBe(true);
    expect(marcada("02/2026")).toBe(true);
    expect(marcada("11/2026")).toBe(false);
    expect(screen.getByText(T.aba_com_fatura)).toBeTruthy();
  });

  it("erro ao abrir o arquivo mostra a mensagem e volta ao início", async () => {
    falso.lerXlsx.mockResolvedValue({ ok: false, erro: { codigo: "planilha.arquivo_invalido" } });
    const usuario = abrir();
    await escolherArquivo(usuario);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Não consegui abrir este arquivo/);
    expect(screen.getByRole("button", { name: T.escolher })).toBeTruthy();
  });

  it("a prévia mostra 'Não foi possível ler a aba 02/2026' e deixa importar as outras", async () => {
    const usuario = abrir();
    await escolherArquivo(usuario);
    await screen.findAllByRole("checkbox");
    await usuario.click(screen.getByRole("button", { name: T.previa }));
    expect(await screen.findByText("Não foi possível ler a aba 02/2026")).toBeTruthy();
    expect(screen.getByText(/Há um Valor que não consegui ler/)).toBeTruthy();
    expect(screen.getByText(/linha 2/)).toBeTruthy();
    // 01/2026 aparece com o que vai acontecer; nada foi gravado ainda.
    expect(screen.getByText(/1 lançamento/)).toBeTruthy();
    expect(falso.importarAba).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: T.importar }).hasAttribute("disabled")).toBe(false);
  });

  it("a prévia só conta as Regras novas: a chave que já tem Regra não entra", async () => {
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [{ chave: "SHOPEE CELLSOLUTIONS" }] });
    const usuario = abrir();
    await escolherArquivo(usuario);
    await screen.findAllByRole("checkbox");
    await usuario.click(screen.getByRole("checkbox", { name: /02\/2026/ }));
    await usuario.click(screen.getByRole("button", { name: T.previa }));
    const linha = (await screen.findByText(`${T.regras_previstas}:`)).closest("p")!;
    expect(linha.textContent).toBe(`${T.regras_previstas}: 0`);
  });

  it("importa, mostra o progresso por aba e o resumo, e leva às Regras 'criadas agora'", async () => {
    const usuario = abrir();
    await escolherArquivo(usuario);
    await screen.findAllByRole("checkbox");
    await usuario.click(screen.getByRole("checkbox", { name: /02\/2026/ }));
    await usuario.click(screen.getByRole("button", { name: T.previa }));
    await usuario.click(await screen.findByRole("button", { name: T.importar }));
    await screen.findByText(T.resumo_titulo);
    expect(falso.importarAba).toHaveBeenCalledTimes(1);
    expect(falso.importarAba.mock.calls[0][0].mes).toBe("2026-01");
    expect(screen.getByText("1 lançamento, 0 Responsáveis, 0 Tipos, 1 Regra criada")).toBeTruthy();
    const barra = screen.getByRole("progressbar", { name: "01/2026" });
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    const ver = screen.getByRole("link", { name: T.ver_regras });
    expect(ver.getAttribute("href")).toBe(
      `/configuracoes?secao=regras&criadas_desde=${encodeURIComponent("2026-11-13T12:00:00.000000+00:00")}`,
    );
    expect(screen.getByRole("link", { name: T.ver_painel }).getAttribute("href")).toBe("/");
  });

  it("uma aba que falha na gravação mostra 'Não foi possível ler a aba' e a outra segue", async () => {
    falso.importarAba.mockImplementation(async (p: { mes: string; linhas: unknown[] }) =>
      p.mes === "2026-01" ? { ok: false, codigo: "planilha.serie_ocupada" } : { ok: true, lancamentos: p.linhas.length },
    );
    falso.lerXlsx.mockResolvedValue({
      ok: true,
      valor: {
        abas: abasDaPlanilha(["01/2026", "03/2026"]),
        celulas: new Map([
          ["01/2026", CELULAS.get("01/2026")!],
          ["03/2026", [CABECALHO, ["COBASI", "10,00", "", "", "Presente", "Rafael", ""]]],
        ]),
      },
    });
    const usuario = abrir();
    await escolherArquivo(usuario);
    await screen.findAllByRole("checkbox");
    await usuario.click(screen.getByRole("button", { name: T.previa }));
    await usuario.click(await screen.findByRole("button", { name: T.importar }));
    await screen.findByText(T.resumo_titulo);
    expect(falso.importarAba).toHaveBeenCalledTimes(2);
    const alertas = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alertas.some((t) => t?.includes("Não foi possível ler a aba 01/2026"))).toBe(true);
    expect(screen.getByText(/1 lançamento,/)).toBeTruthy();
  });

  it("sem cor livre para os Responsáveis novos, a prévia avisa e bloqueia 'Importar'", async () => {
    falso.lerCadastros.mockResolvedValue({
      ok: true,
      cadastros: { responsaveis: [], tipos: [], status: [] },
      responsaveis: Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, nome: `P${i}`, cor: i + 1, ordem: i + 1, arquivado: false })),
    });
    const usuario = abrir();
    await escolherArquivo(usuario);
    await screen.findAllByRole("checkbox");
    await usuario.click(screen.getByRole("checkbox", { name: /02\/2026/ }));
    await usuario.click(screen.getByRole("button", { name: T.previa }));
    expect(await screen.findByText("Todas as 8 cores estão em uso.")).toBeTruthy();
    expect(screen.getByRole("button", { name: T.importar }).hasAttribute("disabled")).toBe(true);
  });

  it("'Apagar histórico importado' lista os Meses, pede confirmação e apaga só o escolhido", async () => {
    falso.mesesComHistorico.mockResolvedValue({ ok: true, meses: [{ mes: "2026-03", quantidade: 40 }, { mes: "2026-04", quantidade: 38 }] });
    const usuario = abrir();
    const lista = (await screen.findByText(/Mar\/26 · 40 lançamentos/)).closest("li")!;
    await usuario.click(within(lista).getByRole("button", { name: T.apagar }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(falso.apagarHistorico).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: T.confirmar_apagar }));
    await waitFor(() => expect(falso.apagarHistorico).toHaveBeenCalledWith("2026-03"));
    await waitFor(() => expect(falso.mesesComHistorico).toHaveBeenCalledTimes(2));
  });

  it("sem histórico importado mostra a frase de vazio", async () => {
    abrir();
    expect(await screen.findByText(T.historico_vazio)).toBeTruthy();
  });
});
