import { describe, expect, it } from "vitest";
import { avisoDoRevisar, DIA_SEM_IMPORTACAO, type LinhaParaAvisoDoRevisar } from "./avisos-revisar";
import { textoDoAviso } from "./mensagens";
import { contarFila, montarFila, resumoDaFila, type LinhaDaFila } from "./revisar";

// O aviso da fila do Revisar (História 8.2, FR-55): um aviso só, com o número do menu (`contarFila`) e uma chave que
// só volta quando uma Fatura é importada ou reimportada. Não depende de "hoje".

const linha = (extra: Partial<LinhaParaAvisoDoRevisar> = {}): LinhaParaAvisoDoRevisar => ({
  excluido_em: null,
  ajuste_de_id: null,
  revisao_motivo: "sem_classificacao",
  ...extra,
});
const fila = (n: number) => Array.from({ length: n }, () => linha());
const importadaEm = (updated_at: string) => ({ updated_at });

describe("avisoDoRevisar: quando há aviso", () => {
  it("fila vazia: nenhum aviso", () => {
    expect(avisoDoRevisar([], [importadaEm("2026-11-18T12:00:00Z")])).toBeNull();
    expect(avisoDoRevisar([linha({ revisao_motivo: null })], [])).toBeNull();
  });

  it("com itens: um aviso, com a quantidade, a referência fixa e o destino do Revisar", () => {
    const r = avisoDoRevisar(fila(17), [importadaEm("2026-11-18T12:00:00Z")]);
    expect(r).toEqual({ tipo: "revisar", referencia: "fila", dia: "2026-11-18", quantidade: 17, destino: "/revisar" });
    expect(textoDoAviso(r!)).toBe("17 lançamentos para revisar");
    expect(textoDoAviso(avisoDoRevisar(fila(1), [])!)).toBe("1 lançamento para revisar");
  });

  it("o número é o do contador do menu: o mesmo `ehDaFila` (Ajuste, excluída e filha de Divisão não contam)", () => {
    const linhas = [
      ...fila(3),
      linha({ ajuste_de_id: "mae", revisao_motivo: null }),
      linha({ ajuste_de_id: "mae" }),
      linha({ excluido_em: "2026-11-01T00:00:00Z" }),
      linha({ dividido_de_id: "mae" }),
    ];
    expect(avisoDoRevisar(linhas, [])?.quantidade).toBe(contarFila(linhas));
    expect(contarFila(linhas)).toBe(3);
  });

  it("o número é o do 'Faltam N' da tela (`montarFila` e `resumoDaFila`)", () => {
    const completa = (id: string, extra: Partial<LinhaDaFila> = {}): LinhaDaFila => ({
      id,
      nome: `COMPRA ${id}`,
      apelido: null,
      mes: "2026-11",
      valor_centavos: 1_000,
      parcela_n: null,
      parcela_total: null,
      responsavel_id: null,
      tipo_id: null,
      ajuste_de_id: null,
      excluido_em: null,
      revisao_motivo: "sem_classificacao",
      revisao_dados: null,
      ordem_fatura: 1,
      ...extra,
    });
    const linhas = [completa("a"), completa("b"), completa("c", { revisao_motivo: "sugestao" }), completa("d", { revisao_motivo: null })];
    const faltam = resumoDaFila(montarFila(linhas, { responsaveis: [], tipos: [] })).faltam;
    expect(avisoDoRevisar(linhas, [])?.quantidade).toBe(faltam);
    expect(faltam).toBe(3);
  });
});

describe("avisoDoRevisar: a chave", () => {
  it("o dia é o da última importação (o maior `updated_at` das Faturas), em São Paulo", () => {
    const faturas = [importadaEm("2026-10-20T15:00:00Z"), importadaEm("2026-11-19T02:30:00Z"), importadaEm("2026-11-05T12:00:00Z")];
    // 23:30 de 18/11 em São Paulo (02:30Z de 19/11).
    expect(avisoDoRevisar(fila(2), faturas)?.dia).toBe("2026-11-18");
    // O formato do Realtime também vale.
    expect(avisoDoRevisar(fila(2), [importadaEm("2026-11-19 03:30:00.123456+00")])?.dia).toBe("2026-11-19");
  });

  it("o número de itens não muda a chave: classificar itens não traz o aviso de volta", () => {
    const faturas = [importadaEm("2026-11-18T12:00:00Z")];
    const chave = (n: number) => {
      const a = avisoDoRevisar(fila(n), faturas)!;
      return [a.tipo, a.referencia, a.dia].join("|");
    };
    expect(chave(17)).toBe(chave(16));
    expect(chave(17)).toBe(chave(1));
  });

  it("uma importação ou reimportação nova (outro dia) muda a chave; no mesmo dia, não", () => {
    const antes = avisoDoRevisar(fila(5), [importadaEm("2026-11-10T12:00:00Z")])!;
    const novoDia = avisoDoRevisar(fila(5), [importadaEm("2026-11-10T12:00:00Z"), importadaEm("2026-11-18T12:00:00Z")])!;
    const mesmoDia = avisoDoRevisar(fila(5), [importadaEm("2026-11-10T12:00:00Z"), importadaEm("2026-11-10T20:00:00Z")])!;
    expect(novoDia.dia).not.toBe(antes.dia);
    expect(mesmoDia.dia).toBe(antes.dia);
  });

  it("a chave só depende das Faturas: classificar o Mês mais novo não a faz voltar a uma data antiga", () => {
    const faturas = [importadaEm("2026-10-10T12:00:00Z"), importadaEm("2026-11-18T12:00:00Z")];
    expect(avisoDoRevisar(fila(20), faturas)?.dia).toBe("2026-11-18");
    expect(avisoDoRevisar(fila(2), faturas)?.dia).toBe("2026-11-18");
  });

  it("a fila zera e enche de novo sem importação: mesma chave (o 'Desfazer' não traz o aviso de volta)", () => {
    const faturas = [importadaEm("2026-11-18T12:00:00Z")];
    const antes = avisoDoRevisar(fila(3), faturas)!;
    expect(avisoDoRevisar([], faturas)).toBeNull();
    const depois = avisoDoRevisar(fila(1), faturas)!;
    expect([depois.tipo, depois.referencia, depois.dia]).toEqual([antes.tipo, antes.referencia, antes.dia]);
  });

  it("sem Fatura (ou com instante ilegível), o dia é o de 'sem importação'", () => {
    expect(avisoDoRevisar(fila(1), [])?.dia).toBe(DIA_SEM_IMPORTACAO);
    expect(avisoDoRevisar(fila(1), [importadaEm("ontem")])?.dia).toBe(DIA_SEM_IMPORTACAO);
    expect(avisoDoRevisar(fila(1), [importadaEm("ontem"), importadaEm("2026-11-18T12:00:00Z")])?.dia).toBe("2026-11-18");
  });

  it("mesma entrada, mesma saída (a ordem das Faturas não importa, a entrada não muda)", () => {
    const faturas = [importadaEm("2026-11-18T12:00:00Z"), importadaEm("2026-10-10T12:00:00Z")];
    const linhas = fila(4);
    const copia = structuredClone({ faturas, linhas });
    const a = avisoDoRevisar(linhas, faturas);
    expect(avisoDoRevisar([...linhas].reverse(), [...faturas].reverse())).toEqual(a);
    expect({ faturas, linhas }).toEqual(copia);
  });
});
