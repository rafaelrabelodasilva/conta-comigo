// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extracao } from "@/domain/extracao-fatura";
import type { Importacao, LinhaParaReimportar } from "@/domain/importacao-fatura";
import {
  ETAPAS_IMPORTACAO,
  ROTULOS,
  TEXTOS_IMPORTAR as T,
  TEXTOS_REVISAR,
  avisoReimportar,
  avisoReimportarBloqueado,
  mensagem,
  rotuloDespesasCreditos,
  rotuloParcelasHerdadas,
  rotuloPrevistosCasados,
  rotuloPrevistosNaoVieram,
  rotuloReimportado,
  rotuloResumoClassificacao,
  rotuloTotalAPagar,
  textoExtracaoIncompleta,
} from "@/domain/mensagens";
import extracaoOutubro from "../../../test/fixtures/extracao-2026-10.json";
import { ToastProvider } from "@/ui/Toast";
import { ImportarFatura, LIMITE_CLASSIFICAR_MS } from "./ImportarFatura";

// O pdf.js, a rota, o gerenciador de Realtime e o repositório são falsos:
// o teste confere os passos, que o texto vai limpo (sem senha, CPF, cartão
// nem nome do titular) e o que a janela manda gravar.
const falso = vi.hoisted(() => ({
  lerPdf: vi.fn(),
  fetch: vi.fn(),
  importar: vi.fn(),
  lerReimportacao: vi.fn(),
  lerPrevistosDoMes: vi.fn(),
  lerParcelasDoMesAnterior: vi.fn(),
  faturas: [] as { id: string; mes: string }[],
  configuracoes: [] as { limite_ajuste_centavos: number; status_padrao_id?: string | null }[],
  responsaveis: [] as { id: string; nome: string; arquivado: boolean }[],
  tipos: [] as { id: string; nome: string; arquivado: boolean }[],
  listarRegras: vi.fn(),
  marcarUso: vi.fn(),
  // Status de Responsáveis e Tipos no gerenciador falso (os outros: "pronto").
  statusCadastros: "pronto" as "carregando" | "pronto" | "erro",
  ouvintes: new Set<() => void>(),
  // Muda a cada chegada simulada pelo Realtime (as telas rerenderizam).
  versao: 0,
}));
vi.mock("./ler-pdf", () => ({ lerPdf: falso.lerPdf }));
vi.mock("@/data/realtime", async () => {
  const { useSyncExternalStore } = await import("react");
  const assinar = (ouvinte: () => void) => {
    falso.ouvintes.add(ouvinte);
    return () => falso.ouvintes.delete(ouvinte);
  };
  const statusDe = (tabela: string) =>
    tabela === "responsaveis" || tabela === "tipos" ? falso.statusCadastros : "pronto";
  return {
    useLinhas: (tabela: string) => ({
      status: useSyncExternalStore(assinar, () => `${statusDe(tabela)}|${falso.versao}`).split("|")[0],
      linhas:
        tabela === "configuracoes"
          ? falso.configuracoes
          : tabela === "responsaveis"
            ? falso.responsaveis
            : tabela === "tipos"
              ? falso.tipos
              : falso.faturas,
    }),
  };
});
vi.mock("@/data/faturas-repo", () => ({
  repoFaturas: () => ({
    importar: falso.importar,
    lerReimportacao: falso.lerReimportacao,
    lerPrevistosDoMes: falso.lerPrevistosDoMes,
    lerParcelasDoMesAnterior: falso.lerParcelasDoMesAnterior,
  }),
}));
vi.mock("@/data/regras-repo", () => ({
  repoRegras: () => ({ listar: falso.listarRegras, marcarUso: falso.marcarUso }),
}));

const TEXTO_PDF = [
  "Olá, Fulana! Esta é a fatura do seu cartão SANTANDER",
  "FULANA DE TAL CPF: 123.456.789-09",
  "RUA DAS FLORES 10",
  "01234-567 SAO PAULO SP",
  "Detalhamento da Fatura",
  "@ FULANA DE TAL - 4220 XXXX XXXX 5061",
  "04/09 MSC CRUZEIROS 01/12 1.140,74",
].join("\n");

const outubro = extracaoOutubro as Extracao;

const resposta = (extracao: Extracao = outubro) =>
  new Response(JSON.stringify({ extracao, resumo: {}, servidor_ms: 1, gemini_ms: 1 }), { status: 200 });

function arquivoPdf(nome = "fatura.pdf") {
  const f = new File(["%PDF-1.7"], nome, { type: "application/pdf" });
  Object.defineProperty(f, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  return f;
}

const aoMudar = vi.fn();
const aoImportar = vi.fn();
const aoIrParaRevisao = vi.fn();

function Montar() {
  const [aberta, setAberta] = useState(true);
  return (
    <ToastProvider>
      <ImportarFatura
        aberta={aberta}
        aoMudar={(a) => {
          aoMudar(a);
          setAberta(a);
        }}
        aoImportar={aoImportar}
        aoIrParaRevisao={aoIrParaRevisao}
      />
    </ToastProvider>
  );
}

async function escolherPdf() {
  const u = userEvent.setup();
  render(<Montar />);
  await u.upload(screen.getByLabelText(T.arquivo), arquivoPdf());
  await u.click(screen.getByRole("button", { name: T.continuar }));
  return u;
}

async function digitarSenha(u: ReturnType<typeof userEvent.setup>, senha: string) {
  const campo = await screen.findByLabelText(T.senha);
  await u.clear(campo);
  await u.type(campo, senha);
  await u.click(screen.getByRole("button", { name: T.continuar }));
}

const PASSO_3 = "Fatura de outubro · vence 06/10/26";

/**
 * Depois de gravar com linhas para revisar (sem Regras nem Tipos, todas vão
 * para a fila), o passo 3 mostra o resumo; "Ver no Painel" fecha a janela.
 */
async function verNoPainel() {
  await userEvent.setup().click(await screen.findByRole("button", { name: TEXTOS_REVISAR.ver_no_painel }));
  expect(aoMudar).toHaveBeenCalledWith(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  falso.faturas = [];
  falso.configuracoes = [];
  falso.responsaveis = [];
  falso.tipos = [];
  falso.listarRegras.mockResolvedValue({ ok: true, regras: [] });
  falso.marcarUso.mockResolvedValue({ ok: true });
  falso.statusCadastros = "pronto";
  vi.stubGlobal("fetch", falso.fetch);
  // Primeiro sem senha (pede a senha), depois com a senha certa.
  falso.lerPdf.mockImplementation(async (_dados: Uint8Array, senha: string) =>
    senha === ""
      ? { ok: false, erro: { codigo: "fatura.senha_vazia" } }
      : { ok: true, valor: { texto: TEXTO_PDF, paginas: 1, ms: 10 } },
  );
  falso.fetch.mockImplementation(async () => resposta());
  falso.importar.mockResolvedValue({ ok: true, quantidade: 49 });
  falso.lerReimportacao.mockResolvedValue({ ok: true, valor: null });
  falso.lerPrevistosDoMes.mockResolvedValue({ ok: true, previstos: [], atualizadoEm: null });
  falso.lerParcelasDoMesAnterior.mockResolvedValue({ ok: true, candidatas: [] });
});

describe("ImportarFatura", () => {
  it("outubro: senha, texto limpo, passo 3 com vencimento, Mês, Conferência e 49; Importar grava e fecha", async () => {
    const u = await escolherPdf();
    expect(screen.getByText("Passo 2 de 3 · Senha")).toBeTruthy();
    // Pedir a senha não é erro.
    expect(screen.getByLabelText(T.senha).getAttribute("aria-invalid")).toBeNull();
    await digitarSenha(u, "segredo");

    expect(await screen.findByText(PASSO_3)).toBeTruthy();
    expect(screen.getByText("Passo 3 de 3 · Conferir")).toBeTruthy();
    expect(screen.getByText("✓ Conferido")).toBeTruthy();
    // Sem normalizar: o espaço entre "R$" e o número é inseparável.
    expect(screen.getByText(rotuloDespesasCreditos(832739, 63962), { normalizer: (t) => t })).toBeTruthy();
    expect(screen.getByText("49 lançamentos serão gravados")).toBeTruthy();
    // O total da fatura do cartão e como os 49 chegam nele.
    expect(screen.getByText(rotuloTotalAPagar(771367), { normalizer: (t) => t })).toBeTruthy();
    expect(screen.getByText("✓ Bate com o total a pagar")).toBeTruthy();

    expect(falso.lerPdf).toHaveBeenLastCalledWith(expect.any(Uint8Array), "segredo");
    expect(falso.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = falso.fetch.mock.calls[0];
    expect(url).toBe("/api/fatura/extrair");
    expect(Object.keys(JSON.parse(init.body))).toEqual(["texto"]);
    const enviado: string = JSON.parse(init.body).texto;
    expect(init.body).not.toContain("segredo");
    expect(enviado).not.toContain("123.456.789-09");
    expect(enviado).not.toContain("RUA DAS FLORES");
    expect(enviado).not.toContain("01234-567");
    expect(enviado).not.toContain("4220");
    expect(enviado).not.toMatch(/FULANA/i);
    expect(enviado).toContain("TITULAR - final 5061");
    expect(enviado).toContain("04/09 MSC CRUZEIROS 01/12 1.140,74");

    await u.click(screen.getByRole("button", { name: T.importar }));
    await verNoPainel();
    // O Painel abre o Mês importado.
    expect(aoImportar).toHaveBeenCalledExactlyOnceWith("2026-10");
    const gravado: Importacao = falso.importar.mock.calls[0][0];
    expect(gravado.fatura.mes).toBe("2026-10");
    expect(gravado.cartoes).toHaveLength(5);
    expect(gravado.lancamentos).toHaveLength(49);
    expect(gravado.lancamentos.find((l) => l.valor_centavos === -2590)).toBeTruthy();
    expect(screen.queryByText(PASSO_3)).toBeNull();
  });

  it("PDF sem senha pula o passo 2", async () => {
    falso.lerPdf.mockResolvedValue({ ok: true, valor: { texto: TEXTO_PDF, paginas: 1, ms: 10 } });
    await escolherPdf();
    expect(await screen.findByText(PASSO_3)).toBeTruthy();
    expect(falso.lerPdf).toHaveBeenCalledTimes(1);
    expect(falso.lerPdf).toHaveBeenCalledWith(expect.any(Uint8Array), "");
    expect(screen.queryByLabelText(T.senha)).toBeNull();
  });

  it("senha errada: \"Senha incorreta\" no campo e nova tentativa sem escolher o PDF", async () => {
    const u = await escolherPdf();
    falso.lerPdf.mockResolvedValueOnce({ ok: false, erro: { codigo: "fatura.senha_incorreta" } });
    await digitarSenha(u, "errada");
    expect(await screen.findByText(mensagem("fatura.senha_incorreta"))).toBeTruthy();
    expect(screen.getByLabelText(T.senha).getAttribute("aria-invalid")).toBe("true");
    expect(falso.fetch).not.toHaveBeenCalled();

    await digitarSenha(u, "certa");
    expect(await screen.findByText(PASSO_3)).toBeTruthy();
    expect(falso.lerPdf).toHaveBeenLastCalledWith(expect.any(Uint8Array), "certa");
  });

  it("não é Santander: avisa sem chamar a leitura; \"Escolher outro PDF\" volta ao passo 1", async () => {
    falso.lerPdf.mockResolvedValue({ ok: true, valor: { texto: "Extrato de conta corrente\nSaldo 10,00", paginas: 1, ms: 1 } });
    const u = await escolherPdf();
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.nao_santander"));
    expect(falso.fetch).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: T.escolher_outro_pdf }));
    expect(screen.getByLabelText(T.arquivo)).toBeTruthy();
    expect(screen.getByRole("button", { name: T.continuar }).hasAttribute("disabled")).toBe(true);
  });

  it("incompleta: avisa quantos leu, com \"Importar mesmo assim\" e \"Cancelar\"", async () => {
    const menos = { ...outubro, lancamentos: outubro.lancamentos.slice(0, 41) };
    falso.fetch.mockImplementation(async () => resposta(menos));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect(await screen.findByText(textoExtracaoIncompleta(41))).toBeTruthy();
    expect(screen.getByRole("button", { name: ROTULOS.cancelar })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: T.importar_mesmo_assim }));
    await waitFor(() => expect(falso.importar).toHaveBeenCalledTimes(1));
    expect(falso.importar.mock.calls[0][0].lancamentos).toHaveLength(41);
  });

  it("Mês que a memória diz ter Fatura mas o banco não: vale o banco, passo 3 normal com \"Importar\"", async () => {
    falso.faturas = [{ id: "f", mes: "2026-10" }];
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    expect(falso.lerReimportacao).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: T.importar_de_novo })).toBeNull();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await waitFor(() => expect(falso.importar).toHaveBeenCalledTimes(1));
    expect(falso.importar.mock.calls[0][1]).toBeUndefined();
  });

  it("503 esgotado: mensagem e \"Tentar de novo\" reenvia o mesmo texto sem pedir PDF e senha", async () => {
    falso.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ erro: "fatura.leitura_ocupada" }), { status: 503 }));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.leitura_ocupada"));
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    expect(await screen.findByText(PASSO_3)).toBeTruthy();
    expect(falso.fetch).toHaveBeenCalledTimes(2);
    expect(falso.fetch.mock.calls[1][1].body).toBe(falso.fetch.mock.calls[0][1].body);
    expect(falso.lerPdf).toHaveBeenCalledTimes(2);
  });

  it("tempo esgotado e conexão caída na leitura também oferecem \"Tentar de novo\"", async () => {
    falso.fetch.mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.tempo_esgotado"));
    falso.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.conexao_caiu"));
    expect(screen.getByRole("button", { name: ROTULOS.tentar_de_novo })).toBeTruthy();
  });

  it("a conexão cai ao gravar: \"Nada foi gravado\" e \"Tentar de novo\" grava de novo", async () => {
    falso.importar.mockResolvedValueOnce({ ok: false, codigo: "fatura.conexao_caiu" });
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.conexao_caiu"));
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    await verNoPainel();
    expect(falso.importar).toHaveBeenCalledTimes(2);
  });

  it("\"Cancelar\" fica desligado enquanto a RPC grava", async () => {
    let terminar: (r: unknown) => void = () => {};
    falso.importar.mockImplementation(() => new Promise((r) => (terminar = r)));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect(screen.getByRole("button", { name: ROTULOS.cancelar }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: T.gravando }).hasAttribute("disabled")).toBe(true);
    // O ✕ também não fecha.
    await u.click(screen.getByRole("button", { name: ROTULOS.fechar }));
    expect(aoMudar).not.toHaveBeenCalledWith(false);
    terminar({ ok: true, quantidade: 49 });
    await verNoPainel();
  });

  it("\"Cancelar\" durante a leitura aborta, fecha e não grava", async () => {
    let sinal: AbortSignal | undefined;
    falso.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, rejeitar) => {
          sinal = init.signal ?? undefined;
          sinal?.addEventListener("abort", () => rejeitar(new DOMException("abortado", "AbortError")));
        }),
    );
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect(await screen.findByText(ETAPAS_IMPORTACAO.lendo)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(ETAPAS_IMPORTACAO.lendo);
    await u.click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(sinal?.aborted).toBe(true);
    expect(falso.importar).not.toHaveBeenCalled();
  });

  it("arquivo que não é PDF fica no passo 1 com o erro", async () => {
    falso.lerPdf.mockResolvedValue({ ok: false, erro: { codigo: "fatura.pdf_invalido" } });
    await escolherPdf();
    expect(await screen.findByText(mensagem("fatura.pdf_invalido"))).toBeTruthy();
    expect(screen.getByText("Passo 1 de 3 · Escolher o PDF")).toBeTruthy();
  });

  it("senha vazia no passo 2 avisa no campo sem abrir o PDF de novo", async () => {
    const u = await escolherPdf();
    await screen.findByLabelText(T.senha);
    await u.click(screen.getByRole("button", { name: T.continuar }));
    expect(screen.getByText(mensagem("fatura.senha_vazia"))).toBeTruthy();
    expect(falso.lerPdf).toHaveBeenCalledTimes(1);
  });

  it("nenhum Lançamento (só o pagamento da fatura anterior): leitura falhou, sem gravar", async () => {
    const pagamento = { ...outubro.lancamentos[0], nome: "PAGAMENTO DE FATURA-INTERNET", valorCentavos: -745721 };
    falso.fetch.mockImplementation(async () => resposta({ ...outubro, lancamentos: [pagamento] }));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.leitura_falhou"));
    expect(screen.queryByRole("button", { name: T.importar_mesmo_assim })).toBeNull();
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    expect(falso.importar).not.toHaveBeenCalled();
  });

  it("sessão expirada ao gravar: mostra a mensagem sem botão de gravar", async () => {
    falso.importar.mockResolvedValue({ ok: false, codigo: "auth.sessao_expirou" });
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("auth.sessao_expirou"));
    expect(screen.queryByRole("button", { name: ROTULOS.tentar_de_novo })).toBeNull();
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
  });

  it("História 3.5: os previstos das parcelas vão na gravação, só para Meses sem Fatura, e o passo 3 diz quantos", async () => {
    falso.faturas = [{ id: "f11", mes: "2026-11" }];
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    await u.click(screen.getByRole("button", { name: T.importar }));
    await verNoPainel();
    const gravado: Importacao = falso.importar.mock.calls[0][0];
    expect(gravado.previstos.length).toBeGreaterThan(0);
    // nov/26 já tem Fatura (decisão 1-A); todos são de Meses depois de out/26.
    expect(gravado.previstos.every((p) => p.mes > "2026-10" && p.mes !== "2026-11")).toBe(true);
    // Cada linha com parcela a vir tem a Série; o previsto aponta para a ordem dela.
    const ordens = new Set(gravado.lancamentos.filter((l) => l.serie !== null).map((l) => l.ordem_fatura));
    expect(gravado.previstos.every((p) => ordens.has(p.ordem_origem))).toBe(true);
  });

  it("História 3.5: sem Fatura nos Meses seguintes, o passo 3 mostra 'N parcelas previstas serão criadas'", async () => {
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    const texto = screen.getByText(/prevista.* criada/).textContent ?? "";
    await u.click(screen.getByRole("button", { name: T.importar }));
    await verNoPainel();
    const gravado: Importacao = falso.importar.mock.calls[0][0];
    expect(texto).toBe(`${gravado.previstos.length} parcelas previstas serão criadas nos próximos meses`);
  });

  it("História 3.5: 'fatura.previstos_sem_casamento' mostra a mensagem e só deixa Cancelar", async () => {
    falso.importar.mockResolvedValue({ ok: false, codigo: "fatura.previstos_sem_casamento" });
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.previstos_sem_casamento"));
    expect(screen.queryByRole("button", { name: ROTULOS.tentar_de_novo })).toBeNull();
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    expect(screen.getByRole("button", { name: ROTULOS.cancelar })).toBeTruthy();
  });

  it("dois toques rápidos em Importar chamam a RPC uma vez só", async () => {
    let terminar: (r: unknown) => void = () => {};
    falso.importar.mockImplementation(() => new Promise((r) => (terminar = r)));
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    const botao = await screen.findByRole("button", { name: T.importar });
    botao.click();
    botao.click();
    expect(falso.importar).toHaveBeenCalledTimes(1);
    terminar({ ok: true, quantidade: 49 });
    await verNoPainel();
    expect(falso.importar).toHaveBeenCalledTimes(1);
  });
});

describe("ImportarFatura: casamento dos previstos (História 3.6)", () => {
  // A primeira parcela a vir de outubro vira o previsto que a Fatura traz; "NUNCA VEIO" é o que a Fatura não traz.
  const real = outubro.lancamentos.find((l) => l.parcelaN !== null && l.parcelaTotal !== null && l.valorCentavos > 0)!;
  const prevDaFatura = (valor = real.valorCentavos) => ({
    id: "p-casa",
    nome_normalizado: real.nome.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim(),
    parcela_n: real.parcelaN as number,
    parcela_total: real.parcelaTotal as number,
    valor_centavos: valor,
    ocorrencia: 1,
    responsavel_id: "casal",
    tipo_id: "casa",
  });
  const semPar = {
    id: "p-sumiu",
    nome_normalizado: "NUNCA VEIO",
    parcela_n: 4,
    parcela_total: 6,
    valor_centavos: 5000,
    ocorrencia: 1,
    responsavel_id: null,
    tipo_id: null,
  };
  const T_MES = "2026-10-20T10:00:00.000009+00:00";

  beforeEach(() => {
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [{ id: "casa", nome: "Casa", arquivado: false }];
  });

  async function ateOPasso3() {
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    return u;
  }

  it("a parcela real pega o previsto do Mês: manda previsto_id, tira a Série dela e conta 'casou'; o que a Fatura não trouxe vai em previstos_sem_par", async () => {
    falso.lerPrevistosDoMes.mockResolvedValue({ ok: true, previstos: [prevDaFatura(), semPar], atualizadoEm: T_MES });
    const u = await ateOPasso3();
    expect(falso.lerPrevistosDoMes).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(screen.getByText(rotuloPrevistosCasados(1))).toBeTruthy();
    expect(screen.getByText(rotuloPrevistosNaoVieram(1))).toBeTruthy();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await screen.findByText(rotuloPrevistosCasados(1));
    const chamada = falso.importar.mock.calls[0] as unknown[];
    const gravado = chamada[0] as Importacao;
    const substituir = chamada[1];
    const lidoEm = chamada[2];
    const casadas = gravado.lancamentos.filter((l) => l.previsto_id);
    expect(casadas).toHaveLength(1);
    expect(casadas[0]).toMatchObject({ previsto_id: "p-casa", serie: null, responsavel_id: "casal", tipo_id: "casa", revisao_motivo: null });
    expect(gravado.previstos_sem_par).toEqual(["p-sumiu"]);
    // A trava é o updated_at lido junto dos previstos.
    expect(substituir).toBeUndefined();
    expect(lidoEm).toBe(T_MES);
  });

  it("Valor diferente: a linha entra na fila como 'valor_mudou' com o antes do previsto", async () => {
    falso.lerPrevistosDoMes.mockResolvedValue({ ok: true, previstos: [prevDaFatura(real.valorCentavos - 321)], atualizadoEm: null });
    const u = await ateOPasso3();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await screen.findByText(rotuloPrevistosCasados(1));
    const casada = (falso.importar.mock.calls[0][0] as Importacao).lancamentos.find((l) => l.previsto_id)!;
    expect(casada).toMatchObject({ revisao_motivo: "valor_mudou", revisao_dados: { antes_centavos: real.valorCentavos - 321 } });
  });

  it("depois de gravar, o resumo diz quantos previstos casaram e quantos não vieram, e oferece a revisão", async () => {
    falso.lerPrevistosDoMes.mockResolvedValue({ ok: true, previstos: [prevDaFatura(), semPar], atualizadoEm: T_MES });
    const u = await ateOPasso3();
    await u.click(screen.getByRole("button", { name: T.importar }));
    expect(await screen.findByText(rotuloPrevistosCasados(1))).toBeTruthy();
    expect(screen.getByText(rotuloPrevistosNaoVieram(1))).toBeTruthy();
    expect(screen.getByRole("button", { name: TEXTOS_REVISAR.ir_para_revisao })).toBeTruthy();
  });

  it("falha ao ler os previstos: importa sem casar, sem bloquear", async () => {
    falso.lerPrevistosDoMes.mockResolvedValue({ ok: false, codigo: "carregar.falhou" });
    const u = await ateOPasso3();
    expect(screen.queryByText(/casou com a fatura|casaram com a fatura/)).toBeNull();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await verNoPainel();
    const chamada = falso.importar.mock.calls[0] as unknown[];
    expect((chamada[0] as Importacao).lancamentos.every((l) => !l.previsto_id)).toBe(true);
    expect(chamada[2]).toBeUndefined();
  });

  it("sem previstos no Mês, nada de casamento no passo 3", async () => {
    await ateOPasso3();
    expect(screen.queryByText(/previsto.* (casou|casaram|não veio|não vieram)/)).toBeNull();
  });

  it("fatura.mes_mudou: relê os previstos, refaz o casamento e o 'Tentar de novo' grava com o plano e a trava novos", async () => {
    falso.lerPrevistosDoMes.mockResolvedValueOnce({ ok: true, previstos: [prevDaFatura()], atualizadoEm: T_MES });
    const novoDeOutroAparelho = { ...prevDaFatura(), id: "p-novo" };
    const T_NOVO = "2026-10-21T08:00:00.000003+00:00";
    falso.lerPrevistosDoMes.mockResolvedValueOnce({ ok: true, previstos: [novoDeOutroAparelho], atualizadoEm: T_NOVO });
    falso.importar.mockResolvedValueOnce({ ok: false, codigo: "fatura.mes_mudou" });
    const u = await ateOPasso3();
    await u.click(screen.getByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.mes_mudou"));
    expect(falso.lerPrevistosDoMes).toHaveBeenCalledTimes(2);
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    await screen.findByText(rotuloPrevistosCasados(1));
    expect(falso.importar).toHaveBeenCalledTimes(2);
    const segunda = falso.importar.mock.calls[1] as unknown[];
    expect((segunda[0] as Importacao).lancamentos.find((l) => l.previsto_id)?.previsto_id).toBe("p-novo");
    expect(segunda[2]).toBe(T_NOVO);
  });

  it("'fatura.reimportacao_com_casados' mostra a mensagem e só deixa Cancelar", async () => {
    falso.importar.mockResolvedValue({ ok: false, codigo: "fatura.reimportacao_com_casados" });
    const u = await ateOPasso3();
    await u.click(screen.getByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.reimportacao_com_casados"));
    expect(screen.queryByRole("button", { name: ROTULOS.tentar_de_novo })).toBeNull();
    expect(screen.getByRole("button", { name: ROTULOS.cancelar })).toBeTruthy();
  });

  it("Fatura do Mês com linhas casadas: o aviso bloqueia a reimportação, só 'Cancelar' (sem 'Importar de novo')", async () => {
    falso.faturas = [{ id: "f0", mes: "2026-10" }];
    falso.configuracoes = [];
    const limpa: LinhaParaReimportar = { excluido_em: null, responsavel_id: null, tipo_id: null, observacao: null, status_id: "nao-pago" };
    falso.lerReimportacao.mockResolvedValue({
      ok: true,
      valor: {
        faturaId: "f0",
        atualizadoEm: T_MES,
        statusPadraoId: "nao-pago",
        linhas: [limpa, { ...limpa, casado_em: "2026-12-05T10:00:00Z" }, { ...limpa, casado_em: "2026-12-05T10:00:00Z" }],
      },
    });
    await ateOPasso3();
    expect((await screen.findByRole("alert")).textContent).toBe(avisoReimportarBloqueado("2026-10", 2));
    expect(screen.queryByRole("button", { name: T.importar_de_novo })).toBeNull();
    expect(screen.getByRole("button", { name: ROTULOS.cancelar })).toBeTruthy();
  });
});

describe("ImportarFatura: reimportar um Mês (História 3.11)", () => {
  const PADRAO = "nao-pago";
  const T_AVISO = "2026-10-20T10:00:00.000001+00:00";
  const limpa: LinhaParaReimportar = { excluido_em: null, responsavel_id: null, tipo_id: null, observacao: null, status_id: PADRAO };
  // 52 linhas da Fatura, 30 classificadas ou marcadas, mais 2 excluídas.
  const linhas: LinhaParaReimportar[] = [
    ...Array.from({ length: 22 }, () => limpa),
    ...Array.from({ length: 20 }, () => ({ ...limpa, responsavel_id: "casal" })),
    ...Array.from({ length: 10 }, () => ({ ...limpa, status_id: "pago" })),
    { ...limpa, excluido_em: "2026-10-10T00:00:00Z" },
    { ...limpa, excluido_em: "2026-10-10T00:00:00Z" },
  ];
  const leitura = (faturaId = "f0", atualizadoEm: string | null = T_AVISO, l = linhas) => ({
    ok: true,
    valor: { faturaId, atualizadoEm, linhas: l, statusPadraoId: PADRAO },
  });
  const TEXTO_AVISO = avisoReimportar("2026-10", { quantidade: 52, mexidos: 30, excluidos: 2 });

  async function ateOAviso() {
    falso.faturas = [{ id: "f0", mes: "2026-10" }];
    // O Status padrão da memória ainda não chegou: vale o lido do banco com o aviso.
    falso.configuracoes = [];
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    return u;
  }

  it("História 3.5: o aviso cita os previstos que a reimportação apaga", async () => {
    falso.lerReimportacao.mockResolvedValue({
      ok: true,
      valor: { faturaId: "f0", atualizadoEm: T_AVISO, linhas, statusPadraoId: PADRAO, previstosAApagar: 5 },
    });
    await ateOAviso();
    expect(screen.getByRole("alert").textContent).toBe(
      avisoReimportar("2026-10", { quantidade: 52, mexidos: 30, excluidos: 2, previstos: 5 }),
    );
    expect(screen.getByRole("alert").textContent).toContain("Apaga também os 5 previstos que ela criou e você não mexeu.");
  });

  it("Mês com Fatura: o passo 3 mostra o aviso com 52, 30 e os 2 excluídos, \"Importar de novo\" e \"Cancelar\"", async () => {
    falso.lerReimportacao.mockResolvedValue(leitura());
    await ateOAviso();
    expect(TEXTO_AVISO).toContain("apaga os 52 lançamentos de outubro vindos da fatura (30 já classificados ou marcados à mão)");
    expect(TEXTO_AVISO).toContain("Os 2 excluídos voltam.");
    expect(screen.getByRole("alert").textContent).toBe(TEXTO_AVISO);
    expect(screen.getByRole("button", { name: T.importar_de_novo })).toBeTruthy();
    expect(screen.getByRole("button", { name: ROTULOS.cancelar })).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    expect(screen.queryByText(mensagem("fatura.mes_ja_importado"))).toBeNull();
    // Lido junto com as Regras, uma vez, do Mês da Fatura.
    expect(falso.lerReimportacao).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(falso.listarRegras).toHaveBeenCalledTimes(1);
  });

  it("a Fatura do Mês chega pelo Realtime no passo 3: lê o resumo uma vez e mostra o aviso", async () => {
    falso.lerReimportacao.mockResolvedValue(leitura());
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    expect(screen.getByRole("button", { name: T.importar })).toBeTruthy();
    expect(falso.lerReimportacao).not.toHaveBeenCalled();
    act(() => {
      falso.faturas = [{ id: "f0", mes: "2026-10" }];
      falso.versao++;
      for (const o of falso.ouvintes) o();
    });
    expect(await screen.findByRole("button", { name: T.importar_de_novo })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(TEXTO_AVISO);
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    expect(falso.lerReimportacao).toHaveBeenCalledExactlyOnceWith("2026-10");
  });

  it("extração incompleta com o aviso: mostra os dois", async () => {
    falso.lerReimportacao.mockResolvedValue(leitura());
    falso.fetch.mockImplementation(async () => resposta({ ...outubro, lancamentos: outubro.lancamentos.slice(0, 41) }));
    await ateOAviso();
    expect(screen.getByText(TEXTO_AVISO)).toBeTruthy();
    expect(screen.getByText(textoExtracaoIncompleta(41))).toBeTruthy();
    expect(screen.getByRole("button", { name: T.importar_de_novo })).toBeTruthy();
  });

  it("\"Cancelar\" fecha sem gravar", async () => {
    falso.lerReimportacao.mockResolvedValue(leitura());
    const u = await ateOAviso();
    await u.click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(falso.importar).not.toHaveBeenCalled();
    expect(aoImportar).not.toHaveBeenCalled();
  });

  it("\"Importar de novo\" grava num toque com o id e o updated_at do aviso, mostra o toast e abre o Mês", async () => {
    falso.lerReimportacao.mockResolvedValue(leitura());
    const u = await ateOAviso();
    await u.click(screen.getByRole("button", { name: T.importar_de_novo }));
    await verNoPainel();
    expect(falso.importar).toHaveBeenCalledTimes(1);
    const [gravado, substituir] = falso.importar.mock.calls[0];
    expect((gravado as Importacao).lancamentos).toHaveLength(49);
    expect(substituir).toEqual({ faturaId: "f0", atualizadoEm: T_AVISO });
    expect(aoImportar).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(await screen.findByText(rotuloReimportado("2026-10", 49))).toBeTruthy();
    // Sem "Desfazer".
    expect(screen.queryByRole("button", { name: ROTULOS.desfazer })).toBeNull();
  });

  it("importação normal não manda substituir nem mostra o toast de reimportação", async () => {
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    await verNoPainel();
    expect(falso.importar.mock.calls[0][1]).toBeUndefined();
    expect(falso.lerReimportacao).not.toHaveBeenCalled();
    expect(screen.queryByText(rotuloReimportado("2026-10", 49))).toBeNull();
  });

  it("falha ao ler o resumo: só o erro e \"Tentar de novo\", que relê só o resumo", async () => {
    falso.lerReimportacao.mockResolvedValueOnce({ ok: false, codigo: "carregar.falhou" });
    falso.lerReimportacao.mockResolvedValueOnce(leitura());
    const u = await ateOAviso();
    expect(screen.getByRole("alert").textContent).toBe(mensagem("carregar.falhou"));
    expect(screen.queryByRole("button", { name: T.importar_de_novo })).toBeNull();
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    expect(await screen.findByRole("button", { name: T.importar_de_novo })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(TEXTO_AVISO);
    expect(falso.lerReimportacao).toHaveBeenCalledTimes(2);
    // Sem chamar a leitura da Fatura de novo.
    expect(falso.fetch).toHaveBeenCalledTimes(1);
    expect(falso.importar).not.toHaveBeenCalled();
  });

  it("sessão expirada ao ler o resumo: só \"Cancelar\"", async () => {
    falso.lerReimportacao.mockResolvedValue({ ok: false, codigo: "auth.sessao_expirou" });
    await ateOAviso();
    expect(screen.getByRole("alert").textContent).toBe(mensagem("auth.sessao_expirou"));
    expect(screen.queryByRole("button", { name: ROTULOS.tentar_de_novo })).toBeNull();
  });

  it("fatura.mes_mudou ao gravar: nada gravado, erro e \"Tentar de novo\" relê os números antes de gravar de novo", async () => {
    falso.lerReimportacao.mockResolvedValueOnce(leitura());
    falso.lerReimportacao.mockResolvedValueOnce(leitura("f1", "2026-10-21T00:00:00+00:00", linhas.slice(0, 10)));
    falso.importar.mockResolvedValueOnce({ ok: false, codigo: "fatura.mes_mudou" });
    const u = await ateOAviso();
    await u.click(screen.getByRole("button", { name: T.importar_de_novo }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.mes_mudou"));
    expect(screen.queryByRole("button", { name: T.importar_de_novo })).toBeNull();
    expect(aoImportar).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: ROTULOS.tentar_de_novo }));
    const novo = avisoReimportar("2026-10", { quantidade: 10, mexidos: 0, excluidos: 0 });
    expect(await screen.findByText(novo)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: T.importar_de_novo }));
    await verNoPainel();
    expect(falso.importar.mock.calls[1][1]).toEqual({ faturaId: "f1", atualizadoEm: "2026-10-21T00:00:00+00:00" });
  });

  it("a RPC diz que o Mês já foi importado (outro aparelho): lê o resumo e oferece \"Importar de novo\"", async () => {
    falso.importar.mockResolvedValueOnce({ ok: false, codigo: "fatura.mes_ja_importado" });
    falso.lerReimportacao.mockResolvedValue(leitura());
    falso.configuracoes = [{ limite_ajuste_centavos: 100, status_padrao_id: PADRAO }];
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect(await screen.findByRole("button", { name: T.importar_de_novo })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(TEXTO_AVISO);
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    // Nada gravado: o Painel não troca de Mês.
    expect(aoImportar).not.toHaveBeenCalled();
    expect(falso.lerReimportacao).toHaveBeenCalledExactlyOnceWith("2026-10");
  });

  it("dois toques rápidos em \"Importar de novo\" chamam a RPC uma vez só", async () => {
    let terminar: (r: unknown) => void = () => {};
    falso.lerReimportacao.mockResolvedValue(leitura());
    falso.importar.mockImplementation(() => new Promise((r) => (terminar = r)));
    await ateOAviso();
    const botao = screen.getByRole("button", { name: T.importar_de_novo });
    botao.click();
    botao.click();
    expect(falso.importar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: ROTULOS.cancelar }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: T.gravando }).hasAttribute("disabled")).toBe(true);
    terminar({ ok: true, quantidade: 49 });
    await verNoPainel();
  });
});

describe("ImportarFatura: Ajustes de centavos (História 2.8)", () => {
  const msc = {
    nome: "MSC CRUZEIROS",
    data: "04/09",
    finalCartao: "5061",
    tipoSugerido: null,
    duvida: false,
  };
  const comAjuste: Extracao = {
    ...outubro,
    fatura: { ...outubro.fatura, totalDespesasCentavos: 114074, totalCreditosCentavos: 8 },
    cartoes: [{ final: "5061", valorTotalCentavos: 114074 }],
    lancamentos: [
      { ...msc, parcelaN: 2, parcelaTotal: 12, valorCentavos: 114074 },
      { ...msc, parcelaN: null, parcelaTotal: null, valorCentavos: -8 },
    ],
  };

  async function importarCom(limite: number | null) {
    if (limite !== null) falso.configuracoes = [{ limite_ajuste_centavos: limite }];
    falso.fetch.mockImplementation(async () => resposta(comAjuste));
    const u = await escolherPdf();
    await digitarSenha(u, "segredo");
    await screen.findByText(PASSO_3);
    await u.click(screen.getByRole("button", { name: T.importar }));
    await waitFor(() => expect(falso.importar).toHaveBeenCalled());
    const gravado: Importacao = falso.importar.mock.calls[0][0];
    return gravado.lancamentos.map((l) => l.ajuste_de_ordem);
  }

  it("sem configuracoes, limite R$ 1,00: o crédito de R$ 0,08 vai com a ordem da mãe", async () => {
    expect(await importarCom(null)).toEqual([null, 1]);
  });

  it("com o limite de Configurações (R$ 0,05): não é Ajuste", async () => {
    expect(await importarCom(5)).toEqual([null, null]);
  });
});

describe("ImportarFatura: classificação pelas Regras (História 3.1)", () => {
  const msc = { nome: "MSC CRUZEIROS", data: "04/09", finalCartao: "5061", duvida: false };
  const extracao: Extracao = {
    ...outubro,
    fatura: { ...outubro.fatura, totalDespesasCentavos: 114074 + 14557, totalCreditosCentavos: 8 },
    cartoes: [{ final: "5061", valorTotalCentavos: 114074 + 14557 }],
    lancamentos: [
      { ...msc, parcelaN: 3, parcelaTotal: 12, valorCentavos: 114074, tipoSugerido: null },
      { ...msc, parcelaN: null, parcelaTotal: null, valorCentavos: -8, tipoSugerido: null },
      { ...msc, nome: "PETZ", parcelaN: null, parcelaTotal: null, valorCentavos: 14557, tipoSugerido: "Gatos" },
    ],
  };
  const regraMsc = {
    chave: "MSC CRUZEIROS",
    versao_normalizacao: 1,
    responsavel_id: "casal",
    tipo_id: "casa",
    contagem: [{ responsavel_id: "casal", n: 2 }],
    ultimo_uso: "2026-10-10T00:00:00Z",
  };

  async function gravado() {
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [
      { id: "casa", nome: "Casa", arquivado: false },
      { id: "gatos", nome: "Gatos", arquivado: false },
    ];
    falso.fetch.mockImplementation(async () => resposta(extracao));
    const u = await escolherPdf();
    await digitarSenha(u, "segredo");
    await screen.findByText(PASSO_3);
    await u.click(screen.getByRole("button", { name: T.importar }));
    await waitFor(() => expect(falso.importar).toHaveBeenCalled());
    const imp: Importacao = falso.importar.mock.calls[0][0];
    return imp.lancamentos.map((l) => [l.responsavel_id, l.tipo_id, l.revisao_motivo, l.revisao_dados]);
  }

  it("parcela com Regra limpa e o Ajuste dela classificados; sem Regra com tipo_sugerido vai sugerido", async () => {
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    expect(await gravado()).toEqual([
      ["casal", "casa", null, null],
      ["casal", "casa", null, null],
      [null, null, "sugestao", { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] }],
    ]);
    expect(falso.listarRegras).toHaveBeenCalledTimes(1);
  });

  it("depois de gravar, marca o ultimo_uso só das Regras que a importação usou", async () => {
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    await gravado();
    await waitFor(() => expect(falso.marcarUso).toHaveBeenCalledTimes(1));
    expect(falso.marcarUso).toHaveBeenCalledWith([regraMsc.chave]);
  });

  it("sem Regras usadas, marcarUso não é chamado", async () => {
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [] });
    await gravado();
    expect(falso.marcarUso).not.toHaveBeenCalled();
  });

  it("falha ao ler as Regras: importa sem elas, sem bloquear", async () => {
    falso.listarRegras.mockResolvedValue({ ok: false });
    expect(await gravado()).toEqual([
      [null, null, "sem_classificacao", null],
      [null, null, null, null],
      [null, null, "sugestao", { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] }],
    ]);
  });

  it("leitura das Regras que lança também não bloqueia", async () => {
    falso.listarRegras.mockRejectedValue(new Error("rede"));
    expect((await gravado())[0]).toEqual([null, null, "sem_classificacao", null]);
  });

  it("espera Responsáveis e Tipos carregarem antes de classificar", async () => {
    falso.statusCadastros = "carregando";
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [
      { id: "casa", nome: "Casa", arquivado: false },
      { id: "gatos", nome: "Gatos", arquivado: false },
    ];
    falso.fetch.mockImplementation(async () => resposta(extracao));
    const u = await escolherPdf();
    await digitarSenha(u, "segredo");
    expect(await screen.findByText(ETAPAS_IMPORTACAO.classificando)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(PASSO_3)).toBeNull();
    act(() => {
      falso.statusCadastros = "pronto";
      for (const o of falso.ouvintes) o();
    });
    await screen.findByText(PASSO_3);
    await u.click(screen.getByRole("button", { name: T.importar }));
    await waitFor(() => expect(falso.importar).toHaveBeenCalled());
    const imp: Importacao = falso.importar.mock.calls[0][0];
    expect(imp.lancamentos.map((l) => [l.responsavel_id, l.tipo_id, l.revisao_motivo])).toEqual([
      ["casal", "casa", null],
      ["casal", "casa", null],
      [null, null, "sugestao"],
    ]);
  });

  it("cadastros com erro de leitura: importa sem classificação, sem bloquear", async () => {
    falso.statusCadastros = "erro";
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    expect(await gravado()).toEqual([
      [null, null, "sem_classificacao", null],
      [null, null, null, null],
      [null, null, "sem_classificacao", null],
    ]);
  });

  it("\"Cancelar\" durante \"classificando\": cadastros que chegam depois não abrem o passo 3 nem gravam", async () => {
    falso.statusCadastros = "carregando";
    falso.fetch.mockImplementation(async () => resposta(extracao));
    const u = await escolherPdf();
    await digitarSenha(u, "segredo");
    expect(await screen.findByText(ETAPAS_IMPORTACAO.classificando)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: ROTULOS.cancelar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    act(() => {
      falso.statusCadastros = "pronto";
      for (const o of falso.ouvintes) o();
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(PASSO_3)).toBeNull();
    expect(falso.importar).not.toHaveBeenCalled();
  });

  it("passado o limite, segue sem classificação (cadastros carregando, Regras sem resposta)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    try {
      falso.statusCadastros = "carregando";
      falso.listarRegras.mockReturnValue(new Promise(() => {}));
      falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
      falso.tipos = [{ id: "gatos", nome: "Gatos", arquivado: false }];
      falso.fetch.mockImplementation(async () => resposta(extracao));
      const u = await escolherPdf();
      await digitarSenha(u, "segredo");
      expect(await screen.findByText(ETAPAS_IMPORTACAO.classificando)).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(LIMITE_CLASSIFICAR_MS - 100);
      });
      expect(screen.queryByText(PASSO_3)).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      await screen.findByText(PASSO_3);
      await u.click(screen.getByRole("button", { name: T.importar }));
      await waitFor(() => expect(falso.importar).toHaveBeenCalled());
      const imp: Importacao = falso.importar.mock.calls[0][0];
      expect(imp.lancamentos.map((l) => [l.responsavel_id, l.tipo_id, l.revisao_motivo])).toEqual([
        [null, null, "sem_classificacao"],
        [null, null, null],
        [null, null, "sem_classificacao"],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ImportarFatura: depois de gravar (História 3.2)", () => {
  const msc = { nome: "MSC CRUZEIROS", data: "04/09", finalCartao: "5061", duvida: false };
  const so1: Extracao = {
    ...outubro,
    fatura: { ...outubro.fatura, totalDespesasCentavos: 114074, totalCreditosCentavos: 0 },
    cartoes: [{ final: "5061", valorTotalCentavos: 114074 }],
    lancamentos: [{ ...msc, parcelaN: 3, parcelaTotal: 12, valorCentavos: 114074, tipoSugerido: null }],
  };
  const regraMsc = {
    chave: "MSC CRUZEIROS",
    versao_normalizacao: 1,
    responsavel_id: "casal",
    tipo_id: "casa",
    contagem: [{ responsavel_id: "casal", n: 2 }],
    ultimo_uso: "2026-10-10T00:00:00Z",
  };

  async function importarOutubro() {
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    return u;
  }

  it("com linhas para revisar: 'N classificados · N para revisar', 'Ir para revisão' (principal) e 'Ver no Painel'", async () => {
    const u = await importarOutubro();
    expect(await screen.findByText(rotuloResumoClassificacao(0, 49))).toBeTruthy();
    expect(screen.getByText("Passo 3 de 3 · Conferir")).toBeTruthy();
    // O Mês já foi entregue ao Painel; a janela segue aberta no resumo.
    expect(aoImportar).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(aoMudar).not.toHaveBeenCalledWith(false);
    const ir = screen.getByRole("button", { name: TEXTOS_REVISAR.ir_para_revisao });
    expect(ir.className).toContain("bg-accent");
    expect(screen.getByRole("button", { name: TEXTOS_REVISAR.ver_no_painel }).className).not.toContain("bg-accent");
    expect(screen.queryByRole("button", { name: ROTULOS.cancelar })).toBeNull();

    await u.click(ir);
    expect(aoIrParaRevisao).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(screen.queryByText(rotuloResumoClassificacao(0, 49))).toBeNull();
  });

  it("'Ver no Painel' fecha sem ir para a revisão", async () => {
    await importarOutubro();
    await verNoPainel();
    expect(aoIrParaRevisao).not.toHaveBeenCalled();
  });

  it("o ✕ também fecha o resumo", async () => {
    const u = await importarOutubro();
    await screen.findByText(rotuloResumoClassificacao(0, 49));
    await u.click(screen.getByRole("button", { name: ROTULOS.fechar }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(aoIrParaRevisao).not.toHaveBeenCalled();
  });

  it("a reimportação também mostra o resumo depois do toast", async () => {
    falso.faturas = [{ id: "f0", mes: "2026-10" }];
    falso.lerReimportacao.mockResolvedValue({
      ok: true,
      valor: { faturaId: "f0", atualizadoEm: null, linhas: [], statusPadraoId: null },
    });
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar_de_novo }));
    expect(await screen.findByText(rotuloResumoClassificacao(0, 49))).toBeTruthy();
    expect(screen.getByText(rotuloReimportado("2026-10", 49))).toBeTruthy();
  });

  it("tudo classificado (nenhum para revisar): fecha como antes, sem o resumo", async () => {
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [{ id: "casa", nome: "Casa", arquivado: false }];
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    falso.fetch.mockImplementation(async () => resposta(so1));
    await importarOutubro();
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(aoImportar).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(screen.queryByRole("button", { name: TEXTOS_REVISAR.ir_para_revisao })).toBeNull();
    expect(aoIrParaRevisao).not.toHaveBeenCalled();
  });

  it("o resumo conta só as mães: o Ajuste segue a dele", async () => {
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [{ id: "casa", nome: "Casa", arquivado: false }];
    falso.listarRegras.mockResolvedValue({ ok: true, regras: [regraMsc] });
    const comAjuste: Extracao = {
      ...so1,
      fatura: { ...so1.fatura, totalCreditosCentavos: 8 },
      lancamentos: [
        ...so1.lancamentos,
        { ...msc, parcelaN: null, parcelaTotal: null, valorCentavos: -8, tipoSugerido: null },
        { ...msc, nome: "PETZ", parcelaN: null, parcelaTotal: null, valorCentavos: 100, tipoSugerido: null },
      ],
    };
    falso.fetch.mockImplementation(async () => resposta(comAjuste));
    await importarOutubro();
    expect(await screen.findByText(rotuloResumoClassificacao(1, 1))).toBeTruthy();
  });
});

describe("ImportarFatura: herança das parcelas sem previsto (História 3.7)", () => {
  // Uma parcela n > 1 de outubro que não tem previsto: a n−1 do Mês anterior (set/26) empresta a classificação.
  const real = outubro.lancamentos.find((l) => l.parcelaN !== null && l.parcelaN > 1 && l.parcelaTotal !== null && l.parcelaN < l.parcelaTotal && l.valorCentavos > 0)!;
  const nomeNormalizado = real.nome.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
  const candidata = (extra: Record<string, unknown> = {}) => ({
    id: "c-anterior",
    nome_normalizado: nomeNormalizado,
    parcela_n: (real.parcelaN as number) - 1,
    parcela_total: real.parcelaTotal as number,
    valor_centavos: real.valorCentavos,
    ordem_fatura: 7,
    responsavel_id: "casal",
    tipo_id: "casa",
    apelido: "Sofá",
    observacao: "10x",
    serie: {
      nome_normalizado: nomeNormalizado,
      parcela_total: real.parcelaTotal as number,
      valor_parcela_centavos: real.valorCentavos,
      mes_primeira_parcela: "2026-01",
      ocorrencia: 2,
    },
    proxima_ocupada: false,
    ...extra,
  });

  beforeEach(() => {
    falso.responsaveis = [{ id: "casal", nome: "Casal", arquivado: false }];
    falso.tipos = [{ id: "casa", nome: "Casa", arquivado: false }];
  });

  async function ateOPasso3() {
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await screen.findByText(PASSO_3);
    return u;
  }

  it("lê as parcelas do mês anterior ao importado, herda a classificação e conta no passo 3 e no resumo final", async () => {
    falso.lerParcelasDoMesAnterior.mockResolvedValue({ ok: true, candidatas: [candidata()] });
    const u = await ateOPasso3();
    expect(falso.lerParcelasDoMesAnterior).toHaveBeenCalledExactlyOnceWith("2026-10");
    expect(screen.getByText(rotuloParcelasHerdadas(1))).toBeTruthy();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await screen.findByText(rotuloParcelasHerdadas(1));
    const herdadas = (falso.importar.mock.calls[0][0] as Importacao).lancamentos.filter((l) => l.herdado_de_id);
    expect(herdadas).toHaveLength(1);
    expect(herdadas[0]).toMatchObject({
      herdado_de_id: "c-anterior",
      responsavel_id: "casal",
      tipo_id: "casa",
      apelido: "Sofá",
      observacao: "10x",
      revisao_motivo: null,
      previsto_id: null,
    });
    expect(herdadas[0].serie?.ocorrencia).toBe(2);
    expect(herdadas[0].serie?.mes_primeira_parcela).toBe("2026-01");
  });

  it("os previstos seguintes da herdeira copiam a classificação, o Apelido e a Observação", async () => {
    falso.lerParcelasDoMesAnterior.mockResolvedValue({ ok: true, candidatas: [candidata()] });
    const u = await ateOPasso3();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await screen.findByText(rotuloParcelasHerdadas(1));
    const previstos = (falso.importar.mock.calls[0][0] as Importacao).previstos.filter((p) => p.nome_normalizado === nomeNormalizado);
    expect(previstos.length).toBeGreaterThan(0);
    expect(previstos[0]).toMatchObject({ responsavel_id: "casal", tipo_id: "casa", apelido: "Sofá", observacao: "10x" });
  });

  it("falha ao ler o mês anterior: importa sem herdar, sem bloquear", async () => {
    falso.lerParcelasDoMesAnterior.mockResolvedValue({ ok: false, codigo: "carregar.falhou" });
    const u = await ateOPasso3();
    expect(screen.queryByText(/herdou|herdaram/)).toBeNull();
    await u.click(screen.getByRole("button", { name: T.importar }));
    await verNoPainel();
    expect((falso.importar.mock.calls[0][0] as Importacao).lancamentos.every((l) => !l.herdado_de_id)).toBe(true);
  });

  it("candidata sem classificação: entra na Série mas não conta como herança", async () => {
    falso.lerParcelasDoMesAnterior.mockResolvedValue({
      ok: true,
      candidatas: [candidata({ responsavel_id: null, tipo_id: null, apelido: null, observacao: null })],
    });
    await ateOPasso3();
    expect(screen.queryByText(/herdou|herdaram/)).toBeNull();
  });

  it("sem candidatas, nada de herança no passo 3", async () => {
    await ateOPasso3();
    expect(screen.queryByText(/herdou|herdaram/)).toBeNull();
  });
});
