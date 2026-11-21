// O aviso da Conferência na Central de Avisos (História 8.2, FR-55, AD-13, AD-10, AD-1). Puro: as Faturas, os cartões
// lidos e os Lançamentos entram como parâmetro; o núcleo não lê relógio nem banco, e este aviso NÃO depende de "hoje".
//
// Um aviso por Fatura importada cuja Conferência não bate (`conferir`, a mesma conta da faixa âmbar do Painel e do
// selo de Recebimentos) e que NÃO foi dispensada (`alerta_dispensado_em`: quem dispensou a faixa não quer ser avisado
// de novo; a reimportação zera a dispensa e o aviso volta). Some sozinho quando a Conferência volta a bater, quando a
// Fatura é reimportada e passa a bater ou quando é dispensada. Todas as Faturas entram (a diferença de um Mês antigo
// continua sendo um problema até ser resolvida ou dispensada).
//
// A chave do aviso (`avisos_lidos`: tipo, referencia, dia) diz quando um aviso lido volta como não lido:
//
// - `tipo` = `conferencia`.
// - `referencia` = o Mês da Fatura e a diferença: `2026-11:-72000:0:8673` (diferença das despesas e dos créditos em
//   centavos, COM sinal, e os finais com diferença). É exatamente o que a frase do aviso diz (`frasesFaixaConferencia`):
//   a mesma diferença lida continua lida; uma diferença nova (reimportou e a diferença é outra, entrou ou saiu um
//   Lançamento que mexeu na soma) é outra chave e volta como não lida. Dois cartões com diferença são UM aviso por
//   Fatura (as frases já listam os finais). Cabe nos 64 caracteres da coluna (um corte final protege o caso absurdo).
// - `dia` = o fechamento da Fatura (`faturas.fechamento`; sem ele, o vencimento). Estável: não é "hoje", então o
//   aviso não muda na virada do dia.

import { conferir, type CartaoParaConferir, type Conferencia, type FaturaParaConferir, type LancamentoParaConferir } from "./conferencia";
import { destinoDoLembreteDeFechamento } from "./lembretes";

/** O limite da coluna `avisos_lidos.referencia`. */
const LIMITE_DA_REFERENCIA = 64;

/** O que o aviso usa de uma Fatura (colunas de `faturas`). */
export type FaturaParaAviso = FaturaParaConferir & {
  mes: string;
  /** `AAAA-MM-DD`; pode faltar (Fatura sem o dia lido). */
  fechamento: string | null;
  /** `AAAA-MM-DD`: o dia da chave quando o fechamento falta. */
  vencimento: string;
  alerta_dispensado_em: string | null;
};

export type AvisoDeConferencia = {
  tipo: "conferencia";
  /** O Mês e a diferença (a chave: `2026-11:-72000:0:8673`). */
  referencia: string;
  /** O id da Fatura: "Dispensar" na Central grava `alerta_dispensado_em` nela (8.3). */
  faturaId: string;
  /** O Mês da Fatura (`AAAA-MM`). */
  mes: string;
  /** O `dia` da chave: o fechamento da Fatura (ou o vencimento). */
  dia: string;
  /** A Conferência da Fatura: o texto do aviso sai dela (`frasesFaixaConferencia`). */
  conferencia: Conferencia;
  /** Onde o toque leva: o Painel do Mês. */
  destino: string;
};

/**
 * A `referencia` da chave: o Mês e a diferença como a frase a diz (despesas e créditos em centavos, com sinal, e os
 * finais com diferença). Muda quando, e só quando, a frase mudaria.
 */
export function referenciaDaConferencia(mes: string, c: Conferencia): string {
  return [mes, c.diferencaDespesasCentavos, c.diferencaCreditosCentavos, c.cartoesComDiferenca.join(",")]
    .join(":")
    .slice(0, LIMITE_DA_REFERENCIA);
}

function agrupar<T>(itens: readonly T[], chave: (item: T) => string | null): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    // Sem `fatura_id` (Lançamento sem Fatura, previsto): fora de toda Fatura.
    const c = chave(item) ?? null;
    if (c === null) continue;
    const grupo = grupos.get(c);
    if (grupo) grupo.push(item);
    else grupos.set(c, [item]);
  }
  return grupos;
}

/**
 * Os avisos de Conferência: uma Fatura que não bate e não foi dispensada, uma vez cada, do Mês mais novo para o mais
 * antigo (a mesma ordem da tabela de Meses anteriores). `lancamentos` pode ser de todos os Meses: cada Fatura confere
 * só os dela (`fatura_id`). Mesma entrada, mesma saída.
 */
export function avisosDeConferencia(
  faturas: readonly FaturaParaAviso[],
  cartoes: readonly CartaoParaConferir[],
  lancamentos: readonly LancamentoParaConferir[],
): AvisoDeConferencia[] {
  const lancamentosPorFatura = agrupar(lancamentos, (l) => l.fatura_id);
  const cartoesPorFatura = agrupar(cartoes, (c) => c.fatura_id);
  return [...faturas]
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((f) => {
      if (f.alerta_dispensado_em !== null) return [];
      const conferencia = conferir(f, cartoesPorFatura.get(f.id) ?? [], lancamentosPorFatura.get(f.id) ?? []);
      if (conferencia.conferido) return [];
      return [
        {
          tipo: "conferencia" as const,
          referencia: referenciaDaConferencia(f.mes, conferencia),
          faturaId: f.id,
          mes: f.mes,
          dia: f.fechamento ?? f.vencimento,
          conferencia,
          destino: destinoDoLembreteDeFechamento(f.mes),
        },
      ];
    });
}
