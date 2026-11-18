// Reimportar mantendo a classificação (História 3.12, FR-51, AD-1/7.6/8). Tudo
// o que a RPC `importar_fatura` faz no modo reimportação é decidido aqui; a RPC
// só executa. Puro: sem relógio, rede ou banco.
//
// - Casamento antiga↔nova (`casarReimportacao`): mesma ideia de
//   `casarPrevistos`, em 1-para-1 e determinístico. Chave `(nome_normalizado,
//   parcela_n, parcela_total)`; à vista, `parcela_n` e `parcela_total` são
//   nulos e a chave fica só no Nome. 1ª passada: cada nova, na ordem da fatura,
//   pega a antiga livre de Valor igual (a de menor `ordem_fatura`); 2ª passada:
//   as novas que sobraram pegam, na ordem, a antiga livre do mesmo grupo (Valor
//   diferente). O Ajuste de centavos segue a mãe: pareia com o Ajuste da mãe
//   antiga que pareou com a mãe nova. Linha excluída não pareia.
// - Destino de cada antiga sem par (`planejarReimportacao`): a que tinha sido
//   previsto (`casado_em`) volta a previsto; a mexida à mão (`editado_em`,
//   Apelido, Observação ou Status fora do padrão) ou referenciada sai da
//   Fatura com `sumiu_na_reimportacao`; as outras são apagadas. O Ajuste sem
//   par acompanha a mãe: sai junto se ela sai, senão é apagado. Linhas
//   excluídas são sempre apagadas (voltam novas), como na 3.11.
// - `referenciadas` é o ponto de extensão do Épico 6: os ids de linhas com
//   Pagamento. Hoje o repositório manda o conjunto vazio.
// - `aplicarReimportacao` dá a cada nova a classificação final com o mesmo
//   motor do casamento de previstos (`aplicarCasamento`): a antiga pareada faz o
//   papel de "previsto" (a classificação dela vale, as Regras só completam o que
//   falta, Valor diferente e já classificada → "Valor mudou"). Quem fica sem
//   par segue o casamento com os previstos do Mês, as Regras e a herança.

import type { DadosRevisao, DadosValorMudou, MotivoRevisao } from "./classificacao";
import type { Divisao } from "./divisao";
import type { CandidataParaHerdar } from "./heranca";
import {
  aplicarCasamento,
  casarPrevistos,
  type ChaveDaSerie,
  type ClassificacaoCalculada,
  type MarcaDeDivisao,
  type MarcaDeHeranca,
  type PrevistoParaCasar,
  type RealParaCasar,
  type ResultadoDoCasamento,
} from "./previstos";

/** Uma linha da Fatura do Mês, como a reimportação a lê do banco (mães e Ajustes; sem filhas). */
export type AntigaParaReimportar = {
  id: string;
  nome_normalizado: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  ordem_fatura: number;
  /** Ajuste de centavos: a mãe antiga; senão, null. */
  ajuste_de_id: string | null;
  /** Quando a linha nasceu de um previsto (3.6); nulo se nunca foi previsto. */
  casado_em: string | null;
  excluido_em: string | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  status_id: string | null;
  observacao: string | null;
  apelido: string | null;
  editado_em: string | null;
  /** Dívida programada (6.6): uma linha com data combinada é trabalho do Rafael e não some em silêncio. */
  vencimento_combinado?: string | null;
  /** A Divisão da mãe, com os `filha_id` (lida por `lerDivisao`). */
  divisao: Divisao | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: unknown;
  /** A Série da linha (3.5); null à vista e antes da 3.5. */
  serie: ChaveDaSerie | null;
};

/** O que o casamento usa de uma linha nova. */
export type NovaParaPar = Pick<
  RealParaCasar,
  "nome_normalizado" | "valor_centavos" | "parcela_n" | "parcela_total" | "ordem_fatura" | "ajuste_de_ordem"
>;

export type ParDeReimportacao = {
  /** A `ordem_fatura` da linha nova. */
  ordem_fatura: number;
  /** A antiga que a nova substitui (mantém o `id`). */
  antiga_id: string;
};

const chaveDoGrupo = (l: { nome_normalizado: string; parcela_n: number | null; parcela_total: number | null }) =>
  JSON.stringify([l.nome_normalizado, l.parcela_n, l.parcela_total]);

const porOrdem = (a: { ordem_fatura: number; id: string }, b: { ordem_fatura: number; id: string }) =>
  a.ordem_fatura - b.ordem_fatura || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Casa as linhas novas da Fatura com as antigas (1-para-1, determinístico).
 * Devolve os pares e os ids das antigas vivas sem par (ordenados). Linha
 * excluída não pareia.
 */
export function casarReimportacao(
  novas: readonly NovaParaPar[],
  antigas: readonly AntigaParaReimportar[],
): { pares: ParDeReimportacao[]; semPar: string[] } {
  const vivas = antigas.filter((a) => a.excluido_em === null);
  const livres = new Map<string, AntigaParaReimportar[]>();
  for (const a of vivas.filter((x) => x.ajuste_de_id === null).sort(porOrdem)) {
    const k = chaveDoGrupo(a);
    const lista = livres.get(k);
    if (lista) lista.push(a);
    else livres.set(k, [a]);
  }
  const maes = novas.filter((n) => n.ajuste_de_ordem === null).sort((a, b) => a.ordem_fatura - b.ordem_fatura);
  const casadas = new Map<number, string>();

  for (const n of maes) {
    const lista = livres.get(chaveDoGrupo(n));
    const i = lista?.findIndex((a) => a.valor_centavos === n.valor_centavos) ?? -1;
    if (lista && i >= 0) casadas.set(n.ordem_fatura, lista.splice(i, 1)[0].id);
  }
  for (const n of maes) {
    if (casadas.has(n.ordem_fatura)) continue;
    const lista = livres.get(chaveDoGrupo(n));
    if (lista && lista.length > 0) casadas.set(n.ordem_fatura, lista.shift()!.id);
  }

  // O Ajuste novo pareia com o Ajuste da mãe antiga que pareou com a mãe nova.
  const ajustesDaMae = new Map<string, AntigaParaReimportar[]>();
  for (const a of vivas.filter((x) => x.ajuste_de_id !== null).sort(porOrdem)) {
    const lista = ajustesDaMae.get(a.ajuste_de_id as string);
    if (lista) lista.push(a);
    else ajustesDaMae.set(a.ajuste_de_id as string, [a]);
  }
  const ajustesNovos = novas.filter((n) => n.ajuste_de_ordem !== null).sort((a, b) => a.ordem_fatura - b.ordem_fatura);
  for (const n of ajustesNovos) {
    const mae = casadas.get(n.ajuste_de_ordem as number);
    const antigo = mae === undefined ? undefined : ajustesDaMae.get(mae)?.shift();
    if (antigo) casadas.set(n.ordem_fatura, antigo.id);
  }

  const usadas = new Set(casadas.values());
  return {
    pares: [...casadas].map(([ordem_fatura, antiga_id]) => ({ ordem_fatura, antiga_id })).sort((a, b) => a.ordem_fatura - b.ordem_fatura),
    semPar: vivas.filter((a) => !usadas.has(a.id)).map((a) => a.id).sort(),
  };
}

/** A linha tem trabalho de Rafael que não se refaz sozinho? (Regra e importação não contam.) */
export function temTrabalhoManual(
  l: Pick<AntigaParaReimportar, "editado_em" | "apelido" | "observacao" | "status_id"> &
    Partial<Pick<AntigaParaReimportar, "vencimento_combinado">>,
  statusPadraoId: string | null,
): boolean {
  return (
    l.editado_em !== null ||
    (l.vencimento_combinado ?? null) !== null ||
    l.apelido !== null ||
    (l.observacao !== null && l.observacao.trim() !== "") ||
    l.status_id !== statusPadraoId
  );
}

/** Os números do aviso "Importar de novo" (o plano que a RPC vai executar). */
export type ResumoDoPlano = {
  /** Linhas vivas da Fatura antiga (com os Ajustes). */
  quantidade: number;
  /** Antigas pareadas: mantêm `id` e classificação. */
  mantidas: number;
  /** Dessas, as que chegam com Valor diferente. */
  valorMudou: number;
  /** Linhas novas da Fatura sem antiga. */
  novas: number;
  apagadas: number;
  /** Saem da Fatura e vão ao Revisar (mexidas à mão ou referenciadas). */
  sumiram: number;
  /** Eram previstos casados e voltam a previstos. */
  voltaramAPrevisto: number;
  /** Linhas excluídas: são apagadas e voltam como novas. */
  excluidos: number;
};

export type PlanoDeReimportacao = {
  pares: ParDeReimportacao[];
  /** Antigas vivas sem par que a RPC apaga (as excluídas ela apaga sozinha). */
  apagar: string[];
  /** Antigas vivas sem par que saem da Fatura com `sumiu_na_reimportacao`. */
  sumiram: string[];
  /** Antigas vivas sem par que tinham sido previstos. */
  voltar_a_previsto: string[];
  resumo: ResumoDoPlano;
};

/** Pareia e decide o destino de cada antiga sem par (ver o cabeçalho). */
export function planejarReimportacao(
  novas: readonly NovaParaPar[],
  antigas: readonly AntigaParaReimportar[],
  opcoes: { statusPadraoId: string | null; referenciadas?: ReadonlySet<string> },
): PlanoDeReimportacao {
  const { pares, semPar } = casarReimportacao(novas, antigas);
  const referenciadas = opcoes.referenciadas ?? new Set<string>();
  const porId = new Map(antigas.map((a) => [a.id, a]));
  const apagar: string[] = [];
  const sumiram: string[] = [];
  const voltar: string[] = [];
  const destino = new Map<string, "apagar" | "sumiram" | "voltar">();

  // As mães primeiro: o Ajuste acompanha o destino delas.
  for (const id of semPar) {
    const a = porId.get(id) as AntigaParaReimportar;
    if (a.ajuste_de_id !== null) continue;
    if (a.casado_em !== null) destino.set(id, "voltar");
    else if (referenciadas.has(id) || temTrabalhoManual(a, opcoes.statusPadraoId)) destino.set(id, "sumiram");
    else destino.set(id, "apagar");
  }
  for (const id of semPar) {
    const a = porId.get(id) as AntigaParaReimportar;
    if (a.ajuste_de_id === null) continue;
    destino.set(id, a.ajuste_de_id !== null && destino.get(a.ajuste_de_id) === "sumiram" ? "sumiram" : "apagar");
  }
  for (const id of semPar) {
    const d = destino.get(id);
    (d === "voltar" ? voltar : d === "sumiram" ? sumiram : apagar).push(id);
  }

  const novasPorOrdem = new Map(novas.map((n) => [n.ordem_fatura, n]));
  const valorMudou = pares.filter((p) => {
    const nova = novasPorOrdem.get(p.ordem_fatura);
    const antiga = porId.get(p.antiga_id);
    return nova !== undefined && antiga !== undefined && antiga.ajuste_de_id === null && nova.valor_centavos !== antiga.valor_centavos;
  }).length;

  return {
    pares,
    apagar,
    sumiram,
    voltar_a_previsto: voltar,
    resumo: {
      quantidade: antigas.filter((a) => a.excluido_em === null).length,
      mantidas: pares.length,
      valorMudou,
      novas: novas.length - pares.length,
      apagadas: apagar.length,
      sumiram: sumiram.length,
      voltaramAPrevisto: voltar.length,
      excluidos: antigas.filter((a) => a.excluido_em !== null).length,
    },
  };
}

/**
 * O casamento das novas que ficaram sem antiga com os previstos do Mês
 * (`casarPrevistos`, 3.6): `casados` e os previstos que a Fatura não trouxe
 * (`semPar`, que ganham "Não veio na fatura").
 */
export function casarSobrasComPrevistos(
  lancamentos: readonly NovaParaPar[],
  plano: Pick<PlanoDeReimportacao, "pares">,
  previstosDoMes: readonly PrevistoParaCasar[],
): ResultadoDoCasamento {
  const pareadas = new Set(plano.pares.map((p) => p.ordem_fatura));
  return casarPrevistos(
    lancamentos.filter((l) => !pareadas.has(l.ordem_fatura)),
    previstosDoMes,
  );
}

/** Marca de cada linha nova: a antiga que ela substitui (mantém o `id`). */
export type MarcaDeReimportacao = { antiga_id: string | null };

type Entrada = ClassificacaoCalculada & RealParaCasar & { serie: ChaveDaSerie | null; apelido?: string | null; observacao?: string | null };

/**
 * Dá a cada linha nova a classificação final e a marca `antiga_id`. A antiga
 * pareada entra no motor do casamento como "previsto" (id dela); as sem par
 * seguem o casamento com `previstosDoMes`, as Regras e a herança. As antigas que
 * continuam ocupando uma parcela de Série (as que saem da Fatura, as que voltam
 * a previsto e as de `outrasDaSerie`) entram só para a Série da nova subir a
 * `ocorrencia` em vez de colidir.
 */
export function aplicarReimportacao<L extends Entrada>(
  lancamentos: readonly L[],
  plano: PlanoDeReimportacao,
  antigas: readonly AntigaParaReimportar[],
  previstosDoMes: readonly PrevistoParaCasar[],
  candidatas: readonly CandidataParaHerdar[] = [],
  outrasDaSerie: readonly PrevistoParaCasar[] = [],
): (L & { previsto_id: string | null } & MarcaDeReimportacao & MarcaDeHeranca & MarcaDeDivisao)[] {
  const porId = new Map(antigas.map((a) => [a.id, a]));
  const paraCasar = (a: AntigaParaReimportar): PrevistoParaCasar => ({
    id: a.id,
    nome_normalizado: a.nome_normalizado,
    parcela_n: a.parcela_n,
    parcela_total: a.parcela_total,
    valor_centavos: a.valor_centavos,
    ocorrencia: a.serie?.ocorrencia ?? 1,
    responsavel_id: a.responsavel_id,
    tipo_id: a.tipo_id,
    divisao: a.divisao,
    ...(a.serie ? { serie: a.serie } : {}),
  });
  const doMes = casarSobrasComPrevistos(lancamentos, plano, previstosDoMes);
  const casamento = {
    casados: [...plano.pares.map((p) => ({ ordem_fatura: p.ordem_fatura, previsto_id: p.antiga_id })), ...doMes.casados],
    semPar: doMes.semPar,
  };
  const idsDasPareadas = new Set(plano.pares.map((p) => p.antiga_id));
  const ocupantes = [...plano.sumiram, ...plano.voltar_a_previsto].flatMap((id) => {
    const a = porId.get(id);
    return a && a.serie ? [paraCasar(a)] : [];
  });
  const pseudo = plano.pares.flatMap((p) => {
    const a = porId.get(p.antiga_id);
    return a ? [paraCasar(a)] : [];
  });
  const aplicadas = aplicarCasamento(lancamentos, casamento, [...pseudo, ...previstosDoMes, ...ocupantes, ...outrasDaSerie], candidatas);

  return aplicadas.map((l) => {
    const pareada = l.previsto_id !== null && idsDasPareadas.has(l.previsto_id);
    if (!pareada) return { ...l, antiga_id: null };
    const antiga = porId.get(l.previsto_id as string) as AntigaParaReimportar;
    let revisao_motivo: MotivoRevisao | null = l.revisao_motivo;
    let revisao_dados: DadosRevisao | DadosValorMudou | null = l.revisao_dados;
    if (l.ajuste_de_ordem !== null) {
      // O Ajuste não tem motivo próprio: segue a mãe.
      revisao_motivo = null;
      revisao_dados = null;
    } else if (revisao_motivo === null && antiga.revisao_motivo === "valor_mudou" && antiga.valor_centavos === l.valor_centavos) {
      // O Valor não mudou desde o aviso anterior que Rafael ainda não resolveu: continua na fila.
      revisao_motivo = "valor_mudou";
      revisao_dados = antiga.revisao_dados as DadosValorMudou | null;
    }
    return { ...l, antiga_id: antiga.id, previsto_id: null, revisao_motivo, revisao_dados };
  });
}
