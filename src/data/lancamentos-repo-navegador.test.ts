import { beforeEach, describe, expect, it, vi } from "vitest";

// Prova que o repositório do navegador (`repoLancamentos()`) liga `aprender`
// ao `repoRegras().aprender` (História 3.1): tirar a ligação quebra este
// teste. O cliente do navegador, o detector de conexão e o repositório de
// Regras são trocados por falsos.

const falsos = vi.hoisted(() => {
  const aprender = vi.fn(async () => ({ ok: true }));
  const linha = {
    id: "a",
    owner_id: "dono",
    nome: "COBASI CRICIUMA",
    nome_normalizado: "COBASI CRICIUMA",
    apelido: null,
    valor_centavos: 14557,
    data: "2026-09-12",
    parcela_n: null,
    parcela_total: null,
    final_cartao: "8673",
    mes: "2026-10",
    fatura_id: "f10",
    ordem_fatura: 1,
    duvida_extracao: false,
    lancado_por: "fatura",
    responsavel_id: null,
    tipo_id: "t-gatos",
    status_id: null,
    observacao: null,
    editado_em: null,
    excluido_em: null,
    ajuste_de_id: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    created_at: "2026-11-08T00:00:00.000001+00:00",
    updated_at: "2026-11-08T00:00:00.000001+00:00",
  };
  const consulta = (corpo: Record<string, unknown>) => {
    const encadeada = {
      eq: () => encadeada,
      select: () => encadeada,
      single: async () => ({ data: { ...linha, ...corpo, updated_at: "2026-11-08T00:14:00.000002+00:00" }, error: null }),
    };
    return encadeada;
  };
  const cliente = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [linha], error: null }) }),
      update: (corpo: Record<string, unknown>) => consulta(corpo),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe(cb: (s: string) => void) {
        cb("SUBSCRIBED");
        return this;
      },
    }),
    removeChannel: () => {},
  };
  return { aprender, cliente };
});

vi.mock("./supabase/navegador", () => ({ criarClienteNavegador: () => falsos.cliente }));
vi.mock("./conexao", () => ({ estaOnline: () => true, aoVoltar: () => () => {} }));
vi.mock("./regras-repo", () => ({ repoRegras: () => ({ aprender: falsos.aprender }) }));

import { repoLancamentos } from "./lancamentos-repo";
import { gerenciador } from "./realtime";

describe("repoLancamentos() do navegador", () => {
  beforeEach(() => falsos.aprender.mockClear());

  it("classificar ensina a Regra pelo repoRegras().aprender", async () => {
    const memoria = gerenciador("lancamentos");
    memoria.assinar(() => {});
    memoria.abrirMes("2026-10");
    await new Promise((r) => setTimeout(r, 0));
    expect(memoria.linha("a")).toBeTruthy();

    const r = await repoLancamentos().atualizar("a", { responsavel_id: "r-rafael" });
    expect(r.ok).toBe(true);
    expect(falsos.aprender).toHaveBeenCalledTimes(1);
    expect(falsos.aprender).toHaveBeenCalledWith({
      nome: "COBASI CRICIUMA",
      responsavelAntes: null,
      responsavelDepois: "r-rafael",
      tipoDepois: "t-gatos",
    });
  });
});
