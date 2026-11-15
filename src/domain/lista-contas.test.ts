import { describe, expect, it } from "vitest";
import { parcelasDaConta } from "./contas-manuais";
import {
  FILTRO_PADRAO_DE_CONTAS,
  contagemPorFiltro,
  filtroQueMostra,
  linhaDaConta,
  linhasDaLista,
  ordenarContas,
  situacaoDaConta,
  ultimoMesDaConta,
  type CadastrosDaLista,
  type ContaDaLista,
} from "./lista-contas";
import { rotuloFiltroDeContas, rotuloResultadoDaLista } from "./mensagens";

// A lista de Contas manuais (História 5.2): situação, filtro, ordem e a linha.
// O Mês atual dos exemplos é nov/2026 (o mesmo do mockup e da 5.1).

const MES = "2026-11";

/** O formatador usa espaço sem quebra entre "R$" e o valor. */
const sem = (t: string | null) => (t ?? "").replace(/ /g, " ");

const RAFAEL = "r-rafael";
const CASAL = "r-casal";
const MAE = "r-mae";
const LUCAS = "r-lucas";

const CADASTROS: CadastrosDaLista = {
  responsaveis: [
    { id: RAFAEL, nome: "Rafael", cor: 1, arquivado: false },
    { id: CASAL, nome: "Casal", cor: 2, arquivado: false },
    { id: MAE, nome: "Mãe", cor: 3, arquivado: false },
    { id: LUCAS, nome: "Lucas", cor: 4, arquivado: false },
  ],
  tipos: [
    { id: "t-saude", nome: "Saúde", arquivado: false },
    { id: "t-bobicas", nome: "Bobiças", arquivado: false },
    { id: "t-steams", nome: "Steams", arquivado: false },
    { id: "t-viagem", nome: "Viagem", arquivado: false },
  ],
};

let seq = 0;
function conta(extra: Partial<ContaDaLista> = {}): ContaDaLista {
  seq++;
  return {
    id: `c${seq}`,
    nome: `Conta ${seq}`,
    valor_centavos: 10_000,
    tipo_id: "t-saude",
    responsavel_id: RAFAEL,
    mes_inicial: "2026-01",
    repeticao: "mensal",
    parcela_total: null,
    divisao: null,
    encerrada_em_mes: null,
    created_at: `2026-11-${String(seq).padStart(2, "0")}T12:00:00+00:00`,
    ...extra,
  };
}

const umTerco = { modo: "valor", partes: [MAE, CASAL, LUCAS].map((id) => ({ responsavel_id: id, numerador: 1, denominador: 3 })) };

const silvia = conta({ id: "silvia", nome: "Silvia", valor_centavos: 40_000, tipo_id: "t-saude" });
const william = conta({
  id: "william",
  nome: "William",
  valor_centavos: 42_000,
  tipo_id: "t-bobicas",
  responsavel_id: CASAL,
  mes_inicial: "2026-03",
});
const tvbox = conta({ id: "tvbox", nome: "TVbox", valor_centavos: 3_000, tipo_id: "t-steams" });
const bombinhas = conta({
  id: "bombinhas",
  nome: "Bombinhas",
  valor_centavos: 31_800,
  tipo_id: "t-viagem",
  responsavel_id: null,
  mes_inicial: "2026-07",
  repeticao: "parcelas",
  parcela_total: 6,
  divisao: umTerco,
});

describe("situação da Conta (Ativa ou Encerrada, dado o Mês atual)", () => {
  it("mensal sem fim: Ativa, desde sempre", () => {
    expect(situacaoDaConta(silvia, MES)).toBe("ativa");
    expect(ultimoMesDaConta(silvia)).toBeNull();
  });

  it("encerrada_em_mes: a Conta vale até o Mês anterior, então no Mês de hoje já é Encerrada", () => {
    expect(situacaoDaConta(conta({ encerrada_em_mes: "2026-11" }), MES)).toBe("encerrada");
    expect(situacaoDaConta(conta({ encerrada_em_mes: "2026-10" }), MES)).toBe("encerrada");
    expect(situacaoDaConta(conta({ encerrada_em_mes: "2025-01" }), MES)).toBe("encerrada");
  });

  it("encerrada_em_mes no futuro: continua Ativa (ainda vale neste Mês); a descrição mostra o fim", () => {
    const c = conta({ encerrada_em_mes: "2026-12" });
    expect(situacaoDaConta(c, MES)).toBe("ativa");
    expect(ultimoMesDaConta(c)).toBe("2026-11");
    expect(linhaDaConta(c, CADASTROS, MES).descricao).toBe("Mensal · Jan/26 a Nov/26");
    // E vira Encerrada quando o Mês chega.
    expect(situacaoDaConta(c, "2026-12")).toBe("encerrada");
  });

  it("parcelada: a última parcela fecha a Conta (Mês de hoje ainda é Ativa)", () => {
    const base = { repeticao: "parcelas", mes_inicial: "2026-07" };
    expect(situacaoDaConta(conta({ ...base, parcela_total: 6 }), MES)).toBe("ativa"); // última: Dez/26
    expect(situacaoDaConta(conta({ ...base, parcela_total: 5 }), MES)).toBe("ativa"); // última: Nov/26 (hoje)
    expect(situacaoDaConta(conta({ ...base, parcela_total: 4 }), MES)).toBe("encerrada"); // última: Out/26
    expect(situacaoDaConta(conta({ ...base, parcela_total: 4 }), "2026-10")).toBe("ativa");
  });

  it("parcelada que ainda não começou: Ativa", () => {
    const c = conta({ repeticao: "parcelas", mes_inicial: "2027-03", parcela_total: 3 });
    expect(situacaoDaConta(c, MES)).toBe("ativa");
  });

  it("parcelada encerrada antes do fim vale até o Mês anterior ao encerramento", () => {
    const base = { repeticao: "parcelas", mes_inicial: "2026-07", parcela_total: 6 };
    expect(situacaoDaConta(conta({ ...base, encerrada_em_mes: "2026-11" }), MES)).toBe("encerrada");
    expect(situacaoDaConta(conta({ ...base, encerrada_em_mes: "2026-12" }), MES)).toBe("ativa");
    // Encerrada depois do fim das parcelas: vale o fim das parcelas.
    expect(ultimoMesDaConta(conta({ ...base, encerrada_em_mes: "2027-06" }))).toBe("2026-12");
  });

  it("encerrada antes de começar nunca vale: Encerrada, mesmo com o fim no futuro", () => {
    const c = conta({ mes_inicial: "2027-03", encerrada_em_mes: "2027-02" });
    expect(situacaoDaConta(c, MES)).toBe("encerrada");
  });

  it("Mês ilegível não derruba a lista: Ativa", () => {
    expect(situacaoDaConta(conta({ mes_inicial: "xx" }), MES)).toBe("ativa");
    expect(situacaoDaConta(silvia, "xx")).toBe("ativa");
    expect(situacaoDaConta(conta({ encerrada_em_mes: "lixo" }), MES)).toBe("ativa");
  });

  it("concorda com as parcelas que o materializador cria (AD-15): sem parcela daqui para a frente = Encerrada", () => {
    const casos = [
      conta({ encerrada_em_mes: "2026-11" }),
      conta({ encerrada_em_mes: "2026-12" }),
      conta({ repeticao: "parcelas", mes_inicial: "2026-07", parcela_total: 4 }),
      conta({ repeticao: "parcelas", mes_inicial: "2026-07", parcela_total: 5 }),
      conta({ repeticao: "parcelas", mes_inicial: "2026-07", parcela_total: 6, encerrada_em_mes: "2026-10" }),
      silvia,
    ];
    for (const c of casos) {
      const futuras = parcelasDaConta(
        { ...c, repeticao: c.repeticao as "mensal" | "parcelas" },
        "2027-11",
      ).filter((p) => p.mes >= MES);
      expect(situacaoDaConta(c, MES) === "ativa").toBe(futuras.length > 0);
    }
  });
});

describe("filtro Ativas / Encerradas / Todas", () => {
  const encerrada = conta({ id: "velha", nome: "Antiga", encerrada_em_mes: "2026-06" });
  const todas = [silvia, william, tvbox, bombinhas, encerrada];

  it("o filtro padrão é Ativas", () => {
    expect(FILTRO_PADRAO_DE_CONTAS).toBe("ativas");
  });

  it("cada filtro mostra o que deve, na ordem da lista", () => {
    const nomes = (f: "ativas" | "encerradas" | "todas") => linhasDaLista(todas, f, CADASTROS, MES).map((l) => l.nome);
    expect(nomes("ativas")).toEqual(["Bombinhas", "Silvia", "TVbox", "William"]);
    expect(nomes("encerradas")).toEqual(["Antiga"]);
    expect(nomes("todas")).toEqual(["Bombinhas", "Silvia", "TVbox", "William", "Antiga"]);
  });

  it("a contagem de cada filtro; sem Contas, tudo zero", () => {
    expect(contagemPorFiltro(todas, MES)).toEqual({ ativas: 4, encerradas: 1, todas: 5 });
    expect(contagemPorFiltro([], MES)).toEqual({ ativas: 0, encerradas: 0, todas: 0 });
    expect(contagemPorFiltro([silvia], MES)).toEqual({ ativas: 1, encerradas: 0, todas: 1 });
  });

  it("filtro sem resultado devolve lista vazia", () => {
    expect(linhasDaLista([silvia], "encerradas", CADASTROS, MES)).toEqual([]);
    expect(linhasDaLista([], "todas", CADASTROS, MES)).toEqual([]);
  });

  it("depois de salvar, o filtro passa a mostrar a Conta salva", () => {
    expect(filtroQueMostra("ativa", "ativas")).toBe("ativas");
    expect(filtroQueMostra("ativa", "todas")).toBe("todas");
    expect(filtroQueMostra("ativa", "encerradas")).toBe("ativas");
    expect(filtroQueMostra("encerrada", "ativas")).toBe("encerradas");
    expect(filtroQueMostra("encerrada", "todas")).toBe("todas");
  });

  it("os textos anunciados: contagem do filtro e do resultado", () => {
    expect(rotuloFiltroDeContas("Ativas", 4)).toBe("Ativas, 4 contas");
    expect(rotuloFiltroDeContas("Encerradas", 1)).toBe("Encerradas, 1 conta");
    expect(rotuloFiltroDeContas("Todas", 0)).toBe("Todas, 0 contas");
    expect(rotuloResultadoDaLista("ativas", 3)).toBe("3 contas ativas");
    expect(rotuloResultadoDaLista("encerradas", 1)).toBe("1 conta encerrada");
    expect(rotuloResultadoDaLista("encerradas", 0)).toBe("Nenhuma conta encerrada");
    expect(rotuloResultadoDaLista("ativas", 0)).toBe("Nenhuma conta ativa");
    expect(rotuloResultadoDaLista("todas", 5)).toBe("5 contas");
    expect(rotuloResultadoDaLista("todas", 0)).toBe("Nenhuma conta manual");
  });
});

describe("ordem da lista", () => {
  it("Ativas antes das Encerradas; em cada grupo, por Nome sem distinguir caixa nem acento", () => {
    const a = conta({ nome: "zeca" });
    const b = conta({ nome: "Álvaro" });
    const c = conta({ nome: "Ana", encerrada_em_mes: "2026-01" });
    const d = conta({ nome: "bia" });
    expect(ordenarContas([a, b, c, d], MES).map((x) => x.nome)).toEqual(["Álvaro", "bia", "zeca", "Ana"]);
  });

  it("números dentro do nome em ordem natural; empate pelo cadastro mais antigo, depois pelo id", () => {
    const dez = conta({ nome: "Conta 10" });
    const dois = conta({ nome: "Conta 2" });
    expect(ordenarContas([dez, dois], MES).map((x) => x.nome)).toEqual(["Conta 2", "Conta 10"]);
    const x1 = conta({ id: "b", nome: "Igual", created_at: "2026-11-02T00:00:00+00:00" });
    const x2 = conta({ id: "a", nome: "Igual", created_at: "2026-11-01T00:00:00+00:00" });
    const x3 = conta({ id: "c", nome: "Igual", created_at: "2026-11-01T00:00:00+00:00" });
    expect(ordenarContas([x1, x3, x2], MES).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("não muda a lista de entrada", () => {
    const entrada = [conta({ nome: "B" }), conta({ nome: "A" })];
    const copia = [...entrada];
    ordenarContas(entrada, MES);
    expect(entrada).toEqual(copia);
  });
});

describe("a linha da lista (como no mockup)", () => {
  it("Silvia: Mensal · desde Jan/26, R$ 400,00, Rafael, Saúde, Ativa", () => {
    expect(linhaDaConta(silvia, CADASTROS, MES)).toEqual({
      id: "silvia",
      nome: "Silvia",
      descricao: "Mensal · desde Jan/26",
      divisao: null,
      valorCentavos: 40_000,
      legendaDoValor: null,
      etiquetas: [{ texto: "Rafael", cor: 1, arquivado: false, removido: false }],
      tipo: { texto: "Saúde", arquivado: false, removido: false },
      situacao: "ativa",
      rotuloDaSituacao: "Ativa",
    });
  });

  it("William e TVbox: Casal e Rafael, cada um com o seu Tipo", () => {
    const w = linhaDaConta(william, CADASTROS, MES);
    expect(w).toMatchObject({ descricao: "Mensal · desde Mar/26", valorCentavos: 42_000, tipo: { texto: "Bobiças" } });
    expect(w.etiquetas.map((e) => e.texto)).toEqual(["Casal"]);
    const t = linhaDaConta(tvbox, CADASTROS, MES);
    expect(t).toMatchObject({ descricao: "Mensal · desde Jan/26", valorCentavos: 3_000, tipo: { texto: "Steams" } });
  });

  it("Bombinhas: 6 parcelas, R$ 318,00 por parcela, três etiquetas e '3 partes de R$ 106,00'", () => {
    expect(linhaDaConta(bombinhas, CADASTROS, MES)).toMatchObject({
      descricao: "6 parcelas · Jul/26 a Dez/26",
      divisao: expect.stringMatching(/^3 partes de R\$\s106,00$/),
      valorCentavos: 31_800,
      legendaDoValor: "por parcela",
      etiquetas: [
        { texto: "Mãe", cor: 3 },
        { texto: "Casal", cor: 2 },
        { texto: "Lucas", cor: 4 },
      ],
      tipo: { texto: "Viagem" },
      situacao: "ativa",
      rotuloDaSituacao: "Ativa",
    });
  });

  it("partes de valores diferentes: lista os valores, na ordem das etiquetas", () => {
    const desigual = {
      modo: "valor",
      partes: [
        { responsavel_id: MAE, numerador: 100, denominador: 159 },
        { responsavel_id: CASAL, numerador: 59, denominador: 159 },
      ],
    };
    const l = linhaDaConta(conta({ valor_centavos: 31_800, responsavel_id: null, divisao: desigual }), CADASTROS, MES);
    expect(sem(l.divisao)).toBe("2 partes: R$ 200,00 · R$ 118,00");
    expect(l.etiquetas.map((e) => e.texto)).toEqual(["Mãe", "Casal"]);
  });

  it("o Valor da Divisão é a soma das partes: o Valor da Conta", () => {
    const l = linhaDaConta(bombinhas, CADASTROS, MES);
    expect(l.valorCentavos).toBe(3 * 10_600);
  });

  it("Responsável arquivado: o nome continua, com (arquivado), e a cor também (AD-16)", () => {
    const cad: CadastrosDaLista = {
      ...CADASTROS,
      responsaveis: CADASTROS.responsaveis.map((r) => (r.id === RAFAEL ? { ...r, arquivado: true } : r)),
    };
    expect(linhaDaConta(silvia, cad, MES).etiquetas).toEqual([
      { texto: "Rafael (arquivado)", cor: 1, arquivado: true, removido: false },
    ]);
  });

  it("Tipo arquivado: 'Saúde (arquivado)'", () => {
    const cad: CadastrosDaLista = { ...CADASTROS, tipos: CADASTROS.tipos.map((t) => (t.id === "t-saude" ? { ...t, arquivado: true } : t)) };
    expect(linhaDaConta(silvia, cad, MES).tipo).toEqual({ texto: "Saúde (arquivado)", arquivado: true, removido: false });
  });

  it("Responsável ou Tipo que não existe mais: 'Removido', sem cor", () => {
    const cad: CadastrosDaLista = { responsaveis: [], tipos: [] };
    const l = linhaDaConta(silvia, cad, MES);
    expect(l.etiquetas).toEqual([{ texto: "Removido", cor: null, arquivado: false, removido: true }]);
    expect(l.tipo).toEqual({ texto: "Removido", arquivado: false, removido: true });
  });

  it("Divisão que cita um Responsável que não existe mais: só essa parte fica 'Removido'", () => {
    const cad: CadastrosDaLista = { ...CADASTROS, responsaveis: CADASTROS.responsaveis.filter((r) => r.id !== LUCAS) };
    const l = linhaDaConta(bombinhas, cad, MES);
    expect(l.etiquetas.map((e) => e.texto)).toEqual(["Mãe", "Casal", "Removido"]);
    expect(l.etiquetas[2].cor).toBeNull();
    expect(sem(l.divisao)).toBe("3 partes de R$ 106,00");
  });

  it("Divisão ilegível: sem etiquetas e sem texto de partes; o resto da linha segue", () => {
    const l = linhaDaConta(conta({ responsavel_id: null, divisao: { lixo: true } }), CADASTROS, MES);
    expect(l.etiquetas).toEqual([]);
    expect(l.divisao).toBeNull();
    expect(l.valorCentavos).toBe(10_000);
  });

  it("Conta sem Responsável nem Divisão: sem etiquetas", () => {
    expect(linhaDaConta(conta({ responsavel_id: null }), CADASTROS, MES).etiquetas).toEqual([]);
  });

  it("Conta encerrada: descrição com o fim, situação Encerrada", () => {
    const l = linhaDaConta(conta({ encerrada_em_mes: "2026-10" }), CADASTROS, MES);
    expect(l).toMatchObject({ descricao: "Mensal · Jan/26 a Set/26", situacao: "encerrada", rotuloDaSituacao: "Encerrada" });
  });

  it("repetição desconhecida lê como mensal; nunca lança", () => {
    expect(() => linhaDaConta(conta({ repeticao: "outra" }), CADASTROS, MES)).not.toThrow();
  });
});
