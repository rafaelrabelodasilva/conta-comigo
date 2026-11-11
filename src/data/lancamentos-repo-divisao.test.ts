import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Divisao, ItemDividir } from "@/domain/divisao";
import type { Database } from "./database.types";
import { criarRepoLancamentos, type LinhaLancamento } from "./lancamentos-repo";
import type { Gerenciador } from "./realtime";

// Divisão (História 3.8): dividir, desfazer, propagar aos previstos e
// restaurar. Cliente falso com consulta encadeada; a memória é um stub.

type Filtro = { tipo: string; coluna: string; valor: unknown };
type Consulta = { tabela: string; filtros: Filtro[] };

const MAE = "r-mae";
const RAFAEL = "r-rafael";
const doisTercos: Divisao = {
  modo: "proporcao",
  partes: [
    { responsavel_id: MAE, numerador: 2, denominador: 3 },
    { responsavel_id: RAFAEL, numerador: 1, denominador: 3 },
  ],
};

const linha = (extra: Partial<LinhaLancamento> = {}): LinhaLancamento =>
  ({
    id: "m1",
    nome: "JIM COM 5765",
    nome_normalizado: "JIM COM 5765",
    valor_centavos: 46600,
    mes: "2026-11",
    responsavel_id: "r-antes",
    tipo_id: "t-saude",
    status_id: "s-padrao",
    fatura_id: "f1",
    lancado_por: "fatura",
    revisao_motivo: null,
    revisao_dados: null,
    revisado_em: null,
    editado_em: null,
    excluido_em: null,
    ajuste_de_id: null,
    dividido_de_id: null,
    divisao: null,
    serie_id: null,
    parcela_n: null,
    ...extra,
  }) as LinhaLancamento;

type Opcoes = {
  linhas?: LinhaLancamento[];
  previstos?: unknown[];
  filhas?: unknown[];
  erroLeitura?: boolean;
  rpc?: (itens: ItemDividir[], chamada: number) => { data: unknown; error: unknown };
  online?: boolean;
};

function montar(opcoes: Opcoes = {}) {
  const linhas = opcoes.linhas ?? [linha()];
  const consultas: Consulta[] = [];
  const rpcs: ItemDividir[][] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: () => {
        const c: Consulta = { tabela, filtros: [] };
        consultas.push(c);
        const resposta = () => {
          if (opcoes.erroLeitura) return { data: null, error: { code: "x" } };
          return { data: c.filtros.some((f) => f.coluna === "dividido_de_id" && f.tipo === "in") ? (opcoes.filhas ?? []) : (opcoes.previstos ?? []), error: null };
        };
        const cadeia: Record<string, unknown> = {};
        for (const tipo of ["in", "eq", "is", "gt"]) {
          cadeia[tipo] = (coluna: string, valor: unknown) => (c.filtros.push({ tipo, coluna, valor }), cadeia);
        }
        cadeia.then = (resolver: (r: unknown) => unknown) => Promise.resolve(resposta()).then(resolver);
        return cadeia;
      },
    }),
    rpc: async (_nome: string, args: { p_itens: ItemDividir[] }) => {
      rpcs.push(args.p_itens);
      if (opcoes.rpc) return opcoes.rpc(args.p_itens, rpcs.length);
      return { data: args.p_itens.map((i) => ({ id: i.id, ...i.corpo })), error: null };
    },
  } as unknown as SupabaseClient<Database>;
  const aplicarLote = vi.fn();
  const memoria = {
    aplicarLote,
    linha: (id: string) => linhas.find((l) => l.id === id),
    linhas: () => linhas,
  } as unknown as Gerenciador<LinhaLancamento>;
  const aprender = vi.fn(async () => ({ ok: true }));
  const repo = criarRepoLancamentos({ obterCliente: () => cliente, memoria, online: () => opcoes.online ?? true, aprender });
  return { repo, consultas, rpcs, aplicarLote, aprender };
}

const AGORA = new Date("2026-11-11T13:00:00.000Z");

describe("dividir", () => {
  it("planeja pelo núcleo, grava pela RPC, aplica mãe e filhas e ensina a Regra", async () => {
    const m = montar();
    const r = await m.repo.dividir("m1", doisTercos, ["s-pago", undefined], AGORA);
    expect(r.ok).toBe(true);
    expect(m.rpcs).toHaveLength(1);
    const [item] = m.rpcs[0];
    expect(item.id).toBe("m1");
    expect(item.corpo).toMatchObject({ divisao: { ...doisTercos, responsavel_antes: "r-antes" }, responsavel_id: null, editado_em: AGORA.toISOString() });
    expect(item.partes).toEqual([
      { filha_id: null, responsavel_id: MAE, valor_centavos: 31067, status_id: "s-pago" },
      { filha_id: null, responsavel_id: RAFAEL, valor_centavos: 15533 },
    ]);
    expect(m.aplicarLote).toHaveBeenCalledOnce();
    expect(m.aprender).toHaveBeenCalledWith({
      nome: "JIM COM 5765",
      responsavelAntes: null,
      responsavelDepois: null,
      tipoDepois: "t-saude",
      divisao: expect.objectContaining({ modo: "proporcao" }),
    });
    // O "Desfazer" devolve a mãe ao que era.
    expect(r.ok && r.desfazer).toEqual([
      {
        id: "m1",
        corpo: { divisao: null, responsavel_id: "r-antes", revisao_motivo: null, revisao_dados: null, revisado_em: null, editado_em: null },
        partes: [],
      },
    ]);
  });

  it("sem Tipo não chama a RPC", async () => {
    const m = montar({ linhas: [linha({ tipo_id: null })] });
    expect(await m.repo.dividir("m1", doisTercos, [], AGORA)).toEqual({ ok: false, codigo: "divisao.sem_tipo" });
    expect(m.rpcs).toEqual([]);
    expect(m.aprender).not.toHaveBeenCalled();
  });

  it("devolve o código da recusa da RPC (mãe com Ajuste)", async () => {
    const m = montar({ rpc: () => ({ data: null, error: { message: "divisao.com_ajuste" } }) });
    expect(await m.repo.dividir("m1", doisTercos, [], AGORA)).toEqual({ ok: false, codigo: "divisao.com_ajuste" });
    expect(m.aplicarLote).not.toHaveBeenCalled();
    expect(m.aprender).not.toHaveBeenCalled();
  });

  it("recusa desconhecida vira salvar.falhou", async () => {
    const m = montar({ rpc: () => ({ data: null, error: { message: "boom" } }) });
    expect(await m.repo.dividir("m1", doisTercos, [], AGORA)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("sem conexão nada é tentado", async () => {
    const m = montar({ online: false });
    expect(await m.repo.dividir("m1", doisTercos, [], AGORA)).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.rpcs).toEqual([]);
  });

  it("linha fora da memória falha sem tocar no banco", async () => {
    const m = montar({ linhas: [] });
    expect(await m.repo.dividir("m1", doisTercos, [], AGORA)).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(m.rpcs).toEqual([]);
  });
});

describe("propagação aos previstos da Série", () => {
  const parcela = linha({ serie_id: "s1", parcela_n: 5, valor_centavos: 10000 });
  const previsto = (id: string, n: number, extra: Record<string, unknown> = {}) => ({
    ...linha({ id, lancado_por: "sistema", fatura_id: null, mes: "2027-0" + (n - 4), parcela_n: n, serie_id: "s1", responsavel_id: null, valor_centavos: 10000 }),
    ...extra,
  });

  it("previsto vazio recebe sozinho (com o próprio Valor) e entra no Desfazer", async () => {
    const m = montar({ linhas: [parcela], previstos: [previsto("p6", 6), previsto("p7", 7, { responsavel_id: "r9" })] });
    const r = await m.repo.dividir("m1", doisTercos, [], AGORA);
    expect(r.ok && r.preenchidos).toBe(1);
    expect(r.ok && r.aPerguntar.map((i) => i.id)).toEqual(["p7"]);
    expect(m.rpcs).toHaveLength(2);
    const itensPrevistos = m.rpcs[1];
    expect(itensPrevistos.map((i) => i.id)).toEqual(["p6"]);
    expect(itensPrevistos[0].corpo).not.toHaveProperty("editado_em");
    expect(itensPrevistos[0].partes.map((p) => p.valor_centavos)).toEqual([6667, 3333]);
    expect(m.consultas[0].filtros).toEqual([
      { tipo: "eq", coluna: "serie_id", valor: "s1" },
      { tipo: "eq", coluna: "lancado_por", valor: "sistema" },
      { tipo: "is", coluna: "excluido_em", valor: null },
      { tipo: "is", coluna: "dividido_de_id", valor: null },
      { tipo: "gt", coluna: "parcela_n", valor: 5 },
    ]);
    expect(r.ok && r.desfazer.map((i) => i.id)).toEqual(["m1", "p6"]);
  });

  it("previsto com outro Responsável pergunta, quando a parcela já tinha Responsável", async () => {
    const m = montar({ linhas: [parcela], previstos: [previsto("p6", 6, { responsavel_id: "r9" })] });
    const r = await m.repo.dividir("m1", doisTercos, [], AGORA);
    expect(r.ok && r.preenchidos).toBe(0);
    expect(r.ok && r.aPerguntar.map((i) => i.id)).toEqual(["p6"]);
    expect(m.rpcs).toHaveLength(1);
    // "Aplicar a todos" grava os itens que sobraram.
    if (!r.ok) return;
    expect(await m.repo.aplicarDivisaoAosPrevistos(r.aPerguntar)).toEqual({ ok: true, gravados: 1 });
    expect(m.rpcs).toHaveLength(2);
  });

  it("a falha nos previstos não desfaz a mãe: ok, sem preenchidos", async () => {
    const m = montar({ linhas: [parcela], erroLeitura: true });
    const r = await m.repo.dividir("m1", doisTercos, [], AGORA);
    expect(r.ok && r.preenchidos).toBe(0);
    expect(r.ok && r.desfazer).toHaveLength(1);
  });

  it("previstos sem Série (linha comum) não propagam", async () => {
    const m = montar();
    await m.repo.dividir("m1", doisTercos, [], AGORA);
    expect(m.consultas).toEqual([]);
  });
});

describe("desfazerDivisao e restaurarDivisao", () => {
  const dividida = linha({
    responsavel_id: null,
    divisao: { ...doisTercos, responsavel_antes: "r-antes", partes: [{ ...doisTercos.partes[0], filha_id: "f1" }, { ...doisTercos.partes[1], filha_id: "f2" }] } as never,
  });
  const filha = (id: string, resp: string, valor: number) => linha({ id, dividido_de_id: "m1", responsavel_id: resp, valor_centavos: valor });

  it("a mãe volta com o Responsável de antes, a Regra perde a Divisão e o Desfazer revive as filhas", async () => {
    const m = montar({ linhas: [dividida, filha("f1", MAE, 31067), filha("f2", RAFAEL, 15533)] });
    const r = await m.repo.desfazerDivisao("m1", AGORA);
    expect(r.ok).toBe(true);
    expect(m.rpcs[0][0]).toMatchObject({ id: "m1", corpo: { divisao: null, responsavel_id: "r-antes" }, partes: [] });
    expect(m.aprender).toHaveBeenCalledWith({ nome: "JIM COM 5765", responsavelAntes: null, responsavelDepois: null, tipoDepois: null, divisao: null });
    const restaurar = r.ok ? r.desfazer[0] : null;
    expect(restaurar?.corpo.divisao).toEqual(dividida.divisao);
    expect(restaurar?.partes).toEqual([
      { filha_id: "f1", responsavel_id: MAE, valor_centavos: 31067, status_id: "s-padrao" },
      { filha_id: "f2", responsavel_id: RAFAEL, valor_centavos: 15533, status_id: "s-padrao" },
    ]);
    if (!r.ok) return;
    expect(await m.repo.restaurarDivisao(r.desfazer)).toEqual({ ok: true });
    expect(m.rpcs).toHaveLength(2);
  });

  it("linha que não está dividida é recusada", async () => {
    const m = montar();
    expect(await m.repo.desfazerDivisao("m1", AGORA)).toEqual({ ok: false, codigo: "divisao.mae_invalida" });
    expect(m.rpcs).toEqual([]);
  });
});
