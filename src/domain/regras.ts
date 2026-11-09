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
