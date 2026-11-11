// Importação da Fatura (História 2.3, AD-6/7/9). Tudo o que a RPC
// `importar_fatura` grava é calculado aqui, a partir da extração já
// convertida para centavos (`extracao-fatura.ts`): o Mês, as datas
// completas, a ordem da Fatura, o Nome normalizado e a Conferência que a
// janela mostra antes de gravar. A RPC só grava (e lê o Status padrão).
//
// - Mês = mês do vencimento lido (AAAA-MM), fixado aqui e nunca recalculado.
// - Data DD/MM: o ano é o do fechamento (ou do vencimento, sem fechamento);
//   se a data passar dele, é o ano anterior (compras de dezembro na fatura
//   de janeiro, parcelas).
// - O pagamento da fatura anterior (crédito "PAGAMENTO DE FATURA…") não
//   vira Lançamento, mesmo que a leitura o traga.
// - Créditos entram negativos (como a extração já os traz).
// - Ajustes de centavos (História 2.8): o crédito reconhecido por
//   `reconhecerAjustes` leva a `ordem_fatura` da mãe em `ajuste_de_ordem`; a
//   RPC grava o `ajuste_de_id` na mesma transação.
// - Classificação (História 3.1): `prepararImportacao` só repassa o
//   `tipo_sugerido` da extração e deixa as linhas sem classificação (o
//   Ajuste sem motivo, as outras `sem_classificacao`); quem classifica é
//   `classificarImportacao` (`classificacao.ts`), antes de gravar.
// - Reimportação (História 3.11 simplificada): `resumirReimportacao` dá os
//   números do aviso a partir das linhas da Fatura do Mês lidas do banco.
// - Séries e previstos (História 3.5): `prepararImportacao` dá a cada parcela
//   a chave da Série (`atribuirSeries`, `previstos.ts`); depois de classificar,
//   a tela chama `gerarPrevistos` com a classificação já calculada e grava o
//   resultado em `Importacao.previstos`.

import { reconhecerAjustes } from "./ajustes";
import type { DadosRevisao, DadosValorMudou, MotivoRevisao } from "./classificacao";
import { ehData } from "./ciclo";
import { LIMITE_AJUSTE_PADRAO_CENTAVOS } from "./configuracoes";
import { dois } from "./datas";
import type { Divisao, ParteParaGravar } from "./divisao";
import {
  parecePagamentoDeFatura,
  resumirExtracao,
  type Extracao,
  type SomaConferencia,
  type LancamentoExtraido,
} from "./extracao-fatura";
import { atribuirSeries, type ChaveDaSerie, type PrevistoParaGravar } from "./previstos";
import type { Resultado } from "./resultado";

/** Aceite de outubro/2026 (vence 06/10/26), do Épico 2. */
export const ESPERADO_OUTUBRO_2026 = {
  quantidade: 49,
  despesasCentavos: 832_739,
  creditosCentavos: 63_962,
} as const;

/**
 * Chave exata de "mesmo Nome" (AD-6): maiúsculas, sem acento e com os
 * espaços colapsados. O `nome` original nunca muda.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O texto (já sem dados pessoais) tem as marcas da fatura do Santander? Sem
 * elas, a janela avisa e nem chama a leitura.
 */
export function pareceFaturaSantander(texto: string): boolean {
  return /SANTANDER/i.test(texto) && /(?:Detalhamento|Resumo)\s+da\s+Fatura/i.test(texto);
}

/** "02/12": parcela atual e total com dois dígitos; sem parcela, "". */
export function formatarParcela(n: number | null, total: number | null): string {
  if (n === null || total === null) return "";
  return `${dois(n)}/${dois(total)}`;
}

const DATA_LIDA = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
const DIA_MES = /^(\d{2})\/(\d{2})$/;

/** "06/10/2026" ou "06/10/26" → "2026-10-06"; data que não existe → null. */
export function lerDataDaFatura(texto: string): string | null {
  const m = DATA_LIDA.exec(texto.trim());
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  const data = `${ano}-${m[2]}-${m[1]}`;
  return ehData(data) ? data : null;
}

/**
 * Data completa de um Lançamento "DD/MM": o ano do corte (o fechamento,
 * quando lido, senão o vencimento), ou o anterior se a data passar do corte
 * (uma compra não é depois do fechamento). Se o dia não existir no ano
 * calculado (29/02), recua o ano até 4 vezes. Data que não existe → null.
 */
export function dataDoLancamento(diaMes: string, corte: string): string | null {
  const m = DIA_MES.exec(diaMes.trim());
  if (!m) return null;
  let ano = Number(corte.slice(0, 4));
  if (`${ano}-${m[2]}-${m[1]}` > corte) ano--;
  for (let recuo = 0; recuo <= 4; recuo++, ano--) {
    const data = `${ano}-${m[2]}-${m[1]}`;
    if (ehData(data)) return data;
  }
  return null;
}

/** Os Lançamentos que vão para a Fatura: sem o pagamento da fatura anterior. */
export function lancamentosDaFatura(extracao: Extracao): LancamentoExtraido[] {
  return extracao.lancamentos.filter((l) => !(l.valorCentavos < 0 && parecePagamentoDeFatura(l.nome)));
}

/** Corpo da RPC `importar_fatura`: colunas com os nomes do banco. */
export type FaturaParaGravar = {
  mes: string;
  vencimento: string;
  fechamento: string | null;
  total_despesas_centavos: number;
  total_creditos_centavos: number;
  saldo_anterior_centavos: number | null;
  pagamentos_centavos: number | null;
  total_a_pagar_centavos: number | null;
};

export type CartaoParaGravar = { final: string; total_centavos: number };

export type LancamentoParaGravar = {
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  data: string;
  parcela_n: number | null;
  parcela_total: number | null;
  final_cartao: string;
  /** 1, 2, … na ordem do PDF. */
  ordem_fatura: number;
  duvida_extracao: boolean;
  /** Ajuste de centavos: a `ordem_fatura` da mãe; senão, null. */
  ajuste_de_ordem: number | null;
  /** Nome do Tipo sugerido pela extração (já um dos Tipos ativos), ou null. */
  tipo_sugerido: string | null;
  /** Classificação (História 3.1): de `classificarImportacao`. */
  responsavel_id: string | null;
  tipo_id: string | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: DadosRevisao | DadosValorMudou | null;
  /** Série da parcela (História 3.5); null à vista, em crédito, no Ajuste e no casado (a Série é a do previsto). */
  serie: ChaveDaSerie | null;
  /** Previsto que esta linha casou (História 3.6): a RPC o transforma nesta linha, mantendo o `id`. */
  previsto_id?: string | null;
  /** Herdados da parcela n−1 do Mês anterior (História 3.7); a RPC os grava na linha nova. */
  apelido?: string | null;
  observacao?: string | null;
  /** A parcela anterior de que a linha herdou a classificação (só quando emprestou algum campo). */
  herdado_de_id?: string | null;
  /** Divisão da linha (História 3.8): da Regra, da herança ou do previsto casado; a mãe fica sem Responsável. */
  divisao?: Divisao | null;
  /** As filhas da Divisão (com o `filha_id` do previsto casado) e os valores que o núcleo calculou. */
  partes?: ParteParaGravar[];
};

export type Importacao = {
  fatura: FaturaParaGravar;
  cartoes: CartaoParaGravar[];
  lancamentos: LancamentoParaGravar[];
  /** Parcelas previstas dos Meses seguintes (vazio até a tela chamar `gerarPrevistos`). */
  previstos: PrevistoParaGravar[];
  /** Ids dos previstos do Mês que a Fatura não trouxe (História 3.6): ganham "Não veio na fatura". */
  previstos_sem_par?: string[];
};

const LEITURA_FALHOU = (detalhe: string): Resultado<never> => ({
  ok: false,
  erro: { codigo: "fatura.leitura_falhou", detalhe },
});

/**
 * Prepara o que a RPC grava: Mês e datas completas, ordem da Fatura, Nome
 * normalizado, os Ajustes de centavos (com `limiteAjusteCentavos`, de
 * `configuracoes`) e os cartões (um por final; o mesmo final repetido soma).
 * Vencimento, fechamento ou data de Lançamento ilegíveis → `fatura.leitura_falhou`.
 */
export function prepararImportacao(
  extracao: Extracao,
  limiteAjusteCentavos: number = LIMITE_AJUSTE_PADRAO_CENTAVOS,
): Resultado<Importacao> {
  const f = extracao.fatura;
  const vencimento = lerDataDaFatura(f.vencimento);
  if (!vencimento) return LEITURA_FALHOU("fatura.vencimento");
  let fechamento: string | null = null;
  if (f.fechamento !== null) {
    fechamento = lerDataDaFatura(f.fechamento);
    if (!fechamento) return LEITURA_FALHOU("fatura.fechamento");
  }

  const corte = fechamento ?? vencimento;
  const lancamentos: LancamentoParaGravar[] = [];
  const daFatura = new Set(lancamentosDaFatura(extracao));
  for (const [i, l] of extracao.lancamentos.entries()) {
    if (!daFatura.has(l)) continue;
    const data = dataDoLancamento(l.data, corte);
    if (!data) return LEITURA_FALHOU(`lancamentos.${i}.data`);
    lancamentos.push({
      nome: l.nome,
      nome_normalizado: normalizarNome(l.nome),
      valor_centavos: l.valorCentavos,
      data,
      parcela_n: l.parcelaN,
      parcela_total: l.parcelaTotal,
      final_cartao: l.finalCartao,
      ordem_fatura: lancamentos.length + 1,
      duvida_extracao: l.duvida,
      ajuste_de_ordem: null,
      tipo_sugerido: l.tipoSugerido,
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
      serie: null,
    });
  }
  for (const par of reconhecerAjustes(lancamentos, limiteAjusteCentavos)) {
    lancamentos[par.ajuste].ajuste_de_ordem = lancamentos[par.mae].ordem_fatura;
    // O Ajuste não tem motivo próprio: segue a mãe.
    lancamentos[par.ajuste].revisao_motivo = null;
  }
  const mesDaFatura = vencimento.slice(0, 7);
  const comSeries = atribuirSeries(lancamentos, mesDaFatura);

  const porFinal = new Map<string, number>();
  for (const c of extracao.cartoes) porFinal.set(c.final, (porFinal.get(c.final) ?? 0) + c.valorTotalCentavos);

  return {
    ok: true,
    valor: {
      fatura: {
        mes: mesDaFatura,
        vencimento,
        fechamento,
        total_despesas_centavos: f.totalDespesasCentavos,
        total_creditos_centavos: f.totalCreditosCentavos,
        saldo_anterior_centavos: f.saldoAnteriorCentavos,
        pagamentos_centavos: f.pagamentosCentavos,
        total_a_pagar_centavos: f.totalAPagarCentavos,
      },
      cartoes: [...porFinal].map(([final, total]) => ({ final, total_centavos: total })),
      lancamentos: comSeries,
      previstos: [],
    },
  };
}

export type ConferenciaCartao = {
  final: string;
  /** "VALOR TOTAL" lido do cartão. */
  lidoCentavos: number;
  /** Soma das despesas do cartão. */
  despesasCentavos: number;
  /** Soma − lido. */
  diferencaCentavos: number;
};

export type ConferenciaImportacao = {
  /** Quantos Lançamentos serão gravados. */
  quantidade: number;
  despesasCentavos: number;
  /** Em valor absoluto. */
  creditosCentavos: number;
  totalDespesasLidoCentavos: number;
  totalCreditosLidoCentavos: number;
  diferencaDespesasCentavos: number;
  diferencaCreditosCentavos: number;
  porCartao: ConferenciaCartao[];
  /** Despesas, créditos e todos os cartões batem. */
  conferido: boolean;
  /** A soma das despesas ou dos créditos ficou abaixo do total lido. */
  incompleta: boolean;
};

/**
 * Conferência antes de gravar: soma das despesas contra o total de despesas,
 * soma dos créditos contra o total de créditos e, por cartão, as despesas
 * contra o "VALOR TOTAL". Saldo anterior e pagamentos não entram. Avisa,
 * nunca bloqueia; abaixo do lido, a extração é "incompleta".
 */
export function conferirImportacao(extracao: Extracao): ConferenciaImportacao {
  const r = resumirExtracao({ ...extracao, lancamentos: lancamentosDaFatura(extracao) });
  return montarConferencia(r.quantidade, r);
}

/**
 * A Conferência a partir das somas (`somarConferencia`): "conferido" quando
 * despesas, créditos e todos os cartões batem; "incompleta" quando as
 * despesas ou os créditos ficaram abaixo do lido. Usada pela importação e
 * pelo Painel (`conferencia.ts`).
 */
export function montarConferencia(quantidade: number, r: SomaConferencia): ConferenciaImportacao {
  const porCartao = r.porCartao.map((c) => ({
    final: c.final,
    lidoCentavos: c.lidoCentavos,
    despesasCentavos: c.despesasCentavos,
    diferencaCentavos: c.diferencaCentavos,
  }));
  return {
    quantidade,
    despesasCentavos: r.despesasCentavos,
    creditosCentavos: r.creditosCentavos,
    totalDespesasLidoCentavos: r.totalDespesasLidoCentavos,
    totalCreditosLidoCentavos: r.totalCreditosLidoCentavos,
    diferencaDespesasCentavos: r.diferencaDespesasCentavos,
    diferencaCreditosCentavos: r.diferencaCreditosCentavos,
    porCartao,
    conferido:
      r.diferencaDespesasCentavos === 0 &&
      r.diferencaCreditosCentavos === 0 &&
      porCartao.every((c) => c.diferencaCentavos === 0),
    incompleta: r.diferencaDespesasCentavos < 0 || r.diferencaCreditosCentavos < 0,
  };
}

/** A primeira diferença a mostrar: um cartão, senão o total. Sem diferença, null. */
export function primeiraDiferenca(
  c: ConferenciaImportacao,
): { centavos: number; final: string | null } | null {
  const cartao = c.porCartao.find((p) => p.diferencaCentavos !== 0);
  if (cartao) return { centavos: Math.abs(cartao.diferencaCentavos), final: cartao.final };
  if (c.diferencaDespesasCentavos !== 0) return { centavos: Math.abs(c.diferencaDespesasCentavos), final: null };
  if (c.diferencaCreditosCentavos !== 0) return { centavos: Math.abs(c.diferencaCreditosCentavos), final: null };
  return null;
}

/** Os totais lidos que fecham o "Total a pagar" da Fatura. */
export type TotaisLidosDaFatura = {
  saldo_anterior_centavos: number | null;
  pagamentos_centavos: number | null;
  total_a_pagar_centavos: number | null;
};

export type ComposicaoTotalAPagar = {
  /** Soma dos Lançamentos (despesas − créditos). */
  lancamentosCentavos: number;
  saldoAnteriorCentavos: number;
  pagamentosCentavos: number;
  /** Lançamentos + saldo anterior − pagamentos. */
  calculadoCentavos: number;
  /** "Total a pagar" lido da Fatura; null se não foi lido. */
  lidoCentavos: number | null;
  /** Calculado − lido; null sem o lido. */
  diferencaCentavos: number | null;
};

/**
 * Como os Lançamentos chegam ao "Total a pagar" da Fatura: a soma deles
 * (créditos negativos) mais o saldo da fatura anterior menos os pagamentos
 * recebidos. Saldo e pagamentos não lidos contam como zero. Só mostra; a
 * Conferência (despesas e créditos) continua em `conferirImportacao`.
 */
export function comporTotalAPagar(
  fatura: TotaisLidosDaFatura,
  valoresCentavos: readonly number[],
): ComposicaoTotalAPagar {
  const lancamentos = valoresCentavos.reduce((soma, v) => soma + v, 0);
  const saldo = fatura.saldo_anterior_centavos ?? 0;
  const pagamentos = fatura.pagamentos_centavos ?? 0;
  const calculado = lancamentos + saldo - pagamentos;
  const lido = fatura.total_a_pagar_centavos;
  return {
    lancamentosCentavos: lancamentos,
    saldoAnteriorCentavos: saldo,
    pagamentosCentavos: pagamentos,
    calculadoCentavos: calculado,
    lidoCentavos: lido,
    diferencaCentavos: lido === null ? null : calculado - lido,
  };
}

/** O que o aviso de reimportação precisa de cada linha da Fatura do Mês. */
export type LinhaParaReimportar = {
  /** Filha de uma Divisão (História 3.8): sai junto com a mãe e não conta. */
  dividido_de_id?: string | null;
  /** Mãe dividida: conta como "marcada à mão". */
  divisao?: unknown;
  excluido_em: string | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  observacao: string | null;
  /** Apelido dado à mão (História 3.9): conta como "marcada à mão". */
  apelido?: string | null;
  status_id: string | null;
  /** Quando o previsto foi casado com a Fatura (História 3.6); nulo se a linha nunca foi previsto. */
  casado_em?: string | null;
};

export type ResumoReimportacao = {
  /** Linhas não excluídas da Fatura (com os Ajustes): as que o aviso diz que apaga. */
  quantidade: number;
  /** Dessas, as com Responsável, Tipo, Observação ou Status fora do Status padrão. */
  mexidos: number;
  /** Linhas excluídas da Fatura, que voltam na importação nova. */
  excluidos: number;
  /** Previstos que a Fatura criou, ainda `sistema`, sem edição e não excluídos: a reimportação os apaga (História 3.5). */
  previstos?: number;
  /** Linhas da Fatura que nasceram de um previsto (não excluídas): a reimportação simples as apagaria e a RPC recusa (História 3.6). */
  casados?: number;
};

/**
 * Os números do aviso "Importar de novo" (História 3.11 simplificada), a
 * partir das linhas da Fatura do Mês lidas do banco (só as com `fatura_id`
 * dela; manuais ficam de fora). `statusPadraoId` é o de `configuracoes`
 * (null: o padrão é "sem Status"). Observação só com espaços não conta.
 */
export function resumirReimportacao(
  linhas: readonly LinhaParaReimportar[],
  statusPadraoId: string | null,
  previstosAApagar = 0,
): ResumoReimportacao {
  let quantidade = 0;
  let mexidos = 0;
  let excluidos = 0;
  let casados = 0;
  for (const l of linhas) {
    if ((l.dividido_de_id ?? null) !== null) continue;
    if (l.excluido_em !== null) {
      excluidos++;
      continue;
    }
    quantidade++;
    if ((l.casado_em ?? null) !== null) casados++;
    const mexido =
      (l.divisao ?? null) !== null ||
      l.responsavel_id !== null ||
      l.tipo_id !== null ||
      (l.observacao !== null && l.observacao.trim() !== "") ||
      (l.apelido ?? null) !== null ||
      l.status_id !== statusPadraoId;
    if (mexido) mexidos++;
  }
  return {
    quantidade,
    mexidos,
    excluidos,
    ...(previstosAApagar > 0 ? { previstos: previstosAApagar } : {}),
    ...(casados > 0 ? { casados } : {}),
  };
}
