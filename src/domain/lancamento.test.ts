import { describe, expect, it } from "vitest";
import { conferir } from "./conferencia";
import { ESPACO } from "./dinheiro";
import {
  FORM_NOVO_VAZIO,
  alteradoEmOutroAparelho,
  alternarSelecao,
  alternarTodos,
  estadoCaixaCabecalho,
  lerApelido,
  lerDataCompra,
  lerNome,
  lerObservacao,
  lerValor,
  mudancaDoCampo,
  novoLancamento,
  opcoesDoCadastro,
  selecaoValida,
  textoConferenciaDoLancamento,
  textoDoCampo,
  type ContextoNovoLancamento,
  type LancamentoEditavel,
} from "./lancamento";

const sem = (t: string) => t.replaceAll(ESPACO, " ");

const bellaPietra: LancamentoEditavel = {
  valor_centavos: 80000,
  data: "2026-09-12",
  apelido: null,
  observacao: null,
  responsavel_id: null,
  tipo_id: null,
  status_id: "s-nao",
};

describe("leitura dos campos", () => {
  it("Valor: lido por lerReais, negativo é crédito, zero e texto recusados", () => {
    expect(lerValor("80,00")).toEqual({ ok: true, valor: 8000 });
    expect(lerValor("R$ 1.140,74")).toEqual({ ok: true, valor: 114074 });
    expect(lerValor(`-${ESPACO}R$${ESPACO}0,08`)).toEqual({ ok: true, valor: -8 });
    expect(lerValor("abc")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_invalido" } });
    expect(lerValor("0")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_zero" } });
    expect(lerValor("0,00")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_zero" } });
    expect(lerValor("21.474.836,47")).toEqual({ ok: true, valor: 2147483647 });
    expect(lerValor("21.474.836,48")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_invalido" } });
    expect(lerValor("-21474836,48")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_invalido" } });
    expect(lerValor("  ")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_vazio" } });
  });

  it("Data opcional; Apelido até 60 e Observação até 500, recortados, em branco viram null", () => {
    expect(lerDataCompra("")).toEqual({ ok: true, valor: null });
    expect(lerDataCompra("2026-11-20")).toEqual({ ok: true, valor: "2026-11-20" });
    expect(lerDataCompra("2026-02-30")).toMatchObject({ ok: false, erro: { codigo: "lancamento.data_invalida" } });
    expect(lerApelido("  Lava e seca  ")).toEqual({ ok: true, valor: "Lava e seca" });
    expect(lerApelido("   ")).toEqual({ ok: true, valor: null });
    expect(lerApelido("a".repeat(60))).toMatchObject({ ok: true });
    expect(lerApelido("a".repeat(61))).toMatchObject({ ok: false, erro: { codigo: "lancamento.apelido_longo" } });
    expect(lerObservacao(" ")).toEqual({ ok: true, valor: null });
    expect(lerObservacao("x".repeat(500))).toMatchObject({ ok: true });
    expect(lerObservacao("x".repeat(501))).toMatchObject({ ok: false, erro: { codigo: "lancamento.observacao_longa" } });
    expect(lerNome("  PADARIA ")).toEqual({ ok: true, valor: "PADARIA" });
    expect(lerNome("")).toMatchObject({ ok: false, erro: { codigo: "lancamento.nome_vazio" } });
    expect(lerNome("n".repeat(201))).toMatchObject({ ok: false, erro: { codigo: "lancamento.nome_longo" } });
  });

  it("texto do campo para o valor gravado", () => {
    expect(sem(textoDoCampo(bellaPietra, "valor"))).toBe("R$ 800,00");
    expect(textoDoCampo(bellaPietra, "data")).toBe("2026-09-12");
    expect(textoDoCampo(bellaPietra, "apelido")).toBe("");
    expect(textoDoCampo(bellaPietra, "responsavel")).toBe("");
    expect(textoDoCampo(bellaPietra, "status")).toBe("s-nao");
  });
});

describe("mudancaDoCampo", () => {
  it("Classificar: Responsável 'Casal' grava só responsavel_id", () => {
    expect(mudancaDoCampo(bellaPietra, "responsavel", "r-casal")).toEqual({
      ok: true,
      valor: { coluna: "responsavel_id", valor: "r-casal" },
    });
    expect(mudancaDoCampo({ ...bellaPietra, responsavel_id: "r-casal" }, "responsavel", "")).toEqual({
      ok: true,
      valor: { coluna: "responsavel_id", valor: null },
    });
  });

  it("Corrigir Valor: R$ 800,00 para R$ 80,00", () => {
    expect(mudancaDoCampo(bellaPietra, "valor", "80,00")).toEqual({ ok: true, valor: { coluna: "valor_centavos", valor: 8000 } });
    expect(mudancaDoCampo(bellaPietra, "valor", "abc")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_invalido" } });
    expect(mudancaDoCampo(bellaPietra, "valor", "0")).toMatchObject({ ok: false, erro: { codigo: "lancamento.valor_zero" } });
  });

  it("igual ao gravado: nada a salvar (o texto formatado do Valor também)", () => {
    expect(mudancaDoCampo(bellaPietra, "valor", textoDoCampo(bellaPietra, "valor"))).toEqual({ ok: true, valor: null });
    expect(mudancaDoCampo(bellaPietra, "apelido", "   ")).toEqual({ ok: true, valor: null });
    expect(mudancaDoCampo(bellaPietra, "status", "s-nao")).toEqual({ ok: true, valor: null });
    expect(mudancaDoCampo(bellaPietra, "data", "2026-09-12")).toEqual({ ok: true, valor: null });
  });

  it("linha da Fatura não fica sem data (o banco exige)", () => {
    expect(mudancaDoCampo({ ...bellaPietra, lancado_por: "fatura" }, "data", "")).toMatchObject({
      ok: false,
      erro: { codigo: "lancamento.data_da_fatura" },
    });
    expect(mudancaDoCampo({ ...bellaPietra, lancado_por: "manual" }, "data", "")).toMatchObject({ ok: true });
  });

  it("Data, Apelido e Observação", () => {
    expect(mudancaDoCampo(bellaPietra, "data", "")).toEqual({ ok: true, valor: { coluna: "data", valor: null } });
    expect(mudancaDoCampo(bellaPietra, "apelido", " Pedras ")).toEqual({ ok: true, valor: { coluna: "apelido", valor: "Pedras" } });
    expect(mudancaDoCampo(bellaPietra, "observacao", "obs")).toEqual({ ok: true, valor: { coluna: "observacao", valor: "obs" } });
  });
});

describe("novoLancamento", () => {
  const configsCiclo = [{ dia_fechamento: 29, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" }];
  const outubro: ContextoNovoLancamento = {
    mesAberto: "2026-10",
    fatura: { id: "f10", mes: "2026-10" },
    cartoes: ["5061", "8673"],
    configsCiclo,
  };

  it("Incluir correção: fatura_id e mes da Fatura, cartão escolhido, lancado_por manual", () => {
    const r = novoLancamento(
      { ...FORM_NOVO_VAZIO, nome: " AJUSTE  loja ", valor: "10,00", corrigeFatura: true, cartao: "8673" },
      outubro,
    );
    expect(r).toEqual({
      ok: true,
      valor: {
        nome: "AJUSTE  loja",
        nome_normalizado: "AJUSTE LOJA",
        valor_centavos: 1000,
        data: null,
        apelido: null,
        observacao: null,
        responsavel_id: null,
        tipo_id: null,
        status_id: null,
        lancado_por: "manual",
        mes: "2026-10",
        fatura_id: "f10",
        final_cartao: "8673",
      },
    });
  });

  it("correção sem cartão: 'Escolha o cartão'", () => {
    const r = novoLancamento({ ...FORM_NOVO_VAZIO, nome: "X", valor: "10", corrigeFatura: true }, outubro);
    expect(r).toEqual({ ok: false, erros: { cartao: "lancamento.sem_cartao" } });
    const outro = novoLancamento({ ...FORM_NOVO_VAZIO, nome: "X", valor: "10", corrigeFatura: true, cartao: "0001" }, outubro);
    expect(outro).toEqual({ ok: false, erros: { cartao: "lancamento.sem_cartao" } });
  });

  it("Nome e Valor obrigatórios: os erros de todos os campos de uma vez", () => {
    expect(novoLancamento(FORM_NOVO_VAZIO, outubro)).toEqual({
      ok: false,
      erros: { nome: "lancamento.nome_vazio", valor: "lancamento.valor_vazio" },
    });
  });

  it("Incluir com data, sem a caixa: Mês pela regra de Ciclo, sem cartão nem Fatura", () => {
    const novembro: ContextoNovoLancamento = { ...outubro, mesAberto: "2026-11", fatura: { id: "f11", mes: "2026-11" } };
    const r = novoLancamento({ ...FORM_NOVO_VAZIO, nome: "MERCADO", valor: "50", data: "2026-11-20", cartao: "8673" }, novembro);
    expect(r).toMatchObject({ ok: true, valor: { mes: "2026-12", fatura_id: null, final_cartao: null, data: "2026-11-20" } });
  });

  it("sem config_ciclo vai para o Mês aberto; sem data, o Mês aberto", () => {
    const semCiclo = { ...outubro, mesAberto: "2026-11", fatura: null, configsCiclo: [] };
    expect(novoLancamento({ ...FORM_NOVO_VAZIO, nome: "X", valor: "1", data: "2026-11-20" }, semCiclo)).toMatchObject({
      ok: true,
      valor: { mes: "2026-11" },
    });
    expect(novoLancamento({ ...FORM_NOVO_VAZIO, nome: "X", valor: "1" }, { ...outubro, mesAberto: "2026-11" })).toMatchObject({
      ok: true,
      valor: { mes: "2026-11" },
    });
  });

  it("a caixa marcada sem Fatura no Mês não vale", () => {
    const r = novoLancamento({ ...FORM_NOVO_VAZIO, nome: "X", valor: "1", corrigeFatura: true }, { ...outubro, fatura: null });
    expect(r).toMatchObject({ ok: true, valor: { fatura_id: null, final_cartao: null } });
  });

  it("classificação e textos opcionais", () => {
    const r = novoLancamento(
      { ...FORM_NOVO_VAZIO, nome: "X", valor: "-5,00", apelido: " A ", observacao: " o ", responsavel: "r", tipo: "t", status: "s" },
      outubro,
    );
    expect(r).toMatchObject({
      ok: true,
      valor: { valor_centavos: -500, apelido: "A", observacao: "o", responsavel_id: "r", tipo_id: "t", status_id: "s" },
    });
  });
});

describe("Conferência no painel", () => {
  const fatura = { id: "f10", total_despesas_centavos: 81000, total_creditos_centavos: 0 };
  const cartoes = [
    { fatura_id: "f10", final: "5061", total_centavos: 1000 },
    { fatura_id: "f10", final: "8673", total_centavos: 80000 },
  ];
  const linha = (valor: number, final: string | null = "8673") => ({
    fatura_id: "f10",
    valor_centavos: valor,
    final_cartao: final,
    excluido_em: null,
  });

  it("✓ quando bate; diferença de R$ 720,00 depois de corrigir BELLA PIETRA para R$ 80,00", () => {
    const padaria = linha(1000, "5061");
    expect(textoConferenciaDoLancamento(padaria, conferir(fatura, cartoes, [padaria, linha(80000)]))).toBe("Conferência: ✓");
    const corrigida = conferir(fatura, cartoes, [padaria, linha(8000)]);
    expect(sem(textoConferenciaDoLancamento(padaria, corrigida)!)).toBe("Conferência: diferença de R$ 720,00");
  });

  it("só num Lançamento da Fatura conferida", () => {
    const c = conferir(fatura, cartoes, []);
    expect(textoConferenciaDoLancamento({ fatura_id: null }, c)).toBeNull();
    expect(textoConferenciaDoLancamento({ fatura_id: "f11" }, c)).toBeNull();
    expect(textoConferenciaDoLancamento({ fatura_id: "f10" }, null)).toBeNull();
  });

  it("final nulo de R$ 5,00: despesas +R$ 5,00 e nenhum cartão ''", () => {
    const c = conferir(fatura, cartoes, [linha(1000, "5061"), linha(80000), linha(500, null)]);
    expect(c.despesasCentavos).toBe(81500);
    expect(c.porCartao.map((p) => p.final)).toEqual(["5061", "8673"]);
    expect(sem(textoConferenciaDoLancamento({ fatura_id: "f10" }, c)!)).toBe("Conferência: diferença de R$ 5,00");
  });
});

describe("opções do seletor", () => {
  const tipos = [
    { id: "t-casa", nome: "Casa", arquivado: false },
    { id: "t-velho", nome: "Velho", arquivado: true },
  ];

  it("não arquivados e 'Sem …'; o arquivado em uso aparece", () => {
    expect(opcoesDoCadastro(tipos, null, "Sem tipo")).toEqual([
      { valor: "t-casa", rotulo: "Casa" },
      { valor: "", rotulo: "Sem tipo" },
    ]);
    expect(opcoesDoCadastro(tipos, "t-velho", "Sem tipo").map((o) => o.rotulo)).toEqual(["Casa", "Velho", "Sem tipo"]);
  });
});

describe("seleção", () => {
  it("caixa da linha marca e desmarca", () => {
    const a = alternarSelecao(new Set(), "a");
    expect([...a]).toEqual(["a"]);
    expect([...alternarSelecao(a, "a")]).toEqual([]);
  });

  it("caixa do cabeçalho: nenhum, parcial e todos sobre as linhas da grade", () => {
    const ids = ["a", "b", "c"];
    expect(estadoCaixaCabecalho(new Set(), ids)).toBe("nenhum");
    expect(estadoCaixaCabecalho(new Set(["a"]), ids)).toBe("parcial");
    expect(estadoCaixaCabecalho(new Set(ids), ids)).toBe("todos");
    expect(estadoCaixaCabecalho(new Set(["a"]), [])).toBe("nenhum");
    // Selecionado fora da grade (outro filtro) não conta.
    expect(estadoCaixaCabecalho(new Set(["x"]), ids)).toBe("nenhum");
  });

  it("tocar no cabeçalho marca todas; de novo, desmarca as da grade", () => {
    const todas = alternarTodos(new Set(["a"]), ["a", "b"]);
    expect([...todas].sort()).toEqual(["a", "b"]);
    expect([...alternarTodos(new Set(["a", "b", "x"]), ["a", "b"])]).toEqual(["x"]);
  });

  it("um Lançamento excluído sai da seleção", () => {
    expect([...selecaoValida(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
  });
});

describe("alterado em outro aparelho", () => {
  const visto = "2026-11-08T00:14:00.100000+00:00";

  it("versão mais nova que não veio daqui: sim", () => {
    expect(alteradoEmOutroAparelho(visto, "2026-11-08 00:30:00.5+00", [])).toBe(true);
  });

  it("a própria gravação devolvida pelo Realtime com o mesmo updated_at: não", () => {
    const gravado = "2026-11-08T00:20:00.123456+00:00";
    expect(alteradoEmOutroAparelho(visto, "2026-11-08 00:20:00.123456+00", [gravado])).toBe(false);
  });

  it("mesma versão ou mais velha: não", () => {
    expect(alteradoEmOutroAparelho(visto, visto, [])).toBe(false);
    expect(alteradoEmOutroAparelho(visto, "2026-11-08T00:00:00+00:00", [])).toBe(false);
    expect(alteradoEmOutroAparelho(visto, "ilegível", [])).toBe(false);
  });
});
