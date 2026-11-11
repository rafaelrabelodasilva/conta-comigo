// Painel do Lançamento (História 2.7, FR-7, FR-46, UX-DR14): as regras de
// classificar, corrigir, incluir e excluir. Puro: o relógio, o Mês aberto e
// os cadastros entram como parâmetro; a tela grava pelo repositório.
//
// - Cada campo do painel salva ao sair dele: `mudancaDoCampo` lê o texto do
//   campo, valida e diz qual coluna gravar (ou que nada mudou).
// - Valor: texto lido por `lerReais`; negativo é crédito; zero vale (a
//   Fatura traz a anuidade com R$ 0,00; decisão do Rafael, 09/11/2026), na
//   edição e no "＋ Lançamento", e conta como despesa de R$ 0,00.
// - Data: opcional (`AAAA-MM-DD`, do `<input type="date">`), menos numa
//   linha da Fatura, que o banco exige com data.
// - Apelido até 60 e Observação até 500 caracteres, recortados; em branco
//   viram `null`. Nome (só na inclusão) até 200, recortado.
// - Mudar Valor ou data nunca muda o `mes` (AD-9): o Mês só é calculado na
//   inclusão (`novoLancamento`).
// - Seleção da grade: só estado da tela, nada é gravado.
// - "Alterado em outro aparelho": chegou para o Lançamento aberto uma versão
//   mais nova que a vista e que não veio de uma gravação deste aparelho.

import { ehData, mesDoLancamento, type ConfigCiclo } from "./ciclo";
import { valorDaDiferenca, type Conferencia } from "./conferencia";
import { instanteEmMicros } from "./datas";
import { formatarDinheiro, lerReais } from "./dinheiro";
import { normalizarNome } from "./importacao-fatura";
import { TEXTOS_LANCAMENTO, rotuloConferenciaDiferenca } from "./mensagens";
import type { Resultado } from "./resultado";

export const LIMITE_NOME = 200;
export const LIMITE_APELIDO = 60;
export const LIMITE_OBSERVACAO = 500;
/** O maior valor da coluna `integer` do Postgres (`valor_centavos`). */
export const MAIOR_INTEGER = 2_147_483_647;

/** O que o painel edita de um Lançamento existente (colunas de `lancamentos`). */
export type LancamentoEditavel = {
  /** Linha da Fatura sempre tem data (restrição `lancamentos_fatura_check`). */
  lancado_por?: string;
  /** O Nome (só leitura): um Apelido igual a ele vira nulo (História 3.9). */
  nome?: string;
  valor_centavos: number;
  data: string | null;
  apelido: string | null;
  observacao: string | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  status_id: string | null;
};

/** Os campos editáveis do painel. Nome, Parcela, cartão, Lançado por, `mes` e `fatura_id` não estão aqui. */
export type CampoLancamento = "valor" | "data" | "apelido" | "observacao" | "responsavel" | "tipo" | "status";

/** A coluna de cada campo. */
export const COLUNA_DO_CAMPO = {
  valor: "valor_centavos",
  data: "data",
  apelido: "apelido",
  observacao: "observacao",
  responsavel: "responsavel_id",
  tipo: "tipo_id",
  status: "status_id",
} as const satisfies Record<CampoLancamento, keyof LancamentoEditavel>;

export type ColunaEditavel = (typeof COLUNA_DO_CAMPO)[CampoLancamento];

/** Uma coluna a gravar e o valor novo. */
export type MudancaCampo = { [C in ColunaEditavel]: { coluna: C; valor: LancamentoEditavel[C] } }[ColunaEditavel];

const erro = (codigo: string): { ok: false; erro: { codigo: string } } => ({ ok: false, erro: { codigo } });

/** Valor digitado → centavos. Vazio ou ilegível é recusado; zero vale; negativo é crédito. */
export function lerValor(texto: string): Resultado<number> {
  if (texto.trim() === "") return erro("lancamento.valor_vazio");
  const r = lerReais(texto);
  if (!r.ok || Math.abs(r.valor) > MAIOR_INTEGER) return erro("lancamento.valor_invalido");
  return r;
}

/** Data do `<input type="date">` (`AAAA-MM-DD`); vazia é `null`. */
export function lerDataCompra(texto: string): Resultado<string | null> {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, valor: null };
  return ehData(limpo) ? { ok: true, valor: limpo } : erro("lancamento.data_invalida");
}

/** Apelido recortado, até 60 caracteres; em branco é `null`. */
export function lerApelido(texto: string): Resultado<string | null> {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, valor: null };
  return limpo.length > LIMITE_APELIDO ? erro("lancamento.apelido_longo") : { ok: true, valor: limpo };
}

/** Observação recortada, até 500 caracteres; em branco é `null`. */
export function lerObservacao(texto: string): Resultado<string | null> {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, valor: null };
  return limpo.length > LIMITE_OBSERVACAO ? erro("lancamento.observacao_longa") : { ok: true, valor: limpo };
}

/** Nome (só na inclusão) recortado, obrigatório, até 200 caracteres (também depois de normalizado). */
export function lerNome(texto: string): Resultado<string> {
  const limpo = texto.trim();
  if (limpo === "") return erro("lancamento.nome_vazio");
  if (limpo.length > LIMITE_NOME || normalizarNome(limpo).length > LIMITE_NOME) return erro("lancamento.nome_longo");
  return { ok: true, valor: limpo };
}

/** Valor do seletor de cadastro: "" é "Sem …" (`null`). */
export function lerCadastro(texto: string): string | null {
  return texto === "" ? null : texto;
}

/** O texto que o campo mostra para o valor gravado. */
export function textoDoCampo(l: LancamentoEditavel, campo: CampoLancamento): string {
  switch (campo) {
    case "valor":
      return formatarDinheiro(l.valor_centavos);
    case "data":
      return l.data ?? "";
    case "apelido":
      return l.apelido ?? "";
    case "observacao":
      return l.observacao ?? "";
    case "responsavel":
      return l.responsavel_id ?? "";
    case "tipo":
      return l.tipo_id ?? "";
    case "status":
      return l.status_id ?? "";
  }
}

function lerCampo(campo: CampoLancamento, texto: string): Resultado<MudancaCampo> {
  const em = <C extends ColunaEditavel>(coluna: C, r: Resultado<LancamentoEditavel[C]>): Resultado<MudancaCampo> =>
    r.ok ? { ok: true, valor: { coluna, valor: r.valor } as MudancaCampo } : r;
  switch (campo) {
    case "valor":
      return em("valor_centavos", lerValor(texto));
    case "data":
      return em("data", lerDataCompra(texto));
    case "apelido":
      return em("apelido", lerApelido(texto));
    case "observacao":
      return em("observacao", lerObservacao(texto));
    case "responsavel":
      return em("responsavel_id", { ok: true, valor: lerCadastro(texto) });
    case "tipo":
      return em("tipo_id", { ok: true, valor: lerCadastro(texto) });
    case "status":
      return em("status_id", { ok: true, valor: lerCadastro(texto) });
  }
}

/**
 * Ao sair do campo: a coluna a gravar e o valor novo; `null` quando o valor
 * lido é igual ao gravado (nada a salvar); erro de validação fica no campo.
 */
export function mudancaDoCampo(
  atual: LancamentoEditavel,
  campo: CampoLancamento,
  texto: string,
): Resultado<MudancaCampo | null> {
  const lido = lerCampo(campo, texto);
  if (!lido.ok) return lido;
  let r = lido;
  // Apelido igual ao Nome (sem maiúsculas nem acento) é o mesmo que nenhum Apelido (História 3.9).
  if (r.valor.coluna === "apelido" && r.valor.valor !== null && atual.nome !== undefined) {
    if (normalizarNome(r.valor.valor) === normalizarNome(atual.nome)) r = { ok: true, valor: { coluna: "apelido", valor: null } };
  }
  if (r.valor.coluna === "data" && r.valor.valor === null && atual.lancado_por === "fatura") {
    return erro("lancamento.data_da_fatura");
  }
  return { ok: true, valor: Object.is(atual[r.valor.coluna], r.valor.valor) ? null : r.valor };
}

/** O que se digita no painel vazio de "＋ Lançamento" (textos dos campos). */
export type FormNovoLancamento = {
  nome: string;
  valor: string;
  data: string;
  apelido: string;
  observacao: string;
  responsavel: string;
  tipo: string;
  status: string;
  /** "Corrige a leitura da fatura" marcada (só com Fatura no Mês aberto). */
  corrigeFatura: boolean;
  /** Final do cartão escolhido (só com a caixa marcada). */
  cartao: string;
};

export const FORM_NOVO_VAZIO: FormNovoLancamento = {
  nome: "",
  valor: "",
  data: "",
  apelido: "",
  observacao: "",
  responsavel: "",
  tipo: "",
  status: "",
  corrigeFatura: false,
  cartao: "",
};

/** Os campos do "＋ Lançamento" que podem ter erro. */
export type CampoNovo = "nome" | "valor" | "data" | "apelido" | "observacao" | "cartao";

/** A linha a inserir em `lancamentos` (sem `id`, `owner_id` e `updated_at`, do banco). */
export type NovoLancamento = {
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  data: string | null;
  apelido: string | null;
  observacao: string | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  status_id: string | null;
  lancado_por: "manual";
  mes: string;
  fatura_id: string | null;
  final_cartao: string | null;
};

export type ContextoNovoLancamento = {
  mesAberto: string;
  /** A Fatura do Mês aberto, se houver. */
  fatura: { id: string; mes: string } | null;
  /** Os finais de `fatura_cartoes` dessa Fatura. */
  cartoes: readonly string[];
  configsCiclo: readonly ConfigCiclo[];
};

/** A linha a inserir, ou o erro de cada campo (um código do mapa de mensagens por campo). */
export type ResultadoNovoLancamento =
  | { ok: true; valor: NovoLancamento }
  | { ok: false; erros: Partial<Record<CampoNovo, string>> };

/**
 * "Incluir" do painel vazio. Nome e Valor obrigatórios; `lancado_por =
 * 'manual'`. Com "Corrige a leitura da fatura" marcada (e Fatura no Mês
 * aberto): recebe o `fatura_id`, o `mes` da Fatura e o cartão (obrigatório,
 * um dos finais dela). Sem a caixa: sem cartão, e `mes` pela regra de Ciclo
 * se houver data (sem Ciclo configurado, o Mês aberto); sem data, o Mês
 * aberto (AD-9).
 */
export function novoLancamento(form: FormNovoLancamento, ctx: ContextoNovoLancamento): ResultadoNovoLancamento {
  const erros: Partial<Record<CampoNovo, string>> = {};
  const nome = lerNome(form.nome);
  const valor = lerValor(form.valor);
  const data = lerDataCompra(form.data);
  const apelido = lerApelido(form.apelido);
  const observacao = lerObservacao(form.observacao);
  if (!nome.ok) erros.nome = nome.erro.codigo;
  if (!valor.ok) erros.valor = valor.erro.codigo;
  if (!data.ok) erros.data = data.erro.codigo;
  if (!apelido.ok) erros.apelido = apelido.erro.codigo;
  if (!observacao.ok) erros.observacao = observacao.erro.codigo;
  const corrige = form.corrigeFatura && ctx.fatura !== null;
  if (corrige && !ctx.cartoes.includes(form.cartao)) erros.cartao = "lancamento.sem_cartao";
  if (!nome.ok || !valor.ok || !data.ok || !apelido.ok || !observacao.ok || erros.cartao) return { ok: false, erros };

  let mes = ctx.mesAberto;
  if (corrige) mes = ctx.fatura!.mes;
  else if (data.valor !== null) {
    const doCiclo = mesDoLancamento(data.valor, ctx.configsCiclo);
    if (doCiclo.ok) mes = doCiclo.valor;
  }
  return {
    ok: true,
    valor: {
      nome: nome.valor,
      nome_normalizado: normalizarNome(nome.valor),
      valor_centavos: valor.valor,
      data: data.valor,
      apelido: apelido.valor,
      observacao: observacao.valor,
      responsavel_id: lerCadastro(form.responsavel),
      tipo_id: lerCadastro(form.tipo),
      status_id: lerCadastro(form.status),
      lancado_por: "manual",
      mes,
      fatura_id: corrige ? ctx.fatura!.id : null,
      final_cartao: corrige ? form.cartao : null,
    },
  };
}

/**
 * O texto da Conferência no painel, só num Lançamento da Fatura conferida:
 * "Conferência: ✓" ou "Conferência: diferença de R$ X" (o valor do selo).
 */
export function textoConferenciaDoLancamento(
  l: { fatura_id: string | null },
  conferencia: Conferencia | null,
): string | null {
  if (conferencia === null || l.fatura_id === null || l.fatura_id !== conferencia.faturaId) return null;
  const diferenca = valorDaDiferenca(conferencia);
  return diferenca === null ? TEXTOS_LANCAMENTO.conferencia_ok : rotuloConferenciaDiferenca(diferenca);
}

/** Uma opção de seletor: `valor` "" é "Sem …". */
export type OpcaoCadastro = { valor: string; rotulo: string };

/**
 * As opções de um seletor de cadastro (já na ordem do cadastro): os não
 * arquivados, o arquivado em uso (`atual`), e "Sem …" no fim.
 */
export function opcoesDoCadastro(
  ordenados: readonly { id: string; nome: string; arquivado: boolean }[],
  atual: string | null,
  semRotulo: string,
): OpcaoCadastro[] {
  const lista = ordenados.filter((c) => !c.arquivado || c.id === atual).map((c) => ({ valor: c.id, rotulo: c.nome }));
  return [...lista, { valor: "", rotulo: semRotulo }];
}

// ------------------------------------------------------------------ Seleção

/** Toque na caixa de uma linha: marca ou desmarca. */
export function alternarSelecao(selecao: ReadonlySet<string>, id: string): Set<string> {
  const nova = new Set(selecao);
  if (nova.has(id)) nova.delete(id);
  else nova.add(id);
  return nova;
}

export type EstadoCaixa = "nenhum" | "parcial" | "todos";

/** A caixa do cabeçalho: vazia, parcial ou marcada, sobre as linhas da grade. */
export function estadoCaixaCabecalho(selecao: ReadonlySet<string>, ids: readonly string[]): EstadoCaixa {
  const marcados = ids.filter((id) => selecao.has(id)).length;
  if (ids.length === 0 || marcados === 0) return "nenhum";
  return marcados === ids.length ? "todos" : "parcial";
}

/** Toque na caixa do cabeçalho: com todas marcadas, desmarca as da grade; senão, marca todas. */
export function alternarTodos(selecao: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const nova = new Set(selecao);
  if (estadoCaixaCabecalho(selecao, ids) === "todos") for (const id of ids) nova.delete(id);
  else for (const id of ids) nova.add(id);
  return nova;
}

/** A seleção só com os Lançamentos que ainda existem (um excluído sai dela). */
export function selecaoValida(selecao: ReadonlySet<string>, existentes: readonly string[]): Set<string> {
  const ids = new Set(existentes);
  return new Set([...selecao].filter((id) => ids.has(id)));
}

// ---------------------------------------------- Alterado em outro aparelho

/**
 * Chegou para o Lançamento aberto uma versão (`chegou`, o `updated_at`)
 * mais nova que a vista e que não é de uma gravação deste aparelho
 * (`gravadosAqui`, os `updated_at` devolvidos pelas gravações do painel)?
 * Compara instantes, não textos: o Realtime e o PostgREST escrevem o mesmo
 * instante de jeitos diferentes.
 */
export function alteradoEmOutroAparelho(visto: string, chegou: string, gravadosAqui: readonly string[]): boolean {
  const novo = instanteEmMicros(chegou);
  if (Number.isNaN(novo)) return false;
  const anterior = instanteEmMicros(visto);
  if (!Number.isNaN(anterior) && novo <= anterior) return false;
  return !gravadosAqui.some((g) => instanteEmMicros(g) === novo);
}
