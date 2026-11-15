import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import { alternarTodos, selecaoValida } from "./lancamento";
import {
  STATUS_NENHUM,
  aoTrocarDeMes,
  contarPartes,
  ehSelecionarTodos,
  montarCamposDoLote,
  planejarClassificacaoEmLote,
  planejarExclusaoEmLote,
  resumoDaSelecao,
  selecionarTudo,
  textosDaBarra,
  type LinhaDaSelecao,
} from "./selecao";

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$", `-${ESPACO}R$`);

const linha = (id: string, valor: number, extra: Partial<LinhaDaSelecao> = {}): LinhaDaSelecao => ({
  id,
  valor_centavos: valor,
  ajuste_de_id: null,
  excluido_em: null,
  dividido_de_id: null,
  ...extra,
});

describe("textosDaBarra", () => {
  it("'N selecionados · R$ total', com a contagem e o total separados (o total vai em negrito na tela)", () => {
    const t = textosDaBarra(3, 20910);
    expect(t.contagem).toBe("3 selecionados");
    expect(t.total).toBe(e("R$ 209,10"));
    expect(t.texto).toBe(e("3 selecionados · R$ 209,10"));
  });

  it("singular e total negativo (soma líquida de créditos)", () => {
    expect(textosDaBarra(1, -8).texto).toBe(e("1 selecionado · - R$ 0,08"));
  });
});

describe("resumoDaSelecao", () => {
  const visiveis = [linha("a", 10000), linha("b", 5000), linha("aj", -8, { ajuste_de_id: "a" }), linha("c", 2000)];

  it("conta as marcadas e soma o líquido: a mãe com o Ajuste dela, que não conta como item", () => {
    const r = resumoDaSelecao(new Set(["a", "c"]), visiveis);
    expect(r.quantidade).toBe(2);
    expect(r.totalCentavos).toBe(10000 - 8 + 2000);
    expect(r.texto).toBe(e("2 selecionados · R$ 119,92"));
  });

  it("é a mesma soma da barra do Revisar (`totalDaSelecao`) e do rodapé da grade", () => {
    const r = resumoDaSelecao(new Set(["a", "b", "c"]), visiveis);
    expect(r.totalCentavos).toBe(visiveis.reduce((s, l) => s + l.valor_centavos, 0));
  });

  it("id que a grade não mostra não conta; o Ajuste marcado junto da mãe não é item", () => {
    const r = resumoDaSelecao(new Set(["a", "fora", "aj"]), visiveis);
    expect(r.quantidade).toBe(1);
    expect(r.totalCentavos).toBe(10000 - 8);
  });

  it("o Ajuste que a grade mostra como linha própria (a mãe não está marcada) é um item", () => {
    const r = resumoDaSelecao(new Set(["aj"]), [linha("aj", -8, { ajuste_de_id: "a" })]);
    expect(r.quantidade).toBe(1);
    expect(r.totalCentavos).toBe(-8);
  });

  it("sem nada marcado, o texto é vazio (a região de anúncio fica vazia)", () => {
    expect(resumoDaSelecao(new Set(), visiveis)).toMatchObject({ quantidade: 0, totalCentavos: 0, texto: "" });
  });

  it("excluído não soma", () => {
    const r = resumoDaSelecao(new Set(["a"]), [linha("a", 500, { excluido_em: "2026-11-01T00:00:00Z" })]);
    expect(r.totalCentavos).toBe(0);
  });
});

describe("Seleção do filtro", () => {
  const filtro = ["a", "b", "c"];

  it("a caixa do cabeçalho marca todos do filtro e, de novo, desmarca todos", () => {
    const marcada = alternarTodos(new Set(), filtro);
    expect([...marcada]).toEqual(filtro);
    expect(alternarTodos(marcada, filtro).size).toBe(0);
  });

  it("o que sai do filtro sai da Seleção", () => {
    expect([...selecaoValida(new Set(["a", "x"]), filtro)]).toEqual(["a"]);
  });

  it("⌘/Ctrl+A só marca: mantém as marcadas e nunca desmarca", () => {
    expect([...selecionarTudo(new Set(["a"]), filtro)].sort()).toEqual(["a", "b", "c"]);
    expect([...selecionarTudo(selecionarTudo(new Set(), filtro), filtro)].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("aoTrocarDeMes", () => {
  it("limpa a Seleção e avisa só se havia Seleção", () => {
    const r = aoTrocarDeMes(new Set(["a"]), "2026-11", "2026-10");
    expect(r.selecao.size).toBe(0);
    expect(r.aviso).toBe("Seleção limpa ao trocar de mês");
  });

  it("sem Seleção, nada a dizer", () => {
    const r = aoTrocarDeMes(new Set(), "2026-11", "2026-10");
    expect(r.selecao.size).toBe(0);
    expect(r.aviso).toBeNull();
  });

  it("o mesmo Mês não limpa nada", () => {
    const selecao = new Set(["a"]);
    expect(aoTrocarDeMes(selecao, "2026-11", "2026-11")).toEqual({ selecao, aviso: null });
  });
});

describe("ehSelecionarTodos", () => {
  const tecla = (extra: Partial<Parameters<typeof ehSelecionarTodos>[0]> = {}) => ({
    key: "a",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });
  const livre = { emCampoDeTexto: false, sobreposicaoAberta: false };

  it("Ctrl+A e ⌘+A (a maiúscula também) com o foco livre", () => {
    expect(ehSelecionarTodos(tecla(), livre)).toBe(true);
    expect(ehSelecionarTodos(tecla({ ctrlKey: false, metaKey: true }), livre)).toBe(true);
    expect(ehSelecionarTodos(tecla({ key: "A" }), livre)).toBe(true);
  });

  it("não vale em campo de texto, janela ou menu", () => {
    expect(ehSelecionarTodos(tecla(), { ...livre, emCampoDeTexto: true })).toBe(false);
    expect(ehSelecionarTodos(tecla(), { ...livre, sobreposicaoAberta: true })).toBe(false);
  });

  it("sem modificador, com Alt ou Shift, outra tecla ou já tratada: não", () => {
    expect(ehSelecionarTodos(tecla({ ctrlKey: false }), livre)).toBe(false);
    expect(ehSelecionarTodos(tecla({ altKey: true }), livre)).toBe(false);
    expect(ehSelecionarTodos(tecla({ shiftKey: true }), livre)).toBe(false);
    expect(ehSelecionarTodos(tecla({ key: "b" }), livre)).toBe(false);
    expect(ehSelecionarTodos(tecla({ defaultPrevented: true }), livre)).toBe(false);
  });
});

describe("montarCamposDoLote", () => {
  const vazia = { responsavelId: "", tipoId: "", status: "", observacao: "" };

  it("vazio = não muda", () => {
    expect(montarCamposDoLote(vazia)).toEqual({});
  });

  it("só o que foi escolhido; Observação sem as pontas; 'Sem status' limpa o Status", () => {
    expect(montarCamposDoLote({ responsavelId: "r", tipoId: "t", status: "s", observacao: "  ok " })).toEqual({
      responsavel_id: "r",
      tipo_id: "t",
      status_id: "s",
      observacao: "ok",
    });
    expect(montarCamposDoLote({ ...vazia, status: STATUS_NENHUM })).toEqual({ status_id: null });
    expect(montarCamposDoLote({ ...vazia, observacao: "   " })).toEqual({});
  });
});

describe("planejarClassificacaoEmLote", () => {
  const linhas = [
    linha("a", 100),
    linha("b", 200),
    linha("aj", -8, { ajuste_de_id: "a" }),
    linha("p1", 300, { dividido_de_id: "mae" }),
    linha("x", 400, { excluido_em: "2026-11-01T00:00:00Z" }),
  ];

  it("uma entrada por marcada, com os mesmos campos; o Ajuste da mãe marcada e o excluído ficam de fora", () => {
    const campos = { tipo_id: "t" };
    expect(planejarClassificacaoEmLote(new Set(["a", "b", "aj", "x"]), linhas, campos)).toEqual([
      { id: "a", campos },
      { id: "b", campos },
    ]);
  });

  it("a parte de uma Divisão só recebe o Status", () => {
    expect(planejarClassificacaoEmLote(new Set(["a", "p1"]), linhas, { tipo_id: "t", status_id: "s" })).toEqual([
      { id: "a", campos: { tipo_id: "t", status_id: "s" } },
      { id: "p1", campos: { status_id: "s" } },
    ]);
    expect(planejarClassificacaoEmLote(new Set(["p1"]), linhas, { tipo_id: "t" })).toEqual([]);
    expect(planejarClassificacaoEmLote(new Set(["p1"]), linhas, { status_id: null })).toEqual([
      { id: "p1", campos: { status_id: null } },
    ]);
  });

  it("sem campos, nenhuma entrada", () => {
    expect(planejarClassificacaoEmLote(new Set(["a"]), linhas, {})).toEqual([]);
  });

  it("conta as partes marcadas", () => {
    expect(contarPartes(new Set(["a", "p1"]), linhas)).toBe(1);
    expect(contarPartes(new Set(["a"]), linhas)).toBe(0);
  });
});

describe("planejarExclusaoEmLote", () => {
  const linhas = [
    linha("a", 100),
    linha("aj", -8, { ajuste_de_id: "a" }),
    linha("aj2", -1, { ajuste_de_id: "a", excluido_em: "2026-11-01T00:00:00Z" }),
    linha("b", 200),
    linha("p1", 300, { dividido_de_id: "mae" }),
  ];

  it("as marcadas e os Ajustes não excluídos delas; a parte de uma Divisão fica", () => {
    expect(planejarExclusaoEmLote(new Set(["a", "b", "p1"]), linhas)).toEqual({
      ids: ["a", "b"],
      ajustes: ["aj"],
      partesQueFicam: 1,
    });
  });

  it("só partes: nada a excluir", () => {
    expect(planejarExclusaoEmLote(new Set(["p1"]), linhas)).toEqual({ ids: [], ajustes: [], partesQueFicam: 1 });
  });
});
