import { describe, expect, it } from "vitest";
import {
  chaveDaSerieAlterada,
  lerContaSalva,
  mesPadraoDoEncerramento,
  parcelasRecriaveis,
  pedidoRestaurarConta,
  planoDeAlterarConta,
  planoDeEncerrarConta,
  planoDeExcluirConta,
  previaDoEncerramento,
  validarEncerramento,
  type ContaSalva,
  type EntradaDoPlano,
  type LancamentoDaConta,
  type SerieParaAlterar,
} from "./alterar-conta";
import {
  avaliarFormularioConta,
  parcelasDaConta,
  type ContextoDoFormulario,
  type NovaConta,
  type RascunhoDaConta,
} from "./contas-manuais";
import { MENSAGENS } from "./mensagens";

// A regra única de "o que pode ser recriado" e os planos de Editar, Encerrar e
// Excluir (História 5.4, FR-18, AD-15, AD-16). Mês atual: Nov/26.

const MES = "2026-11";
const T = "2026-11-10T12:00:00.000001+00:00";
const PAGO = "s-pago";
const NAO_PAGO = "s-nao";
const STATUS = new Set([PAGO]);

const CTX: ContextoDoFormulario = {
  mesAtual: MES,
  tiposAtivos: new Set(["t-saude", "t-viagem"]),
  responsaveisAtivos: new Set(["r-rafael", "r-mae", "r-casal", "r-lucas"]),
};

const SILVIA: RascunhoDaConta = {
  nome: "Silvia",
  valor: "400,00",
  repeticao: "mensal",
  parcelas: "",
  comecaEm: "2026-09",
  tipo_id: "t-saude",
  observacao: "",
  partes: [{ responsavel_id: "r-rafael", texto: "" }],
};
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

function conta(r: RascunhoDaConta, id: string): NovaConta {
  const a = avaliarFormularioConta(id, r, CTX);
  expect(a.erros).toEqual({});
  return a.conta as NovaConta;
}

function salvaDe(r: RascunhoDaConta, id: string, extra: Partial<ContaSalva> = {}): ContaSalva {
  const c = conta(r, id);
  return { ...c, encerrada_em_mes: null, updated_at: T, ...extra } as ContaSalva;
}

/** Uma linha do banco: a mãe de `mes` (`parcela_n` desde `inicio`). */
function mae(id: string, mes: string, n: number, extra: Partial<LancamentoDaConta> = {}): LancamentoDaConta {
  return { id, dividido_de_id: null, mes, parcela_n: n, status_id: NAO_PAGO, editado_em: null, excluido_em: null, updated_at: T, ...extra };
}
const filha = (id: string, de: string, mes: string, n: number, extra: Partial<LancamentoDaConta> = {}) =>
  mae(id, mes, n, { dividido_de_id: de, ...extra });

const serie = (extra: Partial<SerieParaAlterar["atual"]> = {}, outras: number[] = []): SerieParaAlterar => ({
  atual: { nome_normalizado: "SILVIA", parcela_total: null, valor_parcela_centavos: 40_000, mes_primeira_parcela: "2026-09", ocorrencia: 1, ...extra },
  ocorrenciasDeOutras: outras,
});

/** Silvia desde Set/26: Nov/26 (n=3) em diante, até o horizonte de Nov/27 (n=15). */
function silviaVivas(extra: Record<string, Partial<LancamentoDaConta>> = {}): LancamentoDaConta[] {
  const lista: LancamentoDaConta[] = [];
  for (let n = 3; n <= 15; n++) {
    const total = 8 + n; // Set/26 = 9º mês do ano 2026 → n=1
    const ano = 2026 + Math.floor((total - 1) / 12);
    const mes = ((total - 1) % 12) + 1;
    const id = `s${n}`;
    lista.push(mae(id, `${ano}-${String(mes).padStart(2, "0")}`, n, extra[id] ?? {}));
  }
  return lista;
}

const entrada = (existentes: readonly LancamentoDaConta[], extra: Partial<EntradaDoPlano> = {}): EntradaDoPlano => ({
  mesAtual: MES,
  statusQueContam: STATUS,
  existentes,
  ...extra,
});

describe("parcelasRecriaveis: a regra única", () => {
  it("uma parcela sem edição à mão, sem Status pago e sem Pagamento é recriável", () => {
    const r = parcelasRecriaveis(silviaVivas(), STATUS, MES);
    expect(r.mantidas).toEqual([]);
    expect(r.recriaveis.map((p) => p.mes)).toHaveLength(13);
    expect(r.recriaveis[0]).toMatchObject({ mes: "2026-11", parcela_n: 3 });
    expect(r.recriaveis[0].mae.id).toBe("s3");
  });

  it("os Meses anteriores ao Mês atual nunca entram (nem como recriáveis nem no aviso)", () => {
    const r = parcelasRecriaveis([mae("a", "2026-10", 2, { editado_em: T }), mae("b", "2026-09", 1), mae("c", "2026-11", 3)], STATUS, MES);
    expect(r.recriaveis.map((p) => p.mae.id)).toEqual(["c"]);
    expect(r.mantidas).toEqual([]);
  });

  it("editada à mão (editado_em) fica, mesmo com Status não pago", () => {
    const r = parcelasRecriaveis(silviaVivas({ s4: { editado_em: "2026-11-12T10:00:00+00:00" } }), STATUS, MES);
    expect(r.mantidas).toEqual([{ mes: "2026-12", parcela_n: 4, motivo: "editada" }]);
    expect(r.recriaveis).toHaveLength(12);
  });

  it("Status que conta como pago fica; Status que não conta, ou nenhum, é recriável", () => {
    const r = parcelasRecriaveis(silviaVivas({ s3: { status_id: PAGO }, s4: { status_id: null }, s5: { status_id: NAO_PAGO } }), STATUS, MES);
    expect(r.mantidas).toEqual([{ mes: "2026-11", parcela_n: 3, motivo: "paga" }]);
    expect(r.recriaveis.map((p) => p.mae.id)).toContain("s4");
    expect(r.recriaveis.map((p) => p.mae.id)).toContain("s5");
  });

  it("paga e editada ao mesmo tempo: o aviso diz 'paga' (a mais importante)", () => {
    const r = parcelasRecriaveis([mae("a", "2026-11", 3, { status_id: PAGO, editado_em: T })], STATUS, MES);
    expect(r.mantidas).toEqual([{ mes: "2026-11", parcela_n: 3, motivo: "paga" }]);
  });

  it("com Pagamento (ponto de extensão do Épico 6): fica, mesmo sem Status pago nem edição", () => {
    const r = parcelasRecriaveis([mae("a", "2026-11", 3), mae("b", "2026-12", 4)], STATUS, MES, new Set(["a"]));
    expect(r.mantidas).toEqual([{ mes: "2026-11", parcela_n: 3, motivo: "com_pagamento" }]);
    expect(r.recriaveis.map((p) => p.mae.id)).toEqual(["b"]);
    // Sem o conjunto (hoje), nada é "com Pagamento".
    expect(parcelasRecriaveis([mae("a", "2026-11", 3)], STATUS, MES).mantidas).toEqual([]);
  });

  it("Divisão: uma filha paga ou editada segura a parcela inteira (mãe e filhas ficam juntas)", () => {
    const base = [
      mae("m1", "2026-11", 3),
      filha("f1a", "m1", "2026-11", 3),
      filha("f1b", "m1", "2026-11", 3),
      mae("m2", "2026-12", 4),
      filha("f2a", "m2", "2026-12", 4, { status_id: PAGO }),
      filha("f2b", "m2", "2026-12", 4),
      mae("m3", "2027-01", 5),
      filha("f3a", "m3", "2027-01", 5, { editado_em: T }),
    ];
    const r = parcelasRecriaveis(base, STATUS, MES);
    expect(r.recriaveis).toHaveLength(1);
    expect(r.recriaveis[0].mae.id).toBe("m1");
    expect(r.recriaveis[0].filhas.map((f) => f.id)).toEqual(["f1a", "f1b"]);
    expect(r.mantidas).toEqual([
      { mes: "2026-12", parcela_n: 4, motivo: "paga" },
      { mes: "2027-01", parcela_n: 5, motivo: "editada" },
    ]);
  });

  it("as linhas excluídas não contam (nem a mãe, nem a filha)", () => {
    const r = parcelasRecriaveis([mae("m1", "2026-11", 3, { excluido_em: T }), mae("m2", "2026-12", 4), filha("f", "m2", "2026-12", 4, { excluido_em: T, editado_em: T })], STATUS, MES);
    expect(r.recriaveis.map((p) => p.mae.id)).toEqual(["m2"]);
    expect(r.recriaveis[0].filhas).toEqual([]);
    expect(r.mantidas).toEqual([]);
  });

  it("a ordem é estável: por Mês, parcela e id, qualquer que seja a ordem de entrada", () => {
    const a = parcelasRecriaveis([mae("z", "2026-12", 4), mae("b", "2026-11", 3), mae("a", "2026-11", 3)], STATUS, MES);
    expect(a.recriaveis.map((p) => p.mae.id)).toEqual(["a", "b", "z"]);
  });

  it("Mês atual ilegível: nada é seguro de mexer (nada recriável)", () => {
    expect(parcelasRecriaveis(silviaVivas(), STATUS, "novembro")).toEqual({ recriaveis: [], mantidas: [] });
  });
});

describe("planoDeAlterarConta (Editar)", () => {
  it("troca o Valor: exclui as recriáveis (mãe e filhas), cria de novo do Mês atual ao horizonte e mantém as paga/editada, sem tocar nos Meses anteriores", () => {
    const salva = salvaDe(SILVIA, "c1");
    const nova = conta({ ...SILVIA, valor: "450,00" }, "c1");
    const vivas = silviaVivas({ s4: { status_id: PAGO }, s6: { editado_em: T } });
    const plano = planoDeAlterarConta(salva, nova, serie(), entrada(vivas));
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    // 13 parcelas de Nov/26 a Nov/27; 2 ficam (Dez/26 paga, Fev/27 editada).
    expect(plano.resumo.excluidas).toBe(11);
    expect(plano.resumo.criadas).toBe(11);
    expect(plano.resumo.mantidas).toEqual([
      { mes: "2026-12", parcela_n: 4, motivo: "paga" },
      { mes: "2027-02", parcela_n: 6, motivo: "editada" },
    ]);
    const { pedido } = plano;
    expect(pedido.excluir.map((e) => e.id)).not.toContain("s4");
    expect(pedido.excluir.map((e) => e.id)).not.toContain("s6");
    expect(pedido.excluir).toHaveLength(11);
    expect(pedido.excluir.every((e) => e.atualizado_em === T)).toBe(true);
    // Nada antes do Mês atual, e nunca o `n` de uma parcela que fica.
    expect(pedido.parcelas.every((p) => p.mes >= MES)).toBe(true);
    expect(pedido.parcelas.map((p) => p.parcela_n)).not.toContain(4);
    expect(pedido.parcelas.map((p) => p.parcela_n)).not.toContain(6);
    expect(pedido.parcelas.every((p) => p.valor_centavos === 45_000)).toBe(true);
    expect(pedido.mes_atual).toBe(MES);
    expect(pedido.ate_mes).toBe("2027-11");
    expect(pedido.conta).toMatchObject({
      id: "c1",
      valor_centavos: 45_000,
      mes_inicial: "2026-09",
      encerrada_em_mes: null,
      atualizada_em: T,
      serie: { valor_parcela_centavos: 45_000, ocorrencia: 1 },
    });
  });

  it("as parcelas a criar são as de `parcelasDaConta` da Conta nova, só do Mês atual em diante (mesma regra do cron)", () => {
    const salva = salvaDe(SILVIA, "c1");
    const nova = conta({ ...SILVIA, valor: "450,00" }, "c1");
    const plano = planoDeAlterarConta(salva, nova, serie(), entrada(silviaVivas()));
    if (!plano.ok) throw new Error("plano");
    const esperadas = parcelasDaConta({ ...nova, encerrada_em_mes: null }, "2027-11").filter((p) => p.mes >= MES);
    expect(plano.pedido.parcelas.map((p) => [p.parcela_n, p.mes, p.valor_centavos])).toEqual(esperadas.map((p) => [p.parcela_n, p.mes, p.valor_centavos]));
  });

  it("com Divisão: a parcela nova leva os valores das partes (e a recriada exclui a mãe e as filhas)", () => {
    const salva = salvaDe(BOMBINHAS, "b1");
    const nova = conta({ ...BOMBINHAS, valor: "330,00", partes: BOMBINHAS.partes.map((p) => ({ ...p, texto: "110,00" })) }, "b1");
    const existentes = [mae("m5", "2026-11", 5), filha("f5a", "m5", "2026-11", 5), filha("f5b", "m5", "2026-11", 5), filha("f5c", "m5", "2026-11", 5), mae("m6", "2026-12", 6)];
    const plano = planoDeAlterarConta(salva, nova, serie({ nome_normalizado: "BOMBINHAS", parcela_total: 6, valor_parcela_centavos: 31_800, mes_primeira_parcela: "2026-07" }), entrada(existentes));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.excluir.map((e) => e.id)).toEqual(["m5", "f5a", "f5b", "f5c", "m6"]);
    expect(plano.pedido.parcelas.map((p) => [p.parcela_n, p.mes, p.valor_centavos])).toEqual([
      [5, "2026-11", 33_000],
      [6, "2026-12", 33_000],
    ]);
    expect(plano.pedido.parcelas[0].partes?.map((p) => p.valor_centavos)).toEqual([11_000, 11_000, 11_000]);
    expect(plano.resumo).toMatchObject({ excluidas: 2, criadas: 2 });
  });

  it("parcelada que encurta: as parcelas além do novo total saem e não voltam", () => {
    const salva = salvaDe(BOMBINHAS, "b1");
    const nova = conta({ ...BOMBINHAS, parcelas: "5" }, "b1"); // Jul a Nov
    const plano = planoDeAlterarConta(salva, nova, serie({ nome_normalizado: "BOMBINHAS", parcela_total: 6, valor_parcela_centavos: 31_800, mes_primeira_parcela: "2026-07" }), entrada([mae("m5", "2026-11", 5), mae("m6", "2026-12", 6)]));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.excluir.map((e) => e.id)).toEqual(["m5", "m6"]);
    expect(plano.pedido.parcelas.map((p) => p.mes)).toEqual(["2026-11"]);
    expect(plano.pedido.conta.serie.parcela_total).toBe(5);
  });

  it("não troca o 'Começa em' nem o id: recusa um pedido torto", () => {
    const salva = salvaDe(SILVIA, "c1");
    expect(planoDeAlterarConta(salva, { ...conta(SILVIA, "outro") }, serie(), entrada([]))).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(planoDeAlterarConta(salva, { ...conta(SILVIA, "c1"), mes_inicial: "2026-10" }, serie(), entrada([]))).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(planoDeAlterarConta(salva, conta(SILVIA, "c1"), serie(), entrada([], { mesAtual: "nov" }))).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("o encerramento que a Conta já tem fica (Editar não o muda) e limita as parcelas novas", () => {
    const salva = salvaDe(SILVIA, "c1", { encerrada_em_mes: "2027-01" });
    const nova = conta({ ...SILVIA, valor: "450,00" }, "c1");
    const plano = planoDeAlterarConta(salva, nova, serie(), entrada(silviaVivas().filter((l) => l.mes < "2027-01")));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.conta.encerrada_em_mes).toBe("2027-01");
    expect(plano.pedido.parcelas.map((p) => p.mes)).toEqual(["2026-11", "2026-12"]);
  });

  it("sem nada a recriar (Conta que já terminou): pedido vazio, só a Conta muda", () => {
    const salva = salvaDe({ ...BOMBINHAS, parcelas: "3", comecaEm: "2026-07", partes: [{ responsavel_id: "r-mae", texto: "" }] }, "b1");
    const nova = conta({ ...BOMBINHAS, parcelas: "3", comecaEm: "2026-07", nome: "Bombinhas 2", partes: [{ responsavel_id: "r-mae", texto: "" }] }, "b1");
    const plano = planoDeAlterarConta(salva, nova, serie({ nome_normalizado: "BOMBINHAS", parcela_total: 3, valor_parcela_centavos: 31_800, mes_primeira_parcela: "2026-07" }), entrada([]));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.excluir).toEqual([]);
    expect(plano.pedido.parcelas).toEqual([]);
    expect(plano.resumo).toEqual({ excluidas: 0, criadas: 0, mantidas: [] });
  });
});

describe("a chave da Série depois de alterar", () => {
  const nova = (o: Partial<Pick<NovaConta, "nome_normalizado" | "parcela_total" | "valor_centavos" | "mes_inicial">> = {}) => ({
    nome_normalizado: "SILVIA",
    parcela_total: null,
    valor_centavos: 40_000,
    mes_inicial: "2026-09",
    ...o,
  });

  it("a chave não mudou: a ocorrencia fica (mesmo que outra Série use o número)", () => {
    expect(chaveDaSerieAlterada(serie({ ocorrencia: 2 }, [1, 2]), nova())).toMatchObject({ ocorrencia: 2 });
  });

  it("Nome, Valor ou total mudaram: a menor ocorrencia livre da chave nova (duas Contas idênticas)", () => {
    expect(chaveDaSerieAlterada(serie({}, []), nova({ valor_centavos: 45_000 }))).toEqual({
      nome_normalizado: "SILVIA",
      parcela_total: null,
      valor_parcela_centavos: 45_000,
      mes_primeira_parcela: "2026-09",
      ocorrencia: 1,
    });
    expect(chaveDaSerieAlterada(serie({}, [1, 2]), nova({ nome_normalizado: "SILVIA NOVA" }))).toMatchObject({ nome_normalizado: "SILVIA NOVA", ocorrencia: 3 });
    expect(chaveDaSerieAlterada(serie({}, [1]), nova({ parcela_total: 6 }))).toMatchObject({ parcela_total: 6, ocorrencia: 2 });
  });
});

describe("validarEncerramento e planoDeEncerrarConta", () => {
  const silvia = () => salvaDe(SILVIA, "c1");

  it("recusas: Mês ilegível, antes do Mês atual, depois de 5 anos, antes ou no Mês inicial, e Conta que já terminou", () => {
    expect(validarEncerramento(silvia(), "dezembro", MES)).toBe("conta.mes_invalido");
    expect(validarEncerramento(silvia(), "2026-10", MES)).toBe("conta.encerrar_no_passado");
    expect(validarEncerramento(silvia(), "2031-12", MES)).toBe("conta.mes_fora_do_limite");
    expect(validarEncerramento(salvaDe({ ...SILVIA, comecaEm: "2027-03" }, "c2"), "2027-03", MES)).toBe("conta.encerrar_antes_do_inicio");
    expect(validarEncerramento(salvaDe({ ...SILVIA, comecaEm: "2027-03" }, "c2"), "2027-02", MES)).toBe("conta.encerrar_antes_do_inicio");
    expect(validarEncerramento(silvia(), "2027-01", MES)).toBeNull();
    // Já terminou (encerrada em Out/26: o último Mês é Set/26).
    expect(validarEncerramento(salvaDe(SILVIA, "c3", { encerrada_em_mes: "2026-10" }), "2027-01", MES)).toBe("conta.ja_encerrada");
  });

  it("parcelada: depois do fim das parcelas não tem efeito; no último Mês, sim; igual ao encerramento que já existe, não", () => {
    const b = salvaDe(BOMBINHAS, "b1"); // Jul a Dez/26
    expect(validarEncerramento(b, "2027-01", MES)).toBe("conta.encerrar_sem_efeito");
    expect(validarEncerramento(b, "2026-12", MES)).toBeNull();
    const ja = salvaDe({ ...SILVIA, comecaEm: "2026-01" }, "c4", { encerrada_em_mes: "2027-03" });
    expect(validarEncerramento(ja, "2027-03", MES)).toBe("conta.encerrar_sem_efeito");
    // Um Mês depois do encerramento que já existe estende a Conta (válido).
    expect(validarEncerramento(ja, "2027-06", MES)).toBeNull();
  });

  it("Encerrar em Jan/27: exclui as recriáveis de Jan/27 em diante, mantém a paga e não cria nada", () => {
    const vivas = silviaVivas({ s8: { status_id: PAGO } }); // s8 = Abr/27
    const plano = planoDeEncerrarConta(silvia(), serie(), "2027-01", entrada(vivas));
    if (!plano.ok) throw new Error("plano");
    // Jan/27 (s5) a Nov/27 (s15) = 11 parcelas; Abr/27 paga fica.
    expect(plano.resumo).toEqual({ excluidas: 10, criadas: 0, mantidas: [{ mes: "2027-04", parcela_n: 8, motivo: "paga" }] });
    expect(plano.pedido.excluir.map((e) => e.id)).not.toContain("s8");
    expect(plano.pedido.excluir.every((e) => ["s5", "s6", "s7", "s9", "s10", "s11", "s12", "s13", "s14", "s15"].includes(e.id))).toBe(true);
    expect(plano.pedido.parcelas).toEqual([]);
    expect(plano.pedido.conta).toMatchObject({ encerrada_em_mes: "2027-01", nome: "Silvia", valor_centavos: 40_000, atualizada_em: T });
    // Os Meses anteriores a Jan/27 (Nov e Dez/26) não aparecem em nada.
    expect(plano.pedido.excluir.map((e) => e.id)).not.toContain("s3");
    expect(plano.pedido.excluir.map((e) => e.id)).not.toContain("s4");
  });

  it("a paga de antes do Mês escolhido nem entra no aviso (só as de Jan/27 em diante)", () => {
    const vivas = silviaVivas({ s3: { status_id: PAGO } });
    const plano = planoDeEncerrarConta(silvia(), serie(), "2027-01", entrada(vivas));
    if (!plano.ok) throw new Error("plano");
    expect(plano.resumo.mantidas).toEqual([]);
  });

  it("com Divisão, as filhas saem com a mãe", () => {
    const b = salvaDe(BOMBINHAS, "b1");
    const existentes = [mae("m5", "2026-11", 5), filha("f5", "m5", "2026-11", 5), mae("m6", "2026-12", 6), filha("f6", "m6", "2026-12", 6)];
    const plano = planoDeEncerrarConta(b, serie({ nome_normalizado: "BOMBINHAS", parcela_total: 6, valor_parcela_centavos: 31_800, mes_primeira_parcela: "2026-07" }), "2026-12", entrada(existentes));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.excluir.map((e) => e.id)).toEqual(["m6", "f6"]);
    expect(plano.resumo.excluidas).toBe(1);
  });

  it("estender: encerrar depois do encerramento antigo cria só as parcelas que faltam", () => {
    const antiga = salvaDe(SILVIA, "c1", { encerrada_em_mes: "2027-01" });
    const vivas = silviaVivas().filter((l) => l.mes < "2027-01"); // Nov e Dez/26
    const plano = planoDeEncerrarConta(antiga, serie(), "2027-04", entrada(vivas));
    if (!plano.ok) throw new Error("plano");
    expect(plano.pedido.excluir).toEqual([]);
    expect(plano.pedido.parcelas.map((p) => p.mes)).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(plano.pedido.conta.encerrada_em_mes).toBe("2027-04");
  });

  it("uma recusa do núcleo devolve o código e nenhum pedido", () => {
    expect(planoDeEncerrarConta(silvia(), serie(), "2026-10", entrada([]))).toEqual({ ok: false, codigo: "conta.encerrar_no_passado" });
  });

  it("a prévia da janela: quantas saem e quais ficam, ou o código da recusa", () => {
    const vivas = silviaVivas({ s6: { editado_em: T } });
    expect(previaDoEncerramento(silvia(), serie(), "2027-01", entrada(vivas))).toEqual({
      excluidas: 10,
      mantidas: [{ mes: "2027-02", parcela_n: 6, motivo: "editada" }],
    });
    expect(previaDoEncerramento(silvia(), serie(), "2026-10", entrada(vivas))).toEqual({ codigo: "conta.encerrar_no_passado" });
    expect(mesPadraoDoEncerramento(MES)).toBe("2026-12");
  });
});

describe("planoDeExcluirConta", () => {
  it("com os Lançamentos: as recriáveis saem (mãe e filhas), as outras ficam e vão para o aviso", () => {
    const existentes = [
      mae("m1", "2026-11", 5),
      filha("f1", "m1", "2026-11", 5),
      mae("m2", "2026-12", 6, { status_id: PAGO }),
      filha("f2", "m2", "2026-12", 6),
    ];
    const plano = planoDeExcluirConta({ id: "c1" }, true, entrada(existentes));
    expect(plano.pedido).toEqual({ conta_id: "c1", excluir: [{ id: "m1", atualizado_em: T }, { id: "f1", atualizado_em: T }], mes_atual: MES });
    expect(plano.resumo).toEqual({ excluidas: 1, criadas: 0, mantidas: [{ mes: "2026-12", parcela_n: 6, motivo: "paga" }] });
  });

  it("só a conta: nada é excluído além dela e as parcelas ficam como estão", () => {
    const plano = planoDeExcluirConta({ id: "c1" }, false, entrada(silviaVivas()));
    expect(plano.pedido.excluir).toEqual([]);
    expect(plano.resumo).toEqual({ excluidas: 0, criadas: 0, mantidas: [] });
  });

  it("o Desfazer devolve os mesmos ids (cópia, sem criar nenhum)", () => {
    const ids = ["a", "b"];
    const p = pedidoRestaurarConta("c1", ids);
    expect(p).toEqual({ conta_id: "c1", ids: ["a", "b"] });
    ids.push("c");
    expect(p.ids).toEqual(["a", "b"]);
  });
});

describe("lerContaSalva", () => {
  const linha = { ...salvaDe(SILVIA, "c1"), repeticao: "mensal" as string };

  it("aceita a linha do banco; repetição desconhecida é defeito de dado (null)", () => {
    expect(lerContaSalva(linha)).toMatchObject({ id: "c1", repeticao: "mensal", updated_at: T });
    expect(lerContaSalva({ ...linha, repeticao: "semanal" })).toBeNull();
  });
});

describe("os códigos do plano têm texto para Rafael", () => {
  it.each(["conta.mudou", "conta.ja_encerrada", "conta.encerrar_no_passado", "conta.encerrar_antes_do_inicio", "conta.encerrar_sem_efeito", "conta.mes_invalido", "conta.mes_fora_do_limite", "conta.serie_ocupada", "conta.nao_encontrada"])(
    "%s",
    (codigo) => {
      expect(MENSAGENS).toHaveProperty([codigo]);
    },
  );
});
