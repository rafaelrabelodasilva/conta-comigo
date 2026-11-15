// Séries e parcelas previstas (História 3.5, FR-44, AD-1/8/9). Tudo o que a
// RPC `importar_fatura` grava sobre Séries e previstos é calculado aqui; a RPC
// só grava. Puro: sem relógio, rede ou banco.
//
// - Chave da Série (AD-8): `(nome_normalizado, parcela_total,
//   valor_parcela_centavos, mes_primeira_parcela, ocorrencia)`. Ela NÃO usa a
//   data da compra (pendência da 2.3, ano de parcelas antigas):
//   `mes_primeira_parcela = somarMeses(Mês da Fatura, -(parcela_n - 1))`.
//   `ocorrencia` (1, 2, …) separa compras idênticas da mesma Fatura, na ordem
//   da fatura.
// - Entram na Série as parcelas (inclusive a última, que só se liga à Série)
//   com Valor positivo e que não são Ajuste de centavos.
// - Previstos (AD-9): da parcela n < N saem n+1/N … N/N, cada um com
//   `mes = somarMeses(Mês da Fatura, k)`, `lancado_por = 'sistema'` e a mesma
//   classificação da linha real. Meses que já têm Fatura ficam de fora (a 3.6
//   casa o que chegar).
// - Casamento (História 3.6, FR-45, AD-8): `casarPrevistos` junta, 1-para-1 e
//   de forma determinística, as parcelas reais da Fatura aos previstos do
//   Mês pela chave `(nome_normalizado, parcela_n, parcela_total)`; os reais na
//   ordem da fatura, os previstos por Valor igual primeiro e depois por
//   `ocorrencia`. `aplicarCasamento` dá ao casado a classificação e o motivo
//   ("Valor mudou" quando o Valor difere e a linha já está classificada).
// - Herança (História 3.7, FR-8): a parcela real que sobrou sem previsto
//   procura a n−1/N do Mês anterior (`heranca.ts`) e, se achar, entra na Série
//   dela e herda a classificação; `aplicarCasamento` faz isso depois do
//   casamento e antes de subir a `ocorrencia`.
// - Divisão (História 3.8): o previsto herda a `divisao` da parcela e nasce com
//   as filhas (mesmo Valor, então os mesmos centavos); o casado mantém as
//   filhas do previsto e o núcleo recalcula os valores delas com o Valor da
//   Fatura (`partes`). A mãe dividida não tem Responsável.
// - Propagação (decisão 4-A): quando a parcela real é reclassificada, os
//   previstos vazios recebem sozinhos; os que já têm outro valor só mudam se
//   Rafael responder "Aplicar a todos", e só se a parcela já tinha valor.

import type { DadosRevisao, DadosValorMudou, MotivoRevisao } from "./classificacao";
import { somarMeses } from "./ciclo";
import { copiarDivisao, estaClassificada, partesDaImportacao, type Divisao, type ParteParaGravar } from "./divisao";
import { emprestaAlgo, escolherCandidatas, mesclarHerdada, type CandidataParaHerdar } from "./heranca";

/** A linha é um previsto? (`lancado_por = 'sistema'`: o app a criou, a fatura ainda não chegou.) */
export function ehPrevisto(l: { lancado_por: string }): boolean {
  return l.lancado_por === "sistema";
}

/**
 * O Lançamento de uma Conta manual (História 5.1) é "previsto" enquanto o Mês
 * dele não tem Fatura: a Fatura ainda não chegou, então a conta é uma
 * expectativa (EXPERIENCE.md, "Mês sem Fatura"). É derivado, nunca gravado: o
 * `lancado_por` fica `manual`, e quando a Fatura do Mês é importada a linha
 * deixa de ser previsto sozinha. Só vale para linhas ligadas a uma Conta
 * (`conta_manual_id`): um Lançamento feito à mão no app nunca é previsto.
 */
export function ehPrevistoDeConta(
  l: { lancado_por: string; conta_manual_id?: string | null },
  mesTemFatura: boolean,
): boolean {
  return l.lancado_por === "manual" && (l.conta_manual_id ?? null) !== null && !mesTemFatura;
}

/** Previsto de qualquer origem: parcela prevista (`sistema`) ou Conta manual num Mês sem Fatura. */
export function ehPrevistoNoMes(
  l: { lancado_por: string; conta_manual_id?: string | null },
  mesTemFatura: boolean,
): boolean {
  return ehPrevisto(l) || ehPrevistoDeConta(l, mesTemFatura);
}

/** A chave de uma Série (colunas de `series`, sem o dono). */
export type ChaveDaSerie = {
  nome_normalizado: string;
  parcela_total: number;
  valor_parcela_centavos: number;
  mes_primeira_parcela: string;
  ocorrencia: number;
};

/** O que a Série usa de uma linha da importação. */
export type LinhaParaSerie = {
  nome_normalizado: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  ordem_fatura: number;
  /** Ajuste de centavos: a `ordem_fatura` da mãe; senão, null. */
  ajuste_de_ordem: number | null;
};

/** A parcela entra numa Série? Parcela válida, Valor positivo e não é Ajuste. */
export function ehParcelaDeSerie(l: Pick<LinhaParaSerie, "valor_centavos" | "parcela_n" | "parcela_total" | "ajuste_de_ordem">): boolean {
  return (
    l.parcela_n !== null &&
    l.parcela_total !== null &&
    l.parcela_total >= 2 &&
    l.parcela_n >= 1 &&
    l.parcela_n <= l.parcela_total &&
    l.valor_centavos > 0 &&
    l.ajuste_de_ordem === null
  );
}

/**
 * Dá a cada linha da importação a chave da sua Série (ou null). `mes` é o
 * Mês da Fatura (AAAA-MM). Compras idênticas na mesma Fatura (mesmo Nome
 * normalizado, parcela, total e Valor) recebem `ocorrencia` 1, 2, … na ordem
 * da fatura. Devolve as linhas na ordem recebida.
 */
export function atribuirSeries<L extends LinhaParaSerie>(
  linhas: readonly L[],
  mes: string,
): (L & { serie: ChaveDaSerie | null })[] {
  const contagem = new Map<string, number>();
  const ocorrenciaDe = new Map<L, number>();
  const naOrdem = linhas.filter(ehParcelaDeSerie).sort((a, b) => a.ordem_fatura - b.ordem_fatura);
  for (const l of naOrdem) {
    const k = JSON.stringify([l.nome_normalizado, l.parcela_n, l.parcela_total, l.valor_centavos]);
    const n = (contagem.get(k) ?? 0) + 1;
    contagem.set(k, n);
    ocorrenciaDe.set(l, n);
  }
  return linhas.map((l) => {
    const ocorrencia = ocorrenciaDe.get(l);
    if (ocorrencia === undefined) return { ...l, serie: null };
    return {
      ...l,
      serie: {
        nome_normalizado: l.nome_normalizado,
        parcela_total: l.parcela_total as number,
        valor_parcela_centavos: l.valor_centavos,
        mes_primeira_parcela: somarMeses(mes, -((l.parcela_n as number) - 1)),
        ocorrencia,
      },
    };
  });
}

/** O que o previsto copia da linha real já classificada. */
export type LinhaParaPrever = {
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  ordem_fatura: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** Herdados da parcela anterior (3.7); os previstos seguintes os copiam. */
  apelido?: string | null;
  observacao?: string | null;
  /** Divisão da parcela (3.8); o previsto a herda e nasce com as filhas. */
  divisao?: Divisao | null;
  serie: ChaveDaSerie | null;
};

/** Corpo de um previsto para a RPC (`dados_previstos`). */
export type PrevistoParaGravar = {
  /** A `ordem_fatura` da linha real que o gera. */
  ordem_origem: number;
  nome: string;
  nome_normalizado: string;
  apelido: string | null;
  valor_centavos: number;
  parcela_n: number;
  parcela_total: number;
  mes: string;
  responsavel_id: string | null;
  tipo_id: string | null;
  observacao: string | null;
  /** A Divisão herdada, sem `filha_id`, e as partes (filhas) com os valores. */
  divisao?: Divisao;
  partes?: ParteParaGravar[];
};

/**
 * Os previstos n+1/N … N/N de cada parcela da Fatura que tem Série e n < N,
 * na ordem da fatura e da parcela. `mesesComFatura` (AAAA-MM) fica de fora:
 * Mês que já tem Fatura não recebe previsto (decisão 1-A).
 */
export function gerarPrevistos(
  linhas: readonly LinhaParaPrever[],
  mesDaFatura: string,
  mesesComFatura: Iterable<string> = [],
): PrevistoParaGravar[] {
  const comFatura = new Set(mesesComFatura);
  const previstos: PrevistoParaGravar[] = [];
  const naOrdem = [...linhas].sort((a, b) => a.ordem_fatura - b.ordem_fatura);
  for (const l of naOrdem) {
    if (l.serie === null || l.parcela_n === null || l.parcela_total === null) continue;
    const divisao = l.divisao ? copiarDivisao(l.divisao) : null;
    const partes = divisao ? partesDaImportacao(l.valor_centavos, divisao) : null;
    for (let k = 1; l.parcela_n + k <= l.parcela_total; k++) {
      const mes = somarMeses(mesDaFatura, k);
      if (comFatura.has(mes)) continue;
      previstos.push({
        ordem_origem: l.ordem_fatura,
        nome: l.nome,
        nome_normalizado: l.nome_normalizado,
        apelido: l.apelido ?? null,
        valor_centavos: l.valor_centavos,
        parcela_n: l.parcela_n + k,
        parcela_total: l.parcela_total,
        mes,
        responsavel_id: l.responsavel_id,
        tipo_id: l.tipo_id,
        observacao: l.observacao ?? null,
        ...(divisao && partes ? { divisao, partes } : {}),
      });
    }
  }
  return previstos;
}

/** A classificação que a propagação olha. */
export type ClassificacaoDaParcela = {
  responsavel_id: string | null;
  tipo_id: string | null;
};

/** Um previsto da Série (colunas de `lancamentos`). */
export type PrevistoDaSerie = ClassificacaoDaParcela & { id: string };

/** O que gravar num previsto: só as colunas que mudam. */
export type MudancaDoPrevisto = { id: string; corpo: Partial<ClassificacaoDaParcela> };

export type PlanoDePropagacao = {
  /** Previstos vazios que recebem sem perguntar. */
  silenciosos: MudancaDoPrevisto[];
  /** Previstos com outro valor, que só mudam com "Aplicar a todos". */
  aPerguntar: MudancaDoPrevisto[];
};

const CAMPOS: readonly (keyof ClassificacaoDaParcela)[] = ["responsavel_id", "tipo_id"];

/**
 * Como a mudança de classificação da parcela chega aos previstos (decisão
 * 4-A). Só conta o campo que mudou e passou a ter valor. Previsto com o campo
 * vazio recebe sem perguntar; previsto com outro valor entra em `aPerguntar`
 * apenas quando a parcela já tinha valor nesse campo (sobrescrever o que
 * Rafael já tinha é o que a pergunta cobre).
 */
export function planejarPropagacao(
  antes: ClassificacaoDaParcela,
  depois: ClassificacaoDaParcela,
  previstos: readonly PrevistoDaSerie[],
): PlanoDePropagacao {
  const silenciosos: MudancaDoPrevisto[] = [];
  const aPerguntar: MudancaDoPrevisto[] = [];
  for (const p of previstos) {
    const vazios: Partial<ClassificacaoDaParcela> = {};
    const outros: Partial<ClassificacaoDaParcela> = {};
    for (const c of CAMPOS) {
      const novo = depois[c];
      if (novo === antes[c] || novo === null) continue;
      if (p[c] === null) vazios[c] = novo;
      else if (p[c] !== novo && antes[c] !== null) outros[c] = novo;
    }
    if (Object.keys(vazios).length > 0) silenciosos.push({ id: p.id, corpo: vazios });
    if (Object.keys(outros).length > 0) aPerguntar.push({ id: p.id, corpo: outros });
  }
  return { silenciosos, aPerguntar };
}

/** Junta as mudanças do mesmo previsto (um item por id) para uma gravação só. */
export function juntarMudancas(...listas: readonly (readonly MudancaDoPrevisto[])[]): MudancaDoPrevisto[] {
  const porId = new Map<string, Partial<ClassificacaoDaParcela>>();
  for (const lista of listas) {
    for (const m of lista) porId.set(m.id, { ...porId.get(m.id), ...m.corpo });
  }
  return [...porId].map(([id, corpo]) => ({ id, corpo }));
}

/** O que o casamento usa de uma linha real da Fatura. */
export type RealParaCasar = Pick<
  LinhaParaSerie,
  "nome_normalizado" | "valor_centavos" | "parcela_n" | "parcela_total" | "ordem_fatura" | "ajuste_de_ordem"
>;

/** Um previsto do Mês importado: `sistema`, não excluído, com a `ocorrencia` da Série. */
export type PrevistoParaCasar = {
  id: string;
  nome_normalizado: string;
  /** Nulo na linha à vista (a antiga que a reimportação, 3.12, pareia sem Série). */
  parcela_n: number | null;
  parcela_total: number | null;
  valor_centavos: number;
  ocorrencia: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** A Divisão do previsto (3.8), com os `filha_id` das filhas dele. */
  divisao?: Divisao | null;
  /** A chave da Série do previsto; com ela, a parcela real sem par não cai numa Série já ocupada. */
  serie?: ChaveDaSerie;
};

export type ParCasado = {
  /** A `ordem_fatura` da linha real. */
  ordem_fatura: number;
  previsto_id: string;
};

export type ResultadoDoCasamento = {
  casados: ParCasado[];
  /** Ids dos previstos que a Fatura não trouxe ("Não veio na fatura"). */
  semPar: string[];
};

/**
 * Casa os reais da Fatura (só parcelas de Série, sem Ajuste) com os previstos
 * do Mês, 1-para-1 (AD-8). Em cada grupo `(nome_normalizado, parcela_n,
 * parcela_total)`: 1ª passada, cada real na ordem da fatura pega o previsto
 * livre de Valor igual com menor `ocorrencia`; 2ª passada, os reais que
 * sobraram pegam, na ordem, o livre de menor `ocorrencia` (Valor diferente).
 * O que sobra de previsto é `semPar`. Não depende da ordem de entrada dos
 * previstos nem de dados fora dos argumentos.
 */
export function casarPrevistos(
  extraidos: readonly RealParaCasar[],
  previstos: readonly PrevistoParaCasar[],
): ResultadoDoCasamento {
  const chave = (l: { nome_normalizado: string; parcela_n: number | null; parcela_total: number | null }) =>
    JSON.stringify([l.nome_normalizado, l.parcela_n, l.parcela_total]);
  const livres = new Map<string, PrevistoParaCasar[]>();
  for (const p of [...previstos].sort((a, b) => a.ocorrencia - b.ocorrencia || (a.id < b.id ? -1 : 1))) {
    const k = chave(p);
    const lista = livres.get(k);
    if (lista) lista.push(p);
    else livres.set(k, [p]);
  }
  const reais = extraidos.filter(ehParcelaDeSerie).sort((a, b) => a.ordem_fatura - b.ordem_fatura);
  const casados = new Map<number, string>();

  for (const r of reais) {
    const lista = livres.get(chave(r));
    const i = lista?.findIndex((p) => p.valor_centavos === r.valor_centavos) ?? -1;
    if (lista && i >= 0) casados.set(r.ordem_fatura, lista.splice(i, 1)[0].id);
  }
  for (const r of reais) {
    if (casados.has(r.ordem_fatura)) continue;
    const lista = livres.get(chave(r));
    if (lista && lista.length > 0) casados.set(r.ordem_fatura, lista.shift()!.id);
  }

  const usados = new Set(casados.values());
  return {
    casados: reais.flatMap((r) => {
      const id = casados.get(r.ordem_fatura);
      return id === undefined ? [] : [{ ordem_fatura: r.ordem_fatura, previsto_id: id }];
    }),
    semPar: previstos.filter((p) => !usados.has(p.id)).map((p) => p.id).sort(),
  };
}

/** A classificação e o motivo que a importação calculou para uma linha. */
export type ClassificacaoCalculada = {
  responsavel_id: string | null;
  tipo_id: string | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: DadosRevisao | DadosValorMudou | null;
  /** A Divisão que a Regra aplicou (3.8). */
  divisao?: Divisao | null;
};

/** O que a herança (3.7) acrescenta a cada linha devolvida por `aplicarCasamento`. */
export type MarcaDeHeranca = { herdado_de_id: string | null };

/** A Divisão final da linha (3.8) e as partes que a RPC grava nas filhas. */
export type MarcaDeDivisao = { divisao?: Divisao | null; partes?: ParteParaGravar[] };

/**
 * Aplica o casamento às linhas já classificadas pelas Regras. A linha casada
 * guarda `previsto_id` e perde a chave da Série (a Série é a do previsto);
 * Responsável e Tipo são os do previsto, e o campo vazio recebe o que as
 * Regras calcularam. Completa e com Valor igual: sem motivo. Completa e com
 * Valor diferente: `valor_mudou` com `{ antes_centavos }`. Incompleta: o
 * motivo da classificação normal (decisão Q2-A da 3.6).
 *
 * Depois do casamento, a parcela real n > 1 que ficou sem previsto herda da
 * parcela n−1 do Mês anterior (`candidatas`, História 3.7): entra na Série
 * dela e a classificação dela vale campo a campo sobre a das Regras.
 * `herdado_de_id` só é preenchido quando a candidata emprestou algum campo.
 */
export function aplicarCasamento<
  L extends ClassificacaoCalculada & RealParaCasar & { serie: ChaveDaSerie | null; apelido?: string | null; observacao?: string | null },
>(
  lancamentos: readonly L[],
  casamento: ResultadoDoCasamento,
  previstos: readonly PrevistoParaCasar[],
  candidatas: readonly CandidataParaHerdar[] = [],
): (L & { previsto_id: string | null } & MarcaDeHeranca & MarcaDeDivisao)[] {
  const previstoDe = new Map(previstos.map((p) => [p.id, p]));
  const idDoPar = new Map(casamento.casados.map((c) => [c.ordem_fatura, c.previsto_id]));
  const aplicadas = lancamentos.map((l): L & { previsto_id: string | null } & MarcaDeHeranca & MarcaDeDivisao => {
    const previsto = previstoDe.get(idDoPar.get(l.ordem_fatura) ?? "");
    if (!previsto) return { ...l, previsto_id: null, herdado_de_id: null };
    // Divisão do casado: a do previsto (a das Regras não vale aqui); as filhas são as dele, com o Valor da Fatura.
    let divisao = previsto.divisao ?? null;
    let partes: ParteParaGravar[] | null = null;
    if (divisao !== null) {
      partes = partesDaImportacao(l.valor_centavos, divisao, divisao.partes.map((p) => p.filha_id), true);
      if (partes === null) divisao = null;
    }
    const responsavel_id = divisao !== null ? null : (previsto.responsavel_id ?? (l.divisao ? null : l.responsavel_id));
    const tipo_id = previsto.tipo_id ?? l.tipo_id;
    const completa = estaClassificada({ responsavel_id, tipo_id, divisao });
    const mudou = previsto.valor_centavos !== l.valor_centavos;
    let revisao_motivo: MotivoRevisao | null;
    let revisao_dados: DadosRevisao | DadosValorMudou | null = null;
    if (!completa) {
      revisao_motivo = l.revisao_motivo ?? "sem_classificacao";
      revisao_dados = l.revisao_dados;
    } else if (mudou) {
      revisao_motivo = "valor_mudou";
      revisao_dados = { antes_centavos: previsto.valor_centavos } satisfies DadosValorMudou;
    } else {
      revisao_motivo = null;
    }
    return {
      ...l,
      serie: null,
      responsavel_id,
      tipo_id,
      revisao_motivo,
      revisao_dados,
      previsto_id: previsto.id,
      herdado_de_id: null,
      divisao,
      ...(partes ? { partes } : {}),
    };
  });

  const chaveDaParcela = (k: ChaveDaSerie, n: number | null) =>
    JSON.stringify([k.nome_normalizado, k.parcela_total, k.valor_parcela_centavos, k.mes_primeira_parcela, k.ocorrencia, n]);
  const ocupadas = new Set(previstos.flatMap((p) => (p.serie ? [chaveDaParcela(p.serie, p.parcela_n)] : [])));

  // Herança (3.7): as parcelas n > 1 que sobraram sem previsto procuram a n−1 do Mês anterior.
  const semPrevisto = aplicadas.filter((l) => l.previsto_id === null && l.serie !== null && l.parcela_n !== null && l.parcela_n > 1);
  const escolhidas = escolherCandidatas(
    semPrevisto.map((l) => ({
      ordem_fatura: l.ordem_fatura,
      nome_normalizado: l.nome_normalizado,
      valor_centavos: l.valor_centavos,
      parcela_n: l.parcela_n as number,
      parcela_total: l.parcela_total as number,
    })),
    candidatas,
  );
  const naSerieDaCandidata = new Set<number>();
  const herdadas = aplicadas.map((l) => {
    const c = escolhidas.get(l.ordem_fatura);
    if (!c || l.previsto_id !== null) return l;
    // Entra na Série da candidata (a chave dela, inclusive a `ocorrencia`); sem Série, fica a da 3.5.
    let serie = l.serie;
    if (c.serie !== null) {
      serie = c.serie;
      naSerieDaCandidata.add(l.ordem_fatura);
      ocupadas.add(chaveDaParcela(c.serie, l.parcela_n));
    }
    if (!emprestaAlgo(c)) return { ...l, serie };
    return { ...l, serie, ...mesclarHerdada(l, c), herdado_de_id: c.id };
  });

  // Parcela real sem par: a Série calculada pode já ter essa parcela num previsto do Mês (compras
  // idênticas em que um previsto foi excluído ou casou com outra ocorrencia) ou na Série de uma
  // herdeira. Sobe a `ocorrencia` até uma Série livre, para a RPC não recusar a importação inteira.
  const livres = herdadas.map((l) => {
    if (l.previsto_id !== null || l.serie === null || naSerieDaCandidata.has(l.ordem_fatura)) return l;
    let serie = l.serie;
    while (ocupadas.has(chaveDaParcela(serie, l.parcela_n))) serie = { ...serie, ocorrencia: serie.ocorrencia + 1 };
    ocupadas.add(chaveDaParcela(serie, l.parcela_n));
    return serie === l.serie ? l : { ...l, serie };
  });
  // O Ajuste de centavos segue a mãe: recebe a classificação final dela (a do previsto, se casou).
  const porOrdem = new Map(livres.map((l) => [l.ordem_fatura, l]));
  return livres.map((l) => {
    const mae = l.ajuste_de_ordem === null ? undefined : porOrdem.get(l.ajuste_de_ordem);
    if (mae) return { ...l, responsavel_id: mae.responsavel_id, tipo_id: mae.tipo_id };
    // Divisão de linha nova (Regra ou herança): as partes que a RPC grava. Se alguma zera, a linha não divide.
    if (l.previsto_id === null && (l.divisao ?? null) !== null) {
      const partes = partesDaImportacao(l.valor_centavos, l.divisao as Divisao);
      if (partes) return { ...l, partes };
      return { ...l, divisao: null, revisao_motivo: l.revisao_motivo ?? "sem_classificacao" };
    }
    return l;
  });
}
