// Contas manuais (História 5.1, FR-16, FR-17, UX-DR24, AD-1, AD-8, AD-9,
// AD-15). Tudo o que a RPC `salvar_conta_manual` e o materializador
// `materializar_contas_manuais` gravam é calculado aqui; o SQL só grava o que
// sai daqui e garante a transação e as restrições. Puro: sem relógio, rede ou
// banco ("Mês atual" entra como parâmetro).
//
// - `parcelasDaConta(conta, ate_mes)`: `parcela_n` conta desde o Mês inicial
//   (também nas recorrentes), `mes = somarMeses(mes_inicial, n − 1)`. Pára no
//   horizonte (`ate_mes` = Mês atual + 12), em `parcela_total` (parcelas) e
//   antes de `encerrada_em_mes`. A Divisão da Conta reaproveita a regra e o
//   arredondamento de `divisao.ts` (`partesDaImportacao`): nada é copiado.
// - A Série da Conta (AD-8): `(nome_normalizado, parcela_total, valor,
//   mes_primeira_parcela = mes_inicial, ocorrencia)`; `parcela_total` é nulo na
//   recorrente. `ocorrencia` separa duas Contas idênticas (`proximaOcorrencia`).
//   Quem liga a Conta à Série é `series.conta_manual_id` (1 para 1); a chave
//   existe para o AD-8 e para a unicidade.
// - `avaliarFormularioConta` valida o formulário (Nome, Valor, Repetição,
//   Parcelas, "Começa em", Tipo, Observação e Divisão) e devolve a Conta a
//   gravar. `pedidoSalvarConta` e `pedidoMaterializar` montam os argumentos
//   das RPCs.
// - Previsto (decisão da 5.1): o Lançamento de uma Conta é `manual` sempre e
//   "previsto" só enquanto o Mês não tem Fatura (`ehPrevistoNoMes`, em
//   `previstos.ts`); nunca vira `sistema` e nunca entra na Conferência (não
//   tem `fatura_id`).

import { ehMes, somarMeses } from "./ciclo";
import { formatarMes } from "./datas";
import { dividirEmPartes, lerReais } from "./dinheiro";
import {
  MAX_PARTES,
  VALOR_MAXIMO_CENTAVOS,
  avaliarRascunho,
  copiarDivisao,
  divisaoComResponsaveisAtivos,
  lerDivisao,
  partesDaImportacao,
  textoDeReais,
  type Divisao,
  type ParteParaGravar,
  type ParteRascunho,
} from "./divisao";
import { normalizarNome } from "./importacao-fatura";
import { TEXTOS_CONTAS, rotuloParcelasDaConta } from "./mensagens";

/** Quantos Meses à frente do Mês atual a RPC materializa (AD-15). */
export const HORIZONTE_MESES = 12;
export const PARCELAS_MIN = 2;
export const PARCELAS_MAX = 120;
export const NOME_MAX = 100;
export const OBSERVACAO_MAX = 200;
/** "Começa em" fica a no máximo 5 anos do Mês atual, para trás e para a frente. */
export const JANELA_DE_MESES = 60;

export type RepeticaoConta = "mensal" | "parcelas";

/** A Conta como está em `contas_manuais`. */
export type ContaManual = {
  id: string;
  nome: string;
  valor_centavos: number;
  tipo_id: string;
  responsavel_id: string | null;
  observacao: string | null;
  mes_inicial: string;
  repeticao: RepeticaoConta;
  parcela_total: number | null;
  /** A Divisão em frações (`divisao.ts`); nula quando a Conta tem um Responsável só. */
  divisao: unknown;
  /** A Conta vale até o Mês anterior a este; nulo = sem fim. */
  encerrada_em_mes: string | null;
};

/** O que `parcelasDaConta` lê da Conta. */
export type ContaParaParcelas = Pick<
  ContaManual,
  "id" | "valor_centavos" | "mes_inicial" | "repeticao" | "parcela_total" | "divisao" | "encerrada_em_mes"
>;

/** Uma parcela a gravar: a linha-mãe e, com Divisão, os valores das filhas. */
export type ParcelaDaConta = {
  conta_id: string;
  parcela_n: number;
  /** Nulo na recorrente: ela não tem "n/N". */
  parcela_total: number | null;
  mes: string;
  valor_centavos: number;
  /** Os valores das filhas (AD-2), na ordem das partes; nulo sem Divisão. */
  partes: ParteParaGravar[] | null;
};

/** O último Mês que a materialização cria: o Mês atual + 12. */
export function horizonteDasContas(mesAtual: string): string {
  return somarMeses(mesAtual, HORIZONTE_MESES);
}

/**
 * As parcelas da Conta de `mes_inicial` até `ateMes` (AD-15): `parcela_n` desde
 * 1, `mes = somarMeses(mes_inicial, n − 1)`. Parcelas finitas param em
 * `parcela_total`; a Conta encerrada pára antes de `encerrada_em_mes`. Uma
 * Divisão que não vale para o Valor (ou uma Conta mal formada) não gera nada:
 * é melhor nenhuma linha do que uma errada.
 */
export function parcelasDaConta(conta: ContaParaParcelas, ateMes: string): ParcelaDaConta[] {
  if (!ehMes(ateMes)) return [];
  const preparada = prepararConta(conta);
  if (preparada === null) return [];
  const { total, partes } = preparada;

  const parcelas: ParcelaDaConta[] = [];
  for (let n = 1; n <= (total ?? 9999); n++) {
    const mes = somarMeses(conta.mes_inicial, n - 1);
    if (mes > ateMes) break;
    if (conta.encerrada_em_mes !== null && mes >= conta.encerrada_em_mes) break;
    parcelas.push({
      conta_id: conta.id,
      parcela_n: n,
      parcela_total: total,
      mes,
      valor_centavos: conta.valor_centavos,
      partes: partes === null ? null : partes.map((p) => ({ ...p })),
    });
  }
  return parcelas;
}

/** O que a Conta tem de "legível" para gerar parcelas (o total e a Divisão em valores). */
type ContaPreparada = { total: number | null; partes: ParteParaGravar[] | null };

/**
 * Confere a Conta e prepara o que toda parcela repete (o total e os valores
 * das filhas). `null` = Conta mal formada (Mês, Valor, repetição ou Divisão
 * ilegíveis): não gera nada, e o cron conta como ilegível (5.3).
 */
function prepararConta(conta: ContaParaParcelas): ContaPreparada | null {
  if (!ehMes(conta.mes_inicial)) return null;
  if (!Number.isSafeInteger(conta.valor_centavos) || conta.valor_centavos <= 0) return null;
  const parcelada = conta.repeticao === "parcelas";
  const total = parcelada ? conta.parcela_total : null;
  if (parcelada && (total === null || total < PARCELAS_MIN)) return null;
  if (!parcelada && conta.parcela_total !== null) return null;

  const divisao = conta.divisao === null || conta.divisao === undefined ? null : lerDivisao(conta.divisao);
  if (conta.divisao !== null && conta.divisao !== undefined && divisao === null) return null;
  const partes = divisao === null ? null : partesDaImportacao(conta.valor_centavos, copiarDivisao(divisao));
  if (divisao !== null && partes === null) return null;
  return { total, partes };
}

/** A Conta está bem formada o bastante para `parcelasDaConta` gerar parcelas? */
export function contaLegivel(conta: ContaParaParcelas): boolean {
  return prepararConta(conta) !== null;
}

// ------------------------------------------------------------- descrição

/**
 * "6 parcelas · Jul/26 a Dez/26" ou "Mensal · desde Jan/26"; encerrada:
 * "Mensal · Jan/26 a Out/26" (até o Mês anterior ao do encerramento).
 */
export function descricaoDaRepeticao(
  c: Pick<ContaManual, "repeticao" | "parcela_total" | "mes_inicial" | "encerrada_em_mes">,
): string {
  const ultimoDaEncerrada = c.encerrada_em_mes === null ? null : somarMeses(c.encerrada_em_mes, -1);
  if (c.repeticao === "parcelas" && c.parcela_total !== null) {
    const fim = somarMeses(c.mes_inicial, c.parcela_total - 1);
    const ate = ultimoDaEncerrada !== null && ultimoDaEncerrada < fim ? ultimoDaEncerrada : fim;
    return `${rotuloParcelasDaConta(c.parcela_total)} · ${formatarMes(c.mes_inicial)} a ${formatarMes(ate)}`;
  }
  if (ultimoDaEncerrada !== null) {
    return `${TEXTOS_CONTAS.mensal} · ${formatarMes(c.mes_inicial)} a ${formatarMes(ultimoDaEncerrada)}`;
  }
  return `${TEXTOS_CONTAS.mensal} · ${TEXTOS_CONTAS.desde} ${formatarMes(c.mes_inicial)}`;
}

// ----------------------------------------------------------- formulário

/** "6" → 6; vazio, fora de 2 a 120 ou com letra → `null`. */
export function lerNumeroDeParcelas(texto: string): number | null {
  const t = texto.trim();
  const n = /^\d{1,4}$/.test(t) ? Number(t) : NaN;
  return Number.isInteger(n) && n >= PARCELAS_MIN && n <= PARCELAS_MAX ? n : null;
}

export type CampoDaConta = "nome" | "valor" | "parcelas" | "comecaEm" | "tipo" | "observacao" | "divisao";

/** Uma linha de "Divisão": o Responsável e o valor da parte, em reais ("106,00"). */
export type ParteDoFormulario = { responsavel_id: string | null; texto: string };

/** O que se digita no formulário "Nova conta". */
export type RascunhoDaConta = {
  nome: string;
  /** Valor por mês (ou por parcela), em reais ("318,00"). */
  valor: string;
  repeticao: RepeticaoConta;
  parcelas: string;
  /** "Começa em" (`AAAA-MM`). */
  comecaEm: string;
  tipo_id: string | null;
  observacao: string;
  /** Uma parte = um Responsável (sem Divisão); duas ou mais = Divisão em valores. */
  partes: ParteDoFormulario[];
};

/** O formulário aberto: mensal, começando no Mês atual, com uma linha de Responsável. */
export function rascunhoInicialDaConta(mesAtual: string): RascunhoDaConta {
  return {
    nome: "",
    valor: "",
    repeticao: "mensal",
    parcelas: "",
    comecaEm: mesAtual,
    tipo_id: null,
    observacao: "",
    partes: [{ responsavel_id: null, texto: "" }],
  };
}

export type ContextoDoFormulario = {
  mesAtual: string;
  /** Os Tipos e Responsáveis ativos (os arquivados não valem para Conta nova). */
  tiposAtivos: ReadonlySet<string>;
  responsaveisAtivos: ReadonlySet<string>;
};

/** A Conta pronta para gravar (colunas de `contas_manuais`, mais o Nome normalizado). */
export type NovaConta = {
  id: string;
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  tipo_id: string;
  responsavel_id: string | null;
  observacao: string | null;
  mes_inicial: string;
  repeticao: RepeticaoConta;
  parcela_total: number | null;
  divisao: Divisao | null;
};

export type AvaliacaoDaConta = {
  /** O código de cada campo com erro (texto pelo mapa `mensagem`). */
  erros: Partial<Record<CampoDaConta, string>>;
  /** A Conta a gravar; `null` enquanto houver erro. */
  conta: NovaConta | null;
  /** O valor de cada parte (com Divisão), quando dá para calcular. */
  valoresDasPartes: (number | null)[];
  /** A soma que o rodapé da Divisão mostra, quando dá para somar. */
  somaCentavos: number | null;
  /** O Valor digitado, quando é válido (o rodapé "de R$ 318,00"). */
  valorCentavos: number | null;
};

/**
 * Valida o formulário (FR-16) e monta a Conta. Regras: Nome de 1 a 100
 * caracteres; Valor maior que R$ 0,00 e até R$ 900.000,00; "N parcelas" de 2 a
 * 120; "Começa em" a até 5 anos do Mês atual; Tipo e Responsável ativos;
 * Divisão de 2 a 10 partes cuja soma é o Valor, sem parte zerada; Observação
 * até 200 caracteres. `id` é gerado pela tela (reenviar com o mesmo id não
 * duplica).
 */
export function avaliarFormularioConta(
  id: string,
  r: RascunhoDaConta,
  ctx: ContextoDoFormulario,
): AvaliacaoDaConta {
  const erros: Partial<Record<CampoDaConta, string>> = {};

  const nome = r.nome.trim();
  if (nome === "") erros.nome = "conta.nome_vazio";
  else if (nome.length > NOME_MAX || normalizarNome(nome) === "") erros.nome = "conta.nome_longo";

  let valorCentavos: number | null = null;
  const lido = lerReais(r.valor);
  if (!lido.ok) erros.valor = "conta.valor_invalido";
  else if (lido.valor <= 0) erros.valor = "conta.valor_zero";
  else if (lido.valor > VALOR_MAXIMO_CENTAVOS) erros.valor = "conta.valor_grande";
  else valorCentavos = lido.valor;

  let parcelaTotal: number | null = null;
  if (r.repeticao === "parcelas") {
    parcelaTotal = lerNumeroDeParcelas(r.parcelas);
    if (parcelaTotal === null) erros.parcelas = "conta.parcelas_invalidas";
  }

  if (!ehMes(r.comecaEm)) erros.comecaEm = "conta.mes_invalido";
  else if (
    r.comecaEm < somarMeses(ctx.mesAtual, -JANELA_DE_MESES) ||
    r.comecaEm > somarMeses(ctx.mesAtual, JANELA_DE_MESES)
  ) {
    erros.comecaEm = "conta.mes_fora_do_limite";
  }

  if (r.tipo_id === null) erros.tipo = "conta.sem_tipo";
  else if (!ctx.tiposAtivos.has(r.tipo_id)) erros.tipo = "conta.tipo_arquivado";

  const observacao = r.observacao.trim();
  if (observacao.length > OBSERVACAO_MAX) erros.observacao = "conta.observacao_longa";

  // Divisão: uma parte é só o Responsável; duas ou mais dividem o Valor.
  let divisao: Divisao | null = null;
  let responsavelId: string | null = null;
  let valoresDasPartes: (number | null)[] = r.partes.map(() => null);
  let somaCentavos: number | null = null;
  if (r.partes.length < 1 || r.partes.length > MAX_PARTES) {
    erros.divisao = r.partes.length < 1 ? "conta.sem_responsavel" : "divisao.partes_demais";
  } else if (r.partes.length === 1) {
    const unica = r.partes[0].responsavel_id;
    if (unica === null) erros.divisao = "conta.sem_responsavel";
    else if (!ctx.responsaveisAtivos.has(unica)) erros.divisao = "conta.responsavel_arquivado";
    else responsavelId = unica;
    valoresDasPartes = [valorCentavos];
    somaCentavos = valorCentavos;
  } else if (valorCentavos !== null) {
    const partes: ParteRascunho[] = r.partes.map((p) => ({
      responsavel_id: p.responsavel_id,
      texto: p.texto,
      status_id: null,
    }));
    const a = avaliarRascunho(valorCentavos, "valor", partes);
    valoresDasPartes = a.valores;
    somaCentavos = a.somaCentavos;
    if (a.erro !== null || a.divisao === null) erros.divisao = a.erro ?? "salvar.falhou";
    else if (!divisaoComResponsaveisAtivos(a.divisao, ctx.responsaveisAtivos)) erros.divisao = "conta.responsavel_arquivado";
    else divisao = a.divisao;
  }

  if (Object.keys(erros).length > 0 || valorCentavos === null || r.tipo_id === null) {
    return { erros, conta: null, valoresDasPartes, somaCentavos, valorCentavos };
  }
  return {
    erros,
    valoresDasPartes,
    somaCentavos,
    valorCentavos,
    conta: {
      id,
      nome,
      nome_normalizado: normalizarNome(nome),
      valor_centavos: valorCentavos,
      tipo_id: r.tipo_id,
      responsavel_id: responsavelId,
      observacao: observacao === "" ? null : observacao,
      mes_inicial: r.comecaEm,
      repeticao: r.repeticao,
      parcela_total: parcelaTotal,
      divisao,
    },
  };
}

/**
 * "＋ Parte": a segunda parte nasce com o Valor dividido ao meio (R$ 318,00 →
 * 159,00 e 159,00, sem Responsável na nova); as seguintes nascem vazias. Até
 * 10 partes.
 */
export function adicionarParte(partes: readonly ParteDoFormulario[], valorCentavos: number | null): ParteDoFormulario[] {
  if (partes.length >= MAX_PARTES) return [...partes];
  if (partes.length === 1 && valorCentavos !== null && valorCentavos > 0) {
    const metades = dividirEmPartes(valorCentavos, [
      { numerador: 1, denominador: 2 },
      { numerador: 1, denominador: 2 },
    ]);
    if (metades.ok) {
      return [
        { ...partes[0], texto: textoDeReais(metades.valor[0]) },
        { responsavel_id: null, texto: textoDeReais(metades.valor[1]) },
      ];
    }
  }
  return [...partes, { responsavel_id: null, texto: "" }];
}

/** Tira a parte `i` (sempre fica uma). */
export function removerParte(partes: readonly ParteDoFormulario[], i: number): ParteDoFormulario[] {
  if (partes.length <= 1 || i < 0 || i >= partes.length) return [...partes];
  return partes.filter((_, j) => j !== i);
}

/** "Por mês: R$ 318,00 · Total da conta: R$ 1.908,00": só quando é parcelada e o Valor vale. */
export function totalDaConta(valorCentavos: number | null, parcelaTotal: number | null): number | null {
  if (valorCentavos === null || parcelaTotal === null) return null;
  return valorCentavos * parcelaTotal;
}

// ------------------------------------------------------------------- Série

/** A chave da Série da Conta (AD-8); `parcela_total` é nulo na recorrente. */
export type ChaveDaSerieDaConta = {
  nome_normalizado: string;
  parcela_total: number | null;
  valor_parcela_centavos: number;
  mes_primeira_parcela: string;
  ocorrencia: number;
};

/** A menor `ocorrencia` (1, 2, …) que as Séries de mesma chave ainda não usam. */
export function proximaOcorrencia(usadas: readonly number[]): number {
  const set = new Set(usadas);
  let n = 1;
  while (set.has(n)) n++;
  return n;
}

export function chaveDaSerieDaConta(
  c: Pick<NovaConta, "nome_normalizado" | "parcela_total" | "valor_centavos" | "mes_inicial">,
  ocorrencia: number,
): ChaveDaSerieDaConta {
  return {
    nome_normalizado: c.nome_normalizado,
    parcela_total: c.parcela_total,
    valor_parcela_centavos: c.valor_centavos,
    mes_primeira_parcela: c.mes_inicial,
    ocorrencia,
  };
}

// ---------------------------------------------------------- pedidos às RPCs

type ParcelaParaRpc = {
  conta_id: string;
  parcela_n: number;
  mes: string;
  valor_centavos: number;
  partes: ParteParaGravar[] | null;
};

function parcelaParaRpc(p: ParcelaDaConta): ParcelaParaRpc {
  return { conta_id: p.conta_id, parcela_n: p.parcela_n, mes: p.mes, valor_centavos: p.valor_centavos, partes: p.partes };
}

/** Os argumentos de `salvar_conta_manual`: a Conta, a chave da Série e as parcelas até `ateMes`. */
export type PedidoSalvarConta = {
  p_conta: Omit<NovaConta, "divisao"> & { divisao: Divisao | null; serie: ChaveDaSerieDaConta };
  p_parcelas: ParcelaParaRpc[];
  p_ate_mes: string;
};

export function pedidoSalvarConta(conta: NovaConta, ocorrencia: number, ateMes: string): PedidoSalvarConta {
  // Conta nova: ainda sem encerramento.
  const paraParcelas: ContaParaParcelas = { ...conta, encerrada_em_mes: null };
  return {
    p_conta: { ...conta, serie: chaveDaSerieDaConta(conta, ocorrencia) },
    p_parcelas: parcelasDaConta(paraParcelas, ateMes).map(parcelaParaRpc),
    p_ate_mes: ateMes,
  };
}

/** Os argumentos de `materializar_contas_manuais`: as parcelas até `ateMes` de cada Conta (o cron da 5.3 usa o mesmo). */
export type PedidoMaterializar = { p_ate_mes: string; p_parcelas: ParcelaParaRpc[] };

export function pedidoMaterializar(contas: readonly ContaParaParcelas[], ateMes: string): PedidoMaterializar {
  return {
    p_ate_mes: ateMes,
    p_parcelas: contas.flatMap((c) => parcelasDaConta(c, ateMes).map(parcelaParaRpc)),
  };
}

/**
 * Os argumentos de `materializar_contas_manuais_do_dono` (5.3): o mesmo pedido,
 * mais o dono. Só o cron chama, com a chave secreta (não há `auth.uid()`).
 */
export type PedidoMaterializarDoDono = PedidoMaterializar & { p_owner_id: string };

export function pedidoMaterializarDoDono(
  ownerId: string,
  contas: readonly ContaParaParcelas[],
  ateMes: string,
): PedidoMaterializarDoDono {
  return { p_owner_id: ownerId, ...pedidoMaterializar(contas, ateMes) };
}
