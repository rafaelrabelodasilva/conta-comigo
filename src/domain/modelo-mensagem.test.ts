import { describe, expect, it } from "vitest";
import { formatarDinheiro } from "./dinheiro";
import {
  ITENS_DA_AMOSTRA,
  ITENS_DE_EXEMPLO,
  LIMITES_DO_MODELO,
  MODELO_VAZIO,
  fraseSemMarcador,
  itemDaMensagem,
  lerModelo,
  linhaDeDetalhe,
  modeloEstaVazio,
  modelosIguais,
  normalizarModelo,
  normalizarTexto,
  previaDoModelo,
  renderizarModelo,
  validarModelo,
  type ModeloMensagem,
} from "./modelo-mensagem";
import { TEXTOS_GERAR } from "./mensagens";
import type { LancamentoParaMensagem } from "./projecoes";

const R = (centavos: number) => formatarDinheiro(centavos);

// O modelo do Rafael (FR-23): Oi / Esse mês deu {total} / Pix … / Detalhes:
const MODELO_DO_RAFAEL: ModeloMensagem = {
  saudacao: "Oi",
  frase_total: "Esse mês deu {total}",
  chave_pix: "rafaelrabelodasilva@outlook.com",
  rodape: "",
  campos: { nome: true, parcela: true, valor: true },
};

const MAE = [
  { nome: "Celular da mãe", parcela: "05/10", valor_centavos: 57750 },
  { nome: "Monjaro", parcela: "03/03", valor_centavos: 31067 },
];

describe("lerModelo (o jsonb do banco)", () => {
  it("{} e qualquer valor que não seja objeto viram o modelo vazio", () => {
    for (const valor of [{}, null, undefined, 3, "x", [], [1]]) {
      expect(lerModelo(valor)).toEqual(MODELO_VAZIO);
    }
  });

  it("lê o modelo completo", () => {
    expect(lerModelo(MODELO_DO_RAFAEL)).toEqual(MODELO_DO_RAFAEL);
  });

  it("cada pedaço ruim ou ausente vira vazio, sem derrubar o resto", () => {
    expect(
      lerModelo({ saudacao: "Oi", frase_total: 7, chave_pix: null, campos: { nome: true, parcela: "sim" } }),
    ).toEqual({ ...MODELO_VAZIO, saudacao: "Oi", campos: { nome: true, parcela: false, valor: false } });
    expect(lerModelo({ saudacao: "Oi", campos: 5 })).toEqual({ ...MODELO_VAZIO, saudacao: "Oi" });
  });

  it("chaves desconhecidas são ignoradas", () => {
    expect(lerModelo({ ...MODELO_DO_RAFAEL, titulo: "x" })).toEqual(MODELO_DO_RAFAEL);
  });
});

describe("normalização", () => {
  it("campo de uma linha: quebra vira espaço e as pontas saem", () => {
    expect(normalizarTexto("  Oi\r\n tudo bem?  \n", false)).toBe("Oi tudo bem?");
  });

  it("rodapé: CRLF vira LF, sem espaço no fim da linha e no máximo uma linha em branco", () => {
    expect(normalizarTexto("Obrigado  \r\n\r\n\r\n\r\nAbraço\t", true)).toBe("Obrigado\n\nAbraço");
  });

  it("normalizar duas vezes dá o mesmo", () => {
    const sujo: ModeloMensagem = { ...MODELO_DO_RAFAEL, saudacao: " Oi\n", rodape: "a \n\n\n b " };
    expect(normalizarModelo(normalizarModelo(sujo))).toEqual(normalizarModelo(sujo));
  });

  it("modelo vazio: nada escrito e nenhuma caixa", () => {
    expect(modeloEstaVazio(MODELO_VAZIO)).toBe(true);
    expect(modeloEstaVazio({ ...MODELO_VAZIO, saudacao: "   \n " })).toBe(true);
    expect(modeloEstaVazio({ ...MODELO_VAZIO, campos: { nome: true, parcela: false, valor: false } })).toBe(false);
    expect(modeloEstaVazio({ ...MODELO_VAZIO, rodape: "Obrigado" })).toBe(false);
  });

  it("modelosIguais ignora o que a normalização tira", () => {
    expect(modelosIguais(MODELO_DO_RAFAEL, { ...MODELO_DO_RAFAEL, saudacao: " Oi " })).toBe(true);
    expect(modelosIguais(MODELO_DO_RAFAEL, { ...MODELO_DO_RAFAEL, saudacao: "Olá" })).toBe(false);
    expect(
      modelosIguais(MODELO_DO_RAFAEL, { ...MODELO_DO_RAFAEL, campos: { nome: true, parcela: true, valor: false } }),
    ).toBe(false);
  });
});

describe("validarModelo", () => {
  it("o modelo vazio é válido (é o inicial)", () => {
    expect(validarModelo(MODELO_VAZIO)).toEqual({ ok: true, valor: MODELO_VAZIO });
  });

  it("o modelo do Rafael é válido e sai normalizado", () => {
    expect(validarModelo({ ...MODELO_DO_RAFAEL, saudacao: " Oi " })).toEqual({ ok: true, valor: MODELO_DO_RAFAEL });
  });

  it("campos em branco são permitidos, desde que haja uma caixa marcada", () => {
    const so_valor = { ...MODELO_VAZIO, campos: { nome: false, parcela: false, valor: true } };
    expect(validarModelo(so_valor).ok).toBe(true);
  });

  it("algo escrito e nenhuma caixa: erro em campos", () => {
    expect(validarModelo({ ...MODELO_VAZIO, saudacao: "Oi" })).toEqual({
      ok: false,
      erros: { campos: "modelo.sem_campos" },
    });
  });

  it("texto longo: erro no campo, no limite exato passa", () => {
    const limite = LIMITES_DO_MODELO.saudacao;
    expect(validarModelo({ ...MODELO_DO_RAFAEL, saudacao: "a".repeat(limite) }).ok).toBe(true);
    expect(validarModelo({ ...MODELO_DO_RAFAEL, saudacao: "a".repeat(limite + 1) })).toEqual({
      ok: false,
      erros: { saudacao: "modelo.saudacao_longa" },
    });
    expect(validarModelo({ ...MODELO_DO_RAFAEL, rodape: "a".repeat(LIMITES_DO_MODELO.rodape + 1) })).toEqual({
      ok: false,
      erros: { rodape: "modelo.rodape_longo" },
    });
    expect(validarModelo({ ...MODELO_DO_RAFAEL, chave_pix: "a".repeat(LIMITES_DO_MODELO.chave_pix + 1) })).toEqual({
      ok: false,
      erros: { chave_pix: "modelo.pix_longo" },
    });
    expect(validarModelo({ ...MODELO_DO_RAFAEL, frase_total: "a".repeat(LIMITES_DO_MODELO.frase_total + 1) })).toEqual({
      ok: false,
      erros: { frase_total: "modelo.frase_longa" },
    });
  });

  it("o limite vale depois de normalizar (espaços e quebras das pontas não contam)", () => {
    const limite = LIMITES_DO_MODELO.saudacao;
    expect(validarModelo({ ...MODELO_DO_RAFAEL, saudacao: `  ${"a".repeat(limite)} \n` }).ok).toBe(true);
  });

  it("marcador escrito errado na frase é erro", () => {
    for (const frase of ["Deu {totl}", "Deu {Total}", "Deu { total }", "Deu {valor}", "Deu {total", "Deu total}", "{{total}}"]) {
      expect(validarModelo({ ...MODELO_DO_RAFAEL, frase_total: frase })).toEqual({
        ok: false,
        erros: { frase_total: "modelo.marcador_invalido" },
      });
    }
  });

  it("{total} repetido ou ausente na frase é permitido", () => {
    expect(validarModelo({ ...MODELO_DO_RAFAEL, frase_total: "{total}, isto é, {total}" }).ok).toBe(true);
    expect(validarModelo({ ...MODELO_DO_RAFAEL, frase_total: "Segue a conta" }).ok).toBe(true);
    expect(validarModelo({ ...MODELO_DO_RAFAEL, frase_total: "" }).ok).toBe(true);
  });

  it("chaves nos outros textos são erro, até {total}", () => {
    expect(validarModelo({ ...MODELO_DO_RAFAEL, saudacao: "Oi {total}" })).toEqual({
      ok: false,
      erros: { saudacao: "modelo.chaves_fora_da_frase" },
    });
    expect(validarModelo({ ...MODELO_DO_RAFAEL, chave_pix: "a{b" }).ok).toBe(false);
    expect(validarModelo({ ...MODELO_DO_RAFAEL, rodape: "Total {total}" })).toEqual({
      ok: false,
      erros: { rodape: "modelo.chaves_fora_da_frase" },
    });
  });

  it("vários erros voltam juntos, um por campo", () => {
    const r = validarModelo({
      ...MODELO_DO_RAFAEL,
      saudacao: "a".repeat(LIMITES_DO_MODELO.saudacao + 1),
      frase_total: "{x}",
      campos: { nome: false, parcela: false, valor: false },
    });
    expect(r).toEqual({
      ok: false,
      erros: { saudacao: "modelo.saudacao_longa", frase_total: "modelo.marcador_invalido", campos: "modelo.sem_campos" },
    });
  });

  it("aviso (não erro) quando a frase tem texto e não tem {total}", () => {
    expect(fraseSemMarcador({ ...MODELO_DO_RAFAEL, frase_total: "Segue a conta" })).toBe(true);
    expect(fraseSemMarcador(MODELO_DO_RAFAEL)).toBe(false);
    expect(fraseSemMarcador({ ...MODELO_DO_RAFAEL, frase_total: "   " })).toBe(false);
  });
});

describe("linhaDeDetalhe", () => {
  const item = { nome: "Celular da mãe", parcela: "05/10", valor_centavos: 57750 };

  it("Nome | Parcela | Valor, na ordem fixa", () => {
    expect(linhaDeDetalhe(item, { nome: true, parcela: true, valor: true })).toBe(`Celular da mãe | 05/10 | ${R(57750)}`);
  });

  it("só os campos marcados, sem sobrar separador", () => {
    expect(linhaDeDetalhe(item, { nome: true, parcela: false, valor: true })).toBe(`Celular da mãe | ${R(57750)}`);
    expect(linhaDeDetalhe(item, { nome: false, parcela: true, valor: false })).toBe("05/10");
    expect(linhaDeDetalhe(item, { nome: false, parcela: false, valor: false })).toBe("");
  });

  it("à vista: a Parcela marcada some, sem vão", () => {
    expect(linhaDeDetalhe({ ...item, parcela: "" }, { nome: true, parcela: true, valor: true })).toBe(
      `Celular da mãe | ${R(57750)}`,
    );
  });

  it("estorno sai negativo", () => {
    expect(linhaDeDetalhe({ nome: "Estorno", parcela: "", valor_centavos: -2590 }, { nome: true, parcela: false, valor: true })).toBe(
      `Estorno | ${R(-2590)}`,
    );
    expect(R(-2590)).toBe("- R$ 25,90");
  });

  it("o nome vira uma linha só", () => {
    expect(linhaDeDetalhe({ ...item, nome: "Celular\n  da   mãe" }, { nome: true, parcela: false, valor: false })).toBe(
      "Celular da mãe",
    );
  });

  it("itemDaMensagem usa o Apelido, ou o Nome, e a parcela com dois dígitos", () => {
    const base = { nome: "MAGALU MAGALU", apelido: "Lava e seca", parcela_n: 5, parcela_total: 10, valor_centavos: 44589 };
    expect(itemDaMensagem(base)).toEqual({ nome: "Lava e seca", parcela: "05/10", valor_centavos: 44589 });
    expect(itemDaMensagem({ ...base, apelido: null, parcela_n: null, parcela_total: null })).toEqual({
      nome: "MAGALU MAGALU",
      parcela: "",
      valor_centavos: 44589,
    });
  });
});

describe("renderizarModelo", () => {
  const corpo = {
    detalhes: MAE.map((i) => linhaDeDetalhe(i, MODELO_DO_RAFAEL.campos)),
    totalCentavos: 88817,
  };

  it("o modelo do Rafael sai no formato da forma 1 do EXPERIENCE.md", () => {
    expect(renderizarModelo(MODELO_DO_RAFAEL, corpo)).toBe(
      [
        "Oi",
        `Esse mês deu ${R(88817)}`,
        "Pix rafaelrabelodasilva@outlook.com",
        "",
        "Detalhes:",
        `Celular da mãe | 05/10 | ${R(57750)}`,
        `Monjaro | 03/03 | ${R(31067)}`,
        `Total: ${R(88817)}`,
      ].join("\n"),
    );
  });

  it("o total de outubro da Mãe é R$ 1.350,14 na frase e na linha final", () => {
    const texto = renderizarModelo(MODELO_DO_RAFAEL, { ...corpo, totalCentavos: 135014 });
    expect(texto).toContain("Esse mês deu R$ 1.350,14");
    expect(texto.endsWith("Total: R$ 1.350,14")).toBe(true);
  });

  it("o rodapé vem depois do Total, separado por uma linha em branco", () => {
    const texto = renderizarModelo({ ...MODELO_DO_RAFAEL, rodape: "Obrigado!\nAbraço" }, corpo);
    expect(texto.endsWith(`Total: ${R(88817)}\n\nObrigado!\nAbraço`)).toBe(true);
  });

  it("campo em branco some com a linha", () => {
    const texto = renderizarModelo({ ...MODELO_DO_RAFAEL, saudacao: "", chave_pix: "" }, corpo);
    expect(texto.split("\n")[0]).toBe(`Esse mês deu ${R(88817)}`);
    expect(texto).not.toContain("Pix");
  });

  it("{total} em qualquer lugar da frase, repetido ou ausente", () => {
    expect(renderizarModelo({ ...MODELO_DO_RAFAEL, frase_total: "{total} no total ({total})" }, corpo)).toContain(
      `${R(88817)} no total (${R(88817)})`,
    );
    const sem = renderizarModelo({ ...MODELO_DO_RAFAEL, frase_total: "Segue a conta" }, corpo);
    expect(sem).toContain("Segue a conta\nPix");
    expect(sem).toContain(`Total: ${R(88817)}`);
  });

  it("o marcador não é mexido por $ na frase (sem substituição por regex)", () => {
    expect(renderizarModelo({ ...MODELO_DO_RAFAEL, frase_total: "$& {total} $1" }, corpo)).toContain(
      `$& ${R(88817)} $1`,
    );
  });

  it("sem linhas de detalhe, somem o título e o Total; ficam o cabeçalho e o rodapé", () => {
    const texto = renderizarModelo({ ...MODELO_DO_RAFAEL, rodape: "Obrigado" }, { detalhes: ["", ""], totalCentavos: 0 });
    expect(texto).toBe(["Oi", `Esse mês deu ${R(0)}`, "Pix rafaelrabelodasilva@outlook.com", "", "Obrigado"].join("\n"));
  });

  it("normaliza o modelo antes de usar", () => {
    expect(renderizarModelo({ ...MODELO_DO_RAFAEL, saudacao: "  Oi \n" }, corpo).startsWith("Oi\nEsse")).toBe(true);
  });

  it("o total vem de fora: pode ser o da Fórmula (forma 2), não a soma das linhas", () => {
    expect(renderizarModelo(MODELO_DO_RAFAEL, { ...corpo, totalCentavos: 281968 })).toContain(`Total: ${R(281968)}`);
  });
});

describe("prévia do Mês (um recorte de projetarMensagem)", () => {
  const MES = "2026-11";
  let contador = 0;
  const base = (extra: Partial<LancamentoParaMensagem>): LancamentoParaMensagem => ({
    id: `l${(contador += 1)}`,
    mes: MES,
    excluido_em: null,
    nome: "Compra",
    apelido: null,
    parcela_n: null,
    parcela_total: null,
    valor_centavos: 1000,
    status_id: null,
    lancado_por: "fatura",
    ordem_fatura: 1,
    responsavel_id: null,
    tipo_id: null,
    ...extra,
  });
  const PAGOS = new Set(["pago"]);
  const NOME = { ...MODELO_DO_RAFAEL, campos: { nome: true, parcela: false, valor: false } };
  /** Os nomes que a prévia mostra, na ordem. */
  const nomes = (linhas: LancamentoParaMensagem[]) => {
    const texto = previaDoModelo(NOME, linhas, MES, PAGOS).texto;
    return texto.split("\n").slice(texto.split("\n").indexOf("Detalhes:") + 1, -1);
  };

  it("fica com as unidades do Mês, na ordem da fatura, no máximo ITENS_DA_AMOSTRA", () => {
    const linhas = Array.from({ length: 8 }, (_, i) => base({ nome: `C${i}`, ordem_fatura: 8 - i }));
    expect(previaDoModelo(NOME, linhas, MES, PAGOS).quantidade).toBe(ITENS_DA_AMOSTRA);
    expect(nomes(linhas)).toEqual(["C7", "C6", "C5", "C4", "C3"]);
  });

  it("deixa de fora R$ 0,00, previstos, pagos, excluídos, outros Meses e a mãe dividida; o Ajuste vai sob a parcela", () => {
    const linhas = [
      base({ id: "ok", nome: "ok", ordem_fatura: 1 }),
      base({ nome: "ajuste", ajuste_de_id: "ok", valor_centavos: -8, ordem_fatura: 9 }),
      base({ nome: "zero", valor_centavos: 0 }),
      base({ nome: "previsto", lancado_por: "sistema" }),
      base({ nome: "pago", status_id: "pago" }),
      base({ nome: "excluido", excluido_em: "2026-11-02T00:00:00Z" }),
      base({ nome: "outro mes", mes: "2026-10" }),
      base({ nome: "mae", divisao: [{}] }),
      base({ nome: "parte", dividido_de_id: "m", ordem_fatura: 2 }),
      base({ nome: "estorno", valor_centavos: -2590, ordem_fatura: 3 }),
    ];
    expect(nomes(linhas)).toEqual(["ok", TEXTOS_GERAR.ajuste, "parte", "estorno"]);
  });

  it("sem ordem da fatura (manual), vai para o fim", () => {
    const linhas = [base({ nome: "manual", ordem_fatura: null }), base({ nome: "fatura", ordem_fatura: 5 })];
    expect(nomes(linhas)).toEqual(["fatura", "manual"]);
  });

  it("a prévia usa o Mês e soma só os itens mostrados", () => {
    const linhas = [
      base({ nome: "Mercado", valor_centavos: 15990, ordem_fatura: 1 }),
      base({ nome: "Celular", apelido: "Celular da mãe", parcela_n: 5, parcela_total: 10, valor_centavos: 57750, ordem_fatura: 2 }),
    ];
    const previa = previaDoModelo(MODELO_DO_RAFAEL, linhas, MES, PAGOS);
    expect(previa.origem).toBe("mes");
    expect(previa.quantidade).toBe(2);
    expect(previa.mes).toBe("novembro/26");
    expect(previa.texto).toContain(`Esse mês deu ${R(73740)}`);
    expect(previa.texto).toContain(`Celular da mãe | 05/10 | ${R(57750)}`);
    expect(previa.texto).toContain(`Mercado | ${R(15990)}`);
  });

  it("Mês sem nada a cobrar: itens de exemplo", () => {
    const previa = previaDoModelo(MODELO_DO_RAFAEL, [base({ valor_centavos: 0 })], MES, PAGOS);
    expect(previa.origem).toBe("exemplo");
    expect(previa.quantidade).toBe(ITENS_DE_EXEMPLO.length);
    expect(previa.mes).toBe("");
    expect(previa.texto).toContain("Detalhes:");
    expect(previa.texto).toContain(R(-2590));
    // 159,90 + 577,50 − 25,90
    expect(previa.texto).toContain(`Total: ${R(71150)}`);
  });

  it("sem lançamentos nenhum (Mês não carregado), também exemplo", () => {
    expect(previaDoModelo(MODELO_DO_RAFAEL, [], MES, PAGOS).origem).toBe("exemplo");
  });

  it("modelo vazio: texto vazio (a tela mostra a dica)", () => {
    expect(previaDoModelo(MODELO_VAZIO, [], MES, PAGOS).texto).toBe("");
  });

  it("rascunho inválido ainda tem prévia, com o marcador errado como está", () => {
    const previa = previaDoModelo({ ...MODELO_DO_RAFAEL, frase_total: "Deu {totl}" }, [], MES, PAGOS);
    expect(previa.texto).toContain("Deu {totl}");
  });

  it("modelo sem nenhuma caixa: sem linhas, sem título nem Total", () => {
    const previa = previaDoModelo({ ...MODELO_DO_RAFAEL, campos: { nome: false, parcela: false, valor: false } }, [], MES, PAGOS);
    expect(previa.texto).toBe(["Oi", `Esse mês deu ${R(71150)}`, "Pix rafaelrabelodasilva@outlook.com"].join("\n"));
  });
});
