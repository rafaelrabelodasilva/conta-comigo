// Lembretes do dia (História 7.4, FR-55, AD-13, AD-10, AD-1). Puro: "hoje" (`AAAA-MM-DD`, de
// `hojeEmSaoPaulo`), o Ciclo, os Lançamentos, os Blocos e as preferências entram como parâmetro; o
// núcleo não lê relógio nem banco. É calculado a cada vez e nunca gravado (a única coisa gravada é a
// preferência de cada tipo, em `configuracoes`). A faixa do app usa esta função; a 7.5 vai usar a
// mesma no Cron, então cada lembrete leva o que ela precisa (`tipo`, `referencia`, `destino`).
//
// Dois tipos de lembrete:
//
// - `fechamento`: "A fatura de novembro fechou. Importe o PDF quando chegar". Aparece no dia do
//   fechamento da Fatura de um Mês e nos `DIAS_DO_LEMBRETE_DE_FECHAMENTO` dias seguintes, e some
//   assim que o Mês tem Fatura importada. "Novembro" é o Mês da Fatura (o do vencimento, AD-9), não
//   o mês do calendário em que o fechamento cai: a que fecha em 28/10 é a de novembro. A data do
//   fechamento é `fechamentoDoMes` com a configuração vigente NO MÊS da Fatura (`configVigente`),
//   a mesma regra do Ciclo: dia que não existe no mês vira o último (31 em fevereiro é 28 ou 29) e
//   uma troca de Ciclo vale a partir do Mês dela. A referência é o Mês (`AAAA-MM`).
// - `atraso`: "O Lucas tem R$ 115,16 em atraso desde 17/11/26". Um por Bloco de cobrança que tem item
//   atrasado. "Atrasado" é a `estaAtrasado` da grade (por `atrasosDasLinhas`, as mesmas linhas, a
//   mesma tolerância, os mesmos Pagamentos): este arquivo não tem conta de atraso própria. O valor é o
//   que a Fórmula do Bloco dá sobre o RESTANTE dos itens atrasados (depois dos Pagamentos), sem a
//   parte fixa da Fórmula; o "desde" é o primeiro dia de atraso mais antigo entre os itens do Bloco
//   (o mesmo `atrasadoDesde` do cartão de Recebimentos). É um estado: dura enquanto houver atraso.
//   A referência é o id do Bloco.

import { atrasosDasLinhas, type ContextoDeAtraso, type LancamentoParaAtraso } from "./atraso";
import { configVigente, ehData, fechamentoDoMes, mesDaData, somarMeses, type ConfigCiclo } from "./ciclo";
import { somarDias } from "./datas";
import { arredondarRacional } from "./dinheiro";
import { avaliar, type LinhaDaFormula } from "./formula";
import { somaDosItens, type ItemLido } from "./pagamento";
import { montarCartoesDeCobranca } from "./recebimentos";
import { linhaDaFormulaPendente, pendentesDosLancamentos, type LancamentoParaPendente } from "./projecoes";
import type { Bloco } from "./blocos";

/** Os tipos de lembrete, na ordem em que a faixa e as preferências os mostram. */
export const TIPOS_DE_LEMBRETE = ["fechamento", "atraso"] as const;

export type TipoDeLembrete = (typeof TIPOS_DE_LEMBRETE)[number];

/** Cada tipo pode ser ligado ou desligado em Configurações → Aparência (FR-55). */
export type PreferenciasDeLembretes = Record<TipoDeLembrete, boolean>;

/** Os dois ligados: o padrão do banco e o que vale enquanto as colunas ainda não existem. */
export const PREFERENCIAS_DE_LEMBRETES_PADRAO: PreferenciasDeLembretes = { fechamento: true, atraso: true };

/**
 * Quantos dias DEPOIS do dia do fechamento o lembrete de fechamento ainda aparece (se a Fatura do Mês
 * não foi importada). 5: o PDF costuma sair no fechamento ou um ou dois dias depois, e o vencimento
 * vem uns 9 dias depois do fechamento (28 → 06); passados 5 dias sem importar, o aviso já não ajuda
 * mais do que a falta da Fatura no Painel.
 */
export const DIAS_DO_LEMBRETE_DE_FECHAMENTO = 5;

/** Quantas faixas de atraso a tela mostra de uma vez; as outras viram "e mais N". */
export const LIMITE_DE_FAIXAS_DE_ATRASO = 3;

/** As colunas de `configuracoes` que dizem quais lembretes estão ligados; ausente ou nula vale ligado. */
export type LinhaDePreferenciasDeLembretes = {
  lembrete_fechamento?: boolean | null;
  lembrete_atraso?: boolean | null;
};

/** As preferências de uma linha de `configuracoes` (ou de nenhuma): coluna ausente ou nula = ligado. */
export function preferenciasDeLembretes(
  linha: LinhaDePreferenciasDeLembretes | null | undefined,
): PreferenciasDeLembretes {
  return {
    fechamento: linha?.lembrete_fechamento ?? PREFERENCIAS_DE_LEMBRETES_PADRAO.fechamento,
    atraso: linha?.lembrete_atraso ?? PREFERENCIAS_DE_LEMBRETES_PADRAO.atraso,
  };
}

export type LembreteDeFechamento = {
  tipo: "fechamento";
  /** O Mês da Fatura que fechou (`AAAA-MM`). Estável: o mesmo durante toda a janela do lembrete. */
  referencia: string;
  mes: string;
  /** O dia do fechamento (`AAAA-MM-DD`): a 7.5 só notifica quando `hoje` é este dia. */
  fechouEm: string;
  /** Onde o toque leva: o Painel do Mês. */
  destino: string;
};

export type LembreteDeAtraso = {
  tipo: "atraso";
  /** O id do Bloco de cobrança. */
  referencia: string;
  blocoId: string;
  blocoNome: string;
  /** O restante dos itens atrasados, na Fórmula do Bloco, sempre maior que zero. */
  valorCentavos: number;
  /** O primeiro dia de atraso mais antigo entre os itens do Bloco (`AAAA-MM-DD`). */
  desde: string;
  /** Onde o toque leva: Recebimentos. */
  destino: string;
};

export type Lembrete = LembreteDeFechamento | LembreteDeAtraso;

export const DESTINO_DO_LEMBRETE_DE_ATRASO = "/recebimentos";

/** O Painel de um Mês: `/?mes=2026-11`. */
export function destinoDoLembreteDeFechamento(mes: string): string {
  return `/?mes=${mes}`;
}

/** Os Lançamentos que os lembretes leem: o que o pendente e o atraso leem (as colunas de `lancamentos`). */
export type LancamentoParaLembrete = LancamentoParaPendente & LancamentoParaAtraso;

/** O que os lembretes precisam além de `hoje`, do Ciclo, dos Lançamentos e dos Blocos. */
export type ContextoDeLembretes = {
  /** Os Status que contam como pago (`conta_como_pago`). */
  statusPagos: ReadonlySet<string>;
  /** Os itens de Pagamento vivos (de todos os Meses). */
  itens: readonly ItemLido[];
  /** O vencimento das Faturas importadas por Mês: as chaves são os Meses com Fatura importada. */
  vencimentosDasFaturas: ReadonlyMap<string, string>;
  /** A tolerância de atraso em dias (`configuracoes.tolerancia_atraso_dias`). */
  tolerancia: number;
};

/** Os Meses de Faturas que podem estar fechando "hoje": o fechamento cai em M ou em M−1 (`fechamentoDoMes`). */
const DESLOCAMENTOS_DE_MES = [-1, 0, 1, 2] as const;

function lembretesDeFechamento(
  hoje: string,
  ciclo: readonly ConfigCiclo[],
  mesesComFatura: ReadonlySet<string>,
): LembreteDeFechamento[] {
  if (ciclo.length === 0) return [];
  const base = mesDaData(hoje);
  const saida: LembreteDeFechamento[] = [];
  for (const n of DESLOCAMENTOS_DE_MES) {
    const mes = somarMeses(base, n);
    if (mesesComFatura.has(mes)) continue;
    const vigente = configVigente(mes, ciclo);
    if (vigente === undefined) continue;
    const fechouEm = fechamentoDoMes(mes, vigente);
    if (hoje < fechouEm || hoje > somarDias(fechouEm, DIAS_DO_LEMBRETE_DE_FECHAMENTO)) continue;
    saida.push({
      tipo: "fechamento",
      referencia: mes,
      mes,
      fechouEm,
      destino: destinoDoLembreteDeFechamento(mes),
    });
  }
  return saida;
}

/**
 * O que a Fórmula do Bloco dá sobre as linhas atrasadas, sem a parte fixa dela (um "Rangel + 100" não
 * deve 100 só porque há um item atrasado), arredondado uma vez no fim (FR-54). `null` se a Fórmula não
 * calcula.
 */
function valorEmAtraso(bloco: Bloco, atrasadas: readonly LinhaDaFormula[]): number | null {
  const comLinhas = avaliar(bloco.formula, atrasadas);
  const semLinhas = avaliar(bloco.formula, []);
  if (!comLinhas.ok || !semLinhas.ok) return null;
  const a = comLinhas.valor.calculo.valor;
  const k = semLinhas.valor.calculo.valor;
  return arredondarRacional(a.numerador * k.denominador - k.numerador * a.denominador, a.denominador * k.denominador);
}

function lembretesDeAtraso(
  hoje: string,
  ciclo: readonly ConfigCiclo[],
  lancamentos: readonly LancamentoParaLembrete[],
  blocos: readonly Bloco[],
  contexto: ContextoDeLembretes,
): LembreteDeAtraso[] {
  const pendentes = pendentesDosLancamentos(lancamentos, {
    statusPagos: contexto.statusPagos,
    itens: contexto.itens,
    mesesComFatura: new Set(contexto.vencimentosDasFaturas.keys()),
    hoje,
  });
  const contextoDeAtraso: ContextoDeAtraso = {
    statusPagos: contexto.statusPagos,
    configsCiclo: ciclo,
    vencimentosDasFaturas: contexto.vencimentosDasFaturas,
    recebidoCentavos: somaDosItens(contexto.itens),
  };
  const atrasos = atrasosDasLinhas(lancamentos, hoje, contexto.tolerancia, contextoDeAtraso);
  if (atrasos.size === 0) return [];
  // Os cartões de Recebimentos: quem tem `atrasadoDesde` é o Bloco "Atrasado" de lá.
  const ordenados = [...blocos].sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") || (a.id < b.id ? -1 : 1),
  );
  const porId = new Map(ordenados.map((b) => [b.id, b]));
  const atrasadasPorId = new Map(
    pendentes.filter((p) => !p.credito && atrasos.has(p.id)).map((p) => [p.id, linhaDaFormulaPendente(p)]),
  );
  const saida: LembreteDeAtraso[] = [];
  for (const cartao of montarCartoesDeCobranca(ordenados, pendentes, atrasos)) {
    const bloco = porId.get(cartao.id);
    if (bloco === undefined || cartao.atrasadoDesde === null) continue;
    const atrasadas = cartao.ids.flatMap((id) => atrasadasPorId.get(id) ?? []);
    const valorCentavos = valorEmAtraso(bloco, atrasadas);
    // Fórmula que não calcula, ou valor que não é positivo (só uma Fórmula com subtração chega a isso): nada
    // a avisar. Um crédito do Bloco não abate o atraso aqui: o item atrasado continua atrasado (como na grade).
    if (valorCentavos === null || valorCentavos <= 0) continue;
    saida.push({
      tipo: "atraso",
      referencia: bloco.id,
      blocoId: bloco.id,
      blocoNome: bloco.nome,
      valorCentavos,
      desde: cartao.atrasadoDesde,
      destino: DESTINO_DO_LEMBRETE_DE_ATRASO,
    });
  }
  return saida;
}

/**
 * Os lembretes de `hoje`, na ordem em que a faixa os mostra: primeiro os de fechamento (por Mês),
 * depois os de atraso (na ordem dos Blocos). Um tipo desligado nas `preferencias` não aparece e nem é
 * calculado. `ciclo` é o histórico de `config_ciclo`; `blocosDeCobranca` são os Blocos "Usar em
 * Recebimentos" (os outros que vierem são ignorados). `hoje` inválido: nenhum lembrete.
 */
export function lembretesDoDia(
  hoje: string,
  ciclo: readonly ConfigCiclo[],
  lancamentos: readonly LancamentoParaLembrete[],
  blocosDeCobranca: readonly Bloco[],
  preferencias: PreferenciasDeLembretes,
  contexto: ContextoDeLembretes,
): Lembrete[] {
  if (!ehData(hoje)) return [];
  const saida: Lembrete[] = [];
  if (preferencias.fechamento) {
    saida.push(...lembretesDeFechamento(hoje, ciclo, new Set(contexto.vencimentosDasFaturas.keys())));
  }
  if (preferencias.atraso) {
    saida.push(...lembretesDeAtraso(hoje, ciclo, lancamentos, blocosDeCobranca, contexto));
  }
  return saida;
}

/** O que a faixa desenha: os lembretes até o limite de atraso e quantos de atraso ficaram de fora. */
export type LembretesParaExibir = {
  visiveis: Lembrete[];
  /** Quantos lembretes de atraso passaram do limite ("e mais 2 com itens atrasados"). */
  maisAtrasos: number;
};

/** Corta os lembretes de atraso em `limite` (os de fechamento nunca são cortados). */
export function lembretesParaExibir(
  lembretes: readonly Lembrete[],
  limite: number = LIMITE_DE_FAIXAS_DE_ATRASO,
): LembretesParaExibir {
  const visiveis: Lembrete[] = [];
  let atrasos = 0;
  let maisAtrasos = 0;
  for (const l of lembretes) {
    if (l.tipo === "atraso") {
      atrasos += 1;
      if (atrasos > limite) {
        maisAtrasos += 1;
        continue;
      }
    }
    visiveis.push(l);
  }
  return { visiveis, maisAtrasos };
}
