import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPOS_PERMITIDOS } from "@/server/log";

const mocks = vi.hoisted(() => ({ criarClienteAdmin: vi.fn() }));

vi.mock("@/server/supabase-admin", () => ({ criarClienteAdmin: mocks.criarClienteAdmin }));

import { GET, maxDuration, runtime } from "./route";

const SEGREDO = "segredo-do-cron-de-teste-0123456789";
const DONO = "11111111-1111-4111-8111-111111111111";
const ID_BOMBINHAS = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_SILVIA = "aaaaaaaa-0000-4000-8000-000000000002";
const ID_RUIM = "aaaaaaaa-0000-4000-8000-000000000003";

/** A Bombinhas (6 × R$ 318,00 em 3 partes de R$ 106,00) como `contas_manuais` a devolve ao cron. */
const bombinhas = {
  id: ID_BOMBINHAS,
  owner_id: DONO,
  valor_centavos: 31_800,
  mes_inicial: "2026-07",
  repeticao: "parcelas",
  parcela_total: 6,
  divisao: {
    modo: "valor",
    partes: [
      { responsavel_id: "r-mae", numerador: 1, denominador: 3 },
      { responsavel_id: "r-casal", numerador: 1, denominador: 3 },
      { responsavel_id: "r-lucas", numerador: 1, denominador: 3 },
    ],
  },
  encerrada_em_mes: null,
  // Colunas que o cron NÃO seleciona; o fake as devolve para provar que nada vaza.
  nome: "Bombinhas",
  observacao: "Pousada do Bombinhas, reserva 4411",
};
const silvia = {
  id: ID_SILVIA,
  owner_id: DONO,
  valor_centavos: 40_000,
  mes_inicial: "2026-01",
  repeticao: "mensal",
  parcela_total: null,
  divisao: null,
  encerrada_em_mes: null,
  nome: "Silvia",
  observacao: null,
};
const ruim = { ...silvia, id: ID_RUIM, nome: "Conta Ruim", valor_centavos: -1 };

type Pedido = { p_owner_id: string; p_ate_mes: string; p_parcelas: { conta_id: string; parcela_n: number; partes: unknown[] | null }[] };

/**
 * Um Supabase de mentira com a memória do `on conflict (serie_id, parcela_n) do
 * nothing`: só devolve (e "cria") a parcela que ainda não existe. Quem prova o
 * `on conflict` de verdade é o job `supabase` do CI; aqui prova-se que a rota
 * pede sempre a mesma coisa e conta só o que o banco diz que criou.
 */
function bancoFake(
  linhas: unknown[],
  opcoes: { falhaLeitura?: boolean; falhaNaConta?: string[]; lanca?: string[]; ignoraFiltro?: boolean } = {},
) {
  const existentes = new Set<string>();
  const select = vi.fn();
  const filtros: [string, unknown][] = [];
  const order = vi.fn(async () =>
    opcoes.falhaLeitura
      ? { data: null, error: { message: "relation contas_manuais: Bombinhas R$ 318,00" } }
      : {
          // Respeita `.is(coluna, valor)` como o PostgREST (o teste "filtro que escapa" a ignora).
          data: opcoes.ignoraFiltro
            ? linhas
            : linhas.filter((l) => filtros.every(([c, v]) => ((l as Record<string, unknown>)[c] ?? null) === v)),
          error: null,
        },
  );
  const from = vi.fn((tabela: string) => {
    expect(tabela).toBe("contas_manuais");
    return {
      select: (colunas: string) => {
        select(colunas);
        return {
          is: (coluna: string, valor: unknown) => {
            filtros.push([coluna, valor]);
            return { order };
          },
        };
      },
    };
  });
  const rpc = vi.fn(async (nome: string, args: Pedido) => {
    expect(nome).toBe("materializar_contas_manuais_do_dono");
    const contaId = args.p_parcelas[0]?.conta_id;
    if (opcoes.lanca?.includes(contaId)) throw new Error("rede caiu: Silvia R$ 400,00");
    if (opcoes.falhaNaConta?.includes(contaId)) {
      return { data: null, error: { message: "salvar.falhou: nome=Silvia valor=40000 sb_secret_xyz" } };
    }
    const criadas: unknown[] = [];
    for (const p of args.p_parcelas) {
      const chave = `${p.conta_id}:${p.parcela_n}`;
      if (existentes.has(chave)) continue;
      existentes.add(chave);
      criadas.push({ id: chave }, ...(p.partes ?? []).map((_, i) => ({ id: `${chave}:f${i}` })));
    }
    return { data: criadas, error: null };
  });
  return { cliente: { from, rpc }, from, rpc, select, order, filtros };
}

function chamar(cabecalho?: string) {
  return GET(new Request("http://localhost/api/cron/diario", { headers: cabecalho === undefined ? {} : { authorization: cabecalho } }));
}

/** Tudo o que foi para o console (o `log` real escreve ali), numa string só. */
let console_: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };
const tudoNoLog = () => JSON.stringify([...console_.log.mock.calls, ...console_.warn.mock.calls, ...console_.error.mock.calls]);
const linhasDeLog = () =>
  [...console_.log.mock.calls, ...console_.warn.mock.calls, ...console_.error.mock.calls].map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  vi.stubEnv("CRON_SECRET", SEGREDO);
  console_ = {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/diario: segredo", () => {
  it("roda em Node com até 60 s", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });

  it.each([
    ["sem cabeçalho", undefined],
    ["cabeçalho vazio", ""],
    ["segredo errado", "Bearer outro-segredo"],
    ["segredo certo sem o Bearer", SEGREDO],
    ["esquema errado", `Basic ${SEGREDO}`],
    ["bearer em minúsculas", `bearer ${SEGREDO}`],
    ["só o prefixo", "Bearer "],
    ["prefixo do segredo", `Bearer ${SEGREDO.slice(0, -1)}`],
    ["segredo mais comprido", `Bearer ${SEGREDO}x`],
  ])("401 e nada é lido nem gravado: %s", async (_nome, cabecalho) => {
    const banco = bancoFake([bombinhas]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(cabecalho);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false, erro: "cron.nao_autorizado" });
    expect(mocks.criarClienteAdmin).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
    expect(banco.rpc).not.toHaveBeenCalled();
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it.each([["não configurado", undefined], ["vazio", ""], ["só espaços", "   "]])(
    "segredo %s no servidor: ninguém passa, nem com `Bearer ` ou `Bearer undefined`",
    async (_nome, valor) => {
      if (valor === undefined) vi.stubEnv("CRON_SECRET", undefined as unknown as string);
      else vi.stubEnv("CRON_SECRET", valor);
      const banco = bancoFake([bombinhas]);
      mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
      for (const cabecalho of [undefined, "Bearer ", "Bearer undefined", `Bearer ${valor ?? ""}`, "Bearer"]) {
        const r = await chamar(cabecalho);
        expect(r.status).toBe(401);
      }
      expect(mocks.criarClienteAdmin).not.toHaveBeenCalled();
      expect(banco.rpc).not.toHaveBeenCalled();
    },
  );

  it("o 401 registra só o código e a rota (nem o segredo enviado, nem o certo)", async () => {
    await chamar("Bearer tentativa-de-segredo");
    const [linha] = linhasDeLog();
    expect(linha).toMatchObject({ nivel: "warn", evento: "cron.diario", codigo: "cron.nao_autorizado", rota: "/api/cron/diario", metodo: "GET", status_http: 401 });
    expect(tudoNoLog()).not.toContain("tentativa-de-segredo");
    expect(tudoNoLog()).not.toContain(SEGREDO);
  });
});

describe("GET /api/cron/diario: materialização", () => {
  it("200: materializa as Contas até o Mês atual + 12 e responde só `{ ok, quantidade }`", async () => {
    const banco = bancoFake([bombinhas, silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(200);
    // Bombinhas: 6 mães + 18 filhas; Silvia: 23 linhas (Jan/26 a Nov/27).
    expect(await r.json()).toEqual({ ok: true, quantidade: 24 + 23 });
    expect(r.headers.get("cache-control")).toBe("no-store");

    expect(banco.rpc).toHaveBeenCalledTimes(2);
    const [b, s] = banco.rpc.mock.calls.map((c) => c[1] as Pedido);
    expect(b).toMatchObject({ p_owner_id: DONO, p_ate_mes: "2027-11" });
    expect(b.p_parcelas).toHaveLength(6);
    expect(s).toMatchObject({ p_owner_id: DONO, p_ate_mes: "2027-11" });
    expect(s.p_parcelas).toHaveLength(23);
  });

  it("lê as Contas sem Nome nem Observação (só as colunas das parcelas)", async () => {
    const banco = bancoFake([silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    await chamar(`Bearer ${SEGREDO}`);
    expect(banco.select).toHaveBeenCalledTimes(1);
    const colunas = banco.select.mock.calls[0][0] as string;
    expect(colunas).not.toMatch(/nome|observacao/);
    expect(colunas).toContain("owner_id");
  });

  it("a Conta excluída (5.4) não é lida nem materializada: a leitura filtra `excluido_em` e o núcleo confere de novo", async () => {
    const excluida = { ...bombinhas, excluido_em: "2026-11-14T12:00:00+00:00" };
    // 1) O banco respeita o filtro: a Conta excluída nem chega.
    const filtrado = bancoFake([excluida, silvia]);
    mocks.criarClienteAdmin.mockReturnValue(filtrado.cliente);
    await chamar(`Bearer ${SEGREDO}`);
    expect(filtrado.filtros).toEqual([["excluido_em", null]]);
    expect(filtrado.rpc.mock.calls.map((c) => (c[1] as Pedido).p_parcelas[0].conta_id)).toEqual([ID_SILVIA]);

    // 2) O filtro escapa (um leitor novo que o esquecesse): o núcleo a pula do mesmo jeito.
    const escapou = bancoFake([excluida, silvia], { ignoraFiltro: true });
    mocks.criarClienteAdmin.mockReturnValue(escapou.cliente);
    const resposta = await (await chamar(`Bearer ${SEGREDO}`)).json();
    expect(resposta.ok).toBe(true);
    expect(escapou.rpc.mock.calls.map((c) => (c[1] as Pedido).p_parcelas[0].conta_id)).toEqual([ID_SILVIA]);
    expect(tudoNoLog()).not.toContain("Bombinhas");
  });

  it("duas execuções seguidas no mesmo dia: a segunda pede o mesmo e não cria nada novo", async () => {
    const banco = bancoFake([bombinhas, silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const primeira = await (await chamar(`Bearer ${SEGREDO}`)).json();
    const segunda = await (await chamar(`Bearer ${SEGREDO}`)).json();
    expect(primeira).toEqual({ ok: true, quantidade: 47 });
    expect(segunda).toEqual({ ok: true, quantidade: 0 });
    expect(banco.rpc).toHaveBeenCalledTimes(4);
    // Os dois pares de chamadas pedem exatamente as mesmas parcelas.
    expect(banco.rpc.mock.calls[2]).toEqual(banco.rpc.mock.calls[0]);
    expect(banco.rpc.mock.calls[3]).toEqual(banco.rpc.mock.calls[1]);
  });

  it("no dia seguinte (o Mês virou), pede uma parcela a mais da recorrente e cria só ela", async () => {
    const banco = bancoFake([silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    expect(await (await chamar(`Bearer ${SEGREDO}`)).json()).toEqual({ ok: true, quantidade: 23 });
    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    expect(await (await chamar(`Bearer ${SEGREDO}`)).json()).toEqual({ ok: true, quantidade: 1 });
    expect((banco.rpc.mock.calls.at(-1)![1] as Pedido).p_ate_mes).toBe("2027-12");
  });

  it.each([
    ["dia comum", "2026-11-15T12:00:00Z", "2027-11"],
    ["02:00 UTC do dia 1º ainda é o dia 30 em São Paulo", "2026-12-01T02:00:00Z", "2027-11"],
    ["00:00 de dezembro em São Paulo", "2026-12-01T03:00:00Z", "2027-12"],
    ["23:59 de 31/12 em São Paulo", "2027-01-01T02:59:00Z", "2027-12"],
    ["00:00 de 1º/1 em São Paulo", "2027-01-01T03:00:00Z", "2028-01"],
    ["a hora do Cron em 1º/1", "2027-01-01T12:00:00Z", "2028-01"],
  ])("o horizonte vem do relógio em São Paulo: %s", async (_nome, instante, esperado) => {
    vi.setSystemTime(new Date(instante));
    const banco = bancoFake([silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    await chamar(`Bearer ${SEGREDO}`);
    expect((banco.rpc.mock.calls[0][1] as Pedido).p_ate_mes).toBe(esperado);
  });

  it("sem Contas: 200 com quantidade 0, uma leitura (mantém o Supabase ativo) e nenhuma gravação", async () => {
    const banco = bancoFake([]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(banco.from).toHaveBeenCalledTimes(1);
    expect(banco.rpc).not.toHaveBeenCalled();
  });

  it("uma Conta ilegível é pulada e contada; as outras seguem e a resposta é 200", async () => {
    const banco = bancoFake([bombinhas, ruim, silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 47 });
    expect(banco.rpc).toHaveBeenCalledTimes(2);
    const avisos = linhasDeLog().filter((l) => l.codigo === "cron.conta_ilegivel");
    expect(avisos).toEqual([{ nivel: "warn", evento: "cron.diario.conta_ilegivel", codigo: "cron.conta_ilegivel", rota: "/api/cron/diario", quantidade: 1 }]);
    expect(tudoNoLog()).not.toContain("Conta Ruim");
    expect(tudoNoLog()).not.toContain(ID_RUIM);
  });

  it("sem as variáveis do Supabase: 503, sem leitura nem gravação", async () => {
    mocks.criarClienteAdmin.mockReturnValue(null);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, erro: "cron.indisponivel" });
  });
});

describe("GET /api/cron/diario: falhas do banco", () => {
  it("a leitura falha: 500 sem o texto do erro, nada gravado", async () => {
    const banco = bancoFake([bombinhas], { falhaLeitura: true });
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(500);
    const corpo = await r.json();
    expect(corpo).toEqual({ ok: false, erro: "cron.falhou", quantidade: 0 });
    expect(JSON.stringify(corpo)).not.toMatch(/contas_manuais|Bombinhas|318/);
    expect(banco.rpc).not.toHaveBeenCalled();
    expect(tudoNoLog()).not.toMatch(/contas_manuais|Bombinhas|318/);
    expect(linhasDeLog().at(-1)).toMatchObject({ nivel: "error", codigo: "cron.leitura_falhou", status_http: 500 });
  });

  it("o banco falha numa Conta: as outras seguem, o 500 não vaza texto e a quantidade é a das que deram certo", async () => {
    const banco = bancoFake([bombinhas, silvia], { falhaNaConta: [ID_SILVIA] });
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(500);
    const corpo = await r.json();
    expect(corpo).toEqual({ ok: false, erro: "cron.falhou", quantidade: 24 });
    expect(JSON.stringify(corpo)).not.toMatch(/Silvia|40000|sb_secret/);
    expect(banco.rpc).toHaveBeenCalledTimes(2);
    expect(tudoNoLog()).not.toMatch(/Silvia|40000|sb_secret/);
    const falha = linhasDeLog().find((l) => l.codigo === "cron.materializacao_falhou");
    expect(falha).toMatchObject({ nivel: "error", evento: "cron.diario.materializacao_falhou", quantidade: 1 });
  });

  it("o banco falha no meio e na próxima execução só o que faltou é criado (o que já existia não duplica)", async () => {
    const falhaNaConta = [ID_SILVIA];
    const banco = bancoFake([bombinhas, silvia], { falhaNaConta });
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const primeira = await chamar(`Bearer ${SEGREDO}`);
    expect(primeira.status).toBe(500);
    expect(await primeira.json()).toMatchObject({ quantidade: 24 });
    falhaNaConta.length = 0; // o banco voltou
    const segunda = await chamar(`Bearer ${SEGREDO}`);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ ok: true, quantidade: 23 });
  });

  it("a chamada ao banco lança (rede): 500 sem o texto, e a próxima Conta ainda roda", async () => {
    const banco = bancoFake([bombinhas, silvia], { lanca: [ID_SILVIA] });
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/rede caiu|Silvia/);
    expect(tudoNoLog()).not.toMatch(/rede caiu|Silvia/);
    expect(banco.rpc).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/cron/diario: log (AD-17)", () => {
  it("só campos da lista permitida, e nunca Nome, Valor, id, dono ou segredo", async () => {
    const banco = bancoFake([bombinhas, ruim, silvia], { falhaNaConta: [ID_SILVIA] });
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    await chamar(`Bearer ${SEGREDO}`);
    await chamar("Bearer errado");

    const permitidos = new Set<string>(["nivel", "evento", "codigo", ...CAMPOS_PERMITIDOS]);
    const linhas = linhasDeLog();
    expect(linhas.length).toBeGreaterThanOrEqual(4);
    for (const linha of linhas) {
      for (const chave of Object.keys(linha)) expect(permitidos.has(chave)).toBe(true);
      expect(linha.rota).toBe("/api/cron/diario");
    }
    const tudo = tudoNoLog();
    for (const proibido of ["Bombinhas", "Silvia", "Conta Ruim", "Pousada", "31800", "318", "40000", "400,00", DONO, ID_BOMBINHAS, ID_SILVIA, SEGREDO, "sb_secret"]) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it("o sucesso registra rota, método, status, duração e quantidade", async () => {
    const banco = bancoFake([silvia]);
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    await chamar(`Bearer ${SEGREDO}`);
    expect(linhasDeLog()).toEqual([
      expect.objectContaining({
        nivel: "info",
        evento: "cron.diario",
        codigo: "cron.materializou",
        rota: "/api/cron/diario",
        metodo: "GET",
        status_http: 200,
        quantidade: 23,
        duracao_ms: expect.any(Number),
      }),
    ]);
  });
});
