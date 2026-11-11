// Formatos de data, hora e Mês (AD-2, NFR4). Toda tela mostra datas por
// aqui: "06/11/26", "21:14", "Out/26" e "outubro/26". O fuso é sempre
// America/Sao_Paulo; o `Intl.DateTimeFormat` só é usado neste arquivo (o
// lint recusa em qualquer outro). O núcleo não lê relógio: o instante entra
// como parâmetro.

const FUSO = "America/Sao_Paulo";

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Instante com fuso explícito no fim ("Z", "±HH:MM", "±HHMM" ou "±HH"): sem
// ele, o horário dependeria do fuso do aparelho. Aceita o formato do
// PostgREST ("2026-11-02T12:00:00.123456+00:00") e o do Realtime
// ("2026-11-02 12:00:00.123456+00").
const INSTANTE_COM_FUSO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/;

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const NOMES_MES_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Número com dois dígitos: 6 → "06". */
export const dois = (n: number) => String(n).padStart(2, "0");

/** Ano e mês (1 a 12) de um `AAAA-MM`; `null` se não estiver nesse formato. */
export function lerMes(mes: string): { ano: number; mes: number } | null {
  const m = MES.exec(mes);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null;
}

/** Como `lerMes`, mas lança se o Mês for inválido. */
export function partesMes(mes: string): { ano: number; mes: number } {
  const partes = lerMes(mes);
  if (!partes) throw new Error(`Mês inválido: ${mes}`);
  return partes;
}

/** "Out/26". */
export function formatarMes(mes: string): string {
  const { ano, mes: m } = partesMes(mes);
  return `${NOMES_MES[m - 1]}/${dois(ano % 100)}`;
}

/** "outubro": só o nome do mês, por extenso e minúsculo. */
export function formatarNomeDoMes(mes: string): string {
  return NOMES_MES_EXTENSO[partesMes(mes).mes - 1];
}

/** "outubro/26". */
export function formatarMesExtenso(mes: string): string {
  const { ano, mes: m } = partesMes(mes);
  return `${NOMES_MES_EXTENSO[m - 1]}/${dois(ano % 100)}`;
}

/** `AAAA-MM-DD` → "06/11/26". Lança se não estiver nesse formato. */
export function formatarData(data: string): string {
  if (!DATA.test(data)) throw new Error(`Data inválida: ${data}`);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(2, 4)}`;
}

/** `AAAA-MM-DD` → "06/11". Lança se não estiver nesse formato. */
export function formatarDiaMes(data: string): string {
  if (!DATA.test(data)) throw new Error(`Data inválida: ${data}`);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function partesEmSaoPaulo(instante: Date): (tipo: string) => string {
  if (Number.isNaN(instante.getTime())) throw new Error("Instante inválido");
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  return (tipo) => partes.find((p) => p.type === tipo)?.value ?? "";
}

/**
 * Microssegundos desde 1970 de um instante com fuso (os formatos de
 * `INSTANTE_COM_FUSO`). O `Date` só guarda milissegundos; o banco guarda
 * microssegundos. Formato desconhecido → `NaN`.
 */
export function instanteEmMicros(valor: string): number {
  const m = INSTANTE_COM_FUSO.exec(valor.trim());
  if (!m) return NaN;
  const [, ano, mes, dia, hora, min, seg = "0", fracao = "", fuso] = m;
  let deslocamentoMin = 0;
  if (fuso !== "Z") {
    const sinal = fuso[0] === "-" ? -1 : 1;
    const digitos = fuso.slice(1).replace(":", "");
    deslocamentoMin = sinal * (Number(digitos.slice(0, 2)) * 60 + Number(digitos.slice(2, 4) || 0));
  }
  const ms = Date.UTC(+ano, +mes - 1, +dia, +hora, +min, +seg) - deslocamentoMin * 60_000;
  return ms * 1000 + Number(fracao.slice(0, 6).padEnd(6, "0"));
}

/**
 * Instante com fuso ("2026-11-07T00:14:00Z", "…-03:00" ou o formato do
 * Realtime, "2026-11-07 00:14:00.123456+00") → "21:14" em
 * America/Sao_Paulo. Sem fuso no fim, lança.
 */
export function formatarHora(instante: string): string {
  const micros = instanteEmMicros(instante);
  if (Number.isNaN(micros)) throw new Error(`Instante sem fuso: ${instante}`);
  const parte = partesEmSaoPaulo(new Date(Math.floor(micros / 1000)));
  return `${parte("hour")}:${parte("minute")}`;
}

/** "Hoje" (`AAAA-MM-DD`) em America/Sao_Paulo no instante `agora`. */
export function hojeEmSaoPaulo(agora: Date): string {
  const parte = partesEmSaoPaulo(agora);
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}
