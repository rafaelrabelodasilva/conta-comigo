import { describe, expect, it } from "vitest";
import { ESPACO } from "./dinheiro";
import { unidadesDoMes } from "./divisao";
import { MODELO_VAZIO, gerarMensagem, prontidaoDoModelo, type ModeloMensagem } from "./modelo-mensagem";
import { rotuloItensDeFora, TEXTOS_GERAR } from "./mensagens";
import { linhasDoMes } from "./painel";
import {
  avisoDosItensDeFora,
  podeIncluirPrevistos,
  projetarMensagem,
  type LancamentoParaMensagem,
  type OpcoesDaMensagem,
} from "./projecoes";
import { resumoDaSelecao } from "./selecao";

// Testes de aceite da História 4.6 (FR-24): a mensagem da Mãe de outubro/2026 na
// forma 1 do EXPERIENCE.md, com total R$ 1.350,14, sobre um Mês montado à mão (sem
// dado pessoal). O dinheiro tem espaço inseparável; `e` põe nos textos escritos à mão.

const e = (texto: string) => texto.replaceAll("R$ ", `R$${ESPACO}`).replaceAll("- R$", `-${ESPACO}R$`);

const MES = "2026-10";
const PAGOS = new Set(["pago"]);

const MODELO: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "rafaelrabelodasilva@outlook.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

let contador = 0;
function l(extra: Partial<LancamentoParaMensagem> & { nome: string; valor_centavos: number }): LancamentoParaMensagem {
  contador += 1;
  return {
    id: `l${contador}`,
    mes: MES,
    excluido_em: null,
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    status_id: null,
    lancado_por: "fatura",
    ordem_fatura: contador,
    responsavel_id: "mae",
    tipo_id: "casa",
    ...extra,
  };
}

const OPCOES: OpcoesDaMensagem = { mes: MES, statusPagos: PAGOS, temFatura: true, incluirPrevistos: false, hoje: "2026-11-10" };
const ids = (...linhas: LancamentoParaMensagem[]) => new Set(linhas.map((x) => x.id));
const gerar = (selecao: ReadonlySet<string>, lancamentos: LancamentoParaMensagem[], opcoes: Partial<OpcoesDaMensagem> = {}, modelo = MODELO) =>
  gerarMensagem(modelo, projetarMensagem(selecao, lancamentos, { ...OPCOES, ...opcoes }));

// O Mês: a Mãe (R$ 1.350,14 em 5 itens, com um estorno e uma parte de Divisão) e
// o que fica de fora ou de outra pessoa.
const celular = l({ nome: "CELULAR SAMSUNG", apelido: "Celular da mãe", parcela_n: 5, parcela_total: 10, valor_centavos: 57750 });
const monjaroMae = l({ id: "monjaro", nome: "MONJARO", parcela_n: 3, parcela_total: 3, valor_centavos: 46600, divisao: { modo: "proporcao", partes: [] }, responsavel_id: null });
const monjaroParte = l({ nome: "MONJARO", parcela_n: 3, parcela_total: 3, valor_centavos: 31067, dividido_de_id: "monjaro", ordem_fatura: monjaroMae.ordem_fatura });
const monjaroOutra = l({ nome: "MONJARO", parcela_n: 3, parcela_total: 3, valor_centavos: 15533, dividido_de_id: "monjaro", responsavel_id: "casal", ordem_fatura: monjaroMae.ordem_fatura });
const mercado = l({ nome: "MERCADO", valor_centavos: 15990 });
const farmacia = l({ nome: "FARMACIA", valor_centavos: 32797 });
const estorno = l({ nome: "ESTORNO LOJA", valor_centavos: -2590 });
const MAE = [celular, monjaroParte, mercado, farmacia, estorno];
const OUTROS = [
  monjaroMae,
  monjaroOutra,
  l({ nome: "ALUGUEL", valor_centavos: 80000, responsavel_id: "casal" }),
  l({ nome: "EXCLUIDO", valor_centavos: 9999, excluido_em: "2026-10-20T12:00:00Z" }),
  l({ nome: "NOVEMBRO", valor_centavos: 7777, mes: "2026-11" }),
];
const MES_TODO = [...MAE, ...OUTROS];

describe("a mensagem da Mãe de outubro (forma 1)", () => {
  const projecao = projetarMensagem(ids(...MAE), MES_TODO, OPCOES);
  const mensagem = gerarMensagem(MODELO, projecao);

  it("sai no formato do EXPERIENCE.md, com total R$ 1.350,14", () => {
    expect(mensagem).toEqual({
      estado: "pronta",
      totalCentavos: 135014,
      texto: e(
        [
          "Oi",
          "Esse mês deu R$ 1.350,14",
          "Pix rafaelrabelodasilva@outlook.com",
          "",
          "Detalhes:",
          "Celular da mãe | 05/10 | R$ 577,50",
          "MONJARO | 03/03 | R$ 310,67",
          "MERCADO | R$ 159,90",
          "FARMACIA | R$ 327,97",
          "ESTORNO LOJA | - R$ 25,90",
          "Total: R$ 1.350,14",
        ].join("\n"),
      ),
    });
  });

  it("uma Divisão entra pela parte da Mãe, nunca pela mãe dividida nem pela parte dos outros", () => {
    expect(projecao.entram.map((i) => i.id)).toContain(monjaroParte.id);
    expect(projecao.entram.map((i) => i.id)).not.toContain("monjaro");
    expect(projecao.entram.map((i) => i.id)).not.toContain(monjaroOutra.id);
  });

  it("o total é o da barra de Seleção (a mesma soma líquida)", () => {
    const visiveis = unidadesDoMes(linhasDoMes(MES_TODO, MES));
    expect(resumoDaSelecao(ids(...MAE), visiveis).totalCentavos).toBe(projecao.totalCentavos);
  });

  it("nada ficou de fora e o aviso é vazio", () => {
    expect(projecao.fora.quantidade).toBe(0);
    expect(avisoDosItensDeFora(projecao.fora)).toBe("");
  });

  it("a ordem é a da fatura, não a ordem em que as linhas foram marcadas nem a do array", () => {
    const embaralhado = [...MES_TODO].reverse();
    const p = projetarMensagem(new Set([estorno.id, celular.id, farmacia.id, mercado.id, monjaroParte.id]), embaralhado, OPCOES);
    expect(p.entram.map((i) => i.id)).toEqual([celular.id, monjaroParte.id, mercado.id, farmacia.id, estorno.id]);
  });

  it("sem ordem da fatura (conta manual), vai para o fim", () => {
    const manual = l({ nome: "BOMBINHAS", valor_centavos: 10600, ordem_fatura: null, lancado_por: "manual" });
    const p = projetarMensagem(ids(manual, mercado), [manual, mercado], OPCOES);
    expect(p.entram.map((i) => i.id)).toEqual([mercado.id, manual.id]);
  });
});

describe("estorno", () => {
  it("entra como linha negativa e reduz o total", () => {
    const m = gerar(ids(mercado, estorno), MES_TODO);
    expect(m).toMatchObject({ estado: "pronta", totalCentavos: 15990 - 2590 });
    expect(m.estado === "pronta" && m.texto).toContain(e("ESTORNO LOJA | - R$ 25,90"));
    expect(m.estado === "pronta" && m.texto).toContain(e("Esse mês deu R$ 134,00"));
  });

  it("só estorno: não há o que cobrar (total que não passa de zero)", () => {
    expect(gerar(ids(estorno), MES_TODO)).toEqual({ estado: "nada_a_cobrar" });
  });

  it("estorno que zera a conta: nada a cobrar", () => {
    const a = l({ nome: "A", valor_centavos: 2590 });
    const b = l({ nome: "B", valor_centavos: -2590 });
    expect(gerar(ids(a, b), [a, b])).toEqual({ estado: "nada_a_cobrar" });
  });
});

describe("Ajuste de centavos", () => {
  const msc = l({ nome: "MSC CRUZEIROS", parcela_n: 3, parcela_total: 10, valor_centavos: 114074 });
  const ajuste = l({ nome: "MSC CRUZEIROS", valor_centavos: -8, ajuste_de_id: msc.id, ordem_fatura: msc.ordem_fatura });
  const lancamentos = [msc, ajuste, mercado];

  it("entra em linha própria logo abaixo da parcela, começando com “↳ Ajuste”, e o total é o líquido", () => {
    const m = gerar(ids(msc, mercado), lancamentos);
    expect(m.estado).toBe("pronta");
    const texto = m.estado === "pronta" ? m.texto : "";
    expect(texto).toContain(e(["MERCADO | R$ 159,90", "MSC CRUZEIROS | 03/10 | R$ 1.140,74", "↳ Ajuste | - R$ 0,08", "Total: R$ 1.300,56"].join("\n")));
    expect(texto).toContain(e("Total: R$ 1.300,56"));
    expect(texto).toContain(e("Esse mês deu R$ 1.300,56"));
  });

  it("marcar também o Ajuste não conta duas vezes (ele segue a parcela)", () => {
    const m = gerar(ids(msc, ajuste), lancamentos);
    expect(m).toMatchObject({ estado: "pronta", totalCentavos: 114066 });
    expect(m.estado === "pronta" && m.texto.match(/↳ Ajuste/g)).toHaveLength(1);
  });

  it("um Ajuste de uma parcela que já está paga sai com ela (e não conta como item de fora)", () => {
    const pago = [{ ...msc, status_id: "pago" }, ajuste];
    const p = projetarMensagem(ids(msc, ajuste), pago, OPCOES);
    expect(p.entram).toHaveLength(0);
    expect(p.fora).toMatchObject({ quantidade: 1, porMotivo: { pago: 1 } });
  });

  it("sem a caixa Valor, a linha do Ajuste é só “↳ Ajuste”", () => {
    const modelo = { ...MODELO, campos: { nome: true, parcela: true, valor: false } };
    const m = gerar(ids(msc), lancamentos, {}, modelo);
    expect(m.estado === "pronta" && m.texto).toContain("MSC CRUZEIROS | 03/10\n↳ Ajuste\n");
  });

  it("um Ajuste marcado sem a parcela é um item como outro, como no total da barra", () => {
    const p = projetarMensagem(ids(ajuste), lancamentos, OPCOES);
    expect(p.entram.map((i) => i.id)).toEqual([ajuste.id]);
    expect(p.totalCentavos).toBe(-8);
  });
});

describe("o que não entra, com o motivo", () => {
  const pago = l({ nome: "PAGO", valor_centavos: 5000, status_id: "pago" });
  const zero = l({ nome: "ZERO", valor_centavos: 0 });
  const previsto = l({ nome: "PREVISTO", valor_centavos: 7000, lancado_por: "sistema" });
  const todos = [mercado, pago, zero, previsto];

  it("“2 itens não entram: 1 já pago, 1 de R$ 0,00”", () => {
    const p = projetarMensagem(ids(mercado, pago, zero), todos, OPCOES);
    expect(p.entram.map((i) => i.id)).toEqual([mercado.id]);
    expect(avisoDosItensDeFora(p.fora)).toBe(e("2 itens não entram: 1 já pago, 1 de R$ 0,00"));
  });

  it("previsto fica de fora num Mês com Fatura, mesmo com “Incluir previstos”", () => {
    const p = projetarMensagem(ids(mercado, previsto), todos, { ...OPCOES, incluirPrevistos: true, temFatura: true });
    expect(p.entram.map((i) => i.id)).toEqual([mercado.id]);
    expect(avisoDosItensDeFora(p.fora)).toBe("1 item não entra: 1 previsto");
  });

  it("previsto fica de fora num Mês sem Fatura até ligar “Incluir previstos”", () => {
    const sem = projetarMensagem(ids(mercado, previsto), todos, { ...OPCOES, temFatura: false });
    expect(sem.entram.map((i) => i.id)).toEqual([mercado.id]);
    const com = projetarMensagem(ids(mercado, previsto), todos, { ...OPCOES, temFatura: false, incluirPrevistos: true });
    expect(com.entram.map((i) => i.id)).toEqual([mercado.id, previsto.id]);
    expect(com.totalCentavos).toBe(15990 + 7000);
    expect(com.fora.quantidade).toBe(0);
  });

  it("“Incluir previstos” só existe num Mês sem Fatura", () => {
    expect(podeIncluirPrevistos(false)).toBe(true);
    expect(podeIncluirPrevistos(true)).toBe(false);
  });

  it("um previsto pago ou de R$ 0,00 ainda é “previsto” quando a chave está desligada; ligada, vale o resto", () => {
    const previstoPago = l({ nome: "PP", valor_centavos: 100, lancado_por: "sistema", status_id: "pago" });
    const desligada = projetarMensagem(ids(previstoPago), [previstoPago], { ...OPCOES, temFatura: false });
    expect(desligada.fora.porMotivo).toEqual({ pago: 0, zero: 0, previsto: 1, programada: 0 });
    const ligada = projetarMensagem(ids(previstoPago), [previstoPago], { ...OPCOES, temFatura: false, incluirPrevistos: true });
    expect(ligada.fora.porMotivo).toEqual({ pago: 1, zero: 0, previsto: 0, programada: 0 });
  });

  it("sem Status vale “não pago” (AD-10): entra", () => {
    expect(projetarMensagem(ids(mercado), [mercado], OPCOES).entram).toHaveLength(1);
  });

  it("sem itens de Pagamento, um Lançamento entra com o valor cheio (qualquer Status não pago)", () => {
    const parcial = l({ nome: "PARCIAL", valor_centavos: 20000, status_id: "parcial" });
    const p = projetarMensagem(ids(parcial), [parcial], OPCOES);
    expect(p.entram[0]).toMatchObject({ valor_centavos: 20000, pago_centavos: 0, liquido_centavos: 20000 });
  });

  it("“Pago parcialmente” (0 < Σ itens < valor): entra só com o que falta (AD-10), e a mensagem diz o restante", () => {
    const parcial = l({ nome: "PARCIAL", valor_centavos: 21516, status_id: null });
    const itens = [{ lancamento_id: parcial.id, valor_centavos: 10000 }];
    const p = projetarMensagem(ids(parcial), [parcial], { ...OPCOES, itens });
    expect(p.entram[0]).toMatchObject({ valor_centavos: 11516, pago_centavos: 10000, liquido_centavos: 11516 });
    expect(p.totalCentavos).toBe(11516);
    expect(p.abatidos).toEqual([{ id: parcial.id, centavos: 10000 }]);
    const texto = gerar(ids(parcial), [parcial], { itens });
    expect(texto.estado === "pronta" && texto.texto).toContain(e("R$ 115,16"));
    expect(texto.estado === "pronta" && texto.texto).not.toContain(e("R$ 215,16"));
  });

  it("os itens de um Pagamento desfeito não contam: a linha entra cheia", () => {
    const parcial = l({ nome: "PARCIAL", valor_centavos: 21516 });
    const itens = [{ lancamento_id: parcial.id, valor_centavos: 10000, excluido_em: "2026-11-10T00:00:00Z" }];
    expect(projetarMensagem(ids(parcial), [parcial], { ...OPCOES, itens }).entram[0].valor_centavos).toBe(21516);
  });

  it("itens que já cobrem o valor todo com Status ainda não pago: já pago, não entra", () => {
    const quitada = l({ nome: "QUITADA", valor_centavos: 5000 });
    const itens = [{ lancamento_id: quitada.id, valor_centavos: 5000 }];
    const p = projetarMensagem(ids(quitada), [quitada], { ...OPCOES, itens });
    expect(p.entram).toHaveLength(0);
    expect(p.fora.porMotivo).toEqual({ pago: 1, zero: 0, previsto: 0, programada: 0 });
    expect(p.idsPagos).toEqual([quitada.id]);
  });

  it("o Ajuste da parcela parcialmente paga segue a parcela, e o restante do Ajuste também", () => {
    const parcela = l({ id: "pp", nome: "PARCELA", valor_centavos: 10000 });
    const ajuste = l({ nome: "AJUSTE", valor_centavos: 7, ajuste_de_id: "pp" });
    const itens = [
      { lancamento_id: parcela.id, valor_centavos: 4000 },
      { lancamento_id: ajuste.id, valor_centavos: 3 },
    ];
    const p = projetarMensagem(ids(parcela), [parcela, ajuste], { ...OPCOES, itens });
    expect(p.entram[0].ajustes).toEqual([{ id: ajuste.id, valor_centavos: 4 }]);
    expect(p.entram[0].valor_centavos).toBe(6000);
    expect(p.totalCentavos).toBe(6004);
  });

  it("um Pago parcialmente com Status pago por engano da linha (Status pago + itens): continua fora", () => {
    const paga = l({ nome: "PAGA", valor_centavos: 20000, status_id: "pago" });
    const itens = [{ lancamento_id: paga.id, valor_centavos: 5000 }];
    expect(projetarMensagem(ids(paga), [paga], { ...OPCOES, itens }).fora.porMotivo.pago).toBe(1);
  });

  it("os textos do aviso, no singular e no plural", () => {
    expect(rotuloItensDeFora(0, { pago: 0, zero: 0, previsto: 0, programada: 0 })).toBe("");
    expect(rotuloItensDeFora(1, { pago: 1, zero: 0, previsto: 0, programada: 0 })).toBe("1 item não entra: 1 já pago");
    expect(rotuloItensDeFora(5, { pago: 2, zero: 2, previsto: 1, programada: 0 })).toBe(
      `5 itens não entram: 2 já pagos, 2 de R$${ESPACO}0,00, 1 previsto`,
    );
    expect(rotuloItensDeFora(2, { pago: 0, zero: 0, previsto: 2, programada: 0 })).toBe("2 itens não entram: 2 previstos");
    expect(rotuloItensDeFora(1, { pago: 0, zero: 0, previsto: 0, programada: 1 })).toBe(
      "1 item não entra: 1 dívida programada ainda não vencida",
    );
    expect(rotuloItensDeFora(3, { pago: 1, zero: 0, previsto: 0, programada: 2 })).toBe(
      "3 itens não entram: 1 já pago, 2 dívidas programadas ainda não vencidas",
    );
  });
});

describe("Seleção que não é do Mês (não deve ocorrer)", () => {
  it("os ids de outro Mês, excluídos ou desconhecidos não entram nem viram item de fora", () => {
    const outroMes = OUTROS.find((x) => x.nome === "NOVEMBRO");
    const excluido = OUTROS.find((x) => x.nome === "EXCLUIDO");
    const selecao = new Set([mercado.id, outroMes?.id ?? "", excluido?.id ?? "", "fantasma"]);
    const p = projetarMensagem(selecao, MES_TODO, OPCOES);
    expect(p.entram.map((i) => i.id)).toEqual([mercado.id]);
    expect(p.fora.quantidade).toBe(0);
    expect(p.totalCentavos).toBe(15990);
  });
});

describe("nada a cobrar", () => {
  it("sem Seleção", () => {
    expect(gerar(new Set(), MES_TODO)).toEqual({ estado: "nada_a_cobrar" });
  });

  it("tudo de fora", () => {
    const pago = l({ nome: "PAGO", valor_centavos: 5000, status_id: "pago" });
    const p = projetarMensagem(ids(pago), [pago], OPCOES);
    expect(gerarMensagem(MODELO, p)).toEqual({ estado: "nada_a_cobrar" });
    expect(p.fora.quantidade).toBe(1);
  });

  it("vem antes do modelo: com a Seleção vazia e o modelo vazio, o que falta é cobrar", () => {
    expect(gerar(new Set(), MES_TODO, {}, MODELO_VAZIO)).toEqual({ estado: "nada_a_cobrar" });
  });
});

describe("o modelo para gerar", () => {
  it("modelo vazio e modelo sem nenhuma caixa não geram texto", () => {
    expect(gerar(ids(mercado), MES_TODO, {}, MODELO_VAZIO)).toEqual({ estado: "modelo_vazio" });
    const semCaixas = { ...MODELO, campos: { nome: false, parcela: false, valor: false } };
    expect(gerar(ids(mercado), MES_TODO, {}, semCaixas)).toEqual({ estado: "modelo_sem_campos" });
  });

  it("a prontidão do modelo", () => {
    expect(prontidaoDoModelo(MODELO_VAZIO)).toBe("vazio");
    expect(prontidaoDoModelo({ ...MODELO_VAZIO, saudacao: "Oi" })).toBe("sem_campos");
    expect(prontidaoDoModelo({ ...MODELO_VAZIO, campos: { nome: false, parcela: false, valor: true } })).toBe("pronto");
    expect(prontidaoDoModelo(MODELO)).toBe("pronto");
  });

  it("só a caixa Valor: a linha é só o valor; sem saudação e Pix, a mensagem começa na frase", () => {
    const modelo: ModeloMensagem = { ...MODELO_VAZIO, frase_total: "Deu {total}", campos: { nome: false, parcela: false, valor: true } };
    const m = gerar(ids(mercado), MES_TODO, {}, modelo);
    expect(m.estado === "pronta" && m.texto).toBe(e(["Deu R$ 159,90", "", "Detalhes:", "R$ 159,90", "Total: R$ 159,90"].join("\n")));
  });

  it("o nome é o Apelido quando a caixa Nome está marcada; senão o Nome", () => {
    const m = gerar(ids(celular), MES_TODO);
    expect(m.estado === "pronta" && m.texto).toContain("Celular da mãe | 05/10");
    expect(m.estado === "pronta" && m.texto).not.toContain("SAMSUNG");
  });

  it("os textos da mensagem vêm do mapa único", () => {
    expect(TEXTOS_GERAR.ajuste).toBe("↳ Ajuste");
  });
});
