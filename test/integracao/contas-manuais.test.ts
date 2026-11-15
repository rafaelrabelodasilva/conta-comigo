// Prova, contra o Supabase local (CI), o cadastro de uma Conta manual (História
// 5.1, FR-16, FR-17, AD-1, AD-8, AD-15): a RPC `salvar_conta_manual` cria a
// Conta, a Série e as parcelas só com o que o núcleo calculou. A Bombinhas
// (6 parcelas de R$ 318,00 em três partes de R$ 106,00, de Jul/26 a Dez/26),
// salvar de novo sem duplicar (`on conflict (serie_id, parcela_n) ... do
// nothing`), a recorrente que conta `parcela_n` desde o Mês inicial, duas
// Contas idênticas (`ocorrencia`), a Divisão com arredondamento, o horizonte,
// o isolamento por dono, a troca de Tipo e Responsável (`REFERENCIAS_JSONB`) e
// o Realtime entre aparelhos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import {
  avaliarFormularioConta,
  horizonteDasContas,
  pedidoMaterializar,
  pedidoSalvarConta,
  proximaOcorrencia,
  type ContaManual,
  type NovaConta,
  type RascunhoDaConta,
} from "../../src/domain/contas-manuais";
import { esperarEvento, ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

const MES_ATUAL = "2026-11";

describe.skipIf(!ligado)("Contas manuais no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let mae: string;
  let casal: string;
  let lucas: string;
  let rafael: string;
  let viagem: string;
  let saude: string;
  let seq = 0;

  beforeAll(async () => {
    local = supabaseLocal("contas");
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

  function nova(r: RascunhoDaConta): NovaConta {
    const av = avaliarFormularioConta(`00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, r, {
      mesAtual: MES_ATUAL,
      tiposAtivos: new Set([viagem, saude]),
      responsaveisAtivos: new Set([mae, casal, lucas, rafael]),
    });
    expect(av.erros).toEqual({});
    return av.conta as NovaConta;
  }

  /** Lê as ocorrencia das Séries da mesma chave (como o repositório) e salva. */
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
    const pedido = pedidoSalvarConta(conta, ocorrencia, horizonteDasContas(MES_ATUAL));
    return cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: pedido.p_ate_mes,
    });
  }

  const maes = (contaId: string) =>
    local.admin
      .from("lancamentos")
      .select("*")
      .eq("conta_manual_id", contaId)
      .is("dividido_de_id", null)
      .is("excluido_em", null)
      .order("parcela_n");
  const filhas = (contaId: string) =>
    local.admin.from("lancamentos").select("*").eq("conta_manual_id", contaId).not("dividido_de_id", "is", null);

  it("Bombinhas: Jul/26 a Dez/26, cada Mês com a parcela n/6 de R$ 318,00 e três filhas de R$ 106,00", async () => {
    const conta = nova(bombinhas());
    const { data, error } = await salvar(a.cliente, conta);
    expect(error).toBeNull();
    const resposta = data as unknown as { conta: { id: string }; lancamentos: { dividido_de_id: string | null }[] };
    expect(resposta.conta.id).toBe(conta.id);
    // 6 mães + 18 filhas.
    expect(resposta.lancamentos).toHaveLength(24);

    const { data: linhas } = await maes(conta.id);
    expect(linhas!.map((l) => [l.parcela_n, l.mes])).toEqual([
      [1, "2026-07"],
      [2, "2026-08"],
      [3, "2026-09"],
      [4, "2026-10"],
      [5, "2026-11"],
      [6, "2026-12"],
    ]);
    for (const l of linhas!) {
      expect(l).toMatchObject({
        nome: "Bombinhas",
        valor_centavos: 31_800,
        parcela_total: 6,
        lancado_por: "manual",
        tipo_id: viagem,
        responsavel_id: null,
        // Já classificada: nunca passa pelo Revisar.
        revisao_motivo: null,
        fatura_id: null,
        ordem_fatura: null,
      });
      expect((l.divisao as { partes: unknown[] }).partes).toHaveLength(3);
      const { data: partes } = await local.admin.from("lancamentos").select("*").eq("dividido_de_id", l.id).order("created_at");
      expect(partes!.map((p) => p.valor_centavos)).toEqual([10_600, 10_600, 10_600]);
      expect(partes!.map((p) => p.responsavel_id).sort()).toEqual([mae, casal, lucas].sort());
      expect(partes!.every((p) => p.conta_manual_id === conta.id && p.mes === l.mes && p.tipo_id === viagem)).toBe(true);
      // A mãe grava o `filha_id` de cada parte.
      expect((l.divisao as { partes: { filha_id?: string }[] }).partes.every((p) => typeof p.filha_id === "string")).toBe(true);
    }
    expect((await filhas(conta.id)).data).toHaveLength(18);

    // Uma Série por Conta, com a chave do AD-8.
    const { data: series } = await local.admin.from("series").select("*").eq("conta_manual_id", conta.id);
    expect(series).toHaveLength(1);
    expect(series![0]).toMatchObject({
      nome_normalizado: "BOMBINHAS",
      parcela_total: 6,
      valor_parcela_centavos: 31_800,
      mes_primeira_parcela: "2026-07",
      ocorrencia: 1,
    });
    expect(new Set(linhas!.map((l) => l.serie_id))).toEqual(new Set([series![0].id]));
  });

  it("salvar de novo (o mesmo id) e materializar de novo não duplicam nada", async () => {
    const conta = nova(bombinhas({ nome: "Bombinhas 2", valor: "318,00" }));
    const primeira = await salvar(a.cliente, conta);
    expect(primeira.error).toBeNull();
    const segunda = await salvar(a.cliente, conta);
    expect(segunda.error).toBeNull();
    expect((segunda.data as unknown as { lancamentos: unknown[] }).lancamentos).toEqual([]);
    expect((await maes(conta.id)).data).toHaveLength(6);
    expect((await filhas(conta.id)).data).toHaveLength(18);
    expect((await local.admin.from("contas_manuais").select("id").eq("id", conta.id)).data).toHaveLength(1);
    expect((await local.admin.from("series").select("id").eq("conta_manual_id", conta.id)).data).toHaveLength(1);

    const cadastro = (await local.admin.from("contas_manuais").select("*").eq("id", conta.id).single()).data!;
    const pedido = pedidoMaterializar([{ ...(cadastro as unknown as ContaManual) }], horizonteDasContas(MES_ATUAL));
    const de_novo = await a.cliente.rpc("materializar_contas_manuais", {
      p_ate_mes: pedido.p_ate_mes,
      p_parcelas: pedido.p_parcelas as unknown as Json,
    });
    expect(de_novo.error).toBeNull();
    expect(de_novo.data).toEqual([]);
    expect((await maes(conta.id)).data).toHaveLength(6);
  });

  it("uma parcela excluída em lógico deixa o `n` livre, e a próxima materialização o preenche", async () => {
    // O índice único é parcial (só linhas não excluídas): a parcela excluída em lógico deixa o `n` livre
    // e a próxima materialização a recria. A 5.4 decide como "Excluir" fica (aviso "Excluído · Desfazer").
    const conta = nova(bombinhas({ nome: "Bombinhas 3" }));
    expect((await salvar(a.cliente, conta)).error).toBeNull();
    const [primeira] = (await maes(conta.id)).data!;
    await local.admin.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", primeira.id);
    expect((await maes(conta.id)).data).toHaveLength(5);
    expect((await salvar(a.cliente, conta)).error).toBeNull();
    expect((await maes(conta.id)).data).toHaveLength(6);
  });

  it("recorrente: parcela_n conta desde o Mês inicial, sem parcela_total, e pára no Mês atual + 12", async () => {
    const conta = nova({
      nome: "Silvia",
      valor: "400,00",
      repeticao: "mensal",
      parcelas: "",
      comecaEm: "2026-01",
      tipo_id: saude,
      observacao: "plano",
      partes: [{ responsavel_id: rafael, texto: "" }],
    });
    const { error } = await salvar(a.cliente, conta);
    expect(error).toBeNull();
    const { data: linhas } = await maes(conta.id);
    expect(linhas).toHaveLength(23);
    expect(linhas![0]).toMatchObject({ parcela_n: 1, mes: "2026-01", parcela_total: null, responsavel_id: rafael, divisao: null, observacao: "plano" });
    expect(linhas!.find((l) => l.mes === MES_ATUAL)?.parcela_n).toBe(11);
    expect(linhas!.at(-1)).toMatchObject({ parcela_n: 23, mes: "2027-11" });
    expect((await filhas(conta.id)).data).toHaveLength(0);
    const { data: serie } = await local.admin.from("series").select("*").eq("conta_manual_id", conta.id).single();
    expect(serie).toMatchObject({ parcela_total: null, mes_primeira_parcela: "2026-01", ocorrencia: 1 });
  });

  it("duas Contas idênticas ganham ocorrencia 1 e 2; a mesma chave gravada à força é recusada", async () => {
    const r: RascunhoDaConta = {
      nome: "TVbox",
      valor: "30,00",
      repeticao: "mensal",
      parcelas: "",
      comecaEm: "2026-11",
      tipo_id: saude,
      observacao: "",
      partes: [{ responsavel_id: rafael, texto: "" }],
    };
    const c1 = nova(r);
    const c2 = nova(r);
    expect((await salvar(a.cliente, c1)).error).toBeNull();
    expect((await salvar(a.cliente, c2)).error).toBeNull();
    const ocorrencias = async (id: string) =>
      (await local.admin.from("series").select("ocorrencia").eq("conta_manual_id", id).single()).data!.ocorrencia;
    expect(await ocorrencias(c1.id)).toBe(1);
    expect(await ocorrencias(c2.id)).toBe(2);
    expect((await maes(c1.id)).data).toHaveLength(13);
    expect((await maes(c2.id)).data).toHaveLength(13);

    // Uma terceira que ainda usa a ocorrencia 1 (outra aba salvou no meio): a chave única recusa.
    const c3 = nova(r);
    const pedido = pedidoSalvarConta(c3, 1, horizonteDasContas(MES_ATUAL));
    const { error } = await a.cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: pedido.p_ate_mes,
    });
    expect(error?.message).toBe("conta.serie_ocupada");
    // Nada ficou pela metade: nem a Conta nem as parcelas.
    expect((await local.admin.from("contas_manuais").select("id").eq("id", c3.id)).data).toEqual([]);
    expect((await maes(c3.id)).data).toEqual([]);
  });

  it("Divisão com arredondamento: R$ 100,00 em 33,33 + 33,33 + 33,34, e as filhas somam o Valor da mãe", async () => {
    const conta = nova(
      bombinhas({
        nome: "Cem",
        valor: "100,00",
        repeticao: "mensal",
        parcelas: "",
        comecaEm: "2026-11",
        partes: [
          { responsavel_id: mae, texto: "33,33" },
          { responsavel_id: casal, texto: "33,33" },
          { responsavel_id: lucas, texto: "33,34" },
        ],
      }),
    );
    expect((await salvar(a.cliente, conta)).error).toBeNull();
    const { data: linhas } = await maes(conta.id);
    for (const l of linhas!) {
      const { data: partes } = await local.admin.from("lancamentos").select("responsavel_id, valor_centavos").eq("dividido_de_id", l.id);
      const porResponsavel = new Map(partes!.map((p) => [p.responsavel_id, p.valor_centavos]));
      expect([porResponsavel.get(mae), porResponsavel.get(casal), porResponsavel.get(lucas)]).toEqual([3_333, 3_333, 3_334]);
      expect(partes!.reduce((s, p) => s + p.valor_centavos, 0)).toBe(l.valor_centavos);
    }
  });

  it("recusas do banco: parcela além do horizonte, Conta de outro dono, Conta sem Tipo e valor negativo", async () => {
    const conta = nova(bombinhas({ nome: "Horizonte" }));
    const pedido = pedidoSalvarConta(conta, 1, "2026-12");
    // O pedido leva `p_ate_mes` menor que a última parcela? (dezembro cabe); com outubro, Nov e Dez passam do limite.
    const alem = await a.cliente.rpc("salvar_conta_manual", {
      p_conta: pedido.p_conta as unknown as Json,
      p_parcelas: pedido.p_parcelas as unknown as Json,
      p_ate_mes: "2026-10",
    });
    expect(alem.error?.message).toBe("salvar.falhou");
    expect((await local.admin.from("contas_manuais").select("id").eq("id", conta.id)).data).toEqual([]);

    // B não materializa parcelas da Conta de A.
    const da = nova(bombinhas({ nome: "Da A" }));
    expect((await salvar(a.cliente, da)).error).toBeNull();
    const roubo = pedidoMaterializar([{ ...da, encerrada_em_mes: null }], "2026-12");
    const deB = await b.cliente.rpc("materializar_contas_manuais", {
      p_ate_mes: roubo.p_ate_mes,
      p_parcelas: roubo.p_parcelas as unknown as Json,
    });
    expect(deB.error?.message).toBe("conta.nao_encontrada");

    // As restrições da tabela: valor positivo e Responsável ou Divisão (nunca os dois).
    const base = { owner_id: a.id, nome: "X", tipo_id: saude, mes_inicial: "2026-11", repeticao: "mensal", parcela_total: null };
    expect((await local.admin.from("contas_manuais").insert({ ...base, valor_centavos: -1, responsavel_id: rafael }).select()).error).not.toBeNull();
    expect((await local.admin.from("contas_manuais").insert({ ...base, valor_centavos: 0, responsavel_id: rafael }).select()).error).not.toBeNull();
    expect((await local.admin.from("contas_manuais").insert({ ...base, valor_centavos: 100 }).select()).error).not.toBeNull();
    expect(
      (await local.admin.from("contas_manuais").insert({ ...base, valor_centavos: 100, responsavel_id: rafael, divisao: { modo: "valor", partes: [] } }).select())
        .error,
    ).not.toBeNull();
    // Parcelada sem total, e total sem `parcela_n` no Lançamento.
    expect((await local.admin.from("contas_manuais").insert({ ...base, repeticao: "parcelas", valor_centavos: 100, responsavel_id: rafael }).select()).error).not.toBeNull();
    const semN = await local.admin
      .from("lancamentos")
      .insert({ owner_id: a.id, nome: "Y", nome_normalizado: "Y", valor_centavos: 100, mes: "2026-11", lancado_por: "manual", parcela_total: 6 })
      .select();
    expect(semN.error).not.toBeNull();
  });

  it("isolamento por dono: B não vê as Contas, as Séries nem os Lançamentos de A", async () => {
    const conta = nova(bombinhas({ nome: "Privada" }));
    expect((await salvar(a.cliente, conta)).error).toBeNull();
    expect((await b.cliente.from("contas_manuais").select("id").eq("id", conta.id)).data).toEqual([]);
    expect((await b.cliente.from("series").select("id").eq("conta_manual_id", conta.id)).data).toEqual([]);
    expect((await b.cliente.from("lancamentos").select("id").eq("conta_manual_id", conta.id)).data).toEqual([]);
  });

  it("excluir Tipo ou Responsável em uso por uma Conta exige substituto, e a troca chega à Conta e à Divisão", async () => {
    const tipoTemp = (await local.admin.from("tipos").insert({ owner_id: a.id, nome: "Temporário" }).select().single()).data!.id;
    const respTemp = (await local.admin.from("responsaveis").insert({ owner_id: a.id, nome: "Temporário", cor: 5, ordem: 9 }).select().single()).data!.id;
    // Os cadastros temporários precisam estar ativos para a Conta passar na validação do núcleo.
    const av = avaliarFormularioConta(
      "00000000-0000-4000-8000-0000000000ff",
      bombinhas({ nome: "Troca", tipo_id: tipoTemp, partes: [{ responsavel_id: respTemp, texto: "159,00" }, { responsavel_id: casal, texto: "159,00" }] }),
      {
        mesAtual: MES_ATUAL,
        tiposAtivos: new Set([tipoTemp]),
        responsaveisAtivos: new Set([respTemp, casal]),
      },
    );
    expect(av.erros).toEqual({});
    expect((await salvar(a.cliente, av.conta as NovaConta)).error).toBeNull();

    const semSubstituto = await a.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: tipoTemp });
    expect(semSubstituto.error?.message).toBe("cadastro.em_uso");
    const semSubstitutoResp = await a.cliente.rpc("substituir_cadastro", { cadastro: "responsavel", de_id: respTemp });
    expect(semSubstitutoResp.error?.message).toBe("cadastro.em_uso");

    expect((await a.cliente.rpc("substituir_cadastro", { cadastro: "tipo", de_id: tipoTemp, para_id: saude })).error).toBeNull();
    expect((await a.cliente.rpc("substituir_cadastro", { cadastro: "responsavel", de_id: respTemp, para_id: rafael })).error).toBeNull();

    const { data: c } = await local.admin.from("contas_manuais").select("*").eq("id", av.conta!.id).single();
    expect(c!.tipo_id).toBe(saude);
    expect((c!.divisao as { partes: { responsavel_id: string }[] }).partes.map((p) => p.responsavel_id)).toEqual([rafael, casal]);
    const { data: linhas } = await maes(av.conta!.id);
    expect(linhas!.every((l) => l.tipo_id === saude)).toBe(true);
    expect(
      linhas!.every((l) => (l.divisao as { partes: { responsavel_id: string }[] }).partes.map((p) => p.responsavel_id).join() === [rafael, casal].join()),
    ).toBe(true);
    const { data: partes } = await filhas(av.conta!.id);
    expect(partes!.some((p) => p.responsavel_id === respTemp)).toBe(false);
  });

  /** Uma Conta mensal nova, de Nome único: cada tentativa dos testes de Realtime grava a sua. */
  const mensal = (nome: string) =>
    nova(bombinhas({ nome, repeticao: "mensal", parcelas: "", comecaEm: "2026-11", partes: [{ responsavel_id: mae, texto: "" }] }));

  // `esperarEvento` repete a gravação a cada 2 s até o evento chegar. Salvar de
  // novo a MESMA Conta não gera evento (a RPC é idempotente), então um evento
  // perdido logo depois do SUBSCRIBED nunca mais viria: cada tentativa grava
  // uma Conta nova e o teste aceita qualquer uma delas.
  it("Realtime: salvar a Conta em um aparelho entrega os Lançamentos aos outros aparelhos do mesmo dono", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const ids = new Set<string>();
    try {
      const evento = await esperarEvento<{ id: string; conta_manual_id: string | null; mes: string }>(
        outro,
        "lancamentos",
        "INSERT",
        (l) => l.conta_manual_id !== null && ids.has(l.conta_manual_id),
        (tentativa) => {
          const conta = mensal(`Realtime ${tentativa}`);
          ids.add(conta.id);
          return salvar(a.cliente, conta);
        },
      );
      expect(ids.has(evento.conta_manual_id!)).toBe(true);
    } finally {
      await outro.removeAllChannels();
    }
  }, 40_000);

  // A lista da 5.2 lê `contas_manuais` pelo gerenciador de Realtime: a Conta
  // nova, alterada e apagada em outro aparelho precisa chegar (a tabela está na
  // publicação com `replica identity full`, então o DELETE traz o `id`).
  it("Realtime (5.2): a Conta salva, alterada e apagada chega ao outro aparelho (INSERT, UPDATE e DELETE)", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const ids = new Set<string>();
    try {
      const inserida = await esperarEvento<{ id: string; nome: string; valor_centavos: number }>(
        outro,
        "contas_manuais",
        "INSERT",
        (c) => ids.has(c.id),
        (tentativa) => {
          const conta = mensal(`Lista ${tentativa}`);
          ids.add(conta.id);
          return salvar(a.cliente, conta);
        },
      );
      expect(inserida).toMatchObject({ valor_centavos: 31_800 });
      expect(inserida.nome).toMatch(/^Lista [0-9]+$/);

      const alvo = inserida.id;
      const alterada = await esperarEvento<{ id: string; encerrada_em_mes: string | null; observacao: string | null }>(
        outro,
        "contas_manuais",
        "UPDATE",
        (c) => c.id === alvo,
        (tentativa) =>
          local.admin.from("contas_manuais").update({ encerrada_em_mes: "2027-01", observacao: `t${tentativa}` }).eq("id", alvo),
      );
      expect(alterada.encerrada_em_mes).toBe("2027-01");

      // Cada tentativa de apagar cria e apaga uma Conta nova (a anterior já se foi).
      const apagadas = new Set<string>();
      const apagada = await esperarEvento<{ id: string }>(
        outro,
        "contas_manuais",
        "DELETE",
        (c) => apagadas.has(c.id),
        async (tentativa) => {
          const conta = mensal(`Apagar ${tentativa}`);
          await salvar(a.cliente, conta);
          apagadas.add(conta.id);
          // A Série e os Lançamentos seguram a Conta (a exclusão de verdade é da 5.4).
          await local.admin.from("lancamentos").delete().eq("conta_manual_id", conta.id);
          await local.admin.from("series").delete().eq("conta_manual_id", conta.id);
          return local.admin.from("contas_manuais").delete().eq("id", conta.id);
        },
      );
      expect(apagadas.has(apagada.id)).toBe(true);
    } finally {
      await outro.removeAllChannels();
    }
  }, 40_000);
});
