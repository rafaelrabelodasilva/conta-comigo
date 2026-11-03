// Abre o PDF da Fatura com a senha, no aparelho (AD-7, passo 1). Usa o
// build legacy do pdf.js, carregado só quando a pessoa pede a leitura
// (import dinâmico: nunca entra no servidor nem no carregamento da página).
// O worker é servido pelo próprio app (o bundler copia o arquivo para
// `/_next/static`). Nem o arquivo nem a senha saem daqui.

import type { Resultado } from "@/domain/resultado";

export type PdfLido = { texto: string; paginas: number; ms: number };

// `PasswordResponses` do pdf.js.
const PRECISA_SENHA = 1;
const SENHA_INCORRETA = 2;

/** Código de erro (de `mensagens.ts`) para o que o pdf.js lançou. */
export function codigoDoErroPdf(erro: unknown): string {
  const e = erro as { name?: unknown; code?: unknown } | null;
  if (e && e.name === "PasswordException") {
    if (e.code === SENHA_INCORRETA) return "fatura.senha_incorreta";
    if (e.code === PRECISA_SENHA) return "fatura.senha_vazia";
    return "fatura.senha_incorreta";
  }
  return "fatura.pdf_invalido";
}

type ItemTexto = { str?: string; hasEOL?: boolean };

/** Texto de uma página: quebra de linha onde o pdf.js marca `hasEOL`. */
export function textoDaPagina(itens: readonly ItemTexto[]): string {
  let texto = "";
  for (const item of itens) {
    if (typeof item.str !== "string") continue; // marcação, sem texto
    texto += item.str;
    if (item.hasEOL) texto += "\n";
  }
  return texto.replace(/[ \t]+\n/g, "\n").trimEnd();
}

type PaginaComTexto = {
  streamTextContent(): ReadableStream<{ items: readonly unknown[] }>;
};

/**
 * Itens de texto da página, lidos pelo `getReader()` do stream. Não usa
 * `getTextContent()`: ele percorre o stream com `for await`, que o Safari 18
 * (Mac e iPad) não suporta em `ReadableStream` (TypeError).
 */
export async function itensDaPagina(pagina: PaginaComTexto): Promise<ItemTexto[]> {
  const leitor = pagina.streamTextContent().getReader();
  const itens: ItemTexto[] = [];
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    itens.push(...(value.items as ItemTexto[]));
  }
  return itens;
}

/**
 * Abre o PDF com a senha e devolve o texto de todas as páginas (separadas
 * por uma linha em branco) e quanto tempo levou.
 */
export async function lerPdf(
  dados: Uint8Array,
  senha: string,
  agora: () => number = () => performance.now(),
): Promise<Resultado<PdfLido>> {
  const inicio = agora();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const tarefa = pdfjs.getDocument({
    data: dados,
    password: senha,
    // Sem `eval` de fontes nem scripts do PDF: só lemos o texto.
    isEvalSupported: false,
    enableXfa: false,
  });
  try {
    const doc = await tarefa.promise;
    const paginas: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      paginas.push(textoDaPagina(await itensDaPagina(pagina)));
      pagina.cleanup();
    }
    const texto = paginas.join("\n\n").trim();
    if (!texto) return { ok: false, erro: { codigo: "fatura.sem_texto" } };
    return { ok: true, valor: { texto, paginas: doc.numPages, ms: agora() - inicio } };
  } catch (e) {
    return { ok: false, erro: { codigo: codigoDoErroPdf(e) } };
  } finally {
    void tarefa.destroy();
  }
}
