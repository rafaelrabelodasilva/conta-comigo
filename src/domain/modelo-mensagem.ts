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
// Contrato para a 4.6 e a 4.7 (não refazer): a geração real decide QUAIS
// itens entram (`projetarMensagem`: só do Mês, não pagos, sem R$ 0,00, sem
// previstos) e monta as linhas de detalhe com `linhaDeDetalhe` (a 4.7, em
// grupos por operando, e as de "↳ Ajuste"); depois entrega tudo a
// `renderizarModelo(modelo, { detalhes, totalCentavos })`, que só põe o
// texto do modelo em volta. `renderizarModelo` não filtra nada e não soma:
// o total vem de fora (a soma dos itens na forma 1, a Fórmula na forma 2).
// A prévia desta história (`previaDoModelo`) é só uma amostra, e a 4.6 não
// precisa dela.

import { z } from "zod";
import { formatarDinheiro } from "./dinheiro";
import { formatarMesExtenso } from "./datas";
import { formatarParcela } from "./importacao-fatura";
import { TEXTOS_MODELO } from "./mensagens";
import { linhasDoMes, nomeExibido } from "./painel";
import { ehPrevisto } from "./previstos";
import { unidadesDoMes } from "./divisao";

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

// ------------------------------------------------------------------- prévia

/** Quantos itens a prévia mostra. */
export const ITENS_DA_AMOSTRA = 5;

/** Itens de exemplo, para o Mês atual sem nada a cobrar (um estorno, para ver o sinal). */
export const ITENS_DE_EXEMPLO: readonly ItemDaMensagem[] = [
  { nome: "Mercado", parcela: "01/01", valor_centavos: 15990 },
  { nome: "Celular", parcela: "05/10", valor_centavos: 57750 },
  { nome: "Estorno de loja", parcela: "", valor_centavos: -2590 },
];

/** O que a amostra lê de um Lançamento do Mês. */
export type LancamentoParaAmostra = {
  mes: string;
  excluido_em: string | null;
  nome: string;
  apelido: string | null;
  parcela_n: number | null;
  parcela_total: number | null;
  valor_centavos: number;
  status_id: string | null;
  lancado_por: string;
  ordem_fatura: number | null;
  ajuste_de_id?: string | null;
  dividido_de_id?: string | null;
  divisao?: unknown;
};

/**
 * Até `ITENS_DA_AMOSTRA` itens do Mês para a prévia, na ordem da fatura: as
 * unidades da grade (as partes de uma Divisão, nunca a mãe), sem R$ 0,00, sem
 * previstos, sem Ajustes e sem os de Status que conta como pago. É só uma
 * amostra honesta do que a mensagem mostraria: a regra completa de inclusão
 * (Pago parcialmente, Dívidas programadas, "Incluir previstos") é da
 * `projetarMensagem` da 4.6, que não passa por aqui.
 */
export function amostraDoMes(
  lancamentos: readonly LancamentoParaAmostra[],
  mes: string,
  statusPagos: ReadonlySet<string>,
): ItemDaMensagem[] {
  return unidadesDoMes(linhasDoMes(lancamentos, mes))
    .filter(
      (l) =>
        l.valor_centavos !== 0 &&
        !ehPrevisto(l) &&
        (l.ajuste_de_id ?? null) === null &&
        !(l.status_id !== null && statusPagos.has(l.status_id)),
    )
    .sort((a, b) => (a.ordem_fatura ?? Number.MAX_SAFE_INTEGER) - (b.ordem_fatura ?? Number.MAX_SAFE_INTEGER))
    .slice(0, ITENS_DA_AMOSTRA)
    .map(itemDaMensagem);
}

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
 * A prévia ao vivo do modelo (a cada tecla): a amostra do Mês atual ou, se
 * ele não tem nada a cobrar, os itens de exemplo. O total da prévia é a soma
 * dos itens mostrados (não o do Mês). Aceita o rascunho como está, mesmo
 * inválido: o que o erro do campo diz é o que a prévia mostra.
 */
export function previaDoModelo(
  modelo: ModeloMensagem,
  lancamentos: readonly LancamentoParaAmostra[],
  mes: string,
  statusPagos: ReadonlySet<string>,
): Previa {
  const amostra = amostraDoMes(lancamentos, mes, statusPagos);
  const doMes = amostra.length > 0;
  const itens = doMes ? amostra : ITENS_DE_EXEMPLO;
  const texto = modeloEstaVazio(modelo)
    ? ""
    : renderizarModelo(modelo, {
        detalhes: itens.map((item) => linhaDeDetalhe(item, modelo.campos)),
        totalCentavos: itens.reduce((soma, item) => soma + item.valor_centavos, 0),
      });
  return {
    texto,
    origem: doMes ? "mes" : "exemplo",
    quantidade: itens.length,
    mes: doMes ? formatarMesExtenso(mes) : "",
  };
}
