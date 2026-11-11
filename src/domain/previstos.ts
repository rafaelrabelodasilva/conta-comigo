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
// - Propagação (decisão 4-A): quando a parcela real é reclassificada, os
//   previstos vazios recebem sozinhos; os que já têm outro valor só mudam se
//   Rafael responder "Aplicar a todos", e só se a parcela já tinha valor.

import { somarMeses } from "./ciclo";

/** A linha é um previsto? (`lancado_por = 'sistema'`: o app a criou, a fatura ainda não chegou.) */
export function ehPrevisto(l: { lancado_por: string }): boolean {
  return l.lancado_por === "sistema";
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
    for (let k = 1; l.parcela_n + k <= l.parcela_total; k++) {
      const mes = somarMeses(mesDaFatura, k);
      if (comFatura.has(mes)) continue;
      previstos.push({
        ordem_origem: l.ordem_fatura,
        nome: l.nome,
        nome_normalizado: l.nome_normalizado,
        apelido: null,
        valor_centavos: l.valor_centavos,
        parcela_n: l.parcela_n + k,
        parcela_total: l.parcela_total,
        mes,
        responsavel_id: l.responsavel_id,
        tipo_id: l.tipo_id,
        observacao: null,
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
