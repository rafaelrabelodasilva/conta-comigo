// Ciclo do cartão e Mês (AD-9, História 1.7). Funções puras: "hoje" entra
// como parâmetro (ou sai de `hojeEmSaoPaulo(agora)`, que recebe o instante);
// o núcleo não lê relógio.
//
// - Mês = mês do vencimento da Fatura, no formato `AAAA-MM`.
// - Para `{fechamento F, vencimento V}`, o fechamento do Mês M fica em M se
//   V > F, senão em M−1. Dia que não existe no mês vira o último dia.
// - A configuração vigente no Mês M é a de maior (vigente_desde, created_at)
//   com vigente_desde ≤ M; antes da primeira, vale a primeira.
// - Mês de uma data = o menor M cujo fechamento (pela vigente em M) é ≥ data.

import type { Resultado } from "./resultado";

/** Dia de fechamento e de vencimento (1 a 31). */
export type DiasCiclo = {
  dia_fechamento: number;
  dia_vencimento: number;
};

/** Uma linha do histórico do Ciclo. `created_at` desempata o mesmo `vigente_desde`. */
export type ConfigCiclo = DiasCiclo & {
  vigente_desde: string;
  created_at: string;
};

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const dois = (n: number) => String(n).padStart(2, "0");

function partesMes(mes: string): { ano: number; mes: number } {
  const m = MES.exec(mes);
  if (!m) throw new Error(`Mês inválido: ${mes}`);
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

export function ehMes(valor: string): boolean {
  return MES.test(valor);
}

/** `AAAA-MM-DD` que existe no calendário (29/02 só em ano bissexto). */
export function ehData(valor: string): boolean {
  const m = DATA.exec(valor);
  if (!m) return false;
  return Number(m[3]) <= diasNoMes(`${m[1]}-${m[2]}`);
}

/** "Hoje" (`AAAA-MM-DD`) em America/Sao_Paulo no instante `agora`. */
export function hojeEmSaoPaulo(agora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/** Mês de calendário (`AAAA-MM`) de uma data `AAAA-MM-DD`. */
export function mesDaData(data: string): string {
  return data.slice(0, 7);
}

/** `mes` + `n` meses (n pode ser negativo). */
export function somarMeses(mes: string, n: number): string {
  const { ano, mes: m } = partesMes(mes);
  const total = ano * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${dois((total % 12) + 1)}`;
}

/** Quantos dias tem o mês. */
export function diasNoMes(mes: string): number {
  const { ano, mes: m } = partesMes(mes);
  if (m === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** A data do `dia` dentro de `mes`; dia que não existe vira o último dia. */
export function diaNoMes(mes: string, dia: number): string {
  return `${mes}-${dois(Math.min(dia, diasNoMes(mes)))}`;
}

/** "Out/26". */
export function formatarMes(mes: string): string {
  const { ano, mes: m } = partesMes(mes);
  return `${NOMES_MES[m - 1]}/${dois(ano % 100)}`;
}

/** "02/11/26". */
export function formatarData(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(2, 4)}`;
}

function comparar(a: ConfigCiclo, b: ConfigCiclo): number {
  if (a.vigente_desde !== b.vigente_desde) return a.vigente_desde < b.vigente_desde ? -1 : 1;
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}

/**
 * A configuração que vale no Mês `mes`: a de maior (vigente_desde,
 * created_at) com vigente_desde ≤ mes; antes da primeira, a primeira.
 * Sem nenhuma, `undefined`.
 */
export function configVigente<C extends ConfigCiclo>(mes: string, configs: readonly C[]): C | undefined {
  const ordenadas = [...configs].sort(comparar);
  if (ordenadas.length === 0) return undefined;
  // Antes da primeira, vale a primeira: a mais nova do primeiro vigente_desde.
  const alvo = mes < ordenadas[0].vigente_desde ? ordenadas[0].vigente_desde : mes;
  let vigente: C | undefined;
  for (const c of ordenadas) {
    if (c.vigente_desde <= alvo) vigente = c;
  }
  return vigente;
}

/** Data (`AAAA-MM-DD`) do fechamento do Mês `mes`: em `mes` se V > F, senão no anterior. */
export function fechamentoDoMes(mes: string, dias: DiasCiclo): string {
  const mesFechamento = dias.dia_vencimento > dias.dia_fechamento ? mes : somarMeses(mes, -1);
  return diaNoMes(mesFechamento, dias.dia_fechamento);
}

/**
 * Mês de um Lançamento feito à mão com `data` (`AAAA-MM-DD`): o menor Mês
 * cujo fechamento, pela configuração vigente nele, é ≥ `data`. No dia do
 * fechamento a data fica no Mês; no dia seguinte, vai para o seguinte.
 */
export function mesDoLancamento(data: string, configs: readonly ConfigCiclo[]): Resultado<string> {
  if (!ehData(data)) return { ok: false, erro: { codigo: "ciclo.data_invalida" } };
  if (configs.length === 0) return { ok: false, erro: { codigo: "ciclo.sem_configuracao" } };
  // O fechamento do Mês M fica em M ou M−1: começando dois Meses antes do
  // mês da data, a busca termina em poucos passos.
  let mes = somarMeses(mesDaData(data), -2);
  for (let i = 0; i < 6; i++, mes = somarMeses(mes, 1)) {
    const vigente = configVigente(mes, configs)!;
    if (fechamentoDoMes(mes, vigente) >= data) return { ok: true, valor: mes };
  }
  // Inalcançável: o fechamento do Mês (data + 2) é sempre depois da data.
  return { ok: false, erro: { codigo: "ciclo.data_invalida" } };
}

/** Vencimento (`AAAA-MM-DD`) do Mês pelo Ciclo vigente nele. A Fatura importada terá prioridade (Épico 2). */
export function vencimentoDoMes(mes: string, configs: readonly ConfigCiclo[]): Resultado<string> {
  if (!ehMes(mes)) return { ok: false, erro: { codigo: "ciclo.mes_invalido" } };
  const vigente = configVigente(mes, configs);
  if (!vigente) return { ok: false, erro: { codigo: "ciclo.sem_configuracao" } };
  return { ok: true, valor: diaNoMes(mes, vigente.dia_vencimento) };
}

/**
 * Mês a partir do qual vale uma mudança do Ciclo salva em `hoje`: o Mês
 * seguinte ao de `hoje`. Sem configuração anterior, a primeira vale já para
 * o Mês de `hoje`, calculado com os dias novos (`nova`).
 */
export function vigenteDesdeDaMudanca(
  hoje: string,
  configs: readonly ConfigCiclo[],
  nova: DiasCiclo,
): Resultado<string> {
  if (configs.length === 0) {
    return mesDoLancamento(hoje, [{ ...nova, vigente_desde: mesDaData(hoje), created_at: "1970-01-01T00:00:00Z" }]);
  }
  const atual = mesDoLancamento(hoje, configs);
  if (!atual.ok) return atual;
  return { ok: true, valor: somarMeses(atual.valor, 1) };
}

/** Dia digitado (1 a 31, inteiro). */
export function validarDia(texto: string): Resultado<number> {
  const limpo = texto.trim();
  if (!/^\d{1,2}$/.test(limpo)) return { ok: false, erro: { codigo: "ciclo.dia_invalido" } };
  const dia = Number(limpo);
  if (dia < 1 || dia > 31) return { ok: false, erro: { codigo: "ciclo.dia_invalido" } };
  return { ok: true, valor: dia };
}

/**
 * O que salvar quando Rafael grava `nova` em `hoje`: a linha a inserir, ou
 * `null` se os dias já são os que valeriam naquele Mês (nada a gravar).
 */
export function planejarMudancaCiclo(
  hoje: string,
  configs: readonly ConfigCiclo[],
  nova: DiasCiclo,
): Resultado<(DiasCiclo & { vigente_desde: string }) | null> {
  for (const dia of [nova.dia_fechamento, nova.dia_vencimento]) {
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      return { ok: false, erro: { codigo: "ciclo.dia_invalido" } };
    }
  }
  const desde = vigenteDesdeDaMudanca(hoje, configs, nova);
  if (!desde.ok) return desde;
  const valeria = configs.length === 0 ? undefined : configVigente(desde.valor, configs);
  if (
    valeria &&
    valeria.dia_fechamento === nova.dia_fechamento &&
    valeria.dia_vencimento === nova.dia_vencimento
  ) {
    return { ok: true, valor: null };
  }
  return {
    ok: true,
    valor: {
      dia_fechamento: nova.dia_fechamento,
      dia_vencimento: nova.dia_vencimento,
      vigente_desde: desde.valor,
    },
  };
}

/**
 * O que a tela do Ciclo mostra em `hoje`: o Mês de hoje com a configuração
 * que vale nele e, se já houver uma mudança salva para depois, o Mês em que
 * ela começa e os dias dela.
 */
export function resumoDoCiclo<C extends ConfigCiclo>(
  hoje: string,
  configs: readonly C[],
): { atual: { mes: string; config: C } | null; proxima: { mes: string; config: C } | null } {
  const mes = mesDoLancamento(hoje, configs);
  if (!mes.ok) return { atual: null, proxima: null };
  const atual = { mes: mes.valor, config: configVigente(mes.valor, configs)! };
  const futuras = configs.filter((c) => c.vigente_desde > mes.valor);
  if (futuras.length === 0) return { atual, proxima: null };
  const inicio = futuras.reduce((m, c) => (c.vigente_desde < m ? c.vigente_desde : m), futuras[0].vigente_desde);
  return { atual, proxima: { mes: inicio, config: configVigente(inicio, configs)! } };
}
