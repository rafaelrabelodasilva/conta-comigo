// Projeções: as linhas que uma Fórmula (`avaliar`) recebe (AD-11). A Fórmula
// nunca olha direto os Lançamentos: cada tela e cada regra pede a projeção
// que lhe cabe, e o Painel, o passo a passo e a mensagem somam as mesmas
// linhas. `projetarPendente` (Épico 6) e `projetarMensagem` (4.6) virão aqui.

import { unidadesDoMes } from "./divisao";
import type { LinhaDaFormula } from "./formula";
import { linhasDoMes } from "./painel";
import { ehPrevisto } from "./previstos";

/** As colunas de `lancamentos` que a projeção do Painel lê. */
export type LancamentoParaProjetar = {
  id: string;
  mes: string;
  excluido_em: string | null;
  valor_centavos: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** Divisão (3.8): a mãe da parte; nulo na linha comum e na mãe. */
  dividido_de_id?: string | null;
  /** A Divisão da mãe; nulo na linha comum e na parte. */
  divisao?: unknown;
  /** Ajuste de centavos (2.8): a parcela dele. O Ajuste entra como linha própria, com a classificação da mãe. */
  ajuste_de_id?: string | null;
  /** `sistema` = previsto (3.5). Sem a coluna, a linha não é previsto. */
  lancado_por?: string;
};

/**
 * Os Lançamentos do Painel do Mês (FR-19): todos os não excluídos do Mês
 * (da Fatura, Contas manuais, histórico, previstos e Ajustes de centavos),
 * com as filhas de uma Divisão no lugar da mãe dividida, que nunca soma. É a
 * mesma regra das unidades da grade (`unidadesDoMes`), então o total da
 * grade filtrada por um Bloco de soma simples é o valor do Bloco.
 */
export function projetarPainel(linhas: readonly LancamentoParaProjetar[], mes: string): LinhaDaFormula[] {
  return unidadesDoMes(linhasDoMes(linhas, mes)).map((l) => ({
    id: l.id,
    valor_centavos: l.valor_centavos,
    responsavel_id: l.responsavel_id,
    tipo_id: l.tipo_id,
  }));
}

/**
 * Os previstos que a projeção do Painel traz (`lancado_por = 'sistema'`): é o
 * que os Blocos somam num Mês sem Fatura e mostram como "inclui previstos".
 */
export function idsDosPrevistos(linhas: readonly LancamentoParaProjetar[], mes: string): Set<string> {
  return new Set(
    unidadesDoMes(linhasDoMes(linhas, mes))
      .filter((l) => l.lancado_por !== undefined && ehPrevisto({ lancado_por: l.lancado_por }))
      .map((l) => l.id),
  );
}
