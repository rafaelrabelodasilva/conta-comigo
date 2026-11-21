import { describe, expect, it } from "vitest";
import { avisosDeConferencia, referenciaDaConferencia, type FaturaParaAviso } from "./avisos-conferencia";
import { conferir, type CartaoParaConferir, type LancamentoParaConferir } from "./conferencia";
import { formatarDinheiro } from "./dinheiro";
import { frasesFaixaConferencia, textoDoAviso } from "./mensagens";

// O aviso da Conferência (História 8.2, FR-55): uma Fatura importada cuja Conferência não bate e que não foi
// dispensada, com a chave que diz quando um aviso lido volta. Não depende de "hoje".

const fatura = (mes: string, extra: Partial<FaturaParaAviso> = {}): FaturaParaAviso => ({
  id: `f-${mes}`,
  mes,
  total_despesas_centavos: 100_000,
  total_creditos_centavos: 0,
  fechamento: `${mes === "2026-11" ? "2026-10" : "2026-09"}-28`,
  vencimento: `${mes}-06`,
  alerta_dispensado_em: null,
  ...extra,
});

const cartao = (faturaId: string, final: string, total = 100_000): CartaoParaConferir => ({
  fatura_id: faturaId,
  final,
  total_centavos: total,
});

const lanc = (faturaId: string, valor: number, final = "8673", extra: Partial<LancamentoParaConferir> = {}): LancamentoParaConferir => ({
  fatura_id: faturaId,
  valor_centavos: valor,
  final_cartao: final,
  excluido_em: null,
  ...extra,
});

/** Novembro com R$ 720,00 a menos do que a Fatura diz (R$ 1.000,00 lidos, R$ 280,00 gravados), no cartão 8673. */
const NOV = fatura("2026-11");
const cartoesNov = [cartao(NOV.id, "8673")];
const lancamentosNov = [lanc(NOV.id, 28_000)];

describe("avisosDeConferencia: quando há aviso", () => {
  it("a Fatura que bate não tem aviso", () => {
    expect(avisosDeConferencia([NOV], cartoesNov, [lanc(NOV.id, 100_000)])).toEqual([]);
  });

  it("a Fatura com diferença tem um aviso: Mês, chave, destino e a Conferência da faixa", () => {
    const r = avisosDeConferencia([NOV], cartoesNov, lancamentosNov);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      tipo: "conferencia",
      mes: "2026-11",
      referencia: "2026-11:-72000:0:8673",
      dia: "2026-10-28",
      destino: "/?mes=2026-11",
      // O id da Fatura: "Dispensar" na Central (8.3) grava `alerta_dispensado_em` nela, como a faixa do Painel.
      faturaId: NOV.id,
    });
    // A mesma Conferência que o Painel desenha: o texto do aviso usa as frases da faixa, sem texto duplicado.
    expect(r[0].conferencia).toEqual(conferir(NOV, cartoesNov, lancamentosNov));
    const texto = textoDoAviso(r[0]);
    expect(texto.startsWith("Fatura de novembro/26 com diferença. ")).toBe(true);
    for (const frase of frasesFaixaConferencia(r[0].conferencia)) expect(texto).toContain(frase);
    expect(texto).toContain(`${formatarDinheiro(72_000)} abaixo do total da fatura.`);
  });

  it("a Fatura dispensada não tem aviso; a reimportação (a dispensa volta a nulo) o traz de volta", () => {
    const dispensada = { ...NOV, alerta_dispensado_em: "2026-11-18T12:00:00Z" };
    expect(avisosDeConferencia([dispensada], cartoesNov, lancamentosNov)).toEqual([]);
    expect(avisosDeConferencia([{ ...dispensada, alerta_dispensado_em: null }], cartoesNov, lancamentosNov)).toHaveLength(1);
  });

  it("some sozinho quando a Conferência volta a bater (entra o Lançamento que faltava)", () => {
    expect(avisosDeConferencia([NOV], cartoesNov, lancamentosNov)).toHaveLength(1);
    expect(avisosDeConferencia([NOV], cartoesNov, [...lancamentosNov, lanc(NOV.id, 72_000)])).toEqual([]);
  });

  it("some quando a Fatura é reimportada e passa a bater (totais novos)", () => {
    const reimportada = { ...NOV, total_despesas_centavos: 28_000 };
    expect(avisosDeConferencia([reimportada], [cartao(NOV.id, "8673", 28_000)], lancamentosNov)).toEqual([]);
  });

  it("Lançamento excluído, filha de Divisão e Lançamento de outra Fatura não mexem na soma", () => {
    const ruido = [
      lanc(NOV.id, 72_000, "8673", { excluido_em: "2026-11-10T00:00:00Z" }),
      lanc(NOV.id, 72_000, "8673", { dividido_de_id: "mae" }),
      lanc("f-outra", 72_000),
      lanc(null as unknown as string, 72_000),
    ];
    const r = avisosDeConferencia([NOV], cartoesNov, [...lancamentosNov, ...ruido]);
    expect(r[0].referencia).toBe("2026-11:-72000:0:8673");
  });

  it("Fatura sem fechamento lido usa o vencimento como dia da chave", () => {
    const r = avisosDeConferencia([{ ...NOV, fechamento: null }], cartoesNov, lancamentosNov);
    expect(r[0].dia).toBe("2026-11-06");
  });
});

describe("avisosDeConferencia: a chave", () => {
  it("a mesma diferença dá a mesma chave (lida continua lida) e uma diferença nova dá outra", () => {
    const antes = avisosDeConferencia([NOV], cartoesNov, lancamentosNov)[0];
    // Outro Lançamento troca de valor, mas a soma é a mesma: mesma diferença, mesma chave.
    const mesma = avisosDeConferencia([NOV], cartoesNov, [lanc(NOV.id, 10_000), lanc(NOV.id, 18_000)])[0];
    expect(mesma.referencia).toBe(antes.referencia);
    // Entrou um Lançamento que mexeu na soma: outra diferença, outra chave.
    const mexeu = avisosDeConferencia([NOV], cartoesNov, [...lancamentosNov, lanc(NOV.id, 2_000)])[0];
    expect(mexeu.referencia).toBe("2026-11:-70000:0:8673");
    expect(mexeu.referencia).not.toBe(antes.referencia);
    // Reimportou e a Fatura diz outro total: a diferença é outra.
    const reimportada = avisosDeConferencia([{ ...NOV, total_despesas_centavos: 90_000 }], [cartao(NOV.id, "8673", 90_000)], lancamentosNov)[0];
    expect(reimportada.referencia).toBe("2026-11:-62000:0:8673");
  });

  it("a diferença nos créditos, acima ou abaixo, e os finais entram na chave (o sinal conta)", () => {
    const base = [lanc(NOV.id, 100_000)];
    const credito = (v: number) =>
      avisosDeConferencia([NOV], cartoesNov, [...base, lanc(NOV.id, -v, "8673")])[0].referencia;
    expect(credito(800)).toBe("2026-11:0:800:");
    const abaixo = avisosDeConferencia([{ ...NOV, total_creditos_centavos: 2_000 }], cartoesNov, [...base, lanc(NOV.id, -800)])[0];
    expect(abaixo.referencia).toBe("2026-11:0:-1200:");
    expect(abaixo.referencia).not.toBe(credito(800));
  });

  it("dois cartões com diferença são UM aviso por Fatura, com os finais na chave e na frase", () => {
    const cartoes = [cartao(NOV.id, "3967", 50_000), cartao(NOV.id, "8673", 50_000)];
    const lancamentos = [lanc(NOV.id, 40_000, "3967"), lanc(NOV.id, 40_000, "8673")];
    const r = avisosDeConferencia([NOV], cartoes, lancamentos);
    expect(r).toHaveLength(1);
    expect(r[0].referencia).toBe("2026-11:-20000:0:3967,8673");
    expect(textoDoAviso(r[0])).toContain("A diferença está nos cartões finais 3967 e 8673.");
  });

  it("a frase muda se, e só se, a chave muda (a chave diz exatamente o que o texto diz)", () => {
    const cenarios = [
      lancamentosNov,
      [lanc(NOV.id, 10_000), lanc(NOV.id, 18_000)],
      [lanc(NOV.id, 28_000), lanc(NOV.id, 2_000)],
      [lanc(NOV.id, 130_000)],
      [lanc(NOV.id, 100_000), lanc(NOV.id, -500)],
      [lanc(NOV.id, 28_000, "1111")],
      [lanc(NOV.id, 28_000), lanc(NOV.id, 5_000, "1111")],
    ];
    const resultado = cenarios.map((l) => {
      const a = avisosDeConferencia([NOV], cartoesNov, l)[0];
      return { chave: a.referencia, frase: frasesFaixaConferencia(a.conferencia).join(" ") };
    });
    for (const x of resultado) {
      for (const y of resultado) expect(x.chave === y.chave).toBe(x.frase === y.frase);
    }
  });

  it("a chave não depende de 'hoje' nem de nada fora das linhas: só as entradas decidem", () => {
    const a = avisosDeConferencia([NOV], cartoesNov, lancamentosNov);
    const b = avisosDeConferencia([NOV], cartoesNov, lancamentosNov);
    expect(b).toEqual(a);
  });

  it("cabe nos 64 caracteres da coluna, mesmo com muitos cartões", () => {
    const finais = Array.from({ length: 30 }, (_, i) => String(1000 + i));
    const cartoes = finais.map((f) => cartao(NOV.id, f, 1_000));
    const lancamentos = finais.map((f) => lanc(NOV.id, 5, f));
    const r = avisosDeConferencia([NOV], cartoes, lancamentos);
    expect(r[0].referencia.length).toBeLessThanOrEqual(64);
    expect(r[0].referencia.startsWith("2026-11:")).toBe(true);
    expect(referenciaDaConferencia("2026-11", r[0].conferencia)).toBe(r[0].referencia);
  });
});

describe("avisosDeConferencia: vários Meses", () => {
  const OUT = fatura("2026-10", { fechamento: "2026-09-28" });
  const SET = fatura("2026-09", { fechamento: "2026-08-28" });
  const cartoes = [cartao(NOV.id, "8673"), cartao(OUT.id, "8673"), cartao(SET.id, "8673")];

  it("todas as Faturas com diferença e sem dispensa, do Mês mais novo para o mais antigo", () => {
    const lancamentos = [lanc(NOV.id, 28_000), lanc(OUT.id, 100_000), lanc(SET.id, 90_000)];
    const r = avisosDeConferencia([SET, OUT, NOV], cartoes, lancamentos);
    expect(r.map((a) => a.mes)).toEqual(["2026-11", "2026-09"]);
    expect(r.map((a) => a.referencia)).toEqual(["2026-11:-72000:0:8673", "2026-09:-10000:0:8673"]);
    expect(r.map((a) => a.dia)).toEqual(["2026-10-28", "2026-08-28"]);
  });

  it("um Mês antigo com diferença continua na lista até ser resolvido ou dispensado", () => {
    const lancamentos = [lanc(NOV.id, 100_000), lanc(OUT.id, 100_000), lanc(SET.id, 90_000)];
    expect(avisosDeConferencia([NOV, OUT, SET], cartoes, lancamentos).map((a) => a.mes)).toEqual(["2026-09"]);
    const dispensada = { ...SET, alerta_dispensado_em: "2026-11-18T12:00:00Z" };
    expect(avisosDeConferencia([NOV, OUT, dispensada], cartoes, lancamentos)).toEqual([]);
  });

  it("a ordem da entrada não muda a saída e a entrada não é alterada", () => {
    const lancamentos = [lanc(NOV.id, 28_000), lanc(OUT.id, 10_000), lanc(SET.id, 90_000)];
    const faturas = [NOV, OUT, SET];
    const copia = structuredClone({ faturas, lancamentos });
    const a = avisosDeConferencia(faturas, cartoes, lancamentos);
    expect(avisosDeConferencia([...faturas].reverse(), [...cartoes].reverse(), [...lancamentos].reverse())).toEqual(a);
    expect({ faturas, lancamentos }).toEqual(copia);
  });

  it("sem Faturas, sem aviso", () => {
    expect(avisosDeConferencia([], [], lancamentosNov)).toEqual([]);
  });
});
