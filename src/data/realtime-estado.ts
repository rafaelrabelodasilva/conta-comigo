// Mesclagem pura do gerenciador de Realtime (AD-4). Sem rede nem React:
// recebe o estado e o que chegou (releitura, lote de RPC, evento, otimismo)
// e devolve o estado novo. Toda regra de "quem vence" está aqui e tem teste.
//
// Regra: uma linha só substitui a da memória se o `updated_at` for mais
// novo. O `updated_at` é sempre do banco; o otimismo mantém o da linha
// anterior, então a resposta do banco (mais nova) sempre o substitui.

import { instanteEmMicros } from "@/domain/datas";

export type LinhaBase = { id: string; updated_at: string };

export type StatusTabela = "carregando" | "pronto" | "erro";

export type EstadoTabela<L extends LinhaBase> = {
  status: StatusTabela;
  porId: ReadonlyMap<string, L>;
};

export function estadoInicial<L extends LinhaBase>(): EstadoTabela<L> {
  return { status: "carregando", porId: new Map() };
}

/**
 * Instante em microssegundos desde 1970. Aceita o formato do PostgREST
 * (`2026-11-02T12:00:00.123456+00:00`) e o do Realtime
 * (`2026-11-02 12:00:00.123456+00`), que guardam microssegundos (o
 * `Date` só guarda milissegundos). Formato desconhecido → `NaN`. A regra é
 * do núcleo (`instanteEmMicros`, `src/domain/datas.ts`).
 */
export const instanteMicros = instanteEmMicros;

/** `a` é estritamente mais novo que `b`. Instante ilegível nunca é mais novo. */
export function ehMaisNovo(a: string, b: string): boolean {
  const ia = instanteMicros(a);
  const ib = instanteMicros(b);
  if (Number.isNaN(ia)) return false;
  if (Number.isNaN(ib)) return true;
  return ia > ib;
}

function comMapa<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  mudar: (mapa: Map<string, L>) => boolean,
): EstadoTabela<L> {
  const mapa = new Map(estado.porId);
  return mudar(mapa) ? { ...estado, porId: mapa } : estado;
}

function aplicarNoMapa<L extends LinhaBase>(mapa: Map<string, L>, linha: L): boolean {
  const atual = mapa.get(linha.id);
  if (atual && !ehMaisNovo(linha.updated_at, atual.updated_at)) return false;
  mapa.set(linha.id, linha);
  return true;
}

/** Linhas devolvidas por uma gravação ou RPC: cada uma entra se for mais nova. */
export function aplicarLote<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  linhas: readonly L[],
): EstadoTabela<L> {
  return comMapa(estado, (mapa) => {
    let mudou = false;
    for (const linha of linhas) mudou = aplicarNoMapa(mapa, linha) || mudou;
    return mudou;
  });
}

export type EventoRealtime<L extends LinhaBase> =
  | { tipo: "INSERT" | "UPDATE"; nova: L }
  | { tipo: "DELETE"; antiga: Partial<L> & { id: string } };

/** Evento do Realtime: INSERT/UPDATE só se mais novo; DELETE remove. */
export function aplicarEvento<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  evento: EventoRealtime<L>,
): EstadoTabela<L> {
  if (evento.tipo === "DELETE") {
    return comMapa(estado, (mapa) => mapa.delete(evento.antiga.id));
  }
  return aplicarLote(estado, [evento.nova]);
}

/**
 * Releitura completa da tabela (a cada `SUBSCRIBED`). A tabela lida passa a
 * ser a verdade: linhas que sumiram saem. Uma linha da memória mais nova que
 * a lida (evento que chegou durante a leitura) é mantida. `aplicadasDurante`
 * são os ids aplicados (gravação ou evento) depois que a leitura começou:
 * ficam mesmo se a leitura não os trouxe (ex.: criado enquanto lia).
 */
export function aplicarReleitura<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  linhas: readonly L[],
  aplicadasDurante: ReadonlySet<string> = new Set(),
): EstadoTabela<L> {
  const mapa = new Map<string, L>();
  for (const lida of linhas) {
    const atual = estado.porId.get(lida.id);
    mapa.set(
      lida.id,
      atual && ehMaisNovo(atual.updated_at, lida.updated_at) ? atual : lida,
    );
  }
  for (const id of aplicadasDurante) {
    const atual = estado.porId.get(id);
    if (atual && !mapa.has(id)) mapa.set(id, atual);
  }
  return { status: "pronto", porId: mapa };
}

export function marcarStatus<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  status: StatusTabela,
): EstadoTabela<L> {
  return estado.status === status ? estado : { ...estado, status };
}

/**
 * Gravação otimista: as linhas aparecem já com a mudança, mas mantendo o
 * `updated_at` anterior. Devolve também as linhas anteriores, para desfazer.
 * Linha que não existe na memória fica de fora (só se edita o que se vê).
 */
export function aplicarOtimista<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  mudancas: readonly (Partial<L> & { id: string })[],
): { estado: EstadoTabela<L>; anteriores: L[] } {
  const anteriores: L[] = [];
  const novo = comMapa(estado, (mapa) => {
    for (const mudanca of mudancas) {
      const atual = mapa.get(mudanca.id);
      if (!atual) continue;
      anteriores.push(atual);
      mapa.set(mudanca.id, { ...atual, ...mudanca, updated_at: atual.updated_at });
    }
    return anteriores.length > 0;
  });
  return { estado: novo, anteriores };
}

/**
 * Desfaz o otimismo quando o banco recusa: volta cada linha anterior, a não
 * ser que o banco já tenha mandado uma versão mais nova dela.
 */
export function desfazerOtimista<L extends LinhaBase>(
  estado: EstadoTabela<L>,
  anteriores: readonly L[],
): EstadoTabela<L> {
  return comMapa(estado, (mapa) => {
    let mudou = false;
    for (const anterior of anteriores) {
      const atual = mapa.get(anterior.id);
      if (!atual || atual.updated_at !== anterior.updated_at) continue;
      mapa.set(anterior.id, anterior);
      mudou = true;
    }
    return mudou;
  });
}

/**
 * Só as colunas que mudaram (AD-3: vale a última gravação por coluna).
 * Compara com `Object.is`; colunas fora de `atual` contam como mudadas.
 */
export function colunasAlteradas<L extends object>(atual: L, novo: Partial<L>): Partial<L> {
  const saida: Partial<L> = {};
  for (const chave of Object.keys(novo) as (keyof L)[]) {
    if (novo[chave] === undefined) continue;
    if (!Object.is(atual[chave], novo[chave])) saida[chave] = novo[chave];
  }
  return saida;
}
