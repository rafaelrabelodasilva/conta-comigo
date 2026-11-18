import { describe, expect, it } from "vitest";
import { avaliar, type Formula } from "./formula";
import { avisoDosItensDeFora } from "./projecoes";
import {
  pendentesDosLancamentos,
  projetarMensagem,
  projetarMensagemDoBloco,
  projetarPendente,
  type LancamentoParaMensagem,
  type LancamentoParaPendente,
} from "./projecoes";
import { montarCartoesDeCobranca } from "./recebimentos";
import type { Bloco } from "./blocos";

// Dívida programada na cobrança (História 6.6, FR-27, AD-10, AD-11): uma Dívida ainda não vencida (o Mês do
// `vencimento_combinado` ainda não chegou) fica fora da mensagem e do Saldo pendente, com a MESMA regra
// (`dividaAindaNaoVence`); no Mês do vencimento passa a entrar. `hoje` é parâmetro (America/Sao_Paulo).

const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const STATUS_PAGOS = new Set([PAGO]);
const MES = "2026-07";

const msg = (id: string, extra: Partial<LancamentoParaMensagem> = {}): LancamentoParaMensagem => ({
  id,
  mes: MES,
  excluido_em: null,
  valor_centavos: 10_600,
  responsavel_id: "lucas",
  tipo_id: "viagem",
  nome: "BOMBINHAS",
  apelido: null,
  parcela_n: 1,
  parcela_total: 6,
  status_id: NAO_PAGO,
  lancado_por: "manual",
  ordem_fatura: Number(id.replace(/\D/g, "")) || 1,
  ...extra,
});

const opcoesMsg = (hoje: string, extra: Record<string, unknown> = {}) => ({
  mes: MES,
  statusPagos: STATUS_PAGOS,
  temFatura: true,
  incluirPrevistos: false,
  hoje,
  ...extra,
});

describe("a mensagem: Dívida programada ainda não vencida fica fora até o Mês do vencimento", () => {
  const lucas = msg("1", { vencimento_combinado: "2027-04-06" });
  const mae = msg("2", { responsavel_id: "mae" });

  it("antes do Mês do vencimento: fora, com o motivo 'programada' e o aviso", () => {
    const r = projetarMensagem(new Set(["1", "2"]), [lucas, mae], opcoesMsg("2026-11-16"));
    expect(r.entram.map((i) => i.id)).toEqual(["2"]);
    expect(r.totalCentavos).toBe(10_600);
    expect(r.fora).toEqual({ quantidade: 1, porMotivo: { pago: 0, zero: 0, previsto: 0, programada: 1 } });
    expect(avisoDosItensDeFora(r.fora)).toBe("1 item não entra: 1 dívida programada ainda não vencida");
  });

  it("no Mês do vencimento (até no dia 1) ela passa a entrar; depois dele, também", () => {
    for (const hoje of ["2027-04-01", "2027-04-06", "2027-04-30", "2027-05-10"]) {
      const r = projetarMensagem(new Set(["1"]), [lucas], opcoesMsg(hoje));
      expect(r.entram.map((i) => i.id), hoje).toEqual(["1"]);
    }
    expect(projetarMensagem(new Set(["1"]), [lucas], opcoesMsg("2027-03-31")).entram).toEqual([]);
  });

  it("a Dívida paga continua 'já pago'; a programada de R$ 0,00 também (precedência: previsto, pago, programada, zero)", () => {
    const paga = msg("3", { vencimento_combinado: "2027-04-06", status_id: PAGO });
    const zerada = msg("4", { vencimento_combinado: "2027-04-06", valor_centavos: 0 });
    const r = projetarMensagem(new Set(["3", "4"]), [paga, zerada], opcoesMsg("2026-11-16"));
    expect(r.fora.porMotivo).toEqual({ pago: 1, zero: 0, previsto: 0, programada: 1 });
  });

  it("previsto vem antes: uma Dívida programada num Mês sem Fatura é 'previsto' até 'Incluir previstos'", () => {
    const previsto = msg("5", { vencimento_combinado: "2027-04-06", conta_manual_id: "k" });
    const sem = projetarMensagem(new Set(["5"]), [previsto], opcoesMsg("2026-11-16", { temFatura: false }));
    expect(sem.fora.porMotivo).toMatchObject({ previsto: 1, programada: 0 });
    // Com a chave ligada, o previsto passa, mas a Dívida ainda não vencida continua de fora.
    const com = projetarMensagem(new Set(["5"]), [previsto], opcoesMsg("2026-11-16", { temFatura: false, incluirPrevistos: true }));
    expect(com.fora.porMotivo).toMatchObject({ previsto: 0, programada: 1 });
  });

  it("o Ajuste da parcela fora também fica fora (segue a parcela)", () => {
    const parcela = msg("6", { vencimento_combinado: "2027-04-06", valor_centavos: 114_074 });
    const ajuste = msg("7", { ajuste_de_id: "6", valor_centavos: -8, vencimento_combinado: "2027-04-06" });
    const r = projetarMensagem(new Set(["6", "7"]), [parcela, ajuste], opcoesMsg("2026-11-16"));
    expect(r.entram).toEqual([]);
    expect(r.fora.quantidade).toBe(1);
  });

  it("Bloco (forma 2): o total e os itens saem sem a Dívida ainda não vencida", () => {
    const formula: Formula = { tipo: "responsavel", id: "lucas" };
    const doLucas = [msg("1", { vencimento_combinado: "2027-04-06" }), msg("8", { ordem_fatura: 8 })];
    const r = projetarMensagemDoBloco(formula, doLucas, opcoesMsg("2026-11-16"), { responsaveis: new Map(), tipos: new Map() });
    expect(r.ok && r.valor.entram.map((i) => i.id)).toEqual(["8"]);
    expect(r.ok && r.valor.totalCentavos).toBe(10_600);
    expect(r.ok && r.valor.fora.porMotivo.programada).toBe(1);
    // Não é "já pago": o aviso "R$ X já foram pagos" não conta a Dívida.
    expect(r.ok && r.valor.pagosCentavos).toBe(0);
  });
});

describe("o Saldo pendente: a mesma regra (projetarPendente)", () => {
  const linha = (id: string, extra: Partial<LancamentoParaPendente> = {}): LancamentoParaPendente => ({
    id,
    mes: MES,
    excluido_em: null,
    valor_centavos: 10_600,
    responsavel_id: "lucas",
    tipo_id: "viagem",
    status_id: NAO_PAGO,
    lancado_por: "fatura",
    ...extra,
  });
  const opcoes = (hoje: string, extra: Record<string, unknown> = {}) => ({ statusPagos: STATUS_PAGOS, itens: [], hoje, ...extra });

  it("antes do Mês do vencimento a Dívida não está em aberto; no Mês dele, entra com o restante", () => {
    const linhas = [linha("a", { vencimento_combinado: "2027-04-06" }), linha("b")];
    expect(pendentesDosLancamentos(linhas, opcoes("2027-03-31")).map((p) => p.id)).toEqual(["b"]);
    expect(pendentesDosLancamentos(linhas, opcoes("2027-04-01")).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("a Dívida paga em parte entra só com o que falta (no Mês do vencimento)", () => {
    const linhas = [linha("a", { vencimento_combinado: "2027-04-06" })];
    const p = pendentesDosLancamentos(linhas, opcoes("2027-04-10", { itens: [{ lancamento_id: "a", valor_centavos: 4_000 }] }));
    expect(p[0].restanteCentavos).toBe(6_600);
  });

  it("o filtro por Mês do Painel ('Falta receber') usa a mesma regra", () => {
    const linhas = [linha("a", { vencimento_combinado: "2027-04-06" }), linha("b")];
    expect(projetarPendente(linhas, opcoes("2026-11-16", { mes: MES })).map((l) => l.id)).toEqual(["b"]);
  });

  it("o crédito de algo pago e depois excluído não é Dívida: continua entrando", () => {
    const l = linha("a", { vencimento_combinado: "2027-04-06", excluido_em: "2026-11-12T12:00:00Z" });
    const p = pendentesDosLancamentos([l], opcoes("2026-11-16", { itens: [{ lancamento_id: "a", valor_centavos: 5_000 }] }));
    expect(p).toMatchObject([{ id: "a", credito: true, restanteCentavos: -5_000 }]);
  });

  it("o cartão do Lucas: 'Em dia' com a Bombinhas programada; a Dívida só aparece em 'A receber'", () => {
    const bloco = { id: "b-lucas", nome: "Lucas", formula: { tipo: "responsavel", id: "lucas" }, ordem: 1, de_cobranca: true, meu_bloco: false } as unknown as Bloco;
    const linhas = [linha("a", { vencimento_combinado: "2027-04-06" })];
    const antes = montarCartoesDeCobranca([bloco], pendentesDosLancamentos(linhas, opcoes("2026-11-16")), new Map());
    expect(antes[0]).toMatchObject({ saldoCentavos: 0, situacao: "em_dia", mesesEmAberto: [] });
    const depois = montarCartoesDeCobranca([bloco], pendentesDosLancamentos(linhas, opcoes("2027-04-02")), new Map());
    expect(depois[0]).toMatchObject({ saldoCentavos: 10_600, situacao: "nao_pago", mesesEmAberto: [MES] });
  });

  it("a Fórmula única (AD-11): a projeção alimenta `avaliar` do mesmo jeito", () => {
    const linhas = [linha("a", { vencimento_combinado: "2027-04-06" }), linha("b", { valor_centavos: 2_000 })];
    const a = avaliar({ tipo: "responsavel", id: "lucas" }, projetarPendente(linhas, opcoes("2026-11-16")));
    expect(a.ok && a.valor.valorCentavos).toBe(2_000);
  });
});
