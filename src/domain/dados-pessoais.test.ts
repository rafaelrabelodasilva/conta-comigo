import { describe, expect, it } from "vitest";
import { removerDadosPessoais } from "./dados-pessoais";

describe("removerDadosPessoais", () => {
  it("tira CPF, CEP e a linha de endereço; o cartão vira o final", () => {
    const texto = [
      "FULANO DE TAL CPF: 123.456.789-09",
      "RUA DAS FLORES, 123 APTO 45",
      "01234-567 SAO PAULO SP",
      "Cartão 4220 1234 5678 9012",
      "06/09 MSC CRUZEIROS 02/12 1.140,74",
    ].join("\n");
    const limpo = removerDadosPessoais(texto);
    expect(limpo).not.toContain("123.456.789-09");
    expect(limpo).not.toContain("RUA DAS FLORES");
    expect(limpo).not.toContain("01234-567");
    expect(limpo).not.toContain("SAO PAULO SP");
    expect(limpo).not.toContain("4220 1234 5678");
    expect(limpo).toContain("Cartão final 9012");
    expect(limpo).toContain("06/09 MSC CRUZEIROS 02/12 1.140,74");
  });

  it("cartão mascarado, colado ou com pontos também vira o final", () => {
    expect(removerDadosPessoais("4220 XXXX XXXX 9012")).toBe("final 9012");
    expect(removerDadosPessoais("4220 **** **** 1234 total")).toBe("final 1234 total");
    expect(removerDadosPessoais("4220123456789012")).toBe("final 9012");
    expect(removerDadosPessoais("4220.1234.5678.9012")).toBe("final 9012");
    expect(removerDadosPessoais("4220-xxxx-xxxx-9012")).toBe("final 9012");
  });

  it("CPF mascarado e CPF rotulado sem pontuação somem", () => {
    expect(removerDadosPessoais("CPF ***.456.789-**")).not.toContain("456.789");
    expect(removerDadosPessoais("CPF: 12345678909")).toBe("CPF");
  });

  it("CEP com ponto e logradouros abreviados", () => {
    const texto = ["AV. PAULISTA 1000", "AVENIDA BRASIL 10", "AL SANTOS 5", "01.234-567", "CEP 01234-567", "fica"].join("\n");
    expect(removerDadosPessoais(texto)).toBe("fica");
  });

  it("não mexe em Lançamentos, valores, datas nem parcelas", () => {
    const texto = [
      "VENCIMENTO 06/10/2026",
      "Total de despesas 8.327,39",
      "12/09 RUAS E PRACAS LTDA 89,90",
      "15/09 AVIANCA 03/10 412,33",
      "20/09 ESTORNO LOJA -0,08",
      "4 parcelas de 1.234,56",
    ].join("\n");
    expect(removerDadosPessoais(texto)).toBe(texto);
  });

  it("descarta as linhas de continuação do endereço até o CEP", () => {
    const texto = ["RUA DAS FLORES 123", "APTO 45 BLOCO B", "JARDIM PAULISTA", "SAO PAULO SP 01234-567", "fica"].join("\n");
    expect(removerDadosPessoais(texto)).toBe("fica");
  });

  it("sem CEP até 4 linhas depois, sai só o logradouro", () => {
    const texto = ["RUA DAS FLORES 123", "a", "b", "c", "d", "01234-567", "e"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(["a", "b", "c", "d", "e"].join("\n"));
  });

  it("o endereço para numa linha de Lançamento", () => {
    const texto = ["RUA DAS FLORES 123", "06/09 PADARIA 10,00", "01234-567"].join("\n");
    expect(removerDadosPessoais(texto)).toBe("06/09 PADARIA 10,00");
  });

  it("CEP sem traço depois do rótulo", () => {
    expect(removerDadosPessoais(["CEP 01234567", "CEP: 01234567 SAO PAULO", "fica"].join("\n"))).toBe("fica");
  });

  it("linha de Lançamento com padrão 5-3 dígitos fica, mas CPF e cartão são trocados", () => {
    expect(removerDadosPessoais("06/09 LOJA 12345-678 10,00")).toBe("06/09 LOJA 12345-678 10,00");
    expect(removerDadosPessoais("06/09 LOJA 4220 1234 5678 9012 123.456.789-09 10,00")).toBe(
      "06/09 LOJA final 9012  10,00",
    );
  });

  it("texto vazio continua vazio", () => {
    expect(removerDadosPessoais("")).toBe("");
  });
  it('abreviação "R" da rua do Santander e a linha do prédio até o CEP', () => {
    const texto = ["FULANO DE TAL", "R DAS PALMEIRAS 400", "ED JARDIM DAS FLORES CENTRO", "01234-567 SAO PAULO SP", "fica"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(["FULANO DE TAL", "fica"].join("\n"));
  });

  it('"R$" e "Resumo" não são rua', () => {
    const texto = ["R$ 7.713,67", "Resumo da Fatura", "R$7.713,67"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(texto);
  });

  it("Lançamento com dígito de marcação antes da data nunca é descartado", () => {
    const texto = "2 02/07 LOJA* 12345-678 BAR 03/03 466,00";
    expect(removerDadosPessoais(texto)).toBe(texto);
  });
});
