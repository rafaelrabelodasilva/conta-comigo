// Lê o `.xlsx` da planilha no navegador (História 3.10, FR-2): sem integração
// com a conta Google, o arquivo baixado fica neste aparelho. Esta é a única
// parte que usa a biblioteca (`read-excel-file`, carregada sob demanda só
// quando Rafael escolhe o arquivo); tudo o que se decide sobre as células é do
// núcleo (`domain/importacao-planilha`). Usa a entrada `universal` da
// biblioteca, que não abre Web Worker.

import { abasDaPlanilha, type AbaDaPlanilha, type Celula, type CelulasDaAba } from "@/domain/importacao-planilha";
import type { Resultado } from "@/domain/resultado";

export type PlanilhaLida = {
  /** As abas que são um Mês, do mais antigo ao mais novo. */
  abas: AbaDaPlanilha[];
  /** As células de cada aba, pelo nome dela. */
  celulas: ReadonlyMap<string, CelulasDaAba>;
};

/** Abre o arquivo e devolve as abas de Mês com as células. Erro: `planilha.arquivo_invalido` ou `planilha.sem_abas`. */
export async function lerXlsx(arquivo: Blob): Promise<Resultado<PlanilhaLida>> {
  let folhas: { sheet: string; data: unknown[][] }[];
  try {
    const { default: lerArquivo } = await import("read-excel-file/universal");
    folhas = (await lerArquivo(arquivo)) as unknown as { sheet: string; data: unknown[][] }[];
  } catch {
    return { ok: false, erro: { codigo: "planilha.arquivo_invalido" } };
  }
  const abas = abasDaPlanilha(folhas.map((f) => f.sheet));
  if (abas.length === 0) return { ok: false, erro: { codigo: "planilha.sem_abas" } };
  const celulas = new Map<string, CelulasDaAba>();
  for (const f of folhas) celulas.set(f.sheet, f.data as unknown as readonly (readonly Celula[])[]);
  return { ok: true, valor: { abas, celulas } };
}
