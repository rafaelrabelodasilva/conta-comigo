import { describe, expect, it } from "vitest";
import { normalizarNome } from "./importacao-fatura";
import {
  PREFIXOS_ADQUIRENTE,
  PREFIXOS_COM_ESPACO,
  VERSAO_NORMALIZACAO,
  aprenderRegra,
  avaliarRegra,
  chaveDeRegra,
  lerContagem,
  type RegraGravada,
} from "./regras";

const AGORA = "2026-11-09T12:00:00.000Z";

const regra = (extra: Partial<RegraGravada> = {}): RegraGravada => ({
  chave: "COBASI CRICIUMA",
  versao_normalizacao: 1,
  responsavel_id: null,
  tipo_id: null,
  contagem: [],
  ultimo_uso: "2026-10-01T00:00:00.000Z",
  ...extra,
});

const ativos = (responsaveis: string[], tipos: string[]) => ({
  responsaveis: new Set(responsaveis),
  tipos: new Set(tipos),
});

describe("chaveDeRegra", () => {
  it("variações de adquirente do Spotify dão a mesma chave; normalizarNome continua diferente", () => {
    const nomes = ["DM*SPOTIFY", "EBN SPOTIFY", "EBANX SPOTIFY", "DM*SPOTIFY P4750", "EBN *SPOTIFY"];
    expect(nomes.map(chaveDeRegra)).toEqual(Array(5).fill("SPOTIFY"));
    expect(new Set(nomes.map(normalizarNome)).size).toBe(5);
  });

  it("normaliza (acento, maiúsculas, espaços) e tira os espaços em volta do *", () => {
    expect(chaveDeRegra("  Cobasi   Criciúma ")).toBe("COBASI CRICIUMA");
    expect(chaveDeRegra("SHOPEE *CELLSOLUTIONS")).toBe("SHOPEE*CELLSOLUTIONS");
    expect(chaveDeRegra("LITE * VIVOEASYANUAL")).toBe("LITE*VIVOEASYANUAL");
  });

  it("marketplace não é adquirente: SHOPEE, AMAZON e MERCADOLIVRE ficam", () => {
    expect(chaveDeRegra("SHOPEE *X")).toBe("SHOPEE*X");
    expect(chaveDeRegra("AMAZONMKTPLC*KABUMSA")).toBe("AMAZONMKTPLC*KABUMSA");
    expect(chaveDeRegra("MERCADOLIVRE*RELOGIO")).toBe("MERCADOLIVRE*RELOGIO");
  });

  it("tira cada prefixo da lista seguido de *; seguido de espaço, só EBN e EBANX", () => {
    for (const p of PREFIXOS_ADQUIRENTE) {
      expect(chaveDeRegra(`${p}*LOJA`)).toBe("LOJA");
      expect(chaveDeRegra(`${p} * LOJA`)).toBe("LOJA");
      expect(chaveDeRegra(`${p} LOJA`)).toBe(PREFIXOS_COM_ESPACO.includes(p) ? "LOJA" : `${p} LOJA`);
    }
    expect(PREFIXOS_COM_ESPACO).toEqual(["EBN", "EBANX"]);
    expect(chaveDeRegra("DELTAPG*ALIBA IMPORT")).toBe("ALIBA IMPORT");
    expect(chaveDeRegra("JIM COM* YGOR BORNHAU")).toBe("YGOR BORNHAU");
    expect(chaveDeRegra("PGTO LUZ")).toBe("PGTO LUZ");
    expect(chaveDeRegra("MPX LOJA")).toBe("MPX LOJA");
  });

  it("prefixo curto seguido de espaço não sai: lojas diferentes não se juntam", () => {
    expect(chaveDeRegra("MP CONSTRUCOES")).toBe("MP CONSTRUCOES");
    expect(chaveDeRegra("PG ENGENHARIA")).toBe("PG ENGENHARIA");
    expect(chaveDeRegra("DM CALCADOS")).toBe("DM CALCADOS");
    expect(chaveDeRegra("PAYPAL LOJA X")).toBe("PAYPAL LOJA X");
    expect(chaveDeRegra("MP CONSTRUCOES")).not.toBe(chaveDeRegra("MP*CONSTRUCOES"));
  });

  it("tira o último pedaço com dígitos quando sobra outro", () => {
    expect(chaveDeRegra("PANVEL FILIAL 385")).toBe("PANVEL FILIAL");
    expect(chaveDeRegra("CASHBACK ESFERA - 314835478")).toBe("CASHBACK ESFERA");
    expect(chaveDeRegra("PETLOVE*CLUBE NCENPF7")).toBe("PETLOVE*CLUBE");
    // Só o último pedaço, e só se tiver dígito.
    expect(chaveDeRegra("00354 SH NACOES CRICI")).toBe("00354 SH NACOES CRICI");
    expect(chaveDeRegra("LOJA 12 34")).toBe("LOJA 12");
  });

  it("não esvazia a chave: prefixo ou dígitos sozinhos ficam", () => {
    expect(chaveDeRegra("DM")).toBe("DM");
    expect(chaveDeRegra("MP*")).toBe("MP*");
    expect(chaveDeRegra("IFD*12345")).toBe("12345");
    expect(chaveDeRegra("P4750")).toBe("P4750");
  });

  it("a versão da normalização é 1", () => {
    expect(VERSAO_NORMALIZACAO).toBe(1);
  });
});

describe("lerContagem", () => {
  it("soma entradas repetidas, ignora id nulo e lixo, n negativo vale 0", () => {
    expect(
      lerContagem([
        { responsavel_id: "b", n: 1 },
        { responsavel_id: "a", n: 2 },
        { responsavel_id: "b", n: 2 },
        { responsavel_id: null, n: 4 },
        { responsavel_id: "c", n: -3 },
        "x",
        null,
        { n: 1 },
      ]),
    ).toEqual([
      { responsavel_id: "b", n: 3 },
      { responsavel_id: "a", n: 2 },
      { responsavel_id: "c", n: 0 },
    ]);
    expect(lerContagem(null)).toEqual([]);
    expect(lerContagem({ a: 1 })).toEqual([]);
  });
});

describe("aprenderRegra", () => {
  it("Aprender novo: COBASI CRICIUMA Rafael · Gatos cria a Regra com Rafael 1", () => {
    const r = aprenderRegra(
      null,
      { nome: "COBASI CRICIUMA", responsavelAntes: null, responsavelDepois: "rafael", tipoDepois: "gatos" },
      AGORA,
    );
    expect(r).toEqual({
      chave: "COBASI CRICIUMA",
      versao_normalizacao: 1,
      responsavel_id: "rafael",
      tipo_id: "gatos",
      contagem: [{ responsavel_id: "rafael", n: 1 }],
      ultimo_uso: AGORA,
    });
  });

  it("Trocar Responsável: Rafael 1 → Casal dá Rafael 1, Casal 1, responsavel_id Casal; próxima: dúvida, sugere Casal", () => {
    const atual = regra({ responsavel_id: "rafael", tipo_id: "gatos", contagem: [{ responsavel_id: "rafael", n: 1 }] });
    const r = aprenderRegra(
      atual,
      { nome: "COBASI CRICIUMA", responsavelAntes: "rafael", responsavelDepois: "casal", tipoDepois: "gatos" },
      AGORA,
    );
    expect(r.contagem).toEqual([
      { responsavel_id: "rafael", n: 1 },
      { responsavel_id: "casal", n: 1 },
    ]);
    expect(r.responsavel_id).toBe("casal");
    expect(avaliarRegra({ ...atual, ...r }, ativos(["rafael", "casal"], ["gatos"]))).toEqual({
      tipo: "sugerir_duvida",
      responsavel_id: "casal",
      tipo_id: "gatos",
      outros_responsaveis: ["rafael"],
    });
  });

  it("Corrigir o que a Regra aplicou: Rafael 1 aplicou Rafael, muda para Mãe → Rafael 1, Mãe 1 (com dúvida), nunca Rafael 0", () => {
    const atual = regra({ responsavel_id: "rafael", contagem: [{ responsavel_id: "rafael", n: 1 }] });
    const r = aprenderRegra(atual, { nome: "X", responsavelAntes: "rafael", responsavelDepois: "mae", tipoDepois: null }, AGORA);
    expect(r.contagem).toEqual([
      { responsavel_id: "rafael", n: 1 },
      { responsavel_id: "mae", n: 1 },
    ]);
    expect(avaliarRegra({ ...atual, ...r }, ativos(["rafael", "mae"], []))).toMatchObject({ tipo: "sugerir_duvida" });
  });

  it("só escolher ensina: campo nulo depois mantém o da Regra e não mexe na contagem", () => {
    const atual = regra({ responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 2 }] });
    const semTipo = aprenderRegra(atual, { nome: "X", responsavelAntes: "casal", responsavelDepois: "casal", tipoDepois: null }, AGORA);
    expect(semTipo).toMatchObject({ responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 2 }] });

    const semResp = aprenderRegra(atual, { nome: "X", responsavelAntes: "casal", responsavelDepois: null, tipoDepois: "saude" }, AGORA);
    expect(semResp).toMatchObject({ responsavel_id: "casal", tipo_id: "saude", contagem: [{ responsavel_id: "casal", n: 2 }] });
  });

  it("mesmo Responsável numa Regra existente não soma; só o Tipo e o último uso mudam", () => {
    const soTipo = aprenderRegra(
      regra({ responsavel_id: "a", contagem: [{ responsavel_id: "a", n: 2 }] }),
      { nome: "X", responsavelAntes: "a", responsavelDepois: "a", tipoDepois: "casa" },
      AGORA,
    );
    expect(soTipo.contagem).toEqual([{ responsavel_id: "a", n: 2 }]);
    expect(soTipo.tipo_id).toBe("casa");
    expect(soTipo.ultimo_uso).toBe(AGORA);
  });

  it("Regra criada por gravação só de Tipo numa linha com Responsável soma 1 a ele", () => {
    const r = aprenderRegra(null, { nome: "X", responsavelAntes: "a", responsavelDepois: "a", tipoDepois: "casa" }, AGORA);
    expect(r).toMatchObject({ responsavel_id: "a", tipo_id: "casa", contagem: [{ responsavel_id: "a", n: 1 }] });

    const semResp = aprenderRegra(null, { nome: "X", responsavelAntes: null, responsavelDepois: null, tipoDepois: "casa" }, AGORA);
    expect(semResp).toMatchObject({ responsavel_id: null, tipo_id: "casa", contagem: [] });
  });

  it("Regra existente sem o Responsável da linha na contagem: gravação só de Tipo soma 1 a ele", () => {
    const atual = regra({ responsavel_id: null, tipo_id: "casa", contagem: [{ responsavel_id: "b", n: 2 }, { responsavel_id: "a", n: 0 }] });
    const r = aprenderRegra(atual, { nome: "X", responsavelAntes: "a", responsavelDepois: "a", tipoDepois: "saude" }, AGORA);
    expect(r.contagem).toEqual([
      { responsavel_id: "b", n: 2 },
      { responsavel_id: "a", n: 1 },
    ]);
    expect(r).toMatchObject({ responsavel_id: "a", tipo_id: "saude" });
    const vazia = aprenderRegra(regra({ tipo_id: "casa" }), { nome: "X", responsavelAntes: "a", responsavelDepois: "a", tipoDepois: "casa" }, AGORA);
    expect(vazia.contagem).toEqual([{ responsavel_id: "a", n: 1 }]);
  });

  it("A→B nunca subtrai: B ganha 1; a contagem lida já soma as repetidas e tira o id nulo", () => {
    const r = aprenderRegra(
      regra({ contagem: [{ responsavel_id: "b", n: 2 }, { responsavel_id: "b", n: 1 }, { responsavel_id: null, n: 5 }] }),
      { nome: "X", responsavelAntes: "a", responsavelDepois: "b", tipoDepois: null },
      AGORA,
    );
    expect(r.contagem).toEqual([{ responsavel_id: "b", n: 4 }]);
  });
});

describe("avaliarRegra", () => {
  const todos = ativos(["rafael", "mae", "casal"], ["saude", "casa"]);

  it("Regra limpa aplica Responsável e Tipo", () => {
    expect(
      avaliarRegra(regra({ responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 3 }] }), todos),
    ).toEqual({ tipo: "aplicar", responsavel_id: "casal", tipo_id: "casa" });
  });

  it("Regra com dúvida (Rafael 2, Mãe 1): não aplica; sugere Rafael e o Tipo, com Mãe nos outros", () => {
    const r = regra({
      responsavel_id: "mae",
      tipo_id: "saude",
      contagem: [
        { responsavel_id: "mae", n: 1 },
        { responsavel_id: "rafael", n: 2 },
      ],
    });
    expect(avaliarRegra(r, todos)).toEqual({
      tipo: "sugerir_duvida",
      responsavel_id: "rafael",
      tipo_id: "saude",
      outros_responsaveis: ["mae"],
    });
  });

  it("empate: o responsavel_id da Regra; sem ele no empate, o primeiro da contagem", () => {
    const empate = [
      { responsavel_id: "rafael", n: 2 },
      { responsavel_id: "mae", n: 2 },
      { responsavel_id: "casal", n: 1 },
    ];
    expect(avaliarRegra(regra({ responsavel_id: "mae", contagem: empate }), todos)).toMatchObject({
      responsavel_id: "mae",
      outros_responsaveis: ["rafael", "casal"],
    });
    expect(avaliarRegra(regra({ responsavel_id: "casal", contagem: empate }), todos)).toMatchObject({
      responsavel_id: "rafael",
      outros_responsaveis: ["mae", "casal"],
    });
  });

  it("n = 0 não conta para a dúvida", () => {
    const r = regra({
      responsavel_id: "casal",
      contagem: [
        { responsavel_id: "rafael", n: 0 },
        { responsavel_id: "casal", n: 1 },
      ],
    });
    expect(avaliarRegra(r, todos)).toEqual({ tipo: "aplicar", responsavel_id: "casal", tipo_id: null });
  });

  it("cadastro arquivado ou inexistente conta como ausente", () => {
    const r = regra({ responsavel_id: "zé", tipo_id: "velho", contagem: [{ responsavel_id: "zé", n: 3 }, { responsavel_id: "mae", n: 1 }] });
    expect(avaliarRegra(r, todos)).toEqual({ tipo: "nada" });
    expect(avaliarRegra(regra({ responsavel_id: "zé", tipo_id: "casa" }), todos)).toEqual({
      tipo: "aplicar",
      responsavel_id: null,
      tipo_id: "casa",
    });
    // Dúvida com Tipo arquivado: sugere sem Tipo.
    const duvida = regra({ tipo_id: "velho", contagem: [{ responsavel_id: "rafael", n: 1 }, { responsavel_id: "mae", n: 1 }] });
    expect(avaliarRegra(duvida, todos)).toMatchObject({ tipo: "sugerir_duvida", tipo_id: null });
  });

  it("Substituir A por B: contagem com B repetido (A virou B) lê B 3", () => {
    const r = regra({
      responsavel_id: "b",
      contagem: [
        { responsavel_id: "b", n: 2 },
        { responsavel_id: "b", n: 1 },
      ],
    });
    expect(lerContagem(r.contagem)).toEqual([{ responsavel_id: "b", n: 3 }]);
    expect(avaliarRegra(r, ativos(["b"], []))).toEqual({ tipo: "aplicar", responsavel_id: "b", tipo_id: null });
  });

  it("Excluir sem substituto: o id anulado na contagem é ignorado", () => {
    const r = regra({
      responsavel_id: null,
      tipo_id: "casa",
      contagem: [
        { responsavel_id: null, n: 3 },
        { responsavel_id: "mae", n: 1 },
      ],
    });
    expect(avaliarRegra(r, todos)).toEqual({ tipo: "aplicar", responsavel_id: null, tipo_id: "casa" });
  });
});
