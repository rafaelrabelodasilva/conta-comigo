// Prova, contra o Supabase local (CI), a tabela `regras` e a importação com
// classificação (História 3.1): RLS do dono, chave única por dono, chaves
// estrangeiras compostas, Realtime, `regrasRepo.aprender()` gravando a
// contagem certa e `importar_fatura` gravando a classificação do núcleo
// (Regra aplicada, sugestão com motivo e o Ajuste com a classificação da mãe).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classificarImportacao } from "../../src/domain/classificacao";
import type { Importacao } from "../../src/domain/importacao-fatura";
import type { RegraGravada } from "../../src/domain/regras";
import type { Json } from "../../src/data/database.types";
import { criarRepoRegras } from "../../src/data/regras-repo";
import { esperarEvento, ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("regras no Supabase local", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let rafael: string;
  let casal: string;
  let gatos: string;
  let casa: string;

  beforeAll(async () => {
    local = supabaseLocal("regras");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
    const resp = async (nome: string, cor: number) => {
      const { data, error } = await a.cliente.from("responsaveis").insert({ nome, cor, ordem: cor }).select().single();
      expect(error).toBeNull();
      return data!.id;
    };
    const tipo = async (nome: string) => {
      const { data, error } = await a.cliente.from("tipos").insert({ nome }).select().single();
      expect(error).toBeNull();
      return data!.id;
    };
    rafael = await resp("Rafael", 1);
    casal = await resp("Casal", 2);
    gatos = await tipo("Gatos");
    casa = await tipo("Casa");
  });

  afterAll(async () => {
    await local.limpar();
  });

  async function regraDe(u: Usuario, chave: string) {
    const { data } = await local.admin.from("regras").select("*").eq("owner_id", u.id).eq("chave", chave).maybeSingle();
    return data;
  }

  it("aprender: Regra nova com Rafael 1; trocar para Casal dá Rafael 1, Casal 1 (só soma)", async () => {
    const repo = criarRepoRegras({ obterCliente: () => a.cliente });
    const r = await repo.aprender({ nome: "COBASI CRICIUMA", responsavelAntes: null, responsavelDepois: rafael, tipoDepois: gatos });
    expect(r.ok).toBe(true);
    expect(await regraDe(a, "COBASI CRICIUMA")).toMatchObject({
      versao_normalizacao: 1,
      responsavel_id: rafael,
      tipo_id: gatos,
      contagem: [{ responsavel_id: rafael, n: 1 }],
    });
    await repo.aprender({ nome: "COBASI CRICIUMA", responsavelAntes: rafael, responsavelDepois: casal, tipoDepois: gatos });
    expect(await regraDe(a, "COBASI CRICIUMA")).toMatchObject({
      responsavel_id: casal,
      contagem: [
        { responsavel_id: rafael, n: 1 },
        { responsavel_id: casal, n: 1 },
      ],
    });
    const { count } = await local.admin.from("regras").select("id", { count: "exact", head: true }).eq("owner_id", a.id);
    expect(count).toBe(1);
  });

  it("variações do Nome caem na mesma Regra (chave do núcleo)", async () => {
    const repo = criarRepoRegras({ obterCliente: () => a.cliente });
    await repo.aprender({ nome: "DM*SPOTIFY P4750", responsavelAntes: null, responsavelDepois: rafael, tipoDepois: null });
    await repo.aprender({ nome: "EBN *SPOTIFY", responsavelAntes: null, responsavelDepois: rafael, tipoDepois: null });
    expect(await regraDe(a, "SPOTIFY")).toMatchObject({ contagem: [{ responsavel_id: rafael, n: 2 }] });
  });

  it("RLS: B não lê nem altera a Regra de A, nem grava com o dono de A", async () => {
    const { data: vistas } = await b.cliente.from("regras").select("*").eq("chave", "COBASI CRICIUMA");
    expect(vistas).toEqual([]);
    const { data: alteradas } = await b.cliente
      .from("regras")
      .update({ tipo_id: null })
      .eq("chave", "COBASI CRICIUMA")
      .select();
    expect(alteradas).toEqual([]);
    expect((await regraDe(a, "COBASI CRICIUMA"))?.tipo_id).toBe(gatos);
    const { error } = await b.cliente
      .from("regras")
      .insert({ owner_id: a.id, chave: "INVASAO", versao_normalizacao: 1 });
    expect(error).not.toBeNull();
    const { error: anonimo } = await local.anonimo.from("regras").insert({ chave: "ANON", versao_normalizacao: 1 });
    expect(anonimo).not.toBeNull();
  });

  it("chave única por dono: repetida recusa; outro dono pode ter a mesma", async () => {
    const { error } = await a.cliente.from("regras").insert({ chave: "COBASI CRICIUMA", versao_normalizacao: 1 });
    expect(error?.code).toBe("23505");
    const { error: deB } = await b.cliente.from("regras").insert({ chave: "COBASI CRICIUMA", versao_normalizacao: 1 });
    expect(deB).toBeNull();
  });

  it("Responsável ou Tipo de outro dono é recusado (chave composta); contagem precisa ser lista", async () => {
    const { data: deB } = await b.cliente.from("responsaveis").insert({ nome: "De B", cor: 1, ordem: 1 }).select().single();
    const { error } = await a.cliente
      .from("regras")
      .insert({ chave: "OUTRO DONO", versao_normalizacao: 1, responsavel_id: deB!.id });
    expect(error?.code).toBe("23503");
    const { error: objeto } = await a.cliente
      .from("regras")
      .insert({ chave: "CONTAGEM OBJETO", versao_normalizacao: 1, contagem: { [rafael]: 1 } });
    expect(objeto?.code).toBe("23514");
  });

  it("a Regra gravada chega como INSERT a outro aparelho do mesmo dono", async () => {
    const outro = await local.entrar(a.email, a.senha);
    const chaves: string[] = [];
    const chegou = await esperarEvento<{ chave: string }>(
      outro,
      "regras",
      "INSERT",
      (l) => chaves.includes(l.chave),
      async (t) => {
        const chave = `REALTIME ${t}`;
        chaves.push(chave);
        await a.cliente.from("regras").insert({ chave, versao_normalizacao: 1 });
      },
    );
    expect(chaves).toContain(chegou.chave);
  }, 40_000);

  it("importar_fatura grava a classificação do núcleo: Regra aplicada, Ajuste igual à mãe, sugestão com motivo", async () => {
    const repo = criarRepoRegras({ obterCliente: () => a.cliente });
    await repo.aprender({ nome: "MSC CRUZEIROS", responsavelAntes: null, responsavelDepois: casal, tipoDepois: casa });
    const lidas = await repo.listar();
    expect(lidas.ok).toBe(true);
    if (!lidas.ok) return;

    const base = { data: "2026-08-04", final_cartao: "5061", duvida_extracao: false, tipo_sugerido: null };
    const sem = { responsavel_id: null, tipo_id: null, revisao_motivo: null, revisao_dados: null };
    const linhas: Importacao["lancamentos"] = [
      { ...base, ...sem, nome: "MSC CRUZEIROS", nome_normalizado: "MSC CRUZEIROS", valor_centavos: 114074, parcela_n: 3, parcela_total: 12, ordem_fatura: 1, ajuste_de_ordem: null },
      { ...base, ...sem, nome: "MSC CRUZEIROS", nome_normalizado: "MSC CRUZEIROS", valor_centavos: -8, parcela_n: null, parcela_total: null, ordem_fatura: 2, ajuste_de_ordem: 1 },
      { ...base, ...sem, nome: "PETZ", nome_normalizado: "PETZ", valor_centavos: 5000, parcela_n: null, parcela_total: null, ordem_fatura: 3, ajuste_de_ordem: null, tipo_sugerido: "Gatos" },
      { ...base, ...sem, nome: "NOVA LOJA", nome_normalizado: "NOVA LOJA", valor_centavos: 1000, parcela_n: null, parcela_total: null, ordem_fatura: 4, ajuste_de_ordem: null },
    ];
    const { data: responsaveis } = await a.cliente.from("responsaveis").select("id, arquivado");
    const { data: tipos } = await a.cliente.from("tipos").select("id, nome, arquivado");
    const classificadas = classificarImportacao(linhas, lidas.regras as RegraGravada[], {
      responsaveis: responsaveis ?? [],
      tipos: tipos ?? [],
    });

    const { data, error } = await a.cliente.rpc("importar_fatura", {
      dados_fatura: {
        mes: "2026-08",
        vencimento: "2026-08-06",
        fechamento: null,
        total_despesas_centavos: 120074,
        total_creditos_centavos: 8,
        saldo_anterior_centavos: null,
        pagamentos_centavos: null,
        total_a_pagar_centavos: null,
      },
      dados_cartoes: [{ final: "5061", total_centavos: 120074 }],
      dados_lancamentos: classificadas as unknown as Json,
    });
    expect(error).toBeNull();
    const gravadas = (data as unknown as {
      lancamentos: {
        id: string;
        ordem_fatura: number;
        responsavel_id: string | null;
        tipo_id: string | null;
        ajuste_de_id: string | null;
        revisao_motivo: string | null;
        revisao_dados: unknown;
      }[];
    }).lancamentos;
    const [mae, ajuste, petz, nova] = gravadas;
    expect(mae).toMatchObject({ responsavel_id: casal, tipo_id: casa, revisao_motivo: null, revisao_dados: null });
    expect(ajuste).toMatchObject({ responsavel_id: casal, tipo_id: casa, ajuste_de_id: mae.id, revisao_motivo: null });
    expect(petz).toMatchObject({
      responsavel_id: null,
      tipo_id: null,
      revisao_motivo: "sugestao",
      revisao_dados: { responsavel_id: null, tipo_id: gatos, outros_responsaveis: [] },
    });
    expect(nova).toMatchObject({ revisao_motivo: "sem_classificacao", revisao_dados: null });
  });

  it("importar_fatura recusa Responsável de outro dono (nada gravado)", async () => {
    const { data: deB } = await b.cliente.from("responsaveis").insert({ nome: "Outro", cor: 2, ordem: 2 }).select().single();
    const { error } = await a.cliente.rpc("importar_fatura", {
      dados_fatura: {
        mes: "2026-07",
        vencimento: "2026-07-06",
        fechamento: null,
        total_despesas_centavos: 1000,
        total_creditos_centavos: 0,
        saldo_anterior_centavos: null,
        pagamentos_centavos: null,
        total_a_pagar_centavos: null,
      },
      dados_cartoes: [{ final: "5061", total_centavos: 1000 }],
      dados_lancamentos: [
        {
          nome: "LOJA",
          nome_normalizado: "LOJA",
          valor_centavos: 1000,
          data: "2026-07-01",
          parcela_n: null,
          parcela_total: null,
          final_cartao: "5061",
          ordem_fatura: 1,
          duvida_extracao: false,
          ajuste_de_ordem: null,
          responsavel_id: deB!.id,
        },
      ] as unknown as Json,
    });
    expect(error).not.toBeNull();
    const { data: faturas } = await local.admin.from("faturas").select("id").eq("owner_id", a.id).eq("mes", "2026-07");
    expect(faturas).toEqual([]);
  });
});
