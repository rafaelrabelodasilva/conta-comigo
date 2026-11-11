import { describe, expect, it } from "vitest";
import { linhasDoMes } from "./painel";
import {
  contarFila,
  ehDaFila,
  guardadaPelaFila,
  montarFila,
  ordenarPorUso,
  resumoDaClassificacao,
  resumoDaFila,
  resumoDaImportacao,
  type CadastrosDaFila,
  type LinhaDaFila,
} from "./revisar";

const CASAL = "r-casal";
const RAFAEL = "r-rafael";
const LUCAS = "r-lucas";
const CASA = "t-casa";
const SAUDE = "t-saude";
const GATOS = "t-gatos";

const cadastros: CadastrosDaFila = {
  responsaveis: [
    { id: CASAL, nome: "Casal", arquivado: false },
    { id: RAFAEL, nome: "Rafael", arquivado: false },
    { id: LUCAS, nome: "Lucas", arquivado: true },
  ],
  tipos: [
    { id: CASA, nome: "Casa", arquivado: false },
    { id: SAUDE, nome: "Saúde", arquivado: false },
    { id: GATOS, nome: "Gatos", arquivado: false },
  ],
};

let n = 0;
function linha(extra: Partial<LinhaDaFila> = {}): LinhaDaFila {
  n++;
  return {
    id: `l${n}`,
    nome: `LOJA ${n}`,
    apelido: null,
    mes: "2026-11",
    valor_centavos: 1000,
    parcela_n: null,
    parcela_total: null,
    responsavel_id: null,
    tipo_id: null,
    ajuste_de_id: null,
    excluido_em: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    ordem_fatura: n,
    ...extra,
  };
}

const itemUnico = (l: LinhaDaFila, extras: LinhaDaFila[] = []) => montarFila([l, ...extras], cadastros)[0].itens[0];

describe("ehDaFila (a única definição de estar na fila)", () => {
  it("motivo, não excluída e não Ajuste", () => {
    expect(ehDaFila(linha())).toBe(true);
    expect(ehDaFila(linha({ revisao_motivo: null }))).toBe(false);
    expect(ehDaFila(linha({ excluido_em: "2026-11-02T10:00:00Z" }))).toBe(false);
    expect(ehDaFila(linha({ ajuste_de_id: "mae" }))).toBe(false);
    // Ajuste desvinculado (ajuste_de_id nulo) sem classificação é linha comum.
    expect(ehDaFila(linha({ ajuste_de_id: null, valor_centavos: -8 }))).toBe(true);
  });

  it("o gerenciador da fila guarda a fila e os Ajustes não excluídos (mesma regra, mais os Ajustes)", () => {
    const casos: [Partial<LinhaDaFila>, boolean, boolean][] = [
      [{}, true, true],
      [{ revisao_motivo: null }, false, false],
      [{ excluido_em: "x" }, false, false],
      [{ ajuste_de_id: "mae", revisao_motivo: null }, false, true],
      [{ ajuste_de_id: "mae", revisao_motivo: null, excluido_em: "x" }, false, false],
    ];
    for (const [extra, naFila, guardada] of casos) {
      expect([ehDaFila(linha(extra)), guardadaPelaFila(linha(extra))]).toEqual([naFila, guardada]);
    }
  });

  it("o contador, o 'Faltam N' e a lista são o mesmo número", () => {
    const linhas = [
      linha(),
      linha({ revisao_motivo: "sugestao" }),
      linha({ revisao_motivo: null }),
      linha({ excluido_em: "x" }),
      linha({ ajuste_de_id: "x", revisao_motivo: null }),
      linha({ mes: "2026-10" }),
    ];
    const grupos = montarFila(linhas, cadastros);
    expect(contarFila(linhas)).toBe(3);
    expect(resumoDaFila(grupos).faltam).toBe(3);
    expect(grupos.flatMap((g) => g.itens)).toHaveLength(3);
  });
});

describe("montarFila: variantes (matriz de I/O)", () => {
  it("sugestão completa: ✓ grava Casal · Casa", () => {
    const i = itemUnico(
      linha({
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] },
      }),
    );
    expect(i).toMatchObject({
      variante: "sugestao",
      sugestao: "Casal · Casa",
      duvida: null,
      texto: "Sugestão: Casal · Casa",
      confirmavel: true,
      aoConfirmar: { responsavel_id: CASAL, tipo_id: CASA },
      preenchido: { responsavel_id: CASAL, tipo_id: CASA },
    });
  });

  it("com dúvida: 'Casal · Saúde', 'às vezes Rafael' e o ✓ aplica Casal · Saúde", () => {
    const i = itemUnico(
      linha({
        revisao_motivo: "sugestao_duvida",
        revisao_dados: { responsavel_id: CASAL, tipo_id: SAUDE, outros_responsaveis: [RAFAEL] },
      }),
    );
    expect(i).toMatchObject({
      variante: "sugestao_duvida",
      sugestao: "Casal · Saúde",
      duvida: "às vezes Rafael",
      texto: "Sugestão: Casal · Saúde (às vezes Rafael)",
      confirmavel: true,
      aoConfirmar: { responsavel_id: CASAL, tipo_id: SAUDE },
    });
  });

  it("só Tipo sugerido: 'Sugestão: Gatos', sem ✓, 'Mudar' abre com Gatos", () => {
    const i = itemUnico(
      linha({
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: GATOS, outros_responsaveis: [] },
      }),
    );
    expect(i).toMatchObject({
      variante: "sugestao",
      texto: "Sugestão: Gatos",
      confirmavel: false,
      aoConfirmar: null,
      preenchido: { responsavel_id: null, tipo_id: GATOS },
    });
  });

  it("a Regra aplicou o Responsável: o ✓ grava só o que falta (o Tipo) e fecha o item", () => {
    const i = itemUnico(
      linha({
        responsavel_id: CASAL,
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: GATOS, outros_responsaveis: [] },
      }),
    );
    expect(i.confirmavel).toBe(true);
    expect(i.aoConfirmar).toEqual({ responsavel_id: CASAL, tipo_id: GATOS });
    expect(i.preenchido).toEqual({ responsavel_id: CASAL, tipo_id: GATOS });
  });

  it("Responsável próprio arquivado ou inexistente conta como ausente: a sugestão preenche", () => {
    for (const proprio of [LUCAS, "apagado"]) {
      const i = itemUnico(
        linha({
          responsavel_id: proprio,
          revisao_motivo: "sugestao",
          revisao_dados: { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] },
        }),
      );
      expect(i.aoConfirmar).toEqual({ responsavel_id: CASAL, tipo_id: CASA });
      expect(i.texto).toBe("Sugestão: Casal · Casa");
      expect(i.preenchido).toEqual({ responsavel_id: CASAL, tipo_id: CASA });
    }
  });

  it("Responsável próprio ativo diferente do sugerido: o texto mostra o que o ✓ grava", () => {
    const i = itemUnico(
      linha({
        responsavel_id: RAFAEL,
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] },
      }),
    );
    expect(i.aoConfirmar).toEqual({ responsavel_id: RAFAEL, tipo_id: CASA });
    expect(i.sugestao).toBe("Rafael · Casa");
    expect(i.texto).toBe("Sugestão: Rafael · Casa");
  });

  it("Tipo próprio arquivado ou inexistente também conta como ausente", () => {
    const i = itemUnico(
      linha({
        tipo_id: "t-apagado",
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: CASAL, tipo_id: SAUDE, outros_responsaveis: [] },
      }),
    );
    expect(i.aoConfirmar).toEqual({ responsavel_id: CASAL, tipo_id: SAUDE });
  });

  it("sem sugestão: só 'Mudar', pré-preenchido com o que a linha já tem", () => {
    const i = itemUnico(linha({ responsavel_id: RAFAEL }));
    expect(i).toMatchObject({
      variante: "sem_sugestao",
      sugestao: null,
      texto: "Sem sugestão",
      confirmavel: false,
      aoConfirmar: null,
      preenchido: { responsavel_id: RAFAEL, tipo_id: null },
    });
  });

  it("sugestão anulada: ids nulos, arquivado ou inexistente contam como ausentes", () => {
    const nulos = itemUnico(
      linha({
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: null, tipo_id: null, outros_responsaveis: [] },
      }),
    );
    const arquivado = itemUnico(
      linha({
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: LUCAS, tipo_id: "t-apagado", outros_responsaveis: [] },
      }),
    );
    for (const i of [nulos, arquivado]) {
      expect(i).toMatchObject({ variante: "sem_sugestao", texto: "Sem sugestão", confirmavel: false, aoConfirmar: null });
    }
  });

  it("um dos lados anulado: a sugestão fica só com o outro, sem ✓", () => {
    const i = itemUnico(
      linha({
        revisao_motivo: "sugestao",
        revisao_dados: { responsavel_id: LUCAS, tipo_id: CASA, outros_responsaveis: [] },
      }),
    );
    expect(i).toMatchObject({ variante: "sugestao", texto: "Sugestão: Casa", confirmavel: false });
  });

  it("outros_responsaveis ignora nulos, repetidos, o sugerido, arquivados e inexistentes", () => {
    const i = itemUnico(
      linha({
        revisao_motivo: "sugestao_duvida",
        revisao_dados: {
          responsavel_id: CASAL,
          tipo_id: CASA,
          outros_responsaveis: [null, CASAL, RAFAEL, RAFAEL, LUCAS, "apagado"],
        },
      }),
    );
    expect(i.duvida).toBe("às vezes Rafael");
    expect(i.texto).toBe("Sugestão: Casal · Casa (às vezes Rafael)");
  });

  it("dados que não são um objeto não quebram: sem sugestão", () => {
    for (const dados of [null, "texto", 3, [], undefined]) {
      expect(itemUnico(linha({ revisao_motivo: "sugestao", revisao_dados: dados })).variante).toBe("sem_sugestao");
    }
  });

  it("sem_classificacao ignora revisao_dados", () => {
    const i = itemUnico(
      linha({ revisao_dados: { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] } }),
    );
    expect(i.variante).toBe("sem_sugestao");
  });

  it("linhas antigas (backfill): sem_classificacao, 'Sem sugestão'", () => {
    const i = itemUnico(linha({ mes: "2026-10", revisao_motivo: "sem_classificacao", revisao_dados: null }));
    expect(i).toMatchObject({ texto: "Sem sugestão", confirmavel: false });
  });
});

describe("montarFila: Ajustes, grupos e ordem", () => {
  it("o Ajuste da mãe vai sob ela (junto) e nunca é item nem conta", () => {
    const mae = linha({
      nome: "MSC CRUZEIROS",
      revisao_motivo: "sugestao",
      revisao_dados: { responsavel_id: CASAL, tipo_id: CASA, outros_responsaveis: [] },
    });
    const ajuste = linha({ nome: "MSC CRUZEIROS", ajuste_de_id: mae.id, valor_centavos: -8, revisao_motivo: null });
    const excluido = linha({ ajuste_de_id: mae.id, valor_centavos: -3, revisao_motivo: null, excluido_em: "x" });
    const grupos = montarFila([mae, ajuste, excluido], cadastros);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens).toHaveLength(1);
    expect(grupos[0].itens[0].ajustes).toEqual([{ id: ajuste.id, valorCentavos: -8 }]);
    expect(contarFila([mae, ajuste, excluido])).toBe(1);
  });

  it("Ajuste desvinculado sem classificação é item comum 'Sem sugestão'", () => {
    const solto = linha({ nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: null });
    const i = itemUnico(solto);
    expect(i).toMatchObject({ texto: "Sem sugestão", valorCentavos: -8, ajustes: [] });
  });

  it("agrupa por normalizarNome; 2+ itens ganham título, 1 não", () => {
    const a = linha({ nome: "Shopee Loja" });
    const b = linha({ nome: "SHOPEE  LOJA" });
    const c = linha({ nome: "OUTRA" });
    const grupos = montarFila([a, c, b], cadastros);
    expect(grupos.map((g) => g.chave)).toEqual(["SHOPEE LOJA", "OUTRA"]);
    expect(grupos[0].titulo).toBe("Shopee Loja · 2 lançamentos");
    expect(grupos[0].itens.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(grupos[1].titulo).toBeNull();
  });

  it("o Apelido aparece como nome do item, o Nome fica como original e agrupa pelo Nome", () => {
    const a = linha({ nome: "MAGALU", apelido: "Lava e seca" });
    const b = linha({ nome: "MAGALU" });
    const [g] = montarFila([a, b], cadastros);
    expect(g.itens.map((i) => i.nome)).toEqual(["Lava e seca", "MAGALU"]);
    expect(g.itens[0].nomeOriginal).toBe("MAGALU");
  });

  it("ordem: Mês mais antigo primeiro, depois a ordem da Fatura", () => {
    const nov = linha({ nome: "A", mes: "2026-11", ordem_fatura: 1 });
    const out2 = linha({ nome: "B", mes: "2026-10", ordem_fatura: 2 });
    const out1 = linha({ nome: "C", mes: "2026-10", ordem_fatura: 1 });
    const semOrdem = linha({ nome: "D", mes: "2026-10", ordem_fatura: null });
    const ids = montarFila([nov, semOrdem, out2, out1], cadastros).flatMap((g) => g.itens.map((i) => i.id));
    expect(ids).toEqual([out1.id, out2.id, semOrdem.id, nov.id]);
  });

  it("resumo: Meses da fila e se há mais de um", () => {
    const um = resumoDaFila(montarFila([linha(), linha()], cadastros));
    expect(um).toEqual({ faltam: 2, meses: ["2026-11"], variosMeses: false });
    const dois = resumoDaFila(montarFila([linha({ mes: "2026-11" }), linha({ mes: "2026-10" })], cadastros));
    expect(dois).toEqual({ faltam: 2, meses: ["2026-10", "2026-11"], variosMeses: true });
    expect(resumoDaFila([])).toEqual({ faltam: 0, meses: [], variosMeses: false });
  });
});

describe("resumoDaImportacao", () => {
  it("conta as mães da Fatura, sem Ajustes nem excluídas; classificados é o resto", () => {
    const l = (extra: object) => ({ fatura_id: "f1", ajuste_de_id: null, excluido_em: null, ...extra });
    const resumo = resumoDaImportacao(
      [l({}), l({}), l({}), l({ ajuste_de_id: "x" }), l({ excluido_em: "x" }), l({ fatura_id: null }), l({ fatura_id: "f2" })],
      "f1",
      1,
    );
    expect(resumo).toEqual({ lancamentos: 3, classificados: 2, paraRevisar: 1 });
  });

  it("classificados nunca fica negativo", () => {
    expect(resumoDaImportacao([], "f1", 4)).toEqual({ lancamentos: 0, classificados: 0, paraRevisar: 4 });
  });
});

describe("variantes do casamento (História 3.6)", () => {
  it("'Valor mudou': mostra Antes → agora e o ✓ mantém a classificação da linha", () => {
    const item = itemUnico(
      linha({
        revisao_motivo: "valor_mudou",
        revisao_dados: { antes_centavos: 44589 },
        valor_centavos: 44910,
        responsavel_id: CASAL,
        tipo_id: CASA,
        fatura_id: "f1",
      }),
    );
    expect(item).toMatchObject({
      variante: "valor_mudou",
      texto: "Antes R$\u00a0445,89 → agora R$\u00a0449,10",
      sugestao: "Casal · Casa",
      confirmavel: true,
      aoConfirmar: { responsavel_id: CASAL, tipo_id: CASA },
      valorAntesCentavos: 44589,
      daFatura: true,
      selecionavel: true,
    });
  });

  it("'Valor mudou' com cadastro arquivado ou incompleto: sem ✓, só 'Mudar'", () => {
    const arquivado = itemUnico(
      linha({ revisao_motivo: "valor_mudou", revisao_dados: { antes_centavos: 1 }, responsavel_id: LUCAS, tipo_id: CASA }),
    );
    expect(arquivado.confirmavel).toBe(false);
    expect(arquivado.aoConfirmar).toBeNull();
  });

  it("'Valor mudou' com revisao_dados inválido ainda aparece, sem o antes", () => {
    const item = itemUnico(linha({ revisao_motivo: "valor_mudou", revisao_dados: "x", responsavel_id: CASAL, tipo_id: CASA }));
    expect(item.valorAntesCentavos).toBeNull();
    expect(item.texto).toContain("agora");
  });

  it("'Não veio na fatura': sem ✓, fora do lote e fora da faixa da Fatura", () => {
    const item = itemUnico(linha({ revisao_motivo: "nao_veio_na_fatura", fatura_id: null, responsavel_id: CASAL, tipo_id: CASA }));
    expect(item).toMatchObject({
      variante: "nao_veio",
      texto: "Não veio na fatura",
      confirmavel: false,
      aoConfirmar: null,
      selecionavel: false,
      daFatura: false,
    });
  });

  it("os dois motivos novos entram na fila e no contador como os outros", () => {
    const linhas = [
      linha({ revisao_motivo: "valor_mudou" }),
      linha({ revisao_motivo: "nao_veio_na_fatura" }),
      linha({ revisao_motivo: "nao_veio_na_fatura", excluido_em: "2026-12-02T10:00:00Z" }),
    ];
    expect(contarFila(linhas)).toBe(2);
    expect(linhas.map(ehDaFila)).toEqual([true, true, false]);
  });
});

describe("resumoDaClassificacao (passo final da importação)", () => {
  it("conta as linhas com e sem motivo e deixa os Ajustes de fora", () => {
    const l = (ajuste_de_ordem: number | null, revisao_motivo: "sugestao" | null) => ({ ajuste_de_ordem, revisao_motivo });
    expect(resumoDaClassificacao([l(null, null), l(null, null), l(null, "sugestao"), l(1, null)])).toEqual({
      classificados: 2,
      paraRevisar: 1,
      casados: 0,
      naoVieram: 0,
    });
    expect(resumoDaClassificacao([])).toEqual({ classificados: 0, paraRevisar: 0, casados: 0, naoVieram: 0 });
  });

  it("conta os previstos que casaram e os que não vieram (História 3.6)", () => {
    const l = (revisao_motivo: "valor_mudou" | null, previsto_id: string | null) => ({
      ajuste_de_ordem: null,
      revisao_motivo,
      previsto_id,
    });
    expect(resumoDaClassificacao([l(null, "p1"), l("valor_mudou", "p2"), l(null, null)], 2)).toEqual({
      classificados: 2,
      paraRevisar: 1,
      casados: 2,
      naoVieram: 2,
    });
  });
});

describe("ordenarPorUso", () => {
  const itens = [
    { id: "a", arquivado: false },
    { id: "b", arquivado: false },
    { id: "c", arquivado: false },
    { id: "d", arquivado: true },
  ];

  it("mais usados primeiro; empate na ordem do cadastro; arquivado fora", () => {
    const usos = new Map([
      ["a", 1],
      ["b", 5],
      ["c", 1],
      ["d", 99],
    ]);
    expect(ordenarPorUso(itens, usos).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("sem contagem (falhou): a ordem do cadastro", () => {
    expect(ordenarPorUso(itens, null).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("item sem uso conta 0", () => {
    expect(ordenarPorUso(itens, new Map([["c", 2]])).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

// Ajuste da 3.2/3.3 na 3.4: a Fatura repete Nome, Valor e Parcela, e o Nome aparece em
// Meses diferentes; o item mostra a data, "k de n" e o título lista os Meses.
describe("fila: data, compras repetidas e Meses no título (História 3.4)", () => {
  it("o item traz a data da compra", () => {
    expect(itemUnico(linha({ data: "2026-10-01" })).data).toBe("2026-10-01");
    expect(itemUnico(linha()).data).toBeNull();
  });

  it("3 compras iguais na mesma Fatura: '1 de 3' a '3 de 3' na ordem da Fatura; datas ou valores diferentes não contam", () => {
    const base = { nome: "SHOPEE X", mes: "2026-10", valor_centavos: 5990, data: "2026-10-01" };
    const linhas = [
      linha({ ...base, ordem_fatura: 12 }),
      linha({ ...base, ordem_fatura: 14 }),
      linha({ ...base, ordem_fatura: 13 }),
      linha({ ...base, data: "2026-10-02", ordem_fatura: 15 }),
      linha({ ...base, valor_centavos: 100, ordem_fatura: 16 }),
    ];
    const itens = montarFila(linhas, cadastros)[0].itens;
    expect(itens.map((i) => i.repeticao)).toEqual([
      { posicao: 1, total: 3 },
      { posicao: 2, total: 3 },
      { posicao: 3, total: 3 },
      null,
      null,
    ]);
    // A ordem é a da Fatura: o 2º é a linha de ordem 13.
    expect(itens[1].id).toBe(linhas[2].id);
  });

  it("o mesmo Nome em dois Meses é um grupo com os dois Meses no título; um Mês só não lista Mês", () => {
    const doisMeses = montarFila(
      [linha({ nome: "SPOTIFY", mes: "2026-10", ordem_fatura: 1 }), linha({ nome: "SPOTIFY", mes: "2026-11", ordem_fatura: 1 })],
      cadastros,
    );
    expect(doisMeses).toHaveLength(1);
    expect(doisMeses[0].titulo).toBe("SPOTIFY · 2 lançamentos · Out/26 e Nov/26");
    const umMes = montarFila(
      [linha({ nome: "SPOTIFY", ordem_fatura: 1 }), linha({ nome: "SPOTIFY", ordem_fatura: 2 })],
      cadastros,
    );
    expect(umMes[0].titulo).toBe("SPOTIFY · 2 lançamentos");
  });

  it("cada item do Revisar existe no Painel do mesmo Mês, com o mesmo id (e só as não classificadas)", () => {
    const todas: LinhaDaFila[] = [
      // out/26: compras repetidas, uma já classificada, uma excluída e um Ajuste
      linha({ id: "o1", nome: "SHOPEE X", mes: "2026-10", data: "2026-10-01", ordem_fatura: 1 }),
      linha({ id: "o2", nome: "SHOPEE X", mes: "2026-10", data: "2026-10-01", ordem_fatura: 2 }),
      linha({ id: "o3", nome: "SPOTIFY", mes: "2026-10", ordem_fatura: 3, revisao_motivo: null, responsavel_id: CASAL, tipo_id: CASA }),
      linha({ id: "o4", nome: "AMAZON", mes: "2026-10", ordem_fatura: 4, excluido_em: "2026-11-02T00:00:00Z" }),
      // nov/26: o Nome de out/26 de novo, mais um Ajuste de mãe na fila
      linha({ id: "n1", nome: "SPOTIFY", mes: "2026-11", data: "2026-11-05", ordem_fatura: 1 }),
      linha({ id: "n2", nome: "SHOPEE X", mes: "2026-11", ordem_fatura: 2 }),
      linha({ id: "n3", nome: "FARMACIA", mes: "2026-11", ordem_fatura: 3 }),
      linha({ id: "n3a", nome: "FARMACIA", mes: "2026-11", ordem_fatura: 4, ajuste_de_id: "n3", revisao_motivo: null }),
    ];
    const itens = montarFila(todas, cadastros).flatMap((g) => g.itens);
    expect(itens.map((i) => i.id).sort()).toEqual(["n1", "n2", "n3", "o1", "o2"]);
    for (const item of itens) {
      const painel = linhasDoMes(todas, item.mes);
      const naTela = painel.find((l) => l.id === item.id);
      expect(naTela, `${item.id} falta no Painel de ${item.mes}`).toBeDefined();
      // A mesma linha: o item é a visão não classificada dela.
      expect(naTela?.nome).toBe(item.nomeOriginal);
      expect(naTela?.valor_centavos).toBe(item.valorCentavos);
      expect(ehDaFila(naTela!)).toBe(true);
    }
    // O Ajuste aparece sob a mãe no item, e também está no Painel do Mês.
    expect(itens.find((i) => i.id === "n3")?.ajustes.map((a) => a.id)).toEqual(["n3a"]);
    expect(linhasDoMes(todas, "2026-11").some((l) => l.id === "n3a")).toBe(true);
    // O Painel nunca mostra a excluída.
    expect(linhasDoMes(todas, "2026-10").map((l) => l.id)).toEqual(["o1", "o2", "o3"]);
  });
});
