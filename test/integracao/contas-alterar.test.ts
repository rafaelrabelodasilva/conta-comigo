// Prova, contra o Supabase local (CI), alterar, encerrar e excluir uma Conta
// manual (História 5.4, FR-18, FR-46, AD-15, AD-16): as RPCs `alterar_conta_manual`,
// `excluir_conta_manual` e `restaurar_conta_manual`, o materializador com a trava
// da Conta, a Conta excluída que nenhum leitor traz de volta, o isolamento por
// dono, os `grant` e o Realtime. Quem decide o que recriar, excluir e deixar como
// está é o núcleo (`alterar-conta.ts`); aqui se prova o banco e que a leitura
// pelo PostgREST (com os `updated_at` de verdade) fecha com a conferência da RPC.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import {
  chaveDaSerieAlterada,
  lerContaSalva,
  pedidoRestaurarConta,
  planoDeAlterarConta,
  planoDeEncerrarConta,
  planoDeExcluirConta,
  type ContaSalva,
  type EntradaDoPlano,
  type LancamentoDaConta,
  type SerieParaAlterar,
} from "../../src/domain/alterar-conta";
import {
  avaliarFormularioConta,
  horizonteDasContas,
  pedidoMaterializar,
  pedidoSalvarConta,
  proximaOcorrencia,
  type NovaConta,
  type RascunhoDaConta,
} from "../../src/domain/contas-manuais";
import { planoDoCron } from "../../src/domain/materializacao-diaria";
import { materializarContasDoDia, type ClienteDoCron } from "../../src/server/materializar-contas";
import { esperarEvento, ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

const MES = "2026-11";
// 12:00 UTC de 1º/12/2026 = 09:00 em Brasília: o Mês atual do cron é Dez/26.
const CRON_EM_DEZEMBRO = new Date("2026-12-01T12:00:00Z");

describe.skipIf(!ligado)("Alterar, encerrar e excluir uma Conta manual no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae: string;
  let casal: string;
  let lucas: string;
  let rafael: string;
  let viagem: string;
  let saude: string;
  let pago: string;
  let naoPago: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("alterar");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const resp = async (nome: string, cor: number, ordem: number) =>
      (await local.admin.from("responsaveis").insert({ owner_id: a.id, nome, cor, ordem }).select().single()).data!.id;
    mae = await resp("Mãe", 3, 1);
    casal = await resp("Casal", 2, 2);
    lucas = await resp("Lucas", 4, 3);
    rafael = await resp("Rafael", 1, 4);
    viagem = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Viagem" }).select().single()).data!.id;
    saude = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Saúde" }).select().single()).data!.id;
    pago = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Pago", conta_como_pago: true }).select().single()).data!.id;
    naoPago = (await local.admin.from("status").insert({ owner_id: a.id, nome: "Não pago", conta_como_pago: false }).select().single()).data!.id;
    await local.admin.from("configuracoes").insert({ owner_id: a.id, status_padrao_id: naoPago });
  });

  afterAll(async () => {
    await local.limpar();
  });

  const bombinhas = (extra: Partial<RascunhoDaConta> = {}): RascunhoDaConta => ({
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
      { responsavel_id: lucas, texto: "106,00" },
    ],
    ...extra,
  });
  const silvia = (extra: Partial<RascunhoDaConta> = {}): RascunhoDaConta => ({
    nome: "Silvia",
    valor: "400,00",
    repeticao: "mensal",
    parcelas: "",
    comecaEm: "2026-09",
    tipo_id: saude,
    observacao: "",
    partes: [{ responsavel_id: rafael, texto: "" }],
    ...extra,
  });

  const contexto = () => ({
    mesAtual: MES,
    tiposAtivos: new Set([viagem, saude]),
    responsaveisAtivos: new Set([mae, casal, lucas, rafael]),
  });

  function nova(r: RascunhoDaConta, id = `00000000-0000-4000-a000-${String(++seq).padStart(12, "0")}`, salva?: ContaSalva): NovaConta {
    const av = avaliarFormularioConta(id, r, { ...contexto(), ...(salva ? { original: salva } : {}) });
    expect(av.erros).toEqual({});
    return av.conta as NovaConta;
  }

  /** Salva como a tela (RPC do usuário logado, a da 5.1), lendo as `ocorrencia` da chave como o repositório. */
  async function salvar(cliente: Cliente, conta: NovaConta) {
    let consulta = cliente
      .from("series")
      .select("ocorrencia, conta_manual_id")
      .eq("nome_normalizado", conta.nome_normalizado)
      .eq("valor_parcela_centavos", conta.valor_centavos)
      .eq("mes_primeira_parcela", conta.mes_inicial);
    consulta = conta.parcela_total === null ? consulta.is("parcela_total", null) : consulta.eq("parcela_total", conta.parcela_total);
    const { data } = await consulta;
    const propria = (data ?? []).find((s) => s.conta_manual_id === conta.id);
    const ocorrencia = propria ? propria.ocorrencia : proximaOcorrencia((data ?? []).map((s) => s.ocorrencia));
    const pedido = pedidoSalvarConta(conta, ocorrencia, horizonteDasContas(MES));
    return cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: pedido.p_ate_mes,
    });
  }

  const vivas = async (contaId: string) =>
    (
      await local.admin
        .from("lancamentos")
        .select("*")
        .eq("conta_manual_id", contaId)
        .is("dividido_de_id", null)
        .is("excluido_em", null)
        .order("parcela_n")
    ).data!;
  const filhasVivas = async (contaId: string) =>
    (await local.admin.from("lancamentos").select("*").eq("conta_manual_id", contaId).not("dividido_de_id", "is", null).is("excluido_em", null)).data!;
  const contaDoBanco = async (contaId: string) => (await local.admin.from("contas_manuais").select("*").eq("id", contaId).single()).data!;

  /** Lê o que a tela lê (pelo usuário logado: RLS e PostgREST de verdade) e monta a entrada do plano. */
  async function ler(cliente: Cliente, contaId: string, novaChave?: NovaConta) {
    const linha = (await cliente.from("contas_manuais").select("*").eq("id", contaId).single()).data!;
    const salva = lerContaSalva(linha)!;
    const { data: existentes } = await cliente
      .from("lancamentos")
      .select("id, dividido_de_id, mes, parcela_n, status_id, editado_em, excluido_em, updated_at")
      .eq("conta_manual_id", contaId)
      .gte("mes", MES)
      .is("excluido_em", null)
      .order("mes")
      .order("id");
    const { data: statusPagos } = await cliente.from("status").select("id").eq("conta_como_pago", true);
    const { data: series } = await cliente
      .from("series")
      .select("nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia")
      .eq("conta_manual_id", contaId);
    let outras: number[] = [];
    if (novaChave) {
      let c = cliente
        .from("series")
        .select("ocorrencia, conta_manual_id")
        .eq("nome_normalizado", novaChave.nome_normalizado)
        .eq("valor_parcela_centavos", novaChave.valor_centavos)
        .eq("mes_primeira_parcela", novaChave.mes_inicial);
      c = novaChave.parcela_total === null ? c.is("parcela_total", null) : c.eq("parcela_total", novaChave.parcela_total);
      outras = ((await c).data ?? []).filter((s) => s.conta_manual_id !== contaId).map((s) => s.ocorrencia);
    }
    const serie: SerieParaAlterar = { atual: series![0], ocorrenciasDeOutras: outras };
    const entrada: EntradaDoPlano = {
      mesAtual: MES,
      statusQueContam: new Set((statusPagos ?? []).map((s) => s.id)),
      existentes: existentes as LancamentoDaConta[],
    };
    return { salva, serie, entrada };
  }

  const alterarRpc = (cliente: Cliente, pedido: unknown) => cliente.rpc("alterar_conta_manual", { p_pedido: pedido as Json });
  const excluirRpc = (cliente: Cliente, pedido: unknown) => cliente.rpc("excluir_conta_manual", { p_pedido: pedido as Json });
  const restaurarRpc = (cliente: Cliente, pedido: unknown) => cliente.rpc("restaurar_conta_manual", { p_pedido: pedido as Json });

  async function alterar(cliente: Cliente, contaId: string, r: RascunhoDaConta) {
    const lido0 = await ler(cliente, contaId);
    const novaConta = nova(r, contaId, lido0.salva);
    const lido = await ler(cliente, contaId, novaConta);
    const plano = planoDeAlterarConta(lido.salva, novaConta, lido.serie, lido.entrada);
    if (!plano.ok) throw new Error(plano.codigo);
    return { plano, resposta: await alterarRpc(cliente, plano.pedido) };
  }

  it("Editar recorrente: recria só as parcelas do Mês atual em diante sem edição nem Status pago, e o resto não muda", async () => {
    const s = nova(silvia());
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const antes = await vivas(s.id);
    expect(antes).toHaveLength(15); // Set/26 a Nov/27
    await local.admin.from("lancamentos").update({ status_id: pago }).eq("id", antes.find((m) => m.mes === "2027-01")!.id);
    await local.admin.from("lancamentos").update({ editado_em: new Date().toISOString() }).eq("id", antes.find((m) => m.mes === "2027-03")!.id);

    const { plano, resposta } = await alterar(a.cliente, s.id, silvia({ nome: "Silvia Nova", valor: "450,00" }));
    expect(resposta.error).toBeNull();
    // 13 parcelas de Nov/26 a Nov/27; 2 ficam; 11 saem e voltam.
    expect(plano.resumo).toMatchObject({ excluidas: 11, criadas: 11 });
    expect(plano.resumo.mantidas.map((m) => [m.mes, m.motivo])).toEqual([
      ["2027-01", "paga"],
      ["2027-03", "editada"],
    ]);

    const depois = await vivas(s.id);
    expect(depois).toHaveLength(15);
    const porMes = new Map(depois.map((m) => [m.mes, m]));
    for (const velha of antes) {
      const atual = porMes.get(velha.mes)!;
      const ficou = velha.mes < MES || velha.mes === "2027-01" || velha.mes === "2027-03";
      if (ficou) {
        expect(atual.id).toBe(velha.id);
        expect(atual.valor_centavos).toBe(40_000);
        expect(atual.nome).toBe("Silvia");
      } else {
        expect(atual.id).not.toBe(velha.id);
        expect(atual.valor_centavos).toBe(45_000);
        expect(atual.nome).toBe("Silvia Nova");
        expect(atual.parcela_n).toBe(velha.parcela_n);
        expect(atual).toMatchObject({ lancado_por: "manual", conta_manual_id: s.id, tipo_id: saude, responsavel_id: rafael });
      }
    }
    // As antigas ficaram excluídas em lógico (nada foi apagado).
    const { data: excluidas } = await local.admin.from("lancamentos").select("id").eq("conta_manual_id", s.id).not("excluido_em", "is", null);
    expect(excluidas).toHaveLength(11);
    // Conta e Série mudaram no lugar: uma Conta, uma Série, a chave nova.
    expect(await contaDoBanco(s.id)).toMatchObject({ nome: "Silvia Nova", valor_centavos: 45_000 });
    const { data: series } = await local.admin.from("series").select("*").eq("conta_manual_id", s.id);
    expect(series).toHaveLength(1);
    expect(series![0]).toMatchObject({ nome_normalizado: "SILVIA NOVA", valor_parcela_centavos: 45_000, ocorrencia: 1 });
    // Salvar de novo o formulário velho (mesmo id) não desfaz o que a alteração fez e a RPC da 5.1 segue idempotente.
    const velha = await salvar(a.cliente, s);
    expect(velha.error).toBeNull();
  });

  it("Editar com Divisão: as filhas saem e voltam com a mãe, com os valores novos (AD-2)", async () => {
    const bomb = nova(bombinhas({ nome: "Bomb Edit" }));
    expect((await salvar(a.cliente, bomb)).error).toBeNull();
    expect(await filhasVivas(bomb.id)).toHaveLength(18);
    const antes = await vivas(bomb.id);
    // Dez/26 editada à mão numa filha: a parcela inteira fica.
    const dez = antes.find((m) => m.mes === "2026-12")!;
    const filhaDez = (await filhasVivas(bomb.id)).find((f) => f.dividido_de_id === dez.id)!;
    await local.admin.from("lancamentos").update({ editado_em: new Date().toISOString() }).eq("id", filhaDez.id);

    const { plano, resposta } = await alterar(
      a.cliente,
      bomb.id,
      bombinhas({ nome: "Bomb Edit", valor: "330,00", partes: bombinhas().partes.map((p) => ({ ...p, texto: "110,00" })) }),
    );
    expect(resposta.error).toBeNull();
    expect(plano.resumo.mantidas.map((m) => [m.mes, m.motivo])).toEqual([["2026-12", "editada"]]);
    // Só Nov/26 é recriada (Dez/26 fica): 1 mãe e 3 filhas novas, 1 mãe e 3 filhas antigas excluídas.
    const depois = await vivas(bomb.id);
    expect(depois).toHaveLength(6);
    const nov = depois.find((m) => m.mes === "2026-11")!;
    expect(nov.id).not.toBe(antes.find((m) => m.mes === "2026-11")!.id);
    expect(nov.valor_centavos).toBe(33_000);
    const filhasNov = (await filhasVivas(bomb.id)).filter((f) => f.dividido_de_id === nov.id);
    expect(filhasNov.map((f) => f.valor_centavos)).toEqual([11_000, 11_000, 11_000]);
    // A mantida (Dez/26) continua a mesma, com as filhas de antes.
    expect(depois.find((m) => m.mes === "2026-12")!.id).toBe(dez.id);
    expect((await filhasVivas(bomb.id)).filter((f) => f.dividido_de_id === dez.id)).toHaveLength(3);
    expect((await filhasVivas(bomb.id)).filter((f) => f.dividido_de_id === dez.id).every((f) => f.valor_centavos === 10_600)).toBe(true);
    expect(await filhasVivas(bomb.id)).toHaveLength(18);
  });

  it("a Conta mudou, ou uma linha foi paga, entre a leitura e a gravação: `conta.mudou` e nada é gravado", async () => {
    const s = nova(silvia({ nome: "Corrida", comecaEm: "2026-11" }));
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const lido0 = await ler(a.cliente, s.id);
    const novaConta = nova(silvia({ nome: "Corrida", comecaEm: "2026-11", valor: "500,00" }), s.id, lido0.salva);
    const lido = await ler(a.cliente, s.id, novaConta);
    const plano = planoDeAlterarConta(lido.salva, novaConta, lido.serie, lido.entrada);
    if (!plano.ok) throw new Error("plano");

    // Outro aparelho paga uma parcela depois da leitura.
    const alvo = (await vivas(s.id)).find((m) => m.mes === "2026-12")!;
    await local.admin.from("lancamentos").update({ status_id: pago }).eq("id", alvo.id);
    const r1 = await alterarRpc(a.cliente, plano.pedido);
    expect(r1.error?.message).toBe("conta.mudou");
    expect(await vivas(s.id)).toHaveLength(13);
    expect((await contaDoBanco(s.id)).valor_centavos).toBe(40_000);

    // Outro aparelho muda a Conta depois da leitura: o pedido inteiro é velho.
    await local.admin.from("contas_manuais").update({ observacao: "mudou em outro aparelho" }).eq("id", s.id);
    const fresco = await ler(a.cliente, s.id, novaConta);
    const plano2 = planoDeAlterarConta(fresco.salva, novaConta, fresco.serie, fresco.entrada);
    if (!plano2.ok) throw new Error("plano");
    await local.admin.from("contas_manuais").update({ observacao: "mudou de novo" }).eq("id", s.id);
    const r2 = await alterarRpc(a.cliente, plano2.pedido);
    expect(r2.error?.message).toBe("conta.mudou");
    expect((await contaDoBanco(s.id)).valor_centavos).toBe(40_000);
  });

  it("a chave da Série: Nome igual ao de outra Conta ganha ocorrencia 2; colisão tardia vira conta.serie_ocupada sem gravar nada", async () => {
    const x = nova(silvia({ nome: "Gemea", comecaEm: "2026-11" }));
    const y = nova(silvia({ nome: "Gemea B", comecaEm: "2026-11" }));
    expect((await salvar(a.cliente, x)).error).toBeNull();
    expect((await salvar(a.cliente, y)).error).toBeNull();
    const { plano, resposta } = await alterar(a.cliente, y.id, silvia({ nome: "Gemea", comecaEm: "2026-11" }));
    expect(plano.pedido.conta.serie.ocorrencia).toBe(2);
    expect(resposta.error).toBeNull();
    const ocorrencia = async (id: string) => (await local.admin.from("series").select("ocorrencia").eq("conta_manual_id", id).single()).data!.ocorrencia;
    expect(await ocorrencia(x.id)).toBe(1);
    expect(await ocorrencia(y.id)).toBe(2);

    // Uma terceira Conta lê "nenhuma outra" (esqueceu X e Y) e tenta a ocorrencia 1: a chave única recusa.
    const z = nova(silvia({ nome: "Outra", comecaEm: "2026-11" }));
    expect((await salvar(a.cliente, z)).error).toBeNull();
    const lido0 = await ler(a.cliente, z.id);
    const nz = nova(silvia({ nome: "Gemea", comecaEm: "2026-11" }), z.id, lido0.salva);
    const lido = await ler(a.cliente, z.id);
    const plano2 = planoDeAlterarConta(lido.salva, nz, { atual: lido.serie.atual, ocorrenciasDeOutras: [] }, lido.entrada);
    if (!plano2.ok) throw new Error("plano");
    expect(plano2.pedido.conta.serie.ocorrencia).toBe(1);
    const r = await alterarRpc(a.cliente, plano2.pedido);
    expect(r.error?.message).toBe("conta.serie_ocupada");
    expect((await contaDoBanco(z.id)).nome).toBe("Outra");
    expect(await vivas(z.id)).toHaveLength(13);
    expect(chaveDaSerieAlterada({ atual: lido.serie.atual, ocorrenciasDeOutras: [1, 2] }, nz).ocorrencia).toBe(3);
  });

  it("guardas da RPC: 'Começa em' fixo, nada criado ou excluído antes do Mês atual, e outro dono não acha a Conta", async () => {
    const s = nova(silvia({ nome: "Trava", comecaEm: "2026-05" }));
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const lido = await ler(a.cliente, s.id);
    const nv = nova(silvia({ nome: "Trava", comecaEm: "2026-05", valor: "10,00" }), s.id, lido.salva);
    const plano = planoDeAlterarConta(lido.salva, nv, lido.serie, lido.entrada);
    if (!plano.ok) throw new Error("plano");

    const outroInicio = structuredClone(plano.pedido);
    outroInicio.conta.mes_inicial = "2026-08";
    expect((await alterarRpc(a.cliente, outroInicio)).error?.message).toBe("salvar.falhou");

    const noPassado = structuredClone(plano.pedido);
    noPassado.parcelas.push({ conta_id: s.id, parcela_n: 1, mes: "2026-05", valor_centavos: 1000, partes: null });
    expect((await alterarRpc(a.cliente, noPassado)).error?.message).toBe("salvar.falhou");

    const outraConta = structuredClone(plano.pedido);
    outraConta.parcelas[0].conta_id = "00000000-0000-4000-a000-00000000ffff";
    expect((await alterarRpc(a.cliente, outraConta)).error?.message).toBe("salvar.falhou");

    const linhaDeOutubro = (await vivas(s.id)).find((m) => m.mes === "2026-10")!;
    const antesDoMes = structuredClone(plano.pedido);
    antesDoMes.excluir = [{ id: linhaDeOutubro.id, atualizado_em: linhaDeOutubro.updated_at }];
    expect((await alterarRpc(a.cliente, antesDoMes)).error?.message).toBe("salvar.falhou");

    // Outro dono: nem a Conta nem as linhas existem para ele.
    expect((await alterarRpc(b.cliente, plano.pedido)).error?.message).toBe("conta.nao_encontrada");
    expect((await excluirRpc(b.cliente, { conta_id: s.id, excluir: [], mes_atual: MES })).error?.message).toBe("conta.nao_encontrada");
    expect((await restaurarRpc(b.cliente, { conta_id: s.id, ids: [] })).error?.message).toBe("conta.nao_encontrada");
    // O anônimo nem chama.
    expect((await alterarRpc(local.anonimo, plano.pedido)).error).not.toBeNull();
    expect((await excluirRpc(local.anonimo, { conta_id: s.id, excluir: [], mes_atual: MES })).error).not.toBeNull();
    expect((await restaurarRpc(local.anonimo, { conta_id: s.id, ids: [] })).error).not.toBeNull();
    expect((await contaDoBanco(s.id)).valor_centavos).toBe(40_000);
  });

  it("Encerrar: exclui as recriáveis do Mês escolhido em diante, a paga fica, o cron não recria e estender cria só o que falta", async () => {
    const s = nova(silvia({ nome: "Encerra", comecaEm: "2026-09" }));
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const maes = await vivas(s.id);
    await local.admin.from("lancamentos").update({ status_id: pago }).eq("id", maes.find((m) => m.mes === "2027-02")!.id);

    const lido = await ler(a.cliente, s.id);
    const plano = planoDeEncerrarConta(lido.salva, lido.serie, "2027-01", lido.entrada);
    if (!plano.ok) throw new Error(plano.codigo);
    expect(plano.resumo.excluidas).toBe(10);
    expect(plano.resumo.mantidas).toEqual([{ mes: "2027-02", parcela_n: 6, motivo: "paga" }]);
    expect((await alterarRpc(a.cliente, plano.pedido)).error).toBeNull();
    expect((await contaDoBanco(s.id)).encerrada_em_mes).toBe("2027-01");
    const meses = (await vivas(s.id)).map((m) => m.mes);
    expect(meses.filter((m) => m < "2027-01")).toHaveLength(4);
    expect(meses.filter((m) => m >= "2027-01")).toEqual(["2027-02"]);

    // O cron, mesmo mais tarde, só cria antes do Mês do encerramento (e aí já existe tudo).
    const r = await materializarContasDoDia(local.admin as unknown as ClienteDoCron, CRON_EM_DEZEMBRO);
    expect(r.ok).toBe(true);
    expect((await vivas(s.id)).map((m) => m.mes)).toEqual(meses);

    // Estender: encerrar de novo em Mar/27 cria só Jan/27 (Fev/27, paga, continua a mesma).
    const lido2 = await ler(a.cliente, s.id);
    const pagaAntes = (await vivas(s.id)).find((m) => m.mes === "2027-02")!.id;
    const plano2 = planoDeEncerrarConta(lido2.salva, lido2.serie, "2027-03", lido2.entrada);
    if (!plano2.ok) throw new Error(plano2.codigo);
    expect(plano2.resumo.criadas).toBe(1);
    expect((await alterarRpc(a.cliente, plano2.pedido)).error).toBeNull();
    const meses2 = await vivas(s.id);
    expect(meses2.filter((m) => m.mes >= "2027-01").map((m) => m.mes)).toEqual(["2027-01", "2027-02"]);
    expect(meses2.find((m) => m.mes === "2027-02")!.id).toBe(pagaAntes);
  });

  it("Encerrar uma parcelada com Divisão: mãe e filhas saem juntas", async () => {
    const bomb = nova(bombinhas({ nome: "Bomb Encerra" }));
    expect((await salvar(a.cliente, bomb)).error).toBeNull();
    const lido = await ler(a.cliente, bomb.id);
    const plano = planoDeEncerrarConta(lido.salva, lido.serie, "2026-12", lido.entrada);
    if (!plano.ok) throw new Error(plano.codigo);
    expect(plano.pedido.excluir).toHaveLength(4);
    expect((await alterarRpc(a.cliente, plano.pedido)).error).toBeNull();
    expect(await vivas(bomb.id)).toHaveLength(5);
    expect(await filhasVivas(bomb.id)).toHaveLength(15);
  });

  it("Excluir com os lançamentos: a Conta e as recriáveis saem em lógico; o Desfazer devolve os MESMOS ids; repetir não faz nada", async () => {
    const bomb = nova(bombinhas({ nome: "Bomb Exclui" }));
    expect((await salvar(a.cliente, bomb)).error).toBeNull();
    const antes = await vivas(bomb.id);
    await local.admin.from("lancamentos").update({ status_id: pago }).eq("id", antes.find((m) => m.mes === "2026-11")!.id);

    const lido = await ler(a.cliente, bomb.id);
    const plano = planoDeExcluirConta(lido.salva, true, lido.entrada);
    expect(plano.resumo).toMatchObject({ excluidas: 1, mantidas: [{ mes: "2026-11", motivo: "paga" }] });
    const r = await excluirRpc(a.cliente, plano.pedido);
    expect(r.error).toBeNull();
    const resposta = r.data as unknown as { conta: { excluido_em: string | null }; lancamentos: { id: string; excluido_em: string | null }[] };
    expect(resposta.conta.excluido_em).not.toBeNull();
    const saidos = resposta.lancamentos.map((l) => l.id);
    expect(saidos).toHaveLength(4); // a mãe de Dez/26 e as 3 filhas
    expect(resposta.lancamentos.every((l) => l.excluido_em !== null)).toBe(true);
    expect((await contaDoBanco(bomb.id)).excluido_em).not.toBeNull();
    expect(await vivas(bomb.id)).toHaveLength(5);
    // A Série e a FK ficam (a Conta nunca é apagada).
    expect((await local.admin.from("series").select("id").eq("conta_manual_id", bomb.id)).data).toHaveLength(1);

    // Repetir o pedido não faz nada.
    const de_novo = await excluirRpc(a.cliente, plano.pedido);
    expect(de_novo.error).toBeNull();
    expect((de_novo.data as unknown as { lancamentos: unknown[] }).lancamentos).toEqual([]);

    // O Desfazer: os mesmos ids.
    const volta = await restaurarRpc(a.cliente, pedidoRestaurarConta(bomb.id, saidos));
    expect(volta.error).toBeNull();
    expect((await contaDoBanco(bomb.id)).excluido_em).toBeNull();
    const depois = await vivas(bomb.id);
    expect(depois.map((m) => m.id)).toEqual(antes.map((m) => m.id));
    expect(await filhasVivas(bomb.id)).toHaveLength(18);
    const repetido = await restaurarRpc(a.cliente, pedidoRestaurarConta(bomb.id, saidos));
    expect(repetido.error).toBeNull();
    expect((repetido.data as unknown as { lancamentos: unknown[] }).lancamentos).toEqual([]);
  });

  it("Excluir só a conta: as parcelas ficam; a Conta excluída não materializa, não salva de novo e não se altera", async () => {
    const bomb = nova(bombinhas({ nome: "Bomb So Conta" }));
    expect((await salvar(a.cliente, bomb)).error).toBeNull();
    const lido = await ler(a.cliente, bomb.id);
    const plano = planoDeExcluirConta(lido.salva, false, lido.entrada);
    expect(plano.pedido.excluir).toEqual([]);
    expect((await excluirRpc(a.cliente, plano.pedido)).error).toBeNull();
    expect(await vivas(bomb.id)).toHaveLength(6);

    // Salvar com o mesmo id (resposta perdida, pedido repetido) não a traz de volta.
    expect((await salvar(a.cliente, bomb)).error?.message).toBe("conta.nao_encontrada");
    expect((await contaDoBanco(bomb.id)).excluido_em).not.toBeNull();
    // Alterar a Conta excluída é recusado.
    const nv = nova(bombinhas({ nome: "Bomb So Conta", observacao: "x" }), bomb.id, lido.salva);
    const pa = planoDeAlterarConta(lido.salva, nv, lido.serie, lido.entrada);
    if (!pa.ok) throw new Error("plano");
    expect((await alterarRpc(a.cliente, pa.pedido)).error?.message).toBe("conta.nao_encontrada");
  });

  it("o materializador e o cron ignoram a Conta excluída, mesmo com as parcelas calculadas antes da exclusão", async () => {
    const s = nova(silvia({ nome: "Cron Exclui", comecaEm: "2026-11" }));
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const cadastro = await contaDoBanco(s.id);
    // O pedido que o cron calculou ANTES de Rafael excluir (Mês atual Dez/26: pede até Dez/27).
    const velho = pedidoMaterializar(
      [{ ...(cadastro as unknown as Parameters<typeof pedidoMaterializar>[0][number]), atualizada_em: cadastro.updated_at }],
      "2027-12",
    );
    expect(velho.p_parcelas.at(-1)!.mes).toBe("2027-12");
    expect((await excluirRpc(a.cliente, { conta_id: s.id, excluir: [], mes_atual: MES })).error).toBeNull();

    const r = await local.admin.rpc("materializar_contas_manuais_do_dono", {
      p_owner_id: a.id,
      p_ate_mes: velho.p_ate_mes,
      p_parcelas: velho.p_parcelas as unknown as Json,
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    // O cron de verdade (a leitura filtra `excluido_em`): nada de Dez/27.
    const cron = await materializarContasDoDia(local.admin as unknown as ClienteDoCron, CRON_EM_DEZEMBRO);
    expect(cron.ok).toBe(true);
    expect((await vivas(s.id)).map((m) => m.mes)).not.toContain("2027-12");
    // O Desfazer traz a Conta de volta e o cron volta a cuidar dela.
    expect((await restaurarRpc(a.cliente, pedidoRestaurarConta(s.id, []))).error).toBeNull();
    await materializarContasDoDia(local.admin as unknown as ClienteDoCron, CRON_EM_DEZEMBRO);
    expect((await vivas(s.id)).map((m) => m.mes)).toContain("2027-12");
    // O plano do cron conta a Conta excluída à parte, sem tratá-la como defeito.
    const lidas = (await local.admin.from("contas_manuais").select("id, owner_id, valor_centavos, mes_inicial, repeticao, parcela_total, divisao, encerrada_em_mes, excluido_em, updated_at").eq("id", s.id)).data!;
    expect(planoDoCron([{ ...lidas[0], excluido_em: "2026-12-01T00:00:00+00:00" }], "2026-12")).toMatchObject({ excluidas: 1, ilegiveis: 0, pedidos: [] });
  });

  it("corrida: as parcelas calculadas de uma Conta que mudou depois são ignoradas; recalculadas com a versão nova, gravam", async () => {
    const s = nova(silvia({ nome: "Versao", comecaEm: "2026-11" }));
    expect((await salvar(a.cliente, s)).error).toBeNull();
    const lida = await contaDoBanco(s.id);
    const cadastro = lida as unknown as Parameters<typeof pedidoMaterializar>[0][number];
    const bom = pedidoMaterializar([{ ...cadastro, atualizada_em: lida.updated_at }], "2027-12");
    const criou = await local.admin.rpc("materializar_contas_manuais_do_dono", {
      p_owner_id: a.id,
      p_ate_mes: bom.p_ate_mes,
      p_parcelas: bom.p_parcelas as unknown as Json,
    });
    expect(criou.error).toBeNull();
    expect(criou.data as unknown[]).toHaveLength(1); // Dez/27

    await local.admin.from("contas_manuais").update({ observacao: "mudou" }).eq("id", s.id);
    const velho = pedidoMaterializar([{ ...cadastro, atualizada_em: lida.updated_at }], "2028-01");
    const ignorada = await local.admin.rpc("materializar_contas_manuais_do_dono", {
      p_owner_id: a.id,
      p_ate_mes: velho.p_ate_mes,
      p_parcelas: velho.p_parcelas as unknown as Json,
    });
    expect(ignorada.error).toBeNull();
    expect(ignorada.data).toEqual([]);

    const nova_ = await contaDoBanco(s.id);
    const atual = pedidoMaterializar([{ ...(nova_ as unknown as Parameters<typeof pedidoMaterializar>[0][number]), atualizada_em: nova_.updated_at }], "2028-01");
    const grava = await local.admin.rpc("materializar_contas_manuais_do_dono", {
      p_owner_id: a.id,
      p_ate_mes: atual.p_ate_mes,
      p_parcelas: atual.p_parcelas as unknown as Json,
    });
    expect(grava.error).toBeNull();
    expect(grava.data as unknown[]).toHaveLength(1); // Jan/28
  });

  it("Tipo citado só por uma Conta excluída: excluir exige substituto (a FK vale) e a troca chega a ela", async () => {
    const tipoSo = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Só da excluída" }).select().single()).data!.id;
    const s = avaliarFormularioConta(
      `00000000-0000-4000-a000-${String(++seq).padStart(12, "0")}`,
      silvia({ nome: "Presa", comecaEm: "2026-11", tipo_id: tipoSo }),
      { ...contexto(), tiposAtivos: new Set([tipoSo]) },
    ).conta as NovaConta;
    expect((await salvar(a.cliente, s)).error).toBeNull();
    expect((await excluirRpc(a.cliente, { conta_id: s.id, excluir: [], mes_atual: MES })).error).toBeNull();
    expect((await a.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: tipoSo })).error?.message).toBe("cadastro.em_uso");
    expect((await a.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: tipoSo, para_id: saude })).error).toBeNull();
    expect((await contaDoBanco(s.id)).tipo_id).toBe(saude);
    // Desfazer a exclusão devolve a Conta já com o substituto.
    expect((await restaurarRpc(a.cliente, pedidoRestaurarConta(s.id, []))).error).toBeNull();
    expect((await contaDoBanco(s.id)).excluido_em).toBeNull();
  });

  // O Realtime: o outro aparelho recebe a Conta excluída (UPDATE com `excluido_em`), o Desfazer
  // (UPDATE com nulo) e as linhas que mudaram. `esperarEvento` repete a gravação a cada 2 s:
  // cada tentativa grava uma Conta nova (repetir a mesma não gera evento).
  it("Realtime: excluir e desfazer chegam ao outro aparelho do mesmo dono (a lista e o Painel)", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const ids = new Set<string>();
    try {
      const excluida = await esperarEvento<{ id: string; excluido_em: string | null }>(
        outro,
        "contas_manuais",
        "UPDATE",
        (c) => ids.has(c.id) && c.excluido_em !== null,
        async (tentativa) => {
          const conta = nova(silvia({ nome: `Realtime Exclui ${tentativa}`, comecaEm: "2026-11" }));
          ids.add(conta.id);
          await salvar(a.cliente, conta);
          const lido = await ler(a.cliente, conta.id);
          return excluirRpc(a.cliente, planoDeExcluirConta(lido.salva, true, lido.entrada).pedido);
        },
      );
      expect(ids.has(excluida.id)).toBe(true);

      const alvo = excluida.id;
      const restaurada = await esperarEvento<{ id: string; excluido_em: string | null }>(
        outro,
        "contas_manuais",
        "UPDATE",
        (c) => c.id === alvo && c.excluido_em === null,
        // Cada tentativa exclui e restaura de novo (restaurar a mesma Conta já viva não gera evento).
        async () => {
          const lido = await ler(a.cliente, alvo);
          const r = await excluirRpc(a.cliente, planoDeExcluirConta(lido.salva, false, lido.entrada).pedido);
          if (r.error) return r;
          return restaurarRpc(a.cliente, pedidoRestaurarConta(alvo, []));
        },
      );
      expect(restaurada.id).toBe(alvo);
    } finally {
      await outro.removeAllChannels();
    }
  }, 40_000);

  it("Realtime: as linhas que Editar exclui e cria chegam ao outro aparelho", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const contas: string[] = [];
    try {
      const evento = await esperarEvento<{ id: string; conta_manual_id: string | null; excluido_em: string | null }>(
        outro,
        "lancamentos",
        "UPDATE",
        (l) => l.conta_manual_id !== null && contas.includes(l.conta_manual_id) && l.excluido_em !== null,
        async (tentativa) => {
          const conta = nova(silvia({ nome: `Realtime Edita ${tentativa}`, comecaEm: "2026-11" }));
          contas.push(conta.id);
          await salvar(a.cliente, conta);
          return (await alterar(a.cliente, conta.id, silvia({ nome: `Realtime Edita ${tentativa}`, comecaEm: "2026-11", valor: "123,00" }))).resposta;
        },
      );
      expect(contas).toContain(evento.conta_manual_id);
    } finally {
      await outro.removeAllChannels();
    }
  }, 40_000);
});
