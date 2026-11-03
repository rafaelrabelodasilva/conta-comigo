// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ITENS_QUADRO_PROVA, TEXTOS_PROVA_FATURA as T, mensagem } from "@/domain/mensagens";
import { ProvaFatura } from "./ProvaFatura";

// O pdf.js e a rota são falsos: o teste confere o fluxo da tela, que o
// texto vai limpo para a rota e que a senha nunca vai junto.
const falso = vi.hoisted(() => ({ lerPdf: vi.fn(), fetch: vi.fn() }));
vi.mock("./ler-pdf", () => ({ lerPdf: falso.lerPdf }));

const TEXTO_PDF = ["CPF 123.456.789-09", "RUA DAS FLORES 10", "Cartão 4220 1234 5678 9012", "06/09 MSC CRUZEIROS 02/12 1.140,74"].join("\n");

const resumo = {
  quantidade: 49,
  despesasCentavos: 832739,
  creditosCentavos: 63962,
  cartoesCentavos: 832739,
  totalDespesasLidoCentavos: 832739,
  totalCreditosLidoCentavos: 63962,
  diferencaDespesasCentavos: 0,
  diferencaCreditosCentavos: 0,
  diferencaCartoesCentavos: 0,
  porCartao: [{ final: "9012", lidoCentavos: 832739, despesasCentavos: 832739, diferencaCentavos: 0 }],
  pagamentosDeFatura: 0,
  duvidas: 0,
};

const extracao = {
  lancamentos: [
    { nome: "MSC CRUZEIROS", data: "06/09", parcelaN: 2, parcelaTotal: 12, valorCentavos: 114074, finalCartao: "9012", tipoSugerido: null, duvida: false },
  ],
  fatura: {
    vencimento: "06/10/2026",
    fechamento: "28/09/2026",
    totalDespesasCentavos: 832739,
    totalCreditosCentavos: 63962,
    saldoAnteriorCentavos: 700000,
    pagamentosCentavos: null,
    totalAPagarCentavos: 768777,
  },
  cartoes: [],
};

function arquivoPdf() {
  const f = new File(["%PDF-1.7"], "fatura.pdf", { type: "application/pdf" });
  // jsdom não tem File.arrayBuffer em todas as versões.
  Object.defineProperty(f, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  return f;
}

async function preencherELer(senha: string) {
  const u = userEvent.setup();
  await u.upload(screen.getByLabelText(T.arquivo), arquivoPdf());
  await u.clear(screen.getByLabelText(T.senha));
  await u.type(screen.getByLabelText(T.senha), senha);
  await u.click(screen.getByRole("button", { name: T.ler }));
  return u;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", falso.fetch);
  falso.lerPdf.mockResolvedValue({ ok: true, valor: { texto: TEXTO_PDF, paginas: 1, ms: 100 } });
  // Uma resposta nova a cada chamada: o corpo só pode ser lido uma vez.
  falso.fetch.mockImplementation(
    async () => new Response(JSON.stringify({ extracao, resumo, servidor_ms: 12_000, gemini_ms: 11_000 }), { status: 200 }),
  );
});

describe("ProvaFatura", () => {
  it("caminho feliz: manda o texto limpo e mostra o quadro, os tempos e a lista", async () => {
    render(<ProvaFatura />);
    await preencherELer("segredo");
    await screen.findByRole("heading", { name: T.quadro });

    expect(falso.lerPdf).toHaveBeenCalledWith(expect.any(Uint8Array), "segredo");
    expect(falso.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = falso.fetch.mock.calls[0];
    expect(url).toBe("/api/fatura/extrair");
    const enviado = JSON.parse(init.body);
    expect(Object.keys(enviado)).toEqual(["texto"]);
    expect(init.body).not.toContain("segredo");
    expect(enviado.texto).not.toContain("123.456.789-09");
    expect(enviado.texto).not.toContain("RUA DAS FLORES");
    expect(enviado.texto).toContain("Cartão final 9012");

    const linha = screen.getByText(ITENS_QUADRO_PROVA.quantidade).closest("tr")!;
    expect(within(linha).getAllByText("49")).toHaveLength(2);
    expect(within(linha).getByText(T.bateu)).toBeTruthy();
    expect(screen.getByText("MSC CRUZEIROS")).toBeTruthy();
    expect(screen.getByText("02/12")).toBeTruthy();
    expect(screen.getByText(`${T.tempo_servidor}:`, { exact: false }).textContent).toContain("12,0");
    expect(screen.getByText(`${T.tempo_gemini}:`, { exact: false }).textContent).toContain("11,0");
    expect(screen.getByText(`${T.vencimento}:`, { exact: false }).textContent).toContain("06/10/2026");
    expect(screen.getByText(`${T.pagamentos}:`, { exact: false }).textContent).toContain(T.nao_lido);
    expect(screen.getByText(`${T.com_duvida}:`, { exact: false }).textContent).toContain("0");
    expect(screen.getByRole("button", { name: T.baixar_texto })).toBeTruthy();
  });

  it("senha errada: erro no campo e tenta de novo sem escolher o PDF de novo", async () => {
    falso.lerPdf.mockResolvedValueOnce({ ok: false, erro: { codigo: "fatura.senha_incorreta" } });
    render(<ProvaFatura />);
    const u = await preencherELer("errada");
    const campo = screen.getByLabelText(T.senha);
    expect(await screen.findByText(mensagem("fatura.senha_incorreta"))).toBeTruthy();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(falso.fetch).not.toHaveBeenCalled();

    await u.clear(campo);
    await u.type(campo, "certa");
    await u.click(screen.getByRole("button", { name: T.ler }));
    await screen.findByRole("heading", { name: T.quadro });
    expect(falso.lerPdf).toHaveBeenLastCalledWith(expect.any(Uint8Array), "certa");
  });

  it("arquivo que não é PDF", async () => {
    falso.lerPdf.mockResolvedValueOnce({ ok: false, erro: { codigo: "fatura.pdf_invalido" } });
    render(<ProvaFatura />);
    await preencherELer("x");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.pdf_invalido"));
  });

  it("sem PDF escolhido não lê", async () => {
    render(<ProvaFatura />);
    await userEvent.setup().click(screen.getByRole("button", { name: T.ler }));
    expect(screen.getByText(mensagem("fatura.sem_arquivo"))).toBeTruthy();
    expect(falso.lerPdf).not.toHaveBeenCalled();
  });

  it("erro da rota vira a mensagem do código; o texto limpo continua para baixar", async () => {
    falso.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ erro: "fatura.leitura_indisponivel" }), { status: 503 }));
    render(<ProvaFatura />);
    await preencherELer("s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.leitura_indisponivel"));
    expect(screen.getByRole("button", { name: T.baixar_texto })).toBeTruthy();
  });

  it("sessão expirada e conexão caída", async () => {
    falso.fetch.mockResolvedValueOnce(new Response("", { status: 401 }));
    render(<ProvaFatura />);
    const u = await preencherELer("s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("auth.sessao_expirou"));

    falso.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await u.click(screen.getByRole("button", { name: T.ler }));
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.conexao_caiu"));
  });

  it("senha vazia: erro no campo da senha, sem alerta geral", async () => {
    falso.lerPdf.mockResolvedValueOnce({ ok: false, erro: { codigo: "fatura.senha_vazia" } });
    render(<ProvaFatura />);
    const u = userEvent.setup();
    await u.upload(screen.getByLabelText(T.arquivo), arquivoPdf());
    await u.click(screen.getByRole("button", { name: T.ler }));
    expect(await screen.findByText(mensagem("fatura.senha_vazia"))).toBeTruthy();
    expect(screen.getByLabelText(T.senha).getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("504 sem corpo JSON vira tempo esgotado", async () => {
    falso.fetch.mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }));
    render(<ProvaFatura />);
    await preencherELer("s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.tempo_esgotado"));
  });

  it("resposta redirecionada vira sessão expirada", async () => {
    const r = new Response("<html>", { status: 200 });
    Object.defineProperty(r, "redirected", { value: true });
    falso.fetch.mockResolvedValueOnce(r);
    render(<ProvaFatura />);
    await preencherELer("s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("auth.sessao_expirou"));
  });

  it("resposta 200 sem a forma mínima vira leitura falhou", async () => {
    falso.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ resumo, servidor_ms: 1 }), { status: 200 }));
    render(<ProvaFatura />);
    await preencherELer("s");
    expect((await screen.findByRole("alert")).textContent).toBe(mensagem("fatura.leitura_falhou"));
  });

  it("cancelar o seletor mantém o PDF; escolher outro limpa o resultado", async () => {
    render(<ProvaFatura />);
    const u = await preencherELer("s");
    await screen.findByRole("heading", { name: T.quadro });
    const seletor = screen.getByLabelText<HTMLInputElement>(T.arquivo);

    // Lista vazia (seletor cancelado): o resultado e o PDF ficam.
    fireEvent.change(seletor, { target: { files: [] } });
    expect(screen.getByRole("heading", { name: T.quadro })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: T.ler }));
    await screen.findByRole("heading", { name: T.quadro });
    expect(screen.queryByText(mensagem("fatura.sem_arquivo"))).toBeNull();
    expect(falso.lerPdf).toHaveBeenCalledTimes(2);

    await u.upload(seletor, arquivoPdf());
    expect(screen.queryByRole("heading", { name: T.quadro })).toBeNull();
  });
});
