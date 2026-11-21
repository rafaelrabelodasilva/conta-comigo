import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha, type OpcoesDoBancoFalso } from "../../../../../test/banco-falso-de-push";
import { CAMPOS_PERMITIDOS } from "@/server/log";
import type { EnviarPush, ResultadoDoEnvio } from "@/server/push";

// O aviso do sistema dentro do Cron diário (História 7.5): vem DEPOIS da materialização, nunca a desfaz nem muda a
// resposta, pula sem as chaves VAPID e não registra nada sensível. A rota real, o `notificarLembretesDoDia` real,
// um banco de mentira e o envio injetado (nenhum teste fala com a rede nem usa chave VAPID de verdade).

const mocks = vi.hoisted(() => ({
  criarClienteAdmin: vi.fn(),
  configuracaoVapid: vi.fn(),
  criarEnviadorWebPush: vi.fn(),
}));

vi.mock("@/server/supabase-admin", () => ({ criarClienteAdmin: mocks.criarClienteAdmin }));
vi.mock("@/server/push", () => ({
  configuracaoVapid: mocks.configuracaoVapid,
  criarEnviadorWebPush: mocks.criarEnviadorWebPush,
}));

import { GET } from "./route";

const SEGREDO = "segredo-do-cron-de-teste-0123456789";
const DONO = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "https://push.exemplo/ipad-segredo-do-endpoint";
const CHAVE_PRIVADA = "chave-privada-vapid-de-teste";

function cenario(): Record<string, Linha[]> {
  return {
    push_inscricoes: [
      { id: "i-ipad", owner_id: DONO, endpoint: ENDPOINT, chave_p256dh: "p256dh-de-teste", chave_auth: "auth-de-teste" },
    ],
    lancamentos: [
      {
        id: "l1",
        owner_id: DONO,
        mes: "2026-11",
        excluido_em: null,
        valor_centavos: 11_516,
        responsavel_id: "lucas",
        tipo_id: "casa",
        status_id: "s-nao",
        lancado_por: "fatura",
        conta_manual_id: null,
        dividido_de_id: null,
        divisao: null,
        ajuste_de_id: null,
        vencimento_combinado: null,
      },
    ],
    pagamento_itens: [],
    blocos: [
      { id: "b-lucas", owner_id: DONO, nome: "Lucas", ordem: 1, de_cobranca: true, meu_bloco: false, formula: { tipo: "responsavel", id: "lucas" } },
    ],
    status: [{ id: "s-nao", owner_id: DONO, conta_como_pago: false }],
    faturas: [{ id: "f2", owner_id: DONO, mes: "2026-11", vencimento: "2026-11-06" }],
    config_ciclo: [
      { id: "c1", owner_id: DONO, dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" },
    ],
    configuracoes: [],
    lembretes_enviados: [],
  };
}

/**
 * O cliente do Cron: `contas_manuais` (a materialização, sem Contas) mais as tabelas do aviso. `eventos` guarda a
 * ordem das chamadas para provar que a materialização vem antes de qualquer leitura do aviso.
 */
function montar(opcoes: OpcoesDoBancoFalso & { contasFalha?: boolean } = {}) {
  const banco = bancoFalso(cenario(), opcoes);
  const ordem: string[] = [];
  const cliente = {
    from: (tabela: string) => {
      ordem.push(tabela);
      if (tabela === "contas_manuais") {
        return {
          select: () => ({
            is: () => ({
              order: () => ({
                range: async () =>
                  opcoes.contasFalha ? { data: null, error: { message: "relation contas_manuais" } } : { data: [], error: null },
              }),
            }),
          }),
        };
      }
      return banco.cliente.from(tabela);
    },
    rpc: vi.fn(),
  };
  return { cliente, banco, ordem };
}

function enviadorQue(resposta: (e: string) => ResultadoDoEnvio = () => ({ ok: true })) {
  const enviar = vi.fn<EnviarPush>(async (inscricao) => resposta(inscricao.endpoint));
  mocks.configuracaoVapid.mockReturnValue({ subject: "https://app.exemplo", chavePublica: "pub", chavePrivada: CHAVE_PRIVADA });
  mocks.criarEnviadorWebPush.mockReturnValue(enviar);
  return enviar;
}

const chamar = (cabecalho: string = `Bearer ${SEGREDO}`) =>
  GET(new Request("http://localhost/api/cron/diario", { headers: { authorization: cabecalho } }));

let console_: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };
const linhasDeLog = () =>
  [...console_.log.mock.calls, ...console_.warn.mock.calls, ...console_.error.mock.calls].map(
    (c) => JSON.parse(c[0] as string) as Record<string, unknown>,
  );
const tudoNoLog = () => JSON.stringify(linhasDeLog());
const doAviso = () => linhasDeLog().filter((l) => l.evento === "cron.diario.notificacoes");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // 09:00 em Brasília de 17/11/26: o primeiro dia de atraso do Lucas (vencimento 06/11 + tolerância 10 + 1).
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  vi.stubEnv("CRON_SECRET", SEGREDO);
  mocks.configuracaoVapid.mockReturnValue(null);
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

describe("GET /api/cron/diario: o aviso do sistema (7.5)", () => {
  it("depois da materialização, avisa o atraso do Lucas; a resposta continua sendo só a da materialização", async () => {
    const { cliente, banco, ordem } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    const enviar = enviadorQue();

    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(banco.dados.lembretes_enviados).toMatchObject([{ owner_id: DONO, tipo: "atraso", referencia: "b-lucas", dia: "2026-11-17" }]);
    // A materialização (contas_manuais) vem antes de qualquer leitura do aviso.
    expect(ordem[0]).toBe("contas_manuais");
    expect(ordem.indexOf("push_inscricoes")).toBeGreaterThan(0);
  });

  it("registra só as contagens: enviadas, ignoradas, inscrições apagadas e falhas", async () => {
    mocks.criarClienteAdmin.mockReturnValue(montar().cliente);
    enviadorQue();
    await chamar();
    expect(doAviso()).toEqual([
      {
        nivel: "info",
        evento: "cron.diario.notificacoes",
        codigo: "cron.notificou",
        rota: "/api/cron/diario",
        enviadas: 1,
        ignoradas: 0,
        inscricoes_apagadas: 0,
        falhas: 0,
      },
    ]);
  });

  it("segunda execução no mesmo dia: não envia de novo (a chave já está em lembretes_enviados)", async () => {
    mocks.criarClienteAdmin.mockReturnValue(montar().cliente); // o mesmo banco de mentira nas duas execuções
    const enviar = enviadorQue();
    await chamar();
    await chamar();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(doAviso().map((l) => [l.enviadas, l.ignoradas])).toEqual([
      [1, 0],
      [0, 0],
    ]);
  });

  it("sem as chaves VAPID: não lê inscrição nenhuma, responde 200 e avisa no log só o código", async () => {
    const { cliente, ordem } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    mocks.configuracaoVapid.mockReturnValue(null);
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(mocks.criarEnviadorWebPush).not.toHaveBeenCalled();
    expect(ordem).toEqual(["contas_manuais"]);
    expect(doAviso()).toEqual([
      { nivel: "warn", evento: "cron.diario.notificacoes", codigo: "cron.notificacao_sem_chaves", rota: "/api/cron/diario" },
    ]);
  });

  it("falha do envio (todos os aparelhos recusam por erro qualquer): 200 do mesmo jeito, falha contada, nada desfeito", async () => {
    const { cliente, banco } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    enviadorQue(() => ({ ok: false, status: 500 }));
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(doAviso()[0]).toMatchObject({ nivel: "warn", codigo: "cron.notificou", enviadas: 0, falhas: 1 });
    expect(banco.dados.push_inscricoes).toHaveLength(1);
  });

  it("410: a inscrição é apagada e isso aparece na contagem do log", async () => {
    const { cliente, banco } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    enviadorQue(() => ({ ok: false, status: 410 }));
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(banco.dados.push_inscricoes).toEqual([]);
    expect(doAviso()[0]).toMatchObject({ codigo: "cron.notificou", inscricoes_apagadas: 1 });
  });

  it("o envio explode ao ser criado: 200, e o log diz só o código (sem o texto do erro)", async () => {
    mocks.criarClienteAdmin.mockReturnValue(montar().cliente);
    mocks.configuracaoVapid.mockReturnValue({ subject: "https://app.exemplo", chavePublica: "pub", chavePrivada: CHAVE_PRIVADA });
    mocks.criarEnviadorWebPush.mockImplementation(() => {
      throw new Error(`falhou com ${CHAVE_PRIVADA} e ${ENDPOINT}`);
    });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(doAviso()).toEqual([
      { nivel: "warn", evento: "cron.diario.notificacoes", codigo: "cron.notificacao_excecao", rota: "/api/cron/diario" },
    ]);
    expect(tudoNoLog()).not.toContain(CHAVE_PRIVADA);
    expect(tudoNoLog()).not.toContain(ENDPOINT);
  });

  it("a migração ainda não entrou (push_inscricoes não existe): 200, o Cron não vira 500 e o log diz só o código", async () => {
    mocks.criarClienteAdmin.mockReturnValue(montar({ semTabela: ["push_inscricoes"] }).cliente);
    const enviar = enviadorQue();
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, quantidade: 0 });
    expect(enviar).not.toHaveBeenCalled();
    expect(doAviso()).toEqual([
      { nivel: "warn", evento: "cron.diario.notificacoes", codigo: "cron.notificacao_sem_tabela", rota: "/api/cron/diario" },
    ]);
  });

  it("sem inscrição nenhuma: 200, nada gravado, e o log diz info com o código", async () => {
    const banco = montar();
    banco.banco.dados.push_inscricoes = [];
    mocks.criarClienteAdmin.mockReturnValue(banco.cliente);
    enviadorQue();
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(banco.banco.dados.lembretes_enviados).toEqual([]);
    expect(doAviso()).toEqual([
      { nivel: "info", evento: "cron.diario.notificacoes", codigo: "cron.notificacao_sem_inscricao", rota: "/api/cron/diario" },
    ]);
  });

  it("a materialização falhou: o 500 é o de sempre (sem texto do erro) e o aviso do dia ainda sai", async () => {
    const { cliente } = montar({ contasFalha: true });
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    const enviar = enviadorQue();
    const r = await chamar();
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, erro: "cron.falhou", quantidade: 0 });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("sem o segredo do Cron: 401, e nem as chaves VAPID nem o banco são tocados", async () => {
    const { cliente, ordem } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    enviadorQue();
    const r = await chamar("Bearer errado");
    expect(r.status).toBe(401);
    expect(mocks.criarClienteAdmin).not.toHaveBeenCalled();
    expect(mocks.configuracaoVapid).not.toHaveBeenCalled();
    expect(ordem).toEqual([]);
  });
});

describe("GET /api/cron/diario: log do aviso (AD-17)", () => {
  it("só campos da lista permitida, e nunca endpoint, chave, texto do aviso, nome do Bloco, valor ou dono", async () => {
    // Um 410 e um erro qualquer, para o caminho com mais campos.
    const { cliente } = montar();
    mocks.criarClienteAdmin.mockReturnValue(cliente);
    enviadorQue(() => ({ ok: false, status: 410 }));
    await chamar();
    await chamar("Bearer errado");

    const permitidos = new Set<string>(["nivel", "evento", "codigo", ...CAMPOS_PERMITIDOS]);
    const linhas = linhasDeLog();
    expect(linhas.length).toBeGreaterThanOrEqual(3);
    for (const linha of linhas) for (const chave of Object.keys(linha)) expect(permitidos.has(chave)).toBe(true);
    for (const proibido of [ENDPOINT, "push.exemplo", CHAVE_PRIVADA, "p256dh", "auth-de-teste", "Lucas", "115", "em atraso", "b-lucas", DONO, SEGREDO]) {
      expect(tudoNoLog()).not.toContain(proibido);
    }
  });

  it("os campos novos do aviso estão na lista permitida do log", () => {
    for (const campo of ["enviadas", "ignoradas", "inscricoes_apagadas", "falhas"]) {
      expect(CAMPOS_PERMITIDOS).toContain(campo);
    }
  });
});
