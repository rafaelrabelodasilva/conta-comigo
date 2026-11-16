// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { ROTULOS, TEXTOS_MODELO, mensagem } from "@/domain/mensagens";
import { MODELO_VAZIO, type ModeloMensagem } from "@/domain/modelo-mensagem";
import { mesAtual } from "@/domain/painel";
import { ToastProvider } from "@/ui/Toast";
import { SecaoModeloMensagem } from "./SecaoModeloMensagem";

// Gerenciador de Realtime e repositório falsos: o teste confere o que a tela
// mostra e o que ela manda gravar.
const falso = vi.hoisted(() => ({
  tabelas: {} as Record<string, unknown>,
  definirModeloMensagem: vi.fn(),
  abrirMes: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: (tabela: string) => falso.tabelas[tabela],
  gerenciador: () => ({ recarregar: vi.fn(), abrirMes: falso.abrirMes }),
}));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({ definirModeloMensagem: falso.definirModeloMensagem }),
}));

const MES = mesAtual(hojeEmSaoPaulo(new Date()));
const R = (centavos: number) => formatarDinheiro(centavos);

const MODELO_DO_RAFAEL: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "rafaelrabelodasilva@outlook.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

const lancamento = (extra: Record<string, unknown>) => ({
  id: String(extra.nome),
  mes: MES,
  excluido_em: null,
  nome: "Compra",
  apelido: null,
  parcela_n: null,
  parcela_total: null,
  valor_centavos: 1000,
  status_id: null,
  lancado_por: "fatura",
  ordem_fatura: 1,
  ...extra,
});

function carregar(opcoes: { modelo?: unknown; semLinha?: boolean; lancamentos?: unknown[]; itens?: unknown[] } = {}) {
  falso.tabelas = {
    configuracoes: {
      status: "pronto",
      linhas: opcoes.semLinha === false || opcoes.modelo !== undefined ? [{ id: "cfg", modelo_mensagem: opcoes.modelo }] : [],
    },
    lancamentos: { status: "pronto", mes: MES, linhas: opcoes.lancamentos ?? [] },
    pagamento_itens: { status: "pronto", mes: MES, linhas: opcoes.itens ?? [] },
    status: { status: "pronto", linhas: [{ id: "pago", conta_como_pago: true }] },
  };
}

function montar(aoMudarRascunho?: (tem: boolean) => void) {
  const vista = render(
    <ToastProvider>
      <SecaoModeloMensagem aoMudarRascunho={aoMudarRascunho} />
    </ToastProvider>,
  );
  return vista;
}

const campo = (rotulo: string) => screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(rotulo);
const caixa = (rotulo: string) => screen.getByRole<HTMLInputElement>("checkbox", { name: rotulo });
const salvar = () => screen.getByRole("button", { name: ROTULOS.salvar });
const previa = () => screen.getByRole("region", { name: TEXTOS_MODELO.previa });

/** Escreve por colagem: `{` e `}` não são teclas especiais do user-event aqui. */
async function digitar(usuario: ReturnType<typeof userEvent.setup>, rotulo: string, texto: string) {
  const el = campo(rotulo);
  await usuario.clear(el);
  if (texto) {
    await usuario.click(el);
    await usuario.paste(texto);
  }
}

async function montarOModeloDoRafael(usuario: ReturnType<typeof userEvent.setup>) {
  await digitar(usuario, TEXTOS_MODELO.saudacao, MODELO_DO_RAFAEL.saudacao);
  await digitar(usuario, TEXTOS_MODELO.frase_total, MODELO_DO_RAFAEL.frase_total);
  await digitar(usuario, TEXTOS_MODELO.chave_pix, MODELO_DO_RAFAEL.chave_pix);
  await usuario.click(caixa(TEXTOS_MODELO.campo_nome));
  await usuario.click(caixa(TEXTOS_MODELO.campo_parcela));
  await usuario.click(caixa(TEXTOS_MODELO.campo_valor));
}

describe("SecaoModeloMensagem", () => {
  beforeEach(() => {
    falso.definirModeloMensagem.mockReset();
    falso.abrirMes.mockReset();
    carregar();
  });
  afterEach(cleanup);

  it("modelo inicial vazio: campos em branco, caixas desmarcadas e a dica na prévia", () => {
    montar();
    for (const rotulo of [TEXTOS_MODELO.saudacao, TEXTOS_MODELO.frase_total, TEXTOS_MODELO.chave_pix, TEXTOS_MODELO.rodape]) {
      expect(campo(rotulo).value).toBe("");
    }
    for (const rotulo of [TEXTOS_MODELO.campo_nome, TEXTOS_MODELO.campo_parcela, TEXTOS_MODELO.campo_valor]) {
      expect(caixa(rotulo).checked).toBe(false);
    }
    expect(within(previa()).getByText(TEXTOS_MODELO.previa_vazia)).toBeTruthy();
    expect(falso.abrirMes).toHaveBeenCalledWith(MES);
  });

  it("as caixas têm 44 pt (a linha toda é a caixa) e o grupo tem nome", () => {
    montar();
    const grupo = screen.getByRole("group", { name: TEXTOS_MODELO.campos_da_linha });
    expect(within(grupo).getAllByRole("checkbox")).toHaveLength(3);
    const linha = caixa(TEXTOS_MODELO.campo_nome).closest("label");
    expect(linha?.className).toContain("min-h-toque");
  });

  it("o modelo do Rafael se monta nos campos e grava inteiro", async () => {
    falso.definirModeloMensagem.mockResolvedValue({ ok: true });
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    await usuario.click(salvar());
    expect(falso.definirModeloMensagem).toHaveBeenCalledTimes(1);
    expect(falso.definirModeloMensagem).toHaveBeenCalledWith(MODELO_DO_RAFAEL);
    expect(await screen.findByText(TEXTOS_MODELO.salvo)).toBeTruthy();
  });

  it("a prévia muda a cada tecla, com os dados do Mês atual", async () => {
    carregar({
      lancamentos: [
        lancamento({ nome: "Mercado", valor_centavos: 15990, ordem_fatura: 1 }),
        lancamento({ nome: "MAGALU", apelido: "Celular da mãe", parcela_n: 5, parcela_total: 10, valor_centavos: 57750, ordem_fatura: 2 }),
        lancamento({ nome: "Já pago", valor_centavos: 9900, status_id: "pago", ordem_fatura: 3 }),
      ],
    });
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    const texto = () => previa().textContent ?? "";
    expect(texto()).toContain(`Esse mês deu ${R(73740)}`);
    expect(texto()).toContain(`Celular da mãe | 05/10 | ${R(57750)}`);
    expect(texto()).not.toContain("Já pago");
    expect(screen.getByText(/Prévia com 2 lançamentos de /)).toBeTruthy();

    await usuario.type(campo(TEXTOS_MODELO.saudacao), "!");
    expect(texto().startsWith("Oi!\n")).toBe(true);
    await usuario.click(caixa(TEXTOS_MODELO.campo_parcela));
    expect(texto()).toContain(`Celular da mãe | ${R(57750)}`);
  });

  it("Pago parcialmente (6.2): a prévia mostra só o que falta, como a mensagem real", async () => {
    carregar({
      lancamentos: [lancamento({ nome: "Celular", valor_centavos: 21516 })],
      itens: [{ lancamento_id: "Celular", valor_centavos: 10000, status_aplicado_id: null, excluido_em: null }],
    });
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    expect(falso.abrirMes).toHaveBeenCalledTimes(2);
    const texto = previa().textContent ?? "";
    expect(texto).toContain(`Celular | ${R(11516)}`);
    expect(texto).toContain(`Esse mês deu ${R(11516)}`);
    expect(texto).not.toContain(R(21516));
  });

  it("Mês sem lançamentos a cobrar: itens de exemplo, e a legenda diz isso", async () => {
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    expect(screen.getByText(/itens de exemplo/)).toBeTruthy();
    expect(previa().textContent).toContain("Estorno de loja");
  });

  it("a prévia é uma região nomeada e focável, sem aria-live (o leitor de tela não a repete a cada tecla)", async () => {
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    const regiao = previa();
    expect(regiao.getAttribute("tabindex")).toBe("0");
    expect(regiao.closest("[aria-live]")).toBeNull();
    expect(regiao.querySelector("[aria-live]")).toBeNull();
    expect(regiao.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });

  it("marcador errado: erro no campo, nada gravado e o rascunho fica", async () => {
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    await digitar(usuario, TEXTOS_MODELO.frase_total, "Deu {totl}");
    await usuario.click(salvar());
    expect(falso.definirModeloMensagem).not.toHaveBeenCalled();
    expect(screen.getByText(mensagem("modelo.marcador_invalido"))).toBeTruthy();
    expect(campo(TEXTOS_MODELO.frase_total).value).toBe("Deu {totl}");
    expect(campo(TEXTOS_MODELO.frase_total).getAttribute("aria-invalid")).toBe("true");
    // Corrigir o campo tira o erro.
    await digitar(usuario, TEXTOS_MODELO.frase_total, "Deu {total}");
    expect(screen.queryByText(mensagem("modelo.marcador_invalido"))).toBeNull();
  });

  it("frase sem {total} avisa, mas salva", async () => {
    falso.definirModeloMensagem.mockResolvedValue({ ok: true });
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    expect(screen.queryByText(TEXTOS_MODELO.sem_marcador)).toBeNull();
    await digitar(usuario, TEXTOS_MODELO.frase_total, "Segue a conta");
    expect(screen.getByText(TEXTOS_MODELO.sem_marcador)).toBeTruthy();
    await usuario.click(salvar());
    expect(falso.definirModeloMensagem).toHaveBeenCalledWith({ ...MODELO_DO_RAFAEL, frase_total: "Segue a conta" });
  });

  it("nenhuma caixa marcada com algo escrito: erro no grupo e nada gravado", async () => {
    const usuario = userEvent.setup();
    montar();
    await digitar(usuario, TEXTOS_MODELO.saudacao, "Oi");
    await usuario.click(salvar());
    expect(falso.definirModeloMensagem).not.toHaveBeenCalled();
    expect(screen.getByText(mensagem("modelo.sem_campos"))).toBeTruthy();
    await usuario.click(caixa(TEXTOS_MODELO.campo_valor));
    expect(screen.queryByText(mensagem("modelo.sem_campos"))).toBeNull();
  });

  it("texto longo: erro no campo", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(caixa(TEXTOS_MODELO.campo_valor));
    await digitar(usuario, TEXTOS_MODELO.rodape, "a".repeat(501));
    await usuario.click(salvar());
    expect(falso.definirModeloMensagem).not.toHaveBeenCalled();
    expect(screen.getByText(mensagem("modelo.rodape_longo"))).toBeTruthy();
  });

  it("rodapé aceita várias linhas e aparece depois do Total", async () => {
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    await digitar(usuario, TEXTOS_MODELO.rodape, "Obrigado!\nAbraço");
    expect(previa().textContent?.endsWith("\n\nObrigado!\nAbraço")).toBe(true);
  });

  it("recusa do banco: toast com o erro e o rascunho continua", async () => {
    falso.definirModeloMensagem.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const usuario = userEvent.setup();
    montar();
    await montarOModeloDoRafael(usuario);
    await usuario.click(salvar());
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("Oi");
    expect(screen.queryByText(TEXTOS_MODELO.salvo)).toBeNull();
  });

  it("mostra o modelo salvo (e ignora jsonb ruim)", () => {
    carregar({ modelo: MODELO_DO_RAFAEL });
    montar();
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("Oi");
    expect(caixa(TEXTOS_MODELO.campo_parcela).checked).toBe(true);
    cleanup();
    carregar({ modelo: "lixo" });
    montar();
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("");
  });

  it("modelo mudado em outro aparelho: o rascunho fica, o aviso aparece e dá para usar o salvo", async () => {
    carregar({ modelo: MODELO_DO_RAFAEL });
    const usuario = userEvent.setup();
    const { rerender } = montar();
    await digitar(usuario, TEXTOS_MODELO.saudacao, "Olá");
    expect(screen.queryByText(TEXTOS_MODELO.mudou_em_outro_aparelho)).toBeNull();

    // Outro aparelho grava um modelo novo.
    carregar({ modelo: { ...MODELO_DO_RAFAEL, saudacao: "Bom dia", rodape: "Obrigado" } });
    rerender(
      <ToastProvider>
        <SecaoModeloMensagem />
      </ToastProvider>,
    );
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("Olá"); // o rascunho não some
    expect(screen.getByText(TEXTOS_MODELO.mudou_em_outro_aparelho)).toBeTruthy();

    await usuario.click(screen.getByRole("button", { name: TEXTOS_MODELO.usar_modelo_salvo }));
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("Bom dia");
    expect(campo(TEXTOS_MODELO.rodape).value).toBe("Obrigado");
    expect(screen.queryByText(TEXTOS_MODELO.mudou_em_outro_aparelho)).toBeNull();
  });

  it("sem rascunho, a mudança de outro aparelho entra no lugar, sem aviso", () => {
    carregar({ modelo: MODELO_DO_RAFAEL });
    const { rerender } = montar();
    carregar({ modelo: { ...MODELO_DO_RAFAEL, saudacao: "Bom dia" } });
    rerender(
      <ToastProvider>
        <SecaoModeloMensagem />
      </ToastProvider>,
    );
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe("Bom dia");
    expect(screen.queryByText(TEXTOS_MODELO.mudou_em_outro_aparelho)).toBeNull();
  });

  it("avisa o rascunho ao Primeiro uso: sim ao digitar, não ao voltar ao salvo", async () => {
    const aviso = vi.fn();
    const usuario = userEvent.setup();
    montar(aviso);
    expect(aviso).toHaveBeenLastCalledWith(false);
    await usuario.type(campo(TEXTOS_MODELO.saudacao), "O");
    expect(aviso).toHaveBeenLastCalledWith(true);
    await usuario.clear(campo(TEXTOS_MODELO.saudacao));
    expect(aviso).toHaveBeenLastCalledWith(false);
  });

  it("carregando: esqueleto; erro de leitura: Tentar de novo", () => {
    falso.tabelas.configuracoes = { status: "carregando", linhas: [] };
    montar();
    expect(screen.queryByLabelText(TEXTOS_MODELO.saudacao)).toBeNull();
    cleanup();
    falso.tabelas.configuracoes = { status: "erro", linhas: [] };
    montar();
    expect(screen.getByRole("button", { name: ROTULOS.tentar_de_novo })).toBeTruthy();
  });

  it("MODELO_VAZIO é o que o banco devolve para {}", () => {
    carregar({ modelo: {} });
    montar();
    expect(campo(TEXTOS_MODELO.saudacao).value).toBe(MODELO_VAZIO.saudacao);
  });
});
