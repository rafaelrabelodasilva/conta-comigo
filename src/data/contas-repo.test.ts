import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  avaliarFormularioConta,
  type NovaConta,
  type RascunhoDaConta,
} from "@/domain/contas-manuais";
import { criarRepoContas, type LinhaConta } from "./contas-repo";
import type { Database } from "./database.types";
import { criarGerenciador, type LinhaDe } from "./realtime";

// Cliente falso: devolve as Séries já existentes, registra a RPC e responde o
// que o teste mandar.

type Lancamento = LinhaDe<"lancamentos">;
const T = "2026-11-24T12:00:00+00:00";

const BOMBINHAS: RascunhoDaConta = {
  nome: "Bombinhas",
  valor: "318,00",
  repeticao: "parcelas",
  parcelas: "6",
  comecaEm: "2026-07",
  tipo_id: "t-viagem",
  observacao: "",
  partes: [
    { responsavel_id: "r-mae", texto: "106,00" },
    { responsavel_id: "r-casal", texto: "106,00" },
    { responsavel_id: "r-lucas", texto: "106,00" },
  ],
};

function nova(r: RascunhoDaConta = BOMBINHAS, id = "c1"): NovaConta {
  const a = avaliarFormularioConta(id, r, {
    mesAtual: "2026-11",
    tiposAtivos: new Set(["t-viagem"]),
    responsaveisAtivos: new Set(["r-mae", "r-casal", "r-lucas", "r-rafael"]),
  });
  return a.conta as NovaConta;
}

const linhaConta = (extra: Partial<LinhaConta> = {}): LinhaConta => ({
  id: "c1",
  owner_id: "dono",
  nome: "Bombinhas",
  valor_centavos: 31_800,
  tipo_id: "t-viagem",
  responsavel_id: null,
  observacao: null,
  mes_inicial: "2026-07",
  repeticao: "parcelas",
  parcela_total: 6,
  divisao: null,
  encerrada_em_mes: null,
  created_at: T,
  updated_at: T,
  ...extra,
});

const mae = (n: number, extra: Partial<Lancamento> = {}): Lancamento =>
  ({
    id: `m${n}`,
    mes: `2026-${String(6 + n).padStart(2, "0")}`,
    parcela_n: n,
    dividido_de_id: null,
    updated_at: T,
    ...extra,
  }) as Lancamento;

type RespostaRpc = { data: unknown; error: unknown };

function montar(opcoes: {
  series?: { ocorrencia: number; conta_manual_id: string | null }[];
  rpc: (n: number) => RespostaRpc | Promise<RespostaRpc>;
  online?: boolean;
  mesAberto?: string;
}) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  const filtros: [string, string, unknown][] = [];
  let leituras = 0;
  const consulta = {
    eq(coluna: string, valor: unknown) {
      filtros.push(["eq", coluna, valor]);
      return consulta;
    },
    is(coluna: string, valor: unknown) {
      filtros.push(["is", coluna, valor]);
      return consulta;
    },
    then(ok: (r: { data: unknown; error: unknown }) => unknown) {
      leituras++;
      return Promise.resolve({ data: opcoes.series ?? [], error: null }).then(ok);
    },
  };
  const cliente = {
    from: () => ({ select: () => consulta }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return opcoes.rpc(chamadas.length);
    },
    channel: () => ({
      on() {
        return this;
      },
      subscribe(cb: (s: string) => void) {
        cb("SUBSCRIBED");
        return this;
      },
    }),
  } as unknown as SupabaseClient<Database>;
  const memoria = criarGerenciador<Lancamento>({ tabela: "lancamentos", obterCliente: () => cliente, porMes: true });
  if (opcoes.mesAberto) memoria.abrirMes(opcoes.mesAberto);
  const repo = criarRepoContas({
    obterCliente: () => cliente,
    memoriaLancamentos: memoria,
    online: () => opcoes.online ?? true,
  });
  return { repo, chamadas, filtros, memoria, leituras: () => leituras };
}

describe("salvar uma Conta manual", () => {
  it("chama salvar_conta_manual com a Conta, a Série (ocorrencia 1) e as 6 parcelas até o Mês atual + 12", async () => {
    const { repo, chamadas } = montar({
      rpc: () => ({ data: { conta: linhaConta(), lancamentos: [mae(1), mae(2)] }, error: null }),
    });
    const r = await repo.salvar(nova(), "2026-11");
    expect(r).toEqual({ ok: true, conta: linhaConta(), criados: 2 });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].nome).toBe("salvar_conta_manual");
    const args = chamadas[0].args as { p_conta: Record<string, unknown>; p_parcelas: { mes: string }[]; p_ate_mes: string };
    expect(args.p_ate_mes).toBe("2027-11");
    expect(args.p_conta).toMatchObject({
      id: "c1",
      nome: "Bombinhas",
      valor_centavos: 31_800,
      serie: { nome_normalizado: "BOMBINHAS", parcela_total: 6, valor_parcela_centavos: 31_800, mes_primeira_parcela: "2026-07", ocorrencia: 1 },
    });
    expect(args.p_parcelas.map((p) => p.mes)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  });

  it("lê as Séries da mesma chave (parcela_total nulo vira `is null` na recorrente)", async () => {
    const recorrente: RascunhoDaConta = { ...BOMBINHAS, nome: "Silvia", repeticao: "mensal", partes: [{ responsavel_id: "r-rafael", texto: "" }] };
    const a = montar({ rpc: () => ({ data: { conta: linhaConta(), lancamentos: [] }, error: null }) });
    await a.repo.salvar(nova(recorrente), "2026-11");
    expect(a.filtros).toContainEqual(["is", "parcela_total", null]);
    expect(a.filtros).toContainEqual(["eq", "nome_normalizado", "SILVIA"]);
    const b = montar({ rpc: () => ({ data: { conta: linhaConta(), lancamentos: [] }, error: null }) });
    await b.repo.salvar(nova(), "2026-11");
    expect(b.filtros).toContainEqual(["eq", "parcela_total", 6]);
  });

  it("duas Contas idênticas: a segunda usa a próxima ocorrencia", async () => {
    const { repo, chamadas } = montar({
      series: [{ ocorrencia: 1, conta_manual_id: "outra" }],
      rpc: () => ({ data: { conta: linhaConta(), lancamentos: [] }, error: null }),
    });
    await repo.salvar(nova(), "2026-11");
    expect((chamadas[0].args.p_conta as { serie: { ocorrencia: number } }).serie.ocorrencia).toBe(2);
  });

  it("salvar de novo a mesma Conta (mesmo id) reaproveita a ocorrencia da Série dela", async () => {
    const { repo, chamadas } = montar({
      series: [
        { ocorrencia: 1, conta_manual_id: "outra" },
        { ocorrencia: 2, conta_manual_id: "c1" },
      ],
      rpc: () => ({ data: { conta: linhaConta(), lancamentos: [] }, error: null }),
    });
    const r = await repo.salvar(nova(), "2026-11");
    expect(r).toMatchObject({ ok: true, criados: 0 });
    expect((chamadas[0].args.p_conta as { serie: { ocorrencia: number } }).serie.ocorrencia).toBe(2);
  });

  it("outra Conta igual salva no meio: relê as ocorrencia e tenta mais uma vez", async () => {
    let leituras = 0;
    const { repo, chamadas } = montar({
      rpc: (n) =>
        n === 1
          ? { data: null, error: { message: "conta.serie_ocupada" } }
          : { data: { conta: linhaConta(), lancamentos: [mae(1)] }, error: null },
    });
    const r = await repo.salvar(nova(), "2026-11");
    leituras = chamadas.length;
    expect(leituras).toBe(2);
    expect(r).toMatchObject({ ok: true, criados: 1 });
  });

  it("conta.serie_ocupada duas vezes seguidas devolve o código", async () => {
    const { repo } = montar({ rpc: () => ({ data: null, error: { message: "conta.serie_ocupada" } }) });
    expect(await repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "conta.serie_ocupada" });
  });

  it("só as mães contam como lançamentos criados (as filhas da Divisão não)", async () => {
    const { repo } = montar({
      rpc: () => ({
        data: {
          conta: linhaConta(),
          lancamentos: [mae(1), mae(1, { id: "f1", dividido_de_id: "m1" }), mae(1, { id: "f2", dividido_de_id: "m1" })],
        },
        error: null,
      }),
    });
    expect(await repo.salvar(nova(), "2026-11")).toMatchObject({ ok: true, criados: 1 });
  });

  it("as linhas do Mês aberto entram na memória de Lançamentos; as de outros Meses, não", async () => {
    const { repo, memoria } = montar({
      mesAberto: "2026-11",
      rpc: () => ({ data: { conta: linhaConta(), lancamentos: [mae(4), mae(5), mae(6)] }, error: null }),
    });
    await repo.salvar(nova(), "2026-11");
    expect(memoria.linhas().map((l) => l.mes)).toEqual(["2026-11"]);
  });

  it("o banco recusa: salvar.falhou; resposta torta também", async () => {
    const a = montar({ rpc: () => ({ data: null, error: { message: "qualquer" } }) });
    expect(await a.repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "salvar.falhou" });
    const b = montar({ rpc: () => ({ data: { conta: null }, error: null }) });
    expect(await b.repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "salvar.falhou" });
    const c = montar({
      rpc: () => {
        throw new Error("rede");
      },
    });
    expect(await c.repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("os códigos da RPC chegam à tela", async () => {
    const sessao = montar({ rpc: () => ({ data: null, error: { message: "auth.sessao_expirou" } }) });
    expect(await sessao.repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "auth.sessao_expirou" });
    const sumiu = montar({ rpc: () => ({ data: null, error: { message: "conta.nao_encontrada" } }) });
    expect(await sumiu.repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "conta.nao_encontrada" });
  });

  it("sem internet nada é tentado (AD-3): nem leitura, nem RPC", async () => {
    const { repo, chamadas, leituras } = montar({ online: false, rpc: () => ({ data: null, error: null }) });
    expect(await repo.salvar(nova(), "2026-11")).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(chamadas).toHaveLength(0);
    expect(leituras()).toBe(0);
  });
});
