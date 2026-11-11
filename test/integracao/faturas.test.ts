// Prova, contra o Supabase local (CI), a importação da Fatura (História 2.3):
// a RPC `importar_fatura` grava outubro/2026 (extração gravada em
// test/fixtures, sem Gemini) e devolve as linhas, aplica o Status padrão,
// grava créditos negativos, é tudo ou nada, recusa Mês repetido e Mês que
// mudou, respeita o RLS de outro dono e avisa outro aparelho pelo Realtime.
// História 3.11 (simplificada): com `substituir_fatura_id`, reimporta o Mês
// (apaga a Fatura, os cartões e as linhas dela; manuais e Regras ficam).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
import { somarMeses } from "../../src/domain/ciclo";
import type { Extracao } from "../../src/domain/extracao-fatura";
import { ESPERADO_OUTUBRO_2026, prepararImportacao, type Importacao } from "../../src/domain/importacao-fatura";
import extracaoOutubro from "../fixtures/extracao-2026-10.json";
import { esperarEvento, ligado, supabaseLocal, type Cliente, type Usuario } from "./apoio";

type Gravados = {
  fatura: { id: string; mes: string; owner_id: string };
  removidos: { fatura_id: string; cartoes: string[]; lancamentos: string[] } | null;
  cartoes: { id: string; final: string; total_centavos: number }[];
  lancamentos: {
    id: string;
    ordem_fatura: number;
    valor_centavos: number;
    lancado_por: string;
    status_id: string | null;
    mes: string;
    fatura_id: string;
    nome_normalizado: string;
    data: string;
    ajuste_de_id: string | null;
  }[];
};

function outubro(): Importacao {
  const r = prepararImportacao(extracaoOutubro as Extracao);
  if (!r.ok) throw new Error(r.erro.codigo);
  return r.valor;
}

/** Uma Fatura pequena no Mês dado: a parcela do cruzeiro e o crédito de 8 centavos (Ajuste dela). */
function pequena(mes: string, extra: Partial<Importacao["lancamentos"][number]> = {}): Importacao {
  const linha = {
    nome: "MSC CRUZEIROS",
    nome_normalizado: "MSC CRUZEIROS",
    data: `${mes}-01`,
    final_cartao: "5061",
    duvida_extracao: false,
    tipo_sugerido: null,
    responsavel_id: null,
    tipo_id: null,
    revisao_dados: null,
    serie: null,
  };
  return {
    fatura: {
      mes,
      vencimento: `${mes}-06`,
      fechamento: null,
      total_despesas_centavos: 114074,
      total_creditos_centavos: 8,
      saldo_anterior_centavos: null,
      pagamentos_centavos: null,
      total_a_pagar_centavos: null,
    },
    cartoes: [{ final: "5061", total_centavos: 114074 }],
    lancamentos: [
      {
        ...linha,
        valor_centavos: 114074,
        parcela_n: 2,
        parcela_total: 12,
        ordem_fatura: 1,
        ajuste_de_ordem: null,
        revisao_motivo: "sem_classificacao",
      },
      {
        ...linha,
        valor_centavos: -8,
        parcela_n: null,
        parcela_total: null,
        ordem_fatura: 2,
        ajuste_de_ordem: 1,
        revisao_motivo: null,
        ...extra,
      },
    ],
    previstos: [],
  };
}

function importar(cliente: Cliente, imp: Importacao, lidoEm?: string | null, substituirFaturaId?: string) {
  return cliente.rpc("importar_fatura", {
    dados_fatura: imp.fatura as unknown as Json,
    dados_cartoes: imp.cartoes as unknown as Json,
    dados_lancamentos: imp.lancamentos as unknown as Json,
    ...(lidoEm ? { lancamentos_atualizados_em: lidoEm } : {}),
    ...(substituirFaturaId ? { substituir_fatura_id: substituirFaturaId } : {}),
  });
}

describe.skipIf(!ligado)("importar_fatura no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let c: Usuario;

  beforeAll(async () => {
    local = supabaseLocal("faturas");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    c = await local.criarUsuario("c");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function contar(tabela: "faturas" | "fatura_cartoes" | "lancamentos", dono: string, mes?: string) {
    const filtros: Record<string, string> = { owner_id: dono };
    if (mes) filtros.mes = mes;
    const { count, error } = await local.admin
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .match(filtros);
    expect(error).toBeNull();
    return count ?? 0;
  }

  it("outubro: grava 1 Fatura, 5 cartões e 49 linhas com o Status padrão, e devolve tudo", async () => {
    const { data: status, error: erroStatus } = await a.cliente
      .from("status")
      .insert({ nome: "Não pago" })
      .select()
      .single();
    expect(erroStatus).toBeNull();
    const { error: erroCfg } = await a.cliente
      .from("configuracoes")
      .upsert({ status_padrao_id: status!.id }, { onConflict: "owner_id" });
    expect(erroCfg).toBeNull();

    const { data, error } = await importar(a.cliente, outubro());
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    expect(g.fatura.mes).toBe("2026-10");
    expect(g.fatura.owner_id).toBe(a.id);
    expect(g.cartoes).toHaveLength(5);
    expect(g.cartoes.reduce((s, c) => s + c.total_centavos, 0)).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);
    expect(g.lancamentos).toHaveLength(ESPERADO_OUTUBRO_2026.quantidade);
    expect(g.lancamentos.map((l) => l.ordem_fatura)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
    expect(g.lancamentos.every((l) => l.lancado_por === "fatura" && l.mes === "2026-10" && l.fatura_id === g.fatura.id)).toBe(true);
    expect(g.lancamentos.every((l) => l.status_id === status!.id)).toBe(true);
    const creditos = g.lancamentos.filter((l) => l.valor_centavos < 0);
    expect(creditos.reduce((s, l) => s - l.valor_centavos, 0)).toBe(ESPERADO_OUTUBRO_2026.creditosCentavos);
    const despesas = g.lancamentos.filter((l) => l.valor_centavos > 0);
    expect(despesas.reduce((s, l) => s + l.valor_centavos, 0)).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);

    expect(await contar("faturas", a.id, "2026-10")).toBe(1);
    expect(await contar("lancamentos", a.id, "2026-10")).toBe(49);
  });

  it("crédito \"-0,08\" fica com valor_centavos = -8; sem configurações, Status nulo", async () => {
    const { data, error } = await importar(b.cliente, pequena("2026-08"));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    expect(g.lancamentos.map((l) => l.valor_centavos)).toEqual([114074, -8]);
    expect(g.lancamentos.every((l) => l.status_id === null)).toBe(true);
    expect(g.lancamentos[0].data).toBe("2026-08-01");
  });

  it("Ajuste (História 2.8): a RPC grava o ajuste_de_id da mãe na mesma transação e devolve as linhas com ele", async () => {
    const { data, error } = await importar(b.cliente, pequena("2026-05"));
    expect(error).toBeNull();
    const g = data as unknown as Gravados;
    const [mae, ajuste] = g.lancamentos;
    expect(mae.ajuste_de_id).toBeNull();
    expect(ajuste.ajuste_de_id).toBe(mae.id);
    const { data: lida } = await b.cliente.from("lancamentos").select("ajuste_de_id").eq("id", ajuste.id).single();
    expect(lida!.ajuste_de_id).toBe(mae.id);
  });

  it("outubro não tem Ajuste: nenhuma linha com ajuste_de_id", async () => {
    const { data } = await local.admin.from("lancamentos").select("ajuste_de_id").eq("owner_id", a.id).eq("mes", "2026-10");
    expect(data).toHaveLength(ESPERADO_OUTUBRO_2026.quantidade);
    expect(data!.every((l) => l.ajuste_de_id === null)).toBe(true);
  });

  it("Mês que já tem Fatura, sem confirmar a substituição: recusa com fatura.mes_ja_importado e não grava nada", async () => {
    const antes = await contar("lancamentos", a.id);
    const { error } = await importar(a.cliente, outubro());
    expect(error?.message).toBe("fatura.mes_ja_importado");
    expect(await contar("lancamentos", a.id)).toBe(antes);
    expect(await contar("faturas", a.id, "2026-10")).toBe(1);
  });

  it("a restrição única do Mês se chama faturas_owner_id_mes_key (a RPC traduz pelo nome)", async () => {
    const repetida = {
      mes: "2026-10",
      vencimento: "2026-10-06",
      total_despesas_centavos: 1,
      total_creditos_centavos: 0,
    };
    const { error } = await a.cliente.from("faturas").insert(repetida);
    expect(error?.message).toContain("faturas_owner_id_mes_key");
  });

  it("duas importações novas do mesmo Mês ao mesmo tempo: uma grava, a outra fatura.mes_ja_importado", async () => {
    const [um, dois] = await Promise.all([importar(c.cliente, pequena("2026-04")), importar(c.cliente, pequena("2026-04"))]);
    const erros = [um.error?.message ?? null, dois.error?.message ?? null].sort();
    expect(erros).toEqual(["fatura.mes_ja_importado", null].sort());
    expect(await contar("faturas", c.id, "2026-04")).toBe(1);
    expect(await contar("lancamentos", c.id, "2026-04")).toBe(2);
  });

  describe("reimportar um Mês (História 3.11)", () => {
    const MES = "2026-11";
    let primeira: Gravados;
    let manual: { id: string; updated_at: string };
    let regras: number;

    async function ultimaDoMes(): Promise<string> {
      const { data, error } = await c.cliente
        .from("lancamentos")
        .select("updated_at")
        .eq("mes", MES)
        .order("updated_at", { ascending: false })
        .limit(1);
      expect(error).toBeNull();
      return data![0].updated_at;
    }

    beforeAll(async () => {
      const { data, error } = await importar(c.cliente, pequena(MES));
      expect(error).toBeNull();
      primeira = data as unknown as Gravados;
      expect(primeira.removidos).toBeNull();
      const { data: m, error: erroManual } = await c.cliente
        .from("lancamentos")
        .insert({ nome: "Conta de luz", nome_normalizado: "CONTA DE LUZ", valor_centavos: 15000, mes: MES, lancado_por: "manual" })
        .select("id, updated_at")
        .single();
      expect(erroManual).toBeNull();
      manual = m!;
      // Rafael marcou a parcela e excluiu o Ajuste.
      const [mae, ajuste] = primeira.lancamentos;
      expect((await c.cliente.from("lancamentos").update({ observacao: "ver" }).eq("id", mae.id)).error).toBeNull();
      expect((await c.cliente.from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", ajuste.id)).error).toBeNull();
      const { error: erroRegra } = await c.cliente.from("regras").insert({ chave: "MSC CRUZEIROS", versao_normalizacao: 1 });
      expect(erroRegra).toBeNull();
      const { count } = await local.admin.from("regras").select("id", { count: "exact", head: true }).eq("owner_id", c.id);
      regras = count ?? 0;
    });

    it("id que não é mais a Fatura do Mês: fatura.mes_mudou, nada gravado", async () => {
      const outro = await importar(c.cliente, pequena(MES), await ultimaDoMes(), crypto.randomUUID());
      expect(outro.error?.message).toBe("fatura.mes_mudou");
      // Mês sem Fatura com um id confirmado também.
      const vazio = await importar(c.cliente, pequena("2026-03"), null, primeira.fatura.id);
      expect(vazio.error?.message).toBe("fatura.mes_mudou");
      expect(await contar("faturas", c.id, "2026-03")).toBe(0);
    });

    it("updated_at diferente do lido com o aviso: fatura.mes_mudou, nada gravado", async () => {
      const velho = await importar(c.cliente, pequena(MES), "2026-01-01T00:00:00+00:00", primeira.fatura.id);
      expect(velho.error?.message).toBe("fatura.mes_mudou");
      const { data } = await local.admin.from("faturas").select("id").eq("owner_id", c.id).eq("mes", MES).single();
      expect(data!.id).toBe(primeira.fatura.id);
      expect(await contar("lancamentos", c.id, MES)).toBe(3);
    });

    it("confirmado: apaga a Fatura, os cartões e as linhas dela (excluídas também), grava a nova e devolve os ids apagados", async () => {
      const { data, error } = await importar(c.cliente, pequena(MES), await ultimaDoMes(), primeira.fatura.id);
      expect(error).toBeNull();
      const g = data as unknown as Gravados;
      expect(g.removidos).toEqual({
        fatura_id: primeira.fatura.id,
        cartoes: primeira.cartoes.map((x) => x.id).sort(),
        lancamentos: primeira.lancamentos.map((l) => l.id).sort(),
        // História 3.5: sem previstos criados por ela, a lista vem vazia.
        previstos: [],
      });
      expect(g.fatura.id).not.toBe(primeira.fatura.id);
      expect(g.lancamentos).toHaveLength(2);
      // O Ajuste volta ligado à mãe nova; nada da classificação antiga fica.
      const [mae, ajuste] = g.lancamentos;
      expect(ajuste.ajuste_de_id).toBe(mae.id);
      const { data: novas } = await local.admin.from("lancamentos").select("observacao, excluido_em").eq("fatura_id", g.fatura.id);
      expect(novas!.every((l) => l.observacao === null && l.excluido_em === null)).toBe(true);

      expect(await contar("faturas", c.id, MES)).toBe(1);
      const { count: antigas } = await local.admin
        .from("lancamentos")
        .select("id", { count: "exact", head: true })
        .eq("fatura_id", primeira.fatura.id);
      expect(antigas).toBe(0);
      const { count: cartoesAntigos } = await local.admin
        .from("fatura_cartoes")
        .select("id", { count: "exact", head: true })
        .eq("fatura_id", primeira.fatura.id);
      expect(cartoesAntigos).toBe(0);

      // O manual do Mês fica igual, e as Regras também.
      const { data: m } = await local.admin.from("lancamentos").select("id, updated_at, fatura_id").eq("id", manual.id).single();
      expect(m).toEqual({ id: manual.id, updated_at: manual.updated_at, fatura_id: null });
      expect(await contar("lancamentos", c.id, MES)).toBe(3);
      const { count } = await local.admin.from("regras").select("id", { count: "exact", head: true }).eq("owner_id", c.id);
      expect(count).toBe(regras);

      // Outro aparelho que confirmou a Fatura antiga não apaga a nova.
      const tarde = await importar(c.cliente, pequena(MES), await ultimaDoMes(), primeira.fatura.id);
      expect(tarde.error?.message).toBe("fatura.mes_mudou");
      const { data: atual } = await local.admin.from("faturas").select("id").eq("owner_id", c.id).eq("mes", MES).single();
      expect(atual!.id).toBe(g.fatura.id);
    });
  });

  it("linha inválida: nenhuma linha, cartão ou Fatura gravados", async () => {
    const antes = await contar("fatura_cartoes", a.id);
    const { error } = await importar(a.cliente, pequena("2026-07", { final_cartao: "12" }));
    expect(error).not.toBeNull();
    expect(error?.message.startsWith("fatura.")).toBe(false);
    expect(await contar("faturas", a.id, "2026-07")).toBe(0);
    expect(await contar("lancamentos", a.id, "2026-07")).toBe(0);
    expect(await contar("fatura_cartoes", a.id)).toBe(antes);
  });

  it("Mês que mudou desde a leitura: recusa com fatura.mes_mudou; com o updated_at certo, grava", async () => {
    const { data: manual, error: erroManual } = await a.cliente
      .from("lancamentos")
      .insert({
        nome: "Conta de luz",
        nome_normalizado: "CONTA DE LUZ",
        valor_centavos: 15000,
        mes: "2026-12",
        lancado_por: "manual",
      })
      .select()
      .single();
    expect(erroManual).toBeNull();

    const semLeitura = await importar(a.cliente, pequena("2026-12"));
    expect(semLeitura.error?.message).toBe("fatura.mes_mudou");
    const velho = await importar(a.cliente, pequena("2026-12"), "2026-01-01T00:00:00+00:00");
    expect(velho.error?.message).toBe("fatura.mes_mudou");
    expect(await contar("faturas", a.id, "2026-12")).toBe(0);

    const certo = await importar(a.cliente, pequena("2026-12"), manual!.updated_at);
    expect(certo.error).toBeNull();
    expect(await contar("lancamentos", a.id, "2026-12")).toBe(3);
  });

  it("RLS: outro dono não lê nem altera, e cada dono tem o seu Mês", async () => {
    const { data: deA } = await local.admin.from("lancamentos").select("id").eq("owner_id", a.id).limit(1).single();
    const { data: visto } = await b.cliente.from("lancamentos").select("id").eq("id", deA!.id);
    expect(visto).toEqual([]);
    const { data: faturasVistas } = await b.cliente.from("faturas").select("mes");
    expect((faturasVistas ?? []).map((f) => f.mes)).not.toContain("2026-10");
    const { data: alterados } = await b.cliente
      .from("lancamentos")
      .update({ apelido: "Invasão" })
      .eq("id", deA!.id)
      .select();
    expect(alterados).toEqual([]);

    // Tipo de outro dono não entra num Lançamento (chave composta por dono).
    const { data: tipoB } = await b.cliente.from("tipos").insert({ nome: "De B" }).select().single();
    const { error: erroTipo } = await a.cliente.from("lancamentos").update({ tipo_id: tipoB!.id }).eq("id", deA!.id);
    expect(erroTipo).not.toBeNull();

    // O mesmo Mês para outro dono é outra Fatura.
    const { error } = await importar(b.cliente, outubro());
    expect(error).toBeNull();
    expect(await contar("faturas", b.id, "2026-10")).toBe(1);
  });

  it("sem login a RPC é recusada", async () => {
    const { error } = await importar(local.anonimo, pequena("2026-06"));
    expect(error).not.toBeNull();
  });

  it("a importação chega como INSERT de faturas e de lancamentos a outro aparelho do mesmo dono", async () => {
    const outroAparelho = await local.entrar(a.email, a.senha);
    const meses: string[] = [];
    // Cada tentativa importa um Mês novo (2027-01, 2027-02…).
    const gravar = (inicio: string) => async (t: number) => {
      const mes = somarMeses(inicio, t - 1);
      meses.push(mes);
      const { error } = await importar(a.cliente, pequena(mes));
      expect(error).toBeNull();
    };
    const linha = await esperarEvento<{ mes: string; lancado_por: string }>(
      outroAparelho,
      "lancamentos",
      "INSERT",
      (nova) => meses.includes(nova.mes),
      gravar("2027-01"),
    );
    expect(linha.lancado_por).toBe("fatura");

    const fatura = await esperarEvento<{ mes: string; owner_id: string }>(
      outroAparelho,
      "faturas",
      "INSERT",
      (nova) => meses.includes(nova.mes),
      gravar("2028-01"),
    );
    expect(fatura.owner_id).toBe(a.id);
    expect(fatura.mes.startsWith("2028-")).toBe(true);
  }, 70_000);
});
