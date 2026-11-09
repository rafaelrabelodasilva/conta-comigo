// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
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
  rotuloTotalAPagar,
  textoExtracaoIncompleta,
} from "@/domain/mensagens";
import extracaoOutubro from "../../../test/fixtures/extracao-2026-10.json";
import { ImportarFatura, LIMITE_CLASSIFICAR_MS } from "./ImportarFatura";

// O pdf.js, a rota, o gerenciador de Realtime e o repositório são falsos:
// o teste confere os passos, que o texto vai limpo (sem senha, CPF, cartão
// nem nome do titular) e o que a janela manda gravar.
const falso = vi.hoisted(() => ({
  lerPdf: vi.fn(),
  fetch: vi.fn(),
  importar: vi.fn(),
  faturas: [] as { id: string; mes: string }[],
  configuracoes: [] as { limite_ajuste_centavos: number }[],
  responsaveis: [] as { id: string; nome: string; arquivado: boolean }[],
  tipos: [] as { id: string; nome: string; arquivado: boolean }[],
  listarRegras: vi.fn(),
  // Status de Responsáveis e Tipos no gerenciador falso (os outros: "pronto").
  statusCadastros: "pronto" as "carregando" | "pronto" | "erro",
  ouvintes: new Set<() => void>(),
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
      status: useSyncExternalStore(assinar, () => statusDe(tabela)),
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
vi.mock("@/data/faturas-repo", () => ({ repoFaturas: () => ({ importar: falso.importar }) }));
vi.mock("@/data/regras-repo", () => ({ repoRegras: () => ({ listar: falso.listarRegras }) }));

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

function Montar() {
  const [aberta, setAberta] = useState(true);
  return (
    <ImportarFatura
      aberta={aberta}
      aoMudar={(a) => {
        aoMudar(a);
        setAberta(a);
      }}
      aoImportar={aoImportar}
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
  falso.configuracoes = [];
  falso.responsaveis = [];
  falso.tipos = [];
  falso.listarRegras.mockResolvedValue({ ok: true, regras: [] });
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
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
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
    // Nada gravado: o Painel não troca de Mês.
    expect(aoImportar).not.toHaveBeenCalled();
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
