// Seções de Configurações escolhidas por `?secao=` (Histórias 1.4 a 1.7),
// na ordem do EXPERIENCE.md.

export const CHAVES_SECAO = [
  "responsaveis",
  "tipos",
  "status",
  "ciclo",
  "conferencia",
  "regras",
  "mensagem",
  "aparencia",
  "planilha",
] as const;

export type ChaveSecao = (typeof CHAVES_SECAO)[number];

/** Configurações → Modelo da mensagem: para onde "Editar modelo" (Gerar mensagem) leva. */
export const SECAO_MODELO_DA_MENSAGEM: ChaveSecao = "mensagem";

/** Seção pedida em `?secao=`; ausente ou desconhecida → Responsáveis; lista → o primeiro valor. */
export function secaoEscolhida(valor: string | string[] | undefined): ChaveSecao {
  const chave = Array.isArray(valor) ? valor[0] : valor;
  return CHAVES_SECAO.find((c) => c === chave) ?? "responsaveis";
}
