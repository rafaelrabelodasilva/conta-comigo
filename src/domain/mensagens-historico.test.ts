import { describe, expect, it } from "vitest";
import {
  TEXTOS_HISTORICO,
  ehCodigoConhecido,
  juntarNomes,
  mensagem,
  rotuloDaLinhaDoHistorico,
  rotuloDoModoELancamentos,
  rotuloFicamPorPagamentoPosterior,
  rotuloFicamPorStatusMudado,
  rotuloMinhaParte,
  rotuloMudancaDeStatus,
  rotuloPagamentoDesfeito,
  rotuloQuitou,
  rotuloRecebido,
  rotuloResultadoDoHistorico,
  rotuloSaiDoHistorico,
  rotuloSoParciais,
  rotuloVoltamAoStatusAnterior,
  tituloDoPagamento,
} from "./mensagens";

// Os textos do Histórico de Pagamentos e do "Desfazer pagamento" (História 6.3). O dinheiro sai do
// formatador do núcleo, com espaço inseparável depois do "R$".
const sem = (t: string) => t.replace(/ /g, " ");

describe("textos do Histórico de Pagamentos", () => {
  it("o modo e a quantidade: o total não leva etiqueta", () => {
    expect(rotuloDoModoELancamentos("total", 7)).toBe("7 lançamentos");
    expect(rotuloDoModoELancamentos("total", 1)).toBe("1 lançamento");
    expect(rotuloDoModoELancamentos("parcial", 2)).toBe("parcial · 2 lançamentos");
    expect(rotuloDoModoELancamentos("minha_parte", 17)).toBe("minha parte · 17 lançamentos");
  });

  it("o nome acessível da linha da lista: data, quem, modo e quantidade, valor recebido", () => {
    expect(
      sem(
        rotuloDaLinhaDoHistorico({
          data: "2026-10-12",
          responsaveis: ["Casal", "Rangel"],
          modo: "minha_parte",
          quantidade: 17,
          valorRecebidoCentavos: 270612,
        }),
      ),
    ).toBe("12/10/26, Casal e Rangel, minha parte · 17 lançamentos, R$ 2.706,12 recebidos");
    expect(
      sem(rotuloDaLinhaDoHistorico({ data: "2026-10-08", responsaveis: [], modo: "total", quantidade: 1, valorRecebidoCentavos: 100 })),
    ).toBe("08/10/26, 1 lançamento, R$ 1,00 recebidos");
  });

  it("junta nomes: um, dois e três", () => {
    expect(juntarNomes([])).toBe("");
    expect(juntarNomes(["Mãe"])).toBe("Mãe");
    expect(juntarNomes(["Casal", "Rangel"])).toBe("Casal e Rangel");
    expect(juntarNomes(["A", "B", "C"])).toBe("A, B e C");
  });

  it("o detalhe: título, valores e a mudança de Status", () => {
    expect(tituloDoPagamento("2026-11-10")).toBe("Pagamento de 10/11/26");
    expect(sem(rotuloRecebido(281968))).toBe("Recebido: R$ 2.819,68");
    expect(sem(rotuloQuitou(563935))).toBe("Quitou: R$ 5.639,35");
    expect(sem(rotuloMinhaParte(281967))).toBe("A minha parte: R$ 2.819,67");
    expect(rotuloMudancaDeStatus("Em análise", "Pago")).toBe("Em análise → Pago");
    // Sem Status antes vale "não pago" (AD-10).
    expect(rotuloMudancaDeStatus(null, "Pago")).toBe("Não pago → Pago");
  });

  it("a confirmação diz o que muda, no singular e no plural", () => {
    expect(sem(rotuloSaiDoHistorico(281968, "2026-11-10"))).toBe("O valor recebido, R$ 2.819,68 de 10/11/26, sai do histórico.");
    expect(rotuloVoltamAoStatusAnterior(1)).toBe("1 lançamento volta ao status anterior.");
    expect(rotuloVoltamAoStatusAnterior(18)).toBe("18 lançamentos voltam ao status anterior.");
    expect(rotuloFicamPorStatusMudado(1)).toContain("1 lançamento fica como está");
    expect(rotuloFicamPorStatusMudado(3)).toContain("3 lançamentos ficam como estão");
    expect(rotuloFicamPorPagamentoPosterior(1)).toContain("outro pagamento mexeu nele depois");
    expect(rotuloFicamPorPagamentoPosterior(2)).toContain("outro pagamento mexeu neles depois");
    expect(rotuloSoParciais(1)).toContain("1 lançamento só recebeu parte do valor");
    expect(rotuloSoParciais(2)).toContain("2 lançamentos só receberam parte do valor");
  });

  it("o aviso depois de desfazer e a contagem lida ao filtrar", () => {
    expect(sem(rotuloPagamentoDesfeito(135014))).toBe("Pagamento de R$ 1.350,14 desfeito");
    expect(rotuloResultadoDoHistorico(1)).toBe("1 pagamento");
    expect(rotuloResultadoDoHistorico(3)).toBe("3 pagamentos");
  });

  it("o código novo do 'mudou' no desfazer está no mapa, e os de pagamento que a tela usa também", () => {
    for (const c of ["pagamento.mudou_desfazer", "pagamento.ja_desfeito", "pagamento.nao_encontrado", "carregar.falhou", "salvar.falhou"]) {
      expect(ehCodigoConhecido(c), c).toBe(true);
    }
    expect(mensagem("pagamento.mudou_desfazer")).toBe("Algum lançamento mudou em outro aparelho. Confira o que muda e confirme de novo.");
    expect(TEXTOS_HISTORICO.titulo).toBe("Histórico de Pagamentos");
  });
});
