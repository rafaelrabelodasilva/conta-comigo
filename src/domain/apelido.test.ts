import { describe, expect, it } from "vitest";
import { planejarApelidoEmMassa, type LinhaParaApelido } from "./apelido";

const AGORA = "2026-11-11T12:00:00.000Z";
const ORIGEM = { id: "o", nome_normalizado: "PAG*JOSEDASILVA" };

const l = (id: string, extra: Partial<LinhaParaApelido> = {}): LinhaParaApelido => ({
  id,
  nome_normalizado: "PAG*JOSEDASILVA",
  apelido: null,
  lancado_por: "fatura",
  editado_em: null,
  ajuste_de_id: null,
  dividido_de_id: null,
  excluido_em: null,
  ...extra,
});

describe("planejarApelidoEmMassa (História 3.9)", () => {
  it("sem outras linhas do Nome: nada muda, sem pergunta", () => {
    const p = planejarApelidoEmMassa(ORIGEM, "Celular da mãe", [l("o"), l("x", { nome_normalizado: "OUTRO" })], AGORA);
    expect(p).toEqual({ itens: [], antes: [], mudam: 0, comOutro: 0 });
  });

  it("dar: iguala as outras (reais com editado_em, previstos sem) e guarda o retrato de antes", () => {
    const p = planejarApelidoEmMassa(
      ORIGEM,
      "Celular da mãe",
      [
        l("o"),
        l("nov", { editado_em: "2026-11-01T00:00:00Z" }),
        l("dez", { lancado_por: "sistema" }),
        l("jan", { lancado_por: "sistema", apelido: "Celular" }),
      ],
      AGORA,
    );
    expect(p.mudam).toBe(3);
    expect(p.comOutro).toBe(1);
    expect(p.itens).toEqual([
      { id: "nov", corpo: { apelido: "Celular da mãe", editado_em: AGORA } },
      { id: "dez", corpo: { apelido: "Celular da mãe" } },
      { id: "jan", corpo: { apelido: "Celular da mãe" } },
    ]);
    expect(p.antes).toEqual([
      { id: "nov", corpo: { apelido: null, editado_em: "2026-11-01T00:00:00Z" } },
      { id: "dez", corpo: { apelido: null } },
      { id: "jan", corpo: { apelido: "Celular" } },
    ]);
  });

  it("já iguais: ninguém muda e não pergunta", () => {
    const p = planejarApelidoEmMassa(ORIGEM, "Celular", [l("a", { apelido: "Celular" }), l("b", { apelido: "Celular" })], AGORA);
    expect(p.mudam).toBe(0);
    expect(p.itens).toEqual([]);
  });

  it("remover: limpa todas as outras que tinham Apelido", () => {
    const p = planejarApelidoEmMassa(ORIGEM, null, [l("a", { apelido: "Celular" }), l("b"), l("c", { apelido: "Outro" })], AGORA);
    expect(p.mudam).toBe(2);
    expect(p.itens.map((i) => [i.id, i.corpo.apelido])).toEqual([
      ["a", null],
      ["c", null],
    ]);
    expect(p.antes[1]).toEqual({ id: "c", corpo: { apelido: "Outro", editado_em: null } });
  });

  it("Ajuste, excluída e Nome diferente ficam de fora; a chave é nome_normalizado", () => {
    const p = planejarApelidoEmMassa(
      ORIGEM,
      "X",
      [l("aj", { ajuste_de_id: "m" }), l("ex", { excluido_em: "2026-11-01T00:00:00Z" }), l("outro", { nome_normalizado: "PAG*JOSE DA SILVA" })],
      AGORA,
    );
    expect(p.itens).toEqual([]);
  });

  it("filhas de outras mães acompanham a mãe e não entram na contagem; as da própria linha ficam de fora", () => {
    const p = planejarApelidoEmMassa(
      ORIGEM,
      "X",
      [l("mae2"), l("f1", { dividido_de_id: "mae2" }), l("f2", { dividido_de_id: "mae2" }), l("minha", { dividido_de_id: "o" })],
      AGORA,
    );
    expect(p.mudam).toBe(1);
    expect(p.itens.map((i) => i.id)).toEqual(["mae2", "f1", "f2"]);
  });

  it("não altera as entradas nem o Nome", () => {
    const entrada = [l("a")];
    const copia = JSON.parse(JSON.stringify(entrada));
    planejarApelidoEmMassa(ORIGEM, "X", entrada, AGORA);
    expect(entrada).toEqual(copia);
  });
});
