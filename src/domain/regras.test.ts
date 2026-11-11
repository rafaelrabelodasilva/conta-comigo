import { describe, expect, it } from "vitest";
import { normalizarNome } from "./importacao-fatura";
import {
  PREFIXOS_ADQUIRENTE,
  PREFIXOS_COM_ESPACO,
  VERSAO_NORMALIZACAO,
  agruparEventosPorChave,
  aprenderEmLote,
  aprenderRegra,
  avaliarRegra,
  chaveDeRegra,
  editarRegra,
  entradasDaReaplicacao,
  filtrarRegras,
  lerContagem,
  ordenarRegras,
  outrosResponsaveisDaRegra,
  regrasUsadas,
  type EventoAprender,
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

describe("aprenderEmLote (a mesma aprenderRegra, evento a evento)", () => {
  const evento = (nome: string, depois: string | null, antes: string | null = null, tipo: string | null = "casa"): EventoAprender => ({
    nome,
    responsavelAntes: antes,
    responsavelDepois: depois,
    tipoDepois: tipo,
  });

  it("três SHOPEE do Casal somam 3 em uma Regra nova", () => {
    const r = aprenderEmLote(null, [evento("SHOPEE", "casal"), evento("SHOPEE", "casal"), evento("SHOPEE", "casal")], AGORA);
    expect(r).toEqual({
      chave: "SHOPEE",
      versao_normalizacao: VERSAO_NORMALIZACAO,
      responsavel_id: "casal",
      tipo_id: "casa",
      contagem: [{ responsavel_id: "casal", n: 3 }],
      ultimo_uso: AGORA,
    });
  });

  it("dá o mesmo resultado de N toques seguidos, sobre uma Regra que já existe", () => {
    const atual = regra({ chave: "SHOPEE", responsavel_id: "rafael", tipo_id: "compras", contagem: [{ responsavel_id: "rafael", n: 2 }] });
    const eventos = [evento("SHOPEE", "casal", "rafael"), evento("SHOPEE", "casal"), evento("SHOPEE", "rafael", "casal", null)];
    let sequencial: RegraGravada | null = atual;
    for (const e of eventos) sequencial = aprenderRegra(sequencial, e, AGORA) as RegraGravada;
    expect(aprenderEmLote(atual, eventos, AGORA)).toEqual(sequencial);
  });

  it("sem eventos, não há o que aprender", () => {
    expect(aprenderEmLote(regra(), [], AGORA)).toBeNull();
  });
});

describe("agruparEventosPorChave", () => {
  it("nomes diferentes com a mesma chave juntam; chaves diferentes, grupos diferentes (na ordem)", () => {
    const e = (nome: string): EventoAprender => ({ nome, responsavelAntes: null, responsavelDepois: "casal", tipoDepois: null });
    const grupos = agruparEventosPorChave([e("DM*SPOTIFY P4750"), e("SHOPEE"), e("EBN SPOTIFY"), e("SPOTIFY")]);
    expect([...grupos.keys()]).toEqual(["SPOTIFY", "SHOPEE"]);
    expect(grupos.get("SPOTIFY")!.map((x) => x.nome)).toEqual(["DM*SPOTIFY P4750", "EBN SPOTIFY", "SPOTIFY"]);
    expect(agruparEventosPorChave([]).size).toBe(0);
  });
});

describe("editarRegra (3.4)", () => {
  const base = regra({
    responsavel_id: "casal",
    tipo_id: "casa",
    contagem: [
      { responsavel_id: "casal", n: 3 },
      { responsavel_id: "rafael", n: 1 },
    ],
  });

  it("mudar o Responsável deixa a contagem só com ele (soma das antigas)", () => {
    const r = editarRegra(base, { responsavel_id: "rafael" });
    expect(r).toEqual({
      ok: true,
      valor: { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 4 }] },
    });
    // Já não há dúvida na importação.
    if (r.ok && r.valor) {
      const nova = { ...base, ...r.valor };
      expect(avaliarRegra(nova, ativos(["casal", "rafael"], ["casa"])).tipo).toBe("aplicar");
    }
  });

  it("mudar só o Tipo não mexe na contagem", () => {
    const r = editarRegra(base, { tipo_id: "saude" });
    expect(r).toEqual({
      ok: true,
      valor: { responsavel_id: "casal", tipo_id: "saude", contagem: lerContagem(base.contagem) },
    });
  });

  it("Responsável sem histórico recebe n mínimo 1", () => {
    const r = editarRegra(regra({ responsavel_id: null, tipo_id: "casa", contagem: [] }), { responsavel_id: "rafael" });
    expect(r).toEqual({
      ok: true,
      valor: { responsavel_id: "rafael", tipo_id: "casa", contagem: [{ responsavel_id: "rafael", n: 1 }] },
    });
  });

  it("limpar o Responsável zera a contagem; limpar os dois recusa", () => {
    expect(editarRegra(base, { responsavel_id: null })).toEqual({
      ok: true,
      valor: { responsavel_id: null, tipo_id: "casa", contagem: [] },
    });
    expect(editarRegra(base, { responsavel_id: null, tipo_id: null })).toEqual({
      ok: false,
      erro: { codigo: "regra.vazia" },
    });
  });

  it("nada muda: null", () => {
    expect(editarRegra(base, { responsavel_id: "casal", tipo_id: "casa" })).toEqual({ ok: true, valor: null });
    expect(editarRegra(base, {})).toEqual({ ok: true, valor: null });
  });
});

describe("filtrarRegras e ordenarRegras (3.4)", () => {
  const nomes = {
    responsaveis: new Map([["casal", "Casal"]]),
    tipos: new Map([["saude", "Saúde"]]),
  };
  const lista = [
    { chave: "SPOTIFY", responsavel_id: "casal", tipo_id: null, ultimo_uso: "2026-11-01T00:00:00Z" },
    { chave: "FARMACIA SAO JOAO", responsavel_id: null, tipo_id: "saude", ultimo_uso: "2026-11-05T00:00:00Z" },
    { chave: "AMAZON", responsavel_id: null, tipo_id: null, ultimo_uso: "2026-11-05T00:00:00Z" },
  ];

  it("busca na chave, no Responsável e no Tipo, sem acento nem maiúsculas", () => {
    expect(filtrarRegras(lista, "spot", nomes).map((r) => r.chave)).toEqual(["SPOTIFY"]);
    expect(filtrarRegras(lista, "CASAL", nomes).map((r) => r.chave)).toEqual(["SPOTIFY"]);
    expect(filtrarRegras(lista, "saude", nomes).map((r) => r.chave)).toEqual(["FARMACIA SAO JOAO"]);
    expect(filtrarRegras(lista, "zzz", nomes)).toEqual([]);
    expect(filtrarRegras(lista, "  ", nomes)).toHaveLength(3);
  });

  it("mais recentes primeiro, empate pela chave", () => {
    expect(ordenarRegras(lista).map((r) => r.chave)).toEqual(["AMAZON", "FARMACIA SAO JOAO", "SPOTIFY"]);
  });

  it("os outros Responsáveis da contagem, do mais frequente", () => {
    const r = regra({
      responsavel_id: "casal",
      contagem: [
        { responsavel_id: "casal", n: 5 },
        { responsavel_id: "ana", n: 1 },
        { responsavel_id: "rafael", n: 2 },
      ],
    });
    expect(outrosResponsaveisDaRegra(r)).toEqual(["rafael", "ana"]);
  });
});

describe("entradasDaReaplicacao (3.4)", () => {
  const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
    id,
    nome,
    mes: "2026-11",
    responsavel_id: null as string | null,
    tipo_id: null as string | null,
    ajuste_de_id: null as string | null,
    excluido_em: null as string | null,
    ...extra,
  });
  const chave = chaveDeRegra("SHOPEE *TESHOP");

  it("só as do Mês, da chave, não excluídas, não Ajuste e que diferem; só os campos editados", () => {
    const linhas = [
      linha("a", "SHOPEE *TESHOP 01/03"),
      linha("b", "SHOPEE *TESHOP", { responsavel_id: "rafael", tipo_id: "casa" }),
      linha("c", "SHOPEE *TESHOP", { responsavel_id: "casal" }),
      linha("d", "SHOPEE *TESHOP", { mes: "2026-10" }),
      linha("e", "SHOPEE *TESHOP", { excluido_em: "2026-11-02T00:00:00Z" }),
      linha("f", "SHOPEE *TESHOP", { ajuste_de_id: "a" }),
      linha("g", "AMAZON"),
    ];
    expect(entradasDaReaplicacao(chave, { responsavel_id: "casal" }, linhas, "2026-11")).toEqual([
      { id: "a", campos: { responsavel_id: "casal" } },
      { id: "b", campos: { responsavel_id: "casal" } },
    ]);
  });

  it("sem campos editados, nada", () => {
    expect(entradasDaReaplicacao(chave, {}, [linha("a", "SHOPEE *TESHOP")], "2026-11")).toEqual([]);
  });
});

describe("regrasUsadas (3.4)", () => {
  it("as chaves que aplicaram ou sugeriram, sem repetir", () => {
    const regras = [
      regra({ chave: "SPOTIFY", responsavel_id: "casal", tipo_id: "casa", contagem: [{ responsavel_id: "casal", n: 1 }] }),
      regra({ chave: "OUTRA", responsavel_id: "arquivado", tipo_id: null, contagem: [] }),
    ];
    const usadas = regrasUsadas(["DM*SPOTIFY", "EBN SPOTIFY", "OUTRA", "SEM REGRA"], regras, ativos(["casal"], ["casa"]));
    expect(usadas).toEqual(["SPOTIFY"]);
  });
});
