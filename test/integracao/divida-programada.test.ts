// Prova, contra o Supabase local (CI), a Dívida programada (História 6.6, FR-27, AD-8, AD-10, AD-14, AD-15): as colunas
// `vencimento_combinado` e `vencimento_observacao`, a RPC `programar_divida` (tudo ou nada, dono, mãe dividida, a filha
// marca a mãe), `recriar_filhas` com a data por parte (ausente mantém, presente grava, nulo limpa), a Conta manual
// Bombinhas com a parte do Lucas "Dívida programada" até 06/04/27 (as filhas nascem com a data, Mãe e Casal não), a
// reimportação que mantém a data da linha casada e não apaga em silêncio a que tem data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import {
  avaliarFormularioConta,
  horizonteDasContas,
  pedidoSalvarConta,
  type NovaConta,
  type RascunhoDaConta,
} from "../../src/domain/contas-manuais";
import { planejarDivisao, type Divisao, type ItemDividir, type MaeParaDividir } from "../../src/domain/divisao";
import { planejarProgramacao, type ItemProgramar } from "../../src/domain/divida";
import { lerDivisao } from "../../src/domain/divisao";
import type { Importacao, LancamentoParaGravar } from "../../src/domain/importacao-fatura";
import { aplicarCasamento, atribuirSeries, casarPrevistos, gerarPrevistos, type PrevistoParaCasar } from "../../src/domain/previstos";
import {
  aplicarReimportacao,
  casarSobrasComPrevistos,
  planejarReimportacao,
  type AntigaParaReimportar,
} from "../../src/domain/reimportacao";
import { ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

const MES_ATUAL = "2026-11";
const AGORA = "2026-11-16T15:00:00.000Z";

type Parcela = { nome: string; valor: number };

function base(mes: string, parcelas: Parcela[]): LancamentoParaGravar[] {
  return parcelas.map((p, i) => ({
    nome: p.nome,
    nome_normalizado: p.nome,
    valor_centavos: p.valor,
    data: `${mes}-01`,
    parcela_n: null,
    parcela_total: null,
    final_cartao: "5061",
    ordem_fatura: i + 1,
    duvida_extracao: false,
    ajuste_de_ordem: null,
    tipo_sugerido: null,
    responsavel_id: null,
    tipo_id: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    serie: null,
  }));
}

function fatura(mes: string, parcelas: Parcela[]): Importacao["fatura"] {
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    mes,
    vencimento: `${mes}-06`,
    fechamento: null,
    total_despesas_centavos: total,
    total_creditos_centavos: 0,
    saldo_anterior_centavos: null,
    pagamentos_centavos: null,
    total_a_pagar_centavos: null,
  };
}

function primeira(mes: string, parcelas: Parcela[]): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const lancamentos = aplicarCasamento(comSeries, casarPrevistos(comSeries, []), []);
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: total }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, []),
    previstos_sem_par: [],
  };
}

function reimportacao(mes: string, parcelas: Parcela[], antigas: AntigaParaReimportar[], previstosDoMes: PrevistoParaCasar[]): Importacao {
  const comSeries = atribuirSeries(base(mes, parcelas), mes);
  const plano = planejarReimportacao(comSeries, antigas, { statusPadraoId: null });
  const lancamentos = aplicarReimportacao(comSeries, plano, antigas, previstosDoMes, []);
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return {
    fatura: fatura(mes, parcelas),
    cartoes: [{ final: "5061", total_centavos: total }],
    lancamentos,
    previstos: gerarPrevistos(lancamentos, mes, [mes]),
    previstos_sem_par: casarSobrasComPrevistos(comSeries, plano, previstosDoMes).semPar,
    reimportacao: { apagar: plano.apagar, sumiram: plano.sumiram, voltar_a_previsto: plano.voltar_a_previsto, resumo: plano.resumo },
  };
}

function chamar(cliente: Cliente, imp: Importacao, extra: { lidoEm?: string | null; substituir?: string } = {}) {
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    dados_previstos: imp.previstos as unknown as Json,
    previstos_sem_par: (imp.previstos_sem_par ?? []) as unknown as Json,
    ...(imp.reimportacao && extra.substituir
      ? {
          dados_reimportacao: {
            apagar: imp.reimportacao.apagar,
            sumiram: imp.reimportacao.sumiram,
            voltar_a_previsto: imp.reimportacao.voltar_a_previsto,
          } as unknown as Json,
        }
      : {}),
    ...(extra.lidoEm ? { lancamentos_atualizados_em: extra.lidoEm } : {}),
    ...(extra.substituir ? { substituir_fatura_id: extra.substituir } : {}),
  });
}

describe.skipIf(!ligado)("Dívida programada no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae: string;
  let casal: string;
  let lucas: string;
  let viagem: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("divida");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const resp = async (nome: string, cor: number, ordem: number) =>
      (await local.admin.from("responsaveis").insert({ owner_id: a.id, nome, cor, ordem }).select().single()).data!.id;
    mae = await resp("Mãe", 3, 1);
    casal = await resp("Casal", 2, 2);
    lucas = await resp("Lucas", 4, 3);
    viagem = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Viagem" }).select().single()).data!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  const programar = (cliente: Cliente, itens: ItemProgramar[]) => cliente.rpc("programar_divida", { p_itens: itens as unknown as Json });
  const ler = async (id: string) => (await local.admin.from("lancamentos").select("*").eq("id", id).single()).data!;

  async function nova(nome = "LOJA", valor = 10_000, extra: Record<string, unknown> = {}) {
    const { data } = await local.admin
      .from("lancamentos")
      .insert({ owner_id: a.id, nome: `${nome} ${++seq}`, nome_normalizado: `${nome} ${seq}`, valor_centavos: valor, mes: MES_ATUAL, lancado_por: "manual", tipo_id: viagem, ...extra })
      .select()
      .single();
    return data!.id;
  }

  it("programar_divida: grava a data e a observação, devolve as linhas e marca a linha como mexida à mão", async () => {
    const id = await nova();
    const { data, error } = await programar(a.cliente, [
      { id, vencimento_combinado: "2027-04-06", vencimento_observacao: "combinado por WhatsApp", editado_em: AGORA },
    ]);
    expect(error).toBeNull();
    expect((data as unknown as { id: string }[]).map((l) => l.id)).toEqual([id]);
    expect(await ler(id)).toMatchObject({ vencimento_combinado: "2027-04-06", vencimento_observacao: "combinado por WhatsApp" });
    expect((await ler(id)).editado_em).not.toBeNull();
    // Desligar (data nula) limpa a observação junto.
    await programar(a.cliente, [{ id, vencimento_combinado: null, vencimento_observacao: null, editado_em: null }]);
    expect(await ler(id)).toMatchObject({ vencimento_combinado: null, vencimento_observacao: null, editado_em: null });
  });

  it("tudo ou nada: um item inválido desfaz os outros; recusas do dono, da exclusão, da nota sem data e da data fora do intervalo", async () => {
    const x = await nova();
    const y = await nova();
    const fantasma = "00000000-0000-4000-8000-0000000000ff";
    const r = await programar(a.cliente, [
      { id: x, vencimento_combinado: "2027-04-06", vencimento_observacao: null },
      { id: fantasma, vencimento_combinado: "2027-04-06", vencimento_observacao: null },
    ]);
    expect(r.error?.message).toContain("programada.nao_encontrada");
    expect((await ler(x)).vencimento_combinado).toBeNull();

    // Outro dono não enxerga a linha.
    const deOutro = await programar(b.cliente, [{ id: y, vencimento_combinado: "2027-04-06", vencimento_observacao: null }]);
    expect(deOutro.error?.message).toContain("programada.nao_encontrada");

    await local.admin.from("lancamentos").update({ excluido_em: AGORA }).eq("id", y);
    expect((await programar(a.cliente, [{ id: y, vencimento_combinado: "2027-04-06", vencimento_observacao: null }])).error?.message).toContain("programada.nao_encontrada");

    expect((await programar(a.cliente, [{ id: x, vencimento_combinado: null, vencimento_observacao: "só nota" }])).error?.message).toContain("salvar.falhou");
    expect((await programar(a.cliente, [{ id: x, vencimento_combinado: "1999-12-31", vencimento_observacao: null }])).error).not.toBeNull();
    expect((await programar(a.cliente, [{ id: x, vencimento_combinado: "2099-12-31", vencimento_observacao: null }, { id: x, vencimento_combinado: "2027-01-01", vencimento_observacao: null }])).error?.message).toContain("salvar.falhou");
    expect((await ler(x)).vencimento_combinado).toBeNull();
    // Sem a sessão, nada.
    expect((await local.anonimo.rpc("programar_divida", { p_itens: [] })).error).not.toBeNull();
  });

  describe("Divisão: a Dívida é de cada parte", () => {
    const divisao = (): Divisao => ({
      modo: "valor",
      partes: [
        { responsavel_id: mae, numerador: 1, denominador: 3 },
        { responsavel_id: lucas, numerador: 2, denominador: 3 },
      ],
    });

    async function dividida() {
      const id = await nova("DIV", 31_800, { responsavel_id: mae });
      const plano = planejarDivisao((await ler(id)) as unknown as MaeParaDividir, divisao(), { agora: AGORA });
      if (!plano.ok) throw new Error("plano");
      const { data, error } = await a.cliente.rpc("dividir_lancamento", { p_itens: [plano.valor] as unknown as Json });
      expect(error).toBeNull();
      const filhas = (data as unknown as { id: string; dividido_de_id: string | null; responsavel_id: string }[]).filter((l) => l.dividido_de_id === id);
      return { id, filhas, item: plano.valor };
    }

    it("a mãe dividida é recusada; programar uma parte marca a mãe (reimportação e Alterar conta a preservam)", async () => {
      const { id, filhas } = await dividida();
      expect((await programar(a.cliente, [{ id, vencimento_combinado: "2027-04-06", vencimento_observacao: null }])).error?.message).toContain("programada.mae_dividida");
      const doLucas = filhas.find((f) => f.responsavel_id === lucas)!;
      await local.admin.from("lancamentos").update({ editado_em: null }).eq("id", id);
      expect((await programar(a.cliente, [{ id: doLucas.id, vencimento_combinado: "2027-04-06", vencimento_observacao: "no final", editado_em: AGORA }])).error).toBeNull();
      expect(await ler(doLucas.id)).toMatchObject({ vencimento_combinado: "2027-04-06", vencimento_observacao: "no final" });
      expect((await ler(id)).editado_em).not.toBeNull();
      expect((await ler(id)).vencimento_combinado).toBeNull();
    });

    it("o núcleo troca a mãe pelas partes: planejarProgramacao + a RPC programam só as filhas", async () => {
      const { id, filhas } = await dividida();
      const todas = (await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", MES_ATUAL)).data!;
      const plano = planejarProgramacao([id], todas, { statusPagos: new Set(), agora: AGORA }, { data: "2027-04-06", observacao: "" });
      expect(plano.ok).toBe(true);
      if (!plano.ok) return;
      expect(plano.valor.itens.map((i) => i.id).sort()).toEqual(filhas.map((f) => f.id).sort());
      expect((await programar(a.cliente, plano.valor.itens)).error).toBeNull();
      for (const f of filhas) expect((await ler(f.id)).vencimento_combinado).toBe("2027-04-06");
      // O "Desfazer" devolve o que era.
      expect((await programar(a.cliente, plano.valor.desfazer)).error).toBeNull();
      for (const f of filhas) expect((await ler(f.id)).vencimento_combinado).toBeNull();
    });

    it("Dividir de novo: a chave ausente MANTÉM a data da filha; a presente grava; nula limpa (e a observação junto)", async () => {
      const { id, filhas, item } = await dividida();
      const doLucas = filhas.find((f) => f.responsavel_id === lucas)!;
      await programar(a.cliente, [{ id: doLucas.id, vencimento_combinado: "2027-04-06", vencimento_observacao: "no final", editado_em: AGORA }]);
      const refaz = (extra: Record<string, unknown>): ItemDividir[] => [
        {
          ...item,
          partes: item.partes.map((p, i) => ({ ...p, filha_id: filhas.find((f) => f.responsavel_id === (i === 0 ? mae : lucas))!.id, ...(i === 1 ? extra : {}) })),
        },
      ];
      const dividir = (itens: ItemDividir[]) => a.cliente.rpc("dividir_lancamento", { p_itens: itens as unknown as Json });
      expect((await dividir(refaz({}))).error).toBeNull();
      expect(await ler(doLucas.id)).toMatchObject({ vencimento_combinado: "2027-04-06", vencimento_observacao: "no final" });
      expect((await dividir(refaz({ vencimento_combinado: "2027-05-06" }))).error).toBeNull();
      expect(await ler(doLucas.id)).toMatchObject({ vencimento_combinado: "2027-05-06", vencimento_observacao: "no final" });
      expect((await dividir(refaz({ vencimento_combinado: null }))).error).toBeNull();
      expect(await ler(doLucas.id)).toMatchObject({ vencimento_combinado: null, vencimento_observacao: null });
      expect((await ler(id)).divisao).not.toBeNull();
    });
  });

  describe("Conta manual com a parte 'Dívida programada' (Flow 5)", () => {
    const bombinhas = (): RascunhoDaConta => ({
      nome: "Bombinhas",
      valor: "318,00",
      repeticao: "parcelas",
      parcelas: "6",
      comecaEm: "2026-07",
      tipo_id: viagem,
      observacao: "",
      partes: [
        { responsavel_id: mae, texto: "106,00" },
        { responsavel_id: casal, texto: "106,00" },
        { responsavel_id: lucas, texto: "106,00", programada: true, vencimento: "2027-04-06" },
      ],
    });

    function conta(r: RascunhoDaConta): NovaConta {
      const av = avaliarFormularioConta(`00000000-0000-4000-8000-${String(900 + ++seq).padStart(12, "0")}`, r, {
        mesAtual: MES_ATUAL,
        tiposAtivos: new Set([viagem]),
        responsaveisAtivos: new Set([mae, casal, lucas]),
      });
      expect(av.erros).toEqual({});
      return av.conta as NovaConta;
    }

    it("as 6 filhas do Lucas nascem com a data (R$ 636,00 no total); Mãe e Casal, sem; os valores seguem R$ 106,00", async () => {
      const c = conta(bombinhas());
      const pedido = pedidoSalvarConta(c, 1, horizonteDasContas(MES_ATUAL));
      const { error } = await a.cliente.rpc("salvar_conta_manual", {
        p_conta: pedido.p_conta as unknown as Json,
        p_parcelas: pedido.p_parcelas as unknown as Json,
        p_ate_mes: pedido.p_ate_mes,
      });
      expect(error).toBeNull();
      const filhas = (await local.admin.from("lancamentos").select("*").eq("conta_manual_id", c.id).not("dividido_de_id", "is", null)).data!;
      expect(filhas).toHaveLength(18);
      const doLucas = filhas.filter((f) => f.responsavel_id === lucas);
      expect(doLucas).toHaveLength(6);
      expect(doLucas.every((f) => f.vencimento_combinado === "2027-04-06" && f.valor_centavos === 10_600)).toBe(true);
      expect(doLucas.reduce((s, f) => s + f.valor_centavos, 0)).toBe(63_600);
      expect(filhas.filter((f) => f.responsavel_id !== lucas).every((f) => f.vencimento_combinado === null && f.valor_centavos === 10_600)).toBe(true);
      // A mãe guarda a Divisão com a data na parte do Lucas (a receita; a coluna da filha é quem vale).
      const mãe = (await local.admin.from("lancamentos").select("divisao").eq("conta_manual_id", c.id).is("dividido_de_id", null).eq("parcela_n", 1).single()).data!;
      expect(lerDivisao(mãe.divisao)?.partes.map((p) => p.vencimento_combinado)).toEqual([undefined, undefined, "2027-04-06"]);
    });
  });

  describe("reimportar a Fatura", () => {
    async function lerMes(mes: string) {
      const linhas = (await local.admin.from("lancamentos").select("*").eq("owner_id", a.id).eq("mes", mes)).data ?? [];
      const f = (await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", mes).maybeSingle()).data;
      const antigas: AntigaParaReimportar[] = linhas
        .filter((l) => f && l.fatura_id === f.id && l.dividido_de_id === null)
        .map((l) => ({
          id: l.id,
          nome_normalizado: l.nome_normalizado,
          valor_centavos: l.valor_centavos,
          parcela_n: l.parcela_n,
          parcela_total: l.parcela_total,
          ordem_fatura: l.ordem_fatura ?? 0,
          ajuste_de_id: l.ajuste_de_id,
          casado_em: l.casado_em,
          excluido_em: l.excluido_em,
          responsavel_id: l.responsavel_id,
          tipo_id: l.tipo_id,
          status_id: l.status_id,
          observacao: l.observacao,
          apelido: l.apelido,
          editado_em: l.editado_em,
          vencimento_combinado: l.vencimento_combinado,
          divisao: lerDivisao(l.divisao),
          revisao_motivo: l.revisao_motivo,
          revisao_dados: l.revisao_dados,
          serie: null,
        }));
      return { faturaId: f?.id ?? null, antigas, atualizadoEm: linhas.map((l) => l.updated_at).sort().at(-1) ?? null };
    }
    const idDe = async (mes: string, nome: string, ordem: number) =>
      (await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).eq("mes", mes).eq("nome", nome).eq("ordem_fatura", ordem).single()).data!.id;

    it("a linha casada mantém a data combinada e a observação; a sem par que tem data não é apagada em silêncio", async () => {
      const mes = "2026-03";
      const antes: Parcela[] = [
        { nome: "COM DATA", valor: 1_000 },
        { nome: "SEM PAR COM DATA", valor: 2_000 },
        { nome: "SEM PAR COMUM", valor: 3_000 },
      ];
      const gravada = await chamar(a.cliente, primeira(mes, antes));
      expect(gravada.error).toBeNull();
      const fid = (gravada.data as { fatura: { id: string } }).fatura.id;
      const [casada, semParComData, semParComum] = await Promise.all(antes.map((p, i) => idDe(mes, p.nome, i + 1)));
      // A casada é programada pela RPC (que marca editado_em); a sem par recebe só a data, direto, sem editado_em.
      await programar(a.cliente, [{ id: casada, vencimento_combinado: "2027-04-06", vencimento_observacao: "no final", editado_em: AGORA }]);
      await local.admin.from("lancamentos").update({ vencimento_combinado: "2027-05-06" }).eq("id", semParComData);

      const lido = await lerMes(mes);
      const imp = reimportacao(mes, [{ nome: "COM DATA", valor: 1_100 }], lido.antigas, []);
      const r = await chamar(a.cliente, imp, { lidoEm: lido.atualizadoEm, substituir: fid });
      expect(r.error).toBeNull();

      expect(await ler(casada)).toMatchObject({ valor_centavos: 1_100, vencimento_combinado: "2027-04-06", vencimento_observacao: "no final" });
      // A sem par com data sai da Fatura e vai ao Revisar (não é apagada); a comum é apagada.
      expect(await ler(semParComData)).toMatchObject({ fatura_id: null, revisao_motivo: "sumiu_na_reimportacao", vencimento_combinado: "2027-05-06" });
      expect((await local.admin.from("lancamentos").select("id").eq("id", semParComum).maybeSingle()).data).toBeNull();
    });
  });
});
