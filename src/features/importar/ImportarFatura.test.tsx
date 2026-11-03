// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extracao } from "@/domain/extracao-fatura";
import type { Importacao } from "@/domain/importacao-fatura";
import {
  ETAPAS_IMPORTACAO,
  ROTULOS,
  TEXTOS_IMPORTAR as T,
  mensagem,
  rotuloDespesasCreditos,
  textoExtracaoIncompleta,
} from "@/domain/mensagens";
import extracaoOutubro from "../../../test/fixtures/extracao-2026-10.json";
import { ImportarFatura } from "./ImportarFatura";

// O pdf.js, a rota, o gerenciador de Realtime e o repositório são falsos:
// o teste confere os passos, que o texto vai limpo (sem senha, CPF, cartão
// nem nome do titular) e o que a janela manda gravar.
const falso = vi.hoisted(() => ({
  lerPdf: vi.fn(),
  fetch: vi.fn(),
  importar: vi.fn(),
  faturas: [] as { id: string; mes: string }[],
}));
vi.mock("./ler-pdf", () => ({ lerPdf: falso.lerPdf }));
vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.faturas }),
}));
vi.mock("@/data/faturas-repo", () => ({ repoFaturas: () => ({ importar: falso.importar }) }));

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

function Montar() {
  const [aberta, setAberta] = useState(true);
  return (
    <ImportarFatura
      aberta={aberta}
      aoMudar={(a) => {
        aoMudar(a);
        setAberta(a);
      }}
    />
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

beforeEach(() => {
  vi.clearAllMocks();
  falso.faturas = [];
  vi.stubGlobal("fetch", falso.fetch);
  // Primeiro sem senha (pede a senha), depois com a senha certa.
  falso.lerPdf.mockImplementation(async (_dados: Uint8Array, senha: string) =>
    senha === ""
      ? { ok: false, erro: { codigo: "fatura.senha_vazia" } }
      : { ok: true, valor: { texto: TEXTO_PDF, paginas: 1, ms: 10 } },
  );
  falso.fetch.mockImplementation(async () => resposta());
  falso.importar.mockResolvedValue({ ok: true, quantidade: 49 });
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
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
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

  it("Mês já importado: avisa e não tem botão de gravar", async () => {
    falso.faturas = [{ id: "f", mes: "2026-10" }];
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.mes_ja_importado"));
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
    expect(falso.importar).not.toHaveBeenCalled();
  });

  it("a RPC diz que o Mês já foi importado: o aviso fica e o botão some", async () => {
    falso.importar.mockResolvedValue({ ok: false, codigo: "fatura.mes_ja_importado" });
    const u = await escolherPdf();
    await digitarSenha(u, "s");
    await u.click(await screen.findByRole("button", { name: T.importar }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.mes_ja_importado"));
    expect(screen.queryByRole("button", { name: T.importar })).toBeNull();
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
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
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
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
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
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(falso.importar).toHaveBeenCalledTimes(1);
  });
});
