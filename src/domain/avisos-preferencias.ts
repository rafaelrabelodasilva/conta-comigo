// Interruptor dos avisos da Conferência e do Revisar (História 8.3, FR-55, AD-13, AD-10, AD-1). Puro: as Faturas, os cartões
// lidos, os Lançamentos, a fila do Revisar e as preferências entram como parâmetro; o núcleo não lê relógio nem banco.
//
// Estes dois tipos de aviso (`conferencia` e `revisar`, 8.2) NÃO são lembretes: existem só dentro da Central de Avisos
// e nunca viram notificação do sistema. Por isso as preferências deles são outro tipo (`PreferenciasDeAvisos`, colunas
// `aviso_conferencia` e `aviso_revisar` de `configuracoes`) e não entram em `PreferenciasDeLembretes`, que é o que o Cron
// lê (`lembretesDasLinhas`): o Cron não sabe que elas existem.
//
// Tipo desligado: o aviso não aparece na Central, não conta no menu e não entra em "Marcar tudo", porque o filtro vale
// ANTES de `avisosDaCentral` (como `lembretesDoDia` faz com os lembretes): o tipo desligado nem é calculado. O contador
// "para revisar" do item Revisar do menu é a fila de trabalho, não o aviso, e não muda. A linha de `avisos_lidos` de um
// aviso desligado continua no banco: ao religar, a chave dá o mesmo estado de antes (lido continua lido).

import type { AvisoDeConferencia, FaturaParaAviso } from "./avisos-conferencia";
import { avisosDeConferencia } from "./avisos-conferencia";
import { avisoDoRevisar, type AvisoDoRevisar, type LinhaParaAvisoDoRevisar } from "./avisos-revisar";
import type { CartaoParaConferir, LancamentoParaConferir } from "./conferencia";

/** Os tipos de aviso que têm interruptor próprio e não são lembretes, na ordem em que a Central os mostra. */
export const TIPOS_DE_AVISO_COM_INTERRUPTOR = ["conferencia", "revisar"] as const;

export type TipoDeAvisoComInterruptor = (typeof TIPOS_DE_AVISO_COM_INTERRUPTOR)[number];

/** Cada tipo pode ser ligado ou desligado em Configurações → Aparência (FR-55). */
export type PreferenciasDeAvisos = Record<TipoDeAvisoComInterruptor, boolean>;

/** Os dois ligados: o padrão do banco e o que vale enquanto as colunas ainda não existem (entre o merge e o `db push`). */
export const PREFERENCIAS_DE_AVISOS_PADRAO: PreferenciasDeAvisos = { conferencia: true, revisar: true };

/** As colunas de `configuracoes` que dizem quais avisos estão ligados; ausente ou nula vale ligado. */
export type LinhaDePreferenciasDeAvisos = {
  aviso_conferencia?: boolean | null;
  aviso_revisar?: boolean | null;
};

/** As preferências de uma linha de `configuracoes` (ou de nenhuma): coluna ausente ou nula = ligado. */
export function preferenciasDeAvisos(linha: LinhaDePreferenciasDeAvisos | null | undefined): PreferenciasDeAvisos {
  return {
    conferencia: linha?.aviso_conferencia ?? PREFERENCIAS_DE_AVISOS_PADRAO.conferencia,
    revisar: linha?.aviso_revisar ?? PREFERENCIAS_DE_AVISOS_PADRAO.revisar,
  };
}

/** Os avisos que não são lembretes, já com as preferências aplicadas: a Conferência (uma por Fatura) e o do Revisar. */
export type AvisosDeTrabalho = (AvisoDeConferencia | AvisoDoRevisar)[];

/**
 * A Conferência e o Revisar que a Central mostra: um tipo desligado nas `preferencias` não aparece e nem é calculado.
 * `faturas` e `lancamentos` são todos os Meses (cada Fatura confere só os dela); `fila` é a fila do Revisar. A ordem é
 * a de `avisosDaCentral` (que ordena por tipo); aqui, Conferência e depois Revisar. Mesma entrada, mesma saída.
 */
export function avisosDeTrabalho(
  faturas: readonly (FaturaParaAviso & { created_at: string })[],
  cartoes: readonly (CartaoParaConferir & { created_at: string })[],
  lancamentos: readonly LancamentoParaConferir[],
  fila: readonly LinhaParaAvisoDoRevisar[],
  preferencias: PreferenciasDeAvisos,
): AvisosDeTrabalho {
  const saida: AvisosDeTrabalho = [];
  if (preferencias.conferencia) saida.push(...avisosDeConferencia(faturas, cartoes, lancamentos));
  if (preferencias.revisar) {
    const doRevisar = avisoDoRevisar(fila, faturas, cartoes);
    if (doRevisar !== null) saida.push(doRevisar);
  }
  return saida;
}
