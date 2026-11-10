// Prova, contra o Supabase local (CI), as gravações do painel do Lançamento
// (História 2.7, `lancamentos-repo.ts`): inclusão à mão (correção da Fatura
// com `ordem_fatura` nulo), atualização de uma coluna com `editado_em`,
// exclusão lógica e "Desfazer", e o RLS de outro dono.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { reconhecerAjustes } from "../../src/domain/ajustes";
import { FILTRO_OR_DA_FILA } from "../../src/data/realtime";
import { LIMITE_AJUSTE_PADRAO_CENTAVOS } from "../../src/domain/configuracoes";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("lancamentos (painel) no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let faturaId: string;
  let id: string;

  beforeAll(async () => {
    local = supabaseLocal("lancamentos");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const { error } = await a.cliente.rpc("importar_fatura", {
      dados_fatura: {
        mes: "2026-10",
        vencimento: "2026-10-06",
        fechamento: null,
        total_despesas_centavos: 1000,
        total_creditos_centavos: 0,
        saldo_anterior_centavos: null,
        pagamentos_centavos: null,
        total_a_pagar_centavos: null,
      } as unknown as Json,
      dados_cartoes: [{ final: "8673", total_centavos: 1000 }] as unknown as Json,
      dados_lancamentos: [
        {
          nome: "PADARIA",
          nome_normalizado: "PADARIA",
          valor_centavos: 1000,
          data: "2026-09-10",
          parcela_n: null,
          parcela_total: null,
          final_cartao: "8673",
          ordem_fatura: 1,
          duvida_extracao: false,
        },
      ] as unknown as Json,
    });
    expect(error).toBeNull();
    const { data: fatura } = await a.cliente.from("faturas").select("id").eq("mes", "2026-10").single();
    faturaId = fatura!.id;
  });

  afterAll(async () => {
    await local.limpar();
  });

  it("inclusão à mão com fatura_id e final_cartao, sem ordem_fatura: aceita; owner_id do auth.uid()", async () => {
    const { data, error } = await a.cliente
      .from("lancamentos")
      .insert({
        nome: "AJUSTE",
        nome_normalizado: "AJUSTE",
        valor_centavos: 1000,
        data: null,
        apelido: null,
        observacao: null,
        responsavel_id: null,
        tipo_id: null,
        status_id: null,
        lancado_por: "manual",
        mes: "2026-10",
        fatura_id: faturaId,
        final_cartao: "8673",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.owner_id).toBe(a.id);
    expect(data!.ordem_fatura).toBeNull();
    expect(data!.lancado_por).toBe("manual");
    id = data!.id;
  });

  it("atualiza uma coluna com editado_em; exclui e restaura pelo excluido_em", async () => {
    const editado = "2026-11-08T00:14:00.000Z";
    const { data: atualizada, error } = await a.cliente
      .from("lancamentos")
      .update({ apelido: "Correção", editado_em: editado })
      .eq("id", id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(atualizada!.apelido).toBe("Correção");
    expect(Date.parse(atualizada!.editado_em!)).toBe(Date.parse(editado));
    expect(atualizada!.valor_centavos).toBe(1000);

    const { data: excluida, error: erroExcluir } = await a.cliente
      .from("lancamentos")
      .update({ excluido_em: editado })
      .eq("id", id)
      .select()
      .single();
    expect(erroExcluir).toBeNull();
    expect(excluida!.excluido_em).not.toBeNull();

    const { data: restaurada, error: erroRestaurar } = await a.cliente
      .from("lancamentos")
      .update({ excluido_em: null })
      .eq("id", id)
      .select()
      .single();
    expect(erroRestaurar).toBeNull();
    expect(restaurada!.id).toBe(id);
    expect(restaurada!.excluido_em).toBeNull();
  });

  it("RLS: outro dono não altera a linha", async () => {
    const { data } = await b.cliente.from("lancamentos").update({ apelido: "Invasão" }).eq("id", id).select();
    expect(data).toEqual([]);
    const { data: linha } = await local.admin.from("lancamentos").select("apelido").eq("id", id).single();
    expect(linha!.apelido).toBe("Correção");
  });

  // História 3.2: `revisado_em` nasce nulo; o dono o grava ao sair da fila e
  // o limpa ao voltar; outro dono não o altera.
  it("revisado_em é nulo por padrão; o dono grava e limpa; RLS de outro dono", async () => {
    const { data: nova } = await a.cliente.from("lancamentos").select("revisado_em").eq("id", id).single();
    expect(nova!.revisado_em).toBeNull();

    const quando = "2026-11-12T00:14:00.000Z";
    const { data: revisada, error } = await a.cliente
      .from("lancamentos")
      .update({ revisado_em: quando, revisao_motivo: null, revisao_dados: null })
      .eq("id", id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(Date.parse(revisada!.revisado_em!)).toBe(Date.parse(quando));

    const { data: alheia } = await b.cliente.from("lancamentos").update({ revisado_em: null }).eq("id", id).select();
    expect(alheia).toEqual([]);
    const { data: guardada } = await local.admin.from("lancamentos").select("revisado_em").eq("id", id).single();
    expect(Date.parse(guardada!.revisado_em!)).toBe(Date.parse(quando));

    const { data: devolvida } = await a.cliente
      .from("lancamentos")
      .update({ revisao_motivo: "sem_classificacao", revisado_em: null })
      .eq("id", id)
      .select()
      .single();
    expect(devolvida!.revisado_em).toBeNull();
    expect(devolvida!.revisao_motivo).toBe("sem_classificacao");
  });
});

// Ajustes de centavos (História 2.8): `ajuste_de_id` com a chave composta
// por dono e o check, a gravação de várias linhas numa requisição
// (`update … in (ids)`) sob o RLS, e o vínculo dos créditos já gravados
// (`vincular_ajustes_gravados`, a regra do núcleo em SQL) com os mesmos pares
// de `reconhecerAjustes`.
describe.skipIf(!ligado)("Ajustes de centavos no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let c: Usuario;
  let d: Usuario;
  type Linha = {
    id: string;
    nome_normalizado: string;
    valor_centavos: number;
    parcela_n: number | null;
    final_cartao: string | null;
    ordem_fatura: number | null;
    fatura_id: string | null;
    ajuste_de_id: string | null;
    tipo_id: string | null;
    responsavel_id: string | null;
  };

  const linha = (
    nome: string,
    valor: number,
    ordem: number,
    final: string,
    parcela: [number, number] | null = null,
  ) => ({
    nome,
    nome_normalizado: nome,
    valor_centavos: valor,
    data: "2026-09-04",
    parcela_n: parcela?.[0] ?? null,
    parcela_total: parcela?.[1] ?? null,
    final_cartao: final,
    ordem_fatura: ordem,
    duvida_extracao: false,
    // Como os créditos gravados antes da 2.8: sem a ordem da mãe.
    ajuste_de_ordem: null,
  });

  async function importarSemAjuste(cliente: Usuario["cliente"], mes: string, lancamentos: ReturnType<typeof linha>[]) {
    const despesas = lancamentos.filter((l) => l.valor_centavos > 0).reduce((s, l) => s + l.valor_centavos, 0);
    const creditos = lancamentos.filter((l) => l.valor_centavos < 0).reduce((s, l) => s - l.valor_centavos, 0);
    const { data, error } = await cliente.rpc("importar_fatura", {
      dados_fatura: {
        mes,
        vencimento: `${mes}-06`,
        fechamento: null,
        total_despesas_centavos: despesas,
        total_creditos_centavos: creditos,
        saldo_anterior_centavos: null,
        pagamentos_centavos: null,
        total_a_pagar_centavos: null,
      } as unknown as Json,
      dados_cartoes: [] as unknown as Json,
      dados_lancamentos: lancamentos as unknown as Json,
    });
    expect(error).toBeNull();
    return (data as unknown as { lancamentos: Linha[] }).lancamentos;
  }

  beforeAll(async () => {
    local = supabaseLocal("ajustes");
    c = await local.criarUsuario("c");
    d = await local.criarUsuario("d");
  });

  afterAll(async () => {
    await local.limpar();
  });

  it("FK por dono e check: Ajuste de linha de outro dono ou de si mesmo é recusado", async () => {
    const [deC] = await importarSemAjuste(c.cliente, "2026-01", [linha("MSC CRUZEIROS", 114074, 1, "5061", [2, 12])]);
    const [deD] = await importarSemAjuste(d.cliente, "2026-01", [linha("MSC CRUZEIROS", -8, 1, "5061")]);
    const outroDono = await d.cliente.from("lancamentos").update({ ajuste_de_id: deC.id }).eq("id", deD.id).select();
    expect(outroDono.error).not.toBeNull();
    const siMesmo = await d.cliente.from("lancamentos").update({ ajuste_de_id: deD.id }).eq("id", deD.id).select();
    expect(siMesmo.error).not.toBeNull();
  });

  it("update … in (ids): mãe e Ajuste numa requisição; o RLS deixa de fora a linha de outro dono", async () => {
    const [mae, ajuste] = await importarSemAjuste(c.cliente, "2026-02", [
      linha("MSC CRUZEIROS", 114074, 1, "5061", [2, 12]),
      linha("MSC CRUZEIROS", -8, 2, "5061"),
    ]);
    const { data: tipo } = await c.cliente.from("tipos").insert({ nome: "Viagem" }).select().single();
    const { data: deD } = await local.admin.from("lancamentos").select("id, tipo_id").eq("owner_id", d.id).limit(1).single();
    const { data, error } = await c.cliente
      .from("lancamentos")
      .update({ tipo_id: tipo!.id, editado_em: "2026-11-09T12:00:00Z" })
      .in("id", [mae.id, ajuste.id, deD!.id])
      .select();
    expect(error).toBeNull();
    expect(data!.map((l) => l.id).sort()).toEqual([mae.id, ajuste.id].sort());
    expect(data!.every((l) => l.tipo_id === tipo!.id)).toBe(true);
    const { data: intocada } = await local.admin.from("lancamentos").select("tipo_id").eq("id", deD!.id).single();
    expect(intocada!.tipo_id).toBe(deD!.tipo_id);
  });

  it("vincular_ajustes_gravados dá os mesmos pares de reconhecerAjustes e copia Tipo e Responsável da mãe", async () => {
    // Limite 100 (sem configuracoes, o padrão).
    const gravadas = await importarSemAjuste(c.cliente, "2026-03", [
      linha("MSC CRUZEIROS", 114074, 1, "5061", [2, 12]),
      linha("MSC CRUZEIROS", 9900, 2, "9277", [1, 3]),
      linha("MSC CRUZEIROS", -8, 3, "9277"),
      linha("PADARIA", 2000, 4, "5061"),
      linha("PADARIA", -5, 5, "5061"),
      linha("GISLANE MEZARI", 16668, 6, "5061", [1, 3]),
      linha("GISLANE MEZARI", -100, 7, "5061"),
      linha("GISLANE MEZARI", -150, 8, "5061"),
      linha("AMAZONMKTPLC*KABUMSA", 17510, 9, "9277", [1, 12]),
      linha("AMAZONMKTPLC*KABUMSA", -99, 10, "8673"),
      linha("AMAZONMKTPLC*KABUMSA", -1, 11, "9277"),
    ]);
    // Em outra Fatura: nunca é Ajuste de uma parcela de março.
    await importarSemAjuste(c.cliente, "2026-04", [linha("MSC CRUZEIROS", -8, 1, "9277")]);
    expect(gravadas.every((l) => l.ajuste_de_id === null)).toBe(true);

    const { data: tipo } = await c.cliente.from("tipos").insert({ nome: "Cruzeiro" }).select().single();
    const { data: responsavel } = await c.cliente.from("responsaveis").insert({ nome: "Casal", cor: 1, ordem: 1 }).select().single();
    const maeMsc = gravadas.find((l) => l.ordem_fatura === 2)!;
    await c.cliente.from("lancamentos").update({ tipo_id: tipo!.id, responsavel_id: responsavel!.id }).eq("id", maeMsc.id);

    const { data: antes } = await local.admin
      .from("lancamentos")
      .select("*")
      .eq("owner_id", c.id)
      .is("excluido_em", null)
      // Só os Meses deste teste (os anteriores deixam créditos sem mãe gravada).
      .in("mes", ["2026-03", "2026-04"])
      .order("mes")
      .order("ordem_fatura");
    const doNucleo = reconhecerAjustes(antes!, LIMITE_AJUSTE_PADRAO_CENTAVOS)
      .map((p) => [antes![p.ajuste].id, antes![p.mae].id])
      .sort();

    const { data: n, error } = await local.admin.rpc("vincular_ajustes_gravados", { dono: c.id });
    expect(error).toBeNull();
    const { data: depois } = await local.admin
      .from("lancamentos")
      .select("*")
      .eq("owner_id", c.id)
      .in("mes", ["2026-03", "2026-04"])
      .not("ajuste_de_id", "is", null);
    const doSql = depois!.map((l) => [l.id, l.ajuste_de_id!]).sort();
    expect(doSql).toEqual(doNucleo);
    // A função vincula todos os Meses do dono (fevereiro também, do teste anterior).
    expect(n).toBeGreaterThanOrEqual(doNucleo.length);
    // Março: MSC no cartão 9277 (a mãe do mesmo cartão), KABUMSA -99 (outro
    // cartão) e -1; abril não tem mãe.
    expect(doNucleo).toHaveLength(3);

    const ajusteMsc = depois!.find((l) => l.ajuste_de_id === maeMsc.id)!;
    expect(ajusteMsc.valor_centavos).toBe(-8);
    expect(ajusteMsc.tipo_id).toBe(tipo!.id);
    expect(ajusteMsc.responsavel_id).toBe(responsavel!.id);

    // O app não chama a função (só a migração e este teste): um crédito
    // desvinculado nunca é reconhecido de novo.
    const { error: erroApp } = await c.cliente.rpc("vincular_ajustes_gravados", { dono: c.id });
    expect(erroApp).not.toBeNull();
  });

  it("vincular_ajustes_gravados usa o limite de configuracoes (R$ 2,00): os mesmos pares de reconhecerAjustes(antes, 200)", async () => {
    // Dono próprio: o limite mudado não vale para os outros testes.
    const e = await local.criarUsuario("e");
    const { error: erroCfg } = await e.cliente
      .from("configuracoes")
      .upsert({ limite_ajuste_centavos: 200 }, { onConflict: "owner_id" });
    expect(erroCfg).toBeNull();
    await importarSemAjuste(e.cliente, "2026-03", [
      linha("MSC CRUZEIROS", 114074, 1, "5061", [2, 12]),
      linha("MSC CRUZEIROS", -150, 2, "5061"),
      linha("MSC CRUZEIROS", -250, 3, "5061"),
    ]);
    const { data: antes } = await local.admin
      .from("lancamentos")
      .select("*")
      .eq("owner_id", e.id)
      .order("ordem_fatura");
    const doNucleo = reconhecerAjustes(antes!, 200)
      .map((p) => [antes![p.ajuste].id, antes![p.mae].id])
      .sort();
    // - R$ 1,50 só é Ajuste com o limite de R$ 2,00.
    expect(doNucleo).toHaveLength(1);
    expect(reconhecerAjustes(antes!, LIMITE_AJUSTE_PADRAO_CENTAVOS)).toEqual([]);

    const { data: n, error } = await local.admin.rpc("vincular_ajustes_gravados", { dono: e.id });
    expect(error).toBeNull();
    expect(n).toBe(1);
    const { data: depois } = await local.admin
      .from("lancamentos")
      .select("*")
      .eq("owner_id", e.id)
      .not("ajuste_de_id", "is", null);
    expect(depois!.map((l) => [l.id, l.ajuste_de_id!]).sort()).toEqual(doNucleo);
    expect(depois![0].valor_centavos).toBe(-150);
  });

  // História 3.2: a leitura do gerenciador da fila (`.is("excluido_em", null)` e
  // `.or(FILTRO_OR_DA_FILA)`, sem filtrar o Mês) traz a linha com motivo e o
  // Ajuste (que acompanha a mãe), e não traz a linha sem motivo nem a excluída.
  it("leitura da fila: traz a linha com motivo e o Ajuste; não traz a sem motivo nem a excluída", async () => {
    const [mae, ajuste, comum, excluida] = await importarSemAjuste(c.cliente, "2026-05", [
      linha("MSC CRUZEIROS", 114074, 1, "5061", [2, 12]),
      linha("MSC CRUZEIROS", -8, 2, "5061"),
      linha("PADARIA", 1000, 3, "5061"),
      linha("FARMACIA", 2000, 4, "5061"),
    ]);
    try {
      const gravar = async (id: string, corpo: object) => {
        const { error } = await c.cliente.from("lancamentos").update(corpo).eq("id", id);
        expect(error).toBeNull();
      };
      await gravar(mae.id, { revisao_motivo: "sugestao" });
      await gravar(ajuste.id, { ajuste_de_id: mae.id });
      await gravar(excluida.id, { revisao_motivo: "sem_classificacao", excluido_em: "2026-11-12T00:00:00Z" });
      // `comum` fica sem motivo.

      const { data, error } = await c.cliente.from("lancamentos").select("*").is("excluido_em", null).or(FILTRO_OR_DA_FILA);
      expect(error).toBeNull();
      const ids = data!.map((l) => l.id);
      expect(ids).toContain(mae.id);
      expect(ids).toContain(ajuste.id);
      expect(ids).not.toContain(comum.id);
      expect(ids).not.toContain(excluida.id);
    } finally {
      await local.admin.from("lancamentos").delete().in("id", [mae.id, ajuste.id, comum.id, excluida.id]);
    }
  });
});
