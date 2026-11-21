// O aviso da fila do Revisar na Central de Avisos (História 8.2, FR-55, AD-13, AD-10, AD-1). Puro: as linhas da fila e as
// Faturas entram como parâmetro; o núcleo não lê relógio nem banco, e este aviso NÃO depende de "hoje".
//
// Um aviso só, "17 lançamentos para revisar", quando há itens na fila. O número vem do MESMO `contarFila`/`ehDaFila` do
// contador do menu e do "Faltam N" do Revisar (nunca uma segunda conta). Some quando a fila zera.
//
// A chave do aviso (`avisos_lidos`: tipo, referencia, dia) diz quando um aviso lido volta como não lido:
//
// - `tipo` = `revisar`, `referencia` = `fila` (fixa: é um aviso só).
// - `dia` = o dia (em São Paulo) da última importação ou reimportação de uma Fatura: o maior `created_at` entre as
//   Faturas e os cartões delas (`fatura_cartoes`). O número de itens NÃO entra na chave: classificar itens (a fila
//   baixa) não traz o aviso de volta, e o Revisar já mostra o "Faltam N". Entra uma Fatura nova ou reimportada: outro
//   dia, o aviso volta como não lido (se foi no mesmo dia do que já foi lido, continua lido: custo registrado). A fila
//   zera e enche de novo sem importação (o "Desfazer" do Classificado): mesma chave, continua como estava.
//   Por que `created_at` e não `faturas.updated_at` (Defeito 5, que revê a decisão 4 da 8.2): "Dispensar" e o
//   "Desfazer" da faixa da Conferência gravam `faturas.alerta_dispensado_em` e o gatilho sobe o `updated_at`, então
//   o aviso lido voltava como novo sem importação nenhuma. A importação cria a Fatura (`created_at` novo) e a
//   reimportação apaga os cartões e grava de novo (`created_at` novo), e nenhuma dessas colunas muda ao dispensar:
//   o sinal é o mesmo de antes sem a migração de uma coluna "importada em". A data só sobe (monotônica), como antes.
//   Custo que fica: uma importação que não traz item para a fila também muda a chave (é uma importação de verdade),
//   e, uma única vez depois do deploy, a chave de quem já tinha lido o aviso pode mudar de dia (antes era o dia do
//   `updated_at`).
// - Sem nenhuma Fatura (só histórico da planilha ou Lançamentos à mão na fila), o dia é `DIA_SEM_IMPORTACAO`: o aviso
//   existe, e depois de lido só volta com uma Fatura importada.

import { diaDoInstanteEmSaoPaulo } from "./datas";
import type { MotivoRevisao } from "./classificacao";
import { contarFila } from "./revisar";

/** A `referencia` fixa do aviso da fila (um aviso só). */
export const REFERENCIA_DO_AVISO_DO_REVISAR = "fila";

/** Onde o toque leva. */
export const DESTINO_DO_AVISO_DO_REVISAR = "/revisar";

/** O `dia` quando não há Fatura importada. */
export const DIA_SEM_IMPORTACAO = "1970-01-01";

/** O que `ehDaFila` lê de uma linha de `lancamentos` (a fila do gerenciador também traz Ajustes, que não contam). */
export type LinhaParaAvisoDoRevisar = {
  excluido_em: string | null;
  ajuste_de_id: string | null;
  revisao_motivo: MotivoRevisao | null;
  dividido_de_id?: string | null;
};

export type AvisoDoRevisar = {
  tipo: "revisar";
  /** Sempre `fila`. */
  referencia: typeof REFERENCIA_DO_AVISO_DO_REVISAR;
  /** O `dia` da chave: a última importação ou reimportação. */
  dia: string;
  /** Quantos itens estão na fila (`contarFila`, o número do menu e do "Faltam N"). */
  quantidade: number;
  /** Onde o toque leva: `/revisar`. */
  destino: typeof DESTINO_DO_AVISO_DO_REVISAR;
};

/**
 * O aviso da fila, ou `null` quando ela está vazia. `linhasDaFila` são as do gerenciador da fila (as que `ehDaFila`
 * aceita, mais os Ajustes: só as primeiras contam); `faturas` e `cartoes` (os `fatura_cartoes`) dão o dia da última
 * importação. Mesma entrada, mesma saída.
 */
export function avisoDoRevisar(
  linhasDaFila: readonly LinhaParaAvisoDoRevisar[],
  faturas: readonly { created_at: string }[],
  cartoes: readonly { created_at: string }[] = [],
): AvisoDoRevisar | null {
  const quantidade = contarFila(linhasDaFila);
  if (quantidade === 0) return null;
  let dia = DIA_SEM_IMPORTACAO;
  for (const f of [...faturas, ...cartoes]) {
    const d = diaDoInstanteEmSaoPaulo(f.created_at);
    if (d !== null && d > dia) dia = d;
  }
  return {
    tipo: "revisar",
    referencia: REFERENCIA_DO_AVISO_DO_REVISAR,
    dia,
    quantidade,
    destino: DESTINO_DO_AVISO_DO_REVISAR,
  };
}
