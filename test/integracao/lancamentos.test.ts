// Prova, contra o Supabase local (CI), as gravações do painel do Lançamento
// (História 2.7, `lancamentos-repo.ts`): inclusão à mão (correção da Fatura
// com `ordem_fatura` nulo), atualização de uma coluna com `editado_em`,
// exclusão lógica e "Desfazer", e o RLS de outro dono.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "../../src/data/database.types";
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
});
