// Prova, contra o Supabase local (CI), o que o cron diário (História 5.3, AD-13,
// AD-15) precisa do banco: a RPC `materializar_contas_manuais_do_dono`, que a
// chave secreta (`service_role`, sem `auth.uid()`) chama em nome do dono.
// Roda a mesma função que a rota usa (`materializarContasDoDia`) contra o
// banco de verdade: o horizonte avança com o Mês atual e só as parcelas que
// faltam são criadas (`on conflict ... do nothing`), com as filhas da Divisão;
// a Conta encerrada não gera nada; e um usuário logado, o anônimo e a chave
// pública nunca chamam a variante do dono nem materializam em nome de outro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import {
  avaliarFormularioConta,
  horizonteDasContas,
  pedidoSalvarConta,
  type NovaConta,
  type RascunhoDaConta,
} from "../../src/domain/contas-manuais";
import { planoDoCron } from "../../src/domain/materializacao-diaria";
import { materializarContasDoDia, type ClienteDoCron } from "../../src/server/materializar-contas";
import { ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

// Quando a Conta é salva: Nov/26 (horizonte Nov/27). O cron roda "depois".
const MES_AO_SALVAR = "2026-11";
// 12:00 UTC de 1º/12/2026 = 09:00 em Brasília: o Mês atual do cron é Dez/26 (horizonte Dez/27).
const CRON_EM_DEZEMBRO = new Date("2026-12-01T12:00:00Z");
const CRON_EM_JANEIRO = new Date("2027-01-01T12:00:00Z");

describe.skipIf(!ligado)("Cron diário: materializar em nome do dono (Supabase local)", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae: string;
  let casal: string;
  let rafael: string;
  let tipo: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("cron");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const resp = async (nome: string, cor: number, ordem: number) =>
      (await local.admin.from("responsaveis").insert({ owner_id: a.id, nome, cor, ordem }).select().single()).data!.id;
    mae = await resp("Mãe", 3, 1);
    casal = await resp("Casal", 2, 2);
    rafael = await resp("Rafael", 1, 3);
    tipo = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Casa" }).select().single()).data!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  const recorrente = (nome: string, extra: Partial<RascunhoDaConta> = {}): RascunhoDaConta => ({
    nome,
    valor: "400,00",
    repeticao: "mensal",
    parcelas: "",
    comecaEm: "2026-01",
    tipo_id: tipo,
    observacao: "",
    partes: [{ responsavel_id: rafael, texto: "" }],
    ...extra,
  });

  function nova(r: RascunhoDaConta): NovaConta {
    const av = avaliarFormularioConta(`00000000-0000-4000-9000-${String(++seq).padStart(12, "0")}`, r, {
      mesAtual: MES_AO_SALVAR,
      tiposAtivos: new Set([tipo]),
      responsaveisAtivos: new Set([mae, casal, rafael]),
    });
    expect(av.erros).toEqual({});
    return av.conta as NovaConta;
  }

  /** O usuário salva a Conta como na tela (a RPC do usuário logado, a da 5.1). */
  async function salvar(cliente: Cliente, conta: NovaConta) {
    const pedido = pedidoSalvarConta(conta, 1, horizonteDasContas(MES_AO_SALVAR));
    const { error } = await cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: pedido.p_ate_mes,
    });
    expect(error).toBeNull();
  }

  const maes = async (contaId: string) =>
    (
      await local.admin
        .from("lancamentos")
        .select("*")
        .eq("conta_manual_id", contaId)
        .is("dividido_de_id", null)
        .is("excluido_em", null)
        .order("parcela_n")
    ).data!;
  const filhas = async (contaId: string) =>
    (await local.admin.from("lancamentos").select("*").eq("conta_manual_id", contaId).not("dividido_de_id", "is", null)).data!;

  /** O pedido que o cron monta para uma Conta só (a mesma leitura e o mesmo núcleo da rota). */
  async function pedidoDoCron(contaId: string, mesAtual: string) {
    const { data } = await local.admin
      .from("contas_manuais")
      .select("id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes")
      .eq("id", contaId);
    return planoDoCron(data!, mesAtual).pedidos[0]?.pedido;
  }

  const admin = () => local.admin as unknown as ClienteDoCron;

  it("o Mês virou: o cron cria só a parcela que faltava, em nome do dono, como `manual`", async () => {
    const silvia = nova(recorrente("Silvia"));
    await salvar(a.cliente, silvia);
    expect(await maes(silvia.id)).toHaveLength(23); // Jan/26 a Nov/27

    const r = await materializarContasDoDia(admin(), CRON_EM_DEZEMBRO);
    expect(r.ok).toBe(true);
    expect(r.quantidade).toBeGreaterThanOrEqual(1); // outras Contas do banco local também podem crescer

    const linhas = await maes(silvia.id);
    expect(linhas).toHaveLength(24);
    const nova24 = linhas[23];
    expect(nova24).toMatchObject({
      parcela_n: 24,
      mes: "2027-12",
      parcela_total: null,
      lancado_por: "manual",
      valor_centavos: 40_000,
      owner_id: a.id,
      conta_manual_id: silvia.id,
      tipo_id: tipo,
      responsavel_id: rafael,
      revisao_motivo: null,
    });
    // A Série é a da Conta (uma só).
    const { data: series } = await local.admin.from("series").select("id").eq("conta_manual_id", silvia.id);
    expect(series).toHaveLength(1);
    expect(nova24.serie_id).toBe(series![0].id);
  });

  it("rodar duas vezes no mesmo dia não cria nada novo", async () => {
    const tv = nova(recorrente("TVbox", { valor: "50,00", comecaEm: "2026-10" }));
    await salvar(a.cliente, tv);
    await materializarContasDoDia(admin(), CRON_EM_DEZEMBRO);
    const depoisDaPrimeira = await maes(tv.id);

    // A mesma RPC com o mesmo pedido devolve `[]`: nada novo.
    const pedido = (await pedidoDoCron(tv.id, "2026-12"))!;
    const { data, error } = await local.admin.rpc("materializar_contas_manuais_do_dono", {
      p_owner_id: pedido.p_owner_id,
      p_ate_mes: pedido.p_ate_mes,
      p_parcelas: pedido.p_parcelas as unknown as Json,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const segunda = await materializarContasDoDia(admin(), CRON_EM_DEZEMBRO);
    expect(segunda.ok).toBe(true);
    const depoisDaSegunda = await maes(tv.id);
    expect(depoisDaSegunda.map((l) => l.id)).toEqual(depoisDaPrimeira.map((l) => l.id));
    expect(depoisDaSegunda).toHaveLength(15); // Out/26 a Dez/27
  });

  it("com Divisão: a parcela nova nasce com as filhas, as mesmas partes e o mesmo dono", async () => {
    const divida = nova(
      recorrente("Reforma", {
        valor: "318,00",
        repeticao: "parcelas",
        parcelas: "24",
        comecaEm: "2026-11",
        partes: [
          { responsavel_id: mae, texto: "159,00" },
          { responsavel_id: casal, texto: "159,00" },
        ],
      }),
    );
    await salvar(a.cliente, divida);
    expect(await maes(divida.id)).toHaveLength(13); // Nov/26 a Nov/27
    expect(await filhas(divida.id)).toHaveLength(26);

    await materializarContasDoDia(admin(), CRON_EM_DEZEMBRO);
    const linhas = await maes(divida.id);
    expect(linhas).toHaveLength(14);
    const nova14 = linhas[13];
    expect(nova14).toMatchObject({ parcela_n: 14, mes: "2027-12", parcela_total: 24, valor_centavos: 31_800, responsavel_id: null });
    const filhasDaNova = (await filhas(divida.id)).filter((f) => f.dividido_de_id === nova14.id);
    expect(filhasDaNova.map((f) => [f.responsavel_id, f.valor_centavos]).sort()).toEqual(
      [
        [mae, 15_900],
        [casal, 15_900],
      ].sort(),
    );
    for (const f of filhasDaNova) expect(f).toMatchObject({ owner_id: a.id, conta_manual_id: divida.id, mes: "2027-12", lancado_por: "manual" });
  });

  it("a Conta encerrada não ganha parcelas do Mês do encerramento em diante", async () => {
    const velha = nova(recorrente("Antiga", { comecaEm: "2026-01" }));
    await salvar(a.cliente, velha);
    expect(await maes(velha.id)).toHaveLength(23);
    // Encerrada em Dez/26 (vale até Nov/26); a 5.4 é quem vai encerrar pela tela, aqui só a coluna.
    const { error } = await local.admin.from("contas_manuais").update({ encerrada_em_mes: "2026-12" }).eq("id", velha.id);
    expect(error).toBeNull();

    await materializarContasDoDia(admin(), CRON_EM_JANEIRO);
    expect(await maes(velha.id)).toHaveLength(23);
    // O pedido do cron pára no Mês anterior ao encerramento (Nov/26): nada de Dez/26 em diante.
    const pedido = (await pedidoDoCron(velha.id, "2027-01"))!;
    expect(pedido.p_parcelas.at(-1)!.mes).toBe("2026-11");
  });

  it("o cron grava com o dono da Conta e outro usuário não vê nada", async () => {
    const deA = nova(recorrente("DeA", { comecaEm: "2026-11" }));
    await salvar(a.cliente, deA);
    await materializarContasDoDia(admin(), CRON_EM_JANEIRO);
    const linhas = await maes(deA.id);
    expect(new Set(linhas.map((l) => l.owner_id))).toEqual(new Set([a.id]));
    // B não vê nada de A.
    const { data: vistasPorB } = await b.cliente.from("lancamentos").select("id").eq("conta_manual_id", deA.id);
    expect(vistasPorB).toEqual([]);
  });

  describe("quem pode chamar `materializar_contas_manuais_do_dono`", () => {
    it("o usuário logado, o anônimo e a chave pública recusam; nada é gravado", async () => {
      const conta = nova(recorrente("Fechada", { comecaEm: "2026-11" }));
      await salvar(a.cliente, conta);
      const antes = await maes(conta.id);
      const pedido = (await pedidoDoCron(conta.id, "2026-12"))!;
      const args = {
        p_owner_id: pedido.p_owner_id,
        p_ate_mes: pedido.p_ate_mes,
        p_parcelas: pedido.p_parcelas as unknown as Json,
      };

      // Nem o próprio dono, nem outro usuário logado passam um `p_owner_id`.
      for (const cliente of [a.cliente, b.cliente, local.anonimo]) {
        const r = await cliente.rpc("materializar_contas_manuais_do_dono", args);
        expect(r.error).not.toBeNull();
        expect(r.data).toBeNull();
      }
      // B tenta materializar a Conta de A dizendo que é dele: também recusa.
      const deB = await b.cliente.rpc("materializar_contas_manuais_do_dono", { ...args, p_owner_id: b.id });
      expect(deB.error).not.toBeNull();

      expect((await maes(conta.id)).map((l) => l.id)).toEqual(antes.map((l) => l.id));
    });

    it("a chave secreta com o dono errado não materializa a Conta de A (`conta.nao_encontrada`)", async () => {
      const conta = nova(recorrente("DeAmesmo", { comecaEm: "2026-11" }));
      await salvar(a.cliente, conta);
      const antes = await maes(conta.id);
      const pedido = (await pedidoDoCron(conta.id, "2026-12"))!;
      const r = await local.admin.rpc("materializar_contas_manuais_do_dono", {
        p_owner_id: b.id,
        p_ate_mes: pedido.p_ate_mes,
        p_parcelas: pedido.p_parcelas as unknown as Json,
      });
      expect(r.error?.message ?? "").toContain("conta.nao_encontrada");
      expect((await maes(conta.id)).map((l) => l.id)).toEqual(antes.map((l) => l.id));
    });

    it("o dono fixado vale só para a transação: depois da chamada o usuário logado continua sem acesso", async () => {
      const conta = nova(recorrente("Vazamento", { comecaEm: "2026-11" }));
      await salvar(a.cliente, conta);
      await materializarContasDoDia(admin(), CRON_EM_DEZEMBRO);
      // B continua sem ver nada de A, e a RPC do usuário logado (`auth.uid()`) continua do próprio B.
      const { data } = await b.cliente.from("contas_manuais").select("id");
      expect(data).toEqual([]);
      const pedido = (await pedidoDoCron(conta.id, "2026-12"))!;
      const deB = await b.cliente.rpc("materializar_contas_manuais", {
        p_ate_mes: pedido.p_ate_mes,
        p_parcelas: pedido.p_parcelas as unknown as Json,
      });
      expect(deB.error?.message ?? "").toContain("conta.nao_encontrada");
    });
  });
});
