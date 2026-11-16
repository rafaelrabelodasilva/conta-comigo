// Alterar, encerrar e excluir uma Conta manual (História 5.4, FR-18, FR-46, AD-1,
// AD-15, AD-16). Toda decisão mora aqui, pura: quais Lançamentos da Conta ainda
// podem ser recriados, o que apagar, o que criar, o que fica como está e vai
// para o aviso. As RPCs `alterar_conta_manual`, `excluir_conta_manual` e
// `restaurar_conta_manual` só gravam o que sai daqui e conferem segurança
// (dono, formato, nada antes do Mês atual, nada mudou desde a leitura). A tela
// e o SQL não reimplementam a regra. Sem relógio, rede ou banco: o Mês atual, os
// Status que contam como pago e os Lançamentos lidos entram como parâmetro.
//
// A regra de "recriável" (AD-15, Story 5.4):
// - só mexe em `mes ≥ Mês atual` (os Meses anteriores nunca mudam);
// - uma parcela é uma mãe e as filhas da Divisão dela, e as duas pontas saem e
//   voltam juntas (AD-8);
// - NÃO é recriável a parcela que alguma linha dela (mãe ou filha) foi editada à
//   mão (`editado_em`), tem um Status que conta como pago (`conta_como_pago`) ou
//   tem Pagamento. `comPagamento` é o conjunto de ids de Lançamento com item
//   de Pagamento não excluído (`pagamento_itens`, História 6.1): quem lê os
//   Lançamentos (`contas-repo.ts`) o passa, e a regra daqui não muda;
// - o que não é recriável fica como estava (valor, Nome, Tipo antigos) e entra
//   no aviso ("Ficam como estão: …"); nunca é apagado nem reescrito.
//
// Como cada ação materializa (AD-15: um só materializador): Editar e Encerrar
// são a mesma RPC (`alterar_conta_manual`: a Conta nova inteira, as linhas a
// excluir e as parcelas a criar, que ela passa a `materializar_contas_manuais`).
// Excluir é `excluir_conta_manual`; o "Desfazer" é `restaurar_conta_manual`
// (limpa `excluido_em` nos mesmos ids, AD-16).

import { ehMes, somarMeses } from "./ciclo";
import {
  JANELA_DE_MESES,
  chaveDaSerieDaConta,
  horizonteDasContas,
  parcelaParaRpc,
  parcelasDaConta,
  proximaOcorrencia,
  type ChaveDaSerieDaConta,
  type ContaManual,
  type NovaConta,
  type ParcelaParaRpc,
  type RepeticaoConta,
} from "./contas-manuais";
import { normalizarNome } from "./importacao-fatura";
import { situacaoDaConta } from "./lista-contas";

// ------------------------------------------------------- o que se lê do banco

/** A Conta salva, com o `updated_at` de quando foi lida (a RPC recusa se ela mudou desde então). */
export type ContaSalva = ContaManual & { updated_at: string };

/** Uma linha de `contas_manuais` como o banco a entrega (a repetição ainda é texto). */
export type LinhaDeContaSalva = Omit<ContaSalva, "repeticao"> & { repeticao: string };

/**
 * Lê uma linha de `contas_manuais` como Conta salva; `null` se a repetição não é
 * "mensal" nem "parcelas" (defeito de dado: nada é alterado a partir dela).
 */
export function lerContaSalva(l: LinhaDeContaSalva): ContaSalva | null {
  if (l.repeticao !== "mensal" && l.repeticao !== "parcelas") return null;
  return {
    id: l.id,
    nome: l.nome,
    valor_centavos: l.valor_centavos,
    tipo_id: l.tipo_id,
    responsavel_id: l.responsavel_id,
    observacao: l.observacao,
    mes_inicial: l.mes_inicial,
    repeticao: l.repeticao,
    parcela_total: l.parcela_total,
    divisao: l.divisao,
    encerrada_em_mes: l.encerrada_em_mes,
    updated_at: l.updated_at,
  };
}

/** O que o plano lê de cada Lançamento da Conta (mãe ou filha) do Mês atual em diante. */
export type LancamentoDaConta = {
  id: string;
  dividido_de_id: string | null;
  mes: string;
  parcela_n: number | null;
  status_id: string | null;
  editado_em: string | null;
  excluido_em: string | null;
  updated_at: string;
};

/** Por que uma parcela fica como está (a ordem é a de importância no aviso). */
export type MotivoDeFicar = "paga" | "com_pagamento" | "editada";

/** Uma parcela viva: a mãe e as filhas da Divisão dela. */
export type ParcelaExistente = {
  mes: string;
  parcela_n: number | null;
  mae: LancamentoDaConta;
  filhas: LancamentoDaConta[];
};

/** Uma parcela que não será recriada, e por quê. */
export type ParcelaMantida = { mes: string; parcela_n: number | null; motivo: MotivoDeFicar };

export type DivisaoDasParcelas = {
  /** Podem sair e voltar (ou só sair): sem edição à mão, sem Status pago, sem Pagamento. */
  recriaveis: ParcelaExistente[];
  /** Ficam como estão; vão para o aviso. */
  mantidas: ParcelaMantida[];
};

const PRIORIDADE: readonly MotivoDeFicar[] = ["paga", "com_pagamento", "editada"];
const SEM_PAGAMENTOS: ReadonlySet<string> = new Set();

function motivoDaLinha(
  l: LancamentoDaConta,
  statusQueContam: ReadonlySet<string>,
  comPagamento: ReadonlySet<string>,
): MotivoDeFicar | null {
  if (l.status_id !== null && statusQueContam.has(l.status_id)) return "paga";
  if (comPagamento.has(l.id)) return "com_pagamento";
  if (l.editado_em !== null) return "editada";
  return null;
}

/**
 * Separa as parcelas vivas da Conta com `mes ≥ mesAtual` em recriáveis e
 * mantidas (a regra única, ver o cabeçalho). Uma Divisão conta como um todo:
 * basta uma filha editada ou paga para a parcela inteira ficar. Ordem estável:
 * por Mês, `parcela_n` e id. Os Meses anteriores e as linhas excluídas não
 * entram.
 *
 * `statusQueContam`: os ids dos Status com `conta_como_pago` (arquivados
 * incluídos, AD-16). `comPagamento`: os ids de Lançamento com item de Pagamento
 * (História 6.1: `pagamento_itens` não excluídos).
 */
export function parcelasRecriaveis(
  lancamentos: readonly LancamentoDaConta[],
  statusQueContam: ReadonlySet<string>,
  mesAtual: string,
  comPagamento: ReadonlySet<string> = SEM_PAGAMENTOS,
): DivisaoDasParcelas {
  // Mês atual ilegível: nada é seguro de mexer.
  if (!ehMes(mesAtual)) return { recriaveis: [], mantidas: [] };

  const vivas = lancamentos.filter((l) => l.excluido_em === null && ehMes(l.mes) && l.mes >= mesAtual);
  const filhasPorMae = new Map<string, LancamentoDaConta[]>();
  for (const l of vivas) {
    if (l.dividido_de_id === null) continue;
    const lista = filhasPorMae.get(l.dividido_de_id) ?? [];
    lista.push(l);
    filhasPorMae.set(l.dividido_de_id, lista);
  }
  const maes = vivas
    .filter((l) => l.dividido_de_id === null)
    .sort(
      (a, b) =>
        (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0) ||
        (a.parcela_n ?? 0) - (b.parcela_n ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const recriaveis: ParcelaExistente[] = [];
  const mantidas: ParcelaMantida[] = [];
  for (const mae of maes) {
    const filhas = (filhasPorMae.get(mae.id) ?? []).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const motivos = new Set(
      [mae, ...filhas].map((l) => motivoDaLinha(l, statusQueContam, comPagamento)).filter((m): m is MotivoDeFicar => m !== null),
    );
    const motivo = PRIORIDADE.find((m) => motivos.has(m));
    if (motivo === undefined) recriaveis.push({ mes: mae.mes, parcela_n: mae.parcela_n, mae, filhas });
    else mantidas.push({ mes: mae.mes, parcela_n: mae.parcela_n, motivo });
  }
  return { recriaveis, mantidas };
}

// ------------------------------------------------------------- os pedidos

/** A Conta inteira como a RPC `alterar_conta_manual` a grava (Editar e Encerrar usam a mesma). */
export type ContaParaAlterar = {
  id: string;
  nome: string;
  nome_normalizado: string;
  valor_centavos: number;
  tipo_id: string;
  responsavel_id: string | null;
  observacao: string | null;
  /** Igual ao salvo: o "Começa em" não muda (a RPC recusa se mudar). */
  mes_inicial: string;
  repeticao: RepeticaoConta;
  parcela_total: number | null;
  divisao: unknown;
  encerrada_em_mes: string | null;
  /** A chave nova da Série (a Série é a mesma linha, atualizada no lugar). */
  serie: ChaveDaSerieDaConta;
  /** O `updated_at` com que a Conta foi lida: a RPC recusa (`conta.mudou`) se ela já mudou. */
  atualizada_em: string;
};

/** Um Lançamento a excluir em lógico, com o `updated_at` lido (a RPC recusa se ele mudou). */
export type ItemParaExcluir = { id: string; atualizado_em: string };

/** O argumento de `alterar_conta_manual` (`p_pedido`). */
export type PedidoAlterarConta = {
  conta: ContaParaAlterar;
  excluir: ItemParaExcluir[];
  parcelas: ParcelaParaRpc[];
  /** Nada antes deste Mês é tocado (a RPC confere). */
  mes_atual: string;
  /** O horizonte (Mês atual + 12) das parcelas. */
  ate_mes: string;
};

/** O argumento de `excluir_conta_manual` (`p_pedido`). */
export type PedidoExcluirConta = { conta_id: string; excluir: ItemParaExcluir[]; mes_atual: string };

/** O argumento de `restaurar_conta_manual` (`p_pedido`): o "Desfazer" do Excluir. */
export type PedidoRestaurarConta = { conta_id: string; ids: string[] };

export type CodigoDoPlano =
  | "conta.mes_invalido"
  | "conta.mes_fora_do_limite"
  | "conta.ja_encerrada"
  | "conta.encerrar_no_passado"
  | "conta.encerrar_antes_do_inicio"
  | "conta.encerrar_sem_efeito"
  | "salvar.falhou";

/** O que a tela conta a Rafael depois da gravação. */
export type ResumoDoPlano = {
  /** Parcelas (mães) que saem. */
  excluidas: number;
  /** Parcelas (mães) que entram. */
  criadas: number;
  /** Parcelas do aviso: ficam como estão. */
  mantidas: ParcelaMantida[];
};

export type PlanoDeAlterar =
  | { ok: true; pedido: PedidoAlterarConta; resumo: ResumoDoPlano }
  | { ok: false; codigo: CodigoDoPlano };

export type PlanoDeExcluir = { pedido: PedidoExcluirConta; resumo: ResumoDoPlano };

/** O que o plano precisa saber além da Conta. */
export type EntradaDoPlano = {
  mesAtual: string;
  /** Os ids dos Status com `conta_como_pago`. */
  statusQueContam: ReadonlySet<string>;
  /** Os Lançamentos vivos da Conta com `mes ≥ mesAtual` (mães e filhas). */
  existentes: readonly LancamentoDaConta[];
  /** Os ids de Lançamento com item de Pagamento não excluído (6.1; sem ele, nenhum tem). */
  comPagamento?: ReadonlySet<string>;
};

/** A Série da Conta como está no banco e as `ocorrencia` de OUTRAS Séries com a chave nova. */
export type SerieParaAlterar = {
  atual: ChaveDaSerieDaConta;
  ocorrenciasDeOutras: readonly number[];
};

const paraExcluir = (p: ParcelaExistente): ItemParaExcluir[] =>
  [p.mae, ...p.filhas].map((l) => ({ id: l.id, atualizado_em: l.updated_at }));

const doMes = (p: { mes: string }, mes: string) => p.mes >= mes;

function mesmaChave(a: ChaveDaSerieDaConta, b: ChaveDaSerieDaConta): boolean {
  return (
    a.nome_normalizado === b.nome_normalizado &&
    a.parcela_total === b.parcela_total &&
    a.valor_parcela_centavos === b.valor_parcela_centavos &&
    a.mes_primeira_parcela === b.mes_primeira_parcela
  );
}

/**
 * A chave da Série depois de alterar a Conta (a Série é atualizada no lugar,
 * `conta_manual_id` é a identidade). Se a chave do AD-8 não mudou, a
 * `ocorrencia` fica; se mudou, ganha a menor `ocorrencia` que as outras Séries
 * da chave nova não usam (duas Contas idênticas). Se outra Conta ocupar a chave
 * entre a leitura e a gravação, a RPC devolve `conta.serie_ocupada` e quem chama
 * lê de novo.
 */
export function chaveDaSerieAlterada(
  serie: SerieParaAlterar,
  nova: Pick<NovaConta, "nome_normalizado" | "parcela_total" | "valor_centavos" | "mes_inicial">,
): ChaveDaSerieDaConta {
  const candidata = chaveDaSerieDaConta(nova, serie.atual.ocorrencia);
  if (mesmaChave(serie.atual, candidata)) return candidata;
  return { ...candidata, ocorrencia: proximaOcorrencia(serie.ocorrenciasDeOutras) };
}

/**
 * As parcelas a criar: as que a Conta nova define de `mesAtual` até o horizonte
 * e cujo `parcela_n` nenhuma linha viva ocupa (as mantidas, e as recriáveis que
 * continuam). É o mesmo `parcelasDaConta` do cron e da 5.1, só filtrado: o banco
 * ainda protege com `on conflict (serie_id, parcela_n) … do nothing`.
 */
function parcelasACriar(conta: ContaManual, mesAtual: string, ocupadas: ReadonlySet<number>): ParcelaParaRpc[] {
  return parcelasDaConta(conta, horizonteDasContas(mesAtual))
    .filter((p) => p.mes >= mesAtual && !ocupadas.has(p.parcela_n))
    .map((p) => parcelaParaRpc(p));
}

const naoNulos = (ns: readonly (number | null)[]): number[] => ns.filter((n): n is number => n !== null);

/**
 * O plano de Editar (FR-18): a Conta nova (`nova`, já validada pelo formulário,
 * com o mesmo `id` e o mesmo `mes_inicial`), as parcelas recriáveis a excluir e
 * as parcelas a criar. `encerrada_em_mes` fica como está. Alterar não muda o
 * "Começa em": `parcela_n` conta desde ele, e os Meses anteriores não mudam.
 */
export function planoDeAlterarConta(
  salva: ContaSalva,
  nova: NovaConta,
  serie: SerieParaAlterar,
  entrada: EntradaDoPlano,
): PlanoDeAlterar {
  if (nova.id !== salva.id || nova.mes_inicial !== salva.mes_inicial || !ehMes(entrada.mesAtual)) {
    return { ok: false, codigo: "salvar.falhou" };
  }
  const { recriaveis, mantidas } = parcelasRecriaveis(
    entrada.existentes,
    entrada.statusQueContam,
    entrada.mesAtual,
    entrada.comPagamento,
  );
  const parcelas = parcelasACriar(
    { ...salva, ...nova, encerrada_em_mes: salva.encerrada_em_mes },
    entrada.mesAtual,
    new Set(naoNulos(mantidas.map((m) => m.parcela_n))),
  );
  return {
    ok: true,
    pedido: {
      conta: {
        id: nova.id,
        nome: nova.nome,
        nome_normalizado: nova.nome_normalizado,
        valor_centavos: nova.valor_centavos,
        tipo_id: nova.tipo_id,
        responsavel_id: nova.responsavel_id,
        observacao: nova.observacao,
        mes_inicial: salva.mes_inicial,
        repeticao: nova.repeticao,
        parcela_total: nova.parcela_total,
        divisao: nova.divisao,
        encerrada_em_mes: salva.encerrada_em_mes,
        serie: chaveDaSerieAlterada(serie, nova),
        atualizada_em: salva.updated_at,
      },
      excluir: recriaveis.flatMap(paraExcluir),
      parcelas,
      mes_atual: entrada.mesAtual,
      ate_mes: horizonteDasContas(entrada.mesAtual),
    },
    resumo: { excluidas: recriaveis.length, criadas: parcelas.length, mantidas },
  };
}

/**
 * Valida o Mês de "Encerrar" (`A partir de qual mês?`): a Conta vale até o Mês
 * anterior a ele. Recusas: Mês ilegível ou a mais de 5 anos; Conta que já
 * terminou; Mês antes do Mês atual (os anteriores não mudam); Mês igual ou antes
 * do inicial (a Conta precisa valer por um Mês; para anular, Excluir); Mês depois
 * do fim das parcelas ou igual ao encerramento que já existe (sem efeito). Um
 * Mês depois do encerramento que já existe é válido: estende a Conta.
 */
export function validarEncerramento(salva: ContaManual, mes: string, mesAtual: string): CodigoDoPlano | null {
  if (!ehMes(mes) || !ehMes(mesAtual)) return "conta.mes_invalido";
  if (situacaoDaConta(salva, mesAtual) === "encerrada") return "conta.ja_encerrada";
  if (mes < mesAtual) return "conta.encerrar_no_passado";
  if (mes > somarMeses(mesAtual, JANELA_DE_MESES)) return "conta.mes_fora_do_limite";
  if (mes <= salva.mes_inicial) return "conta.encerrar_antes_do_inicio";
  const fimDasParcelas =
    salva.repeticao === "parcelas" && salva.parcela_total !== null ? somarMeses(salva.mes_inicial, salva.parcela_total - 1) : null;
  if ((fimDasParcelas !== null && mes > fimDasParcelas) || mes === salva.encerrada_em_mes) return "conta.encerrar_sem_efeito";
  return null;
}

/**
 * O plano de Encerrar (FR-18): grava `encerrada_em_mes = mes`; as parcelas
 * recriáveis de `mes` em diante saem (exclusão lógica); as mantidas de `mes` em
 * diante ficam e vão para o aviso; os Meses anteriores não mudam. Se `mes` é
 * depois do encerramento que a Conta já tinha, as parcelas dos Meses de
 * permeio voltam (a mesma RPC as cria).
 */
export function planoDeEncerrarConta(
  salva: ContaSalva,
  serie: SerieParaAlterar,
  mes: string,
  entrada: EntradaDoPlano,
): PlanoDeAlterar {
  const recusa = validarEncerramento(salva, mes, entrada.mesAtual);
  if (recusa !== null) return { ok: false, codigo: recusa };
  const { recriaveis, mantidas } = parcelasRecriaveis(
    entrada.existentes,
    entrada.statusQueContam,
    entrada.mesAtual,
    entrada.comPagamento,
  );
  const saem = recriaveis.filter((p) => doMes(p, mes));
  const saemIds = new Set(saem.map((p) => p.mae.id));
  const ocupadas = new Set(
    naoNulos([...recriaveis.filter((p) => !saemIds.has(p.mae.id)).map((p) => p.parcela_n), ...mantidas.map((m) => m.parcela_n)]),
  );
  const parcelas = parcelasACriar({ ...salva, encerrada_em_mes: mes }, entrada.mesAtual, ocupadas);
  return {
    ok: true,
    pedido: {
      conta: {
        id: salva.id,
        nome: salva.nome,
        nome_normalizado: normalizarNome(salva.nome),
        valor_centavos: salva.valor_centavos,
        tipo_id: salva.tipo_id,
        responsavel_id: salva.responsavel_id,
        observacao: salva.observacao,
        mes_inicial: salva.mes_inicial,
        repeticao: salva.repeticao,
        parcela_total: salva.parcela_total,
        divisao: salva.divisao,
        encerrada_em_mes: mes,
        serie: serie.atual,
        atualizada_em: salva.updated_at,
      },
      excluir: saem.flatMap(paraExcluir),
      parcelas,
      mes_atual: entrada.mesAtual,
      ate_mes: horizonteDasContas(entrada.mesAtual),
    },
    resumo: { excluidas: saem.length, criadas: parcelas.length, mantidas: mantidas.filter((m) => doMes(m, mes)) },
  };
}

/**
 * O plano de Excluir: a Conta sai em lógico (`excluido_em`, nunca apagada, AD-16)
 * e, se Rafael quiser (`comLancamentos`), também as parcelas recriáveis de
 * `mesAtual` em diante (os "previstos dos meses seguintes"). Sem `comLancamentos`
 * as parcelas ficam como estão (ainda ligadas à Conta, ainda previstos enquanto o
 * Mês não tem Fatura). Os Meses anteriores nunca mudam.
 */
export function planoDeExcluirConta(conta: Pick<ContaManual, "id">, comLancamentos: boolean, entrada: EntradaDoPlano): PlanoDeExcluir {
  const { recriaveis, mantidas } = parcelasRecriaveis(
    entrada.existentes,
    entrada.statusQueContam,
    entrada.mesAtual,
    entrada.comPagamento,
  );
  const saem = comLancamentos ? recriaveis : [];
  return {
    pedido: { conta_id: conta.id, excluir: saem.flatMap(paraExcluir), mes_atual: entrada.mesAtual },
    resumo: { excluidas: saem.length, criadas: 0, mantidas: comLancamentos ? mantidas : [] },
  };
}

/** O "Desfazer" do Excluir: os mesmos ids voltam (AD-16), nunca linhas novas. */
export function pedidoRestaurarConta(contaId: string, ids: readonly string[]): PedidoRestaurarConta {
  return { conta_id: contaId, ids: [...ids] };
}

/**
 * O que a janela de Encerrar mostra antes de confirmar, para o Mês escolhido:
 * quantas parcelas saem e quais ficam como estão. `null` se o Mês não vale.
 */
export function previaDoEncerramento(
  salva: ContaSalva,
  serie: SerieParaAlterar,
  mes: string,
  entrada: EntradaDoPlano,
): { codigo: CodigoDoPlano } | { excluidas: number; mantidas: ParcelaMantida[] } {
  const plano = planoDeEncerrarConta(salva, serie, mes, entrada);
  if (!plano.ok) return { codigo: plano.codigo };
  return { excluidas: plano.resumo.excluidas, mantidas: plano.resumo.mantidas };
}

/** O Mês que "Encerrar" oferece de início: o mês seguinte ao atual (o deste Mês segue valendo). */
export function mesPadraoDoEncerramento(mesAtual: string): string {
  return somarMeses(mesAtual, 1);
}
