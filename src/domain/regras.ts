// Regras que aprendem com a classificação (História 3.1, FR-9/10/11, AD-6).
// Uma Regra lembra, para uma chave de Nome, o Responsável e o Tipo da última
// classificação e quantas vezes cada Responsável foi escolhido. Puro: o
// momento ("agora") entra como parâmetro; quem grava é `regrasRepo.aprender()`.
//
// - Chave (`chaveDeRegra`): `normalizarNome` + `*` sem espaços em volta + sem
//   prefixo de adquirente (`PREFIXOS_ADQUIRENTE`) + sem o último pedaço com
//   dígitos ("P4750", "385", "- 314835478") quando sobra outro. É diferente
//   de `normalizarNome` (a chave de previstos e Ajustes) e nunca vai para o
//   SQL. Mudou a regra da chave → sobe `VERSAO_NORMALIZACAO`.
// - Contagem: lista `[{ responsavel_id, n }]` (ids só como valores, para a
//   `substituir_cadastro` trocar ou anular o id dentro do jsonb). Só soma
//   (decisão 6-A): o Responsável que passa a um valor não nulo diferente do
//   anterior ganha +1; nada é subtraído. A Regra criada por uma gravação só de
//   Tipo numa linha que já tem Responsável soma 1 a ele; o mesmo vale para
//   uma Regra que ainda não tem esse Responsável na contagem (com `n > 0`). Ler soma entradas
//   repetidas (depois de uma substituição) e ignora `responsavel_id` nulo
//   (depois de uma exclusão sem substituto).
// - Só escolher ensina (decisão 7-A): um campo que a gravação deixa nulo não
//   muda o campo da Regra (`responsavel_id`/`tipo_id` = último não nulo).
// - Com dúvida: mais de um Responsável (ativo) com `n > 0`. O sugerido é o de
//   maior `n`; no empate, o `responsavel_id` da Regra (senão, o primeiro da
//   contagem).

import { normalizarNome } from "./importacao-fatura";
import type { Resultado } from "./resultado";

/** Versão da regra de `chaveDeRegra`, gravada em cada Regra. */
export const VERSAO_NORMALIZACAO = 1;

/**
 * Prefixos de adquirente (intermediários de pagamento) que somem da chave.
 * Só valem seguidos de `*`; `EBN` e `EBANX` também seguidos de espaço
 * (`PREFIXOS_COM_ESPACO`). "SHOPEE", "AMAZON", "MERCADOLIVRE" são
 * marketplaces e ficam; "MP CONSTRUCOES" e "PG ENGENHARIA" ficam inteiros.
 */
export const PREFIXOS_ADQUIRENTE: readonly string[] = [
  "DM",
  "EBN",
  "EBANX",
  "MP",
  "PG",
  "IFD",
  "PAYPAL",
  "PICPAY",
  "DELTAPG",
  "JIM COM",
  "PAGSEGURO",
  "SUMUP",
];

/** Os prefixos que também saem quando seguidos de espaço ("EBN SPOTIFY"). */
export const PREFIXOS_COM_ESPACO: readonly string[] = ["EBN", "EBANX"];

function alternativas(prefixos: readonly string[]): string {
  // Os mais longos primeiro (por clareza; o separador já impede "PG" de casar "PAGSEGURO").
  return [...prefixos]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const PREFIXO = new RegExp(
  `^(?:(?:${alternativas(PREFIXOS_ADQUIRENTE)})\\*|(?:${alternativas(PREFIXOS_COM_ESPACO)})\\s+)`,
);

/** O último pedaço com dígitos (com o "-" solto antes dele, se houver). */
const ULTIMO_COM_DIGITOS = /\s+(?:-\s+)?[^\s]*\d[^\s]*$/;

/** A chave da tabela `regras` para um Nome da Fatura (AD-6). */
export function chaveDeRegra(nome: string): string {
  let chave = normalizarNome(nome).replace(/\s*\*\s*/g, "*");
  for (;;) {
    const sem = chave.replace(PREFIXO, "").trim();
    if (sem === chave || sem === "") break;
    chave = sem;
  }
  const semDigitos = chave.replace(ULTIMO_COM_DIGITOS, "").trim();
  if (semDigitos !== "" && semDigitos !== "-") chave = semDigitos;
  return chave;
}

/** Uma entrada da contagem como está no banco (o id pode ter sido anulado). */
export type EntradaContagem = { responsavel_id: string | null; n: number };

/** A contagem já lida: um id por entrada, na ordem em que aparecem. */
export type ContagemLida = { responsavel_id: string; n: number }[];

/** O que o núcleo usa de uma linha de `regras`. */
export type RegraGravada = {
  chave: string;
  versao_normalizacao: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  /** `jsonb` do banco: lido com cuidado (`lerContagem`). */
  contagem: unknown;
  ultimo_uso: string;
};

/** A linha a gravar em `regras` (upsert por `owner_id, chave`). */
export type RegraParaGravar = {
  chave: string;
  versao_normalizacao: number;
  responsavel_id: string | null;
  tipo_id: string | null;
  contagem: ContagemLida;
  ultimo_uso: string;
};

/**
 * Lê a contagem do banco: soma as entradas do mesmo Responsável, ignora as
 * de id nulo e o que não for uma entrada válida; `n` negativo vale 0.
 */
export function lerContagem(contagem: unknown): ContagemLida {
  if (!Array.isArray(contagem)) return [];
  const porId = new Map<string, number>();
  for (const e of contagem as unknown[]) {
    if (typeof e !== "object" || e === null) continue;
    const { responsavel_id: id, n } = e as Partial<EntradaContagem>;
    if (typeof id !== "string" || id === "") continue;
    const valor = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    porId.set(id, (porId.get(id) ?? 0) + valor);
  }
  return [...porId].map(([responsavel_id, n]) => ({ responsavel_id, n }));
}

/** Uma classificação que ensina a Regra: o Responsável antes e depois e o Tipo depois. */
export type EventoAprender = {
  nome: string;
  responsavelAntes: string | null;
  responsavelDepois: string | null;
  tipoDepois: string | null;
};

function somarUm(contagem: ContagemLida, id: string): ContagemLida {
  const i = contagem.findIndex((e) => e.responsavel_id === id);
  if (i === -1) return [...contagem, { responsavel_id: id, n: 1 }];
  return contagem.map((e, j) => (j === i ? { ...e, n: e.n + 1 } : e));
}

/**
 * A Regra depois de uma classificação. `responsavel_id`/`tipo_id`: o valor
 * não nulo da linha depois da gravação; nulo mantém o da Regra (só escolher
 * ensina). Contagem só soma: +1 ao Responsável que passa a um valor não nulo
 * diferente do anterior, ou ao Responsável da linha quando a Regra nasce
 * agora ou ainda não o tem na contagem (com `n > 0`). `ultimo_uso` é `agora` (ISO).
 */
export function aprenderRegra(atual: RegraGravada | null, evento: EventoAprender, agora: string): RegraParaGravar {
  let contagem = lerContagem(atual?.contagem);
  const depois = evento.responsavelDepois;
  const semHistorico = depois !== null && !contagem.some((e) => e.responsavel_id === depois && e.n > 0);
  if (depois !== null && (evento.responsavelAntes !== depois || atual === null || semHistorico)) {
    contagem = somarUm(contagem, depois);
  }
  return {
    chave: chaveDeRegra(evento.nome),
    versao_normalizacao: VERSAO_NORMALIZACAO,
    responsavel_id: depois ?? atual?.responsavel_id ?? null,
    tipo_id: evento.tipoDepois ?? atual?.tipo_id ?? null,
    contagem,
    ultimo_uso: agora,
  };
}

/**
 * A Regra depois de vários eventos da mesma chave, na ordem: a mesma
 * `aprenderRegra` evento a evento (três SHOPEE do Casal somam 3), com uma
 * leitura e uma gravação só. Sem eventos, `null` (nada a aprender).
 */
export function aprenderEmLote(
  atual: RegraGravada | null,
  eventos: readonly EventoAprender[],
  agora: string,
): RegraParaGravar | null {
  let regra: RegraParaGravar | null = null;
  for (const evento of eventos) {
    regra = aprenderRegra(regra ?? atual, evento, agora);
  }
  return regra;
}

/**
 * Os eventos agrupados por `chaveDeRegra`, na ordem em que cada chave
 * aparece e, dentro dela, na ordem dos eventos. Nomes diferentes com a mesma
 * chave somam na mesma Regra; chaves diferentes, uma Regra cada.
 */
export function agruparEventosPorChave(eventos: readonly EventoAprender[]): Map<string, EventoAprender[]> {
  const grupos = new Map<string, EventoAprender[]>();
  for (const evento of eventos) {
    const chave = chaveDeRegra(evento.nome);
    const lista = grupos.get(chave);
    if (lista) lista.push(evento);
    else grupos.set(chave, [evento]);
  }
  return grupos;
}

/** Os cadastros que podem ser usados (não arquivados e existentes). */
export type CadastrosAtivos = {
  responsaveis: ReadonlySet<string>;
  tipos: ReadonlySet<string>;
};

/** O que a Regra diz na importação. */
export type AvaliacaoRegra =
  | { tipo: "aplicar"; responsavel_id: string | null; tipo_id: string | null }
  | { tipo: "sugerir_duvida"; responsavel_id: string; tipo_id: string | null; outros_responsaveis: string[] }
  | { tipo: "nada" };

/**
 * Avalia a Regra contra os cadastros ativos (arquivado ou inexistente conta
 * como ausente). Com dúvida (mais de um Responsável ativo com `n > 0`): só
 * sugere o de maior `n` (empate: o da Regra) e os outros. Sem dúvida: aplica
 * o Responsável e o Tipo da Regra que estiverem ativos; nenhum → `nada`.
 */
export function avaliarRegra(regra: RegraGravada, ativos: CadastrosAtivos): AvaliacaoRegra {
  const tipo = regra.tipo_id !== null && ativos.tipos.has(regra.tipo_id) ? regra.tipo_id : null;
  const usados = lerContagem(regra.contagem).filter((e) => e.n > 0 && ativos.responsaveis.has(e.responsavel_id));
  if (usados.length > 1) {
    let sugerido = usados[0];
    for (const e of usados) {
      if (e.n > sugerido.n || (e.n === sugerido.n && e.responsavel_id === regra.responsavel_id)) sugerido = e;
    }
    const outros = usados
      .filter((e) => e !== sugerido)
      .sort((a, b) => b.n - a.n)
      .map((e) => e.responsavel_id);
    return { tipo: "sugerir_duvida", responsavel_id: sugerido.responsavel_id, tipo_id: tipo, outros_responsaveis: outros };
  }
  const responsavel =
    regra.responsavel_id !== null && ativos.responsaveis.has(regra.responsavel_id) ? regra.responsavel_id : null;
  if (responsavel === null && tipo === null) return { tipo: "nada" };
  return { tipo: "aplicar", responsavel_id: responsavel, tipo_id: tipo };
}

// ------------------------------------------------- Regras aprendidas (3.4)
// Tela Configurações → Regras aprendidas: editar, buscar, ordenar e reaplicar.


/** O que a tela usa de uma linha de `regras`. */
export type RegraDaTela = RegraGravada & { id: string };

/** A edição de uma Regra: só o que mudou (`undefined` = não mexe; `null` = limpa). */
export type EdicaoRegra = { responsavel_id?: string | null; tipo_id?: string | null };

/** O que a edição grava em `regras` (nunca a chave, a Divisão nem o `ultimo_uso`). */
export type CorpoEdicaoRegra = {
  responsavel_id: string | null;
  tipo_id: string | null;
  contagem: ContagemLida;
};

/**
 * A Regra depois de editar o Responsável e/ou o Tipo (decisão 3-A):
 * - o Responsável que muda deixa a contagem só com ele (soma das entradas
 *   antigas, mínimo 1) ou vazia, se foi limpo; assim a Regra não segue "com
 *   dúvida" e a edição vale na importação;
 * - só o Tipo mudar não mexe na contagem;
 * - ao menos um dos dois fica preenchido (senão `regra.vazia`).
 * Devolve `null` quando nada muda.
 */
export function editarRegra(atual: RegraGravada, edicao: EdicaoRegra): Resultado<CorpoEdicaoRegra | null> {
  const responsavel = edicao.responsavel_id === undefined ? atual.responsavel_id : edicao.responsavel_id;
  const tipo = edicao.tipo_id === undefined ? atual.tipo_id : edicao.tipo_id;
  if (responsavel === null && tipo === null) return { ok: false, erro: { codigo: "regra.vazia" } };
  const mudouResponsavel = responsavel !== atual.responsavel_id;
  const mudouTipo = tipo !== atual.tipo_id;
  if (!mudouResponsavel && !mudouTipo) return { ok: true, valor: null };
  let contagem = lerContagem(atual.contagem);
  if (mudouResponsavel) {
    const soma = contagem.reduce((total, e) => total + e.n, 0);
    contagem = responsavel === null ? [] : [{ responsavel_id: responsavel, n: Math.max(1, soma) }];
  }
  return { ok: true, valor: { responsavel_id: responsavel, tipo_id: tipo, contagem } };
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Nomes dos cadastros para a busca e a lista (id → nome). */
export type NomesDosCadastros = {
  responsaveis: ReadonlyMap<string, string>;
  tipos: ReadonlyMap<string, string>;
};

/**
 * As Regras cuja chave, Responsável ou Tipo contém o termo (sem acento nem
 * maiúsculas). Termo vazio: todas, na mesma ordem.
 */
export function filtrarRegras<R extends { chave: string; responsavel_id: string | null; tipo_id: string | null }>(
  regras: readonly R[],
  termo: string,
  nomes: NomesDosCadastros,
): R[] {
  const t = semAcento(termo.trim());
  if (t === "") return [...regras];
  return regras.filter((r) => {
    const campos = [
      r.chave,
      r.responsavel_id === null ? "" : (nomes.responsaveis.get(r.responsavel_id) ?? ""),
      r.tipo_id === null ? "" : (nomes.tipos.get(r.tipo_id) ?? ""),
    ];
    return campos.some((c) => semAcento(c).includes(t));
  });
}

/** Mais recentemente usadas primeiro; empate pela chave. */
export function ordenarRegras<R extends { chave: string; ultimo_uso: string }>(regras: readonly R[]): R[] {
  return [...regras].sort((a, b) => {
    const ta = Date.parse(a.ultimo_uso);
    const tb = Date.parse(b.ultimo_uso);
    if (ta !== tb) return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    return a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0;
  });
}

/** Os outros Responsáveis da contagem (com `n > 0`), do mais frequente: "às vezes X". */
export function outrosResponsaveisDaRegra(regra: RegraGravada): string[] {
  return lerContagem(regra.contagem)
    .filter((e) => e.n > 0 && e.responsavel_id !== regra.responsavel_id)
    .sort((a, b) => b.n - a.n)
    .map((e) => e.responsavel_id);
}

/** Uma linha de `lancamentos` para a reaplicação. */
export type LinhaParaReaplicar = {
  id: string;
  nome: string;
  mes: string;
  responsavel_id: string | null;
  tipo_id: string | null;
  ajuste_de_id: string | null;
  excluido_em: string | null;
};

/**
 * "Aplicar a todos": as entradas do lote para as linhas do `mes` que vêm da
 * Regra (`chaveDeRegra(nome) === chave`, não excluídas, não Ajuste, inclusive
 * as classificadas à mão) e ainda diferem do que a edição mudou. Os campos
 * são só os que a edição mudou (decisão 1-A/2-A); a ordem é a recebida.
 */
export function entradasDaReaplicacao(
  chave: string,
  campos: { responsavel_id?: string; tipo_id?: string },
  linhas: readonly LinhaParaReaplicar[],
  mes: string,
): { id: string; campos: { responsavel_id?: string; tipo_id?: string } }[] {
  if (campos.responsavel_id === undefined && campos.tipo_id === undefined) return [];
  const entradas: { id: string; campos: { responsavel_id?: string; tipo_id?: string } }[] = [];
  for (const l of linhas) {
    if (l.mes !== mes || l.excluido_em !== null || l.ajuste_de_id !== null) continue;
    if (chaveDeRegra(l.nome) !== chave) continue;
    const muda =
      (campos.responsavel_id !== undefined && l.responsavel_id !== campos.responsavel_id) ||
      (campos.tipo_id !== undefined && l.tipo_id !== campos.tipo_id);
    if (muda) entradas.push({ id: l.id, campos: { ...campos } });
  }
  return entradas;
}

/**
 * As chaves das Regras que a importação usou (aplicou ou sugeriu): para
 * `regrasRepo.marcarUso`. Sem repetir, na ordem em que aparecem.
 */
export function regrasUsadas(
  nomes: readonly string[],
  regras: readonly RegraGravada[],
  ativos: CadastrosAtivos,
): string[] {
  const porChave = new Map(regras.map((r) => [r.chave, r]));
  const usadas = new Set<string>();
  for (const nome of nomes) {
    const chave = chaveDeRegra(nome);
    const regra = porChave.get(chave);
    if (regra && avaliarRegra(regra, ativos).tipo !== "nada") usadas.add(chave);
  }
  return [...usadas];
}
