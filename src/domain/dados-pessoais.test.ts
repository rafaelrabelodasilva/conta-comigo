import { describe, expect, it } from "vitest";
import { TITULAR, removerDadosPessoais } from "./dados-pessoais";

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

  it("o nome do titular (saudação e cabeçalho) e dos adicionais vira TITULAR", () => {
    const texto = [
      "Olá, Fulana! Esta é a fatura do seu cartão SANTANDER",
      "FULANA DE SOUZA LIMA - final 8175",
      "Cartão Parcela Redução",
      "FULANA D SOUZA LI 8175 R$50,00",
      "@ BELTRANO DE SOUZA - final 3967",
      "BELTRANO",
      "06/09 FULANA MODAS 02/12 1.140,74",
    ].join("\n");
    expect(removerDadosPessoais(texto)).toBe(
      [
        `Olá, ${TITULAR}! Esta é a fatura do seu cartão SANTANDER`,
        `${TITULAR} - final 8175`,
        "Cartão Parcela Redução",
        // Abreviado diferente do cabeçalho: sai até onde bate ("FULANA D").
        `${TITULAR} SOUZA LI 8175 R$50,00`,
        `@ ${TITULAR} - final 3967`,
        TITULAR,
        // Linha de Lançamento nunca muda.
        "06/09 FULANA MODAS 02/12 1.140,74",
      ].join("\n"),
    );
  });

  it("nome cortado depois da primeira palavra também sai (\"RAFAEL R DA SIL\")", () => {
    const texto = ["FULANA DE SOUZA - final 1111", "FULANA DE SOU 1111 R$0,00", "FULANA DESTA LOJA"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(
      [`${TITULAR} - final 1111`, `${TITULAR} 1111 R$0,00`, `${TITULAR} DESTA LOJA`].join("\n"),
    );
  });

  it("o nome mais longo vence quando um começa igual ao outro", () => {
    const texto = ["FULANA S LIMA - final 1111", "FULANA SOUZA LIMA - final 2222", "FULANA SOUZA LIMA"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(
      [`${TITULAR} - final 1111`, `${TITULAR} - final 2222`, TITULAR].join("\n"),
    );
  });

  it("nome não é trocado dentro de outra palavra", () => {
    const texto = ["Olá, Ana!", "BANANA ANA ANAIS"].join("\n");
    expect(removerDadosPessoais(texto)).toBe([`Olá, ${TITULAR}!`, `BANANA ${TITULAR} ANAIS`].join("\n"));
  });

  it("o cabeçalho do cartão mascarado vira final e o nome sai", () => {
    expect(removerDadosPessoais("FULANA DE TAL - 4220 XXXX XXXX 8175")).toBe(`${TITULAR} - final 8175`);
  });

  it("tira a linha do final da conta do bloco do débito automático, e só ela", () => {
    const texto = [
      "DEMONSTRATIVO PARA SIMPLES CONFERÊNCIA - DÉBITO AUTOMÁTICO",
      "Esta fatura será considerada quitada após o débito.",
      "  final 0530 ",
      "FULANA DE TAL - final 3967",
      "1/4",
      "final 1111",
      "@ FULANA DE TAL - final 3967",
    ].join("\n");
    expect(removerDadosPessoais(texto)).toBe(
      [
        "DEMONSTRATIVO PARA SIMPLES CONFERÊNCIA - DÉBITO AUTOMÁTICO",
        "Esta fatura será considerada quitada após o débito.",
        // Cabeçalho de cartão dentro do bloco mantém o final do cartão.
        `${TITULAR} - final 3967`,
        "1/4",
        // Fora do bloco, nada sai.
        "final 1111",
        `@ ${TITULAR} - final 3967`,
      ].join("\n"),
    );
  });

  it("cabeçalho com uma palavra só (\"TOTAL - final 1234\") não vira nome", () => {
    const texto = ["TOTAL - final 1234", "Total de despesas 10,00", "VALOR TOTAL 10,00"].join("\n");
    expect(removerDadosPessoais(texto)).toBe(texto);
  });

  it("limpar de novo não muda nada", () => {
    const texto = ["Olá, Fulana!", "FULANA DE TAL - final 8175", "DÉBITO AUTOMÁTICO", "final 0530", "", "fim"].join("\n");
    const uma = removerDadosPessoais(texto);
    expect(removerDadosPessoais(uma)).toBe(uma);
    expect(uma).not.toMatch(/FULANA|0530/i);
  });
});
