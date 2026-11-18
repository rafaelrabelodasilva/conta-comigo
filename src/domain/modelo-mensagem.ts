// Modelo da mensagem de cobrança (História 4.5, FR-23, UX-DR25, AD-1). Puro:
// o schema do jsonb de `configuracoes.modelo_mensagem`, a validação, a
// normalização do texto, a linha de detalhe, o preenchimento do marcador
// {total} e a prévia. A tela só chama estas funções.
//
// O que o modelo tem (decisões da 4.5, registradas no spec):
// - quatro textos: saudação, frase do total (com {total}), chave Pix e rodapé;
// - três caixas da linha de detalhe: Nome ou Apelido, Parcela, Valor, sempre
//   nesta ordem e separadas por " | ";
// - o título "Detalhes:", o prefixo "Pix " e a linha final "Total: R$ X" NÃO
//   são campos: entram sozinhos (EXPERIENCE.md, "Formato da mensagem").
//
// Contrato para a 4.6 e a 4.7 (não refazer): `projetarMensagem` (em
// `projecoes.ts`) decide QUAIS itens entram (só do Mês, não pagos, sem R$ 0,00,
// sem previstos); `gerarMensagem` monta as linhas com `linhaDeDetalhe` (e as
// de "↳ Ajuste") e entrega tudo a `renderizarModelo(modelo, { detalhes,
// totalCentavos })`, que só põe o texto do modelo em volta. `renderizarModelo`
// não filtra nada e não soma: o total vem de fora (a soma dos itens na forma 1,
// a Fórmula na forma 2, que a 4.7 monta em grupos por operando). A prévia de
// Configurações é um recorte da mesma `projetarMensagem`: a prévia e a
// mensagem nunca divergem.

import { z } from "zod";
import { formatarDinheiro } from "./dinheiro";
import { formatarMesExtenso } from "./datas";
import { formatarParcela } from "./importacao-fatura";
import { TEXTOS_GERAR, TEXTOS_MODELO, rotuloMesDaMensagem } from "./mensagens";
import { nomeExibido } from "./painel";
import type { ItemLido } from "./pagamento";
import { SIMBOLO_OPERACAO } from "./formula";
import {
  projetarMensagem,
  type GrupoDoBloco,
  type LancamentoParaMensagem,
  type ProjecaoDaMensagem,
  type ProjecaoDoBloco,
} from "./projecoes";
import type { ProjecaoDaCobranca } from "./recebimentos";
import type { Resultado } from "./resultado";

// ------------------------------------------------------------------ o modelo

/** O marcador da frase do total: vira o valor ("R$ 1.350,14"). */
export const MARCADOR_TOTAL = "{total}";

export const CAMPOS_DE_TEXTO = ["saudacao", "frase_total", "chave_pix", "rodape"] as const;
export type CampoDeTexto = (typeof CAMPOS_DE_TEXTO)[number];

/** Os campos que Rafael escolhe com caixas, na ordem em que saem na linha. */
export const CAMPOS_DA_LINHA = ["nome", "parcela", "valor"] as const;
export type CampoDaLinha = (typeof CAMPOS_DA_LINHA)[number];

/** Limite de cada texto, em caracteres (depois de normalizar). */
export const LIMITES_DO_MODELO: Readonly<Record<CampoDeTexto, number>> = {
  saudacao: 120,
  frase_total: 200,
  // Cabe a chave aleatória, o e-mail e o "copia e cola" curto.
  chave_pix: 300,
  rodape: 500,
};

/** Só o rodapé aceita mais de uma linha; os outros três são de uma linha. */
const MULTILINHA: Readonly<Record<CampoDeTexto, boolean>> = {
  saudacao: false,
  frase_total: false,
  chave_pix: false,
  rodape: true,
};

export type ModeloMensagem = {
  saudacao: string;
  frase_total: string;
  chave_pix: string;
  rodape: string;
  campos: Readonly<Record<CampoDaLinha, boolean>>;
};

/** O modelo inicial: tudo vazio e nenhuma caixa marcada (igual ao `{}` do banco). */
export const MODELO_VAZIO: ModeloMensagem = {
  saudacao: "",
  frase_total: "",
  chave_pix: "",
  rodape: "",
  campos: { nome: false, parcela: false, valor: false },
};

// O jsonb que chega do banco (ou de outro aparelho) nunca derruba a tela:
// cada pedaço ruim ou ausente vira o valor vazio (`catch`), e um valor que
// nem é objeto vira o modelo vazio.
const textoLido = z.string().catch("");
const caixaLida = z.boolean().catch(false);
const SchemaDoModelo = z
  .object({
    saudacao: textoLido,
    frase_total: textoLido,
    chave_pix: textoLido,
    rodape: textoLido,
    campos: z
      .object({ nome: caixaLida, parcela: caixaLida, valor: caixaLida })
      .catch({ ...MODELO_VAZIO.campos }),
  })
  .catch({ ...MODELO_VAZIO, campos: { ...MODELO_VAZIO.campos } });

/** O modelo guardado em `configuracoes.modelo_mensagem` (qualquer valor; sem linha → vazio). */
export function lerModelo(valor: unknown): ModeloMensagem {
  return SchemaDoModelo.parse(valor);
}

// -------------------------------------------------------------- normalização

/**
 * Quebras de linha e espaços: CRLF vira LF; nos campos de uma linha, qualquer
 * quebra vira um espaço; no rodapé, no máximo uma linha em branco seguida e
 * sem espaço no fim das linhas. Sempre sem espaço nas pontas.
 */
export function normalizarTexto(texto: string, multilinha: boolean): string {
  const lf = texto.replace(/\r\n?/g, "\n");
  if (!multilinha) return lf.replace(/\s*\n\s*/g, " ").trim();
  return lf
    .split("\n")
    .map((linha) => linha.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** O modelo como vai ser guardado e enviado (idempotente). */
export function normalizarModelo(modelo: ModeloMensagem): ModeloMensagem {
  return {
    saudacao: normalizarTexto(modelo.saudacao, MULTILINHA.saudacao),
    frase_total: normalizarTexto(modelo.frase_total, MULTILINHA.frase_total),
    chave_pix: normalizarTexto(modelo.chave_pix, MULTILINHA.chave_pix),
    rodape: normalizarTexto(modelo.rodape, MULTILINHA.rodape),
    campos: { nome: modelo.campos.nome, parcela: modelo.campos.parcela, valor: modelo.campos.valor },
  };
}

/** Nada escrito e nenhuma caixa marcada (o modelo inicial). */
export function modeloEstaVazio(modelo: ModeloMensagem): boolean {
  const m = normalizarModelo(modelo);
  return CAMPOS_DE_TEXTO.every((c) => m[c] === "") && CAMPOS_DA_LINHA.every((c) => !m.campos[c]);
}

/** Mesmo conteúdo, depois de normalizar (para saber se há rascunho e se outro aparelho mudou o modelo). */
export function modelosIguais(a: ModeloMensagem, b: ModeloMensagem): boolean {
  const x = normalizarModelo(a);
  const y = normalizarModelo(b);
  return (
    CAMPOS_DE_TEXTO.every((c) => x[c] === y[c]) && CAMPOS_DA_LINHA.every((c) => x.campos[c] === y.campos[c])
  );
}

// ---------------------------------------------------------------- validação

/** Onde o erro aparece: um dos quatro textos ou o grupo de caixas. */
export type CampoDoModelo = CampoDeTexto | "campos";

/** Código de erro (mapa único) por campo. */
export type ErrosDoModelo = Partial<Record<CampoDoModelo, string>>;

export type ResultadoDoModelo =
  | { ok: true; valor: ModeloMensagem }
  | { ok: false; erros: ErrosDoModelo };

const CODIGO_LONGO: Readonly<Record<CampoDeTexto, string>> = {
  saudacao: "modelo.saudacao_longa",
  frase_total: "modelo.frase_longa",
  chave_pix: "modelo.pix_longo",
  rodape: "modelo.rodape_longo",
};

/**
 * Valida o rascunho e devolve o modelo normalizado, ou os erros de cada campo.
 *
 * - Texto acima do limite → erro do campo.
 * - Chaves { }: na frase do total só vale o marcador `{total}` exato
 *   (`{Total}`, `{totl}`, `{valor}` ou uma chave solta são erro, porque
 *   iriam literais para o WhatsApp); nos outros textos qualquer chave é erro.
 * - Frase sem `{total}` é permitida (a linha "Total:" do fim leva o valor);
 *   o aviso vem de `fraseSemMarcador`, sem bloquear.
 * - Campo em branco é permitido: a linha some da mensagem.
 * - Modelo com algo escrito ou marcado e nenhuma caixa da linha → erro em
 *   "campos". O modelo totalmente vazio é válido (é o inicial).
 */
export function validarModelo(modelo: ModeloMensagem): ResultadoDoModelo {
  const m = normalizarModelo(modelo);
  const erros: ErrosDoModelo = {};
  for (const campo of CAMPOS_DE_TEXTO) {
    const texto = m[campo];
    if (texto.length > LIMITES_DO_MODELO[campo]) {
      erros[campo] = CODIGO_LONGO[campo];
      continue;
    }
    if (campo === "frase_total") {
      const resto = texto.split(MARCADOR_TOTAL).join("");
      if (/[{}]/.test(resto)) erros[campo] = "modelo.marcador_invalido";
    } else if (/[{}]/.test(texto)) {
      erros[campo] = "modelo.chaves_fora_da_frase";
    }
  }
  if (!modeloEstaVazio(m) && CAMPOS_DA_LINHA.every((c) => !m.campos[c])) {
    erros.campos = "modelo.sem_campos";
  }
  return Object.keys(erros).length > 0 ? { ok: false, erros } : { ok: true, valor: m };
}

/** A frase do total tem texto e nenhum `{total}`: aviso, não erro. */
export function fraseSemMarcador(modelo: ModeloMensagem): boolean {
  const frase = normalizarTexto(modelo.frase_total, false);
  return frase !== "" && !frase.includes(MARCADOR_TOTAL);
}

// --------------------------------------------------------- linhas e render

/** Um item da mensagem, já com o nome que a grade mostra e a parcela formatada. */
export type ItemDaMensagem = {
  /** Apelido ou Nome (`nomeExibido`). */
  nome: string;
  /** "05/10"; vazio se não for parcelado. */
  parcela: string;
  /** Líquido do item; negativo é estorno ("- R$ 25,90"). */
  valor_centavos: number;
};

/** O item de um Lançamento (as colunas de `lancamentos`). */
export function itemDaMensagem(l: {
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  valor_centavos: number;
}): ItemDaMensagem {
  return {
    nome: nomeExibido(l),
    parcela: formatarParcela(l.parcela_n, l.parcela_total),
    valor_centavos: l.valor_centavos,
  };
}

/**
 * A linha de detalhe de um item: só os campos marcados, nesta ordem (Nome ou
 * Apelido, Parcela, Valor), separados por " | ". Um campo marcado mas sem
 * valor no item (parcela de quem não é parcelado) não deixa vão: fica de fora.
 */
export function linhaDeDetalhe(item: ItemDaMensagem, campos: Readonly<Record<CampoDaLinha, boolean>>): string {
  const partes: string[] = [];
  const nome = item.nome.replace(/\s+/g, " ").trim();
  if (campos.nome && nome !== "") partes.push(nome);
  if (campos.parcela && item.parcela !== "") partes.push(item.parcela);
  if (campos.valor) partes.push(formatarDinheiro(item.valor_centavos));
  return partes.join(" | ");
}

/** O que o modelo recebe de quem gera a mensagem. */
export type CorpoDaMensagem = {
  /** As linhas de detalhe prontas (linha vazia é ignorada). */
  detalhes: readonly string[];
  /** O total da mensagem: a soma dos itens (forma 1) ou a Fórmula (forma 2). */
  totalCentavos: number;
};

/**
 * Põe o modelo em volta do corpo:
 *
 *     saudação
 *     frase do total (com {total} preenchido)
 *     Pix chave
 *                          ← linha em branco
 *     Detalhes:
 *     linha de detalhe…
 *     Total: R$ X
 *                          ← linha em branco
 *     rodapé
 *
 * Campo vazio some com a linha; sem nenhuma linha de detalhe, somem o título
 * "Detalhes:" e o "Total:". Blocos separados por uma linha em branco.
 */
export function renderizarModelo(modelo: ModeloMensagem, corpo: CorpoDaMensagem): string {
  const m = normalizarModelo(modelo);
  const total = formatarDinheiro(corpo.totalCentavos);
  const cabecalho = [
    m.saudacao,
    m.frase_total.split(MARCADOR_TOTAL).join(total),
    m.chave_pix === "" ? "" : `${TEXTOS_MODELO.prefixo_pix} ${m.chave_pix}`,
  ].filter((linha) => linha !== "");
  const detalhes = corpo.detalhes.filter((linha) => linha !== "");
  const blocos: string[] = [];
  if (cabecalho.length > 0) blocos.push(cabecalho.join("\n"));
  if (detalhes.length > 0) {
    blocos.push([TEXTOS_MODELO.titulo_detalhes, ...detalhes, `${TEXTOS_MODELO.rotulo_total} ${total}`].join("\n"));
  }
  if (m.rodape !== "") blocos.push(m.rodape);
  return blocos.join("\n\n");
}

// ------------------------------------------------- gerar a mensagem (4.6)

/** O modelo serve para gerar? Vazio e sem caixa marcada não geram texto. */
export type ProntidaoDoModelo = "pronto" | "vazio" | "sem_campos";

export function prontidaoDoModelo(modelo: ModeloMensagem): ProntidaoDoModelo {
  if (modeloEstaVazio(modelo)) return "vazio";
  if (CAMPOS_DA_LINHA.every((c) => !modelo.campos[c])) return "sem_campos";
  return "pronto";
}

/** Um item e os valores dos Ajustes dele (na ordem), prontos para virar linhas. */
export type ItemParaLinhas = { item: ItemDaMensagem; ajustes: readonly number[] };

/** A linha do Ajuste: "↳ Ajuste | - R$ 0,08" (o valor só com a caixa Valor marcada). */
function linhaDoAjuste(valorCentavos: number, campos: Readonly<Record<CampoDaLinha, boolean>>): string {
  return [TEXTOS_GERAR.ajuste, ...(campos.valor ? [formatarDinheiro(valorCentavos)] : [])].join(" | ");
}

/**
 * As linhas de detalhe: a de cada item e, logo abaixo da parcela, uma linha
 * "↳ Ajuste" para cada Ajuste dela. Um item sem nada a mostrar (linha vazia)
 * some junto com os Ajustes.
 */
export function linhasDaMensagem(
  itens: readonly ItemParaLinhas[],
  campos: Readonly<Record<CampoDaLinha, boolean>>,
): string[] {
  return itens.flatMap(({ item, ajustes }) => {
    const linha = linhaDeDetalhe(item, campos);
    return linha === "" ? [] : [linha, ...ajustes.map((valor) => linhaDoAjuste(valor, campos))];
  });
}

export type MensagemGerada =
  | { estado: "pronta"; texto: string; totalCentavos: number }
  | { estado: "nada_a_cobrar" }
  /** Só do Bloco (4.7): a Fórmula não calcula. */
  | { estado: "sem_valor" }
  | { estado: "modelo_vazio" }
  | { estado: "modelo_sem_campos" };

/**
 * A mensagem da forma 1 (Seleção): `renderizarModelo` sobre as linhas dos itens
 * que a projeção deixou entrar. O total é o líquido da projeção (estornos
 * reduzem). Sem item, ou com total que não passa de R$ 0,00 (só estornos, ou
 * estorno que zera a conta), não há o que cobrar; antes do modelo vem o "nada a
 * cobrar", que é do que Rafael selecionou. Depois, modelo vazio ou sem caixa
 * não gera texto.
 */
export function gerarMensagem(
  modelo: ModeloMensagem,
  projecao: Pick<ProjecaoDaMensagem, "entram" | "totalCentavos">,
): MensagemGerada {
  if (projecao.entram.length === 0 || projecao.totalCentavos <= 0) return { estado: "nada_a_cobrar" };
  const prontidao = prontidaoDoModelo(modelo);
  if (prontidao === "vazio") return { estado: "modelo_vazio" };
  if (prontidao === "sem_campos") return { estado: "modelo_sem_campos" };
  const itens = projecao.entram.map((i) => ({ item: itemDaMensagem(i), ajustes: i.ajustes.map((a) => a.valor_centavos) }));
  const texto = renderizarModelo(modelo, {
    detalhes: linhasDaMensagem(itens, modelo.campos),
    totalCentavos: projecao.totalCentavos,
  });
  return { estado: "pronta", texto, totalCentavos: projecao.totalCentavos };
}

// -------------------------------------------- gerar a mensagem do Bloco (4.7)

/** O recuo dos itens embaixo do grupo. */
export const RECUO_DO_GRUPO = "  ";

/**
 * A linha de um grupo da forma 2:
 *
 *     Nome: R$ X                       (somado)
 *     Nome: R$ X ÷ 2 = R$ Y            (com × ou ÷; vários: R$ X ÷ 2 × 3 = R$ Y)
 *     Menos Nome: - R$ X               (subtraído)
 *     Menos Nome: R$ X ÷ 2 = - R$ Y    (subtraído com × ou ÷: o último valor é o que o grupo tira)
 *     Valor fixo: R$ X                 (número solto; "Menos Valor fixo: - R$ X" se subtraído)
 *
 * O texto do grupo é sempre o valor: as caixas do modelo só mandam nos itens.
 */
export function linhaDoGrupo(grupo: Pick<GrupoDoBloco, "nome" | "subtraido" | "valorFixo" | "subtotalCentavos" | "fatores" | "resultadoCentavos">): string {
  const rotulo = grupo.valorFixo ? TEXTOS_GERAR.valor_fixo : grupo.nome;
  const prefixo = grupo.subtraido ? `${TEXTOS_GERAR.menos} ` : "";
  if (grupo.valorFixo || grupo.fatores.length === 0) {
    return `${prefixo}${rotulo}: ${formatarDinheiro(grupo.resultadoCentavos)}`;
  }
  const conta = [
    formatarDinheiro(grupo.subtotalCentavos),
    ...grupo.fatores.map((f) => `${SIMBOLO_OPERACAO[f.operacao]} ${f.texto}`),
  ].join(" ");
  return `${prefixo}${rotulo}: ${conta} = ${formatarDinheiro(grupo.resultadoCentavos)}`;
}

/**
 * A mensagem da forma 2 (Bloco): cada grupo com a linha do valor e, recuados
 * embaixo, os itens (`linhaDeDetalhe`, com o "↳ Ajuste" como na 4.6). O total é
 * o da Fórmula sobre os itens que entram, e `renderizarModelo` põe o modelo em
 * volta. Com a Fórmula sem valor, ou com total que não passa de R$ 0,00, não há
 * o que cobrar; o "nada a cobrar" vem antes do modelo, como na forma 1. Um
 * grupo sem itens (o "Rangel: R$ 0,00") continua na mensagem.
 */
export function gerarMensagemDoBloco(modelo: ModeloMensagem, projecao: Resultado<ProjecaoDoBloco>): MensagemGerada {
  if (!projecao.ok) return { estado: "sem_valor" };
  const bloco = projecao.valor;
  if (bloco.totalCentavos <= 0) return { estado: "nada_a_cobrar" };
  const prontidao = prontidaoDoModelo(modelo);
  if (prontidao === "vazio") return { estado: "modelo_vazio" };
  if (prontidao === "sem_campos") return { estado: "modelo_sem_campos" };
  const detalhes = bloco.grupos.flatMap((g) => [
    linhaDoGrupo(g),
    ...linhasDaMensagem(
      g.itens.map((i) => ({ item: itemDaMensagem(i), ajustes: i.ajustes.map((a) => a.valor_centavos) })),
      modelo.campos,
    ).map((linha) => RECUO_DO_GRUPO + linha),
  ]);
  const texto = renderizarModelo(modelo, { detalhes, totalCentavos: bloco.totalCentavos });
  return { estado: "pronta", texto, totalCentavos: bloco.totalCentavos };
}

// ------------------------------------- gerar a mensagem de cobrança (6.7)

/**
 * A mensagem da forma 3 (FR-28, "Cobrar pendências"): o mesmo modelo salvo (saudação, Pix, campos da
 * linha e rodapé), com a frase do total trocada por "Em aberto: R$ X" e os detalhes agrupados por Mês,
 * do mais antigo ao mais novo:
 *
 *     Oi
 *     Em aberto: R$ 150,00
 *     Pix chave
 *
 *     Detalhes:
 *     Setembro/26
 *       NETFLIX | R$ 100,00
 *     Outubro/26
 *       SPOTIFY | R$ 50,00
 *       ↳ Ajuste | - R$ 0,08
 *     Total: R$ 150,00
 *
 * Os itens levam o valor que FALTA de cada Lançamento. Não há subtotal por Mês (dividir ou subtrair mês
 * a mês e somar quebraria o arredondamento só no final, FR-54). Numa Fórmula que não é soma simples
 * (o Rangel: Rangel + Casal ÷ 2), os termos vêm no fim, como na forma 2 ("Casal: R$ 200,00 ÷ 2 = R$ 100,00"),
 * e o total é o da Fórmula sobre tudo. Sem Fórmula que calcule: "sem valor". Sem nada em aberto, ou com total
 * que não passa de R$ 0,00 (o crédito de algo excluído cobre a dívida): "nada em aberto"; antes do modelo.
 */
export function gerarMensagemDeCobranca(modelo: ModeloMensagem, projecao: Resultado<ProjecaoDaCobranca>): MensagemGerada {
  if (!projecao.ok) return { estado: "sem_valor" };
  const cobranca = projecao.valor;
  if (cobranca.meses.length === 0 || cobranca.totalCentavos <= 0) return { estado: "nada_a_cobrar" };
  const prontidao = prontidaoDoModelo(modelo);
  if (prontidao === "vazio") return { estado: "modelo_vazio" };
  if (prontidao === "sem_campos") return { estado: "modelo_sem_campos" };
  const detalhes = [
    ...cobranca.meses.flatMap((m) => {
      const linhas = linhasDaMensagem(
        m.itens.map((i) => ({ item: itemDaMensagem(i), ajustes: i.ajustes.map((a) => a.valor_centavos) })),
        modelo.campos,
      );
      // Um Mês sem nenhuma linha a mostrar (campos sem texto) não deixa um título solto.
      return linhas.length === 0 ? [] : [rotuloMesDaMensagem(m.mes), ...linhas.map((linha) => RECUO_DO_GRUPO + linha)];
    }),
    ...cobranca.termos.map(linhaDoGrupo),
  ];
  const texto = renderizarModelo(
    { ...modelo, frase_total: TEXTOS_GERAR.frase_em_aberto },
    { detalhes, totalCentavos: cobranca.totalCentavos },
  );
  return { estado: "pronta", texto, totalCentavos: cobranca.totalCentavos };
}

// ------------------------------------------------------------------- prévia

/** Quantos itens a prévia mostra. */
export const ITENS_DA_AMOSTRA = 5;

/** Itens de exemplo, para o Mês atual sem nada a cobrar (um estorno, para ver o sinal). */
export const ITENS_DE_EXEMPLO: readonly ItemDaMensagem[] = [
  { nome: "Mercado", parcela: "01/01", valor_centavos: 15990 },
  { nome: "Celular", parcela: "05/10", valor_centavos: 57750 },
  { nome: "Estorno de loja", parcela: "", valor_centavos: -2590 },
];

export type Previa = {
  /** A mensagem renderizada; vazia se o modelo está vazio (a tela mostra a dica). */
  texto: string;
  /** De onde vieram os itens: do Mês atual ou de exemplo (Mês sem nada a cobrar). */
  origem: "mes" | "exemplo";
  /** Quantos itens a prévia mostra. */
  quantidade: number;
  /** O Mês da amostra, por extenso ("novembro/26"); vazio no exemplo. */
  mes: string;
};

/**
 * A prévia ao vivo do modelo (a cada tecla): um recorte da `projetarMensagem`
 * (a mesma regra da mensagem real) sobre o Mês atual, com até `ITENS_DA_AMOSTRA`
 * itens, os Ajustes deles e o total só desses itens. Sem nada a cobrar no Mês
 * (ou sem o Mês carregado), usa os itens de exemplo. Previstos ficam de fora (o
 * Mês atual tem Fatura). Aceita o rascunho como está, mesmo inválido: o que o
 * erro do campo diz é o que a prévia mostra.
 */
export function previaDoModelo(
  modelo: ModeloMensagem,
  lancamentos: readonly LancamentoParaMensagem[],
  mes: string,
  statusPagos: ReadonlySet<string>,
  /** Hoje (`AAAA-MM-DD`, America/Sao_Paulo): uma Dívida programada ainda não vencida fica fora da prévia, como na mensagem real (6.6). */
  hoje: string,
  /** Os itens de Pagamento do Mês (6.2): um Pago parcialmente mostra só o que falta, como na mensagem real. */
  itensDePagamento: readonly ItemLido[] = [],
): Previa {
  const projecao = projetarMensagem(new Set(lancamentos.map((l) => l.id)), lancamentos, {
    mes,
    statusPagos,
    itens: itensDePagamento,
    temFatura: true,
    incluirPrevistos: false,
    hoje,
  });
  const amostra = projecao.entram.slice(0, ITENS_DA_AMOSTRA);
  const doMes = amostra.length > 0;
  const itens: ItemParaLinhas[] = doMes
    ? amostra.map((i) => ({ item: itemDaMensagem(i), ajustes: i.ajustes.map((a) => a.valor_centavos) }))
    : ITENS_DE_EXEMPLO.map((item) => ({ item, ajustes: [] }));
  const total = (doMes ? amostra.map((i) => i.liquido_centavos) : ITENS_DE_EXEMPLO.map((i) => i.valor_centavos)).reduce((s, v) => s + v, 0);
  const texto = modeloEstaVazio(modelo)
    ? ""
    : renderizarModelo(modelo, { detalhes: linhasDaMensagem(itens, modelo.campos), totalCentavos: total });
  return {
    texto,
    origem: doMes ? "mes" : "exemplo",
    quantidade: itens.length,
    mes: doMes ? formatarMesExtenso(mes) : "",
  };
}
