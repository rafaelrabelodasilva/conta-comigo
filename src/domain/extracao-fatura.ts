// Schema único da extração da Fatura (AD-7). O mesmo `ESQUEMA_EXTRACAO`
// gera o `responseJsonSchema` mandado ao Gemini (`z.toJSONSchema`) e valida
// a resposta. Os valores vêm como texto no formato da Fatura ("1.140,74",
// créditos com `-`); a conversão para centavos e o resumo usado na
// Conferência ficam aqui, no núcleo.
//
// As regras de formato ficam em `refine` (não viram `pattern` no JSON
// Schema, que o Gemini não promete seguir); o formato vai na descrição.

import { z } from "zod";
import { ehValorDeFatura, paraCentavos } from "./dinheiro";
import type { Resultado } from "./resultado";

const DIA_MES = /^\d{2}\/\d{2}$/;
const DATA_COMPLETA = /^\d{2}\/\d{2}\/(?:\d{2}|\d{4})$/;
const PARCELA = /^(\d{1,3})\/(\d{1,3})$/;
const FINAL = /^\d{4}$/;

const valor = (descricao: string) =>
  z.string().describe(descricao).refine(ehValorDeFatura, { message: "valor fora do formato 1.234,56" });

const valorOuNulo = (descricao: string) =>
  z
    .string()
    .refine(ehValorDeFatura, { message: "valor fora do formato 1.234,56" })
    .nullable()
    .describe(descricao);

const final = (descricao: string) =>
  z.string().describe(descricao).refine((t) => FINAL.test(t), { message: "final com 4 dígitos" });

const ESQUEMA_LANCAMENTO = z.object({
  nome: z
    .string()
    .describe("Descrição do Lançamento exatamente como está na Fatura, sem a data, a parcela e o valor.")
    .refine((t) => t.trim().length > 0, { message: "nome vazio" }),
  data: z
    .string()
    .describe("Data do Lançamento no formato DD/MM.")
    .refine((t) => DIA_MES.test(t), { message: "data fora do formato DD/MM" }),
  parcela: z
    .string()
    .refine((t) => PARCELA.test(t), { message: "parcela fora do formato n/total" })
    .nullable()
    .describe('Parcela no formato "02/12" (atual/total) ou null quando não é parcelado.'),
  valor: valor('Valor no formato "1.234,56". Créditos e estornos com "-" na frente, ex.: "-0,08".'),
  final_cartao: final("Os 4 últimos dígitos do cartão em que o Lançamento aparece."),
  tipo_sugerido: z
    .string()
    .nullable()
    .describe("Um dos Tipos da lista enviada, escrito igual, ou null se nenhum servir."),
  duvida: z.boolean().describe("true se a leitura deste Lançamento ficou incerta."),
});

const ESQUEMA_DADOS_FATURA = z.object({
  vencimento: z
    .string()
    .describe("Data de vencimento no formato DD/MM/AAAA.")
    .refine((t) => DATA_COMPLETA.test(t), { message: "vencimento fora do formato DD/MM/AAAA" }),
  fechamento: z
    .string()
    .refine((t) => DATA_COMPLETA.test(t), { message: "fechamento fora do formato DD/MM/AAAA" })
    .nullable()
    .describe("Data de fechamento no formato DD/MM/AAAA, ou null se não aparecer."),
  total_despesas: valor('Total de despesas da Fatura, no formato "1.234,56".'),
  total_creditos: valor('Total de créditos da Fatura, no formato "1.234,56" (sem sinal).'),
  saldo_anterior: valorOuNulo("Saldo da fatura anterior, ou null se não aparecer."),
  pagamentos: valorOuNulo("Total de pagamentos recebidos, ou null se não aparecer."),
  total_a_pagar: valorOuNulo("Total a pagar desta Fatura, ou null se não aparecer."),
});

const ESQUEMA_CARTAO = z.object({
  final: final("Os 4 últimos dígitos do cartão."),
  valor_total: valor('O "VALOR TOTAL" do cartão, no formato "1.234,56".'),
});

/** O schema único da extração (resposta do Gemini). */
export const ESQUEMA_EXTRACAO = z.object({
  lancamentos: z
    .array(ESQUEMA_LANCAMENTO)
    .describe("Todos os Lançamentos de todos os cartões, na ordem da Fatura."),
  fatura: ESQUEMA_DADOS_FATURA,
  cartoes: z.array(ESQUEMA_CARTAO).describe("Cada cartão da Fatura com o seu VALOR TOTAL."),
});

export type ExtracaoBruta = z.infer<typeof ESQUEMA_EXTRACAO>;

/** Corpo de `POST /api/fatura/extrair`: só o texto já sem dados pessoais. */
export const ESQUEMA_PEDIDO_EXTRACAO = z.object({
  texto: z.string().trim().min(1).max(200_000),
});

export type LancamentoExtraido = {
  nome: string;
  /** DD/MM. */
  data: string;
  parcelaN: number | null;
  parcelaTotal: number | null;
  valorCentavos: number;
  finalCartao: string;
  /** Nome de um Tipo ativo, ou null. */
  tipoSugerido: string | null;
  duvida: boolean;
};

export type DadosFaturaExtraidos = {
  vencimento: string;
  fechamento: string | null;
  totalDespesasCentavos: number;
  /** Sempre positivo (valor absoluto do que a Fatura escreve). */
  totalCreditosCentavos: number;
  saldoAnteriorCentavos: number | null;
  pagamentosCentavos: number | null;
  totalAPagarCentavos: number | null;
};

export type CartaoExtraido = { final: string; valorTotalCentavos: number };

export type Extracao = {
  lancamentos: LancamentoExtraido[];
  fatura: DadosFaturaExtraidos;
  cartoes: CartaoExtraido[];
};

const FALHOU = (detalhe: string): Resultado<never> => ({
  ok: false,
  erro: { codigo: "fatura.leitura_falhou", detalhe },
});

/** Valida a resposta crua (texto JSON já lido) pelo schema único. */
export function validarExtracao(bruta: unknown): Resultado<ExtracaoBruta> {
  const r = ESQUEMA_EXTRACAO.safeParse(bruta);
  if (!r.success) {
    const caminho = r.error.issues[0]?.path.join(".") ?? "";
    return FALHOU(caminho || "raiz");
  }
  return { ok: true, valor: r.data };
}

function centavos(texto: string, onde: string): Resultado<number> {
  const r = paraCentavos(texto);
  return r.ok ? r : FALHOU(onde);
}

function centavosOuNulo(texto: string | null, onde: string): Resultado<number | null> {
  return texto === null ? { ok: true, valor: null } : centavos(texto, onde);
}

/**
 * Converte a extração validada para centavos e parcelas numéricas. Um
 * `tipo_sugerido` fora da lista de Tipos ativos vira null.
 */
export function converterExtracao(
  bruta: ExtracaoBruta,
  nomesTipos: readonly string[],
): Resultado<Extracao> {
  const tipos = new Set(nomesTipos);
  const lancamentos: LancamentoExtraido[] = [];
  for (const [i, l] of bruta.lancamentos.entries()) {
    const v = centavos(l.valor, `lancamentos.${i}.valor`);
    if (!v.ok) return v;
    const parcela = l.parcela === null ? null : PARCELA.exec(l.parcela);
    lancamentos.push({
      nome: l.nome.trim(),
      data: l.data,
      parcelaN: parcela ? Number(parcela[1]) : null,
      parcelaTotal: parcela ? Number(parcela[2]) : null,
      valorCentavos: v.valor,
      finalCartao: l.final_cartao,
      tipoSugerido: l.tipo_sugerido !== null && tipos.has(l.tipo_sugerido) ? l.tipo_sugerido : null,
      duvida: l.duvida,
    });
  }

  const f = bruta.fatura;
  const despesas = centavos(f.total_despesas, "fatura.total_despesas");
  if (!despesas.ok) return despesas;
  const creditos = centavos(f.total_creditos, "fatura.total_creditos");
  if (!creditos.ok) return creditos;
  const saldo = centavosOuNulo(f.saldo_anterior, "fatura.saldo_anterior");
  if (!saldo.ok) return saldo;
  const pagamentos = centavosOuNulo(f.pagamentos, "fatura.pagamentos");
  if (!pagamentos.ok) return pagamentos;
  const aPagar = centavosOuNulo(f.total_a_pagar, "fatura.total_a_pagar");
  if (!aPagar.ok) return aPagar;

  const cartoes: CartaoExtraido[] = [];
  for (const [i, c] of bruta.cartoes.entries()) {
    const v = centavos(c.valor_total, `cartoes.${i}.valor_total`);
    if (!v.ok) return v;
    cartoes.push({ final: c.final, valorTotalCentavos: v.valor });
  }

  return {
    ok: true,
    valor: {
      lancamentos,
      fatura: {
        vencimento: f.vencimento,
        fechamento: f.fechamento,
        totalDespesasCentavos: despesas.valor,
        totalCreditosCentavos: Math.abs(creditos.valor),
        saldoAnteriorCentavos: saldo.valor,
        pagamentosCentavos: pagamentos.valor,
        totalAPagarCentavos: aPagar.valor,
      },
      cartoes,
    },
  };
}

// "PAGAMENTO DE FATURA", "PAGTO FATURA", "DEB AUTOM DE FATURA"...
const PAGAMENTO_DE_FATURA = /\b(?:PAG(?:AMENTO|TO)|DEB(?:ITO)?\.?\s*AUT\w*)\b.*\bFATURA\b/i;

/** O Lançamento parece o pagamento da fatura anterior (que não deveria vir)? */
export function parecePagamentoDeFatura(nome: string): boolean {
  return PAGAMENTO_DE_FATURA.test(nome);
}

export type ResumoCartao = {
  final: string;
  /** "VALOR TOTAL" lido do cartão. */
  lidoCentavos: number;
  /** Soma das despesas (valores positivos) dos Lançamentos do cartão. */
  despesasCentavos: number;
  diferencaCentavos: number;
};

export type ResumoExtracao = {
  quantidade: number;
  /** Soma dos valores positivos. */
  despesasCentavos: number;
  /** Soma dos créditos, em valor absoluto. */
  creditosCentavos: number;
  /** Soma dos "VALOR TOTAL" dos cartões. */
  cartoesCentavos: number;
  totalDespesasLidoCentavos: number;
  totalCreditosLidoCentavos: number;
  /** Soma das despesas − total de despesas lido. */
  diferencaDespesasCentavos: number;
  /** Soma dos créditos − total de créditos lido. */
  diferencaCreditosCentavos: number;
  /** Soma dos cartões − total de despesas lido. */
  diferencaCartoesCentavos: number;
  porCartao: ResumoCartao[];
  /** Quantos Lançamentos parecem o pagamento da fatura anterior. */
  pagamentosDeFatura: number;
  /** Quantos Lançamentos vieram com `duvida`. */
  duvidas: number;
};

/** O que a soma por cartão usa de um Lançamento (extraído ou gravado). */
export type ValorNoCartao = { valorCentavos: number; finalCartao: string };

/** O que a soma por cartão usa da Fatura e dos cartões lidos. */
export type TotaisLidos = { totalDespesasCentavos: number; totalCreditosCentavos: number };

export type SomaConferencia = {
  /** Soma dos valores positivos. */
  despesasCentavos: number;
  /** Soma dos créditos, em valor absoluto. */
  creditosCentavos: number;
  totalDespesasLidoCentavos: number;
  totalCreditosLidoCentavos: number;
  /** Soma das despesas − total de despesas lido. */
  diferencaDespesasCentavos: number;
  /** Soma dos créditos − total de créditos lido. */
  diferencaCreditosCentavos: number;
  /** Cartões lidos e, depois, finais que só aparecem nos Lançamentos (lido R$ 0,00). */
  porCartao: ResumoCartao[];
};

/**
 * A regra única da Conferência (FR-6): despesas (valor ≥ 0) contra o total
 * de despesas, créditos (valor absoluto dos negativos) contra o total de
 * créditos e, por cartão, as despesas de cada final contra o "VALOR TOTAL"
 * dele (que é só despesas). Um final que só existe nos Lançamentos conta
 * como lido R$ 0,00. Saldo anterior e pagamentos não entram. Serve à
 * importação (extração) e ao Painel (linhas gravadas).
 */
export function somarConferencia(
  lancamentos: readonly ValorNoCartao[],
  cartoes: readonly CartaoExtraido[],
  totais: TotaisLidos,
): SomaConferencia {
  let despesas = 0;
  let creditos = 0;
  const despesasPorCartao = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.valorCentavos >= 0) {
      despesas += l.valorCentavos;
      despesasPorCartao.set(l.finalCartao, (despesasPorCartao.get(l.finalCartao) ?? 0) + l.valorCentavos);
    } else {
      creditos += -l.valorCentavos;
    }
  }
  const { totalDespesasCentavos, totalCreditosCentavos } = totais;

  const finais = [...new Set([...cartoes.map((c) => c.final), ...despesasPorCartao.keys()])];
  const porCartao = finais.map((f) => {
    const lido = cartoes.filter((c) => c.final === f).reduce((soma, c) => soma + c.valorTotalCentavos, 0);
    const somaDespesas = despesasPorCartao.get(f) ?? 0;
    return { final: f, lidoCentavos: lido, despesasCentavos: somaDespesas, diferencaCentavos: somaDespesas - lido };
  });

  return {
    despesasCentavos: despesas,
    creditosCentavos: creditos,
    totalDespesasLidoCentavos: totalDespesasCentavos,
    totalCreditosLidoCentavos: totalCreditosCentavos,
    diferencaDespesasCentavos: despesas - totalDespesasCentavos,
    diferencaCreditosCentavos: creditos - totalCreditosCentavos,
    porCartao,
  };
}

/** Somas e diferenças da extração contra os totais que a própria Fatura traz. */
export function resumirExtracao(extracao: Extracao): ResumoExtracao {
  const soma = somarConferencia(extracao.lancamentos, extracao.cartoes, extracao.fatura);
  const cartoes = extracao.cartoes.reduce((total, c) => total + c.valorTotalCentavos, 0);

  return {
    quantidade: extracao.lancamentos.length,
    ...soma,
    cartoesCentavos: cartoes,
    diferencaCartoesCentavos: cartoes - soma.totalDespesasLidoCentavos,
    pagamentosDeFatura: extracao.lancamentos.filter((l) => parecePagamentoDeFatura(l.nome)).length,
    duvidas: extracao.lancamentos.filter((l) => l.duvida).length,
  };
}
