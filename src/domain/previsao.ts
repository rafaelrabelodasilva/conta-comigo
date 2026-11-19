// Previsão dos próximos Meses (História 7.1, FR-32, AD-1/AD-11/AD-15). Monta o que a aba "Próximos meses" desenha: o
// total dos 6 Meses seguintes ao atual, por Responsável ou por Tipo, e as Séries ainda em andamento. Puro: sem relógio,
// rede ou banco (o Mês atual entra como parâmetro); a tela chama e desenha, e nada é gravado.
//
// - Uma só projeção (AD-11): o valor de um Mês é a soma de `projetarPainel(linhas, mes)`, a mesma lista que o Painel
//   desse Mês soma no Bloco "Todos". A mãe dividida nunca soma e as filhas valem (AD-8); linha excluída nunca entra
//   (AD-16); crédito entra com o sinal; R$ 0,00 entra (uma linha, soma zero). Nenhuma regra de "o que é previsto" é
//   repetida aqui: num Mês sem Fatura as linhas do Mês são os previstos das Séries (`lancado_por = 'sistema'`) e as
//   Contas manuais (`ehPrevistoNoMes`), e é isso que o Painel soma.
// - Contas manuais (AD-15): vêm das linhas que o Cron e a RPC `salvar_conta_manual` já materializaram até o Mês atual
//   + 12 (`horizonteDasContas`), e a janela da Previsão (Mês atual + 6) cabe inteira nesse horizonte. Por isso nada
//   é "calculado e não gravado" aqui: calcular de novo (`parcelasDaConta`) ressuscitaria uma parcela excluída e
//   contaria duas vezes a que já existe.
// - O Mês atual (`mesAtual`, o do calendário em São Paulo) fica de fora: são os 6 Meses SEGUINTES (o mockup, em
//   outubro, começa em novembro). Um Mês da janela que já tem Fatura importada entra com o que o Painel mostra
//   (valores reais) e leva `temFatura`, para a tela dizer "Fatura importada".
// - Agrupar: por Responsável (na ordem do cadastro, arquivados depois) ou por Tipo (alfabética, arquivados depois). A
//   linha sem Responsável (ou sem Tipo) vira o grupo "Sem responsável" ("Sem tipo"), no fim, e entra nos totais. Só
//   aparece o grupo que tem ao menos uma linha na janela. O arquivado continua aparecendo.
// - Centavos inteiros, sem divisão: somar não arredonda nada (AD-2); o arredondamento já foi feito nas filhas.
// - Séries (`seriesEmAndamento`): as linhas com `serie_id` dos Meses depois do atual, uma Série por `serie_id`. "01/12 →
//   R$ 1.140,74 por mais 11 meses": 01/12 é a parcela do Mês atual (ou a última até ele) e 11 é `parcela_total` menos
//   essa parcela, não a quantidade de linhas gravadas (a Conta parcelada só tem 12 Meses gravados).

import { somarMeses } from "./ciclo";
import { ehFilha } from "./divisao";
import { TEXTOS_PREVISAO } from "./mensagens";
import { nomeExibido } from "./painel";
import { projetarPainel, type LancamentoParaProjetar } from "./projecoes";
import { ordenarParaConfiguracoes as ordenarResponsaveis, type Responsavel } from "./responsaveis";
import { ordenarParaConfiguracoes as ordenarTipos, type Tipo } from "./tipos";

/** Quantos Meses a Previsão mostra, a partir do Mês seguinte ao atual. */
export const MESES_DA_PREVISAO = 6;

/** Quantas Séries a lista mostra antes de "Ver todas". */
export const SERIES_VISIVEIS = 8;

export const AGRUPAMENTOS = ["responsavel", "tipo"] as const;
export type Agrupamento = (typeof AGRUPAMENTOS)[number];

/** O que a Previsão lê de um Lançamento (colunas de `lancamentos`). */
export type LancamentoParaPrever = LancamentoParaProjetar & {
  nome: string;
  apelido: string | null;
  serie_id: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
};

/** Os 6 Meses seguintes a `mesAtual` (`AAAA-MM`), em ordem. */
export function mesesDaPrevisao(mesAtual: string): string[] {
  return Array.from({ length: MESES_DA_PREVISAO }, (_, i) => somarMeses(mesAtual, i + 1));
}

/** Um Mês da janela. */
export type MesDaPrevisao = {
  mes: string;
  /** A soma líquida das linhas do Mês: o valor que o Painel mostra para o Bloco "Todos". */
  totalCentavos: number;
  /** A altura da barra: a soma dos segmentos positivos (um grupo com soma negativa não desenha segmento). */
  barraCentavos: number;
  /** Quantas linhas o Mês tem (mães divididas e excluídas não contam). */
  quantidade: number;
  /** O Mês já tem Fatura importada: os valores são os reais, não previstos. */
  temFatura: boolean;
};

/** Um grupo (um Responsável ou um Tipo) com o valor em cada Mês da janela. */
export type GrupoDaPrevisao = {
  /** O id do Responsável ou do Tipo; `"sem"` no grupo sem cadastro. */
  chave: string;
  nome: string;
  arquivado: boolean;
  /** Número da cor de pessoa (1..8); `null` no grupo "sem" (a tela usa o cinza). Em Tipo, as cores só alternam. */
  cor: number | null;
  /** Um valor por Mês, na ordem de `meses`. */
  porMes: number[];
  totalCentavos: number;
};

export type PrevisaoDosMeses = {
  agrupamento: Agrupamento;
  meses: MesDaPrevisao[];
  grupos: GrupoDaPrevisao[];
  /** Nenhuma linha em nenhum dos Meses: "Nenhum lançamento previsto para os próximos meses". */
  vazia: boolean;
  /** A maior barra (para a escala da tela); 0 se não há segmento positivo. */
  maiorBarraCentavos: number;
};

const SEM = "sem";

/**
 * A janela dos 6 Meses seguintes, agrupada. `mesesComFatura` (`AAAA-MM` das `faturas`) só marca o Mês; ele não muda a
 * soma. Responsável ou Tipo que não está no cadastro lido cai em "Sem …", para o total nunca perder uma linha.
 */
export function projetarPrevisao(
  linhas: readonly LancamentoParaProjetar[],
  opcoes: {
    mesAtual: string;
    mesesComFatura: readonly string[];
    agrupamento: Agrupamento;
    responsaveis: readonly Responsavel[];
    tipos: readonly Tipo[];
  },
): PrevisaoDosMeses {
  const { mesAtual, agrupamento } = opcoes;
  const comFatura = new Set(opcoes.mesesComFatura);
  const lista = mesesDaPrevisao(mesAtual);
  const porResponsavel = agrupamento === "responsavel";

  const cadastro = porResponsavel
    ? ordenarResponsaveis(opcoes.responsaveis).map((r) => ({ chave: r.id, nome: r.nome, arquivado: r.arquivado, cor: r.cor as number | null }))
    : ordenarTipos(opcoes.tipos).map((t) => ({ chave: t.id, nome: t.nome, arquivado: t.arquivado, cor: null as number | null }));
  const conhecidos = new Set(cadastro.map((c) => c.chave));

  const somas = new Map<string, number[]>();
  const presentes = new Set<string>();
  const meses: MesDaPrevisao[] = lista.map((mes, i) => {
    let totalCentavos = 0;
    const doMes = projetarPainel(linhas, mes);
    for (const l of doMes) {
      const id = porResponsavel ? l.responsavel_id : l.tipo_id;
      const chave = id !== null && conhecidos.has(id) ? id : SEM;
      const valores = somas.get(chave) ?? lista.map(() => 0);
      valores[i] += l.valor_centavos;
      somas.set(chave, valores);
      presentes.add(chave);
      totalCentavos += l.valor_centavos;
    }
    return { mes, totalCentavos, barraCentavos: 0, quantidade: doMes.length, temFatura: comFatura.has(mes) };
  });

  const grupos: GrupoDaPrevisao[] = [
    ...cadastro.filter((c) => presentes.has(c.chave)),
    ...(presentes.has(SEM)
      ? [{ chave: SEM, nome: porResponsavel ? TEXTOS_PREVISAO.sem_responsavel : TEXTOS_PREVISAO.sem_tipo, arquivado: false, cor: null }]
      : []),
  ].map((g, i) => {
    const porMes = somas.get(g.chave)!;
    return {
      ...g,
      // Em Tipo não há cor de cadastro: as 8 cores de pessoa alternam (a legenda e a tabela dizem o nome).
      cor: g.chave === SEM ? null : porResponsavel ? g.cor : (i % 8) + 1,
      porMes,
      totalCentavos: porMes.reduce((a, b) => a + b, 0),
    };
  });

  for (const [i, m] of meses.entries()) {
    m.barraCentavos = grupos.reduce((soma, g) => soma + Math.max(g.porMes[i], 0), 0);
  }
  return {
    agrupamento,
    meses,
    grupos,
    vazia: meses.every((m) => m.quantidade === 0),
    maiorBarraCentavos: meses.reduce((maior, m) => Math.max(maior, m.barraCentavos), 0),
  };
}

// ---------------------------------------------------------------- Séries

/** Uma Série (parcelada ou recorrente) que ainda tem Meses pela frente. */
export type SerieDaPrevisao = {
  chave: string;
  /** O Apelido, ou o Nome. */
  nome: string;
  /** A parcela do Mês atual (ou a última até ele); `null` quando a Série só começa depois. */
  parcelaAtual: number | null;
  /** `null` na Conta mensal: ela não tem fim. */
  parcelaTotal: number | null;
  /** Quantos Meses faltam (`parcelaTotal` − parcela de referência); `null` sem fim. */
  restantes: number | null;
  /** O menor e o maior Valor entre as parcelas dos próximos Meses (iguais quando o Valor não mudou). */
  menorCentavos: number;
  maiorCentavos: number;
  /** O primeiro Mês da Série quando ela só começa depois do atual (`parcelaAtual` nulo). */
  comecaEm: string | null;
};

type LinhaDeSerie = LancamentoParaPrever & { serie_id: string; parcela_n: number };

/**
 * As Séries com parcela depois de `mesAtual`, a de maior Valor primeiro. Só olha linhas não excluídas e que não são
 * filhas de uma Divisão (a mãe tem o Valor da parcela). Uma parcelada sem nenhum Mês faltando não entra.
 */
export function seriesEmAndamento(linhas: readonly LancamentoParaPrever[], mesAtual: string): SerieDaPrevisao[] {
  const porSerie = new Map<string, LinhaDeSerie[]>();
  for (const l of linhas) {
    if (l.excluido_em !== null || ehFilha(l) || l.serie_id === null || l.parcela_n === null) continue;
    const lista = porSerie.get(l.serie_id) ?? [];
    lista.push(l as LinhaDeSerie);
    porSerie.set(l.serie_id, lista);
  }

  const series: SerieDaPrevisao[] = [];
  for (const [chave, todas] of porSerie) {
    const futuras = todas.filter((l) => l.mes > mesAtual).sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
    if (futuras.length === 0) continue;
    const ate = todas.filter((l) => l.mes <= mesAtual);
    const referencia = ate.length === 0 ? null : Math.max(...ate.map((l) => l.parcela_n));
    const total = futuras[0].parcela_total;
    const primeira = Math.min(...futuras.map((l) => l.parcela_n));
    const restantes = total === null ? null : total - (referencia ?? primeira - 1);
    if (restantes !== null && restantes < 1) continue;
    const valores = futuras.map((l) => l.valor_centavos);
    series.push({
      chave,
      nome: nomeExibido(futuras[0]),
      parcelaAtual: total === null ? null : referencia,
      parcelaTotal: total,
      restantes,
      menorCentavos: Math.min(...valores),
      maiorCentavos: Math.max(...valores),
      comecaEm: referencia === null ? futuras[0].mes : null,
    });
  }
  return series.sort(
    (a, b) => b.maiorCentavos - a.maiorCentavos || a.nome.localeCompare(b.nome, "pt-BR") || (a.chave < b.chave ? -1 : 1),
  );
}

// ------------------------------------------------------------------ Abas

/** As abas da tela Previsão (UX-DR23). Só "Próximos meses" funciona na 7.1; as outras são a 7.2 e a 7.3. */
export const ABAS_DA_PREVISAO = ["proximos_meses", "evolucao", "meu_gasto"] as const;
export type AbaDaPrevisao = (typeof ABAS_DA_PREVISAO)[number];
export const ABA_PADRAO: AbaDaPrevisao = "proximos_meses";

/** A aba guardada no aparelho; qualquer valor que não seja uma aba (nada guardado, lixo) abre a primeira. */
export function lerAba(valor: unknown): AbaDaPrevisao {
  return (ABAS_DA_PREVISAO as readonly unknown[]).includes(valor) ? (valor as AbaDaPrevisao) : ABA_PADRAO;
}
