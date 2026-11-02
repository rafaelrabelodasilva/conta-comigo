// Regras puras do Primeiro uso (História 1.8): a lista e a ordem dos passos,
// o passo pedido em `?passo=`, o passo seguinte e quando o Primeiro uso abre
// sozinho. Os passos de épicos futuros (Importar planilha, Blocos, Mensagem)
// entram em PASSOS_PRIMEIRO_USO na posição do EXPERIENCE.md
// (Responsáveis → Tipos → Status → Importar planilha → Blocos → Mensagem → Ciclo).

/** Os passos, na ordem em que aparecem. Fonte única da lista e da ordem. */
export const PASSOS_PRIMEIRO_USO = ["responsaveis", "tipos", "status", "ciclo"] as const;

export type PassoPrimeiroUso = (typeof PASSOS_PRIMEIRO_USO)[number];

/** Passo pedido em `?passo=`; ausente ou desconhecido → o primeiro; lista → o primeiro valor. */
export function passoEscolhido(valor: string | readonly string[] | undefined): PassoPrimeiroUso {
  const chave = Array.isArray(valor) ? valor[0] : valor;
  return PASSOS_PRIMEIRO_USO.find((p) => p === chave) ?? PASSOS_PRIMEIRO_USO[0];
}

/** Posição do passo, de 1 a PASSOS_PRIMEIRO_USO.length. */
export function numeroDoPasso(passo: PassoPrimeiroUso): number {
  return PASSOS_PRIMEIRO_USO.indexOf(passo) + 1;
}

/** O passo seguinte; `null` no último (é ali que o Primeiro uso termina). */
export function proximoPasso(passo: PassoPrimeiroUso): PassoPrimeiroUso | null {
  return PASSOS_PRIMEIRO_USO[PASSOS_PRIMEIRO_USO.indexOf(passo) + 1] ?? null;
}

/** Os passos que ainda vêm depois deste, na ordem. */
export function passosSeguintes(passo: PassoPrimeiroUso): PassoPrimeiroUso[] {
  return PASSOS_PRIMEIRO_USO.slice(PASSOS_PRIMEIRO_USO.indexOf(passo) + 1);
}

export type EstadoPrimeiroUso = {
  /** `configuracoes.primeiro_uso_em`; nulo ou ausente (sem linha) = não terminou. */
  concluidoEm: string | null | undefined;
  /** Há algum Responsável, Tipo ou Status, incluindo os arquivados. */
  temCadastro: boolean;
};

/**
 * O Primeiro uso abre sozinho só para quem é novo: nunca concluiu nem pulou
 * até o fim e ainda não tem nenhum cadastro (quem arquivou algo não é novo).
 */
export function deveAbrirPrimeiroUso({ concluidoEm, temCadastro }: EstadoPrimeiroUso): boolean {
  return (concluidoEm ?? null) === null && !temCadastro;
}
