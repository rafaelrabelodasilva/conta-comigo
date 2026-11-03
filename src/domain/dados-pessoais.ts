// Limpeza do texto da Fatura antes de sair do aparelho (AD-7, passo 2).
// Remove CPF, CEP e as linhas de endereço, e mascara números de cartão
// deixando só o final de 4 dígitos ("final 9012"). O resto do texto
// (Lançamentos, totais, datas) fica como está.

// CPF formatado, inclusive mascarado ("***.456.789-**").
const CPF = /(?<![\dX*])[\dX*]{3}\.[\dX*]{3}\.[\dX*]{3}-[\dX*]{2}(?![\dX*])/gi;
// CPF sem pontuação, só quando vem rotulado ("CPF: 12345678909").
const CPF_ROTULADO = /\bCPF\b\s*:?\s*\d{11}(?!\d)/gi;
// CEP "01234-567" ou "01.234-567"; sem traço só depois do rótulo ("CEP 01234567").
const CEP = /(?<!\d)\d{2}\.?\d{3}-\d{3}(?!\d)/;
const CEP_ROTULADO = /\bCEP\b\s*:?\s*\d{2}\.?\d{3}-?\d{3}(?!\d)/i;
// Linha de Lançamento: começa com a data "DD/MM", às vezes depois de um
// dígito de marcação ("2 28/11 AMAZON PRIME BR"). Nunca é descartada.
const LANCAMENTO = /^\s*(?:\d\s+)?\d{2}\/\d{2}(?!\d)/;
// Quantas linhas depois do logradouro o endereço pode seguir até o CEP.
const LINHAS_ATE_CEP = 4;
// Número de cartão em 4 grupos de 4 (dígitos, X, * ou •), com ou sem
// separador. O último grupo precisa ser de dígitos: é o final que fica.
const CARTAO = /(?<![\dX*•])(?:[\dX*•]{4}[ .-]?){3}(\d{4})(?![\dX*•])/gi;
// Começo de linha de endereço (logradouros). "R" sozinho é a abreviação de
// rua que o Santander usa ("R NOME DA RUA 400"); "R$" não casa.
const LOGRADOURO =
  /^\s*(?:RUA|R\.?|AV\.?|AVENIDA|ALAMEDA|AL\.?|TRAVESSA|TV\.?|ESTRADA|ESTR\.?|RODOVIA|ROD\.?|PRA[CÇ]A|P[CÇ]A\.?|LARGO|VIELA|QUADRA|QD\.?|SETOR|CONDOM[IÍ]NIO|BAIRRO|ENDERE[CÇ]O)(?=[\s.:,]|$)/i;

function temCep(linha: string): boolean {
  return CEP.test(linha) || CEP_ROTULADO.test(linha);
}

/**
 * Tira do texto CPF, CEP e endereço; o cartão vira "final NNNN". O endereço
 * vai do logradouro até a linha do CEP (no máximo 4 linhas depois); sem CEP
 * nesse intervalo, sai só a linha do logradouro.
 */
export function removerDadosPessoais(texto: string): string {
  const linhas = texto.split(/\r?\n/);
  const limpas: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!LANCAMENTO.test(linha)) {
      if (LOGRADOURO.test(linha)) {
        for (let j = i + 1; j <= Math.min(i + LINHAS_ATE_CEP, linhas.length - 1); j++) {
          if (LANCAMENTO.test(linhas[j])) break;
          if (temCep(linhas[j])) {
            i = j;
            break;
          }
        }
        continue;
      }
      // A linha da cidade costuma trazer o CEP ("01234-567 SAO PAULO SP").
      if (temCep(linha)) continue;
    }
    limpas.push(
      linha
        .replace(CPF_ROTULADO, "CPF")
        .replace(CPF, "")
        .replace(CARTAO, (_, final: string) => `final ${final}`),
    );
  }
  return limpas.join("\n");
}
