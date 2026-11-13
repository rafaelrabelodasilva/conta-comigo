import { describe, expect, it } from "vitest";
import {
  abasDaPlanilha,
  chaveComparavel,
  lerAba,
  mesDaAba,
  planejarAba,
  planejarAbas,
  planejarCadastros,
  regrasIniciais,
  resolverCadastros,
  resumirImportacao,
  unidadesDaAba,
  type AbaLida,
  type CadastrosDoApp,
  type Celula,
  type EstadoDoApp,
} from "./importacao-planilha";
import { valoresDasPartes } from "./divisao";

const CABECALHO: Celula[] = ["Despesa", "Valor", "Parcela", "Observação ", "Tipo", "Resposabilidade", "Lançado por", "Status dívida"];

function aba(...linhas: Celula[][]): Celula[][] {
  return [CABECALHO, ...linhas];
}

function ler(...linhas: Celula[][]) {
  const r = lerAba(aba(...linhas));
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.erros)}`);
  return r.valor;
}

const APP_VAZIO: CadastrosDoApp = { responsaveis: [], tipos: [], status: [] };
const ESTADO: EstadoDoApp = { mesesComFatura: [], mesesComHistorico: [], linhas: [] };

/** Cadastros do app com ids "r:Nome", "t:Nome" e "s:Nome" para os testes lerem os planos. */
function cadastrosDe(responsaveis: string[], tipos: string[], status: string[] = []): CadastrosDoApp {
  return {
    responsaveis: responsaveis.map((nome) => ({ id: `r:${nome}`, nome, arquivado: false })),
    tipos: tipos.map((nome) => ({ id: `t:${nome}`, nome, arquivado: false })),
    status: status.map((nome) => ({ id: `s:${nome}`, nome, arquivado: false })),
  };
}

const TUDO = cadastrosDe(["Rafael", "Mãe", "Casal", "Lucas"], ["Mãe", "Saúde", "Casa", "Steams", "Presente", "Carro"], ["Pago", "Pendente"]);

describe("abas", () => {
  it("só `MM/AAAA` é um Mês; 01/2026 a 10/2026 vêm marcadas", () => {
    expect(mesDaAba("03/2026")).toBe("2026-03");
    expect(mesDaAba("Cópia de TBC 00/2026")).toBeNull();
    expect(mesDaAba("00/2026")).toBeNull();
    expect(mesDaAba("Página5")).toBeNull();
    const abas = abasDaPlanilha(["11/2026", "Página5", "10/2026", "12/2025", "01/2026", "Cópia de TBC 00/2026"]);
    expect(abas.map((a) => [a.nome, a.mes, a.marcada])).toEqual([
      ["12/2025", "2025-12", false],
      ["01/2026", "2026-01", true],
      ["10/2026", "2026-10", true],
      ["11/2026", "2026-11", false],
    ]);
  });
});

describe("lerAba", () => {
  it("lê Valor em texto brasileiro, crédito entre parênteses, Parcela e cadastros; ignora 'Selecionar' e 'Lançado por'", () => {
    const linhas = ler(
      ["MSC CRUZEIROS", "1.140,74", "01/12", "", "Viagem", "Casal", "Rafael"],
      ["EST ANUIDADE DIFERENCIADA T (CREDITO)", "(25,00)", "1/1", "", "", "", "Rafael"],
      ["EBN SPOTIFY", "40,90", "1/1", "", "Steams", "Selecionar", "Rafael", "Pago"],
      ["ANUIDADE DIFERENCIADA", "0,00", "09/12", "", "Steams", "Rafael", "Rafael"],
      ["", "", "", "", "Selecionar", "Selecionar", "Selecionar"],
    );
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toMatchObject({ despesa: "MSC CRUZEIROS", valor_centavos: 114074, parcela_n: 1, parcela_total: 12, tipo: "Viagem", responsavel: "Casal", status: null });
    expect(linhas[1]).toMatchObject({ valor_centavos: -2500, parcela_n: null, parcela_total: null, tipo: null, responsavel: null });
    expect(linhas[2]).toMatchObject({ responsavel: null, status: "Pago", parcela_n: null });
    expect(linhas[3].valor_centavos).toBe(0);
    expect(linhas.map((l) => l.linha)).toEqual([2, 3, 4, 5]);
  });

  it("aceita Valor numérico, o cabeçalho 'Responsabilidade' e ignora colunas além da H", () => {
    const r = lerAba([
      ["Despesa", "Valor", "Parcela", "Observação", "Tipo", "Responsabilidade", "Lançado por", "Status dívida", "", "Casal"],
      ["PANVEL FILIAL 385", 19.99, "1/1", null, "Saúde", "Casal", "Rafael", null, "", "Rangel"],
    ]);
    expect(r.ok && r.valor[0]).toMatchObject({ valor_centavos: 1999, tipo: "Saúde", responsavel: "Casal" });
  });

  it("aparar e colapsar espaços; letra minúscula marca o Nome como digitado à mão", () => {
    const linhas = ler([" AMAZON  BR", "10,00", "", "  teste  ", "Casa", "Rafael", "Rafael"], ["Silvia", "400,00", "", "", "Saúde", "Rafael", "Rafael"]);
    expect(linhas[0]).toMatchObject({ despesa: "AMAZON BR", observacao: "teste", digitado_a_mao: false });
    expect(linhas[1].digitado_a_mao).toBe(true);
  });

  it("uma linha inválida derruba a aba inteira e diz qual", () => {
    const r = lerAba(aba(["OK", "10,00", "1/1", "", "", "", ""], ["RUIM", "dez reais", "", "", "", "", ""], ["DATA", "5,00", new Date(2026, 1, 2), "", "", "", ""]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toEqual([
      { codigo: "planilha.valor_invalido", linha: 3 },
      { codigo: "planilha.parcela_invalida", linha: 4 },
    ]);
  });

  it("recusa parcela impossível e cabeçalho sem as colunas", () => {
    expect(lerAba(aba(["X", "1,00", "5/3", "", "", "", ""])).ok).toBe(false);
    expect(lerAba(aba(["X", "1,00", "1/1000", "", "", "", ""])).ok).toBe(false);
    const sem = lerAba([["Nome", "Valor"], ["X", "1,00"]]);
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.erro.codigo).toBe("planilha.cabecalho");
  });

  it("linha com Despesa e sem Valor (ou o contrário) é erro", () => {
    expect(lerAba(aba(["X", "", "", "", "", "", ""])).ok).toBe(false);
    expect(lerAba(aba(["", "1,00", "", "", "", "", ""])).ok).toBe(false);
  });
});

describe("Divisão (Monjaro)", () => {
  const monjaro = [
    ["JIM COM 57653822 BAR", "310,67", "03/03", "Monjaro", "Mãe", "Mãe", "Rafael"],
    ["JIM COM 57653822 BAR", "155,33", "03/03", "Monjaro", "Saúde", "Rafael", "Rafael"],
  ];

  it("duas linhas seguidas com mesmo Nome, Parcela e Observação e Responsáveis diferentes viram uma mãe", () => {
    const unidades = unidadesDaAba(ler(...monjaro));
    expect(unidades).toHaveLength(1);
    expect(unidades[0]).toMatchObject({ dividida: true, valor_centavos: 46600, parcela_n: 3, parcela_total: 3, tipo: "Mãe", responsavel: null });
  });

  it("créditos repetidos e compras iguais do mesmo Responsável não são Divisão", () => {
    const creditos = ler(
      ["EST ANUIDADE (CREDITO)", "(25,00)", "1/1", "", "", "", ""],
      ["EST ANUIDADE (CREDITO)", "(25,00)", "1/1", "", "", "", ""],
      ["APPLE COM/BILL", "19,90", "1/1", "Nota", "Steams", "Rafael", ""],
      ["APPLE COM/BILL", "19,90", "1/1", "Nota", "Steams", "Rafael", ""],
    );
    expect(unidadesDaAba(creditos).map((u) => u.dividida)).toEqual([false, false, false, false]);
  });

  it("sem Observação preenchida não é Divisão (duas compras iguais de Responsáveis diferentes ficam separadas)", () => {
    const duas = ler(["GRASSO FARMACIA", "37,90", "1/1", "", "Saúde", "Casal", ""], ["GRASSO FARMACIA", "46,43", "1/1", "", "Saúde", "Rafael", ""]);
    expect(unidadesDaAba(duas)).toHaveLength(2);
  });

  it("a mãe guarda a Divisão em frações dos valores e as filhas somam o Valor: R$ 466,00 = 310,67 + 155,33", () => {
    const abaLida: AbaLida = { nome: "10/2026", mes: "2026-10", linhas: ler(...monjaro) };
    const plano = planejarAba(abaLida, resolverCadastros(TUDO), ESTADO, new Set(["2026-10"]), new Set());
    const [mae] = plano.linhas;
    expect(mae).toMatchObject({ valor_centavos: 46600, responsavel_id: null, tipo_id: "t:Mãe", serie: { parcela_total: 3, valor_parcela_centavos: 46600 } });
    expect(mae.divisao?.partes.map((p) => [p.responsavel_id, p.numerador, p.denominador])).toEqual([
      ["r:Mãe", 31067, 46600],
      ["r:Rafael", 15533, 46600],
    ]);
    expect(mae.partes?.map((p) => [p.responsavel_id, p.valor_centavos])).toEqual([
      ["r:Mãe", 31067],
      ["r:Rafael", 15533],
    ]);
    const valores = valoresDasPartes(46600, mae.divisao!);
    expect(valores).toEqual({ ok: true, valor: [31067, 15533] });
    expect(plano.resumo.divisoes).toBe(1);
  });
});

describe("cadastros", () => {
  const linhas = ler(
    ["A", "1,00", "", "", "Casa", "Rafael", "", "Pago"],
    ["B", "1,00", "", "", "Lanches", "Rangel", "", "Pendente"],
    ["C", "1,00", "", "", "casa", "rafael", "", "pago"],
  );

  it("cria o que falta, casa sem acento nem maiúsculas e reativa o arquivado; 'Pago' conta como pago", () => {
    const app: CadastrosDoApp = {
      responsaveis: [{ id: "r1", nome: "Rafael", arquivado: false }, { id: "r2", nome: "Rangel", arquivado: true }],
      tipos: [{ id: "t1", nome: "CASA", arquivado: false }],
      status: [{ id: "s1", nome: "Pago", arquivado: false }],
    };
    const plano = planejarCadastros(linhas, app);
    expect(plano.criar).toEqual({ responsaveis: [], tipos: ["Lanches"], status: [{ nome: "Pendente", conta_como_pago: false }] });
    expect(plano.reativar).toEqual({ responsaveis: ["r2"], tipos: [], status: [] });
  });

  it("com o app vazio, cria um de cada nome (sem repetir) e o Status 'Pago' conta como pago", () => {
    const plano = planejarCadastros(linhas, APP_VAZIO);
    expect(plano.criar.responsaveis).toEqual(["Rafael", "Rangel"]);
    expect(plano.criar.tipos).toEqual(["Casa", "Lanches"]);
    expect(plano.criar.status).toEqual([{ nome: "Pago", conta_como_pago: true }, { nome: "Pendente", conta_como_pago: false }]);
  });
});

describe("planejar abas: Séries e previstos", () => {
  const resolver = resolverCadastros(TUDO);
  const abaMarco: AbaLida = {
    nome: "03/2026",
    mes: "2026-03",
    linhas: ler(
      ["OTICAS EXATA", "270,00", "03/10", "Óculos", "Mãe", "Mãe", "Rafael", "Pago"],
      ["Gi", "160,00", "03/06", "", "Saúde", "Rafael", "Rafael"],
      ["APPLE COM/BILL", "54,90", "1/1", "", "Steams", "Rafael", "Rafael"],
    ),
  };

  it("parcela de Nome de fatura ganha Série e previstos até N/N; Nome digitado à mão não ganha", () => {
    const [plano] = planejarAbas([abaMarco], resolver, ESTADO);
    expect(plano.linhas.map((l) => l.serie?.parcela_total ?? null)).toEqual([10, null, null]);
    expect(plano.linhas[0].serie).toMatchObject({ mes_primeira_parcela: "2026-01", ocorrencia: 1 });
    expect(plano.previstos.map((p) => [p.mes, p.parcela_n])).toEqual([
      ["2026-04", 4], ["2026-05", 5], ["2026-06", 6], ["2026-07", 7], ["2026-08", 8], ["2026-09", 9], ["2026-10", 10],
    ]);
    expect(plano.previstos[0]).toMatchObject({ ordem_origem: 1, responsavel_id: "r:Mãe", tipo_id: "t:Mãe", valor_centavos: 27000 });
    expect(plano.linhas[0].status_id).toBe("s:Pago");
  });

  it("previsto não cai em Mês de aba da mesma importação, com Fatura ou com histórico", () => {
    const maio: AbaLida = { nome: "05/2026", mes: "2026-05", linhas: ler(["OTICAS EXATA", "270,00", "05/10", "", "Mãe", "Mãe", ""]) };
    const planos = planejarAbas([abaMarco, maio], resolver, { ...ESTADO, mesesComFatura: ["2026-10"], mesesComHistorico: ["2026-07"] });
    // março: abril (sem aba nem Fatura) entra; maio é aba; julho já tem histórico; outubro tem Fatura.
    expect(planos[0].previstos.map((p) => p.mes)).toEqual(["2026-04", "2026-06", "2026-08", "2026-09"]);
    // maio: jun já foi criado por março (mesma parcela do mesmo Nome); só ago... também; nada novo.
    expect(planos[1].previstos).toEqual([]);
  });

  it("não cria o previsto que o app já tem, mesmo com o Nome escrito sem '*' (SHOPEE *X = SHOPEE X)", () => {
    const abaSetembro: AbaLida = { nome: "09/2026", mes: "2026-09", linhas: ler(["SHOPEE CELLSOLUTIONS", "523,66", "11/12", "", "Presente", "Rafael", ""]) };
    const app: EstadoDoApp = {
      mesesComFatura: ["2026-10", "2026-11"],
      mesesComHistorico: [],
      linhas: [{ nome: "SHOPEE *CELLSOLUTIONS", mes: "2026-12", parcela_n: 12, parcela_total: 12 }],
    };
    expect(chaveComparavel("SHOPEE *CELLSOLUTIONS")).toBe(chaveComparavel("SHOPEE CELLSOLUTIONS"));
    const [plano] = planejarAbas([abaSetembro], resolver, app);
    expect(plano.previstos).toEqual([]);
  });

  it("aba de Mês com Fatura não grava nada (só ensina Regras)", () => {
    const [plano] = planejarAbas([{ nome: "10/2026", mes: "2026-10", linhas: abaMarco.linhas }], resolver, { ...ESTADO, mesesComFatura: ["2026-10"] });
    expect(plano).toMatchObject({ soRegras: true, linhas: [], previstos: [] });
    expect(plano.resumo.lancamentos).toBe(0);
  });

  it("compras idênticas no mesmo Mês ganham `ocorrencia` 1 e 2 (duas Séries)", () => {
    const igual = ["OTICA QOCULOS", "153,60", "06/10", "", "Saúde", "Rafael", ""];
    const [plano] = planejarAbas([{ nome: "09/2026", mes: "2026-09", linhas: ler(igual, igual) }], resolver, ESTADO);
    expect(plano.linhas.map((l) => l.serie?.ocorrencia)).toEqual([1, 2]);
  });

  it("aba cujo Mês já tem histórico avisa que substitui", () => {
    const [plano] = planejarAbas([abaMarco], resolver, { ...ESTADO, mesesComHistorico: ["2026-03"] });
    expect(plano.substitui).toBe(true);
  });
});

describe("Regras iniciais", () => {
  const resolver = resolverCadastros(TUDO);

  it("uma Regra por chave da planilha: Responsável e Tipo mais frequentes; empate vale o mais recente", () => {
    const janeiro: AbaLida = { nome: "01/2026", mes: "2026-01", linhas: ler(["GRASSO FARMACIA LTDA", "10,00", "1/1", "", "Saúde", "Casal", ""]) };
    const fevereiro: AbaLida = {
      nome: "02/2026",
      mes: "2026-02",
      linhas: ler(
        ["GRASSO FARMACIA LTDA", "20,00", "1/1", "", "Saúde", "Rafael", ""],
        ["GRASSO FARMACIA LTDA", "30,00", "1/1", "", "Casa", "Rafael", ""],
      ),
    };
    const regras = regrasIniciais([fevereiro, janeiro], resolver, "2026-11-13T12:00:00.000Z");
    expect(regras).toHaveLength(1);
    expect(regras[0]).toMatchObject({ chave: "GRASSO FARMACIA LTDA", responsavel_id: "r:Rafael", tipo_id: "t:Saúde", ultimo_uso: "2026-11-13T12:00:00.000Z" });
    expect(regras[0].contagem).toEqual([{ responsavel_id: "r:Casal", n: 1 }, { responsavel_id: "r:Rafael", n: 2 }]);
  });

  it("no empate vale a ocorrência mais recente (Mês mais novo, linha mais abaixo)", () => {
    const velha: AbaLida = { nome: "01/2026", mes: "2026-01", linhas: ler(["PANVEL FARMACIAS", "10,00", "1/1", "", "Casa", "Casal", ""]) };
    const nova: AbaLida = { nome: "02/2026", mes: "2026-02", linhas: ler(["PANVEL FARMACIAS", "10,00", "1/1", "", "Saúde", "Rafael", ""]) };
    const [regra] = regrasIniciais([nova, velha], resolver, "agora");
    expect(regra).toMatchObject({ responsavel_id: "r:Rafael", tipo_id: "t:Saúde" });
  });

  it("a chave não tem '*', nome digitado à mão e crédito não ensinam, e a Divisão vem da última ocorrência", () => {
    const abaUnica: AbaLida = {
      nome: "10/2026",
      mes: "2026-10",
      linhas: ler(
        ["SHOPEE *CELLSOLUTIONS", "523,66", "12/12", "", "Presente", "Rafael", ""],
        ["Silvia", "400,00", "", "", "Saúde", "Rafael", ""],
        ["AMAZON MUSIC (CREDITO)", "(25,90)", "1/1", "", "Steams", "Rafael", ""],
        ["JIM COM 57653822 BAR", "310,67", "03/03", "Monjaro", "Mãe", "Mãe", ""],
        ["JIM COM 57653822 BAR", "155,33", "03/03", "Monjaro", "Saúde", "Rafael", ""],
      ),
    };
    const regras = regrasIniciais([abaUnica], resolver, "agora");
    expect(regras.map((r) => r.chave)).toEqual(["SHOPEE CELLSOLUTIONS", "JIM COM 57653822 BAR"]);
    const monjaro = regras[1];
    expect(monjaro).toMatchObject({ responsavel_id: null, tipo_id: "t:Mãe" });
    expect(monjaro.divisao?.partes).toHaveLength(2);
  });

  it("sem Responsável nem Tipo não cria Regra", () => {
    const vazia: AbaLida = { nome: "10/2026", mes: "2026-10", linhas: ler(["COISA SEM CLASSE", "5,00", "1/1", "", "", "", ""]) };
    expect(regrasIniciais([vazia], resolver, "agora")).toEqual([]);
  });
});

describe("resumo", () => {
  it("soma só as abas que deram certo e conta cadastros criados ou reativados", () => {
    const resumo = resumirImportacao(
      [
        { mes: "2026-01", nome: "01/2026", ok: true, lancamentos: 30 },
        { mes: "2026-02", nome: "02/2026", ok: false, lancamentos: 12, erro: "x" },
        { mes: "2026-03", nome: "03/2026", ok: true, lancamentos: 20 },
      ],
      { criar: { responsaveis: ["Lucas"], tipos: ["A", "B"], status: [] }, reativar: { responsaveis: ["r1"], tipos: [], status: [] } },
      7,
    );
    expect(resumo).toEqual({ lancamentos: 50, responsaveis: 2, tipos: 2, status: 0, regras: 7, abasComErro: ["02/2026"] });
  });
});
