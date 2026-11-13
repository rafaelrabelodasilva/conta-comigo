// Importar o histórico da planilha "Cartão" (História 3.10, FR-2, AD-1/6/8/9).
// Tudo o que a importação decide sai daqui; a tela só lê o arquivo (biblioteca
// de `.xlsx`, fora do núcleo) e a RPC `importar_aba_planilha` só grava o que
// este arquivo calculou. Puro: sem relógio, rede ou banco; só imports relativos.
//
// Formato (lido da planilha em 13/11/2026): uma aba por Mês `MM/AAAA`; colunas
// A a H `Despesa | Valor | Parcela | Observação | Tipo | Resposabilidade |
// Lançado por | Status dívida`; Valor é texto brasileiro ("1.140,74",
// crédito "(25,00)"); Parcela "09/12" ("1/1" é à vista); "Selecionar" é vazio.
//
// - Linha: `lerAba` valida cada linha com zod; a aba inteira falha se uma
//   linha é inválida ("Não foi possível ler a aba 03/2026").
// - Divisão (Monjaro): linhas seguidas com mesmo Nome, Parcela e Observação
//   (preenchida), todas com Responsável e ao menos dois diferentes, viram uma
//   mãe (soma dos Valores) com Divisão em frações dos valores e filhas. O Tipo
//   da mãe é o da maior parte.
// - Nome digitado à mão (alguma letra minúscula): entra no histórico, mas não
//   ensina Regra e não tem Série nem previsto.
// - Séries (`atribuirSeries`) e previstos (`gerarPrevistos`) só nascem de Nome
//   de fatura; previsto não nasce em Mês com Fatura, em Mês de aba da mesma
//   importação, em Mês que já tem histórico, nem onde o app já tem a mesma
//   parcela do mesmo Nome (comparado sem `*` e sem espaços).
// - Regras iniciais: uma por `chaveDaPlanilha`; Responsável e Tipo mais
//   frequentes (empate: o mais recente); a Divisão da última ocorrência.

import { z } from "zod";
import { arredondar, dividirEmPartes, lerReais } from "./dinheiro";
import { lerDivisao, type Divisao, type ParteParaGravar } from "./divisao";
import { normalizarNome } from "./importacao-fatura";
import { atribuirSeries, gerarPrevistos, type ChaveDaSerie, type LinhaParaPrever, type PrevistoParaGravar } from "./previstos";
import { chaveDaPlanilha, VERSAO_NORMALIZACAO, type ContagemLida, type RegraParaGravar } from "./regras";
import type { Resultado } from "./resultado";

// ------------------------------------------------------------------ abas

/** Mês das abas marcadas por padrão (01/2026 a 10/2026). */
export const PRIMEIRO_MES_MARCADO = "2026-01";
export const ULTIMO_MES_MARCADO = "2026-10";

const NOME_DE_ABA = /^(0[1-9]|1[0-2])\/(\d{4})$/;

/** O Mês `AAAA-MM` de uma aba `MM/AAAA`; outras abas ("Página5", "TBC 00/2026") → null. */
export function mesDaAba(nome: string): string | null {
  const m = NOME_DE_ABA.exec(nome.trim());
  return m ? `${m[2]}-${m[1]}` : null;
}

/** O nome da aba como Rafael vê ("03/2026"), a partir do Mês. */
export function nomeDaAba(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export type AbaDaPlanilha = { nome: string; mes: string; marcada: boolean };

/** As abas que são um Mês, do mais antigo ao mais novo; 01/2026 a 10/2026 marcadas. */
export function abasDaPlanilha(nomes: readonly string[]): AbaDaPlanilha[] {
  const vistos = new Set<string>();
  const abas: AbaDaPlanilha[] = [];
  for (const nome of nomes) {
    const mes = mesDaAba(nome);
    if (mes === null || vistos.has(mes)) continue;
    vistos.add(mes);
    abas.push({ nome, mes, marcada: mes >= PRIMEIRO_MES_MARCADO && mes <= ULTIMO_MES_MARCADO });
  }
  return abas.sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
}

// ----------------------------------------------------------- leitura

/** O que a biblioteca de `.xlsx` devolve em cada célula. */
export type Celula = string | number | boolean | Date | null | undefined;
export type CelulasDaAba = readonly (readonly Celula[])[];

/** Uma linha lida e validada da aba. */
export type LinhaLida = {
  /** Número da linha na planilha (a primeira linha de dados é a 2). */
  linha: number;
  despesa: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  observacao: string | null;
  tipo: string | null;
  responsavel: string | null;
  status: string | null;
  /** O Nome tem letra minúscula: foi digitado à mão, não veio da fatura. */
  digitado_a_mao: boolean;
};

const COLUNAS_ESPERADAS = ["despesa", "valor", "parcela", "observacao", "tipo", "responsabilidade", "status divida"] as const;
type ChaveDeColuna = (typeof COLUNAS_ESPERADAS)[number];

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Cabeçalho → coluna. "Resposabilidade" (com o erro de grafia) vale como "Responsabilidade". */
function colunaDoCabecalho(texto: string): ChaveDeColuna | null {
  const t = semAcento(texto);
  if (t === "resposabilidade") return "responsabilidade";
  return (COLUNAS_ESPERADAS as readonly string[]).includes(t) ? (t as ChaveDeColuna) : null;
}

function textoDaCelula(c: Celula): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string") return c.replace(/\s+/g, " ").trim();
  if (c instanceof Date) return "";
  return String(c).trim();
}

/** Valor de cadastro: vazio ou "Selecionar" (o texto do menu da planilha) → null. */
function cadastroDaCelula(c: Celula): string | null {
  const t = textoDaCelula(c);
  return t === "" || semAcento(t) === "selecionar" ? null : t;
}

function valorEmCentavos(c: Celula): Resultado<number> {
  if (typeof c === "number") {
    if (!Number.isFinite(c)) return { ok: false, erro: { codigo: "planilha.valor_invalido" } };
    return { ok: true, valor: arredondar(c * 100) };
  }
  if (typeof c !== "string") return { ok: false, erro: { codigo: "planilha.valor_invalido" } };
  let t = c.replace(/[\s ]/g, "");
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  const lido = lerReais(t);
  if (!lido.ok) return { ok: false, erro: { codigo: "planilha.valor_invalido" } };
  return { ok: true, valor: negativo && lido.valor !== 0 ? -lido.valor : lido.valor };
}

const PARCELA = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;

function parcelaDaCelula(c: Celula): Resultado<{ n: number | null; total: number | null }> {
  const vazio = { ok: true, valor: { n: null, total: null } } as const;
  if (c === null || c === undefined) return vazio;
  if (typeof c !== "string") return { ok: false, erro: { codigo: "planilha.parcela_invalida" } };
  const t = c.trim();
  if (t === "") return vazio;
  const m = PARCELA.exec(t);
  if (!m) return { ok: false, erro: { codigo: "planilha.parcela_invalida" } };
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (n === 1 && total === 1) return vazio;
  if (total < 2 || total > 999 || n < 1 || n > total) return { ok: false, erro: { codigo: "planilha.parcela_invalida" } };
  return { ok: true, valor: { n, total } };
}

/** A linha bruta (colunas já achadas) depois do schema zod do núcleo. */
const SchemaDaLinha = z.object({
  despesa: z.string().min(1).max(200),
  valor_centavos: z.number().int(),
  parcela_n: z.number().int().min(1).max(999).nullable(),
  parcela_total: z.number().int().min(2).max(999).nullable(),
  observacao: z.string().max(500).nullable(),
  tipo: z.string().min(1).max(30).nullable(),
  responsavel: z.string().min(1).max(30).nullable(),
  status: z.string().min(1).max(30).nullable(),
});

export type ErroDeAba = { codigo: string; linha?: number; detalhe?: string };

export type ResultadoDaLeitura =
  | { ok: true; valor: LinhaLida[] }
  | { ok: false; erro: { codigo: string; detalhe?: string }; erros: ErroDeAba[] };

/**
 * Lê as células de uma aba. A primeira linha é o cabeçalho; só as colunas A a
 * H (as outras são tabelas de apoio) e só até a última linha com Despesa ou
 * Valor. Linha sem Despesa e sem Valor é ignorada. Uma linha inválida derruba
 * a aba inteira (nada é gravado de uma aba pela metade).
 */
export function lerAba(celulas: CelulasDaAba): ResultadoDaLeitura {
  const cabecalho = celulas[0] ?? [];
  const coluna = new Map<ChaveDeColuna, number>();
  for (let i = 0; i < Math.min(cabecalho.length, 8); i++) {
    const chave = colunaDoCabecalho(textoDaCelula(cabecalho[i]));
    if (chave !== null && !coluna.has(chave)) coluna.set(chave, i);
  }
  for (const obrigatoria of ["despesa", "valor", "parcela", "tipo", "responsabilidade"] as const) {
    if (!coluna.has(obrigatoria)) {
      return { ok: false, erro: { codigo: "planilha.cabecalho", detalhe: obrigatoria }, erros: [{ codigo: "planilha.cabecalho", detalhe: obrigatoria }] };
    }
  }
  const celula = (linha: readonly Celula[], c: ChaveDeColuna): Celula => {
    const i = coluna.get(c);
    return i === undefined ? null : linha[i];
  };

  const linhas: LinhaLida[] = [];
  const erros: ErroDeAba[] = [];
  for (let r = 1; r < celulas.length; r++) {
    const bruta = celulas[r] ?? [];
    const despesa = textoDaCelula(celula(bruta, "despesa"));
    const valorBruto = celula(bruta, "valor");
    const semValor = valorBruto === null || valorBruto === undefined || textoDaCelula(valorBruto) === "";
    if (despesa === "" && semValor) continue;
    const numero = r + 1;
    if (despesa === "") {
      erros.push({ codigo: "planilha.despesa_vazia", linha: numero });
      continue;
    }
    if (semValor) {
      erros.push({ codigo: "planilha.valor_ausente", linha: numero });
      continue;
    }
    const valor = valorEmCentavos(valorBruto);
    if (!valor.ok) {
      erros.push({ codigo: valor.erro.codigo, linha: numero });
      continue;
    }
    const parcela = parcelaDaCelula(celula(bruta, "parcela"));
    if (!parcela.ok) {
      erros.push({ codigo: parcela.erro.codigo, linha: numero });
      continue;
    }
    const observacao = textoDaCelula(celula(bruta, "observacao"));
    const lida = SchemaDaLinha.safeParse({
      despesa,
      valor_centavos: valor.valor,
      parcela_n: parcela.valor.n,
      parcela_total: parcela.valor.total,
      observacao: observacao === "" ? null : observacao,
      tipo: cadastroDaCelula(celula(bruta, "tipo")),
      responsavel: cadastroDaCelula(celula(bruta, "responsabilidade")),
      status: cadastroDaCelula(celula(bruta, "status divida")),
    });
    if (!lida.success) {
      erros.push({ codigo: "planilha.linha_invalida", linha: numero, detalhe: lida.error.issues[0]?.path.join(".") });
      continue;
    }
    linhas.push({ linha: numero, ...lida.data, digitado_a_mao: /\p{Ll}/u.test(despesa) });
  }
  if (erros.length > 0) return { ok: false, erro: { codigo: erros[0].codigo, detalhe: erros[0].detalhe }, erros };
  return { ok: true, valor: linhas };
}

// ----------------------------------------------------------- Divisão

/** Uma unidade da aba: uma linha comum ou várias linhas seguidas que formam uma Divisão. */
export type UnidadeDaAba = {
  /** As linhas da planilha que formam a unidade (1 ou mais, na ordem). */
  linhas: LinhaLida[];
  /** Mais de uma linha: é uma Divisão. */
  dividida: boolean;
  nome: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  observacao: string | null;
  /** Tipo da linha, ou o da maior parte numa Divisão. */
  tipo: string | null;
  /** Responsável da linha comum; nulo na Divisão. */
  responsavel: string | null;
  status: string | null;
  digitado_a_mao: boolean;
};

function mesmaChaveDeDivisao(a: LinhaLida, b: LinhaLida): boolean {
  return (
    a.observacao !== null &&
    a.observacao === b.observacao &&
    normalizarNome(a.despesa) === normalizarNome(b.despesa) &&
    a.parcela_n === b.parcela_n &&
    a.parcela_total === b.parcela_total &&
    a.valor_centavos > 0 &&
    b.valor_centavos > 0 &&
    a.responsavel !== null &&
    b.responsavel !== null
  );
}

/** Junta as linhas da Divisão (Monjaro) e deixa as outras como unidades de uma linha. */
export function unidadesDaAba(linhas: readonly LinhaLida[]): UnidadeDaAba[] {
  const unidades: UnidadeDaAba[] = [];
  let i = 0;
  while (i < linhas.length) {
    let fim = i + 1;
    while (fim < linhas.length && mesmaChaveDeDivisao(linhas[fim - 1], linhas[fim]) && fim - i < 10) fim++;
    const grupo = linhas.slice(i, fim);
    const distintos = new Set(grupo.map((l) => l.responsavel)).size;
    if (grupo.length >= 2 && distintos >= 2) {
      const maior = grupo.reduce((m, l) => (l.valor_centavos > m.valor_centavos ? l : m), grupo[0]);
      unidades.push({
        linhas: grupo,
        dividida: true,
        nome: grupo[0].despesa,
        valor_centavos: grupo.reduce((soma, l) => soma + l.valor_centavos, 0),
        parcela_n: grupo[0].parcela_n,
        parcela_total: grupo[0].parcela_total,
        observacao: grupo[0].observacao,
        tipo: maior.tipo,
        responsavel: null,
        status: grupo[0].status,
        digitado_a_mao: grupo.some((l) => l.digitado_a_mao),
      });
      i = fim;
    } else {
      const l = linhas[i];
      unidades.push({
        linhas: [l],
        dividida: false,
        nome: l.despesa,
        valor_centavos: l.valor_centavos,
        parcela_n: l.parcela_n,
        parcela_total: l.parcela_total,
        observacao: l.observacao,
        tipo: l.tipo,
        responsavel: l.responsavel,
        status: l.status,
        digitado_a_mao: l.digitado_a_mao,
      });
      i += 1;
    }
  }
  return unidades;
}

// --------------------------------------------------------- cadastros

/** Um cadastro do app (Responsável, Tipo ou Status). */
export type CadastroDoApp = { id: string; nome: string; arquivado: boolean };

export type CadastrosDoApp = {
  responsaveis: readonly CadastroDoApp[];
  tipos: readonly CadastroDoApp[];
  status: readonly CadastroDoApp[];
};

/** O que a importação pede dos cadastros. */
export type PlanoDeCadastros = {
  criar: { responsaveis: string[]; tipos: string[]; status: { nome: string; conta_como_pago: boolean }[] };
  /** Ids de cadastros arquivados com o mesmo nome, que voltam às escolhas. */
  reativar: { responsaveis: string[]; tipos: string[]; status: string[] };
};

/** Compara nomes sem acento, maiúsculas e espaços a mais. */
function chaveDeCadastro(nome: string): string {
  return semAcento(nome);
}

function planejarUm(
  pedidos: readonly string[],
  existentes: readonly CadastroDoApp[],
): { criar: string[]; reativar: string[] } {
  const criar: string[] = [];
  const reativar: string[] = [];
  const vistos = new Set<string>();
  for (const nome of pedidos) {
    const chave = chaveDeCadastro(nome);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const ativo = existentes.find((e) => !e.arquivado && chaveDeCadastro(e.nome) === chave);
    if (ativo) continue;
    const arquivado = existentes.find((e) => e.arquivado && chaveDeCadastro(e.nome) === chave);
    if (arquivado) reativar.push(arquivado.id);
    else criar.push(nome);
  }
  return { criar, reativar };
}

/** Os nomes de Responsável, Tipo e Status usados pelas linhas lidas, sem repetir, na ordem em que aparecem. */
export function nomesDosCadastros(linhas: readonly LinhaLida[]): { responsaveis: string[]; tipos: string[]; status: string[] } {
  const ordenados = (pegar: (l: LinhaLida) => string | null) => {
    const vistos = new Set<string>();
    const nomes: string[] = [];
    for (const l of linhas) {
      const n = pegar(l);
      if (n === null || vistos.has(chaveDeCadastro(n))) continue;
      vistos.add(chaveDeCadastro(n));
      nomes.push(n);
    }
    return nomes;
  };
  return {
    responsaveis: ordenados((l) => l.responsavel),
    tipos: ordenados((l) => l.tipo),
    status: ordenados((l) => l.status),
  };
}

/** Quais cadastros criar e quais arquivados reativar. "Pago" conta como pago; os outros Status, não. */
export function planejarCadastros(linhas: readonly LinhaLida[], app: CadastrosDoApp): PlanoDeCadastros {
  const nomes = nomesDosCadastros(linhas);
  const r = planejarUm(nomes.responsaveis, app.responsaveis);
  const t = planejarUm(nomes.tipos, app.tipos);
  const s = planejarUm(nomes.status, app.status);
  return {
    criar: {
      responsaveis: r.criar,
      tipos: t.criar,
      status: s.criar.map((nome) => ({ nome, conta_como_pago: chaveDeCadastro(nome) === "pago" })),
    },
    reativar: { responsaveis: r.reativar, tipos: t.reativar, status: s.reativar },
  };
}

/**
 * Os cadastros do app mais os que a importação vai criar (com id provisório
 * `novo:Nome`), para a prévia planejar sem gravar nada. Os arquivados que
 * voltam contam como ativos.
 */
export function cadastrosComOsNovos(app: CadastrosDoApp, plano: PlanoDeCadastros): CadastrosDoApp {
  const com = (lista: readonly CadastroDoApp[], criar: readonly string[], reativar: readonly string[]): CadastroDoApp[] => [
    ...lista.map((c) => (reativar.includes(c.id) ? { ...c, arquivado: false } : c)),
    ...criar.map((nome) => ({ id: `novo:${nome}`, nome, arquivado: false })),
  ];
  return {
    responsaveis: com(app.responsaveis, plano.criar.responsaveis, plano.reativar.responsaveis),
    tipos: com(app.tipos, plano.criar.tipos, plano.reativar.tipos),
    status: com(app.status, plano.criar.status.map((s) => s.nome), plano.reativar.status),
  };
}

/** Como achar o id de um cadastro pelo nome da planilha. */
export type ResolverCadastros = {
  responsavel: (nome: string) => string | null;
  tipo: (nome: string) => string | null;
  status: (nome: string) => string | null;
};

/** O resolvedor sobre as listas do app (nome sem acento nem maiúsculas; ativos primeiro). */
export function resolverCadastros(app: CadastrosDoApp): ResolverCadastros {
  const achar = (lista: readonly CadastroDoApp[]) => {
    const mapa = new Map<string, string>();
    for (const c of [...lista].sort((a, b) => Number(b.arquivado) - Number(a.arquivado))) {
      mapa.set(chaveDeCadastro(c.nome), c.id);
    }
    return (nome: string) => mapa.get(chaveDeCadastro(nome)) ?? null;
  };
  return { responsavel: achar(app.responsaveis), tipo: achar(app.tipos), status: achar(app.status) };
}

// ---------------------------------------------------------- planejar a aba

/** A parte (filha) de uma Divisão da planilha, para a RPC. */
export type ParteDoHistorico = ParteParaGravar & { status_id: string | null };

/** Uma linha-mãe da aba como a RPC `importar_aba_planilha` a recebe. */
export type LinhaDoHistorico = {
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  observacao: string | null;
  tipo_id: string | null;
  responsavel_id: string | null;
  status_id: string | null;
  serie: ChaveDaSerie | null;
  divisao: Divisao | null;
  partes: ParteDoHistorico[] | null;
};

/** O que o app já tem, para o previsto não duplicar. */
export type LinhaDoApp = {
  nome: string;
  mes: string;
  parcela_n: number | null;
  parcela_total: number | null;
  /** Previsto (`sistema`) que ninguém editou? A reimportação do Mês dele o troca. */
  lancado_por?: string;
  editado?: boolean;
  /** O Mês da linha `historico` que gerou o previsto (null se não veio de histórico). */
  origem_historico_mes?: string | null;
};

/** A RPC `importar_aba_planilha` apaga esta linha ao regravar o Mês `mes`? (Mesma regra do SQL.) */
export function seraTrocadaPelaAba(l: LinhaDoApp, mes: string): boolean {
  if (l.lancado_por === "historico") return l.mes === mes;
  return l.lancado_por === "sistema" && l.editado !== true && (l.mes === mes || l.origem_historico_mes === mes);
}

export type EstadoDoApp = {
  /** Meses (AAAA-MM) que têm Fatura. */
  mesesComFatura: readonly string[];
  /** Meses que já têm linhas `historico` (a aba os substitui). */
  mesesComHistorico: readonly string[];
  /** Os Lançamentos não excluídos do app, para o previsto não repetir parcela. */
  linhas: readonly LinhaDoApp[];
};

/** Uma aba lida e pronta para planejar. */
export type AbaLida = { nome: string; mes: string; linhas: LinhaLida[] };

export type PlanoDaAba = {
  mes: string;
  nome: string;
  /** Mês com Fatura: nada é gravado, a aba só ensina Regras. */
  soRegras: boolean;
  /** Já tem histórico: as linhas `historico` do Mês são trocadas. */
  substitui: boolean;
  linhas: LinhaDoHistorico[];
  previstos: PrevistoParaGravar[];
  resumo: { lancamentos: number; digitadosAMao: number; divisoes: number; series: number; previstos: number };
};

/** Compara Nomes sem `*`, espaços e acento. */
export function chaveComparavel(nome: string): string {
  return normalizarNome(nome).replace(/[\s*]/g, "");
}

function chaveDoPrevisto(nome: string, mes: string, n: number, total: number): string {
  return JSON.stringify([chaveComparavel(nome), mes, n, total]);
}

/** As chaves `[Nome comparável, Mês, parcela]` do que o app e a importação já têm. */
export function indiceDeParcelas(linhas: readonly LinhaDoApp[]): Set<string> {
  const indice = new Set<string>();
  for (const l of linhas) {
    if (l.parcela_n !== null && l.parcela_total !== null) indice.add(chaveDoPrevisto(l.nome, l.mes, l.parcela_n, l.parcela_total));
  }
  return indice;
}

/** A Divisão em frações dos valores da planilha, ou null se algum Responsável não existe ou a conta não fecha. */
function criarDivisao(unidade: UnidadeDaAba, responsavel: ResolverCadastros): Divisao | null {
  const total = unidade.valor_centavos;
  const partesDivisao = unidade.linhas.map((l) => ({
    responsavel_id: responsavel.responsavel(l.responsavel ?? "") ?? "",
    numerador: l.valor_centavos,
    denominador: total,
  }));
  const divisao = lerDivisao({ modo: "valor", partes: partesDivisao });
  if (divisao === null) return null;
  const valores = dividirEmPartes(
    total,
    divisao.partes.map((p) => ({ numerador: p.numerador, denominador: p.denominador })),
  );
  if (!valores.ok || valores.valor.some((v, i) => v !== unidade.linhas[i].valor_centavos)) return null;
  return divisao;
}

type UnidadeResolvida = { unidade: UnidadeDaAba; divisao: Divisao | null };

function unidadeDeUmaLinha(l: LinhaLida): UnidadeDaAba {
  return {
    linhas: [l],
    dividida: false,
    nome: l.despesa,
    valor_centavos: l.valor_centavos,
    parcela_n: l.parcela_n,
    parcela_total: l.parcela_total,
    observacao: l.observacao,
    tipo: l.tipo,
    responsavel: l.responsavel,
    status: l.status,
    digitado_a_mao: l.digitado_a_mao,
  };
}

/** Uma Divisão que não fecha vira as linhas soltas (nada se perde). */
function unidadesResolvidas(linhas: readonly LinhaLida[], cadastros: ResolverCadastros): UnidadeResolvida[] {
  const resolvidas: UnidadeResolvida[] = [];
  for (const u of unidadesDaAba(linhas)) {
    const divisao = u.dividida ? criarDivisao(u, cadastros) : null;
    if (!u.dividida || divisao !== null) resolvidas.push({ unidade: u, divisao });
    else for (const l of u.linhas) resolvidas.push({ unidade: unidadeDeUmaLinha(l), divisao: null });
  }
  return resolvidas;
}

/**
 * Planeja uma aba: linhas-mãe com classificação da planilha, Séries (de Nomes
 * de fatura) e previstos. `mesesDasAbas` são os Meses de todas as abas desta
 * importação (nenhum previsto cai neles); `parcelasDoApp` é o índice do que o
 * app já tem (`indiceDeParcelas`) e é atualizado com o que esta aba cria.
 */
export function planejarAba(
  aba: AbaLida,
  cadastros: ResolverCadastros,
  app: EstadoDoApp,
  mesesDasAbas: ReadonlySet<string>,
  parcelasDoApp: Set<string>,
): PlanoDaAba {
  const soRegras = app.mesesComFatura.includes(aba.mes);
  const resolvidas = unidadesResolvidas(aba.linhas, cadastros);
  const unidades = resolvidas.map((r) => r.unidade);
  const idDe = (nome: string | null, pegar: (n: string) => string | null) => (nome === null ? null : pegar(nome));

  const linhas: LinhaDoHistorico[] = resolvidas.map(({ unidade: u, divisao }) => {
    const status = idDe(u.status, cadastros.status);
    return {
      nome: u.nome,
      nome_normalizado: normalizarNome(u.nome),
      valor_centavos: u.valor_centavos,
      parcela_n: u.parcela_n,
      parcela_total: u.parcela_total,
      observacao: u.observacao,
      tipo_id: idDe(u.tipo, cadastros.tipo),
      responsavel_id: u.dividida ? null : idDe(u.responsavel, cadastros.responsavel),
      status_id: status,
      serie: null,
      divisao,
      partes: divisao
        ? u.linhas.map((l) => ({
            filha_id: null,
            responsavel_id: cadastros.responsavel(l.responsavel ?? "") ?? "",
            valor_centavos: l.valor_centavos,
            status_id: idDe(l.status, cadastros.status),
          }))
        : null,
    };
  });

  // Séries só de Nome de fatura (sem letra minúscula); a posição é a ordem.
  const paraSerie = unidades.flatMap((u, i) =>
    u.digitado_a_mao
      ? []
      : [
          {
            i,
            nome_normalizado: normalizarNome(u.nome),
            valor_centavos: u.valor_centavos,
            parcela_n: u.parcela_n,
            parcela_total: u.parcela_total,
            ordem_fatura: i + 1,
            ajuste_de_ordem: null,
          },
        ],
  );
  for (const s of atribuirSeries(paraSerie, aba.mes)) linhas[s.i].serie = s.serie;

  const previstos: PrevistoParaGravar[] = [];
  if (!soRegras) {
    const paraPrever: LinhaParaPrever[] = unidades.flatMap((u, i) =>
      linhas[i].serie === null
        ? []
        : [
            {
              nome: u.nome,
              nome_normalizado: linhas[i].nome_normalizado,
              valor_centavos: u.valor_centavos,
              parcela_n: u.parcela_n,
              parcela_total: u.parcela_total,
              ordem_fatura: i + 1,
              responsavel_id: linhas[i].responsavel_id,
              tipo_id: linhas[i].tipo_id,
              observacao: u.observacao,
              divisao: linhas[i].divisao,
              serie: linhas[i].serie,
            },
          ],
    );
    const bloqueados = new Set([...app.mesesComFatura, ...app.mesesComHistorico, ...mesesDasAbas]);
    for (const p of gerarPrevistos(paraPrever, aba.mes, bloqueados)) {
      const chave = chaveDoPrevisto(p.nome, p.mes, p.parcela_n, p.parcela_total);
      if (parcelasDoApp.has(chave)) continue;
      parcelasDoApp.add(chave);
      previstos.push(p);
    }
    for (const u of unidades) {
      if (u.parcela_n !== null && u.parcela_total !== null) parcelasDoApp.add(chaveDoPrevisto(u.nome, aba.mes, u.parcela_n, u.parcela_total));
    }
  }

  const series = new Set(linhas.flatMap((l) => (l.serie ? [JSON.stringify(l.serie)] : [])));
  return {
    mes: aba.mes,
    nome: aba.nome,
    soRegras,
    substitui: !soRegras && app.mesesComHistorico.includes(aba.mes),
    linhas: soRegras ? [] : linhas,
    previstos,
    resumo: {
      lancamentos: soRegras ? 0 : linhas.length,
      digitadosAMao: unidades.filter((u) => u.digitado_a_mao).length,
      divisoes: soRegras ? 0 : linhas.filter((l) => l.divisao !== null).length,
      series: soRegras ? 0 : series.size,
      previstos: previstos.length,
    },
  };
}

/** `existentes` do app mais as abas (para planejar as abas em ordem sem repetir previstos). */
export function planejarAbas(
  abas: readonly AbaLida[],
  cadastros: ResolverCadastros,
  app: EstadoDoApp,
): PlanoDaAba[] {
  const ordenadas = [...abas].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const meses = new Set(ordenadas.map((a) => a.mes));
  // O que o app tem, menos o que a gravação de cada aba troca; o que as abas
  // anteriores desta importação criaram entra em seguida.
  const planejado = new Set<string>();
  return ordenadas.map((a) => {
    const parcelas = indiceDeParcelas(app.linhas.filter((l) => !seraTrocadaPelaAba(l, a.mes)));
    for (const k of planejado) parcelas.add(k);
    const antes = new Set(parcelas);
    const plano = planejarAba(a, cadastros, app, meses, parcelas);
    for (const k of parcelas) if (!antes.has(k)) planejado.add(k);
    return plano;
  });
}

// ---------------------------------------------------------- Regras iniciais

type Ocorrencia = {
  chave: string;
  responsavel_id: string | null;
  tipo_id: string | null;
  divisao: Divisao | null;
};

function maisFrequente(ids: readonly string[]): string | null {
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  let melhor: string | null = null;
  let vezes = 0;
  // Do mais recente ao mais antigo: no empate, vale o mais recente.
  for (const id of [...ids].reverse()) {
    const v = n.get(id) ?? 0;
    if (v > vezes) {
      melhor = id;
      vezes = v;
    }
  }
  return melhor;
}

/**
 * As Regras iniciais das abas (em ordem de Mês, e linhas na ordem da aba):
 * uma por `chaveDaPlanilha`, só de Nome de fatura (sem letra minúscula) e sem
 * créditos. Responsável e Tipo mais frequentes (empate: o mais recente); a
 * Divisão só se a última ocorrência do Nome foi dividida. Quem grava ignora a
 * chave que já tem Regra.
 */
export function regrasIniciais(
  abas: readonly AbaLida[],
  cadastros: ResolverCadastros,
  agora: string,
): RegraParaGravar[] {
  const ordenadas = [...abas].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const ocorrencias: Ocorrencia[] = [];
  for (const aba of ordenadas) {
    for (const { unidade: u, divisao } of unidadesResolvidas(aba.linhas, cadastros)) {
      if (u.digitado_a_mao || u.valor_centavos <= 0) continue;
      ocorrencias.push({
        chave: chaveDaPlanilha(u.nome),
        responsavel_id: divisao ? null : u.responsavel === null ? null : cadastros.responsavel(u.responsavel),
        tipo_id: u.tipo === null ? null : cadastros.tipo(u.tipo),
        divisao,
      });
    }
  }
  const porChave = new Map<string, Ocorrencia[]>();
  for (const o of ocorrencias) {
    const lista = porChave.get(o.chave);
    if (lista) lista.push(o);
    else porChave.set(o.chave, [o]);
  }
  const regras: RegraParaGravar[] = [];
  for (const [chave, lista] of porChave) {
    const ultima = lista[lista.length - 1];
    const responsaveis = lista.flatMap((o) => (o.responsavel_id === null ? [] : [o.responsavel_id]));
    const tipos = lista.flatMap((o) => (o.tipo_id === null ? [] : [o.tipo_id]));
    const responsavel = maisFrequente(responsaveis);
    const tipo = maisFrequente(tipos);
    const divisao = ultima.divisao;
    if (responsavel === null && tipo === null && divisao === null) continue;
    const contagem: ContagemLida = [];
    for (const id of responsaveis) {
      const e = contagem.find((c) => c.responsavel_id === id);
      if (e) e.n += 1;
      else contagem.push({ responsavel_id: id, n: 1 });
    }
    regras.push({
      chave,
      versao_normalizacao: VERSAO_NORMALIZACAO,
      responsavel_id: responsavel,
      tipo_id: tipo,
      contagem,
      ultimo_uso: agora,
      divisao: divisao === null ? null : { ...divisao, partes: divisao.partes.map((p) => ({ ...p })) },
    });
  }
  return regras;
}

// ------------------------------------------------------------- resumo

export type ResultadoDaAba = { mes: string; nome: string; ok: boolean; lancamentos: number; erro?: string };

export type ResumoDaImportacao = {
  lancamentos: number;
  responsaveis: number;
  tipos: number;
  status: number;
  regras: number;
  abasComErro: string[];
};

/** O resumo "N lançamentos, N Responsáveis, N Tipos, N Regras criadas". */
export function resumirImportacao(
  resultados: readonly ResultadoDaAba[],
  cadastros: Pick<PlanoDeCadastros, "criar" | "reativar">,
  regrasCriadas: number,
): ResumoDaImportacao {
  return {
    lancamentos: resultados.filter((r) => r.ok).reduce((soma, r) => soma + r.lancamentos, 0),
    responsaveis: cadastros.criar.responsaveis.length + cadastros.reativar.responsaveis.length,
    tipos: cadastros.criar.tipos.length + cadastros.reativar.tipos.length,
    status: cadastros.criar.status.length + cadastros.reativar.status.length,
    regras: regrasCriadas,
    abasComErro: resultados.filter((r) => !r.ok).map((r) => r.nome),
  };
}
