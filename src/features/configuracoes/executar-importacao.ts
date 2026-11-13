// Orquestra a importação da planilha (História 3.10): cria os cadastros que
// faltam, planeja com os ids reais, grava aba por aba (uma transação cada; a
// que falha não para as outras) e, no fim, cria as Regras iniciais das abas
// que deram certo. Só chama as portas de `src/data` que recebe; o que se
// decide é do núcleo (`domain/importacao-planilha`).

import {
  planejarAbas,
  planejarCadastros,
  regrasIniciais,
  resolverCadastros,
  resumirImportacao,
  type AbaLida,
  type CadastrosDoApp,
  type EstadoDoApp,
  type PlanoDeCadastros,
  type ResultadoDaAba,
  type ResumoDaImportacao,
} from "@/domain/importacao-planilha";
import type { RegraParaGravar } from "@/domain/regras";
import type { Resultado } from "@/domain/resultado";

export type DepsDaImportacao = {
  lerEstado: () => Promise<{ ok: true; estado: EstadoDoApp } | { ok: false }>;
  lerCadastros: () => Promise<{ ok: true; cadastros: CadastrosDoApp } | { ok: false }>;
  /** Cria e reativa o que o plano pede; erro ao faltar cor de Responsável ou falha de gravação. */
  criarCadastros: (plano: PlanoDeCadastros) => Promise<{ ok: true } | { ok: false; codigo: string }>;
  importarAba: (plano: ReturnType<typeof planejarAbas>[number]) => Promise<{ ok: true; lancamentos: number } | { ok: false; codigo: string }>;
  criarRegras: (regras: readonly RegraParaGravar[]) => Promise<{ ok: true; criadas: { created_at: string }[] } | { ok: false }>;
  agora: () => Date;
};

export type EstadoDaAba = "esperando" | "gravando" | "gravada" | "so_regras" | "erro";

export type ProgressoDaAba = { mes: string; nome: string; estado: EstadoDaAba; lancamentos?: number; codigo?: string };

export type ResultadoDaImportacao = {
  resumo: ResumoDaImportacao;
  abas: ResultadoDaAba[];
  /** O `created_at` mais antigo das Regras criadas agora (relógio do banco), para o filtro "criadas agora". */
  regrasDesde: string | null;
  /** As abas que falharam, com o código do motivo. */
  erros: { nome: string; codigo: string }[];
};

/**
 * Importa as abas lidas. `Resultado` com erro quando nada foi gravado
 * (cadastros, leitura do estado). Abas com erro de gravação não derrubam a
 * importação: aparecem em `erros`.
 */
export async function executarImportacao(
  deps: DepsDaImportacao,
  abas: readonly AbaLida[],
  aoProgresso: (p: ProgressoDaAba[]) => void,
): Promise<Resultado<ResultadoDaImportacao>> {
  const linhas = abas.flatMap((a) => a.linhas);
  const antes = await deps.lerCadastros();
  if (!antes.ok) return { ok: false, erro: { codigo: "carregar.falhou" } };
  const planoCadastros = planejarCadastros(linhas, antes.cadastros);
  const criados = await deps.criarCadastros(planoCadastros);
  if (!criados.ok) return { ok: false, erro: { codigo: criados.codigo } };

  const [cadastros, estado] = await Promise.all([deps.lerCadastros(), deps.lerEstado()]);
  if (!cadastros.ok || !estado.ok) return { ok: false, erro: { codigo: "carregar.falhou" } };
  const resolver = resolverCadastros(cadastros.cadastros);
  const planos = planejarAbas(abas, resolver, estado.estado);

  const progresso: ProgressoDaAba[] = planos.map((p) => ({ mes: p.mes, nome: p.nome, estado: "esperando" }));
  aoProgresso([...progresso]);
  const resultados: ResultadoDaAba[] = [];
  const erros: { nome: string; codigo: string }[] = [];
  for (let i = 0; i < planos.length; i++) {
    const plano = planos[i];
    progresso[i] = { ...progresso[i], estado: "gravando" };
    aoProgresso([...progresso]);
    const r = await deps.importarAba(plano);
    if (r.ok) {
      progresso[i] = { ...progresso[i], estado: plano.soRegras ? "so_regras" : "gravada", lancamentos: r.lancamentos };
      resultados.push({ mes: plano.mes, nome: plano.nome, ok: true, lancamentos: r.lancamentos });
    } else {
      progresso[i] = { ...progresso[i], estado: "erro", codigo: r.codigo };
      resultados.push({ mes: plano.mes, nome: plano.nome, ok: false, lancamentos: 0, erro: r.codigo });
      erros.push({ nome: plano.nome, codigo: r.codigo });
    }
    aoProgresso([...progresso]);
  }

  // As Regras nascem só das abas que deram certo (inclusive as de Mês com Fatura, que só as ensinam).
  const boas = new Set(resultados.filter((r) => r.ok).map((r) => r.mes));
  const regras = regrasIniciais(
    abas.filter((a) => boas.has(a.mes)),
    resolver,
    deps.agora().toISOString(),
  );
  const gravadas = await deps.criarRegras(regras);
  const criadas = gravadas.ok ? gravadas.criadas : [];
  const regrasDesde = criadas.length === 0 ? null : criadas.map((c) => c.created_at).sort()[0];
  return {
    ok: true,
    valor: {
      resumo: resumirImportacao(resultados, planoCadastros, criadas.length),
      abas: resultados,
      regrasDesde,
      erros: gravadas.ok ? erros : [...erros, { nome: "Regras", codigo: "salvar.falhou" }],
    },
  };
}
