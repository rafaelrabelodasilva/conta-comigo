import { describe, expect, it } from "vitest";
import {
  avaliarFormularioConta,
  parcelasDaConta,
  type ContaParaParcelas,
  type ContextoDoFormulario,
  type NovaConta,
  type RascunhoDaConta,
} from "./contas-manuais";
import { hojeEmSaoPaulo } from "./datas";
import { lerContaDoCron, planoDoCron } from "./materializacao-diaria";
import { mesAtual } from "./painel";

type Lida = { owner_id: string; conta: ContaParaParcelas };

const DONO = "11111111-1111-4111-8111-111111111111";
const OUTRO_DONO = "22222222-2222-4222-8222-222222222222";
const ID_BOMBINHAS = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_SILVIA = "aaaaaaaa-0000-4000-8000-000000000002";
const ID_TVBOX = "aaaaaaaa-0000-4000-8000-000000000003";
const ID_ENCERRADA = "aaaaaaaa-0000-4000-8000-000000000004";

const MAE = "r-mae";
const CASAL = "r-casal";
const LUCAS = "r-lucas";
const RAFAEL = "r-rafael";
const VIAGEM = "t-viagem";

const CTX: ContextoDoFormulario = {
  mesAtual: "2026-11",
  tiposAtivos: new Set([VIAGEM]),
  responsaveisAtivos: new Set([MAE, CASAL, LUCAS, RAFAEL]),
};

const BOMBINHAS: RascunhoDaConta = {
  nome: "Bombinhas",
  valor: "318,00",
  repeticao: "parcelas",
  parcelas: "6",
  comecaEm: "2026-07",
  tipo_id: VIAGEM,
  observacao: "",
  partes: [
    { responsavel_id: MAE, texto: "106,00" },
    { responsavel_id: CASAL, texto: "106,00" },
    { responsavel_id: LUCAS, texto: "106,00" },
  ],
};

function nova(r: RascunhoDaConta, id: string): NovaConta {
  const a = avaliarFormularioConta(id, r, CTX);
  expect(a.erros).toEqual({});
  return a.conta as NovaConta;
}

/** Uma linha de `contas_manuais` como o Supabase a devolve (só as colunas que o cron lê). */
function linha(c: NovaConta, extra: Record<string, unknown> = {}, dono = DONO) {
  return {
    id: c.id,
    owner_id: dono,
    valor_centavos: c.valor_centavos,
    mes_inicial: c.mes_inicial,
    repeticao: c.repeticao,
    parcela_total: c.parcela_total,
    divisao: c.divisao,
    encerrada_em_mes: null,
    ...extra,
  };
}

const bombinhas = () => linha(nova(BOMBINHAS, ID_BOMBINHAS));
const silvia = () =>
  linha(
    nova(
      { ...BOMBINHAS, nome: "Silvia", valor: "400,00", repeticao: "mensal", comecaEm: "2026-01", partes: [{ responsavel_id: RAFAEL, texto: "" }] },
      ID_SILVIA,
    ),
  );

/** O Mês atual como a rota o calcula: o relógio do servidor em America/Sao_Paulo. */
const mesDe = (instante: string) => mesAtual(hojeEmSaoPaulo(new Date(instante)));

describe("o Mês atual do cron (America/Sao_Paulo) e o horizonte (Mês atual + 12)", () => {
  it("12:00 UTC é 09:00 em Brasília: o Mês é o do dia", () => {
    expect(mesDe("2026-11-15T12:00:00Z")).toBe("2026-11");
    expect(planoDoCron([], mesDe("2026-11-15T12:00:00Z")).ate_mes).toBe("2027-11");
  });

  it("virada do mês: 02:00 UTC do dia 1º ainda é o dia 30 em São Paulo", () => {
    expect(mesDe("2026-12-01T02:00:00Z")).toBe("2026-11");
    expect(planoDoCron([], mesDe("2026-12-01T02:00:00Z")).ate_mes).toBe("2027-11");
    // 00:00 em São Paulo (03:00 UTC) já é dezembro.
    expect(mesDe("2026-12-01T03:00:00Z")).toBe("2026-12");
    expect(planoDoCron([], mesDe("2026-12-01T03:00:00Z")).ate_mes).toBe("2027-12");
  });

  it("virada do ano: 31/12 às 23:59 em São Paulo é dezembro; 1º/1 às 00:00 é janeiro", () => {
    expect(mesDe("2027-01-01T02:59:00Z")).toBe("2026-12");
    expect(planoDoCron([], mesDe("2027-01-01T02:59:00Z")).ate_mes).toBe("2027-12");
    expect(mesDe("2027-01-01T03:00:00Z")).toBe("2027-01");
    expect(planoDoCron([], mesDe("2027-01-01T03:00:00Z")).ate_mes).toBe("2028-01");
  });

  it("a hora do Cron (12:00 UTC) cai no mesmo dia de São Paulo com ou sem horário de verão", () => {
    // Sem horário de verão (desde 2019): 09:00. Se voltasse (UTC-2): 10:00. Nos dois, o mesmo dia.
    for (const instante of ["2026-01-31T12:00:00Z", "2026-02-01T12:00:00Z", "2026-12-31T12:00:00Z", "2027-01-01T12:00:00Z"]) {
      expect(hojeEmSaoPaulo(new Date(instante))).toBe(instante.slice(0, 10));
    }
  });
});

describe("planoDoCron: o que o cron pede ao banco", () => {
  it("um pedido por Conta, com as parcelas de `parcelasDaConta` até o Mês atual + 12", () => {
    const plano = planoDoCron([bombinhas(), silvia()], "2026-11");
    expect(plano).toMatchObject({ ate_mes: "2027-11", contas: 2, ilegiveis: 0 });
    expect(plano.pedidos).toHaveLength(2);

    const b = plano.pedidos.find((p) => p.conta_id === ID_BOMBINHAS)!;
    expect(b.owner_id).toBe(DONO);
    expect(b.pedido).toMatchObject({ p_owner_id: DONO, p_ate_mes: "2027-11" });
    expect(b.pedido.p_parcelas).toHaveLength(6);
    expect(b.pedido.p_parcelas.map((p) => p.mes)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(b.pedido.p_parcelas[0].partes).toHaveLength(3);

    // A Silvia desde Jan/26: 23 parcelas (Jan/26 = 1, Nov/26 = 11, Nov/27 = 23), sem "n/N".
    const s = plano.pedidos.find((p) => p.conta_id === ID_SILVIA)!;
    expect(s.pedido.p_parcelas).toHaveLength(23);
    expect(s.pedido.p_parcelas[10]).toMatchObject({ parcela_n: 11, mes: "2026-11" });
    expect(s.pedido.p_parcelas[22]).toMatchObject({ parcela_n: 23, mes: "2027-11" });
  });

  it("as parcelas do pedido são exatamente as de `parcelasDaConta` (a rota e o SQL não reimplementam)", () => {
    const plano = planoDoCron([silvia()], "2026-11");
    const lida = (lerContaDoCron(silvia()) as Lida).conta;
    const esperadas = parcelasDaConta(lida, "2027-11").map((p) => ({
      conta_id: p.conta_id,
      parcela_n: p.parcela_n,
      mes: p.mes,
      valor_centavos: p.valor_centavos,
      partes: p.partes,
    }));
    expect(plano.pedidos[0].pedido.p_parcelas).toEqual(esperadas);
  });

  it("sem Contas: nenhum pedido (a rota responde 200 com quantidade 0)", () => {
    expect(planoDoCron([], "2026-11")).toEqual({ ate_mes: "2027-11", contas: 0, ilegiveis: 0, excluidas: 0, pedidos: [] });
  });

  it("a Conta encerrada não gera parcelas do Mês do encerramento em diante", () => {
    const encerrada = linha(
      nova({ ...BOMBINHAS, nome: "TVbox", valor: "50,00", repeticao: "mensal", comecaEm: "2026-01", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, ID_ENCERRADA),
      { encerrada_em_mes: "2026-09" },
    );
    const plano = planoDoCron([encerrada], "2026-11");
    expect(plano.ilegiveis).toBe(0);
    expect(plano.pedidos[0].pedido.p_parcelas.map((p) => p.mes)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
  });

  it("encerrada no próprio Mês inicial, ou começando além do horizonte: sem pedido, mas legível", () => {
    const aoMes = nova({ ...BOMBINHAS, repeticao: "mensal", comecaEm: "2026-10", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, ID_ENCERRADA);
    const futura = nova({ ...BOMBINHAS, repeticao: "mensal", comecaEm: "2028-03", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, ID_TVBOX);
    const plano = planoDoCron([linha(aoMes, { encerrada_em_mes: "2026-10" }), linha(futura)], "2026-11");
    expect(plano).toMatchObject({ contas: 2, ilegiveis: 0, pedidos: [] });
  });

  it("a Conta apagada some: só entra o que o banco devolveu", () => {
    const antes = planoDoCron([bombinhas(), silvia()], "2026-11");
    const depois = planoDoCron([silvia()], "2026-11");
    expect(antes.pedidos.map((p) => p.conta_id)).toContain(ID_BOMBINHAS);
    expect(depois.pedidos.map((p) => p.conta_id)).toEqual([ID_SILVIA]);
  });

  it("a Conta excluída (`excluido_em`) não gera pedido, não é ilegível e as outras seguem (5.4)", () => {
    const excluida = { ...bombinhas(), excluido_em: "2026-11-15T12:00:00+00:00" };
    const plano = planoDoCron([excluida, silvia()], "2026-11");
    expect(plano).toMatchObject({ contas: 2, ilegiveis: 0, excluidas: 1 });
    expect(plano.pedidos.map((p) => p.conta_id)).toEqual([ID_SILVIA]);
    // `excluido_em` nulo ou ausente é Conta viva; um valor que não é texto ou nulo é defeito de dado.
    expect(planoDoCron([{ ...bombinhas(), excluido_em: null }], "2026-11").pedidos).toHaveLength(1);
    expect(planoDoCron([{ ...bombinhas(), excluido_em: 123 }], "2026-11")).toMatchObject({ ilegiveis: 1, excluidas: 0, pedidos: [] });
    expect(lerContaDoCron(excluida)).toBe("excluida");
  });

  it("cada parcela leva a versão da Conta (`updated_at`) de que saiu, para o banco ignorar a que mudou no meio (5.4)", () => {
    const versao = "2026-11-15T12:00:00.123456+00:00";
    const plano = planoDoCron([{ ...silvia(), updated_at: versao }], "2026-11");
    expect(plano.pedidos[0].pedido.p_parcelas.every((p) => p.conta_atualizada_em === versao)).toBe(true);
    // Sem a coluna (o teste das outras linhas), o pedido não leva a chave.
    expect("conta_atualizada_em" in planoDoCron([silvia()], "2026-11").pedidos[0].pedido.p_parcelas[0]).toBe(false);
  });

  it("uma Conta ilegível é pulada e contada, sem derrubar as outras", () => {
    const ruins: unknown[] = [
      null,
      "texto",
      [],
      { ...bombinhas(), id: "nao-e-uuid" },
      { ...bombinhas(), owner_id: null },
      { ...bombinhas(), valor_centavos: -5 },
      { ...bombinhas(), valor_centavos: "318,00" },
      { ...bombinhas(), mes_inicial: "2026-13" },
      { ...bombinhas(), repeticao: "semanal" },
      { ...bombinhas(), parcela_total: null }, // parcelas sem total
      { ...silvia(), parcela_total: 6 }, // mensal com total
      { ...bombinhas(), divisao: { partes: "lixo" } }, // Divisão que não se lê
      { ...bombinhas(), encerrada_em_mes: "setembro" },
      { ...bombinhas(), encerrada_em_mes: undefined },
    ];
    const plano = planoDoCron([bombinhas(), ...ruins, silvia()], "2026-11");
    expect(plano.contas).toBe(2 + ruins.length);
    expect(plano.ilegiveis).toBe(ruins.length);
    expect(plano.pedidos.map((p) => p.conta_id)).toEqual([ID_BOMBINHAS, ID_SILVIA]);
  });

  it("vários donos: um pedido por Conta, cada um com o seu dono, em ordem estável", () => {
    const deOutro = linha(
      nova({ ...BOMBINHAS, nome: "Outra", valor: "10,00", repeticao: "mensal", comecaEm: "2026-11", partes: [{ responsavel_id: RAFAEL, texto: "" }] }, ID_TVBOX),
      {},
      OUTRO_DONO,
    );
    const plano = planoDoCron([deOutro, silvia(), bombinhas()], "2026-11");
    expect(plano.pedidos.map((p) => [p.owner_id, p.conta_id, p.pedido.p_owner_id])).toEqual([
      [DONO, ID_BOMBINHAS, DONO],
      [DONO, ID_SILVIA, DONO],
      [OUTRO_DONO, ID_TVBOX, OUTRO_DONO],
    ]);
    // Cada pedido só leva parcelas da própria Conta.
    for (const p of plano.pedidos) expect(new Set(p.pedido.p_parcelas.map((x) => x.conta_id))).toEqual(new Set([p.conta_id]));
  });

  it("idempotência no núcleo: rodar duas vezes no mesmo dia pede exatamente o mesmo (o banco não cria nada novo)", () => {
    const linhas = [bombinhas(), silvia()];
    const a = planoDoCron(linhas, "2026-11");
    const b = planoDoCron(linhas, "2026-11");
    expect(b).toEqual(a);
  });

  it("não muda a entrada", () => {
    const linhas = [bombinhas(), silvia()];
    const copia = structuredClone(linhas);
    planoDoCron(linhas, "2026-11");
    expect(linhas).toEqual(copia);
  });

  it("o pedido não carrega Nome nem Observação (o cron nem lê esses campos)", () => {
    const plano = planoDoCron([bombinhas()], "2026-11");
    const texto = JSON.stringify(plano);
    expect(texto).not.toContain("Bombinhas");
    expect(Object.keys(plano.pedidos[0].pedido).sort()).toEqual(["p_ate_mes", "p_owner_id", "p_parcelas"]);
  });
});

describe("lerContaDoCron", () => {
  it("aceita a linha do banco e devolve o dono e a Conta para `parcelasDaConta`", () => {
    const lida = lerContaDoCron(bombinhas()) as Lida;
    expect(lida.owner_id).toBe(DONO);
    expect(lida.conta).toMatchObject({ id: ID_BOMBINHAS, valor_centavos: 31_800, repeticao: "parcelas", parcela_total: 6, encerrada_em_mes: null });
  });

  it("aceita UUID em maiúsculas (o Postgres devolve minúsculas, mas a regra não depende disso)", () => {
    expect(lerContaDoCron({ ...silvia(), id: ID_SILVIA.toUpperCase() })).not.toBeNull();
  });
});
