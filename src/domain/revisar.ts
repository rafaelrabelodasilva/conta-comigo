// Fila do Revisar (História 3.2, FR-13, AD-1): quem está na fila, como as
// linhas viram grupos e itens com a sugestão, e o que cada botão grava. Puro:
// a tela e o gerenciador de Realtime só chamam estas funções.
//
// - `ehDaFila` é o único lugar onde "estar na fila" é definido: não excluída,
//   não Ajuste e com `revisao_motivo`. O gerenciador da fila lê e filtra os
//   eventos por ela (mais os Ajustes, que acompanham a mãe); "Faltam N", o
//   contador do menu e a lista saem dela, então N é o mesmo número nos três.
// - Ajuste nunca é item nem conta: aparece sob a mãe e recebe a mesma
//   classificação na mesma gravação. Ajuste desvinculado sem classificação é
//   linha comum (`sem_classificacao`) e entra como item.
// - Sugestão (`revisao_dados`): id nulo, arquivado ou inexistente conta como
//   ausente. O ✓ só existe se a sugestão, com o que a linha já tem,
//   completa Responsável e Tipo; com dúvida, aplica o Responsável mais
//   frequente (o que a sugestão traz).
// - Grupos por `normalizarNome` (o Nome manda, o Apelido só aparece).

import { idsQueAcompanham } from "./ajustes";
import { lerDadosRevisao, type MotivoRevisao } from "./classificacao";
import { normalizarNome } from "./importacao-fatura";
import { TEXTOS_REVISAR, textoSugestao, tituloGrupoRevisar } from "./mensagens";
import { nomeExibido } from "./painel";

/** O que a fila usa de uma linha de `lancamentos`. */
export type LinhaDaFila = {
  id: string;
  nome: string;
  apelido: string | null;
  mes: string;
  valor_centavos: number;
  parcela_n: number | null;
  parcela_total: number | null;
  responsavel_id: string | null;
  tipo_id: string | null;
  ajuste_de_id: string | null;
  excluido_em: string | null;
  revisao_motivo: MotivoRevisao | null;
  revisao_dados: unknown;
  ordem_fatura: number | null;
};

type SoParaPertencer = Pick<LinhaDaFila, "excluido_em" | "ajuste_de_id" | "revisao_motivo">;

/** A linha está na fila do Revisar? Não excluída, não Ajuste e com motivo. */
export function ehDaFila(l: SoParaPertencer): boolean {
  return (l.excluido_em ?? null) === null && (l.ajuste_de_id ?? null) === null && (l.revisao_motivo ?? null) !== null;
}

/**
 * O gerenciador da fila guarda as linhas da fila e os Ajustes não excluídos
 * (para o `junto` achar os ids sem consulta nova).
 */
export function guardadaPelaFila(l: SoParaPertencer): boolean {
  return ehDaFila(l) || ((l.excluido_em ?? null) === null && (l.ajuste_de_id ?? null) !== null);
}

/** Quantas linhas estão na fila (o contador do menu e o "Faltam N"). */
export function contarFila(linhas: readonly SoParaPertencer[]): number {
  return linhas.filter(ehDaFila).length;
}

/** Os cadastros que a fila usa (arquivado e inexistente contam como ausentes). */
export type CadastrosDaFila = {
  responsaveis: readonly { id: string; nome: string; arquivado: boolean }[];
  tipos: readonly { id: string; nome: string; arquivado: boolean }[];
};

export type VarianteDoItem = "sugestao" | "sugestao_duvida" | "sem_sugestao";

/** O que a gravação do ✓ deixa na linha (e nos Ajustes). */
export type ClassificacaoCompleta = { responsavel_id: string; tipo_id: string };

/** Um Ajuste sob a mãe: "Ajuste - R$ 0,08". */
export type AjusteDoItem = { id: string; valorCentavos: number };

export type ItemDaFila = {
  id: string;
  /** Apelido, ou o Nome. */
  nome: string;
  /** O Nome da Fatura (nunca muda). */
  nomeOriginal: string;
  mes: string;
  valorCentavos: number;
  parcelaN: number | null;
  parcelaTotal: number | null;
  variante: VarianteDoItem;
  /** "Casal · Casa" (sem sugestão: null). */
  sugestao: string | null;
  /** "às vezes Rafael" (só na dúvida, com outros Responsáveis). */
  duvida: string | null;
  /** O texto completo: "Sugestão: Casal · Saúde (às vezes Rafael)" ou "Sem sugestão". */
  texto: string;
  /** O ✓ existe? */
  confirmavel: boolean;
  /** O que o ✓ grava (null sem ✓). */
  aoConfirmar: ClassificacaoCompleta | null;
  /** O que a janela "Mudar" mostra de início: o que a linha tem ou a sugestão. */
  preenchido: { responsavel_id: string | null; tipo_id: string | null };
  /** Os Ajustes que vão junto numa gravação. */
  ajustes: AjusteDoItem[];
};

export type GrupoDaFila = {
  /** `normalizarNome(nome)`. */
  chave: string;
  /** "NOME · 2 lançamentos" com 2+ itens; com um só, null. */
  titulo: string | null;
  itens: ItemDaFila[];
};

function porPosicao(a: LinhaDaFila, b: LinhaDaFila): number {
  if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
  const oa = a.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  const ob = b.ordem_fatura ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function montarItem(l: LinhaDaFila, linhas: readonly LinhaDaFila[], cadastros: CadastrosDaFila): ItemDaFila {
  const responsaveis = new Map(cadastros.responsaveis.filter((r) => !r.arquivado).map((r) => [r.id, r.nome]));
  const tipos = new Map(cadastros.tipos.filter((t) => !t.arquivado).map((t) => [t.id, t.nome]));

  // `sem_classificacao` não tem sugestão; as outras leem `revisao_dados`.
  const dados = l.revisao_motivo === "sem_classificacao" ? null : lerDadosRevisao(l.revisao_dados);
  const sugeridoR = dados?.responsavel_id && responsaveis.has(dados.responsavel_id) ? dados.responsavel_id : null;
  const sugeridoT = dados?.tipo_id && tipos.has(dados.tipo_id) ? dados.tipo_id : null;
  const semSugestao = sugeridoR === null && sugeridoT === null;
  const outros = (dados?.outros_responsaveis ?? []).flatMap((id) => {
    const nome = responsaveis.get(id);
    return nome === undefined ? [] : [nome];
  });

  const variante: VarianteDoItem = semSugestao
    ? "sem_sugestao"
    : l.revisao_motivo === "sugestao_duvida"
      ? "sugestao_duvida"
      : "sugestao";

  // O que a linha já tem vale (se o cadastro está ativo); a sugestão completa o que falta.
  const proprioR = l.responsavel_id !== null && responsaveis.has(l.responsavel_id) ? l.responsavel_id : null;
  const proprioT = l.tipo_id !== null && tipos.has(l.tipo_id) ? l.tipo_id : null;
  const responsavelFinal = proprioR ?? sugeridoR;
  const tipoFinal = proprioT ?? sugeridoT;
  const completa = !semSugestao && responsavelFinal !== null && tipoFinal !== null;

  // O texto mostra o que o ✓ grava (os valores finais); sem ✓, só a sugestão.
  const idR = completa ? responsavelFinal : sugeridoR;
  const idT = completa ? tipoFinal : sugeridoT;
  const nomeR = idR === null ? null : (responsaveis.get(idR) ?? null);
  const nomeT = idT === null ? null : (tipos.get(idT) ?? null);
  const duvidaOutros = variante === "sugestao_duvida" ? outros : [];
  const texto = semSugestao ? null : textoSugestao(nomeR, nomeT, duvidaOutros);

  return {
    id: l.id,
    nome: nomeExibido(l),
    nomeOriginal: l.nome,
    mes: l.mes,
    valorCentavos: l.valor_centavos,
    parcelaN: l.parcela_n,
    parcelaTotal: l.parcela_total,
    variante,
    sugestao: semSugestao ? null : [nomeR, nomeT].filter((p): p is string => p !== null).join(" · "),
    duvida: duvidaOutros.length > 0 ? `às vezes ${duvidaOutros.join(" ou ")}` : null,
    texto: texto ?? TEXTOS_REVISAR.sem_sugestao,
    confirmavel: completa,
    aoConfirmar: completa ? { responsavel_id: responsavelFinal, tipo_id: tipoFinal } : null,
    preenchido: { responsavel_id: responsavelFinal, tipo_id: tipoFinal },
    ajustes: idsQueAcompanham(l.id, linhas).flatMap((id) => {
      const a = linhas.find((x) => x.id === id);
      return a ? [{ id, valorCentavos: a.valor_centavos }] : [];
    }),
  };
}

/**
 * Os grupos da fila: só as linhas que `ehDaFila`, agrupadas por
 * `normalizarNome`. Dentro de um grupo e entre grupos, a ordem é a da Fatura
 * (Mês mais antigo primeiro, depois `ordem_fatura`). `linhas` pode trazer
 * também os Ajustes, que aparecem sob a mãe.
 */
export function montarFila(linhas: readonly LinhaDaFila[], cadastros: CadastrosDaFila): GrupoDaFila[] {
  const daFila = linhas.filter(ehDaFila).sort(porPosicao);
  const grupos = new Map<string, GrupoDaFila>();
  for (const l of daFila) {
    const chave = normalizarNome(l.nome);
    const item = montarItem(l, linhas, cadastros);
    const grupo = grupos.get(chave);
    if (grupo) grupo.itens.push(item);
    else grupos.set(chave, { chave, titulo: null, itens: [item] });
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    titulo: g.itens.length >= 2 ? tituloGrupoRevisar(g.itens[0].nomeOriginal, g.itens.length) : null,
  }));
}

export type ResumoDaFila = {
  /** "Faltam N". */
  faltam: number;
  /** Os Meses que têm itens, do mais antigo ao mais novo. */
  meses: string[];
  /** Há mais de um Mês: cada item mostra o dele. */
  variosMeses: boolean;
};

/** O "Faltam N" e os Meses da fila (de `montarFila`). */
export function resumoDaFila(grupos: readonly GrupoDaFila[]): ResumoDaFila {
  const itens = grupos.flatMap((g) => g.itens);
  const meses = [...new Set(itens.map((i) => i.mes))].sort();
  return { faltam: itens.length, meses, variosMeses: meses.length > 1 };
}

/** A faixa de resumo da importação do Mês mais recente da Fatura. */
export type ResumoDaImportacao = {
  /** Mães da Fatura do Mês (sem Ajustes e sem excluídas). */
  lancamentos: number;
  classificados: number;
  paraRevisar: number;
};

/**
 * `lancamentos` = linhas da Fatura do Mês (mães, não excluídas); `paraRevisar`
 * = itens da fila daquele Mês; `classificados` = o resto.
 */
export function resumoDaImportacao(
  lancamentos: readonly { fatura_id: string | null; ajuste_de_id: string | null; excluido_em: string | null }[],
  faturaId: string,
  paraRevisar: number,
): ResumoDaImportacao {
  const total = lancamentos.filter(
    (l) => l.fatura_id === faturaId && (l.ajuste_de_id ?? null) === null && (l.excluido_em ?? null) === null,
  ).length;
  return { lancamentos: total, classificados: Math.max(0, total - paraRevisar), paraRevisar };
}

/**
 * O passo final da importação: quantas linhas (sem os Ajustes, que seguem a
 * mãe) entram classificadas e quantas vão para a fila.
 */
export function resumoDaClassificacao(
  lancamentos: readonly { ajuste_de_ordem: number | null; revisao_motivo: MotivoRevisao | null }[],
): { classificados: number; paraRevisar: number } {
  const maes = lancamentos.filter((l) => l.ajuste_de_ordem === null);
  const paraRevisar = maes.filter((l) => l.revisao_motivo !== null).length;
  return { classificados: maes.length - paraRevisar, paraRevisar };
}

/**
 * Os mais usados primeiro (`contarUsos`); empate e sem contagem (`usos`
 * null, falhou ao ler), na ordem recebida (a do cadastro). Arquivados ficam
 * de fora.
 */
export function ordenarPorUso<T extends { id: string; arquivado: boolean }>(
  cadastros: readonly T[],
  usos: ReadonlyMap<string, number> | null,
): T[] {
  const ativos = cadastros.filter((c) => !c.arquivado);
  if (usos === null) return ativos;
  return ativos
    .map((c, i) => ({ c, i, n: usos.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ c }) => c);
}
