import { describe, expect, it } from "vitest";
import { conferir } from "./conferencia";
import {
  FILTRO_ATRASADO,
  FILTROS_VAZIOS,
  alternarResponsavelUnico,
  alternarBloco,
  aplicarFiltros,
  definirColuna,
  filtrosAtivosEm,
  limparBloco,
  motivoDoVazio,
  motivoParaDesfazerBloco,
  passaNaBusca,
  resolverBloco,
  restringirAoBloco,
  rotuloDaPilula,
  temFiltro,
  textoDaPilulaDoBloco,
  valoresDaColuna,
  valoresDoLancamento,
  type CadastrosFiltro,
  type FiltrosGrade,
} from "./filtros-grade";
import type { LancamentoGrade } from "./painel";

const lanc = (id: string, extra: Partial<LancamentoGrade> = {}): LancamentoGrade => ({
  id,
  nome: `LOJA ${id}`,
  apelido: null,
  parcela_n: null,
  parcela_total: null,
  valor_centavos: 1000,
  tipo_id: null,
  responsavel_id: null,
  status_id: null,
  lancado_por: "fatura",
  ordem_fatura: null,
  final_cartao: "5061",
  fatura_id: "f10",
  duvida_extracao: false,
  ...extra,
});

const ids = (linhas: readonly LancamentoGrade[]) => linhas.map((l) => l.id);

const cadastros: CadastrosFiltro = {
  responsaveis: [
    { id: "r-rangel", nome: "Rangel", cor: 3, ordem: 3, arquivado: false },
    { id: "r-rafael", nome: "Rafael", cor: 1, ordem: 1, arquivado: false },
    { id: "r-casal", nome: "Casal", cor: 2, ordem: 2, arquivado: false },
    { id: "r-antigo", nome: "Antigo", cor: 4, ordem: 4, arquivado: true },
  ],
  tipos: [
    { id: "t-viagem", nome: "Viagem", arquivado: false },
    { id: "t-casa", nome: "Casa", arquivado: false },
    { id: "t-velho", nome: "Velho", arquivado: true },
  ],
  // Fora de ordem de propósito: a lista sai alfabética.
  status: [
    { id: "s-pago", nome: "Pago", arquivado: false },
    { id: "s-nao", nome: "Não pago", arquivado: false },
  ],
};

const com = (
  extra: Partial<Omit<FiltrosGrade, "colunas">> & { colunas?: Partial<FiltrosGrade["colunas"]> } = {},
): FiltrosGrade => ({
  ...FILTROS_VAZIOS,
  ...extra,
  colunas: { ...FILTROS_VAZIOS.colunas, ...extra.colunas },
});

describe("busca", () => {
  it("Nome ou Apelido contendo o texto, sem maiúsculas nem acentos; em branco não filtra", () => {
    const magalu = lanc("m", { nome: "MAGALU MAGALU", apelido: "Lava e seca" });
    const outra = lanc("o", { nome: "PADARIA SÃO JOÃO" });
    expect(passaNaBusca(magalu, "magalu")).toBe(true);
    expect(passaNaBusca(magalu, "lava")).toBe(true);
    expect(passaNaBusca(magalu, "LAVA E")).toBe(true);
    expect(passaNaBusca(outra, "lava")).toBe(false);
    expect(passaNaBusca(outra, "sao joao")).toBe(true);
    expect(passaNaBusca(outra, "   ")).toBe(true);
    expect(ids(aplicarFiltros([magalu, outra], com({ busca: "magalu" }), null))).toEqual(["m"]);
  });
});

describe("valores do Lançamento", () => {
  it("Parcela: à vista (sem Parcela ou 1/1), parcelado e última parcela", () => {
    expect(valoresDoLancamento(lanc("a"), "parcela")).toEqual(["a_vista"]);
    expect(valoresDoLancamento(lanc("a", { parcela_n: 1, parcela_total: 1 }), "parcela")).toEqual(["a_vista"]);
    expect(valoresDoLancamento(lanc("a", { parcela_n: 2, parcela_total: 12 }), "parcela")).toEqual(["parcelado"]);
    expect(valoresDoLancamento(lanc("a", { parcela_n: 12, parcela_total: 12 }), "parcela")).toEqual([
      "parcelado",
      "ultima_parcela",
    ]);
  });

  it("cartão sem final é null", () => {
    expect(valoresDoLancamento(lanc("a", { final_cartao: null }), "cartao")).toEqual([null]);
    expect(valoresDoLancamento(lanc("a", { final_cartao: "8673" }), "cartao")).toEqual(["8673"]);
  });
});

describe("aplicarFiltros", () => {
  it("OU dentro da coluna, E entre colunas", () => {
    const linhas = [
      lanc("vista-8673", { final_cartao: "8673" }),
      lanc("ultima-8673", { final_cartao: "8673", parcela_n: 10, parcela_total: 10 }),
      lanc("meio-8673", { final_cartao: "8673", parcela_n: 2, parcela_total: 10 }),
      lanc("vista-5061", { final_cartao: "5061" }),
    ];
    const f = com({ colunas: { parcela: ["a_vista", "ultima_parcela"], cartao: ["8673"] } });
    expect(ids(aplicarFiltros(linhas, f, null))).toEqual(["vista-8673", "ultima-8673"]);
  });

  it("null filtra os sem cadastro", () => {
    const linhas = [lanc("a", { responsavel_id: "r-rafael" }), lanc("b"), lanc("c", { responsavel_id: "r-casal" })];
    expect(ids(aplicarFiltros(linhas, com({ colunas: { responsavel: [null] } }), null))).toEqual(["b"]);
    expect(ids(aplicarFiltros(linhas, com({ colunas: { responsavel: ["r-casal", null] } }), null))).toEqual(["b", "c"]);
  });

  it("Verificar só vale com Conferência e combina com as colunas", () => {
    const linhas = [
      lanc("a", { final_cartao: "8673", valor_centavos: 8000, responsavel_id: "r-casal" }),
      lanc("b", { final_cartao: "8673", valor_centavos: 2000, responsavel_id: "r-rafael" }),
      lanc("c", { final_cartao: "5061", valor_centavos: 1000, responsavel_id: "r-rafael" }),
    ];
    const conferencia = conferir(
      { id: "f10", total_despesas_centavos: 20_000, total_creditos_centavos: 0 },
      [
        { fatura_id: "f10", final: "8673", total_centavos: 19_000 },
        { fatura_id: "f10", final: "5061", total_centavos: 1_000 },
      ],
      linhas.map((l) => ({ ...l, excluido_em: null })),
    );
    const f = com({ verificar: true });
    expect(ids(aplicarFiltros(linhas, f, conferencia))).toEqual(["a", "b"]);
    expect(ids(aplicarFiltros(linhas, f, null))).toEqual(["a", "b", "c"]);
    expect(ids(aplicarFiltros(linhas, com({ verificar: true, colunas: { responsavel: ["r-rafael"] } }), conferencia))).toEqual(["b"]);
    // A contagem do popover também só conta as marcadas ("a" e "b").
    const contagens = valoresDaColuna("responsavel", linhas, f, conferencia, cadastros);
    expect(contagens.map((o) => [o.valor, o.contagem])).toEqual([
      ["r-rafael", 1],
      ["r-casal", 1],
      ["r-rangel", 0],
      [null, 0],
    ]);
  });
});

describe("valoresDaColuna", () => {
  it("produção hoje: sem cadastro em nenhum, cada Responsável 0 e 'Sem responsável' com todos", () => {
    const linhas = Array.from({ length: 49 }, (_, i) => lanc(`l${i}`));
    const r = valoresDaColuna("responsavel", linhas, FILTROS_VAZIOS, null, cadastros);
    expect(r.map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Rafael", 0],
      ["Casal", 0],
      ["Rangel", 0],
      ["Sem responsável", 49],
    ]);
    expect(valoresDaColuna("tipo", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Casa", 0],
      ["Viagem", 0],
      ["Sem tipo", 49],
    ]);
    expect(valoresDaColuna("status", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => o.rotulo)).toEqual([
      "Não pago",
      "Pago",
      "Atrasado",
      "Sem status",
    ]);
    expect(valoresDaColuna("status", linhas, FILTROS_VAZIOS, null, cadastros).at(-1)).toMatchObject({
      rotulo: "Sem status",
      contagem: 49,
    });
  });

  it("arquivado só aparece se o Mês usa ou se está escolhido", () => {
    const linhas = [lanc("a", { responsavel_id: "r-antigo" })];
    expect(valoresDaColuna("responsavel", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => o.rotulo)).toContain("Antigo");
    expect(valoresDaColuna("responsavel", [lanc("b")], FILTROS_VAZIOS, null, cadastros).map((o) => o.rotulo)).not.toContain(
      "Antigo",
    );
    const escolhido = com({ colunas: { tipo: ["t-velho"] } });
    expect(valoresDaColuna("tipo", [lanc("b")], escolhido, null, cadastros).map((o) => o.rotulo)).toEqual([
      "Casa",
      "Viagem",
      "Velho",
      "Sem tipo",
    ]);
  });

  it("id escolhido que sumiu do cadastro aparece como '—' antes de 'Sem tipo'", () => {
    const f = com({ colunas: { tipo: ["t-sumiu"] } });
    const opcoes = valoresDaColuna("tipo", [lanc("a")], f, null, cadastros);
    expect(opcoes.slice(-2)).toMatchObject([
      { valor: "t-sumiu", rotulo: "—" },
      { valor: null, rotulo: "Sem tipo" },
    ]);
    expect(rotuloDaPilula("tipo", f, opcoes)).toBe("Tipo: —");
  });

  it("contagem: as outras colunas e a busca entram, a própria não", () => {
    const linhas = [
      lanc("a", { responsavel_id: "r-casal", tipo_id: "t-casa", nome: "MAGALU" }),
      lanc("b", { responsavel_id: "r-rafael", tipo_id: "t-casa" }),
      lanc("c", { responsavel_id: "r-casal", tipo_id: "t-viagem" }),
    ];
    const f = com({ colunas: { responsavel: ["r-casal"], tipo: ["t-casa"] } });
    const resp = valoresDaColuna("responsavel", linhas, f, null, cadastros);
    expect(resp.map((o) => [o.valor, o.contagem])).toEqual([
      ["r-rafael", 1],
      ["r-casal", 1],
      ["r-rangel", 0],
      [null, 0],
    ]);
    const tipos = valoresDaColuna("tipo", linhas, f, null, cadastros);
    expect(tipos.map((o) => [o.valor, o.contagem])).toEqual([
      ["t-casa", 1],
      ["t-viagem", 1],
      [null, 0],
    ]);
    const comBusca = valoresDaColuna("tipo", linhas, { ...f, busca: "magalu" }, null, cadastros);
    expect(comBusca.map((o) => o.contagem)).toEqual([1, 0, 0]);
  });

  it("Lançado por e Parcela: valores fixos; um Lançamento conta em Parcelado e Última", () => {
    const linhas = [lanc("a", { parcela_n: 3, parcela_total: 3 }), lanc("b", { lancado_por: "manual" })];
    expect(valoresDaColuna("lancado_por", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Fatura", 1],
      ["Sistema", 0],
      ["Manual", 1],
      ["Histórico", 0],
    ]);
    expect(valoresDaColuna("parcela", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => [o.rotulo, o.contagem])).toEqual([
      ["À vista", 1],
      ["Parcelado", 1],
      ["Última parcela", 1],
    ]);
  });

  it("cartão: finais do Mês em ordem; 'Sem cartão' só se algum não tem; escolhido fora do Mês fica com 0", () => {
    const linhas = [lanc("a", { final_cartao: "8673" }), lanc("b", { final_cartao: "5061" }), lanc("c", { final_cartao: "8673" })];
    expect(valoresDaColuna("cartao", linhas, FILTROS_VAZIOS, null, cadastros).map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Cartão final 5061", 1],
      ["Cartão final 8673", 2],
    ]);
    const comSem = valoresDaColuna("cartao", [...linhas, lanc("d", { final_cartao: null })], FILTROS_VAZIOS, null, cadastros);
    expect(comSem.at(-1)).toMatchObject({ valor: null, rotulo: "Sem cartão", contagem: 1 });

    // Outubro escolhe 3967; novembro não tem 3967.
    const f = com({ colunas: { cartao: ["3967"] } });
    const nov = valoresDaColuna("cartao", linhas, f, null, cadastros);
    expect(nov.map((o) => [o.valor, o.contagem])).toEqual([
      ["3967", 0],
      ["5061", 1],
      ["8673", 2],
    ]);
    expect(rotuloDaPilula("cartao", f, nov)).toBe("Cartão: 3967");
    expect(aplicarFiltros(linhas, f, null)).toEqual([]);
  });
});

describe("valoresDaColuna com o rascunho do popover (História 2.7)", () => {
  it("um valor marcado que sumiu do Mês continua na lista, com contagem 0", () => {
    // O único Lançamento do cartão 3967 mudou de cartão em outro aparelho.
    const linhas = [lanc("a", { final_cartao: "5061" })];
    const r = valoresDaColuna("cartao", linhas, FILTROS_VAZIOS, null, cadastros, ["3967"]);
    expect(r.map((o) => [o.valor, o.contagem])).toEqual([
      ["3967", 0],
      ["5061", 1],
    ]);
    const semCartao = valoresDaColuna("cartao", linhas, FILTROS_VAZIOS, null, cadastros, [null]);
    expect(semCartao.at(-1)).toMatchObject({ valor: null, rotulo: "Sem cartão", contagem: 0 });
    // Arquivado que deixou de ser usado também fica.
    const tipos = valoresDaColuna("tipo", [lanc("b")], FILTROS_VAZIOS, null, cadastros, ["t-velho"]);
    expect(tipos.map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Casa", 0],
      ["Viagem", 0],
      ["Velho", 0],
      ["Sem tipo", 1],
    ]);
  });

  it("sem extras, a lista é a mesma da 2.6", () => {
    const linhas = [lanc("a", { final_cartao: "5061" })];
    expect(valoresDaColuna("cartao", linhas, FILTROS_VAZIOS, null, cadastros, [])).toEqual(
      valoresDaColuna("cartao", linhas, FILTROS_VAZIOS, null, cadastros),
    );
  });
});

describe("pílula, hero e estado", () => {
  it("pílula: inativa só a coluna; ativa com os valores na ordem da lista", () => {
    const f = com({ colunas: { responsavel: ["r-rangel", "r-casal"] } });
    const opcoes = valoresDaColuna("responsavel", [], f, null, cadastros);
    expect(rotuloDaPilula("responsavel", FILTROS_VAZIOS, opcoes)).toBe("Responsável");
    expect(rotuloDaPilula("responsavel", f, opcoes)).toBe("Responsável: Casal, Rangel");
  });

  it("hero: {Casal, Rangel} e toque em Casal vira {Casal}; de novo, limpa", () => {
    const f = com({ colunas: { responsavel: ["r-casal", "r-rangel"] } });
    const so = alternarResponsavelUnico(f, "r-casal");
    expect(so.colunas.responsavel).toEqual(["r-casal"]);
    expect(alternarResponsavelUnico(so, "r-casal").colunas.responsavel).toEqual([]);
    expect(alternarResponsavelUnico(so, null).colunas.responsavel).toEqual([null]);
  });

  it("temFiltro, Mais e o motivo do vazio", () => {
    expect(temFiltro(FILTROS_VAZIOS)).toBe(false);
    expect(temFiltro(com({ busca: "  " }))).toBe(false);
    expect(temFiltro(com({ busca: "x" }))).toBe(true);
    expect(temFiltro(com({ verificar: true }))).toBe(true);
    expect(temFiltro(definirColuna(FILTROS_VAZIOS, "parcela", ["a_vista"]))).toBe(true);

    const f = com({ verificar: true, colunas: { cartao: ["8673"], responsavel: ["r-casal"] } });
    expect(filtrosAtivosEm(f, ["lancado_por", "parcela", "cartao"], true)).toBe(2);
    expect(filtrosAtivosEm(f, ["lancado_por", "parcela", "cartao"], false)).toBe(1);

    expect(motivoDoVazio(FILTROS_VAZIOS, true)).toBeNull();
    expect(motivoDoVazio(com({ busca: "x" }), true)).toBe("filtros");
    expect(motivoDoVazio(com({ busca: "x" }), false)).toBeNull();
    expect(motivoDoVazio(com({ verificar: true }), true)).toBe("verificar");
    expect(motivoDoVazio(com({ verificar: true }), false)).toBe("verificar");
    expect(motivoDoVazio(com({ verificar: true, busca: "x" }), true)).toBe("filtros");
  });

  it("definirColuna não muda o estado recebido", () => {
    const novo = definirColuna(FILTROS_VAZIOS, "tipo", ["t-casa"]);
    expect(FILTROS_VAZIOS.colunas.tipo).toEqual([]);
    expect(novo.colunas.tipo).toEqual(["t-casa"]);
  });
});

// ------------------------------------------------------- Bloco (História 4.3)

describe("filtro por Bloco (FR-20)", () => {
  const linha = (id: string, valor: number, responsavel: string | null, tipo: string | null = null) => ({
    id,
    valor_centavos: valor,
    responsavel_id: responsavel,
    tipo_id: tipo,
  });
  const projecao = [linha("a", 1000, "casal"), linha("b", 2000, "mae"), linha("c", 500, "mae", "saude"), linha("d", 700, null)];
  const formulaMae = { tipo: "responsavel", id: "mae" } as const;
  const blocos = [
    { id: "b-mae", nome: "Mãe", formula: formulaMae },
    { id: "b-todos", nome: "Todos", formula: { tipo: "todos" } as const },
    { id: "b-ninguem", nome: "Lucas", formula: { tipo: "responsavel", id: "lucas" } as const },
    {
      id: "b-zero",
      nome: "Dividido por zero",
      formula: {
        tipo: "operacao",
        operacao: "divisao",
        esquerda: formulaMae,
        direita: { tipo: "numero", valor: "0" },
      } as const,
    },
  ];

  it("sem Bloco, o estado é inativo e nada é restringido", () => {
    expect(FILTROS_VAZIOS.bloco).toBeNull();
    const r = resolverBloco(FILTROS_VAZIOS, blocos, projecao);
    expect(r).toEqual({ estado: "inativo" });
    expect(restringirAoBloco(projecao, r)).toEqual(projecao);
    expect(textoDaPilulaDoBloco(r)).toBeNull();
  });

  it("com o Bloco, entram os ids que `avaliar` devolve (a mesma conta do valor)", () => {
    const r = resolverBloco({ bloco: "b-mae" }, blocos, projecao);
    expect(r).toMatchObject({ estado: "ativo", id: "b-mae", nome: "Mãe" });
    expect(restringirAoBloco(projecao, r).map((l) => l.id)).toEqual(["b", "c"]);
    expect(textoDaPilulaDoBloco(r)).toBe("Bloco: Mãe");
  });

  it("'Todos' deixa passar tudo; Bloco que não pega nada deixa a grade vazia", () => {
    expect(restringirAoBloco(projecao, resolverBloco({ bloco: "b-todos" }, blocos, projecao)).map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    const vazio = resolverBloco({ bloco: "b-ninguem" }, blocos, projecao);
    expect(vazio.estado).toBe("ativo");
    expect(restringirAoBloco(projecao, vazio)).toEqual([]);
  });

  it("o Bloco editado recalcula (a Fórmula nova vale no próximo cálculo) e o excluído some", () => {
    const editados = blocos.map((b) => (b.id === "b-mae" ? { ...b, nome: "Mamãe", formula: { tipo: "responsavel", id: "casal" } as const } : b));
    const r = resolverBloco({ bloco: "b-mae" }, editados, projecao);
    expect(r).toMatchObject({ estado: "ativo", nome: "Mamãe" });
    expect(restringirAoBloco(projecao, r).map((l) => l.id)).toEqual(["a"]);
    expect(resolverBloco({ bloco: "b-mae" }, [], projecao)).toEqual({ estado: "ausente" });
  });

  it("o Mês novo recalcula `entram` pela projeção do Mês (o filtro fica, os ids mudam)", () => {
    const outroMes = [linha("z", 900, "mae")];
    const r = resolverBloco({ bloco: "b-mae" }, blocos, outroMes);
    expect(restringirAoBloco(outroMes, r).map((l) => l.id)).toEqual(["z"]);
    expect(restringirAoBloco([], resolverBloco({ bloco: "b-mae" }, blocos, [])).length).toBe(0);
  });

  it("Fórmula que não calcula: sem_valor, sem filtrar", () => {
    const r = resolverBloco({ bloco: "b-zero" }, blocos, projecao);
    expect(r).toEqual({ estado: "sem_valor", nome: "Dividido por zero" });
    expect(restringirAoBloco(projecao, r)).toEqual(projecao);
    expect(textoDaPilulaDoBloco(r)).toBeNull();
  });

  it("tocar liga, tocar de novo desfaz, tocar noutro troca (só um por vez)", () => {
    const ligado = alternarBloco(FILTROS_VAZIOS, "b-mae");
    expect(ligado.bloco).toBe("b-mae");
    expect(alternarBloco(ligado, "b-mae").bloco).toBeNull();
    expect(alternarBloco(ligado, "b-todos").bloco).toBe("b-todos");
    expect(FILTROS_VAZIOS.bloco).toBeNull();
    expect(limparBloco(ligado)).toEqual(FILTROS_VAZIOS);
    // Já sem Bloco, devolve o mesmo objeto (nenhuma troca de estado à toa).
    expect(limparBloco(FILTROS_VAZIOS)).toBe(FILTROS_VAZIOS);
  });

  it("o Bloco conta como filtro: 'Limpar filtros' aparece e a grade vazia é por filtros", () => {
    const f = alternarBloco(FILTROS_VAZIOS, "b-mae");
    expect(temFiltro(f)).toBe(true);
    expect(temFiltro(FILTROS_VAZIOS)).toBe(false);
    expect(motivoDoVazio(f, true)).toBe("filtros");
    expect(motivoDoVazio(f, false)).toBeNull();
  });

  it("soma-se (E) à busca, às colunas e a 'Verificar'", () => {
    const l = [
      lanc("1", { nome: "FARMACIA", responsavel_id: "r-casal", tipo_id: "t-casa" }),
      lanc("2", { nome: "FARMACIA CENTRO", responsavel_id: "r-rafael", tipo_id: "t-casa" }),
      lanc("3", { nome: "MERCADO", responsavel_id: "r-casal", tipo_id: "t-casa" }),
    ];
    const noBloco = restringirAoBloco(l, { estado: "ativo", id: "b", nome: "Casal", entram: new Set(["1", "3"]) });
    expect(ids(aplicarFiltros(noBloco, com({ busca: "farm" }), null))).toEqual(["1"]);
    expect(ids(aplicarFiltros(noBloco, com({ colunas: { responsavel: ["r-rafael"] } }), null))).toEqual([]);
    expect(ids(aplicarFiltros(noBloco, FILTROS_VAZIOS, null))).toEqual(["1", "3"]);
    // A contagem do popover já vem restrita ao Bloco (o rascunho da coluna a ver).
    const contagem = valoresDaColuna("responsavel", noBloco, FILTROS_VAZIOS, null, cadastros);
    expect(contagem.find((o) => o.valor === "r-casal")?.contagem).toBe(2);
    expect(contagem.find((o) => o.valor === "r-rafael")?.contagem).toBe(0);
  });

  it("desfaz sozinho só com o Bloco ausente (e a lista lida) ou sem valor", () => {
    const ativo = resolverBloco({ bloco: "b-mae" }, blocos, projecao);
    expect(motivoParaDesfazerBloco(ativo, true)).toBeNull();
    expect(motivoParaDesfazerBloco({ estado: "inativo" }, true)).toBeNull();
    expect(motivoParaDesfazerBloco({ estado: "ausente" }, true)).toBe("filtro_desfeito_excluido");
    // Enquanto a lista de Blocos carrega, "ausente" não apaga o filtro.
    expect(motivoParaDesfazerBloco({ estado: "ausente" }, false)).toBeNull();
    expect(motivoParaDesfazerBloco({ estado: "sem_valor", nome: "X" }, false)).toBe("filtro_desfeito_sem_valor");
  });
});

describe("Atrasado, um valor calculado da coluna Status (6.4)", () => {
  const linhas = [
    lanc("1", { status_id: "s-nao" }), // atrasada
    lanc("2", { status_id: "s-nao" }), // não pago, em dia
    lanc("3", { status_id: "s-pago" }),
    lanc("4", { status_id: null }), // sem Status e atrasada
  ];
  const atrasadas = new Set(["1", "4"]);

  it("o Lançamento atrasado tem o Status gravado e também o valor Atrasado", () => {
    expect(valoresDoLancamento(linhas[0], "status", atrasadas)).toEqual(["s-nao", FILTRO_ATRASADO]);
    expect(valoresDoLancamento(linhas[1], "status", atrasadas)).toEqual(["s-nao"]);
    expect(valoresDoLancamento(linhas[3], "status", atrasadas)).toEqual([null, FILTRO_ATRASADO]);
  });

  it("sem o conjunto, ninguém tem o valor Atrasado (quem chama como antes não muda)", () => {
    expect(valoresDoLancamento(linhas[0], "status")).toEqual(["s-nao"]);
    expect(ids(aplicarFiltros(linhas, definirColuna(FILTROS_VAZIOS, "status", [FILTRO_ATRASADO]), null))).toEqual([]);
  });

  it("filtrar só por Atrasado mostra só os atrasados", () => {
    const f = definirColuna(FILTROS_VAZIOS, "status", [FILTRO_ATRASADO]);
    expect(ids(aplicarFiltros(linhas, f, null, undefined, atrasadas))).toEqual(["1", "4"]);
  });

  it("soma-se (OU) aos Status cadastrados: Não pago inclui os atrasados, que seguem Não pago", () => {
    const naoPago = definirColuna(FILTROS_VAZIOS, "status", ["s-nao"]);
    expect(ids(aplicarFiltros(linhas, naoPago, null, undefined, atrasadas))).toEqual(["1", "2"]);
    const dois = definirColuna(FILTROS_VAZIOS, "status", ["s-pago", FILTRO_ATRASADO]);
    expect(ids(aplicarFiltros(linhas, dois, null, undefined, atrasadas))).toEqual(["1", "3", "4"]);
  });

  it("soma-se (E) às outras colunas", () => {
    const l = [
      lanc("1", { status_id: "s-nao", responsavel_id: "r-rafael" }),
      lanc("2", { status_id: "s-nao", responsavel_id: "r-casal" }),
    ];
    let f = definirColuna(FILTROS_VAZIOS, "status", [FILTRO_ATRASADO]);
    f = definirColuna(f, "responsavel", ["r-casal"]);
    expect(ids(aplicarFiltros(l, f, null, undefined, new Set(["1", "2"])))).toEqual(["2"]);
  });

  it("a lista de valores tem Atrasado entre os Status e Sem status, com a contagem", () => {
    const lista = valoresDaColuna("status", linhas, FILTROS_VAZIOS, null, cadastros, [], atrasadas);
    expect(lista.map((o) => [o.rotulo, o.contagem])).toEqual([
      ["Não pago", 2],
      ["Pago", 1],
      ["Atrasado", 2],
      ["Sem status", 1],
    ]);
    expect(lista.find((o) => o.rotulo === "Atrasado")).toMatchObject({ valor: FILTRO_ATRASADO, curto: "Atrasado" });
  });

  it("Atrasado fica na lista com contagem 0 mesmo sem ninguém atrasado", () => {
    const lista = valoresDaColuna("status", linhas, FILTROS_VAZIOS, null, cadastros);
    expect(lista.find((o) => o.valor === FILTRO_ATRASADO)?.contagem).toBe(0);
  });

  it("a contagem de Atrasado respeita as outras colunas e a de Não pago não muda por ele", () => {
    const f = definirColuna(FILTROS_VAZIOS, "status", [FILTRO_ATRASADO]);
    const lista = valoresDaColuna("status", linhas, f, null, cadastros, [], atrasadas);
    // A própria coluna não entra na contagem: os valores seguem contando sobre todas as linhas.
    expect(lista.find((o) => o.rotulo === "Não pago")?.contagem).toBe(2);
  });

  it("o escolhido Atrasado não vira um 'id que sumiu' na lista, e a pílula diz Status: Atrasado", () => {
    const f = definirColuna(FILTROS_VAZIOS, "status", [FILTRO_ATRASADO]);
    const lista = valoresDaColuna("status", linhas, f, null, cadastros, [], atrasadas);
    expect(lista.map((o) => o.rotulo)).toEqual(["Não pago", "Pago", "Atrasado", "Sem status"]);
    expect(rotuloDaPilula("status", f, lista)).toBe("Status: Atrasado");
  });
});
