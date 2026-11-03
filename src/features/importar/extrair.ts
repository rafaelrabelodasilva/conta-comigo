// Chamada à rota `POST /api/fatura/extrair` (AD-7, passo 3). Manda só o
// texto já sem dados pessoais e devolve a extração em centavos, ou o código
// do erro (do mapa de mensagens). A rota já tenta de novo quando o Gemini
// responde 503; "Tentar de novo" na janela reenvia o mesmo texto.

import type { Extracao } from "@/domain/extracao-fatura";
import type { Resultado } from "@/domain/resultado";

export const ROTA_EXTRAIR = "/api/fatura/extrair";

/** Código usado quando a pessoa cancelou (a tela não mostra mensagem). */
export const CANCELADO = "importar.cancelado";

/** A resposta 200 tem a forma mínima que a janela usa? */
export function ehRespostaExtracao(corpo: unknown): corpo is { extracao: Extracao } {
  const c = corpo as { extracao?: unknown } | null;
  if (typeof c !== "object" || c === null || typeof c.extracao !== "object" || c.extracao === null) return false;
  const e = c.extracao as Partial<Record<keyof Extracao, unknown>>;
  return (
    Array.isArray(e.lancamentos) &&
    Array.isArray(e.cartoes) &&
    typeof e.fatura === "object" &&
    e.fatura !== null &&
    typeof (e.fatura as { vencimento?: unknown }).vencimento === "string"
  );
}

/** Código de erro de uma resposta que não é 200. */
export async function codigoDaResposta(r: Response): Promise<string> {
  if (r.status === 401) return "auth.sessao_expirou";
  if (r.status === 504) return "fatura.tempo_esgotado";
  try {
    const corpo = (await r.json()) as { erro?: unknown };
    return typeof corpo.erro === "string" ? corpo.erro : "fatura.leitura_falhou";
  } catch {
    return "fatura.leitura_falhou";
  }
}

/** Manda o texto limpo para a leitura. `sinal` permite cancelar. */
export async function extrairTexto(
  texto: string,
  sinal?: AbortSignal,
  buscar: typeof fetch = (...a) => fetch(...a),
): Promise<Resultado<Extracao>> {
  let resposta: Response;
  try {
    resposta = await buscar(ROTA_EXTRAIR, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto }),
      signal: sinal,
    });
  } catch {
    return { ok: false, erro: { codigo: sinal?.aborted ? CANCELADO : "fatura.conexao_caiu" } };
  }
  // Redirecionada (ex.: para Entrar): a sessão caiu no caminho.
  if (resposta.redirected) return { ok: false, erro: { codigo: "auth.sessao_expirou" } };
  if (!resposta.ok) return { ok: false, erro: { codigo: await codigoDaResposta(resposta) } };
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }
  if (sinal?.aborted) return { ok: false, erro: { codigo: CANCELADO } };
  if (!ehRespostaExtracao(corpo)) return { ok: false, erro: { codigo: "fatura.leitura_falhou" } };
  return { ok: true, valor: corpo.extracao };
}
