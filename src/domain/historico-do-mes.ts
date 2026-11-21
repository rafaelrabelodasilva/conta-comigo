// "Este Mês já tem histórico da planilha" (Defeito 2 da PR de correção dos 10 defeitos).
//
// As linhas `historico` (História 3.10) são o que a planilha trouxe de um Mês antigo. Importar
// uma Fatura para esse Mês, ou cadastrar uma Conta com "Começa em" nele, grava linhas novas
// POR CIMA das do histórico, e o total do Mês dobra (a RPC `importar_fatura` e a
// `materializar_contas_manuais` só olham as próprias linhas). A decisão (recomendação): AVISAR
// com o número e deixar Rafael confirmar ("Importar mesmo assim", "Salvar mesmo assim"); nada é
// apagado sozinho (AD-16). O caminho para evitar é "Apagar histórico importado" do Mês
// (Configurações → Importar planilha). A reimportação (3.12) já ignora as linhas `historico` e diz
// quantas há; esta regra é a mesma contagem, para a PRIMEIRA importação e para a Conta.
//
// Puro: recebe as linhas do Mês lidas do banco e conta; a leitura é do repositório e o texto, de
// `mensagens.ts`.

/** O que a regra lê de uma linha de Lançamento. */
export type LinhaParaHistorico = {
  mes: string;
  lancado_por: string;
  excluido_em: string | null;
  /** Só a mãe conta: as filhas de uma Divisão não são "lançamentos a mais" para quem lê. */
  dividido_de_id: string | null;
};

/** Um Mês com histórico da planilha e quantos lançamentos vivos dele há. */
export type MesComHistorico = { mes: string; quantidade: number };

const ehHistoricoVivo = (l: LinhaParaHistorico): boolean =>
  l.lancado_por === "historico" && l.excluido_em === null && (l.dividido_de_id ?? null) === null;

/** Quantos lançamentos vivos do histórico da planilha há em `mes` (0: o Mês não tem histórico). */
export function historicoDoMes(linhas: readonly LinhaParaHistorico[], mes: string): number {
  return linhas.filter((l) => l.mes === mes && ehHistoricoVivo(l)).length;
}

/**
 * Os Meses com histórico vivo, em ordem de Mês, com a quantidade. `desde` (um Mês `AAAA-MM`)
 * deixa de fora os Meses anteriores a ele: uma Conta que começa em `desde` só cai nos Meses de
 * `desde` em diante (os anteriores não recebem a Conta).
 */
export function mesesComHistorico(linhas: readonly LinhaParaHistorico[], desde?: string): MesComHistorico[] {
  const porMes = new Map<string, number>();
  for (const l of linhas) {
    if (!ehHistoricoVivo(l)) continue;
    if (desde !== undefined && l.mes < desde) continue;
    porMes.set(l.mes, (porMes.get(l.mes) ?? 0) + 1);
  }
  return [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([mes, quantidade]) => ({ mes, quantidade }));
}
