// Central de Avisos (História 8.1, 8.2, FR-55, AD-13, AD-10, AD-1). Puro: os avisos do dia (os lembretes de
// `lembretesDasLinhas`, a mesma função do Cron, a diferença da Conferência e a fila do Revisar) e as chaves já lidas
// entram como parâmetro; o núcleo não lê relógio nem banco.
//
// Um aviso da Central é uma origem (lembrete, Conferência ou Revisar) mais "lido ou não". O "lido" vale em todos os
// aparelhos e mora em `avisos_lidos`; a chave é `(tipo, referencia, dia)`, a MESMA do aviso do sistema para os lembretes
// (`chaveDeNotificacao`):
//
// - fechamento: Mês da Fatura + dia do fechamento. Lido uma vez, fica lido durante toda a janela do lembrete.
// - atraso: id do Bloco + "desde". O atraso que continua e já foi lido FICA lido (mesma chave); um atraso novo
//   (o Bloco quitou e atrasou de novo) ou um "desde" que mudou (quitou o mais antigo com outro ainda atrasado)
//   é outra chave e VOLTA como não lido. Só o valor mudar (Pagamento parcial) não muda a chave.
// - conferencia (8.2, `avisos-conferencia.ts`): Mês e diferença + fechamento da Fatura. A mesma diferença lida
//   continua lida; uma diferença nova volta como não lida.
// - revisar (8.2, `avisos-revisar.ts`): `fila` + o dia da última importação. Classificar itens não traz o aviso de
//   volta; uma importação nova, sim.
// - um aviso que deixa de existir (Bloco quitou, Fatura importada, Conferência bateu ou dispensada, fila zerada) some
//   da lista e do contador; a linha lida continua no banco e não conta para nada.
//
// Esta função é a única dona da regra: a ordem (não lidos primeiro, depois a ordem dos tipos: Conferência, Revisar,
// fechamento, atraso por Bloco; dentro do tipo, a ordem recebida), a contagem de não lidos e as chaves que "Marcar tudo
// como lido" grava. A tela e o menu só chamam; nenhuma contagem mora em tela ou em SQL. Os avisos da Conferência e do
// Revisar existem só dentro do app: o Cron e a notificação do sistema usam só os lembretes (`lembretesParaNotificar`).

import type { AvisoDeConferencia } from "./avisos-conferencia";
import type { AvisoDoRevisar } from "./avisos-revisar";
import { chaveDeNotificacao, textoDaChaveDeNotificacao, type Lembrete } from "./lembretes";

/**
 * Os tipos de aviso, na ordem em que a Central os mostra: o que bloqueia a leitura dos dados (a Fatura que não bate, o
 * que falta classificar) vem antes dos lembretes de calendário (fechamento) e de cobrança (atraso por Bloco).
 */
export const TIPOS_DE_AVISO = ["conferencia", "revisar", "fechamento", "atraso"] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** De onde o aviso vem: um lembrete (7.4), a diferença da Conferência ou a fila do Revisar (8.2). */
export type OrigemDoAviso = Lembrete | AvisoDeConferencia | AvisoDoRevisar;

/** A chave de um aviso: `avisos_lidos` e a Central usam a mesma forma. */
export type ChaveDeAviso = { tipo: TipoDeAviso; referencia: string; dia: string };

/**
 * Uma linha de `avisos_lidos` (só a chave). `tipo` é texto livre: uma linha de um tipo que este código ainda não
 * conhece (uma história futura) simplesmente não casa com nenhum aviso.
 */
export type ChaveLida = { tipo: string; referencia: string; dia: string };

/** Um aviso da Central: a origem, a chave que o identifica e se já foi lido. */
export type AvisoDaCentral = {
  chave: ChaveDeAviso;
  origem: OrigemDoAviso;
  lido: boolean;
};

export type CentralDeAvisos = {
  /** Não lidos primeiro, depois os lidos; dentro de cada grupo, a ordem dos tipos. Todos, sem limite. */
  avisos: AvisoDaCentral[];
  /** Quantos não lidos (o contador do menu). */
  naoLidos: number;
  /** As chaves que "Marcar tudo como lido" grava, na ordem da lista (sem repetir). */
  chavesNaoLidas: ChaveDeAviso[];
  /** Quantos Blocos têm item atrasado, lidos ou não (o resumo do topo: o atraso é um estado). */
  blocosAtrasados: number;
};

/** A chave de uma origem: a do lembrete (`chaveDeNotificacao`) ou a que a Conferência e o Revisar já trazem. */
export function chaveDoAviso(origem: OrigemDoAviso): ChaveDeAviso {
  if (origem.tipo === "conferencia" || origem.tipo === "revisar") {
    return { tipo: origem.tipo, referencia: origem.referencia, dia: origem.dia };
  }
  return chaveDeNotificacao(origem);
}

const POSICAO_DO_TIPO = new Map<TipoDeAviso, number>(TIPOS_DE_AVISO.map((t, i) => [t, i]));

/**
 * Os avisos da Central. `origens` são os lembretes (de `lembretesDasLinhas`: já respeitam as preferências, então um tipo
 * desligado não aparece, não conta e não notifica), os avisos de Conferência (`avisosDeConferencia`) e o do Revisar
 * (`avisoDoRevisar`), em qualquer ordem: a ordem entre os tipos é daqui (`TIPOS_DE_AVISO`) e, dentro de um tipo, a
 * recebida. `lidos` são as chaves de `avisos_lidos`. Mesma entrada, mesma saída. Origens com a mesma chave valem uma só
 * (a chave é única no banco, e "Marcar tudo" é um pedido em lote que não pode repetir linha).
 */
export function avisosDaCentral(origens: readonly OrigemDoAviso[], lidos: readonly ChaveLida[]): CentralDeAvisos {
  const jaLidos = new Set(lidos.map(textoDaChaveDeNotificacao));
  const vistos = new Set<string>();
  const naoLidos: AvisoDaCentral[] = [];
  const lidosDaLista: AvisoDaCentral[] = [];
  let blocosAtrasados = 0;
  // `sort` é estável: dentro do mesmo tipo, a ordem recebida.
  const ordenadas = [...origens].sort(
    (a, b) => (POSICAO_DO_TIPO.get(a.tipo) ?? 0) - (POSICAO_DO_TIPO.get(b.tipo) ?? 0),
  );
  for (const origem of ordenadas) {
    const chave = chaveDoAviso(origem);
    const texto = textoDaChaveDeNotificacao(chave);
    if (vistos.has(texto)) continue;
    vistos.add(texto);
    if (origem.tipo === "atraso") blocosAtrasados += 1;
    const lido = jaLidos.has(texto);
    (lido ? lidosDaLista : naoLidos).push({ chave, origem, lido });
  }
  return {
    avisos: [...naoLidos, ...lidosDaLista],
    naoLidos: naoLidos.length,
    chavesNaoLidas: naoLidos.map((a) => a.chave),
    blocosAtrasados,
  };
}

/** Acima disto o contador do menu mostra "99+". */
export const LIMITE_DO_CONTADOR_DE_AVISOS = 99;
