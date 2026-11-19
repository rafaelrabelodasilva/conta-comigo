import "server-only";

// Utilitário único de log no servidor (AD-17).
//
// Escreve uma linha JSON por evento nos logs da Vercel. Aceita só:
// - `evento` e `codigo`: identificadores curtos (letras, números, `_ . : -`);
// - campos da lista `CAMPOS_PERMITIDOS`, com valores número, booleano ou
//   texto curto e seguro (sem espaço, `?`, `=`, `&` ou `%`).
// Qualquer outro campo é descartado. Nunca registrar texto de Fatura, nomes
// de Lançamentos nem valores: por isso nada disso entra na lista permitida.

export const CAMPOS_PERMITIDOS = [
  "rota",
  "metodo",
  "status_http",
  "duracao_ms",
  "quantidade",
  "tentativa",
  "tabela",
  "request_id",
  // Contagens do aviso do sistema do Cron (7.5): lembretes enviados, ignorados (já avisados), inscrições
  // apagadas (404 ou 410) e falhas. Nunca o endpoint, a chave, o texto, o Bloco ou o valor.
  "enviadas",
  "ignoradas",
  "inscricoes_apagadas",
  "falhas",
] as const;

export type CampoPermitido = (typeof CAMPOS_PERMITIDOS)[number];
export type NivelLog = "info" | "warn" | "error";

export type OpcoesLog = {
  nivel?: NivelLog;
  codigo?: string;
  campos?: Partial<Record<CampoPermitido, string | number | boolean>>;
};

const PERMITIDOS: ReadonlySet<string> = new Set(CAMPOS_PERMITIDOS);
const IDENTIFICADOR = /^[A-Za-z0-9_.:-]{1,64}$/;
// Texto só se for um identificador/rota simples: letras, dígitos e `_ . : / -`.
// Sem espaço, query string (`?`, `=`, `&`) nem `%`; até 120 caracteres.
const TEXTO_SEGURO = /^[A-Za-z0-9_.:/-]{1,120}$/;
const NIVEIS: ReadonlySet<string> = new Set(["info", "warn", "error"]);

function nivelSeguro(nivel: unknown): NivelLog {
  return typeof nivel === "string" && NIVEIS.has(nivel)
    ? (nivel as NivelLog)
    : "info";
}

function identificador(valor: unknown): string {
  return typeof valor === "string" && IDENTIFICADOR.test(valor)
    ? valor
    : "invalido";
}

function valorSeguro(valor: unknown): string | number | boolean | undefined {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") {
    return TEXTO_SEGURO.test(valor) ? valor : undefined;
  }
  return undefined;
}

/** Monta a linha de log (exportada para teste). */
export function linhaDeLog(evento: string, opcoes: OpcoesLog = {}): string {
  const registro: Record<string, string | number | boolean> = {
    nivel: nivelSeguro(opcoes.nivel),
    evento: identificador(evento),
  };
  if (opcoes.codigo !== undefined) registro.codigo = identificador(opcoes.codigo);

  const campos: Record<string, unknown> = opcoes.campos ?? {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (!PERMITIDOS.has(chave)) continue;
    const seguro = valorSeguro(valor);
    if (seguro !== undefined) registro[chave] = seguro;
  }
  return JSON.stringify(registro);
}

export function log(evento: string, opcoes: OpcoesLog = {}): void {
  const linha = linhaDeLog(evento, opcoes);
  const nivel = nivelSeguro(opcoes.nivel);
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}
