// Limpeza do texto da Fatura antes de sair do aparelho (AD-7, passo 2).
// Remove CPF, CEP e as linhas de endereço, mascara números de cartão
// deixando só o final de 4 dígitos ("final 9012"), troca o nome do titular
// e dos adicionais por `TITULAR` e tira o "final NNNN" da conta corrente no
// bloco do débito automático. Linhas de Lançamento nunca mudam (só o
// cartão e o CPF dentro delas); o resto (totais, datas) fica como está.

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

// Quem a Fatura cumprimenta: "Olá, Rafael!".
const SAUDACAO = /\bOl[áa],\s*([^!\n]{1,60}?)\s*!/giu;
// Cabeçalho de cartão: "RAFAEL R DA SILVA - final 8175", às vezes com "@ "
// na frente (adicionais). Nome em maiúsculas.
const CABECALHO_CARTAO = /^\s*(?:@\s*)?(\p{Lu}[\p{Lu}'. ]*?)\s+-\s+final\s+\d{4}\s*$/u;
// Começo do bloco do débito automático e o fim dele (linha vazia ou "1/4").
const DEBITO_AUTOMATICO = /D[ÉE]BITO\s+AUTOM[ÁA]TICO/i;
const FIM_DE_BLOCO = /^\s*(?:\d+\/\d+)?\s*$/;
// Linha que é só o "final NNNN" da conta corrente, dentro do bloco do débito.
const FINAL_CONTA = /^\s*final\s+\d{4}\s*$/i;
const LETRA = /\p{L}/u;

/** O que fica no lugar do nome do titular e dos adicionais. */
export const TITULAR = "TITULAR";

/** Nomes do titular e dos adicionais: da saudação e dos cabeçalhos de cartão. */
function nomesDaFatura(linhas: readonly string[]): string[] {
  const nomes = new Set<string>();
  for (const linha of linhas) {
    if (LANCAMENTO.test(linha)) continue;
    for (const m of linha.matchAll(SAUDACAO)) nomes.add(m[1].trim());
    // Do cabeçalho, só nome com pelo menos 2 palavras ("TOTAL - final 1234" não é nome).
    const c = CABECALHO_CARTAO.exec(linha);
    if (c && c[1].trim().split(/\s+/).length >= 2) nomes.add(c[1].trim());
  }
  nomes.delete(TITULAR);
  return [...nomes].filter((n) => LETRA.test(n));
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex (sticky) que casa o nome inteiro ou cortado depois da primeira
 * palavra (a tabela da anuidade escreve "RAFAEL R DA SIL"), sem diferenciar
 * maiúsculas, terminando fora de uma palavra. Os espaços do nome aceitam
 * qualquer espaço em branco.
 */
function regexDoNome(nome: string): RegExp {
  const [primeira, ...resto] = nome.split(/\s+/);
  const depois = resto.length > 0 ? ` ${resto.join(" ")}` : "";
  let opcional = "";
  for (let i = depois.length - 1; i >= 0; i--) {
    const c = depois[i] === " " ? "\\s+" : escapar(depois[i]);
    opcional = `(?:${c}${opcional})?`;
  }
  return new RegExp(`${escapar(primeira)}${opcional}(?!\\p{L})`, "iuy");
}

/** Troca cada nome (o casamento mais longo em cada posição) por `TITULAR`. */
function trocarNomes(linha: string, regexes: readonly RegExp[]): string {
  if (regexes.length === 0) return linha;
  let saida = "";
  let i = 0;
  while (i < linha.length) {
    let fim = i;
    if (i === 0 || !LETRA.test(linha[i - 1])) {
      for (const r of regexes) {
        r.lastIndex = i;
        const m = r.exec(linha);
        if (m) fim = Math.max(fim, i + m[0].length);
      }
    }
    if (fim > i) {
      saida += TITULAR;
      i = fim;
    } else {
      saida += linha[i];
      i++;
    }
  }
  return saida;
}

function temCep(linha: string): boolean {
  return CEP.test(linha) || CEP_ROTULADO.test(linha);
}

// Até quantas linhas depois do título o bloco do débito automático vai.
const LINHAS_DO_DEBITO = 15;

/**
 * Nome do titular e dos adicionais vira `TITULAR` (fora das linhas de
 * Lançamento), e a linha que é só o "final NNNN" da conta some do bloco do
 * débito automático.
 */
function removerNomesEConta(linhas: readonly string[]): string[] {
  const regexes = nomesDaFatura(linhas)
    .sort((a, b) => b.length - a.length)
    .map(regexDoNome);
  const saida: string[] = [];
  let restantesDoDebito = 0;
  for (const linha of linhas) {
    if (LANCAMENTO.test(linha)) {
      saida.push(linha);
      continue;
    }
    if (restantesDoDebito > 0 && FIM_DE_BLOCO.test(linha)) restantesDoDebito = 0;
    if (restantesDoDebito > 0) {
      restantesDoDebito--;
      if (FINAL_CONTA.test(linha)) continue;
    }
    const limpa = trocarNomes(linha, regexes);
    if (DEBITO_AUTOMATICO.test(linha)) restantesDoDebito = LINHAS_DO_DEBITO;
    saida.push(limpa);
  }
  return saida;
}

/**
 * Tira do texto CPF, CEP e endereço; o cartão vira "final NNNN". O endereço
 * vai do logradouro até a linha do CEP (no máximo 4 linhas depois); sem CEP
 * nesse intervalo, sai só a linha do logradouro. Depois, o nome do titular e
 * dos adicionais (da saudação "Olá, …!" e dos cabeçalhos "NOME - final
 * NNNN") vira `TITULAR`, e a conta do débito automático some.
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
  return removerNomesEConta(limpas).join("\n");
}
