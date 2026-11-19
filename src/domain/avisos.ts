// Central de Avisos (História 8.1, FR-55, AD-13, AD-10, AD-1). Puro: os lembretes do dia (`lembretesDasLinhas`,
// a mesma função do Cron) e as chaves já lidas entram como parâmetro; o núcleo não lê relógio nem banco.
//
// Um aviso da Central é um lembrete mais "lido ou não". O "lido" vale em todos os aparelhos e mora em
// `avisos_lidos`, com a MESMA chave do aviso do sistema (`chaveDeNotificacao`: `tipo`, `referencia`, `dia`):
//
// - fechamento: Mês da Fatura + dia do fechamento. Lido uma vez, fica lido durante toda a janela do lembrete.
// - atraso: id do Bloco + "desde". O atraso que continua e já foi lido FICA lido (mesma chave); um atraso novo
//   (o Bloco quitou e atrasou de novo) ou um "desde" que mudou (quitou o mais antigo com outro ainda atrasado)
//   é outra chave e VOLTA como não lido. Só o valor mudar (Pagamento parcial) não muda a chave.
// - um aviso que deixa de existir (Bloco quitou, Fatura importada) some da lista e do contador; a linha lida
//   continua no banco e não conta para nada.
//
// Esta função é a única dona da regra: a ordem (não lidos primeiro, depois a ordem do lembrete: fechamento e,
// por Bloco, a ordem dos Blocos), a contagem de não lidos e as chaves que "Marcar tudo como lido" grava. A tela
// e o menu só chamam; nenhuma contagem mora em tela ou em SQL. O formato é extensível por `tipo` (a História 8.2
// acrescenta a diferença da Conferência e a fila do Revisar sem mexer nesta regra: um tipo novo é outro
// lembrete com outra chave).

import { chaveDeNotificacao, textoDaChaveDeNotificacao, type ChaveDeNotificacao, type Lembrete } from "./lembretes";

/**
 * Uma linha de `avisos_lidos` (só a chave). `tipo` é texto livre: uma linha de um tipo que este código ainda não
 * conhece (uma história futura) simplesmente não casa com nenhum aviso.
 */
export type ChaveLida = { tipo: string; referencia: string; dia: string };

/** Um aviso da Central: o lembrete, a chave que o identifica e se já foi lido. */
export type AvisoDaCentral = {
  chave: ChaveDeNotificacao;
  lembrete: Lembrete;
  lido: boolean;
};

export type CentralDeAvisos = {
  /** Não lidos primeiro, depois os lidos; dentro de cada grupo, a ordem dos lembretes. Todos, sem limite. */
  avisos: AvisoDaCentral[];
  /** Quantos não lidos (o contador do menu). */
  naoLidos: number;
  /** As chaves que "Marcar tudo como lido" grava, na ordem da lista (sem repetir). */
  chavesNaoLidas: ChaveDeNotificacao[];
  /** Quantos Blocos têm item atrasado, lidos ou não (o resumo do topo: o atraso é um estado). */
  blocosAtrasados: number;
};

/**
 * Os avisos da Central. `lembretes` vem de `lembretesDasLinhas` (já respeita as preferências: um tipo desligado
 * não chega aqui, então não aparece, não conta e não notifica); `lidos` são as chaves de `avisos_lidos`. Mesma
 * entrada, mesma saída. Lembretes com a mesma chave valem um só (a chave é única no banco, e "Marcar tudo" é um
 * pedido em lote que não pode repetir linha).
 */
export function avisosDaCentral(lembretes: readonly Lembrete[], lidos: readonly ChaveLida[]): CentralDeAvisos {
  const jaLidos = new Set(lidos.map(textoDaChaveDeNotificacao));
  const vistos = new Set<string>();
  const naoLidos: AvisoDaCentral[] = [];
  const lidosDaLista: AvisoDaCentral[] = [];
  let blocosAtrasados = 0;
  for (const lembrete of lembretes) {
    const chave = chaveDeNotificacao(lembrete);
    const texto = textoDaChaveDeNotificacao(chave);
    if (vistos.has(texto)) continue;
    vistos.add(texto);
    if (lembrete.tipo === "atraso") blocosAtrasados += 1;
    const lido = jaLidos.has(texto);
    (lido ? lidosDaLista : naoLidos).push({ chave, lembrete, lido });
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
