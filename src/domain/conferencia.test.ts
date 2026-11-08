import { describe, expect, it } from "vitest";
import extracaoOutubro from "../../test/fixtures/extracao-2026-10.json";
import {
  conferir,
  ordenarDuvidasPrimeiro,
  partesDaDiferenca,
  precisaVerificar,
  valorDaDiferenca,
  type CartaoParaConferir,
  type FaturaParaConferir,
} from "./conferencia";
import type { Extracao } from "./extracao-fatura";
import { ESPERADO_OUTUBRO_2026, prepararImportacao } from "./importacao-fatura";

// Outubro/2026 como o banco guarda: a extração gravada (sem chamar o
// Gemini) passa por `prepararImportacao`, e cada linha ganha o `id` e o
// `fatura_id` que a RPC daria.

type Linha = {
  id: string;
  nome: string;
  fatura_id: string | null;
  valor_centavos: number;
  final_cartao: string | null;
  excluido_em: string | null;
  duvida_extracao: boolean;
  ordem_fatura: number | null;
};

function outubroGravado() {
  const r = prepararImportacao(extracaoOutubro as Extracao);
  if (!r.ok) throw new Error(r.erro.codigo);
  const fatura: FaturaParaConferir = {
    id: "f10",
    total_despesas_centavos: r.valor.fatura.total_despesas_centavos,
    total_creditos_centavos: r.valor.fatura.total_creditos_centavos,
  };
  const cartoes: CartaoParaConferir[] = r.valor.cartoes.map((c) => ({ fatura_id: "f10", ...c }));
  const linhas: Linha[] = r.valor.lancamentos.map((l) => ({
    id: `l${l.ordem_fatura}`,
    nome: l.nome,
    fatura_id: "f10",
    valor_centavos: l.valor_centavos,
    final_cartao: l.final_cartao,
    excluido_em: null,
    duvida_extracao: l.duvida_extracao,
    ordem_fatura: l.ordem_fatura,
  }));
  return { fatura, cartoes, linhas };
}

const bellaPietra = (linhas: readonly Linha[]) =>
  linhas.find((l) => l.nome === "BELLA PIETRA ROCHAS E" && l.final_cartao === "8673")!;

describe("conferir: outubro/2026 gravado (aceite)", () => {
  it("49 Lançamentos, despesas R$ 8.327,39, créditos R$ 639,62, cinco cartões: Conferido", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    const c = conferir(fatura, cartoes, linhas);
    expect(c.quantidade).toBe(ESPERADO_OUTUBRO_2026.quantidade);
    expect(c.despesasCentavos).toBe(ESPERADO_OUTUBRO_2026.despesasCentavos);
    expect(c.creditosCentavos).toBe(ESPERADO_OUTUBRO_2026.creditosCentavos);
    expect(c.porCartao.map((p) => p.final)).toEqual(["3967", "5061", "8175", "8673", "9277"]);
    expect(c.conferido).toBe(true);
    expect(c.cartoesComDiferenca).toEqual([]);
    expect(valorDaDiferenca(c)).toBeNull();
    expect(linhas.some((l) => precisaVerificar(l, c))).toBe(false);
  });
});

describe("conferir: novembro/2026 (totais lidos em produção)", () => {
  it("despesas R$ 7.394,54, créditos R$ 43,22, quatro cartões: Conferido", () => {
    // Totais por cartão lidos da Fatura de novembro; as linhas aqui só
    // somam o mesmo por cartão (não há fixture de texto de novembro).
    const fatura: FaturaParaConferir = { id: "f11", total_despesas_centavos: 739454, total_creditos_centavos: 4322 };
    const totais = { "5061": 186742, "8175": 0, "8673": 362469, "9277": 190243 };
    const cartoes: CartaoParaConferir[] = Object.entries(totais).map(([final, total]) => ({
      fatura_id: "f11",
      final,
      total_centavos: total,
    }));
    const linha = (valor: number, final: string) => ({ fatura_id: "f11", valor_centavos: valor, final_cartao: final, excluido_em: null });
    const linhas = [
      linha(100000, "5061"),
      linha(86742, "5061"),
      linha(362469, "8673"),
      linha(190243, "9277"),
      linha(-4322, "8673"),
    ];
    const c = conferir(fatura, cartoes, linhas);
    expect(c.despesasCentavos).toBe(739454);
    expect(c.creditosCentavos).toBe(4322);
    expect(c.conferido).toBe(true);
    expect(valorDaDiferenca(c)).toBeNull();
    expect(linhas.some((l) => precisaVerificar(l, c))).toBe(false);
  });
});

describe("conferir: matriz da História 2.5", () => {
  it("valor lido errado (BELLA PIETRA R$ 80,00 em vez de R$ 800,00 no 8673): diferença de R$ 720,00 no 8673", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    const bella = bellaPietra(linhas);
    bella.valor_centavos = 8000;
    const c = conferir(fatura, cartoes, linhas);
    expect(c.conferido).toBe(false);
    expect(c.diferencaDespesasCentavos).toBe(-72000);
    expect(c.cartoesComDiferenca).toEqual(["8673"]);
    expect(valorDaDiferenca(c)).toBe(72000);
    expect(partesDaDiferenca(c)).toEqual({
      despesas: { centavos: 72000, sentido: "abaixo" },
      creditos: null,
      cartoes: ["8673"],
    });
    const marcadas = linhas.filter((l) => precisaVerificar(l, c));
    expect(marcadas.length).toBeGreaterThan(1);
    expect(marcadas.every((l) => l.final_cartao === "8673")).toBe(true);
    expect(marcadas).toContain(bella);
  });

  it("dúvidas primeiro e depois a ordem da fatura, só nas linhas marcadas", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    bellaPietra(linhas).valor_centavos = 8000;
    const do8673 = linhas.filter((l) => l.final_cartao === "8673");
    const ultima = do8673[do8673.length - 1];
    ultima.duvida_extracao = true;
    // Dúvida noutro cartão (que bate) não marca.
    const outra = linhas.find((l) => l.final_cartao === "5061")!;
    outra.duvida_extracao = true;
    const c = conferir(fatura, cartoes, linhas);
    const ordem = ordenarDuvidasPrimeiro(linhas.filter((l) => precisaVerificar(l, c)));
    expect(ordem[0]).toBe(ultima);
    expect(ordem.slice(1).map((l) => l.ordem_fatura)).toEqual(
      do8673.filter((l) => l !== ultima).map((l) => l.ordem_fatura),
    );
    expect(ordem).not.toContain(outra);
  });

  it("cartão trocado (linha do 8673 lida no 9277): despesas batem, diferença nos dois cartões", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    bellaPietra(linhas).final_cartao = "9277";
    const c = conferir(fatura, cartoes, linhas);
    expect(c.diferencaDespesasCentavos).toBe(0);
    expect(c.diferencaCreditosCentavos).toBe(0);
    expect(c.conferido).toBe(false);
    expect(c.cartoesComDiferenca).toEqual(["8673", "9277"]);
    expect(valorDaDiferenca(c)).toBe(80000);
    expect(partesDaDiferenca(c)).toEqual({ despesas: null, creditos: null, cartoes: ["8673", "9277"] });
    const finais = new Set(linhas.filter((l) => precisaVerificar(l, c)).map((l) => l.final_cartao));
    expect([...finais].sort()).toEqual(["8673", "9277"]);
  });

  it("só créditos (um crédito faltando): os créditos da Fatura ficam marcados", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    const credito = linhas.find((l) => l.valor_centavos === -2500)!;
    const semCredito = linhas.filter((l) => l !== credito);
    const c = conferir(fatura, cartoes, semCredito);
    expect(c.cartoesComDiferenca).toEqual([]);
    expect(c.diferencaCreditosCentavos).toBe(-2500);
    expect(valorDaDiferenca(c)).toBe(2500);
    expect(partesDaDiferenca(c).creditos).toEqual({ centavos: 2500, sentido: "abaixo" });
    const marcadas = semCredito.filter((l) => precisaVerificar(l, c));
    expect(marcadas.length).toBeGreaterThan(0);
    expect(marcadas.every((l) => l.valor_centavos < 0)).toBe(true);
    expect(marcadas).toHaveLength(semCredito.filter((l) => l.valor_centavos < 0).length);
  });

  it("final desconhecido: o final sem `fatura_cartoes` conta como lido R$ 0,00", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    bellaPietra(linhas).final_cartao = "0001";
    const c = conferir(fatura, cartoes, linhas);
    expect(c.porCartao.at(-1)).toEqual({ final: "0001", lidoCentavos: 0, despesasCentavos: 80000, diferencaCentavos: 80000 });
    expect(c.cartoesComDiferenca).toEqual(["0001", "8673"]);
  });

  it("excluído fica fora da conta; Lançamento de outra Fatura ou sem Fatura também", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    const extra = [
      { ...linhas[0], id: "x1", valor_centavos: 99999, excluido_em: "2026-11-05T12:00:00+00:00" },
      { ...linhas[0], id: "x2", valor_centavos: 99999, fatura_id: "f11" },
      { ...linhas[0], id: "x3", valor_centavos: 99999, fatura_id: null },
    ];
    const c = conferir(fatura, cartoes, [...linhas, ...extra]);
    expect(c.quantidade).toBe(49);
    expect(c.conferido).toBe(true);
    // Mesmo num cartão com diferença, linha de outra Fatura não marca.
    bellaPietra(linhas).valor_centavos = 8000;
    const d = conferir(fatura, cartoes, linhas);
    expect(precisaVerificar({ ...bellaPietra(linhas), fatura_id: "f11" }, d)).toBe(false);
    expect(precisaVerificar({ ...bellaPietra(linhas), fatura_id: null }, d)).toBe(false);
  });

  it("cartões de outra Fatura não entram", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    const c = conferir(fatura, [...cartoes, { fatura_id: "f11", final: "8673", total_centavos: 1 }], linhas);
    expect(c.conferido).toBe(true);
  });

  it("despesas acima do total: sentido 'acima'", () => {
    const { fatura, cartoes, linhas } = outubroGravado();
    bellaPietra(linhas).valor_centavos = 80100;
    const c = conferir(fatura, cartoes, linhas);
    expect(partesDaDiferenca(c).despesas).toEqual({ centavos: 100, sentido: "acima" });
  });
});

describe("ordenarDuvidasPrimeiro", () => {
  it("dúvidas primeiro; sem ordem da fatura vai para o fim do grupo; não muda a lista", () => {
    const linhas = [
      { id: "a", duvida_extracao: false, ordem_fatura: 1 },
      { id: "b", duvida_extracao: true, ordem_fatura: null },
      { id: "c", duvida_extracao: true, ordem_fatura: 3 },
      { id: "d", duvida_extracao: false, ordem_fatura: null },
    ];
    expect(ordenarDuvidasPrimeiro(linhas).map((l) => l.id)).toEqual(["c", "b", "a", "d"]);
    expect(linhas.map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
  });
});
