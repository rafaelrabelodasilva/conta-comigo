import { beforeEach, describe, expect, it, vi } from "vitest";

// O pdf.js é falso: o teste confere a montagem do texto, as opções e o
// mapeamento das exceções de senha.
const falso = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroy: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: falso.getDocument,
  GlobalWorkerOptions: falso.GlobalWorkerOptions,
}));

const { codigoDoErroPdf, lerPdf, textoDaPagina } = await import("./ler-pdf");

class PasswordException extends Error {
  name = "PasswordException";
  constructor(public code: number) {
    super("senha");
  }
}

function documento(paginas: { str?: string; hasEOL?: boolean }[][]) {
  return {
    numPages: paginas.length,
    getPage: async (n: number) => ({
      getTextContent: async () => ({ items: paginas[n - 1] }),
      cleanup: vi.fn(),
    }),
  };
}

function tarefa(promise: Promise<unknown>) {
  promise.catch(() => {});
  return { promise, destroy: falso.destroy.mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
  falso.GlobalWorkerOptions.workerSrc = "";
});

describe("textoDaPagina", () => {
  it("quebra a linha em hasEOL e ignora marcações", () => {
    expect(
      textoDaPagina([
        { str: "06/09", hasEOL: false },
        { str: " MSC CRUZEIROS ", hasEOL: false },
        { str: "1.140,74", hasEOL: true },
        {},
        { str: "TOTAL", hasEOL: true },
      ]),
    ).toBe("06/09 MSC CRUZEIROS 1.140,74\nTOTAL");
  });
});

describe("lerPdf", () => {
  it("lê todas as páginas, separadas, com o tempo e o worker do app", async () => {
    falso.getDocument.mockReturnValue(
      tarefa(Promise.resolve(documento([[{ str: "pagina 1", hasEOL: true }], [{ str: "pagina 2" }]]))),
    );
    const tempos = [100, 350];
    const r = await lerPdf(new Uint8Array([1]), "segredo", () => tempos.shift()!);
    expect(r).toEqual({ ok: true, valor: { texto: "pagina 1\n\npagina 2", paginas: 2, ms: 250 } });
    expect(falso.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ password: "segredo", isEvalSupported: false }),
    );
    expect(falso.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs$/);
    expect(falso.destroy).toHaveBeenCalled();
  });

  it("senha errada vira fatura.senha_incorreta", async () => {
    falso.getDocument.mockReturnValue(tarefa(Promise.reject(new PasswordException(2))));
    expect(await lerPdf(new Uint8Array([1]), "errada")).toEqual({
      ok: false,
      erro: { codigo: "fatura.senha_incorreta" },
    });
  });

  it("PDF sem texto e arquivo que não é PDF", async () => {
    falso.getDocument.mockReturnValueOnce(tarefa(Promise.resolve(documento([[{ str: "  " }]]))));
    expect(await lerPdf(new Uint8Array([1]), "s")).toEqual({ ok: false, erro: { codigo: "fatura.sem_texto" } });
    const invalido = Object.assign(new Error("Invalid PDF structure."), { name: "InvalidPDFException" });
    falso.getDocument.mockReturnValueOnce(tarefa(Promise.reject(invalido)));
    expect(await lerPdf(new Uint8Array([1]), "s")).toEqual({ ok: false, erro: { codigo: "fatura.pdf_invalido" } });
  });
});

describe("codigoDoErroPdf", () => {
  it("mapeia as exceções do pdf.js", () => {
    expect(codigoDoErroPdf(new PasswordException(1))).toBe("fatura.senha_vazia");
    expect(codigoDoErroPdf(new PasswordException(2))).toBe("fatura.senha_incorreta");
    expect(codigoDoErroPdf(new Error("x"))).toBe("fatura.pdf_invalido");
    expect(codigoDoErroPdf(null)).toBe("fatura.pdf_invalido");
  });
});
