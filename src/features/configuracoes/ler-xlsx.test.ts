import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { lerAba } from "@/domain/importacao-planilha";
import { lerXlsx } from "./ler-xlsx";

// Monta um `.xlsx` mínimo (texto em linha, sem `sharedStrings`) para provar a
// leitura de verdade com a biblioteca, sem arquivo de verdade no repositório.
function xlsx(abas: Record<string, (string | number | null)[][]>): Blob {
  const nomes = Object.keys(abas);
  const col = (i: number) => String.fromCharCode(65 + i);
  const folha = (linhas: (string | number | null)[][]) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhas
      .map(
        (cels, r) =>
          `<row r="${r + 1}">${cels
            .map((v, c) =>
              v === null
                ? ""
                : typeof v === "number"
                  ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
                  : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${v.replace(/&/g, "&amp;")}</t></is></c>`,
            )
            .join("")}</row>`,
      )
      .join("")}</sheetData></worksheet>`;
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${nomes
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
        .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nomes
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`,
    ),
  };
  nomes.forEach((n, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folha(abas[n]));
  });
  return new Blob([zipSync(arquivos) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const CABECALHO = ["Despesa", "Valor", "Parcela", "Observação ", "Tipo", "Resposabilidade", "Lançado por", "Status dívida"];

describe("lerXlsx", () => {
  it("devolve só as abas de Mês, as de 01/2026 a 10/2026 marcadas, e as células de cada uma", async () => {
    const arquivo = xlsx({
      "03/2026": [CABECALHO, ["SHOPEE CELLSOLUTIONS", "523,66", "05/12", null, "Presente", "Rafael", "Rafael"], ["EST ANUIDADE (CREDITO)", "(25,00)", "1/1"]],
      "11/2026": [CABECALHO],
      "Página5": [["x"]],
      "Cópia de TBC 00/2026": [CABECALHO],
    });
    const r = await lerXlsx(arquivo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.abas.map((a) => [a.nome, a.marcada])).toEqual([
      ["03/2026", true],
      ["11/2026", false],
    ]);
    const lida = lerAba(r.valor.celulas.get("03/2026") ?? []);
    expect(lida.ok).toBe(true);
    if (lida.ok) {
      expect(lida.valor.map((l) => [l.despesa, l.valor_centavos, l.parcela_n, l.parcela_total, l.tipo, l.responsavel])).toEqual([
        ["SHOPEE CELLSOLUTIONS", 52366, 5, 12, "Presente", "Rafael"],
        ["EST ANUIDADE (CREDITO)", -2500, null, null, null, null],
      ]);
    }
  });

  it("valor numérico da célula (19,99) vira 1999 centavos", async () => {
    const r = await lerXlsx(xlsx({ "04/2026": [CABECALHO, ["PANVEL", 19.99, "1/1", null, "Saúde", "Casal", "Rafael"]] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lida = lerAba(r.valor.celulas.get("04/2026") ?? []);
    expect(lida.ok && lida.valor[0].valor_centavos).toBe(1999);
  });

  it("arquivo que não é .xlsx: planilha.arquivo_invalido; sem aba de Mês: planilha.sem_abas", async () => {
    const ruim = await lerXlsx(new Blob(["isto não é um xlsx"]));
    expect(ruim).toEqual({ ok: false, erro: { codigo: "planilha.arquivo_invalido" } });
    const sem = await lerXlsx(xlsx({ "Página5": [["x"]] }));
    expect(sem).toEqual({ ok: false, erro: { codigo: "planilha.sem_abas" } });
  });
});
