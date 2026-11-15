// Materialização diária das Contas manuais (História 5.3, FR-17, AD-13, AD-15).
// O cron lê as Contas (linhas cruas de `contas_manuais`), e este módulo decide
// o que pedir ao banco: um pedido por Conta, com as parcelas até o Mês atual
// + 12 (`parcelasDaConta`, a única regra de quais parcelas existem). A rota e
// o SQL não reimplementam nada daqui. Puro: o Mês atual entra como parâmetro
// (a rota o tira do relógio em America/Sao_Paulo com `hojeEmSaoPaulo` e
// `mesAtual`).
//
// - Uma Conta ilegível (linha que não bate com o formato, Divisão que não vale
//   para o Valor, Mês ou repetição inválidos) é pulada e contada; nunca derruba
//   as outras (decisão 3 da spec).
// - Um pedido por Conta, não um por dono: cada chamada é uma transação do
//   banco, então o defeito de uma Conta não desfaz as outras.
// - A Conta Encerrada (`encerrada_em_mes`) e a que já acabou geram o que
//   `parcelasDaConta` gera (nada depois do encerramento, nada além do total);
//   uma Conta sem parcelas a pedir não gera pedido.
// - O pedido é sempre o mesmo para o mesmo Mês: o banco é quem sabe o que já
//   existe (`on conflict ... do nothing`), então rodar de novo pede as mesmas
//   parcelas e não cria nada.

import { ehMes } from "./ciclo";
import {
  contaLegivel,
  horizonteDasContas,
  pedidoMaterializarDoDono,
  type ContaParaParcelas,
  type PedidoMaterializarDoDono,
  type RepeticaoConta,
} from "./contas-manuais";

/** Um pedido de materialização: uma Conta de um dono. */
export type PedidoDoCron = {
  owner_id: string;
  conta_id: string;
  pedido: PedidoMaterializarDoDono;
};

export type PlanoDoCron = {
  /** O último Mês que o cron materializa: o Mês atual + 12. */
  ate_mes: string;
  /** Quantas linhas de Conta vieram do banco. */
  contas: number;
  /** As que não deram para ler (puladas, sem pedido). */
  ilegiveis: number;
  /** Um pedido por Conta com parcelas a pedir, em ordem estável (dono, Conta). */
  pedidos: PedidoDoCron[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPETICOES: ReadonlySet<string> = new Set<RepeticaoConta>(["mensal", "parcelas"]);

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Lê uma linha de `contas_manuais` como veio do banco. Devolve `null` quando o
 * formato não bate ou a Conta não é legível para `parcelasDaConta`. Os campos
 * que não servem às parcelas (Nome, Tipo, Observação) nem são lidos: o cron
 * não precisa deles e eles não entram em pedido, resposta ou log.
 */
export function lerContaDoCron(linha: unknown): { owner_id: string; conta: ContaParaParcelas } | null {
  if (!ehObjeto(linha)) return null;
  const { id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes } = linha;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof owner_id !== "string" || !UUID.test(owner_id)) return null;
  if (typeof valor_centavos !== "number") return null;
  if (typeof mes_inicial !== "string" || !ehMes(mes_inicial)) return null;
  if (typeof repeticao !== "string" || !REPETICOES.has(repeticao)) return null;
  if (parcela_total !== null && !Number.isSafeInteger(parcela_total)) return null;
  if (encerrada_em_mes !== null && (typeof encerrada_em_mes !== "string" || !ehMes(encerrada_em_mes))) return null;

  const conta: ContaParaParcelas = {
    id,
    valor_centavos,
    mes_inicial,
    repeticao: repeticao as RepeticaoConta,
    parcela_total: parcela_total as number | null,
    divisao: divisao ?? null,
    encerrada_em_mes: encerrada_em_mes as string | null,
  };
  return contaLegivel(conta) ? { owner_id, conta } : null;
}

/**
 * O que o cron pede ao banco, dado o que leu de `contas_manuais` e o Mês atual
 * (`AAAA-MM`, em America/Sao_Paulo): um pedido por Conta legível com parcelas,
 * até `horizonteDasContas(mesAtual)`.
 */
export function planoDoCron(linhas: readonly unknown[], mesAtual: string): PlanoDoCron {
  const ateMes = horizonteDasContas(mesAtual);
  const lidas: { owner_id: string; conta: ContaParaParcelas }[] = [];
  let ilegiveis = 0;
  for (const linha of linhas) {
    const lida = lerContaDoCron(linha);
    if (lida === null) ilegiveis++;
    else lidas.push(lida);
  }
  lidas.sort((a, b) => (a.owner_id === b.owner_id ? cmp(a.conta.id, b.conta.id) : cmp(a.owner_id, b.owner_id)));

  const pedidos: PedidoDoCron[] = [];
  for (const { owner_id, conta } of lidas) {
    const pedido = pedidoMaterializarDoDono(owner_id, [conta], ateMes);
    if (pedido.p_parcelas.length === 0) continue;
    pedidos.push({ owner_id, conta_id: conta.id, pedido });
  }
  return { ate_mes: ateMes, contas: linhas.length, ilegiveis, pedidos };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
